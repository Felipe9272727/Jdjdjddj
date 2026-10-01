// Rig dos personagens para o vídeo (Remotion). Corpo e cabeça vêm da arte do jogo
// (CarregandoAnimado), mas com PROPORÇÕES de desenho de 1930 — cabeça menor, tronco alto,
// braços e pernas compridos (o "chibi" da tela antiga saiu) — e membros de mangueira
// redesenhados a cada quadro como forma PREENCHIDA de largura variável (traço de pincel:
// grosso na raiz, fino na ponta), que dobra, estica e ondula.
import React from 'react';
import { Tronco, Cara, P64 } from '../../../jubileu/src/CarregandoAnimado';

/** Paleta do vídeo: preto quente (nunca #000), creme de papel, ouro velho, um só acento. */
export const COR = { tinta: '#1a1410', creme: '#f2ebd6', ouro: '#c9a44c', ouroE: '#8a6a24', acento: '#c8382b' };
const K = COR.tinta;
/** O TROCO-64 do vídeo: as luzes do peito viram um acento só. */
const PAL = { ...P64, lu: [COR.acento, COR.creme, COR.acento], ac: COR.acento };

// ── quadros-chave ─────────────────────────────────────────────────────────────
const EZ = {
  l: (t) => t,
  i: (t) => t * t * t,
  o: (t) => 1 - (1 - t) ** 3,
  io: (t) => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  b: (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  e: (t) => (t === 0 || t === 1 ? t : 2 ** (-9 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1),
  x: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  xi: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  h: () => 0,
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

// ── mangueira de pincel ───────────────────────────────────────────────────────
/**
 * Membro como forma preenchida: segue a curva do ombro à mão, largura w0 na raiz → w1 na ponta.
 * Afina quando estica (volume), e `onda`/`fase` desenham a ondulação de borracha depois de um puxão.
 */
export function Mangueira({ de, ate, dobra = 0, w0 = 20, w1 = 13, cor, onda = 0, fase = 0 }) {
  const [x0, y0] = de, [x1, y1] = ate;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const cx = (x0 + x1) / 2 + nx * dobra, cy = (y0 + y1) / 2 + ny * dobra;
  const fino = Math.min(1.1, Math.max(.62, Math.sqrt(80 / L)));
  const N = 18, esq = [], dir = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const px = u * u * x0 + 2 * u * t * cx + t * t * x1, py = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy), tl = Math.hypot(tx, ty) || 1;
    const qx = -ty / tl, qy = tx / tl;
    const ond = Math.sin(t * Math.PI * 3 + fase) * onda * Math.sin(t * Math.PI);
    const w = ((w0 + (w1 - w0) * t) * fino) / 2;
    esq.push([px + qx * (w + ond), py + qy * (w + ond)]); dir.push([px - qx * (w - ond), py - qy * (w - ond)]);
  }
  const pts = [...esq, ...dir.reverse()];
  const d = 'M' + pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join('L') + 'Z';
  const brilho = 'M' + esq.slice(2, N - 2).map(([a, b], i) => { const [c, e] = dir[dir.length - 3 - i] ?? [a, b]; return `${(a * .7 + c * .3).toFixed(1)},${(b * .7 + e * .3).toFixed(1)}`; }).join('L');
  return <g>
    <path d={d} fill={cor} stroke={K} strokeWidth="6" strokeLinejoin="round" />
    <path d={brilho} fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth={w0 * fino * .18} strokeLinecap="round" />
  </g>;
}
/** Luva de 1930: palma redonda, três dedos gordos, polegar marcado, punho com dobra. Creme, não branco. */
export function Luva({ x, y, giro = 0, esc = 1, aberta = true }) {
  return <g transform={`translate(${x},${y}) rotate(${giro}) scale(${esc})`} stroke={K} strokeWidth="5" strokeLinejoin="round" fill={COR.creme}>
    <rect x="-14" y="-24" width="28" height="13" rx="6" />
    <path d="M-12,-17H12" fill="none" strokeWidth="3" />
    {aberta && [-12, 0, 12].map((dx) => <ellipse key={dx} cx={dx} cy="15" rx="7.5" ry="12" />)}
    <circle cx="0" cy="2" r="16" />
    <ellipse cx="-16" cy="-2" rx="6.5" ry="10" transform="rotate(-30 -16 -2)" />
    <path d="M-7,-1Q0,5,7,-1" fill="none" strokeWidth="3" />
  </g>;
}
/** Sapato grande de desenho animado (~1,4× a perna), bico redondo e brilho. */
export function Sapato({ x, y, giro = 0, lado = 1 }) {
  return <g transform={`translate(${x},${y}) rotate(${giro}) scale(${lado},1)`} stroke={K} strokeWidth="5" strokeLinejoin="round">
    <path d="M-16,-12Q-20,8,4,10H30Q44,8,40,-6Q34,-18,14,-16Q-4,-22,-16,-12Z" fill="#2a2024" />
    <ellipse cx="22" cy="-6" rx="9" ry="3.5" fill="#fff" fillOpacity=".35" stroke="none" />
  </g>;
}

/**
 * O TROCO-64 de proporção alongada. Coordenadas locais: pés em (100,250).
 * Pernas de 92 (quadril em y≈158), tronco erguido 34, cabeça a 82% presa no pescoço.
 * pose: { x, y, esc, sx, sy, r, cab, cara, bE, bD, pE, pD, maoE, maoD, ondaE, ondaD }
 */
export function Robo64({ pose, mundoParaLocal, f = 0 }) {
  const { x, y, esc = 1, sx = 1, sy = 1, r = 0, cab = 0, cara = 'n', bE, bD, pE = { a: 0 }, pD = { a: 0 } } = pose;
  const SOBE = 34, PERNA = 92;
  const ombro = { E: [56, 126 - SOBE], D: [144, 126 - SOBE] }, quadril = { E: [82, 190 - SOBE], D: [118, 190 - SOBE] };
  const mao = (lado, b) => {
    if (pose[`mao${lado}`] && mundoParaLocal) return mundoParaLocal(pose[`mao${lado}`]);
    const s = lado === 'E' ? -1 : 1, a = rad(b.a * s), c = b.c ?? 88;
    const [ox, oy] = ombro[lado];
    return [ox + Math.sin(a) * c, oy + Math.cos(a) * c];
  };
  const pe = (lado, l) => {
    const s = lado === 'E' ? -1 : 1, a = rad((l.a ?? 0) * s), c = l.c ?? PERNA;
    const [hx, hy] = quadril[lado];
    return [hx + Math.sin(a) * c, hy + Math.cos(a) * c];
  };
  const braco = (lado, b) => {
    const m = mao(lado, b), [ox, oy] = ombro[lado];
    const giro = (Math.atan2(m[0] - ox, -(m[1] - oy)) * 180) / Math.PI;
    return <g key={lado}>
      <Mangueira de={ombro[lado]} ate={m} dobra={(b?.d ?? 16) * (lado === 'E' ? -1 : 1)} w0={19} w1={12} cor={PAL.m} onda={pose[`onda${lado}`] ?? 0} fase={f * .9} />
      <Luva x={m[0]} y={m[1]} giro={giro + 180} aberta={b?.aberta ?? true} />
    </g>;
  };
  const perna = (lado, l) => {
    const p = pe(lado, l), s = lado === 'E' ? -1 : 1;
    return <g key={lado}>
      <Mangueira de={quadril[lado]} ate={p} dobra={(l.d ?? 8) * s} w0={21} w1={15} cor={PAL.j} />
      <Sapato x={p[0] + s * 4} y={p[1] + 6} lado={s} giro={(l.a ?? 0) * .35} />
    </g>;
  };
  return (
    <g transform={`translate(${x},${y}) rotate(${r}) scale(${esc * sx},${esc * sy}) translate(-100,-250)`}>
      {perna('E', pE)}{perna('D', pD)}
      <g transform={`translate(0,${-SOBE}) translate(100,190) scale(1,1.12) translate(-100,-190)`}><Tronco p={PAL} k={0} /></g>
      <g transform={`translate(0,${-SOBE - 10}) rotate(${cab} 100 98) translate(100,98) scale(.82) translate(-100,-98)`}>
        <g stroke={K} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M100,30Q96,20,100,13" fill="none" /><circle cx="100" cy="8" r="8" fill={COR.acento} />
          <rect x="52" y="26" width="96" height="72" rx="16" fill={PAL.c} />
          <rect x="60" y="20" width="80" height="12" rx="5" fill={COR.acento} />
          <rect x="38" y="50" width="15" height="30" rx="5" fill={COR.acento} /><rect x="147" y="50" width="15" height="30" rx="5" fill={COR.acento} />
        </g>
        <Cara p={PAL} k={0} t={cara} />
      </g>
      {braco('E', bE)}{braco('D', bD)}
    </g>
  );
}

/** Letreiro de 1930 (cartão-título), não balão de HQ: letras creme, contorno grosso, sombra deslocada, balança. */
export function Letreiro({ x, y, t, esc, giro = 0, tam = 64 }) {
  if (esc <= .01) return null;
  return <g transform={`translate(${x},${y}) rotate(${giro}) scale(${esc})`} fontFamily="'Luckiest Guy',sans-serif" fontSize={tam} textAnchor="middle">
    <text x="5" y="6" fill={K}>{t}</text>
    <text x="0" y="0" fill={COR.creme} stroke={K} strokeWidth="7" paintOrder="stroke" strokeLinejoin="round">{t}</text>
    <text x="0" y="0" fill="none" stroke={COR.ouro} strokeWidth="1.5" opacity=".7">{t}</text>
  </g>;
}
