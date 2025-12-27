
import { useState } from 'react';

const ControllerEditor = ({ onBack }) => {
    // Mock state for button visibility
    const [visibleButtons, setVisibleButtons] = useState({
        lt: true, rt: true,
        lb: true, rb: true,
        dpad: true,
        faceButtons: true,
        leftStick: true,
        rightStick: true
    });

    const toggleButton = (key) => {
        setVisibleButtons(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const glassStyle = {
        background: 'rgba(20, 20, 30, 0.6)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
    };

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
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>Edit Controller</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>

                <div style={{ ...glassStyle, padding: '24px', borderRadius: '20px' }}>
                    <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', opacity: 0.9 }}>Visible Controls</h2>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>
                        Toggle which buttons appear on your screen.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {Object.entries({
                            lt: 'Left Trigger (LT)', rt: 'Right Trigger (RT)',
                            lb: 'Left Bumper (LB)', rb: 'Right Bumper (RB)',
                            dpad: 'D-Pad', faceButtons: 'Face Buttons (ABXY)',
                            leftStick: 'Left Stick', rightStick: 'Right Stick'
                        }).map(([key, label]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                                <span style={{ fontSize: '14px', fontWeight: '500' }}>{label}</span>
                                <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '24px' }}>
                                    <input
                                        type="checkbox"
                                        checked={visibleButtons[key]}
                                        onChange={() => toggleButton(key)}
                                        style={{ opacity: 0, width: 0, height: 0 }}
                                    />
                                    <span style={{
                                        position: 'absolute', cursor: 'pointer', inset: 0,
                                        backgroundColor: visibleButtons[key] ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                                        borderRadius: '24px', transition: '.4s'
                                    }}>
                                        <span style={{
                                            position: 'absolute', content: '""', height: '18px', width: '18px',
                                            left: visibleButtons[key] ? '19px' : '3px', bottom: '3px',
                                            backgroundColor: 'white', borderRadius: '50%', transition: '.4s'
                                        }} />
                                    </span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ ...glassStyle, padding: '24px', borderRadius: '20px' }}>
                    <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', opacity: 0.9 }}>Layout Mode</h2>
                    <button style={{
                        width: '100%', padding: '16px', borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.1)', border: '1px dashed rgba(255,255,255,0.2)',
                        color: 'rgba(255,255,255,0.6)', cursor: 'not-allowed'
                    }}>
                        Drag & Drop Editor (Coming Soon)
                    </button>
                </div>

            </div>
        </div>
    );
};

export default ControllerEditor;
