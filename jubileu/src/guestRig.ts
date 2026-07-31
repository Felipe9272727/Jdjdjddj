/**
 * guestRig.ts — esqueleto procedural para o GLB ESTÁTICO do Hóspede que Sabia
 * Demais (Meshy "Midnight Trenchcoat": 1 malha fundida, 7.6k verts, A-POSE,
 * y ∈ [-1, +1], sem ossos, sem animações).
 *
 * Mesmo padrão consagrado do pirateRig/diabreteRig: sintetiza o rig da nuvem
 * de vértices e vincula um SkinnedMesh em runtime — o GLB mantém o material
 * PBR original, só ganha skinning. Análise espacial DESTA malha:
 *
 *     y  0.62 → 1.00   cabeça (cabelo escuro)
 *     y  0.50 → 0.62   pescoço/gola do sobretudo
 *     y −0.08 → 0.62   torso + o SOBRETUDO (a saia do casaco desce até ~−0.55)
 *     braços em A-POSE: colunas diagonais além de |x| ≈ 0.21 (mãos em |x|≈0.45)
 *     y −1.00 → −0.52  canelas/sapatos visíveis sob a barra do casaco
 *
 * Regra de ouro herdada do capitão: a SAIA do sobretudo pertence ao TORSO,
 * não às pernas — o casaco balança inteiro enquanto os sapatos passeiam por
 * baixo; senão o pano rasga entre as coxas a cada passo.
 */
import * as THREE from 'three';

// ── índices dos ossos (mesma forma do pirata; neck no fim preserva índices) ──
export const enum GB { root, body, head, l_arm, r_arm, l_leg, r_leg, neck }

export interface GuestRig {
    group: THREE.Group;          // segura o SkinnedMesh vinculado
    bones: THREE.Bone[];         // indexe com GB.*
    /** posição LOCAL de descanso de cada osso (relativa ao pai) — anime
     *  offsetando daqui, nunca atribuindo posições absolutas. */
    restPos: THREE.Vector3[];
    dispose: () => void;
}

// posições de descanso em coordenadas nativas do GLB (pés em y=−1)
const BP: ReadonlyArray<readonly [number, number, number]> = [
    [0, -1.0, 0],      // root  — entre os pés
    [0, -0.02, 0],     // body  — pivô da cintura
    [0, 0.66, 0],      // head  — base do crânio
    [-0.20, 0.58, 0],  // l_arm — ombro esquerdo
    [0.20, 0.58, 0],   // r_arm — ombro direito
    [-0.09, -0.10, 0], // l_leg — quadril esquerdo
    [0.09, -0.10, 0],  // r_leg — quadril direito
    [0, 0.54, 0],      // neck  — entre body e head
];
const BPARENT = [-1, 0, 7, 1, 1, 0, 0, 1] as const;
const BNAME = ['g_root', 'g_body', 'g_head', 'g_l_arm', 'g_r_arm', 'g_l_leg', 'g_r_leg', 'g_neck'] as const;

function ss(v: number, lo: number, hi: number): number {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}

function paintWeights(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): { joints: Uint16Array; weights: Float32Array } {
    // via getX/getY — NUNCA pelo .array cru: o GLB do Meshy chega com atributos
    // intercalados, e ler o buffer direto devolve posições com stride errado
    // (pesos aleatórios → malha estilhaçada assim que um osso gira).
    const N = pos.count;
    const J = new Uint16Array(N * 4);
    const W = new Float32Array(N * 4);

    for (let i = 0; i < N; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const s = new Float32Array(8);

        // CABEÇA — bloco rígido acima da gola.
        s[GB.head] = ss(y, 0.56, 0.66);
        // PESCOÇO — faixa de transição que reparte o giro da cabeça (sem
        // cisalhar a gola do sobretudo numa dobra única).
        s[GB.neck] = ss(y, 0.44, 0.56) * (1 - ss(y, 0.56, 0.66));

        // BRAÇOS em A-POSE — tudo que foge da silhueta do torso (|x| ≳ 0.21)
        // na faixa vertical do braço (mãos ~y 0.0 até o ombro ~y 0.6). As
        // MANGAS vão junto; o peito/costas do casaco ficam no torso.
        const ax = Math.abs(x);
        const armY = ss(y, -0.12, 0.04) * (1 - ss(y, 0.52, 0.64));
        const armX = ss(ax, 0.20, 0.28);
        s[GB.l_arm] = armY * armX * (x < 0 ? 1 : 0);
        s[GB.r_arm] = armY * armX * (x > 0 ? 1 : 0);

        // PERNAS — só canelas/sapatos abaixo da BARRA do sobretudo (~y −0.55),
        // com zona morta no centro pra barra não rasgar entre os pés.
        const shinBand = 1 - ss(y, -0.60, -0.48);
        s[GB.l_leg] = shinBand * ss(0.02 - x, 0.0, 0.05);
        s[GB.r_leg] = shinBand * ss(0.02 + x, 0.0, 0.05);

        // TORSO — o resto: peito, costas e a saia inteira do sobretudo.
        const claimed = s[GB.l_arm] + s[GB.r_arm] + s[GB.l_leg] + s[GB.r_leg] + s[GB.head] + s[GB.neck];
        s[GB.body] = Math.max(0.03, (1 - ss(y, 0.5, 0.64)) * (1 - claimed));

        // ROOT — resíduo constante: nenhum vértice fica órfão.
        s[GB.root] = 0.005;

        const rank = [0, 1, 2, 3, 4, 5, 6, 7].sort((a, b) => s[b] - s[a]);
        let total = 0;
        for (let k = 0; k < 4; k++) total += s[rank[k]];
        if (total < 1e-8) total = 1;
        for (let k = 0; k < 4; k++) {
            J[i * 4 + k] = rank[k];
            W[i * 4 + k] = s[rank[k]] / total;
        }
    }
    return { joints: J, weights: W };
}

/** Monta o rig a partir do scene do GLTF carregado (clona geometria e
 *  material — a cache do useGLTF fica intacta). `null` se não achar malha. */
export function buildGuestRig(gltf: THREE.Object3D): GuestRig | null {
    let src: THREE.Mesh | null = null;
    gltf.traverse((o) => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
    if (!src) return null;
    const mesh = src as THREE.Mesh;

    const geo = mesh.geometry.clone();
    const { joints, weights } = paintWeights(geo.attributes.position);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));

    // material PBR original, acalmado pro clima da suíte (o bake Meshy deixava
    // o cabelo brilhando como vinil).
    const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const mat = srcMat ? srcMat.clone() : new THREE.MeshStandardMaterial({ color: 0x555555 });
    mat.roughness = Math.max(0.75, mat.roughness);
    mat.metalness = Math.min(0.05, mat.metalness);
    mat.envMapIntensity = 0.35;
    if (mat.map) { mat.map.anisotropy = 8; mat.map.needsUpdate = true; }

    const bones: THREE.Bone[] = BNAME.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
    bones.forEach((bone, i) => {
        const pi = BPARENT[i];
        if (pi >= 0) {
            bones[pi].add(bone);
            bone.position.set(BP[i][0] - BP[pi][0], BP[i][1] - BP[pi][1], BP[i][2] - BP[pi][2]);
        } else {
            bone.position.set(...BP[i]);
        }
    });
    const restPos = bones.map((b) => b.position.clone());

    const skeleton = new THREE.Skeleton(bones);
    const skinned = new THREE.SkinnedMesh(geo, mat);
    skinned.frustumCulled = false;
    skinned.add(bones[0]);
    skinned.bind(skeleton);
    skinned.normalizeSkinWeights();

    const group = new THREE.Group();
    group.add(skinned);

    return {
        group, bones, restPos,
        dispose: () => { skeleton.dispose(); geo.dispose(); mat.dispose(); },
    };
}
