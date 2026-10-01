// O ESTILO DO PILOTO V2, comum às 8 cenas: palco 1600×760 com câmera, cenário pintado
// (traço fino e marrom, textura de papel), personagens com volume por dentro do contorno e
// traço que "ferve" de leve, película (grão), vinheta e cortinas de veludo em primeiro plano.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Defs, K, OURO, OURO_E } from '../../../jubileu/src/CarregandoAnimado';
import { AtdCorpo, AtdCabeca, AtdBraco, AtdBalcao, AtdSino } from '../../../jubileu/src/CarregandoAnimado';


export const LT = '#2a120c'; // traço do cenário

/** Personagem: volume (luz em cima, sombra embaixo, por dentro do contorno) + traço tremido a 12 qps. */
export const Ator = ({ f, children }) => <g filter={`url(#ferve${Math.floor(f / 2) % 3})`}>{children}</g>;

export const Estouro = ({ x, y, t, cor, esc, giro = 0, tam = 54 }) => esc <= 0.01 ? null : (
  <g transform={`translate(${x},${y}) rotate(${giro}) scale(${esc})`}>
    <path d={Array.from({ length: 22 }, (_, i) => { const a = (i / 22) * Math.PI * 2, r = i % 2 ? 58 : 92; return `${i ? 'L' : 'M'}${Math.cos(a) * r * 1.35},${Math.sin(a) * r}`; }).join('') + 'Z'}
      fill={cor} stroke={K} strokeWidth="7" strokeLinejoin="round" />
    <text x="0" y={tam * .3} textAnchor="middle" fontFamily="'Luckiest Guy',Impact,sans-serif" fontSize={tam} fill="#e63a2e" stroke={K} strokeWidth="6" paintOrder="stroke">{t}</text>
  </g>
);
/** Balão de fala de cartum (rabinho para baixo). */
export const Fala = ({ x, y, t, esc, w = 300 }) => esc <= .01 ? null : (
  <g transform={`translate(${x},${y}) scale(${esc}) translate(${-w / 2},-100)`} stroke={K} strokeWidth="6" strokeLinejoin="round">
    <path d={`M14,12H${w - 14}Q${w - 4},12,${w - 4},24V70Q${w - 4},82,${w - 14},82H${w * .42}L${w * .3},112L${w * .33},82H14Q4,82,4,70V24Q4,12,14,12Z`} fill="#fffaf0" />
    <text x={w / 2} y="62" textAnchor="middle" fontFamily="'Luckiest Guy',Impact" fontSize="40" fill="#e63a2e" stroke={K} strokeWidth="4" paintOrder="stroke">{t}</text>
  </g>
);
export const Sombra = ({ x, y, rx, ry = 14, o = .5 }) => <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#1a0408" opacity={o} filter="url(#sombraMole)" />;

/** Cortinas de veludo no primeiro plano (paralaxe). */
export function Cortinas({ px, cor = '#4a0a14', escura = '#2a0408', clara = '#8a2030' }) {
  return <g transform={`translate(${px},0)`} filter="url(#desfoque)">
    {[[-70, 1], [1670, -1]].map(([x, s]) => <g key={x} transform={`translate(${x},0) scale(${s},1)`}>
      <path d="M-60,-20H150Q120,200,160,420Q110,560,170,790H-60Z" fill={cor} />
      <path d="M40,-20Q20,260,70,790M100,-20Q90,240,120,790" fill="none" stroke={escura} strokeWidth="14" />
      <path d="M150,-20Q120,200,160,420" fill="none" stroke={clara} strokeWidth="10" opacity=".7" />
    </g>)}
  </g>;
}

/** Tremor amortecido a partir de t0 (a: amplitude, d: duração em quadros). */
export const tremor = (f, t0, a, d) => (f >= t0 && f < t0 + d ? Math.sin((f - t0) * 2.7) * a * (1 - (f - t0) / d) : 0);

/**
 * O palco: câmera (zoom z centrado em cx,cy, com tremor tx/ty), cenário + atores dentro, e por cima
 * o primeiro plano (paralaxe), a vinheta e o grão. `grade` é o filtro de cor do filme.
 */
export function Palco({ f, z = 1, cx = 800, cy = 380, tx = 0, ty = 0, frente, fundoCor = '#140608', grade = 'sepia(.12) contrast(1.05) saturate(1.05)', children }) {
  // nunca mostra além do cenário de 1600×760 (com zoom z, o centro fica a 800/z e 380/z das bordas)
  if (z >= 1) { cx = Math.min(1600 - 800 / z, Math.max(800 / z, cx)); cy = Math.min(760 - 380 / z, Math.max(380 / z, cy)); }
  const cam = `translate(${800 + tx},${380 + ty}) scale(${z}) translate(${-cx},${-cy})`;
  return (
    <AbsoluteFill style={{ background: fundoCor }}>
      <Defs />
      <svg viewBox="0 0 1600 760" width="100%" height="100%" style={{ filter: grade }}>
        <defs>
          <radialGradient id="luz"><stop offset="0" stopColor="#ffd98a" stopOpacity=".85" /><stop offset=".5" stopColor="#ffb347" stopOpacity=".3" /><stop offset="1" stopColor="#ffb347" stopOpacity="0" /></radialGradient>
          <linearGradient id="ouro" x2="0" y2="1"><stop offset="0" stopColor="#ffe59a" /><stop offset=".55" stopColor="#f2b53c" /><stop offset="1" stopColor="#b9791a" /></linearGradient>
          {[0, 1, 2].map((s) => <filter key={s} id={`ferve${s}`} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed={s * 7 + 3} />
            <feDisplacementMap in="SourceGraphic" scale="1.8" result="b" />
            <feMorphology in="SourceAlpha" operator="erode" radius="4" result="dentro" /><feOffset in="dentro" dx="5" dy="6" result="o1" /><feComposite in="dentro" in2="o1" operator="out" result="borda" />
            <feFlood floodColor="#fff1c8" floodOpacity=".55" /><feComposite in2="borda" operator="in" result="aro" />
            <feOffset in="dentro" dx="-12" dy="-10" result="o2" /><feComposite in="dentro" in2="o2" operator="out" result="lado" />
            <feFlood floodColor="#2a0a20" floodOpacity=".35" /><feComposite in2="lado" operator="in" result="sombra" />
            <feComposite in="sombra" in2="b" operator="atop" result="b2" />
            <feComposite in="aro" in2="b2" operator="atop" />
          </filter>)}
          <linearGradient id="parede" x2="0" y2="1"><stop offset="0" stopColor="#3e0c18" /><stop offset=".45" stopColor="#6a1626" /><stop offset=".62" stopColor="#5a1220" /><stop offset="1" stopColor="#2a0a10" /></linearGradient>
          <pattern id="papel" width="80" height="96" patternUnits="userSpaceOnUse">
            <path d="M40,80Q40,40,40,12M40,80Q22,50,8,30M40,80Q58,50,72,30" fill="none" stroke="#8a2236" strokeWidth="3" />
            <path d="M24,80A16,16,0,0,1,56,80" fill="none" stroke="#8a2236" strokeWidth="3" />
            <circle cx="40" cy="10" r="4" fill="#a83046" />
          </pattern>
          <radialGradient id="poca"><stop offset="0" stopColor="#ffcf7a" stopOpacity=".55" /><stop offset=".4" stopColor="#ff9a4a" stopOpacity=".18" /><stop offset="1" stopColor="#ff9a4a" stopOpacity="0" /></radialGradient>
          <linearGradient id="brilhoPiso" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".35" /><stop offset=".3" stopColor="#ffd98a" stopOpacity=".12" /><stop offset="1" stopColor="#000" stopOpacity=".45" /></linearGradient>
          <filter id="desfoque"><feGaussianBlur stdDeviation="5" /></filter>
          <filter id="sombraMole"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="papelTex"><feTurbulence type="fractalNoise" baseFrequency=".012 .05" numOctaves="3" seed="4" /><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .4  0 0 0 0 .25  0 0 0 .18 0" /></filter>
          <radialGradient id="vinheta" cx=".5" cy=".5" r=".75"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".6" /></radialGradient>
          <filter id="grao"><feTurbulence type="fractalNoise" baseFrequency=".9" seed={Math.floor(f / 2)} /><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .07 0" /></filter>
        </defs>
        <g transform={cam}>{children}</g>
        {frente}
        <rect width="1600" height="760" fill="url(#vinheta)" />
        <rect width="1600" height="760" filter="url(#grao)" />
      </svg>
    </AbsoluteFill>
  );
}
/** Textura de papel por cima do cenário (vai logo depois do fundo, antes dos atores). */
export const Papel = () => <rect x="-400" y="-200" width="2400" height="1160" filter="url(#papelTex)" style={{ mixBlendMode: 'multiply' }} />;

/** O saguão do hotel (parede de papel déco, lambri, mármore xadrez, lampiões, palmeiras). */
export function Saguao({ PISO = 640, CX = 800, lampioes = [420, 1180], vasos = [240, 1360] }) {
  return <g strokeLinejoin="round">
    <rect x="-400" y="-200" width="2400" height="1160" fill="url(#parede)" />
    <rect x="-400" width="2400" height="470" fill="url(#papel)" opacity=".55" />
    <rect x="-400" y="0" width="2400" height="34" fill="#3a1a10" /><rect x="-400" y="34" width="2400" height="8" fill="url(#ouro)" />
    {lampioes.map((x) => <circle key={x} cx={x} cy="250" r="260" fill="url(#poca)" />)}
    <rect x="-400" y="470" width="2400" height="170" fill="#3d1d10" />
    <rect x="-400" y="470" width="2400" height="8" fill="url(#ouro)" />
    {Array.from({ length: 14 }, (_, i) => <g key={i}>
      <rect x={i * 170 - 380} y="494" width="130" height="122" rx="6" fill="#4a2414" stroke={LT} strokeWidth="3" />
      <path d={`M${i * 170 - 376},${612}V${498}H${i * 170 - 254}`} fill="none" stroke="#6a3a20" strokeWidth="3" />
    </g>)}
    <rect x="-400" y={PISO} width="2400" height={960 - PISO} fill="#e9dcc0" />
    {Array.from({ length: 5 }, (_, r) => Array.from({ length: 40 }, (_, c) => {
      const y0 = PISO + (r * r * 9 + r * 22), y1 = PISO + ((r + 1) * (r + 1) * 9 + (r + 1) * 22);
      const w0 = 60 + r * 14, w1 = 60 + (r + 1) * 14, x0 = CX + (c - 20) * w0, x1 = CX + (c - 20) * w1;
      return (r + c) % 2 ? <path key={`${r}-${c}`} d={`M${x0},${y0}H${x0 + w0}L${x1 + w1},${y1}H${x1}Z`} fill="#2e2220" /> : null;
    }))}
    <rect x="-400" y={PISO} width="2400" height={960 - PISO} fill="url(#brilhoPiso)" />
    <path d={`M-400,${PISO}H2000`} stroke={LT} strokeWidth="5" />
    <rect x="-400" y={PISO} width="2400" height="16" fill="#000" opacity=".25" />
    {lampioes.map((x) => <g key={x} stroke={LT} strokeWidth="4">
      <path d={`M${x},312V266`} stroke={OURO_E} strokeWidth="7" /><circle cx={x} cy="314" r="9" fill={OURO_E} />
      <path d={`M${x - 30},266H${x + 30}L${x + 20},212H${x - 20}Z`} fill="#ffe9b0" />
      <path d={`M${x - 20},212H${x + 20}`} stroke={OURO} strokeWidth="6" />
    </g>)}
    {vasos.map((x) => <g key={x} stroke={LT} strokeWidth="4">
      {[-50, -22, 8, 34, 56].map((a, i) => <path key={a} d={`M${x},${PISO - 52}Q${x + a * 1.1},${PISO - 170 - i * 8},${x + a * 2.4},${PISO - 210 + (i % 2) * 30}`} fill="none" stroke={i % 2 ? '#3f7a34' : '#2e5e28'} strokeWidth="13" strokeLinecap="round" />)}
      <path d={`M${x - 48},${PISO - 62}H${x + 48}L${x + 36},${PISO}H${x - 36}Z`} fill="#b0602a" />
      <path d={`M${x - 52},${PISO - 62}H${x + 52}`} stroke={OURO} strokeWidth="8" />
    </g>)}
  </g>;
}

/** Peça rígida de marionete: gira `r` e escala em volta do pivô (px,py) da própria arte. */
export const Peca = ({ piv = [0, 0], r = 0, sx = 1, sy = 1, x = 0, y = 0, o = 1, children }) =>
  <g opacity={o} transform={`translate(${x},${y}) translate(${piv[0]},${piv[1]}) rotate(${r}) scale(${sx},${sy}) translate(${-piv[0]},${-piv[1]})`}>{children}</g>;
/** Coloca uma arte de caixa (w×h) com os pés em (x,y), escala e giro em volta dos pés. */
export const Boneco = ({ x, y, w, h, esc = 1, sx = 1, sy = 1, r = 0, o = 1, children }) =>
  <g opacity={o} transform={`translate(${x},${y}) rotate(${r}) scale(${esc * sx},${esc * sy}) translate(${-w / 2},${-h})`}>{children}</g>;

// ── O ATENDENTE DO SAGUÃO (marionete com as peças do jogo; caixa 360×330, base do balcão em y=330) ──
/** As caretas do jogo vêm escondidas (opacity="0"): o CSS liga a da vez pela classe do grupo. */
export const EstiloCaretas = () => <style>{'.atd-b .ypb,.atd-s .yps,.atd-y .ypy{opacity:1!important}'}</style>;
/** pose: { x, y (base do balcão), esc, corpoY, corpoSy, corpoR, cab, braco, cara ('n'|'b'|'s'|'y'), sino (amassa 0..1) } */
export function Atendente({ pose }) {
  const { x, y, esc = 1, corpoY = 0, corpoSy = 1, corpoR = 0, cab = 0, braco = 0, cara = 'n', sino = 0, maoExtra = null } = pose;
  return <g transform={`translate(${x},${y}) scale(${esc}) translate(-180,-330)`}>
    <Peca piv={[180, 264]} y={corpoY} sy={corpoSy} r={corpoR}>
      <AtdCorpo />
      <Peca piv={[150, 99]} r={cab}><g className={`atd-${cara}`}><AtdCabeca /></g></Peca>
    </Peca>
    <AtdBalcao />
    <Peca piv={[288, 224]} sx={1 + sino * .12} sy={1 - sino * .25}><AtdSino /></Peca>
    <Peca piv={[212, 164]} y={corpoY} r={braco}><AtdBraco />{maoExtra}</Peca>
  </g>;
}
