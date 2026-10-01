/**
 * cnMotor — o "After Effects" das telas de carregamento.
 *
 * AUTORIA no GSAP (linha do tempo com curvas de verdade: back, elastic, expo,
 * CustomEase), PLAYBACK em CSS. O GSAP não roda durante o carregamento: na hora
 * em que o módulo carrega, cada linha do tempo é AMOSTRADA a 12 quadros por
 * segundo e vira @keyframes com `steps(1,end)` entre um quadro e outro.
 *
 * Por que assado e não ao vivo: a tela de carregamento aparece justamente
 * enquanto a thread principal está presa compilando shaders. Animação em JS
 * congela nessa hora; CSS em transform/opacity roda no compositor e não para.
 *
 * Por que 12 qps em degrau ("on twos"): é o ritmo do desenho animado de 1930 que
 * o jogo imita. Interpolado a 60 qps o mesmo movimento parece recorte de papel
 * deslizando; em degrau ele parece DESENHADO, quadro a quadro.
 *
 * Princípios embutidos nos atalhos abaixo (valores das referências clássicas):
 *  · antecipação de 2–3 quadros na direção contrária (~10–15% da ação);
 *  · squash & stretch preservando volume (sx = 1/sy);
 *  · overshoot de 5–15% e assentamento em 4–6 quadros;
 *  · overlap: peças soltas (cabeça, braços) atrasam 1–2 quadros do corpo;
 *  · "boil": o contorno treme de leve a 8 qps, como traço refeito a cada folha.
 */
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);
// impacto seco: cai acelerando e para de uma vez (sem "freio" no fim)
CustomEase.create('cn.queda', 'M0,0 C0.5,0 0.75,0.4 1,1');
// arranque com antecipação embutida: recua ~9% antes de ir
CustomEase.create('cn.arranca', 'M0,0 C0.25,-0.18 0.4,-0.12 0.55,0.35 0.7,0.8 0.85,1 1,1');

export const QPS = 12;

/** Pose de uma camada. x/y em % da própria caixa, r em graus, o = opacidade. */
export interface Pose { x: number; y: number; r: number; sx: number; sy: number; o: number }
export const pose = (p: Partial<Pose> = {}): Pose => ({ x: 0, y: 0, r: 0, sx: 1, sy: 1, o: 1, ...p });

const css = (p: Pose, comOp: boolean) =>
  `transform:translate(${+p.x.toFixed(2)}%,${+p.y.toFixed(2)}%) rotate(${+p.r.toFixed(2)}deg) scale(${+p.sx.toFixed(3)},${+p.sy.toFixed(3)})`
  + (comOp ? `;opacity:${+p.o.toFixed(3)}` : '');

export interface OpcoesAssar { qps?: number; atraso?: number; inicial?: Partial<Pose> }

/**
 * Assa uma linha do tempo do GSAP numa animação CSS em degrau.
 * `montar(tl, a)` anima o objeto `a` (uma Pose) como quiser; a duração do laço é `dur`.
 * Devolve o CSS: @keyframes + a regra de `.cna .<cls>`.
 */
export function assar(cls: string, piv: string | null, dur: number, montar: (tl: gsap.core.Timeline, a: Pose) => void, o: OpcoesAssar = {}): string {
  const qps = o.qps ?? QPS;
  const a = pose(o.inicial);
  const tl = gsap.timeline({ paused: true });
  montar(tl, a);
  // amostra na MESMA grade que o CSS publica (dur/n), mesmo quando dur·qps não é inteiro
  const n = Math.max(1, Math.round(dur * qps)), dt = dur / n;
  const quadros: Pose[] = [];
  // o quadro 0 amostra um fio depois do zero: um `set` em t=0 só vale quando a agulha passa por ele
  for (let i = 0; i <= n; i++) { tl.seek(i ? i * dt : 1e-4, true); quadros.push({ ...a }); }
  // o último quadro É o primeiro (o laço fecha sem salto)
  quadros[n] = { ...quadros[0] };
  tl.kill();
  const comOp = quadros.some((q) => Math.abs(q.o - 1) > 1e-3);
  const nome = `km-${cls.replace(/[^a-z0-9-]/gi, '_')}`;
  // só escreve o quadro quando a pose muda: o degrau segura o anterior
  let ultimo = '';
  const kf: string[] = [];
  quadros.forEach((q, i) => {
    const c = css(q, comOp);
    if (c === ultimo && i !== n) return;
    ultimo = c;
    kf.push(`${+(i / n * 100).toFixed(3)}%{${c}}`);
  });
  return `@keyframes ${nome}{${kf.join('')}}`
    + `.cna .${cls}{${piv ? `transform-origin:${piv};` : ''}will-change:transform${comOp ? ',opacity' : ''};`
    + `animation:${nome} ${dur}s steps(1,end) infinite both;animation-delay:calc(var(--off, 0s) - ${o.atraso ?? 0}s)}`;
}

// ── ATALHOS DE ATUAÇÃO (cada um acrescenta tweens na linha do tempo, a partir de t) ──

type TL = gsap.core.Timeline;
const Q = 1 / QPS; // um quadro

/** Agacha (antecipação) → sobe esticado em arco → cai com squash → assenta com overshoot. */
export function pulo(tl: TL, a: Pose, t: number, { dx = 0, alt = 30, voo = .5 } = {}) {
  const x0 = () => a.x;
  tl.to(a, { sx: 1.18, sy: .82, y: 0, duration: 3 * Q, ease: 'power2.out' }, t)                       // agacha
    .to(a, { sx: .84, sy: 1.22, duration: 2 * Q, ease: 'power2.out' }, t + 3 * Q)                    // estica no impulso
    .to(a, { y: -alt, duration: voo / 2, ease: 'power2.out' }, t + 3 * Q)                            // sobe freando
    .to(a, { y: 0, duration: voo / 2, ease: 'cn.queda' }, t + 3 * Q + voo / 2)                       // cai acelerando
    .to(a, { sx: 1, sy: 1, duration: voo / 2, ease: 'sine.inOut' }, t + 3 * Q + 2 * Q)
    .to(a, { sx: 1.26, sy: .78, duration: Q, ease: 'none' }, Math.max(t + 3 * Q + voo, t + 5 * Q + voo / 2)) // squash no chão
    .to(a, { sx: .95, sy: 1.06, duration: 2 * Q, ease: 'power2.out' }, t + 4 * Q + voo)              // volta passando
    .to(a, { sx: 1, sy: 1, duration: 3 * Q, ease: 'power2.inOut' }, t + 6 * Q + voo);                // assenta
  if (dx) tl.to(a, { x: () => x0() + dx, duration: voo, ease: 'none' }, t + 3 * Q);
  return t + 9 * Q + voo;
}

/** Vai até `para` chegando PASSADO do ponto e voltando (back.out). Sem antecipação: para ela, use `cn.arranca`. */
export function ate(tl: TL, a: Pose, t: number, para: Partial<Pose>, dur = .4, exagero = 1.6) {
  tl.to(a, { ...para, duration: dur, ease: `back.out(${exagero})` }, t);
  return t + dur;
}

/** "Take" de susto: encolhe 2 quadros, estica alto, tremidinha, volta. */
export function susto(tl: TL, a: Pose, t: number, { alt = 8 } = {}) {
  tl.to(a, { sx: 1.12, sy: .88, y: 2, duration: 2 * Q, ease: 'power1.out' }, t)
    .to(a, { sx: .82, sy: 1.25, y: -alt, duration: 2 * Q, ease: 'power3.out' }, t + 2 * Q)
    .to(a, { r: 3, duration: Q, ease: 'none' }, t + 4 * Q).to(a, { r: -3, duration: Q, ease: 'none' }, t + 5 * Q)
    .to(a, { r: 0, sx: 1, sy: 1, y: 0, duration: 5 * Q, ease: 'elastic.out(1,.45)' }, t + 6 * Q);
  return t + 11 * Q;
}

/** Tremor de impacto (câmera ou objeto), amortecido. */
export function tremor(tl: TL, a: Pose, t: number, amp = 1.2, quadros = 6) {
  for (let i = 0; i < quadros; i++) {
    const f = amp * (1 - i / quadros);
    tl.to(a, { x: (i % 2 ? -1 : 1) * f, y: (i % 3 - 1) * f * .5, duration: Q, ease: 'none' }, t + i * Q);
  }
  tl.to(a, { x: 0, y: 0, duration: Q, ease: 'none' }, t + quadros * Q);
  return t + (quadros + 1) * Q;
}

/** Ciclo de passos de 1930: o corpo sobe na passagem e desce no contato, com ginga. */
export function ginga(tl: TL, a: Pose, t0: number, t1: number, { passo = .34, alt = 4, gir = 3 } = {}) {
  for (let t = t0, i = 0; t < t1 - 1e-6; t += passo, i++) {
    const d = Math.min(passo, t1 - t); // a última passada não invade o assentamento
    tl.to(a, { y: -alt, sy: 1.04, sx: .97, r: i % 2 ? gir : -gir, duration: d / 2, ease: 'sine.out' }, t)
      .to(a, { y: 0, sy: .96, sx: 1.03, duration: d / 2, ease: 'sine.in' }, t + d / 2);
  }
  tl.to(a, { y: 0, sy: 1, sx: 1, r: 0, duration: 2 * Q }, t1);
  return t1 + 2 * Q;
}

/** Pernas alternando em oposição (para camadas de perna esquerda/direita). */
export function pernas(tl: TL, a: Pose, t0: number, t1: number, { passo = .34, ang = 26, fase = 0 } = {}) {
  const f = Math.round(fase);
  for (let t = t0, i = 0; t < t1 - 1e-6; t += passo / 2, i++)
    tl.to(a, { r: ((i + f) % 2 ? 1 : -1) * ang, duration: Math.min(passo / 2, t1 - t), ease: 'sine.inOut' }, t);
  tl.to(a, { r: 0, duration: 2 * Q }, t1);
  return t1 + 2 * Q;
}

/**
 * Boil: o traço treme como se cada folha fosse redesenhada. Três "folhas"
 * alternando a 8 qps, com rotação e deslocamento minúsculos (pseudoaleatórios,
 * fixos — o mesmo tremor a cada laço). Vai numa camada própria (não briga com
 * as outras transformações da peça).
 */
export function ferve(cls: string, piv = '50% 50%', amp = 1, semente = 1): string {
  const r = (k: number) => { const s = Math.sin((k + semente * 17.3) * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const folhas = [0, 1, 2].map((k) => css(pose({ x: r(k) * .25 * amp, y: r(k + 5) * .25 * amp, r: r(k + 9) * .6 * amp, sx: 1 + r(k + 13) * .006 * amp, sy: 1 + r(k + 21) * .006 * amp }), false));
  const nome = `kf-${cls.replace(/[^a-z0-9-]/gi, '_')}`;
  return `@keyframes ${nome}{0%{${folhas[0]}}33.33%{${folhas[1]}}66.67%{${folhas[2]}}}`
    + `.cna .${cls}{transform-origin:${piv};animation:${nome} .375s steps(1,end) infinite both;animation-delay:-${(semente % 3) * .125}s}`; // folhas defasadas por semente
}
