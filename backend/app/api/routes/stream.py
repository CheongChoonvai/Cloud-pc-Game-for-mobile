"""WebRTC signaling: the browser POSTs an SDP offer, we answer."""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.streaming.manager import stream_manager

logger = logging.getLogger("api.stream")

router = APIRouter(prefix="/stream", tags=["stream"])


class SdpOffer(BaseModel):
    sdp: str
    type: str


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
        return await stream_manager.create_peer_answer(offer.sdp)
    except Exception as exc:
        logger.exception("Failed to negotiate stream")
        raise HTTPException(status_code=500, detail=str(exc))
