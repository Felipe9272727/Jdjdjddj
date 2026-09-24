/**
 * f13_enxugar.mjs — enxuga um morador pronto de Vindhjem para o celular.
 *
 *   NODE_PATH=<node_modules com @gltf-transform/*> node tools/f13_enxugar.mjs entrada.glb saida.glb
 *
 * Os GLBs de tools/blender/f13_humano.py saem com ~60 mil triângulos, e o andar
 * tem doze pessoas em cena (e a passada de sombra desenha tudo de novo). Sem
 * mexer no esqueleto: o meshoptimizer só colapsa arestas sobre vértices que já
 * existem, então os pesos de pele continuam válidos.
 *   • dentes fora (a boca nunca abre: 7 mil triângulos por pessoa);
 *   • colapso por peça: a calça por baixo da túnica e o corpo sob a roupa
 *     aguentam muito menos malha; cartões de cabelo e barba (com alfa) e as
 *     peças pequenas ficam como estão.
 */
import { createRequire } from 'module';
const require = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH + '/' : import.meta.url);
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { simplifyPrimitive, weld, prune, meshopt } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require('meshoptimizer');

const [entrada, saida] = process.argv.slice(2);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(entrada);

/** Fração dos triângulos que fica, por nome da malha. */
const RAZAO = [
    [/^pants_harem/, .25], [/_generic$/, .5], [/^sweater_fisherman/, .45], [/boots/, .4],
    [/^short02/, .6], [/^capa$/, .6], [/^Sphere$/, .6], [/^saia$/, .7],
];
const tris = (p) => (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
let antes = 0, depois = 0;
for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    if (/teeth/.test(mesh.getName()) || /teeth/.test(node.getName())) { node.dispose(); continue; }
}
await doc.transform(prune(), weld());
for (const mesh of doc.getRoot().listMeshes()) {
    const r = RAZAO.find(([re]) => re.test(mesh.getName()))?.[1];
    for (const prim of mesh.listPrimitives()) {
        antes += tris(prim);
        if (r) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: r, error: .008, lockBorder: true });
        depois += tris(prim);
    }
}
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(saida, doc);
console.log(`${entrada}: ${antes} -> ${depois} triângulos`);
