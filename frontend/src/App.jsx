import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER_IP, API_BASE, INPUT_WS_URL } from './config';
import GamepadController from './components/GamepadController';
import SettingsPage from './components/SettingsPage';
import ControllerEditor from './components/ControllerEditor';
import NavigationDock from './components/NavigationDock';
import LandingScreen from './components/LandingScreen';
import './App.css';

const DEFAULT_VISIBLE = {
  lt: true, rt: true,
  lb: true, rb: true,
  dpad: true,
  faceButtons: true,
  leftStick: true,
  rightStick: true,
};

const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};

const loadNumber = (key, fallback) => {
  const value = parseFloat(localStorage.getItem(key));
  return Number.isFinite(value) ? value : fallback;
};

function App() {
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [controllerMode, setControllerMode] = useState('unknown');
  // 'landing', 'game', 'settings', 'editor' — landing shows once per session
  const [currentView, setCurrentView] = useState(() =>
    sessionStorage.getItem('cloudplay-entered') ? 'game' : 'landing'
  );
  const [showMenu, setShowMenu] = useState(false);
  const [menuDockVisible, setMenuDockVisible] = useState(true);
  const [showVideo, setShowVideo] = useState(true);

  // Persisted controller preferences
  const [controllerScale, setControllerScale] = useState(() => loadNumber('cp-scale', 1.0));
  const [controllerOpacity, setControllerOpacity] = useState(() => loadNumber('cp-opacity', 0.8));
  const [sensitivity, setSensitivity] = useState(() => loadNumber('cp-sensitivity', 20));
  const [visibleControls, setVisibleControls] = useState(() => loadJSON('cp-visible', DEFAULT_VISIBLE));
  const [quality, setQuality] = useState(() => localStorage.getItem('cp-quality') || 'auto');
  const [showStatusBar, setShowStatusBar] = useState(() => localStorage.getItem('cp-statusbar') === '1');

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
  const sensitivityRef = useRef(sensitivity);
  const pendingInputPacketsRef = useRef(new Map());
  const inputSendTimesRef = useRef([]);
  const inputAckTimesRef = useRef([]);

  useEffect(() => { localStorage.setItem('cp-quality', quality); }, [quality]);
  useEffect(() => { localStorage.setItem('cp-statusbar', showStatusBar ? '1' : '0'); }, [showStatusBar]);
  useEffect(() => { localStorage.setItem('cp-scale', String(controllerScale)); }, [controllerScale]);
  useEffect(() => { localStorage.setItem('cp-opacity', String(controllerOpacity)); }, [controllerOpacity]);
  useEffect(() => { localStorage.setItem('cp-visible', JSON.stringify(visibleControls)); }, [visibleControls]);
  useEffect(() => {
    sensitivityRef.current = sensitivity;
    localStorage.setItem('cp-sensitivity', String(sensitivity));
  }, [sensitivity]);

  // Push sensitivity to the PC (called on change and after every reconnect)
  const sendSensitivity = useCallback((value) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'set_sensitivity', value: Math.round(value) }));
    }
  }, []);

  const updateSensitivity = useCallback((value) => {
    setSensitivity(value);
    sendSensitivity(value);
  }, [sendSensitivity]);

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
    let disposed = false;
    let reconnectTimer = null;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(INPUT_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsStatus('connected');
        // Re-apply the player's sensitivity after every (re)connect
        ws.send(JSON.stringify({ type: 'set_sensitivity', value: Math.round(sensitivityRef.current) }));
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
        if (disposed) return;
        console.log('WebSocket disconnected');
        setWsStatus('disconnected');
        // Auto-reconnect after 3 seconds
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsStatus('error');
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
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

  const menuButtonStyle = {
    padding: '14px', borderRadius: '14px', border: 'none',
    background: 'rgba(255,255,255,0.08)', color: 'white',
    fontSize: '15px', fontWeight: '600', cursor: 'pointer'
  };

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
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', letterSpacing: '-0.01em' }}>Menu</h2>
                  <button onClick={() => setShowMenu(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                </div>

                <button onClick={() => setShowMenu(false)} style={menuButtonStyle}>
                  Resume ▶
                </button>

                <button onClick={() => navigateTo('editor')} style={menuButtonStyle}>
                  Edit Controller 🎮
                </button>

                <button onClick={() => navigateTo('settings')} style={menuButtonStyle}>
                  Settings ⚙
                </button>

                <button
                  onClick={() => setShowVideo(v => !v)}
                  style={menuButtonStyle}
                >
                  {showVideo ? 'Video Off 🚫' : 'Video On 📺'}
                </button>

                <button
                  onClick={() => {
                    setShowMenu(false);
                    setMenuDockVisible(false);
                  }}
                  style={menuButtonStyle}
                >
                  Hide Menu Dock
                </button>

                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-3)', textAlign: 'center' }}>
                  Cloud Play
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

      {/* Game stays mounted under Settings/Editor so the stream never drops */}
      {currentView !== 'landing' && (
        <GamepadController
          wsRef={wsRef}
          serverStatus={wsStatus}
          controllerMode={controllerMode}
          controllerScale={controllerScale}
          controllerOpacity={controllerOpacity}
          visibleControls={visibleControls}
          showVideo={showVideo}
          quality={quality}
          showStatusBar={showStatusBar}
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
          serverIP={SERVER_IP}
          quality={quality}
          setQuality={setQuality}
          onBack={() => setCurrentView('game')}
        />
      )}

      {currentView === 'editor' && (
        <ControllerEditor
          controllerScale={controllerScale}
          setControllerScale={setControllerScale}
          controllerOpacity={controllerOpacity}
          setControllerOpacity={setControllerOpacity}
          sensitivity={sensitivity}
          onSensitivityChange={updateSensitivity}
          visibleControls={visibleControls}
          setVisibleControls={setVisibleControls}
          showStatusBar={showStatusBar}
          setShowStatusBar={setShowStatusBar}
          onBack={() => setCurrentView('game')}
        />
      )}

    </div>
  );
}

export default App;
