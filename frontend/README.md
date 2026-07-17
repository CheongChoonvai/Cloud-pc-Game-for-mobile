# Cloud Game Frontend

React + Vite web app for the phone: renders the PC screen over **native
WebRTC** (RTCPeerConnection in `src/components/WebRTCPlayer.jsx`, no iframe)
and sends controller input over a WebSocket to the FastAPI backend.

## Connection model

Everything talks to one backend port (default 8000):

- Video: `POST http://<pc-ip>:8000/api/stream/offer` (SDP offer/answer)
- Input: `ws://<pc-ip>:8000/ws/input`

Server IP resolution order (`src/config.js`):
1. `?server=` URL query param
2. Browser hostname (works automatically when opened via the LAN URL)
3. `VITE_SERVER_IP` in `.env`

## Run (development)

```powershell
cd frontend
npm install
npm run dev
```

Open `http://<pc-ip>:5173` on the phone (same WiFi as the PC). The backend
prints a QR code for this URL on startup.

## Build (production)

```powershell
npm run build    # outputs to dist/
```

## Key files

| File | Purpose |
|---|---|
| `src/config.js` | Server IP/port resolution |
| `src/App.jsx` | Input WebSocket + view routing |
| `src/components/WebRTCPlayer.jsx` | Native WebRTC video (H264, auto-reconnect, FPS overlay) |
| `src/components/GamepadController.jsx` | Touch controller UI |
| `src/components/SettingsPage.jsx` | Server/stream info |
