# Screen capture module
import cv2
import numpy as np
import mss
import threading
import time
from typing import Optional, Tuple
from dataclasses import dataclass

from config.settings import settings


@dataclass
class Frame:
    """Represents a captured frame"""
    data: np.ndarray
    timestamp: float
    width: int
    height: int


class ScreenCapture:
    """High-performance screen capture with buffering"""
    
    def __init__(self, monitor_index: int = None, scale_factor: float = None):
        self.monitor_index = monitor_index or settings.monitor_index
        self.scale_factor = scale_factor or settings.scale_factor
        self.sct = None
        self.monitor = None
        self._lock = threading.Lock()
        self._running = False
        self._latest_frame: Optional[Frame] = None
        self._capture_thread: Optional[threading.Thread] = None
        
    def start(self) -> None:
        """Initialize screen capture"""
        self.sct = mss.mss()
        self.monitor = self.sct.monitors[self.monitor_index]
        
        # Pre-calculate dimensions
        self.target_width = int(self.monitor['width'] * self.scale_factor)
        self.target_height = int(self.monitor['height'] * self.scale_factor)
        
        print(f"Screen capture initialized:")
        print(f"  Monitor: {self.monitor_index}")
        print(f"  Resolution: {self.monitor['width']}x{self.monitor['height']}")
        print(f"  Output: {self.target_width}x{self.target_height}")
        
    def start_continuous(self, target_fps: int = None) -> None:
        """Start continuous capture in background thread"""
        if self._running:
            return
            
        target_fps = target_fps or settings.target_fps
        self._running = True
        self._capture_thread = threading.Thread(
            target=self._capture_loop,
            args=(target_fps,),
            daemon=True
        )
        self._capture_thread.start()
        
    def stop(self) -> None:
        """Stop continuous capture"""
        self._running = False
        if self._capture_thread:
            self._capture_thread.join(timeout=1.0)
        if self.sct:
            self.sct.close()
            
    def _capture_loop(self, target_fps: int) -> None:
        """Background capture loop"""
        frame_time = 1.0 / target_fps
        
        while self._running:
            start = time.time()
            
            frame = self.capture_frame()
            if frame:
                with self._lock:
                    self._latest_frame = frame
            
            elapsed = time.time() - start
            sleep_time = frame_time - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)
                
    def capture_frame(self) -> Optional[Frame]:
        """Capture a single frame"""
        if not self.sct:
            self.start()
            
        try:
            # Fast screen grab
            img = self.sct.grab(self.monitor)
            frame = np.array(img)
            
            # BGRA to BGR (drop alpha channel)
            frame = frame[:, :, :3]
            
            # Resize if needed (use INTER_NEAREST for speed)
            if self.scale_factor < 1.0:
                frame = cv2.resize(
                    frame,
                    (self.target_width, self.target_height),
                    interpolation=cv2.INTER_NEAREST
                )
            
            return Frame(
                data=frame,
                timestamp=time.time(),
                width=frame.shape[1],
                height=frame.shape[0]
            )
        except Exception as e:
            print(f"Capture error: {e}")
            return None
            
    def get_latest_frame(self) -> Optional[Frame]:
        """Get the most recent captured frame (for continuous mode)"""
        with self._lock:
            return self._latest_frame
            
    def encode_jpeg(self, frame: Frame, quality: int = None) -> Optional[bytes]:
        """Encode frame as JPEG"""
        quality = quality or settings.jpeg_quality
        encode_params = [
            int(cv2.IMWRITE_JPEG_QUALITY), quality,
            int(cv2.IMWRITE_JPEG_OPTIMIZE), 0  # Disable optimization for speed
        ]
        success, jpeg = cv2.imencode('.jpg', frame.data, encode_params)
        return jpeg.tobytes() if success else None


# Singleton instance
_capture: Optional[ScreenCapture] = None


def get_capture() -> ScreenCapture:
    """Get or create the screen capture singleton"""
    global _capture
    if _capture is None:
        _capture = ScreenCapture()
    return _capture
