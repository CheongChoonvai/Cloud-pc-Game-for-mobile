import { useEffect, useState } from 'react';

const statusColor = (status) => {
    if (status === 'connected') return '#22c55e';
    if (status === 'error') return '#f59e0b';
    return '#ef4444';
};

const IconButton = ({ label, onClick, children }) => (
    <button
        type="button"
        className="edge-toolbar-button"
        aria-label={label}
        title={label}
        onClick={onClick}
    >
        {children}
    </button>
);

const NavigationDock = ({ status, onNavigate, onToggleMenu }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    const revealToolbar = () => {
        setIsVisible(true);
        window.clearTimeout(window.__cloudGameToolbarTimer);
        window.__cloudGameToolbarTimer = window.setTimeout(() => {
            setIsVisible(false);
        }, 3000);
    };

    const toggleFullscreen = async () => {
        const root = document.documentElement;

        try {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                const request = root.requestFullscreen || root.webkitRequestFullscreen;
                if (request) await request.call(root);
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) await exit.call(document);
            }
        } catch (error) {
            console.warn('Fullscreen request failed:', error);
        }
    };

    useEffect(() => {
        const syncFullscreenState = () => {
            setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
        };

        revealToolbar();
        document.addEventListener('pointerdown', revealToolbar, { passive: true });
        document.addEventListener('fullscreenchange', syncFullscreenState);
        document.addEventListener('webkitfullscreenchange', syncFullscreenState);

        return () => {
            window.clearTimeout(window.__cloudGameToolbarTimer);
            document.removeEventListener('pointerdown', revealToolbar);
            document.removeEventListener('fullscreenchange', syncFullscreenState);
            document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
        };
    }, []);

    return (
        <div className={`edge-toolbar ${isVisible ? 'visible' : 'hidden'}`}>
            <div className="edge-toolbar-status" aria-label={`Controller ${status}`}>
                <span className="toolbar-dot" style={{ backgroundColor: statusColor(status) }} />
                <span>Controller</span>
            </div>

            <IconButton label="Menu" onClick={onToggleMenu}>
                <span aria-hidden="true">☰</span>
            </IconButton>

            <IconButton label="Settings" onClick={() => onNavigate('settings')}>
                <span aria-hidden="true">⚙</span>
            </IconButton>

            <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
                <span aria-hidden="true">{isFullscreen ? '↙' : '⛶'}</span>
            </IconButton>
        </div>
    );
};

export default NavigationDock;
