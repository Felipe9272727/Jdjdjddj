/** Brasas da fornalha do Brokk — o leito de carvões vivos na boca da fornalha.
 *
 *  Mesmo lugar e tamanho da placa antiga: centro [0, 1.05, 0], 1,1 × 0,8 m, topo em ~1,11.
 *
 *  Quatro chamadas de desenho:
 *    1) corpo escuro do leito (a caixa de antes);
 *    2) fundo de brasa em shader — manchas quentes que respiram + rachaduras brilhantes;
 *    3) carvões irregulares numa única InstancedMesh;
 *    4) línguas de chama baixas num InstancedMesh de planos (billboard só no eixo Y).
 *
 *  Zero alocação por quadro: o `useFrame` só escreve uniforme e matrizes de instância.
 */
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ------------------------------------------------------------------ medidas do leito
const LARGURA = 1.1;                        // eixo X
const FUNDO = 0.8;                          // eixo Z
const ESPESSURA = 0.12;                     // espessura da caixa original
const CENTRO_Y = 1.05;                      // centro pedido
const TOPO_Y = CENTRO_Y + ESPESSURA * 0.5;  // 1,11 — superfície do leito

const QTD_CARVOES = 58;
const QTD_CHAMAS = 3;

// =============================================================== shader da brasa
const VERT_BRASA = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG_BRASA = /* glsl */ `
uniform float uTempo;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * ruido(p);
    p = p * 2.03 + 13.7;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv - 0.5;
  float t = uTempo;

  // mais quente no meio do leito, frio nas bordas
  float d = length(p * vec2(1.05, 1.5));
  float centro = 1.0 - smoothstep(0.05, 0.82, d);

  // manchas de brasa que respiram com o ruído no tempo
  float m1 = fbm(uv * 3.1 + vec2(0.0, t * 0.10));
  float m2 = fbm(uv * 6.7 - vec2(t * 0.08, t * 0.13));
  float mancha = m1 * 0.62 + m2 * 0.38;
  float respira = 0.5 + 0.5 * sin(t * 1.6 + m1 * 9.0);

  float calor = mancha * (0.55 + 0.45 * respira) + centro * 0.42;
  calor = clamp(calor, 0.0, 1.0);

  // rachaduras brilhantes entre os carvões (cristas do ruído)
  float nR = fbm(uv * 5.2 + vec2(t * 0.025, -t * 0.018));
  float crista = 1.0 - abs(nR * 2.0 - 1.0);
  float rachadura = smoothstep(0.80, 0.99, crista);
  rachadura *= 0.55 + 0.45 * sin(t * 2.3 + nR * 12.0);

  vec3 preto = vec3(0.05, 0.012, 0.004);
  vec3 vermelho = vec3(0.55, 0.07, 0.012);
  vec3 laranja = vec3(1.0, 0.33, 0.03);
  vec3 amarelo = vec3(1.0, 0.80, 0.30);

  vec3 cor = mix(preto, vermelho, smoothstep(0.12, 0.52, calor));
  cor = mix(cor, laranja, smoothstep(0.45, 0.80, calor));
  cor = mix(cor, amarelo, smoothstep(0.74, 1.00, calor));

  cor += amarelo * rachadura * (0.35 + 0.65 * centro);
  cor *= 0.55 + 1.7 * centro;

  // a boca da fornalha escurece nos cantos
  float borda = smoothstep(0.0, 0.13, uv.x) * (1.0 - smoothstep(0.87, 1.0, uv.x))
              * smoothstep(0.0, 0.13, uv.y) * (1.0 - smoothstep(0.87, 1.0, uv.y));
  cor *= mix(0.30, 1.0, borda);

  gl_FragColor = vec4(cor, 1.0);
}
`;

// =============================================================== shader da chama
const VERT_CHAMA = /* glsl */ `
varying vec2 vUv;
varying float vFase;

void main() {
  vUv = uv;

  // fase pseudo-aleatória por instância, tirada da translação da matriz
  float fase = 0.0;
  #ifdef USE_INSTANCING
    fase = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  #endif
  vFase = fase;

  vec3 transformed = position;
  #include <project_vertex>
}
`;

const FRAG_CHAMA = /* glsl */ `
uniform float uTempo;
varying vec2 vUv;
varying float vFase;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  float t = uTempo * 1.9 + vFase * 6.2831;
  vec2 uv = vUv;

  // tremulação que cresce com a altura
  float tremor = (ruido(vec2(uv.y * 3.4 - t * 0.85, vFase * 9.0 + t * 0.12)) - 0.5) * 1.1;
  float x = uv.x - 0.5 + tremor * uv.y * uv.y;

  float largura = mix(0.46, 0.06, uv.y * uv.y);
  float forma = 1.0 - smoothstep(largura * 0.30, largura, abs(x));
  float miolo = 1.0 - smoothstep(0.0, largura * 0.72, abs(x));

  float topo = 1.0 - smoothstep(0.52, 1.0, uv.y);
  float base = smoothstep(0.0, 0.10, uv.y);

  float a = forma * topo * base;
  a *= 0.60 + 0.40 * ruido(vec2(t * 1.3, vFase * 5.0));

  vec3 vermelho = vec3(1.0, 0.16, 0.02);
  vec3 laranja = vec3(1.0, 0.48, 0.06);
  vec3 amarelo = vec3(1.0, 0.84, 0.34);
  vec3 branco = vec3(1.0, 0.97, 0.86);

  vec3 cor = mix(vermelho, laranja, topo);
  cor = mix(cor, amarelo, miolo * 0.85);
  cor = mix(cor, branco, pow(miolo, 3.0) * pow(base, 3.0) * 0.75);

  if (a < 0.004) discard;

  gl_FragColor = vec4(cor, a);
}
`;

// ============================================================================ peça
export const BrasasDaFornalha: React.FC = () => {
    const refCarvoes = useRef<THREE.InstancedMesh>(null);
    const refChamas = useRef<THREE.InstancedMesh>(null);

    // ------------------------------------------------ geometrias e materiais fixos
    const geoBrasa = useMemo(() => {
        const g = new THREE.PlaneGeometry(LARGURA, FUNDO);
        g.rotateX(-Math.PI / 2); // deitada, normal para cima
        return g;
    }, []);

    const geoCarvao = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);

    const geoChama = useMemo(() => {
        const g = new THREE.PlaneGeometry(1, 1);
        g.translate(0, 0.5, 0); // base no y = 0, cresce para cima
        return g;
    }, []);

    const matBrasa = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTempo: { value: 0 } },
        vertexShader: VERT_BRASA,
        fragmentShader: FRAG_BRASA,
        toneMapped: false,
        fog: false,
    }), []);

    const matCarvao = useMemo(() => new THREE.MeshStandardMaterial({
        color: new THREE.Color('#150a05'),
        roughness: 0.95,
        metalness: 0.0,
    }), []);

    const matChama = useMemo(() => new THREE.ShaderMaterial({
        uniforms: { uTempo: { value: 0 } },
        vertexShader: VERT_CHAMA,
        fragmentShader: FRAG_CHAMA,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
    }), []);

    // ------------------------------------------------ chamas: posição e tamanho fixos
    const posicoesChama = useMemo(() => [
        new THREE.Vector3(-0.24, TOPO_Y - 0.005, 0.04),
        new THREE.Vector3(0.17, TOPO_Y - 0.005, -0.09),
        new THREE.Vector3(0.01, TOPO_Y - 0.005, 0.13),
    ], []);

    const escalasChama = useMemo(() => [
        new THREE.Vector2(0.22, 0.24),
        new THREE.Vector2(0.17, 0.17),
        new THREE.Vector2(0.14, 0.13),
    ], []);

    const auxiliar = useMemo(() => new THREE.Object3D(), []);

    // ------------------------------------------------ carvões: assentados uma só vez
    useLayoutEffect(() => {
        const malha = refCarvoes.current;
        if (!malha) return;

        const matriz = new THREE.Matrix4();
        const quat = new THREE.Quaternion();
        const euler = new THREE.Euler();
        const pos = new THREE.Vector3();
        const esc = new THREE.Vector3();

        for (let i = 0; i < QTD_CARVOES; i++) {
            const raio = 0.028 + Math.random() * 0.032;

            // disco mais cheio no miolo, com folga nas beiradas
            const ang = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * 0.86;

            pos.set(
                Math.cos(ang) * r * (LARGURA * 0.5),
                TOPO_Y + raio * (0.10 + Math.random() * 0.45),
                Math.sin(ang) * r * (FUNDO * 0.5),
            );

            euler.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI,
            );
            quat.setFromEuler(euler);

            // carvões achatados e irregulares
            esc.set(
                raio * (0.80 + Math.random() * 0.60),
                raio * (0.50 + Math.random() * 0.45),
                raio * (0.80 + Math.random() * 0.60),
            );

            matriz.compose(pos, quat, esc);
            malha.setMatrixAt(i, matriz);
        }

        malha.instanceMatrix.needsUpdate = true;
        malha.computeBoundingSphere();
    }, []);

    // ------------------------------------------------ por quadro: só uniformes e matrizes
    useFrame((estado) => {
        const t = estado.clock.elapsedTime;

        matBrasa.uniforms.uTempo.value = t;
        matChama.uniforms.uTempo.value = t;

        const malha = refChamas.current;
        if (!malha) return;

        const cam = estado.camera;
        for (let i = 0; i < QTD_CHAMAS; i++) {
            const p = posicoesChama[i];
            const e = escalasChama[i];

            // billboard só no eixo Y: a chama sempre de frente para a câmera
            auxiliar.position.copy(p);
            auxiliar.rotation.set(0, Math.atan2(cam.position.x - p.x, cam.position.z - p.z), 0);
            auxiliar.scale.set(e.x, e.y, 1);
            auxiliar.updateMatrix();

            malha.setMatrixAt(i, auxiliar.matrix);
        }
        malha.instanceMatrix.needsUpdate = true;
    });

    // ---------------------------------------------------------------------- desenho
    return (
        <group>
            {/* corpo escuro do leito — mesma caixa de antes, topo em 1,11 */}
            <mesh position={[0, CENTRO_Y, 0]}>
                <boxGeometry args={[LARGURA, ESPESSURA, FUNDO]} />
                <meshStandardMaterial color="#2a1a12" roughness={1} metalness={0} />
            </mesh>

            {/* fundo de brasa: shader animado com manchas que pulsam e rachaduras brilhantes */}
            <mesh
                geometry={geoBrasa}
                material={matBrasa}
                position={[0, TOPO_Y + 0.001, 0]}
            />

            {/* carvões irregulares — UMA InstancedMesh */}
            <instancedMesh
                ref={refCarvoes}
                args={[geoCarvao, matCarvao, QTD_CARVOES]}
            />

            {/* línguas de chama baixas — planos billboard no eixo Y, toneMapped false */}
            <instancedMesh
                ref={refChamas}
                args={[geoChama, matChama, QTD_CHAMAS]}
                frustumCulled={false}
            />
        </group>
    );
};
