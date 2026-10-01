// Rig dos personagens para o vídeo (Remotion): o corpo e a cabeça são a MESMA arte do jogo
// (CarregandoAnimado), mas braços e pernas são mangueiras (rubber hose) redesenhadas a cada
// quadro — dobram, esticam e afinam, coisa que a tela em CSS nunca conseguiu fazer.
import React from 'react';
import { Tronco, Cara, Cabeca, K, P64, Banana } from '../../../jubileu/src/CarregandoAnimado';

// ── quadros-chave ─────────────────────────────────────────────────────────────
const EZ = {
  l: (t) => t,
  i: (t) => t * t * t,
  o: (t) => 1 - (1 - t) ** 3,
  io: (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  b: (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },      // passa do ponto e volta
  e: (t) => (t === 0 || t === 1 ? t : 2 ** (-9 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1), // elástico
  x: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),                                                 // expo out
  xi: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),                                                // expo in
  h: () => 0,                                                                                    // segura
};
/** k(f, [[quadro, valor, ease?], ...]) — o ease vale para o trecho que COMEÇA no ponto. */
export function k(f, pts) {
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [f0, v0, e = 'io'] = pts[i], [f1, v1] = pts[i + 1];
    if (f < f1) { const t = EZ[e]((f - f0) / (f1 - f0)); return v0 + (v1 - v0) * t; }
  }
  return pts[pts.length - 1][1];
}
export const rad = (d) => (d * Math.PI) / 180;

// ── mangueira: do ombro até a mão, com dobra; afina quando estica ──────────────
export function Mangueira({ de, ate, dobra = 0, larg = 13, cor }) {
  const [x0, y0] = de, [x1, y1] = ate;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const cx = (x0 + x1) / 2 - (dy / L) * dobra, cy = (y0 + y1) / 2 + (dx / L) * dobra;
  const w = larg * Math.min(1.15, Math.max(.45, Math.sqrt(62 / L)));
  const d = `M${x0},${y0}Q${cx},${cy},${x1},${y1}`;
  return <g fill="none" strokeLinecap="round">
    <path d={d} stroke={K} strokeWidth={w + 8} />
    <path d={d} stroke={cor} strokeWidth={w} />
    <path d={d} stroke="#fff" strokeOpacity=".28" strokeWidth={w * .28} transform={`translate(${-w * .18},${-w * .18})`} />
  </g>;
}
/** Luva de desenho de 1930: palma redonda, três dedos gordos e o punho com dobra. */
export function Luva({ x, y, giro = 0, esc = 1, aberta = true }) {
  return <g transform={`translate(${x},${y}) rotate(${giro}) scale(${esc})`} stroke={K} strokeWidth="5" strokeLinejoin="round">
    <rect x="-13" y="-22" width="26" height="12" rx="5" fill="#fff" />
    {aberta && [-12, 0, 12].map((dx) => <ellipse key={dx} cx={dx} cy="14" rx="7" ry="11" fill="#fff" />)}
    <circle cx="0" cy="2" r="15" fill="#fff" />
    <ellipse cx="-15" cy="-2" rx="6" ry="9" fill="#fff" transform="rotate(-30 -15 -2)" />
    <path d="M-6,-1Q0,4,6,-1" fill="none" strokeWidth="3" />
  </g>;
}
export function Sapato({ x, y, giro = 0 }) {
  return <g transform={`translate(${x},${y}) rotate(${giro})`} stroke={K} strokeWidth="5">
    <ellipse cx="6" cy="0" rx="26" ry="14" fill="#2a2228" />
    <ellipse cx="0" cy="-4" rx="10" ry="4" fill="#fff" fillOpacity=".35" stroke="none" />
  </g>;
}

/**
 * O TROCO-64 com membros de mangueira. Coordenadas da arte: caixa 200×260, pés em (100,250).
 * pose: { x, y, esc, sx, sy, r, cab, cara, bE, bD, pE, pD, maoE, maoD }
 *   bE/bD = { a: ângulo (0 = para baixo, + = para fora), c: comprimento, d: dobra }  — ou maoE/maoD = ponto fixo no MUNDO
 *   pE/pD = { a, d }
 */
export function Robo64({ pose, mundoParaLocal }) {
  const { x, y, esc = 1, sx = 1, sy = 1, r = 0, cab = 0, cara = 'n', bE, bD, pE = { a: 0 }, pD = { a: 0 } } = pose;
  const p = P64;
  const ombro = { E: [52, 126], D: [148, 126] }, quadril = { E: [80, 192], D: [120, 192] };
  const mao = (lado, b) => {
    if (pose[`mao${lado}`] && mundoParaLocal) return mundoParaLocal(pose[`mao${lado}`]);
    const s = lado === 'E' ? -1 : 1, a = rad(b.a * s), c = b.c ?? 64;
    const [ox, oy] = ombro[lado];
    return [ox + Math.sin(a) * c, oy + Math.cos(a) * c];
  };
  const pe = (lado, l) => {
    const s = lado === 'E' ? -1 : 1, a = rad((l.a ?? 0) * s), c = l.c ?? 54;
    const [hx, hy] = quadril[lado];
    return [hx + Math.sin(a) * c, hy + Math.cos(a) * c];
  };
  const braco = (lado, b) => {
    const m = mao(lado, b);
    const [ox, oy] = ombro[lado];
    const giro = (Math.atan2(m[0] - ox, -(m[1] - oy)) * 180) / Math.PI + 180;
    return <g key={lado}><Mangueira de={ombro[lado]} ate={m} dobra={(b?.d ?? 14) * (lado === 'E' ? 1 : -1)} cor={p.m} />
      <Luva x={m[0]} y={m[1]} giro={-giro + 180} aberta={b?.aberta ?? true} /></g>;
  };
  const perna = (lado, l) => {
    const f = pe(lado, l);
    return <g key={lado}><Mangueira de={quadril[lado]} ate={f} dobra={(l.d ?? 6) * (lado === 'E' ? -1 : 1)} larg={14} cor={p.j} />
      <Sapato x={f[0] + (lado === 'E' ? -8 : 8)} y={f[1] + 4} giro={(l.a ?? 0) * (lado === 'E' ? 1 : -1) * .4} /></g>;
  };
  return (
    <g transform={`translate(${x},${y}) rotate(${r}) scale(${esc * sx},${esc * sy}) translate(-100,-250)`}>
      {perna('E', pE)}{perna('D', pD)}
      <Tronco p={p} k={0} />
      <g transform={`rotate(${cab} 100 100)`}>
        <g stroke={K} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M100,30V13" fill="none" /><circle cx="100" cy="8" r="8" fill={p.bu} />
          <rect x="52" y="26" width="96" height="72" rx="16" fill={p.c} />
          <rect x="60" y="20" width="80" height="12" rx="5" fill={p.ac} />
          <rect x="38" y="50" width="15" height="30" rx="5" fill={p.ac} /><rect x="147" y="50" width="15" height="30" rx="5" fill={p.ac} />
        </g>
        <Cara p={p} k={0} t={cara} />
      </g>
      {braco('E', bE)}{braco('D', bD)}
    </g>
  );
}


/** O que vai na mão (desenhado no sentido do braço, a partir da luva). */
function Arma({ tipo }) {
  if (tipo === 'c') return <g stroke={K} strokeWidth="5" strokeLinejoin="round">{/* chave inglesa */}
    <rect x="-7" y="8" width="14" height="60" rx="6" fill="#f2b632" />
    <path d="M-16,84V70H16V84A20,20,0,1,0,-16,84Z" fill="#f2b632" /><circle cx="0" cy="42" r="3.5" fill={K} stroke="none" /></g>;
  if (tipo === 'b') return <g stroke={K} strokeWidth="5" strokeLinejoin="round">{/* cassetete elétrico */}
    <circle cx="0" cy="84" r="26" fill="url(#cna-ci)" stroke="none" />
    <rect x="-7" y="6" width="14" height="70" rx="6" fill="#2c323d" /><rect x="-10" y="68" width="20" height="26" rx="9" fill="#9af6ff" /></g>;
  if (tipo === 'f') return <g stroke={K} strokeWidth="4.5" strokeLinejoin="round">{/* bandeirinha do irmão */}
    <rect x="-3.5" y="-60" width="7" height="120" rx="3" fill="#e0c890" />
    <path d="M-3,-56L-72,-44L-54,-28L-72,-12L-3,0Z" fill="#3fe0c8" />
    <text x="-36" y="-21" textAnchor="middle" fontFamily="'Luckiest Guy',Impact" fontSize="22" fill={K} stroke="none" transform="rotate(180 -36 -28)">63</text></g>;
  if (tipo === 'esfregao') return <g stroke={K} strokeWidth="5" strokeLinejoin="round">{/* esfregão */}
    <rect x="-5" y="-30" width="10" height="130" rx="4" fill="#a0522d" />
    <path d="M-26,96H26L32,124H-32Z" fill="#f1e6cc" /><path d="M-20,124v14M-8,124v16M4,124v14M16,124v16" stroke="#f1e6cc" strokeWidth="7" strokeLinecap="round" /></g>;
  if (tipo === 'banana') return <g transform="translate(0,22) scale(1.1)"><Banana /></g>;
  return null;
}

/**
 * Robô genérico (TROCO-64, TROCO-63, segurança) com membros de mangueira, mesma arte do jogo.
 * Igual ao Robo64, mais: pal, k (0 = 64 · 1 = 63 · 2 = segurança), armaE/armaD, membros maiores no k=2.
 */
export function Robo({ pose, mundoParaLocal, pal = P64, k: tipo = 0, armaE, armaD }) {
  const { x, y, esc = 1, sx = 1, sy = 1, r = 0, cab = 0, cara = 'n', bE, bD, pE = { a: 0 }, pD = { a: 0 }, o = 1 } = pose;
  const gr = tipo === 2;
  const ombro = { E: [gr ? 46 : 52, 126], D: [gr ? 154 : 148, 126] }, quadril = { E: [78, 192], D: [122, 192] };
  const mao = (lado, b) => {
    if (pose[`mao${lado}`] && mundoParaLocal) return mundoParaLocal(pose[`mao${lado}`]);
    const s = lado === 'E' ? -1 : 1, a = rad(b.a * s), c = b.c ?? 64;
    const [ox, oy] = ombro[lado];
    return [ox + Math.sin(a) * c, oy + Math.cos(a) * c];
  };
  const pe = (lado, l) => {
    const s = lado === 'E' ? -1 : 1, a = rad((l.a ?? 0) * s), c = l.c ?? 54;
    const [hx, hy] = quadril[lado];
    return [hx + Math.sin(a) * c, hy + Math.cos(a) * c];
  };
  const braco = (lado, b, arma) => {
    const m = mao(lado, b), [ox, oy] = ombro[lado];
    const ang = (Math.atan2(m[0] - ox, -(m[1] - oy)) * 180) / Math.PI;
    return <g key={lado}>
      {arma && <g transform={`translate(${m[0]},${m[1]}) rotate(${ang + 180})`}><Arma tipo={arma} /></g>}
      <Mangueira de={ombro[lado]} ate={m} dobra={(b?.d ?? 14) * (lado === 'E' ? 1 : -1)} larg={gr ? 16 : 13} cor={pal.m} />
      <Luva x={m[0]} y={m[1]} giro={ang} aberta={!arma && (b?.aberta ?? true)} esc={gr ? 1.12 : 1} />
    </g>;
  };
  const perna = (lado, l) => {
    const f = pe(lado, l);
    return <g key={lado}><Mangueira de={quadril[lado]} ate={f} dobra={(l.d ?? 6) * (lado === 'E' ? -1 : 1)} larg={gr ? 17 : 14} cor={pal.j} />
      <Sapato x={f[0] + (lado === 'E' ? -8 : 8)} y={f[1] + 4} giro={(l.a ?? 0) * (lado === 'E' ? 1 : -1) * .4} /></g>;
  };
  return (
    <g opacity={o} transform={`translate(${x},${y}) rotate(${r}) scale(${esc * sx},${esc * sy}) translate(-100,-250)`}>
      {perna('E', pE)}{perna('D', pD)}
      <Tronco p={pal} k={tipo} />
      <g transform={`rotate(${cab} 100 100)`}>
        <Cabeca p={pal} k={tipo} x="v" ex={[]} />
        {cara !== 'n' && <Cara p={pal} k={tipo} t={cara} />}
      </g>
      {braco('E', bE, armaE)}{braco('D', bD, armaD)}
    </g>
  );
}
/** Converte um ponto do mundo para as coordenadas locais do robô (para mão presa num lugar fixo). */
export const paraLocal = (pose) => ([wx, wy]) => {
  const { x, y, esc = 1, sx = 1, sy = 1, r = 0 } = pose;
  const dx = wx - x, dy = wy - y, a = rad(-r), cx = dx * Math.cos(a) - dy * Math.sin(a), cy = dx * Math.sin(a) + dy * Math.cos(a);
  return [100 + cx / (esc * sx), 250 + cy / (esc * sy)];
};
