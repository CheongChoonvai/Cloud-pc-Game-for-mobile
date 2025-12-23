import React, { useEffect, useState, useCallback } from 'react';
import AnalogStick from './AnalogStick';
import ActionButton from './ActionButton';
import DPad from './DPad';

export default function GamepadController({ wsRef, serverStatus, serverIP, mjpegPort }) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showVideo, setShowVideo] = useState(true);
    const [showNav, setShowNav] = useState(true);

    const mjpegUrl = `http://${serverIP}:${mjpegPort}/`;

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

    return (
        <div className="gamepad-controller">
            {/* Video stream background */}
            {showVideo && (
                <div className="video-background">
                    <img src={mjpegUrl} alt="Game Stream" className="video-stream" />
                </div>
            )}

            {/* Minimal nav toggle button (always visible) */}
            <button
                className={`nav-toggle-btn ${showNav ? 'nav-open' : ''}`}
                onClick={() => setShowNav(!showNav)}
            >
                {showNav ? '✕' : '☰'}
            </button>

            {/* Collapsible status bar */}
            {showNav && (
                <div className="controller-status-bar">
                    <span className={`status-indicator ${serverStatus}`}>
                        ● {serverStatus === 'connected' ? 'Connected' : 'Disconnected'}
                    </span>
                    <div className="status-buttons">
                        <button className="nav-btn" onClick={() => setShowVideo(!showVideo)}>
                            {showVideo ? '📺' : '🎮'}
                        </button>
                        <button className="nav-btn" onClick={toggleFullscreen}>
                            ⛶
                        </button>
                    </div>
                </div>
            )}

            {/* Main controller layout */}
            <div className="controller-layout">
                {/* Left side - Movement */}
                <div className="controller-left">
                    <AnalogStick
                        position="left"
                        onMove={handleLeftStickMove}
                        onEnd={handleLeftStickEnd}
                        size={90}
                        color="#4a90d9"
                    />
                    <DPad
                        onPress={handleDPadPress}
                        onRelease={handleDPadRelease}
                    />
                </div>

                {/* Center - Shoulder buttons */}
                <div className="controller-center">
                    <div className="shoulder-buttons-top">
                        <ActionButton label="LB" color="#6c5ce7" size={45} {...createButtonHandler('LB')} className="shoulder-btn" />
                        <ActionButton label="RB" color="#6c5ce7" size={45} {...createButtonHandler('RB')} className="shoulder-btn" />
                    </div>
                    <div className="trigger-buttons">
                        <ActionButton label="LT" color="#a55eea" size={40} {...createButtonHandler('LT')} className="trigger-btn" />
                        <div className="center-controls">
                            <ActionButton label="☰" color="#636e72" size={32} {...createButtonHandler('SELECT')} className="menu-btn" />
                            <ActionButton label="▶" color="#636e72" size={32} {...createButtonHandler('START')} className="menu-btn" />
                        </div>
                        <ActionButton label="RT" color="#a55eea" size={40} {...createButtonHandler('RT')} className="trigger-btn" />
                    </div>
                </div>

                {/* Right side - Actions */}
                <div className="controller-right">
                    <div className="action-buttons-grid">
                        <ActionButton label="Y" color="#f39c12" size={48} {...createButtonHandler('Y')} className="btn-y" />
                        <ActionButton label="X" color="#3498db" size={48} {...createButtonHandler('X')} className="btn-x" />
                        <ActionButton label="B" color="#e74c3c" size={48} {...createButtonHandler('B')} className="btn-b" />
                        <ActionButton label="A" color="#2ecc71" size={48} {...createButtonHandler('A')} className="btn-a" />
                    </div>
                    <AnalogStick
                        position="right"
                        onMove={handleRightStickMove}
                        onEnd={handleRightStickEnd}
                        size={80}
                        color="#e17055"
                    />
                </div>
            </div>
        </div>
    );
}
