/**
 * Floor7IntroUI.tsx — DOM layer for the captain's intro cutscene: cinematic
 * letterbox bars, the timed multi-line dialogue, a transition dip that masks the
 * hard cuts, and a skip button. Driven by the beat + line index from the cutscene.
 */
import React from 'react';
import { F7_DIALOGUE } from './Floor7IntroCutscene';

interface Props {
    beat: number;
    line: number;                                          // active dialogue line index (-1 = none)
    dimRef: React.MutableRefObject<number>;                // 0..1 transition dip (read each frame, no re-render)
    onSkip: () => void;
}

const Floor7IntroUI: React.FC<Props> = ({ line, dimRef, onSkip }) => {
    const dimEl = React.useRef<HTMLDivElement>(null);
    // never let a player get stuck on the cutscene: Esc / Enter / Space also skip
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSkip(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onSkip]);
    // drive the transition-dip overlay straight from the ref each frame (the cutscene
    // writes dimRef in its useFrame); cheaper + smoother than routing it through state.
    React.useEffect(() => {
        let raf = 0;
        const tick = () => { if (dimEl.current) dimEl.current.style.opacity = String(dimRef.current ?? 0); raf = requestAnimationFrame(tick); };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [dimRef]);

    const text = line >= 0 && line < F7_DIALOGUE.length ? F7_DIALOGUE[line] : null;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none',
            fontFamily: '"Source Sans 3","Segoe UI",sans-serif' }}>
            <style>{`
                @keyframes f7c-bars { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                @keyframes f7c-line { 0%{transform:translate(-50%,8px);opacity:0;}
                    100%{transform:translate(-50%,0);opacity:1;} }
                @keyframes f7c-fadein { 0%{opacity:1;} 70%{opacity:1;} 100%{opacity:0;} }
            `}</style>
            {/* open from black — hides the first ~0.8s while the camera settles onto the boots */}
            <div style={{ position: 'absolute', inset: 0, background: '#000',
                animation: 'f7c-fadein 1.1s ease-out both' }} />
            {/* transition dip — darkens to mask the hard cuts; opacity driven by dimRef */}
            <div ref={dimEl} style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0 }} />
            {/* cinematic letterbox */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12%', background: '#080604',
                transformOrigin: 'top', animation: 'f7c-bars .5s ease-out both' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '12%', background: '#080604',
                transformOrigin: 'bottom', animation: 'f7c-bars .5s ease-out both' }} />

            {/* timed dialogue — one line at a time (re-animates on each new line via key) */}
            {text && (
                <div key={line} style={{ position: 'absolute', left: '50%', bottom: '15%',
                    transform: 'translateX(-50%)', maxWidth: 'min(92vw, 640px)', textAlign: 'center',
                    animation: 'f7c-line .4s ease-out both' }}>
                    <div style={{ color: '#caa56a', fontSize: 13, fontWeight: 700, letterSpacing: '0.22em',
                        textShadow: '0 2px 6px #000', marginBottom: 8 }}>CAPITÃO</div>
                    <div style={{ background: 'rgba(20,14,8,0.88)', border: '1px solid rgba(202,165,106,0.5)',
                        borderRadius: 12, padding: '12px 18px', color: '#f3e7cf', fontSize: 17, lineHeight: 1.4,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.6)' }}>
                        {text}
                    </div>
                </div>
            )}

            {/* skip — generous hit area, clearly above the canvas (Esc/Enter/Space also skip) */}
            <button onClick={onSkip} style={{ position: 'absolute', right: 'calc(env(safe-area-inset-right,0px) + 18px)',
                bottom: 'calc(12% + 14px)', pointerEvents: 'auto', background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.3)', color: '#f0e6d0', fontSize: 14, letterSpacing: '0.12em',
                borderRadius: 8, padding: '10px 18px', cursor: 'pointer', backdropFilter: 'blur(3px)' }}>PULAR ▸</button>
        </div>
    );
};

export default Floor7IntroUI;
