// Verifica, SEM renderizar, pra que eixo-mundo o focinho aponta depois do wrap.
// Carrega o rig, aplica wrap.rotation.y, e mede o vetor tail→head (forward do corpo)
// e o eixo em que as patas fazem a passada. Forward do jogo = +Z.
import { readFileSync } from 'node:fs';
// stubs mínimos de browser pro GLTFLoader não morrer em textura (não precisamos dela)
globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:x';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const file = process.argv[2];
const wrapY = parseFloat(process.argv[3] ?? '0');
const buf = readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
  const c = gltf.scene;
  const wrap = new THREE.Group(); wrap.add(c); wrap.rotation.y = wrapY;
  wrap.updateMatrixWorld(true);
  // acha bones
  let head=null, tail=null, root=null; const feet={};
  c.traverse((o) => {
    if (o.isBone) {
      if (o.name==='head') head=o;
      if (o.name==='tail') tail=o;
      if (o.name==='root') root=o;
      if (['shFL','shFR','shBL','shBR'].includes(o.name)) feet[o.name]=o;
    }
  });
  const mixer = new THREE.AnimationMixer(c);
  const walk = gltf.animations.find(a => a.name.toLowerCase().includes('walk'))
            || gltf.animations.find(a => a.name.toLowerCase().includes('move'));
  const act = walk ? mixer.clipAction(walk) : null; if (act) act.play();
  const wp = (b) => { const v=new THREE.Vector3(); b.getWorldPosition(v); return v; };
  // forward do corpo (rest) = tail→head projetado no plano XZ
  mixer.setTime(0); wrap.updateMatrixWorld(true);
  const h = wp(head), t = wp(tail);
  const fwd = new THREE.Vector3(h.x - t.x, 0, h.z - t.z).normalize();
  console.log(`FILE ${file.split('/').pop()}  wrapY=${(wrapY/Math.PI).toFixed(2)}π`);
  console.log(`  FOCINHO(forward tail→head) = (${fwd.x.toFixed(2)}, ${fwd.z.toFixed(2)})  [+Z=${fwd.z.toFixed(2)} quer ~+1]`);
  // eixo da passada: amplitude do movimento das patas em X vs Z ao longo do walk
  const dur = walk.duration; const N=24;
  const track = {}; for (const k in feet) track[k]={x:[],z:[]};
  for (let i=0;i<N;i++){ mixer.setTime(dur*i/N); wrap.updateMatrixWorld(true);
    for (const k in feet){ const p=wp(feet[k]); track[k].x.push(p.x); track[k].z.push(p.z); } }
  let ampX=0, ampZ=0;
  for (const k in track){ ampX=Math.max(ampX, Math.max(...track[k].x)-Math.min(...track[k].x));
                          ampZ=Math.max(ampZ, Math.max(...track[k].z)-Math.min(...track[k].z)); }
  console.log(`  PASSADA amplitude  X=${ampX.toFixed(2)}  Z=${ampZ.toFixed(2)}  → passada no eixo ${ampZ>=ampX?'Z (=forward, CERTO)':'X (=lado, ERRADO)'}`);
}, (e) => { console.error('ERR', e); });
