# Portfolio Sprint Submission

**Batch:** SE12  
**Semester:** 4  
**Submission Deadline:** 27 December 2025 (11AM)

---

## Part A: Project Links

### 📁 GitHub Repository
> **Link:** [https://github.com/CheongChoonvai/Cloud-pc-Game-for-mobile](https://github.com/CheongChoonvai/Cloud-pc-Game-for-mobile)

---

### 🌐 Live Demo / Executable
> **Link:** [Download Instructions / Demo Link]

**How to Run:**
1. Clone the repository
2. Install dependencies (see README.md)
3. Run the Python server (`python server/input_server.py`)
4. Run the React client (`npm run dev` in client folder)
5. Connect from mobile device on same WiFi network

*(If you deploy to a hosting service, add the live URL here)*

---

### 🎬 Pitch Video
> **Link:** [https://youtu.be/YOUR_VIDEO_LINK](https://youtu.be/YOUR_VIDEO_LINK)

*(Upload a walkthrough video to YouTube/Google Drive and paste the link)*

---

## Part B: Individual Contribution

### 👤 Team Member
**Name:** Cheong Choonvai

---

### 🛠️ My Role

I developed a **Mobile Game Controller for PC Games** that transforms any smartphone into a wireless game controller to play PC games like Hogwarts Legacy over local WiFi. As the sole developer, I built the entire system from scratch, including:

- **Frontend (React):** Created the responsive mobile web application with virtual joysticks using nipplejs library, touch-enabled action buttons (A/B/X/Y, bumpers, triggers), D-pad controls, and real-time WebSocket communication
- **Backend (Python):** Implemented the WebSocket input server that receives mobile inputs and translates them to Xbox 360 controller signals using the vgamepad library and ViGEmBus driver
- **Video Streaming:** Built an MJPEG video streaming server using OpenCV and mss for optional game screen streaming to mobile devices
- **System Integration:** Designed the architecture to combine Xbox controller emulation with mouse control for camera movement, ensuring compatibility with games that support either input method

---

### 💻 My Code

**Key File: `server/input_server.py`** - WebSocket to Xbox Controller Bridge

```python
def handle_left_stick(x, y):
    """Handle movement stick - Xbox left stick"""
    # Invert Y so pushing UP on joystick = forward in game
    left_stick['x'] = max(-1.0, min(1.0, x))
    left_stick['y'] = max(-1.0, min(1.0, -y))  # Invert Y: up = forward
    if abs(x) > 0.1 or abs(y) > 0.1:
        print(f"Left Stick: x={x:.2f}, y={-y:.2f}")

def gamepad_update_thread():
    """Background thread to continuously update gamepad and mouse"""
    global gamepad_thread_running
    while gamepad_thread_running:
        if gamepad:
            try:
                gamepad.left_joystick_float(
                    x_value_float=left_stick['x'],
                    y_value_float=left_stick['y']
                )
                gamepad.right_joystick_float(
                    x_value_float=right_stick['x'],
                    y_value_float=right_stick['y']
                )
                gamepad.update()
            except Exception as e:
                print(f"Gamepad update error: {e}")
        time.sleep(0.016)  # ~60 FPS
```

**Key File: `client/src/components/AnalogStick.jsx`** - Touch Joystick Component

```jsx
managerRef.current.on('move', (evt, data) => {
  if (onMove && data.vector) {
    // nipplejs uses screen coords (up = negative Y)
    // Invert Y so up = positive (game standard)
    let x = data.vector.x;
    let y = -data.vector.y;  // Invert Y for game coordinates

    // Simple dead zone
    const deadZone = 0.1;
    const magnitude = Math.sqrt(x * x + y * y);

    if (magnitude < deadZone) {
      x = 0;
      y = 0;
    }
    onMove({ x, y, angle: data.angle?.degree || 0 });
  }
});
```

---

### 👥 Team Breakdown

**Individual Project**

I completed this project independently, handling all aspects of development including:
- System architecture design
- Frontend UI/UX development (React + CSS)
- Backend server implementation (Python)
- Xbox controller emulation integration
- Video streaming server
- Documentation and testing

---

## 🔧 Technologies Used

| Category | Technology |
|----------|------------|
| Frontend | React, Vite, nipplejs |
| Backend | Python, websockets, vgamepad |
| Streaming | OpenCV, mss (screen capture) |
| Protocol | WebSocket (real-time), MJPEG (video) |
| Driver | ViGEmBus (Xbox controller emulation) |

---

## ✨ Key Features

1. **📱 Mobile Virtual Gamepad** - Touch joysticks and buttons on phone
2. **🎮 Xbox Controller Emulation** - Games detect it as a real Xbox controller
3. **📺 Live Game Stream** - See the game on phone (optional)
4. **⚡ Low Latency** - WebSocket connection over local WiFi (~60 FPS updates)

---

*Document prepared by: Cheong Choonvai*  
*Project: Mobile Game Controller for PC Games*  
*Date: December 2025*
