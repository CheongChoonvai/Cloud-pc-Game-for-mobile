"""Standalone NVENC runtime smoke test.

This test proves PyAV can open NVIDIA's H.264 encoder and encode frames.
It does not use aiortc or the browser WebRTC server.
"""

from __future__ import annotations

import time
from fractions import Fraction

import av


WIDTH = 854
HEIGHT = 480
FPS = 30
BITRATE = 4_000_000
FRAME_COUNT = FPS * 3


def main() -> None:
    codec = av.CodecContext.create("h264_nvenc", "w")
    codec.width = WIDTH
    codec.height = HEIGHT
    codec.pix_fmt = "yuv420p"
    codec.bit_rate = BITRATE
    codec.time_base = Fraction(1, FPS)
    codec.framerate = Fraction(FPS, 1)
    codec.options = {
        "preset": "p1",
        "tune": "ull",
        "rc": "cbr",
        "rc-lookahead": "0",
        "zerolatency": "1",
        "bf": "0",
        "g": str(FPS * 2),
        "profile": "baseline",
    }

    start = time.perf_counter()
    codec.open()

    packet_count = 0
    encoded_bytes = 0

    for index in range(FRAME_COUNT):
        frame = av.VideoFrame(WIDTH, HEIGHT, "yuv420p")

        for plane in frame.planes:
            plane.update(bytes(plane.buffer_size))

        frame.pts = index
        frame.time_base = Fraction(1, FPS)

        for packet in codec.encode(frame):
            packet_count += 1
            encoded_bytes += packet.size

    for packet in codec.encode(None):
        packet_count += 1
        encoded_bytes += packet.size

    elapsed = time.perf_counter() - start
    encoded_fps = FRAME_COUNT / elapsed if elapsed > 0 else 0

    print("NVENC test succeeded")
    print(f"Encoder:       {codec.name}")
    print(f"Resolution:    {WIDTH}x{HEIGHT}")
    print(f"Target FPS:    {FPS}")
    print(f"Frames:        {FRAME_COUNT}")
    print(f"Packets:       {packet_count}")
    print(f"Encoded bytes: {encoded_bytes}")
    print(f"Elapsed:       {elapsed:.3f} s")
    print(f"Encode FPS:    {encoded_fps:.1f}")


if __name__ == "__main__":
    try:
        main()
    except av.FFmpegError as exc:
        print("NVENC test failed")
        print(type(exc).__name__)
        print(exc)
        raise SystemExit(1)
