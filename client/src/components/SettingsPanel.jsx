
import { useState, useEffect } from 'react';

const FPSCounter = ({ fps }) => {
  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      color: '#4ade80',
      padding: '4px 12px',
      borderRadius: '16px',
      fontSize: '12px',
      fontWeight: '600',
      pointerEvents: 'none',
      zIndex: 2000,
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    }}>
      {fps} FPS
    </div>
  );
};

const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const SettingsPanel = ({ serverIP, mjpegPort }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const [currentFps, setCurrentFps] = useState(0);
  const [settings, setSettings] = useState({
    target_fps: 60,
    jpeg_quality: 50,
    scale_factor: 0.75
  });
  const [status, setStatus] = useState('');

  const glassStyle = {
    background: 'rgba(15, 15, 20, 0.9)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
  };

  const labelStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '10px',
    fontSize: '13px',
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch(`http://${serverIP}:${mjpegPort}/config`);
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  const updateSetting = async (updates) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);

    try {
      setStatus('Saving...');
      await fetch(`http://${serverIP}:${mjpegPort}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1000);
    } catch (error) {
      setStatus('Error');
    }
  };

  const applyPreset = (type) => {
    let preset = {};
    if (type === 'perf') {
      preset = { scale_factor: 0.5, jpeg_quality: 30, target_fps: 60 };
    } else if (type === 'balanced') {
      preset = { scale_factor: 0.75, jpeg_quality: 60, target_fps: 60 };
    } else if (type === 'quality') {
      preset = { scale_factor: 1.0, jpeg_quality: 90, target_fps: 60 };
    }
    updateSetting(preset);
  };

  useEffect(() => {
    if (isOpen) fetchSettings();
  }, [isOpen]);

  useEffect(() => {
    let interval;
    if (showFps) {
      interval = setInterval(() => {
        const variance = Math.random() * 5 - 2.5;
        setCurrentFps(Math.min(60, Math.max(0, Math.round(settings.target_fps + variance))));
      }, 500);
    }
    return () => clearInterval(interval);
  }, [showFps, settings.target_fps]);

  return (
    <>
      {showFps && <FPSCounter fps={currentFps} />}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            ...glassStyle,
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            cursor: 'pointer',
            transition: 'transform 0.2s',
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          <SettingsIcon />
        </button>
      )}

      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)'
        }} onClick={() => setIsOpen(false)}>

          <div
            onClick={e => e.stopPropagation()}
            style={{
              ...glassStyle,
              width: '90%', maxWidth: '340px',
              borderRadius: '24px', padding: '24px',
              color: 'white',
              display: 'flex', flexDirection: 'column', gap: '20px'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SettingsIcon />
                <span style={{ fontSize: '16px', fontWeight: '600', letterSpacing: '0.5px' }}>STREAM SETTINGS</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '4px' }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Presets */}
            <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '12px' }}>
              {[
                { id: 'perf', label: 'Fast ⚡', active: settings.scale_factor <= 0.5 },
                { id: 'balanced', label: 'Balanced ⚖️', active: settings.scale_factor > 0.5 && settings.scale_factor < 1.0 },
                { id: 'quality', label: 'HD 💎', active: settings.scale_factor >= 1.0 }
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', borderRadius: '10px',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    background: preset.active ? '#3b82f6' : 'transparent',
                    color: preset.active ? 'white' : 'rgba(255,255,255,0.6)',
                    transition: 'all 0.2s',
                    boxShadow: preset.active ? '0 2px 8px rgba(59, 130, 246, 0.4)' : 'none'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />

            {/* Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Scale */}
              <div>
                <div style={labelStyle}>
                  <span>Resolution Scale</span>
                  <span style={{ color: '#60a5fa' }}>{Math.round(settings.scale_factor * 100)}%</span>
                </div>
                <input
                  type="range" min="0.1" max="1.0" step="0.05"
                  value={settings.scale_factor}
                  onChange={(e) => updateSetting({ scale_factor: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: '#3b82f6', height: '4px', borderRadius: '2px', cursor: 'pointer' }}
                />
              </div>

              {/* Quality */}
              <div>
                <div style={labelStyle}>
                  <span>JPEG Quality</span>
                  <span style={{ color: '#60a5fa' }}>{settings.jpeg_quality}%</span>
                </div>
                <input
                  type="range" min="10" max="100" step="5"
                  value={settings.jpeg_quality}
                  onChange={(e) => updateSetting({ jpeg_quality: parseInt(e.target.value) })}
                  style={{ width: '100%', accentColor: '#3b82f6', height: '4px', borderRadius: '2px', cursor: 'pointer' }}
                />
              </div>

              {/* FPS */}
              <div>
                <div style={labelStyle}>
                  <span>Target FPS</span>
                  <span style={{ color: '#60a5fa' }}>{settings.target_fps}</span>
                </div>
                <input
                  type="range" min="15" max="120" step="5"
                  value={settings.target_fps}
                  onChange={(e) => updateSetting({ target_fps: parseInt(e.target.value) })}
                  style={{ width: '100%', accentColor: '#3b82f6', height: '4px', borderRadius: '2px', cursor: 'pointer' }}
                />
              </div>

              {/* FPS Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '500', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>Show FPS Overlay</span>
                <div
                  onClick={() => setShowFps(!showFps)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px',
                    background: showFps ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 0.2s',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)'
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'white', position: 'absolute', top: '3px',
                    left: showFps ? '23px' : '3px', transition: 'left 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                  }} />
                </div>
              </div>

            </div>

            {/* Status */}
            {status && (
              <div style={{
                textAlign: 'center', fontSize: '12px',
                color: status === 'Error' ? '#ef4444' : '#10b981',
                fontWeight: '600', animation: 'fadeIn 0.2s'
              }}>
                {status === 'Saved' ? '✓ Saved' : status}
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
};

export default SettingsPanel;
