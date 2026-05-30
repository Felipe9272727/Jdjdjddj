/**
 * CartoonIntro.tsx — the "everything turns cartoon" intro that plays when the
 * elevator opens onto Floor 3. Sepia 1930s rubber-hose styling: an iris-in, the
 * two white cartoon gloves POP into frame one after the other ("puck… puck!"),
 * a wobbly hand-drawn title boings in, a little "ta-da", then it irises out.
 *
 * Audio is file-based (see cartoonAudio.ts): real CC0 ragtime + pre-rendered
 * cartoon SFX — nothing synthesised live.
 */

import { useEffect, useRef, useState } from 'react';
import { preloadCartoonAudio, playCartoonSfx } from './cartoonAudio';

const INK = '#140c08';
const CREAM = '#f4ecda';

// A chunky rubber-hose 4-finger glove (white fill, bold black ink line).
function Glove({ flip = false }: { flip?: boolean }) {
    return (
        <svg viewBox="0 0 140 180" width="100%" height="100%"
            style={{ transform: flip ? 'scaleX(-1)' : 'none', overflow: 'visible' }}>
            <g fill={CREAM} stroke={INK} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round">
                {/* fingers */}
                <rect x="40"  y="20" width="20" height="70" rx="10" />
                <rect x="62"  y="10" width="20" height="80" rx="10" />
                <rect x="84"  y="18" width="20" height="72" rx="10" />
                <rect x="106" y="30" width="19" height="60" rx="10" />
                {/* thumb */}
                <rect x="14" y="70" width="22" height="48" rx="11" transform="rotate(-28 25 94)" />
                {/* palm */}
                <path d="M34 70 q-6 40 14 70 q22 22 50 14 q26 -8 28 -40 l0 -44 q-44 10 -92 0 z" />
                {/* cuff */}
                <path d="M44 150 q26 14 52 4 l6 18 q-32 14 -64 0 z" fill="#ffffff" />
            </g>
        </svg>
    );
}

interface Props {
    audioCtx: AudioContext | null;
    muted: boolean;
    onDone: () => void;
}

export default function CartoonIntro({ audioCtx, muted, onDone }: Props) {
    // staged choreography flags
    const [stage, setStage] = useState(0); // 0 iris-in, 1 left glove, 2 right glove, 3 title, 4 hold, 5 iris-out
    const doneRef = useRef(false);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const finish = () => {
        if (doneRef.current) return;
        doneRef.current = true;
        onDone();   // ragtime keeps looping as the Floor 3 music (App owns it)
    };

    useEffect(() => {
        let active = true;
        const sfx = (name: Parameters<typeof playCartoonSfx>[1], opts?: Parameters<typeof playCartoonSfx>[2]) => {
            if (audioCtx && !muted) playCartoonSfx(audioCtx, name, opts);
        };
        const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(() => { if (active) fn(); }, ms)); };

        (async () => {
            if (audioCtx) {
                try { if (audioCtx.state === 'suspended') await audioCtx.resume(); } catch { /* ignore */ }
                await preloadCartoonAudio(audioCtx);
            }
            if (!active) return;
            // Choreography
            at(150,  () => setStage(1));                      // iris done → left glove
            at(180,  () => sfx('puck', { gain: 0.9 }));
            at(620,  () => { setStage(2); sfx('puck', { gain: 0.9, rate: 1.12 }); }); // right glove "puck!"
            at(1150, () => { setStage(3); sfx('boing', { gain: 0.7 }); });            // title boings in
            at(1750, () => sfx('tada', { gain: 0.8 }));                               // ta-da
            at(4200, () => { setStage(5); sfx('transform', { gain: 0.5 }); });        // iris-out
            at(4900, finish);
        })();

        return () => {
            active = false;
            timers.current.forEach(clearTimeout);
            timers.current = [];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const irisOut = stage >= 5;

    return (
        <div
            onClick={finish}
            style={{
                position: 'fixed', inset: 0, zIndex: 80, cursor: 'pointer',
                background: irisOut ? 'transparent' : CREAM,
                clipPath: irisOut
                    ? 'circle(0% at 50% 52%)'
                    : (stage === 0 ? 'circle(0% at 50% 52%)' : 'circle(150% at 50% 52%)'),
                transition: 'clip-path 0.6s ease-in-out',
                overflow: 'hidden',
                fontFamily: "'Luckiest Guy', system-ui, sans-serif",
            }}
        >
            <style>{`
                @keyframes ci-pop { 0%{transform:translateY(120%) scale(0.4) rotate(var(--r,0deg));}
                    60%{transform:translateY(-12%) scale(1.12) rotate(var(--r,0deg));}
                    80%{transform:translateY(4%) scale(0.96) rotate(var(--r,0deg));}
                    100%{transform:translateY(0%) scale(1) rotate(var(--r,0deg));} }
                @keyframes ci-title { 0%{transform:scale(0) rotate(-12deg);} 55%{transform:scale(1.25) rotate(6deg);}
                    75%{transform:scale(0.9) rotate(-3deg);} 100%{transform:scale(1) rotate(-2deg);} }
                @keyframes ci-wobble { 0%,100%{transform:rotate(-2deg);} 50%{transform:rotate(2deg);} }
                @keyframes ci-grain { 0%{opacity:.08;} 50%{opacity:.16;} 100%{opacity:.10;} }
            `}</style>

            {/* old-film sepia vignette + flicker grain */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'radial-gradient(circle at 50% 48%, rgba(0,0,0,0) 52%, rgba(40,24,10,0.55) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'multiply',
                background: 'repeating-linear-gradient(0deg, rgba(60,40,20,0.05) 0 2px, transparent 2px 4px)',
                animation: 'ci-grain 0.5s steps(2) infinite' }} />

            {/* title */}
            {stage >= 3 && !irisOut && (
                <div style={{ position: 'absolute', top: '14%', left: 0, right: 0, textAlign: 'center' }}>
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

            {/* the two gloves popping in */}
            {!irisOut && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: '8%',
                    display: 'flex', justifyContent: 'center', gap: 'min(8vw, 90px)', height: 'min(42vh, 320px)' }}>
                    <div style={{ width: 'min(34vw,240px)', ['--r' as any]: '-14deg',
                        animation: stage >= 1 ? 'ci-pop 0.5s cubic-bezier(.2,1.5,.4,1) both' : 'none',
                        opacity: stage >= 1 ? 1 : 0 }}>
                        <Glove />
                    </div>
                    <div style={{ width: 'min(34vw,240px)', ['--r' as any]: '14deg',
                        animation: stage >= 2 ? 'ci-pop 0.5s cubic-bezier(.2,1.5,.4,1) both' : 'none',
                        opacity: stage >= 2 ? 1 : 0 }}>
                        <Glove flip />
                    </div>
                </div>
            )}

            {/* skip hint */}
            {!irisOut && (
                <div style={{ position: 'absolute', bottom: 14, right: 18, fontSize: 13, color: INK, opacity: 0.7,
                    letterSpacing: '0.12em' }}>
                    toque para pular ▸
                </div>
            )}
        </div>
    );
}
