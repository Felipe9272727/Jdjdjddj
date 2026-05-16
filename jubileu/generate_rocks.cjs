/**
 * Procedural rock GLB generator using Three.js + GLTFExporter.
 * Creates 4 models: rock_e, rock_f, stalactite, coral_rock
 */
const { Buffer } = require('buffer');
global.Buffer = Buffer;
const fs = require('fs');
const path = require('path');

// Minimal browser mocks for Three.js
class MockCanvas {
  constructor() { this.width = 1; this.height = 1; }
  getContext() { return null; }
}
global.HTMLCanvasElement = MockCanvas;
global.document = { createElement: () => new MockCanvas() };
global.window = { innerWidth: 1, innerHeight: 1 };
global.navigator = { userAgent: 'node' };
global.XMLHttpRequest = class { open() {} send() {} };
global.Image = class {};
global.HTMLImageElement = class {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
global.fetch = () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
global.createImageBitmap = () => Promise.resolve(null);
global.Worker = class { postMessage() {} terminate() {} };
global.ImageBitmap = class {};
global.OffscreenCanvas = class { constructor() {} getContext() { return null; } };

const THREE = require('./node_modules/three');
const { GLTFExporter } = require('./node_modules/three/examples/jsm/exporters/GLTFExporter.js');

const OUTPUT_DIR = path.join(__dirname, 'src/assets/models/rocks');
const PUBLIC_OUTPUT_DIR = path.join(__dirname, 'public/models/rocks');

// Deterministic pseudo-random
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Displace vertices of a geometry for rocky look
function displaceRock(geo, seed, intensity = 1.0, frequency = 1.0) {
  const rand = seededRandom(seed);
  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(normal, i);

    const r1 = (rand() - 0.5) * 2;
    const r2 = (rand() - 0.5) * 2;
    const r3 = (rand() - 0.5) * 2;

    const displacement = (
      Math.sin(v.x * frequency * 2.3 + r1 * 3) * 0.3 +
      Math.sin(v.y * frequency * 1.7 + r2 * 3) * 0.25 +
      Math.sin(v.z * frequency * 2.9 + r3 * 3) * 0.2 +
      Math.cos(v.x * frequency * 3.1 + v.y * frequency * 1.4) * 0.15 +
      (rand() - 0.5) * 0.15
    ) * intensity;

    v.x += n.x * displacement;
    v.y += n.y * displacement;
    v.z += n.z * displacement;

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── Rock E: Angular cliff face chunk ────────────────────────
function createRockE() {
  const geo = new THREE.DodecahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    y *= 1.5;
    z *= 0.6;
    const taper = 1.0 - Math.max(0, y) * 0.3;
    x *= taper;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  displaceRock(geo, 42, 0.25, 1.8);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x4a4a42,
    roughness: 0.92,
    metalness: 0.02,
  });
  return new THREE.Mesh(geo, mat);
}

// ─── Rock F: Smooth rounded boulder ────────────────────────
function createRockF() {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    y *= 0.75;
    x *= 1.15;
    z *= 1.1;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  displaceRock(geo, 77, 0.12, 1.2);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x555550,
    roughness: 0.88,
    metalness: 0.03,
  });
  return new THREE.Mesh(geo, mat);
}

// ─── Stalactite: Elongated cone pointing down ────────────────
function createStalactite() {
  const geo = new THREE.ConeGeometry(1, 1, 12, 8);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normalizedY = (y + 0.5);
    const radiusFactor = Math.pow(normalizedY, 0.5);

    if (Math.abs(x) > 0.01 || Math.abs(z) > 0.01) {
      const currentRadius = Math.sqrt(x * x + z * z);
      if (currentRadius > 0.001) {
        const targetRadius = currentRadius * radiusFactor;
        const scale = targetRadius / currentRadius;
        x *= scale;
        z *= scale;
      }
    }

    y = y * 3.0 + 1.5;

    const wave = Math.sin(y * 2.5 + x * 3) * 0.04 + Math.cos(z * 3.5 + y * 1.8) * 0.03;
    x += wave;
    z += wave;

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  displaceRock(geo, 123, 0.08, 2.5);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x5a5a52,
    roughness: 0.95,
    metalness: 0.01,
  });
  return new THREE.Mesh(geo, mat);
}

// ─── Coral Rock: Lumpy organic blob ────────────────────────
function createCoralRock() {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const bx1 = 0.5, by1 = 0.3, bz1 = 0.7;
    const bx2 = -0.4, by2 = -0.2, bz2 = 0.5;
    const bx3 = 0.2, by3 = -0.6, bz3 = -0.4;
    const bx4 = -0.3, by4 = 0.5, bz4 = -0.6;

    const dist1 = Math.sqrt((x-bx1)**2 + (y-by1)**2 + (z-bz1)**2);
    const dist2 = Math.sqrt((x-bx2)**2 + (y-by2)**2 + (z-bz2)**2);
    const dist3 = Math.sqrt((x-bx3)**2 + (y-by3)**2 + (z-bz3)**2);
    const dist4 = Math.sqrt((x-bx4)**2 + (y-by4)**2 + (z-bz4)**2);

    const bump = Math.exp(-dist1*dist1*3) * 0.35
               + Math.exp(-dist2*dist2*3) * 0.30
               + Math.exp(-dist3*dist3*3) * 0.25
               + Math.exp(-dist4*dist4*4) * 0.20;

    const r = Math.sqrt(x*x + y*y + z*z);
    if (r > 0.01) {
      const scale = (r + bump) / r;
      x *= scale;
      y *= scale;
      z *= scale;
    }

    y *= 0.65;

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  displaceRock(geo, 200, 0.1, 2.0);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x4a5248,
    roughness: 0.85,
    metalness: 0.02,
  });
  return new THREE.Mesh(geo, mat);
}

// ─── Export to GLB ──────────────────────────────────────────
async function exportGLB(mesh, filepath) {
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(mesh, (result) => {
      if (result instanceof ArrayBuffer) {
        fs.writeFileSync(filepath, Buffer.from(result));
        console.log(`  ✓ Written: ${filepath} (${(result.byteLength / 1024).toFixed(1)} KB)`);
        resolve();
      } else {
        reject(new Error('Unexpected JSON output, expected binary'));
      }
    }, (error) => {
      console.error(`  ✗ Error exporting ${filepath}:`, error);
      reject(error);
    }, { binary: true });
  });
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('Generating procedural rock GLB models...\n');

  const models = [
    { name: 'rock_e.glb', create: createRockE, desc: 'Angular cliff face chunk' },
    { name: 'rock_f.glb', create: createRockF, desc: 'Smooth rounded boulder' },
    { name: 'stalactite.glb', create: createStalactite, desc: 'Elongated cave stalactite' },
    { name: 'coral_rock.glb', create: createCoralRock, desc: 'Lumpy organic coral rock' },
  ];

  for (const model of models) {
    console.log(`Creating ${model.name} (${model.desc})...`);
    const mesh = model.create();
    const filepath = path.join(OUTPUT_DIR, model.name);
    await exportGLB(mesh, filepath);
    // Also copy to public dir
    const publicPath = path.join(PUBLIC_OUTPUT_DIR, model.name);
    fs.copyFileSync(filepath, publicPath);
    console.log(`  ✓ Copied to: ${publicPath}`);
  }

  console.log('\n✓ All models generated successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
