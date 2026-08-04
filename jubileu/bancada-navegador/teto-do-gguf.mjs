// Lê o cabeçalho GGUF e mostra onde cada tensor começa, para descobrir se o
// tensor que o llama.cpp recusou cai logo depois de algum limite conhecido.
import fs from 'node:fs';

const arquivo = process.argv[2];
const alvo = process.argv[3] ?? '';
const fd = fs.openSync(arquivo, 'r');
const tamanho = fs.statSync(arquivo).size;

const buf = Buffer.alloc(64 * 1024 * 1024);
fs.readSync(fd, buf, 0, buf.length, 0);
let p = 0;
const u32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; };
const u64 = () => { const v = buf.readBigUInt64LE(p); p += 8; return v; };
const str = () => { const n = Number(u64()); const s = buf.subarray(p, p + n).toString(); p += n; return s; };

if (buf.subarray(0, 4).toString() !== 'GGUF') throw new Error('não é GGUF');
p = 4;
const versao = u32();
const nTensores = Number(u64());
const nKv = Number(u64());

const lerValor = (tipo) => {
  switch (tipo) {
    case 0: return buf.readUInt8(p++);
    case 1: return buf.readInt8(p++);
    case 2: { const v = buf.readUInt16LE(p); p += 2; return v; }
    case 3: { const v = buf.readInt16LE(p); p += 2; return v; }
    case 4: return u32();
    case 5: { const v = buf.readInt32LE(p); p += 4; return v; }
    case 6: { const v = buf.readFloatLE(p); p += 4; return v; }
    case 7: return buf.readUInt8(p++) !== 0;
    case 8: return str();
    case 9: { const t = u32(); const n = Number(u64()); const a = []; for (let i = 0; i < n; i++) a.push(lerValor(t)); return a; }
    case 10: return u64();
    case 11: { const v = buf.readBigInt64LE(p); p += 8; return v; }
    case 12: { const v = buf.readDoubleLE(p); p += 8; return v; }
    default: throw new Error('tipo desconhecido ' + tipo);
  }
};

const kv = {};
for (let i = 0; i < nKv; i++) {
  const chave = str();
  const tipo = u32();
  const valor = lerValor(tipo);
  if (!Array.isArray(valor) || valor.length < 20) kv[chave] = valor;
}

const tensores = [];
for (let i = 0; i < nTensores; i++) {
  const nome = str();
  const nDims = u32();
  const dims = [];
  for (let d = 0; d < nDims; d++) dims.push(Number(u64()));
  const tipo = u32();
  const offset = Number(u64());
  tensores.push({ nome, dims, tipo, offset });
}

const alinhamento = Number(kv['general.alignment'] ?? 32);
const inicioDados = Math.ceil(p / alinhamento) * alinhamento;

console.log('arquivo        :', arquivo);
console.log('tamanho        :', tamanho.toLocaleString(), 'bytes');
console.log('versão GGUF    :', versao, '| tensores:', nTensores);
console.log('arquitetura    :', kv['general.architecture']);
console.log('início dos dados:', inicioDados.toLocaleString());
console.log('');

const LIMITES = [
  ['2^31 (int32 assinado)', 2 ** 31],
  ['2^32 (uint32)', 2 ** 32],
];

if (alvo) {
  const t = tensores.find((x) => x.nome === alvo);
  if (t) {
    const abs = inicioDados + t.offset;
    console.log(`${alvo}: offset relativo ${t.offset.toLocaleString()} → absoluto ${abs.toLocaleString()}`);
    for (const [nome, lim] of LIMITES) {
      console.log(`   ${abs > lim ? 'PASSA' : 'cabe '} de ${nome} (${lim.toLocaleString()})`);
    }
    const anterior = tensores.filter((x) => inicioDados + x.offset <= 2 ** 31).length;
    console.log(`   tensores que começam ANTES de 2^31: ${anterior} de ${nTensores}`);
  } else {
    console.log('tensor não encontrado:', alvo);
  }
}

// O primeiro tensor a cruzar cada limite conta a história inteira.
for (const [nome, lim] of LIMITES) {
  const primeiro = tensores.find((x) => inicioDados + x.offset > lim);
  console.log(primeiro
    ? `primeiro tensor depois de ${nome}: ${primeiro.nome} @ ${(inicioDados + primeiro.offset).toLocaleString()}`
    : `nenhum tensor passa de ${nome}`);
}
