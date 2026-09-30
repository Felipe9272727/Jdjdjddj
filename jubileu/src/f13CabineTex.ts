/**
 * f13CabineTex.ts — as texturas procedurais da cabine do biplano (e do feno).
 *
 * Nada aqui vem de arquivo: madeira envernizada, couro, lona de asa, lã da
 * jaqueta, tinta do capô e palha nascem de ruído em canvas. Duas regras:
 *
 *  - DETERMINISTAS. A queda é gravada quadro a quadro e o retrato e a
 *    paisagem saem de carregamentos diferentes: nada pode depender de
 *    `Math.random`. Tudo usa `semente()` e ruído por hash.
 *  - PREGUIÇOSAS. Só tocam em `document` quando alguém pede a textura (os
 *    testes rodam em Node, sem DOM).
 */
import * as THREE from 'three';

// ═══ ALEATÓRIO E RUÍDO ═══════════════════════════════════════════════════════
/** Gerador pseudo-aleatório determinístico (mulberry32). */
export function semente(n: number): () => number {
    let a = n >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hash3(x: number, y: number, z: number, s: number): number {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(s, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
}
const quintica = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mistura = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ruído de valor 3D em [-1, 1]. */
export function ruido3(x: number, y: number, z: number, s = 0): number {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = quintica(x - x0), fy = quintica(y - y0), fz = quintica(z - z0);
    const c = (i: number, j: number, k: number) => hash3(x0 + i, y0 + j, z0 + k, s);
    const a = mistura(mistura(c(0, 0, 0), c(1, 0, 0), fx), mistura(c(0, 1, 0), c(1, 1, 0), fx), fy);
    const b = mistura(mistura(c(0, 0, 1), c(1, 0, 1), fx), mistura(c(0, 1, 1), c(1, 1, 1), fx), fy);
    return mistura(a, b, fz) * 2 - 1;
}
/** Soma de oitavas de `ruido3`, normalizada para [-1, 1]. */
export function fbm3(x: number, y: number, z: number, oitavas = 4, s = 0): number {
    let soma = 0, amp = .5, f = 1, total = 0;
    for (let i = 0; i < oitavas; i++) { soma += amp * ruido3(x * f, y * f, z * f, s + i * 17); total += amp; amp *= .5; f *= 2.03; }
    return soma / total;
}

/** Ruído de valor 2D que REPETE a cada `px` × `py` células (para texturas que ladrilham). */
function ruidoP(x: number, y: number, px: number, py: number, s: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = quintica(x - x0), fy = quintica(y - y0);
    const w = (v: number, p: number) => ((v % p) + p) % p;
    const xa = w(x0, px), xb = w(x0 + 1, px), ya = w(y0, py), yb = w(y0 + 1, py);
    const a = mistura(hash3(xa, ya, 0, s), hash3(xb, ya, 0, s), fx);
    const b = mistura(hash3(xa, yb, 0, s), hash3(xb, yb, 0, s), fx);
    return mistura(a, b, fy) * 2 - 1;
}
function fbmP(x: number, y: number, px: number, py: number, oitavas: number, s: number): number {
    let soma = 0, amp = .5, total = 0, f = 1;
    for (let i = 0; i < oitavas; i++) { soma += amp * ruidoP(x * f, y * f, px * f, py * f, s + i * 31); total += amp; amp *= .5; f *= 2; }
    return soma / total;
}

// ═══ CANVAS ══════════════════════════════════════════════════════════════════
type Tela = { c: HTMLCanvasElement; g: CanvasRenderingContext2D };
function tela(w: number, h: number): Tela {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return { c, g: c.getContext('2d', { willReadFrequently: true })! };
}
function paraTextura(c: HTMLCanvasElement, cor: boolean, repx = 1, repy = 1): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repx, repy);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
}
/** Pinta pixel a pixel: `f(x, y)` devolve [r, g, b] em 0–255. */
function pintar(t: Tela, f: (x: number, y: number) => [number, number, number]): void {
    const { width: w, height: h } = t.c, img = t.g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const [r, g, b] = f(x, y), i = (y * w + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    t.g.putImageData(img, 0, 0);
}
/** Mapa de normais a partir de um campo de altura (repete nas bordas). */
function normalDeAltura(alt: Float32Array, w: number, h: number, forca: number): THREE.CanvasTexture {
    const t = tela(w, h), img = t.g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dx = alt[y * w + (x + 1) % w] - alt[y * w + (x - 1 + w) % w];
        const dy = alt[((y + 1) % h) * w + x] - alt[((y - 1 + h) % h) * w + x];
        let nx = -dx * forca, ny = dy * forca, nz = 1;
        const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n;
        const i = (y * w + x) * 4;
        d[i] = (nx * .5 + .5) * 255; d[i + 1] = (ny * .5 + .5) * 255; d[i + 2] = (nz * .5 + .5) * 255; d[i + 3] = 255;
    }
    t.g.putImageData(img, 0, 0);
    return paraTextura(t.c, false);
}
function alturaDoCanvas(t: Tela): Float32Array {
    const { width: w, height: h } = t.c, d = t.g.getImageData(0, 0, w, h).data, a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4] / 255;
    return a;
}
const liso = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cor3 = (hex: string): [number, number, number] => { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; };
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [mistura(a[0], b[0], t), mistura(a[1], b[1], t), mistura(a[2], b[2], t)];

export interface JogoDeTextura { map: THREE.Texture; normalMap?: THREE.Texture; bumpMap?: THREE.Texture }
const cache = new Map<string, JogoDeTextura>();
function unico<T extends JogoDeTextura>(chave: string, fazer: () => T): T {
    let j = cache.get(chave) as T | undefined;
    if (!j) { j = fazer(); cache.set(chave, j); }
    return j;
}

// ═══ MADEIRA ENVERNIZADA ═════════════════════════════════════════════════════
/**
 * Mogno (painel) ou abeto claro (montantes): veio longo no sentido de x,
 * anéis de crescimento ondulados e poros. O verniz vem do `clearcoat` do material.
 */
export function texMadeira(tom: 'mogno' | 'abeto' | 'nogueira'): JogoDeTextura {
    return unico(`madeira:${tom}`, () => {
        const W = 512, H = 512, t = tela(W, H);
        const paleta = {
            mogno: [cor3('#4a2010'), cor3('#8a4424'), cor3('#b8703c')],
            abeto: [cor3('#9a6a34'), cor3('#c89a58'), cor3('#e6c88c')],
            nogueira: [cor3('#2e1a0e'), cor3('#5a3820'), cor3('#8a5a34')],
        }[tom];
        const rnd = semente(tom.length * 101 + 7);
        const alt = new Float32Array(W * H);
        pintar(t, (x, y) => {
            const nx = x / W, ny = y / H;
            const aviso = fbmP(nx * 3, ny * 6, 3, 6, 3, 11) * 2.2;
            const fibra = fbmP(nx * 2, ny * 64, 2, 64, 4, 23);
            const anel = Math.sin((ny * 26 + aviso * 1.6 + fibra * .7) * Math.PI * 2);
            let v = .5 + .34 * fibra + .22 * anel + .12 * fbmP(nx * 12, ny * 5, 12, 5, 3, 5);
            v = Math.max(0, Math.min(1, v));
            alt[y * W + x] = v;
            const c = v < .5 ? mix3(paleta[0], paleta[1], v * 2) : mix3(paleta[1], paleta[2], (v - .5) * 2);
            return c;
        });
        // poros: riscos escuros curtos no sentido do veio
        t.g.globalAlpha = .28;
        for (let i = 0; i < 2600; i++) {
            const x = rnd() * W, y = rnd() * H, l = 2 + rnd() * 6;
            t.g.fillStyle = `rgb(${paleta[0].map((k) => k * .55).join(',')})`;
            t.g.fillRect(x, y, l, 1);
        }
        t.g.globalAlpha = 1;
        return { map: paraTextura(t.c, true), bumpMap: paraTextura(t.c, false) };
    });
}

// ═══ COURO ═══════════════════════════════════════════════════════════════════
/** Grão de couro (células de Voronoi) + mosqueado. `costura` risca uma linha de pontos no meio. */
export function texCouro(base: string, costura = false): JogoDeTextura {
    return unico(`couro:${base}:${costura}`, () => {
        const W = 512, H = 512, N = 72, t = tela(W, H);
        const rnd = semente(base.length * 13 + (costura ? 5 : 0) + 3);
        const px: number[] = [], py: number[] = [], tom: number[] = [];
        for (let i = 0; i < N * N; i++) { px.push(rnd()); py.push(rnd()); tom.push(rnd()); }
        const cb = cor3(base), alt = new Float32Array(W * H);
        pintar(t, (x, y) => {
            const gx = x / W * N, gy = y / H * N, cx = Math.floor(gx), cy = Math.floor(gy);
            let f1 = 9, f2 = 9, id = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const ux = ((cx + i) % N + N) % N, uy = ((cy + j) % N + N) % N, k = uy * N + ux;
                const dx = cx + i + px[k] - gx, dy = cy + j + py[k] - gy, d = Math.hypot(dx, dy);
                if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
            }
            const borda = liso(0, .34, f2 - f1);                    // 0 na dobra, 1 no miolo da célula
            const h = .55 * borda + .3 * liso(0, 1, 1 - f1) + .15 * (.5 + .5 * fbmP(x / W * 6, y / H * 6, 6, 6, 3, 9));
            alt[y * W + x] = h;
            const mosq = .9 + .18 * fbmP(x / W * 5, y / H * 5, 5, 5, 4, 3) + (tom[id] - .5) * .1;
            const k = mosq * (.72 + .28 * borda);
            return [cb[0] * k, cb[1] * k, cb[2] * k];
        });
        if (costura) {
            // fio claro em pontos, com sombra do lado: a linha cruza a textura na horizontal
            t.g.fillStyle = 'rgba(0,0,0,.45)';
            for (let x = 0; x < W; x += 16) t.g.fillRect(x + 1, H * .5 + 1.5, 10, 3.6);
            t.g.fillStyle = '#d9c08a';
            for (let x = 0; x < W; x += 16) t.g.fillRect(x, H * .5, 10, 3);
            t.g.fillStyle = 'rgba(20,10,4,.5)';
            t.g.fillRect(0, H * .5 - 9, W, 1.6); t.g.fillRect(0, H * .5 + 9, W, 1.6);
            const d = t.g.getImageData(0, 0, W, H).data;
            for (let i = 0; i < W * H; i++) alt[i] = Math.min(alt[i], .3 + d[i * 4] / 255 * .7) * (d[i * 4] > 190 && d[i * 4 + 1] > 160 ? 1.4 : 1);
        }
        return { map: paraTextura(t.c, true), normalMap: normalDeAltura(alt, W, H, costura ? 3.2 : 2.4) };
    });
}

// ═══ LÃ E MALHA DA JAQUETA ═══════════════════════════════════════════════════
/** Sarja de lã azul (a jaqueta do hóspede, #3b6fb0): trama diagonal + felpa. */
export function texLa(base: string): JogoDeTextura {
    return unico(`la:${base}`, () => {
        const W = 512, H = 512, t = tela(W, H), cb = cor3(base), alt = new Float32Array(W * H);
        pintar(t, (x, y) => {
            const diag = Math.sin((x + y) * .9) * .5 + Math.sin((x - y * .5) * 1.7) * .15;
            const felpa = fbmP(x / 3, y / 3, W / 3, H / 3, 2, 4) * .5 + fbmP(x / 90, y / 90, W / 90, H / 90, 3, 8) * .9;
            const h = .5 + .22 * diag + .18 * felpa;
            alt[y * W + x] = h;
            const k = .86 + .22 * h + .08 * felpa;
            return [cb[0] * k, cb[1] * k, cb[2] * k];
        });
        return { map: paraTextura(t.c, true), normalMap: normalDeAltura(alt, W, H, 2.2) };
    });
}
/** Punho de malha canelada: nervuras verticais. */
export function texMalha(base: string): JogoDeTextura {
    return unico(`malha:${base}`, () => {
        const W = 256, H = 256, t = tela(W, H), cb = cor3(base), alt = new Float32Array(W * H);
        pintar(t, (x, y) => {
            const nerv = .5 + .5 * Math.sin(x / W * Math.PI * 2 * 24);
            const ponto = .5 + .5 * Math.sin((y + (x % 8 < 4 ? 0 : 3)) * .9);
            const h = nerv * .75 + ponto * .25;
            alt[y * W + x] = h;
            const k = .68 + .4 * h + .05 * fbmP(x / 7, y / 7, W / 7, H / 7, 2, 2);
            return [cb[0] * k, cb[1] * k, cb[2] * k];
        });
        return { map: paraTextura(t.c, true), normalMap: normalDeAltura(alt, W, H, 3) };
    });
}

// ═══ LONA DA ASA ═════════════════════════════════════════════════════════════
/**
 * O ladrilho cobre 0,35 m × 0,35 m de asa. Trama de linho, e uma fita de
 * reforço com pontos de costura ao longo de UMA borda: a cada 0,35 m de
 * envergadura, uma nervura. A UV da asa é em metros, então a fita corre na
 * direção da corda, como a nervura de verdade.
 */
export function texLona(base: string, faixa?: string): JogoDeTextura {
    return unico(`lona:${base}:${faixa ?? ''}`, () => {
        const W = 512, H = 512, t = tela(W, H), cb = cor3(base), alt = new Float32Array(W * H);
        pintar(t, (x, y) => {
            const fio = (Math.sin(x * 2.4) * Math.sin(y * 2.4)) * .5 + .5;
            const mancha = fbmP(x / 120, y / 120, W / 120, H / 120, 3, 12);
            const tira = fbmP(x / 2, y / 50, W / 2, H / 50, 2, 6);
            const h = .6 * fio + .4 * (.5 + .5 * mancha);
            alt[y * W + x] = h;
            const k = .94 + .08 * mancha + .04 * tira + .05 * fio;
            return [cb[0] * k, cb[1] * k, cb[2] * k];
        });
        // fita de reforço sobre a nervura, em y = 0
        const fita = faixa ? cor3(faixa) : [cb[0] * .92, cb[1] * .9, cb[2] * .84];
        t.g.fillStyle = `rgb(${fita.map(Math.round).join(',')})`;
        t.g.fillRect(0, 0, W, 38); t.g.fillRect(0, H - 19, W, 19);
        t.g.fillStyle = 'rgba(0,0,0,.22)';
        t.g.fillRect(0, 38, W, 2); t.g.fillRect(0, H - 21, W, 2);
        t.g.fillStyle = 'rgba(70,52,30,.65)';
        for (let x = 6; x < W; x += 18) { t.g.fillRect(x, 0, 2.4, 10); t.g.fillRect(x, H - 10, 2.4, 10); }
        alt.forEach((_, i) => { const y = Math.floor(i / W); if (y < 38 || y > H - 20) alt[i] = Math.max(alt[i], .78); });
        return { map: paraTextura(t.c, true), normalMap: normalDeAltura(alt, W, H, 1.4) };
    });
}

// ═══ TINTA DO CAPÔ ═══════════════════════════════════════════════════════════
/**
 * Chapa pintada do capô do motor: u dá a volta (0,5 = o topo), v vai do
 * para-brisa (0) ao lábio do capô (1). Tem a faixa azul, as emendas da tampa
 * do motor, fileiras de rebites, venezianas e manchas de óleo.
 */
export function texCapo(base: string, faixa: string): JogoDeTextura {
    return unico(`capo:${base}:${faixa}`, () => {
        const W = 1024, H = 768, c = tela(W, H), b = tela(W, H), rnd = semente(4242);
        const cb = cor3(base);
        pintar(c, (x, y) => {
            const casca = fbmP(x / 5, y / 5, W / 5, H / 5, 2, 3) * .5 + fbmP(x / 60, y / 40, W / 60, H / 40, 3, 7) * .5;
            const k = 1 + casca * .035;
            return [cb[0] * k, cb[1] * k, cb[2] * k];
        });
        b.g.fillStyle = '#808080'; b.g.fillRect(0, 0, W, H);
        // manchas de óleo correndo para trás (v crescente = para a frente; o vento as puxa para v menor)
        for (let i = 0; i < 160; i++) {
            const x = (.5 + (rnd() - .5) * (rnd() < .5 ? .9 : .45)) * W, y = rnd() * H, l = 50 + rnd() * 170, w = 2 + rnd() * 6;
            const g = c.g.createLinearGradient(x, y, x, y - l);
            g.addColorStop(0, 'rgba(58,44,30,0)'); g.addColorStop(.25, `rgba(58,44,30,${.05 + rnd() * .07})`); g.addColorStop(1, 'rgba(58,44,30,0)');
            c.g.fillStyle = g; c.g.fillRect(x - w / 2, y - l, w, l);
        }
        // faixa azul no eixo, com fio creme de cada lado
        const fx = .5 * W, fl = .085 * W;
        c.g.fillStyle = faixa; c.g.fillRect(fx - fl / 2, 0, fl, H);
        c.g.fillStyle = 'rgba(244,232,200,.95)';
        c.g.fillRect(fx - fl / 2 - 9, 0, 3, H); c.g.fillRect(fx + fl / 2 + 6, 0, 3, H);
        c.g.fillStyle = 'rgba(0,0,0,.18)';
        c.g.fillRect(fx - fl / 2, 0, 2, H); c.g.fillRect(fx + fl / 2 - 2, 0, 2, H);
        // emendas (escuras em cor, fundas no relevo)
        const emenda = (x0: number, y0: number, x1: number, y1: number) => {
            for (const [g, cor, lw] of [[c.g, 'rgba(40,30,22,.62)', 2.2], [b.g, '#3c3c3c', 4]] as const) {
                g.strokeStyle = cor; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
            }
        };
        const rebites = (x0: number, y0: number, x1: number, y1: number, passo: number) => {
            const d = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(d / passo);
            for (let i = 0; i <= n; i++) {
                const x = mistura(x0, x1, i / n), y = mistura(y0, y1, i / n);
                // elipse 1 : .8 — o v do capô tem mais metros por pixel que o u
                c.g.fillStyle = 'rgba(0,0,0,.35)'; c.g.beginPath(); c.g.ellipse(x + 1.2, y + 1.2, 3.4, 2.7, 0, 0, 7); c.g.fill();
                c.g.fillStyle = 'rgba(255,250,235,.95)'; c.g.beginPath(); c.g.ellipse(x, y, 3.1, 2.5, 0, 0, 7); c.g.fill();
                c.g.fillStyle = 'rgba(120,108,88,.9)'; c.g.beginPath(); c.g.ellipse(x + .7, y + .6, 2, 1.6, 0, 0, 7); c.g.fill();
                b.g.fillStyle = '#e6e6e6'; b.g.beginPath(); b.g.ellipse(x, y, 3.1, 2.5, 0, 0, 7); b.g.fill();
            }
        };
        // a tampa do motor: retângulo de emendas em volta da faixa
        const tx0 = .5 * W - .2 * W, tx1 = .5 * W + .2 * W, ty0 = .07 * H, ty1 = .72 * H;
        emenda(tx0, ty0, tx1, ty0); emenda(tx0, ty1, tx1, ty1); emenda(tx0, ty0, tx0, ty1); emenda(tx1, ty0, tx1, ty1);
        rebites(tx0 - 10, ty0, tx0 - 10, ty1, 26); rebites(tx1 + 10, ty0, tx1 + 10, ty1, 26);
        rebites(tx0, ty0 - 10, tx1, ty0 - 10, 26); rebites(tx0, ty1 + 10, tx1, ty1 + 10, 26);
        // costuras em volta do capô e a fileira da frente
        for (const v of [.04, .78, .94]) { emenda(0, v * H, W, v * H); rebites(0, v * H + 11, W, v * H + 11, 24); }
        // venezianas nas laterais (duas colunas por lado)
        for (const cx of [.17, .255, .745, .83]) for (let i = 0; i < 9; i++) {
            const x = cx * W, y = (.18 + i * .052) * H;
            c.g.fillStyle = 'rgba(28,20,14,.92)'; c.g.beginPath(); c.g.roundRect(x - 26, y, 52, 10, 4); c.g.fill();
            c.g.fillStyle = 'rgba(255,255,240,.55)'; c.g.fillRect(x - 24, y + 10, 48, 1.6);
            b.g.fillStyle = '#1e1e1e'; b.g.beginPath(); b.g.roundRect(x - 26, y, 52, 10, 4); b.g.fill();
        }
        // tampinha do óleo, em latão
        c.g.fillStyle = '#c9a13a'; c.g.beginPath(); c.g.arc(.36 * W, .55 * H, 15, 0, 7); c.g.fill();
        c.g.strokeStyle = 'rgba(40,28,10,.8)'; c.g.lineWidth = 2; c.g.stroke();
        c.g.fillStyle = 'rgba(60,40,10,.8)'; c.g.fillRect(.36 * W - 10, .55 * H - 1.5, 20, 3);
        b.g.fillStyle = '#d0d0d0'; b.g.beginPath(); b.g.arc(.36 * W, .55 * H, 15, 0, 7); b.g.fill();
        return { map: paraTextura(c.c, true), normalMap: normalDeAltura(alturaDoCanvas(b), W, H, 1.6) };
    });
}

// ═══ HÉLICE ══════════════════════════════════════════════════════════════════
/** Madeira laminada: lâminas de nogueira e freixo empilhadas (faixas constantes ao longo da pá). */
export function texHelice(): JogoDeTextura {
    return unico('helice', () => {
        const W = 256, H = 256, t = tela(W, H), rnd = semente(77);
        const laminas = [cor3('#5a331a'), cor3('#b98a54'), cor3('#6e4022'), cor3('#c9a06a'), cor3('#4a2a16'), cor3('#b07e48')];
        pintar(t, (x, y) => {
            const k = Math.floor(y / H * laminas.length), v = y / H * laminas.length - k;
            const c = laminas[k % laminas.length], fibra = fbmP(x / 40, y / 3, W / 40, H / 3, 3, k + 1);
            const borda = liso(0, .06, v) * liso(0, .06, 1 - v);
            const s = (.88 + .2 * fibra) * (.6 + .4 * borda);
            return [c[0] * s, c[1] * s, c[2] * s];
        });
        rnd();
        return { map: paraTextura(t.c, true) };
    });
}

// ═══ PALHA ═══════════════════════════════════════════════════════════════════
/** Ladrilho de palha: milhares de colmos finos em todas as direções (cor + relevo). */
export function texPalha(): JogoDeTextura {
    return unico('palha', () => {
        const W = 1024, H = 1024, c = tela(W, H), b = tela(W, H), rnd = semente(1313);
        c.g.fillStyle = '#6e5022'; c.g.fillRect(0, 0, W, H);
        b.g.fillStyle = '#2a2a2a'; b.g.fillRect(0, 0, W, H);
        const tons = ['#e9d092', '#dcbf78', '#cfae62', '#c19a4e', '#ead6a0', '#b38a40', '#d8b86c', '#f1e0ad'];
        const colmo = (x: number, y: number, ang: number, len: number, larg: number, cor: string, claro: number) => {
            for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
                const x0 = x + ox, y0 = y + oy;
                if (x0 < -len - 4 || x0 > W + len + 4 || y0 < -len - 4 || y0 > H + len + 4) continue;
                const curva = (rnd() - .5) * len * .25;
                const cx = x0 + Math.cos(ang) * len * .5 - Math.sin(ang) * curva, cy = y0 + Math.sin(ang) * len * .5 + Math.cos(ang) * curva;
                const ex = x0 + Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len;
                c.g.strokeStyle = cor; c.g.lineWidth = larg; c.g.lineCap = 'round';
                c.g.beginPath(); c.g.moveTo(x0, y0); c.g.quadraticCurveTo(cx, cy, ex, ey); c.g.stroke();
                b.g.strokeStyle = `rgb(${claro},${claro},${claro})`; b.g.lineWidth = larg;
                b.g.beginPath(); b.g.moveTo(x0, y0); b.g.quadraticCurveTo(cx, cy, ex, ey); b.g.stroke();
            }
        };
        // duas camadas: fundo mais escuro e fino, cima mais claro e grosso
        for (let i = 0; i < 4200; i++) colmo(rnd() * W, rnd() * H, rnd() * Math.PI * 2, 34 + rnd() * 90, 1.4 + rnd() * 1.6, i % 3 ? tons[Math.floor(rnd() * 5) + 2 - 2] : '#8c6a30', 70 + rnd() * 50);
        for (let i = 0; i < 3800; i++) colmo(rnd() * W, rnd() * H, rnd() * Math.PI * 2, 40 + rnd() * 120, 1.8 + rnd() * 2.2, tons[Math.floor(rnd() * tons.length)], 150 + rnd() * 100);
        return { map: paraTextura(c.c, true), bumpMap: paraTextura(b.c, false) };
    });
}

// ═══ MOSTRADOR DO RELÓGIO ════════════════════════════════════════════════════
const mostradores = new Map<string, THREE.CanvasTexture>();
/** Mostrador de instrumento: fundo escuro, marcas e números em marfim. */
export function texMostrador(rotulo: string, marcas: number, vermelho = 0, unidade = ''): THREE.CanvasTexture {
    const chave = `${rotulo}:${marcas}:${vermelho}:${unidade}`;
    let t = mostradores.get(chave); if (t) return t;
    const S = 256, c = tela(S, S), g = c.g, m = S / 2;
    const gr = g.createRadialGradient(m, m * .92, 10, m, m, m);
    gr.addColorStop(0, '#2d2b27'); gr.addColorStop(.85, '#15140f'); gr.addColorStop(1, '#0a0907');
    g.fillStyle = gr; g.beginPath(); g.arc(m, m, m - 1, 0, 7); g.fill();
    // anel interno fino
    g.strokeStyle = 'rgba(239,227,200,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(m, m, m * .93, 0, 7); g.stroke();
    if (vermelho) {
        g.strokeStyle = '#c23a22'; g.lineWidth = 14; g.beginPath();
        g.arc(m, m, m * .78, -Math.PI / 2 + Math.PI * 2 * (1 - vermelho), -Math.PI / 2 + Math.PI * 2 * .999); g.stroke();
    }
    g.strokeStyle = '#efe3c8'; g.fillStyle = '#efe3c8'; g.font = 'bold 27px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < marcas * 5; i++) {
        const a = -Math.PI / 2 + i / (marcas * 5) * Math.PI * 2, grande = i % 5 === 0, r0 = grande ? m * .7 : m * .8;
        g.lineWidth = grande ? 6 : 2.4; g.beginPath();
        g.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0); g.lineTo(m + Math.cos(a) * m * .9, m + Math.sin(a) * m * .9); g.stroke();
        if (grande) g.fillText(String(i / 5), m + Math.cos(a) * m * .53, m + Math.sin(a) * m * .53);
    }
    g.font = 'bold 21px Georgia, serif'; g.fillStyle = '#d9b85a'; g.fillText(rotulo, m, m * 1.4);
    if (unidade) { g.font = '15px Georgia, serif'; g.fillStyle = 'rgba(217,184,90,.85)'; g.fillText(unidade, m, m * 1.56); }
    t = new THREE.CanvasTexture(c.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; mostradores.set(chave, t);
    return t;
}

/** Brilho de vidro (curva de luz em diagonal + borda), somado por cima do mostrador. */
let texReflexo: THREE.CanvasTexture | null = null;
export function texReflexoDoVidro(): THREE.CanvasTexture {
    if (texReflexo) return texReflexo;
    const S = 256, c = tela(S, S), g = c.g;
    g.clearRect(0, 0, S, S);
    // reflexo do céu: clarão curvo no alto à esquerda
    const r = g.createRadialGradient(S * .3, S * .22, 4, S * .3, S * .22, S * .62);
    r.addColorStop(0, 'rgba(255,255,255,.75)'); r.addColorStop(.35, 'rgba(255,255,255,.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    // faixa diagonal
    g.save(); g.translate(S / 2, S / 2); g.rotate(-.65);
    const f = g.createLinearGradient(0, -S * .5, 0, S * .5);
    f.addColorStop(0, 'rgba(255,255,255,0)'); f.addColorStop(.42, 'rgba(255,255,255,0)'); f.addColorStop(.5, 'rgba(255,255,255,.28)'); f.addColorStop(.56, 'rgba(255,255,255,0)'); f.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = f; g.fillRect(-S, -S * .5, S * 2, S); g.restore();
    // a borda do vidro pega mais céu
    const e = g.createRadialGradient(S / 2, S / 2, S * .38, S / 2, S / 2, S * .5);
    e.addColorStop(0, 'rgba(180,210,255,0)'); e.addColorStop(1, 'rgba(180,210,255,.35)');
    g.fillStyle = e; g.fillRect(0, 0, S, S);
    texReflexo = new THREE.CanvasTexture(c.c); texReflexo.colorSpace = THREE.SRGBColorSpace;
    return texReflexo;
}

/** Placa de latão gravada (texto claro em relevo escuro). */
export function texPlaca(texto: string, sub = ''): THREE.CanvasTexture {
    const W = 256, H = 96, c = tela(W, H), g = c.g;
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#d8b557'); gr.addColorStop(.5, '#b8902f'); gr.addColorStop(1, '#cfa844');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(70,48,10,.85)'; g.lineWidth = 3; g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = 'rgba(60,40,8,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 40px Georgia, serif'; g.fillText(texto, W / 2, sub ? H * .4 : H / 2);
    if (sub) { g.font = 'bold 17px Georgia, serif'; g.fillText(sub, W / 2, H * .75); }
    const t = new THREE.CanvasTexture(c.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
}
