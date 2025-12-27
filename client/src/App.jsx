import { useEffect, useRef, useState } from 'react';
import { SERVER_IP, WS_PORT, MJPEG_PORT } from './config';
import GamepadController from './components/GamepadController';
import SettingsPage from './components/SettingsPage';
import ControllerEditor from './components/ControllerEditor';
import NavigationDock from './components/NavigationDock';
import './App.css';

function App() {
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [currentView, setCurrentView] = useState('game'); // 'game', 'settings', 'editor'
  const [showMenu, setShowMenu] = useState(false);
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

  const navigateTo = (view) => {
    setCurrentView(view);
    setShowMenu(false);
  };

  return (
    <div className="app-container">

      {/* Navigation Dock (Only visible in game mode) */}
      {currentView === 'game' && (
        <>
          <NavigationDock
            status={wsStatus}
            onNavigate={navigateTo}
            onToggleMenu={() => setShowMenu(true)}
          />

          {/* Menu Overlay */}
          {showMenu && (
            <div
              onClick={() => setShowMenu(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                zIndex: 2000, backdropFilter: 'blur(5px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'rgba(20,20,30,0.95)', padding: '30px', borderRadius: '24px',
                  border: '1px solid rgba(255,255,255,0.1)', minWidth: '280px',
                  display: 'flex', flexDirection: 'column', gap: '16px',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>MENU</h2>
                  <button onClick={() => setShowMenu(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                </div>

                <button
                  onClick={() => setShowMenu(false)}
                  style={{
                    padding: '16px', borderRadius: '14px', border: 'none',
                    background: '#3b82f6', color: 'white', fontSize: '16px', fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Resume Game ▶
                </button>

                <button
                  onClick={() => navigateTo('editor')}
                  style={{
                    padding: '16px', borderRadius: '14px', border: 'none',
                    background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '16px', fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Edit Controller 🎮
                </button>

                <div style={{ marginTop: '10px', fontSize: '12px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  Cloud Gaming Controller v1.0
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Views */}
      {currentView === 'game' && (
        <GamepadController
          wsRef={wsRef}
          serverStatus={wsStatus}
          serverIP={SERVER_IP}
          mjpegPort={MJPEG_PORT}
        />
      )}

      {currentView === 'settings' && (
        <SettingsPage
          serverIP={SERVER_IP}
          mjpegPort={MJPEG_PORT}
          onBack={() => setCurrentView('game')}
        />
      )}

      {currentView === 'editor' && (
        <ControllerEditor
          onBack={() => setCurrentView('game')}
        />
      )}

    </div>
  );
}

export default App;
