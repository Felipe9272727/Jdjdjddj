/**
 * CarregandoAnimado.tsx — A TELA DE CARREGAMENTO PADRÃO DO JOGO.
 *
 * O saguão do hotel em cartum 2D: o TROCO-63 (o irmão mais velho, verde-água,
 * de chave inglesa — é o robô de manutenção) enfrenta o Robô-Segurança do
 * saguão; o TROCO-64 (cromo, antena vermelha, LEDs) torce da lateral com a
 * bandeirinha e ainda arremessa uma casca de banana; e o atendente do lobby,
 * atrás do balcão, toca o sininho a cada round, boceja e olha o relógio.
 *
 * ── POR QUE É ASSIM (e não three.js, nem canvas) ────────────────────────────
 * Esta tela aparece justamente quando a GPU e a thread principal estão
 * ocupadas (compilando shaders, baixando modelos). Então:
 *   • zero WebGL — não disputa a GPU com a compilação;
 *   • zero requestAnimationFrame / zero JS por quadro — tudo é CSS;
 *   • só `transform` e `opacity` em camadas com `will-change`: o navegador
 *     anima no COMPOSITOR, e a cena continua fluida mesmo com a thread
 *     principal travada num `gl.compile`. Cada parte móvel é uma camada HTML
 *     (um <div> com um <svg> dentro), não um <g> de SVG — nos navegadores que
 *     só aceleram HTML (Safari), o <g> animaria na thread principal e
 *     congelaria junto com o jogo;
 *   • nada de asset externo: tudo inline (a única dependência é a fonte
 *     'Luckiest Guy', que o index.html já embute; sem ela cai em Impact).
 *
 * ── A LINHA DO TEMPO ────────────────────────────────────────────────────────
 * Uma rodada dura T = 10 s e TODAS as animações dela compartilham o relógio:
 * o soco do 63 e o tranco do robô são quadros-chave do MESMO instante. Eles
 * são escritos em segundos (ver `montarCss`), e o DSL `anim` converte em
 * porcentagens. `--off` é a fase do relógio de parede (Date.now() % T), então
 * duas telas montadas em momentos diferentes (a global e a do andar) mostram
 * a cena no mesmo ponto e a troca de uma pela outra não reinicia a luta.
 *
 * ── USO ─────────────────────────────────────────────────────────────────────
 *   <CarregandoAnimado rotulo="Carregando o Andar 13…" />            barra que vai e volta
 *   <CarregandoAnimado rotulo="Baixando…" progresso={0.42} />         barra com progresso 0..1
 *   <CarregandoAnimado visivel={!pronto} />                           some com fade quando pronto
 * Cobre a tela toda (position: fixed), respeita safe-area, funciona em retrato
 * e paisagem e bloqueia toques enquanto visível.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';

export interface CarregandoAnimadoProps {
    /** 0..1. Sem ele a barra é indeterminada (um bloco que vai e volta). */
    progresso?: number;
    /** O "…" final vira três pontinhos animados. */
    rotulo?: string;
    /** `false`: some com um fade e desmonta o DOM pesado (o componente segue montado no React). */
    visivel?: boolean;
    /** Só aparece se o carregamento passar disso (evita o pisca em cargas rápidas). */
    atrasoMs?: number;
    zIndex?: number;
    /** Bancada: congela a cena neste instante (s da rodada). */
    congelar?: number;
}

// ═════════════════════════════════════════════════════════════════════════════
// TEMPO, CORES E O DSL DE ANIMAÇÃO
// ═════════════════════════════════════════════════════════════════════════════

/** Duração da rodada, em segundos. */
const T = 10;
const FONTE = "'Luckiest Guy','Arial Black',Impact,system-ui,sans-serif";
const K = '#1a1220';                       // o traço grosso de todo o cartum
const OURO = '#f2b53c';
const OURO_E = '#b9791a';
const VERM = '#b3111a';
const PELE = '#f4cd73';

type E = 'i' | 'o' | 'a' | 'p' | 'h' | 'l';
const EASE: Record<E, string> = {
    i: 'cubic-bezier(.45,0,.55,1)',        // suave nos dois lados
    o: 'cubic-bezier(.1,.8,.25,1)',        // arranca rápido, assenta devagar
    a: 'cubic-bezier(.7,0,.9,.4)',         // acelera até o fim (o golpe)
    p: 'cubic-bezier(.3,1.7,.5,1)',        // passa do ponto e volta (pop)
    h: 'steps(1,end)',                     // pula no próximo quadro
    l: 'linear',
};
/** Quadro-chave: [segundo, valor, suavização do trecho que COMEÇA nele]. */
type Q<V> = [number, V, E?];

function quadros<V extends string | number>(q: Q<V>[], d: number, prop: string): string {
    const f = q.slice().sort((a, b) => a[0] - b[0]);
    if (f[0][0] > 0) f.unshift([0, f[0][1], 'l']);
    if (f[f.length - 1][0] < d) f.push([d, f[0][1]]);          // o laço fecha no quadro 0
    return f.map(([s, v, e]) => `${+(s / d * 100).toFixed(3)}%{${prop}:${v};animation-timing-function:${EASE[e ?? 'i']}}`).join('');
}

const regras: string[] = [];
interface AnimO {
    /** transform-origin, em % da camada */
    o?: string;
    m?: Q<string>[];
    p?: Q<number>[];
    /** duração do laço (padrão: a rodada) */
    d?: number;
}
function anim(cls: string, a: AnimO): void {
    const d = a.d ?? T, n: string[] = [];
    if (a.m) { regras.push(`@keyframes m-${cls}{${quadros(a.m, d, 'transform')}}`); n.push(`m-${cls} ${d}s linear infinite`); }
    if (a.p) { regras.push(`@keyframes o-${cls}{${quadros(a.p, d, 'opacity')}}`); n.push(`o-${cls} ${d}s linear infinite`); }
    regras.push(`.cna .${cls}{${a.o ? `transform-origin:${a.o};` : ''}${a.p ? `opacity:${a.p[0][1]};` : ''}will-change:${a.m ? 'transform' : 'opacity'};animation:${n.join(',')};animation-fill-mode:both;animation-delay:var(--off)}`);
}

/** translate(%) rotate(°) scale — sempre as mesmas 3 funções, para interpolar. */
const tr = (x = 0, y = 0, r = 0, sx = 1, sy = sx) => `translate(${x}%,${y}%) rotate(${r}deg) scale(${sx},${sy})`;
/** x = % da caixa do ator; xq = deslocamento extra só em retrato (--kq = 1). */
const tq = (x = 0, y = 0, r = 0, sx = 1, sy = sx, xq = 0, yq = 0) =>
    `translate(calc(${x}% + ${xq}% * var(--kq)),calc(${y}% + ${yq}% * var(--kq))) rotate(${r}deg) scale(${sx},${sy})`;

/** Um passo de coreografia: [s, x, y, rot, sx, sy, suavização, xq, yq]. */
type Mv = [number, number, number, number?, number?, number?, E?, number?, number?];
const mov = (l: Mv[]): Q<string>[] => l.map(([t, x, y, r = 0, sx = 1, sy = sx, e, xq = 0, yq = 0]) => [t, tq(x, y, r, sx, sy, xq, yq), e]);
/** A sombra acompanha o x, alarga deitado e encolhe quando o ator sobe. */
const som = (l: Mv[], larga = 0): Q<string>[] => l.map(([t, x, y, r = 0, , , e, xq = 0]) => {
    const k = Math.max(.35, 1 + larga * Math.abs(Math.sin(r * Math.PI / 180)) + Math.min(0, y) / 130);
    return [t, tq(x, 0, 0, k, k, xq), e] as Q<string>;
});
/** Ângulos de um braço. */
const ang = (l: [number, number, E?][]): Q<string>[] => l.map(([t, a, e]) => [t, tr(0, 0, a), e]);
/** n+1 quadros entre t0 e t1. */
const osc = <V,>(t0: number, t1: number, n: number, f: (i: number) => V, e?: E): Q<V>[] =>
    Array.from({ length: n + 1 }, (_, i) => [t0 + (t1 - t0) * i / n, f(i), e] as Q<V>);
/** Janelas de visibilidade [de, até] (s), com fade curto. */
const jan = (w: [number, number][], f = .05): Q<number>[] => {
    const m = new Map<number, number>([[0, 0]]);
    for (const [a, b] of w) {
        m.set(Math.max(0, a - f), 0); m.set(a, 1); m.set(b, 1);
        if (b + f <= T) m.set(+(b + f).toFixed(3), 0);
    }
    return [...m].sort((x, y) => x[0] - y[0]).map(([t, v]) => [t, v, 'l'] as Q<number>);
};

// ═════════════════════════════════════════════════════════════════════════════
// DESENHO — traço grosso, cor chapada, um brilho em cima e uma sombra embaixo
// ═════════════════════════════════════════════════════════════════════════════

const VR = '0 0 200 260';                  // caixa dos robôs
const L = { stroke: K, strokeWidth: 6, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const Br: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect {...p} fill="url(#cna-sh)" stroke="none" />;

const estrela = (cx: number, cy: number, r: number, n = 5, f = .46) => {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
        const a = Math.PI / n * i - Math.PI / 2, rr = i % 2 ? r * f : r;
        d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
    }
    return d + 'Z';
};

/** Uma camada animável: <div> (vira camada do compositor) + <svg> opcional. */
const Pt: React.FC<{ c?: string; vb?: string; par?: string; kids?: React.ReactNode; children?: React.ReactNode }> =
    ({ c = '', vb, par, kids, children }) => (
        <div className={`p ${c}`}>
            {vb ? <svg viewBox={vb} preserveAspectRatio={par} aria-hidden="true">{children}</svg> : children}
            {kids}
        </div>
    );

/** Gradientes compartilhados (um svg invisível; `url(#…)` vale no documento todo). */
const Defs: React.FC = () => (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
            <linearGradient id="cna-sh" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity=".34" />
                <stop offset=".38" stopColor="#fff" stopOpacity="0" />
                <stop offset=".6" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#000" stopOpacity=".32" />
            </linearGradient>
            <linearGradient id="cna-ou" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe59a" /><stop offset=".55" stopColor="#f2b53c" /><stop offset="1" stopColor="#b9791a" /></linearGradient>
            <linearGradient id="cna-ma" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4a2714" /><stop offset=".5" stopColor="#6f3d20" /><stop offset="1" stopColor="#3f2010" /></linearGradient>
            <linearGradient id="cna-cu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6a0d1b" /><stop offset=".3" stopColor="#b3182c" /><stop offset=".55" stopColor="#7d1022" /><stop offset=".8" stopColor="#b3182c" /><stop offset="1" stopColor="#5a0a17" /></linearGradient>
            {([['lz', '#ffd98a', '#ffb347'], ['ci', '#7df9ff', '#16e0e8'], ['vm', '#ff8a7a', '#ff3b30'], ['br', '#ffffff', '#fff3b0']] as const).map(([id, a, b]) => (
                <radialGradient id={`cna-${id}`} key={id}>
                    <stop offset="0" stopColor={a} stopOpacity=".95" />
                    <stop offset=".45" stopColor={b} stopOpacity=".45" />
                    <stop offset="1" stopColor={b} stopOpacity="0" />
                </radialGradient>
            ))}
        </defs>
    </svg>
);

// ── OS ROBÔS (mesma família: caixa de cromo, tela escura, antena, três LEDs) ──
interface Pal { c: string; e: string; m: string; j: string; pn: string; tl: string; ac: string; ol: string; bu: string; lu: string[] }
/** TROCO-64: cromo, acento vermelho, olhos ciano (Floor5Robot64). */
const P64: Pal = { c: '#b4bdc7', e: '#6f7a87', m: '#8a95a1', j: '#3a4047', pn: '#4a525c', tl: '#0e1318', ac: '#e8503a', ol: '#16e0e8', bu: '#ff5040', lu: ['#ffd24d', '#4dff7a', '#4da8ff'] };
/** TROCO-63: a paleta "azeda" do irmão mais velho (Floor12Avioes: irmao #8cc4b4). */
const P63: Pal = { c: '#8cc4b4', e: '#3f6f68', m: '#8e97a6', j: '#3a4047', pn: '#3f6f68', tl: '#0c1716', ac: '#8e97a6', ol: '#75e6e0', bu: '#3fe0c8', lu: ['#3fe0c8', '#3fe0c8', '#3fe0c8'] };
/** Robô-Segurança do saguão: aço escuro, faixa de perigo, olhos vermelhos. */
const PSG: Pal = { c: '#66748c', e: '#2f3848', m: '#46526a', j: '#20252d', pn: '#2a303b', tl: '#0a0c10', ac: '#ffc21a', ol: '#ff4a3c', bu: '#ff3b30', lu: ['#ff3b30', '#ffc21a', '#ff3b30'] };

const Perna: React.FC<{ p: Pal; x: number; gr?: boolean }> = ({ p, x, gr }) => {
    const w = gr ? 10 : 8, f = gr ? 27 : 25;
    return (
        <g {...L}>
            <rect x={x - w} y={186} width={w * 2} height={36} rx={5} fill={p.j} />
            <rect x={x - f} y={214} width={f * 2} height={30} rx={12} fill={p.m} />
            <Br x={x - f} y={214} width={f * 2} height={30} rx={12} />
            <rect x={x - f + 8} y={219} width={22} height={6} rx={3} fill="#fff" fillOpacity={.4} stroke="none" />
        </g>
    );
};

const Tronco: React.FC<{ p: Pal; k: 0 | 1 | 2 }> = ({ p, k }) => (
    <g {...L}>
        <rect x={46} y={98} width={108} height={92} rx={18} fill={p.c} />
        <Br x={46} y={98} width={108} height={92} rx={18} />
        {k === 2 ? (
            <>
                <path d="M100 108 L128 117 L128 141 Q128 160 100 170 Q72 160 72 141 L72 117 Z" fill={OURO} />
                <path d={estrela(100, 140, 15)} fill={PSG.j} stroke="none" />
            </>
        ) : (
            <>
                <rect x={64} y={112} width={72} height={52} rx={9} fill={p.pn} />
                {p.lu.map((c, i) => <rect key={i} className={`led le${i}`} x={72 + i * 22} y={130} width={14} height={14} rx={3} fill={c} />)}
            </>
        )}
        {k === 2 ? (
            <>
                <rect x={42} y={174} width={116} height={18} rx={6} fill={OURO} />
                {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${48 + i * 19} 175 h9 l-8 16 h-9 z`} fill={K} stroke="none" />)}
                <rect x={42} y={174} width={116} height={18} rx={6} fill="none" />
            </>
        ) : <rect x={42} y={176} width={116} height={16} rx={6} fill={p.ac} />}
    </g>
);

/** As caras: a tela escura + os olhos. `t` é a expressão. */
type Exp = 'n' | 'f' | 'x' | 'e' | 's' | 'b' | 'p' | 'r';
const Cara: React.FC<{ p: Pal; k: 0 | 1 | 2; t: Exp }> = ({ p, k, t }) => {
    const gl = k === 2 ? 'url(#cna-vm)' : 'url(#cna-ci)';
    const tr2: React.CSSProperties = t === 'r' ? { transform: 'rotate(180deg)', transformOrigin: '50% 50%' } : {};
    const o = { fill: 'none', stroke: p.ol, strokeWidth: 6.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
    return (
        <g>
            <rect x={64} y={40} width={72} height={48} rx={10} fill={p.tl} {...L} strokeWidth={4.5} />
            {(t === 'n' || t === 'r') && (k === 2 ? (
                <g style={tr2}>
                    <circle cx={83} cy={64} r={22} fill={gl} stroke="none" />
                    <circle cx={117} cy={64} r={22} fill={gl} stroke="none" />
                    <path d="M69 52 L95 62 L95 74 L69 68 Z" fill={p.ol} stroke="none" />
                    <path d="M131 52 L105 62 L105 74 L131 68 Z" fill={p.ol} stroke="none" />
                </g>
            ) : (
                <g fill={p.ol} stroke="none">
                    <circle cx={86} cy={k === 1 ? 67 : 64} r={21} fill={gl} />
                    <circle cx={114} cy={k === 1 ? 67 : 64} r={21} fill={gl} />
                    <rect x={78} y={k === 1 ? 59 : 52} width={16} height={k === 1 ? 17 : 23} rx={5} />
                    <rect x={106} y={k === 1 ? 59 : 52} width={16} height={k === 1 ? 17 : 23} rx={5} />
                    <rect x={80} y={k === 1 ? 61 : 54} width={5} height={6} rx={2} fill="#fff" fillOpacity={.75} />
                    <rect x={108} y={k === 1 ? 61 : 54} width={5} height={6} rx={2} fill="#fff" fillOpacity={.75} />
                    {k === 1 && <>
                        <path d="M70 51 L97 60" stroke={K} strokeWidth={5.5} strokeLinecap="round" />
                        <path d="M130 51 L103 60" stroke={K} strokeWidth={5.5} strokeLinecap="round" />
                        <path d="M86 81 L114 79" stroke={p.ol} strokeWidth={3.5} strokeLinecap="round" opacity={.8} />
                    </>}
                </g>
            ))}
            {t === 'f' && <g {...o}><path d="M75 70 Q86 50 97 70" /><path d="M103 70 Q114 50 125 70" /></g>}
            {t === 'x' && <g {...o} strokeWidth={6}><path d="M76 54 L96 74 M96 54 L76 74" /><path d="M104 54 L124 74 M124 54 L104 74" /></g>}
            {t === 'e' && <g {...o} strokeWidth={4}><path d="M86 64 a3 3 0 0 1 6 0 a6 6 0 0 1 -12 0 a9 9 0 0 1 18 0" /><path d="M114 64 a3 3 0 0 1 6 0 a6 6 0 0 1 -12 0 a9 9 0 0 1 18 0" /></g>}
            {t === 's' && (
                <g fill={p.ol} stroke="none">
                    <rect x={73} y={47} width={24} height={34} rx={8} /><rect x={103} y={47} width={24} height={34} rx={8} />
                    <rect x={82} y={59} width={8} height={10} rx={3} fill={p.tl} /><rect x={110} y={59} width={8} height={10} rx={3} fill={p.tl} />
                </g>
            )}
            {t === 'b' && <g {...o}><path d="M76 54 L94 64 L76 74" /><path d="M124 54 L106 64 L124 74" /></g>}
            {t === 'p' && <g {...o} strokeWidth={5}><path d="M76 66 H96" /><path d="M104 66 H124" /></g>}
        </g>
    );
};

const Cabeca: React.FC<{ p: Pal; k: 0 | 1 | 2; x: string; ex: Exp[] }> = ({ p, k, x, ex }) => (
    <g {...L}>
        {k === 0 && <><path d="M100 30 V13" fill="none" /><circle className="bulbo" cx={100} cy={8} r={8} fill={p.bu} /></>}
        {k === 1 && <><path d="M104 30 L115 14 L109 3" fill="none" /><circle className="bulbo" cx={109} cy={-1} r={7.5} fill={p.bu} /></>}
        {k === 2 && <>
            <circle className="sirg" cx={100} cy={14} r={34} fill="url(#cna-vm)" stroke="none" />
            <path d="M72 32 Q72 2 100 2 Q128 2 128 32 Z" fill={p.bu} />
            <path d="M82 22 Q86 11 96 9" fill="none" stroke="#fff" strokeWidth={4} opacity={.7} />
        </>}
        <rect x={k === 2 ? 48 : 52} y={26} width={k === 2 ? 104 : 96} height={72} rx={k === 2 ? 12 : 16} fill={p.c} />
        <Br x={k === 2 ? 48 : 52} y={26} width={k === 2 ? 104 : 96} height={72} rx={k === 2 ? 12 : 16} />
        <rect x={60} y={20} width={80} height={12} rx={5} fill={p.ac} />
        <rect x={38} y={50} width={15} height={30} rx={5} fill={p.ac} />
        <rect x={147} y={50} width={15} height={30} rx={5} fill={p.ac} />
        {k === 2 && <g>{[0, 1, 2, 3].map((i) => <path key={i} d={`M${84 + i * 10} 90 v6`} stroke={K} strokeWidth={3.5} />)}</g>}
        {k === 1 && <>
            <path d="M136 30 L150 37 L146 49 L137 42 Z" fill={p.e} />
            <rect x={52} y={22} width={24} height={11} rx={2} fill="#ecd9a8" transform="rotate(-18 64 27)" />
            <path d="M60 28 h8" stroke={K} strokeWidth={2.5} transform="rotate(-18 64 27)" />
        </>}
        <Cara p={p} k={k} t="n" />
        {ex.map((t) => <g key={t} className={`${x}f${t}`} opacity={0}><Cara p={p} k={k} t={t} /></g>)}
    </g>
);

type Arma = 'c' | 'b' | 'f' | 'n';
const Chave: React.FC = () => (
    <g>
        <rect x={-8} y={44} width={16} height={72} rx={7} fill="#f2b632" />
        <Br x={-8} y={44} width={16} height={72} rx={7} />
        <path d="M-9 145 L-9 131 L9 131 L9 145 A23 23 0 1 0 -9 145 Z" fill="#f2b632" />
        <circle cx={0} cy={112} r={4} fill={K} stroke="none" />
    </g>
);
const Bastao: React.FC<{ p: Pal }> = ({ p }) => (
    <g>
        <circle className="glowb" cx={0} cy={138} r={30} fill="url(#cna-ci)" stroke="none" />
        <rect x={-7} y={44} width={14} height={86} rx={6} fill="#2c323d" />
        {[56, 76].map((y) => <rect key={y} x={-7} y={y} width={14} height={8} fill={p.ac} stroke="none" />)}
        <rect x={-10} y={120} width={20} height={30} rx={9} fill="#9af6ff" />
        <path className="zap" d="M-13 126 l8 6 l-6 4 l9 8" fill="none" stroke="#fff" strokeWidth={3} />
    </g>
);
const Bandeira: React.FC = () => (
    <g>
        <rect x={-3.5} y={40} width={7} height={120} rx={3} fill="#e0c890" />
        <path d="M-3 112 L-72 124 L-54 140 L-72 156 L-3 168 Z" fill="#3fe0c8" />
        <text x={-38} y={150} textAnchor="middle" fontFamily={FONTE} fontSize={25} fill={K} stroke="none" transform="rotate(180 -38 142)">63</text>
    </g>
);
const Banana: React.FC = () => (
    <g {...L} strokeWidth={5}>
        <path d="M-16 -10 Q-18 14 6 20 Q22 22 28 10 Q12 14 2 4 Q-2 -8 -6 -14 Z" fill="#ffe14a" />
        <path d="M-6 -14 l-2 -8 l8 0 l-0 6 z" fill="#7a4a1a" />
    </g>
);

const Braco: React.FC<{ p: Pal; x: number; arma?: Arma; gr?: boolean; ban?: boolean }> = ({ p, x, arma = 'n', gr, ban }) => (
    <g transform={`translate(${x} 124)${gr ? ' scale(1.14)' : ''}`} {...L}>
        {arma === 'c' && <Chave />}
        {arma === 'b' && <Bastao p={p} />}
        {arma === 'f' && <Bandeira />}
        <rect x={-10} y={-4} width={20} height={56} rx={10} fill={p.m} />
        <Br x={-10} y={-4} width={20} height={56} rx={10} />
        <rect x={-14} y={46} width={11} height={25} rx={4} fill={p.j} />
        <rect x={3} y={46} width={11} height={25} rx={4} fill={p.j} />
        <circle r={13} fill={p.ac} />
        {ban && <g className="bh"><g transform="translate(0 78) rotate(-20) scale(.9)"><Banana /></g></g>}
    </g>
);

// ═════════════════════════════════════════════════════════════════════════════
// O ATENDENTE DO LOBBY — quepe vermelho com medalhão, paletó de botões dourados,
// gravata preta, atrás do balcão escuro com o sino (igual ao sprite da loja)
// ═════════════════════════════════════════════════════════════════════════════
const JAQ = '#b3111a';
const CAB = '#15101c';
const VA = '0 0 360 330';

const AtdCorpo: React.FC = () => (
    <g {...L}>
        <path d="M84 242 L88 186 Q90 152 122 148 H178 Q210 152 212 186 L216 242 Z" fill={JAQ} />
        <path d="M84 242 L88 186 Q90 152 122 148 H178 Q210 152 212 186 L216 242 Z" fill="url(#cna-sh)" stroke="none" />
        <path d="M128 148 L150 184 L172 148 Z" fill="#f6f1e4" strokeWidth={4} />
        <path d="M144 152 H156 L160 162 L151 214 L140 162 Z" fill={K} strokeWidth={3} />
        <path d="M106 158 L138 242 M194 158 L162 242" fill="none" stroke={OURO} strokeWidth={4} />
        {[0, 1, 2].map((i) => (
            <g key={i}>
                <circle cx={132 + i * 3} cy={192 + i * 14} r={4.2} fill={OURO} strokeWidth={2.5} />
                <circle cx={168 - i * 3} cy={192 + i * 14} r={4.2} fill={OURO} strokeWidth={2.5} />
            </g>
        ))}
        <rect x={172} y={176} width={24} height={9} rx={2.5} fill={OURO} strokeWidth={2.5} />
        {/* o braço parado, apoiado no balcão */}
        <path d="M90 166 Q68 180 74 230 L104 234 Q106 198 114 170 Z" fill={JAQ} />
        <rect x={72} y={214} width={32} height={11} rx={4} fill={OURO} strokeWidth={3} />
        <ellipse cx={90} cy={238} rx={16} ry={11} fill={PELE} />
    </g>
);

type ExpA = 'pi' | 'ps' | 'py';
const AtdCabeca: React.FC = () => (
    <g {...L}>
        <path d="M104 100 Q96 56 130 48 H170 Q204 56 196 100 Z" fill={CAB} />
        <rect x={108} y={60} width={84} height={86} rx={22} fill={PELE} />
        <rect x={108} y={60} width={84} height={86} rx={22} fill="url(#cna-sh)" stroke="none" />
        <path d="M106 96 Q100 62 128 62 L137 79 L150 62 L163 79 L172 62 Q200 62 194 96 L186 82 L176 94 L164 80 L150 94 L136 80 L126 94 Z" fill={CAB} strokeWidth={4} />
        <ellipse cx={132} cy={106} rx={5.6} ry={8.6} fill={K} stroke="none" />
        <ellipse cx={168} cy={106} rx={5.6} ry={8.6} fill={K} stroke="none" />
        <circle cx={119} cy={124} r={7} fill="#f0906a" opacity={.42} stroke="none" />
        <circle cx={181} cy={124} r={7} fill="#f0906a" opacity={.42} stroke="none" />
        <path d="M134 126 Q150 140 166 126" fill="none" strokeWidth={4.6} />
        <g className="apb" opacity={0}>
            <rect x={122} y={96} width={56} height={22} rx={6} fill={PELE} stroke="none" />
            <path d="M124 106 Q132 112 140 106 M160 106 Q168 112 176 106" fill="none" strokeWidth={4.6} />
        </g>
        <g className="aps" opacity={0}>
            <rect x={120} y={84} width={60} height={58} rx={8} fill={PELE} stroke="none" />
            <ellipse cx={132} cy={104} rx={6.8} ry={11} fill={K} stroke="none" />
            <ellipse cx={168} cy={104} rx={6.8} ry={11} fill={K} stroke="none" />
            <path d="M122 88 Q132 80 142 88 M158 88 Q168 80 178 88" fill="none" strokeWidth={4} />
            <ellipse cx={150} cy={130} rx={8} ry={11} fill={K} stroke="none" />
        </g>
        <g className="apy" opacity={0}>
            <rect x={120} y={92} width={60} height={50} rx={8} fill={PELE} stroke="none" />
            <path d="M122 106 Q132 99 142 106 M158 106 Q168 99 178 106" fill="none" strokeWidth={4.6} />
            <ellipse cx={150} cy={128} rx={12} ry={14} fill={K} stroke="none" />
            <ellipse cx={150} cy={136} rx={7} ry={5} fill="#e0566a" stroke="none" />
        </g>
        <path d="M100 66 V30 Q100 14 118 14 H182 Q200 14 200 30 V66 Q150 76 100 66 Z" fill={JAQ} />
        <path d="M100 66 V30 Q100 14 118 14 H182 Q200 14 200 30 V66 Q150 76 100 66 Z" fill="url(#cna-sh)" stroke="none" />
        <path d="M100 48 Q150 58 200 48 V58 Q150 68 100 58 Z" fill={OURO} strokeWidth={3.5} />
        <circle cx={150} cy={38} r={12} fill={OURO} strokeWidth={4} />
        <circle cx={150} cy={38} r={5} fill={OURO_E} stroke="none" />
    </g>
);

const AtdBraco: React.FC = () => (
    <g transform="translate(212 164)" {...L}>
        <rect x={-14} y={-8} width={28} height={58} rx={14} fill={JAQ} />
        <rect x={-14} y={38} width={28} height={10} rx={4} fill={OURO} strokeWidth={3} />
        <ellipse cx={0} cy={58} rx={14} ry={12} fill={PELE} />
    </g>
);

const AtdSino: React.FC = () => (
    <g {...L}>
        <path d="M250 224 Q250 180 288 180 Q326 180 326 224 Z" fill="url(#cna-ou)" />
        <rect x={242} y={220} width={92} height={12} rx={6} fill={OURO_E} />
        <rect x={283} y={170} width={10} height={14} rx={3} fill={OURO_E} strokeWidth={3} />
        <circle cx={288} cy={168} r={7} fill={OURO} strokeWidth={3.5} />
        <path d="M262 214 Q264 194 277 188" fill="none" stroke="#fff" strokeWidth={4} opacity={.6} />
    </g>
);

const AtdBalcao: React.FC = () => (
    <g {...L}>
        <rect x={6} y={226} width={348} height={22} rx={7} fill="#2a1710" />
        <rect x={6} y={226} width={348} height={7} rx={3.5} fill="url(#cna-ou)" stroke="none" opacity={.85} />
        <rect x={16} y={246} width={328} height={84} fill="url(#cna-ma)" />
        <rect x={104} y={258} width={152} height={64} rx={8} fill="#0d0609" stroke={OURO} strokeWidth={3.5} />
        <path d="M156 304 Q156 278 180 278 Q204 278 204 304 Z" fill="url(#cna-ou)" strokeWidth={2.5} />
        <rect x={150} y={303} width={60} height={7} rx={3.5} fill={OURO_E} strokeWidth={2.5} />
        <circle cx={180} cy={273} r={4.5} fill={OURO} strokeWidth={2} />
    </g>
);

// ═════════════════════════════════════════════════════════════════════════════
// O SAGUÃO — parede bordô, madeira escura, arco com cortinas, chaveiro, relógio,
// lampiões, plantas e o tapete (mesmos elementos do fundo da loja do jogo)
// ═════════════════════════════════════════════════════════════════════════════
const Arco: React.FC = () => (
    <g {...L}>
        <path d="M12 380 V176 A198 164 0 0 1 408 176 V380 Z" fill="#4a2815" />
        <path d="M40 380 V178 A170 138 0 0 1 380 178 V380 Z" fill="#12040a" />
        <ellipse cx={210} cy={300} rx={130} ry={150} fill="url(#cna-lz)" opacity={.2} stroke="none" />
        <path d="M40 380 V178 A170 138 0 0 1 380 178 V380" fill="none" stroke={OURO} strokeWidth={4.5} />
        <circle cx={210} cy={26} r={18} fill={OURO} strokeWidth={4.5} />
        <circle cx={210} cy={26} r={8} fill={OURO_E} stroke="none" />
    </g>
);
const Cortina: React.FC<{ e: boolean }> = ({ e }) => (
    <g transform={e ? undefined : 'translate(420 0) scale(-1 1)'} {...L} strokeWidth={4}>
        <path d="M40 178 A170 138 0 0 1 128 58 Q126 104 100 152 Q76 214 98 290 Q114 340 100 380 H40 Z" fill="url(#cna-cu)" />
        <path d="M68 128 Q58 250 74 378 M92 88 Q86 210 96 378" fill="none" stroke="#3b0712" opacity={.5} strokeWidth={3.5} />
        <path d="M58 290 Q92 274 114 292 Q92 314 58 304 Z" fill={OURO} strokeWidth={3} />
    </g>
);

const Chaveiro: React.FC = () => (
    <g {...L}>
        <rect x={10} y={10} width={230} height={282} rx={10} fill="#4a2815" />
        <rect x={26} y={26} width={198} height={196} rx={6} fill="#1c0a08" />
        <path d="M26 26 H224 L26 150 Z" fill="#fff" opacity={.06} stroke="none" />
        <rect x={34} y={70} width={182} height={5} rx={2} fill={OURO_E} stroke="none" />
        <rect x={34} y={150} width={182} height={5} rx={2} fill={OURO_E} stroke="none" />
        <rect x={10} y={226} width={230} height={66} rx={6} fill="url(#cna-ma)" />
        <rect x={26} y={236} width={92} height={22} rx={3} fill="#2b150c" strokeWidth={3.5} />
        <rect x={132} y={236} width={92} height={22} rx={3} fill="#2b150c" strokeWidth={3.5} />
        <circle cx={72} cy={247} r={3.5} fill={OURO} stroke="none" />
        <circle cx={178} cy={247} r={3.5} fill={OURO} stroke="none" />
    </g>
);
const Chaves: React.FC<{ y: number }> = ({ y }) => (
    <g stroke="none">
        {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} transform={`translate(${56 + i * 34} ${y + 6})`}>
                <circle cy={13} r={8} fill="none" stroke={OURO} strokeWidth={4} />
                <rect x={-2.5} y={20} width={5} height={36} fill={OURO} />
                <rect x={2} y={42} width={9} height={5} fill={OURO} />
                <rect x={2} y={50} width={6} height={5} fill={OURO} />
            </g>
        ))}
    </g>
);

const Estante: React.FC = () => (
    <g {...L}>
        <rect x={6} y={36} width={268} height={354} rx={8} fill="#4a2815" />
        <rect x={20} y={50} width={240} height={246} fill="#1d0b09" />
        <rect x={6} y={168} width={268} height={10} fill="url(#cna-ma)" />
        <rect x={6} y={284} width={268} height={10} fill="url(#cna-ma)" />
        <rect x={20} y={300} width={240} height={86} fill="#2b150c" strokeWidth={4} />
        <rect x={28} y={310} width={108} height={66} rx={3} fill="#3d2010" strokeWidth={3.5} />
        <rect x={144} y={310} width={108} height={66} rx={3} fill="#3d2010" strokeWidth={3.5} />
        {/* o relógio de mesa */}
        <rect x={98} y={150} width={84} height={18} rx={5} fill="url(#cna-ma)" />
        <circle cx={140} cy={96} r={52} fill={OURO} strokeWidth={5} />
        <circle cx={140} cy={96} r={43} fill="#f3e6c2" strokeWidth={3.5} />
        <circle cx={140} cy={40} r={9} fill={OURO} strokeWidth={4} />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d="M140 57 v7" stroke={K} strokeWidth={i % 3 ? 2.5 : 4} transform={`rotate(${i * 30} 140 96)`} />)}
        {/* os livros */}
        {[['#a3202b', 34, 64], ['#2b4a8a', 50, 54], ['#2f7a4d', 64, 70], ['#d79a2c', 80, 58], ['#7a2c6a', 96, 66], ['#a3202b', 112, 52], ['#3c3c48', 126, 62]].map(([c, x, h], i) => (
            <rect key={i} x={x as number} y={168 - (h as number)} width={14} height={h as number} rx={2} fill={c as string} strokeWidth={3.5} />
        ))}
        {/* caixas e mala */}
        <rect x={40} y={226} width={86} height={58} rx={4} fill="#c9a06a" strokeWidth={4} />
        <path d="M40 252 h86 M83 226 v58" stroke={K} strokeWidth={3.5} fill="none" />
        <rect x={142} y={236} width={96} height={48} rx={8} fill="#7a4424" strokeWidth={4} />
        <rect x={180} y={230} width={22} height={10} rx={3} fill="none" strokeWidth={3.5} />
        <circle cx={190} cy={262} r={4} fill={OURO} stroke="none" />
    </g>
);
const Ponteiro: React.FC<{ len: number; w: number }> = ({ len, w }) => (
    <path d={`M140 96 V${96 - len}`} stroke={K} strokeWidth={w} strokeLinecap="round" />
);

const QuadroMapa: React.FC = () => (
    <g {...L}>
        <rect x={6} y={6} width={108} height={158} rx={5} fill="url(#cna-ou)" />
        <rect x={20} y={20} width={80} height={130} fill="#e9dcc0" strokeWidth={3.5} />
        <path d="M32 40 H88 V70 H32 Z M32 82 H60 V136 H32 Z M70 82 H88 V136 H70 Z" fill="none" stroke="#6b5a3a" strokeWidth={2.5} />
    </g>
);
const QuadroCastelo: React.FC = () => (
    <g {...L}>
        <rect x={6} y={6} width={138} height={158} rx={5} fill="url(#cna-ou)" />
        <rect x={20} y={20} width={110} height={130} fill="#3a2a18" strokeWidth={3.5} />
        <rect x={20} y={20} width={110} height={60} fill="#b87a2a" opacity={.55} stroke="none" />
        <path d="M20 150 L52 92 L70 118 L96 76 L130 150 Z" fill="#241a12" stroke="none" />
        <path d="M86 112 V90 h6 v5 h6 v-5 h6 v5 h6 v-5 h6 V112 Z M96 90 V74 h5 v6 h5 v-6 h5 V90 Z" fill="#100a08" stroke="none" />
    </g>
);

const Lampiao: React.FC = () => (
    <g {...L} strokeWidth={4}>
        <path d="M35 122 V86 Q35 70 48 66" fill="none" stroke={OURO_E} strokeWidth={5} />
        <path d="M18 70 H52 L46 30 H24 Z" fill="#ffd98a" />
        <rect x={15} y={66} width={40} height={8} rx={3} fill={OURO} />
        <rect x={22} y={24} width={26} height={8} rx={3} fill={OURO} />
    </g>
);
const Planta: React.FC = () => (
    <g {...L}>
        {[[-46, '#1f6b3a'], [-24, '#2e8b4d'], [0, '#1f6b3a'], [24, '#2e8b4d'], [46, '#1f6b3a']].map(([r, c], i) => (
            <path key={i} d="M75 150 Q44 100 75 18 Q106 100 75 150 Z" fill={c as string} transform={`rotate(${r} 75 150)`} strokeWidth={4.5} />
        ))}
        <path d="M46 150 H104 L96 204 H54 Z" fill="#a8391f" strokeWidth={5} />
        <rect x={42} y={144} width={66} height={14} rx={5} fill="#c4492a" strokeWidth={5} />
    </g>
);
const Tapete: React.FC = () => (
    <g {...L} strokeWidth={5}>
        <path d="M170 6 H1070 L1234 244 H6 Z" fill="#7a1322" />
        <path d="M204 30 H1036 L1170 222 H70 Z" fill="none" stroke={OURO} strokeWidth={6} />
        <path d="M232 46 H1008 L1128 210 H112 Z" fill="#8c1a2a" stroke="none" />
        <path d="M620 70 L760 128 L620 190 L480 128 Z" fill="none" stroke={OURO_E} strokeWidth={4} opacity={.8} />
    </g>
);

// ── EFEITOS ───────────────────────────────────────────────────────────────────
/** Balão de golpe: estrela amarela com a onomatopeia. (cx, cy) na caixa do ator. */
const Golpe: React.FC<{ c: string; cx: number; cy: number; t: string; r?: number; cor?: string; rot?: number; vb?: string }> =
    ({ c, cx, cy, t, r = 60, cor = '#ffe14a', rot = -8, vb = VR }) => (
        <Pt c={c} vb={vb}>
            <g transform={`translate(${cx} ${cy}) rotate(${rot})`} {...L} strokeWidth={5}>
                <path d={estrela(0, 0, r, 11, .64)} fill={cor} />
                <text y={r * .17} textAnchor="middle" fontFamily={FONTE} fontSize={r * .48} fill="#e63a2e" stroke={K} strokeWidth={5} paintOrder="stroke" strokeLinejoin="round">{t}</text>
            </g>
        </Pt>
    );
/** Estrelinha de tontura (gira em volta da cabeça). */
const Tonta: React.FC<{ c: string }> = ({ c }) => (
    <Pt c={c} vb={VR}><path d={estrela(100, 22, 12, 5, .48)} fill="#ffe14a" stroke={K} strokeWidth={3.5} strokeLinejoin="round" /></Pt>
);
const Poeira: React.FC<{ c: string; cx: number; cy: number }> = ({ c, cx, cy }) => (
    <Pt c={c} vb={VR}>
        <g fill="#eadfc8" stroke={K} strokeWidth={4} opacity={.95}>
            <circle cx={cx - 34} cy={cy} r={20} /><circle cx={cx + 30} cy={cy + 2} r={22} /><circle cx={cx} cy={cy - 12} r={26} />
        </g>
    </Pt>
);
const Risco: React.FC<{ c: string; d: string }> = ({ c, d }) => (
    <Pt c={c} vb={VR}><path d={d} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" opacity={.9} /></Pt>
);

// ═════════════════════════════════════════════════════════════════════════════
// A CENA (estática: o React monta uma vez; quem anima é o CSS)
// ═════════════════════════════════════════════════════════════════════════════
const Robo: React.FC<{ id: string; p: Pal; k: 0 | 1 | 2; al: Arma; ar: Arma; ex: Exp[]; ban?: boolean; fx?: React.ReactNode }> =
    ({ id, p, k, al, ar, ex, ban, fx }) => (
        <div className={`e ${id}`}>
            <Pt c={`${id}s`} vb={VR}><ellipse cx={100} cy={248} rx={64} ry={11} fill="#000" fillOpacity={.42} /></Pt>
            <Pt c={`${id}c`}>
                <Pt c={`${id}b`}>
                    <Pt c={`${id}l`} vb={VR}><Perna p={p} x={78} gr={k === 2} /></Pt>
                    <Pt c={`${id}r`} vb={VR}><Perna p={p} x={122} gr={k === 2} /></Pt>
                    <Pt vb={VR}><Tronco p={p} k={k} /></Pt>
                    <Pt c={`${id}e`} vb={VR}><Braco p={p} x={40} arma={al} gr={k === 2} /></Pt>
                    <Pt c={`${id}d`} vb={VR}><Braco p={p} x={160} arma={ar} gr={k === 2} ban={ban} /></Pt>
                    <Pt c={`${id}h`} vb={VR}><Cabeca p={p} k={k} x={id} ex={ex} /></Pt>
                    {fx}
                </Pt>
            </Pt>
        </div>
    );

/** Peça do cenário: uma caixa posicionada pela tabela de layout + sua arte. */
const D: React.FC<{ id: string; vb: string; c?: string; par?: string; children?: React.ReactNode; kids?: React.ReactNode }> =
    ({ id, vb, c, par, children, kids }) => <div className={`e ${id}`}><Pt c={c} vb={vb} par={par}>{children}</Pt>{kids}</div>;

/** Quando cada rosto extra aparece [de, até] (s). O resto do tempo vale a cara padrão. */
const FACES: Record<string, Partial<Record<Exp, [number, number][]>>> = {
    a: { b: [[1.55, 1.95], [2.1, 2.45], [5.35, 6.75], [6.95, 7.45]], f: [[7.5, 9.3]], p: [[.85, .93], [2.85, 2.93], [3.8, 4.9], [9.72, 9.8]], s: [[1.3, 1.5]] },
    g: { x: [[2.17, 2.45], [7.3, 7.95]], e: [[2.45, 3.45], [4.35, 5.35], [5.65, 7.25], [9.25, 9.75]], b: [[1.4, 1.6], [3.55, 3.9]], s: [[3.9, 4.3]], p: [[1, 1.08], [8.9, 8.98]] },
    m: { f: [[2.1, 3], [3.45, 3.85], [4.6, 5.5], [5.65, 6.7], [7.6, 9.3]], b: [[3.1, 3.4]], s: [[3.9, 4.55], [7.25, 7.55]], p: [[.95, 1.03], [5.3, 5.38]] },
};
const EXP = Object.fromEntries(Object.entries(FACES).map(([k, v]) => [k, Object.keys(v) as Exp[]])) as Record<string, Exp[]>;

const Cena = memo(function Cena() {
    return (
        <>
            <Defs />
            <div className="pa" /><div className="ch" /><div className="lb" />
            <div className="pal"><div className="sh">
                {['pl1', 'pl2', 'pl3', 'pl4'].map((c) => <div key={c} className={`e pil ${c}`} />)}
                <D id="arco" vb="0 0 420 380" kids={<><Pt c="cE" vb="0 0 420 380"><Cortina e /></Pt><Pt c="cD" vb="0 0 420 380"><Cortina e={false} /></Pt></>}><Arco /></D>
                <D id="chav" vb="0 0 250 300" kids={<><Pt c="k1" vb="0 0 250 300"><Chaves y={70} /></Pt><Pt c="k2" vb="0 0 250 300"><Chaves y={150} /></Pt></>}><Chaveiro /></D>
                <D id="est" vb="0 0 280 400" kids={<><Pt c="rh" vb="0 0 280 400"><Ponteiro len={24} w={6} /></Pt><Pt c="rm" vb="0 0 280 400"><Ponteiro len={36} w={4.5} /></Pt></>}><Estante /></D>
                <D id="qm" vb="0 0 120 170"><QuadroMapa /></D>
                <D id="qc" vb="0 0 150 170"><QuadroCastelo /></D>
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`e la${i}`}>
                        <Pt c={`lg${i % 2}`} vb="0 0 70 130"><circle cx={35} cy={56} r={96} fill="url(#cna-lz)" opacity={.5} /></Pt>
                        <Pt vb="0 0 70 130"><Lampiao /></Pt>
                    </div>
                ))}
                <D id="tap" vb="0 0 1240 250" par="none"><Tapete /></D>
                <D id="pe" vb="0 0 150 210" c="pa1"><Planta /></D>
                <D id="pd" vb="0 0 150 210" c="pa2"><Planta /></D>
                {[1, 2, 3, 4, 5].map((i) => <div key={i} className={`mo mo${i}`} />)}

                {/* TROCO-64: torce da lateral, com a bandeira do irmão; arremessa a casca de banana */}
                <Robo id="m" p={P64} k={0} al="f" ar="n" ban ex={EXP.m} />
                <div className="e m2"><Pt c="mx" vb={VR}><g transform="translate(237 136)"><Banana /></g></Pt></div>
                {/* o atendente do lobby */}
                <div className="e t">
                    <Pt c="ak" vb={VA}><AtdCorpo /></Pt>
                    <Pt c="ah" vb={VA}><AtdCabeca /></Pt>
                    <Pt vb={VA}><AtdBalcao /></Pt>
                    <Pt c="as" vb={VA}><AtdSino /></Pt>
                    <Pt c="aa" vb={VA}><AtdBraco /></Pt>
                    <Pt c="an1" vb={VA}><circle cx={288} cy={178} r={34} fill="none" stroke={OURO} strokeWidth={7} /></Pt>
                    <Pt c="an2" vb={VA}><circle cx={288} cy={178} r={34} fill="none" stroke="#fff3b0" strokeWidth={5} /></Pt>
                    <Golpe c="wd" cx={300} cy={96} t="DING!" r={44} rot={6} vb={VA} />
                </div>
                {/* o robô-segurança do saguão (inimigo do 63) */}
                <Robo id="g" p={PSG} k={2} al="b" ar="n" ex={EXP.g}
                    fx={<Pt c="zw"><Tonta c="z0" /><Tonta c="z1" /><Tonta c="z2" /></Pt>} />
                {/* TROCO-63: o irmão mais velho e mal-humorado, de chave inglesa */}
                <Robo id="a" p={P63} k={1} al="n" ar="c" ex={EXP.a} />
                {/* efeitos por cima dos dois lutadores */}
                <div className="e g2">
                    <Golpe c="w1" cx={56} cy={56} t="CLANG!" r={64} />
                    <Golpe c="w2" cx={66} cy={200} t="BAM!" r={56} rot={10} cor="#ffb347" />
                    <Golpe c="w3" cx={62} cy={70} t="POW!" r={54} rot={-14} />
                    <Golpe c="w4" cx={88} cy={44} t="BONK!" r={54} rot={10} cor="#9af6ff" />
                    <Golpe c="w5" cx={106} cy={84} t="ZAP!" r={52} rot={-6} />
                    <Golpe c="w6" cx={116} cy={58} t="BAM!" r={56} rot={14} cor="#ffb347" />
                    <Golpe c="w7" cx={70} cy={96} t="WHAM!!" r={86} rot={-10} cor="#fff3b0" />
                    <Golpe c="w8" cx={100} cy={196} t="THUD!" r={54} rot={-6} cor="#ffb347" />
                    <Poeira c="pf1" cx={70} cy={236} /><Poeira c="pf2" cx={100} cy={240} />
                    <Risco c="sw1" d="M30 36 Q-30 100 10 190" />
                </div>
                <div className="e a2"><Risco c="sw2" d="M178 14 Q248 70 214 168" /></div>
            </div><div className="fl" /></div>
            <div className="vg" />
        </>
    );
});

// ═════════════════════════════════════════════════════════════════════════════
// LAYOUT — [esquerda, base, largura, altura?] em "unidades do palco".
// Paisagem: palco 1600×760. Retrato: 780×1600. Sem entrada = não aparece.
// ═════════════════════════════════════════════════════════════════════════════
type Pos = [number, number, number, number?];
const LAY: Record<string, { a?: number; L?: Pos; P?: Pos; ali?: string }> = {
    pl1: { L: [258, 430, 50, 392] }, pl2: { L: [536, 430, 54, 392] }, pl3: { L: [1010, 430, 54, 392] }, pl4: { L: [1292, 430, 50, 392] },
    arco: { a: .9048, L: [600, 430, 400], P: [170, 700, 440] },
    chav: { a: 1.2, L: [322, 430, 200], P: [14, 700, 176] },
    est: { a: 1.4286, L: [1068, 430, 214], P: [566, 700, 206] },
    qm: { a: 1.4167, L: [96, 330, 112], P: [40, 280, 110] },
    qc: { a: 1.1333, L: [1398, 330, 124], P: [640, 280, 120] },
    la1: { a: 1.857, L: [543, 322, 40], P: [122, 440, 44] }, la2: { a: 1.857, L: [1017, 322, 40], P: [614, 440, 44] },
    la3: { a: 1.857, L: [263, 322, 40] }, la4: { a: 1.857, L: [1297, 322, 40] },
    tap: { L: [190, 694, 1220, 200], P: [24, 1452, 732, 420] },
    pe: { a: 1.4, L: [22, 520, 120] }, pd: { a: 1.4, L: [1458, 520, 120] },
    m: { a: 1.3, L: [118, 656, 236], P: [56, 946, 210], ali: 'm2' },
    t: { a: .9167, L: [1170, 664, 320], P: [440, 962, 290] },
    g: { a: 1.3, L: [836, 672, 300], P: [420, 1400, 300], ali: 'g2' },
    a: { a: 1.3, L: [476, 672, 300], P: [60, 1400, 300], ali: 'a2' },
};
const dim = ([l, b, w, h]: Pos, a = 1) => { const H = h ?? w * a; return `--l:${l};--t:${+(b - H).toFixed(1)};--w:${w};--h:${+H.toFixed(1)}`; };

// ═════════════════════════════════════════════════════════════════════════════
// O CSS: base + layout + a coreografia inteira (todas as rodadas de T segundos)
// ═════════════════════════════════════════════════════════════════════════════
/** Pivôs (em % da caixa do robô 200×260) */
const PV = { c: '50% 94%', h: '50% 38%', e: '20% 48%', d: '80% 48%', l: '39% 73%', r: '61% 73%' };
/** n+2 quadros alternando ±a° entre t0 e t1 (passos). */
const pas = (t0: number, t1: number, n: number, a = 22): [number, number, E?][] =>
    Array.from({ length: n + 2 }, (_, i) => [t0 + (t1 - t0) * i / (n + 1), i === 0 || i === n + 1 ? 0 : i % 2 ? a : -a, 'i'] as [number, number, E]);
/** ondinha de aplauso em volta de c°, de t0 a t1. */
const onda = (t0: number, t1: number, c: number, a: number): [number, number, E?][] =>
    osc(t0, t1, Math.round((t1 - t0) / .25), (i) => i % 2 ? c - a : c + a);
/** Um tremor de câmera (em % do palco) a partir de t. */
const trem = (t: number, a: number): Mv[] => [[t - .01, 0, 0, 0, 1, 1, 'l'], [t, a * .7, -a * .6, 0, 1, 1, 'l'], [t + .05, -a * .5, a * .4, 0, 1, 1, 'l'], [t + .1, a * .3, -a * .2, 0, 1, 1, 'l'], [t + .17, 0, 0, 0, 1, 1, 'l']];
/** Pulsos de opacidade: sobe a `v` em cada t de `ts` e desce em `d` segundos (sempre segurando em 0 antes). */
const ev = (ts: number[], v: number, d: number, up = 0): Q<number>[] => [[0, 0, 'l'], ...ts.flatMap((t): Q<number>[] => [[Math.max(0, t - .001), 0, 'l'], [t + up, v, 'l'], [t + up + d, 0, 'l']])];
/** Balão de golpe: estoura (pop) em cada instante de `ts` e some. */
function pop(cls: string, o: string, ts: number[], hold = .5, sc = 1) {
    const m: Q<string>[] = [], p: Q<number>[] = [[0, 0, 'l']];
    for (const t of ts) {
        const t0 = Math.max(0, t - .001);
        m.push([t0, tr(0, 0, 0, .15), 'p'], [t + .14, tr(0, 0, 0, 1.12 * sc), 'i'], [t + .26, tr(0, 0, 0, sc)], [t + hold, tr(0, 0, 0, sc), 'i'], [t + hold + .14, tr(0, 0, 0, .5 * sc)]);
        p.push([t0, 0, 'l'], [t, 1, 'l'], [t + hold, 1, 'l'], [t + hold + .14, 0, 'l']);
    }
    anim(cls, { o, m, p });
}
const oVR = (cx: number, cy: number) => `${cx / 2}% ${cy / 2.6}%`;

function coreografia() {
    // ── TROCO-63 (a): o irmão mal-humorado de chave inglesa ──────────────────────
    const A: Mv[] = [
        [0, 0, 0, 0, 1, 1, 'l'], [.1, 0, 0, 0, 1.07, .92, 'o'], [.3, 0, -5, 0, .98, 1.05, 'a'], [.5, 0, 0, 0, 1.04, .95, 'o'], [.7, 0, 0, 0, 1, 1],
        [1.2, 3, 0, 4, 1.02, .98], [1.4, 3, 0, 0, 1, 1],
        [1.55, 6, 7, 13, 1.15, .78, 'o'], [1.95, 6, 7, 13, 1.15, .78, 'o'],
        [2.02, 9, -24, -7, .9, 1.14, 'o'], [2.12, 22, -36, 5], [2.17, 28, -12, 14, 1.12, .9, 'a'],
        [2.3, 27, -16, 8, 1.02, 1, 'o'], [2.55, 26, 0, 0, 1.12, .88, 'a'], [2.75, 24, 0, 0, 1, 1],
        [3, 24, -4, 0, .98, 1.03, 'o'], [3.2, 24, 0, 0, 1.03, .97, 'a'], [3.5, 22, 0, 0, 1, 1],
        [3.75, 12, 0, -5, .98, 1.02], [4, 10, -3, -6, .97, 1.04], [4.3, 10, 0, 0, 1.02, .98], [4.9, 10, 0, 0, 1, 1],
        [5.2, 12, 0, 3, 1.03, .97, 'o'], [5.35, 34, -6, 8, .96, 1.06, 'a'], [5.6, 36, 0, 6, 1.08, .92, 'o'],
        [5.65, 40, -2, 10, 1.1, .92, 'a'], [5.8, 36, 0, 2, 1, 1, 'o'], [5.95, 41, -2, -10, 1.1, .92, 'a'], [6.1, 37, 0, 0, 1, 1, 'o'],
        [6.25, 42, -2, 12, 1.1, .92, 'a'], [6.4, 37, 0, 0, 1, 1, 'o'], [6.5, 42, -3, -8, 1.1, .92, 'a'], [6.7, 38, 0, 0, 1.03, .97],
        [6.95, 34, 0, -14, 1.1, .9], [7.2, 34, 0, -14, 1.1, .9, 'a'], [7.3, 44, -8, 18, .94, 1.08, 'o'], [7.5, 44, -2, 14, 1, 1],
        [7.7, 40, -6, 0, .98, 1.03, 'o'], [7.9, 40, 0, 0, 1.04, .96, 'a'], [8.1, 40, -6, 0, .98, 1.03, 'o'], [8.3, 40, 0, 0, 1.04, .96, 'a'],
        [8.6, 38, 0, 0, 1, 1], [9.3, 4, -2, 0], [9.6, 0, 0, 0, 1.02, .98], [9.85, 0, 0, 0, 1, 1],
    ];
    anim('ac', { o: PV.c, m: mov(A) });
    anim('as', { m: som(A) });
    anim('ab', { o: PV.c, d: 1, m: mov([[0, 0, 0, 0, 1.03, .97, 'o'], [.5, 0, -2.2, 0, .98, 1.03, 'a']]) });
    anim('ad', { o: PV.d, m: ang([[0, -150], [.3, -140], [.6, -155], [.9, -146], [1.2, -160], [1.45, -148], [1.55, -125, 'o'], [1.95, -125], [2.02, -215, 'o'], [2.12, -228],
        [2.17, -62, 'a'], [2.3, -78, 'o'], [2.55, -105], [2.8, -140], [3.3, -150], [3.75, -165], [4, -190], [4.6, -175], [5.2, -160], [5.35, -205], [5.6, -215],
        [5.65, -68, 'a'], [5.8, -195, 'o'], [5.95, -64, 'a'], [6.1, -195, 'o'], [6.25, -70, 'a'], [6.4, -195, 'o'], [6.5, -60, 'a'], [6.7, -150],
        [6.95, -240], [7.2, -255, 'a'], [7.3, -70, 'a'], [7.5, -110, 'o'], [7.7, -175], [8.3, -165], [8.6, -150], [9.6, -148]]) });
    anim('ae', { o: PV.e, m: ang([[0, 12], [.6, 22], [1.2, 10], [1.6, 50, 'o'], [2, 50], [2.1, 80, 'o'], [2.17, 25, 'a'], [2.6, 30], [3, 75], [3.3, 30], [3.6, 20], [4.2, 8], [5.2, 12],
        [5.35, 70, 'o'], [5.65, 30], [5.95, 70], [6.25, 30], [6.5, 75], [6.8, 30], [7.2, 60], [7.3, 25], [7.6, 170, 'o'], [8.2, 160], [8.6, 120], [9.3, 20], [9.7, 12]]) });
    anim('ah', { o: PV.h, m: mov([[0, 0, 0, 0], [.1, 0, 2, 0], [.3, 0, -1, 0], [.6, 1, 0, 2], [1.2, 2, 0, 4], [1.55, 3, 3, 10, 1, 1, 'o'], [1.95, 3, 3, 10], [2.02, 1, -2, -6],
        [2.17, 4, 2, 8, 1, 1, 'a'], [2.4, 2, 0, 2], [3.3, 1, 0, 0], [3.9, 0, 1, -3], [4.5, 0, 1, -4], [5.3, 2, 0, 5], [5.65, 4, 2, 9, 1, 1, 'a'], [5.8, 2, 0, 2], [5.95, 4, 2, -8, 1, 1, 'a'],
        [6.1, 2, 0, 0], [6.25, 4, 2, 9, 1, 1, 'a'], [6.4, 2, 0, 0], [6.5, 4, 2, -8, 1, 1, 'a'], [6.8, 2, 0, 2], [7.2, 1, 3, -8], [7.3, 5, 0, 12, 1, 1, 'a'], [7.7, 1, -2, -4], [8.4, 0, 0, 3], [9.4, 0, 0, 0]]) });
    anim('al', { o: PV.l, m: ang([[0, 0], ...pas(.7, 1.3, 3, 16), ...pas(3.6, 4.05, 3, -18), ...pas(5.2, 5.6, 3, 24), ...pas(8.6, 9.6, 6, -16)]) });
    anim('ar', { o: PV.r, m: ang([[0, 0], ...pas(.7, 1.3, 3, -16), ...pas(3.6, 4.05, 3, 18), ...pas(5.2, 5.6, 3, -24), ...pas(8.6, 9.6, 6, 16)]) });

    // ── ROBÔ-SEGURANÇA (g): cassetete, sirene e muito azar ──────────────────────
    const G: Mv[] = [
        [0, 0, 0, 0, 1, 1, 'l'], [.1, 0, 0, 0, 1.06, .94, 'o'], [.3, 0, -4, 0, .98, 1.03, 'a'], [.5, 0, 0, 0, 1.03, .97, 'o'], [.7, 0, 0, 0, 1, 1],
        [.9, -5, 0, -3], [1.2, -5, 0, -3], [1.4, 3, 0, 9, 1.04, .96],
        [1.5, -14, -2, -14, .96, 1.05, 'a'], [1.62, -18, 0, -16, 1, 1, 'o'], [1.9, -16, 0, -8], [2.1, -14, 0, -6],
        [2.17, -12, 0, 6, 1.25, .7, 'a'], [2.3, -2, -4, 12, .95, 1.08, 'o'], [2.6, 8, 0, 6, 1.05, .96], [2.8, 12, 0, 0, 1.02, .98],
        [3, 12, 0, 6, 1, 1], [3.2, 12, 0, -6], [3.4, 11, 0, 0], [3.55, 14, 0, 10, 1.05, .95],
        [3.7, -10, -2, -14, .94, 1.05, 'a'], [3.85, -28, -2, -16, .96, 1.04, 'l'], [3.92, -30, -6, -10, 1, 1, 'o'],
        [4, -32, -24, 30, 1, 1, 'o'], [4.13, -27, -50, 150, 1, 1, 'a'], [4.35, -22, 18, 90, 1.1, .9, 'o'], [4.45, -22, 11, 84, 1, 1, 'a'], [4.55, -22, 18, 90, 1.08, .92], [5, -22, 18, 90, 1, 1],
        [5.25, -22, 10, 40], [5.45, -21, 0, -8], [5.6, -20, 0, 0],
        [5.65, -17, 0, 8, 1.2, .78, 'a'], [5.8, -12, 0, 2, 1, 1, 'o'], [5.95, -8, 0, -8, 1.2, .78, 'a'], [6.1, -3, 0, 0, 1, 1, 'o'],
        [6.25, 2, 0, 8, 1.2, .78, 'a'], [6.4, 6, 0, 0, 1, 1, 'o'], [6.5, 10, 0, -8, 1.25, .75, 'a'], [6.7, 14, 0, 6, 1, 1], [6.9, 14, 0, -6], [7.1, 14, 0, 0], [7.22, 14, 0, 0, 1.05, .96],
        [7.3, 16, -6, 12, 1.3, .7, 'a'], [7.42, 60, -60, 180, .9, 1.1, 'o'], [7.7, 150, -170, 540, 1, 1, 'l'], [8, 230, -330, 900], [8.3, 230, -520, 900], [8.65, 0, -290, 0, 1, 1, 'l', 0, -150],
        [8.7, 0, -290, 0, 1, 1, 'a', 0, -150], [9.25, 0, 0, 0, 1.3, .7, 'o'], [9.4, 0, -5, 0, .95, 1.06, 'a'], [9.55, 0, 0, 0, 1.05, .96], [9.8, 0, 0, 0, 1, 1],
    ];
    const gv = jan([[0, 7.95], [8.7, T]]);
    anim('gc', { o: PV.c, m: mov(G), p: gv });
    anim('gs', { m: som(G, .35), p: jan([[0, 7.4], [9.2, T]]) });
    anim('gb', { o: PV.c, d: 1.25, m: mov([[0, 0, 0, 0, 1.04, .96, 'o'], [.6, 0, -1.8, 0, .98, 1.02, 'a']]) });
    anim('ge', { o: PV.e, m: ang([[0, 150], [.4, 142], [.8, 158], [1.2, 178], [1.4, 215, 'o'], [1.5, 38, 'a'], [1.62, 22, 'o'], [1.9, 62], [2.1, 88], [2.17, 150, 'o'], [2.3, 172], [2.6, 125],
        [3, 140], [3.4, 128], [3.55, 185], [3.7, 58, 'a'], [3.85, 48], [3.95, 110], [4, 205, 'o'], [4.12, 235], [4.35, 150], [5, 150], [5.3, 132], [5.65, 168, 'o'], [5.8, 140], [5.95, 170, 'o'],
        [6.1, 140], [6.25, 168, 'o'], [6.4, 140], [6.5, 175, 'o'], [6.7, 150], [7.3, 190, 'o'], [7.42, 250], [8.3, 160], [9.25, 135], [9.6, 150]]) });
    anim('gd', { o: PV.d, m: ang([[0, -10], [.5, -22], [1, -8], [1.4, -40, 'o'], [1.5, -70, 'a'], [1.9, -30], [2.17, -110, 'o'], [2.4, -80], [3, -40], [3.55, -50], [3.7, -100, 'a'], [4, -170, 'o'],
        [4.12, -200], [4.35, -120], [5, -110], [5.4, -40], [5.65, -90, 'o'], [6, -50], [6.3, -90, 'o'], [6.6, -60], [7.3, -120, 'o'], [7.42, -200], [8.3, -150], [9.25, -60, 'a'], [9.6, -15]]) });
    anim('gh', { o: PV.h, m: mov([[0, 0, 0, 0], [.1, 0, 2, 0], [.3, 0, -1, 0], [1.4, 2, 0, 8], [1.5, -3, 1, -10, 1, 1, 'a'], [1.9, -2, 0, -4], [2.17, 3, 3, 12, 1, 1, 'a'], [2.35, 4, 0, 18],
        [2.6, 3, 2, 10], [3, 4, 1, -10], [3.4, 3, 0, 10], [3.7, -2, 1, -8], [4.12, 0, -2, 20], [4.4, 2, 2, -10], [5, 0, 0, 8], [5.65, 4, 3, 14, 1, 1, 'a'], [5.95, 4, 3, -12, 1, 1, 'a'],
        [6.25, 4, 3, 14, 1, 1, 'a'], [6.5, 5, 3, -14, 1, 1, 'a'], [6.9, 3, 1, 8], [7.3, 5, 4, 20], [9.25, 0, 3, 0], [9.5, 0, -1, -6], [9.8, 0, 0, 0]]) });
    anim('gl', { o: PV.l, m: ang([[0, 0], ...pas(.8, 1.3, 3, 14), ...pas(3.55, 3.95, 4, -26), [4.05, 35], [4.3, -25], [5, 0], [7.4, 0], [7.6, 60], [8.3, -40], [9.2, 0]]) });
    anim('gr', { o: PV.r, m: ang([[0, 0], ...pas(.8, 1.3, 3, -14), ...pas(3.55, 3.95, 4, 26), [4.05, -30], [4.3, 25], [5, 0], [7.4, 0], [7.6, -60], [8.3, 40], [9.2, 0]]) });
    // estrelinhas de tontura: órbita achatada em volta da cabeça
    anim('zw', { p: jan([[2.45, 3.45], [4.35, 5.35], [5.65, 7.25], [9.25, 9.75]]) });
    [0, 1, 2].forEach((i) => anim(`z${i}`, { o: '50% 8.5%', d: .9, m: osc(0, .9, 8, (j) => { const a = (Math.PI * 2 * j) / 8 + i * 2.094; return tq(23 * Math.cos(a), 3.9 * Math.sin(a), 0, 1 + .3 * Math.sin(a)); }, 'l') }));

    // ── TROCO-64 (m): a torcida ──────────────────────────────────────────────────
    const M: Mv[] = [
        [0, 0, 0, 0, 1, 1, 'l'], [.1, 0, 0, 0, 1.06, .93, 'o'], [.3, 0, -6, 0, .97, 1.06, 'a'], [.5, 0, 0, 0, 1.04, .95], [.7, 0, 0, 0, 1, 1],
        [2.05, 0, 0, 0, 1.1, .88, 'o'], [2.2, 0, -26, 0, .94, 1.1, 'o'], [2.6, 0, 0, 0, 1.08, .92, 'a'], [2.8, 0, 0, 0, 1, 1],
        [3, -2, 0, -9, 1.02, .98], [3.3, 3, 0, 12, .98, 1.02, 'a'], [3.6, 1, 0, 4, 1, 1], [3.8, 0, 0, 0],
        [3.9, 0, -8, -8, .96, 1.06, 'o'], [4.2, -1, 0, -6, 1.02, .98], [4.6, 0, 0, 0, 1, 1],
        [5.65, 0, 0, 0, 1.05, .95], [5.8, 0, -8, 0, .96, 1.06, 'o'], [6, 0, 0, 0, 1.05, .95, 'a'], [6.2, 0, -8, 0, .96, 1.06, 'o'], [6.4, 0, 0, 0, 1.05, .95, 'a'], [6.6, 0, 0, 0, 1, 1],
        [7.2, 0, 0, 0, 1.1, .88, 'o'],
        ...Array.from({ length: 9 }, (_, i): Mv => {
            const u = i / 8, r = u * 2 * Math.PI;
            return [7.3 + .7 * u, -60 * Math.sin(r), -46.2 * (1 - Math.cos(r)) - 4 * u * (1 - u) * 34, u * 360, 1, 1, 'l'];
        }),
        [8.25, 0, 0, 360, 1.1, .9, 'a'], [8.45, 0, 0, 360, 1, 1], [10, 0, 0, 360, 1, 1],
    ];
    anim('mc', { o: PV.c, m: mov(M) });
    anim('ms', { m: som(M.map((k) => [k[0], k[1], k[2], 0, 1, 1, k[6]] as Mv)) });
    anim('mb', { o: PV.c, d: .5, m: mov([[0, 0, 0, 0, 1.05, .94, 'o'], [.25, 0, -7, 0, .96, 1.07, 'a']]) });
    anim('me', { o: PV.e, d: .5, m: ang([[0, 150], [.25, 205]]) });
    anim('md', { o: PV.d, m: ang([...onda(0, 2.9, -150, 18), [3, -215, 'i'], [3.25, -240, 'o'], [3.32, -70, 'a'], [3.5, -60, 'o'], [3.8, -110], ...onda(4, 8.75, -150, 18), [9, -15],
        [9.3, -110, 'o'], ...onda(9.5, 10, -150, 18)]) });
    anim('mh', { o: PV.h, d: .5, m: mov([[0, 0, 0, -4], [.25, 0, -1, 4]]) });
    anim('ml', { o: PV.l, d: .5, m: ang([[0, 12], [.25, -12]]) });
    anim('mr', { o: PV.r, d: .5, m: ang([[0, -12], [.25, 12]]) });
    anim('bh', { p: jan([[0, 3.33], [9.15, T]]) });
    // a casca de banana: arco até o pé do segurança, depois é chutada para trás
    const DX = 196, DY = 43;
    anim('mx', { o: '118.5% 52.3%', m: [
        ...osc<string>(3.33, 3.83, 10, (i) => { const u = i / 10; return tq(DX * u, DY * u - 62 * 4 * u * (1 - u), 720 * u, 1, 1, -127 * u, 158 * u); }, 'l'),
        [3.95, tq(DX, DY, 720, 1, 1, -127, 158), 'o'],
        ...osc<string>(3.96, 4.6, 8, (i) => { const u = i / 8; return tq(DX - 110 * u, DY - 120 * 4 * u * (1 - u) + 18 * u, 720 - 900 * u, 1, 1, -127, 158); }, 'l'),
    ], p: jan([[3.33, 4.5]], .08) });

    // ── O ATENDENTE ──────────────────────────────────────────────────────────────
    const AB: [number, number, number, E?][] = [[0, -76, 1.25, 'l'], [.14, -76, 1.25, 'o'], [.4, -25, 1, 'i'], [7.35, -25, 1], [7.45, -112, 1.12, 'o'], [7.55, -76, 1.25, 'a'], [7.66, -76, 1.25, 'o'],
        [7.74, -112, 1.12, 'o'], [7.82, -76, 1.25, 'a'], [7.94, -76, 1.25, 'o'], [8.15, -25, 1, 'i'], [9.6, -25, 1], [9.78, -112, 1.12, 'o'], [9.96, -76, 1.25, 'a']];
    anim('aa', { o: '58.9% 49.7%', m: AB.map(([t, a, k, e]) => [t, tr(0, 0, a, 1, k), e] as Q<string>) });
    const sq = (t: number): Mv[] => [[t, 0, 0, 0, 1.12, .88, 'o'], [t + .08, 0, -4, 0, .95, 1.08, 'a'], [t + .22, 0, 0, 0, 1.05, .95, 'o'], [t + .4, 0, 0, 0, 1, 1]];
    anim('as', { o: '80% 68%', m: mov([...sq(0), [7.5, 0, 0, 0, 1, 1], ...sq(7.55), ...sq(7.82), [8.4, 0, 0, 0, 1, 1]].sort((p, q) => p[0] - q[0])) });
    const ring = (cls: string, dl: number) => {
        const ts = [0, 7.55, 7.82].map((t) => t + dl), m: Q<string>[] = [];
        ts.forEach((t) => m.push([t, tr(0, 0, 0, .35), 'o'], [t + .55, tr(0, 0, 0, 2.3)], [t + .56, tr(0, 0, 0, .35)]));
        anim(cls, { o: '80% 54%', m, p: ev(ts, .95, .55) });
    };
    ring('an1', 0); ring('an2', .09);
    pop('wd', '83% 29%', [0, 7.55], .55);
    anim('ak', { o: '42% 70%', m: mov([[0, 0, 0], [.05, 0, -1, 0, .99, 1.02], [.25, 0, 0], [2.15, 0, 0], [2.22, 0, -3, 0, .97, 1.05, 'o'], [2.5, 0, 0, 0, 1.02, .98, 'a'], [2.7, 0, 0, 0, 1, 1],
        [4.3, 0, 0], [4.4, 0, -3, 0, .97, 1.05, 'o'], [4.7, 0, 0, 0, 1.02, .98, 'a'], [4.9, 0, 0, 0, 1, 1], [7.3, 0, 0], [7.38, 0, -4, 0, .96, 1.06, 'o'], [7.7, 0, 0, 0, 1.02, .98, 'a'], [7.9, 0, 0, 0, 1, 1],
        [9.25, 0, 0], [9.32, 0, -4, 0, .96, 1.06, 'o'], [9.6, 0, 0, 0, 1.02, .98, 'a'], [9.8, 0, 0, 0, 1, 1]]) });
    anim('ah', { o: '42% 45%', m: mov([[0, 0, 2, -3], [.2, 0, 0, 0], [.7, -1, 0, -3], [1.3, 1, 0, 3], [1.6, 1.5, -1, 4], [2, -.5, 0, -4], [2.17, 0, -3, 0, 1, 1, 'o'], [2.5, -1, 0, -4], [3, 0, 0, 0],
        [3.4, 1, 0, 3], [3.85, 1, 0, 4], [4.3, 0, -3, 0, 1, 1, 'o'], [4.7, 0, 0, 0], [5.6, -1, 0, -4], [6, 1, 0, 4], [6.4, -1, 0, -4], [6.9, 1, 0, 3], [7.3, 0, -4, 0, 1, 1, 'o'], [7.6, -1, 0, -3],
        [8.3, 0, 1, -5], [8.5, 0, -1, -8, 1, 1, 'o'], [9.1, 0, -1, -8], [9.3, 0, -4, 0, 1, 1, 'o'], [9.6, 0, 0, 2], [9.85, 0, 0, -3]]) });
    anim('apb', { p: jan([[.9, .98], [3, 3.08], [5.4, 5.48], [8, 8.08]]) });
    anim('aps', { p: jan([[2.17, 2.75], [4.3, 4.75], [7.3, 7.7], [9.25, 9.7]]) });
    anim('apy', { p: jan([[8.45, 9.15]]) });

    // ── CARAS extras de cada robô ────────────────────────────────────────────────
    for (const [id, f] of Object.entries(FACES)) for (const [t, w] of Object.entries(f)) anim(`${id}f${t}`, { p: jan(w) });

    // ── BALÕES, POEIRA E RISCOS ──────────────────────────────────────────────────
    pop('w1', oVR(56, 56), [2.17], .55); pop('w2', oVR(66, 200), [4.35], .5); pop('w3', oVR(62, 70), [5.65], .32); pop('w4', oVR(88, 44), [5.95], .32);
    pop('w5', oVR(106, 84), [6.25], .32); pop('w6', oVR(116, 58), [6.5], .36); pop('w7', oVR(70, 96), [7.3], .7); pop('w8', oVR(100, 196), [9.25], .5);
    const pf = (cls: string, t: number) => anim(cls, { o: '50% 91%', m: [[0, tr(0, 0, 0, .3), 'l'], [t, tr(0, 0, 0, .3), 'o'], [t + .5, tr(0, 0, 0, 1.5)]], p: ev([t], .95, .5) });
    pf('pf1', 4.35); pf('pf2', 9.25);
    const sw = (cls: string, t: number) => anim(cls, { p: ev([t], 1, .14) });
    sw('sw1', 1.52); sw('sw2', 2.12);
    // ── A CÂMERA, O CLARÃO E O CENÁRIO VIVO ─────────────────────────────────────
    anim('sh', { m: mov([[0, 0, 0], ...trem(2.17, .6), ...trem(4.35, .4), ...trem(5.65, .25), ...trem(5.95, .25), ...trem(6.25, .25), ...trem(6.5, .3), ...trem(7.3, 1.1), ...trem(9.25, .7)]) });
    anim('fl', { p: [[0, 0, 'l'], [2.17, 0, 'l'], [2.19, .22, 'l'], [2.36, 0], [7.3, 0, 'l'], [7.32, .5, 'l'], [7.65, 0], [9.25, 0, 'l'], [9.27, .16, 'l'], [9.45, 0]] });
    anim('lg0', { d: 1.7, p: [[0, .85], [.3, 1], [.55, .76], [.9, .96], [1.3, .82]] });
    anim('lg1', { d: 2.3, p: [[0, 1], [.4, .8], [.8, .95], [1.4, .74], [1.9, .92]] });
    anim('rm', { o: '50% 24%', m: ang([[0, 0, 'l'], [T, 720, 'l']]) });
    anim('rh', { o: '50% 24%', m: ang([[0, 0, 'l'], [T, 60, 'l']]) });
    anim('k1', { o: '50% 16%', d: 3.3, m: ang([[0, -1.6], [1.65, 1.8]]) });
    anim('k2', { o: '50% 40%', d: 4.1, m: ang([[0, 1.6], [2.05, -1.8]]) });
    anim('cE', { o: '20% 8%', d: 5, m: ang([[0, 0], [2.5, 1.1]]) });
    anim('cD', { o: '80% 8%', d: 6, m: ang([[0, 0], [3, -1.1]]) });
    anim('pa1', { o: '50% 95%', d: 4, m: ang([[0, -2], [2, 2]]) });
    anim('pa2', { o: '50% 95%', d: 5, m: ang([[0, 2], [2.5, -2]]) });
    [1, 2, 3, 4, 5].forEach((i) => { const d = 6 + i * 1.3; anim(`mo${i}`, { d, m: mov([[0, 0, 0], [d, i % 2 ? 500 : -500, -1700]]), p: [[0, 0, 'l'], [1, .8, 'l'], [d - 1.2, .8, 'l'], [d, 0]] }); });
}

function montarCss(): string {
    regras.length = 0;
    coreografia();
    const lay = Object.entries(LAY).map(([id, v]) => {
        const sel = `.cna .${id}${v.ali ? `,.cna .${v.ali}` : ''}`;
        return [v.L ? `${sel}{display:block;${dim(v.L, v.a)}}` : `${sel}{display:none}`, v.P ? `${sel}{display:block;${dim(v.P, v.a)}}` : `${sel}{display:none}`];
    });
    const U = (n: number) => `calc(${n}*var(--u))`;
    return `
.cna{--W:1600;--H:760;--hz:430;--kq:0;--off:0s;--u:min(calc(100vw/var(--W)),calc(100vh/var(--H)));position:fixed;inset:0;overflow:hidden;background:#3a0c16;container-type:size;opacity:1;
transition:opacity .4s ease;-webkit-user-select:none;user-select:none;touch-action:none;font-family:${FONTE};-webkit-tap-highlight-color:transparent}
@supports(width:1cqw){.cna{--u:min(calc(100cqw/var(--W)),calc(100cqh/var(--H)))}}
@media(orientation:portrait){.cna{--W:780;--H:1600;--hz:700;--kq:1}}
.cna.cs{opacity:0;pointer-events:none}.cna.cg *{animation-play-state:paused!important}
.cna *{box-sizing:border-box}
.cna .pa{position:absolute;left:0;right:0;top:0;height:calc(var(--hz)*var(--u));background:linear-gradient(#2a120b ${U(24)},#c58a2a ${U(24)},#c58a2a ${U(28)},transparent ${U(28)}),repeating-linear-gradient(90deg,rgba(0,0,0,.13) 0 ${U(3)},transparent ${U(3)} ${U(42)}),linear-gradient(#64162a,#430f1b)}
.cna .ch{position:absolute;left:0;right:0;bottom:0;top:calc(var(--hz)*var(--u));background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 ${U(3)},transparent ${U(3)} ${U(46)}),linear-gradient(#3a1b10,#1c0a07)}
.cna .lb{position:absolute;left:0;right:0;top:calc((var(--hz) - 84)*var(--u));height:${U(84)};background:linear-gradient(#422113,#2a1309);border-top:${U(4)} solid #c58a2a;border-bottom:${U(5)} solid #140804}
.cna .pal{position:absolute;top:0;left:50%;width:${U(1)};height:${U(1)};width:calc(var(--W)*var(--u));height:calc(var(--H)*var(--u));margin-left:calc(var(--W)*var(--u)/-2)}
.cna .sh{position:absolute;inset:0}
.cna .e{position:absolute;display:none;left:calc(var(--l)*var(--u));top:calc(var(--t)*var(--u));width:calc(var(--w)*var(--u));height:calc(var(--h)*var(--u))}
.cna .p{position:absolute;inset:0}.cna .p svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.cna .pil{background:linear-gradient(90deg,#26130a,#6b3a1d 38%,#3a1e10 72%,#1f0f08);box-shadow:inset 0 0 0 ${U(3)} #140804}
.cna .pil::before{content:"";position:absolute;left:-14%;right:-14%;top:0;height:${U(18)};background:linear-gradient(#ffe59a,#b9791a);border:${U(3)} solid #1a1220;border-radius:3px}
.cna .mo{position:absolute;width:${U(9)};height:${U(9)};border-radius:50%;background:radial-gradient(#ffe2a0,rgba(255,226,160,0) 70%);opacity:0}
.cna .mo1{left:14%;top:60%}.cna .mo2{left:30%;top:72%}.cna .mo3{left:52%;top:64%}.cna .mo4{left:70%;top:76%}.cna .mo5{left:86%;top:66%}
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
.cna .bar{position:relative;width:min(78cqw,30rem);height:clamp(10px,2.4cqmin,18px);border-radius:99px;background:#1a0a10;border:3px solid #f2b53c;overflow:hidden;box-shadow:0 3px 0 #7a3b00,0 0 18px rgba(242,181,60,.28)}
.cna .fi{position:absolute;inset:0;border-radius:99px;transform-origin:left center;background:repeating-linear-gradient(-45deg,rgba(255,255,255,.32) 0 8px,transparent 8px 16px),linear-gradient(#ffe08a,#f2a11c);transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.cna .ind{right:auto;width:40%;animation:cn-ind 1.5s cubic-bezier(.45,0,.55,1) infinite}@keyframes cn-ind{from{transform:translateX(-105%)}to{transform:translateX(255%)}}
@media(prefers-reduced-motion:reduce){.cna .sh *,.cna .sh{animation:none!important}}
${lay.map((l) => l[0]).join('\n')}
@media(orientation:portrait){${lay.map((l) => l[1]).join('\n')}}
${regras.join('\n')}`;
}
const CSS = montarCss();

// ═════════════════════════════════════════════════════════════════════════════
// O COMPONENTE
// ═════════════════════════════════════════════════════════════════════════════
export const CarregandoAnimado: React.FC<CarregandoAnimadoProps> = ({ progresso, rotulo = 'Carregando…', visivel = true, atrasoMs = 0, zIndex = 9999, congelar }) => {
    const [fase, setFase] = useState<'off' | 'on' | 'sai'>(visivel && !atrasoMs ? 'on' : 'off');
    useEffect(() => {
        let id: number;
        if (visivel) id = window.setTimeout(() => setFase('on'), atrasoMs);
        else { setFase((f) => (f === 'on' ? 'sai' : 'off')); id = window.setTimeout(() => setFase('off'), 450); }
        return () => window.clearTimeout(id);
    }, [visivel, atrasoMs]);
    // a fase do relógio de parede: duas telas montadas em momentos diferentes mostram a cena no mesmo ponto
    const off = useMemo(() => -(congelar ?? (Date.now() / 1000) % T), [congelar]);
    if (fase === 'off') return null;
    const m = /^(.*?)(\.{3}|…)?$/s.exec(rotulo) ?? [rotulo, rotulo];
    const p = progresso === undefined ? undefined : Math.max(0, Math.min(1, progresso));
    return (
        <div className={`cna${fase === 'sai' ? ' cs' : ''}${congelar !== undefined ? ' cg' : ''}`} role="status" aria-live="polite" aria-label={rotulo}
            style={{ zIndex, '--off': `${off.toFixed(3)}s` } as React.CSSProperties}>
            <style>{CSS}</style>
            <Cena />
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
