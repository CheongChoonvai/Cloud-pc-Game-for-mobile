# 📖 Code Walkthrough Guide
## Mobile Game Controller Project - Key Code Sections

---

## 🎯 Quick Reference

This document provides a quick reference to the most important code sections in the project, explaining what each part does and how they work together.

---

## 1️⃣ Server - Input Server (`server/input_server.py`)

### 📌 Initialization & Setup

**Lines 1-27: Imports and Global Setup**
```python
import asyncio
import websockets
import json
from pynput.mouse import Controller as MouseController

try:
    import vgamepad as vg
    VGAMEPAD_AVAILABLE = True
except ImportError:
    VGAMEPAD_AVAILABLE = False
    print("WARNING: vgamepad not installed")

load_dotenv()
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('WS_PORT', 8765))

gamepad = None
mouse = MouseController()
```

**What it does:**
- Imports required libraries for WebSocket, JSON, mouse control, and gamepad emulation
- Tries to import `vgamepad` (gracefully handles if not installed)
- Loads environment variables for host and port configuration
- Initializes global variables for gamepad and mouse controllers

---

### 📌 Virtual Gamepad Initialization

**Lines 28-39: `init_gamepad()` Function**
```python
def init_gamepad():
    global gamepad
    if not VGAMEPAD_AVAILABLE:
        print("⚠ vgamepad not available")
        return False
    
    try:
        gamepad = vg.VX360Gamepad()
        print("✓ Virtual Xbox 360 Controller initialized!")
        return True
    except Exception as e:
        print(f"✗ Failed to create virtual gamepad: {e}")
        return False
```

**What it does:**
- Creates a virtual Xbox 360 controller using ViGEmBus
- Returns True if successful, False otherwise
- This controller is visible to Windows and all games

**How it works:**
- `vg.VX360Gamepad()` creates a virtual controller instance
- ViGEmBus driver (must be installed) creates the virtual device
- Windows sees it as a real USB Xbox 360 controller

---

### 📌 Background Update Thread

**Lines 47-75: Continuous Gamepad Update**
```python
left_stick = {'x': 0.0, 'y': 0.0}
right_stick = {'x': 0.0, 'y': 0.0}
gamepad_thread_running = True

def gamepad_update_thread():
    global gamepad_thread_running
    while gamepad_thread_running:
        try:
            if gamepad:
                # Update left stick (movement)
                gamepad.left_joystick_float(
                    x_value_float=left_stick['x'], 
                    y_value_float=left_stick['y']
                )
                gamepad.update()
            
            # Mouse movement from right stick
            if abs(right_stick['x']) > 0.1 or abs(right_stick['y']) > 0.1:
                dx = int(right_stick['x'] * mouse_sensitivity)
                dy = int(right_stick['y'] * mouse_sensitivity)
                mouse.move(dx, dy)
            
            time.sleep(0.01)  # 100Hz update rate
        except Exception as e:
            print(f"Update error: {e}")
```

**What it does:**
- Runs in a background thread at 100Hz (every 10ms)
- Continuously updates the virtual controller with latest stick positions
- Also handles mouse movement from the right stick

**Why this is needed:**
- WebSocket messages are asynchronous and may not arrive at consistent intervals
- Games expect smooth, continuous controller input
- The 100Hz update ensures the game always has fresh input data
- Without this, joystick movement would be choppy

---

### 📌 Input Handlers

**Lines 77-90: Left Stick Handler**
```python
def handle_left_stick(x, y):
    global left_stick
    # Clamp values between -1 and 1
    left_stick['x'] = max(-1.0, min(1.0, x))
    left_stick['y'] = max(-1.0, min(1.0, -y))  # Invert Y-axis
```

**What it does:**
- Receives joystick coordinates from mobile client
- Clamps values to valid range (-1.0 to 1.0)
- Inverts Y-axis (mobile touch Y goes down, Xbox Y goes up)
- Stores in global variable for background thread to use

---

**Lines 117-147: Button Handler**
```python
BUTTON_MAP = {
    'A': vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
    'B': vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
    'X': vg.XUSB_BUTTON.XUSB_GAMEPAD_X,
    'Y': vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
    'LB': vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
    'RB': vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
    # ... more buttons
}

def handle_button(button, pressed):
    if not gamepad:
        return
    
    if button in BUTTON_MAP:
        try:
            if pressed:
                gamepad.press_button(button=BUTTON_MAP[button])
            else:
                gamepad.release_button(button=BUTTON_MAP[button])
            gamepad.update()
        except Exception as e:
            print(f"Button error: {e}")
    elif button in ['LT', 'RT']:
        # Triggers are analog (0.0 to 1.0)
        value = 1.0 if pressed else 0.0
        if button == 'LT':
            gamepad.left_trigger_float(value_float=value)
        else:
            gamepad.right_trigger_float(value_float=value)
        gamepad.update()
```

**What it does:**
- Maps mobile button names ('A', 'B', etc.) to Xbox button constants
- Handles both digital buttons (A/B/X/Y) and analog triggers (LT/RT)
- Presses or releases buttons on the virtual controller
- Calls `gamepad.update()` to send changes to Windows

---

### 📌 WebSocket Message Handler

**Lines 165-205: Main WebSocket Handler**
```python
async def handler(websocket, path=None):
    print(f"✓ Client connected from {websocket.remote_address}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get('type')
                
                if msg_type == 'left_stick':
                    handle_left_stick(data['x'], data['y'])
                
                elif msg_type == 'right_stick':
                    handle_right_stick(data['x'], data['y'])
                
                elif msg_type == 'button':
                    handle_button(data['button'], data['pressed'])
                
                elif msg_type == 'trigger':
                    handle_trigger(data['trigger'], data['value'])
                
                elif msg_type == 'dpad':
                    handle_dpad(data['direction'], data['pressed'])
                
            except json.JSONDecodeError:
                print("Invalid JSON received")
            except Exception as e:
                print(f"Error processing message: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        print("✗ Client disconnected")
    finally:
        # Reset controller when client disconnects
        reset_gamepad()
```

**What it does:**
- Accepts WebSocket connections from mobile clients
- Continuously listens for messages using `async for`
- Parses JSON messages and routes to appropriate handlers
- Handles disconnections gracefully and resets the controller

**Message format examples:**
```json
{"type": "left_stick", "x": 0.5, "y": -0.8}
{"type": "button", "button": "A", "pressed": true}
{"type": "trigger", "trigger": "RT", "value": 0.7}
```

---

### 📌 Server Startup

**Lines 237-283: Main Function**
```python
async def main():
    # Initialize virtual controller
    init_success = init_gamepad()
    
    # Start background update thread
    update_thread = threading.Thread(target=gamepad_update_thread, daemon=True)
    update_thread.start()
    
    # Get local IP and display connection info
    server_info = get_server_info()
    print(f"WebSocket server running on ws://{HOST}:{PORT}")
    print(f"Connect from: http://{server_info['ip']}:5173")
    
    # Display QR code for easy mobile connection
    get_qr_image()
    
    # Start WebSocket server
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()  # Run forever

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        gamepad_thread_running = False
        print("\nServer stopped.")
```

**What it does:**
- Initializes the virtual gamepad
- Starts the background update thread
- Displays connection information and QR code
- Starts the WebSocket server
- Runs forever until Ctrl+C

---

## 2️⃣ Server - MJPEG Server (`server/mjpeg_server.py`)

### 📌 Configuration & Settings

**Lines 17-31: Performance Settings**
```python
_settings = {
    'target_fps': int(os.getenv('MJPEG_TARGET_FPS', 60)),
    'jpeg_quality': int(os.getenv('MJPEG_QUALITY', 95)),  # 1-100
    'scale_factor': float(os.getenv('MJPEG_SCALE', 1.0)),  # 0.1-1.0
    'buffer_delay': float(os.getenv('MJPEG_BUFFER_DELAY', 0.01))
}
```

**What it does:**
- Defines configurable streaming parameters
- Can be set via environment variables or API
- Thread-safe using locks for runtime updates

**Settings explained:**
- `target_fps`: Frame rate to aim for (default 60)
- `jpeg_quality`: JPEG compression quality (higher = better image, larger size)
- `scale_factor`: Resolution scaling (0.5 = 50% resolution, faster streaming)
- `buffer_delay`: Additional delay between frames (for rate limiting)

---

### 📌 Screen Capture & Streaming

**Lines 71-203: Main Streaming Handler**
```python
def do_GET(self):
    # Send HTTP headers for MJPEG stream
    self.send_response(200)
    self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
    self.send_header('Cache-Control', 'no-cache')
    self.end_headers()
    
    # Get current settings
    settings = get_settings()
    jpeg_quality = settings['jpeg_quality']
    target_fps = settings['target_fps']
    scale_factor = settings['scale_factor']
    
    # JPEG encoding parameters
    encode_param = [
        int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality,
        int(cv2.IMWRITE_JPEG_OPTIMIZE), 0  # Disable for speed
    ]
    
    frame_time = 1.0 / target_fps
    
    with mss.mss() as sct:
        monitor = sct.monitors[1]  # Primary monitor
        
        while True:
            loop_start = time.time()
            
            # Capture screen
            img = sct.grab(monitor)
            frame = np.array(img)
            
            # Convert BGRA to BGR
            frame = frame[:, :, :3]
            
            # Resize if needed
            if scale_factor < 1.0:
                frame = cv2.resize(frame, (target_w, target_h), 
                                  interpolation=cv2.INTER_NEAREST)
            
            # Encode as JPEG
            success, jpeg = cv2.imencode('.jpg', frame, encode_param)
            if not success:
                continue
            
            # Send frame over HTTP
            frame_data = jpeg.tobytes()
            header = b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'
            footer = b'\r\n'
            self.wfile.write(header + frame_data + footer)
            
            # Frame rate limiting
            elapsed = time.time() - loop_start
            sleep_time = frame_time - elapsed
            if sleep_time > 0.001:
                time.sleep(sleep_time)
```

**What it does:**
1. Sets up HTTP response headers for MJPEG streaming
2. Captures the screen using `mss` (very fast)
3. Converts color format from BGRA to BGR
4. Optionally scales down for better performance
5. Encodes as JPEG using OpenCV
6. Sends JPEG over HTTP with MJPEG boundaries
7. Limits frame rate to target FPS

**Performance optimizations:**
- `mss` is faster than PIL or Windows API for screen capture
- `INTER_NEAREST` interpolation is faster than `INTER_LINEAR`
- JPEG optimization disabled for faster encoding
- Single batch write instead of multiple writes

---

### 📌 Runtime Configuration API

**Lines 205-230: POST Handler for Settings**
```python
def do_POST(self):
    if self.path == '/config':
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            new_settings = json.loads(post_data.decode('utf-8'))
            
            updated_settings = update_settings(new_settings)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(updated_settings).encode())
            
            print(f"Settings updated: {updated_settings}")
        except Exception as e:
            self.send_response(400)
```

**What it does:**
- Provides a REST API to update streaming settings on-the-fly
- No need to restart server to change quality, FPS, or resolution
- Useful for optimizing based on network conditions

**Example usage:**
```bash
curl -X POST http://localhost:8888/config \
  -H "Content-Type: application/json" \
  -d '{"target_fps": 30, "scale_factor": 0.5}'
```

---

## 3️⃣ Client - React App (`client/src/App.jsx`)

### 📌 WebSocket Connection

**Lines 6-42: Main App Component**
```jsx
function App() {
  const [wsStatus, setWsStatus] = useState('disconnected');
  const wsRef = useRef(null);

  useEffect(() => {
    const wsUrl = `ws://${SERVER_IP}:${WS_PORT}`;
    console.log('Connecting to:', wsUrl);

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsStatus('connected');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsStatus('disconnected');
        // Auto-reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsStatus('error');
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="app-container">
      <GamepadController
        wsRef={wsRef}
        serverStatus={wsStatus}
        serverIP={SERVER_IP}
        mjpegPort={MJPEG_PORT}
      />
    </div>
  );
}
```

**What it does:**
- Manages WebSocket connection lifecycle
- Connects to server on component mount
- Auto-reconnects on disconnection
- Passes WebSocket instance to child components

**React concepts used:**
- `useState`: Track connection status
- `useRef`: Store WebSocket without causing re-renders
- `useEffect`: Setup connection when component mounts
- Cleanup function: Close WebSocket when unmounting

---

## 4️⃣ Client - Gamepad Controller (`client/src/components/GamepadController.jsx`)

### 📌 Joystick Setup

```jsx
// Left joystick for movement
useEffect(() => {
  const manager = nipplejs.create({
    zone: leftStickRef.current,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: 'rgba(255, 255, 255, 0.5)',
    size: 150,
  });

  manager.on('move', (evt, data) => {
    const x = data.vector.x;
    const y = data.vector.y;
    
    sendInput({
      type: 'left_stick',
      x: x,
      y: y
    });
  });

  manager.on('end', () => {
    sendInput({
      type: 'left_stick',
      x: 0,
      y: 0
    });
  });

  return () => manager.destroy();
}, []);
```

**What it does:**
- Creates a virtual joystick using nipplejs
- Sends stick position on `move` event
- Resets to center on `end` event (finger released)
- Cleans up on unmount

**nipplejs data structure:**
```javascript
data = {
  vector: { x: 0.5, y: -0.8 },  // Normalized direction
  angle: { radian: 1.2, degree: 68.7 },
  distance: 120,  // Pixels from center
  force: 0.8  // How far pushed (0-1)
}
```

---

### 📌 Button Handling

```jsx
const handleButtonPress = (button) => {
  sendInput({
    type: 'button',
    button: button,
    pressed: true
  });
};

const handleButtonRelease = (button) => {
  sendInput({
    type: 'button',
    button: button,
    pressed: false
  });
};

// Usage in JSX
<button
  onTouchStart={() => handleButtonPress('A')}
  onTouchEnd={() => handleButtonRelease('A')}
  className="button-a"
>
  A
</button>
```

**What it does:**
- Handles touch events for each button
- Sends press/release messages to server
- Touch events are better than click for mobile

**Why touchStart/touchEnd instead of onClick:**
- `onClick` has 300ms delay on mobile
- Touch events are instant and support multi-touch
- Critical for responsive gaming controls

---

### 📌 Video Stream Display

```jsx
const videoUrl = `http://${serverIP}:${mjpegPort}/`;

<div className="video-container">
  <img 
    src={videoUrl} 
    alt="Game Stream" 
    className="game-stream"
  />
</div>
```

**What it does:**
- Displays MJPEG stream in an `<img>` tag
- Browsers automatically handle MJPEG multipart stream
- No JavaScript needed for video decoding

**Why `<img>` instead of `<video>`:**
- MJPEG is not a video codec, it's a stream of images
- `<img>` tags natively support multipart/x-mixed-replace
- Simpler and lower latency than video elements

---

## 🔄 Complete Data Flow Example

Let's trace what happens when you move the joystick:

### 1. User touches joystick on phone
```jsx
// In GamepadController.jsx
manager.on('move', (evt, data) => {
  const x = data.vector.x;  // e.g., 0.5
  const y = data.vector.y;  // e.g., -0.8
```

### 2. Client sends WebSocket message
```jsx
sendInput({
  type: 'left_stick',
  x: 0.5,
  y: -0.8
});

// This serializes to JSON and sends over WebSocket:
ws.send('{"type":"left_stick","x":0.5,"y":-0.8}')
```

### 3. Server receives message
```python
# In input_server.py handler()
async for message in websocket:
    data = json.loads(message)
    # data = {'type': 'left_stick', 'x': 0.5, 'y': -0.8}
    
    if msg_type == 'left_stick':
        handle_left_stick(data['x'], data['y'])
```

### 4. Server updates global state
```python
def handle_left_stick(x, y):
    global left_stick
    left_stick['x'] = 0.5
    left_stick['y'] = 0.8  # Inverted from -0.8
```

### 5. Background thread updates gamepad
```python
# Running every 10ms
def gamepad_update_thread():
    while True:
        gamepad.left_joystick_float(
            x_value_float=0.5,   # Read from global
            y_value_float=0.8
        )
        gamepad.update()  # Send to ViGEmBus
        time.sleep(0.01)
```

### 6. ViGEmBus updates virtual controller
```
vgamepad → ViGEmBus driver → Virtual USB device
```

### 7. Windows processes input
```
Windows HID stack → Game receives DirectInput/XInput
```

### 8. Game character moves
```
Game reads: Left stick at (0.5, 0.8)
Game logic: Move character northeast
```

**Total time: ~20-30ms from touch to character movement**

---

## 🎯 Key Takeaways

### ✅ Important Design Decisions

1. **Background Update Thread**
   - Why: Games need smooth, continuous input
   - Without it: Choppy, delayed movement
   
2. **Y-Axis Inversion**
   - Why: Touch coordinates go down, game coordinates go up
   - Critical for correct movement direction

3. **100Hz Update Rate**
   - Why: Higher than typical game polling (60Hz)
   - Ensures no dropped frames

4. **Auto-Reconnect**
   - Why: WiFi connections can drop
   - Better UX than requiring manual refresh

5. **Touch Events vs Click**
   - Why: Lower latency on mobile
   - Essential for responsive controls

---

## 🐛 Common Issues & Solutions

### Issue 1: "Joystick movement is inverted"
**Solution:** Check Y-axis inversion in `handle_left_stick()`
```python
left_stick['y'] = max(-1.0, min(1.0, -y))  # Note the minus sign
```

### Issue 2: "Buttons don't work but joystick does"
**Solution:** ViGEmBus not installed or gamepad not initialized
```python
# Check this prints success
init_gamepad()  # Should print "✓ Virtual Xbox 360 Controller initialized!"
```

### Issue 3: "Laggy or choppy movement"
**Solution:** Check update thread is running
```python
# Make sure this thread is started
update_thread = threading.Thread(target=gamepad_update_thread, daemon=True)
update_thread.start()
```

### Issue 4: "Can't connect from phone"
**Solution:** Check firewall and network
- Both devices on same WiFi
- Windows Firewall allows Python
- Correct IP address in `client/.env`

---

**END OF CODE WALKTHROUGH**
