import { useState, useEffect } from 'react';

const SettingsPage = ({ apiBase, onBack }) => {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState('');

    const glassStyle = {
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border-soft)',
        boxShadow: 'var(--glass-shadow)'
    };

    const rowStyle = {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '11px 0',
        borderBottom: '1px solid var(--glass-border-soft)',
        fontSize: '13px',
        fontVariantNumeric: 'tabular-nums'
    };

    useEffect(() => {
        let cancelled = false;
        const fetchInfo = async () => {
            try {
                const response = await fetch(`${apiBase}/api/system/info`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (!cancelled) {
                    setInfo(data);
                    setError('');
                }
            } catch (err) {
                if (!cancelled) setError(String(err.message || err));
            }
        };
        fetchInfo();
        const timer = setInterval(fetchInfo, 5000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [apiBase]);

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'var(--bg-gradient)',
            zIndex: 2000,
            display: 'flex', flexDirection: 'column',
            padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))',
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
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em' }}>Settings</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>

                <div style={{ ...glassStyle, padding: '20px', borderRadius: '20px' }}>
                    <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', opacity: 0.9 }}>Server</h2>
                    {error && (
                        <div style={{ color: '#ff6b6b', fontSize: '13px' }}>
                            Cannot reach backend: {error}
                        </div>
                    )}
                    {info && (
                        <>
                            <div style={rowStyle}>
                                <span style={{ opacity: 0.7 }}>Server IP</span>
                                <span>{info.server_ip}:{info.port}</span>
                            </div>
                            <div style={rowStyle}>
                                <span style={{ opacity: 0.7 }}>Stream</span>
                                <span style={{ color: info.gstreamer_available ? 'var(--ok)' : 'var(--err)' }}>
                                    {info.gstreamer_available ? 'GStreamer WebRTC' : 'Unavailable'}
                                </span>
                            </div>
                            <div style={rowStyle}>
                                <span style={{ opacity: 0.7 }}>Resolution</span>
                                <span>{info.video?.width}x{info.video?.height}</span>
                            </div>
                            <div style={rowStyle}>
                                <span style={{ opacity: 0.7 }}>Target FPS</span>
                                <span>{info.video?.fps}</span>
                            </div>
                            <div style={{ ...rowStyle, borderBottom: 'none' }}>
                                <span style={{ opacity: 0.7 }}>Bitrate</span>
                                <span>{((info.video?.bitrate || 0) / 1_000_000).toFixed(1)} Mbps</span>
                            </div>
                        </>
                    )}
                    {!info && !error && (
                        <div style={{ opacity: 0.6, fontSize: '13px' }}>Loading…</div>
                    )}
                </div>

                <div style={{ ...glassStyle, padding: '20px', borderRadius: '20px' }}>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', opacity: 0.9 }}>Video Quality</h2>
                    <p style={{ margin: 0, fontSize: '13px', opacity: 0.6, lineHeight: 1.6 }}>
                        Resolution, FPS and bitrate are configured on the PC in <code>backend/.env</code>
                        (VIDEO_WIDTH, VIDEO_HEIGHT, TARGET_FPS, VIDEO_BITRATE). Restart the backend
                        after changing them.
                    </p>
                </div>

            </div>
        </div>
    );
};

export default SettingsPage;
