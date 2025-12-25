# WebRTC streaming server
import asyncio
import json
import logging
from aiohttp import web
from typing import Optional, Set
import time

# Try to import aiortc
try:
    from aiortc import RTCPeerConnection, RTCSessionDescription
    from aiortc.contrib.media import MediaPlayer, MediaRelay
    from aiortc.mediastreams import MediaStreamTrack
    import av
    WEBRTC_AVAILABLE = True
except ImportError:
    WEBRTC_AVAILABLE = False
    print("⚠ aiortc not installed. Run: pip install aiortc aiohttp av")

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
relay = None


class ScreenVideoTrack(MediaStreamTrack if WEBRTC_AVAILABLE else object):
    """
    A video track that captures the screen and streams via WebRTC
    """
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
        frame.time_base = av.Rational(1, 90000)
        
        self._frame_count += 1
        
        # Frame rate limiting
        elapsed = time.time() - self._start_time
        expected = self._frame_count * self._frame_duration
        if expected > elapsed:
            await asyncio.sleep(expected - elapsed)
        
        return frame


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
    video_track = ScreenVideoTrack()
    pc.addTrack(video_track)
    
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
        body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; }
        video { max-width: 100%; max-height: 100%; }
        #status { position: absolute; top: 10px; left: 10px; color: #0f0; font-family: monospace; }
    </style>
</head>
<body>
    <div id="status">Connecting...</div>
    <video id="video" autoplay playsinline></video>
    <script>
        const video = document.getElementById('video');
        const status = document.getElementById('status');
        
        async function start() {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            pc.ontrack = (event) => {
                video.srcObject = event.streams[0];
                status.textContent = 'Connected!';
            };
            
            pc.onconnectionstatechange = () => {
                status.textContent = 'State: ' + pc.connectionState;
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
