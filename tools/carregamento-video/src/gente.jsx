// Rigs de GENTE com membros de mangueira (o mesmo princípio dos robôs): tronco e cabeça vêm da arte
// do jogo, braços e pernas são curvas de borracha redesenhadas a cada quadro.
import React from 'react';
import { Hospede, Aurelio } from '../../../jubileu/src/CarregandoAndares';
import { Mangueira, rad } from './rig';

const TINTA = '#05060a';
/** Ponto na ponta de um membro: ombro/quadril + ângulo (0 = para baixo; + = para fora do corpo). */
const ponta = ([x, y], lado, a, c) => { const s = lado === 'E' ? -1 : 1, t = rad(a * s); return [x + Math.sin(t) * c, y + Math.cos(t) * c]; };
const Mao = ({ p, r = 12, cor }) => <circle cx={p[0]} cy={p[1]} r={r} fill={cor} stroke={TINTA} strokeWidth="5" />;
/** Sapato de cartum; aponta para `dir` (para onde ele anda). `giro` > 0 abaixa o BICO = ergue o calcanhar, girando
 *  no TORNOZELO (quem chama compensa a altura para a ponta continuar no chão). */
const Sapato = ({ p, dir = 1, giro = 0, cor = '#2a2118', w = 34 }) =>
  <g transform={`translate(${p[0]},${p[1]}) scale(${dir},1) rotate(${giro})`} stroke={TINTA} strokeWidth="5" strokeLinejoin="round">
    <path d={`M-12,-10Q-16,8,0,9H${w}Q${w + 14},8,${w + 10},-6Q${w + 2},-16,14,-14Q-2,-18,-12,-10Z`} fill={cor} />
    <path d={`M-12,4H6`} stroke={TINTA} strokeWidth="4" />
    <ellipse cx={w - 4} cy="-6" rx="8" ry="3" fill="#fff" fillOpacity=".3" stroke="none" />
  </g>;

/**
 * O HÓSPEDE (caixa 160×300, pés em (80,290)).
 * pose: { x, y, esc, sx, sy, r, cab, cara: 'cauto'|'medo'|'susto', bE, bD: {a, d, c}, pE, pD: {a, d, giro}, ponta (calcanhar erguido 0..1), suor }
 */
export function HospedeRig({ pose }) {
  const { x, y, esc = 1, sx = 1, sy = 1, r = 0, cab = 0, cara = 'cauto', bE = { a: 10 }, bD = { a: 10 }, pE = { a: 0 }, pD = { a: 0 }, suor = false, dir = 1, maosNaFrente = false, perfil = false } = pose;
  const ombro = { E: [52, 114], D: [108, 114] };
  // pernas de PERFIL quando anda (os dois quadris juntos); de frente, afastados
  const quad = perfil ? { E: [72, 198], D: [88, 198] } : { E: [66, 198], D: [94, 198] };
  // mundo → local (para pé plantado no chão do mundo)
  const local = ([wx, wy]) => { const dx = wx - x, dy = wy - y, a = rad(-r), cx = dx * Math.cos(a) - dy * Math.sin(a), cy = dx * Math.sin(a) + dy * Math.cos(a);
    return [80 + cx / (esc * sx), 290 + cy / (esc * sy)]; };
  // a perna do lado de lá (longe da câmera, em perfil) é mais escura e vai atrás
  const longe = dir > 0 ? 'E' : 'D';
  const perna = (l, p) => {
    const q = quad[l], g = p.giro ?? 0;
    const f = p.alvo ? local([p.alvo[0], p.alvo[1] - 36 * esc * Math.sin(rad(g)) - 4]) : ponta(q, l, p.a ?? 0, p.c ?? 84);
    const dob = perfil ? -dir * Math.abs(p.d ?? 16) : (p.d ?? 4) * (l === 'E' ? -1 : 1);   // joelhos para a frente
    return <g key={l}><Mangueira de={q} ate={f} dobra={dob} larg={20} cor={perfil ? (l === longe ? '#26412e' : '#4f8a5e') : l === 'E' ? '#3e6b4a' : '#335a3e'} />
      <Sapato p={[f[0], f[1] + 4]} dir={perfil ? dir : l === 'E' ? -1 : 1} giro={g} /></g>; };
  const braco = (l, b) => { const o = ombro[l], m = ponta(o, l, b.a ?? 10, b.c ?? 78);
    return <g key={l}><Mangueira de={o} ate={m} dobra={(b.d ?? 10) * (l === 'E' ? 1 : -1)} larg={19} cor={l === 'E' ? '#3f68a8' : '#4e7cc4'} /><Mao p={m} cor="#e8c49a" /></g>; };
  return (
    <g transform={`translate(${x},${y}) rotate(${r}) scale(${esc * sx},${esc * sy}) translate(-80,-290)`}>
      {perna(longe, longe === 'E' ? pE : pD)}{perna(longe === 'E' ? 'D' : 'E', longe === 'E' ? pD : pE)}
      {!maosNaFrente && braco('E', bE)}
      <g>{Hospede.corpo}</g>
      <g transform={`rotate(${cab} 80 96)`}>
        {Hospede.cabeca}
        {cara === 'susto' ? Hospede.susto : <>
          {/* medo contido: o sorriso some (boca tremida), olhos arregalados */}
          <rect x="60" y="80" width="40" height="12" fill="#e8b48a" />
          {cara === 'medo'
            ? <g stroke={TINTA} strokeLinecap="round"><circle cx="68" cy="65" r="7" fill="#fff" strokeWidth="3" /><circle cx="92" cy="65" r="7" fill="#fff" strokeWidth="3" />
                <circle cx={69 + 4 * dir} cy="66" r="3" fill={TINTA} stroke="none" /><circle cx={93 + 4 * dir} cy="66" r="3" fill={TINTA} stroke="none" />
                <path d="M68,88q4,-4,8,0t8,0t8,0" fill="none" strokeWidth="3.5" /><path d="M58,54L74,58M102,54L86,58" strokeWidth="3.5" /></g>
            : <g stroke={TINTA} strokeLinecap="round">{Hospede.olhos}<path d="M72,88H88" strokeWidth="3.5" /><path d="M60,56L74,54M100,56L86,54" strokeWidth="3.5" /></g>}
        </>}
        {suor && Hospede.suor}
      </g>
      {maosNaFrente && braco('E', bE)}
      {braco('D', bD)}
    </g>
  );
}

/**
 * O AURÉLIO (caixa 180×400, pés em (90,388)): silhueta de chapéu largo, ombros em arco, cintura marcada;
 * braços de manga comprida em mangueira com MÃO pálida de dedos longos. pose: { x, y, esc, r, cab, bD: {a, d, c}, olhos (0..1), resp }
 */
export function AurelioRig({ pose, f = 0 }) {
  const { x, y, esc = 1, r = 0, cab = 0, bD = { a: 6 }, bE = { a: 6 }, olhos = 0, resp = 0, garra = false } = pose;
  const ombro = { E: [62, 140], D: [118, 140] };
  const local = ([wx, wy]) => { const dx = wx - x, dy = wy - y, a = rad(-r), cx = dx * Math.cos(a) - dy * Math.sin(a), cy = dx * Math.sin(a) + dy * Math.cos(a);
    return [90 + cx / (esc * (1 - resp)), 388 + cy / (esc * (1 + resp))]; };
  const mao = (l, b) => { const o = ombro[l], m = b.alvo ? local(b.alvo) : ponta(o, l, b.a ?? 6, b.c ?? 130), ang = Math.atan2(m[0] - o[0], -(m[1] - o[1])) * 180 / Math.PI;
    return <g key={l}><Mangueira de={o} ate={m} dobra={(b.d ?? 8) * (l === 'E' ? 1 : -1)} larg={24} cor="#1b2440" />
      <g transform={`translate(${m[0]},${m[1]}) rotate(${ang + 180})`} stroke={TINTA} strokeWidth="4" strokeLinejoin="round" fill="#d9d9d2">
        {[-12, -4, 4, 12].map((dx, i) => <path key={i} d={garra && l === 'E' ? `M${dx},4Q${dx * 1.6},${26 + (i % 2) * 4},${dx * .6 - 8},${30 + (i % 2) * 6}` : `M${dx},4Q${dx * 1.4},${30 + (i % 2) * 6},${dx * 1.2},${36 + (i % 2) * 8}`} fill="none" stroke={TINTA} strokeWidth="11" strokeLinecap="round" />)}
        {[-12, -4, 4, 12].map((dx, i) => <path key={`b${i}`} d={garra && l === 'E' ? `M${dx},4Q${dx * 1.6},${26 + (i % 2) * 4},${dx * .6 - 8},${30 + (i % 2) * 6}` : `M${dx},4Q${dx * 1.4},${30 + (i % 2) * 6},${dx * 1.2},${36 + (i % 2) * 8}`} fill="none" stroke="#d9d9d2" strokeWidth="6" strokeLinecap="round" />)}
        <ellipse cx="0" cy="0" rx="16" ry="13" />
      </g></g>; };
  return (
    <g transform={`translate(${x},${y}) rotate(${r}) scale(${esc * (1 - resp)},${esc * (1 + resp)}) translate(-90,-388)`}>
      {!garra && mao('E', bE)}
      {/* sobretudo: ombros em arco, cintura, barra ondulada (balança) */}
      <path d={`M48,150Q90,112,132,150L124,236Q116,250,128,262L142,${370 + Math.sin(f * .2) * 4}Q90,${384 + Math.cos(f * .2) * 6},38,${370 - Math.sin(f * .2) * 4}L52,262Q64,250,56,236Z`} fill="#141b33" stroke={TINTA} strokeWidth="5" strokeLinejoin="round" />
      <path d="M90,150V370" stroke="#0b1022" strokeWidth="4" />
      <path d="M60,148L90,190L120,148L110,126L90,160L70,126Z" fill="#1d2744" stroke={TINTA} strokeWidth="4" strokeLinejoin="round" />
      {[200, 240, 280].map((yy) => <circle key={yy} cx="102" cy={yy} r="4" fill="#8a96b0" stroke={TINTA} strokeWidth="2.5" />)}
      <path d="M62,386H86M94,386H118" stroke={TINTA} strokeWidth="14" strokeLinecap="round" />
      <g transform={`rotate(${cab} 90 120)`}>
        <path d="M66,62Q64,112,90,118Q116,112,114,62Z" fill="#d9d9d2" stroke={TINTA} strokeWidth="5" />
        {/* olhos: esclera branca e pupila opaca — acendem no relâmpago */}
        <circle cx="90" cy="88" r="30" fill="#fff6c8" opacity={olhos * .35} />
        <g opacity={.45 + olhos * .55}><ellipse cx="80" cy="88" rx="9" ry="7" fill="#fffbe0" stroke={TINTA} strokeWidth="3" /><ellipse cx="100" cy="88" rx="9" ry="7" fill="#fffbe0" stroke={TINTA} strokeWidth="3" />
          <circle cx="78" cy="89" r="3.2" fill={TINTA} /><circle cx="98" cy="89" r="3.2" fill={TINTA} /></g>
        {/* rosto: sobrancelhas finas e altas, nariz comprido, sorriso fino que sobe de um lado só */}
        <path d="M70,78Q80,72,88,78M92,78Q100,72,110,78" fill="none" stroke={TINTA} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M90,92L86,104H93" fill="none" stroke={TINTA} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M78,108Q92,114,104,104" fill="none" stroke={TINTA} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M70,96Q74,102,72,108M110,96Q106,102,108,108" fill="none" stroke="#b9b9b0" strokeWidth="3" />
        {/* chapéu de aba larga (2,5× a cabeça) */}
        <path d="M18,68Q90,50,162,68Q150,80,90,76Q30,80,18,68Z" fill="#0d1226" stroke={TINTA} strokeWidth="5" strokeLinejoin="round" />
        <path d="M60,66Q58,30,90,26Q122,30,120,66Z" fill="#141b33" stroke={TINTA} strokeWidth="5" />
        <path d="M60,58H120" stroke="#3a4766" strokeWidth="6" />
      </g>
      {garra && mao('E', bE)}
      {mao('D', bD)}
    </g>
  );
}
