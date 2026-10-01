// Letreiro de lâmpadas que corre em volta do mostrador quando a cabine anda.
// Quatro quadros de um ciclo (lâmpada acesa a cada quatro, andando uma casa por
// quadro), fundo transparente; o render.mjs monta o atlas 2x2 que o jogo usa.
import React from 'react';
import {registerRoot, Composition, useCurrentFrame} from 'remotion';

export const W = 512, H = 288, N = 25, PERIODO = 4;
// Centro na base e raio em proporção do plano: no jogo o plano tem 2*(R/W) de largura do arco.
const CX = W / 2, CY = H - 16, R = 236;

const Letreiro = () => {
  const f = useCurrentFrame() % PERIODO;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{background: 'transparent'}}>
      <defs>
        <radialGradient id="halo"><stop offset="0" stopColor="#fff2b8" stopOpacity=".95"/><stop offset=".45" stopColor="#ffc24a" stopOpacity=".55"/><stop offset="1" stopColor="#ff9d1a" stopOpacity="0"/></radialGradient>
        <radialGradient id="acesa" cx=".4" cy=".35"><stop offset="0" stopColor="#ffffff"/><stop offset=".5" stopColor="#ffe48a"/><stop offset="1" stopColor="#e09a1e"/></radialGradient>
        <radialGradient id="apagada" cx=".4" cy=".35"><stop offset="0" stopColor="#cdb98a"/><stop offset="1" stopColor="#6e5426"/></radialGradient>
      </defs>
      {Array.from({length: N}, (_, i) => {
        const a = Math.PI * (1 - i / (N - 1));
        const x = CX + R * Math.cos(a), y = CY - R * Math.sin(a);
        const lit = (i + f) % PERIODO === 0;
        return <g key={i}>
          {lit && <circle cx={x} cy={y} r={20} fill="url(#halo)"/>}
          <circle cx={x} cy={y} r={7.5} fill="#3a2a10"/>
          <circle cx={x} cy={y} r={6} fill={lit ? 'url(#acesa)' : 'url(#apagada)'}/>
        </g>;
      })}
    </svg>
  );
};

registerRoot(() => <Composition id="Letreiro" component={Letreiro} width={W} height={H} fps={8} durationInFrames={PERIODO}/>);
