/**
 * Floor7IntroUI.tsx — DOM layer for the captain's intro cutscene: cinematic
 * letterbox bars, the ironic laugh line on the LAUGH beat, and a skip button.
 * Driven by the beat index from Floor7IntroCutscene.
 */
import React from 'react';
import { F7_INTRO_BEATS } from './Floor7IntroCutscene';

interface Props { beat: number; onSkip: () => void; }

const Floor7IntroUI: React.FC<Props> = ({ beat, onSkip }) => {
    const laughing = beat === F7_INTRO_BEATS.LAUGH;
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, pointerEvents: 'none',
            fontFamily: '"Source Sans 3","Segoe UI",sans-serif' }}>
            <style>{`
                @keyframes f7c-bars { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                @keyframes f7c-laugh { 0%{transform:translate(-50%,6px) scale(0.96);opacity:0;}
                    100%{transform:translate(-50%,0) scale(1);opacity:1;} }
                @keyframes f7c-fadein { 0%{opacity:1;} 70%{opacity:1;} 100%{opacity:0;} }
            `}</style>
            {/* open from black — hides the first ~0.8s while the camera settles onto the boots */}
            <div style={{ position: 'absolute', inset: 0, background: '#000',
                animation: 'f7c-fadein 1.1s ease-out both' }} />
            {/* cinematic letterbox */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12%', background: '#080604',
                transformOrigin: 'top', animation: 'f7c-bars .5s ease-out both' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '12%', background: '#080604',
                transformOrigin: 'bottom', animation: 'f7c-bars .5s ease-out both' }} />

            {/* the laugh + "primeira vez?" line */}
            {laughing && (
                <div key="laugh" style={{ position: 'absolute', left: '50%', bottom: '15%',
                    transform: 'translateX(-50%)', maxWidth: 'min(92vw, 620px)', textAlign: 'center',
                    animation: 'f7c-laugh .45s ease-out both' }}>
                    <div style={{ color: '#caa56a', fontSize: 13, fontWeight: 700, letterSpacing: '0.22em',
                        textShadow: '0 2px 6px #000', marginBottom: 8 }}>CAPITÃO</div>
                    <div style={{ background: 'rgba(20,14,8,0.88)', border: '1px solid rgba(202,165,106,0.5)',
                        borderRadius: 12, padding: '12px 18px', color: '#f3e7cf', fontSize: 17, lineHeight: 1.4,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.6)' }}>
                        <span style={{ fontStyle: 'italic', opacity: 0.85 }}>Arr arr arr…</span> Primeira vez no mar, grumete?
                    </div>
                </div>
            )}

            {/* skip */}
            <button onClick={onSkip} style={{ position: 'absolute', right: 'calc(env(safe-area-inset-right,0px) + 18px)',
                bottom: 'calc(12% + 14px)', pointerEvents: 'auto', background: 'rgba(0,0,0,0.45)',
                border: '1px solid rgba(255,255,255,0.25)', color: '#e8dcc4', fontSize: 12, letterSpacing: '0.12em',
                borderRadius: 8, padding: '6px 12px', backdropFilter: 'blur(3px)' }}>PULAR ▸</button>
        </div>
    );
};

export default Floor7IntroUI;
