/**
 * CarregandoAnimado — a tela de carregamento PADRÃO do jogo: o saguão do hotel em cartum 2D, com o TROCO-63
 * (chave inglesa) brigando com o robô-segurança, o TROCO-64 torcendo (e jogando uma casca de banana) e o
 * atendente do lobby tocando o sino a cada round.
 *
 * Sem WebGL e sem JS por quadro: SVG + CSS animando só `transform`/`opacity` em camadas HTML (<div> com
 * <svg>), que o navegador anima no compositor — fluida mesmo com a thread principal presa num gl.compile.
 * A rodada dura T s e começa no DING do sino; `--off` só serve para congelar a cena num instante (bancada).
 *
 *   <CarregandoAnimado rotulo="Carregando o Andar 13…" />   barra que vai e volta
 *   <CarregandoAnimado progresso={0.42} />                  barra 0..1
 *   <CarregandoAnimado visivel={!pronto} />                 some com fade e desmonta o DOM
 * Cobre a tela (fixed), respeita a safe-area, serve em retrato e paisagem e bloqueia toques.
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import { assar } from './cnMotor';

export interface CarregandoAnimadoProps {
  progresso?: number; // 0..1; sem ele a barra é indeterminada
  rotulo?: string; // o "…" final vira três pontinhos animados
  visivel?: boolean; // false: fade de saída e o DOM pesado é desmontado
  congelar?: number; // bancada: congela a cena neste instante (s)
}

// TEMPO E ANIMAÇÃO
const T = 10; // segundos por rodada
export const FONTE = "'Luckiest Guy','Arial Black',Impact,system-ui,sans-serif";
if (typeof document !== 'undefined') document.fonts?.load("20px 'Luckiest Guy'").catch(() => {}); // a fonte do index.html só é decodificada no 1º uso: pede já
export const K = '#1a1220', OURO = '#f2b53c', OURO_E = '#b9791a', PELE = '#f4cd73', JAQ = '#b3111a';

type E = 'i' | 'o' | 'a' | 'p' | 'h' | 'l'; // suave · arranca · acelera · pop · degrau · linear
const EASE: Record<E, string> = { i: 'cubic-bezier(.45,0,.55,1)', o: 'cubic-bezier(.1,.8,.25,1)', a: 'cubic-bezier(.7,0,.9,.4)', p: 'cubic-bezier(.3,1.7,.5,1)', h: 'steps(1,end)', l: 'linear' };
type Q<V> = [number, V, E?]; // [s, valor, suavização do trecho que começa aqui]

function quadros<V extends string | number>(q: Q<V>[], d: number, prop: string): string {
  const f = q.slice().sort((a, b) => a[0] - b[0]);
  if (f[0][0] > 0) f.unshift([0, f[0][1], 'l']);
  if (f[f.length - 1][0] < d) f.push([d, f[0][1]]); // o laço fecha no quadro 0
  return f.map(([s, v, e]) => `${+(s / d * 100).toFixed(3)}%{${prop}:${v}${e && e !== 'i' ? `;animation-timing-function:${EASE[e]}` : ''}}`).join('');
}
const regras: string[] = [];
/** Registra as animações de `.cna .cls`: m = transform, p = opacity, o = pivô, d = duração do laço. */
function anim(cls: string, a: { o?: string; m?: Q<string>[]; p?: Q<number>[]; d?: number }): void {
  const d = a.d ?? T, n: string[] = [];
  if (a.m) { regras.push(`@keyframes m-${cls}{${quadros(a.m, d, 'transform')}}`); n.push(`m-${cls} ${d}s ${EASE.i} infinite`); }
  if (a.p) { regras.push(`@keyframes o-${cls}{${quadros(a.p, d, 'opacity')}}`); n.push(`o-${cls} ${d}s ${EASE.i} infinite`); }
  regras.push(`.cna .${cls}{${a.o ? `transform-origin:${a.o};` : ''}${a.p ? `opacity:${a.p[0][1]};` : ''}will-change:${a.m ? 'transform' : 'opacity'};animation:${n.join(',')};animation-fill-mode:both;animation-delay:var(--off)}`);
}

const f2 = (n: number) => +n.toFixed(2);
/** translate rotate scale (sempre as 3, para interpolar), com deslocamento extra (xq, yq) só em retrato (--kq = 1). */
const tq = (...a: number[]) => {
  const [x = 0, y = 0, r = 0, sx = 1, sy = sx, xq = 0, yq = 0] = a;
  return (xq || yq ? `translate(calc(${f2(x)}% + ${f2(xq)}% * var(--kq)),calc(${f2(y)}% + ${f2(yq)}% * var(--kq)))` : `translate(${f2(x)}%,${f2(y)}%)`) + ` rotate(${f2(r)}deg) scale(${f2(sx)},${f2(sy)})`;
};

/** Quadros-chave em texto: "t[e] v v…; …" (t em s; e = i o a p h l colado; o que faltar vale 0). */
type Kf = [number, number[], E?];
const kf = (s: string): Kf[] => s.split(';').map((k): Kf => { const [a, ...v] = k.trim().split(/\s+/); return [parseFloat(a), v.map(Number), a.match(/[a-z]$/)?.[0] as E | undefined]; });
/** Corpo do ator: x y rot q xq yq (x, y em % da caixa; q>0 estica, q<0 amassa). */
const mv = (k: Kf[]): Q<string>[] => k.map(([t, [x, y, r, q = 0, xq, yq], e]) => [t, tq(x, y, r, 1 - q, 1 + q, xq, yq), e]);
/** Só translate (x, y em %): tremor da câmera e partículas. */
const tl = (k: Kf[]): Q<string>[] => k.map(([t, v, e]) => [t, `translate(${f2(v[0] ?? 0)}%,${f2(v[1] ?? 0)}%)`, e]);
/** Braço, perna, ponteiro: só o ângulo. */
const ag = (k: Kf[]): Q<string>[] => k.map(([t, v, e]) => [t, `rotate(${f2(v[0])}deg)`, e]);
/** A sombra acompanha o x, alarga deitado e encolhe quando o ator sobe. */
const sm = (k: Kf[], larga = 0): Q<string>[] => k.map(([t, [x = 0, y = 0, r = 0], e]) => {
  const s = Math.max(.35, 1 + larga * Math.abs(Math.sin(r * Math.PI / 180)) + Math.min(0, y) / 130);
  return [t, `translate(${f2(x)}%) scale(${f2(s)})`, e];
});
/** Cabeça: contra-gira o corpo um instante depois (follow-through). */
const cab = (k: Kf[]): Q<string>[] => k.map(([t, v]) => [Math.min(T, t + .06), `rotate(${f2(-.6 * (v[2] ?? 0))}deg)`, 'i']);
/** n+1 quadros entre t0 e t1. */
const osc = <V,>(t0: number, t1: number, n: number, f: (i: number) => V, e?: E): Q<V>[] => Array.from({ length: n + 1 }, (_, i) => [t0 + (t1 - t0) * i / n, f(i), e] as Q<V>);
/** Janelas de visibilidade [de, até] (s), com fade curto. */
const jan = (w: [number, number][], f = .05): Q<number>[] => {
  const m = new Map<number, number>([[0, 0]]);
  for (const [a, b] of w) { m.set(Math.max(0, a - f), 0); m.set(a, 1); m.set(b, 1); if (b + f <= T) m.set(+(b + f).toFixed(3), 0); }
  return [...m].sort((x, y) => x[0] - y[0]).map(([t, v]) => [t, v, 'l'] as Q<number>);
};
/** Pulsos de opacidade: sobe a v em cada t, desce em d s (segurando em 0 antes). */
const ev = (ts: number[], v: number, d: number): Q<number>[] => [[0, 0, 'l'], ...ts.flatMap((t): Q<number>[] => [[Math.max(0, t - .001), 0, 'l'], [t, v, 'l'], [t + d, 0, 'l']])];

// DESENHO: traço grosso, cor chapada, brilho em cima
export const VR = '0 0 200 260', VA = '0 0 360 330'; // caixas dos robôs e do atendente
export const L = { stroke: K, strokeWidth: 6, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const FORMAS: Record<string, [string, string[]]> = {
  r: ['rect', ['x', 'y', 'width', 'height', 'rx']], c: ['circle', ['cx', 'cy', 'r']],
  e: ['ellipse', ['cx', 'cy', 'rx', 'ry']], p: ['path', ['d']],
};
const EXTRA: Record<string, string> = { w: 'strokeWidth', o: 'opacity', s: 'stroke', t: 'transform', '.': 'className' };
/** Formas em texto, separadas por "|": "r x y w h rx cor", "c cx cy r cor", "e cx cy rx ry cor", "p d cor" (d sem
 *  espaços). Cor = #hex, none ou @gradiente. Depois, extras: wLARGURA oOPACIDADE sCORDOTRAÇO tTRANSFORM .CLASSE
 *  (_ = espaço). `*` no tipo põe o brilho por cima; `~` tira o traço. */
const sv = (src: string) => src.split('|').flatMap((sh, i) => {
  const [k, ...t] = sh.trim().split(/\s+/), [tag, ns] = FORMAS[k[0]], f = t[ns.length], pr: Record<string, string> = { fill: f[0] === '@' ? `url(#cna-${f.slice(1)})` : f };
  ns.forEach((n, j) => { pr[n] = t[j]; });
  if (k.includes('~')) pr.stroke = 'none';
  t.slice(ns.length + 1).forEach((x) => { pr[EXTRA[x[0]]] = x.slice(1).replace(/_/g, ' '); });
  const a = React.createElement(tag, { key: i, ...pr });
  return k.includes('*') ? [a, React.createElement(tag, { key: `${i}b`, ...pr, fill: 'url(#cna-sh)', stroke: 'none' })] : [a];
});
const estrela = (cx: number, cy: number, r: number, n = 5, f = .46) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) { const a = Math.PI / n * i - Math.PI / 2, rr = i % 2 ? r * f : r; d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; }
  return d + 'Z';
};

/** Uma camada animável: <div> (camada do compositor) + <svg> opcional (sem `vb`, os filhos são camadas). */
export const Pt: React.FC<{ c?: string; vb?: string; par?: string; children?: React.ReactNode }> = ({ c = '', vb, par, children }) => (
  <div className={`p ${c}`}>{vb ? <svg viewBox={vb} preserveAspectRatio={par} aria-hidden="true">{children}</svg> : children}</div>
);

/** Gradientes (um <svg> invisível; url(#cna-…) vale no documento). Paradas: "offset cor [opacidade]". */
const GRADS: [string, 'v' | 'h' | 'r', string][] = [
  ['sh', 'v', '0 #fff .34,.38 #fff 0,.6 #000 0,1 #000 .32'], ['ou', 'v', '0 #ffe59a,.55 #f2b53c,1 #b9791a'],
  ['ma', 'h', '0 #4a2714,.5 #6f3d20,1 #3f2010'], ['cu', 'h', '0 #6a0d1b,.3 #b3182c,.55 #7d1022,.8 #b3182c,1 #5a0a17'],
  ['lz', 'r', '0 #ffd98a .95,.45 #ffb347 .45,1 #ffb347 0'], ['ci', 'r', '0 #7df9ff .95,.45 #16e0e8 .45,1 #16e0e8 0'], ['vm', 'r', '0 #ff8a7a .95,.45 #ff3b30 .45,1 #ff3b30 0'],
];
export const Defs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>{GRADS.map(([id, d, st]) => {
    const s = st.split(',').map((x, i) => { const [o, c, a] = x.split(' '); return <stop key={i} offset={o} stopColor={c} stopOpacity={a} />; });
    return d === 'r' ? <radialGradient key={id} id={`cna-${id}`}>{s}</radialGradient> : <linearGradient key={id} id={`cna-${id}`} x2={d === 'h' ? 1 : 0} y2={d === 'v' ? 1 : 0}>{s}</linearGradient>;
  })}</defs></svg>
);

// OS ROBÔS: caixa de cromo, tela escura, antena, três LEDs
// corpo, escuro, metal, junta, painel, tela, acento, olhos, bulbo da antena, LEDs
export interface Pal { c: string; e: string; m: string; j: string; pn: string; tl: string; ac: string; ol: string; bu: string; lu: string[] }
const pal = (s: string): Pal => { const [c, e, m, j, pn, tl, ac, ol, bu, ...lu] = s.split(' '); return { c, e, m, j, pn, tl, ac, ol, bu, lu }; };
export const P64 = pal('#b4bdc7 #6f7a87 #8a95a1 #3a4047 #4a525c #0e1318 #e8503a #16e0e8 #ff5040 #ffd24d #4dff7a #4da8ff'); // cromo (Floor5Robot64)
export const P63 = pal('#8cc4b4 #3f6f68 #8e97a6 #3a4047 #3f6f68 #0c1716 #8e97a6 #75e6e0 #3fe0c8 #3fe0c8 #3fe0c8 #3fe0c8'); // "azedo" (Floor12Avioes)
export const PSG = pal('#66748c #2f3848 #46526a #20252d #2a303b #0a0c10 #ffc21a #ff4a3c #ff3b30 #ff3b30 #ffc21a #ff3b30'); // aço + faixa de perigo

export const Perna: React.FC<{ p: Pal; x: number; gr?: boolean }> = ({ p, x, gr }) => {
  const w = gr ? 10 : 8, f = gr ? 27 : 25;
  return <g {...L}>{sv(`r ${x - w} 186 ${w * 2} 36 5 ${p.j}|r* ${x - f} 214 ${f * 2} 30 12 ${p.m}|r~ ${x - f + 8} 219 22 6 3 #fff o.4`)}</g>;
};
export const Tronco: React.FC<{ p: Pal; k: 0 | 1 | 2 }> = ({ p, k }) => (
  <g {...L}>
    {sv(`r* 46 98 108 92 18 ${p.c}`)}
    {k === 2
      ? sv(`p M100,108L128,117L128,141Q128,160,100,170Q72,160,72,141L72,117Z ${OURO}|p~ ${estrela(100, 140, 15)} ${PSG.j}|r 42 174 116 18 6 ${OURO}|p~ ${[0, 1, 2, 3, 4, 5].map((i) => `M${48 + i * 19},175h9l-8,16h-9z`).join('')} ${K}|r 42 174 116 18 6 none`)
      : sv(`r 64 112 72 52 9 ${p.pn}|${p.lu.map((c, i) => `r ${72 + i * 22} 130 14 14 3 ${c} .led_le${i}`).join('|')}|r 42 176 116 16 6 ${p.ac}`)}
  </g>
);

/** As caras: a tela escura + os olhos. % = cor dos olhos, & = cor da tela. */
export type Exp = 'n' | 'f' | 'x' | 'e' | 's' | 'b' | 'p';
const EXPR: Record<string, string> = {
  f: 'p M75,70Q86,50,97,70 none s% w6.5|p M103,70Q114,50,125,70 none s% w6.5',
  x: 'p M76,54L96,74M96,54L76,74 none s% w6|p M104,54L124,74M124,54L104,74 none s% w6',
  e: 'p M86,64a3,3,0,0,1,6,0a6,6,0,0,1,-12,0a9,9,0,0,1,18,0 none s% w4|p M114,64a3,3,0,0,1,6,0a6,6,0,0,1,-12,0a9,9,0,0,1,18,0 none s% w4',
  b: 'p M76,54L94,64L76,74 none s% w6.5|p M124,54L106,64L124,74 none s% w6.5',
  p: 'p M76,66H96 none s% w5|p M104,66H124 none s% w5',
  s: 'r~ 73 47 24 34 8 %|r~ 103 47 24 34 8 %|r~ 82 59 8 10 3 &|r~ 110 59 8 10 3 &',
};
export const Cara: React.FC<{ p: Pal; k: 0 | 1 | 2; t: Exp }> = ({ p, k, t }) => {
  const y = k === 1, g = k === 2 ? '@vm' : '@ci', o = p.ol;
  return (
    <g>
      {sv(`r 64 40 72 48 10 ${p.tl} w4.5`)}
      {t === 'n' && <g stroke="none">{k === 2
        ? sv(`c 83 64 22 ${g}|c 117 64 22 ${g}|p M69,52L95,62L95,74L69,68Z ${o}|p M131,52L105,62L105,74L131,68Z ${o}`)
        : sv(`c 86 ${y ? 67 : 64} 21 ${g}|c 114 ${y ? 67 : 64} 21 ${g}|r 78 ${y ? 59 : 52} 16 ${y ? 17 : 23} 5 ${o}|r 106 ${y ? 59 : 52} 16 ${y ? 17 : 23} 5 ${o}|r 80 ${y ? 61 : 54} 5 6 2 #fff o.75|r 108 ${y ? 61 : 54} 5 6 2 #fff o.75`
          + (y ? `|p M70,51L97,60 none s${K} w5.5|p M130,51L103,60 none s${K} w5.5|p M86,81L114,79 none s${o} w3.5 o.8` : ''))}</g>}
      {EXPR[t] && sv(EXPR[t].replace(/%/g, o).replace(/&/g, p.tl))}
    </g>
  );
};
export const Cabeca: React.FC<{ p: Pal; k: 0 | 1 | 2; x: string; ex: Exp[] }> = ({ p, k, x, ex }) => {
  const s = k === 2;
  return (
    <g {...L}>
      {k === 0 && sv(`p M100,30V13 none|c 100 8 8 ${p.bu} .bulbo`)}
      {k === 1 && sv(`p M104,30L115,14L109,3 none|c 109 -1 7.5 ${p.bu} .bulbo`)}
      {s && sv(`c~ 100 14 34 @vm .sirg|p M72,32Q72,2,100,2Q128,2,128,32Z ${p.bu}|p M82,22Q86,11,96,9 none s#fff w4 o.7`)}
      {sv(`r* ${s ? 48 : 52} 26 ${s ? 104 : 96} 72 ${s ? 12 : 16} ${p.c}|r 60 20 80 12 5 ${p.ac}|r 38 50 15 30 5 ${p.ac}|r 147 50 15 30 5 ${p.ac}`)}
      {s && sv('p M84,90v6M94,90v6M104,90v6M114,90v6 none w3.5')}
      {k === 1 && sv(`p M136,30L150,37L146,49L137,42Z ${p.e}|r 52 22 24 11 2 #ecd9a8 trotate(-18_64_27)|p M60,28h8 none w2.5 trotate(-18_64_27)`)}
      <Cara p={p} k={k} t="n" />
      {ex.map((t) => <g key={t} className={`${x}f${t}`} opacity="0"><Cara p={p} k={k} t={t} /></g>)}
    </g>
  );
};

export type Arma = 'c' | 'b' | 'f' | 'n';
export const Banana = () => <g {...L} strokeWidth="5">{sv('p M-16,-10Q-18,14,6,20Q22,22,28,10Q12,14,2,4Q-2,-8,-6,-14Z #ffe14a|p M-6,-14l-2,-8l8,0l0,6z #7a4a1a')}</g>;
const ARMAS: Record<string, (p: Pal) => React.ReactNode> = {
  c: () => sv(`r* -8 44 16 72 7 #f2b632|p M-9,145L-9,131L9,131L9,145A23,23,0,1,0,-9,145Z #f2b632|c~ 0 112 4 ${K}`), // chave inglesa
  b: (p) => sv(`c~ 0 138 30 @ci .glowb|r -7 44 14 86 6 #2c323d|r~ -7 56 14 8 0 ${p.ac}|r~ -7 76 14 8 0 ${p.ac}|r -10 120 20 30 9 #9af6ff|p M-13,126l8,6l-6,4l9,8 none s#fff w3 .zap`), // cassetete
  f: () => <>{sv(`r -3.5 40 7 120 3 #e0c890|p M-3,112L-72,124L-54,140L-72,156L-3,168Z #3fe0c8`)}<text x="-38" y="150" textAnchor="middle" fontFamily={FONTE} fontSize="25" fill={K} stroke="none" transform="rotate(180 -38 142)">63</text></>, // bandeirinha
};
export const Braco: React.FC<{ p: Pal; x: number; arma?: Arma; gr?: boolean; ban?: boolean }> = ({ p, x, arma = 'n', gr, ban }) => (
  <g transform={`translate(${x} 124)${gr ? ' scale(1.14)' : ''}`} {...L}>
    {ARMAS[arma]?.(p)}
    {sv(`r* -10 -4 20 56 10 ${p.m}|r -14 46 11 25 4 ${p.j}|r 3 46 11 25 4 ${p.j}|c 0 0 13 ${p.ac}`)}
    {ban && <g className="bh"><g transform="translate(0 78) rotate(-20) scale(.9)"><Banana /></g></g>}
  </g>
);

// O ATENDENTE DO LOBBY (como no sprite da loja)
export const AtdCorpo = () => (
  <g {...L}>
    {sv(`p* M84,242L88,186Q90,152,122,148H178Q210,152,212,186L216,242Z ${JAQ}|p M128,148L150,184L172,148Z #f6f1e4 w4|p M144,152H156L160,162L151,214L140,162Z ${K} w3|p M106,158L138,242M194,158L162,242 none s${OURO} w4`)}
    {sv([0, 1, 2].map((i) => `c ${132 + i * 3} ${192 + i * 14} 4.2 ${OURO} w2.5|c ${168 - i * 3} ${192 + i * 14} 4.2 ${OURO} w2.5`).join('|'))}
    {sv(`r 172 176 24 9 2.5 ${OURO} w2.5|p M90,166Q68,180,74,230L104,234Q106,198,114,170Z ${JAQ}|r 72 214 32 11 4 ${OURO} w3|e 90 238 16 11 ${PELE}`)}
  </g>
);
export const AtdCabeca = () => (
  <g {...L}>
    {sv(`p M104,100Q96,56,130,48H170Q204,56,196,100Z #15101c|r* 108 60 84 86 22 ${PELE}|p M106,96Q100,62,128,62L137,79L150,62L163,79L172,62Q200,62,194,96L186,82L176,94L164,80L150,94L136,80L126,94Z #15101c w4`)}
    {sv(`e~ 132 106 5.6 8.6 ${K}|e~ 168 106 5.6 8.6 ${K}|c~ 119 124 7 #f0906a o.42|c~ 181 124 7 #f0906a o.42|p M134,126Q150,140,166,126 none w4.6`)}
    <g className="ypb" opacity="0">{sv(`r~ 122 96 56 22 6 ${PELE}|p M124,106Q132,112,140,106M160,106Q168,112,176,106 none w4.6`)}</g>
    <g className="yps" opacity="0">{sv(`r~ 120 84 60 58 8 ${PELE}|e~ 132 104 6.8 11 ${K}|e~ 168 104 6.8 11 ${K}|p M122,88Q132,80,142,88M158,88Q168,80,178,88 none w4|e~ 150 130 8 11 ${K}`)}</g>
    <g className="ypy" opacity="0">{sv(`r~ 120 92 60 50 8 ${PELE}|p M122,106Q132,99,142,106M158,106Q168,99,178,106 none w4.6|e~ 150 128 12 14 ${K}|e~ 150 136 7 5 #e0566a`)}</g>
    {sv(`p* M100,66V30Q100,14,118,14H182Q200,14,200,30V66Q150,76,100,66Z ${JAQ}|p M100,48Q150,58,200,48V58Q150,68,100,58Z ${OURO} w3.5|c 150 38 12 ${OURO} w4|c~ 150 38 5 ${OURO_E}`)}
  </g>
);
export const AtdBraco = () => <g transform="translate(212 164)" {...L}>{sv(`r -14 -8 28 58 14 ${JAQ}|r -14 38 28 10 4 ${OURO} w3|e 0 58 14 12 ${PELE}`)}</g>;
export const AtdSino = () => <g {...L}>{sv(`p M250,224Q250,180,288,180Q326,180,326,224Z @ou|r 242 220 92 12 6 ${OURO_E}|r 283 170 10 14 3 ${OURO_E} w3|c 288 168 7 ${OURO} w3.5|p M262,214Q264,194,277,188 none s#fff w4 o.6`)}</g>;
export const AtdBalcao = () => (
  <g {...L}>{sv(`r 6 226 348 22 7 #2a1710|r~ 6 226 348 7 3.5 @ou o.85|r 16 246 328 84 0 @ma|r 104 258 152 64 8 #0d0609 s${OURO} w3.5|p M156,304Q156,278,180,278Q204,278,204,304Z @ou w2.5|r 150 303 60 7 3.5 ${OURO_E} w2.5|c 180 273 4.5 ${OURO} w2`)}</g>
);

// O SAGUÃO (como o fundo da loja)
export const Arco = () => <g {...L}>{sv(`p M12,380V176A198,164,0,0,1,408,176V380Z #4a2815|p M40,380V178A170,138,0,0,1,380,178V380Z #12040a|e~ 210 300 130 150 @lz o.2|p M40,380V178A170,138,0,0,1,380,178V380 none s${OURO} w4.5|c 210 26 18 ${OURO} w4.5|c~ 210 26 8 ${OURO_E}`)}</g>;
export const Cortina: React.FC<{ e: boolean }> = ({ e }) => (
  <g transform={e ? undefined : 'translate(420 0) scale(-1 1)'} {...L} strokeWidth="4">
    {sv(`p M40,178A170,138,0,0,1,128,58Q126,104,100,152Q76,214,98,290Q114,340,100,380H40Z @cu|p M68,128Q58,250,74,378M92,88Q86,210,96,378 none s#3b0712 o.5 w3.5|p M58,290Q92,274,114,292Q92,314,58,304Z ${OURO} w3`)}
  </g>
);
export const Chaveiro = () => <g {...L}>{sv(`r 10 10 230 282 10 #4a2815|r 26 26 198 196 6 #1c0a08|p~ M26,26H224L26,150Z #fff o.06|r~ 34 70 182 5 2 ${OURO_E}|r~ 34 150 182 5 2 ${OURO_E}|r 10 226 230 66 6 @ma|r 26 236 92 22 3 #2b150c w3.5|r 132 236 92 22 3 #2b150c w3.5|c~ 72 247 3.5 ${OURO}|c~ 178 247 3.5 ${OURO}`)}</g>;
const Chaves: React.FC<{ y: number }> = ({ y }) => (
  <g stroke="none">{[0, 1, 2, 3, 4].map((i) => <g key={i} transform={`translate(${56 + i * 34} ${y + 6})`}>{sv(`c 0 13 8 none s${OURO} w4|r -2.5 20 5 36 0 ${OURO}|r 2 42 9 5 0 ${OURO}|r 2 50 6 5 0 ${OURO}`)}</g>)}</g>
);
const LIVROS: [string, number, number][] = [['#a3202b', 34, 64], ['#2b4a8a', 50, 54], ['#2f7a4d', 64, 70], ['#d79a2c', 80, 58], ['#7a2c6a', 96, 66], ['#a3202b', 112, 52], ['#3c3c48', 126, 62]];
export const Estante = () => (
  <g {...L}>
    {sv(`r 6 36 268 354 8 #4a2815|r 20 50 240 246 0 #1d0b09|r 6 168 268 10 0 @ma|r 6 284 268 10 0 @ma|r 20 300 240 86 0 #2b150c w4|r 28 310 108 66 3 #3d2010 w3.5|r 144 310 108 66 3 #3d2010 w3.5|r 98 150 84 18 5 @ma|c 140 96 52 ${OURO} w5|c 140 96 43 #f3e6c2 w3.5|c 140 40 9 ${OURO} w4`)}
    <Ponteiro len={24} w={6} />
    {Array.from({ length: 12 }, (_, i) => <path key={i} d="M140 57v7" stroke={K} strokeWidth={i % 3 ? 2.5 : 4} transform={`rotate(${i * 30} 140 96)`} />)}
    {sv(LIVROS.map(([c, x, h]) => `r ${x} ${168 - h} 14 ${h} 2 ${c} w3.5`).join('|'))}
  </g>
);
const Ponteiro: React.FC<{ len: number; w: number }> = ({ len, w }) => <path d={`M140 96V${96 - len}`} stroke={K} strokeWidth={w} strokeLinecap="round" />;
const QuadroMapa = () => <g {...L}>{sv(`r 6 6 108 158 5 @ou|r 20 20 80 130 0 #e9dcc0 w3.5|p M32,40H88V70H32ZM32,82H60V136H32ZM70,82H88V136H70Z none s#6b5a3a w2.5`)}</g>;
const QuadroMontes = () => <g {...L}>{sv(`r 6 6 138 158 5 @ou|r 20 20 110 130 0 #3a2a18 w3.5|r~ 20 20 110 60 0 #b87a2a o.55|p~ M20,150L52,92L70,118L96,76L130,150Z #241a12`)}</g>;
export const Lampiao = () => <g {...L} strokeWidth="4">{sv(`p M35,122V86Q35,70,48,66 none s${OURO_E} w5|p M18,70H52L46,30H24Z #ffd98a|r 15 66 40 8 3 ${OURO}|r 22 24 26 8 3 ${OURO}`)}</g>;
export const Planta = () => (
  <g {...L}>{sv([[-46, '#1f6b3a'], [-24, '#2e8b4d'], [0, '#1f6b3a'], [24, '#2e8b4d'], [46, '#1f6b3a']].map(([r, c]) => `p M75,150Q44,100,75,18Q106,100,75,150Z ${c} w4.5 trotate(${r}_75_150)`).join('|'))}
    {sv('p M46,150H104L96,204H54Z #a8391f w5|r 42 144 66 14 5 #c4492a w5')}</g>
);
export const Tapete = () => <g {...L} strokeWidth="5">{sv(`p M170,6H1070L1234,244H6Z #7a1322|p M204,30H1036L1170,222H70Z none s${OURO} w6|p~ M232,46H1008L1128,210H112Z #8c1a2a|p M620,70L760,128L620,190L480,128Z none s${OURO_E} w4 o.8`)}</g>;

// EFEITOS: balões de golpe e estrelas de tontura
/** [classe, x, y, texto, raio, giro, cor, instante, duração] — x, y na caixa do segurança (200×260). */
const BAL: [string, number, number, string, number, number, string, number, number][] = [
  ['w1', 56, 56, 'CLANG!', 64, -8, '#ffe14a', 2.17, .55], ['w2', 66, 200, 'BAM!', 56, 10, '#ffb347', 4.35, .5], ['w3', 62, 70, 'POW!', 54, -14, '#ffe14a', 5.65, .32],
  ['w4', 88, 44, 'BONK!', 54, 10, '#9af6ff', 5.95, .32], ['w5', 106, 84, 'ZAP!', 52, -6, '#ffe14a', 6.25, .32], ['w6', 116, 58, 'BAM!', 56, 14, '#ffb347', 6.5, .36],
  ['w7', 70, 96, 'WHAM!!', 86, -10, '#fff3b0', 7.3, .7], ['w8', 100, 196, 'THUD!', 54, -6, '#ffb347', 9.25, .5],
];
export const Estrela: React.FC<{ c: string }> = ({ c }) => <Pt c={c} vb={VR}><path d={estrela(100, 22, 12, 5, .48)} fill="#ffe14a" stroke={K} strokeWidth="3.5" strokeLinejoin="round" /></Pt>;
export const Golpe: React.FC<{ c: string; cx: number; cy: number; t: string; r: number; cor: string; rot: number; vb?: string }> = ({ c, cx, cy, t, r, cor, rot, vb = VR }) => (
  <Pt c={c} vb={vb}>
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`} {...L} strokeWidth="5">
      {sv(`p ${estrela(0, 0, r, 11, .64)} ${cor}`)}
      <text y={r * .17} textAnchor="middle" fontFamily={FONTE} fontSize={r * .48} fill="#e63a2e" stroke={K} strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">{t}</text>
    </g>
  </Pt>
);

// A CENA (o React monta uma vez; quem anima é o CSS)
export const Robo: React.FC<{ id: string; p: Pal; k: 0 | 1 | 2; al: Arma; ar: Arma; ex: Exp[]; ban?: boolean; fx?: React.ReactNode }> = ({ id, p, k, al, ar, ex, ban, fx }) => (
  <div className={`e ${id}`}>
    <Pt c={`${id}s`} vb={VR}><ellipse cx="100" cy="248" rx="64" ry="11" fill="#000" fillOpacity=".42" /></Pt>
    <Pt c={`${id}c`}><Pt c={`${id}b`}>
      <Pt c={`${id}l`} vb={VR}><Perna p={p} x={78} gr={k === 2} /></Pt>
      <Pt c={`${id}r`} vb={VR}><Perna p={p} x={122} gr={k === 2} /></Pt>
      <Pt vb={VR}><Tronco p={p} k={k} /></Pt>
      <Pt c={`${id}e`} vb={VR}><Braco p={p} x={40} arma={al} gr={k === 2} /></Pt>
      <Pt c={`${id}d`} vb={VR}><Braco p={p} x={160} arma={ar} gr={k === 2} ban={ban} /></Pt>
      <Pt c={`${id}h`} vb={VR}><Cabeca p={p} k={k} x={id} ex={ex} /></Pt>
      {fx}
    </Pt></Pt>
  </div>
);
/** Peça do cenário: uma caixa posicionada pela tabela de layout + sua arte (e camadas animadas em `ks`). */
const D: React.FC<{ id: string; vb: string; c?: string; par?: string; ks?: [string, React.ReactNode][]; children?: React.ReactNode }> = ({ id, vb, c, par, ks = [], children }) => (
  <div className={`e ${id}`}><Pt c={c} vb={vb} par={par}>{children}</Pt>{ks.map(([k, n]) => <Pt key={k} c={k} vb={vb}>{n}</Pt>)}</div>
);

/** Quando cada rosto extra aparece [de, até] (s); fora disso vale a cara padrão. */
const FACES: Record<string, Partial<Record<Exp, [number, number][]>>> = {
  a: { b: [[1.55, 1.95], [2.1, 2.45], [5.35, 6.75], [6.95, 7.45]], f: [[7.5, 9.3]], p: [[.85, .93], [2.85, 2.93], [3.8, 4.9], [9.72, 9.8]], s: [[1.3, 1.5]] },
  g: { x: [[2.17, 2.45], [7.3, 7.95]], e: [[2.45, 3.45], [4.35, 5.35], [5.65, 7.25], [9.25, 9.75]], b: [[1.4, 1.6], [3.55, 3.9]], s: [[3.9, 4.3]], p: [[1, 1.08], [8.9, 8.98]] },
  m: { f: [[2.1, 3], [3.45, 3.85], [4.6, 5.5], [5.65, 6.7], [7.6, 9.3]], b: [[3.1, 3.4]], s: [[3.9, 4.55], [7.25, 7.55]], p: [[.95, 1.03], [5.3, 5.38]] },
};
const EXP = Object.fromEntries(Object.entries(FACES).map(([k, v]) => [k, Object.keys(v) as Exp[]])) as Record<string, Exp[]>;

/** O saguão (pilares, arco com cortinas, chaveiro, estante com relógio, quadros, lampiões, tapete, plantas):
 *  a mesma casa para todas as cenas. Já posicionado e animado pelo CSS da cena original. */
export const FundoSaguao: React.FC<{ semArco?: boolean }> = ({ semArco }) => (
  <>
    {[1, 2, 3, 4].map((i) => <div key={i} className={`e pil pl${i}`} />)}
    {!semArco && <D id="arco" vb="0 0 420 380" ks={[['cE', <Cortina e />], ['cD', <Cortina e={false} />]]}><Arco /></D>}
    <D id="chav" vb="0 0 250 300" ks={[['k1', <Chaves y={70} />], ['k2', <Chaves y={150} />]]}><Chaveiro /></D>
    <D id="est" vb="0 0 280 400" ks={[['rm', <Ponteiro len={36} w={4.5} />]]}><Estante /></D>
    <D id="qm" vb="0 0 120 170"><QuadroMapa /></D>
    <D id="qc" vb="0 0 150 170"><QuadroMontes /></D>
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className={`e la${i}`}>
        <Pt c={`lg${i % 2}`} vb="0 0 70 130"><circle cx="35" cy="56" r="96" fill="url(#cna-lz)" opacity=".5" /></Pt>
        <Pt vb="0 0 70 130"><Lampiao /></Pt>
      </div>
    ))}
    <D id="tap" vb="0 0 1240 250" par="none"><Tapete /></D>
    <D id="pe" vb="0 0 150 210" c="pa1"><Planta /></D>
    <D id="pd" vb="0 0 150 210" c="pa2"><Planta /></D>
    {[1, 2, 3].map((i) => <div key={i} className={`mo mo${i}`} />)}
  </>
);

const Cena = memo(function Cena() {
  return (
    <>
      <Defs />
      <div className="pa" /><div className="ch" /><div className="lb" />
      <div className="pal"><div className="sh c0-cam"><div className="sh">
        <FundoSaguao />

        {/* TROCO-64: torce da lateral, com a bandeira do irmão; arremessa a casca de banana */}
        <Robo id="m" p={P64} k={0} al="f" ar="n" ban ex={EXP.m} />
        <div className="e m2"><Pt c="mx" vb={VR}><g transform="translate(237 136)"><Banana /></g></Pt></div>
        {/* o atendente do lobby */}
        <div className="e t">
          <Pt c="yk" vb={VA}><AtdCorpo /></Pt>
          <Pt c="yh" vb={VA}><AtdCabeca /></Pt>
          <Pt vb={VA}><AtdBalcao /></Pt>
          <Pt c="ys" vb={VA}><AtdSino /></Pt>
          <Pt c="ya" vb={VA}><AtdBraco /></Pt>
          <Pt c="yn1" vb={VA}><circle cx="288" cy="178" r="34" fill="none" stroke={OURO} strokeWidth="7" /></Pt>
          <Pt c="yn2" vb={VA}><circle cx="288" cy="178" r="34" fill="none" stroke="#fff3b0" strokeWidth="5" /></Pt>
          <Golpe c="wd" cx={300} cy={96} t="DING!" r={44} cor="#ffe14a" rot={6} vb={VA} />
        </div>
        {/* o robô-segurança do saguão (inimigo do 63) e o TROCO-63, de chave inglesa */}
        <Robo id="g" p={PSG} k={2} al="b" ar="n" ex={EXP.g} fx={<Pt c="zw">{['z0', 'z1', 'z2'].map((c) => <Estrela key={c} c={c} />)}</Pt>} />
        <Robo id="a" p={P63} k={1} al="n" ar="c" ex={EXP.a} />
        {/* efeitos por cima dos dois lutadores */}
        <div className="e g2">
          {BAL.map(([c, cx, cy, t, r, rot, cor]) => <Golpe key={c} c={c} cx={cx} cy={cy} t={t} r={r} cor={cor} rot={rot} />)}
          <Pt c="sw1" vb={VR}><path d="M30 36Q-30 100 10 190" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".9" /></Pt>
        </div>
        <div className="e a2"><Pt c="sw2" vb={VR}><path d="M178 14Q248 70 214 168" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity=".9" /></Pt></div>
      </div></div><div className="fl" /></div>
      <div className="vg" />
    </>
  );
});

// LAYOUT: [esquerda, base, largura, altura?] em unidades do palco (paisagem 1600×760, retrato 780×1600)
type Pos = [number, number, number, number?];
/** id, razão altura/largura, paisagem, retrato, caixa irmã (efeitos alinhados ao ator). */
const LAY: [string, number, Pos?, Pos?, string?][] = [
  ['pl1', 0, [258, 430, 50, 392]], ['pl2', 0, [536, 430, 54, 392]], ['pl3', 0, [1010, 430, 54, 392]], ['pl4', 0, [1292, 430, 50, 392]],
  ['arco', .9048, [600, 430, 400], [170, 700, 440]], ['chav', 1.2, [322, 430, 200], [14, 700, 176]], ['est', 1.4286, [1068, 430, 214], [566, 700, 206]],
  ['qm', 1.4167, [96, 330, 112], [40, 280, 110]], ['qc', 1.1333, [1398, 330, 124], [640, 280, 120]],
  ['la1', 1.857, [543, 322, 40], [122, 440, 44]], ['la2', 1.857, [1017, 322, 40], [614, 440, 44]], ['la3', 1.857, [263, 322, 40]], ['la4', 1.857, [1297, 322, 40]],
  ['tap', 0, [190, 694, 1220, 200], [24, 1452, 732, 420]], ['pe', 1.4, [22, 520, 120]], ['pd', 1.4, [1458, 520, 120]],
  ['m', 1.3, [118, 656, 236], [56, 946, 210], 'm2'], ['t', .9167, [1170, 664, 320], [440, 962, 290]],
  ['g', 1.3, [836, 672, 300], [420, 1400, 300], 'g2'], ['a', 1.3, [476, 672, 300], [60, 1400, 300], 'a2'],
];
const dim = ([l, b, w, h]: Pos, a = 1) => { const H = h ?? w * a; return `--l:${l};--t:${+(b - H).toFixed(1)};--w:${w};--h:${+H.toFixed(1)}`; };

// A COREOGRAFIA: pivôs em % da caixa do robô (200×260) e uma tabela de quadros-chave por peça
const PV = { c: '50% 94%', h: '50% 38%', e: '20% 48%', d: '80% 48%', l: '39% 73%', r: '61% 73%' };
/** Passos: n+2 quadros alternando ±a° entre t0 e t1. */
const pas = (t0: number, t1: number, n: number, a: number): Kf[] =>
  Array.from({ length: n + 2 }, (_, i) => [t0 + (t1 - t0) * i / (n + 1), [i === 0 || i === n + 1 ? 0 : i % 2 ? a : -a], 'i'] as Kf);
const pernas = (id: string, sp: number[][]) => ([['l', 1], ['r', -1]] as const).forEach(([s, g]) =>
  anim(id + s, { o: PV[s], m: ag([[0, [0]], ...sp.flatMap(([t0, t1, n, a]) => pas(t0, t1, n, a * g))]) }));
/** Ondinha de aplauso: alterna -132/-168 a cada .25 s. */
const onda = (t0: number, t1: number) => Array.from({ length: Math.round((t1 - t0) / .25) + 1 }, (_, i) => `${t0 + i * .25} ${i % 2 ? -168 : -132}`).join(';');
/** Tremor de câmera (em % do palco) a partir de t. */
const trem = (t: number, a: number) => `${t - .01}l;${t}l ${a * .7} ${-a * .6};${t + .05}l ${-a * .5} ${a * .4};${t + .1}l ${a * .3} ${-a * .2};${t + .17}l`;
/** Balão de golpe: estoura (pop) em cada instante de `ts` e some. */
function pop(cls: string, o: string, ts: number[], hold = .5) {
  const m: Q<string>[] = [], p: Q<number>[] = [[0, 0, 'l']];
  for (const t of ts) {
    const t0 = Math.max(0, t - .001);
    m.push([t0, `scale(.15)`, 'p'], [t + .14, `scale(1.12)`, 'i'], [t + .26, `scale(1)`], [t + hold, `scale(1)`, 'i'], [t + hold + .14, `scale(.5)`]);
    p.push([t0, 0, 'l'], [t, 1, 'l'], [t + hold, 1, 'l'], [t + hold + .14, 0, 'l']);
  }
  anim(cls, { o, m, p });
}

function coreografia() {
  // TROCO-63 (a): avança, agacha, salta e acerta; a cabeça contra-gira um instante depois
  const A = kf('0l;.1o 0 0 0 -.075;.3a 0 -5 0 .035;.5o 0 0 0 -.045;.7;1.2 3 0 4 -.02;1.4 3;1.55o 6 7 13 -.185;1.95o 6 7 13 -.185;2.02o 9 -24 -7 .12;2.12 22 -36 5;2.17a 28 -12 14 -.11;2.3o 27 -16 8;2.55a 26 0 0 -.12;2.75 24;3o 24 -4 0 .025;3.2a 24 0 0 -.03;3.5 22;3.75 12 0 -5 .02;4 10 -3 -6 .035;4.3 10 0 0 -.02;4.9 10;5.2o 12 0 3 -.03;5.35a 34 -6 8 .05;5.6o 36 0 6 -.08;5.65a 40 -2 10 -.09;5.8o 36 0 2;5.95a 41 -2 -10 -.09;6.1o 37;6.25a 42 -2 12 -.09;6.4o 37;6.5a 42 -3 -8 -.09;6.7 38 0 0 -.03;6.95 34 0 -14 -.1;7.2a 34 0 -14 -.1;7.3o 44 -8 18 .07;7.5 44 -2 14;7.7o 40 -6 0 .025;7.9a 40 0 0 -.04;8.1o 40 -6 0 .025;8.3a 40 0 0 -.04;8.6 38;9.3 4 -2;9.6 0 0 0 -.02;9.85');
  anim('ac', { o: PV.c, m: mv(A) }); anim('as', { m: sm(A) }); anim('ah', { o: PV.h, m: cab(A) });
  anim('ab', { o: PV.c, d: 1, m: mv(kf('0o 0 0 0 -.03;.5a 0 -2.2 0 .025')) });
  anim('ad', { o: PV.d, m: ag(kf('0 -150;.3 -140;.6 -155;.9 -146;1.2 -160;1.45 -148;1.55o -125;1.95 -125;2.02o -215;2.12 -228;2.17a -62;2.3o -78;2.55 -105;2.8 -140;3.3 -150;3.75 -165;4 -190;4.6 -175;5.2 -160;5.35 -205;5.6 -215;5.65a -68;5.8o -195;5.95a -64;6.1o -195;6.25a -70;6.4o -195;6.5a -60;6.7 -150;6.95 -240;7.2a -255;7.3a -70;7.5o -110;7.7 -175;8.3 -165;8.6 -150;9.6 -148')) });
  anim('ae', { o: PV.e, m: ag(kf('0 12;.6 22;1.2 10;1.6o 50;2 50;2.1o 80;2.17a 25;2.6 30;3 75;3.3 30;3.6 20;4.2 8;5.2 12;5.35o 70;5.65 30;5.95 70;6.25 30;6.5 75;6.8 30;7.2 60;7.3 25;7.6o 170;8.2 160;8.6 120;9.3 20;9.7 12')) });
  pernas('a', [[.7, 1.3, 3, 16], [3.6, 4.05, 3, -18], [5.2, 5.6, 3, 24], [8.6, 9.6, 6, -16]]);

  // ROBÔ-SEGURANÇA (g): cassetete, sirene e muito azar (casca de banana, tacada, queda do teto)
  const G = kf('0l;.1o 0 0 0 -.06;.3a 0 -4 0 .025;.5o 0 0 0 -.03;.7;.9 -5 0 -3;1.2 -5 0 -3;1.4 3 0 9 -.04;1.5a -14 -2 -14 .045;1.62o -18 0 -16;1.9 -16 0 -8;2.1 -14 0 -6;2.17a -12 0 6 -.275;2.3o -2 -4 12 .065;2.6 8 0 6 -.045;2.8 12 0 0 -.02;3 12 0 6;3.2 12 0 -6;3.4 11;3.55 14 0 10 -.05;3.7a -10 -2 -14 .055;3.85l -28 -2 -16 .04;3.92o -30 -6 -10;4o -36 -26 30;4.13a -42 -52 150;4.35o -48 -27 90 -.1;4.45a -48 -34 84;4.55 -48 -27 90 -.08;5 -48 -27 90;5.25 -46 -14 40;5.45 -34 0 -8;5.6 -20;5.65a -17 0 8 -.21;5.8o -12 0 2;5.95a -8 0 -8 -.21;6.1o -3;6.25a 2 0 8 -.21;6.4o 6;6.5a 10 0 -8 -.25;6.7 14 0 6;6.9 14 0 -6;7.1 14;7.22 14 0 0 -.045;7.3a 16 -6 12 -.3;7.42o 60 -60 180 .1;7.7l 150 -170 540;8 230 -330 900;8.3 230 -520 900;8.65l 0 -290 0 0 0 -150;8.7a 0 -290 0 0 0 -150;9.25o 0 0 0 -.3;9.4a 0 -5 0 .055;9.55 0 0 0 -.045;9.8');
  anim('gc', { o: PV.c, m: mv(G), p: jan([[0, 7.95], [8.7, T]]) }); anim('gs', { m: sm(G, .35), p: jan([[0, 7.4], [9.2, T]]) }); anim('gh', { o: PV.h, m: cab(G) });
  anim('gb', { o: PV.c, d: 1.25, m: mv(kf('0o 0 0 0 -.04;.6a 0 -1.8 0 .02')) });
  anim('ge', { o: PV.e, m: ag(kf('0 150;.4 142;.8 158;1.2 178;1.4o 215;1.5a 38;1.62o 22;1.9 62;2.1 88;2.17o 150;2.3 172;2.6 125;3 140;3.4 128;3.55 185;3.7a 58;3.85 48;3.95 110;4o 205;4.12 235;4.35 150;5 150;5.3 132;5.65o 168;5.8 140;5.95o 170;6.1 140;6.25o 168;6.4 140;6.5o 175;6.7 150;7.3o 190;7.42 250;8.3 160;9.25 135;9.6 150')) });
  anim('gd', { o: PV.d, m: ag(kf('0 -10;.5 -22;1 -8;1.4o -40;1.5a -70;1.9 -30;2.17o -110;2.4 -80;3 -40;3.55 -50;3.7a -100;4o -170;4.12 -200;4.35 -120;5 -110;5.4 -40;5.65o -90;6 -50;6.3o -90;6.6 -60;7.3o -120;7.42 -200;8.3 -150;9.25a -60;9.6 -15')) });
  pernas('g', [[.8, 1.3, 3, 14], [3.55, 3.95, 4, -26], [3.95, 4.4, 4, 40], [7.45, 8.3, 4, 50]]);
  anim('zw', { p: jan([[2.45, 3.45], [4.35, 5.35], [5.65, 7.25], [9.25, 9.75]]) }); // estrelinhas de tontura: órbita achatada
  [0, 1, 2].forEach((i) => anim(`z${i}`, { o: '50% 8.5%', d: .9, m: osc(0, .9, 8, (j) => { const a = Math.PI * 2 * j / 8 + i * 2.094; return `translate(${f2(23 * Math.cos(a))}%,${f2(3.9 * Math.sin(a))}%) scale(${f2(1 + .3 * Math.sin(a))})`; }, 'l') }));

  // TROCO-64 (m): torcida (laços de .5 s: pulinho, bandeira, cabeça, pernas), susto, banana, cambalhota
  const flip = osc(7.3, 8, 8, (i) => { const u = i / 8, r = u * 2 * Math.PI; return [-60 * Math.sin(r), -46.2 * (1 - Math.cos(r)) - 136 * u * (1 - u), u * 360].map((n) => n.toFixed(1)).join(' '); }, 'l').map(([t, v]) => `${t.toFixed(3)}l ${v}`).join(';');
  const M = kf(`0l;.1o 0 0 0 -.065;.3a 0 -6 0 .045;.5 0 0 0 -.045;.7;2.05o 0 0 0 -.11;2.2o 0 -26 0 .08;2.6a 0 0 0 -.08;2.8;3 -2 0 -9 -.02;3.3a 3 0 12 .02;3.6 1 0 4;3.8;3.9o 0 -8 -8 .05;4.2 -1 0 -6 -.02;4.6;5.65 0 0 0 -.05;5.8o 0 -8 0 .05;6a 0 0 0 -.05;6.2o 0 -8 0 .05;6.4a 0 0 0 -.05;6.6;7.2o 0 0 0 -.11;${flip};8.25a 0 0 360 -.1;8.45 0 0 360;10 0 0 360`);
  anim('mc', { o: PV.c, m: mv(M) }); anim('ms', { m: sm(M) });
  anim('mb', { o: PV.c, d: .5, m: mv(kf('0o 0 0 0 -.055;.25a 0 -7 0 .055')) });
  anim('me', { o: PV.e, d: .5, m: ag(kf('0 150;.25 205')) });
  anim('md', { o: PV.d, m: ag(kf(`${onda(0, 2.75)};2.9 -132;3 -215;3.25o -240;3.32a -70;3.5o -60;3.8 -110;${onda(4, 8.75)};9 -15;9.3o -110;${onda(9.5, 10)}`)) });
  anim('mh', { o: PV.h, d: .5, m: mv(kf('0 0 0 -4;.25 0 -1 4')) });
  anim('ml', { o: PV.l, d: .5, m: ag(kf('0 12;.25 -12')) }); anim('mr', { o: PV.r, d: .5, m: ag(kf('0 -12;.25 12')) });
  anim('bh', { p: jan([[0, 3.33], [9.15, T]]) });
  const DX = 196, DY = 43; // a casca: arco até o pé do segurança, depois é chutada para trás
  anim('mx', { o: '118.5% 52.3%', m: [
    ...osc<string>(3.33, 3.83, 10, (i) => { const u = i / 10; return tq(DX * u, DY * u - 248 * u * (1 - u), 720 * u, 1, 1, -127 * u, 158 * u); }, 'l'),
    [3.95, tq(DX, DY, 720, 1, 1, -127, 158), 'o'],
    ...osc<string>(3.96, 4.6, 8, (i) => { const u = i / 8; return tq(DX - 110 * u, DY - 480 * u * (1 - u) + 18 * u, 720 - 900 * u, 1, 1, -127, 158); }, 'l'),
  ], p: jan([[3.33, 4.5]], .08) });

  // O ATENDENTE (y): toca o sino a cada round, acompanha a luta com a cabeça, pisca, se assusta e boceja
  anim('ya', { o: '58.9% 49.7%', m: kf('0l -76 1.25;.14o -76 1.25;.4i -25 1;7.35 -25 1;7.45o -112 1.12;7.55a -76 1.25;7.66o -76 1.25;7.74o -112 1.12;7.82a -76 1.25;7.94o -76 1.25;8.15i -25 1;9.6 -25 1;9.78o -112 1.12;9.96a -76 1.25').map(([t, [a, k], e]) => [t, `rotate(${a}deg) scale(1,${k})`, e] as Q<string>) });
  const sq = (t: number) => `${t}o 0 0 0 -.12;${t + .08}a 0 -4 0 .065;${t + .22}o 0 0 0 -.05;${t + .4}`;
  anim('ys', { o: '80% 68%', m: mv(kf(`${sq(0)};7.5;${sq(7.55)};${sq(7.82)};8.4`)) });
  const anel = (cls: string, dl: number) => {
    const ts = [0, 7.55, 7.82].map((t) => t + dl), m: Q<string>[] = [];
    ts.forEach((t) => m.push([t, `scale(.35)`, 'o'], [t + .55, `scale(2.3)`], [t + .56, `scale(.35)`]));
    anim(cls, { o: '80% 54%', m, p: ev(ts, .95, .55) });
  };
  anel('yn1', 0); anel('yn2', .09);
  pop('wd', '83% 29%', [0, 7.55], .55);
  const susto = (t: number, h: number) => `${t}o 0 -${h} 0 ${(h * .0083).toFixed(3)};${t + .28}a 0 0 0 -.02;${t + .48}`;
  anim('yk', { o: '42% 70%', m: mv(kf(`0;.05 0 -1 0 .015;.25;2.15;${susto(2.22, 3)};4.3;${susto(4.4, 3)};7.3;${susto(7.38, 4)};9.25;${susto(9.32, 4)}`)) });
  anim('yh', { o: '42% 45%', m: mv(kf('0 0 2 -3;.2 0 0 0;.7 -1 0 -3;1.3 1 0 3;1.6 1.5 -1 4;2 -.5 0 -4;2.17o 0 -3;2.5 -1 0 -4;3;3.4 1 0 3;3.85 1 0 4;4.3o 0 -3;4.7;5.6 -1 0 -4;6 1 0 4;6.4 -1 0 -4;6.9 1 0 3;7.3o 0 -4;7.6 -1 0 -3;8.3 0 1 -5;8.5o 0 -1 -8;9.1 0 -1 -8;9.3o 0 -4;9.6 0 0 2;9.85 0 0 -3')) });
  anim('ypb', { p: jan([[.9, .98], [3, 3.08], [5.4, 5.48], [8, 8.08]]) });
  anim('yps', { p: jan([[2.17, 2.75], [4.3, 4.75], [7.3, 7.7], [9.25, 9.7]]) });
  anim('ypy', { p: jan([[8.45, 9.15]]) });

  // caras extras, balões e riscos de movimento
  for (const [id, f] of Object.entries(FACES)) for (const [t, w] of Object.entries(f)) anim(`${id}f${t}`, { p: jan(w) });
  BAL.forEach(([c, cx, cy, , , , , t, h]) => pop(c, `${cx / 2}% ${cy / 2.6}%`, [t], h));
  anim('sw1', { p: ev([1.52], 1, .14) }); anim('sw2', { p: ev([2.12], 1, .14) });

  // câmera, clarão e cenário vivo
  anim('sh', { m: tl(kf(`0;${[[2.17, .6], [4.35, .4], [5.65, .25], [5.95, .25], [6.25, .25], [6.5, .3], [7.3, 1.1], [9.25, .7]].map(([t, a]) => trem(t, a)).join(';')}`)) });
  anim('fl', { p: [[0, 0, 'l'], [2.17, 0, 'l'], [2.19, .22, 'l'], [2.36, 0], [7.3, 0, 'l'], [7.32, .5, 'l'], [7.65, 0], [9.25, 0, 'l'], [9.27, .16, 'l'], [9.45, 0]] });
  anim('lg0', { d: 1.7, p: [[0, .85], [.3, 1], [.55, .76], [.9, .96], [1.3, .82]] }); anim('lg1', { d: 2.3, p: [[0, 1], [.4, .8], [.8, .95], [1.4, .74], [1.9, .92]] });
  anim('rm', { o: '50% 24%', m: ag(kf('0l 0;10l 720')) });
  anim('k1', { o: '50% 16%', d: 3.3, m: ag(kf('0 -1.6;1.65 1.8')) }); anim('k2', { o: '50% 40%', d: 4.1, m: ag(kf('0 1.6;2.05 -1.8')) });
  anim('cE', { o: '20% 8%', d: 5, m: ag(kf('0 0;2.5 1.1')) }); anim('cD', { o: '80% 8%', d: 6, m: ag(kf('0 0;3 -1.1')) });
  anim('pa1', { o: '50% 95%', d: 4, m: ag(kf('0 -2;2 2')) }); anim('pa2', { o: '50% 95%', d: 5, m: ag(kf('0 2;2.5 -2')) });
  [1, 2, 3].forEach((i) => { const d = 6 + i * 1.7; anim(`mo${i}`, { d, m: tl(kf(`0;${d} ${i % 2 ? 500 : -500} -1700`)), p: [[0, 0, 'l'], [1, .8, 'l'], [d - 1.2, .8, 'l'], [d, 0]] }); });
}

// O CSS: base + layout + coreografia
function montarCss(): string {
  regras.length = 0;
  coreografia();
  const lay = LAY.map(([id, a, ...v]) => {
    const s = `.cna .${id}${v[2] ? `,.cna .${v[2]}` : ''}`;
    return v.slice(0, 2).map((o) => (o ? `${s}{display:block;${dim(o as Pos, a)}}` : `${s}{display:none}`));
  });
  const U = (n: number) => `calc(${n}*var(--u))`;
  return `
.cna{--W:1600;--H:760;--hz:430;--kq:0;--off:0s;--u:min(calc(100vw/var(--W)),calc(100vh/var(--H)));position:fixed;inset:0;z-index:9999;overflow:hidden;background:#3a0c16;container-type:size;opacity:1;transition:opacity .4s ease;
-webkit-user-select:none;user-select:none;touch-action:none;font-family:${FONTE};-webkit-tap-highlight-color:transparent}
@supports(width:1cqw){.cna{--u:min(calc(100cqw/var(--W)),calc(100cqh/var(--H)))}}
@media(orientation:portrait){.cna{--W:780;--H:1600;--hz:700;--kq:1}}
.cna.cs{opacity:0;pointer-events:none}.cna.cg *{animation-play-state:paused!important}
.cna .pa{position:absolute;left:0;right:0;top:0;height:calc(var(--hz)*var(--u));background:linear-gradient(#2a120b ${U(24)},#c58a2a ${U(24)},#c58a2a ${U(28)},transparent ${U(28)}),repeating-linear-gradient(90deg,rgba(0,0,0,.13) 0 ${U(3)},transparent ${U(3)} ${U(42)}),linear-gradient(#64162a,#430f1b)}
.cna .ch{position:absolute;left:0;right:0;bottom:0;top:calc(var(--hz)*var(--u));background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 ${U(3)},transparent ${U(3)} ${U(46)}),linear-gradient(#3a1b10,#1c0a07)}
.cna .lb{position:absolute;left:0;right:0;top:calc((var(--hz) - 84)*var(--u));height:${U(84)};background:linear-gradient(#422113,#2a1309);border-top:${U(4)} solid #c58a2a;border-bottom:${U(5)} solid #140804}
.cna .pal{position:absolute;top:0;left:50%;width:calc(var(--W)*var(--u));height:calc(var(--H)*var(--u));margin-left:calc(var(--W)*var(--u)/-2)}
.cna .sh{position:absolute;inset:0}
.cna .e{position:absolute;display:none;left:calc(var(--l)*var(--u));top:calc(var(--t)*var(--u));width:calc(var(--w)*var(--u));height:calc(var(--h)*var(--u))}
.cna .p{position:absolute;inset:0}.cna .p svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cna .pil{background:linear-gradient(90deg,#26130a,#6b3a1d 38%,#3a1e10 72%,#1f0f08);box-shadow:inset 0 0 0 ${U(3)} #140804}
.cna .pil::before{content:"";position:absolute;left:-14%;right:-14%;top:0;height:${U(18)};background:linear-gradient(#ffe59a,#b9791a);border:${U(3)} solid #1a1220;border-radius:3px}
.cna .mo{position:absolute;width:${U(9)};height:${U(9)};border-radius:50%;background:radial-gradient(#ffe2a0,rgba(255,226,160,0) 70%);opacity:0}
.cna .mo1{left:18%;top:62%}.cna .mo2{left:50%;top:72%}.cna .mo3{left:80%;top:64%}
.cna .fl{position:absolute;inset:0;background:#fff6dc;opacity:0;pointer-events:none}
.cna .vg{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 58%,transparent 50%,rgba(10,2,6,.66) 100%)}
.cna .led{animation:cn-led 1.2s steps(1,end) infinite}.cna .le1{animation-delay:-.8s}.cna .le2{animation-delay:-.4s}
.cna .bulbo,.cna .zap{animation:cn-bl .6s steps(1,end) infinite}.cna .sirg,.cna .glowb{animation:cn-si .7s ease-in-out infinite alternate}
@keyframes cn-led{0%{opacity:1}33%{opacity:.16}}@keyframes cn-bl{0%{opacity:1}50%{opacity:.35}}@keyframes cn-si{from{opacity:.12}to{opacity:.95}}
.cna .hud{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:clamp(6px,1.6cqmin,12px);pointer-events:none;
padding:clamp(20px,6cqmin,60px) max(16px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:linear-gradient(transparent,rgba(14,3,8,.8) 60%)}
.cna .rot{font-size:clamp(16px,4.7cqmin,34px);line-height:1.1;text-align:center;color:#ffd36b;letter-spacing:.05em;-webkit-text-stroke:.16em #1a1220;paint-order:stroke fill;text-shadow:0 .08em 0 #8a4a08,0 0 .5em rgba(0,0,0,.6)}
.cna .pt i{display:inline-block;font-style:normal;animation:cn-pt 1.2s ease-in-out infinite both}.cna .pt i:nth-child(2){animation-delay:.18s}.cna .pt i:nth-child(3){animation-delay:.36s}
@keyframes cn-pt{0%,65%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-.22em)}}
.cna .bar{position:relative;box-sizing:border-box;width:min(78cqw,30rem);height:clamp(10px,2.4cqmin,18px);border-radius:99px;background:#1a0a10;border:3px solid ${OURO};overflow:hidden;box-shadow:0 3px 0 #7a3b00,0 0 18px rgba(242,181,60,.28)}
.cna .fi{position:absolute;inset:0;border-radius:99px;transform-origin:left center;background:repeating-linear-gradient(-45deg,rgba(255,255,255,.32) 0 8px,transparent 8px 16px),linear-gradient(#ffe08a,#f2a11c);transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.cna .ind{right:auto;width:40%;animation:cn-ind 1.5s cubic-bezier(.45,0,.55,1) infinite}@keyframes cn-ind{from{transform:translateX(-105%)}to{transform:translateX(255%)}}
@media(prefers-reduced-motion:reduce){.cna{--off:-1s!important}.cna .sh,.cna .sh *,.cna .fl{animation-play-state:paused!important}}
${lay.map((l) => l[0]).join('\n')}
@media(orientation:portrait){${lay.map((l) => l[1]).join('\n')}}
${regras.join('\n')}`;
}
// A CÂMERA da briga (cnMotor): o saguão inteiro deixava os lutadores minúsculos; ela segue o DING, os golpes,
// a casca de banana, a tacada (abre e sobe atrás do segurança voando) e a queda dele do teto.
const plano0 = (cx: number, cy: number, z: number) => { const l = (z - 1) * 100, c = (v: number) => Math.max(-l, Math.min(0, v)); return { x: c((800 - cx * z) / 16), y: c((380 - cy * z) / 7.6), sx: z, sy: z }; };
const CAMERA0 = assar('c0-cam', '0 0', T, (tl, a) => {
  tl.set(a, plano0(1290, 500, 1.8), 0)
    .to(a, { ...plano0(820, 500, 1.5), duration: .7, ease: 'power2.inOut' }, .45)        // DING → a briga
    .to(a, { ...plano0(830, 490, 1.72), duration: .1, ease: 'power3.out' }, 2.17)        // o primeiro golpe
    .to(a, { ...plano0(800, 500, 1.5), duration: .6, ease: 'power2.out' }, 2.3)
    .to(a, { ...plano0(330, 500, 1.6), duration: .4, ease: 'power2.inOut' }, 3.0)        // o 64 arremessa a casca
    .to(a, { ...plano0(900, 470, 1.5), duration: .5, ease: 'power2.inOut' }, 3.6)        // ...que pega o segurança
    .to(a, { ...plano0(840, 480, 1.7), duration: .3, ease: 'power2.out' }, 5.55);        // a sequência de socos
  for (const t of [5.65, 5.95, 6.25, 6.5]) tl.to(a, { ...plano0(840, 480, 1.78), duration: .05 }, t).to(a, { ...plano0(840, 480, 1.7), duration: .2, ease: 'power2.out' }, t + .05);
  tl.to(a, { ...plano0(900, 300, 1.12), duration: .45, ease: 'expo.out' }, 7.3)           // a tacada: abre e sobe
    .to(a, { ...plano0(1290, 500, 1.55), duration: .3, ease: 'power2.inOut' }, 7.62)     // o atendente toca o sino de novo
    .to(a, { ...plano0(820, 470, 1.3), duration: .6, ease: 'power2.inOut' }, 8.3)
    .to(a, { ...plano0(950, 470, 1.6), duration: .12, ease: 'power3.out' }, 9.25)        // ele cai do teto
    .to(a, { ...plano0(1290, 500, 1.8), duration: .5, ease: 'power2.inOut' }, 9.5);
});
const CSS = montarCss() + CAMERA0;

// O COMPONENTE
/** Todas as cenas: a briga do saguão e as que os módulos de cenas registram (CarregandoCenas, CarregandoAndares).
 *  Uma por carregamento, sorteada. (Registro em vez de import: as cenas usam as peças daqui ao carregar.) */
const CENAS: React.ComponentType[] = [];
export function registrarCenas(c: React.ComponentType[]): void { CENAS.push(...c); }
const sortearCena = () => {
  if (CENAS[0] !== Cena) CENAS.unshift(Cena);
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cena') : null; // bancada: ?cena=N
  if (q !== null && CENAS[+q]) return +q;
  return Math.floor(Math.random() * CENAS.length);
};

export const CarregandoAnimado: React.FC<CarregandoAnimadoProps> = ({ progresso, rotulo = 'Carregando…', visivel = true, congelar }) => {
  const [qual] = useState(sortearCena);
  const CenaEscolhida = CENAS[qual];
  const [fase, setFase] = useState<'off' | 'on' | 'sai'>(visivel ? 'on' : 'off');
  // a fase atual, lida no efeito sem entrar nas dependências (o efeito só reage a `visivel`)
  const faseAtual = useRef(fase); faseAtual.current = fase;
  useEffect(() => {
    if (visivel) { setFase('on'); return; }
    // já desmontada: nada a esmaecer, nenhum timer
    if (faseAtual.current === 'off') return;
    // visível → esmaece 450 ms e desmonta; se voltar a ficar visível antes, o cleanup cancela
    setFase('sai');
    const id = window.setTimeout(() => setFase('off'), 450);
    return () => window.clearTimeout(id);
  }, [visivel]);
  if (fase === 'off') return null;
  const m = /^(.*?)(\.{3}|…)?$/s.exec(rotulo) ?? [rotulo, rotulo];
  const p = progresso === undefined ? undefined : Math.max(0, Math.min(1, progresso));
  return (
    <div className={`cna${fase === 'sai' ? ' cs' : ''}${congelar !== undefined ? ' cg' : ''}`} role="status" aria-live="polite" aria-label={rotulo}
      style={{ '--off': `${-(congelar ?? 0)}s` } as React.CSSProperties}>
      <style>{CSS}</style>
      <CenaEscolhida />
      <div className="hud">
        <div className="rot">{m[1]}{m[2] && <span className="pt"><i>.</i><i>.</i><i>.</i></span>}{p !== undefined && <> · {Math.round(p * 100)}%</>}</div>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p === undefined ? undefined : Math.round(p * 100)}>
          <div className={p === undefined ? 'fi ind' : 'fi'} style={p === undefined ? undefined : { transform: `scaleX(${p})` }} />
        </div>
      </div>
    </div>
  );
};

export default CarregandoAnimado;
