
import cv2
import numpy as np
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import time
import os
import json
import threading
import sys
from dotenv import load_dotenv

# Try to use dxcam (faster), fallback to mss
try:
    import dxcam
    USE_DXCAM = True
    print("Using dxcam (DirectX) - faster capture")
except ImportError:
    import mss
    USE_DXCAM = False
    print("Using mss (fallback) - install dxcam for faster capture")

# Add parent directory to path for modular imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('MJPEG_PORT', 8888))

# Runtime-configurable settings (thread-safe)
_settings_lock = threading.Lock()
_settings = {
    'target_fps': int(os.getenv('MJPEG_TARGET_FPS', 60)),
    'jpeg_quality': int(os.getenv('MJPEG_QUALITY', 70)),
    'scale_factor': float(os.getenv('MJPEG_SCALE', 0.75)),
    'buffer_delay': float(os.getenv('MJPEG_BUFFER_DELAY', 0))
}

def get_settings():
    with _settings_lock:
        return _settings.copy()

def update_settings(new_settings):
    global _settings
    with _settings_lock:
        if 'target_fps' in new_settings:
            _settings['target_fps'] = max(1, min(120, int(new_settings['target_fps'])))
        if 'jpeg_quality' in new_settings:
            _settings['jpeg_quality'] = max(1, min(100, int(new_settings['jpeg_quality'])))
        if 'scale_factor' in new_settings:
            _settings['scale_factor'] = max(0.1, min(1.0, float(new_settings['scale_factor'])))
        if 'buffer_delay' in new_settings:
            _settings['buffer_delay'] = max(0.0, min(1.0, float(new_settings['buffer_delay'])))
        return _settings.copy()

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

# Global dxcam camera instance (reuse for performance)
_dxcam_camera = None

def get_dxcam_camera():
    global _dxcam_camera
    if _dxcam_camera is None and USE_DXCAM:
        _dxcam_camera = dxcam.create(output_color="BGR")
    return _dxcam_camera

class MJPEGHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Disable logging for performance
    
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        if self.path == '/config':
            settings = get_settings()
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(settings).encode())
            return
        
        if self.path != '/':
            self.send_error(404)
            return
        
        self.send_response(200)
        self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        
        settings = get_settings()
        jpeg_quality = settings['jpeg_quality']
        target_fps = settings['target_fps']
        scale_factor = settings['scale_factor']
        
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality]
        frame_count = 0
        start_time = time.time()
        frame_time = 1.0 / target_fps
        
        if USE_DXCAM:
            self._stream_dxcam(encode_param, frame_time, scale_factor, target_fps, jpeg_quality)
        else:
            self._stream_mss(encode_param, frame_time, scale_factor, target_fps, jpeg_quality)
    
    def _stream_dxcam(self, encode_param, frame_time, scale_factor, target_fps, jpeg_quality):
        camera = get_dxcam_camera()
        if camera is None:
            return
        
        frame_count = 0
        start_time = time.time()
        target_w = None
        target_h = None
        
        while True:
            loop_start = time.time()
            try:
                frame = camera.grab()
                if frame is None:
                    time.sleep(0.001)
                    continue
                
                # Calculate target size on first frame
                if target_w is None and scale_factor < 1.0:
                    h, w = frame.shape[:2]
                    target_w = int(w * scale_factor)
                    target_h = int(h * scale_factor)
                
                # Resize if needed
                if scale_factor < 1.0 and target_w:
                    frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
                
                # Encode JPEG
                success, jpeg = cv2.imencode('.jpg', frame, encode_param)
                if not success:
                    continue
                
                # Send frame
                frame_data = jpeg.tobytes()
                self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')
                
                frame_count += 1
                if frame_count % 60 == 0:
                    elapsed = time.time() - start_time
                    fps = frame_count / elapsed
                    print(f"FPS: {fps:.1f}")
                
                # Frame limiter
                elapsed = time.time() - loop_start
                sleep_time = frame_time - elapsed
                if sleep_time > 0.001:
                    time.sleep(sleep_time)
                    
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                break
            except Exception as e:
                print(f"Error: {e}")
                break
    
    def _stream_mss(self, encode_param, frame_time, scale_factor, target_fps, jpeg_quality):
        import mss
        frame_count = 0
        start_time = time.time()
        
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            target_w = None
            target_h = None
            
            if scale_factor < 1.0:
                temp_img = sct.grab(monitor)
                temp_frame = np.array(temp_img)
                h, w = temp_frame.shape[:2]
                target_w = int(w * scale_factor)
                target_h = int(h * scale_factor)
            
            while True:
                loop_start = time.time()
                try:
                    img = sct.grab(monitor)
                    frame = np.array(img)[:, :, :3]
                    
                    if scale_factor < 1.0 and target_w:
                        frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
                    
                    success, jpeg = cv2.imencode('.jpg', frame, encode_param)
                    if not success:
                        continue
                    
                    frame_data = jpeg.tobytes()
                    self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')
                    
                    frame_count += 1
                    if frame_count % 60 == 0:
                        fps = frame_count / (time.time() - start_time)
                        print(f"FPS: {fps:.1f}")
                    
                    elapsed = time.time() - loop_start
                    sleep_time = frame_time - elapsed
                    if sleep_time > 0.001:
                        time.sleep(sleep_time)
                        
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    break
                except Exception as e:
                    print(f"Error: {e}")
                    break
    
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
                self.send_header('Content-type', 'application/json')
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_error(404)

httpd = None

def start_server():
    global httpd
    httpd = ThreadingHTTPServer((HOST, PORT), MJPEGHandler)
    settings = get_settings()
    print(f'=' * 50)
    print(f'  MJPEG Stream Server ({"dxcam" if USE_DXCAM else "mss"})')
    print(f'=' * 50)
    print(f'  URL: http://{HOST}:{PORT}/')
    print(f'  Target FPS: {settings["target_fps"]}')
    print(f'  Quality: {settings["jpeg_quality"]}%')
    print(f'  Scale: {int(settings["scale_factor"]*100)}%')
    print(f'\nStreaming...')
    httpd.serve_forever()

def stop_server():
    global httpd, _dxcam_camera
    if httpd:
        httpd.shutdown()
        httpd.server_close()
        httpd = None
    if _dxcam_camera:
        del _dxcam_camera
        _dxcam_camera = None
    print("MJPEG Server stopped.")

if __name__ == '__main__':
    try:
        start_server()
    except KeyboardInterrupt:
        stop_server()
