# WebRTC streaming server
import asyncio
import json
import logging
from aiohttp import web
from typing import Optional, Set
import time
from fractions import Fraction

# Try to import aiortc
try:
    from aiortc import RTCPeerConnection, RTCSessionDescription, RTCRtpSender, VideoStreamTrack
    from aiortc.mediastreams import MediaStreamError
    import av
    WEBRTC_AVAILABLE = True
except ImportError:
    WEBRTC_AVAILABLE = False
    print("⚠ aiortc not installed. Run: pip install aiortc aiohttp av")

try:
    import cv2
    import dxcam
    DXCAM_AVAILABLE = True
except ImportError:
    cv2 = None
    dxcam = None
    DXCAM_AVAILABLE = False

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.settings import settings
from core.capture import get_capture, Frame
from utils.network import get_local_ip

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('webrtc')

# Active peer connections
pcs: Set['RTCPeerConnection'] = set()

VIDEO_CLOCK_RATE = 90000
VIDEO_TIME_BASE = Fraction(1, VIDEO_CLOCK_RATE)


def _even(value: int) -> int:
    return max(2, value - (value % 2))


def _target_size() -> tuple[int, int]:
    width = settings.video_width
    height = settings.video_height

    if width and height:
        return _even(width), _even(height)
    if height:
        return _even(int(height * 16 / 9)), _even(height)
    if width:
        return _even(width), _even(int(width * 9 / 16))

    return _even(int(1920 * settings.scale_factor)), _even(int(1080 * settings.scale_factor))


class MssScreenTrack(VideoStreamTrack if WEBRTC_AVAILABLE else object):
    """Fallback screen track using the existing mss capture path."""

    kind = "video"
    
    def __init__(self):
        if WEBRTC_AVAILABLE:
            super().__init__()
        self.capture = get_capture()
        self.capture.start()
        self._start_time = None
        self._frame_count = 0
        self._target_fps = settings.target_fps
        self._frame_duration = 1.0 / self._target_fps
        
    async def recv(self):
        """Receive the next frame"""
        if not WEBRTC_AVAILABLE:
            raise RuntimeError("aiortc not available")
            
        if self._start_time is None:
            self._start_time = time.time()
        
        # Capture frame
        frame_data = self.capture.capture_frame()
        
        if frame_data is None:
            # Return a black frame if capture fails
            import numpy as np
            frame_data = Frame(
                data=np.zeros((720, 1280, 3), dtype=np.uint8),
                timestamp=time.time(),
                width=1280,
                height=720
            )
        
        # Convert to av.VideoFrame
        frame = av.VideoFrame.from_ndarray(frame_data.data, format='bgr24')
        
        # Set timestamp for proper playback
        pts = int(self._frame_count * self._frame_duration * 90000)  # 90kHz timebase
        frame.pts = pts
        frame.time_base = VIDEO_TIME_BASE
        
        self._frame_count += 1
        
        # Frame rate limiting
        elapsed = time.time() - self._start_time
        expected = self._frame_count * self._frame_duration
        if expected > elapsed:
            await asyncio.sleep(expected - elapsed)
        
        return frame


class DxcamScreenTrack(VideoStreamTrack if WEBRTC_AVAILABLE else object):
    """Low-latency Windows capture that always consumes DXcam's latest frame."""

    kind = "video"

    def __init__(self):
        if WEBRTC_AVAILABLE:
            super().__init__()
        if not DXCAM_AVAILABLE:
            raise RuntimeError("DXcam is not installed")

        self.width, self.height = _target_size()
        self.fps = settings.target_fps
        self._pts = 0
        self._pts_step = VIDEO_CLOCK_RATE // self.fps
        self._closed = False
        self.camera = dxcam.create(
            output_color="BGR",
            max_buffer_len=2,
            backend="dxgi",
            processor_backend="cv2",
        )
        self._owns_camera = not self.camera.is_capturing
        if self._owns_camera:
            self.camera.start(target_fps=self.fps, video_mode=True)
            print(f"DXcam WebRTC capture started: {self.width}x{self.height} at {self.fps} FPS")
        else:
            print(f"DXcam WebRTC capture reused: {self.width}x{self.height} at {self.fps} FPS")

    async def recv(self):
        if self._closed:
            raise MediaStreamError

        image = await asyncio.to_thread(self.camera.get_latest_frame)
        if image is None:
            raise MediaStreamError

        source_height, source_width = image.shape[:2]
        if source_width != self.width or source_height != self.height:
            image = cv2.resize(
                image,
                (self.width, self.height),
                interpolation=cv2.INTER_AREA,
            )

        frame = av.VideoFrame.from_ndarray(image, format="bgr24")
        frame.pts = self._pts
        frame.time_base = VIDEO_TIME_BASE
        self._pts += self._pts_step
        return frame

    def stop(self):
        if self._closed:
            return

        self._closed = True
        try:
            if self._owns_camera and self.camera and self.camera.is_capturing:
                self.camera.stop()
            if self._owns_camera and self.camera:
                self.camera.release()
        finally:
            if WEBRTC_AVAILABLE:
                super().stop()


def create_screen_track():
    if DXCAM_AVAILABLE:
        try:
            return DxcamScreenTrack()
        except Exception as exc:
            print(f"DXcam WebRTC capture failed, falling back to mss: {exc}")

    return MssScreenTrack()


def force_video_codec(pc: RTCPeerConnection, sender: RTCRtpSender, mime_type: str) -> None:
    codecs = RTCRtpSender.getCapabilities("video").codecs
    matching_codecs = [
        codec
        for codec in codecs
        if codec.mimeType.lower() == mime_type.lower()
    ]

    if not matching_codecs:
        print(f"WebRTC codec unavailable, using browser default: {mime_type}")
        return

    for transceiver in pc.getTransceivers():
        if transceiver.sender == sender:
            transceiver.setCodecPreferences(matching_codecs)
            print(f"Forced WebRTC codec: {mime_type}")
            return


async def handle_offer(request):
    """Handle WebRTC offer from client"""
    if not WEBRTC_AVAILABLE:
        return web.Response(
            status=503,
            text=json.dumps({"error": "WebRTC not available. Install: pip install aiortc aiohttp av"}),
            content_type='application/json'
        )
    
    params = await request.json()
    offer = RTCSessionDescription(sdp=params['sdp'], type=params['type'])
    
    pc = RTCPeerConnection()
    pcs.add(pc)
    
    @pc.on('connectionstatechange')
    async def on_connectionstatechange():
        logger.info(f"Connection state: {pc.connectionState}")
        if pc.connectionState == 'failed' or pc.connectionState == 'closed':
            await pc.close()
            pcs.discard(pc)
    
    # Add video track
    video_track = create_screen_track()
    sender = pc.addTrack(video_track)
    force_video_codec(pc, sender, f"video/{settings.video_codec}")
    
    # Set remote description and create answer
    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    
    return web.Response(
        content_type='application/json',
        text=json.dumps({
            'sdp': pc.localDescription.sdp,
            'type': pc.localDescription.type
        })
    )


async def handle_index(request):
    """Return WebRTC client page"""
    html = """
<!DOCTYPE html>
<html>
<head>
    <title>Cloud Game Stream</title>
    <style>
        body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
        video { width: 100%; height: 100%; object-fit: cover; }
        #status, #stats {
            position: absolute;
            left: 10px;
            color: #0f0;
            font: 12px/1.35 Consolas, monospace;
            background: rgba(0, 0, 0, 0.58);
            border: 1px solid rgba(0, 255, 157, 0.18);
            border-radius: 8px;
            padding: 7px 9px;
            white-space: pre;
            user-select: none;
        }
        #status { top: 10px; }
        #status.connected { display: none; }
        #stats { top: 48px; display: none; cursor: pointer; }
        #stats.collapsed { border-radius: 999px; white-space: nowrap; }
    </style>
</head>
<body>
    <div id="status">Connecting...</div>
    <div id="stats"></div>
    <video id="video" autoplay playsinline></video>
    <script>
        const video = document.getElementById('video');
        const status = document.getElementById('status');
        const stats = document.getElementById('stats');
        let previousVideoStats = null;
        let statsExpanded = false;

        stats.addEventListener('click', () => {
            statsExpanded = !statsExpanded;
            stats.classList.toggle('collapsed', !statsExpanded);
        });

        function configureLowLatencyPlayback(pc) {
            for (const receiver of pc.getReceivers()) {
                if (receiver.track?.kind !== 'video') {
                    continue;
                }

                if ('jitterBufferTarget' in receiver) {
                    receiver.jitterBufferTarget = 0.02;
                } else if ('playoutDelayHint' in receiver) {
                    receiver.playoutDelayHint = 0.02;
                }
            }
        }

        async function readLatencyStats(pc) {
            const report = await pc.getStats();
            let videoStats = null;
            let selectedPair = null;

            report.forEach((stat) => {
                if (stat.type === 'inbound-rtp' && stat.kind === 'video' && !stat.isRemote) {
                    videoStats = stat;
                }
                if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.nominated) {
                    selectedPair = stat;
                }
            });

            if (!videoStats) {
                return { status: 'Waiting for video statistics' };
            }

            const current = {
                timestamp: videoStats.timestamp,
                framesDecoded: videoStats.framesDecoded || 0,
                jitterBufferDelay: videoStats.jitterBufferDelay || 0,
                jitterBufferEmittedCount: videoStats.jitterBufferEmittedCount || 0,
                totalDecodeTime: videoStats.totalDecodeTime || 0,
                totalProcessingDelay: videoStats.totalProcessingDelay || 0,
            };

            let jitterBufferMs = 0;
            let decodeMs = 0;
            let processingMs = 0;

            if (previousVideoStats) {
                const frames = current.framesDecoded - previousVideoStats.framesDecoded;
                const emitted = current.jitterBufferEmittedCount - previousVideoStats.jitterBufferEmittedCount;

                if (emitted > 0) {
                    jitterBufferMs = ((current.jitterBufferDelay - previousVideoStats.jitterBufferDelay) / emitted) * 1000;
                }
                if (frames > 0) {
                    decodeMs = ((current.totalDecodeTime - previousVideoStats.totalDecodeTime) / frames) * 1000;
                    processingMs = ((current.totalProcessingDelay - previousVideoStats.totalProcessingDelay) / frames) * 1000;
                }
            }

            previousVideoStats = current;

            return {
                fps: videoStats.framesPerSecond || 0,
                rttMs: (selectedPair?.currentRoundTripTime || 0) * 1000,
                jitterMs: (videoStats.jitter || 0) * 1000,
                jitterBufferMs,
                decodeMs,
                processingMs,
                framesDropped: videoStats.framesDropped || 0,
                packetsLost: videoStats.packetsLost || 0,
            };
        }

        function startStatsOverlay(pc) {
            stats.style.display = 'block';
            stats.classList.add('collapsed');
            setInterval(async () => {
                try {
                    const data = await readLatencyStats(pc);
                    if (data.status) {
                        stats.textContent = data.status;
                        return;
                    }

                    if (!statsExpanded) {
                        stats.textContent = `${data.fps.toFixed(0)} FPS · ${data.rttMs.toFixed(0)} ms`;
                    } else {
                        stats.textContent =
                            `FPS:             ${data.fps.toFixed(0)}\n` +
                            `Network RTT:     ${data.rttMs.toFixed(1)} ms\n` +
                            `Jitter buffer:   ${data.jitterBufferMs.toFixed(1)} ms\n` +
                            `Decode:          ${data.decodeMs.toFixed(1)} ms\n` +
                            `Processing:      ${data.processingMs.toFixed(1)} ms\n` +
                            `Dropped frames:  ${data.framesDropped}\n` +
                            `Packet loss:     ${data.packetsLost}`;
                    }
                } catch (error) {
                    stats.textContent = `Stats error: ${error.message}`;
                }
            }, 1000);
        }
        
        async function start() {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            pc.ontrack = (event) => {
                video.srcObject = event.streams[0];
                status.textContent = 'Connected!';
                status.classList.add('connected');
                configureLowLatencyPlayback(pc);
                startStatsOverlay(pc);
            };
            
            pc.onconnectionstatechange = () => {
                status.textContent = 'State: ' + pc.connectionState;
                status.classList.toggle('connected', pc.connectionState === 'connected');
            };
            
            // Create offer
            pc.addTransceiver('video', { direction: 'recvonly' });
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            // Send to server
            const response = await fetch('/offer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sdp: pc.localDescription.sdp,
                    type: pc.localDescription.type
                })
            });
            
            const answer = await response.json();
            await pc.setRemoteDescription(answer);
        }
        
        start().catch(e => status.textContent = 'Error: ' + e);
    </script>
</body>
</html>
"""
    return web.Response(content_type='text/html', text=html)


async def on_shutdown(app):
    """Cleanup on shutdown"""
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()


def create_app():
    """Create the aiohttp application"""
    app = web.Application()
    app.router.add_get('/', handle_index)
    app.router.add_post('/offer', handle_offer)
    app.on_shutdown.append(on_shutdown)
    return app


def start_server(host: str = None, port: int = None):
    """Start the WebRTC server"""
    host = host or settings.host
    port = port or settings.webrtc_port
    
    print("=" * 50)
    print("  WebRTC Game Streaming Server")
    print("=" * 50)
    print(f"  URL: http://{get_local_ip()}:{port}/")
    print(f"  Target FPS: {settings.target_fps}")
    print(f"  WebRTC Available: {WEBRTC_AVAILABLE}")
    print("=" * 50)
    
    app = create_app()
    web.run_app(app, host=host, port=port, print=None)


async def start_server_async(host: str = None, port: int = None):
    """Start server asynchronously (for integration with other async code)"""
    host = host or settings.host
    port = port or settings.webrtc_port
    
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    
    logger.info(f"WebRTC server running at http://{get_local_ip()}:{port}/")
    return runner


if __name__ == '__main__':
    start_server()
