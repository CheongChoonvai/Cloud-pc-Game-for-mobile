"""Lifecycle management for active WebRTC streaming peers."""
from __future__ import annotations

import logging
import threading
import uuid
from typing import Dict

from app.core.config import settings
from app.services.streaming.diagnostics import GSTREAMER_AVAILABLE, GSTREAMER_IMPORT_ERROR
from app.services.streaming.peer import GStreamerWebRTCPeer

logger = logging.getLogger("streaming.manager")


class StreamManager:
    """Creates, tracks and tears down GStreamer WebRTC peers."""

    def __init__(self) -> None:
        self._peers: Dict[str, GStreamerWebRTCPeer] = {}
        self._lock = threading.Lock()

    @property
    def available(self) -> bool:
        return GSTREAMER_AVAILABLE

    @property
    def unavailable_reason(self) -> str:
        return GSTREAMER_IMPORT_ERROR or ""

    def peer_count(self) -> int:
        with self._lock:
            return len(self._peers)

    async def create_peer_answer(self, offer_sdp: str) -> dict:
        """Create a new peer for a browser offer and return the SDP answer."""
        if not GSTREAMER_AVAILABLE:
            raise RuntimeError(f"GStreamer not available: {self.unavailable_reason}")

        pc_id = str(uuid.uuid4())[:8]
        peer = GStreamerWebRTCPeer(
            pc_id=pc_id,
            width=settings.video_width,
            height=settings.video_height,
            fps=settings.target_fps,
            bitrate_kbps=settings.video_bitrate_kbps,
            monitor_index=settings.monitor_index - 1,
            stun_server=settings.stun_server,
            on_closed=self._remove_peer,
        )
        with self._lock:
            self._peers[pc_id] = peer

        try:
            return await peer.handle_offer(offer_sdp)
        except Exception:
            logger.exception("[%s] Failed to handle offer", pc_id)
            peer.close()
            raise

    def _remove_peer(self, pc_id: str) -> None:
        with self._lock:
            self._peers.pop(pc_id, None)

    def close_all(self) -> None:
        with self._lock:
            peers = list(self._peers.values())
            self._peers.clear()
        for peer in peers:
            peer.on_closed = None
            peer.close()


stream_manager = StreamManager()
