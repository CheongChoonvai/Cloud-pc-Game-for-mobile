# Run Services Guide

This guide is for running the project as separate services during development.

For smooth gameplay using GPU hardware encoding, use [SUNSHINE_MOONLIGHT_SETUP.md](./SUNSHINE_MOONLIGHT_SETUP.md).

## Ports

| Service | Port | Purpose |
|---|---:|---|
| Vite client | 5173 | Phone web app |
| Input server | 8765 | Controller WebSocket |
| WebRTC stream | 8889 | Low-latency PC screen stream |
| MJPEG stream | 8888 | Fallback PC screen stream |

## One-Time Setup

### Server

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Install ViGEmBus for Xbox controller emulation:

```text
https://github.com/ViGEm/ViGEmBus/releases
```

Restart Windows after installing ViGEmBus.

### Client

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\client"
npm install
```

Check `client/.env`:

```env
VITE_SERVER_IP=10.1.64.253
VITE_MJPEG_PORT=8888
VITE_WEBRTC_PORT=8889
VITE_WS_PORT=8765
```

Update `VITE_SERVER_IP` if the PC IP changes.

## Normal Run

Open three terminals.

### Terminal 1: Controller Input

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server"
.\.venv\Scripts\Activate.ps1
python input_server.py
```

Expected:

```text
Listening on ws://0.0.0.0:8765
Waiting for connections...
```

### Terminal 2: WebRTC Screen Stream

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server"
.\.venv\Scripts\Activate.ps1
python video\webrtc_server.py
```

Expected:

```text
WebRTC Game Streaming Server
URL: http://10.1.64.253:8889/
WebRTC Available: True
```

When the phone connects, expected:

```text
Connection state: connected
```

### Terminal 3: Phone Web App

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\client"
npm run dev -- --host 0.0.0.0
```

Open this on the phone:

```text
http://10.1.64.253:5173
```

In the app, use:

```text
Settings -> Mirror Technique -> WebRTC
```

## Stream Resolution

WebRTC resolution is controlled in `server/.env`.

Recommended stable gameplay setting:

```env
TARGET_FPS=30
VIDEO_WIDTH=854
VIDEO_HEIGHT=480
VIDEO_CODEC=VP8
VIDEO_ENCODER=software
VIDEO_BITRATE=4000000
```

Experimental NVIDIA NVENC setting:

```env
TARGET_FPS=30
VIDEO_WIDTH=854
VIDEO_HEIGHT=480
VIDEO_CODEC=H264
VIDEO_ENCODER=nvenc
VIDEO_BITRATE=4000000
```

60 FPS diagnostic setting:

```env
TARGET_FPS=60
VIDEO_WIDTH=854
VIDEO_HEIGHT=480
VIDEO_CODEC=H264
VIDEO_ENCODER=nvenc
VIDEO_BITRATE=5000000
```

Use 60 FPS only after 30 FPS NVENC is stable. If 30 FPS NVENC is worse than VP8 on the phone, return to `VIDEO_CODEC=VP8` and `VIDEO_ENCODER=software`.

For 720p:

```env
TARGET_FPS=30
VIDEO_WIDTH=1280
VIDEO_HEIGHT=720
VIDEO_CODEC=VP8
```

Restart `python video\webrtc_server.py` after changing `server/.env`.

The website WebRTC server tries DXcam first for low-latency Windows capture. If DXcam fails, it falls back to the older mss capture path.

## NVIDIA GPU Check

The stable website WebRTC stream uses:

```text
DXcam capture -> CPU resize/VideoFrame -> aiortc software VP8/H.264 -> browser
```

The experimental NVENC stream uses:

```text
DXcam capture -> CPU resize/VideoFrame -> aiortc RTP -> h264_nvenc -> browser
```

Setting Python to the NVIDIA GPU can help capture/game GPU selection, but stock aiortc does not use NVENC unless `VIDEO_ENCODER=nvenc` is enabled in this project.

Run this diagnostic:

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server"
.\.venv\Scripts\Activate.ps1
python check_video_stack.py
```

Also check live NVIDIA encoder usage:

```powershell
nvidia-smi --query-gpu=name,utilization.gpu,utilization.encoder,utilization.decoder,memory.used --format=csv -l 1
```

Windows GPU preference:

```text
Windows Settings -> System -> Display -> Graphics
```

Add these desktop apps and set both to `High performance`:

```text
C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server\.venv\Scripts\python.exe
Your actual game .exe
```

If it exists, also add:

```text
C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server\.venv\Scripts\pythonw.exe
```

NVIDIA Control Panel:

```text
Manage 3D settings -> Program Settings
```

Add the same `python.exe` and game `.exe`, then set:

```text
Preferred graphics processor: High-performance NVIDIA processor
Power management mode: Prefer maximum performance
```

Restart the game and `python video\webrtc_server.py` after changing GPU settings.

In Task Manager, use:

```text
Performance -> GPU 1 -> right-click graph -> Change graph to -> Multiple engines
```

Watch `Video Encode`, not only the main GPU percentage. With `VIDEO_ENCODER=nvenc`, `Video Encode` should become non-zero while the phone is connected.

Expected NVENC startup:

```text
Video codec: H264
Video encoder: nvenc
Encoder path: NVIDIA NVENC H.264 via PyAV
Note: experimental NVENC encoder patch is active for video/H264.
```

Expected stream-time logs:

```text
WebRTC encoder: NVIDIA NVENC H.264
WebRTC pipeline FPS: DXcam latest read=30.0 | DXcam unique frame=30.0 | Track recv=30.0 | Encoder submit=30.0
WebRTC NVENC FPS: output=30.0 | avg encode=1.20 ms | fixed bitrate=4000000 | requested bitrate=4000000
```

In the current NVENC prototype, `VIDEO_BITRATE` is fixed for the session. aiortc may request bitrate changes while estimating bandwidth, but the encoder does not recreate itself for those changes because that causes gameplay stutter.

## Smooth Streaming Option: Sunshine + Moonlight

Use this when the Python WebRTC stream is too laggy.

Sunshine runs on the PC and uses GPU hardware encoding. Moonlight runs on the phone and receives the stream with a native low-latency decoder.

Recommended setup:

| Role | App |
|---|---|
| PC streaming host | Sunshine |
| Phone streaming client | Moonlight |
| Controller input | Moonlight built-in touch/controller input |

Official links:

```text
Sunshine docs: https://docs.lizardbyte.dev/projects/sunshine/latest/
Sunshine releases: https://github.com/LizardByte/Sunshine/releases
Moonlight: https://moonlight-stream.org/
Moonlight Android: https://github.com/moonlight-stream/moonlight-android
```

Use this flow:

1. Install Sunshine on the PC.
2. Open Sunshine's web UI and finish pairing setup.
3. Install Moonlight on the phone.
4. Pair Moonlight with the PC.
5. Start the game from Moonlight.

Important limitation:

```text
Sunshine + Moonlight replaces this project's browser video stream.
It does not render inside the Vite controller overlay.
```

For best smoothness on one phone, use Moonlight's built-in touch controls or connect a real controller. Keep this project's custom controller path for browser-based experiments.

## WebRTC Latency Debug

The WebRTC stream page shows a small stats overlay on the phone.

The WebRTC server also prints one-second pipeline counters:

```text
WebRTC pipeline FPS: DXcam latest read=30.0 | DXcam unique frame=30.0 | Track recv=30.0 | Encoder submit=30.0
```

How to read the counters:

| Result | Meaning |
|---|---|
| `DXcam unique frame` is 60, `Track recv` is 35, browser decoded FPS is 35 | aiortc/software encoding is applying backpressure |
| `Track recv` is 60, browser decoded FPS is 35 | phone/browser/network side is the bottleneck |
| all counters are near 30 and browser FPS is near 30 | stable 30 FPS path is working |

Use these numbers to find the bottleneck:

| Stat | What it means |
|---|---|
| Decoded FPS | Actual browser-decoded video FPS |
| Received FPS | Frames received by browser before decode |
| Codec | Negotiated WebRTC video codec |
| Decoder | Browser-reported decoder implementation, if exposed |
| Size | Received video frame size |
| Capture->display | Browser-estimated capture-to-display latency; unavailable if `captureTime` is not exposed |
| Recv->display | Time from browser receiving a frame to displaying it |
| Compositor lead | Time between browser composition submission and expected display |
| Callback late | How late the frame callback ran versus expected display time |
| Frame process | Browser per-frame processing duration |
| Latency source | `captureTime`, `receiveTime fallback`, or unavailable |
| Latency p50/p95/max | Rolling latency percentiles from the active latency source |
| Network RTT | If this is high, check WiFi/router distance |
| Jitter buffer | If this is high, the browser is buffering frames |
| Decode | If this is high, the phone decoder is slow |
| Processing | If this is high, browser/video processing is slow |
| Dropped frames | Some drops are acceptable for low-latency gaming |
| Packet loss | If this rises, WiFi is unstable |

Controller input latency is shown in the controller pill:

```text
Input 8ms 60Hz
```

The input server echoes `input_ack` with the same sequence number. The browser calculates RTT locally using `performance.now()`, so it does not compare phone and PC clocks. If WebSocket `bufferedAmount` exceeds 4096 bytes, the client drops that input update instead of building a stale input queue.

The server may print `Could not bind to 169.254.x.x`. That is usually Windows trying unused link-local adapters. If the log later says `ICE completed` and `Connection state: connected`, the phone is using the normal LAN path.

## MJPEG Fallback

Use MJPEG only if WebRTC does not work.

Terminal 2 alternative:

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server"
.\.venv\Scripts\Activate.ps1
python mjpeg_server_fast.py
```

In the app, use:

```text
Settings -> Mirror Technique -> MJPEG
```

## Stop Port Conflicts

If a port is already in use:

```powershell
netstat -ano | findstr :8765
netstat -ano | findstr :8889
netstat -ano | findstr :5173
```

Then stop the process by PID:

```powershell
taskkill /PID <PID> /F
```

## Quick Checks

Controller working:

```text
Input server prints Client connected
```

Screen stream working:

```text
WebRTC server prints Connection state: connected
```

Phone app reachable:

```text
Phone opens http://PC_IP:5173
```

Phone and PC must be on the same WiFi network.

## Common Problems

| Problem | Fix |
|---|---|
| Phone controls work but no PC screen | Start `python video\webrtc_server.py` and set Mirror Technique to WebRTC |
| WebRTC says connected but no frames | Restart WebRTC server after pulling latest code |
| Buttons do not work in game | Install ViGEmBus and restart Windows |
| Port 8765 already in use | Stop old input server process |
| Phone cannot open app | Check PC IP and run Vite with `--host 0.0.0.0` |
| Stream is laggy | Use `VIDEO_HEIGHT=480` and WebRTC |
