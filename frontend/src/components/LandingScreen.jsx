import { useEffect, useState } from 'react';

const Dot = ({ state }) => (
    <span
        style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background:
                state === 'ok' ? 'var(--ok)' : state === 'wait' ? 'var(--text-3)' : 'var(--err)',
            display: 'inline-block',
        }}
    />
);

/**
 * First screen the player sees: server status + one big Play button.
 * Entering the game requests fullscreen + landscape in the same tap
 * (browsers only allow it inside a user gesture).
 */
export default function LandingScreen({ apiBase, serverIP, wsStatus, onPlay }) {
    const [info, setInfo] = useState(null);
    const [reachable, setReachable] = useState('wait'); // wait | ok | fail

    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            try {
                const response = await fetch(`${apiBase}/api/system/info`, { cache: 'no-store' });
                if (!response.ok) throw new Error();
                const data = await response.json();
                if (!cancelled) {
                    setInfo(data);
                    setReachable(data.gstreamer_available ? 'ok' : 'fail');
                }
            } catch {
                if (!cancelled) {
                    setInfo(null);
                    setReachable('fail');
                }
            }
        };
        check();
        const timer = setInterval(check, 3000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [apiBase]);

    const serverState = reachable;
    const controllerState = wsStatus === 'connected' ? 'ok' : wsStatus === 'error' ? 'fail' : 'wait';
    const ready = serverState === 'ok';

    const handlePlay = async () => {
        const root = document.documentElement;
        try {
            const request = root.requestFullscreen || root.webkitRequestFullscreen;
            if (request) await request.call(root);
            await screen.orientation?.lock?.('landscape');
        } catch {
            // Fullscreen/orientation may be rejected (iOS Safari) — still play.
        }
        onPlay();
    };

    return (
        <div className="landing">
            <div className="landing-card">
                <div className="landing-brand">
                    <h1 className="landing-title">Cloud Play</h1>
                    <p className="landing-subtitle">Your PC games, on this phone</p>
                </div>

                <div className="landing-status">
                    <div className="landing-status-row">
                        <span className="landing-status-label">
                            <Dot state={serverState} /> PC connection
                        </span>
                        <span className="landing-status-value">
                            {serverState === 'ok'
                                ? `${info?.server_ip ?? serverIP}`
                                : serverState === 'wait'
                                    ? 'Checking…'
                                    : 'Not reachable'}
                        </span>
                    </div>
                    <div className="landing-status-row">
                        <span className="landing-status-label">
                            <Dot state={serverState} /> Screen stream
                        </span>
                        <span className="landing-status-value">
                            {info
                                ? `${info.video?.width}×${info.video?.height} · ${info.video?.fps} fps`
                                : '—'}
                        </span>
                    </div>
                    <div className="landing-status-row">
                        <span className="landing-status-label">
                            <Dot state={controllerState} /> Controller
                        </span>
                        <span className="landing-status-value">
                            {controllerState === 'ok' ? 'Ready' : controllerState === 'wait' ? 'Connecting…' : 'Offline'}
                        </span>
                    </div>
                </div>

                <div className="landing-actions">
                    <button
                        type="button"
                        className="landing-play"
                        disabled={!ready}
                        onClick={handlePlay}
                    >
                        {ready ? 'Start Playing' : 'Waiting for PC…'}
                    </button>
                    {serverState === 'fail' && (
                        <button
                            type="button"
                            className="landing-secondary"
                            onClick={() => window.location.reload()}
                        >
                            Retry connection
                        </button>
                    )}
                </div>

                <p className="landing-hint">
                    {serverState === 'fail'
                        ? `Start the backend on your PC, then open http://${serverIP || 'PC-IP'}:5173 here`
                        : 'Rotate to landscape for the best experience'}
                </p>
            </div>
        </div>
    );
}
