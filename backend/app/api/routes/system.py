"""System information for clients (connection details, video settings)."""
from fastapi import APIRouter

from app.core.config import settings
from app.services.streaming.manager import stream_manager
from app.utils.network import get_local_ip

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/info")
async def system_info() -> dict:
    return {
        "server_ip": get_local_ip(),
        "port": settings.port,
        "stun_server": settings.stun_server,
        "video": {
            "width": settings.video_width,
            "height": settings.video_height,
            "fps": settings.target_fps,
            "bitrate": settings.video_bitrate,
        },
        "gstreamer_available": stream_manager.available,
    }
