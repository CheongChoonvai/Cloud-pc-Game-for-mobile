import { useEffect, useRef, useState } from 'react';
import { SERVER_IP, WS_PORT, MJPEG_PORT } from './config';
import GamepadController from './components/GamepadController';
import './App.css';

function App() {
  const [wsStatus, setWsStatus] = useState('disconnected');
  const wsRef = useRef(null);

  useEffect(() => {
    const wsUrl = `ws://${SERVER_IP}:${WS_PORT}`;
    console.log('Connecting to:', wsUrl);

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsStatus('connected');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsStatus('disconnected');
        // Auto-reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsStatus('error');
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="app-container">
      <GamepadController
        wsRef={wsRef}
        serverStatus={wsStatus}
        serverIP={SERVER_IP}
        mjpegPort={MJPEG_PORT}
      />
    </div>
  );
}

export default App;
