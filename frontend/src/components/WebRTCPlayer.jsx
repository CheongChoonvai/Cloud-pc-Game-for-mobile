import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Native WebRTC video player.
 *
 * Creates an RTCPeerConnection in the app itself (no iframe), POSTs the SDP
 * offer to the backend's /api/stream/offer endpoint, and renders the incoming
 * H264 track. Auto-reconnects when the connection drops.
 */
export default function WebRTCPlayer({ apiBase, stunServer = 'stun:stun.l.google.com:19302' }) {
    const videoRef = useRef(null);
    const pcRef = useRef(null);
    const retryTimerRef = useRef(null);
    const statsTimerRef = useRef(null);
    const [status, setStatus] = useState('connecting');
    const [errorDetail, setErrorDetail] = useState('');
    const [fps, setFps] = useState(0);

    const cleanup = useCallback(() => {
        if (statsTimerRef.current) {
            clearInterval(statsTimerRef.current);
            statsTimerRef.current = null;
        }
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
    }, []);

    const scheduleReconnect = useCallback((connectFn) => {
        if (retryTimerRef.current) return;
        retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            connectFn();
        }, 3000);
    }, []);

    const connect = useCallback(async () => {
        cleanup();
        setStatus('connecting');
        setErrorDetail('');

        const pc = new RTCPeerConnection({ iceServers: [{ urls: stunServer }] });
        pcRef.current = pc;

        pc.ontrack = (event) => {
            if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0];
            }
            setStatus('connected');

            // Minimize playout delay on supporting browsers
            for (const receiver of pc.getReceivers()) {
                if (receiver.track?.kind !== 'video') continue;
                if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
                else if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0;
            }

            // Lightweight FPS readout
            let prev = null;
            statsTimerRef.current = setInterval(async () => {
                try {
                    const report = await pc.getStats();
                    report.forEach((stat) => {
                        if (stat.type === 'inbound-rtp' && stat.kind === 'video' && !stat.isRemote) {
                            if (stat.framesPerSecond) {
                                setFps(stat.framesPerSecond);
                            } else if (prev && stat.framesDecoded != null) {
                                const seconds = (stat.timestamp - prev.timestamp) / 1000;
                                if (seconds > 0) setFps((stat.framesDecoded - prev.framesDecoded) / seconds);
                            }
                            prev = { timestamp: stat.timestamp, framesDecoded: stat.framesDecoded };
                        }
                    });
                } catch {
                    // stats are best-effort
                }
            }, 1000);
        };

        pc.onconnectionstatechange = () => {
            if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
                setStatus('disconnected');
                cleanup();
                scheduleReconnect(connect);
            }
        };

        try {
            const transceiver = pc.addTransceiver('video', { direction: 'recvonly' });
            const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
            const h264 = codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
            if (h264.length > 0 && transceiver.setCodecPreferences) {
                transceiver.setCodecPreferences(h264);
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const response = await fetch(`${apiBase}/api/stream/offer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sdp: pc.localDescription.sdp,
                    type: pc.localDescription.type,
                }),
            });

            if (!response.ok) {
                let detail = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body.detail) detail = body.detail;
                } catch {
                    // non-JSON error body
                }
                throw new Error(detail);
            }

            const answer = await response.json();
            await pc.setRemoteDescription(answer);
        } catch (error) {
            console.error('[WebRTC] connect failed:', error);
            setStatus('error');
            setErrorDetail(String(error.message || error));
            cleanup();
            scheduleReconnect(connect);
        }
    }, [apiBase, stunServer, cleanup, scheduleReconnect]);

    useEffect(() => {
        connect();
        return () => {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            cleanup();
        };
    }, [connect, cleanup]);

    return (
        <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {status !== 'connected' && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: status === 'error' ? '#ffb4ae' : 'var(--text-1, rgba(255,255,255,0.92))',
                        background: 'var(--glass-bg-strong, rgba(18,20,26,0.72))',
                        border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
                        backdropFilter: 'blur(24px) saturate(1.4)',
                        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                        padding: '14px 22px',
                        borderRadius: 16,
                        fontSize: 13,
                        fontWeight: 500,
                        textAlign: 'center',
                        maxWidth: '80%',
                    }}
                >
                    {status === 'connecting' && 'Connecting to your PC…'}
                    {status === 'disconnected' && 'Stream lost — reconnecting…'}
                    {status === 'error' && (
                        <>
                            Can't reach the stream — retrying
                            <div style={{ opacity: 0.55, marginTop: 6, fontSize: 11, fontWeight: 400 }}>{errorDetail}</div>
                        </>
                    )}
                </div>
            )}
            {status === 'connected' && fps > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'max(12px, env(safe-area-inset-top))',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        color: 'var(--text-2, rgba(255,255,255,0.6))',
                        background: 'var(--glass-bg-strong, rgba(18,20,26,0.72))',
                        border: '1px solid var(--glass-border-soft, rgba(255,255,255,0.07))',
                        backdropFilter: 'blur(24px) saturate(1.4)',
                        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 500,
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {fps.toFixed(0)} fps
                </div>
            )}
        </div>
    );
}
