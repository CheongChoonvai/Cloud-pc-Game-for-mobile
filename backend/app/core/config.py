"""Centralized application settings loaded from backend/.env."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Network
    host: str = "0.0.0.0"
    port: int = 8000

    # Video stream
    target_fps: int = 60
    video_width: int = 854
    video_height: int = 480
    video_bitrate: int = 4_000_000
    monitor_index: int = 1

    # WebRTC
    stun_server: str = "stun://stun.l.google.com:19302"

    # Input
    input_mode: str = "auto"  # auto | keyboard
    mouse_sensitivity: int = 20

    # GStreamer (Windows install location, used for DLL loading)
    gstreamer_bin: str = r"C:\Program Files\gstreamer\1.0\msvc_x86_64\bin"

    @property
    def video_bitrate_kbps(self) -> int:
        return self.video_bitrate // 1000


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
