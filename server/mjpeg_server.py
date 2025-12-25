
import cv2
import numpy as np
import mss
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import time
import os
import json
import threading
from dotenv import load_dotenv

load_dotenv()
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('MJPEG_PORT', 8888))

# Performance settings - Configurable via environment variables or API
# Set these in .env file or as environment variables:
# MJPEG_TARGET_FPS=60
# MJPEG_QUALITY=95
# MJPEG_SCALE=1.0
# MJPEG_BUFFER_DELAY=0.01

# Runtime-configurable settings (thread-safe)
_settings_lock = threading.Lock()
_settings = {
    'target_fps': int(os.getenv('MJPEG_TARGET_FPS', 60)),
    'jpeg_quality': int(os.getenv('MJPEG_QUALITY', 95)),  # 1-100, higher = better quality
    'scale_factor': float(os.getenv('MJPEG_SCALE', 1.0)),  # 0.1-1.0, 1.0 = full resolution
    'buffer_delay': float(os.getenv('MJPEG_BUFFER_DELAY', 0.01))  # Additional delay in seconds
}

def get_settings():
    """Get current settings (thread-safe)"""
    with _settings_lock:
        return _settings.copy()

def update_settings(new_settings):
    """Update settings (thread-safe)"""
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

class MJPEGHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Disable logging for performance
    
    def _send_cors_headers(self):
        """Send CORS headers for API endpoints"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        # Handle config API endpoint
        if self.path == '/config':
            settings = get_settings()
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(settings).encode())
            return
        
        # Handle video stream endpoint
        if self.path != '/':
            self.send_error(404)
            return
        
        self.send_response(200)
        self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        
        # Get current settings
        settings = get_settings()
        jpeg_quality = settings['jpeg_quality']
        target_fps = settings['target_fps']
        scale_factor = settings['scale_factor']
        buffer_delay = settings['buffer_delay']
        
        # Fast JPEG encoding parameters (optimization disabled for speed)
        encode_param = [
            int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality,
            int(cv2.IMWRITE_JPEG_OPTIMIZE), 0  # Disable optimization for maximum speed
        ]
        frame_count = 0
        start_time = time.time()
        frame_time = 1.0 / target_fps
        
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            
            # Pre-calculate target dimensions for faster resize
            if scale_factor < 1.0:
                # Get monitor dimensions once
                temp_img = sct.grab(monitor)
                temp_frame = np.array(temp_img)
                h, w = temp_frame.shape[:2]
                target_w = int(w * scale_factor)
                target_h = int(h * scale_factor)
            else:
                target_w = None
                target_h = None
            
            # Settings check counter (only check every N frames to reduce locking overhead)
            settings_check_counter = 0
            settings_check_interval = 30  # Check every 30 frames
            
            while True:
                loop_start = time.time()
                
                try:
                    # Only check settings periodically to reduce lock overhead
                    if settings_check_counter % settings_check_interval == 0:
                        current_settings = get_settings()
                        # Update local vars if settings changed
                        if current_settings['jpeg_quality'] != jpeg_quality:
                            jpeg_quality = current_settings['jpeg_quality']
                            encode_param = [
                                int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality,
                                int(cv2.IMWRITE_JPEG_OPTIMIZE), 0  # Disable optimization for speed
                            ]
                        if current_settings['target_fps'] != target_fps:
                            target_fps = current_settings['target_fps']
                            frame_time = 1.0 / target_fps
                        if current_settings['scale_factor'] != scale_factor:
                            scale_factor = current_settings['scale_factor']
                            if scale_factor < 1.0:
                                temp_img = sct.grab(monitor)
                                temp_frame = np.array(temp_img)
                                h, w = temp_frame.shape[:2]
                                target_w = int(w * scale_factor)
                                target_h = int(h * scale_factor)
                            else:
                                target_w = None
                                target_h = None
                        current_buffer_delay = current_settings['buffer_delay']
                    
                    settings_check_counter += 1
                    
                    # Fast screen capture
                    img = sct.grab(monitor)
                    frame = np.array(img)
                    
                    # Convert BGRA to BGR (faster than cvtColor)
                    # Use view instead of copy when possible
                    frame = frame[:, :, :3]
                    
                    # Resize with fastest interpolation (INTER_NEAREST is fastest)
                    if scale_factor < 1.0 and target_w and target_h:
                        frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_NEAREST)
                    
                    # Encode JPEG (optimization disabled for speed)
                    success, jpeg = cv2.imencode('.jpg', frame, encode_param)
                    if not success:
                        continue
                    
                    # Send frame (optimized batch write - single operation is faster)
                    frame_data = jpeg.tobytes()
                    header = b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'
                    footer = b'\r\n'
                    self.wfile.write(header + frame_data + footer)
                    
                    frame_count += 1
                    
                    # Print FPS every 60 frames
                    if frame_count % 60 == 0:
                        elapsed = time.time() - start_time
                        fps = frame_count / elapsed
                        print(f"FPS: {fps:.1f}")
                    
                    # Frame limiter - only add buffer delay if explicitly set
                    elapsed = time.time() - loop_start
                    sleep_time = frame_time - elapsed
                    # Only add buffer delay if it's significant (> 0.001)
                    if current_buffer_delay > 0.001:
                        sleep_time += current_buffer_delay
                    if sleep_time > 0.001:  # Only sleep if significant time remaining
                        time.sleep(sleep_time)
                        
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    break
                except Exception as e:
                    print(f"Error: {e}")
                    break
    
    def do_POST(self):
        """Handle POST requests to update configuration"""
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


# Global server instance for control
httpd = None

def start_server():
    global httpd
    httpd = ThreadingHTTPServer((HOST, PORT), MJPEGHandler)
    settings = get_settings()
    print(f'=' * 50)
    print(f'  MJPEG Stream Server')
    print(f'=' * 50)
    print(f'  URL: http://{HOST}:{PORT}/')
    print(f'  Config API: http://{HOST}:{PORT}/config')
    print(f'  Target FPS: {settings["target_fps"]}')
    print(f'  Quality: {settings["jpeg_quality"]}%')
    print(f'  Scale: {int(settings["scale_factor"]*100)}%')
    print(f'  Buffer Delay: {settings["buffer_delay"]}s')
    print(f'\n  Configure via .env or web API:')
    print(f'    MJPEG_TARGET_FPS={settings["target_fps"]}')
    print(f'    MJPEG_QUALITY={settings["jpeg_quality"]}')
    print(f'    MJPEG_SCALE={settings["scale_factor"]}')
    print(f'    MJPEG_BUFFER_DELAY={settings["buffer_delay"]}')
    print(f'\nStreaming...')
    httpd.serve_forever()

def stop_server():
    global httpd
    if httpd:
        httpd.shutdown()
        httpd.server_close()
        httpd = None
        print("MJPEG Server stopped.")

def main():
    start_server()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        stop_server()
