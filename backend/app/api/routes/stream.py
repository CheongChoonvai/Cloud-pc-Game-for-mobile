"""WebRTC signaling: the browser POSTs an SDP offer, we answer.

The offer may carry optional quality overrides (width/height/fps/bitrate);
anything omitted falls back to the .env defaults. Values are clamped
server-side in the stream manager.
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.streaming.manager import stream_manager

logger = logging.getLogger("api.stream")

router = APIRouter(prefix="/stream", tags=["stream"])


class SdpOffer(BaseModel):
    sdp: str
    type: str
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[int] = None
    bitrate: Optional[int] = None


class SdpAnswer(BaseModel):
    sdp: str
    type: str


@router.post("/offer", response_model=SdpAnswer)
async def create_stream(offer: SdpOffer) -> dict:
    if offer.type != "offer" or not offer.sdp:
        raise HTTPException(status_code=400, detail="Invalid SDP offer")

    if not stream_manager.available:
        raise HTTPException(
            status_code=503,
            detail=f"GStreamer WebRTC not available: {stream_manager.unavailable_reason}",
        )

    try:
        return await stream_manager.create_peer_answer(
            offer.sdp,
            width=offer.width,
            height=offer.height,
            fps=offer.fps,
            bitrate=offer.bitrate,
        )
    except Exception as exc:
        logger.exception("Failed to negotiate stream")
        raise HTTPException(status_code=500, detail=str(exc))
