# 🎮 Cloud PC Game for Mobile

Play PC games from your phone over local WiFi: the phone shows the PC screen
via **WebRTC** (GStreamer, low latency) and works as a **wireless Xbox
controller** (touch joysticks + buttons, emulated via ViGEmBus).

## Architecture

```
┌────────────────────────── YOUR PC ──────────────────────────┐
│  backend/  (FastAPI, one process, port 8000)                │
│                                                             │
│   GStreamer media pipeline (frames never touch Python):     │
│   d3d11screencapturesrc → d3d11convert → x264enc            │
│     → rtph264pay → webrtcbin ──────────────┐                │
│                                            │                │
│   /api/stream/offer   WebRTC signaling     │                │
│   /ws/input           controller input → ViGEmBus           │
│                       (virtual Xbox 360)   │                │
└────────────────────────────────────────────┼────────────────┘
                        WiFi                 │ RTP/H264
┌────────────────────────────────────────────┼────────────────┐
│  frontend/  (React + Vite, port 5173)      ▼                │
│   WebRTCPlayer.jsx — native RTCPeerConnection <video>       │
│   GamepadController.jsx — touch sticks/buttons → WebSocket  │
└──────────────────────────── YOUR PHONE ─────────────────────┘
```

| Folder | Stack | Docs |
|---|---|---|
| [backend/](backend/) | Python 3.9, FastAPI, GStreamer webrtcbin, vgamepad | [backend/README.md](backend/README.md) |
| [frontend/](frontend/) | React 19, Vite 7, native WebRTC | [frontend/README.md](frontend/README.md) |

## Quick start

One-time setup (GStreamer, ViGEmBus, venv, npm install): see
[backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

Every session:

```powershell
# Terminal 1 — backend (video + input, port 8000)
cd backend
.\.venv\Scripts\Activate.ps1
python run.py

# Terminal 2 — frontend (port 5173)
cd frontend
npm run dev
```

Then on the phone (same WiFi): open `http://<PC_IP>:5173` — or scan the QR
code the backend prints at startup.

## Controller mapping

| Mobile | Xbox Controller |
|--------|-----------------|
| Left Stick | Left Stick (movement) |
| Right Stick | Right Stick + mouse (camera) |
| A / B / X / Y | A / B / X / Y |
| LB / RB | Bumpers |
| LT / RT | Triggers |
| D-Pad | D-Pad |
| ▶ / ☰ | Start / Back |

Without ViGEmBus the backend falls back to keyboard emulation (WASD + keys).

## Troubleshooting

| Problem | Fix |
|---|---|
| No screen on phone | Check the on-screen status in the video area — it shows the actual error. Verify backend is running: `http://<PC_IP>:8000/api/health` |
| Buttons don't work in game | Install ViGEmBus and restart Windows |
| Port 8000 in use | `netstat -ano \| findstr :8000` then `taskkill /PID <pid> /F` |
| Phone can't open the app | Same WiFi? Vite prints the Network URL; use that IP |
| Laggy stream | Lower `VIDEO_WIDTH/HEIGHT` or `TARGET_FPS` in `backend/.env` |
| GStreamer errors on startup | `python -m app.services.streaming.diagnostics` in backend venv |

For the smoothest possible experience with GPU encoding, Sunshine + Moonlight
remains a good alternative (replaces this project's browser stream entirely).
