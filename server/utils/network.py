# Network utilities
import socket
import qrcode
from io import BytesIO


def get_local_ip() -> str:
    """Get the local IP address of the machine"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"


def generate_qr_code(data: str, box_size: int = 10, border: int = 4):
    """
    Generate a QR code image
    
    Args:
        data: The data to encode in the QR code
        box_size: Size of each box in pixels
        border: Border size in boxes
    
    Returns:
        PIL Image of the QR code
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=box_size,
        border=border
    )
    qr.add_data(data)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white")


def print_qr_ascii(data: str) -> None:
    """Print QR code to terminal as ASCII art"""
    qr = qrcode.QRCode(version=1, box_size=1, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    qr.print_ascii(tty=True)


def get_server_info(ws_port: int, mjpeg_port: int, webrtc_port: int = None) -> dict:
    """Get complete server connection info"""
    local_ip = get_local_ip()
    info = {
        "ip": local_ip,
        "ws_port": ws_port,
        "mjpeg_port": mjpeg_port,
        "ws_url": f"ws://{local_ip}:{ws_port}",
        "mjpeg_url": f"http://{local_ip}:{mjpeg_port}/",
    }
    if webrtc_port:
        info["webrtc_port"] = webrtc_port
        info["webrtc_url"] = f"http://{local_ip}:{webrtc_port}/"
    return info
