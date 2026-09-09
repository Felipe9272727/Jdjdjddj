import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type HeadProps = { speaking?: boolean; expression?: number; blink?: number };
const INK = '#141014';
const CREAM = '#f2e7ce';
const RX = 1.04, RY = 1, RZ = 0.91;

function front(x: number, y: number, lift = 0.012) {
  return RZ * Math.sqrt(Math.max(0.012, 1 - (x / RX) ** 2 - (y / RY) ** 2)) + lift;
}

// Subdivide before projecting: every feature follows the skull, even in profile.
function curvedShape(shape: THREE.Shape, lift = 0.015, subdivisions = 2) {
  const source = new THREE.ShapeGeometry(shape, 20).toNonIndexed();
  const positions = source.getAttribute('position');
  const vertices: number[] = [], normals: number[] = [];
  const emit = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth: number) => {
    if (depth) {
      const ab = a.clone().add(b).multiplyScalar(0.5);
      const bc = b.clone().add(c).multiplyScalar(0.5);
      const ca = c.clone().add(a).multiplyScalar(0.5);
      emit(a, ab, ca, depth - 1); emit(ab, b, bc, depth - 1);
      emit(ca, bc, c, depth - 1); emit(ab, bc, ca, depth - 1);
      return;
    }
    for (const p of [a, b, c]) {
      const z = front(p.x, p.y, lift);
      const n = new THREE.Vector3(p.x / (RX * RX), p.y / (RY * RY), (z - lift) / (RZ * RZ)).normalize();
      vertices.push(p.x, p.y, z); normals.push(n.x, n.y, n.z);
    }
  };
  for (let i = 0; i < positions.count; i += 3) {
    emit(new THREE.Vector2(positions.getX(i), positions.getY(i)),
      new THREE.Vector2(positions.getX(i + 1), positions.getY(i + 1)),
      new THREE.Vector2(positions.getX(i + 2), positions.getY(i + 2)), subdivisions);
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

function faceMask() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.035);
  s.bezierCurveTo(-0.13, 0.15, -0.28, 0.62, -0.48, 0.66);
  s.bezierCurveTo(-0.7, 0.68, -0.86, 0.37, -0.92, 0.04);
  s.bezierCurveTo(-0.96, -0.06, -0.99, -0.12, -0.96, -0.24);
  s.bezierCurveTo(-0.87, -0.61, -0.55, -0.92, 0, -0.965);
  s.bezierCurveTo(0.53, -0.93, 0.87, -0.61, 0.97, -0.25);
  s.bezierCurveTo(1, -0.12, 0.95, -0.02, 0.92, 0.08);
  s.bezierCurveTo(0.85, 0.43, 0.72, 0.69, 0.51, 0.69);
  s.bezierCurveTo(0.31, 0.7, 0.15, 0.19, 0, -0.035);
  s.closePath();
  return curvedShape(s, 0.02, 3);
}

function eye(side: number) {
  const s = new THREE.Shape();
  const x = (v: number) => side * v;
  s.moveTo(x(0.29), -0.10);
  s.bezierCurveTo(x(0.3), 0.08, x(0.4), 0.35, x(0.48), 0.38);
  s.bezierCurveTo(x(0.59), 0.32, x(0.66), 0.06, x(0.64), -0.15);
  s.bezierCurveTo(x(0.63), -0.36, x(0.53), -0.46, x(0.43), -0.41);
  s.bezierCurveTo(x(0.33), -0.38, x(0.28), -0.24, x(0.29), -0.10);
  return curvedShape(s, 0.033, 2);
}

function stroke(points: number[][], width: number, lift = 0.045) {
  const path = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, front(x, y, lift))));
  return new THREE.TubeGeometry(path, 28, width, 6, false);
}

function tapered(points: number[][], radius: number, rings = 20, sides = 14) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])));
  const frames = curve.computeFrenetFrames(rings, false);
  const vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, center = curve.getPointAt(t);
    const r = Math.max(0.001, radius * Math.pow(1 - t, 0.79));
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      const p = center.clone().addScaledVector(frames.normals[i], Math.cos(angle) * r)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * r);
      vertices.push(p.x, p.y, p.z);
      if (i < rings && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function mouth() {
  const s = new THREE.Shape();
  s.moveTo(-0.24, -0.62);
  s.bezierCurveTo(0.03, -0.62, 0.38, -0.51, 0.66, -0.34);
  s.bezierCurveTo(0.59, -0.62, 0.25, -0.79, -0.05, -0.69);
  s.bezierCurveTo(-0.13, -0.67, -0.2, -0.64, -0.24, -0.62);
  return curvedShape(s, 0.04, 2);
}

function sculptAssets() {
    const mask = faceMask(), eyes = [-1, 1].map(eye);
    const brows = [-1, 1].map(side => stroke([[side * 0.29, 0.47], [side * 0.41, 0.59], [side * 0.54, 0.61], [side * 0.64, 0.51]], 0.016, 0.039));
    const lids = [-1, 1].map(side => stroke([[side * 0.24, -0.035], [side * 0.42, -0.065], [side * 0.62, -0.055], [side * 0.72, 0.002]], 0.022));
    const horns = [-1, 1].map(side => tapered([[side * 0.67, 0.65, -0.04], [side * 0.86, 0.92, -0.035], [side * 0.91, 1.2, -0.015], [side * 0.86, 1.52, 0]], 0.27));
    const tufts = [-1, 1].flatMap(side => [0, 1, 2].map(i => tapered(
      [[side * 0.86, 0.02 - i * 0.21, -0.10], [side * 1.08, -0.02 - i * 0.2, -0.06], [side * (1.19 - i * 0.045), 0.15 - i * 0.22, -0.03]], 0.19 - i * 0.02, 12, 10)));
    const grin = mouth();
    const teeth = stroke([[-0.20, -0.624], [0.08, -0.61], [0.39, -0.50], [0.63, -0.37]], 0.008, 0.056);
    const divisions = [
      [[-0.06, -0.626], [-0.04, -0.686]], [[0.10, -0.60], [0.13, -0.708]],
      [[0.28, -0.55], [0.31, -0.668]], [[0.44, -0.47], [0.46, -0.593]],
      [[0.55, -0.41], [0.57, -0.49]],
    ].map(p => stroke(p, 0.009, 0.066));
    const corners = stroke([[0.63, -0.37], [0.66, -0.345], [0.68, -0.38]], 0.012, 0.055);
    return { mask, eyes, brows, lids, horns, tufts, grin, teeth, divisions, corners };
}

export function createDiabreteSculpt() {
  const group = new THREE.Group();
  group.name = 'diabrete-sculpted-head';
  const assets = sculptAssets();
  const ink = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.76, side: THREE.DoubleSide });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.88, side: THREE.DoubleSide });
  const line = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.98, side: THREE.DoubleSide });
  const noseMaterial = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.4 });
  const geometries = new Set<THREE.BufferGeometry>();
  function add(geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const skull = add(new THREE.SphereGeometry(1, 56, 40), ink);
  skull.scale.set(RX, RY, RZ);
  for (const geometry of [...assets.horns, ...assets.tufts]) add(geometry, ink);
  add(assets.mask, cream);
  for (const geometry of [...assets.eyes, ...assets.brows, ...assets.lids]) add(geometry, line);
  const nose = add(new THREE.SphereGeometry(1, 24, 16), noseMaterial);
  nose.position.set(0, -0.41, front(0, -0.41, 0.074));
  nose.scale.set(0.126, 0.077, 0.09);
  add(assets.grin, line);
  const inside = assets.grin.clone();
  const innerPositions = inside.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < innerPositions.count; i++) {
    const x = 0.2 + (innerPositions.getX(i) - 0.2) * 0.93;
    const y = -0.565 + (innerPositions.getY(i) + 0.565) * 0.85;
    innerPositions.setXYZ(i, x, y, front(x, y, 0.047));
  }
  add(inside, cream);
  for (const geometry of [assets.teeth, ...assets.divisions, assets.corners]) add(geometry, line);
  const eyeBases = assets.eyes.map(g => Float32Array.from(g.getAttribute('position').array));
  let lastBlink = -1;
  function setBlink(amount: number) {
    const closed = THREE.MathUtils.clamp(amount, 0, 1);
    if (Math.abs(closed - lastBlink) < 0.001) return;
    lastBlink = closed;
    for (let j = 0; j < assets.eyes.length; j++) {
      const a = assets.eyes[j].getAttribute('position') as THREE.BufferAttribute;
      const base = eyeBases[j];
      for (let i = 0; i < a.count; i++) {
        const x = base[i * 3], y = -0.06 + (base[i * 3 + 1] + 0.06) * (1 - closed * 0.98);
        a.setXYZ(i, x, y, front(x, y, 0.033));
      }
      a.needsUpdate = true;
    }
  }
  const mouthGeometries = [assets.grin, inside, assets.teeth, ...assets.divisions, assets.corners];
  const mouthBases = mouthGeometries.map(g => Float32Array.from(g.getAttribute('position').array));
  let lastMouth = -1;
  function setMouth(amount: number) {
    const open = THREE.MathUtils.clamp(amount, 0, 1);
    if (Math.abs(open - lastMouth) < 0.001) return;
    lastMouth = open;
    for (let j = 0; j < mouthGeometries.length; j++) {
      const a = mouthGeometries[j].getAttribute('position') as THREE.BufferAttribute;
      const base = mouthBases[j];
      for (let i = 0; i < a.count; i++) {
        const x = base[i * 3], originalY = base[i * 3 + 1];
        const lowerLip = THREE.MathUtils.clamp((-originalY - 0.48) / 0.24, 0, 1);
        const y = originalY - open * lowerLip * 0.1;
        const lift = base[i * 3 + 2] - front(x, originalY, 0);
        a.setXYZ(i, x, y, front(x, y, lift));
      }
      a.needsUpdate = true;
    }
  }
  return {
    group, setBlink, setMouth,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of [ink, cream, line, noseMaterial]) material.dispose();
      group.clear();
    },
  };
}

/** A closed, round skull with facial inlays; local +Z is the face. */
export default function DiabreteSculptedHead({ speaking = false, expression = 0, blink }: HeadProps) {
  const sculpt = useMemo(createDiabreteSculpt, []);
  const root = useRef<THREE.Group>(null);
  useEffect(() => () => sculpt.dispose(), [sculpt]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, phase = t % 4.7;
    sculpt.setBlink(blink ?? (phase < 0.17 ? Math.sin(phase / 0.17 * Math.PI) : 0));
    sculpt.setMouth(speaking ? (0.5 + Math.sin(t * 13) * 0.5) : 0);
    if (root.current) root.current.rotation.z = expression * 0.035;
  });
  return <group ref={root}><primitive object={sculpt.group} /></group>;
}
