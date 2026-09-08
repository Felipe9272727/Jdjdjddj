// Onde fica a BOCA no mapa de textura do Diabrete.
//
// O plano de boca ficava "desencaixado" e "quase no nariz" (palavras do dono do
// jogo). A saída que ele mesmo sugeriu é melhor: a boca não deve ser um objeto
// pousado na cara, deve ser PARTE da textura da cara. Para desenhar nela é
// preciso saber em que região do UV o rosto cai — e isso se mede, não se chuta.
import { readFileSync } from 'node:fs';
const buf = readFileSync('src/assets/models/diabrete.glb');
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 12, json = null, bin = null;
while (off < buf.byteLength) {
  const len = dv.getUint32(off, true), tipo = dv.getUint32(off + 4, true);
  const dados = buf.subarray(off + 8, off + 8 + len);
  if (tipo === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(dados));
  else if (tipo === 0x004e4942) bin = dados;
  off = off + 8 + len; off = off + ((4 - (off % 4)) % 4);
}
const bdv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
const prim = json.meshes[0].primitives[0];
function ler(nome, comp) {
  const acc = json.accessors[prim.attributes[nome]];
  const bv = json.bufferViews[acc.bufferView];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const passo = bv.byteStride ?? comp * 4;
  const out = new Float32Array(acc.count * comp);
  for (let i = 0; i < acc.count; i++)
    for (let c = 0; c < comp; c++) out[i * comp + c] = bdv.getFloat32(base + i * passo + c * 4, true);
  return out;
}
const P = ler('POSITION', 3);
const UV = ler('TEXCOORD_0', 2);
const N = P.length / 3;
console.log('vértices:', N);

// A cara: banda de altura do rosto, virada para a FRENTE (z alto), perto do eixo.
const faixas = [
  ['cara inteira ', (x,y,z) => y > 0.58 && y < 0.88 && z > 0.10],
  ['boca (y .60-.72)', (x,y,z) => y > 0.60 && y < 0.72 && z > 0.14 && Math.abs(x) < 0.14],
  ['olhos (y .74-.86)', (x,y,z) => y > 0.74 && y < 0.86 && z > 0.12 && Math.abs(x) < 0.22],
];
for (const [nome, dentro] of faixas) {
  let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9,n=0;
  for (let i=0;i<N;i++){
    const x=P[i*3],y=P[i*3+1],z=P[i*3+2];
    if(!dentro(x,y,z)) continue;
    n++; const u=UV[i*2], v=UV[i*2+1];
    u0=Math.min(u0,u);u1=Math.max(u1,u);v0=Math.min(v0,v);v1=Math.max(v1,v);
  }
  const r=(x)=>+x.toFixed(4);
  console.log(`${nome.padEnd(18)} n=${String(n).padStart(4)}  u ${n?r(u0):'-'}..${n?r(u1):'-'}   v ${n?r(v0):'-'}..${n?r(v1):'-'}`);
}
