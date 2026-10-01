// CENA PILOTO — O ELEVADOR (6 s em laço, 24 qps, palco 1600×760 como no jogo).
// O ponteiro chega ao 13 (PLIM!), a porta abre, o TROCO-64 pula para fora e faz TCHARAM…
// a porta fecha na MÃO dele. Ele puxa, o braço de mangueira estica até ficar fininho, a porta
// abre de repente e o braço o arremessa de volta para dentro (BONK). O ponteiro despenca.
import React from 'react';
import { useCurrentFrame, AbsoluteFill } from 'remotion';
import { K, OURO, OURO_E } from '../../../jubileu/src/CarregandoAnimado';
import { k, rad, Robo64, Luva } from './rig';

export const DUR = 144; // 6 s
const CX = 800, PISO = 640, TOPO = 150, LARG = 330; // a porta do elevador
const ESQ = CX - LARG / 2, DIR = CX + LARG / 2;

const Estouro = ({ x, y, t, cor, esc, giro = 0 }) => esc <= 0.01 ? null : (
  <g transform={`translate(${x},${y}) rotate(${giro}) scale(${esc})`}>
    <path d={Array.from({ length: 22 }, (_, i) => { const a = (i / 22) * Math.PI * 2, r = i % 2 ? 58 : 92; return `${i ? 'L' : 'M'}${Math.cos(a) * r * 1.35},${Math.sin(a) * r}`; }).join('') + 'Z'}
      fill={cor} stroke={K} strokeWidth="7" strokeLinejoin="round" />
    <text x="0" y="16" textAnchor="middle" fontFamily="'Luckiest Guy',Impact,sans-serif" fontSize="54" fill="#e63a2e" stroke={K} strokeWidth="6" paintOrder="stroke">{t}</text>
  </g>
);

// ── O CENÁRIO PINTADO ─────────────────────────────────────────────────────────
// Fundo mais suave e "aquarelado" que os personagens (o truque do Cuphead): traço fino e
// marrom em vez de preto grosso, luz dos lampiões em poças, textura de papel por cima.
function Fundo() {
  const LT = '#2a120c'; // traço do cenário
  return <g strokeLinejoin="round">
    <rect width="1600" height="760" fill="url(#parede)" />
    <rect width="1600" height="470" fill="url(#papel)" opacity=".55" />
    {/* sanca no alto */}
    <rect y="0" width="1600" height="34" fill="#3a1a10" /><rect y="34" width="1600" height="8" fill="url(#ouro)" />
    {[420, 1180].map((x) => <circle key={x} cx={x} cy="250" r="260" fill="url(#poca)" />)}
    {/* lambri com almofadas em relevo */}
    <rect y="470" width="1600" height="170" fill="#3d1d10" />
    <rect y="470" width="1600" height="8" fill="url(#ouro)" />
    {Array.from({ length: 10 }, (_, i) => <g key={i}>
      <rect x={i * 170 - 40} y="494" width="130" height="122" rx="6" fill="#4a2414" stroke={LT} strokeWidth="3" />
      <path d={`M${i * 170 - 36},${612}V${498}H${i * 170 + 86}`} fill="none" stroke="#6a3a20" strokeWidth="3" />
    </g>)}
    {/* piso de mármore xadrez em perspectiva */}
    <rect y={PISO} width="1600" height={760 - PISO} fill="#e9dcc0" />
    {Array.from({ length: 4 }, (_, r) => Array.from({ length: 28 }, (_, c) => {
      const y0 = PISO + (r * r * 9 + r * 22), y1 = PISO + ((r + 1) * (r + 1) * 9 + (r + 1) * 22);
      const w0 = 60 + r * 14, w1 = 60 + (r + 1) * 14, x0 = CX + (c - 14) * w0, x1 = CX + (c - 14) * w1;
      return (r + c) % 2 ? <path key={`${r}-${c}`} d={`M${x0},${y0}H${x0 + w0}L${x1 + w1},${y1}H${x1}Z`} fill="#2e2220" /> : null;
    }))}
    <rect y={PISO} width="1600" height={760 - PISO} fill="url(#brilhoPiso)" />
    <path d={`M0,${PISO}H1600`} stroke={LT} strokeWidth="5" />
    <rect y={PISO} width="1600" height="16" fill="#000" opacity=".25" />
    {/* lampiões de parede, com cúpula e braço de latão */}
    {[420, 1180].map((x) => <g key={x} stroke={LT} strokeWidth="4">
      <path d={`M${x},312V266`} stroke={OURO_E} strokeWidth="7" />
      <circle cx={x} cy="314" r="9" fill={OURO_E} />
      <path d={`M${x - 30},266H${x + 30}L${x + 20},212H${x - 20}Z`} fill="#ffe9b0" />
      <path d={`M${x - 20},212H${x + 20}`} stroke={OURO} strokeWidth="6" />
    </g>)}
    {/* vasos com palmeira */}
    {[240, 1360].map((x) => <g key={x} stroke={LT} strokeWidth="4">
      {[-50, -22, 8, 34, 56].map((a, i) => <path key={a} d={`M${x},${PISO - 52}Q${x + a * 1.1},${PISO - 170 - i * 8},${x + a * 2.4},${PISO - 210 + (i % 2) * 30}`} fill="none" stroke={i % 2 ? '#3f7a34' : '#2e5e28'} strokeWidth="13" strokeLinecap="round" />)}
      <path d={`M${x - 48},${PISO - 62}H${x + 48}L${x + 36},${PISO}H${x - 36}Z`} fill="#b0602a" />
      <path d={`M${x - 52},${PISO - 62}H${x + 52}`} stroke={OURO} strokeWidth="8" />
    </g>)}
  </g>;
}
/** Reflexo das portas no mármore (mesma geometria, de cabeça para baixo, apagado). */
function Reflexo({ fresta }) {
  return <g opacity=".22" transform={`translate(0,${2 * PISO}) scale(1,-1)`} style={{ mixBlendMode: 'multiply' }}>
    <rect x={ESQ - 60} y={PISO - 200} width={LARG + 120} height="200" fill="#4a2815" />
    <rect x={ESQ - fresta} y={PISO - 200} width={LARG / 2} height="200" fill="#b9791a" />
    <rect x={CX + fresta} y={PISO - 200} width={LARG / 2} height="200" fill="#b9791a" />
  </g>;
}
/** Cortinas de veludo no primeiro plano (paralaxe: andam mais que a câmera). */
function PrimeiroPlano({ px }) {
  return <g transform={`translate(${px},0)`} filter="url(#desfoque)">
    {[[-70, 1], [1670, -1]].map(([x, s]) => <g key={x} transform={`translate(${x},0) scale(${s},1)`}>
      <path d="M-60,-20H150Q120,200,160,420Q110,560,170,790H-60Z" fill="#4a0a14" />
      <path d="M40,-20Q20,260,70,790M100,-20Q90,240,120,790" fill="none" stroke="#2a0408" strokeWidth="14" />
      <path d="M150,-20Q120,200,160,420" fill="none" stroke="#8a2030" strokeWidth="10" opacity=".7" />
    </g>)}
  </g>;
}

function Cabine({ luz }) {
  return <g>
    <rect x={ESQ} y={TOPO} width={LARG} height={PISO - TOPO} fill="#1c0d08" />
    <ellipse cx={CX} cy={TOPO + 40} rx="200" ry="160" fill="url(#luz)" opacity={.35 + luz * .5} />
    <rect x={ESQ} y={PISO - 40} width={LARG} height="40" fill="#3d2010" />
  </g>;
}
function Porta({ x0, larg }) {
  return <g stroke={K} strokeWidth="6" strokeLinejoin="round">
    <rect x={x0} y={TOPO} width={larg} height={PISO - TOPO} fill="url(#ouro)" />
    <rect x={x0 + 18} y={TOPO + 24} width={larg - 36} height="170" rx="8" fill="none" stroke={OURO_E} strokeWidth="5" />
    <rect x={x0 + 18} y={TOPO + 220} width={larg - 36} height="230" rx="8" fill="none" stroke={OURO_E} strokeWidth="5" />
    <path d={`M${x0 + larg / 2},${TOPO + 50}l40,60l-40,60l-40,-60Z`} fill="none" stroke={OURO_E} strokeWidth="5" />
  </g>;
}
function Moldura({ ponteiro, lampada }) {
  return <g stroke={K} strokeWidth="7" strokeLinejoin="round">
    <path d={`M${ESQ - 60},${PISO}V${TOPO - 40}H${DIR + 60}V${PISO}H${DIR}V${TOPO}H${ESQ}V${PISO}Z`} fill="#4a2815" />
    <path d={`M${ESQ - 40},${PISO}V${TOPO - 22}H${DIR + 40}V${PISO}`} fill="none" stroke={OURO} strokeWidth="6" />
    {/* degraus déco nas laterais da moldura */}
    {[ESQ - 60, DIR + 60].map((x, i) => <path key={x} d={`M${x},${TOPO + 40}h${i ? 22 : -22}v60h${i ? -10 : 10}v60h${i ? -12 : 12}`} fill="none" stroke={OURO_E} strokeWidth="5" />)}
    {/* o mostrador de andares */}
    <g transform={`translate(${CX},${TOPO - 46})`}>
      <path d="M-92,0A92,92,0,0,1,92,0Z" fill="#f6e7c0" />
      {Array.from({ length: 7 }, (_, i) => { const a = rad(-80 + i * 160 / 6); return <path key={i} d={`M${Math.sin(a) * 72},${-Math.cos(a) * 72}L${Math.sin(a) * 86},${-Math.cos(a) * 86}`} strokeWidth="5" />; })}
      <text x="-62" y="-14" fontFamily="'Luckiest Guy',Impact" fontSize="20" fill={K} stroke="none">T</text>
      <text x="44" y="-14" fontFamily="'Luckiest Guy',Impact" fontSize="20" fill={K} stroke="none">13</text>
      <g transform={`rotate(${ponteiro})`}><path d="M0,6L-6,-10L0,-76L6,-10Z" fill="#b3111a" strokeWidth="4" /></g>
      <circle r="10" fill={OURO} strokeWidth="5" />
      <circle cx="0" cy="-118" r="16" fill={lampada > .5 ? '#fff3b0' : '#7a5a2a'} strokeWidth="5" />
      {lampada > .5 && <circle cx="0" cy="-118" r="46" fill="url(#luz)" stroke="none" />}
    </g>
  </g>;
}

export function Elevador() {
  const f = useCurrentFrame();
  // ── portas: 0 fechadas … 1 abertas ──
  const abre = k(f, [[0, 0, 'h'], [20, 0, 'o'], [23, -.04, 'x'], [31, 1, 'h'], [72, 1, 'xi'], [76, 0, 'o'], [79, .03, 'io'], [82, 0, 'h'], [104, 0, 'x'], [108, 1, 'h'], [112, 1, 'xi'], [116, 0, 'o'], [119, -.05, 'e'], [130, 0]]);
  const fresta = (LARG / 2) * Math.max(0, abre) * .92;
  const ponteiro = k(f, [[0, -80, 'h'], [2, -80, 'b'], [17, 80, 'h'], [117, 80, 'i'], [128, -95, 'e'], [143, -80]]);
  const lampada = f >= 17 && f < 40 && Math.floor(f / 3) % 2 === 0 ? 1 : f >= 17 && f < 40 ? .6 : 0;

  // ── o TROCO-64 ──
  const fora = f >= 40 && f < 110;
  const x = k(f, [[0, CX, 'h'], [36, CX, 'o'], [48, 1030, 'h'], [80, 1030, 'io'], [100, 1150, 'h'], [104, 1150, 'xi'], [110, CX, 'h'], [144, CX]]);
  const yBase = k(f, [[0, PISO - 30, 'h'], [36, PISO - 30, 'l'], [48, 712, 'h'], [104, 712, 'xi'], [110, PISO - 30, 'h'], [144, PISO - 30]]);
  const arco = f >= 36 && f < 48 ? Math.sin(((f - 36) / 12) * Math.PI) * 150 : 0;
  const esc = k(f, [[0, .95, 'h'], [36, .95, 'l'], [48, 1.35, 'h'], [104, 1.35, 'xi'], [110, .95, 'h'], [144, .95]]);
  // agacha (antecipação) · estica no ar · amassa no chão · assenta passando do ponto
  const sy = k(f, [[0, 1, 'h'], [30, 1, 'o'], [35, .8, 'x'], [38, 1.22, 'io'], [46, 1.1, 'l'], [48, .74, 'b'], [56, 1, 'h'], [75, 1, 'x'], [77, 1.15, 'e'], [86, 1, 'h'], [104, 1, 'l'], [105, .62, 'h'], [108, .62, 'o'], [111, 1, 'h'], [144, 1]]);
  const sx = 1 / Math.sqrt(sy) * (f >= 104 && f < 109 ? 1.7 : 1);   // volume + smear
  const r = k(f, [[0, 0, 'h'], [36, 0, 'o'], [42, -10, 'io'], [48, 0, 'h'], [80, 0, 'o'], [86, 22, 'io'], [92, 26, 'io'], [98, 20, 'io'], [104, 24, 'x'], [106, -30, 'o'], [112, 0, 'h'], [144, 0]])
    + (f >= 82 && f < 104 ? Math.sin(f * 1.7) * 2.5 : 0);
  const cara = f < 24 ? 'p' : f < 74 ? 'f' : f < 82 ? 's' : f < 104 ? 'b' : f < 116 ? 'x' : 'p';
  const cab = k(f, [[0, 0], [40, 8, 'b'], [48, -6, 'e'], [62, 0, 'io'], [74, -14, 'x'], [80, 10, 'io'], [104, 6, 'x'], [108, -20, 'e'], [124, 0]]);
  // braços: esperam, sobem no pulo, TCHARAM acenando com dobra; o esquerdo fica preso na porta
  const tch = f >= 56 && f < 74;
  const onda = Math.sin(f * .55);
  const bE = { a: k(f, [[0, 20], [30, 40, 'o'], [36, -10, 'b'], [44, 150, 'io'], [56, 120, 'b'], [62, 110]]) + (tch ? onda * 12 : 0), d: tch ? onda * 30 : 18, c: 64 };
  const bD = { a: k(f, [[0, 20], [30, 40, 'o'], [36, -10, 'b'], [44, 150, 'io'], [56, 125, 'io'], [104, 140, 'io'], [112, 160, 'io'], [130, 20]]) + (tch ? -onda * 12 : 0) + (f >= 82 && f < 104 ? Math.sin(f * 2.1) * 25 : 0), d: tch ? -onda * 30 : 18, c: 64 };
  const pernasCorrendo = f >= 82 && f < 104;
  const passo = Math.sin(f * 1.4);
  const pE = { a: pernasCorrendo ? passo * 38 : k(f, [[0, 6], [36, 20, 'o'], [44, -20, 'io'], [48, 14, 'b'], [56, 6]]), d: pernasCorrendo ? -passo * 14 : 6 };
  const pD = { a: pernasCorrendo ? -passo * 38 : k(f, [[0, 6], [36, 20, 'o'], [44, -20, 'io'], [48, 14, 'b'], [56, 6]]), d: pernasCorrendo ? passo * 14 : 6 };
  // a mão presa na fresta da porta (ponto fixo no mundo) de 74 a 104
  const MAO_PRESA = [CX, 470];
  const presa = f >= 74 && f < 105;
  const pose = { x, y: yBase - arco, esc, sx, sy, r, cab, cara, bE, bD, pE, pD, maoE: presa ? MAO_PRESA : null };
  const mundoParaLocal = ([wx, wy]) => {
    const dx = wx - pose.x, dy = wy - pose.y, a = rad(-r), cx = dx * Math.cos(a) - dy * Math.sin(a), cy = dx * Math.sin(a) + dy * Math.cos(a);
    return [100 + cx / (esc * sx), 250 + cy / (esc * sy)];
  };
  const robo = <Robo64 pose={pose} mundoParaLocal={mundoParaLocal} />;

  // ── câmera: entra no elevador no PLIM, segue o pulo, soco de zoom no SLAM, abre no BONK ──
  const z = k(f, [[0, 1.1, 'io'], [14, 1.25, 'x'], [34, 1.25, 'io'], [50, 1.2, 'io'], [74, 1.3, 'x'], [78, 1.42, 'io'], [100, 1.25, 'x'], [112, 1.15, 'io'], [144, 1.1]]);
  const cx = k(f, [[0, 800, 'io'], [34, 800, 'io'], [52, 900, 'io'], [74, 900, 'io'], [100, 960, 'x'], [112, 820, 'io'], [144, 800]]);
  const cy = k(f, [[0, 340, 'io'], [14, 290, 'io'], [34, 310, 'io'], [50, 450, 'io'], [100, 460, 'io'], [118, 350, 'io'], [144, 340]]);
  const tremor = (t0, a, d) => (f >= t0 && f < t0 + d ? Math.sin((f - t0) * 2.7) * a * (1 - (f - t0) / d) : 0);
  const tx = tremor(74, 10, 8) + tremor(116, 16, 12), ty = tremor(116, 9, 12) * .7;
  const cam = `translate(${800 + tx},${380 + ty}) scale(${z}) translate(${-cx},${-cy})`;
  const ferve = Math.floor(f / 2) % 3; // contorno tremido trocando de "folha" a 12 qps

  return (
    <AbsoluteFill style={{ background: '#140608' }}>
      <svg viewBox="0 0 1600 760" width="100%" height="100%" style={{ filter: 'sepia(.16) contrast(1.06) saturate(1.1)' }}>
        <defs>
          <radialGradient id="luz"><stop offset="0" stopColor="#ffd98a" stopOpacity=".85" /><stop offset=".5" stopColor="#ffb347" stopOpacity=".3" /><stop offset="1" stopColor="#ffb347" stopOpacity="0" /></radialGradient>
          <linearGradient id="ouro" x2="0" y2="1"><stop offset="0" stopColor="#ffe59a" /><stop offset=".55" stopColor="#f2b53c" /><stop offset="1" stopColor="#b9791a" /></linearGradient>
          <radialGradient id="cna-ci"><stop offset="0" stopColor="#7df9ff" stopOpacity=".95" /><stop offset=".45" stopColor="#16e0e8" stopOpacity=".45" /><stop offset="1" stopColor="#16e0e8" stopOpacity="0" /></radialGradient>
          {/* o personagem: traço que "ferve" de leve + luz quente no contorno de cima e sombra do lado de baixo (volume) */}
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
          <linearGradient id="parede" x2="0" y2="1"><stop offset="0" stopColor="#4a1c22" /><stop offset=".45" stopColor="#8a3a3c" /><stop offset=".62" stopColor="#7a3234" /><stop offset="1" stopColor="#3a1618" /></linearGradient>
          <linearGradient id="feixe" x2="0" y2="1"><stop offset="0" stopColor="#ffe6a8" stopOpacity=".5" /><stop offset="1" stopColor="#ffe6a8" stopOpacity="0" /></linearGradient>
          <pattern id="papel" width="80" height="96" patternUnits="userSpaceOnUse">
            <path d="M40,80Q40,40,40,12M40,80Q22,50,8,30M40,80Q58,50,72,30" fill="none" stroke="#a4504e" strokeWidth="3" />
            <path d="M24,80A16,16,0,0,1,56,80" fill="none" stroke="#a4504e" strokeWidth="3" />
            <circle cx="40" cy="10" r="4" fill="#a83046" />
          </pattern>
          <radialGradient id="poca"><stop offset="0" stopColor="#ffcf7a" stopOpacity=".55" /><stop offset=".4" stopColor="#ff9a4a" stopOpacity=".18" /><stop offset="1" stopColor="#ff9a4a" stopOpacity="0" /></radialGradient>
          <linearGradient id="brilhoPiso" x2="0" y2="1"><stop offset="0" stopColor="#000" stopOpacity=".35" /><stop offset=".3" stopColor="#ffd98a" stopOpacity=".12" /><stop offset="1" stopColor="#000" stopOpacity=".45" /></linearGradient>
          <filter id="desfoque"><feGaussianBlur stdDeviation="5" /></filter>
          <filter id="sombraMole"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="papelTex"><feTurbulence type="fractalNoise" baseFrequency=".012 .05" numOctaves="3" seed="4" /><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .4  0 0 0 0 .25  0 0 0 .18 0" /></filter>
          <clipPath id="vao"><rect x={ESQ} y={TOPO} width={LARG} height={PISO - TOPO} /></clipPath>
          <radialGradient id="vinheta" cx=".5" cy=".5" r=".75"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".6" /></radialGradient>
        </defs>
        <g transform={cam}>
          <Fundo />
          <rect width="1600" height="760" filter="url(#papelTex)" style={{ mixBlendMode: 'multiply' }} />
          <Reflexo fresta={fresta} />
          <Cabine luz={Math.max(0, abre)} />
          {/* o feixe de luz que sai do elevador quando abre, com poeira brilhando dentro */}
          {abre > .05 && <g opacity={Math.min(1, abre) * .9} style={{ mixBlendMode: 'screen' }}>
            <path d={`M${CX - fresta},${PISO}L${CX + fresta},${PISO}L${CX + fresta * 2.4},760L${CX - fresta * 2.4},760Z`} fill="url(#feixe)" filter="url(#desfoque)" />
            {Array.from({ length: 18 }, (_, i) => { const t = ((f * .004 + i * .137) % 1), px = CX + Math.sin(i * 7.1 + f * .03) * fresta * (.4 + t * 1.6), py = TOPO + 60 + t * 520;
              return <circle key={i} cx={px} cy={py} r={2 + (i % 3)} fill="#fff4cc" opacity={.6 * Math.sin(t * Math.PI)} />; })}
          </g>}
          {!fora && abre > .05 && <g clipPath="url(#vao)" filter={`url(#ferve${ferve})`}>{robo}</g>}
          <g clipPath="url(#vao)">
            <g transform={`translate(${-fresta},0)`}><Porta x0={ESQ} larg={LARG / 2} /></g>
            <g transform={`translate(${fresta},0)`}><Porta x0={CX} larg={LARG / 2} /></g>
          </g>
          <Moldura ponteiro={ponteiro} lampada={lampada} />
          {fora && <ellipse cx={x} cy={716} rx={80 * esc * (1 - arco / 300)} ry={16} fill="#1a0408" opacity=".55" filter="url(#sombraMole)" />}
          {fora && <g filter={`url(#ferve${ferve})`}>{robo}</g>}
          {/* gotas de esforço */}
          {f >= 84 && f < 104 && [0, 1].map((i) => { const t = ((f - 84 + i * 6) % 12) / 12; return <path key={i} d={`M${x + 70 + i * 20 + t * 40},${yBase - 300 - t * 30 + t * t * 80}q8,14,0,20q-8,-6,0,-20Z`} fill="#9ad6ff" stroke={K} strokeWidth="4" opacity={1 - t} />; })}
          <Estouro x={CX} y={TOPO - 230} t="PLIM!" cor="#fff3b0" giro={-6} esc={k(f, [[0, 0, 'h'], [17, 0, 'b'], [23, 1, 'h'], [34, 1, 'i'], [39, 0]])} />
          <Estouro x={x - 210} y={330} t="TCHARAM!" cor="#ffe14a" giro={8} esc={k(f, [[0, 0, 'h'], [55, 0, 'b'], [61, .9, 'h'], [72, .9, 'i'], [75, 0]])} />
          <Estouro x={CX - 40} y={380} t="SLAM!" cor="#ffb347" giro={-10} esc={k(f, [[0, 0, 'h'], [75, 0, 'b'], [79, .8, 'h'], [86, .8, 'i'], [89, 0]])} />
          <Estouro x={CX + 60} y={330} t="BONK!" cor="#9af6ff" giro={10} esc={k(f, [[0, 0, 'h'], [116, 0, 'b'], [121, 1, 'h'], [132, 1, 'i'], [136, 0]])} />
          {/* riscos de velocidade no arremesso */}
          {f >= 104 && f < 111 && [0, 1, 2, 3].map((i) => <path key={i} d={`M${x + 120},${yBase - 230 + i * 45}h${160 + i * 30}`} stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".85" />)}
        </g>
        <PrimeiroPlano px={(800 - cx) * .35} />
        <rect width="1600" height="760" fill="url(#vinheta)" />
        {/* grão de filme (troca a cada 2 quadros) */}
        <filter id="grao"><feTurbulence type="fractalNoise" baseFrequency=".9" seed={Math.floor(f / 2)} /><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .07 0" /></filter>
        <rect width="1600" height="760" filter="url(#grao)" />
      </svg>
    </AbsoluteFill>
  );
}
