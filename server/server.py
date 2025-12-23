import socket
import cv2
import numpy as np
import mss

HOST = ''  # Listen on all interfaces
PORT = 9999

with mss.mss() as sct:
    monitor = sct.monitors[1]  # Full screen
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, PORT))
        s.listen(1)
        print(f'Server listening on port {PORT}...')
        conn, addr = s.accept()
        print(f'Client connected: {addr}')
        with conn:
            while True:
                img = np.array(sct.grab(monitor))
                frame = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                _, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                data = jpeg.tobytes()
                size = len(data).to_bytes(4, 'big')
                try:
                    conn.sendall(size + data)
                except Exception as e:
                    print('Connection closed:', e)
                    break
