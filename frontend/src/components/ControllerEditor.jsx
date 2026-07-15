const glassStyle = {
    background: 'var(--glass-bg)',
    backdropFilter: 'var(--glass-blur)',
    WebkitBackdropFilter: 'var(--glass-blur)',
    border: '1px solid var(--glass-border-soft)',
    boxShadow: 'var(--glass-shadow)'
};

const sectionTitle = { margin: '0 0 6px 0', fontSize: '15px', fontWeight: '600' };
const sectionHint = { margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 };

const Slider = ({ label, value, display, min, max, step, onChange, onCommit }) => (
    <div>
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '8px', fontSize: '12px', color: 'var(--text-2)',
            textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500
        }}>
            <span>{label}</span>
            <span style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{display}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            onMouseUp={() => onCommit?.()}
            onTouchEnd={() => onCommit?.()}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
        />
    </div>
);

const Toggle = ({ checked, onChange }) => (
    <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '25px', flexShrink: 0 }}>
        <input
            type="checkbox"
            checked={checked}
            onChange={onChange}
            style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
            position: 'absolute', cursor: 'pointer', inset: 0,
            backgroundColor: checked ? 'var(--accent)' : 'rgba(255,255,255,0.16)',
            borderRadius: '25px', transition: 'background 200ms ease'
        }}>
            <span style={{
                position: 'absolute', height: '19px', width: '19px',
                left: checked ? '20px' : '3px', bottom: '3px',
                backgroundColor: 'white', borderRadius: '50%', transition: 'left 200ms ease'
            }} />
        </span>
    </label>
);

const CONTROL_LABELS = {
    leftStick: 'Left Stick (movement)',
    rightStick: 'Right Stick (camera)',
    faceButtons: 'Face Buttons (A B X Y)',
    dpad: 'D-Pad',
    lb: 'Left Bumper (LB)',
    rb: 'Right Bumper (RB)',
    lt: 'Left Trigger (LT)',
    rt: 'Right Trigger (RT)',
};

const ControllerEditor = ({
    controllerScale,
    setControllerScale,
    controllerOpacity,
    setControllerOpacity,
    sensitivity,
    onSensitivityChange,
    visibleControls,
    setVisibleControls,
    showStatusBar,
    setShowStatusBar,
    onBack
}) => {
    const toggleControl = (key) => {
        setVisibleControls(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const stepScale = (delta) => {
        setControllerScale(value => Math.min(1.4, Math.max(0.7, Number((value + delta).toFixed(2)))));
    };

    const stepBtn = {
        flex: 1,
        padding: '12px',
        borderRadius: 'var(--radius-s)',
        background: 'var(--glass-bg)',
        color: 'var(--text-1)',
        border: '1px solid var(--glass-border)',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '13px'
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
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em' }}>Edit Controller</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>

                {/* Sensitivity */}
                <div style={{ ...glassStyle, padding: '22px', borderRadius: 'var(--radius-l)' }}>
                    <h2 style={sectionTitle}>Camera Sensitivity</h2>
                    <p style={sectionHint}>
                        How fast the camera moves when you use the right stick.
                        Applied to your PC instantly — try it in game and adjust.
                    </p>
                    <Slider
                        label="Sensitivity"
                        value={sensitivity}
                        display={`${Math.round(sensitivity)}`}
                        min={1}
                        max={60}
                        step={1}
                        onChange={onSensitivityChange}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>
                        <span>Slow &amp; precise</span>
                        <span>Fast</span>
                    </div>
                </div>

                {/* Size & opacity */}
                <div style={{ ...glassStyle, padding: '22px', borderRadius: 'var(--radius-l)' }}>
                    <h2 style={sectionTitle}>Size &amp; Look</h2>
                    <p style={sectionHint}>
                        Fit the on-screen controller to your phone and grip.
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                        <button type="button" onClick={() => stepScale(-0.1)} style={stepBtn}>Smaller</button>
                        <button type="button" onClick={() => setControllerScale(1.0)} style={stepBtn}>Reset</button>
                        <button type="button" onClick={() => stepScale(0.1)} style={stepBtn}>Bigger</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <Slider
                            label="Scale"
                            value={controllerScale}
                            display={`${Math.round(controllerScale * 100)}%`}
                            min={0.7}
                            max={1.4}
                            step={0.05}
                            onChange={setControllerScale}
                        />
                        <Slider
                            label="Opacity"
                            value={controllerOpacity}
                            display={`${Math.round(controllerOpacity * 100)}%`}
                            min={0.2}
                            max={1}
                            step={0.05}
                            onChange={setControllerOpacity}
                        />
                    </div>
                </div>

                {/* Visible controls */}
                <div style={{ ...glassStyle, padding: '22px', borderRadius: 'var(--radius-l)' }}>
                    <h2 style={sectionTitle}>Visible Controls</h2>
                    <p style={sectionHint}>
                        Hide buttons your game doesn't need to free up screen space.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '11px 14px', background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--glass-border-soft)',
                            borderRadius: 'var(--radius-m)'
                        }}>
                            <span style={{ fontSize: '13px', fontWeight: '500' }}>Status bar (Stream · Input · ms · fps)</span>
                            <Toggle checked={!!showStatusBar} onChange={() => setShowStatusBar(v => !v)} />
                        </div>
                        {Object.entries(CONTROL_LABELS).map(([key, label]) => (
                            <div key={key} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '11px 14px', background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--glass-border-soft)',
                                borderRadius: 'var(--radius-m)'
                            }}>
                                <span style={{ fontSize: '13px', fontWeight: '500' }}>{label}</span>
                                <Toggle checked={!!visibleControls[key]} onChange={() => toggleControl(key)} />
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={onBack}
                    style={{
                        width: '100%', minHeight: '50px', border: 0,
                        borderRadius: 'var(--radius-m)', background: 'var(--accent)',
                        color: '#06111f', fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                        marginBottom: '8px'
                    }}
                >
                    Done
                </button>

            </div>
        </div>
    );
};

export default ControllerEditor;
