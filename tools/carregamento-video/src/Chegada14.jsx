// Blender/Cycles plates, deliberately edited as a first-person cinematic montage.
// Rebuild with tools/chegada14/render.mjs after rendering cena.py; no legacy sprite frames.
import React from 'react';
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, interpolate } from 'remotion';
export const DUR = 288;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const ease = (frame, start, end) => {
  const x = interpolate(frame, [start, end], [0, 1], clamp);
  return x * x * (3 - 2 * x);
};
const SHOTS = [
  { name: 'portal', start: 0, end: 60, from: 1.04, to: 1.09 },
  { name: 'vista', start: 60, end: 120, from: 1.06, to: 1.025 },
  { name: 'fall', start: 120, end: 144, from: 1.06, to: 1.14 },
  { name: 'ground', start: 144, end: 180, from: 1.07, to: 1.055 },
  { name: 'helmet', start: 180, end: 228, from: 1.025, to: 1.075 },
  { name: 'ground', start: 228, end: DUR, from: 1.06, to: 1.025 },
];
export function Chegada14() {
  const f = useCurrentFrame();
  const shot = SHOTS.find((s) => f >= s.start && f < s.end) || SHOTS[SHOTS.length - 1];
  const progress = ease(f, shot.start, shot.end - 1);
  const falling = shot.name === 'fall';
  const onGround = shot.name === 'ground';
  const breath = onGround ? Math.sin((f - shot.start) * .135) : 0;
  const scale = shot.from + (shot.to - shot.from) * progress;
  const rotation = falling ? progress * 5.5 : onGround ? -1.4 + breath * .2 : 0;
  const flash = interpolate(f, [54, 59, 61, 70], [0, .8, .8, 0], clamp);
  const impact = interpolate(f, [138, 143, 147, 153], [0, .78, .45, 0], clamp);
  const black = Math.max(1 - ease(f, 0, 16), ease(f, 271, DUR - 1));
  const title = ease(f, 72, 87) * (1 - ease(f, 109, 119));
  const suffocation = ease(f, 140, 272);
  return <AbsoluteFill style={{ background: '#080908', overflow: 'hidden' }}>
    <Audio src={staticFile('ch14-v2/arrival.wav')} volume={.82} />
    <AbsoluteFill style={{
      transform: `translateY(${falling ? progress * 8 : breath * 1.4}px) scale(${scale}) rotate(${rotation}deg)`,
      filter: `blur(${falling ? Math.sin(progress * Math.PI) * 3 : onGround ? Math.max(0, breath) * .25 : 0}px)`,
    }}>
      <Img src={staticFile(`ch14-v2/${shot.name}.png`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
    {/* Windborne dust passes independently of the camera; sparse and out of focus. */}
    {Array.from({ length: 18 }, (_, i) => {
      const x = ((i * 83.31 + f * (1.5 + (i % 4) * .5)) % 1420) - 70;
      const y = 360 + (i * 47 % 200) + Math.sin(f * .03 + i) * 9;
      return <div key={i} style={{ position: 'absolute', left: x, top: y, width: 2 + i % 3, height: 1, borderRadius: '50%', background: '#f9d9a7', opacity: .12 + (i % 3) * .06, filter: 'blur(1px)', transform: 'rotate(-8deg)' }} />;
    })}
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 43%, transparent 27%, rgba(14,8,6,${.23 + suffocation * .34}) 100%)` }} />
    <div style={{ position: 'absolute', left: 76, bottom: 68, color: '#f6e7d0', opacity: title, fontFamily: 'Georgia, serif', textShadow: '0 2px 16px #0008' }}>
      <div style={{ fontSize: 11, letterSpacing: 5, fontFamily: 'Arial, sans-serif', marginBottom: 13 }}>ANDAR 14</div>
      <div style={{ fontSize: 39, letterSpacing: 9, fontWeight: 400 }}>KESSAR–9</div>
      <div style={{ height: 1, width: 47, marginTop: 18, background: '#eac78d', opacity: .7 }} />
    </div>
    <AbsoluteFill style={{ background: '#ffe4ba', opacity: flash }} />
    <AbsoluteFill style={{ background: '#21130b', opacity: impact }} />
    <AbsoluteFill style={{ background: '#000', opacity: black }} />
  </AbsoluteFill>;
}
