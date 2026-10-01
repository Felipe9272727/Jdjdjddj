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
import { assar, ferve, ginga, pernas, pulo, susto, tremor } from './cnMotor';

// ── TEMPO E CSS ──────────────────────────────────────────────────────────────
export const D = 10; // segundos por laço
export const pct = (t: number) => `${+(Math.min(D, Math.max(0, t)) / D * 100).toFixed(2)}%`;
/** Suavização do trecho que COMEÇA neste quadro: i suave · o chega freando · a arranca · p passa e volta · h degrau · l linear. */
export type Ez = 'i' | 'o' | 'a' | 'p' | 'h' | 'l';
const EZ: Record<Ez, string> = { i: 'cubic-bezier(.45,0,.55,1)', o: 'cubic-bezier(.12,.8,.3,1)', a: 'cubic-bezier(.7,0,.84,.3)', p: 'cubic-bezier(.3,1.6,.5,1)', h: 'steps(1,end)', l: 'linear' };
export type Q = [number, string, Ez?]; // [s, declarações css, suavização do trecho seguinte]
/** Uma animação: @keyframes + a regra da classe (pivô, laço, atraso da bancada). */
export const an = (cls: string, piv: string | null, q: Q[], atraso = 0, dur = D) => {
  // quadro sem opacidade numa animação que mexe nela interpolaria até o próximo valor (o ator
  // ia sumindo devagar): todo quadro que não diz nada sobre ela vale opacity:1
  const usaOp = q.some(([, c]) => c.includes('opacity'));
  const f = q.map(([t, c, e]): Q => [t, usaOp && !c.includes('opacity') ? `${c};opacity:1` : c, e]).sort((a, b) => a[0] - b[0]);
  if (f[0][0] > 0) f.unshift([0, f[f.length - 1][1]]);
  if (f[f.length - 1][0] < dur) f.push([dur, f[0][1]]);
  const nome = `k-${cls.replace(/[^a-z0-9-]/gi, '_')}`;
  const pc = (t: number) => `${+(Math.min(dur, Math.max(0, t)) / dur * 100).toFixed(2)}%`;
  return `@keyframes ${nome}{${f.map(([t, c, e]) => `${pc(t)}{${c}${e && e !== 'i' ? `;animation-timing-function:${EZ[e]}` : ''}}`).join('')}}`
    + `.cna .${cls}{${piv ? `transform-origin:${piv};` : ''}will-change:transform,opacity;`
    + `animation:${nome} ${dur}s ${EZ.i} infinite both;animation-delay:calc(var(--off) - ${atraso}s)}`;
};
/** Respiração: sobe e alarga de leve num laço próprio (dur s), defasada por `fase` para ninguém respirar junto. */
export const respira = (cls: string, piv: string, dur = 2.6, amp = .022, fase = 0) =>
  an(cls, piv, [[0, 'transform:translateY(0) scale(1,1)'], [dur / 2, `transform:translateY(-${amp * 40}%) scale(${1 - amp / 2},${1 + amp})`], [dur, 'transform:translateY(0) scale(1,1)']], fase, dur);
/** Piscar: o olho fecha (scaleY) por 120 ms nos instantes `ts` do laço. */
export const pisca = (cls: string, piv: string, ts: number[]) => {
  const q: Q[] = [[0, 'transform:scaleY(1)']];
  for (const t of ts) q.push([t - .01, 'transform:scaleY(1)'], [t + .05, 'transform:scaleY(.08)'], [t + .12, 'transform:scaleY(1)']);
  return an(cls, piv, q);
};
/** Passada com peso: o corpo desce no apoio e sobe no meio do passo (n passos entre t0 e t1). */
export const balanco = (cls: string, t0: number, t1: number, n: number, alt = 3, gir = 2): Q[] =>
  Array.from({ length: n * 2 + 1 }, (_, i): Q => {
    const t = t0 + (t1 - t0) * i / (n * 2);
    return [t, i === 0 || i === n * 2 ? tr() : tr(0, i % 2 ? -alt : 0, i % 2 ? 0 : (i / 2) % 2 ? gir : -gir), i % 2 ? 'a' : 'o'];
  });
/** Poeira: três tufos que estouram de um ponto e somem (nos instantes ts). */
export const poeira = (cls: string, ts: number[]) => [0, 1, 2].map((k) => {
  const q: Q[] = [[0, `${tr(0, 0, 0, .2)};${op(0)}`]];
  for (const t of ts) q.push([t - .01, `${tr(0, 0, 0, .2)};${op(0)}`], [t, `${tr(0, 0, 0, .3)};${op(.9)}`, 'o'], [t + .45, `${tr((k - 1) * 70, -30 - k * 6, 0, 1.25)};${op(0)}`]);
  return an(`${cls}${k}`, '50% 80%', q);
}).join('');
export const Poeira: React.FC<{ c: string }> = ({ c }) => <>{[0, 1, 2].map((k) => <Pt key={k} c={`${c}${k}`} vb="0 0 120 80"><ellipse cx="60" cy="56" rx="26" ry="16" fill="#e8d8c0" opacity=".85" /></Pt>)}</>;
/** Tranco de impacto num elemento (o palco inteiro, um prédio): instantes ts, amplitude a (%). */
export const tranco = (cls: string, ts: number[], a = 1.2) => {
  const q: Q[] = [[0, tr()]];
  for (const t of ts) q.push([t - .01, tr()], [t, tr(a, -a * .6)], [t + .05, tr(-a * .8, a * .5)], [t + .1, tr(a * .5, -a * .3)], [t + .16, tr(-a * .2, a * .1)], [t + .24, tr()]);
  return an(cls, '50% 50%', q);
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
    <div className={`p ${pref}tr`}>
      <Pt c={`${pref}tk`} vb={VA}><AtdCorpo /></Pt>
      <Pt c={`${pref}th`} vb={VA}><AtdCabeca /></Pt>
    </div>
    <Pt vb={VA}><AtdBalcao /></Pt>
    {/* o braço vem depois do balcão (a mão e o bule ficam por cima dele) e respira junto com o corpo */}
    <div className={`p ${pref}tr`}><Pt c={`${pref}ta`} vb={VA}><AtdBraco />{mao}</Pt></div>
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
  // ── REFEITA no cnMotor: linha do tempo do GSAP, assada a 12 qps em degrau ──
  // 0–1,5 o ponteiro sobe até o 13 · 1,5 PLIM, a porta abre e o 64 acena lá dentro ·
  // 2,7 ele pula para fora e faz pose · 4,3 a porta BATE atrás dele (TUM!) · esmurra a porta ·
  // 6,1 ela abre de repente e ele cai para dentro · a cabine despenca · o atendente suspira.
  ...(['c1-pe', 'c1-pd'] as const).map((c, i) => assar(c, i ? '82.5% 50%' : '17.5% 50%', D, (tl, a) => {
    const abre = (t: number) => tl.to(a, { sx: 1.05, duration: 2 / 12, ease: 'power1.out' }, t).to(a, { sx: .06, duration: .28, ease: 'expo.out' }, t + 2 / 12);
    const fecha = (t: number, d = .16) => tl.to(a, { sx: 1, duration: d, ease: 'expo.in' }, t).to(a, { sx: .97, duration: 1 / 12 }, t + d).to(a, { sx: 1, duration: 2 / 12 }, t + d + 1 / 12);
    abre(1.5); fecha(4.25);
    for (const t of [5.25, 5.55, 5.85]) tl.to(a, { sx: .96, duration: 1 / 12 }, t).to(a, { sx: 1, duration: 2 / 12, ease: 'back.out(3)' }, t + 1 / 12);
    tl.to(a, { sx: .06, duration: .2, ease: 'expo.out' }, 6.1); fecha(6.55, .2);
  })),
  assar('c1-ag', '50% 13.04%', D, (tl, a) => {
    tl.set(a, { r: -70 }, 0).to(a, { r: 70, duration: 1.1, ease: 'back.out(2.2)' }, .2)
      .to(a, { r: -790, duration: .9, ease: 'power3.in' }, 6.7).to(a, { r: -70, duration: .01 }, 7.61)
      .to(a, { r: -82, duration: .5, ease: 'elastic.out(1,.35)' }, 7.62).to(a, { r: -70, duration: .4 }, 8.2);
  }),
  assar('c1-efx', '50% 100%', D, (tl, a) => { tremor(tl, a, 4.33, 1.2, 5); for (const t of [5.25, 5.55, 5.85]) tremor(tl, a, t, .5, 2); tremor(tl, a, 7.3, 2.2, 10); }),
  assar('c1-eix', '50% 100%', D, (tl, a) => { tremor(tl, a, 7.3, 2.2, 10); }),
  pop('c1-g1', [1.5], .6),
  pop('c1-g2', [4.33, 7.32], .4),
  // o TROCO-64 — raiz: perspectiva (cresce ao vir para a frente); c: atuação do corpo
  assar('c1m', '50% 100%', D, (tl, a) => {
    tl.to(a, { sx: 1.25, sy: 1.25, duration: .6, ease: 'none' }, 2.95).to(a, { sx: 1.1, sy: 1.1, duration: .4, ease: 'none' }, 4.8).to(a, { sx: 1, sy: 1, duration: .3, ease: 'none' }, 6.15);
  }),
  assar('c1mc', PV.c, D, (tl, a) => {
    tl.set(a, { o: 1 }, 1.55);
    ginga(tl, a, 1.8, 2.7, { passo: .3, alt: 3, gir: 4 });                       // acena gingando lá dentro
    pulo(tl, a, 2.7, { dx: 115, alt: 38, voo: .6 });                                 // pula para fora
    tl.to(a, { y: 72, duration: .6, ease: 'none' }, 2.95);                          // ...e para a frente
    susto(tl, a, 4.33, { alt: 10 });                                                 // a porta bateu
    tl.to(a, { x: 55, y: 26, duration: .4, ease: 'cn.arranca' }, 4.8);                      // corre de volta
    for (const t of [5.2, 5.5, 5.8]) tl.to(a, { sx: 1.1, sy: .9, duration: 1 / 12 }, t).to(a, { sx: 1, sy: 1, duration: 2 / 12, ease: 'back.out(2)' }, t + 1 / 12);
    // a porta abre: ele cai para dentro esticado (smear) e some
    tl.to(a, { sx: .7, sy: 1.35, r: -14, duration: 1 / 12 }, 6.15).to(a, { x: 0, y: 0, sx: 1, sy: 1, r: 0, duration: .3, ease: 'power3.in' }, 6.25)
      .set(a, { o: 0 }, 6.6).set(a, { x: 0, y: 0 }, 6.62);
  }, { inicial: { o: 0 } }),
  assar('c1mh', PV.h, D, (tl, a) => {                                                 // a cabeça atrasa (overlap)
    tl.to(a, { r: 10, duration: .2, ease: 'back.out(3)' }, 1.95).to(a, { r: -10, duration: .3, ease: 'sine.inOut' }, 2.2).to(a, { r: 0, duration: .3, ease: 'back.out(2)' }, 2.5);
    tl.to(a, { r: -8, duration: 2 / 12 }, 3.55).to(a, { r: 0, duration: .4, ease: 'elastic.out(1,.4)' }, 3.72);
    tl.to(a, { r: 18, duration: .25, ease: 'back.out(2)' }, 4.45).to(a, { r: 0, duration: .3 }, 4.8);
  }),
  ...(['e', 'd'] as const).map((k) => {
    const sg = k === 'e' ? 1 : -1;
    return assar(`c1m${k}`, k === 'e' ? PV.e : PV.d, D, (tl, a) => {
      tl.set(a, { r: 10 * sg }, 0);
      // aceno: sobe com antecipação, balança atrasado 2 quadros do corpo
      tl.to(a, { r: -6 * sg, duration: 2 / 12 }, 1.8).to(a, { r: 150 * sg, duration: .25, ease: 'back.out(2)' }, 1.97);
      for (let i = 0; i < 3; i++) tl.to(a, { r: (i % 2 ? 150 : 120) * sg, duration: .15, ease: 'sine.inOut' }, 2.25 + i * .15);
      tl.to(a, { r: 20 * sg, duration: .15, ease: 'power2.in' }, 2.75);              // braços colam no pulo
      tl.to(a, { r: 165 * sg, duration: .35, ease: 'back.out(2.5)' }, 3.6);          // TCHARAM
      tl.to(a, { r: 60 * sg, duration: 2 / 12 }, 4.35).to(a, { r: 30 * sg, duration: .3 }, 4.6);
      // esmurra: um braço de cada vez, de cima para baixo
      for (const [j, t] of [5.12, 5.42, 5.72].entries()) if ((j % 2 === 0) === (k === 'd'))
        tl.to(a, { r: 150 * sg, duration: 2 / 12, ease: 'power2.out' }, t - .1).to(a, { r: 40 * sg, duration: 1 / 12, ease: 'power3.in' }, t + .08);
      tl.to(a, { r: 170 * sg, duration: 1 / 12 }, 6.15).to(a, { r: 10 * sg, duration: .3 }, 6.3);
    });
  }),
  ...(['l', 'r'] as const).map((k) => assar(`c1m${k}`, k === 'l' ? PV.l : PV.r, D, (tl, a) => pernas(tl, a, 4.8, 5.15, { passo: .2, ang: 30, fase: k === 'l' ? 0 : 1 }))),
  vis('c1mff', [[1.75, 4.3]]), vis('c1mfs', [[4.33, 4.9]]), vis('c1mfb', [[4.9, 6.1]]), vis('c1mfx', [[6.1, 6.6]]),
  ferve('c1mb', PV.c, 1, 3),
  // os botões do painel piscam em onda (o 64 apertando todos)
  ...BOTOES.map((i) => an(`c1-b${i}`, null, [[0, op(0)], [.12, op(1)], [.4, op(1)], [.55, op(0)]], i * .37)),
  // o atendente: confere o relógio de pulso, leva o susto da porta, suspira quando a cabine despenca
  assar('c1tk', PA.corpo, D, (tl, a) => {
    for (const t of [.3, .8, 1.3]) tl.to(a, { y: 1.4, sy: .97, duration: .12, ease: 'power2.in' }, t).to(a, { y: 0, sy: 1, duration: .25, ease: 'back.out(2)' }, t + .12);
    susto(tl, a, 4.35, { alt: 4 });
    tl.to(a, { y: 2.5, sx: 1.04, sy: .94, duration: .7, ease: 'sine.inOut' }, 7.9).to(a, { y: 0, sx: 1, sy: 1, duration: .6, ease: 'sine.inOut' }, 9.0);
  }),
  assar('c1ta', PA.braco, D, (tl, a) => {
    tl.to(a, { r: 8, duration: 2 / 12 }, .1).to(a, { r: -112, duration: .3, ease: 'back.out(1.8)' }, .27).to(a, { r: 0, duration: .3, ease: 'power2.inOut' }, 1.5)
      .to(a, { r: -60, duration: 2 / 12 }, 4.36).to(a, { r: 0, duration: .4, ease: 'elastic.out(1,.4)' }, 4.6);
  }),
  assar('c1th', PA.cab, D, (tl, a) => {
    // olha o relógio · olha o elevador · double-take quando o 64 aterrissa ao lado
    tl.to(a, { r: 12, duration: .3, ease: 'back.out(2)' }, .3).to(a, { r: -6, duration: .25, ease: 'back.out(2)' }, 1.5)
      .to(a, { r: 4, duration: .2 }, 3.6).to(a, { r: -4, duration: .15 }, 3.8).to(a, { r: 10, duration: 2 / 12, ease: 'power3.out' }, 3.95)
      .to(a, { r: 0, duration: .4, ease: 'elastic.out(1,.4)' }, 4.15).to(a, { r: 14, duration: .8, ease: 'sine.inOut' }, 7.9).to(a, { r: 0, duration: .5 }, 9.0);
  }),
  caretas('c1', { ypb: [[7.9, 9.2]], yps: [[3.95, 4.9]], ypy: [] }),
  respira('c1tr', '50% 80%', 3, .012, .7),
  // a CÂMERA: enquadra a ação (o saguão inteiro deixava todo mundo minúsculo)
  assar('c1-cam', '0 0', D, (tl, a) => {
    const plano = (cx: number, cy: number, z: number) => ({ x: (800 - cx * z) / 16, y: (380 - cy * z) / 7.6, sx: z, sy: z });
    tl.set(a, plano(950, 320, 1.45), 0)
      .to(a, { ...plano(800, 300, 1.85), duration: .35, ease: 'expo.out' }, 1.5)          // PLIM: entra no elevador
      .to(a, { ...plano(930, 400, 1.5), duration: .7, ease: 'power2.inOut' }, 2.75)        // acompanha o pulo
      .to(a, { ...plano(920, 420, 1.7), duration: .12, ease: 'power3.out' }, 4.33)         // TUM: soco de zoom
      .to(a, { ...plano(860, 380, 1.75), duration: .5, ease: 'power2.inOut' }, 4.9)
      .to(a, { ...plano(820, 330, 1.95), duration: .2, ease: 'expo.out' }, 6.1)            // cai para dentro
      .to(a, { ...plano(900, 360, 1.45), duration: .4, ease: 'power2.out' }, 7.25)         // a cabine despenca
      .to(a, { ...plano(1170, 470, 2.1), duration: 1.4, ease: 'sine.inOut' }, 7.9)         // o suspiro do atendente
      .to(a, { ...plano(950, 320, 1.45), duration: .6, ease: 'power2.inOut' }, 9.35);
  }),
  assar('c1-sh', '50% 50%', D, (tl, a) => { tremor(tl, a, 4.33, .8, 4); tremor(tl, a, 7.3, 1.1, 6); }),
].join('');

const Elevador = memo(function Elevador() {
  return (
    <>
      <Defs />
      <style>{CSS1}</style>
      <div className="pa" /><div className="ch" /><div className="lb" />
      <div className="pal"><div className="sh c1-cam"><div className="sh c1-sh">
        <FundoSaguao semArco />
        <div className="e c1-ei"><Pt c="c1-eix" vb={EL}><Cabine /></Pt></div>
        <div className="e c1-ef"><div className="p c1-efx">
          <Pt c="c1-pe" vb={EL}><Porta x={70} /></Pt>
          <Pt c="c1-pd" vb={EL}><Porta x={200} /></Pt>
          <Pt vb={EL}><Moldura /></Pt>
          <Pt c="c1-ag" vb={EL}><Ponteiro /></Pt>
        </div></div>
        {/* o 64 vai por cima da moldura: ele sai do elevador para a frente dela (dentro, cabe no vão) */}
        <Robo id="c1m" p={P64} k={0} al="n" ar="n" ex={ROSTOS} />
        <div className="e c1-bp">
          <Pt vb="0 0 80 160"><Painel /></Pt>
          {BOTOES.map((i) => <Pt key={i} c={`c1-b${i}`} vb="0 0 80 160"><circle cx={i % 2 ? 54 : 26} cy={34 + Math.floor(i / 2) * 44} r="9" fill="#ffe14a" stroke="none" /></Pt>)}
        </div>
        <Atendente pref="c1" />
        <div className="e c1-plw"><Golpe c="c1-g1" cx={100} cy={100} t="PLIM!" r={66} cor="#fff3b0" rot={-6} vb="0 0 200 200" /></div>
        <div className="e c1-tuw"><Golpe c="c1-g2" cx={90} cy={90} t="TUM!" r={56} cor="#ffb347" rot={10} vb="0 0 180 180" /></div>
      </div></div></div>
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
  respira('c2gb', PV.c, 2.6, .022), respira('c2ab', PV.c, 2.2, .025, .9), respira('c2tr', '50% 80%', 3, .012, .4),
  tranco('c2-sh', [3.45, 4.88], 1.1), poeira('c2-pg', [3.45]), poeira('c2-pa', [4.86]),
  pos('c2-pgw', [620, 700, 240, 160], [40, 1190, 220, 146]), pos('c2-paw', [960, 520, 240, 160], [300, 1040, 220, 146]),
].join('');

const MalaFujona = memo(function MalaFujona() {
  return (
    <>
      <Defs />
      <style>{CSS2}</style>
      <div className="pa" /><div className="ch" /><div className="lb" />
      <div className="pal"><div className="sh c2-sh">
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
        <div className="e c2-pgw"><Poeira c="c2-pg" /></div>
        <div className="e c2-paw"><Poeira c="c2-pa" /></div>
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
  respira('c3ab', PV.c, 2.4, .022), respira('c3gb', PV.c, 2.8, .02, 1.1), respira('c3mb', PV.c, 2, .028, .5), respira('c3tr', '50% 80%', 3, .012, .2),
  tranco('c3-sh', [4.84, 7.06], 1), poeira('c3-pm', [7.6]), pos('c3-pmw', [560, 720, 300, 200], [180, 1340, 280, 186]),
].join('');

const TreguaDoCha = memo(function TreguaDoCha() {
  return (
    <>
      <Defs />
      <style>{CSS3}</style>
      <div className="pa" /><div className="ch" /><div className="lb" />
      <div className="pal"><div className="sh c3-sh">
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
        <div className="e c3-pmw"><Poeira c="c3-pm" /></div>
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
