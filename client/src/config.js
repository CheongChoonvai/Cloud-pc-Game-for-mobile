// Auto-detect server IP from browser URL, fallback to env var
const urlParams = new URLSearchParams(window.location.search);
const queryServer = urlParams.get('server');

export const SERVER_IP = queryServer || window.location.hostname || import.meta.env.VITE_SERVER_IP;
export const MJPEG_PORT = urlParams.get('mjpeg') || import.meta.env.VITE_MJPEG_PORT;
export const WS_PORT = urlParams.get('port') || import.meta.env.VITE_WS_PORT;
