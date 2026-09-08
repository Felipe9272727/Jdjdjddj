// ── QUANTO A CABEÇA DELE É CHAPADA ───────────────────────────────────────────
//
// O dono do jogo mandou um comparativo lado a lado do modelo em jogo contra a
// referência, e o defeito nº 1 da lista dele é "CABEÇA MUITO CHAPADA — sem
// volume 3D, a cabeça parece plana, sem a curvatura do crânio".
//
// Isso é malha, não desenho, então a primeira pergunta é se dá para MEDIR. Esta
// sonda lê o GLB direto — o pedaço JSON, o acessor de POSITION, e os vértices —
// e reporta a caixa do modelo inteiro e a da CABEÇA em fatias de altura. Se a
// profundidade for muito menor que a largura, ele está certo e é consertável
// com uma escala; se não for, o "chapado" vem do sombreado e o conserto é outro.
//
//   node bancada-navegador/medir-a-cabeca.mjs
import { readFileSync } from 'node:fs';

const buf = readFileSync(new URL('../src/assets/models/diabrete.glb', import.meta.url));
if (buf.readUInt32LE(0) !== 0x46546C67) throw new Error('não é um GLB');

// Cabeçalho de 12 bytes, depois pedaços de (tamanho, tipo, dados).
let p = 12, json = null, bin = null;
while (p < buf.length) {
    const tam = buf.readUInt32LE(p), tipo = buf.readUInt32LE(p + 4);
    const dados = buf.subarray(p + 8, p + 8 + tam);
    if (tipo === 0x4E4F534A) json = JSON.parse(dados.toString('utf8'));
    else if (tipo === 0x004E4942) bin = dados;
    p += 8 + tam + ((4 - (tam % 4)) % 4);
}
const g = json;

/** Lê um acessor de vec3 float como uma lista de [x,y,z]. */
function lerVec3(indice) {
    const ac = g.accessors[indice];
    const bv = g.bufferViews[ac.bufferView];
    const base = (bv.byteOffset ?? 0) + (ac.byteOffset ?? 0);
    const passo = bv.byteStride ?? 12;
    const fora = [];
    for (let i = 0; i < ac.count; i++) {
        const o = base + i * passo;
        fora.push([bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)]);
    }
    return fora;
}

const pontos = [];
for (const m of g.meshes ?? []) {
    for (const prim of m.primitives ?? []) {
        if (prim.attributes?.POSITION != null) pontos.push(...lerVec3(prim.attributes.POSITION));
    }
}
console.log(`vértices: ${pontos.length}`);

const caixa = (lista) => {
    const eixo = (i) => { const v = lista.map((q) => q[i]); return [Math.min(...v), Math.max(...v)]; };
    return [eixo(0), eixo(1), eixo(2)];
};
const mostra = (rotulo, lista) => {
    if (!lista.length) { console.log(`${rotulo}: vazio`); return; }
    const [[x0, x1], [y0, y1], [z0, z1]] = caixa(lista);
    const larg = x1 - x0, alt = y1 - y0, fund = z1 - z0;
    console.log(`${rotulo.padEnd(22)} n=${String(lista.length).padStart(5)}  `
        + `larg ${larg.toFixed(3)}  alt ${alt.toFixed(3)}  fund ${fund.toFixed(3)}  `
        + `fundo/larg ${(fund / larg).toFixed(2)}`);
};

mostra('modelo inteiro', pontos);
// A cabeça: acima de y 0,62, que é onde o pescoço acaba (medido antes).
mostra('cabeça (y > 0,62)', pontos.filter((q) => q[1] > 0.62));
// Só a esfera do crânio, sem chifre nem tufo: |x| < 0,21 e y 0,62..0,95.
mostra('crânio (|x|<0,21)', pontos.filter((q) => q[1] > 0.62 && q[1] < 0.95 && Math.abs(q[0]) < 0.21));
console.log('\nfatias de altura da cabeça (larg x fund):');
for (let y = 0.62; y < 1.0; y += 0.05) {
    const fatia = pontos.filter((q) => q[1] >= y && q[1] < y + 0.05);
    if (!fatia.length) continue;
    const [[x0, x1], , [z0, z1]] = caixa(fatia);
    console.log(`  y ${y.toFixed(2)}  larg ${(x1 - x0).toFixed(3)}  fund ${(z1 - z0).toFixed(3)}`
        + `  fundo/larg ${((z1 - z0) / (x1 - x0)).toFixed(2)}`);
}
