# Sunshine + Moonlight Setup

Use this path when you want smooth gameplay first.

Sunshine streams the PC game with GPU hardware encoding. Moonlight receives the stream on the phone with a native game-streaming client.

## What This Replaces

Sunshine + Moonlight replaces this project's Python WebRTC/MJPEG video stream.

Do not run this for video:

```powershell
python video\webrtc_server.py
python mjpeg_server_fast.py
```

Use Moonlight for video instead.

## Install

### PC: Sunshine

Download and install Sunshine:

```text
https://github.com/LizardByte/Sunshine/releases
```

Documentation:

```text
https://docs.lizardbyte.dev/projects/sunshine/latest/
```

After install, open Sunshine's web UI and finish the setup.

### Phone: Moonlight

Install Moonlight on the phone:

```text
https://moonlight-stream.org/
```

Android source/app info:

```text
https://github.com/moonlight-stream/moonlight-android
```

## Run

### Terminal 1: Optional Custom Controller

Only run this if you want to keep testing this project's custom web controller from a second device or browser.

```powershell
cd "C:\Users\cheon\Product development\Cloud-pc-Game-for-mobile\server"
.\.venv\Scripts\Activate.ps1
python input_server.py
```

### Sunshine + Moonlight

1. Start Sunshine on the PC.
2. Open Moonlight on the phone.
3. Pair Moonlight with the PC.
4. Start the desktop or game from Moonlight.

## Recommended First Settings

Use these first because they are easier for WiFi and phone decoding:

```text
Resolution: 720p
FPS: 60
Bitrate: 10-20 Mbps
Codec: H.264
V-Sync: Off if latency feels high
```

If it is smooth, raise bitrate or resolution later.

## Controller Choice

Best one-phone setup:

```text
Moonlight video + Moonlight built-in touch/controller input
```

Custom controller testing setup:

```text
Moonlight on phone A for video
This project's web controller on phone B for input
```

The current Vite controller overlay cannot draw on top of Moonlight on the same phone.

## When To Use Project WebRTC Instead

Use this project's WebRTC stream only when you are testing the custom browser implementation:

```powershell
python video\webrtc_server.py
```

For actual gameplay, Sunshine + Moonlight should be smoother.

## Important Website Limitation

Sunshine/Moonlight is the fast hardware-encoded path, but it does not render inside this project's Vite website.

If the video must stay inside the website, the long-term hardware-encoding path is a new WebRTC video service, for example:

```text
Direct3D/DXGI capture
-> NVIDIA NVENC H.264
-> WebRTC
-> existing Vite website/controller UI
```

The current Python `video\webrtc_server.py` uses aiortc software encoding. Setting Python to the NVIDIA GPU does not automatically change that encoder to NVENC.
