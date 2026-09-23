/**
 * Exporta a cabeça do andar 12 para o bake de oclusão no Blender.
 *
 * Rodar (de dentro de jubileu/):
 *   npx tsx tools/blender/exportar-cabeca-para-bake.ts /tmp/cabeca.json
 *   python3 tools/blender/bake_concierge_ao.py /tmp/cabeca.json
 *
 * O RECEPTOR é a malha do rosto exatamente como o jogo a monta
 * (`createConciergeGeometry`, já estreitada), na mesma ordem de vértices: o
 * bake devolve um valor por vértice e o jogo casa os dois pelo índice.
 *
 * Os OCLUSORES são as peças presas à cabeça que fazem sombra no rosto — quepe,
 * arcadas, poços dos olhos, dentes, mandíbula fechada, casco. As posições são
 * cópia das de `Floor12Cabeca`, `Floor12Facework` e `Floor12BossCrown`, no
 * referencial local da cabeça (antes do `ESCALA / R`). Mexeu numa peça dessas,
 * rode o bake de novo; o teste da oclusão só pega mudança no rosto.
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { createConciergeGeometry } from '../../src/f12ConciergeGeometry';
import { createConciergeSkull, createConciergeJaw, createConciergeTooth } from '../../src/f12HeadDetails';
import { BOCA_ABAIXO_DO_CENTRO } from '../../src/f12Boss';

type V3 = [number, number, number];
const R = 3.6, ESCALA = 7.2;

const raiz = new THREE.Group();
const grupo = (pai: THREE.Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) => {
    const g = new THREE.Group();
    g.position.set(...p); g.rotation.set(...r); g.scale.set(...s);
    pai.add(g); return g;
};
const peca = (pai: THREE.Object3D, nome: string, geo: THREE.BufferGeometry,
    p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) => {
    const m = new THREE.Mesh(geo); m.name = nome;
    m.position.set(...p); m.rotation.set(...r); m.scale.set(...s);
    pai.add(m); return m;
};

// ── O casco (Floor12Cabeca, fora do grupo do rosto) ──────────────────────
peca(raiz, 'cranio', createConciergeSkull());

// ── O rosto e o que anda junto com ele (grupo `face`, em repouso) ────────
const rosto = grupo(raiz);
const receptor = createConciergeGeometry();

// Floor12BossCrown
const quepe = grupo(rosto, [0, 3.19, -.08], [0, 0, -.025], [.94, .88, .95]);
peca(quepe, 'quepe-copa', new THREE.CylinderGeometry(3.08, 3.38, 1.40, 48), [0, .60, -.05], [0, 0, 0], [1, 1, .81]);
peca(quepe, 'quepe-faixa', new THREE.CylinderGeometry(3.38, 3.31, .28, 48), [0, .04, .02], [0, 0, 0], [1, 1, .84]);
const aba = new THREE.Shape();
aba.moveTo(-3.15, 0); aba.quadraticCurveTo(0, -1.25, 3.15, 0);
aba.quadraticCurveTo(0, .65, -3.15, 0);
peca(quepe, 'quepe-aba', new THREE.ExtrudeGeometry(aba, { depth: .18, bevelEnabled: true,
    bevelThickness: .06, bevelSize: .06, bevelSegments: 2, curveSegments: 20 }),
    [0, -.07, 2.3], [-Math.PI / 2 + .12, 0, 0]);
peca(grupo(quepe, [0, .56, 2.65]), 'quepe-insignia', new THREE.BoxGeometry(.9, .9, .9),
    [0, 0, 0], [0, 0, Math.PI / 4], [.75, .9, .18]);

// Floor12Facework (o rosto em si é o receptor, não entra aqui)
for (const lado of [-1, 1]) {
    peca(rosto, 'poco-da-mascara', new THREE.SphereGeometry(1, 24, 16), [lado * 1.55, 1.15, 2.62], [0, 0, 0], [1.01, .71, .18]);
    peca(rosto, 'capsula-lateral', new THREE.CapsuleGeometry(.22, 1.30, 4, 12), [lado * 2.95, -.48, 1.68], [0, 0, lado * -.10]);
    peca(rosto, 'articulacao', new THREE.CylinderGeometry(.37, .37, .15, 12), [lado * 2.36, -1.38, 2.42], [Math.PI / 2, 0, 0]);
    peca(rosto, 'articulacao-anel', new THREE.TorusGeometry(.28, .055, 6, 16), [lado * 2.36, -1.38, 2.53]);
}

// Floor12Cabeca: têmporas, olhos e arcadas
peca(rosto, 'temporas', new THREE.SphereGeometry(R * .70, 16, 10), [0, R * .25, -R * .25]);
const arcada = new THREE.Shape();
arcada.moveTo(-.9, -.12); arcada.quadraticCurveTo(0, .4, .9, .08);
arcada.lineTo(.85, -.12); arcada.quadraticCurveTo(0, .06, -.9, -.28);
arcada.closePath();
const arcadaGeo = new THREE.ExtrudeGeometry(arcada, { depth: .18, bevelEnabled: true,
    bevelSize: .05, bevelThickness: .04, bevelSegments: 2 });
for (const lado of [-1, 1]) {
    const olho = grupo(rosto, [lado * 1.55, 1.15, 3.26]);
    peca(olho, 'olho-poco', new THREE.SphereGeometry(1, 10, 6), [0, 0, -.15], [0, 0, 0], [1.02, .71, .18]);
    const lente = grupo(olho, [0, 0, .10]);
    peca(lente, 'olho-aro', new THREE.TorusGeometry(.36, .065, 7, 20));
    peca(lente, 'olho-lente', new THREE.SphereGeometry(.22, 16, 10), [0, 0, 0], [0, 0, 0], [1, 1, .52]);
    // Em repouso a arcada esquerda gira -0,24 e a direita +0,24 (o laço de quadro).
    peca(rosto, 'arcada', arcadaGeo, [lado * 1.55, 2.05, 3.30], [0, 0, lado * .24], [1.14, .96, 1.05]);
}

// ── A boca, de boca FECHADA: é a pose em que a cabeça passa mais tempo ──
const boca = grupo(raiz, [0, -BOCA_ABAIXO_DO_CENTRO / (ESCALA / R), R * .42]);
peca(boca, 'garganta-fundo', new THREE.SphereGeometry(1, 32, 20), [0, -.12, -.35], [0, 0, 0], [2.38, 1.65, .72]);
peca(boca, 'garganta', new THREE.SphereGeometry(.72, 20, 14), [0, -.2, .15], [0, 0, 0], [.85, .85, .85]);
const reator = grupo(boca, [0, -.2, .48]);
peca(reator, 'reator', new THREE.TorusGeometry(1.23, .22, 8, 28));
peca(reator, 'reator-brasa', new THREE.TorusGeometry(1.18, .065, 6, 28), [0, 0, .06]);
const dente = createConciergeTooth();
const fileira = [-1.75, -1.05, -0.35, 0.35, 1.05, 1.75];
for (const x of fileira) peca(boca, 'dente-de-cima', dente, [x, .84, 1.06 - x * x * .055], [0, -x * .055, 0]);
const mandibula = grupo(boca, [0, .5, -.9]);
peca(mandibula, 'mandibula', createConciergeJaw(), [0, -.75, 1.15]);
for (const x of fileira) peca(mandibula, 'dente-de-baixo', dente, [x, -.18, 2.10 - x * x * .055], [0, -x * .055, Math.PI]);

raiz.updateMatrixWorld(true);

const achatar = (geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    const pos = Array.from(g.getAttribute('position').array as Float32Array, v => +v.toFixed(5));
    const idx = Array.from({ length: pos.length / 3 }, (_, i) => i);
    g.dispose();
    return { pos, idx };
};

const oclusores: { nome: string; pos: number[]; idx: number[] }[] = [];
raiz.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    oclusores.push({ nome: o.name, ...achatar(o.geometry, o.matrixWorld) });
});

const destino = process.argv[2];
if (!destino) throw new Error('Uso: tsx exportar-cabeca-para-bake.ts <saida.json>');
writeFileSync(destino, JSON.stringify({
    receptor: {
        pos: Array.from(receptor.getAttribute('position').array as Float32Array, v => +v.toFixed(5)),
        idx: Array.from(receptor.index!.array as Uint16Array),
    },
    oclusores,
}));
console.log(`receptor: ${receptor.getAttribute('position').count} vértices; oclusores: ${oclusores.length} peças`);
