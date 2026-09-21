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
  const indices = new Uint16Array(triangles.byteLength / 2);
  for (let i = 0; i < indices.length; i++) {
    indices[i] = triangles.getUint16(i * 2, true);
    if (indices[i] >= positions.length / 3) throw new Error('Invalid concierge triangle.');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
