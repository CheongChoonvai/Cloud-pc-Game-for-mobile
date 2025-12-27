
import { useState, useEffect } from 'react';

const SettingsPage = ({ serverIP, mjpegPort, onBack }) => {
    const [settings, setSettings] = useState({
        target_fps: 60,
        jpeg_quality: 50,
        scale_factor: 0.75
    });
    const [status, setStatus] = useState('');

    const glassStyle = {
        background: 'rgba(20, 20, 30, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
    };

    const labelStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '10px',
        fontSize: '14px',
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

    const updateSetting = async (updates, shouldReload = false) => {
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

            if (shouldReload) {
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else {
                setTimeout(() => setStatus(''), 1000);
            }
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
        // Check if resolution changed, if so we need to reload
        const needsReload = preset.scale_factor !== settings.scale_factor;
        updateSetting(preset, needsReload);
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: '#0f0f13',
            zIndex: 2000,
            display: 'flex', flexDirection: 'column',
            padding: '24px',
            overflowY: 'auto'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'transparent', border: 'none', color: 'white',
                        fontSize: '24px', cursor: 'pointer', padding: '0 12px 0 0'
                    }}
                >
                    ←
                </button>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Settings</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>

                {/* Section: Presets */}
                <div style={{ ...glassStyle, padding: '20px', borderRadius: '20px' }}>
                    <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', opacity: 0.9 }}>Quick Presets</h2>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {[
                            { id: 'perf', label: 'Fast ⚡', desc: 'Max FPS', active: settings.scale_factor <= 0.5 },
                            { id: 'balanced', label: 'Balanced ⚖️', desc: 'Standard', active: settings.scale_factor > 0.5 && settings.scale_factor < 1.0 },
                            { id: 'quality', label: 'HD 💎', desc: 'Best Look', active: settings.scale_factor >= 1.0 }
                        ].map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => applyPreset(preset.id)}
                                style={{
                                    flex: 1, padding: '16px 8px', border: 'none', borderRadius: '16px',
                                    cursor: 'pointer',
                                    background: preset.active ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                    color: 'white',
                                    transition: 'all 0.2s',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
                                }}
                            >
                                <span style={{ fontSize: '16px', fontWeight: '700' }}>{preset.label}</span>
                                <span style={{ fontSize: '11px', opacity: 0.7 }}>{preset.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Section: Advanced */}
                <div style={{ ...glassStyle, padding: '24px', borderRadius: '20px' }}>
                    <h2 style={{ margin: '0 0 24px 0', fontSize: '16px', fontWeight: '600', opacity: 0.9 }}>Advanced Configuration</h2>

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
                                onChange={(e) => setSettings({ ...settings, scale_factor: parseFloat(e.target.value) })}
                                onMouseUp={() => updateSetting({ scale_factor: settings.scale_factor }, true)}
                                onTouchEnd={() => updateSetting({ scale_factor: settings.scale_factor }, true)}
                                style={{ width: '100%', accentColor: '#3b82f6', height: '6px', borderRadius: '3px' }}
                            />
                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                                <b>Note:</b> App will reload when changing resolution.
                            </div>
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
                                onChange={(e) => setSettings({ ...settings, jpeg_quality: parseInt(e.target.value) })}
                                onMouseUp={() => updateSetting({ jpeg_quality: settings.jpeg_quality })}
                                onTouchEnd={() => updateSetting({ jpeg_quality: settings.jpeg_quality })}
                                style={{ width: '100%', accentColor: '#3b82f6', height: '6px', borderRadius: '3px' }}
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
                                onChange={(e) => setSettings({ ...settings, target_fps: parseInt(e.target.value) })}
                                onMouseUp={() => updateSetting({ target_fps: settings.target_fps })}
                                onTouchEnd={() => updateSetting({ target_fps: settings.target_fps })}
                                style={{ width: '100%', accentColor: '#3b82f6', height: '6px', borderRadius: '3px' }}
                            />
                        </div>
                    </div>
                </div>

            </div>

            {status && (
                <div style={{
                    position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(16, 185, 129, 0.2)', color: '#34d399',
                    padding: '8px 24px', borderRadius: '20px', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: '600'
                }}>
                    {status === 'Saved' ? '✓ Settings Saved' : status}
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
