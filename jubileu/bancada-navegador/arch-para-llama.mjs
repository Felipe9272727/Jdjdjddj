// ── TROCAR A ARQUITETURA DECLARADA NO gguf ────────────────────────────────
//
// O MobileLLM-R1 é um Llama denso comum: 22 camadas, 9 tensores por camada
// (norm, q, k, v, o, ffn_norm, gate, up, down), GQA 24/6, rope base 8e6 —
// nenhum tensor de q_norm/k_norm, nenhum perito. Mas a conversão o carimbou
// como `llama4`, e o llama.cpp tem uma regra dura:
//
//   llama_model_load: error loading model: llama4 model cannot have zero experts
//
// O modelo não sobe, e o wllama ainda assim RESOLVE a promessa de carga — daí
// o `(ABORT)` só aparecer na primeira chamada, longe da causa.
//
// Este script reescreve o cabeçalho trocando `llama4` por `llama` (chave a
// chave) e copia os tensores byte a byte. Não toca em peso nenhum.
//
//   node arch-para-llama.mjs entrada.gguf saida.gguf [de] [para]
//
// AVISO: isto é uma aposta verificável, não um conserto garantido. Se o
// modelo usasse algo exclusivo do llama4 (NoPE por camada, norm de QK,
// temperatura de atenção), o grafo do `llama` rodaria e devolveria LIXO em
// vez de erro. A conferência é a saída, não o carregamento.
import fs from 'node:fs';

const [entrada, saida, DE = 'llama4', PARA = 'llama'] = process.argv.slice(2);
if (!entrada || !saida) { console.error('uso: node arch-para-llama.mjs entrada.gguf saida.gguf [de] [para]'); process.exit(1); }

const TAM = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
const fd = fs.openSync(entrada, 'r');
const total = fs.fstatSync(fd).size;
// O cabeçalho inteiro cabe nisto: o maior que vimos (128k tokens + 280k
// merges) deu ~13 MB.
const b = Buffer.alloc(Math.min(total, 64 * 1024 * 1024));
fs.readSync(fd, b, 0, b.length, 0);

if (b.subarray(0, 4).toString() !== 'GGUF') throw new Error('não é gguf');
const versao = b.readUInt32LE(4);
const nTensores = Number(b.readBigUInt64LE(8));
const nKv = Number(b.readBigUInt64LE(16));

let p = 24;
const lerStr = () => { const n = Number(b.readBigUInt64LE(p)); const s = b.subarray(p + 8, p + 8 + n); p += 8 + n; return s; };
const kvs = [];
for (let i = 0; i < nKv; i++) {
    const chave = lerStr().toString('utf8');
    const tipo = b.readUInt32LE(p); p += 4;
    const inicio = p;
    if (tipo === 8) { p += 8 + Number(b.readBigUInt64LE(p)); }
    else if (tipo === 9) {
        const dentro = b.readUInt32LE(p); const n = Number(b.readBigUInt64LE(p + 4)); p += 12;
        if (dentro === 8) { for (let k = 0; k < n; k++) p += 8 + Number(b.readBigUInt64LE(p)); }
        else p += n * (TAM[dentro] ?? 4);
    } else p += TAM[tipo] ?? 4;
    kvs.push({ chave, tipo, valor: Buffer.from(b.subarray(inicio, p)) });
}
const infos = [];
for (let i = 0; i < nTensores; i++) {
    const inicio = p;
    lerStr();
    const nd = b.readUInt32LE(p); p += 4 + nd * 8 + 4 + 8;
    infos.push(Buffer.from(b.subarray(inicio, p)));
}
const alinhamento = (() => {
    const a = kvs.find((k) => k.chave === 'general.alignment');
    return a ? a.valor.readUInt32LE(0) : 32;
})();
const alinhar = (x) => Math.ceil(x / alinhamento) * alinhamento;
const dadosAntes = alinhar(p);

// ── a troca ──────────────────────────────────────────────────────────────
let trocadas = 0;
for (const k of kvs) {
    if (k.chave === 'general.architecture' && k.tipo === 8) {
        const atual = k.valor.subarray(8).toString('utf8');
        if (atual !== DE) throw new Error(`a arquitetura declarada é "${atual}", não "${DE}"`);
        const novo = Buffer.from(PARA, 'utf8');
        const v = Buffer.alloc(8 + novo.length);
        v.writeBigUInt64LE(BigInt(novo.length)); novo.copy(v, 8);
        k.valor = v; trocadas++;
    } else if (k.chave.startsWith(`${DE}.`)) {
        k.chave = `${PARA}.${k.chave.slice(DE.length + 1)}`; trocadas++;
    }
}
console.log(`  ${trocadas} chaves trocadas de "${DE}." para "${PARA}."`);

const pedacos = [];
const cab = Buffer.alloc(24);
cab.write('GGUF', 0); cab.writeUInt32LE(versao, 4);
cab.writeBigUInt64LE(BigInt(nTensores), 8); cab.writeBigUInt64LE(BigInt(nKv), 16);
pedacos.push(cab);
for (const k of kvs) {
    const nome = Buffer.from(k.chave, 'utf8');
    const c = Buffer.alloc(8 + nome.length + 4);
    c.writeBigUInt64LE(BigInt(nome.length)); nome.copy(c, 8); c.writeUInt32LE(k.tipo, 8 + nome.length);
    pedacos.push(c, k.valor);
}
pedacos.push(...infos);
const cabeca = Buffer.concat(pedacos);
const dadosDepois = alinhar(cabeca.length);
const enchimento = Buffer.alloc(dadosDepois - cabeca.length);

const fora = fs.openSync(saida, 'w');
fs.writeSync(fora, cabeca); fs.writeSync(fora, enchimento);
const pedaco = Buffer.alloc(8 * 1024 * 1024);
let lido = dadosAntes;
while (lido < total) {
    const n = fs.readSync(fd, pedaco, 0, Math.min(pedaco.length, total - lido), lido);
    if (n <= 0) break;
    fs.writeSync(fora, pedaco, 0, n);
    lido += n;
}
fs.closeSync(fora); fs.closeSync(fd);
console.log(`  cabeçalho ${cabeca.length} B (dados em ${dadosDepois}, antes ${dadosAntes}) · ${saida}: ${fs.statSync(saida).size} B`);
