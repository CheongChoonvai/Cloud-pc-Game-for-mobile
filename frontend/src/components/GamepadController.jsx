import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import AnalogStick from './AnalogStick';
import ActionButton from './ActionButton';
import DPad from './DPad';
import WebRTCPlayer from './WebRTCPlayer';

export default function GamepadController({
    wsRef,
    serverStatus,
    controllerMode,
    controllerScale,
    menuDockVisible,
    onHideMenuDock,
    onShowMenuDock,
    serverIP,
    apiBase,
    inputStats,
    onInputPacketSent
}) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showVideo, setShowVideo] = useState(true);
    const [opacity, setOpacity] = useState(0.8);
    const [showSettings, setShowSettings] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const inputSequenceRef = useRef(0);

    const inputModeLabel = controllerMode === 'xinput'
        ? 'XInput'
        : controllerMode === 'keyboard'
            ? 'Keys'
            : 'Offline';
    const videoStatusLabel = showVideo ? 'WebRTC' : 'Off';
    const controllerStatusLabel = serverStatus === 'connected'
        ? inputModeLabel
        : serverStatus === 'error'
            ? 'Reconnect'
            : 'Disconnected';

    // Send WebSocket message helper
    const sendMessage = useCallback((data) => {
        const socket = wsRef?.current;
        const sequence = ++inputSequenceRef.current;
        const sentAt = performance.now();
        const bufferedAmount = socket?.bufferedAmount ?? 0;

        if (socket?.readyState !== WebSocket.OPEN) {
            onInputPacketSent?.(sequence, sentAt, bufferedAmount, false);
            return;
        }

        if (socket.bufferedAmount > 4096) {
            onInputPacketSent?.(sequence, sentAt, socket.bufferedAmount, false);
            return;
        }

        socket.send(JSON.stringify({
            ...data,
            sequence,
            clientTimestamp: sentAt
        }));
        onInputPacketSent?.(sequence, sentAt, socket.bufferedAmount, true);
    }, [wsRef, onInputPacketSent]);

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

    const requestFullscreenMode = useCallback(async () => {
        const root = document.documentElement;

        try {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                const request = root.requestFullscreen || root.webkitRequestFullscreen;
                if (request) {
                    await request.call(root);
                }

                try {
                    await screen.orientation?.lock?.('landscape');
                } catch {
                    // iPhone Safari may reject this even when fullscreen is available.
                }
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) {
                    await exit.call(document);
                }
            }
        } catch (error) {
            console.warn('Fullscreen request failed:', error);
        }
    }, []);

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        requestFullscreenMode();
    }, [requestFullscreenMode]);

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, []);

    // QR Scanner Effect
    useEffect(() => {
        let scanner = null;
        if (showScanner) {
            scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );

            scanner.render((decodedText) => {
                try {
                    // QR contains the frontend URL (http://<pc-ip>:5173)
                    const url = new URL(decodedText);
                    scanner.clear();
                    setShowScanner(false);

                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('server', url.hostname);
                    window.location.href = newUrl.toString();
                } catch (e) {
                    console.error("Invalid QR Code", e);
                }
            }, () => {
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
            <div className="connection-pill" aria-label={`Video ${videoStatusLabel}, controller ${controllerStatusLabel}`}>
                <span className="connection-item">
                    <span className={`status-dot ${showVideo ? 'connected' : 'disconnected'}`} />
                    <span>Video {videoStatusLabel}</span>
                </span>
                <span className="connection-divider" />
                <span className="connection-item">
                    <span className={`status-dot ${serverStatus}`} />
                    <span>Controller {controllerStatusLabel}</span>
                </span>
                {serverStatus === 'connected' && inputStats && (
                    <>
                        <span className="connection-divider" />
                        <span className="connection-item">
                            <span>Input {inputStats.rttMs ? `${inputStats.rttMs.toFixed(0)}ms` : '--ms'}</span>
                            <span style={{ opacity: 0.65 }}>{inputStats.ackRateHz || 0}Hz</span>
                        </span>
                    </>
                )}
                {!menuDockVisible && (
                    <button
                        type="button"
                        onClick={() => onShowMenuDock?.()}
                        style={{
                            marginLeft: '8px',
                            padding: '4px 8px',
                            borderRadius: '999px',
                            border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        Menu
                    </button>
                )}
            </div>

            {/* Video stream background */}
            {showVideo && (
                <div className="video-background">
                    <WebRTCPlayer apiBase={apiBase} />
                </div>
            )}

            <div className="portrait-message">Rotate your phone for the best experience.</div>

            {serverStatus !== 'connected' && (
                <button
                    type="button"
                    className="controller-warning"
                    onClick={() => window.location.reload()}
                >
                    Controller disconnected - Retry
                </button>
            )}

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
                    <div className="setting-item" style={{ marginTop: '12px' }}>
                        <label>Menu Dock</label>
                        <button
                            type="button"
                            onClick={() => {
                                if (menuDockVisible) {
                                    onHideMenuDock?.();
                                } else {
                                    onShowMenuDock?.();
                                }
                            }}
                            style={{
                                padding: '12px 14px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.12)',
                                background: 'rgba(255,255,255,0.07)',
                                color: 'white',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            {menuDockVisible ? 'Hide Menu Dock' : 'Show Menu Dock'}
                        </button>
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
            <div className="controller-layout" style={{ opacity: opacity, transform: `scale(${controllerScale})`, transformOrigin: 'top center' }}>
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
