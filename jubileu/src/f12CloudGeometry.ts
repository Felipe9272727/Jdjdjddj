import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Five overlapping lobes, baked shading, one instanced draw; no transparent overdraw. */
export function createCloudGeometry() {
  const lobes = [
    [0, 0, 0, .80, .60, .75],
    [-.60, -.10, .05, .63, .44, .60],
    [.58, -.13, -.10, .68, .42, .55],
    [-.22, .40, -.04, .57, .64, .53],
    [.36, .26, .24, .47, .50, .51],
  ];
  const pieces = lobes.map(([x, y, z, sx, sy, sz]) => {
    const part = new THREE.SphereGeometry(1, 10, 6);
    part.scale(sx, sy, sz); part.translate(x, y, z);
    return part;
  });
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach(p => p.dispose());
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  // Dusk-lit volumes separate from the pale porcelain and cyan projectiles.
  // Vertex colors stay opaque/instanced; no mobile overdraw or extra draw calls.
  const shade = new THREE.Color('#50516d');
  const light = new THREE.Color('#a49ab0');
  const sunset = new THREE.Color('#d2ad98');
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const sun = THREE.MathUtils.smoothstep(positions.getY(i) - positions.getX(i) * .15, -.58, 1.05);
    color.copy(shade).lerp(light, sun);
    const rim = THREE.MathUtils.smoothstep(positions.getY(i) - positions.getX(i) * .45, .10, .90);
    color.lerp(sunset, rim * .30);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
