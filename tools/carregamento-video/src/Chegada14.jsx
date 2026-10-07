// CHEGADA AO ANDAR 14 — a montagem final. Os quadros vêm animados do Blender (tools/chegada14/cinema.py,
// 460 quadros, um por quadro daqui); os gráficos vêm do Manim (titulo.py: o título e o traço do O₂);
// aqui entram o corte, a luz do estouro, o tranco dos baques, o sufoco (vinheta que pulsa com o
// coração, a cor que foge), o embaçado do primeiro fôlego no vidro e o som (audio.py).
// Monta com: node tools/chegada14/render.mjs
import React from 'react';
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, interpolate } from 'remotion';

export const DUR = 472;
const BLENDER = 460;
const PLANOS = [['geral', 1, 84], ['porta', 85, 150], ['queda', 151, 210], ['pov', 211, 330], ['pega', 331, 410], ['visor', 411, 460]];
const DENTRO = 405;   // o capacete fecha na cabeça (quadro daqui = quadro do Blender − 1)
const BAQUES = [158, 169, 181, 193, 202];   // a cambalhota bate na areia
const c = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const liso = (f, a, b) => { const x = interpolate(f, [a, b], [0, 1], c); return x * x * (3 - 2 * x); };
const n4 = (n) => String(n).padStart(4, '0');

/** Sequência de PNG do Manim por cima do quadro, presa a um intervalo daqui. */
function Manim({ f, cena, de, quadros }) {
  const i = f - de;
  if (i < 0 || i >= quadros) return null;
  return <Img src={staticFile(`ch14-v3/manim/${cena}${n4(i)}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

export function Chegada14() {
  const f = useCurrentFrame();
  const qb = Math.min(BLENDER, f + 1);
  const plano = PLANOS.find(([, a, b]) => qb >= a && qb <= b)[0];

  // o sufoco: cresce do chão (pov) até o capacete fechar; depois some com o primeiro fôlego
  const sufoco = liso(f, 86, DENTRO - 6) * (1 - liso(f, DENTRO + 10, DENTRO + 40));
  const ritmo = .95 - .45 * sufoco;   // segundos entre batidas (o coração dispara)
  const batida = Math.exp(-((f / 24) % ritmo) * 9);
  // o tranco dos baques na queda
  const tranco = BAQUES.reduce((a, b) => a + (f >= b ? Math.exp(-(f - b) * .45) * 7 : 0), 0);
  const tx = Math.sin(f * 2.7) * tranco, ty = Math.cos(f * 3.1) * tranco * .8;
  const pulsa = 1 + batida * sufoco * .012;
  // a luz do estouro da porta
  const clarao = interpolate(f, [33, 36, 39, 58], [0, .85, .7, 0], c);   // as folhas estouram (quadro 37 do Blender)
  // o embaçado do vidro na expiração dentro do capacete
  const bafo = interpolate(f, [448, 456, 466, 472], [0, .42, .3, .18], c);
  const preto = Math.max(1 - liso(f, 0, 14), liso(f, 462, DUR - 1));
  const escuro = (.18 + sufoco * .55 + batida * sufoco * .18).toFixed(3);

  return <AbsoluteFill style={{ background: '#050403', overflow: 'hidden' }}>
    <Audio src={staticFile('ch14-v3/chegada.wav')} />
    <AbsoluteFill style={{ transform: `translate(${tx}px,${ty}px) scale(${pulsa * (tranco ? 1.02 : 1)})`,
      filter: `saturate(${1 - sufoco * .45}) contrast(${1 + sufoco * .12}) blur(${(batida * sufoco * 1.2).toFixed(2)}px)` }}>
      <Img src={staticFile(`ch14-v3/quadros/${plano}_${n4(qb)}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {/* a luva, renderizada à parte (cinema.py com K14_MAO=1) e posta por cima: no rosto no sufoco, arranhando a areia no chão */}
      {((qb >= 85 && qb <= 150) || (qb >= 258 && qb <= 330)) &&
        <Img src={staticFile(`ch14-v3/mao/mao_${plano}_${n4(qb)}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
    </AbsoluteFill>
    {/* poeira que o vento carrega por cima de tudo (fora do capacete) */}
    {f < DENTRO && Array.from({ length: 22 }, (_, i) => {
      const x = ((i * 97.3 + f * (3 + (i % 5) * 1.3)) % 1440) - 80, y = 120 + (i * 53 % 460) + Math.sin(f * .05 + i) * 12;
      return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 3 + (i % 3) * 2, height: 1.5, borderRadius: 2, background: '#ffd9a8',
        opacity: .1 + (i % 4) * .05, filter: 'blur(1px)', transform: 'rotate(-6deg)' }} />;
    })}
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 46%, transparent ${38 - sufoco * 22}%, rgba(10,4,3,${escuro}) 100%)` }} />
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 72%, rgba(255,240,222,.9) 0%, rgba(255,236,214,.35) 30%, transparent 60%)', opacity: bafo, filter: 'blur(6px)' }} />
    <Manim f={f} cena="Titulo" de={84} quadros={72} />
    <Manim f={f} cena="Folego" de={210} quadros={201} />
    <Manim f={f} cena="Alivio" de={412} quadros={51} />
    <AbsoluteFill style={{ background: '#ffe2b0', opacity: clarao, mixBlendMode: 'screen' }} />
    <AbsoluteFill style={{ background: '#000', opacity: preto }} />
  </AbsoluteFill>;
}
