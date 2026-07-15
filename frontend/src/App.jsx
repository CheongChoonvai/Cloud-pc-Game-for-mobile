import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_IP, API_BASE, INPUT_WS_URL } from './config';
import GamepadController from './components/GamepadController';
import SettingsPage from './components/SettingsPage';
import ControllerEditor from './components/ControllerEditor';
import NavigationDock from './components/NavigationDock';
import LandingScreen from './components/LandingScreen';
import './App.css';

function App() {
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [controllerMode, setControllerMode] = useState('unknown');
  const [controllerScale, setControllerScale] = useState(1.0);
  // 'landing', 'game', 'settings', 'editor' — landing shows once per session
  const [currentView, setCurrentView] = useState(() =>
    sessionStorage.getItem('cloudplay-entered') ? 'game' : 'landing'
  );
  const [showMenu, setShowMenu] = useState(false);
  const [menuDockVisible, setMenuDockVisible] = useState(true);
  const [inputStats, setInputStats] = useState({
    rttMs: 0,
    sendRateHz: 0,
    ackRateHz: 0,
    lastInputAgeMs: 0,
    bufferedAmount: 0,
    serverApplyMs: 0,
    latestAckSequence: 0,
    sequenceGaps: 0,
    staleSequences: 0,
    droppedSends: 0,
  });
  const wsRef = useRef(null);
  const pendingInputPacketsRef = useRef(new Map());
  const inputSendTimesRef = useRef([]);
  const inputAckTimesRef = useRef([]);

  const trimRecentTimes = (items, now) => {
    while (items.length && now - items[0] > 1000) {
      items.shift();
    }
  };

  const registerInputPacket = useCallback((sequence, sentAt, bufferedAmount, sent) => {
    const now = performance.now();

    if (sent) {
      pendingInputPacketsRef.current.set(sequence, sentAt);
      inputSendTimesRef.current.push(now);
    }

    trimRecentTimes(inputSendTimesRef.current, now);
    trimRecentTimes(inputAckTimesRef.current, now);

    setInputStats(prev => ({
      ...prev,
      sendRateHz: inputSendTimesRef.current.length,
      ackRateHz: inputAckTimesRef.current.length,
      lastInputAgeMs: sent ? 0 : prev.lastInputAgeMs,
      bufferedAmount,
      droppedSends: sent ? prev.droppedSends : prev.droppedSends + 1,
    }));
  }, []);

  useEffect(() => {
    console.log('Connecting to:', INPUT_WS_URL);

    const connect = () => {
      const ws = new WebSocket(INPUT_WS_URL);
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
          } else if (payload?.type === 'input_ack') {
            const now = performance.now();
            const sentAt = pendingInputPacketsRef.current.get(payload.sequence);
            if (typeof sentAt === 'number') {
              pendingInputPacketsRef.current.delete(payload.sequence);
              inputAckTimesRef.current.push(now);
              trimRecentTimes(inputSendTimesRef.current, now);
              trimRecentTimes(inputAckTimesRef.current, now);

              setInputStats(prev => ({
                ...prev,
                rttMs: now - sentAt,
                sendRateHz: inputSendTimesRef.current.length,
                ackRateHz: inputAckTimesRef.current.length,
                lastInputAgeMs: now - sentAt,
                serverApplyMs: Number(payload.serverApplyMs || 0),
                latestAckSequence: payload.sequence,
                sequenceGaps: prev.sequenceGaps + Number(payload.sequenceGap || 0),
                staleSequences: prev.staleSequences + (payload.staleSequence ? 1 : 0),
              }));
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
                  Cloud Gaming Controller v2.0
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Views */}
      {currentView === 'landing' && (
        <LandingScreen
          apiBase={API_BASE}
          serverIP={SERVER_IP}
          wsStatus={wsStatus}
          onPlay={() => {
            sessionStorage.setItem('cloudplay-entered', '1');
            setCurrentView('game');
          }}
        />
      )}

      {currentView === 'game' && (
        <GamepadController
          wsRef={wsRef}
          serverStatus={wsStatus}
          controllerMode={controllerMode}
          controllerScale={controllerScale}
          setControllerScale={setControllerScale}
          menuDockVisible={menuDockVisible}
          onHideMenuDock={hideMenuDock}
          onShowMenuDock={showMenuDock}
          serverIP={SERVER_IP}
          apiBase={API_BASE}
          inputStats={inputStats}
          onInputPacketSent={registerInputPacket}
        />
      )}

      {currentView === 'settings' && (
        <SettingsPage
          apiBase={API_BASE}
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
