/** Automatic final act after the memory returns: wake, verdict, betrayal, Floor 9. */
import React, { useEffect, useRef, useState } from 'react';
import { f8, f8AdvanceFinale, f8BoardElevator, f8Subscribe, type F8Phase } from './f8Arquivo';
import { f8LookBackCue, f8ReadyCue, f8Ride9Cue, f8ShoveCue, f8WakeCue } from './floor8Sfx';

const DURATIONS: Partial<Record<F8Phase, number>> = {
    awakening: 3700, ready: 3900, lookBack: 4400, shove: 2100, ride9: 5000,
};
const FINALE = new Set<F8Phase>(['awakening', 'ready', 'lookBack', 'shove', 'ride9']);
const mono: React.CSSProperties = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' };

const AlteredElevator: React.FC = () => (
    <div className="f8e-cab" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'linear-gradient(90deg,#08090b,#24252a 18%,#111216 50%,#27282d 82%,#08090b)' }}>
        <div style={{ position: 'absolute', inset: '0 12%', borderLeft: '6px ridge #4c4d52', borderRight: '6px ridge #4c4d52', background: 'repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 2px,transparent 2px 38px),linear-gradient(#232429,#0d0e11)' }} />
        <div className="f8e-ceiling" style={{ position: 'absolute', left: '12%', right: '12%', top: 0, height: '19%', clipPath: 'polygon(0 0,100% 0,82% 100%,18% 100%)', background: 'linear-gradient(#090a0c,#35363a)', borderBottom: '2px solid #77756b' }} />
        <div className="f8e-light" style={{ position: 'absolute', top: '4.5%', left: '50%', width: 'min(42vw,390px)', height: 16, transform: 'translateX(-50%)', background: '#e9d9b0', boxShadow: '0 0 28px #f1dca4,0 0 120px rgba(235,210,160,.3)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '28%', transform: 'translateX(-50%)', width: 'min(44vw,340px)', padding: '18px 12px', textAlign: 'center', border: '2px solid #514b42', background: '#08090a', boxShadow: '0 18px 70px #000,inset 0 0 24px #19080d' }}>
            <div className="f8e-nine" style={{ color: '#f02f4d', font: '800 clamp(72px,19vw,150px)/.9 ui-monospace,monospace', textShadow: '0 0 18px #a40024,4px 0 #3ba6b0,-4px 0 #8f173f' }}>9</div>
            <div style={{ ...mono, marginTop: 12, color: '#e24c62', fontSize: 11, letterSpacing: 5 }}>SEM REGISTRO</div>
        </div>
        <div style={{ position: 'absolute', left: '18%', right: '18%', bottom: '9%', height: 8, background: '#090a0b', border: '1px solid #57585c', boxShadow: '0 18px 35px #000' }} />
        <div className="f8e-thread" style={{ position: 'absolute', left: '51%', top: '-10%', width: 3, height: '120%', background: '#b92747', boxShadow: '0 0 12px #f23d5e', transform: 'rotate(1.2deg)' }} />
        <div style={{ ...mono, position: 'absolute', left: 0, right: 0, bottom: '4%', textAlign: 'center', color: '#6d6870', fontSize: 9, letterSpacing: 4 }}>DESCIDA NÃO CATALOGADA</div>
    </div>
);

export const Floor8Finale: React.FC<{ onLeave: () => void }> = ({ onLeave }) => {
    const [, setRevision] = useState(0);
    const completed = useRef(false);
    const phase = f8.phase;
    useEffect(() => f8Subscribe(() => setRevision((v) => v + 1)), []);

    useEffect(() => {
        if (!FINALE.has(phase)) return;
        if (phase === 'awakening') f8WakeCue();
        if (phase === 'ready') f8ReadyCue();
        if (phase === 'lookBack') f8LookBackCue();
        if (phase === 'shove') f8ShoveCue();
        if (phase === 'ride9') f8Ride9Cue();
        const id = window.setTimeout(() => {
            if (phase === 'ride9') {
                if (!completed.current && f8BoardElevator()) { completed.current = true; onLeave(); }
            } else f8AdvanceFinale();
        }, DURATIONS[phase] ?? 1000);
        return () => window.clearTimeout(id);
    }, [phase, onLeave]);

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        (window as unknown as Record<string, unknown>).__f8finale = { next: f8AdvanceFinale, phase: () => f8.phase };
        return () => { delete (window as unknown as Record<string, unknown>).__f8finale; };
    }, []);

    if (!FINALE.has(phase)) return null;
    return (
        <div data-testid="f8-finale" style={{ position: 'fixed', inset: 0, zIndex: 76, pointerEvents: 'none', overflow: 'hidden' }}>
            {phase === 'awakening' && <>
                <div className="f8e-blackout" style={{ position: 'absolute', inset: 0, background: '#020204' }} />
                <div className="f8e-wake-copy" style={{ ...mono, position: 'absolute', left: 0, right: 0, bottom: '12%', textAlign: 'center', color: '#8b7b80', fontSize: 10, letterSpacing: 4 }}>ALGUMA COISA VOLTOU COM VOCÊ</div>
            </>}
            {phase === 'ready' && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 45%,transparent 22%,rgba(0,0,0,.64) 100%)' }}>
                <div className="f8e-ready" style={{ position: 'absolute', left: '8%', right: '8%', bottom: '13%', textAlign: 'center', color: '#f0e4d3', font: '600 clamp(24px,5.6vw,52px) Georgia,serif', textShadow: '0 4px 18px #000' }}>“Você está pronto.”<div style={{ ...mono, marginTop: 13, color: '#b18d58', fontSize: 10, letterSpacing: 4 }}>O ARQUIVISTA</div></div>
            </div>}
            {phase === 'lookBack' && <>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 56%,transparent 12%,rgba(0,0,0,.72) 100%)' }} />
                <div className="f8e-maint-copy" style={{ ...mono, position: 'absolute', left: 0, right: 0, top: '10%', textAlign: 'center', color: '#b84f5d', fontSize: 10, letterSpacing: 4 }}>O ELEVADOR NÃO ESTÁ MAIS LÁ</div>
            </>}
            {phase === 'shove' && <div className="f8e-fall" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 20%,rgba(104,33,48,.28),#000 68%)' }}><div className="f8e-shaft-lines" /></div>}
            {phase === 'ride9' && <AlteredElevator />}
            <div className="f8e-grain" style={{ position: 'absolute', inset: '-30%', opacity: .012, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 180 180\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'.9\'/%3E%3C/svg%3E")', backgroundSize: '29px 31px' }} />
            <style>{`
                @keyframes f8e-black{0%{opacity:1}25%{opacity:.93}100%{opacity:.08}}.f8e-blackout{animation:f8e-black 3.6s ease-out both}
                @keyframes f8e-copy{0%,20%{opacity:0;transform:translateY(9px)}45%,78%{opacity:.8;transform:none}100%{opacity:0}}.f8e-wake-copy{animation:f8e-copy 3.6s ease both}
                @keyframes f8e-ready{from{opacity:0;transform:translateY(15px);filter:blur(4px)}25%,78%{opacity:1;transform:none;filter:none}to{opacity:0}}.f8e-ready{animation:f8e-ready 3.8s ease both}
                @keyframes f8e-maint{0%,12%{opacity:0}33%,76%{opacity:1}100%{opacity:0}}.f8e-maint-copy{animation:f8e-maint 4.3s ease both}
                @keyframes f8e-fall{from{opacity:0;transform:scale(.5) rotate(0)}18%{opacity:1}to{opacity:1;transform:scale(2.4) rotate(9deg)}}.f8e-fall{animation:f8e-fall 2.1s cubic-bezier(.65,0,1,.4) both}
                .f8e-shaft-lines{position:absolute;inset:-40%;background:repeating-conic-gradient(from 0deg,transparent 0 8deg,rgba(137,41,58,.25) 9deg 10deg);animation:f8e-spin 1.7s linear infinite}@keyframes f8e-spin{to{transform:rotate(12deg)}}
                @keyframes f8e-cab{from{opacity:0;filter:blur(12px);transform:scale(1.12)}18%{opacity:1;filter:none;transform:none}}.f8e-cab{animation:f8e-cab 1s ease-out both}
                @keyframes f8e-light{0%,93%,100%{opacity:1}94%,97%{opacity:.18}95%,98%{opacity:.7}}.f8e-light{animation:f8e-light 2.2s steps(1) infinite}
                @keyframes f8e-nine{0%,88%,100%{transform:none}90%{transform:translateX(-6px) skewX(8deg)}92%{transform:translateX(5px)}}.f8e-nine{animation:f8e-nine 1.8s steps(1) infinite}
                @keyframes f8e-thread{50%{transform:rotate(1.2deg) translateX(4px)}}.f8e-thread{animation:f8e-thread 1.4s ease-in-out infinite}
                @keyframes f8e-grain{0%{transform:translate(0)}25%{transform:translate(3%,5%)}50%{transform:translate(-4%,2%)}75%{transform:translate(2%,-4%)}to{transform:translate(0)}}.f8e-grain{animation:f8e-grain .24s steps(2) infinite}
            `}</style>
        </div>
    );
};

export default Floor8Finale;
