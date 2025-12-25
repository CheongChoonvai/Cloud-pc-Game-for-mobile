# Modular Server Entry Point
"""
Cloud Game Server - Modular Entry Point

Usage:
    python main.py [--webrtc] [--mjpeg] [--gui]
    
Options:
    --webrtc    Start WebRTC video server (recommended for 60fps)
    --mjpeg     Start MJPEG video server (fallback)
    --gui       Start with GUI (default if no options specified)
"""
import argparse
import asyncio
import threading
import sys
import os

# Ensure proper imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.settings import settings
from utils.network import get_local_ip, print_qr_ascii


def print_banner():
    print("=" * 55)
    print("  ☁️  Cloud Game Server")
    print("=" * 55)
    print(f"  Server IP:    {get_local_ip()}")
    print(f"  Input Port:   {settings.ws_port}")
    print(f"  MJPEG Port:   {settings.mjpeg_port}")
    print(f"  WebRTC Port:  {settings.webrtc_port}")
    print(f"  Target FPS:   {settings.target_fps}")
    print("=" * 55)


def start_input_server():
    """Start input server in separate thread"""
    from input.input_server import main as input_main
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(input_main())
    except KeyboardInterrupt:
        pass


def start_mjpeg_server():
    """Start MJPEG video server"""
    from video.mjpeg_server import start_server
    start_server()


def start_webrtc_server():
    """Start WebRTC video server"""
    try:
        from video.webrtc_server import start_server, WEBRTC_AVAILABLE
        if not WEBRTC_AVAILABLE:
            print("⚠ WebRTC not available. Install: pip install aiortc aiohttp av")
            print("  Falling back to MJPEG...")
            start_mjpeg_server()
            return
        start_server()
    except ImportError:
        print("⚠ WebRTC module not found. Install: pip install aiortc aiohttp av")
        start_mjpeg_server()


def start_gui():
    """Start server with GUI"""
    from server_gui import ServerApp
    import tkinter as tk
    root = tk.Tk()
    app = ServerApp(root)
    root.mainloop()


def main():
    parser = argparse.ArgumentParser(description='Cloud Game Server')
    parser.add_argument('--webrtc', action='store_true', help='Use WebRTC (60fps, low latency)')
    parser.add_argument('--mjpeg', action='store_true', help='Use MJPEG (fallback)')
    parser.add_argument('--gui', action='store_true', help='Start with GUI')
    parser.add_argument('--headless', action='store_true', help='Run without GUI')
    args = parser.parse_args()
    
    # Default to GUI if no args
    if not (args.webrtc or args.mjpeg or args.headless):
        start_gui()
        return
    
    print_banner()
    
    # Print QR code
    url = f"http://{get_local_ip()}:5173"
    print(f"\n📱 Scan to connect: {url}")
    print_qr_ascii(url)
    
    # Start input server in background thread
    input_thread = threading.Thread(target=start_input_server, daemon=True)
    input_thread.start()
    print("✓ Input server started")
    
    # Start video server (blocking)
    if args.webrtc:
        print("✓ Starting WebRTC server (60fps)...")
        start_webrtc_server()
    else:
        print("✓ Starting MJPEG server...")
        start_mjpeg_server()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Server stopped")
