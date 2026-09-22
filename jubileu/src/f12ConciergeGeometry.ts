import * as THREE from 'three';
import { conciergeVertices, conciergeTriangles } from './f12ConciergeMesh';

/** Blender export uses little-endian millimetres; decode once per mounted face. */
export function createConciergeGeometry(): THREE.BufferGeometry {
  const decode = (encoded: string) => {
    const raw = atob(encoded);
    return new DataView(Uint8Array.from(raw, c => c.charCodeAt(0)).buffer);
  };
  const vertices = decode(conciergeVertices), triangles = decode(conciergeTriangles);
  if (vertices.byteLength % 6 || triangles.byteLength % 6) throw new Error('Invalid concierge mesh.');
  const positions = new Float32Array(vertices.byteLength / 2);
  for (let i = 0; i < positions.length; i++) positions[i] = vertices.getInt16(i * 2, true) / 1000;
  // A máscara exportada é muito circular na vista frontal. Afinar os planos
  // inferiores deixa o casco de metal à mostra e cria uma silhueta de concierge
  // mecânico sem deslocar olhos, dentes, pivôs ou a área de acerto da boca.
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1];
    const lower = 1 - THREE.MathUtils.smoothstep(y, -1.75, 1.3);
    positions[i] = x * (1 - .20 * lower);
    positions[i + 2] -= .16 * lower * THREE.MathUtils.smoothstep(Math.abs(x), 1.1, 3);
    const cheek = THREE.MathUtils.smoothstep(Math.abs(x), 1.3, 2.9);
    const shade = 1 - .30 * cheek - .06 * lower;
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
