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
import Floor3Balao from './Floor3Balao';

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
            `}</style>

            {/* letterbox bars */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '11%', background: INK,
                transformOrigin: 'top', animation: 'f3c-bars .4s ease-out both' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '11%', background: INK,
                transformOrigin: 'bottom', animation: 'f3c-bars .4s ease-out both' }} />

            {/* O BALÃO É O DO ANDAR, e não mais um retângulo arredondado só
                desta cena. Ver `Floor3Balao`: a súplica e o grito já falavam com
                a linha fervilhando, e a apresentação — que é a PRIMEIRA coisa
                que o jogador ouve aqui — ainda usava um balão de outro jogo. O
                andar se apresentava com uma voz e terminava com outra. */}
            <Floor3Balao
                texto={l.text}
                dono={isDevil ? 'diabrete' : 'jogador'}
                serie={line}
                style={isDevil
                    ? { position: 'absolute', top: '15%', right: '6%' }
                    : { position: 'absolute', bottom: '18%', left: '6%' }}
            />
        </div>
    );
};

export default Floor3CutsceneUI;
