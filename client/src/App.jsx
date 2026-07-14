import { useEffect, useRef, useState } from 'react';
import { SERVER_IP, WS_PORT, MJPEG_PORT, WEBRTC_PORT } from './config';
import GamepadController from './components/GamepadController';
import SettingsPage from './components/SettingsPage';
import ControllerEditor from './components/ControllerEditor';
import NavigationDock from './components/NavigationDock';
import './App.css';

function App() {
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [controllerMode, setControllerMode] = useState('unknown');
  const [controllerScale, setControllerScale] = useState(1.0);
  const [videoMode, setVideoMode] = useState(() => localStorage.getItem('videoMode') || 'webrtc');
  const [currentView, setCurrentView] = useState('game'); // 'game', 'settings', 'editor'
  const [showMenu, setShowMenu] = useState(false);
  const [menuDockVisible, setMenuDockVisible] = useState(true);
  const wsRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('videoMode', videoMode);
  }, [videoMode]);

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

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'status') {
            if (payload.controllerMode) {
              setControllerMode(payload.controllerMode);
            }
          }
        } catch {
          // Ignore non-JSON messages.
        }
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

  const hideMenuDock = () => setMenuDockVisible(false);
  const showMenuDock = () => setMenuDockVisible(true);

  return (
    <div className="app-container">

      {/* Navigation Dock (Only visible in game mode) */}
      {currentView === 'game' && (
        <>
          {menuDockVisible && (
            <NavigationDock
              status={wsStatus}
              onNavigate={navigateTo}
              onToggleMenu={() => setShowMenu(true)}
            />
          )}

          {/* Menu Overlay */}
          {showMenu && (
            <div
              onClick={() => setShowMenu(false)}
              className="game-menu-backdrop"
            >
              <div
                onClick={e => e.stopPropagation()}
                className="game-menu-dialog"
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

                <button
                  onClick={() => {
                    setShowMenu(false);
                    setMenuDockVisible(false);
                  }}
                  style={{
                    padding: '16px', borderRadius: '14px', border: 'none',
                    background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '16px', fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Hide Menu Dock
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
          controllerMode={controllerMode}
          controllerScale={controllerScale}
          videoMode={videoMode}
          setControllerScale={setControllerScale}
          menuDockVisible={menuDockVisible}
          onHideMenuDock={hideMenuDock}
          onShowMenuDock={showMenuDock}
          serverIP={SERVER_IP}
          mjpegPort={MJPEG_PORT}
          webrtcPort={WEBRTC_PORT}
        />
      )}

      {currentView === 'settings' && (
        <SettingsPage
          serverIP={SERVER_IP}
          mjpegPort={MJPEG_PORT}
          videoMode={videoMode}
          setVideoMode={setVideoMode}
          onBack={() => setCurrentView('game')}
        />
      )}

      {currentView === 'editor' && (
        <ControllerEditor
          controllerScale={controllerScale}
          setControllerScale={setControllerScale}
          onBack={() => setCurrentView('game')}
        />
      )}

    </div>
  );
}

export default App;
