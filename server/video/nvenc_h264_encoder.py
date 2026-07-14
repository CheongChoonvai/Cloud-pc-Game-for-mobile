"""Experimental NVIDIA NVENC H.264 encoder for aiortc.

This module patches aiortc's encoder factory at runtime without editing
site-packages. It only replaces video/H264 when explicitly enabled.
"""

from __future__ import annotations

import time
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any

import av
from av.frame import Frame
from av.packet import Packet

import aiortc.codecs as aiortc_codecs
import aiortc.rtcrtpsender as aiortc_sender
from aiortc.codecs.h264 import H264Encoder, VIDEO_TIME_BASE, convert_timebase


MIN_BITRATE = 500_000
MAX_BITRATE = 20_000_000
DEFAULT_BITRATE = 4_000_000
DEFAULT_FPS = 30

_ORIGINAL_GET_ENCODER = aiortc_codecs.get_encoder
_PATCHED = False
_NVENC_LOGGED = False


@dataclass
class FpsCounter:
    name: str
    count: int = 0
    last_count: int = 0
    last_time: float = field(default_factory=time.perf_counter)
    _lock: threading.Lock = field(default_factory=threading.Lock, init=False, repr=False)

    def tick(self) -> None:
        with self._lock:
            self.count += 1

    def sample(self) -> float | None:
        now = time.perf_counter()
        with self._lock:
            elapsed = now - self.last_time
            if elapsed < 1.0:
                return None

            delta = self.count - self.last_count
            self.last_count = self.count
            self.last_time = now
            return delta / elapsed


def parse_bitrate(value: int | str | None, default: int = DEFAULT_BITRATE) -> int:
    if value is None:
        return default
    if isinstance(value, int):
        return value

    text = str(value).strip().lower()
    if not text:
        return default
    if text.endswith("mbps"):
        return int(float(text[:-4].strip()) * 1_000_000)
    if text.endswith("kbps"):
        return int(float(text[:-4].strip()) * 1_000)
    if text.endswith("m"):
        return int(float(text[:-1].strip()) * 1_000_000)
    if text.endswith("k"):
        return int(float(text[:-1].strip()) * 1_000)

    return int(float(text))


class NvencH264Encoder(H264Encoder):
    """H.264 RTP encoder using NVIDIA h264_nvenc through PyAV."""

    def __init__(
        self,
        fps: int = DEFAULT_FPS,
        bitrate: int = DEFAULT_BITRATE,
    ) -> None:
        super().__init__()
        self.codec = None
        self.fps = max(1, int(fps))
        self.__target_bitrate = max(MIN_BITRATE, min(int(bitrate), MAX_BITRATE))
        self.requested_bitrate = self.__target_bitrate
        self.encoded_frame_count = 0
        self.encoded_byte_count = 0
        self.total_encode_time = 0.0
        self.output_counter = FpsCounter("NVENC output")
        self._last_packet_pts: int | None = None
        self._last_packet_time_base: Fraction | None = None

    @property
    def target_bitrate(self) -> int:
        return self.__target_bitrate

    @target_bitrate.setter
    def target_bitrate(self, bitrate: int) -> None:
        # aiortc can update target_bitrate frequently while bandwidth estimation
        # settles. Recreating NVENC on every large change causes visible stutter,
        # so this prototype keeps the encoder bitrate fixed for the session.
        self.requested_bitrate = max(MIN_BITRATE, min(int(bitrate), MAX_BITRATE))

    @property
    def average_encode_ms(self) -> float:
        if self.encoded_frame_count == 0:
            return 0.0
        return (self.total_encode_time / self.encoded_frame_count) * 1000

    def _new_codec(self, frame: av.VideoFrame) -> Any:
        codec = av.CodecContext.create("h264_nvenc", "w")
        codec.width = frame.width
        codec.height = frame.height
        codec.bit_rate = self.target_bitrate
        codec.pix_fmt = "yuv420p"
        codec.framerate = Fraction(self.fps, 1)
        codec.time_base = Fraction(1, self.fps)
        codec.options = {
            "preset": "p1",
            "tune": "ull",
            "rc": "cbr",
            "rc-lookahead": "0",
            "zerolatency": "1",
            "bf": "0",
            "g": str(self.fps * 2),
            "profile": "baseline",
        }
        codec.open()
        _log_nvenc_once(frame.width, frame.height, self.fps, self.target_bitrate)
        return codec

    def _encode_frame(
        self,
        frame: av.VideoFrame,
        force_keyframe: bool,
    ) -> Iterator[bytes]:
        if self.codec and (
            frame.width != self.codec.width
            or frame.height != self.codec.height
        ):
            self.codec = None

        if force_keyframe:
            frame.pict_type = av.video.frame.PictureType.I
        else:
            frame.pict_type = av.video.frame.PictureType.NONE

        if self.codec is None:
            self.codec = self._new_codec(frame)

        data_to_send = b""
        self._last_packet_pts = None
        self._last_packet_time_base = None
        start = time.perf_counter()
        for package in self.codec.encode(frame):
            if self._last_packet_pts is None and package.pts is not None:
                self._last_packet_pts = package.pts
                self._last_packet_time_base = package.time_base
            package_bytes = bytes(package)
            data_to_send += package_bytes
            self.encoded_byte_count += len(package_bytes)

        elapsed = time.perf_counter() - start
        self.total_encode_time += elapsed

        if data_to_send:
            self.encoded_frame_count += 1
            self.output_counter.tick()
            self._log_output_fps()
            yield from self._split_bitstream(data_to_send)

    def encode(
        self,
        frame: Frame,
        force_keyframe: bool = False,
    ) -> tuple[list[bytes], int]:
        assert isinstance(frame, av.VideoFrame)
        packages = list(self._encode_frame(frame, force_keyframe))
        if self._last_packet_pts is not None and self._last_packet_time_base is not None:
            timestamp = convert_timebase(
                self._last_packet_pts,
                self._last_packet_time_base,
                VIDEO_TIME_BASE,
            )
        else:
            timestamp = convert_timebase(frame.pts, frame.time_base, VIDEO_TIME_BASE)
        return self._packetize(packages), timestamp

    def pack(self, packet: Packet) -> tuple[list[bytes], int]:
        assert isinstance(packet, av.Packet)
        packages = self._split_bitstream(bytes(packet))
        timestamp = convert_timebase(packet.pts, packet.time_base, VIDEO_TIME_BASE)
        return self._packetize(packages), timestamp

    def _log_output_fps(self) -> None:
        fps = self.output_counter.sample()
        if fps is None:
            return

        print(
            "WebRTC NVENC FPS: "
            f"output={fps:.1f} | "
            f"avg encode={self.average_encode_ms:.2f} ms | "
            f"fixed bitrate={self.target_bitrate} | "
            f"requested bitrate={self.requested_bitrate}"
        )


def install_nvenc_h264_encoder(fps: int, bitrate: int) -> None:
    global _PATCHED

    if _PATCHED:
        return

    if "h264_nvenc" not in av.codecs_available:
        raise RuntimeError(
            "VIDEO_ENCODER=nvenc requested, but PyAV cannot see h264_nvenc. "
            "Set VIDEO_ENCODER=software to recover."
        )

    def get_encoder(codec: Any) -> Any:
        mime_type = codec.mimeType.lower()
        if mime_type == "video/h264":
            return NvencH264Encoder(fps=fps, bitrate=bitrate)
        return _ORIGINAL_GET_ENCODER(codec)

    aiortc_codecs.get_encoder = get_encoder
    aiortc_sender.get_encoder = get_encoder
    _PATCHED = True


def _log_nvenc_once(width: int, height: int, fps: int, bitrate: int) -> None:
    global _NVENC_LOGGED

    if _NVENC_LOGGED:
        return

    print("WebRTC encoder: NVIDIA NVENC H.264")
    print(f"  Resolution: {width}x{height}")
    print(f"  Target FPS: {fps}")
    print(f"  Bitrate:    {bitrate}")
    print("  Options:    preset=p1 tune=ull rc=cbr rc-lookahead=0 zerolatency=1 bf=0 profile=baseline")
    _NVENC_LOGGED = True
