/**
 * Floor3CutsceneUI.tsx — the DOM speech bubbles for the meet-the-Diabrete
 * cutscene. The 3D performer (Floor3Cutscene.tsx) drives `line`; this draws the
 * matching bubble in the rubber-hose idiom — chunky ink-outlined cartoon
 * balloon, wobbling, with the speaker's name on a little tab. Diabrete speaks
 * from the upper-right (where he stands); the player's interjections sit lower-
 * left. Letterbox bars frame it like a 1930s short. No skip — it plays out.
 */

import React from 'react';
import { DIABRETE_SCRIPT } from './diabreteScript';

const INK = '#140c08';

interface Props { line: number; }

const Floor3CutsceneUI: React.FC<Props> = ({ line }) => {
    const l = DIABRETE_SCRIPT[line];
    if (!l) return null;
    const isDevil = l.speaker === 'diabrete';

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 85, pointerEvents: 'none',
            fontFamily: "'Luckiest Guy', system-ui, sans-serif" }}>
            <style>{`
                @keyframes f3c-bars { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                @keyframes f3c-pop  { 0%{transform:scale(0.4) rotate(-6deg);opacity:0;}
                    60%{transform:scale(1.08) rotate(2deg);opacity:1;} 100%{transform:scale(1) rotate(-1.2deg);opacity:1;} }
                @keyframes f3c-wob  { 0%,100%{transform:rotate(-1.2deg);} 50%{transform:rotate(1.4deg);} }
            `}</style>

            {/* letterbox bars */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '11%', background: INK,
                transformOrigin: 'top', animation: 'f3c-bars .4s ease-out both' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '11%', background: INK,
                transformOrigin: 'bottom', animation: 'f3c-bars .4s ease-out both' }} />

            {/* speech bubble */}
            <div key={line} style={{
                position: 'absolute',
                ...(isDevil
                    ? { top: '16%', right: '6%', left: 'auto' }
                    : { bottom: '17%', left: '6%', right: 'auto' }),
                maxWidth: 'min(46vw, 460px)',
                animation: 'f3c-pop .35s cubic-bezier(.2,1.5,.4,1) both',
            }}>
                <div style={{ animation: 'f3c-wob 1.8s ease-in-out infinite' }}>
                    {/* name tab */}
                    <div style={{ display: 'inline-block', transform: 'rotate(-3deg)',
                        background: isDevil ? '#c0271a' : '#2b6fb0', color: '#fff',
                        WebkitTextStroke: `2px ${INK}`, paintOrder: 'stroke',
                        padding: '2px 14px', fontSize: 'min(3.4vw,22px)', letterSpacing: '.06em',
                        borderRadius: 8, marginBottom: -6, marginLeft: 14,
                        boxShadow: `0 3px 0 ${INK}` }}>
                        {isDevil ? 'O DIABRETE' : 'VOCÊ'}
                    </div>
                    {/* balloon */}
                    <div style={{
                        background: '#f6efe0', color: INK,
                        border: `4px solid ${INK}`, borderRadius: 22,
                        padding: '16px 22px', fontSize: 'min(4vw,26px)', lineHeight: 1.18,
                        letterSpacing: '.01em', boxShadow: `0 7px 0 ${INK}`,
                        fontFamily: "'Luckiest Guy', system-ui, sans-serif" }}>
                        {l.text}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Floor3CutsceneUI;
