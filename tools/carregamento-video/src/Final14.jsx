// O FINAL DO ANDAR 14 — as duas cutscenes pré-renderizadas. Quadros do Blender (tools/chegada14/final.py),
// gráficos do Manim (titulo_final.py), som (audio_final.py); aqui: as falas dela em legenda, o clarão do
// botão, o tremor das juntas, o branco da porta do laboratório e do mergulho no portal.
// Monta com: node tools/chegada14/render_final.mjs
import React from 'react';
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, interpolate } from 'remotion';

export const DUR_DESCIDA = 360, DUR_PORTAL = 480;
const c = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const n4 = (n) => String(n).padStart(4, '0');

const Manim = ({ f, cena, de, quadros }) => { const i = f - de; if (i < 0 || i >= quadros) return null;
  return <Img src={staticFile(`f14final/manim/${cena}${n4(i)}.png`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />; };

/** A fala dela, letra por letra, no mesmo estilo da caixa de diálogo do jogo. */
const Fala = ({ f, de, ate, texto }) => {
  if (f < de || f >= ate) return null;
  const n = Math.floor((f - de) * 2.2), o = interpolate(f, [de, de + 5, ate - 6, ate], [0, 1, 1, 0], c);
  return <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', opacity: o }}>
    <div style={{ width: 760, background: 'linear-gradient(180deg, rgba(10,6,16,.78), rgba(4,2,8,.88))', border: '1px solid rgba(160,120,255,.35)', borderRadius: 12, padding: '12px 18px 14px', fontFamily: 'Georgia, serif', color: '#ece4ff' }}>
      <div style={{ fontSize: 11, letterSpacing: 4, color: '#b49cff', marginBottom: 5 }}>A SOMBRA</div>
      <div style={{ fontSize: 19, lineHeight: 1.45 }}>{texto.slice(0, n)}</div>
    </div></div>;
};

export function FinalDescida() {
  const f = useCurrentFrame(), qb = Math.min(DUR_DESCIDA, f + 1);
  const clarao = interpolate(f, [117, 119, 132], [0, .55, 0], c);
  const tremor = interpolate(f, [150, 160, 196, 205], [0, 1, 1, 0], c) + interpolate(f, [326, 330, 345], [0, 1.4, 0], c);
  const tx = Math.sin(f * 2.3) * 3 * tremor, ty = Math.cos(f * 2.9) * 2.5 * tremor;
  const preto = 1 - interpolate(f, [0, 12], [0, 1], c), branco = interpolate(f, [338, 359], [0, 1], c);
  return <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
    <Audio src={staticFile('f14final/descida.wav')} />
    <AbsoluteFill style={{ transform: `translate(${tx}px,${ty}px) scale(1.02)` }}>
      <Img src={staticFile(`f14final/quadros/descida_${n4(qb)}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 46%, transparent 45%, rgba(8,4,12,.55) 100%)' }} />
    <Manim f={f} cena="PontoCego" de={214} quadros={69} />
    <Fala f={f} de={121} ate={196} texto="Segura firme. O chão aqui é mais velho que o hotel." />
    <AbsoluteFill style={{ background: '#d9b8ff', opacity: clarao, mixBlendMode: 'screen' }} />
    <AbsoluteFill style={{ background: '#fff1dc', opacity: branco }} />
    <AbsoluteFill style={{ background: '#000', opacity: preto }} />
  </AbsoluteFill>;
}

const DESPEDIDA = [
  [168, 228, 'Viu? Onde a mistura cai, o chão esquece onde está. É uma porta que ele não desenhou.'],
  [230, 290, 'Ela te leva de volta ao elevador. Eu fico. Se eu atravessar, ele me vê.'],
  [292, 352, 'Hóspede… você não é o único preso. Em cada andar tem gente que acha que é cenário.'],
  [354, 414, 'Se esforça. Tira todos eles daqui. Eu vou estar na sombra de cada andar, esperando.'],
];
export function FinalPortal() {
  const f = useCurrentFrame(), qb = Math.min(DUR_PORTAL, f + 1);
  const estouro = interpolate(f, [70, 72, 84], [0, .6, 0], c);
  const preto = 1 - interpolate(f, [0, 10], [0, 1], c), branco = interpolate(f, [440, 478], [0, 1], c);
  const tremor = interpolate(f, [72, 76, 92], [0, 1, 0], c);
  return <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
    <Audio src={staticFile('f14final/portal.wav')} />
    <AbsoluteFill style={{ transform: `translate(${Math.sin(f * 2.7) * 4 * tremor}px,${Math.cos(f * 3.1) * 3 * tremor}px) scale(1.02)` }}>
      <Img src={staticFile(`f14final/quadros/portal_${n4(qb)}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 46%, transparent 50%, rgba(8,4,12,.5) 100%)' }} />
    <Manim f={f} cena="AntiSimulacao" de={6} quadros={69} />
    <Manim f={f} cena="Selo" de={80} quadros={109} />
    {DESPEDIDA.map(([de, ate, t]) => <Fala key={de} f={f} de={de} ate={ate} texto={t} />)}
    <AbsoluteFill style={{ background: '#e7d4ff', opacity: estouro, mixBlendMode: 'screen' }} />
    <AbsoluteFill style={{ background: '#fff4e6', opacity: branco }} />
    <AbsoluteFill style={{ background: '#000', opacity: preto }} />
  </AbsoluteFill>;
}
