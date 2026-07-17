"""One GStreamer pipeline + webrtcbin per connected browser client.

Pipeline: d3d11screencapturesrc -> d3d11convert -> d3d11download
          -> videoconvert -> x264enc -> h264parse -> rtph264pay -> webrtcbin

Ported from the proven server/video/gstreamer_webrtc_server.py implementation.
"""
from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from typing import Optional

from app.services.streaming.diagnostics import (
    GSTREAMER_AVAILABLE,
    ensure_gstreamer_initialized,
)

if GSTREAMER_AVAILABLE:
    import gi

    gi.require_version("Gst", "1.0")
    gi.require_version("GstWebRTC", "1.0")
    gi.require_version("GstSdp", "1.0")
    from gi.repository import GLib, Gst, GstSdp, GstWebRTC

logger = logging.getLogger("streaming.peer")


class GStreamerWebRTCPeer:
    """Wraps one GStreamer pipeline + webrtcbin for a single browser client."""

    def __init__(
        self,
        pc_id: str,
        width: int,
        height: int,
        fps: int,
        bitrate_kbps: int,
        monitor_index: int,
        stun_server: str,
        on_closed=None,
    ):
        self.pc_id = pc_id
        self.width = max(2, width - (width % 2))
        self.height = max(2, height - (height % 2))
        self.fps = fps
        self.bitrate_kbps = bitrate_kbps
        self.monitor_index = monitor_index
        self.stun_server = stun_server
        self.on_closed = on_closed
        self.pipeline: Optional["Gst.Pipeline"] = None
        self.webrtc: Optional["Gst.Element"] = None
        self._q_out: Optional["Gst.Element"] = None
        self._payloader: Optional["Gst.Element"] = None
        self._webrtc_sink_pad: Optional["Gst.Pad"] = None
        self._closed = False

    # ------------------------------------------------------------------
    # Pipeline construction
    # ------------------------------------------------------------------
    def _build_pipeline(self) -> None:
        leaky = "queue max-size-buffers=1 max-size-bytes=0 max-size-time=0 leaky=downstream"
        pipeline_str = (
            f"d3d11screencapturesrc monitor-index={self.monitor_index} "
            f"! {leaky} "
            f"! d3d11convert "
            f"! video/x-raw(memory:D3D11Memory),width={self.width},height={self.height},framerate={self.fps}/1,format=NV12 "
            f"! {leaky} "
            f"! d3d11download "
            f"! {leaky} "
            f"! videoconvert "
            f"! {leaky} "
            f"! x264enc speed-preset=ultrafast tune=zerolatency bitrate={self.bitrate_kbps} key-int-max={self.fps} vbv-buf-capacity=0 "
            f"! {leaky} "
            f"! h264parse "
            f"! {leaky} "
            f"! rtph264pay name=pay config-interval=-1 pt=96 "
            f"! queue name=q_out"
        )

        pipeline = Gst.parse_launch(pipeline_str)
        if pipeline is None:
            raise RuntimeError("Gst.parse_launch returned None")

        webrtc = Gst.ElementFactory.make("webrtcbin", "webrtc")
        if webrtc is None:
            raise RuntimeError("Failed to create webrtcbin")
        webrtc.set_property("stun-server", self.stun_server)
        pipeline.add(webrtc)

        q_out = pipeline.get_by_name("q_out")
        payloader = pipeline.get_by_name("pay")
        if q_out is None or payloader is None:
            raise RuntimeError("Pipeline elements missing after parse_launch")

        self.pipeline = pipeline
        self.webrtc = webrtc
        self._q_out = q_out
        self._payloader = payloader

    # ------------------------------------------------------------------
    # ICE state monitoring
    # ------------------------------------------------------------------
    def _on_ice_state_notify(self, webrtc, pspec) -> None:
        state = webrtc.get_property("ice-connection-state")
        state_name = {
            GstWebRTC.WebRTCICEConnectionState.NEW: "new",
            GstWebRTC.WebRTCICEConnectionState.CHECKING: "checking",
            GstWebRTC.WebRTCICEConnectionState.CONNECTED: "connected",
            GstWebRTC.WebRTCICEConnectionState.COMPLETED: "completed",
            GstWebRTC.WebRTCICEConnectionState.FAILED: "failed",
            GstWebRTC.WebRTCICEConnectionState.DISCONNECTED: "disconnected",
            GstWebRTC.WebRTCICEConnectionState.CLOSED: "closed",
        }.get(state, f"unknown({state})")
        logger.info("[%s] ICE state: %s", self.pc_id, state_name)
        if state_name in ("failed", "disconnected", "closed"):
            self.close()

    # ------------------------------------------------------------------
    # SDP negotiation
    # ------------------------------------------------------------------
    def _extract_h264_payload_type(self, offer_sdp: str) -> int:
        """Return the H264 payload type the browser offered (default 96)."""
        video_payloads: list = []
        payload_map: dict = {}
        in_video_media = False

        for raw_line in offer_sdp.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("m=video "):
                parts = line.split()
                video_payloads = []
                for token in parts[3:]:
                    try:
                        video_payloads.append(int(token))
                    except ValueError:
                        continue
                in_video_media = True
                continue
            if line.startswith("m="):
                in_video_media = False
                continue
            if not in_video_media:
                continue
            match = re.match(r"a=rtpmap:(\d+)\s+([^/]+)/(\d+)", line, re.IGNORECASE)
            if match:
                payload_map[int(match.group(1))] = match.group(2).upper()

        for payload_type in video_payloads:
            if payload_map.get(payload_type) == "H264":
                return payload_type

        logger.warning("[%s] No H264 payload type in offer; defaulting to 96", self.pc_id)
        return 96

    def _negotiate_blocking(self, offer_sdp: str) -> dict:
        """Full offer/answer negotiation. Runs in a worker thread.

        Order matters (standard webrtcbin answerer pattern): link the sender
        pad and set the pipeline PLAYING *before* applying the remote offer —
        webrtcbin silently ignores set-remote-description while in NULL state.
        """
        res, sdp_msg = GstSdp.SDPMessage.new_from_text(offer_sdp)
        if res != GstSdp.SDPResult.OK:
            raise RuntimeError("Failed to parse offer SDP")

        offer = GstWebRTC.WebRTCSessionDescription.new(
            GstWebRTC.WebRTCSDPType.OFFER, sdp_msg
        )

        payload_type = self._extract_h264_payload_type(offer_sdp)
        self._payloader.set_property("pt", payload_type)

        # 1. Link encoder output into webrtcbin (creates transceiver 0, which
        #    maps onto the single video m-line of the browser offer).
        sink_pad = self.webrtc.request_pad_simple("sink_%u")
        if sink_pad is None:
            sink_pad = self.webrtc.get_request_pad("sink_%u")
        if sink_pad is None:
            raise RuntimeError("Could not request sink pad from webrtcbin")
        self._webrtc_sink_pad = sink_pad

        src_pad = self._q_out.get_static_pad("src")
        if src_pad.link(sink_pad) != Gst.PadLinkReturn.OK:
            raise RuntimeError("Failed to link output queue to webrtcbin")

        # 2. We only send video, never receive.
        try:
            transceiver = self.webrtc.emit("get-transceiver", 0)
            if transceiver is not None:
                transceiver.set_property(
                    "direction", GstWebRTC.WebRTCRTPTransceiverDirection.SENDONLY
                )
        except Exception as exc:
            logger.warning("[%s] Could not set transceiver direction: %s", self.pc_id, exc)

        # 3. Start capture/encode before negotiating.
        if self.pipeline.set_state(Gst.State.PLAYING) == Gst.StateChangeReturn.FAILURE:
            self.pipeline.set_state(Gst.State.NULL)
            raise RuntimeError("Failed to start pipeline (PLAYING)")
        logger.info("[%s] Pipeline PLAYING, applying remote offer", self.pc_id)

        # 4. Apply remote description.
        remote_promise = Gst.Promise.new()
        self.webrtc.emit("set-remote-description", offer, remote_promise)
        if remote_promise.wait() != Gst.PromiseResult.REPLIED:
            raise RuntimeError("set-remote-description did not complete")

        remote_desc = self.webrtc.get_property("remote-description")
        deadline = time.monotonic() + 3.0
        while remote_desc is None and time.monotonic() < deadline:
            context = GLib.MainContext.default()
            while context.pending():
                context.iteration(False)
            time.sleep(0.01)
            remote_desc = self.webrtc.get_property("remote-description")
        if remote_desc is None:
            raise RuntimeError("remote-description was not applied before create-answer")

        # 5. Create + apply answer, wait for ICE gathering.
        ice_done = threading.Event()

        def on_ice_gathering_state(webrtc, pspec):
            if (
                webrtc.get_property("ice-gathering-state")
                == GstWebRTC.WebRTCICEGatheringState.COMPLETE
            ):
                ice_done.set()

        try:
            self.webrtc.connect("notify::ice-gathering-state", on_ice_gathering_state)
        except TypeError:
            pass

        answer_promise = Gst.Promise.new()
        self.webrtc.emit("create-answer", None, answer_promise)
        answer_promise.wait()
        reply = answer_promise.get_reply()
        answer = reply.get_value("answer") if reply is not None else None
        if answer is None:
            raise RuntimeError("webrtcbin did not produce an answer")

        local_promise = Gst.Promise.new()
        self.webrtc.emit("set-local-description", answer, local_promise)
        local_promise.wait()

        ice_done.wait(timeout=3.0)

        local_desc = self.webrtc.get_property("local-description")
        if local_desc is None:
            raise RuntimeError("webrtcbin local-description is not available")
        return {"sdp": local_desc.sdp.as_text(), "type": "answer"}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def handle_offer(self, offer_sdp: str) -> dict:
        """Accept a browser SDP offer, return the SDP answer."""
        ensure_gstreamer_initialized()
        logger.info("[%s] Building pipeline", self.pc_id)
        self._build_pipeline()

        try:
            self.webrtc.connect("notify::ice-connection-state", self._on_ice_state_notify)
        except TypeError as exc:
            logger.warning("[%s] Could not connect ICE state signal: %s", self.pc_id, exc)

        loop = asyncio.get_running_loop()
        answer = await loop.run_in_executor(None, self._negotiate_blocking, offer_sdp)
        logger.info("[%s] Negotiation complete", self.pc_id)
        return answer

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        logger.info("[%s] Closing peer", self.pc_id)
        if self.webrtc is not None and self._webrtc_sink_pad is not None:
            try:
                self.webrtc.release_request_pad(self._webrtc_sink_pad)
            except Exception:
                pass
            self._webrtc_sink_pad = None
        if self.pipeline is not None:
            self.pipeline.set_state(Gst.State.NULL)
            self.pipeline = None
        self.webrtc = None
        self._q_out = None
        self._payloader = None
        if self.on_closed is not None:
            self.on_closed(self.pc_id)
