// Server connection config.
// Resolution order: URL query params -> browser hostname -> Vite env vars.
const urlParams = new URLSearchParams(window.location.search);

export const SERVER_IP =
  urlParams.get('server') || window.location.hostname || import.meta.env.VITE_SERVER_IP;

export const API_PORT = urlParams.get('port') || import.meta.env.VITE_API_PORT || 8000;

export const API_BASE = `http://${SERVER_IP}:${API_PORT}`;
export const INPUT_WS_URL = `ws://${SERVER_IP}:${API_PORT}/ws/input`;
