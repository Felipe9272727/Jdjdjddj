/**
 * f13Fundir.ts — funde o cenário parado de Vindhjem em poucas malhas.
 *
 * O mundo é montado em JSX peça por peça (tábuas de ponte, mourões, escudos,
 * frutas na barraca…): eram ~340 malhas, cada uma uma chamada de desenho — e
 * outra na passada de sombra. Depois de montado, `fundirEstaticos` junta as
 * que dividem o mesmo material (mesma cor, mapas, rugosidade…) e a mesma
 * célula do mapa numa geometria só, e esconde as originais. A célula mantém o
 * recorte por câmera funcionando: nada vira uma malha do tamanho do mundo.
 *
 * Fica de fora tudo que se mexe ou é procurado pelo nome: marque o grupo com
 * `userData={{ vivo: true }}` (a porta, o sino, a fumaça, os barcos…).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Material só de cor (sem mapa de cor, sem cor por vértice, opaco): a cor pode
 * ir para o vértice, e peças de cores diferentes com o mesmo resto do
 * material viram uma malha só (as tábuas, mourões, frutas e escudos de cada
 * tom eram cada uma a sua chamada de desenho).
 */
function tingivel(m: THREE.Material): m is THREE.MeshStandardMaterial {
    return m instanceof THREE.MeshStandardMaterial && !m.map && !m.vertexColors && !m.transparent;
}
function chaveDoMaterial(m: THREE.Material): string | null {
    const s = m as THREE.MeshStandardMaterial & THREE.MeshPhysicalMaterial & THREE.MeshBasicMaterial;
    if (!(m instanceof THREE.MeshStandardMaterial) && !(m instanceof THREE.MeshBasicMaterial)) return null;
    if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return null;
    return [m.type, tingivel(m) ? 'tinta' : s.color?.getHexString(), s.emissive?.getHexString(), s.emissiveIntensity, s.roughness, s.metalness,
        s.map?.uuid, s.normalMap?.uuid, s.roughnessMap?.uuid, s.normalScale?.x, s.flatShading, m.side, m.transparent,
        m.opacity, m.vertexColors, m.toneMapped, m.depthWrite, s.envMapIntensity, s.clearcoat].join('|');
}

/** Os atributos são todos float comuns (malha quantizada de GLB fica de fora). */
function chaveDaGeometria(g: THREE.BufferGeometry, tinta = false): string | null {
    // tingida: sem mapa, a uv não conta, e a cor entra no vértice
    const nomes = Object.keys(g.attributes).filter((n) => !tinta || (n !== 'uv' && n !== 'color')).sort();
    for (const n of nomes) {
        const a = g.getAttribute(n) as THREE.BufferAttribute;
        if (!(a.array instanceof Float32Array) || a.normalized || (a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
    }
    if (Object.keys(g.morphAttributes).length) return null;
    return nomes.join(',') + (tinta ? ',color#n' : g.index ? '#i' : '#n');
}

/**
 * Funde as malhas paradas debaixo de `raiz` (no espaço dela). Devolve a
 * função que desfaz (mostra as originais de novo e descarta o que criou).
 * `celula` (m) separa o mapa em quadras para o recorte por câmera; num objeto
 * pequeno (um barco, uma casa) fica infinita: tudo numa malha por material.
 */
export function fundirEstaticos(raiz: THREE.Object3D, celula = Infinity): () => void {
    raiz.updateMatrixWorld(true);
    const inv = raiz.matrixWorld.clone().invert();
    const grupos = new Map<string, { mat: THREE.Material; malhas: THREE.Mesh[] }>();
    const visita = (o: THREE.Object3D) => {
        if (o !== raiz && o.userData.vivo) return;
        const m = o as THREE.Mesh;
        if (m.isMesh && m.visible && !(m as THREE.SkinnedMesh).isSkinnedMesh && !(m as THREE.InstancedMesh).isInstancedMesh
            && !Array.isArray(m.material) && !m.name) {
            const mat = m.material as THREE.Material;
            const km = chaveDoMaterial(mat), kg = chaveDaGeometria(m.geometry, tingivel(mat) && !m.geometry.getAttribute('uv2'));
            if (km && kg) {
                const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
                const k = isFinite(celula) ? `${km}§${kg}§${Math.floor(p.x / celula)}:${Math.floor(p.z / celula)}` : `${km}§${kg}`;
                let gr = grupos.get(k); if (!gr) grupos.set(k, gr = { mat: m.material as THREE.Material, malhas: [] });
                gr.malhas.push(m);
            }
        }
        // um filho invisível esconde a subárvore inteira: não fundir o que está apagado
        if (o.visible) for (const c of o.children) visita(c);
    };
    visita(raiz);

    const criadas: THREE.Mesh[] = [], escondidas: THREE.Mesh[] = [];
    const rel = new THREE.Matrix4();
    for (const { mat, malhas } of grupos.values()) {
        if (malhas.length < 2) continue;
        const tinta = tingivel(mat);
        const geos = malhas.map((m) => {
            rel.multiplyMatrices(inv, m.matrixWorld);
            let g = m.geometry.clone().applyMatrix4(rel);
            // espelhado (escala negativa): o enrolamento das faces inverte
            if (rel.determinant() < 0 && g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
            for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
            if (tinta) {
                if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
                g.deleteAttribute('uv');
                const c = (m.material as THREE.MeshStandardMaterial).color, n = g.getAttribute('position').count, a = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
                g.setAttribute('color', new THREE.BufferAttribute(a, 3));
            }
            g.clearGroups();
            return g;
        });
        const junta = mergeGeometries(geos, false);
        geos.forEach((g) => g.dispose());
        if (!junta) continue;
        junta.computeBoundingSphere();
        let usar = mat;
        if (tinta) { const t = (mat as THREE.MeshStandardMaterial).clone(); t.color.set('#ffffff'); t.vertexColors = true; t.userData.tinta = true; usar = t; }
        const nova = new THREE.Mesh(junta, usar);
        nova.castShadow = malhas.some((m) => m.castShadow);
        nova.receiveShadow = true;
        nova.userData.fundida = true;
        raiz.add(nova); criadas.push(nova);
        for (const m of malhas) { m.visible = false; escondidas.push(m); }
    }
    return () => {
        for (const n of criadas) { raiz.remove(n); n.geometry.dispose(); if ((n.material as THREE.Material).userData.tinta) (n.material as THREE.Material).dispose(); }
        for (const m of escondidas) m.visible = true;
    };
}
