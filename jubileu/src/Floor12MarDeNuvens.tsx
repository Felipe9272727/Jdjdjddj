/**
 * Floor12MarDeNuvens.tsx — O CHÃO DO ANDAR 12 É UM MAR DE NUVENS.
 *
 * As nuvens antigas eram 64 bolhas SÓ NAS LATERAIS (x a partir de ±22) e bem
 * longe, perto de y = -17. O meio do chão ficava vazio: olhando para baixo, o
 * jogador via azul-escuro chapado entre os prédios — um buraco, não um céu.
 *
 * Duas camadas, cada uma um draw call só:
 *
 *   1. o PISO: um plano enorme com um shader de ruído que imita o topo de um
 *      mar de nuvens. É contínuo, então não existe mais vão para enxergar. O
 *      ruído anda devagar, porque nuvem parada lê como papel de parede.
 *   2. o VOLUME: bolhas instanciadas espalhadas pelo chão INTEIRO, não só nas
 *      laterais, que furam o piso e dão relevo. Sem elas o piso é um tapete.
 *
 * ── A ALTURA, E O QUE ELA DECIDE NA HISTÓRIA ─────────────────────────────────
 *
 * y = -8, e não mais alto, por dois motivos que não têm nada a ver com nuvem:
 *   · na cena de DERROTA o avião do jogador cai até y = -7,1. Com o mar acima
 *     disso ele afundava num plano opaco e SUMIA — e o card de repetir mostra
 *     justamente o destroço, que é a consequência que o jogador precisa ver.
 *     A -8 ele fica pousado na superfície, ainda à vista;
 *   · os prédios têm base em -27 e o mais baixo termina em -3. Mais alto que
 *     isso e ele virava um toco saindo da nuvem.
 * E a arena começa em 0,4: são 8,4 de folga, então o avião nunca "pousa" nela.
 *
 * ── A NÉVOA É A DA CENA, NÃO UMA COR MINHA ───────────────────────────────────
 *
 * O horizonte do mar some na `THREE.Fog` de verdade. A primeira versão usava
 * uma cor de horizonte fixa — que destoaria da névoa da cena e, pior, ignoraria
 * a VIRADA, quando o céu troca para a paleta de tempestade e a névoa troca
 * junto (`Floor12Ceu`). Usando os trechos de névoa do three, o mar escurece com
 * o resto do mundo na metade da luta, sem ninguém precisar lembrar dele.
 *
 * Os trechos de tonemapping e colorspace pelo mesmo motivo: um ShaderMaterial
 * sem eles escreve cor num espaço diferente dos materiais padrão ao lado, e a
 * nuvem do shader não bateria com as bolhas instanciadas.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createCloudGeometry } from './f12CloudGeometry';

/** O topo do mar. Exportado: os bancos laterais repousam sobre ele. */
export const Y_DO_PISO = -8;

const vert = /* glsl */`
#include <fog_pars_vertex>
varying vec2 vMundo;
void main() {
  vec4 m = modelMatrix * vec4(position, 1.0);
  vMundo = m.xz;
  vec4 mvPosition = viewMatrix * m;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */`
#include <fog_pars_fragment>
uniform float uT;
uniform vec3 uSombra;
uniform vec3 uLuz;
varying vec2 vMundo;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruido(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
// Quatro oitavas bastam: a partir daí o celular paga e o olho não vê.
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * ruido(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec2 p = vMundo * 0.045 + vec2(uT * 0.012, uT * 0.02);
  float n = fbm(p);
  // Os topos das ondas de nuvem ficam claros; os vales, na sombra.
  float topo = smoothstep(0.32, 0.78, n);
  gl_FragColor = vec4(mix(uSombra, uLuz, topo), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function Floor12MarDeNuvens({ bossZ }: { bossZ: number }) {
    const mat = useMemo(() => new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, fog: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
            uT: { value: 0 },
            // As MESMAS cores da sombra e da luz de `createCloudGeometry`, para
            // o piso e as bolhas lerem como a mesma matéria.
            uSombra: { value: new THREE.Color('#465e78') },
            uLuz: { value: new THREE.Color('#c6d3d2') },
        }]),
    }), []);
    useFrame((_, dt) => { mat.uniforms.uT.value += Math.min(dt, .1); });
    useEffect(() => () => mat.dispose(), [mat]);

    // ── AS BOLHAS DE VOLUME, pelo chão inteiro ─────────────────────────────
    // Os topos ficam no máximo ~4,4 acima do mar (≈ -3,6): a 4 unidades da
    // altitude mais baixa do avião. Uma bolha subindo até a arena esconderia o
    // próprio avião do jogador, e isso aqui é chão, não obstáculo.
    const bolhas = useMemo(() => {
        const out: { x: number; y: number; z: number; s: number }[] = [];
        for (let ix = 0; ix < 13; ix++) {
            for (let iz = 0; iz < 9; iz++) {
                const seed = Math.sin(ix * 91.7 + iz * 47.3) * 43758.5453;
                const r = seed - Math.floor(seed);
                out.push({
                    x: -66 + ix * 11 + (r - .5) * 7,
                    y: Y_DO_PISO + .2 + r * .8,
                    z: bossZ + 44 - iz * 17 + (r - .5) * 8,
                    s: 3.8 + r * 3.4,
                });
            }
        }
        return out;
    }, [bossZ]);
    const ref = useRef<THREE.InstancedMesh>(null);
    const geo = useMemo(createCloudGeometry, []);
    useEffect(() => () => geo.dispose(), [geo]);
    useEffect(() => {
        const m = ref.current; if (!m) return;
        const d = new THREE.Object3D();
        bolhas.forEach((b, i) => {
            d.position.set(b.x, b.y, b.z);
            d.scale.set(b.s * 1.3, b.s * .45, b.s);
            d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        });
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
    }, [bolhas]);

    return <group>
        <mesh material={mat} position={[0, Y_DO_PISO, -40]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[420, 360, 1, 1]} />
        </mesh>
        <instancedMesh ref={ref} args={[geo, undefined, bolhas.length]}>
            <meshStandardMaterial vertexColors roughness={1} />
        </instancedMesh>
    </group>;
}
