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

// O ruído que desenha o topo do mar. Ele é INJETADO num material padrão (ver
// abaixo), em vez de ser um shader à parte: a primeira versão era um
// ShaderMaterial sem luz, e fotografado o vale do piso saía mais escuro e mais
// azul que as bolhas iluminadas ao lado — dois materiais, duas matérias.
const RUIDO = /* glsl */`
varying vec2 vMundo;
uniform float uT;
uniform vec3 uSombra;
uniform vec3 uLuz;
float f12Hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float f12Ruido(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(f12Hash(i), f12Hash(i + vec2(1,0)), u.x),
             mix(f12Hash(i + vec2(0,1)), f12Hash(i + vec2(1,1)), u.x), u.y);
}
// Quatro oitavas bastam: a partir daí o celular paga e o olho não vê.
float f12Fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * f12Ruido(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

export function Floor12MarDeNuvens({ bossZ }: { bossZ: number }) {
    const uT = useMemo(() => ({ value: 0 }), []);
    const mat = useMemo(() => {
        // `MeshStandardMaterial` de verdade: recebe as MESMAS luzes, a mesma
        // névoa (inclusive a troca para a paleta de tempestade na virada) e a
        // mesma conversão de cor que as bolhas. Só a cor difusa é trocada pelo
        // ruído.
        const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uT = uT;
            // A faixa de cor das bolhas (`createCloudGeometry`), com o VALE
            // mais claro que a base delas: o vale do piso ainda está virado
            // para o céu, só está mais baixo.
            shader.uniforms.uSombra = { value: new THREE.Color('#7d90a6') };
            shader.uniforms.uLuz = { value: new THREE.Color('#d0dbd7') };
            shader.vertexShader = 'varying vec2 vMundo;\n' + shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\n  vMundo = (modelMatrix * vec4(transformed, 1.0)).xz;');
            shader.fragmentShader = RUIDO + shader.fragmentShader.replace(
                '#include <color_fragment>',
                // Frequência 0,08: traço de ~12 unidades. Com 0,045 o traço
                // tinha ~22, e o pedaço de piso visível perto da câmera cabia
                // INTEIRO num vale — fotografado, uma faixa azul lisa na borda
                // de baixo do retrato, que lia como vazio de novo.
                '#include <color_fragment>\n  { float n = f12Fbm(vMundo * 0.08 + vec2(uT * 0.012, uT * 0.02));\n'
                + '    diffuseColor.rgb *= mix(uSombra, uLuz, smoothstep(0.30, 0.76, n)); }');
        };
        m.customProgramCacheKey = () => 'f12-mar-de-nuvens';
        return m;
    }, [uT]);
    useFrame((_, dt) => { uT.value += Math.min(dt, .1); });
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
                // A fileira que ficava em z ~ 18 estava DEBAIXO da câmera: nunca
                // entrava em quadro e só custava. A primeira fileira agora é a
                // de z ~ 1 — e ela encolhe, porque fotografada em retrato era
                // a que virava uma parede de bolhas gigantes no terço de baixo.
                const perto = iz === 0 ? .6 : 1;
                out.push({
                    x: -66 + ix * 11 + (r - .5) * 7,
                    y: Y_DO_PISO + .2 + r * .8 * perto,
                    z: bossZ + 27 - iz * 17 + (r - .5) * 8,
                    s: (3.8 + r * 3.4) * perto,
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
