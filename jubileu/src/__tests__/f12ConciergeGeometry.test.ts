import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createConciergeGeometry } from '../f12ConciergeGeometry';
import { conciergeVertices } from '../f12ConciergeMesh';

const finite = (n: number) => Number.isFinite(n);

/**
 * O export CRU do Blender, antes do afinamento que `createConciergeGeometry`
 * passou a aplicar. Decodificado aqui do mesmo jeito que a produção decodifica
 * (base64, int16 little-endian, milímetros), para os dois testes abaixo poderem
 * separar "o dado está na escala autoral" de "o afinamento fez o que prometeu".
 */
function posicoesCruas(): Float32Array {
    const raw = atob(conciergeVertices);
    const dv = new DataView(Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer);
    const out = new Float32Array(dv.byteLength / 2);
    for (let i = 0; i < out.length; i++) out[i] = dv.getInt16(i * 2, true) / 1000;
    return out;
}

function hitsAlongZ(geometry: THREE.BufferGeometry, x: number, y: number) {
    // DoubleSide keeps this structural aperture check independent of winding.
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
    return ray.intersectObject(mesh, false);
}

describe('Floor 12 Blender concierge mesh', () => {
    it('decodes finite normals and valid indexed triangles', () => {
        const geometry = createConciergeGeometry();
        const position = geometry.getAttribute('position');
        const normal = geometry.getAttribute('normal');
        const index = geometry.getIndex();
        expect(position.count).toBe(5075);
        expect(index?.count).toBe(30462);
        expect(Array.from(position.array as ArrayLike<number>).every(finite)).toBe(true);
        expect(Array.from(normal.array as ArrayLike<number>).every(finite)).toBe(true);
        expect(Array.from(index!.array as ArrayLike<number>).every((i) => i < position.count)).toBe(true);
        geometry.dispose();
    });

    // ── ESTE TESTE FICOU VERMELHO, E O ERRADO ERA O NÚMERO, NÃO A MALHA ────
    //
    // Ele fixava a caixa da geometria FINAL em ±2,951. Depois disso, um
    // polimento deliberado ("a máscara exportada é muito circular na vista
    // frontal") passou a afinar os planos inferiores em até 20% — e a caixa
    // final virou ±2,807. A malha estava certa; o número é que tinha ficado
    // velho.
    //
    // Só trocar 2,951 por 2,807 perderia o que o teste protegia: a ESCALA DO
    // DECODE. Então agora são duas perguntas separadas. O dado cru continua
    // preso aos números autorais — se o decode errar a escala, é aqui que
    // quebra. E a geometria final ganha seus próprios números, junto com a
    // promessa do afinamento, que virou teste logo abaixo.
    it('o export cru está na escala autoral do Blender', () => {
        const p = posicoesCruas();
        const box = new THREE.Box3().setFromArray(p);
        expect(box.min.x).toBeCloseTo(-2.951, 3);
        expect(box.min.y).toBeCloseTo(-1.175, 3);
        expect(box.min.z).toBeCloseTo(1.55, 3);
        expect(box.max.x).toBeCloseTo(2.951, 3);
        expect(box.max.y).toBeCloseTo(3.422, 3);
        expect(box.max.z).toBeCloseTo(3.864, 3);
        const authoredRootScale = 7.2 / 3.6;
        expect(box.getSize(new THREE.Vector3()).x * authoredRootScale).toBeCloseTo(11.804, 3);
    });

    it('o afinamento estreita só a metade de baixo, e não move olhos nem dentes', () => {
        const geometry = createConciergeGeometry();
        const final = geometry.getAttribute('position').array as ArrayLike<number>;
        const cru = posicoesCruas();

        // Se o afinamento mudar de propósito outra vez, estes números mudam
        // junto — e são os ÚNICOS que devem mudar: os do teste de cima, não.
        const box = geometry.boundingBox!;
        expect(box.min.x).toBeCloseTo(-2.807, 3);
        expect(box.max.x).toBeCloseTo(2.807, 3);
        expect(box.min.z).toBeCloseTo(1.448, 3);
        expect(box.min.y).toBeCloseTo(-1.175, 3);
        expect(box.max.y).toBeCloseTo(3.422, 3);
        expect(box.max.z).toBeCloseTo(3.864, 3);

        // A promessa do commit do afinamento: "sem deslocar olhos, dentes,
        // pivôs ou a área de acerto da boca". O afinamento pesa zero a partir
        // de y = 1,3 — então tudo daí para cima tem de ser IDÊNTICO ao export.
        let acima = 0;
        for (let i = 0; i < cru.length; i += 3) {
            if (cru[i + 1] < 1.3) continue;
            acima++;
            expect(final[i]).toBe(cru[i]);
            expect(final[i + 1]).toBe(cru[i + 1]);
            expect(final[i + 2]).toBe(cru[i + 2]);
        }
        expect(acima).toBeGreaterThan(1000);
        geometry.dispose();
    });

    it('keeps the animated eye sockets and mouth target open while retaining nose and cheeks', () => {
        const geometry = createConciergeGeometry();
        // Front-facing rays use the Blender/game +Z convention. Eye and mouth
        // rays must pass through the carved shell; nose and cheek rays must hit.
        expect(hitsAlongZ(geometry, -1.55, 1.15)).toHaveLength(0);
        expect(hitsAlongZ(geometry, 1.55, 1.15)).toHaveLength(0);
        expect(hitsAlongZ(geometry, 0, -1.95)).toHaveLength(0);
        expect(hitsAlongZ(geometry, 0, 0.30).length).toBeGreaterThan(0);
        expect(hitsAlongZ(geometry, -2.13, -0.12).length).toBeGreaterThan(0);
        expect(hitsAlongZ(geometry, 2.13, -0.12).length).toBeGreaterThan(0);
        geometry.dispose();
    });
});
