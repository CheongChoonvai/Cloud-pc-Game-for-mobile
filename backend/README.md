# Cloud Game Backend

FastAPI backend for streaming the PC screen to a phone and receiving controller
input. One process, one port (default **8000**):

| Endpoint | Purpose |
|---|---|
| `POST /api/stream/offer` | WebRTC signaling (browser sends SDP offer, gets answer) |
| `WS /ws/input` | Controller input (gamepad protocol) |
| `GET /api/health` | Liveness + GStreamer availability |
| `GET /api/system/info` | Server IP, ports, video settings |
| `GET /docs` | Interactive API docs (Swagger) |

## Architecture

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory + lifespan
│   ├── core/
│   │   ├── config.py        # Settings (pydantic-settings, reads .env)
│   │   └── gst_env.py       # GStreamer DLL path setup (before `import gi`)
│   ├── api/
│   │   ├── router.py        # /api aggregate
│   │   ├── routes/          # health, stream (signaling), system
│   │   └── websockets/      # input.py (controller WS)
│   ├── services/
│   │   ├── streaming/       # peer.py (webrtcbin pipeline), manager.py, diagnostics.py
│   │   └── input/           # gamepad.py (ViGEmBus + keyboard fallback)
│   └── utils/network.py
├── run.py                   # dev entry: banner + QR + uvicorn
└── requirements.txt
```

**Media plane** is 100% GStreamer (no frames ever touch Python):

```
d3d11screencapturesrc -> d3d11convert -> d3d11download -> videoconvert
  -> x264enc (zerolatency) -> h264parse -> rtph264pay -> webrtcbin
```

One pipeline instance is created per connected client and destroyed when its
ICE connection drops.

## One-time setup

1. **GStreamer** (runtime + development MSI, to `C:\Program Files\gstreamer\1.0\msvc_x86_64`):
   https://gstreamer.freedesktop.org/download/
2. **ViGEmBus** (virtual Xbox controller): https://github.com/ViGEm/ViGEmBus/releases
   (restart Windows after installing)
3. **Python venv** (Python 3.9 — must match the GStreamer `gi` binding ABI):

```powershell
cd backend
py -3.9 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

4. **Link GStreamer's Python bindings** into the venv (one line in a .pth file):

```powershell
Set-Content .\.venv\Lib\site-packages\gstreamer.pth 'C:\Program Files\gstreamer\1.0\msvc_x86_64\lib\site-packages'
```

5. Copy `.env.example` to `.env` and adjust if needed.

## Run

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python run.py
```

No manual `PATH`/`PYGI_DLL_DIRS` setup needed — `app/core/gst_env.py` handles
DLL discovery using `GSTREAMER_BIN` from `.env`.

Verify GStreamer plugins:

```powershell
python -m app.services.streaming.diagnostics
```

## Configuration (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | 8000 | Single port for REST + WebSocket |
| `TARGET_FPS` | 60 | |
| `VIDEO_WIDTH`/`VIDEO_HEIGHT` | 854x480 | Even numbers only |
| `VIDEO_BITRATE` | 4000000 | bits/sec |
| `MONITOR_INDEX` | 1 | 1-based monitor number |
| `INPUT_MODE` | auto | `keyboard` forces keyboard fallback |
| `GSTREAMER_BIN` | Program Files path | GStreamer `bin\` directory |

Restart the backend after changing `.env`.

## NVENC (future)

The pipeline currently uses `x264enc` (software) because `nvd3d11h264enc`
fails to open a session on the dev machine. If NVENC works on your GPU, swap
the encoder element in `app/services/streaming/peer.py::_build_pipeline`
(check with `gst-inspect-1.0 nvd3d11h264enc`).
