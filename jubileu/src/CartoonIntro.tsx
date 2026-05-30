/**
 * CartoonIntro.tsx — the wobbly hand-drawn TITLE card for the Floor 3 cartoon
 * intro. The heavy lifting (cream iris wipe, the rubber-hose gloves doing
 * "puck… puck!", and all the SFX) now happens in 3D inside the Canvas
 * (CartoonIntro3D.tsx). This DOM layer is just the title text on top, driven by
 * the `stage` that the 3D timeline pushes up — so the two stay in lock-step.
 * The intro can NOT be skipped: it plays out and dismisses itself, and this
 * layer never captures input (pointer-events: none).
 */

interface Props {
    stage: number;       // choreography stage from CartoonIntro3D (3 = title in, 5 = wiping out)
}

const INK = '#140c08';

export default function CartoonIntro({ stage }: Props) {
    const showTitle = stage >= 3 && stage < 5;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none',
                background: 'transparent',
                fontFamily: "'Luckiest Guy', system-ui, sans-serif",
            }}
        >
            <style>{`
                @keyframes ci-title { 0%{transform:scale(0) rotate(-12deg);} 55%{transform:scale(1.25) rotate(6deg);}
                    75%{transform:scale(0.9) rotate(-3deg);} 100%{transform:scale(1) rotate(-2deg);} }
                @keyframes ci-wobble { 0%,100%{transform:rotate(-2deg);} 50%{transform:rotate(2deg);} }
            `}</style>

            {/* wobbly title */}
            {showTitle && (
                <div style={{ position: 'absolute', top: '12%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ animation: 'ci-title 0.6s cubic-bezier(.2,1.4,.4,1) both' }}>
                        <div style={{ display: 'inline-block', animation: 'ci-wobble 1.6s ease-in-out infinite' }}>
                            <span style={{ fontSize: 'min(15vw, 96px)', color: '#c0271a', WebkitTextStroke: `min(0.9vw,7px) ${INK}`,
                                paintOrder: 'stroke', letterSpacing: '0.04em', textShadow: `0 6px 0 ${INK}` }}>ANDAR&nbsp;3</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 'min(4.2vw,26px)', color: INK, letterSpacing: '0.18em' }}>
                            ✦ AND NOW… IN GLORIOUS CARTOON ✦
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
