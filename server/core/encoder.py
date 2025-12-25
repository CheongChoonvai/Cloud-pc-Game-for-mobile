# Video encoding module
import subprocess
import threading
from typing import Optional, Generator
from dataclasses import dataclass
import numpy as np

from config.settings import settings


@dataclass
class EncoderConfig:
    """Video encoder configuration"""
    codec: str = 'h264'
    bitrate: str = '15M'
    fps: int = 60
    width: int = 1920
    height: int = 1080
    hardware_accel: bool = True


class VideoEncoder:
    """
    Video encoder using FFmpeg
    Supports hardware acceleration (NVENC, AMD AMF, Intel QSV)
    """
    
    def __init__(self, config: EncoderConfig = None):
        self.config = config or EncoderConfig()
        self.process: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._hw_encoder = self._detect_hw_encoder()
        
    def _detect_hw_encoder(self) -> str:
        """Detect available hardware encoder"""
        # Try NVENC (NVIDIA)
        try:
            result = subprocess.run(
                ['ffmpeg', '-hide_banner', '-encoders'],
                capture_output=True,
                text=True
            )
            if 'h264_nvenc' in result.stdout:
                print("✓ NVIDIA NVENC encoder detected")
                return 'h264_nvenc'
            if 'h264_amf' in result.stdout:
                print("✓ AMD AMF encoder detected")
                return 'h264_amf'
            if 'h264_qsv' in result.stdout:
                print("✓ Intel QuickSync encoder detected")
                return 'h264_qsv'
        except Exception:
            pass
        
        print("⚠ No hardware encoder found, using software (libx264)")
        return 'libx264'
    
    def get_ffmpeg_command(self, output_format: str = 'mpegts') -> list:
        """Generate FFmpeg command for encoding"""
        encoder = self._hw_encoder if self.config.hardware_accel else 'libx264'
        
        cmd = [
            'ffmpeg',
            '-y',  # Overwrite output
            '-f', 'rawvideo',
            '-vcodec', 'rawvideo',
            '-pix_fmt', 'bgr24',
            '-s', f'{self.config.width}x{self.config.height}',
            '-r', str(self.config.fps),
            '-i', '-',  # Input from stdin
            '-c:v', encoder,
            '-b:v', self.config.bitrate,
            '-maxrate', self.config.bitrate,
            '-bufsize', '30M',
        ]
        
        # Add encoder-specific options
        if encoder == 'h264_nvenc':
            cmd.extend([
                '-preset', 'p1',  # Fastest preset
                '-tune', 'ull',  # Ultra low latency
                '-zerolatency', '1',
            ])
        elif encoder == 'libx264':
            cmd.extend([
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
            ])
        
        # Output format
        if output_format == 'mpegts':
            cmd.extend(['-f', 'mpegts', 'pipe:1'])
        elif output_format == 'h264':
            cmd.extend(['-f', 'h264', 'pipe:1'])
            
        return cmd
    
    def start(self) -> None:
        """Start the encoder process"""
        cmd = self.get_ffmpeg_command()
        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        print(f"Encoder started: {self._hw_encoder}")
        
    def stop(self) -> None:
        """Stop the encoder process"""
        if self.process:
            self.process.stdin.close()
            self.process.wait()
            self.process = None
            
    def encode_frame(self, frame: np.ndarray) -> Optional[bytes]:
        """Encode a single frame"""
        if not self.process:
            self.start()
            
        try:
            with self._lock:
                self.process.stdin.write(frame.tobytes())
                self.process.stdin.flush()
                # Read encoded data (non-blocking would be better)
                return self.process.stdout.read(8192)
        except Exception as e:
            print(f"Encode error: {e}")
            return None


# Check FFmpeg availability
def check_ffmpeg() -> bool:
    """Check if FFmpeg is available"""
    try:
        subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            check=True
        )
        return True
    except Exception:
        return False
