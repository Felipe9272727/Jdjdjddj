import React from 'react';
import {registerRoot, Composition, Img, staticFile, useCurrentFrame, interpolate as I} from 'remotion';

const DT = 0.034, N = 367, FPS = 1 / DT;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const pad = (n) => String(n).padStart(4, '0');
const src = (i) => staticFile('q' + pad(Math.max(0, Math.min(N - 1, i))) + '.png');

const Scene = ({width, height}) => {
  const f = useCurrentFrame();
  const t = f * DT;
  const idx = Math.max(0, f - 1);
  const k = (a, b, c, d) => I(t, [a, b], [c, d], clamp);

  // color grade: quente no voo, frio/dessaturado no mergulho
  const cold = t < 10.5 ? k(7.4, 10.4, 0, 1) : k(10.6, 11.2, 1, 0);
  const sat = 1.08 - 0.45 * cold;
  const con = 1.06 + 0.08 * cold;
  const bri = 1 - 0.07 * cold;
  const sep = 0.10 * (1 - cold);
  const hue = -8 * cold;
  const filter = `contrast(${con}) saturate(${sat}) brightness(${bri}) sepia(${sep}) hue-rotate(${hue}deg)`;

  // shake
  const amp = t >= 2.6 && t < 5 ? 2.2 * I(t, [2.6, 2.9, 5], [0, 1, 0.7], clamp) * (0.4 + 0.6 * Math.abs(Math.sin(t * 9)) ** 6 * 1.5)
    : t >= 7.4 && t < 10.4 ? I(t, [7.4, 10.4], [1.5, 9], clamp)
    : t >= 10.4 && t < 10.75 ? 22 * I(t, [10.4, 10.75], [1, 0], clamp)
    : t >= 10.75 && t < 11.1 ? 1 : 0.3;
  const sx = (rnd(f * 3 + 1) - 0.5) * 2 * amp;
  const sy = (rnd(f * 3 + 2) - 0.5) * 2 * amp;
  const sr = (rnd(f * 3 + 3) - 0.5) * 2 * amp * 0.05;
  const punch = t >= 10.4 && t < 10.8 ? I(t, [10.4, 10.47, 10.8], [0.06, 0.06, 0], clamp) : 0;
  const scale = 1 + Math.min(0.06, amp * 0.004) + 0.012 + punch + (t < 10.5 ? k(7.4, 10.4, 0, 0.03) : 0);

  // motion blur leve (fantasma do quadro anterior) no mergulho
  const ghost = t >= 7.4 && t < 10.4 ? I(t, [7.4, 10.4], [0.25, 0.5], clamp) : 0;
  // aberracao cromatica no impacto
  const ca = t >= 10.4 && t < 10.75 ? I(t, [10.4, 10.75], [7, 0], clamp) : (t >= 7.4 && t < 10.4 ? k(7.4, 10.4, 0, 1.8) : 0);

  const grainSeed = f * 7;
  return (
    <div style={{width, height, background: '#000', overflow: 'hidden', position: 'relative'}}>
      <svg width="0" height="0" style={{position: 'absolute'}}>
        <filter id="ca" colorInterpolationFilters="sRGB" x="-5%" y="-5%" width="110%" height="110%">
          <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="r" dx={ca} dy="0" result="r2" />
          <feOffset in="b" dx={-ca} dy="0" result="b2" />
          <feBlend in="r2" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b2" mode="screen" />
        </filter>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed={grainSeed} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" />
        </filter>
      </svg>
      <div style={{position: 'absolute', inset: 0, transform: `translate(${sx}px,${sy}px) rotate(${sr}deg) scale(${scale})`, filter}}>
        <div style={{position: 'absolute', inset: 0, filter: ca > 0.2 ? 'url(#ca)' : undefined}}>
          <Img src={src(idx)} style={{position: 'absolute', width, height}} />
          {ghost > 0 && <Img src={src(idx - 1)} style={{position: 'absolute', width, height, opacity: ghost}} />}
        </div>
      </div>
      {/* vinheta */}
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${0.32 + 0.2 * cold}) 100%)`}} />
      {/* grao */}
      <div style={{position: 'absolute', inset: 0, filter: 'url(#grain)', mixBlendMode: 'overlay', opacity: 0.16}}>
        <div style={{width, height}} />
      </div>
    </div>
  );
};

const Root = () => (
  <Composition id="Queda" component={Scene} durationInFrames={N + 1} fps={FPS}
    width={1280} height={720} defaultProps={{width: 1280, height: 720}}
    calculateMetadata={({props}) => ({width: props.width, height: props.height})} />
);
registerRoot(Root);
