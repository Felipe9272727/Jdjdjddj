/** Lightweight DOM presentation for the Floor 7 V2 arrival cinematic. */
import React from 'react';
import { F7_DIALOGUE, F7_INTRO_BEATS } from './Floor7IntroCutscene';

interface Props {
    beat: number;
    line: number;
    dimRef: React.MutableRefObject<number>;
    onSkip: () => void;
}

const BEAT_LABEL: Record<number, string> = {
    [F7_INTRO_BEATS.ARRIVAL]: 'ANDAR 7 · MARÉ MORTA',
    [F7_INTRO_BEATS.CAPTAIN]: 'O CAPITÃO',
    [F7_INTRO_BEATS.VANISH]: 'SEM VOLTA',
    [F7_INTRO_BEATS.OBJECTIVE]: 'NOVO OBJETIVO',
    [F7_INTRO_BEATS.HANDOFF]: 'PEGUE O BALDE',
};

const Floor7IntroUI: React.FC<Props> = ({ beat, line, dimRef, onSkip }) => {
    const dimEl = React.useRef<HTMLDivElement>(null);
    const mountedAt = React.useRef(performance.now());
    const skipped = React.useRef(false);

    const trySkip = React.useCallback(() => {
        // Prevent the same touch/key that starts the level from instantly skipping.
        if (skipped.current || performance.now() - mountedAt.current < 650) return;
        skipped.current = true;
        onSkip();
    }, [onSkip]);

    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            trySkip();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [trySkip]);

    React.useEffect(() => {
        let raf = 0;
        const tick = () => {
            if (dimEl.current) dimEl.current.style.opacity = String(Math.min(0.16, Math.max(0, dimRef.current || 0)));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [dimRef]);

    const text = line >= 0 && line < F7_DIALOGUE.length ? F7_DIALOGUE[line] : null;
    const objectiveBeat = beat === F7_INTRO_BEATS.OBJECTIVE || beat === F7_INTRO_BEATS.HANDOFF;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none',
            fontFamily: '"Source Sans 3","Segoe UI",sans-serif', color: '#f5ead5' }}>
            <style>{`
                @keyframes f7v2-bar { from { transform: scaleY(0); opacity:0 } to { transform: scaleY(1); opacity:1 } }
                @keyframes f7v2-enter { from { transform:translate(-50%,10px); opacity:0 } to { transform:translate(-50%,0); opacity:1 } }
                @keyframes f7v2-label { from { opacity:0; letter-spacing:.38em } to { opacity:.9; letter-spacing:.22em } }
                @keyframes f7v2-pulse { 50% { box-shadow:0 0 22px rgba(225,177,94,.24) } }
            `}</style>

            <div ref={dimEl} style={{ position: 'absolute', inset: 0, background: '#081015', opacity: 0 }} />
            <div style={{ position: 'absolute', inset: '0 0 auto', height: '8%', background: '#070706',
                transformOrigin: 'top', animation: 'f7v2-bar .42s ease-out both' }} />
            <div style={{ position: 'absolute', inset: 'auto 0 0', height: '8%', background: '#070706',
                transformOrigin: 'bottom', animation: 'f7v2-bar .42s ease-out both' }} />

            <div key={beat} style={{ position: 'absolute', top: '10.5%', left: '50%', transform: 'translateX(-50%)',
                whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, color: objectiveBeat ? '#e8bc72' : '#cfb98f',
                textShadow: '0 2px 8px #000', animation: 'f7v2-label .45s ease-out both' }}>
                {BEAT_LABEL[beat] ?? ''}
            </div>

            {objectiveBeat && (
                <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
                    border: '1px solid rgba(232,188,114,.55)', borderRadius: 999, padding: '7px 14px',
                    color: '#f0d39e', background: 'rgba(15,18,18,.68)', fontSize: 12, fontWeight: 700,
                    letterSpacing: '.08em', animation: 'f7v2-pulse 1.4s ease-in-out infinite' }}>
                    BALDE → LIMPE AS POÇAS
                </div>
            )}

            {text && (
                <div key={line} style={{ position: 'absolute', left: '50%', bottom: '11.5%',
                    transform: 'translateX(-50%)', width: 'min(88vw, 620px)', textAlign: 'center',
                    animation: 'f7v2-enter .3s ease-out both' }}>
                    <div style={{ color: '#dcb36f', fontSize: 11, fontWeight: 800, letterSpacing: '.24em',
                        textShadow: '0 2px 7px #000', marginBottom: 7 }}>CAPITÃO</div>
                    <div style={{ display: 'inline-block', background: 'rgba(14,13,10,.82)',
                        border: '1px solid rgba(220,179,111,.38)', borderRadius: 10, padding: '10px 16px',
                        color: '#f6ead3', fontSize: 'clamp(15px,3.5vw,18px)', lineHeight: 1.35,
                        boxShadow: '0 6px 20px rgba(0,0,0,.45)', textShadow: '0 1px 3px #000' }}>
                        {text}
                    </div>
                </div>
            )}

            <button onClick={trySkip} aria-label="Pular introdução" style={{ position: 'absolute',
                right: 'calc(env(safe-area-inset-right,0px) + 14px)', top: 'calc(8% + 12px)', pointerEvents: 'auto',
                background: 'rgba(8,10,10,.55)', border: '1px solid rgba(255,255,255,.22)', color: '#eee3cf',
                fontSize: 12, letterSpacing: '.12em', borderRadius: 7, padding: '9px 14px', cursor: 'pointer',
                backdropFilter: 'blur(3px)', touchAction: 'manipulation' }}>PULAR ▸</button>
        </div>
    );
};

export default Floor7IntroUI;
