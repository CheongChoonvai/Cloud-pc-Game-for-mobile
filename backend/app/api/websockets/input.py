"""WebSocket endpoint for controller input.

Protocol (unchanged from the original client):
  client -> server: {type: left_stick|right_stick|button|dpad, ..., sequence}
  server -> client: {type: status, ...} once on connect
                    {type: input_ack, sequence, serverApplyMs, ...} per message
"""
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.input.gamepad import gamepad_service

logger = logging.getLogger("ws.input")

router = APIRouter()


@router.websocket("/ws/input")
async def input_websocket(websocket: WebSocket) -> None:
    await websocket.accept()
    client = websocket.client.host if websocket.client else "unknown"
    logger.info("Input client connected: %s", client)

    await websocket.send_text(
        json.dumps(
            {
                "type": "status",
                "controllerMode": gamepad_service.controller_mode,
                "gamepadReady": gamepad_service.gamepad is not None,
                "keyboardFallback": gamepad_service.keyboard_fallback,
            }
        )
    )

    last_sequence = None
    try:
        while True:
            message = await websocket.receive_text()
            receive_start = time.perf_counter()
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")
            sequence = data.get("sequence")
            sequence_gap = 0
            stale_sequence = False

            if isinstance(sequence, int):
                if last_sequence is not None:
                    if sequence <= last_sequence:
                        stale_sequence = True
                    elif sequence > last_sequence + 1:
                        sequence_gap = sequence - last_sequence - 1
                if not stale_sequence:
                    last_sequence = sequence

            if msg_type == "left_stick":
                gamepad_service.handle_left_stick(
                    float(data.get("x", 0)), float(data.get("y", 0))
                )
            elif msg_type == "right_stick":
                gamepad_service.handle_right_stick(
                    float(data.get("x", 0)), float(data.get("y", 0))
                )
            elif msg_type == "button":
                gamepad_service.handle_button(
                    data.get("button", ""), bool(data.get("pressed", False))
                )
            elif msg_type == "dpad":
                gamepad_service.handle_dpad(
                    data.get("direction", ""), bool(data.get("pressed", False))
                )

            if isinstance(sequence, int):
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "input_ack",
                            "sequence": sequence,
                            "serverApplyMs": (time.perf_counter() - receive_start) * 1000,
                            "sequenceGap": sequence_gap,
                            "staleSequence": stale_sequence,
                        }
                    )
                )
    except WebSocketDisconnect:
        logger.info("Input client disconnected: %s", client)
    except Exception as exc:
        logger.warning("Input websocket error (%s): %s", client, exc)
    finally:
        gamepad_service.reset()
