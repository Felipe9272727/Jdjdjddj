import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Five overlapping lobes, baked shading, one instanced draw; no transparent overdraw. */
export function createCloudGeometry() {
  // Oito lobos (eram cinco) e mais gomos por lobo: a nuvem deixa de ser
  // "bolhas" e ganha couve-flor — o que o olho lê como cúmulo.
  const lobes = [
    [0, 0, 0, .80, .60, .75],
    [-.60, -.10, .05, .63, .44, .60],
    [.58, -.13, -.10, .68, .42, .55],
    [-.22, .40, -.04, .57, .64, .53],
    [.36, .26, .24, .47, .50, .51],
    [.05, .62, .10, .38, .40, .38],
    [-.85, -.25, -.10, .40, .30, .42],
    [.86, -.28, .12, .42, .30, .40],
  ];
  const pieces = lobes.map(([x, y, z, sx, sy, sz]) => {
    const part = new THREE.SphereGeometry(1, 12, 8);
    part.scale(sx, sy, sz); part.translate(x, y, z);
    return part;
  });
  const geometry = mergeGeometries(pieces, false)!;
  pieces.forEach(p => p.dispose());
  const positions = geometry.getAttribute('position');
  // TEXTURA na forma: cada vértice é empurrado por um ruído de três oitavas,
  // então a superfície encaroça como vapor em vez de brilhar lisa como bola.
  const ruido = (x: number, y: number, z: number) =>
    Math.sin(x * 7.1 + y * 3.3) * Math.cos(z * 6.7 - x * 2.1) * .5
    + Math.sin(x * 15.3 - z * 11.7 + y * 9.1) * .3
    + Math.sin(y * 23.9 + z * 19.3) * .2;
  const v = new THREE.Vector3();
  const encaroco = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    const n = ruido(v.x, v.y, v.z);
    encaroco[i] = n;
    v.multiplyScalar(1 + n * .07);
    positions.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
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
    // Borda quente mais forte (era .30): sem ela a nuvem lia como plástico
    // malva chapado; com o sol do poente contornando o topo, lê como vapor.
    color.lerp(sunset, rim * .55);
    const topo = THREE.MathUtils.smoothstep(positions.getY(i), .35, .95);
    color.lerp(new THREE.Color('#f3d2b4'), topo * .35);
    // os vales do encaroçado ficam mais escuros: sombra de contato entre gomos
    color.multiplyScalar(.86 + .14 * THREE.MathUtils.clamp(encaroco[i] + .5, 0, 1));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
