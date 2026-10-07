/**
 * f14Terreno.ts — o relevo do planeta do Andar 14 (Kessar-9, deserto alienígena).
 *
 * Uma única função de altura `alturaEm(x, z)` alimenta a malha, os pés do
 * hóspede, as pedras e a entidade. Regiões (raio a partir do pouso, em 0,0):
 *   · PLANÍCIE de dunas onde ele acorda sufocando;
 *   · a CRISTA (cordilheira serrilhada ao norte);
 *   · a BACIA DE SAL (depressão funda e branca a leste);
 *   · os PLATÔS (mesas de topo chato cortadas por cânions a oeste);
 *   · a CRATERA (anel alto e fundo de vidro escuro ao sul) — o fim da caça.
 * O mundo é fechado por montanhas altas na borda (R ≈ 280 m).
 */

// ── ruído de valor 2D determinístico ────────────────────────────────────
function hash(i: number, j: number): number {
    let h = (i * 374761393 + j * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const suave = (t: number) => t * t * (3 - 2 * t);
export function ruido(x: number, z: number): number {
    const i = Math.floor(x), j = Math.floor(z), fx = suave(x - i), fz = suave(z - j);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm(x: number, z: number, oit = 4): number {
    let s = 0, amp = .5, f = 1;
    for (let o = 0; o < oit; o++) { s += amp * ruido(x * f, z * f); f *= 2.03; amp *= .5; }
    return s;
}
/** ruído de cristas (1 − |2n − 1|): bom para serras serrilhadas */
function crista(x: number, z: number): number {
    let s = 0, amp = .5, f = 1;
    for (let o = 0; o < 4; o++) { const n = 1 - Math.abs(ruido(x * f, z * f) * 2 - 1); s += amp * n * n; f *= 2.1; amp *= .5; }
    return s;
}
const liso = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Centros das regiões (para a entidade, as dicas e o mapa). */
export const REGIOES = {
    pouso: { x: 0, z: 0 },
    crista: { x: 10, z: -150 },
    sal: { x: 150, z: -20 },
    platos: { x: -150, z: 30 },
    cratera: { x: 20, z: 170 },
} as const;
export const RAIO_DO_MUNDO = 280;
export const TAMANHO_TERRENO = 640;
export const SEGMENTOS_TERRENO = 384;   // 1,67 m por quadrado: serras com aresta, sem bolhas

export function alturaEm(x: number, z: number): number {
    // dunas: ondas longas na direção do vento + ruído
    const duna = Math.sin(x * .045 + fbm(x * .01, z * .01) * 4) * 2.2 + fbm(x * .03, z * .03) * 3;
    let h = duna;

    // a CRISTA ao norte: serra alta com picos serrilhados
    const dC = Math.hypot((x - REGIOES.crista.x) * .55, z - REGIOES.crista.z);
    const kC = 1 - liso(30, 90, dC);
    h += kC * (crista(x * .02, z * .02) * 70 + 8);

    // a BACIA DE SAL a leste: depressão larga e chata no fundo
    const dS = Math.hypot(x - REGIOES.sal.x, z - REGIOES.sal.z);
    const kS = 1 - liso(25, 70, dS);
    h = h * (1 - kS * .9) - kS * 16;

    // os PLATÔS a oeste: mesas de topo chato (terraços) com cânions
    const dP = Math.hypot(x - REGIOES.platos.x, z - REGIOES.platos.z);
    const kP = 1 - liso(40, 85, dP);
    if (kP > 0) {
        const m = fbm(x * .018 + 7, z * .018 - 3, 3);
        const mesa = m > .52 ? 26 + Math.floor((m - .52) * 40) * 6 : m > .45 ? (m - .45) / .07 * 26 : 0;   // degraus
        h += kP * mesa;
    }

    // a CRATERA ao sul: anel alto + fundo fundo
    const dK = Math.hypot(x - REGIOES.cratera.x, z - REGIOES.cratera.z);
    const anel = Math.exp(-((dK - 42) ** 2) / 120) * 18;
    const fundo = (1 - liso(10, 40, dK)) * -20;
    h += anel + fundo;

    // a borda do mundo: montanhas
    const r = Math.hypot(x, z);
    h += liso(RAIO_DO_MUNDO - 70, RAIO_DO_MUNDO + 10, r) * (60 + crista(x * .015, z * .015) * 80);

    // o pouso: um vale suave e plano
    h *= .35 + .65 * liso(6, 30, r);
    return h;
}

/** Quanto do lugar pertence a cada região (para colorir o chão). */
export function regiaoEm(x: number, z: number) {
    const d = (p: { x: number; z: number }) => Math.hypot(x - p.x, z - p.z);
    return {
        sal: 1 - liso(25, 60, d(REGIOES.sal)),
        cratera: 1 - liso(8, 46, d(REGIOES.cratera)),
        platos: 1 - liso(40, 80, d(REGIOES.platos)),
        crista: 1 - liso(30, 80, Math.hypot((x - REGIOES.crista.x) * .55, z - REGIOES.crista.z)),
    };
}

/** Inclinação aproximada (0 plano … 1 parede). */
export function inclinacao(x: number, z: number): number {
    const e = 1.2, dx = alturaEm(x + e, z) - alturaEm(x - e, z), dz = alturaEm(x, z + e) - alturaEm(x, z - e);
    return Math.min(1, Math.hypot(dx, dz) / (2 * e) / 1.6);
}

/** A superfície exata dos triângulos de PlaneGeometry, também usada pelos pés
 * e adereços. Os terraços analíticos podem saltar 6 m entre dois vértices. */
export function superficieEm(x: number, z: number): number {
    const passo = TAMANHO_TERRENO / SEGMENTOS_TERRENO, metade = TAMANHO_TERRENO / 2;
    const gx = Math.max(0, Math.min(SEGMENTOS_TERRENO - 1e-6, (x + metade) / passo));
    const gz = Math.max(0, Math.min(SEGMENTOS_TERRENO - 1e-6, (z + metade) / passo));
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const ax = ix * passo - metade, az = iz * passo - metade;
    const a = alturaEm(ax, az), b = alturaEm(ax, az + passo), d = alturaEm(ax + passo, az);
    if (u + v <= 1) return a + (d - a) * u + (b - a) * v;
    const c = alturaEm(ax + passo, az + passo);
    return c + (b - c) * (1 - u) + (d - c) * (1 - v);
}
