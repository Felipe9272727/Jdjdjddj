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

function Fundo() {
  return <g strokeLinejoin="round">
    <rect width="1600" height="760" fill="#5a1220" />
    {Array.from({ length: 33 }, (_, i) => <rect key={i} x={i * 50} y="0" width="18" height="520" fill="#6c1828" />)}
    <rect y="470" width="1600" height="60" fill="#3a1c10" stroke={K} strokeWidth="6" />
    <rect y="470" width="1600" height="10" fill={OURO_E} />
    <rect y={PISO} width="1600" height={760 - PISO} fill="#2a120c" />
    <path d={`M0,${PISO}H1600`} stroke={K} strokeWidth="8" />
    {/* tapete em perspectiva saindo da porta */}
    <path d={`M${ESQ + 20},${PISO}H${DIR - 20}L${DIR + 260},760H${ESQ - 260}Z`} fill="#8c1a2a" stroke={K} strokeWidth="6" />
    <path d={`M${ESQ + 40},${PISO + 8}H${DIR - 40}L${DIR + 210},752H${ESQ - 210}Z`} fill="none" stroke={OURO} strokeWidth="6" />
    {/* lampiões */}
    {[420, 1180].map((x) => <g key={x}>
      <circle cx={x} cy="250" r="120" fill="url(#luz)" />
      <path d={`M${x},300V262`} stroke={OURO_E} strokeWidth="8" />
      <path d={`M${x - 26},262H${x + 26}L${x + 18},214H${x - 18}Z`} fill="#ffd98a" stroke={K} strokeWidth="6" />
    </g>)}
    {/* vasos */}
    {[250, 1350].map((x) => <g key={x} stroke={K} strokeWidth="6">
      {[-40, -15, 15, 40].map((a) => <path key={a} d={`M${x},${PISO - 50}Q${x + a * 1.2},${PISO - 150},${x + a * 2.2},${PISO - 190}`} fill="none" stroke="#2f6b2a" strokeWidth="14" />)}
      <path d={`M${x - 46},${PISO - 60}H${x + 46}L${x + 34},${PISO}H${x - 34}Z`} fill="#a8571f" />
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
  const cy = k(f, [[0, 330, 'io'], [14, 290, 'io'], [34, 300, 'io'], [50, 420, 'io'], [100, 430, 'io'], [118, 340, 'io'], [144, 330]]);
  const tremor = (t0, a, d) => (f >= t0 && f < t0 + d ? Math.sin((f - t0) * 2.7) * a * (1 - (f - t0) / d) : 0);
  const tx = tremor(74, 10, 8) + tremor(116, 16, 12), ty = tremor(116, 9, 12) * .7;
  const cam = `translate(${800 + tx},${380 + ty}) scale(${z}) translate(${-cx},${-cy})`;
  const ferve = Math.floor(f / 2) % 3; // contorno tremido trocando de "folha" a 12 qps

  return (
    <AbsoluteFill style={{ background: '#140608' }}>
      <svg viewBox="0 0 1600 760" width="100%" height="100%" style={{ filter: 'sepia(.12) contrast(1.05) saturate(1.05)' }}>
        <defs>
          <radialGradient id="luz"><stop offset="0" stopColor="#ffd98a" stopOpacity=".85" /><stop offset=".5" stopColor="#ffb347" stopOpacity=".3" /><stop offset="1" stopColor="#ffb347" stopOpacity="0" /></radialGradient>
          <linearGradient id="ouro" x2="0" y2="1"><stop offset="0" stopColor="#ffe59a" /><stop offset=".55" stopColor="#f2b53c" /><stop offset="1" stopColor="#b9791a" /></linearGradient>
          <radialGradient id="cna-ci"><stop offset="0" stopColor="#7df9ff" stopOpacity=".95" /><stop offset=".45" stopColor="#16e0e8" stopOpacity=".45" /><stop offset="1" stopColor="#16e0e8" stopOpacity="0" /></radialGradient>
          {[0, 1, 2].map((s) => <filter key={s} id={`ferve${s}`}><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed={s * 7 + 3} /><feDisplacementMap in="SourceGraphic" scale="3.2" /></filter>)}
          <clipPath id="vao"><rect x={ESQ} y={TOPO} width={LARG} height={PISO - TOPO} /></clipPath>
          <radialGradient id="vinheta" cx=".5" cy=".5" r=".75"><stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".6" /></radialGradient>
        </defs>
        <g transform={cam}>
          <g filter={`url(#ferve${ferve})`}>
            <Fundo />
            <Cabine luz={Math.max(0, abre)} />
            {!fora && abre > .05 && <g clipPath="url(#vao)">{robo}</g>}
            <g clipPath="url(#vao)">
              <g transform={`translate(${-fresta},0)`}><Porta x0={ESQ} larg={LARG / 2} /></g>
              <g transform={`translate(${fresta},0)`}><Porta x0={CX} larg={LARG / 2} /></g>
            </g>
            <Moldura ponteiro={ponteiro} lampada={lampada} />
            {fora && <ellipse cx={x} cy={712} rx={70 * esc * (1 - arco / 300)} ry={12} fill="#000" opacity=".35" />}
            {fora && robo}
            {/* gotas de esforço */}
            {f >= 84 && f < 104 && [0, 1].map((i) => { const t = ((f - 84 + i * 6) % 12) / 12; return <path key={i} d={`M${x + 70 + i * 20 + t * 40},${yBase - 300 - t * 30 + t * t * 80}q8,14,0,20q-8,-6,0,-20Z`} fill="#9ad6ff" stroke={K} strokeWidth="4" opacity={1 - t} />; })}
          </g>
          <Estouro x={CX} y={TOPO - 230} t="PLIM!" cor="#fff3b0" giro={-6} esc={k(f, [[0, 0, 'h'], [17, 0, 'b'], [23, 1, 'h'], [34, 1, 'i'], [39, 0]])} />
          <Estouro x={x + 120} y={420} t="TCHARAM!" cor="#ffe14a" giro={8} esc={k(f, [[0, 0, 'h'], [55, 0, 'b'], [61, .9, 'h'], [72, .9, 'i'], [75, 0]])} />
          <Estouro x={CX - 40} y={380} t="SLAM!" cor="#ffb347" giro={-10} esc={k(f, [[0, 0, 'h'], [75, 0, 'b'], [79, .8, 'h'], [86, .8, 'i'], [89, 0]])} />
          <Estouro x={CX + 60} y={330} t="BONK!" cor="#9af6ff" giro={10} esc={k(f, [[0, 0, 'h'], [116, 0, 'b'], [121, 1, 'h'], [132, 1, 'i'], [136, 0]])} />
          {/* riscos de velocidade no arremesso */}
          {f >= 104 && f < 111 && [0, 1, 2, 3].map((i) => <path key={i} d={`M${x + 120},${yBase - 230 + i * 45}h${160 + i * 30}`} stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".85" />)}
        </g>
        <rect width="1600" height="760" fill="url(#vinheta)" />
        {/* grão de filme (troca a cada 2 quadros) */}
        <filter id="grao"><feTurbulence type="fractalNoise" baseFrequency=".9" seed={Math.floor(f / 2)} /><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .07 0" /></filter>
        <rect width="1600" height="760" filter="url(#grao)" />
      </svg>
    </AbsoluteFill>
  );
}
