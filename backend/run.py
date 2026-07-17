"""Development entry point: python run.py"""
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import uvicorn

from app.core.config import settings
from app.utils.network import get_local_ip, print_qr_ascii


def main() -> None:
    local_ip = get_local_ip()
    frontend_url = f"http://{local_ip}:5173"

    print("=" * 55)
    print("  Cloud Game Backend (FastAPI + GStreamer)")
    print("=" * 55)
    print(f"  API:        http://{local_ip}:{settings.port}")
    print(f"  Input WS:   ws://{local_ip}:{settings.port}/ws/input")
    print(f"  Video:      {settings.video_width}x{settings.video_height} @ {settings.target_fps}fps")
    print("=" * 55)
    print(f"\nOpen on phone: {frontend_url}")
    print_qr_ascii(frontend_url)

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
