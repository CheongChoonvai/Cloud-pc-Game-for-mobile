import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import AnalogStick from './AnalogStick';
import ActionButton from './ActionButton';
import DPad from './DPad';

export default function GamepadController({ wsRef, serverStatus, serverIP, mjpegPort }) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showVideo, setShowVideo] = useState(true);
    const [showNav, setShowNav] = useState(true);
    const [opacity, setOpacity] = useState(0.8);
    const [uiScale, setUiScale] = useState(1.0); // New UI Scale State
    const [showSettings, setShowSettings] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    
    // MJPEG Settings
    const [mjpegSettings, setMjpegSettings] = useState({
        target_fps: 60,
        jpeg_quality: 95,
        scale_factor: 1.0,
        buffer_delay: 0.01
    });
    const [mjpegSettingsLoaded, setMjpegSettingsLoaded] = useState(false);
    const [currentFps, setCurrentFps] = useState(0);
    const videoImgRef = useRef(null);
    
    // Preset configurations
    const presets = {
        low: { target_fps: 30, jpeg_quality: 30, scale_factor: 0.5, buffer_delay: 0, label: 'Low (Fast)' },
        medium: { target_fps: 30, jpeg_quality: 60, scale_factor: 0.7, buffer_delay: 0, label: 'Medium' },
        high: { target_fps: 30, jpeg_quality: 85, scale_factor: 0.9, buffer_delay: 0.005, label: 'High (Quality)' },
        ultra: { target_fps: 60, jpeg_quality: 95, scale_factor: 1.0, buffer_delay: 0.01, label: 'Ultra (Best)' }
    };

    const mjpegUrl = `http://${serverIP}:${mjpegPort}/`;
    const mjpegConfigUrl = `http://${serverIP}:${mjpegPort}/config`;

    // Send WebSocket message helper
    const sendMessage = useCallback((data) => {
        if (wsRef?.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, [wsRef]);

    // Left stick - Movement
    const handleLeftStickMove = useCallback(({ x, y }) => {
        sendMessage({ type: 'left_stick', x, y });
    }, [sendMessage]);

    const handleLeftStickEnd = useCallback(() => {
        sendMessage({ type: 'left_stick', x: 0, y: 0 });
    }, [sendMessage]);

    // Right stick - Camera
    const handleRightStickMove = useCallback(({ x, y }) => {
        sendMessage({ type: 'right_stick', x, y });
    }, [sendMessage]);

    const handleRightStickEnd = useCallback(() => {
        sendMessage({ type: 'right_stick', x: 0, y: 0 });
    }, [sendMessage]);

    // Button handlers
    const createButtonHandler = useCallback((button) => ({
        onPress: () => sendMessage({ type: 'button', button, pressed: true }),
        onRelease: () => sendMessage({ type: 'button', button, pressed: false }),
    }), [sendMessage]);

    // D-Pad handlers
    const handleDPadPress = useCallback((direction) => {
        sendMessage({ type: 'dpad', direction, pressed: true });
    }, [sendMessage]);

    const handleDPadRelease = useCallback((direction) => {
        sendMessage({ type: 'dpad', direction, pressed: false });
    }, [sendMessage]);

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.();
            setIsFullscreen(true);
            screen.orientation?.lock?.('landscape').catch(() => { });
        } else {
            document.exitFullscreen?.();
            setIsFullscreen(false);
        }
    }, []);

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Load MJPEG settings
    const loadMjpegSettings = async () => {
        try {
            const response = await fetch(mjpegConfigUrl);
            if (response.ok) {
                const settings = await response.json();
                setMjpegSettings(settings);
                setMjpegSettingsLoaded(true);
            }
        } catch (error) {
            console.error('Failed to load MJPEG settings:', error);
        }
    };

    // Update MJPEG settings
    const updateMjpegSettings = async (newSettings) => {
        try {
            const response = await fetch(mjpegConfigUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newSettings),
            });
            if (response.ok) {
                const updated = await response.json();
                setMjpegSettings(updated);
                return true;
            }
        } catch (error) {
            console.error('Failed to update MJPEG settings:', error);
        }
        return false;
    };
    
    // Apply preset
    const applyPreset = async (presetName) => {
        const preset = presets[presetName];
        if (preset) {
            await updateMjpegSettings(preset);
        }
    };

    // Load settings when settings panel opens
    useEffect(() => {
        if (showSettings && !mjpegSettingsLoaded) {
            loadMjpegSettings();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showSettings, mjpegSettingsLoaded, serverIP, mjpegPort]);
    
    // Track FPS by monitoring video stream frame loads
    useEffect(() => {
        if (!showVideo || !videoImgRef.current) return;
        
        let frameCount = 0;
        let lastTime = Date.now();
        const fpsInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000; // seconds
            if (elapsed > 0) {
                const fps = frameCount / elapsed;
                setCurrentFps(fps);
                frameCount = 0;
                lastTime = now;
            }
        }, 1000); // Update every second
        
        // Count frames by monitoring image load events
        const handleLoad = () => {
            frameCount++;
        };
        const img = videoImgRef.current;
        img.addEventListener('load', handleLoad);
        
        return () => {
            clearInterval(fpsInterval);
            img.removeEventListener('load', handleLoad);
        };
    }, [showVideo]);

    // QR Scanner Effect
    useEffect(() => {
        let scanner = null;
        if (showScanner) {
            scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );

            scanner.render((decodedText, decodedResult) => {
                try {
                    const data = JSON.parse(decodedText);
                    if (data.ip && data.port) {
                        // Handle success
                        console.log("Connect to:", data);
                        scanner.clear();
                        setShowScanner(false);

                        // Valid QR: Save to local storage and reload
                        // We use localStorage to pass this to a hypothetical App.jsx or just reload with query params
                        // For this implementation, we'll try to update the URL
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('server', data.ip);
                        newUrl.searchParams.set('port', data.port);
                        if (data.mjpeg_port) newUrl.searchParams.set('mjpeg', data.mjpeg_port);

                        window.location.href = newUrl.toString();
                    }
                } catch (e) {
                    console.error("Invalid QR Code", e);
                }
            }, (error) => {
                // QR Code scanning error (ignore, noisy)
            });
        }

        return () => {
            if (scanner) {
                try { scanner.clear(); } catch (e) { }
            }
        };
    }, [showScanner]);

    return (
        <div className="gamepad-controller">
            {/* Video stream background */}
            {showVideo && (
                <div className="video-background">
                    <img ref={videoImgRef} src={mjpegUrl} alt="Game Stream" className="video-stream" />
                </div>
            )}

            {/* Center Controls moved down to layout */}

            {/* Settings Popover (Centered) */}
            {showSettings && (
                <div className="settings-popover glass-panel" style={{ top: '60px', left: '50%', transform: 'translateX(-50%)', right: 'auto' }}>
                    <button className="close-scanner" style={{ position: 'sticky', top: 0, float: 'right', marginBottom: '8px', fontSize: 16, zIndex: 10 }} onClick={() => setShowSettings(false)}>✕</button>
                    <div className="setting-item">
                        <label>Controller Opacity</label>
                        <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.1"
                            value={opacity}
                            onChange={(e) => setOpacity(parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="setting-item">
                        <label>Controller Size (Scale)</label>
                        <input
                            type="range"
                            min="0.5"
                            max="1.2"
                            step="0.05"
                            value={uiScale}
                            onChange={(e) => setUiScale(parseFloat(e.target.value))}
                        />
                    </div>
                    
                    {/* MJPEG Video Settings - Simplified */}
                    <div className="setting-item" style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '12px' }}>
                        <label style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', display: 'block' }}>📺 Video Quality</label>
                        
                        {/* Preset Buttons */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <button
                                onClick={() => applyPreset('low')}
                                style={{
                                    padding: '8px',
                                    fontSize: '11px',
                                    background: mjpegSettings.jpeg_quality <= 40 ? 'rgba(0, 200, 100, 0.3)' : 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '6px',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                ⚡ Low
                            </button>
                            <button
                                onClick={() => applyPreset('medium')}
                                style={{
                                    padding: '8px',
                                    fontSize: '11px',
                                    background: mjpegSettings.jpeg_quality > 40 && mjpegSettings.jpeg_quality <= 70 ? 'rgba(0, 200, 100, 0.3)' : 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '6px',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                ⚖️ Medium
                            </button>
                            <button
                                onClick={() => applyPreset('high')}
                                style={{
                                    padding: '8px',
                                    fontSize: '11px',
                                    background: mjpegSettings.jpeg_quality > 70 && mjpegSettings.jpeg_quality <= 90 ? 'rgba(0, 200, 100, 0.3)' : 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '6px',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                🎨 High
                            </button>
                            <button
                                onClick={() => applyPreset('ultra')}
                                style={{
                                    padding: '8px',
                                    fontSize: '11px',
                                    background: mjpegSettings.jpeg_quality > 90 ? 'rgba(0, 200, 100, 0.3)' : 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: '6px',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                ✨ Ultra
                            </button>
                        </div>
                        
                        {/* Simple Quality Slider */}
                        <div className="setting-item" style={{ marginTop: '8px' }}>
                            <label style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span>Quality: {mjpegSettings.jpeg_quality}%</span>
                                <span style={{ color: currentFps >= mjpegSettings.target_fps * 0.9 ? '#00ff9d' : currentFps >= mjpegSettings.target_fps * 0.7 ? '#ffaa00' : '#ff5555' }}>
                                    {currentFps > 0 ? `${currentFps.toFixed(1)} FPS` : '-- FPS'}
                                </span>
                            </label>
                            <input
                                type="range"
                                min="20"
                                max="100"
                                step="5"
                                value={mjpegSettings.jpeg_quality}
                                onChange={(e) => {
                                    const newQuality = parseInt(e.target.value);
                                    // Auto-adjust other settings based on quality
                                    let newScale = mjpegSettings.scale_factor;
                                    let newFps = mjpegSettings.target_fps;
                                    let newDelay = mjpegSettings.buffer_delay;
                                    
                                    if (newQuality <= 40) {
                                        newScale = 0.5;
                                        newFps = 30;
                                        newDelay = 0;
                                    } else if (newQuality <= 70) {
                                        newScale = 0.7;
                                        newFps = 30;
                                        newDelay = 0;
                                    } else if (newQuality <= 90) {
                                        newScale = 0.9;
                                        newFps = 30;
                                        newDelay = 0.005;
                                    } else {
                                        newScale = 1.0;
                                        newFps = 60;
                                        newDelay = 0.01;
                                    }
                                    
                                    const newSettings = {
                                        jpeg_quality: newQuality,
                                        scale_factor: newScale,
                                        target_fps: newFps,
                                        buffer_delay: newDelay
                                    };
                                    setMjpegSettings({ ...mjpegSettings, ...newSettings });
                                    updateMjpegSettings(newSettings);
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                        
                        {/* Current Settings Display */}
                        <div style={{ marginTop: '8px', fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Res: {Math.round(mjpegSettings.scale_factor * 100)}%</span>
                            <span>Target: {mjpegSettings.target_fps} FPS</span>
                        </div>
                    </div>
                    
                    <div className="setting-item" style={{ marginTop: '12px' }}>
                        <button
                            className="scan-btn"
                            onClick={() => {
                                setShowSettings(false);
                                setShowScanner(true);
                            }}
                        >
                            📷 Scan QR Code to Connect
                        </button>
                    </div>
                    <div className="setting-item" style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: '#aaa' }}>Status:</span>
                            <span className={`status-text ${serverStatus}`} style={{ color: serverStatus === 'connected' ? '#00ff9d' : '#ff5555' }}>
                                {serverStatus === 'connected' ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                    <div className="setting-item" style={{ marginTop: '8px', display: 'flex', gap: '10px' }}>
                        <button className="nav-icon-btn" onClick={() => setShowVideo(!showVideo)} title="Toggle Video" style={{ flex: 1, borderRadius: 8, background: 'rgba(255,255,255,0.1)' }}>
                            {showVideo ? '📺 Video On' : '🚫 Video Off'}
                        </button>
                        <button className="nav-icon-btn" onClick={toggleFullscreen} title="Fullscreen" style={{ flex: 1, borderRadius: 8, background: 'rgba(255,255,255,0.1)' }}>
                            ⛶ Fullscreen
                        </button>
                    </div>
                </div>
            )}



            {/* QR Scanner Modal */}
            {
                showScanner && (
                    <div className="scanner-modal glass-panel">
                        <button className="close-scanner" onClick={() => setShowScanner(false)}>✕</button>
                        <h3>Scan Server QR</h3>
                        <div id="reader" style={{ width: '300px' }}></div>
                    </div>
                )
            }

            {/* Main controller layout */}
            <div className="controller-layout" style={{ opacity: opacity, transform: `scale(${uiScale})`, transformOrigin: 'top center' }}>
                {/* Left side - Movement */}
                <div className="controller-left">
                    <div className="shoulder-group">
                        <ActionButton label="LT" color="#ffffff" size={50} {...createButtonHandler('LT')} className="trigger-btn left-trigger" />
                        <ActionButton label="LB" color="#ffffff" size={50} {...createButtonHandler('LB')} className="shoulder-btn left-shoulder" />
                    </div>
                    <AnalogStick
                        position="left"
                        onMove={handleLeftStickMove}
                        onEnd={handleLeftStickEnd}
                        size={120}
                        color="#ffffff"
                    />
                    <DPad
                        onPress={handleDPadPress}
                        onRelease={handleDPadRelease}
                    />
                </div>

                {/* Center - Shoulder buttons & Menu */}
                <div className="controller-center">
                    <div className="center-controls" style={{ padding: '4px 12px', gap: 12 }}>
                        {/* Connection Status Dot */}
                        <div
                            className={`status-dot ${serverStatus}`}
                            style={{
                                width: 8, height: 8, borderRadius: '50%',
                                boxShadow: serverStatus === 'connected' ? '0 0 8px #00ff9d' : '0 0 8px #ff5555'
                            }}
                        />

                        <ActionButton label="☰" color="#ffffff" size={36} {...createButtonHandler('SELECT')} className="menu-btn" />
                        <ActionButton label="▶" color="#ffffff" size={36} {...createButtonHandler('START')} className="menu-btn" />

                        {/* Settings Button (Integrated) */}
                        <button
                            className="nav-icon-btn"
                            onClick={() => setShowSettings(!showSettings)}
                            style={{ width: 36, height: 36, fontSize: 16 }}
                        >
                            ⚙️
                        </button>
                        {/* Fullscreen Button (Restored) */}
                        <button
                            className="nav-icon-btn"
                            onClick={toggleFullscreen}
                            style={{ width: 36, height: 36, fontSize: 16 }}
                        >
                            ⛶
                        </button>
                    </div>
                </div>

                {/* Right side - Actions */}
                <div className="controller-right">
                    <div className="shoulder-group">
                        <ActionButton label="RB" color="#ffffff" size={50} {...createButtonHandler('RB')} className="shoulder-btn right-shoulder" />
                        <ActionButton label="RT" color="#ffffff" size={50} {...createButtonHandler('RT')} className="trigger-btn right-trigger" />
                    </div>
                    <div className="action-buttons-grid">
                        <ActionButton label="Y" color="#ffffff" size={60} {...createButtonHandler('Y')} className="btn-y" />
                        <ActionButton label="X" color="#ffffff" size={60} {...createButtonHandler('X')} className="btn-x" />
                        <ActionButton label="B" color="#ffffff" size={60} {...createButtonHandler('B')} className="btn-b" />
                        <ActionButton label="A" color="#ffffff" size={60} {...createButtonHandler('A')} className="btn-a" />
                    </div>
                    <AnalogStick
                        position="right"
                        onMove={handleRightStickMove}
                        onEnd={handleRightStickEnd}
                        size={110}
                        color="#ffffff"
                    />
                </div>
            </div>
        </div >
    );
}
