"""Network helpers: local IP discovery and QR code printing."""
import socket


def get_local_ip() -> str:
    """Best-effort LAN IP of this machine."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        return "127.0.0.1"


def print_qr_ascii(data: str) -> None:
    """Print a QR code to the terminal (used for the phone connect URL)."""
    try:
        import qrcode

        qr = qrcode.QRCode(version=1, box_size=1, border=2)
        qr.add_data(data)
        qr.make(fit=True)
        qr.print_ascii(tty=True)
    except Exception:
        pass
