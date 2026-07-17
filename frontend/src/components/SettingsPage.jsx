import { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QUALITY_PRESETS } from '../quality';

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

const sectionTitle = { margin: '0 0 14px 0', fontSize: '15px', fontWeight: '600' };

const connectToServer = (host) => {
    const url = new URL(window.location.href);
    url.searchParams.set('server', host);
    window.location.href = url.toString();
};

const SettingsPage = ({ apiBase, serverIP, quality, setQuality, onBack }) => {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState('');
    const [ipInput, setIpInput] = useState('');
    const [showScanner, setShowScanner] = useState(false);

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

    // QR scanner (QR contains the frontend URL, e.g. http://10.1.64.253:5173)
    useEffect(() => {
        if (!showScanner) return undefined;
        const scanner = new Html5QrcodeScanner(
            'settings-qr-reader',
            { fps: 10, qrbox: { width: 220, height: 220 } },
            false
        );
        scanner.render((decodedText) => {
            try {
                const url = new URL(decodedText);
                scanner.clear();
                setShowScanner(false);
                connectToServer(url.hostname);
            } catch {
                // Not a URL QR — ignore and keep scanning
            }
        }, () => { });
        return () => {
            try { scanner.clear(); } catch { /* already cleared */ }
        };
    }, [showScanner]);

    const handleManualConnect = () => {
        const host = ipInput.trim();
        if (host) connectToServer(host);
    };

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
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>

                {/* Server status */}
                <div style={{ ...glassStyle, padding: '22px', borderRadius: 'var(--radius-l)' }}>
                    <h2 style={sectionTitle}>Server</h2>
                    {error && (
                        <div style={{ color: 'var(--err)', fontSize: '13px' }}>
                            Cannot reach backend: {error}
                        </div>
                    )}
                    {info && (
                        <>
                            <div style={rowStyle}>
                                <span style={{ color: 'var(--text-2)' }}>Server IP</span>
                                <span>{info.server_ip}:{info.port}</span>
                            </div>
                            <div style={rowStyle}>
                                <span style={{ color: 'var(--text-2)' }}>Stream</span>
                                <span style={{ color: info.gstreamer_available ? 'var(--ok)' : 'var(--err)' }}>
                                    {info.gstreamer_available ? 'GStreamer WebRTC' : 'Unavailable'}
                                </span>
                            </div>
                            <div style={rowStyle}>
                                <span style={{ color: 'var(--text-2)' }}>Resolution</span>
                                <span>{info.video?.width}×{info.video?.height}</span>
                            </div>
                            <div style={rowStyle}>
                                <span style={{ color: 'var(--text-2)' }}>Target FPS</span>
                                <span>{info.video?.fps}</span>
                            </div>
                            <div style={{ ...rowStyle, borderBottom: 'none' }}>
                                <span style={{ color: 'var(--text-2)' }}>Bitrate</span>
                                <span>{((info.video?.bitrate || 0) / 1_000_000).toFixed(1)} Mbps</span>
                            </div>
                        </>
                    )}
                    {!info && !error && (
                        <div style={{ color: 'var(--text-2)', fontSize: '13px' }}>Loading…</div>
                    )}
                </div>

                {/* Connect to a different PC */}
                <div style={{ ...glassStyle, padding: '22px', borderRadius: 'var(--radius-l)' }}>
                    <h2 style={sectionTitle}>Connect to a PC</h2>
                    <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 }}>
                        Currently connected to <b style={{ color: 'var(--text-1)' }}>{serverIP}</b>.
                        Enter another PC's IP or scan the QR code the backend prints.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 192.168.1.20"
                            value={ipInput}
                            onChange={(e) => setIpInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualConnect()}
                            style={{
                                flex: 1,
                                minWidth: 0,
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-m)',
                                border: '1px solid var(--glass-border)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-1)',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleManualConnect}
                            disabled={!ipInput.trim()}
                            style={{
                                padding: '0 18px',
                                borderRadius: 'var(--radius-m)',
                                border: 'none',
                                background: 'var(--accent)',
                                color: '#06111f',
                                fontWeight: '700',
                                fontSize: '13px',
                                cursor: 'pointer',
                                opacity: ipInput.trim() ? 1 : 0.35
                            }}
                        >
                            Connect
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowScanner(s => !s)}
                        style={{
                            width: '100%',
                            minHeight: '42px',
                            borderRadius: 'var(--radius-m)',
                            border: '1px solid var(--glass-border)',
                            background: 'transparent',
                            color: 'var(--text-2)',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: 'pointer'
                        }}
                    >
                        {showScanner ? 'Close scanner' : '📷 Scan QR code'}
                    </button>
                    {showScanner && (
                        <div id="settings-qr-reader" style={{ marginTop: '12px', borderRadius: 'var(--radius-m)', overflow: 'hidden' }} />
                    )}
                </div>

                {/* Video quality presets */}
                <div style={{ ...glassStyle, padding: '22px', borderRadius: 'var(--radius-l)' }}>
                    <h2 style={sectionTitle}>Video Quality</h2>
                    <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 }}>
                        Applies instantly — the stream reconnects at the new quality.
                        Higher settings need a strong WiFi signal and more PC encoding power.
                    </p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
                        gap: '8px'
                    }}>
                        {Object.entries(QUALITY_PRESETS).map(([key, preset]) => {
                            const active = quality === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setQuality(key)}
                                    style={{
                                        padding: '12px 8px',
                                        borderRadius: 'var(--radius-m)',
                                        border: active ? '1px solid transparent' : '1px solid var(--glass-border)',
                                        background: active ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                                        color: active ? '#06111f' : 'var(--text-1)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '3px',
                                        transition: 'background 120ms ease'
                                    }}
                                >
                                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{preset.label}</span>
                                    <span style={{
                                        fontSize: '10px',
                                        opacity: active ? 0.75 : 0.55,
                                        fontVariantNumeric: 'tabular-nums'
                                    }}>
                                        {preset.detail}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <p style={{ margin: '12px 0 0 0', fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.5 }}>
                        Controller size, opacity and camera sensitivity are in Menu → Edit Controller.
                    </p>
                </div>

            </div>
        </div>
    );
};

export default SettingsPage;
