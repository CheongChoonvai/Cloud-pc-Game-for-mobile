# 🎮 Mobile Game Controller for PC Games

Transform your smartphone into a wireless game controller to play PC games like Hogwarts Legacy over local WiFi.

## ✨ Features
- 📱 **Mobile Virtual Gamepad** - Touch joysticks and buttons on your phone
- 🎮 **Xbox Controller Emulation** - Games detect it as a real Xbox controller
- 📺 **Live Game Stream** - See the game on your phone (optional)
- ⚡ **Low Latency** - WebSocket connection over local WiFi

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
pip install websockets pynput python-dotenv vgamepad opencv-python mss
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

Open 3 terminals:

**Terminal 1 - Input Server:**
```powershell
cd server
python input_server.py
```
You should see: `✓ Virtual Xbox 360 Controller initialized!`

**Terminal 2 - Video Stream (Optional):**
```powershell
cd server
python mjpeg_server.py
```

**Terminal 3 - Web Client:**
```powershell
cd client
npm run dev
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

## 📄 License

MIT License - Feel free to use for your portfolio!
