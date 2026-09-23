import * as THREE from 'three';
import { conciergeVertices, conciergeTriangles } from './f12ConciergeMesh';
import { conciergeAO } from './f12ConciergeAO';

/**
 * Quanto da oclusão assada entra na cor. 1 seria o valor cru do Cycles: o
 * fundo das órbitas vai a zero e a porcelana vira buraco. Com 0,85 o fundo
 * para em 15% da cor — escuro o bastante para a lente acender contra ele.
 */
export const DOSE_DA_OCLUSAO = .85;

/** Blender export uses little-endian millimetres; decode once per mounted face. */
export function createConciergeGeometry(): THREE.BufferGeometry {
  const decode = (encoded: string) => {
    const raw = atob(encoded);
    return new DataView(Uint8Array.from(raw, c => c.charCodeAt(0)).buffer);
  };
  const vertices = decode(conciergeVertices), triangles = decode(conciergeTriangles), ao = decode(conciergeAO);
  if (vertices.byteLength % 6 || triangles.byteLength % 6) throw new Error('Invalid concierge mesh.');
  const positions = new Float32Array(vertices.byteLength / 2);
  for (let i = 0; i < positions.length; i++) positions[i] = vertices.getInt16(i * 2, true) / 1000;
  // A máscara exportada é muito circular na vista frontal. Afinar os planos
  // inferiores deixa o casco de metal à mostra e cria uma silhueta de concierge
  // mecânico sem deslocar olhos, dentes, pivôs ou a área de acerto da boca.
  const colors = new Float32Array(positions.length);
  // ── A LUZ ASSADA ──────────────────────────────────────────────────────
  // Um byte por vértice de oclusão ambiente, calculada com raios de verdade
  // no Cycles (tools/blender/bake_concierge_ao.py) contra o próprio rosto,
  // o quepe, as arcadas, os poços dos olhos e a boca fechada. É o que tira a
  // cara do plástico chapado: as órbitas afundam, a aba do quepe pesa na
  // testa, as narinas e a boca ganham fundo — sem custar nada por quadro.
  // Malha e bake descasados (alguém mexeu no rosto e não assou de novo)
  // voltam ao rosto sem oclusão; o teste da oclusão é quem acusa.
  const assada = ao.byteLength === positions.length / 3;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1];
    const lower = 1 - THREE.MathUtils.smoothstep(y, -1.75, 1.3);
    positions[i] = x * (1 - .20 * lower);
    positions[i + 2] -= .16 * lower * THREE.MathUtils.smoothstep(Math.abs(x), 1.1, 3);
    const cheek = THREE.MathUtils.smoothstep(Math.abs(x), 1.3, 2.9);
    const oclusao = assada ? 1 - DOSE_DA_OCLUSAO * (1 - ao.getUint8(i / 3) / 255) : 1;
    const shade = (1 - .30 * cheek - .06 * lower) * oclusao;
    colors[i] = shade;
    colors[i + 1] = shade * (1 - .035 * cheek);
    colors[i + 2] = shade * (1 - .075 * cheek);
  }
  const indices = new Uint16Array(triangles.byteLength / 2);
  for (let i = 0; i < indices.length; i++) {
    indices[i] = triangles.getUint16(i * 2, true);
    if (indices[i] >= positions.length / 3) throw new Error('Invalid concierge triangle.');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
