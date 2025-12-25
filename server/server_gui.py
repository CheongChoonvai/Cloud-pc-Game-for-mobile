import tkinter as tk
from tkinter import ttk
from PIL import Image, ImageTk
import threading
import asyncio
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.settings import settings
from utils.network import get_local_ip, generate_qr_code, get_server_info
from input.input_server import main as input_server_main, gamepad_thread_running
from video.mjpeg_server import start_server as mjpeg_start, stop_server as mjpeg_stop

# Try to import WebRTC server
try:
    from video.webrtc_server import start_server as webrtc_start, WEBRTC_AVAILABLE
except ImportError:
    WEBRTC_AVAILABLE = False


class ServerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Cloud Game Server")
        self.root.geometry("450x650")
        self.root.configure(bg="#1a1a2e")
        
        self.is_running = False
        self.loop = None
        self.server_thread = None
        self.mjpeg_thread = None
        self.webrtc_thread = None
        self.use_webrtc = tk.BooleanVar(value=WEBRTC_AVAILABLE)

        self.setup_ui()
        
    def setup_ui(self):
        # Style
        style = ttk.Style()
        style.configure("TLabel", background="#1a1a2e", foreground="white", font=("Segoe UI", 12))
        style.configure("TCheckbutton", background="#1a1a2e", foreground="white", font=("Segoe UI", 11))
        
        # Header
        header = ttk.Label(
            self.root, 
            text="☁️ Cloud Game Server", 
            font=("Segoe UI", 20, "bold"), 
            background="#1a1a2e", 
            foreground="#00d4ff"
        )
        header.pack(pady=20)
        
        # Subtitle
        subtitle = ttk.Label(
            self.root, 
            text="Stream games to your mobile device", 
            font=("Segoe UI", 10), 
            background="#1a1a2e", 
            foreground="#888"
        )
        subtitle.pack()
        
        # QR Code Container
        self.qr_frame = tk.Frame(self.root, bg="#2d2d44", padx=15, pady=15)
        self.qr_frame.pack(pady=20)
        
        self.qr_label = tk.Label(self.qr_frame, bg="white")
        self.qr_label.pack()
        
        # Connection Info
        info_frame = tk.Frame(self.root, bg="#1a1a2e")
        info_frame.pack(pady=10)
        
        self.ip_label = ttk.Label(info_frame, text=f"IP: {get_local_ip()}", font=("Consolas", 11))
        self.ip_label.pack()
        
        self.ports_label = ttk.Label(
            info_frame, 
            text=f"Input: {settings.ws_port} | Video: {settings.mjpeg_port} | WebRTC: {settings.webrtc_port}",
            font=("Consolas", 9),
            foreground="#aaa"
        )
        self.ports_label.pack()
        
        # Status
        self.status_var = tk.StringVar(value="⏸️ Ready to Start")
        self.status_label = ttk.Label(
            self.root, 
            textvariable=self.status_var, 
            font=("Segoe UI", 11, "bold"),
            foreground="#ffd700"
        )
        self.status_label.pack(pady=15)

        # Display initial QR
        self.display_qr()
        
        # Options Frame
        options_frame = tk.Frame(self.root, bg="#1a1a2e")
        options_frame.pack(pady=10)
        
        # WebRTC Toggle
        webrtc_status = "✓ Available" if WEBRTC_AVAILABLE else "✗ Install: pip install aiortc"
        self.webrtc_check = tk.Checkbutton(
            options_frame,
            text=f"Use WebRTC (60fps, Low Latency) - {webrtc_status}",
            variable=self.use_webrtc,
            bg="#1a1a2e",
            fg="white" if WEBRTC_AVAILABLE else "#666",
            selectcolor="#2d2d44",
            activebackground="#1a1a2e",
            font=("Segoe UI", 10),
            state="normal" if WEBRTC_AVAILABLE else "disabled"
        )
        self.webrtc_check.pack()
        
        # FPS Label
        fps_label = ttk.Label(
            options_frame,
            text=f"Target: {settings.target_fps} FPS",
            font=("Segoe UI", 9),
            foreground="#888"
        )
        fps_label.pack(pady=5)
        
        # Buttons Frame
        btn_frame = tk.Frame(self.root, bg="#1a1a2e")
        btn_frame.pack(pady=20)
        
        # Start Button
        self.start_btn = tk.Button(
            btn_frame, 
            text="▶ Start Server", 
            command=self.start_server,
            bg="#00c853", 
            fg="white", 
            font=("Segoe UI", 12, "bold"),
            bd=0, 
            padx=25, 
            pady=12, 
            activebackground="#00e676",
            cursor="hand2"
        )
        self.start_btn.pack(side=tk.LEFT, padx=5)
        
        # Stop Button
        self.stop_btn = tk.Button(
            btn_frame, 
            text="⏹ Stop Server", 
            command=self.stop_server,
            bg="#ff1744", 
            fg="white", 
            font=("Segoe UI", 12, "bold"),
            bd=0, 
            padx=25, 
            pady=12, 
            activebackground="#ff5252",
            cursor="hand2"
        )
        self.stop_btn.pack(side=tk.LEFT, padx=5)
        self.stop_btn["state"] = "disabled"
        
        # Footer
        footer = ttk.Label(
            self.root,
            text="Scan QR code with your phone to connect",
            font=("Segoe UI", 9),
            foreground="#666"
        )
        footer.pack(side=tk.BOTTOM, pady=10)

    def display_qr(self):
        try:
            local_ip = get_local_ip()
            url = f"http://{local_ip}:5173"
            
            pil_image = generate_qr_code(url, box_size=8, border=3)
            if pil_image:
                pil_image = pil_image.resize((200, 200), Image.Resampling.LANCZOS)
                self.photo = ImageTk.PhotoImage(pil_image)
                self.qr_label.config(image=self.photo)
        except Exception as e:
            self.status_var.set(f"❌ QR Error: {e}")

    def run_async_server(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        try:
            self.loop.run_until_complete(input_server_main())
        except asyncio.CancelledError:
            pass
        finally:
            self.loop.close()
            
    def run_webrtc_server(self):
        try:
            webrtc_start()
        except Exception as e:
            print(f"WebRTC server error: {e}")

    def start_server(self):
        if self.is_running:
            return
            
        self.is_running = True
        self.start_btn["state"] = "disabled"
        self.start_btn.config(bg="#95a5a6")
        self.stop_btn["state"] = "normal"
        self.stop_btn.config(bg="#ff1744")
        self.webrtc_check.config(state="disabled")
        
        # Status message
        if self.use_webrtc.get():
            self.status_var.set("🚀 Running: Input + WebRTC (60fps)")
        else:
            self.status_var.set("🚀 Running: Input + MJPEG")
        
        # Start input server thread
        self.server_thread = threading.Thread(target=self.run_async_server, daemon=True)
        self.server_thread.start()

        # Start video server based on selection
        if self.use_webrtc.get() and WEBRTC_AVAILABLE:
            self.webrtc_thread = threading.Thread(target=self.run_webrtc_server, daemon=True)
            self.webrtc_thread.start()
        else:
            self.mjpeg_thread = threading.Thread(target=mjpeg_start, daemon=True)
            self.mjpeg_thread.start()

    def stop_server(self):
        if not self.is_running:
            return

        # Signal stop
        import input.input_server as input_mod
        input_mod.gamepad_thread_running = False
        mjpeg_stop()
        self.is_running = False
        
        # Cancel async tasks
        if self.loop:
            for task in asyncio.all_tasks(self.loop):
                task.cancel()
            self.loop.call_soon_threadsafe(self.loop.stop)
            
        self.start_btn["state"] = "normal"
        self.start_btn.config(bg="#00c853")
        self.stop_btn["state"] = "disabled"
        self.stop_btn.config(bg="#95a5a6")
        self.webrtc_check.config(state="normal" if WEBRTC_AVAILABLE else "disabled")
        self.status_var.set("⏸️ Server Stopped")


if __name__ == "__main__":
    root = tk.Tk()
    app = ServerApp(root)
    root.mainloop()
