/**
 * CarregandoCenas — as cenas extras da tela de carregamento (sorteadas em CarregandoAnimado).
 * Mesmo saguão, mesmos personagens (as peças vêm de CarregandoAnimado), outra confusão a cada vez:
 *
 *   1. ELEVADOR      — o TROCO-64 preso no elevador: a porta abre (PLIM!) e ele acena; o elevador
 *                      sacode, o ponteiro enlouquece, e na volta ele sai tonto. O atendente bate no relógio.
 *   2. MALA FUJONA   — um carrinho de malas desgovernado atravessa o saguão, o segurança escorrega na
 *                      banana, o TROCO-63 pula em cima das malas e segura (TCHAN!)… até o carrinho fugir de ré.
 *   3. TRÉGUA DO CHÁ — o 63 e o segurança jogam cartas; o 64 sopra as cartas por trás do segurança,
 *                      é pego, e o segurança vira a mesa (CRASH!).
 *
 * Mesma regra da original: sem WebGL e sem JS por quadro — SVG + CSS só em transform/opacity, laço de
 * D s, `animation-delay: var(--off)` (a bancada congela a cena). Palco em unidades --u: paisagem
 * 1600×760, retrato 780×1600; cada peça é um `.e` posicionado por --l/--t/--w/--h.
 */
import React, { memo } from 'react';
import {
  Robo, P64, P63, PSG, AtdCorpo, AtdCabeca, AtdBraco, AtdBalcao, Defs, Pt, Golpe, Banana, FundoSaguao,
  K, OURO, OURO_E, FONTE, L, VA, type Exp,
  registrarCenas,
} from './CarregandoAnimado';

// ── TEMPO E CSS ──────────────────────────────────────────────────────────────
export const D = 10; // segundos por laço
export const pct = (t: number) => `${+(Math.min(D, Math.max(0, t)) / D * 100).toFixed(2)}%`;
export type Q = [number, string]; // [s, declarações css]
/** Uma animação: @keyframes + a regra da classe (pivô, laço, atraso da bancada). */
export const an = (cls: string, piv: string | null, q: Q[], atraso = 0) => {
  // quadro sem opacidade numa animação que mexe nela interpolaria até o próximo valor (o ator
  // ia sumindo devagar): todo quadro que não diz nada sobre ela vale opacity:1
  const usaOp = q.some(([, c]) => c.includes('opacity'));
  const f = q.map(([t, c]): Q => [t, usaOp && !c.includes('opacity') ? `${c};opacity:1` : c]).sort((a, b) => a[0] - b[0]);
  if (f[0][0] > 0) f.unshift([0, f[f.length - 1][1]]);
  if (f[f.length - 1][0] < D) f.push([D, f[0][1]]);
  const nome = `k-${cls.replace(/[^a-z0-9-]/gi, '_')}`;
  return `@keyframes ${nome}{${f.map(([t, c]) => `${pct(t)}{${c}}`).join('')}}`
    + `.cna .${cls}{${piv ? `transform-origin:${piv};` : ''}will-change:transform,opacity;`
    + `animation:${nome} ${D}s cubic-bezier(.45,0,.55,1) infinite both;animation-delay:calc(var(--off) - ${atraso}s)}`;
};
export const tr = (x = 0, y = 0, r = 0, sx = 1, sy = sx) => `transform:translate(${x}%,${y}%) rotate(${r}deg) scale(${sx},${sy})`;
export const rot = (a: number) => `transform:rotate(${a}deg)`;
export const op = (v: number) => `opacity:${v}`;
/** Balão que estoura em cada instante de `ts` e some depois de `hold` s. */
export const pop = (cls: string, ts: number[], hold = .55): string => {
  const q: Q[] = [[0, `transform:scale(.15);${op(0)}`]];
  for (const t of ts) q.push(
    [t - .01, `transform:scale(.15);${op(0)}`], [t, `transform:scale(.15);${op(1)}`], [t + .14, `transform:scale(1.14);${op(1)}`],
    [t + .26, `transform:scale(1);${op(1)}`], [t + hold, `transform:scale(1);${op(1)}`], [t + hold + .14, `transform:scale(.5);${op(0)}`]);
  return an(cls, '50% 50%', q);
};
/** Uma janela de visibilidade [de, até] com bordas de 60 ms (rostos, efeitos). */
export const vis = (cls: string, jan: [number, number][], piv: string | null = null): string => {
  const q: Q[] = [[0, op(0)]];
  for (const [a, b] of jan) q.push([a - .06, op(0)], [a, op(1)], [b, op(1)], [b + .06, op(0)]);
  return an(cls, piv, q);
};
export type Caixa = [number, number, number, number]; // esquerda, base, largura, altura (unidades do palco)
/** Posição em paisagem e (opcional) em retrato; `extra` vai junto nas duas (ex.: variáveis da cena). */
export const pos = (cls: string, p: Caixa, r?: Caixa, extraP = '', extraR = '') => {
  const v = ([l, b, w, h]: Caixa) => `--l:${l};--t:${b - h};--w:${w};--h:${h}`;
  return `.cna .${cls}{display:block;${v(p)};${extraP}}` + (r ? `@media(orientation:portrait){.cna .${cls}{${v(r)};${extraR}}}` : '');
};
// pivôs na caixa do robô (200×260) e do atendente (360×330)
export const PV = { c: '50% 94%', h: '50% 38%', e: '20% 48%', d: '80% 48%', l: '39% 73%', r: '61% 73%' };
const PA = { cab: '41.7% 30%', braco: '58.9% 49.7%', corpo: '50% 80%' };
/** Passadas: alterna ±a° entre t0 e t1 (pernas l/r em oposição). */
export const passos = (id: string, faixas: [number, number, number, number][]) => {
  const ql: Q[] = [[0, rot(0)]], qr: Q[] = [[0, rot(0)]];
  for (const [t0, t1, n, a] of faixas) for (let i = 0; i <= n + 1; i++) {
    const t = t0 + (t1 - t0) * i / (n + 1), v = i === 0 || i === n + 1 ? 0 : i % 2 ? a : -a;
    ql.push([t, rot(v)]); qr.push([t, rot(-v)]);
  }
  return an(`${id}l`, PV.l, ql) + an(`${id}r`, PV.r, qr);
};
export const ROSTOS: Exp[] = ['f', 'x', 'e', 's', 'b'];

/** Balão de fala (cartum), com rabinho para baixo. */
export const Fala: React.FC<{ c: string; t: string; w?: number }> = ({ c, t, w = 300 }) => (
  <Pt c={c} vb={`0 0 ${w} 120`}>
    <g {...L} strokeWidth="5">
      <path d={`M14,12H${w - 14}Q${w - 4},12,${w - 4},24V70Q${w - 4},82,${w - 14},82H${w * .42}L${w * .3},112L${w * .33},82H14Q4,82,4,70V24Q4,12,14,12Z`} fill="#fffaf0" />
      <text x={w / 2} y="60" textAnchor="middle" fontFamily={FONTE} fontSize="40" fill="#e63a2e" stroke={K} strokeWidth="4" paintOrder="stroke">{t}</text>
    </g>
  </Pt>
);

/** O atendente atrás do balcão, com camadas que cada cena anima (pref = prefixo das classes). */
const Atendente: React.FC<{ pref: string; mao?: React.ReactNode }> = ({ pref, mao }) => (
  <div className={`e ${pref}t`}>
    <Pt c={`${pref}tk`} vb={VA}><AtdCorpo /></Pt>
    <Pt c={`${pref}th`} vb={VA}><AtdCabeca /></Pt>
    <Pt vb={VA}><AtdBalcao /></Pt>
    <Pt c={`${pref}ta`} vb={VA}><AtdBraco />{mao}</Pt>
  </div>
);
/** Substitui as caretas do atendente (ypb sono, yps susto, ypy bocejo) pelas janelas desta cena. */
const caretas = (pref: string, j: Partial<Record<'ypb' | 'yps' | 'ypy', [number, number][]>>) =>
  (['ypb', 'yps', 'ypy'] as const).map((k) => vis(`${pref}t .${k}`, j[k] ?? [])).join('');

// ═══ 1. ELEVADOR ═════════════════════════════════════════════════════════════
const EL = '0 0 400 460';
const Cabine = () => ( // o fundo da cabine (atrás do 64)
  <g {...L}>
    <rect x="70" y="110" width="260" height="330" fill="#1c0d08" />
    <circle cx="200" cy="130" r="150" fill="url(#cna-lz)" opacity=".55" />
    <rect x="70" y="404" width="260" height="36" fill="#3d2010" />
    <path d="M90,140H310M90,170H310" stroke={OURO_E} strokeWidth="3" opacity=".5" />
  </g>
);
const Porta: React.FC<{ x: number }> = ({ x }) => (
  <g {...L} strokeWidth="5">
    <rect x={x} y="110" width="130" height="330" fill="url(#cna-ou)" />
    <rect x={x + 16} y="132" width="98" height="130" rx="6" fill="none" stroke={OURO_E} strokeWidth="4" />
    <rect x={x + 16} y="280" width="98" height="138" rx="6" fill="none" stroke={OURO_E} strokeWidth="4" />
    <path d={`M${x + 65},150L${x + 98},197L${x + 65},244L${x + 32},197Z`} fill="none" stroke={OURO_E} strokeWidth="4" />
  </g>
);
const Moldura = () => (
  <g {...L}>
    <path d="M0,60H400V460H0Z M70,110V440H330V110Z" fill="url(#cna-ma)" fillRule="evenodd" />
    <path d="M18,78H382V460M18,78V460" fill="none" stroke={OURO} strokeWidth="5" />
    <circle cx="200" cy="60" r="50" fill="#f6e7c0" />
    {[-70, -35, 0, 35, 70].map((a, i) => (
      <g key={a} transform={`rotate(${a} 200 60)`}>
        <path d="M200,18V30" stroke={K} strokeWidth="4" />
        <text x="200" y="45" textAnchor="middle" fontFamily={FONTE} fontSize="14" fill={K} stroke="none">{['T', '1', '7', '12', '13'][i]}</text>
      </g>
    ))}
  </g>
);
const Ponteiro = () => <g {...L} strokeWidth="4"><path d="M200,64L196,24L200,16L204,24Z" fill="#b3111a" /><circle cx="200" cy="60" r="7" fill={OURO} /></g>;
const BOTOES = [0, 1, 2, 3, 4, 5];
const Painel = () => (
  <g {...L} strokeWidth="4">
    <rect x="6" y="6" width="68" height="148" rx="10" fill="url(#cna-ou)" />
    {BOTOES.map((i) => <circle key={i} cx={i % 2 ? 54 : 26} cy={34 + Math.floor(i / 2) * 44} r="11" fill="#5a3010" />)}
  </g>
);

const CSS1 = [
  pos('c1-ei', [600, 478, 400, 460], [170, 760, 440, 506]),
  pos('c1-ef', [600, 478, 400, 460], [170, 760, 440, 506]),
  pos('c1-bp', [1018, 300, 64, 128], [624, 520, 70, 140]),
  pos('c1m', [700, 470, 200, 260], [280, 748, 220, 286]),
  pos('c1t', [1170, 664, 320, 293], [420, 1330, 330, 302]),
  pos('c1-plw', [700, 190, 200, 200], [230, 400, 220, 220]),
  pos('c1-tuw', [930, 330, 180, 180], [470, 590, 180, 180]),
  // portas: fecham (1), abrem sanfonadas (.06) duas vezes
  ...(['c1-pe', 'c1-pd'] as const).map((c, i) => an(c, i ? '82.5% 50%' : '17.5% 50%', [
    [0, tr(0, 0, 0, 1, 1)], [1.6, tr(0, 0, 0, 1, 1)], [1.9, tr(0, 0, 0, .06, 1)], [3.6, tr(0, 0, 0, .06, 1)], [3.9, tr(0, 0, 0, 1, 1)],
    [5.6, tr(0, 0, 0, 1, 1)], [5.9, tr(0, 0, 0, .06, 1)], [7.4, tr(0, 0, 0, .06, 1)], [7.7, tr(0, 0, 0, 1, 1)]])),
  // o ponteiro chega no 13, enlouquece no tranco e volta
  an('c1-ag', '50% 13.04%', [[0, rot(-70)], [1.5, rot(70)], [4.1, rot(70)], [4.3, rot(-40)], [4.55, rot(80)], [4.8, rot(-60)], [5.05, rot(75)], [5.5, rot(70)], [7.8, rot(70)], [9.8, rot(-70)]]),
  // o tranco: a cabine sacode entre as duas paradas
  ...['c1-ei', 'c1-ef'].map((c) => an(`${c}x`, '50% 100%', [[0, tr()], [4.1, tr()],
    ...[4.2, 4.35, 4.5, 4.65, 4.8, 4.95, 5.1, 5.25].map((t, i): Q => [t, tr(i % 2 ? 1.2 : -1.2, i % 3 ? -.6 : .4, i % 2 ? .8 : -.8)]), [5.4, tr()]])),
  pop('c1-g1', [1.62, 5.62], .5),
  pop('c1-g2', [4.3, 4.85], .3),
  // o TROCO-64: dentro, pula e acena na 1ª parada; tonto e torto na 2ª
  an('c1mc', PV.c, [[0, tr()], [1.9, tr()], [2.1, tr(0, -14, 0, 1.04, .96)], [2.3, tr(0, 0, 0, .96, 1.04)], [2.5, tr(0, -14)], [2.7, tr()], [2.9, tr(0, -14)], [3.1, tr()], [3.7, tr()],
    [5.8, tr(0, 0, 14)], [6.2, tr(0, 0, -12)], [6.6, tr(0, 0, 16)], [7.0, tr(0, 0, -10)], [7.6, tr(0, 0, 12)], [8.6, tr()]]),
  an('c1me', PV.e, [[0, rot(10)], [1.9, rot(10)], [2.05, rot(160)], [2.4, rot(130)], [2.7, rot(165)], [3.0, rot(130)], [3.4, rot(160)], [3.8, rot(10)], [5.7, rot(10)], [6.0, rot(70)], [7.3, rot(60)], [7.8, rot(10)]]),
  an('c1md', PV.d, [[0, rot(-10)], [1.9, rot(-10)], [2.05, rot(-160)], [2.4, rot(-130)], [2.7, rot(-165)], [3.0, rot(-130)], [3.4, rot(-160)], [3.8, rot(-10)], [5.7, rot(-10)], [6.0, rot(-70)], [7.3, rot(-60)], [7.8, rot(-10)]]),
  an('c1mh', PV.h, [[0, rot(0)], [5.8, rot(0)], [6.1, rot(-16)], [6.5, rot(14)], [6.9, rot(-12)], [7.4, rot(10)], [7.9, rot(0)]]),
  vis('c1mff', [[1.95, 3.7]]), vis('c1mfe', [[5.75, 7.6]]), vis('c1mfs', [[4.1, 5.5]]),
  // os botões do painel piscam em onda (o 64 apertando todos)
  ...BOTOES.map((i) => an(`c1-b${i}`, null, [[0, op(0)], [.12, op(1)], [.4, op(1)], [.55, op(0)]], i * .37)),
  // o atendente: olha o relógio no pulso, bate o pé de impaciência, assusta com o tranco
  an('c1tk', PA.corpo, [[0, tr()], ...[.5, 1.0, 1.5, 6.6, 7.1, 7.6, 8.1, 8.6].flatMap((t): Q[] => [[t, tr(0, 1.2)], [t + .25, tr()]])]),
  an('c1ta', PA.braco, [[0, rot(0)], [.3, rot(-112)], [1.6, rot(-112)], [1.9, rot(0)], [6.4, rot(0)], [6.7, rot(-112)], [8.8, rot(-112)], [9.1, rot(0)]]),
  an('c1th', PA.cab, [[0, rot(0)], [.35, rot(10)], [1.5, rot(10)], [1.9, rot(-6)], [4.2, rot(-6)], [4.4, rot(4)], [5.4, rot(0)], [6.7, rot(10)], [8.8, rot(10)], [9.1, rot(0)]]),
  caretas('c1', { ypb: [[7.0, 8.6]], yps: [[4.2, 5.4]], ypy: [[2.0, 3.2]] }),
].join('');

const Elevador = memo(function Elevador() {
  return (
    <>
      <Defs />
      <style>{CSS1}</style>
      <div className="pa" /><div className="ch" /><div className="lb" />
      <div className="pal"><div className="sh">
        <FundoSaguao semArco />
        <div className="e c1-ei"><Pt c="c1-eix" vb={EL}><Cabine /></Pt></div>
        <Robo id="c1m" p={P64} k={0} al="n" ar="n" ex={ROSTOS} />
        <div className="e c1-ef"><div className="p c1-efx">
          <Pt c="c1-pe" vb={EL}><Porta x={70} /></Pt>
          <Pt c="c1-pd" vb={EL}><Porta x={200} /></Pt>
          <Pt vb={EL}><Moldura /></Pt>
          <Pt c="c1-ag" vb={EL}><Ponteiro /></Pt>
        </div></div>
        <div className="e c1-bp">
          <Pt vb="0 0 80 160"><Painel /></Pt>
          {BOTOES.map((i) => <Pt key={i} c={`c1-b${i}`} vb="0 0 80 160"><circle cx={i % 2 ? 54 : 26} cy={34 + Math.floor(i / 2) * 44} r="9" fill="#ffe14a" stroke="none" /></Pt>)}
        </div>
        <Atendente pref="c1" />
        <div className="e c1-plw"><Golpe c="c1-g1" cx={100} cy={100} t="PLIM!" r={66} cor="#fff3b0" rot={-6} vb="0 0 200 200" /></div>
        <div className="e c1-tuw"><Golpe c="c1-g2" cx={90} cy={90} t="TUM!" r={56} cor="#ffb347" rot={10} vb="0 0 180 180" /></div>
      </div></div>
    </>
  );
});

// ═══ 2. MALA FUJONA ══════════════════════════════════════════════════════════
const CA = '0 0 360 320';
const Carrinho = () => (
  <g {...L}>
    <path d="M40,252V44Q40,22,62,22H298Q320,22,320,44V252" fill="none" stroke={OURO_E} strokeWidth="14" />
    <path d="M40,252V44Q40,22,62,22H298Q320,22,320,44V252" fill="none" stroke={OURO} strokeWidth="7" />
    <rect x="22" y="246" width="316" height="22" rx="6" fill="url(#cna-ou)" />
  </g>
);
const Malas = () => (
  <g {...L}>
    <rect x="58" y="150" width="148" height="98" rx="10" fill="#2b4a8a" />
    <path d="M58,182H206M58,214H206" stroke="#16264a" strokeWidth="5" />
    <rect x="114" y="140" width="36" height="14" rx="4" fill="#3d2010" />
    <rect x="206" y="170" width="112" height="78" rx="10" fill="#a3202b" />
    <circle cx="240" cy="200" r="11" fill="#ffe14a" /><circle cx="286" cy="222" r="8" fill="#4dff7a" />
  </g>
);
const Chapeleira = () => (
  <g {...L}><rect x="96" y="96" width="96" height="56" rx="12" fill="#d79a2c" /><path d="M96,112H192" stroke="#7a4a1a" strokeWidth="5" /><rect x="128" y="82" width="32" height="16" rx="5" fill="#7a4a1a" /></g>
);
const Roda: React.FC<{ x: number }> = ({ x }) => (
  <g {...L}><circle cx={x} cy="290" r="26" fill="#2a1710" /><circle cx={x} cy="290" r="9" fill={OURO} /><path d={`M${x},266V314M${x - 24},290H${x + 24}`} stroke={OURO_E} strokeWidth="4" /></g>
);

// ida: o carrinho entra pela esquerda e para em `--dx` (em % da largura dele); de ré, foge de volta
const ida = (k: number) => `transform:translateX(calc(var(--dx) * ${k}))`;
const CSS2 = [
  pos('c2-ca', [-380, 700, 360, 320], [-320, 1260, 300, 267], '--dx:355%', '--dx:205%'),
  pos('c2t', [40, 664, 320, 293], [440, 962, 290, 266]),
  pos('c2g', [640, 690, 300, 390], [40, 1180, 280, 364]),
  pos('c2-ba', [600, 700, 90, 90], [10, 1190, 90, 90]),
  pos('c2a', [1180, 690, 300, 390], [470, 1250, 280, 364], '--jx:-45%;--jy:-56%;--fx:-471%', '--jx:-68%;--jy:-52%;--fx:-290%'),
  pos('c2-ffw', [150, 400, 440, 176], [280, 700, 420, 168]),
  pos('c2-thw', [520, 640, 300, 230], [60, 1160, 260, 200]),
  pos('c2-tcw', [1250, 300, 280, 280], [520, 820, 240, 240]),
  pos('c2-ihw', [760, 300, 420, 168], [260, 830, 420, 168]),
  an('c2-ca', null, [[0, `${ida(0)};${op(1)}`], [.2, `${ida(0)};${op(1)}`], [2.4, `${ida(.72)};${op(1)}`], [3.4, `${ida(.9)};${op(1)}`], [4.8, `${ida(.98)};${op(1)}`], [5.0, `${ida(1)};${op(1)}`], [8.2, `${ida(1)};${op(1)}`], [8.5, `${ida(1.03)};${op(1)}`], [9.4, `${ida(-.05)};${op(1)}`], [9.45, `${ida(-.05)};${op(0)}`], [9.9, `${ida(0)};${op(0)}`], [10, `${ida(0)};${op(1)}`]]),
  // o carrinho chacoalha em movimento; para quieto quando o 63 segura
  an('c2-cb', '50% 90%', [[0, tr()], ...[.4, .8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 4.0, 4.4, 8.6, 8.9, 9.2].map((t, i): Q => [t, tr(0, i % 2 ? -2 : 0, i % 2 ? 2 : -2)]), [5.0, tr(0, 0, -6)], [5.3, tr()], [8.3, tr()]]),
  an('c2-mt', '50% 100%', [[0, tr()], ...[.5, 1.3, 2.1, 2.9, 3.7].flatMap((t): Q[] => [[t, tr(0, -22, -10)], [t + .3, tr()]]), [5.0, tr(0, -40, 24)], [5.4, tr()]]),
  ...['c2-w1', 'c2-w2'].map((c, i) => an(c, `${i ? 80.6 : 19.4}% 90.6%`, [[0, rot(0)], [5.0, rot(1440)], [8.2, rot(1440)], [9.4, rot(0)]])),
  // o atendente grita e aponta
  an('c2ta', PA.braco, [[0, rot(0)], [.3, rot(-130)], [.6, rot(-100)], [.9, rot(-130)], [1.2, rot(-100)], [1.6, rot(-130)], [2.2, rot(0)], [8.4, rot(0)], [8.6, rot(-140)], [9.6, rot(-140)], [9.9, rot(0)]]),
  an('c2th', PA.cab, [[0, rot(0)], [.3, rot(-8)], [2.2, rot(8)], [3.4, rot(14)], [5.2, rot(0)]]),
  pop('c2-ff', [.35, 8.55], .9),
  caretas('c2', { yps: [[.3, 2.4], [8.5, 9.6]], ypy: [[5.2, 6.6]] }),
  // o segurança: vem bravo, pisa na banana, voa e cai (THUD!), tonto até levantar
  an('c2gc', PV.c, [[0, tr()], [1.8, tr()], [2.5, tr(-8, 0, -4)], [2.62, tr(-8, 0, -4)], [2.9, tr(-12, -26, -70, 1.05, .95)], [3.25, tr(-14, -30, -100)], [3.45, tr(-16, 6, -90, 1.08, .9)], [3.6, tr(-16, 4, -90)],
    [6.9, tr(-16, 4, -90)], [7.4, tr(-12, -6, -40)], [7.8, tr(-8, 0, 0, 1.04, .96)], [8.0, tr(-8, 0, 0)], [9.4, tr()]]),
  an('c2ge', PV.e, [[0, rot(10)], [1.8, rot(10)], [2.2, rot(70)], [2.6, rot(60)], [2.9, rot(150)], [3.45, rot(120)], [6.9, rot(120)], [7.6, rot(10)]]),
  an('c2gd', PV.d, [[0, rot(-10)], [1.8, rot(-10)], [2.2, rot(-70)], [2.6, rot(-60)], [2.9, rot(-150)], [3.45, rot(-120)], [6.9, rot(-120)], [7.6, rot(-10)]]),
  passos('c2g', [[1.8, 2.5, 2, 18], [8.0, 9.4, 4, 16]]),
  vis('c2gfb', [[1.6, 2.6]]), vis('c2gfx', [[3.45, 6.9]]), vis('c2gfe', [[6.9, 7.9]]),
  an('c2-ba', '50% 50%', [[0, `${tr()};${op(1)}`], [2.6, `${tr()};${op(1)}`], [3.2, `${tr(320, -160, 540)};${op(0)}`], [9.5, `${tr(0, 0, 0)};${op(0)}`], [9.8, `${tr()};${op(1)}`]]),
  pop('c2-th', [3.42], .7),
  // o TROCO-63: agacha, pula em cima das malas (TCHAN!), comemora… e o carrinho foge de ré com ele em cima
  an('c2ac', PV.c, [[0, `${tr()};${op(1)}`], [3.6, `${tr()};${op(1)}`], [4.0, `${tr(0, 0, 0, 1.08, .86)};${op(1)}`], [4.2, `${tr(0, 0, 0, 1.08, .86)};${op(1)}`],
    [4.5, 'transform:translate(calc(var(--jx) * .6),calc(var(--jy) - 22%)) rotate(-12deg) scale(.96,1.08);opacity:1'],
    [4.85, 'transform:translate(var(--jx),var(--jy)) rotate(0deg) scale(1.08,.9);opacity:1'], [5.05, 'transform:translate(var(--jx),var(--jy)) rotate(0deg) scale(1,1);opacity:1'],
    [8.2, 'transform:translate(var(--jx),var(--jy)) rotate(0deg) scale(1,1);opacity:1'], [8.5, 'transform:translate(calc(var(--jx) + 4%),var(--jy)) rotate(10deg) scale(1,1);opacity:1'],
    [9.4, 'transform:translate(var(--fx),var(--jy)) rotate(14deg) scale(1,1);opacity:1'], [9.45, `transform:translate(var(--fx),var(--jy)) rotate(14deg) scale(1,1);${op(0)}`],
    [9.6, `${tr()};${op(0)}`], [10, `${tr()};${op(1)}`]]),
  an('c2ad', PV.d, [[0, rot(-10)], [3.5, rot(-10)], [4.2, rot(-40)], [4.5, rot(-150)], [5.0, rot(-60)], [5.4, rot(-165)], [5.7, rot(-140)], [6.0, rot(-165)], [6.3, rot(-140)], [6.6, rot(-165)], [8.2, rot(-165)], [8.5, rot(-120)], [9.4, rot(-170)], [9.6, rot(-10)]]),
  an('c2ae', PV.e, [[0, rot(10)], [3.5, rot(10)], [4.5, rot(150)], [5.0, rot(40)], [8.2, rot(40)], [8.5, rot(160)], [9.4, rot(170)], [9.6, rot(10)]]),
  an('c2ah', PV.h, [[0, rot(0)], [3.2, rot(-10)], [3.6, rot(0)], [5.0, rot(-8)], [8.4, rot(0)], [8.6, rot(12)], [9.4, rot(-8)], [9.6, rot(0)]]),
  vis('c2afs', [[3.3, 4.0], [8.3, 9.4]]), vis('c2aff', [[5.0, 8.2]]),
  pop('c2-tc', [5.0], .8), pop('c2-ih', [8.6], .7),
].join('');

const MalaFujona = memo(function MalaFujona() {
  return (
    <>
      <Defs />
      <style>{CSS2}</style>
      <div className="pa" /><div className="ch" /><div className="lb" />
      <div className="pal"><div className="sh">
        <FundoSaguao />
        <Atendente pref="c2" />
        <div className="e c2-ba"><Pt vb="-40 -40 80 80"><Banana /></Pt></div>
        <Robo id="c2g" p={PSG} k={2} al="b" ar="n" ex={ROSTOS} />
        <div className="e c2-ca"><div className="p c2-cb">
          <Pt c="c2-w1" vb={CA}><Roda x={70} /></Pt>
          <Pt c="c2-w2" vb={CA}><Roda x={290} /></Pt>
          <Pt vb={CA}><Carrinho /></Pt>
          <Pt vb={CA}><Malas /></Pt>
          <Pt c="c2-mt" vb={CA}><Chapeleira /></Pt>
        </div></div>
        <Robo id="c2a" p={P63} k={1} al="n" ar="c" ex={ROSTOS} />
        <div className="e c2-ffw"><Fala c="c2-ff" t="MINHA MALA!" w={320} /></div>
        <div className="e c2-thw"><Golpe c="c2-th" cx={130} cy={100} t="THUD!" r={70} cor="#ffb347" rot={-8} vb="0 0 260 200" /></div>
        <div className="e c2-tcw"><Golpe c="c2-tc" cx={120} cy={120} t="TCHAN!" r={86} cor="#fff3b0" rot={8} vb="0 0 240 240" /></div>
        <div className="e c2-ihw"><Fala c="c2-ih" t="IIIIHAAA!" w={300} /></div>
      </div></div>
    </>
  );
});

// ═══ 3. TRÉGUA DO CHÁ ════════════════════════════════════════════════════════
const ME = '0 0 360 260';
const Mesa = () => (
  <g {...L}>
    <path d="M110,190L92,256M250,190L268,256" stroke="#3d2010" strokeWidth="14" />
    <path d="M14,96Q16,190,40,206Q180,232,320,206Q344,190,346,96Z" fill="#f6f1e4" />
    <path d="M40,206Q60,180,72,206Q100,184,118,212Q150,188,170,214Q200,190,220,214Q250,188,272,210Q300,186,320,206" fill="none" stroke="#c9bfa6" strokeWidth="4" />
    <ellipse cx="180" cy="96" rx="170" ry="42" fill="#fffaf0" />
    <ellipse cx="180" cy="96" rx="150" ry="32" fill="none" stroke="#e63a2e" strokeWidth="4" strokeDasharray="14 10" />
    {/* xícaras */}
    <path d="M58,84Q60,104,76,106Q92,104,94,84Z" fill="#fff" /><path d="M94,88q10,0,8,9q-2,6,-9,5" fill="none" />
    <path d="M266,84Q268,104,284,106Q300,104,302,84Z" fill="#fff" /><path d="M266,88q-10,0,-8,9q2,6,9,5" fill="none" />
    {/* o monte de cartas no meio */}
    <rect x="160" y="78" width="40" height="24" rx="4" fill="#fff" transform="rotate(-8 180 90)" />
    <rect x="164" y="76" width="40" height="24" rx="4" fill="#fff" transform="rotate(6 184 88)" />
  </g>
);
const NAIPES = ['♥', '♠', '♦', '♣', '♥', '♠'];
const Carta: React.FC<{ n: number }> = ({ n }) => (
  <g {...L} strokeWidth="4">
    <rect x="4" y="4" width="52" height="72" rx="8" fill="#fffaf0" />
    <text x="30" y="52" textAnchor="middle" fontSize="34" fill={n % 2 ? K : '#e63a2e'} stroke="none">{NAIPES[n]}</text>
  </g>
);
// para onde cada carta voa quando a mesa vira (x %, y %, giro)
const VOO: [number, number, number][] = [[-520, -420, -540], [-260, -620, 380], [40, -700, -320], [300, -560, 460], [560, -380, -400], [-80, -300, 720]];

const CSS3 = [
  pos('c3-mew', [620, 706, 360, 260], [210, 1330, 340, 245]),
  pos('c3a', [390, 690, 300, 390], [10, 1250, 270, 351]),
  pos('c3g', [910, 690, 300, 390], [500, 1250, 270, 351]),
  pos('c3m', [1110, 640, 210, 273], [600, 1090, 170, 221]),
  pos('c3t', [1240, 664, 330, 302], [440, 962, 290, 266]),
  ...VOO.map((_, i) => pos(`c3-kw${i}`, [770 + (i % 3) * 18, 470, 60, 80], [350 + (i % 3) * 18, 1110, 60, 80])),
  pos('c3-btw', [400, 300, 380, 152], [30, 860, 380, 152]),
  pos('c3-crw', [640, 380, 300, 300], [220, 1020, 300, 300]),
  pos('c3-hmw', [980, 300, 180, 180], [540, 860, 160, 160]),
  // a mesa: firme o jogo inteiro; vira por cima do 63 e some; volta arrumada no fim do laço
  an('c3-me', '18% 96%', [[0, `${tr()};${op(1)}`], [6.95, `${tr()};${op(1)}`], [7.05, `${tr(4, -6, 8)};${op(1)}`], [7.4, `${tr(-10, -60, -120)};${op(1)}`], [7.8, `${tr(-30, 10, -175)};${op(1)}`],
    [8.7, `${tr(-30, 10, -175)};${op(1)}`], [9.1, `${tr(-30, 10, -175)};${op(0)}`], [9.5, `${tr()};${op(0)}`], [9.9, `${tr()};${op(1)}`]]),
  // as cartas: escondidas no monte; voam na virada e somem
  ...VOO.map(([x, y, r], i) => an(`c3-k${i}`, '50% 50%', [[0, `${tr()};${op(0)}`], [7.02, `${tr()};${op(0)}`], [7.05, `${tr(0, 0, 0, .8)};${op(1)}`],
    [7.9, `${tr(x * .7, y, r * .7)};${op(1)}`], [8.8, `${tr(x, y * .4, r)};${op(1)}`], [9.2, `${tr(x, -y * .2, r * 1.2)};${op(0)}`]])),
  // o TROCO-63: confere as cartas, ri quando vê o sinal do irmão, bate a carta (BATI!), toma a mesa na cara
  an('c3ac', PV.c, [[0, tr()], [.5, tr(0, -1.5)], [1, tr()], [1.5, tr(0, -1.5)], [2, tr()], [4.7, tr()], [4.9, tr(4, 2, 6, 1.04, .94)], [5.2, tr()],
    [7.0, tr()], [7.3, tr(-8, 0, -14)], [7.7, tr(-14, 0, -24, 1.04, .96)], [8.6, tr(-14, 0, -24)], [9.4, tr()]]),
  an('c3ad', PV.d, [[0, rot(-40)], [2.0, rot(-40)], [2.4, rot(-60)], [4.6, rot(-140)], [4.85, rot(-40)], [6.9, rot(-40)], [7.2, rot(-150)], [8.6, rot(-150)], [9.3, rot(-40)]]),
  an('c3ae', PV.e, [[0, rot(40)], [6.9, rot(40)], [7.2, rot(150)], [8.6, rot(150)], [9.3, rot(40)]]),
  an('c3ah', PV.h, [[0, rot(0)], [2.2, rot(8)], [2.6, rot(-6)], [3.0, rot(0)], [7.1, rot(-14)], [8.6, rot(-14)], [9.2, rot(0)]]),
  vis('c3aff', [[2.3, 4.5], [5.0, 6.0]]), vis('c3afs', [[7.0, 7.6]]), vis('c3afx', [[7.6, 9.2]]),
  // o segurança: cartas na mão, desconfia, vira a cabeça e pega o 64; fica vermelho e vira a mesa
  an('c3gc', PV.c, [[0, tr()], [.6, tr(0, -1.5)], [1.2, tr()], [1.8, tr(0, -1.5)], [2.4, tr()], [6.1, tr()], [6.4, tr(0, 0, 0, 1.06, 1.08)], [6.9, tr(0, -2, 0, 1.06, 1.08)],
    [7.05, tr(-6, 0, -10, 1.04, 1)], [7.4, tr(-4, 0, -4)], [8.8, tr(-4, 0, -4)], [9.4, tr()]]),
  an('c3gh', PV.h, [[0, rot(0)], [5.2, rot(0)], [5.45, rot(22)], [6.1, rot(22)], [6.4, rot(-6)], [9.4, rot(0)]]),
  an('c3ge', PV.e, [[0, rot(-40)], [6.8, rot(-40)], [7.05, rot(160)], [7.6, rot(140)], [9.3, rot(-40)]]),
  an('c3gd', PV.d, [[0, rot(40)], [6.8, rot(40)], [7.05, rot(-160)], [7.6, rot(-140)], [9.3, rot(40)]]),
  vis('c3gfs', [[5.4, 6.1]]), vis('c3gfb', [[6.1, 9.0]]),
  // o TROCO-64: espia por trás do segurança e faz sinais; pego, congela e se esconde
  an('c3mc', PV.c, [[0, tr(10)], [.4, tr(-6)], [5.3, tr(-6)], [5.5, tr(-6, 0, 0, 1.06, .94)], [5.9, tr(16, 0, 0)], [9.4, tr(16)], [9.9, tr(10)]]),
  an('c3md', PV.d, [[0, rot(-10)], ...[.8, 2.0, 3.2, 4.4].flatMap((t): Q[] => [[t, rot(-150)], [t + .2, rot(-110)], [t + .4, rot(-150)], [t + .6, rot(-10)]]), [5.5, rot(-10)]]),
  an('c3me', PV.e, [[0, rot(10)], ...[1.4, 2.6, 3.8].flatMap((t): Q[] => [[t, rot(90)], [t + .3, rot(10)]])]),
  an('c3mh', PV.h, [[0, rot(0)], ...[.8, 2.0, 3.2, 4.4].flatMap((t): Q[] => [[t, rot(-12)], [t + .3, rot(10)], [t + .6, rot(0)]])]),
  vis('c3mff', [[.4, 5.3]]), vis('c3mfs', [[5.4, 7.2]]),
  // o atendente: serve o chá (bule inclina), cochila, acorda no CRASH
  an('c3ta', PA.braco, [[0, rot(0)], [.4, rot(-70)], [2.4, rot(-70)], [2.8, rot(0)], [7.05, rot(0)], [7.2, rot(-150)], [8.4, rot(-150)], [8.8, rot(0)]]),
  an('c3-bl', '58.9% 49.7%', [[0, op(0)], [.5, op(0)], [.6, op(1)], [2.3, op(1)], [2.4, op(0)]]),
  an('c3th', PA.cab, [[0, rot(0)], [3.4, rot(0)], [3.8, rot(-12)], [6.9, rot(-12)], [7.1, rot(6)], [8.6, rot(0)]]),
  caretas('c3', { ypb: [[3.6, 6.95]], yps: [[7.05, 8.6]] }),
  pop('c3-bt', [4.82], .6), pop('c3-cr', [7.06], .8), pop('c3-hm', [5.45], .55),
].join('');

const TreguaDoCha = memo(function TreguaDoCha() {
  return (
    <>
      <Defs />
      <style>{CSS3}</style>
      <div className="pa" /><div className="ch" /><div className="lb" />
      <div className="pal"><div className="sh">
        <FundoSaguao />
        <Atendente pref="c3" mao={<g className="c3-bl">
          {/* o bule na mão (gira junto com o braço) e o fio de chá */}
          <g {...L} strokeWidth="4" transform="translate(212 232)">
            <path d="M-26,-6Q-30,28,0,30Q30,28,26,-6Z" fill="#f6f1e4" /><path d="M26,2Q44,0,46,-16" fill="none" strokeWidth="6" />
            <rect x="-10" y="-14" width="20" height="10" rx="4" fill={OURO} />
          </g>
        </g>} />
        <Robo id="c3m" p={P64} k={0} al="n" ar="n" ex={ROSTOS} />
        <Robo id="c3g" p={PSG} k={2} al="n" ar="n" ex={ROSTOS} />
        <Robo id="c3a" p={P63} k={1} al="n" ar="c" ex={ROSTOS} />
        <div className="e c3-mew"><Pt c="c3-me" vb={ME}><Mesa /></Pt></div>
        {VOO.map((_, i) => <div key={i} className={`e c3-kw${i}`}><Pt c={`c3-k${i}`} vb="0 0 60 80"><Carta n={i} /></Pt></div>)}
        <div className="e c3-btw"><Fala c="c3-bt" t="BATI!" w={280} /></div>
        <div className="e c3-hmw"><Golpe c="c3-hm" cx={90} cy={90} t="HÃ?" r={60} cor="#9af6ff" rot={-10} vb="0 0 180 180" /></div>
        <div className="e c3-crw"><Golpe c="c3-cr" cx={150} cy={150} t="CRASH!" r={110} cor="#fff3b0" rot={6} vb="0 0 300 300" /></div>
      </div></div>
    </>
  );
});

/** As cenas extras, na ordem em que a bancada as chama (?cena=1, 2, 3). */
export const CENAS_EXTRAS: React.ComponentType[] = [Elevador, MalaFujona, TreguaDoCha];

registrarCenas(CENAS_EXTRAS);
