// Régua do rosto: dada uma foto do retrato, acha o ÓVALO CREME da cara e
// devolve linha a linha onde ele começa e acaba, mais os blocos de tinta que
// caem DENTRO dele.
//
// Por que existe: as medidas anteriores deste rosto foram tiradas de manchas de
// ruído e de uma foto que a própria bancada estragava. Esta lê só duas coisas
// que o shader garante — `#f7f3ea` e `#141014` — e não interpreta mais nada.
import { execFileSync } from 'node:child_process';

// As cores SAEM do shader como `#f7f3ea` e `#141014`, mas chegam à foto depois
// da luz toon — medidas na foto: creme ~ (224,223,220), tinta ~ (4,3,4). São as
// mesmas duas que `medir-a-cara.mjs` já usa; qualquer outro pixel é cenário.
const CREME = [224, 223, 220], TINTA = [4, 3, 4];
const perto = (r, g, b, [R, G, B], tol) =>
    Math.abs(r - R) <= tol && Math.abs(g - G) <= tol && Math.abs(b - B) <= tol;

export function lerRosto(caminho, { tol = 14 } = {}) {
    // Sem dependência nova: o Python com Pillow já está na máquina.
    const py = "from PIL import Image\nimport sys, struct\n"
        + "im = Image.open(sys.argv[1]).convert('RGB')\n"
        + "sys.stdout.buffer.write(struct.pack('<II', im.width, im.height))\n"
        + "sys.stdout.buffer.write(im.tobytes())\n";
    const bruto = execFileSync('python3', ['-c', py, caminho], { maxBuffer: 1 << 28 });
    const W = bruto.readUInt32LE(0), H = bruto.readUInt32LE(4), data = bruto.subarray(8);
    const eCreme = new Uint8Array(W * H), eTinta = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 3) {
        const r = data[p], g = data[p + 1], b = data[p + 2];
        if (perto(r, g, b, CREME, tol)) eCreme[i] = 1;
        else if (perto(r, g, b, TINTA, tol)) eTinta[i] = 1;
    }
    return { W, H, eCreme, eTinta };
}

/** O maior borrão creme conectado — a cara. Devolve caixa e máscara. */
export function ovalDaCara({ W, H, eCreme }) {
    const visto = new Int32Array(W * H).fill(-1);
    let melhor = null, id = 0;
    const fila = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
        if (!eCreme[s] || visto[s] >= 0) continue;
        let ini = 0, fim = 0; fila[fim++] = s; visto[s] = id;
        let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0;
        while (ini < fim) {
            const c = fila[ini++], x = c % W, y = (c / W) | 0; n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (x > 0 && eCreme[c - 1] && visto[c - 1] < 0) { visto[c - 1] = id; fila[fim++] = c - 1; }
            if (x < W - 1 && eCreme[c + 1] && visto[c + 1] < 0) { visto[c + 1] = id; fila[fim++] = c + 1; }
            if (y > 0 && eCreme[c - W] && visto[c - W] < 0) { visto[c - W] = id; fila[fim++] = c - W; }
            if (y < H - 1 && eCreme[c + W] && visto[c + W] < 0) { visto[c + W] = id; fila[fim++] = c + W; }
        }
        if (!melhor || n > melhor.n) melhor = { id, n, x0, x1, y0, y1 };
        id++;
    }
    return melhor ? { ...melhor, visto } : null;
}

/** Blocos de tinta dentro da caixa da cara, do maior para o menor. */
export function tintaNaCara({ W, H, eTinta }, cara, { minimo = 40 } = {}) {
    const visto = new Uint8Array(W * H), fila = new Int32Array(W * H), fora = [];
    for (let y = cara.y0; y <= cara.y1; y++) for (let x = cara.x0; x <= cara.x1; x++) {
        const s = y * W + x;
        if (!eTinta[s] || visto[s]) continue;
        let ini = 0, fim = 0; fila[fim++] = s; visto[s] = 1;
        let x0 = W, x1 = -1, y0 = H, y1 = -1, n = 0, sx = 0, sy = 0;
        while (ini < fim) {
            const c = fila[ini++], cx = c % W, cy = (c / W) | 0; n++; sx += cx; sy += cy;
            if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
            if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
            for (const d of [-1, 1, -W, W]) {
                const v = c + d;
                if (v < 0 || v >= W * H || visto[v] || !eTinta[v]) continue;
                const vx = v % W, vy = (v / W) | 0;
                if (vx < cara.x0 || vx > cara.x1 || vy < cara.y0 || vy > cara.y1) continue;
                visto[v] = 1; fila[fim++] = v;
            }
        }
        if (n >= minimo) fora.push({ n, x0, x1, y0, y1, cx: sx / n, cy: sy / n });
    }
    return fora.sort((a, b) => b.n - a.n);
}

/** Régua do rosto: 1 = topo do óvalo, 0 = queixo. */
export const regua = (cara, y) => (cara.y1 - y) / (cara.y1 - cara.y0);

if (import.meta.url === `file://${process.argv[1]}`) {
    for (const f of process.argv.slice(2)) {
        const foto = lerRosto(f);
        const cara = ovalDaCara(foto);
        if (!cara) { console.log(f, '— nenhum creme'); continue; }
        console.log(`\n${f}`);
        console.log(`  óvalo: x ${cara.x0}..${cara.x1} (${cara.x1 - cara.x0 + 1}px)  `
            + `y ${cara.y0}..${cara.y1} (${cara.y1 - cara.y0 + 1}px)  área ${cara.n}px`);
        for (const b of tintaNaCara(foto, cara).slice(0, 8)) {
            console.log(`  tinta ${String(b.n).padStart(6)}px  `
                + `x ${b.x0}..${b.x1}  y ${b.y0}..${b.y1}  `
                + `régua ${regua(cara, b.y1).toFixed(3)}..${regua(cara, b.y0).toFixed(3)}`);
        }
    }
}

/**
 * Perfil linha a linha do creme: quantos pixels e de onde a onde.
 * É esta a medida que interessa para POSICIONAR peça na cara — a caixa do
 * óvalo mente, porque o cabelo e o pescoço entram nela.
 */
export function perfilDoCreme(foto, cara) {
    const { W, eCreme } = foto, linhas = [];
    for (let y = cara.y0; y <= cara.y1; y++) {
        let n = 0, x0 = -1, x1 = -1;
        for (let x = cara.x0; x <= cara.x1; x++) {
            if (!eCreme[y * W + x]) continue;
            n++; if (x0 < 0) x0 = x; x1 = x;
        }
        linhas.push({ y, n, x0, x1, regua: regua(cara, y) });
    }
    return linhas;
}
