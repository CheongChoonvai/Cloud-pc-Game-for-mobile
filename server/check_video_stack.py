"""Print local video stack diagnostics for the browser WebRTC server."""

from __future__ import annotations

import shutil
import subprocess
import sys


def _print_versions() -> None:
    print(f"Python executable: {sys.executable}")
    print(f"Python version:    {sys.version.split()[0]}")

    try:
        from config.settings import settings

        print(f"VIDEO_CODEC:       {settings.video_codec}")
        print(f"VIDEO_ENCODER:     {settings.video_encoder}")
        print(f"VIDEO_BITRATE:     {settings.video_bitrate}")
        print(f"TARGET_FPS:        {settings.target_fps}")
    except Exception as exc:
        print(f"Project settings:  unavailable: {exc}")

    try:
        import aiortc

        print(f"aiortc version:    {getattr(aiortc, '__version__', 'unknown')}")
    except ImportError:
        print("aiortc version:    not installed")

    try:
        import av

        print(f"PyAV version:      {getattr(av, '__version__', 'unknown')}")
        nvenc_codecs = sorted(codec for codec in av.codecs_available if "nvenc" in codec.lower())
        print(f"PyAV NVENC:        {', '.join(nvenc_codecs) if nvenc_codecs else 'not available'}")
    except ImportError:
        print("PyAV version:      not installed")
        print("PyAV NVENC:        not available")

    try:
        import dxcam

        print(f"DXcam module:      {getattr(dxcam, '__file__', 'unknown')}")
    except ImportError:
        print("DXcam module:      not installed")


def _print_nvidia_smi() -> None:
    nvidia_smi = shutil.which("nvidia-smi")
    if not nvidia_smi:
        print("nvidia-smi:        not found on PATH")
        return

    print(f"nvidia-smi:        {nvidia_smi}")

    query = [
        nvidia_smi,
        "--query-gpu=name,utilization.gpu,utilization.encoder,utilization.decoder,memory.used",
        "--format=csv,noheader,nounits",
    ]

    try:
        result = subprocess.run(
            query,
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        print(f"nvidia-smi query:  failed: {exc}")
        return

    print("GPU utilization:")
    for line in result.stdout.strip().splitlines():
        print(f"  {line}")


def main() -> None:
    _print_versions()
    print()
    _print_nvidia_smi()
    print()
    print("Current browser WebRTC server path:")
    try:
        from config.settings import settings

        if settings.video_encoder.lower() == "nvenc":
            print("  DXcam capture -> CPU resize/VideoFrame -> aiortc RTP -> h264_nvenc -> browser")
            print("  NVENC is requested. Verify Video Encode becomes non-zero while streaming.")
        else:
            print("  DXcam capture -> CPU resize/VideoFrame -> aiortc software VP8/H.264 -> browser")
            print("  NVENC is not used unless VIDEO_ENCODER=nvenc and VIDEO_CODEC=H264.")
    except Exception:
        print("  DXcam capture -> CPU resize/VideoFrame -> aiortc software VP8/H.264 -> browser")


if __name__ == "__main__":
    main()
