
import cv2
import numpy as np
import time
import os
import json
import threading
import atexit
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from dotenv import load_dotenv

# Try to import dxcam
try:
    import dxcam
    DXCAM_AVAILABLE = True
except ImportError:
    DXCAM_AVAILABLE = False
    print("❌ DXCAM not found. Please run: pip install dxcam[cv2]")

load_dotenv()
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('MJPEG_PORT', 8888))

# Configuration
_settings_lock = threading.Lock()
_settings = {
    'target_fps': 60,
    'jpeg_quality': 50,
    'scale_factor': 0.75
}

# Global Camera Instance
_camera = None
_camera_lock = threading.Lock()

# Frame Broadcasting
_frame_lock = threading.Lock()
_latest_jpeg = None
_latest_frame_id = 0
_active_clients = 0
_broadcast_thread = None
_shutdown_event = threading.Event()

def get_settings():
    with _settings_lock:
        return _settings.copy()

def init_camera():
    global _camera
    with _camera_lock:
        if _camera is None and DXCAM_AVAILABLE:
            try:
                # Initialize DXCAM once
                # target_fps is set high to ensure we always have frames available
                _camera = dxcam.create(output_color="BGR")
                print("✓ Global DXCAM instance initialized")
                _camera.start(target_fps=120, video_mode=True)
                print("✓ Global DXCAM capture started")
            except Exception as e:
                print(f"❌ Failed to initialize global camera: {e}")

def cleanup_camera():
    global _camera
    _shutdown_event.set()
    with _camera_lock:
        if _camera:
            print("Stopping global camera...")
            try:
                _camera.stop()
                del _camera
            except:
                pass
            _camera = None

# Register cleanup on exit
atexit.register(cleanup_camera)

def broadcast_loop():
    """Background thread to capture and encode frames repeatedly"""
    global _latest_jpeg, _latest_frame_id
    
    print("✓ Broadcast loop started")
    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 50, int(cv2.IMWRITE_JPEG_OPTIMIZE), 0]
    
    while not _shutdown_event.is_set():
        # Pause if no clients to save CPU
        if _active_clients == 0:
            time.sleep(0.5)
            continue

        if _camera is None:
            init_camera()
            if _camera is None:
                time.sleep(1)
                continue

        try:
            # Get latest frame - non-blocking preferred
            frame = _camera.get_latest_frame()
            if frame is None:
                time.sleep(0.001)
                continue
            
            # Read settings
            settings = get_settings()
            
            # Resize
            scale = settings['scale_factor']
            if scale < 1.0:
                # Use faster interpolation for speed
                width = int(frame.shape[1] * scale)
                height = int(frame.shape[0] * scale)
                frame = cv2.resize(frame, (width, height), interpolation=cv2.INTER_NEAREST)
            
            # Encode
            encode_param[1] = settings['jpeg_quality']
            success, jpeg = cv2.imencode('.jpg', frame, encode_param)
            
            if success:
                with _frame_lock:
                    _latest_jpeg = jpeg.tobytes()
                    _latest_frame_id += 1
            
            # Rate limit slightly to match target FPS roughly
            # (Though HTTP clients pull at their own pace)
            target = settings['target_fps']
            if target > 0:
                time.sleep(1.0 / target)
                
        except Exception as e:
            print(f"Broadcast error: {e}")
            time.sleep(0.1)

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class MJPEGHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        """Handle POST requests to update configuration"""
        if self.path == '/config':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                new_settings = json.loads(post_data.decode('utf-8'))
                
                with _settings_lock:
                    if 'target_fps' in new_settings:
                        _settings['target_fps'] = int(new_settings['target_fps'])
                    if 'jpeg_quality' in new_settings:
                        _settings['jpeg_quality'] = int(new_settings['jpeg_quality'])
                    if 'scale_factor' in new_settings:
                        _settings['scale_factor'] = float(new_settings['scale_factor'])
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(get_settings()).encode())
                
                print(f"Settings updated: {get_settings()}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_error(404)

    def do_GET(self):
        global _active_clients
        
        if self.path == '/config':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(get_settings()).encode())
            return
        
        if self.path != '/':
            self.send_error(404)
            return
            
        self.send_response(200)
        self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        
        _active_clients += 1
        last_sent_id = -1
        
        try:
            while True:
                # Wait for new frame
                current_id = _latest_frame_id
                
                if current_id > last_sent_id:
                    with _frame_lock:
                        jpeg_bytes = _latest_jpeg
                    
                    if jpeg_bytes:
                        self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + 
                                       jpeg_bytes + b'\r\n')
                        last_sent_id = current_id
                else:
                    # Wait briefly for next frame to be encoded
                    time.sleep(0.005)
                    
        except Exception as e:
            # WinError 10053/10054 is normal when client disconnects
            if "10053" not in str(e) and "10054" not in str(e):
                print(f"Client stream error: {e}")
        finally:
            _active_clients -= 1

def start_server():
    if not DXCAM_AVAILABLE:
        return

    # Start the broadcast thread
    global _broadcast_thread
    _broadcast_thread = threading.Thread(target=broadcast_loop, daemon=True)
    _broadcast_thread.start()
        
    print(f'='*50)
    print(f'  FAST MJPEG Server (Hybrid/Broadcast Mode)')
    print(f'  URL: http://{HOST}:{PORT}/')
    print(f'='*50)
    
    server = ThreadingHTTPServer((HOST, PORT), MJPEGHandler)
    server.serve_forever()

if __name__ == '__main__':
    try:
        start_server()
    except KeyboardInterrupt:
        cleanup_camera()
