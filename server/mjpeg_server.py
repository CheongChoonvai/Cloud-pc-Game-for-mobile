
import cv2
import numpy as np
import mss
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import time
import os
from dotenv import load_dotenv

load_dotenv()
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('MJPEG_PORT', 8888))

# Performance settings
TARGET_FPS = 60
JPEG_QUALITY = 50  # Lower = faster (30-70 recommended)
SCALE_FACTOR = 0.5  # 0.5 = half resolution for faster streaming

class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class MJPEGHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Disable logging for performance
    
    def do_GET(self):
        if self.path != '/':
            self.send_error(404)
            return
        
        self.send_response(200)
        self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]
        frame_count = 0
        start_time = time.time()
        frame_time = 1.0 / TARGET_FPS
        
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            
            while True:
                loop_start = time.time()
                
                try:
                    # Fast screen capture
                    img = sct.grab(monitor)
                    frame = np.array(img)
                    
                    # Convert BGRA to BGR (faster than cvtColor for some cases)
                    frame = frame[:, :, :3]
                    
                    # Downscale for speed
                    if SCALE_FACTOR < 1.0:
                        h, w = frame.shape[:2]
                        new_w = int(w * SCALE_FACTOR)
                        new_h = int(h * SCALE_FACTOR)
                        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_NEAREST)
                    
                    # Encode JPEG
                    _, jpeg = cv2.imencode('.jpg', frame, encode_param)
                    
                    # Send frame
                    self.wfile.write(b'--frame\r\n')
                    self.wfile.write(b'Content-Type: image/jpeg\r\n\r\n')
                    self.wfile.write(jpeg.tobytes())
                    self.wfile.write(b'\r\n')
                    
                    frame_count += 1
                    
                    # Print FPS every 60 frames
                    if frame_count % 60 == 0:
                        elapsed = time.time() - start_time
                        fps = frame_count / elapsed
                        print(f"FPS: {fps:.1f}")
                    
                    # Frame limiter
                    elapsed = time.time() - loop_start
                    if elapsed < frame_time:
                        time.sleep(frame_time - elapsed)
                        
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    break
                except Exception as e:
                    print(f"Error: {e}")
                    break

def main():
    server = ThreadingHTTPServer((HOST, PORT), MJPEGHandler)
    print(f'=' * 50)
    print(f'  MJPEG Stream Server')
    print(f'=' * 50)
    print(f'  URL: http://{HOST}:{PORT}/')
    print(f'  Target FPS: {TARGET_FPS}')
    print(f'  Quality: {JPEG_QUALITY}%')
    print(f'  Scale: {int(SCALE_FACTOR*100)}%')
    print(f'\nStreaming...')
    server.serve_forever()

if __name__ == '__main__':
    main()
