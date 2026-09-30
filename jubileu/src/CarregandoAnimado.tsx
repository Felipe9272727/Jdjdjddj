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
import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
    const f = q.slice();
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
    /** evento: começa em `--te` segundos da rodada */
    ev?: boolean;
}
function anim(cls: string, a: AnimO): void {
    const d = a.d ?? T, n: string[] = [];
    if (a.m) { regras.push(`@keyframes m-${cls}{${quadros(a.m, d, 'transform')}}`); n.push(`m-${cls} ${d}s linear infinite`); }
    if (a.p) { regras.push(`@keyframes o-${cls}{${quadros(a.p, d, 'opacity')}}`); n.push(`o-${cls} ${d}s linear infinite`); }
    regras.push(`.cna .${cls}{${a.o ? `transform-origin:${a.o};` : ''}animation:${n.join(',')};animation-fill-mode:both;animation-delay:${a.ev ? 'calc(var(--off) + var(--te))' : 'var(--off)'}}`);
}

/** translate(%) rotate(°) scale — sempre as mesmas 3 funções, para interpolar. */
const tr = (x = 0, y = 0, r = 0, sx = 1, sy = sx) => `translate(${x}%,${y}%) rotate(${r}deg) scale(${sx},${sy})`;
/** x = % da caixa do ator; xq = deslocamento extra só em retrato (--kq = 1). */
const tq = (x = 0, y = 0, r = 0, sx = 1, sy = sx, xq = 0) =>
    `translate(calc(${x}% + ${xq}% * var(--kq)),${y}%) rotate(${r}deg) scale(${sx},${sy})`;

/** Um passo de coreografia: [s, x, y, rot, sx, sy, suavização, xq]. */
type Mv = [number, number, number, number?, number?, number?, E?, number?];
const mov = (l: Mv[]): Q<string>[] => l.map(([t, x, y, r = 0, sx = 1, sy = sx, e, xq = 0]) => [t, tq(x, y, r, sx, sy, xq), e]);
/** A sombra acompanha o x e encolhe quando o ator sobe. */
const som = (l: Mv[], larga = 0): Q<string>[] => l.map(([t, x, , r = 0, , , e, xq = 0]) => {
    const s = 1 + larga * Math.abs(Math.sin(r * Math.PI / 180));
    return [t, tq(x, 0, 0, s, s, xq), e] as Q<string>;
});
/** Ângulos de um braço. */
const ang = (l: [number, number, E?][]): Q<string>[] => l.map(([t, a, e]) => [t, tr(0, 0, a), e]);
/** n+1 quadros entre t0 e t1. */
const osc = <V,>(t0: number, t1: number, n: number, f: (i: number) => V, e?: E): Q<V>[] =>
    Array.from({ length: n + 1 }, (_, i) => [t0 + (t1 - t0) * i / n, f(i), e] as Q<V>);
/** Janelas de visibilidade [de, até] (s), com fade curto. */
const jan = (w: [number, number][], f = .05): Q<number>[] => {
    const q: Q<number>[] = [[0, 0, 'l']];
    for (const [a, b] of w) q.push([Math.max(0, a - f), 0, 'l'], [a, 1, 'l'], [b, 1, 'l'], [b + f, 0, 'l']);
    return q;
};

// ═════════════════════════════════════════════════════════════════════════════
// DESENHO — traço grosso, cor chapada, um brilho em cima e uma sombra embaixo
// ═════════════════════════════════════════════════════════════════════════════

const VR = '0 0 200 260';                  // caixa dos robôs
const VA = '0 0 160 200';                  // caixa do atendente
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
const Pt: React.FC<{ c?: string; vb?: string; s?: React.CSSProperties; kids?: React.ReactNode; children?: React.ReactNode }> =
    ({ c = '', vb, s, kids, children }) => (
        <div className={`p ${c}`} style={s}>
            {vb && <svg viewBox={vb} aria-hidden="true">{children}</svg>}
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
const Cara: React.FC<{ p: Pal; k: 0 | 1 | 2; t: 'n' | 'f' | 'x' | 'e' | 's' | 'b' | 'p' | 'r' }> = ({ p, k, t }) => {
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

const Cabeca: React.FC<{ p: Pal; k: 0 | 1 | 2 }> = ({ p, k }) => (
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
        {ban && <g transform="translate(0 78) rotate(-20) scale(.9)"><Banana /></g>}
    </g>
);
