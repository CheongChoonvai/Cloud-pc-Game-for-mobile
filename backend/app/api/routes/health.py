"""Health / readiness endpoints."""
from fastapi import APIRouter

from app.services.streaming.manager import stream_manager

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "gstreamer_available": stream_manager.available,
        "active_streams": stream_manager.peer_count(),
    }
