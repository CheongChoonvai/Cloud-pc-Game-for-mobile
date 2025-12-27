# 🎮 Mobile Game Controller for PC Games

Transform your smartphone into a wireless game controller to play PC games like Hogwarts Legacy over local WiFi.

## ✨ Features
- 📱 **Mobile Virtual Gamepad** - Touch joysticks and buttons on your phone
- 🎮 **Xbox Controller Emulation** - Games detect it as a real Xbox controller
- 📺 **Live Game Stream** - See the game on your phone (optional)
- ⚡ **Low Latency** - WebSocket connection over local WiFi

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           YOUR PC (Server)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐      ┌──────────────────────────┐         │
│  │   input_server.py   │      │     mjpeg_server.py      │         │
│  │   (WebSocket :8765) │      │      (HTTP :8888)        │         │
│  │                     │      │                          │         │
│  │  Receives joystick  │      │  Captures screen &       │         │
│  │  and button inputs  │      │  streams as MJPEG video  │         │
│  │        ↓            │      │        ↓                 │         │
│  │  Emulates Xbox 360  │      │  Sends to mobile browser │         │
│  │  Controller (ViGEm) │      │                          │         │
│  └─────────────────────┘      └──────────────────────────┘         │
│              ↑                           │                          │
└──────────────┼───────────────────────────┼──────────────────────────┘
               │        WiFi               │
               │                           ↓
┌──────────────┴───────────────────────────────────────────────────────┐
│                         YOUR PHONE (Client)                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │             React Web App (Vite :5173)                       │   │
│  │                                                              │   │
│  │   ┌─────────────────┐    ┌────────────────────────────────┐  │   │
│  │   │  Video Stream   │    │    Virtual Gamepad UI          │  │   │
│  │   │  (from MJPEG)   │    │  - Left Stick (movement)       │  │   │
│  │   │                 │    │  - Right Stick (camera)        │  │   │
│  │   │  See game here! │    │  - A/B/X/Y/LB/RB/LT/RT buttons │  │   │
│  │   └─────────────────┘    └────────────────────────────────┘  │   │
│  │                                   │                          │   │
│  │                                   ↓ WebSocket                │   │
│  │                          Sends touch input to server         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```
pip install -r requirements-input.txt
### 🔄 Code Flow Explanation

**1. Server Side (PC)**
pip install qrcode[pil] vgamepad
- **`input_server.py`**: 
  - Starts WebSocket server on port 8765
  - Listens for joystick/button data from mobile client
  - Translates inputs to Xbox 360 controller commands via ViGEmBus driver
  - Your PC game thinks a real Xbox controller is connected!
  
- **`mjpeg_server.py`** *(Optional)*:
  - Captures your PC screen using `mss` library
  - Encodes frames as JPEG images
  - Streams video over HTTP on port 8888
  - Your phone displays the game in real-time!

**2. Client Side (Phone)**
- **React Web App** (`client/`):
  - Renders virtual gamepad UI with touch joysticks
  - Connects to PC via WebSocket
  - Sends controller inputs in JSON format
  - Displays video stream from MJPEG server

**3. Data Flow**:
```
Phone Touch → WebSocket → input_server.py → ViGEmBus → Xbox Controller → Game
Screen ← MJPEG Stream ← mjpeg_server.py ← Screen Capture ← Game
```

---

## 🚀 Quick Start

### 1. Install ViGEmBus Driver (Required!)

The virtual Xbox controller needs this driver to work.

**Option A: Download manually**
1. Download from: https://github.com/ViGEm/ViGEmBus/releases
2. Install `ViGEmBus_Setup_x64.msi`
3. **Restart your PC**

**Option B: Install via PowerShell (Admin)**
```powershell
# Download ViGEmBus installer
Invoke-WebRequest -Uri "https://github.com/ViGEm/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe" -OutFile "$env:TEMP\ViGEmBus_Setup.exe"

# Run installer (follow the prompts)
Start-Process -FilePath "$env:TEMP\ViGEmBus_Setup.exe" -Wait

# Restart PC after installation
Restart-Computer
```

> ⚠️ **Without ViGEmBus, only mouse control will work. Buttons and left stick won't control the game!**

---

### 2. Install Dependencies

**Server (PowerShell):**
```powershell
cd server
pip install -r requirements-input.txt
```

Or install manually:
```powershell
pip install websockets pynput python-dotenv vgamepad opencv-python mss qrcode[pil]
```

**Client:**
```powershell
cd client
npm install
```

---

### 3. Configure IP Address

Find your PC's IP address:
```powershell
ipconfig
# Look for "IPv4 Address" (e.g., 192.168.0.241)
```

Edit `client/.env`:
```env
VITE_SERVER_IP=192.168.0.241
VITE_MJPEG_PORT=8888
VITE_WS_PORT=8765
```

---

### 4. Start the Servers

> **Important:** Start servers in this order!

| Order | Terminal | Command | Purpose | Required? |
|-------|----------|---------|---------|-----------|
| **1st** | Terminal 1 | `cd server` <br> `python input_server.py` | Controller input handler | ✅ **Required** |
| **2nd** | Terminal 2 | `cd server` <br> `python mjpeg_server.py` | Screen streaming | ⚪ Optional |
| **3rd** | Terminal 3 | `cd client` <br> `npm run dev` | Web interface | ✅ **Required** |

**What you should see:**

**Terminal 1 (input_server.py):**
```
✓ Virtual Xbox 360 Controller initialized!
WebSocket server running on ws://0.0.0.0:8765
```

**Terminal 2 (mjpeg_server.py):**
```
MJPEG Stream Server
URL: http://0.0.0.0:8888/
Target FPS: 60
```

**Terminal 3 (client):**
```
VITE ready in 500ms
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.0.241:5173/
```

---

### 5. Connect from Mobile

1. Connect phone to **same WiFi** as PC
2. Open browser: `http://YOUR_PC_IP:5173`
3. You should see "Connected" in green
4. Rotate phone to **landscape mode**
5. Tap ⛶ for **fullscreen**

---

## 🎮 Xbox Controller Mapping

| Mobile | Xbox Controller | Hogwarts Legacy |
|--------|-----------------|-----------------|
| Left Stick | Left Stick | Move Avatar |
| Right Stick | Right Stick | Move Camera |
| A | A Button | Jump |
| B | B Button | Dodge Roll |
| X | X Button | Interact |
| Y | Y Button | Protego (Block) |
| LB / RB | Bumpers | Tool Wheel / Ancient Magic |
| LT / RT | Triggers | Aim / Basic Cast |
| D-Pad | D-Pad | Select Spell Set |
| ▶ (Start) | Start | Pause Menu |
| ☰ (Select) | Back | Field Guide |

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Buttons don't work" | Install ViGEmBus driver and restart PC |
| "Disconnected" status | Check both devices on same WiFi |
| "Failed to create virtual gamepad" | ViGEmBus not installed properly |
| "Joystick inverted" | Y-axis is now fixed in latest version |
| Video stream slow (~17 FPS) | This is normal for MJPEG. For 60fps, use Sunshine+Moonlight |

---

## 📁 Project Structure

```
├── client/                 # React mobile webapp
│   ├── src/
│   │   ├── components/     # AnalogStick, ActionButton, DPad
│   │   ├── App.jsx         # Main app with WebSocket
│   │   └── config.js       # Server connection settings
│   └── .env                # IP configuration
│
└── server/                 # Python servers
    ├── input_server.py     # WebSocket → Xbox controller
    ├── mjpeg_server.py     # Screen capture → video stream
    └── requirements-input.txt
```

---

## 🔧 Technologies Used

- **Frontend:** React, Vite, nipplejs (joystick library)
- **Backend:** Python, websockets, vgamepad (Xbox emulation)
- **Streaming:** OpenCV, mss (screen capture)
- **Protocol:** WebSocket (real-time), MJPEG (video)

---

## 📋 Requirements

- **PC:** Windows 10/11 with ViGEmBus driver
- **Phone:** Any modern smartphone with browser
- **Network:** Both devices on same WiFi network
- **Python:** 3.8+
- **Node.js:** 18+

---

## 📖 Complete Flow Summary

### 🎯 From Zero to Gaming

**Setup (One-time)**:
1. Install ViGEmBus driver on PC → Restart
2. Install Python dependencies: `pip install -r requirements-input.txt`
3. Install Node.js dependencies: `cd client && npm install`
4. Update `client/.env` with your PC's IP address

**Every Gaming Session**:
1. **Start PC servers**:
   - Terminal 1: `python server/input_server.py` ← Controller handler
   - Terminal 2: `python server/mjpeg_server.py` ← Video stream (optional)
   - Terminal 3: `npm run dev` (in client folder) ← Web interface
   
2. **Connect phone**:
   - Connect to same WiFi as PC
   - Open `http://YOUR_PC_IP:5173` in mobile browser
   - See "Connected" status in green
   
3. **Start playing**:
   - Launch your PC game (e.g., Hogwarts Legacy)
   - Use mobile joysticks/buttons to control
   - Game sees it as a real Xbox controller!

### 🔍 How It Works Internally

```
[Your Thumb on Phone Screen]
         ↓
[Touch Event Captured by React]
         ↓
[nipplejs converts to joystick coordinates]
         ↓
[WebSocket sends JSON: {type: "stick", x: 0.5, y: -0.2}]
         ↓
[input_server.py receives data]
         ↓
[vgamepad library translates to Xbox commands]
         ↓
[ViGEmBus driver creates virtual Xbox 360 controller]
         ↓
[Windows sees it as real controller]
         ↓
[Your Game receives Xbox input!]
```

---

## 🎓 Learning the Codebase

### Key Components to Study

| Component | What to Learn | Files to Read |
|-----------|---------------|---------------|
| **Backend WebSocket** | How Python handles real-time communication | `server/input_server.py` |
| **Controller Emulation** | How ViGEmBus creates virtual Xbox controller | `server/input_server.py` (vgamepad usage) |
| **Screen Capture** | How to capture and stream PC screen | `server/mjpeg_server.py` |
| **Frontend Touch** | How to create virtual joysticks | `client/src/components/GamepadController.jsx` |
| **WebSocket Client** | How React connects to backend | `client/src/App.jsx` |

### 📚 Technologies Deep Dive

- **WebSocket**: Real-time bidirectional communication between phone and PC
- **ViGEmBus**: Windows driver that creates virtual game controllers
- **vgamepad**: Python library to control ViGEmBus
- **nipplejs**: JavaScript library for mobile joystick UI
- **mss**: Fast Python screen capture library
- **MJPEG**: Motion JPEG video streaming protocol

---

