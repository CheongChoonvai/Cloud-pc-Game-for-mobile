# Server Configuration Settings
import os
from dataclasses import dataclass, field, asdict
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

@dataclass
class Settings:
    """Centralized server configuration"""
    
    # Network settings
    host: str = field(default_factory=lambda: os.getenv('HOST', '0.0.0.0'))
    ws_port: int = field(default_factory=lambda: int(os.getenv('WS_PORT', 8765)))
    mjpeg_port: int = field(default_factory=lambda: int(os.getenv('MJPEG_PORT', 8888)))
    webrtc_port: int = field(default_factory=lambda: int(os.getenv('WEBRTC_PORT', 8889)))
    
    # Video settings
    target_fps: int = field(default_factory=lambda: int(os.getenv('TARGET_FPS', 60)))
    video_codec: str = field(default_factory=lambda: os.getenv('VIDEO_CODEC', 'h264'))
    video_bitrate: str = field(default_factory=lambda: os.getenv('VIDEO_BITRATE', '15M'))
    jpeg_quality: int = field(default_factory=lambda: int(os.getenv('JPEG_QUALITY', 95)))
    scale_factor: float = field(default_factory=lambda: float(os.getenv('SCALE_FACTOR', 1.0)))
    
    # Capture settings
    monitor_index: int = field(default_factory=lambda: int(os.getenv('MONITOR_INDEX', 1)))
    capture_method: str = field(default_factory=lambda: os.getenv('CAPTURE_METHOD', 'mss'))
    
    # Input settings
    mouse_sensitivity: int = field(default_factory=lambda: int(os.getenv('MOUSE_SENSITIVITY', 20)))
    
    def to_dict(self) -> dict:
        """Convert settings to dictionary"""
        return asdict(self)
    
    def update(self, **kwargs) -> None:
        """Update settings dynamically"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)


# Global settings instance
settings = Settings()
