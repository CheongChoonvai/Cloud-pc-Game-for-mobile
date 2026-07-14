import asyncio
import websockets
import json
import os
import time
import threading
import socket
import qrcode
import sys
from dotenv import load_dotenv
from pynput.mouse import Controller as MouseController
from pynput.keyboard import Controller as KeyboardController, Key

# Add parent directory to path for modular imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Try to import vgamepad for virtual controller
try:
    import vgamepad as vg
    VGAMEPAD_AVAILABLE = True
except ImportError:
    VGAMEPAD_AVAILABLE = False
    print("WARNING: vgamepad not installed. Run: pip install vgamepad")

load_dotenv()
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('WS_PORT', 8765))
INPUT_MODE = os.getenv('INPUT_MODE', 'auto').strip().lower()

# Virtual Xbox controller
gamepad = None
mouse = MouseController()
keyboard = KeyboardController()
keyboard_keys_down = set()
controller_mode = 'keyboard'

def init_gamepad():
    global gamepad
    if VGAMEPAD_AVAILABLE:
        try:
            gamepad = vg.VX360Gamepad()
            print("✓ Virtual Xbox 360 Controller initialized!")
            return True
        except Exception as e:
            print(f"✗ Failed to create virtual gamepad: {e}")
            print("  Try installing ViGEmBus driver: https://github.com/ViGEm/ViGEmBus/releases")
            return False
    return False


def use_keyboard_fallback():
    return INPUT_MODE in {'keyboard', 'both'} or not VGAMEPAD_AVAILABLE or gamepad is None


def keyboard_key(name):
    key_map = {
        'SPACE': Key.space,
        'SHIFT': Key.shift,
        'CTRL': Key.ctrl,
        'ALT': Key.alt,
        'ENTER': Key.enter,
        'ESC': Key.esc,
        'TAB': Key.tab,
        'BACKSPACE': Key.backspace,
        'UP': Key.up,
        'DOWN': Key.down,
        'LEFT': Key.left,
        'RIGHT': Key.right,
    }
    return key_map.get(name.upper(), name.lower())


def set_keyboard_key(name, pressed):
    key_name = name.upper()
    key = keyboard_key(key_name)
    if pressed and key_name not in keyboard_keys_down:
        keyboard.press(key)
        keyboard_keys_down.add(key_name)
    elif not pressed and key_name in keyboard_keys_down:
        keyboard.release(key)
        keyboard_keys_down.discard(key_name)


def release_all_keyboard_keys():
    for key_name in list(keyboard_keys_down):
        try:
            keyboard.release(keyboard_key(key_name))
        except Exception:
            pass
    keyboard_keys_down.clear()

# Stick state for continuous updates
left_stick = {'x': 0.0, 'y': 0.0}
right_stick = {'x': 0.0, 'y': 0.0}  # For mouse movement
gamepad_thread_running = True
mouse_sensitivity = 20  # Pixels per update at max stick deflection

def gamepad_update_thread():
    """Background thread to continuously update gamepad and mouse"""
    global gamepad_thread_running
    while gamepad_thread_running:
        # Update Xbox controller sticks
        if gamepad:
            try:
                # Left stick (movement)
                gamepad.left_joystick_float(
                    x_value_float=left_stick['x'],
                    y_value_float=left_stick['y']
                )
                # Right stick (camera) - also send to virtual controller
                gamepad.right_joystick_float(
                    x_value_float=right_stick['x'],
                    y_value_float=right_stick['y']
                )
                gamepad.update()
            except Exception as e:
                print(f"Gamepad update error: {e}")
        
        # Also move mouse for right stick (backup camera control)
        if right_stick['x'] != 0 or right_stick['y'] != 0:
            dx = int(right_stick['x'] * mouse_sensitivity)
            dy = int(right_stick['y'] * mouse_sensitivity)
            if dx != 0 or dy != 0:
                mouse.move(dx, dy)
        
        time.sleep(0.016)  # ~60 FPS

def handle_left_stick(x, y):
    """Handle movement stick - Xbox left stick"""
    # Invert Y so pushing UP on joystick = forward in game
    left_stick['x'] = max(-1.0, min(1.0, x))
    left_stick['y'] = max(-1.0, min(1.0, -y))  # Invert Y: up = forward
    if use_keyboard_fallback():
        threshold = 0.35
        release_threshold = 0.2
        set_keyboard_key('W', left_stick['y'] > threshold)
        set_keyboard_key('S', left_stick['y'] < -threshold)
        set_keyboard_key('A', left_stick['x'] < -threshold)
        set_keyboard_key('D', left_stick['x'] > threshold)
        if abs(left_stick['y']) < release_threshold:
            set_keyboard_key('W', False)
            set_keyboard_key('S', False)
        if abs(left_stick['x']) < release_threshold:
            set_keyboard_key('A', False)
            set_keyboard_key('D', False)
    if abs(x) > 0.1 or abs(y) > 0.1:
        print(f"Left Stick: x={x:.2f}, y={-y:.2f}")

def handle_right_stick(x, y):
    """Handle camera stick - Xbox right stick + Mouse"""
    right_stick['x'] = max(-1.0, min(1.0, x))
    right_stick['y'] = max(-1.0, min(1.0, y))  # Non-inverted Y: Up = Up (Negative delta for mouse)
    if abs(x) > 0.1 or abs(y) > 0.1:
        print(f"Right Stick: x={x:.2f}, y={y:.2f}")

# Button mapping to Xbox 360 buttons
BUTTON_MAP = {}
if VGAMEPAD_AVAILABLE:
    BUTTON_MAP = {
        'A': vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
        'B': vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
        'X': vg.XUSB_BUTTON.XUSB_GAMEPAD_X,
        'Y': vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
        'LB': vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
        'RB': vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
        'START': vg.XUSB_BUTTON.XUSB_GAMEPAD_START,
        'SELECT': vg.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
        'D_UP': vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP,
        'D_DOWN': vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN,
        'D_LEFT': vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT,
        'D_RIGHT': vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT,
    }

DPAD_TO_BUTTON = {
    'up': 'D_UP',
    'down': 'D_DOWN',
    'left': 'D_LEFT',
    'right': 'D_RIGHT',
    # Also support uppercase (from Android app)
    'UP': 'D_UP',
    'DOWN': 'D_DOWN',
    'LEFT': 'D_LEFT',
    'RIGHT': 'D_RIGHT',
}

def handle_button(button, pressed):
    """Handle button press/release"""
    if use_keyboard_fallback():
        keyboard_map = {
            'A': 'SPACE',
            'B': 'SHIFT',
            'X': 'E',
            'Y': 'Q',
            'LB': 'R',
            'RB': 'F',
            'LT': '1',
            'RT': '2',
            'START': 'ENTER',
            'SELECT': 'ESC',
            'D_UP': 'UP',
            'D_DOWN': 'DOWN',
            'D_LEFT': 'LEFT',
            'D_RIGHT': 'RIGHT',
        }
        key_name = keyboard_map.get(button)
        if key_name:
            set_keyboard_key(key_name, pressed)
            print(f"Keyboard {button}: {'Pressed' if pressed else 'Released'}")
        return

    if not gamepad:
        print(f"Button {button}: {'Pressed' if pressed else 'Released'} (no gamepad)")
        return
    
    # Handle triggers separately (they are analog)
    if button == 'LT':
        value = 255 if pressed else 0
        gamepad.left_trigger(value=value)
        print(f"LT: {value}")
        gamepad.update()
        return
    
    if button == 'RT':
        value = 255 if pressed else 0
        gamepad.right_trigger(value=value)
        print(f"RT: {value}")
        gamepad.update()
        return
    
    # Regular buttons
    xbox_button = BUTTON_MAP.get(button)
    if xbox_button:
        if pressed:
            gamepad.press_button(button=xbox_button)
            print(f"Button {button}: Pressed")
        else:
            gamepad.release_button(button=xbox_button)
            print(f"Button {button}: Released")
        gamepad.update()

def handle_dpad(direction, pressed):
    """Handle D-pad"""
    button = DPAD_TO_BUTTON.get(direction)
    if button:
        handle_button(button, pressed)

def reset_gamepad():
    """Reset all gamepad inputs to neutral"""
    global left_stick, right_stick
    left_stick = {'x': 0.0, 'y': 0.0}
    right_stick = {'x': 0.0, 'y': 0.0}
    release_all_keyboard_keys()
    
    if gamepad:
        gamepad.reset()
        gamepad.update()

async def handler(websocket, path=None):
    """Handle WebSocket connections"""
    client_ip = websocket.remote_address[0] if websocket.remote_address else 'unknown'
    print(f"Client connected: {client_ip}")
    try:
        await websocket.send(json.dumps({
            'type': 'status',
            'controllerMode': 'keyboard' if use_keyboard_fallback() else 'xinput',
            'gamepadReady': bool(gamepad),
            'keyboardFallback': use_keyboard_fallback(),
        }))
    except Exception:
        pass
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get('type')
                
                if msg_type == 'left_stick':
                    x = float(data.get('x', 0))
                    y = float(data.get('y', 0))
                    handle_left_stick(x, y)
                
                elif msg_type == 'right_stick':
                    x = float(data.get('x', 0))
                    y = float(data.get('y', 0))
                    handle_right_stick(x, y)
                
                elif msg_type == 'button':
                    button = data.get('button')
                    pressed = data.get('pressed', False)
                    handle_button(button, pressed)
                
                elif msg_type == 'dpad':
                    direction = data.get('direction')
                    pressed = data.get('pressed', False)
                    handle_dpad(direction, pressed)
                    
            except json.JSONDecodeError:
                print(f"Invalid JSON: {message}")
            except Exception as e:
                print(f"Error handling message: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {client_ip}")
    finally:
        reset_gamepad()
        print(f"Cleanup completed for: {client_ip}")

def get_server_info():
    """Get local IP and generate connection data"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        
        return {
            "ip": local_ip,
            "port": PORT,
            "mjpeg_port": int(os.getenv('MJPEG_PORT', 8080))
        }
    except Exception as e:
        print(f"Error getting server info: {e}")
        return None

def get_qr_image():
    """Generate QR code as a PIL image"""
    info = get_server_info()
    if info:
        # Generate URL instead of JSON
        # Assumes client is running on port 5173 (Vite default)
        url = f"http://{info['ip']}:5173"
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(url)
        qr.make(fit=True)
        return qr.make_image(fill_color="black", back_color="white"), info
    return None, None

async def main():
    global gamepad_thread_running, controller_mode
    
    print("=" * 50)
    print("  Mobile Gamepad Server (Hybrid Mode)")
    print("=" * 50)
    
    # Initialize virtual gamepad
    gamepad_ok = init_gamepad()
    if gamepad_ok and INPUT_MODE != 'keyboard':
        controller_mode = 'xinput'
    else:
        controller_mode = 'keyboard'

    if not gamepad_ok:
        print("\n⚠ Running without virtual gamepad!")
        print("  Buttons/Left stick won't work in games.")
        print("  Install ViGEmBus driver from:")
        print("  https://github.com/ViGEm/ViGEmBus/releases")
        print("  Falling back to keyboard mode.")
    elif INPUT_MODE == 'keyboard':
        print("\n⚠ INPUT_MODE=keyboard forced in .env")
        print("  Using keyboard fallback instead of ViGEmBus.")
    
    print("\n✓ Mouse control enabled for camera (Right Stick)")
    print("  Version: v2 (Mouse Up-Down Fixed)")
    print(f"  Input mode: {controller_mode}")
    
    # Start update thread
    update_thread = threading.Thread(target=gamepad_update_thread, daemon=True)
    update_thread.start()
    
    server_info = get_server_info()
    print(f"\nListening on ws://{HOST}:{PORT}")
    if server_info:
        print(f"Server IP: {server_info['ip']}")
        
        # Print ASCII QR
        url = f"http://{server_info['ip']}:5173"
        qr = qrcode.QRCode(version=1, box_size=1, border=2)
        qr.add_data(url)
        qr.make(fit=True)
        print(f"\nScan this QR to open App (http://{server_info['ip']}:5173):")
        qr.print_ascii(tty=True)

    print("\nControl Mapping:")
    print("  Left Stick:  Xbox Left Stick (Movement)")
    print("  Right Stick: MOUSE (Camera) ← Works without ViGEmBus!")
    print("  A/B/X/Y:     Xbox Buttons")
    print("  LB/RB:       Xbox Shoulders")
    print("  LT/RT:       Xbox Triggers")
    print("  D-Pad:       Xbox D-Pad")
    print("  Start:       Xbox Start")
    print("  Select:      Xbox Back")
    print("\nWaiting for connections...")
    
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        gamepad_thread_running = False
        print("\nServer stopped.")
