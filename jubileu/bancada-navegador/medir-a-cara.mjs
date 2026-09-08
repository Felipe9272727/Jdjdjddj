// Mede a cara do Diabrete numa foto, em coordenada DA PRÓPRIA CARA.
//
// Por que isto existe: o corpo dele balança, então duas fotos do mesmo
// enquadramento têm a cabeça em alturas diferentes na tela. Comparar linha de
// pixel entre fotos me fez "ver" a boca em cima do nariz mais de uma vez quando
// era só o quadril subindo. Aqui nada é comparado entre fotos: a régua é a cara
// da própria foto — 0 no queixo, 1 no alto da cabeça.
//
//   node bancada-navegador/medir-a-cara.mjs /tmp/foto.png [...]
//
// Sai: altura da cara em pixels, onde acabam os olhos, e cada mancha de tinta
// abaixo deles (o nariz é a primeira; a boca desenhada, quando há, é a outra).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CREME = [224, 223, 220];
const TINTA = [4, 3, 4];
const TOL = 12;

function lerPng(caminho) {
    // Sem dependência nova: o Python com Pillow já está na máquina.
    const py = `
from PIL import Image
import sys, struct
im = Image.open(sys.argv[1]).convert('RGB')
sys.stdout.buffer.write(struct.pack('<II', im.width, im.height))
sys.stdout.buffer.write(im.tobytes())
`;
    const bruto = execFileSync('python3', ['-c', py, caminho], { maxBuffer: 1 << 28 });
    const w = bruto.readUInt32LE(0), h = bruto.readUInt32LE(4);
    return { w, h, dados: bruto.subarray(8) };
}

const perto = (d, i, alvo) => Math.abs(d[i] - alvo[0]) <= TOL
    && Math.abs(d[i + 1] - alvo[1]) <= TOL && Math.abs(d[i + 2] - alvo[2]) <= TOL;

/** A cara é a maior mancha de creme da imagem. Acha por preenchimento. */
function acharACara({ w, h, dados }) {
    const creme = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < w * h; p++, i += 3) if (perto(dados, i, CREME)) creme[p] = 1;
    const visto = new Uint8Array(w * h);
    let melhor = null;
    const fila = new Int32Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
        if (!creme[p0] || visto[p0]) continue;
        let ini = 0, fim = 0; fila[fim++] = p0; visto[p0] = 1;
        let n = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
        while (ini < fim) {
            const p = fila[ini++]; n++;
            const x = p % w, y = (p / w) | 0;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (x > 0     && creme[p - 1] && !visto[p - 1]) { visto[p - 1] = 1; fila[fim++] = p - 1; }
            if (x < w - 1 && creme[p + 1] && !visto[p + 1]) { visto[p + 1] = 1; fila[fim++] = p + 1; }
            if (y > 0     && creme[p - w] && !visto[p - w]) { visto[p - w] = 1; fila[fim++] = p - w; }
            if (y < h - 1 && creme[p + w] && !visto[p + w]) { visto[p + w] = 1; fila[fim++] = p + w; }
        }
        if (!melhor || n > melhor.n) melhor = { n, x0, x1, y0, y1 };
    }
    return melhor;
}

/** Manchas de tinta, linha a linha, dentro da caixa da cara. */
function manchas({ w, dados }, cara) {
    const linhas = [];
    for (let y = cara.y0; y <= cara.y1; y++) {
        const gs = [];
        let ini = -1;
        for (let x = cara.x0; x <= cara.x1 + 1; x++) {
            const tinta = x <= cara.x1 && perto(dados, (y * w + x) * 3, TINTA);
            if (tinta && ini < 0) ini = x;
            else if (!tinta && ini >= 0) { if (x - ini > 3) gs.push([ini, x - 1]); ini = -1; }
        }
        linhas.push({ y, gs });
    }
    return linhas;
}

for (const caminho of process.argv.slice(2)) {
    const img = lerPng(caminho);
    const cara = acharACara(img);
    if (!cara) { console.log(caminho, 'sem cara'); continue; }
    const alt = cara.y1 - cara.y0;
    const linhas = manchas(img, cara);
    // As manchas de tinta NO MEIO DA CARA. Os olhos ficam de fora por posição:
    // eles são as duas manchas laterais, e no modelo elas encostam no contorno
    // preto da cabeça — tentar achá-las por forma não funcionou, achar o que
    // está no MEIO funciona. O nariz é a primeira mancha do meio; a boca
    // desenhada, quando há, é a de baixo.
    const meio = (cara.x0 + cara.x1) / 2;
    const larguraDaCara = cara.x1 - cara.x0;
    const abaixo = [];
    for (const { y, gs } of linhas) {
        for (const g of gs) {
            const c = (g[0] + g[1]) / 2;
            if (Math.abs(c - meio) < larguraDaCara * 0.12 && g[1] - g[0] < larguraDaCara * 0.75) {
                abaixo.push({ y, g }); break;
            }
        }
    }
    // Agrupa em manchas verticais (corte de 3 linhas de vazio).
    const grupos = [];
    for (const it of abaixo) {
        const u = grupos[grupos.length - 1];
        if (u && it.y - u.y1 <= 3) { u.y1 = it.y; u.larg = Math.max(u.larg, it.g[1] - it.g[0]); }
        else grupos.push({ y0: it.y, y1: it.y, larg: it.g[1] - it.g[0] });
    }
    // Régua da CARA: 1 no alto da cabeça, 0 no queixo.
    const f = (y) => ((cara.y1 - y) / alt).toFixed(3);
    console.log(`\n${caminho}`);
    console.log(`  cara: ${cara.x1 - cara.x0}x${alt} px (régua: 1 = alto da cabeça, 0 = queixo)`);
    for (const g of grupos) {
        console.log(`  mancha ${f(g.y1)}..${f(g.y0)} (${g.y1 - g.y0 + 1}px de alto, ${g.larg}px de largo)`);
    }
}
