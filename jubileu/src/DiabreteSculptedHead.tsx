import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type HeadProps = { speaking?: boolean; expression?: number; blink?: number; look?: string; brow?: string; mouth?: string };
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

// ── O CUSTO DA MÁSCARA ───────────────────────────────────────────────────────
// `curvedShape` subdivide cada triângulo 4^n vezes para a forma acompanhar a
// curvatura do crânio. Com n=4 são 256 triângulos por triângulo de origem, e a
// máscara é a maior forma da cabeça: só ela respondia por boa parte dos 52 mil
// triângulos que a bancada mediu no andar (a cara pintada antiga custava 22 mil).
// A regra número um do dono do jogo é velocidade no celular dele.
// Com n=3 são 64 — quatro vezes menos — e a foto de frente, de 3/4 e de perfil
// não muda: a máscara é quase plana perto do centro, que é onde ela é grande.
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
  return curvedShape(s, 0.026, 3);
}

function eye(side: number) {
  const s = new THREE.Shape();
  const x = (v: number) => side * v;
  s.moveTo(x(0.29), -0.10);
  s.bezierCurveTo(x(0.3), 0.08, x(0.4), 0.35, x(0.48), 0.38);
  s.bezierCurveTo(x(0.59), 0.32, x(0.66), 0.06, x(0.64), -0.15);
  s.bezierCurveTo(x(0.63), -0.36, x(0.53), -0.46, x(0.43), -0.41);
  s.bezierCurveTo(x(0.33), -0.38, x(0.28), -0.24, x(0.29), -0.10);
  return curvedShape(s, 0.043, 3);
}

function stroke(points: number[][], width: number, lift = 0.045) {
  const outline = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
  class SurfaceCurve extends THREE.Curve<THREE.Vector3> {
    constructor() { super(); }
    override getPoint(t: number, target = new THREE.Vector3()) {
      const p = outline.getPoint(t);
      return target.set(p.x, p.y, front(p.x, p.y, lift));
    }
  }
  return new THREE.TubeGeometry(new SurfaceCurve(), 28, width, 6, false);
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
  // ── O CANTO ESQUERDO MAL EXISTIA ──────────────────────────────────────────
  // O sorriso ia de x -0,24 a +0,66: dois terços da cara, todo do lado que
  // sobe. Na foto de repouso ele lia como um sorriso torto CORTADO, não como um
  // sorriso torto. Na referência ele atravessa o rosto e SOBE de um lado — a
  // torção vem da inclinação, não de faltar boca do outro lado.
  // Estendido para -0,46, mantendo a subida e a ponta direita onde estavam.
  const s = new THREE.Shape();
  s.moveTo(-0.46, -0.60);
  s.bezierCurveTo(-0.10, -0.635, 0.32, -0.52, 0.66, -0.34);
  s.bezierCurveTo(0.59, -0.62, 0.22, -0.80, -0.14, -0.715);
  s.bezierCurveTo(-0.27, -0.685, -0.39, -0.64, -0.46, -0.60);
  return curvedShape(s, 0.04, 2);
}

function sculptAssets() {
    const mask = faceMask(), eyes = [-1, 1].map(eye);
    // As sobrancelhas desceram (0,47..0,61 -> 0,41..0,53) e engrossaram um fio.
    // Com a piscada travada (`?sempiscar`) dá para ver o repouso, e nele elas
    // flutuavam perto da linha do cabelo, longe do olho, que acaba em 0,38 — a
    // ficha de modelagem dele diz que a sobrancelha é PARTE DO CONTORNO DO OLHO.
    const brows = [-1, 1].map(side => stroke([[side * 0.29, 0.41], [side * 0.41, 0.51], [side * 0.54, 0.53], [side * 0.64, 0.44]], 0.012, 0.039));
    const lids = [-1, 1].map(side => stroke([[side * 0.24, -0.035], [side * 0.42, -0.065], [side * 0.62, -0.055], [side * 0.72, 0.002]], 0.013));
    const horns = [-1, 1].map(side => tapered([[side * 0.67, 0.65, -0.04], [side * 0.86, 0.92, -0.035], [side * 0.91, 1.2, -0.015], [side * 0.86, 1.52, 0]], 0.27));
    // ── OS TUFOS FORAM PARA TRÁS ─────────────────────────────────────────────
    // Eles moravam em z -0,10..-0,03, ou seja quase no plano central do crânio
    // (RZ 0,91). De frente e de 3/4 não faz diferença; de PERFIL eles cruzavam a
    // silhueta da cabeça num ângulo rasante e o sombreado os revelava como
    // vincos escuros no meio do crânio — parecia a cabeça rachada, não cabelo.
    // Recuados para z -0,38..-0,30 eles ficam ATRÁS da parte mais larga da
    // cabeça, que é onde a referência os põe: cabelo do lado e de trás, não em
    // cima da bochecha.
    const tufts = [-1, 1].flatMap(side => [0, 1, 2].map(i => tapered(
      [[side * 0.86, 0.02 - i * 0.21, -0.38], [side * 1.08, -0.02 - i * 0.2, -0.34], [side * (1.19 - i * 0.045), 0.15 - i * 0.22, -0.30]], 0.19 - i * 0.02, 12, 10)));
    const grin = mouth();
    // A fileira de dentes acompanha a boca nova, mas continua só no lado que
    // SOBE — "dentes apenas de um lado" é o que a folha de modelagem dele pede,
    // e é o que faz o sorriso ser debochado em vez de simpático.
    const teeth = stroke([[-0.30, -0.617], [0.04, -0.614], [0.36, -0.51], [0.63, -0.37]], 0.008, 0.056);
    const divisions = [
      [[-0.06, -0.626], [-0.04, -0.686]], [[0.10, -0.60], [0.13, -0.708]],
      [[0.28, -0.55], [0.31, -0.668]], [[0.44, -0.47], [0.46, -0.593]],
      [[0.55, -0.41], [0.57, -0.49]],
    ].map(p => stroke(p, 0.009, 0.066));
    const corners = stroke([[0.63, -0.37], [0.66, -0.345], [0.68, -0.38]], 0.012, 0.055);
    return { mask, eyes, brows, lids, horns, tufts, grin, teeth, divisions, corners };
}

export function createDiabreteSculpt({ neck = false }: { neck?: boolean } = {}) {
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
    // The skeletal adapter updates this detached group immediately before drawing.
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  }
  // 56x40 dá 4.480 triângulos numa bola que é lisa e chapada de tinta; 40x28 dá
// 2.240 e a silhueta não muda — o contorno de uma esfera desse tamanho na tela
// já está liso com bem menos.
const skull = add(new THREE.SphereGeometry(1, 40, 28), ink);
  skull.scale.set(RX, RY, RZ);
  if (neck) {
    const collar = add(new THREE.CylinderGeometry(0.2, 0.23, 0.5, 20), ink);
    collar.position.y = -1.22;
  }
  skull.renderOrder = -1; // Synchronize the attachment before any facial mesh is drawn.
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
  const eyeMeshes = group.children.filter(child => child instanceof THREE.Mesh && assets.eyes.includes(child.geometry));
  const dizzyMeshes = [-1, 1].flatMap(side => [
    add(stroke([[side * 0.34, 0.13], [side * 0.58, -0.26]], 0.02, 0.052), line),
    add(stroke([[side * 0.34, -0.26], [side * 0.58, 0.13]], 0.02, 0.052), line),
  ]);
  for (const mesh of dizzyMeshes) mesh.visible = false;
  // ── A RUGA ───────────────────────────────────────────────────────────────
  // `bravaComRuga` e `raiva` eram desenhadas EXATAMENTE igual — duas das oito
  // sobrancelhas da ficha dele indistinguíveis. O que separa as duas, na ficha,
  // é o V entre elas. São dois riscos e mais nada.
  const rugaMeshes = [-1, 1].map(side => add(
    stroke([[side * 0.05, 0.42], [side * 0.10, 0.30], [side * 0.13, 0.19]], 0.011, 0.040), line));
  for (const mesh of rugaMeshes) mesh.visible = false;
  const eyeBases = assets.eyes.map(g => Float32Array.from(g.getAttribute('position').array));
  const neutralEyes = eyeBases.map(a => Float32Array.from(a));
  const browBases = assets.brows.map(g => Float32Array.from(g.getAttribute('position').array));
  const lidBases = assets.lids.map(g => Float32Array.from(g.getAttribute('position').array));
  let expressionBlink = 0;
  let expressionKey = '';
  let lastBlink = -1;
  function setExpression(look: string, brow: string) {
    const key = `${look}:${brow}`;
    if (expressionKey === key) return;
    expressionKey = key;
    const shiftX = look === 'esquerda' ? -0.045 : look === 'direita' ? 0.045 : 0;
    const shiftY = look === 'cima' ? 0.035 : look === 'baixoMalicioso' ? -0.035 : 0;
    expressionBlink = look === 'fechadoSorrindo' ? 1 : look === 'semicerrado' ? 0.48 : look === 'malicia' || look === 'baixoMalicioso' ? 0.22 : 0;
    for (const mesh of eyeMeshes) mesh.visible = look !== 'tonto';
    for (const mesh of dizzyMeshes) mesh.visible = look === 'tonto';
    for (const mesh of rugaMeshes) mesh.visible = brow === 'bravaComRuga';
    for (let j = 0; j < eyeBases.length; j++) {
      const side = j === 0 ? -1 : 1;
      for (let i = 0; i < eyeBases[j].length; i += 3) {
        const x = neutralEyes[j][i];
        const width = look === 'arregalado' ? 1.06 : 1;
        const yScale = look === 'triste' ? 0.84 : look === 'bravo' ? 0.9 : 1;
        eyeBases[j][i] = side * 0.46 + (x - side * 0.46) * width + shiftX;
        eyeBases[j][i + 1] = -0.06 + (neutralEyes[j][i + 1] + 0.06) * yScale + shiftY;
      }
      for (const [geometry, baseline, isLid] of [[assets.brows[j], browBases[j], false], [assets.lids[j], lidBases[j], true]] as const) {
        const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < attr.count; i++) {
          const x = baseline[i * 3], y0 = baseline[i * 3 + 1];
          const outward = side * x - 0.46;
          let change = 0;
          if (isLid) change = look === 'arregalado' ? 0.15 : look === 'bravo' ? outward * 0.25 : 0;
          else if (brow === 'surpresa') change = 0.055;
          else if (brow === 'raiva' || brow === 'bravaComRuga') change = outward * 0.42 - 0.045;
          else if (brow === 'preocupada') change = -outward * 0.4;
          else if (brow === 'ironia') change = side > 0 ? 0.035 : -0.055;
          else if (brow === 'desconfiada') change = side > 0 ? 0.02 : -0.075;
          else if (brow === 'pensativa') change = side > 0 ? -outward * 0.25 : -0.045;
          const y = y0 + change;
          const lift = baseline[i * 3 + 2] - front(x, y0, 0);
          attr.setXYZ(i, x, y, front(x, y, lift));
        }
        attr.needsUpdate = true;
      }
    }
    lastBlink = -1;
    setBlink(0);
  }
  function setBlink(amount: number) {
    const closed = THREE.MathUtils.clamp(Math.max(amount, expressionBlink), 0, 1);
    if (Math.abs(closed - lastBlink) < 0.001) return;
    lastBlink = closed;
    for (let j = 0; j < assets.eyes.length; j++) {
      const a = assets.eyes[j].getAttribute('position') as THREE.BufferAttribute;
      const base = eyeBases[j];
      const normals = assets.eyes[j].getAttribute('normal') as THREE.BufferAttribute;
      const normal = new THREE.Vector3();
      for (let i = 0; i < a.count; i++) {
        const x = base[i * 3], y = -0.06 + (base[i * 3 + 1] + 0.06) * (1 - closed * 0.98);
        a.setXYZ(i, x, y, front(x, y, 0.043));
        normal.set(x / (RX * RX), y / (RY * RY), front(x, y, 0) / (RZ * RZ)).normalize();
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      a.needsUpdate = true; normals.needsUpdate = true;
    }
  }
  const mouthGeometries = [assets.grin, inside, assets.teeth, ...assets.divisions, assets.corners];
  const mouthBases = mouthGeometries.map(g => Float32Array.from(g.getAttribute('position').array));
  const mouthMeshes = group.children.filter(child => child instanceof THREE.Mesh && mouthGeometries.includes(child.geometry));
  const roundShape = new THREE.Shape();
  // ── A BOCA REDONDA ERA UM SEGUNDO NARIZ ────────────────────────────────────
  // Com 0,12 x 0,13 logo abaixo de um nariz de 0,126 x 0,077, o "O" de susto
  // saía do mesmo tamanho e no mesmo eixo que a bola do nariz — na folha das
  // dezesseis caras, `roubou` lia como se ele tivesse duas nareba, uma em cima
  // da outra. Boca de susto de desenho animado é GRANDE, e desloca para o lado
  // que o sorriso torto já levanta. Mas 0,19 x 0,215 em -0,71 passou do outro
  // lado: encostava no queixo e virava um borrão. 0,163 x 0,178 em -0,655.
  roundShape.absellipse(0.07, -0.655, 0.163, 0.178, 0, Math.PI * 2, false, 0);
  const roundMouth = add(curvedShape(roundShape, 0.051, 3), line);
  roundMouth.visible = false;
  let lastMouth = -1;
  let lastPose = '';
  function setMouth(amount: number, pose = 'sorrisoIronico') {
    const open = THREE.MathUtils.clamp(amount, 0, 1);
    if (Math.abs(open - lastMouth) < 0.001 && pose === lastPose) return;
    lastMouth = open; lastPose = pose;
    const round = ['surpreso', 'assustado', 'falando4', 'falando6'].includes(pose);
    const sad = ['triste', 'desanimado', 'confuso'].includes(pose);
    const angry = ['bravo', 'irritado', 'zangado'].includes(pose);
    const closedPose = ['neutra', 'pensativo', 'fechadoSatisfeito', 'fechadoSarcastico'].includes(pose);
    // ── DEZ BOCAS ERAM A MESMA BOCA ──────────────────────────────────────────
    //
    // As classes acima cobriam 14 das 27 formas de `f3Boca`. As outras 13 caíam
    // todas no mesmo sorriso padrão, variando só pela ABERTURA. E o estrago
    // aparecia onde mais importa: dos doze quadros do ciclo de fala, OITO eram a
    // mesma forma. Ou seja a queixa original dele — "a boca dele se mexe muito
    // pouco" — voltava inteira pela porta dos fundos, agora que a cara é
    // geometria em vez de canvas.
    //
    // Duas classes novas resolvem a maior parte, porque é onde as formas da
    // ficha dele mais se afastam do sorriso de repouso: a gargalhada (abre muito,
    // mostra a fileira inteira) e a fala miúda (estreita e curta, a boca de quem
    // está no meio de uma sílaba).
    const wide = ['risadaIronica', 'empolgado', 'feliz', 'dentesDebochados'].includes(pose);
    const narrow = ['falando1', 'falando3', 'falando5', 'sorriso'].includes(pose);
    roundMouth.visible = round;
    for (const mesh of mouthMeshes) mesh.visible = !round;
    for (let j = 0; j < mouthGeometries.length; j++) {
      const a = mouthGeometries[j].getAttribute('position') as THREE.BufferAttribute;
      const base = mouthBases[j];
      const normals = mouthGeometries[j].getAttribute('normal') as THREE.BufferAttribute;
      const normal = new THREE.Vector3();
      for (let i = 0; i < a.count; i++) {
        const originalX = base[i * 3], originalY = base[i * 3 + 1];
        let x = originalX;
        const lowerLip = THREE.MathUtils.clamp((-originalY - 0.48) / 0.24, 0, 1);
        let y = originalY - open * lowerLip * (j === 0 ? 0.13 : 0.01);
        if (angry || sad) {
          x = (originalX - 0.2) * (sad ? 0.72 : 0.9);
          y = -1.22 - (originalY - 0.31 * (originalX - 0.2));
          if (sad) y = -0.57 + (y + 0.57) * 0.5;
        } else if (closedPose) {
          const upper = -0.62 + (originalX + 0.24) * 0.31;
          y = upper + (originalY - upper) * 0.2;
        } else if (['grinhoLateral', 'deboche', 'provocando'].includes(pose)) {
          x = 0.3 + (originalX - 0.2) * 0.8;
        } else if (wide) {
          // Gargalhada: cresce nos dois eixos em volta do meio da boca (-0,575),
          // que é o pivô que as outras classes já usam.
          x = 0.18 + (originalX - 0.18) * 1.10;
          y = -0.575 + (originalY + 0.575) * 1.34;
        } else if (narrow) {
          // Fala miúda: encolhe. É o contraste com a de cima que faz o ciclo de
          // doze quadros voltar a ter movimento.
          x = 0.24 + (originalX - 0.24) * 0.70;
          y = -0.575 + (originalY + 0.575) * 0.74;
        }
        const lift = base[i * 3 + 2] - front(originalX, originalY, 0);
        a.setXYZ(i, x, y, front(x, y, lift));
        if (j < 2) {
          normal.set(x / (RX * RX), y / (RY * RY), front(x, y, 0) / (RZ * RZ)).normalize();
          normals.setXYZ(i, normal.x, normal.y, normal.z);
        }
      }
      a.needsUpdate = true; if (j < 2) normals.needsUpdate = true;
    }
  }
  return {
    group, setBlink, setMouth, setExpression,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of [ink, cream, line, noseMaterial]) material.dispose();
      group.clear();
    },
  };
}

/** A closed, round skull with facial inlays; local +Z is the face. */
export default function DiabreteSculptedHead({ speaking = false, expression = 0, blink, look = 'neutro', brow = 'ironia', mouth = 'sorrisoIronico' }: HeadProps) {
  const sculpt = useMemo(createDiabreteSculpt, []);
  const root = useRef<THREE.Group>(null);
  useEffect(() => () => sculpt.dispose(), [sculpt]);
  useEffect(() => { sculpt.setExpression(look, brow); }, [sculpt, look, brow]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, phase = t % 4.7;
    sculpt.setBlink(blink ?? (phase < 0.17 ? Math.sin(phase / 0.17 * Math.PI) : 0));
    sculpt.setMouth(speaking ? (0.5 + Math.sin(t * 13) * 0.5) : 0, mouth);
    if (root.current) root.current.rotation.z = expression * 0.035;
  });
  return <group ref={root}><primitive object={sculpt.group} /></group>;
}
