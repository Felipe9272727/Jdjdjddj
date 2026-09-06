/**
 * Floor3.tsx — Endless rubber-hose parkour (Cuphead/Mickey black-&-white).
 *
 * Visual: flat cream/white platforms with chunky black "ink" sides + a black
 * direction arrow, floating in a bright cartoon sky full of puffy clouds. No
 * neon, no chamber — the player climbs forever out into open sky.
 *
 * Rendering stack:
 *   • @react-three/drei  → <RoundedBox> for smooth beveled geometry and
 *     <Outlines> for the bold creased-normal cartoon outline.
 *   • cartoonToon.ts     → the toon FILL shader (hard 2-band cel + rim), cached
 *     as shared singletons keyed by options so materials never flicker.
 *
 * The course itself (the rolling, overlap-free platform pool) lives in
 * f3Parkour.ts; this file renders that live pool and drives the moving bridges
 * + the player-following sky each frame. Physics is in Player.tsx.
 */

import React, { useRef, useEffect, useReducer, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox, Outlines } from '@react-three/drei';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';
import FpHands from './Floor3Hands';
import Floor3Rival from './Floor3Rival';
import Floor3Hazards from './Floor3Hazards';
import {
    platforms as f3Platforms, f3PlayerZ, f3PlayerY, tick as f3Tick, reset as f3Reset,
    validateNoOverlaps, f3HandState, type F3Plat,
} from './f3Parkour';
import { createToonMaterial, type ToonOpts } from './cartoonToon';
import { molaDoTranco, TRANCO_DA_PLATAFORMA, TRANCO_PARADO } from './f3Fisica';
import { faixaDaNevoa } from './f3Nevoa';

// ─── Palette (rubber-hose black & white) ─────────────────────────────────────
const OUTLINE      = '#0a0712';

// ─── Toon material cache (shared singletons) ─────────────────────────────────
// One material per unique option-set. Stable identity → no recreation, no
// flicker, far fewer GPU programs.
const _toonCache = new Map<string, THREE.ShaderMaterial>();
function toonMat(opts: ToonOpts): THREE.ShaderMaterial {
    const key = JSON.stringify(opts);
    let m = _toonCache.get(key);
    if (!m) { m = createToonMaterial(opts); _toonCache.set(key, m); }
    return m;
}

// ─── Cartoon building blocks ─────────────────────────────────────────────────
interface BoxProps {
    args: [number, number, number];
    position?: [number, number, number];
    rotation?: [number, number, number];
    toon: ToonOpts;
    outline?: number;          // 0 = no outline (screen-space px-ish thickness)
    radius?: number;           // corner rounding
    castShadow?: boolean;
}

/** Rounded, toon-shaded box with a drei screen-space outline. */
const RBox: React.FC<BoxProps> = ({
    args, position = [0,0,0], rotation = [0,0,0], toon, outline = 1.5, radius = 0.1, castShadow = true,
}) => {
    const mat = toonMat(toon);
    const minDim = Math.min(args[0], args[1], args[2]);
    const r = Math.min(radius, minDim * 0.42);   // clamp so thin panels don't collapse
    return (
        <RoundedBox
            args={args} radius={r} smoothness={4} bevelSegments={3} creaseAngle={0.5}
            position={position} rotation={rotation as any} castShadow={castShadow}
        >
            <primitive object={mat} attach="material" />
            {outline > 0 && (
                <Outlines thickness={outline * 0.03} color={OUTLINE} transparent={false} angle={0.4} />
            )}
        </RoundedBox>
    );
};

// ─── Directional arrow decal (black, painted on the platform top) ───────────
// A flat rubber-hose "go this way" arrow, like the reference. Built once as a
// shared shape and laid flat on each platform, pointing up the climb (+Z).
const ARROW_SHAPE = (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.16,  0.42); s.lineTo(0.16,  0.42);
    s.lineTo( 0.16, -0.08); s.lineTo(0.38, -0.08);
    s.lineTo( 0.0,  -0.5);  s.lineTo(-0.38, -0.08);
    s.lineTo(-0.16, -0.08); s.closePath();
    return s;
})();
const ARROW_GEO = new THREE.ShapeGeometry(ARROW_SHAPE);
const ARROW_MAT = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.DoubleSide });

const PlatformArrow: React.FC<{ topY: number; size: number; alonga?: number }> = ({
    topY, size, alonga = 1,
}) => (
    // `alonga` estica a seta no eixo do avanço (+Z do mundo, que depois da
    // rotação é o Y da forma). Numa viga isso a transforma numa faixa que
    // aponta o caminho inteiro em vez de um selo no meio.
    <mesh geometry={ARROW_GEO} material={ARROW_MAT}
        position={[0, topY + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}
        scale={[size, size * alonga, 1]} />
);

// ─── Cartoon cloud puff (cluster of outlined white spheres) ──────────────────
// Each puff = a white toon sphere with a bold black ink line, matching the
// first-person gloves. drei <Outlines> reads too thin on these distant, parent-
// scaled spheres, so the outline is a hand-rolled inverted hull: a slightly
// larger BACK-face black sphere drawn behind each white one. A sphere is
// radially symmetric, so a uniform scale-up *is* a perfect even outline. With
// depth-test on, the hulls of inner puffs are hidden by neighbouring white
// spheres, leaving one clean silhouette around the whole cloud (no internal
// seams). depthWrite off so the hulls never occlude each other.
const CLOUD_PUFFS: number[][] = [[0,0,0,1.0],[1.1,-0.1,0,0.8],[-1.1,-0.05,0,0.85],[0.5,0.45,0,0.7],[-0.6,0.4,0,0.65]];
// Uma geometria por raio, compartilhada pelas 15 nuvens. Antes cada `<mesh>`
// declarava a sua: 15 nuvens × 5 bolhas × 2 (miolo + casco) = 150 esferas
// idênticas subindo para a GPU em vez de 5.
const CLOUD_GEOS: THREE.SphereGeometry[] = CLOUD_PUFFS.map(
    (d) => new THREE.SphereGeometry(d[3], 16, 12),
);
const CLOUD_OUTLINE = 1.07; // hull scale → ink-line weight
const CLOUD_OUTLINE_MAT = (() => {
    const m = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });
    m.depthWrite = false;
    return m;
})();
// ── NUVEM É MANCHA CHAPADA, NÃO ESFERA ILUMINADA ─────────────────────────────
// Com duas bandas e rim em 0,4, as esferas sobrepostas cruzavam as faixas de
// sombra umas das outras e desenhavam crescentes duros dentro da nuvem — de
// longe parecia um relâmpago colado em cada bolota. Numa referência de tinta a
// nuvem é uma MANCHA: branca, chapada, e quem faz a forma é o contorno preto.
// Uma banda só, sombra quase igual à luz, rim desligado.
const CLOUD_FILL_TOON: ToonOpts = {
    color: '#ffffff', shadow: '#f0f3f7', bands: 1, rimStrength: 0, specThreshold: 1.1,
};
const CloudPuff: React.FC<{ position: [number,number,number]; scale?: number }> = ({ position, scale = 1 }) => {
    const fill = toonMat(CLOUD_FILL_TOON);
    return (
        <group position={position} scale={[scale, scale, scale]}>
            {CLOUD_PUFFS.map((d,i)=>(
                <group key={i} position={[d[0],d[1],d[2]]}>
                    {/* black ink-line hull (slightly larger back-face sphere) */}
                    <mesh scale={CLOUD_OUTLINE} renderOrder={0}
                        geometry={CLOUD_GEOS[i]} material={CLOUD_OUTLINE_MAT} />
                    {/* white toon fill */}
                    <mesh renderOrder={1} castShadow={false} geometry={CLOUD_GEOS[i]}>
                        <primitive object={fill} attach="material" />
                    </mesh>
                </group>
            ))}
        </group>
    );
};

// ─── Platform palette (matte black-&-white rubber-hose, hard 2-band cel) ─────
// No neon, no emissive — flat cream/white tops with a hard single shadow band,
// read by the thick black outline + black arrow (Cuphead/Mickey look). Slots
// alternate white ↔ cream for subtle variety. palette === -1 → the landing.
const INK    = '#0a0712';   // black
const CREAM  = '#f2eee4';
const CREAM_S= '#c6c0b2';
const WHITE_S= '#c8cdd4';
// ── CADA PAPEL COM A CARA DO TRABALHO DELE ───────────────────────────────────
// O tabuado sai do shader (uTabuas, espacamento em metros), entao dar
// personalidade a cada peca custa ZERO draw call — que e a unica moeda que este
// andar nao pode gastar no celular do dono do jogo.
const CARTOON_PALETTE: ToonOpts[] = [
    { color: '#ffffff', shadow: WHITE_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: CREAM,     shadow: CREAM_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: '#ffffff', shadow: WHITE_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: CREAM,     shadow: CREAM_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: '#ffffff', shadow: WHITE_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: CREAM,     shadow: CREAM_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
];
const LANDING_TOON: ToonOpts = {
    color: '#faf8f3', shadow: '#d3cec4', bands: 2, rimStrength: 0.28, specThreshold: 0.96,
    tabuas: 0.62,
};

// ── CADA PAPEL TEM DE PARECER O TRABALHO DELE ────────────────────────────────
// O jogador lê a escadaria à frente antes de pular nela, e ler é reconhecer.
// Se o descanso, a viga e a ponte tiverem a cor do passo comum, o compasso
// existe no gerador e não existe na tela — que é o mesmo que não existir.
const PONTE_TOON: ToonOpts = {
    // A ponte e de tabua solta: mais cinza, e as ripas atravessadas contam que
    // ela e um passadico, nao um bloco.
    color: '#dedad0', shadow: '#a5a094', bands: 2, rimStrength: 0.35, specThreshold: 0.95,
    tabuas: 0.5,
};
const VIGA_TOON: ToonOpts = {
    // A viga e a mais clara e a de borda mais grossa: ela precisa saltar de
    // longe, porque erra-la e cair. As ripas dao a pista de que se corre POR
    // CIMA dela, no comprimento.
    color: '#ffffff', shadow: '#c3bdae', bands: 2, rimStrength: 0.55, specThreshold: 0.9,
    tabuas: 0.75,
};
const DESCANSO_TOON: ToonOpts = {
    // O descanso e parente do patamar — mesmo tabuado, mesma calma. O
    // parentesco E a dica de que ali da para parar.
    color: '#ffffff', shadow: WHITE_S, bands: 2, rimStrength: 0.3, specThreshold: 0.96,
    tabuas: 0.7,
};

function platToon(p: F3Plat): ToonOpts {
    if (p.tipo === 'partida') return LANDING_TOON;
    // A ponte é mais cinza: "esta aqui desliza".
    if (p.tipo === 'ponte') return PONTE_TOON;
    // A viga é a mais clara e a de borda mais viva — ela precisa saltar de
    // longe, porque errá-la é cair e o jogador tem de vê-la a tempo.
    if (p.tipo === 'viga') return VIGA_TOON;
    // O descanso ganha as costuras do patamar: é parente da partida, e o
    // parentesco é a dica de que ali dá para parar.
    if (p.tipo === 'descanso') return DESCANSO_TOON;
    return CARTOON_PALETTE[p.palette % CARTOON_PALETTE.length];
}

// ─── O QUE FAZ DISTO UM LUGAR, E NÃO LAJES NO VAZIO ──────────────────────────
//
// Depois do céu e do tabuado, o que ainda faltava era CONTEÚDO: o jogador
// atravessava um corredor de peças e nada dizia onde ele estava nem para onde
// ia. Um parkour precisa de marcos — coisas que se reconhecem de longe, que
// contam o que aquela peça é antes de você pisar nela.
//
// ── POR QUE SILHUETA PRETA, E NÃO OBJETO PINTADO ─────────────────────────────
//
// Cada adereço pintado precisaria do próprio contorno de tinta, e contorno em
// malha pequena é casco invertido: DOBRA o número de malhas. Numa referência de
// 1930 o adereço de cenário já é, quase sempre, uma silhueta chapada — então a
// escolha barata e a escolha certa são a mesma. Um mastro preto contra o céu
// cinza lê-se instantaneamente, e custa uma malha.
const ADEREÇO_MAT = createToonMaterial({
    color: INK, shadow: INK, bands: 1, rimStrength: 0, specThreshold: 1.1,
});
const GEO_MASTRO   = new THREE.BoxGeometry(0.09, 1, 0.09);
const GEO_GALHARDETE = new THREE.ConeGeometry(0.3, 0.62, 3);
const GEO_POSTE    = new THREE.BoxGeometry(0.11, 1, 0.11);
const GEO_CORDA    = new THREE.BoxGeometry(1, 0.05, 0.05);
const GEO_RIPA     = new THREE.BoxGeometry(1, 0.07, 0.16);

/** O marco do descanso: mastro com galhardete. Vê-se de longe, e é o que diz
 *  "aqui dá para parar" antes de o jogador chegar. */
const Bandeira: React.FC<{ topY: number; hw: number; hd: number }> = ({ topY, hw, hd }) => (
    <group position={[hw * 0.62, topY, -hd * 0.62]}>
        <mesh geometry={GEO_MASTRO} material={ADEREÇO_MAT} position={[0, 0.85, 0]} scale={[1, 1.7, 1]} />
        <mesh geometry={GEO_GALHARDETE} material={ADEREÇO_MAT}
            position={[0.26, 1.5, 0]} rotation={[0, 0, -Math.PI / 2]} />
    </group>
);

/** A ponte ganha o que a faz ser ponte: dois postes e a corda entre eles. */
const CordasDaPonte: React.FC<{ topY: number; hw: number; hd: number }> = ({ topY, hw, hd }) => (
    <group position={[0, topY, 0]}>
        {[-1, 1].map((lado) => (
            <group key={lado} position={[lado * (hw - 0.12), 0, 0]}>
                <mesh geometry={GEO_POSTE} material={ADEREÇO_MAT} position={[0, 0.42, -hd + 0.14]} scale={[1, 0.85, 1]} />
                <mesh geometry={GEO_POSTE} material={ADEREÇO_MAT} position={[0, 0.42, hd - 0.14]} scale={[1, 0.85, 1]} />
                {/* A CORDA JÁ NASCEU QUEBRADA, e só a foto mostrou: a geometria
                    tem 1 de comprimento em X, então quem estica é o X da
                    escala. Eu tinha posto o comprimento no Z e 0,06 no X — o
                    resultado foi um toco de 6 cm, invisível, e a ponte ficou
                    com quatro postes e nada entre eles. */}
                <mesh geometry={GEO_CORDA} material={ADEREÇO_MAT}
                    position={[0, 0.72, 0]} rotation={[0, Math.PI / 2, 0]}
                    scale={[(hd - 0.14) * 2, 1, 1]} />
            </group>
        ))}
    </group>
);

/** A viga ganha ripas SALIENTES: o tabuado pintado conta a história de perto,
 *  mas de longe é a geometria que faz a peça parecer um passadiço de tábua. */
const RipasDaViga: React.FC<{ topY: number; hw: number; hd: number }> = ({ topY, hw, hd }) => (
    <group position={[0, topY + 0.035, 0]}>
        {[-0.55, 0, 0.55].map((f) => (
            <mesh key={f} geometry={GEO_RIPA} material={ADEREÇO_MAT}
                position={[0, 0, f * hd]} scale={[hw * 1.9, 1, 1]} />
        ))}
    </group>
);

// ─── One platform in the endless pool ────────────────────────────────────────
// Sized from the platform record (NOT scaled — avoids outline/bevel distortion).
// Re-mounts only when the pool recycles (keyed by stable id in the parent).
// Exported so the fall cutscene can build its OWN little set out of the EXACT
// same tiles (same ink rim, toon top, arrow, palette) — a real clone of the map.
export const PlatformView = React.forwardRef<THREE.Group, { plat: F3Plat }>(({ plat }, ref) => {
    const w = plat.hw * 2, d = plat.hd * 2;
    const cy = plat.topY - plat.h / 2;
    const big = plat.palette < 0;          // the Aperture landing
    // Bold black ink rim: a wider, taller matte-black block whose top sits just
    // under the white surface. drei <Outlines> went sub-pixel at parkour
    // distance (white-on-white sky → the floor vanished), so the outline is now
    // real geometry — a chunky black border readable from any angle/distance.
    const rim = big ? 0.5 : 0.42;          // total extra width → ~0.2–0.25 ink edge
    const Hb = plat.h * 1.15;              // black block height (just past the top)
    return (
        <group ref={ref} position={[plat.bx, 0, plat.cz]}>
            {/* chunky matte-black border block — top 0.05 below the white
                surface so a bold ink rim shows from above AND the side. */}
            <RBox args={[w + rim, Hb, d + rim]} position={[0, plat.topY - 0.05 - Hb / 2, 0]} radius={0.1}
                toon={{ color: INK, shadow: INK, bands: 1, rimStrength: 0 }} outline={0} />
            {/* white/cream top slab — top at the true topY (matches physics) */}
            <RBox args={[w, plat.h, d]} position={[0, cy, 0]} radius={big ? 0.14 : 0.12}
                toon={platToon(plat)} outline={0} />
            {/* black "go this way" arrow painted on the surface */}
            {/* Os marcos: o que diz de longe o que esta peça é. */}
            {plat.tipo === 'descanso' && <Bandeira topY={plat.topY} hw={plat.hw} hd={plat.hd} />}
            {plat.tipo === 'ponte' && <CordasDaPonte topY={plat.topY} hw={plat.hw} hd={plat.hd} />}
            {plat.tipo === 'viga' && <RipasDaViga topY={plat.topY} hw={plat.hw} hd={plat.hd} />}
            {/* A seta acompanha a FORMA: numa viga ela estica no comprimento
                dela e vira uma pista para correr; num descanso ela some,
                porque ali o recado é parar, não seguir. */}
            {plat.tipo !== 'partida' && plat.tipo !== 'descanso' && (
                <PlatformArrow
                    topY={plat.topY}
                    size={Math.min(w, d) * 0.78}
                    alonga={plat.tipo === 'viga' ? Math.min(2.4, d / Math.max(w, 0.001) * 0.5) : 1}
                />
            )}
        </group>
    );
});
PlatformView.displayName = 'PlatformView';

// ─── O CÉU: DAR UM LUGAR A ESTA ESCADARIA ────────────────────────────────────
//
// O andar não tinha lugar nenhum. Fundo de cor chapada, sem horizonte, sem
// profundidade, e das quinze nuvens que o código anunciava aparecia UMA, no
// canto, com cara de clip-art colada. As lajes flutuavam num vazio creme, e
// "vazio creme" não é estilo: é cenário que não foi feito.
//
// ── POR QUE TRÊS CAMADAS, E NÃO UM CAMPO SÓ ──────────────────────────────────
//
// Profundidade num céu não vem de ter MAIS nuvem: vem de coisas distintas
// andando em ritmos distintos. Cada camada persegue o jogador com uma constante
// própria, e é a constante que diz a distância dela:
//
//   perseguir RÁPIDO  → a camada gruda no jogador → lê-se como MUITO longe
//   perseguir DEVAGAR → ela fica para trás e passa → lê-se como PERTO
//
// E amortecido, nunca por fator fixo: um fator fixo fica para trás para sempre
// numa escadaria que não acaba, enquanto o amortecimento converge para um
// atraso CONSTANTE (v/k) — que é exatamente o paralaxe, e nunca esvazia.
const SEGUE_FUNDO  = 4.0;   // quase travado: o horizonte
const SEGUE_MEIO   = 0.7;   // as nuvens de sempre
const SEGUE_PERTO  = 0.22;  // varre por perto, bem para trás

// ── TRÊS VALORES, E SÓ TRÊS ──────────────────────────────────────────────────
//
// O grade de película empurra o contraste para a tinta voltar a ser preta. Isso
// tem um preço que só aparece OLHANDO: se a cena inteira já é quase branca —
// céu #eef1f4, tabuado #faf8f3, nuvem #ffffff —, o contraste cola os três no
// mesmo 255 e o andar vira uma folha em branco com contornos. Foi exatamente o
// que a foto mostrou depois de eu consertar o contraste.
//
// A referência de 1930 vive de TRÊS valores: fundo médio, forma clara, tinta
// preta. Então o céu desce para o cinza médio — é ele que dá o fundo contra o
// qual a plataforma branca e a nuvem branca existem.
const CEU_ALTO   = '#8f9dad';   // zênite: cinza médio, o fundo do desenho
const CEU_BAIXO  = '#c8d0da';   // horizonte, mais claro (o ar some na distância)
const SOL_COR    = '#eae4d4';

// ── A ABÓBADA ────────────────────────────────────────────────────────────────
// Uma esfera pelo lado de dentro, com gradiente e um sol difuso baixo. É UM
// draw call e nenhuma luz: no celular do dono do jogo isso importa mais que a
// beleza do truque. `fog: false` porque a névoa serve para as lajes sumirem NO
// céu — enevoar o próprio céu seria apagar o alvo.
const CEU_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const CEU_FRAG = /* glsl */`
  precision mediump float;
  uniform vec3 uAlto;
  uniform vec3 uBaixo;
  uniform vec3 uSol;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uBaixo, uAlto, pow(h, 0.85));
    // Sol difuso no rumo da luz-chave, baixo e largo — dá para onde olhar sem
    // virar um disco recortado, que numa cena de tinta ficaria duro.
    float sol = pow(max(0.0, dot(normalize(vDir), normalize(vec3(-0.35, 0.12, 0.62)))), 6.0);
    col = mix(col, uSol, sol * 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`;
const CEU_GEO = new THREE.SphereGeometry(1, 24, 16);
const CEU_MAT = new THREE.ShaderMaterial({
    vertexShader: CEU_VERT, fragmentShader: CEU_FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
        uAlto:  { value: new THREE.Color(CEU_ALTO) },
        uBaixo: { value: new THREE.Color(CEU_BAIXO) },
        uSol:   { value: new THREE.Color(SOL_COR) },
    },
});

const Abobada: React.FC = () => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(({ camera }) => {
        if (!ref.current) return;
        // Centrada na câmera e dimensionada pelo `far` dela: a abóbada tem de
        // caber DENTRO do plano de corte, senão some justamente no aparelho de
        // qualidade baixa (far 40), que é onde ela mais faz falta.
        ref.current.position.copy(camera.position);
        const far = (camera as THREE.PerspectiveCamera).far || 120;
        ref.current.scale.setScalar(far * 0.88);
    });
    return <mesh ref={ref} geometry={CEU_GEO} material={CEU_MAT} renderOrder={-1000} frustumCulled={false} />;
};

// ── AS TRÊS CAMADAS ──────────────────────────────────────────────────────────
// Posições LOCAIS; cada grupo persegue o Y/Z do jogador no ritmo dela. As de
// trás são grandes e poucas (custam pouco e leem de longe); a da frente são
// três bolotas enormes que cruzam a tela e dão a velocidade da subida.
const NUVENS_FUNDO: Array<{ p: [number,number,number]; s: number }> = [
    { p: [-62,  16, -40], s: 9.0 }, { p: [ 58,  24,  10], s: 10.5 },
    { p: [-40,  30,  55], s: 8.0 }, { p: [ 30, -12,  70], s: 11.0 },
    { p: [ 74,  -6, -60], s: 9.5 }, { p: [-70, -20,  18], s: 8.5 },
];
const NUVENS_MEIO: Array<{ p: [number,number,number]; s: number }> = [
    { p: [-34, 10, -18], s: 3.4 }, { p: [36, 16, -6], s: 4.0 },  { p: [-40, 20, 12], s: 3.0 },
    { p: [30, 6, 22], s: 2.6 },    { p: [-26, 22, 2], s: 3.6 },  { p: [42, 14, 16], s: 3.2 },
    { p: [0, 26, -30], s: 4.4 },   { p: [-44, 4, -2], s: 2.8 },  { p: [22, 18, -22], s: 3.0 },
    { p: [-18, -16, 8], s: 3.8 },  { p: [20, -22, -10], s: 4.2 }, { p: [-38, -10, 20], s: 3.0 },
    { p: [40, -18, 6], s: 3.4 },   { p: [4, -28, 24], s: 4.6 },  { p: [-10, -12, -24], s: 3.2 },
];
const NUVENS_PERTO: Array<{ p: [number,number,number]; s: number }> = [
    { p: [-15, -7,  6], s: 2.3 }, { p: [16, 9, -9], s: 2.6 }, { p: [-13, 12, 20], s: 2.0 },
];

const CamadaDeNuvens: React.FC<{
    nuvens: Array<{ p: [number,number,number]; s: number }>; segue: number;
}> = ({ nuvens, segue }) => {
    const ref = useRef<THREE.Group>(null);
    useFrame((_, dt) => {
        if (!ref.current) return;
        const k = 1 - Math.exp(-segue * Math.min(dt, 0.05));
        ref.current.position.z += (f3PlayerZ.current - ref.current.position.z) * k;
        ref.current.position.y += (f3PlayerY.current - ref.current.position.y) * k;
    });
    return (
        <group ref={ref}>
            {nuvens.map((c, i) => (<CloudPuff key={i} position={c.p} scale={c.s} />))}
        </group>
    );
};

const CeuDoAndar3: React.FC = () => (
    <>
        <Abobada />
        <CamadaDeNuvens nuvens={NUVENS_FUNDO} segue={SEGUE_FUNDO} />
        <CamadaDeNuvens nuvens={NUVENS_MEIO}  segue={SEGUE_MEIO} />
        <CamadaDeNuvens nuvens={NUVENS_PERTO} segue={SEGUE_PERTO} />
    </>
);
// Nada aqui depende do React: memoizado, o céu para de reconciliar suas malhas
// toda vez que a piscina de plataformas recicla (~1×/s).
const CeuMemo = React.memo(CeuDoAndar3);

// ── O HORIZONTE QUE NÃO EXISTIA ──────────────────────────────────────────────
// A névoa era fixa em 60 → 240. O `far` da câmera do jogo é 40, 80 ou 120
// conforme a qualidade: na baixa a névoa NEM COMEÇAVA antes do plano de corte
// (60 > 40), então a escadaria sumia de uma vez, com uma borda dura; na alta
// chegava a 33% de opacidade no corte. Em nenhuma qualidade ela trabalhava.
//
// A cor tem de ser a do céu NO HORIZONTE — é lá que as lajes distantes se
// dissolvem, e a abóbada é mais clara embaixo do que em cima.
const CEU = CEU_BAIXO;

/** Pinta o fundo da cena, atrás da abóbada, e monta a névoa que a alcança. */
const SkyBackground: React.FC = () => {
    const { scene, camera } = useThree();
    useEffect(() => {
        const prevBg = scene.background;
        const prevFog = scene.fog;                       // restaurar, não zerar
        const faixa = faixaDaNevoa((camera as THREE.PerspectiveCamera).far);
        scene.background = new THREE.Color(CEU);
        scene.fog = new THREE.Fog(CEU, faixa.near, faixa.far);
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene, camera]);
    // O `far` muda quando o jogador troca a qualidade no menu, e a câmera é o
    // mesmo objeto — sem isto a névoa ficaria presa na qualidade da entrada.
    useFrame(({ camera: cam, scene: sc }) => {
        const f = sc.fog as THREE.Fog | null;
        if (!f || !(f as THREE.Fog).isFog) return;
        const faixa = faixaDaNevoa((cam as THREE.PerspectiveCamera).far);
        if (f.far !== faixa.far) { f.near = faixa.near; f.far = faixa.far; }
    });
    return null;
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export const Floor3Environment: React.FC<{ elevator?: boolean; hands?: boolean; gloves?: boolean; fallActive?: boolean }> = ({ elevator = true, hands = true, gloves = hands, fallActive = false }) => {
    // Live group refs by platform id, so the single frame loop can drive the
    // moving bridges imperatively (no per-platform useFrame, correct ordering).
    const groupRefs = useRef<Map<number, THREE.Group>>(new Map());
    // Re-render only when the pool recycles (rare — a few times/sec at most).
    const [, bump] = useReducer((n: number) => n + 1, 0);
    // ── O CHÃO SENTE QUEM CAI NELE ────────────────────────────────────────
    // Uma peça por vez: o jogador só pisa numa. `pousouEm` chega com o id no
    // quadro do pouso e -1 nos outros, então isto é um impulso e a mola faz o
    // resto — a mesma `molaDoTranco` da câmera e das mãos, com a afinação mais
    // seca das três (a peça é de tinta e madeira, não uma cama elástica).
    const afundando = useRef({ id: -1, tranco: TRANCO_PARADO });

    // Build the endless course once on mount, then force a render so the freshly
    // populated pool actually paints (reset() mutates a module array, which
    // React can't see on its own).
    useEffect(() => {
        f3Reset();
        if (import.meta.env?.DEV) {
            const c = validateNoOverlaps(f3Platforms);
            if (c.length) console.warn('[Floor3] platform overlaps detected:', c);
        }
        bump();
    }, []);

    useFrame((s, dt) => {
        const before = f3Platforms.length ? f3Platforms[0].id : -1;
        f3Tick(s.clock.elapsedTime, f3PlayerZ.current);
        // Animate moving bridges' live X onto their group transforms.
        for (const p of f3Platforms) {
            if (p.moving) { const g = groupRefs.current.get(p.id); if (g) g.position.x = p.x; }
        }

        // ── O afundar da peça que levou o tombo ───────────────────────────
        const af = afundando.current;
        if (f3HandState.pousouEm >= 0 && f3HandState.pousouEm !== af.id) {
            // Peça nova: devolve a anterior ao lugar antes de trocar.
            const anterior = groupRefs.current.get(af.id);
            if (anterior) anterior.position.y = 0;
            af.id = f3HandState.pousouEm;
            af.tranco = TRANCO_PARADO;
        }
        if (af.id >= 0) {
            af.tranco = molaDoTranco(
                af.tranco,
                f3HandState.pousouEm === af.id ? f3HandState.impacto : 0,
                dt,
                TRANCO_DA_PLATAFORMA,
            );
            const g = groupRefs.current.get(af.id);
            if (g) g.position.y = af.tranco.valor;
            // Parou de tremer e ninguém mais caiu nela: solta a peça.
            if (Math.abs(af.tranco.valor) < 0.0008 && Math.abs(af.tranco.vel) < 0.01) {
                if (g) g.position.y = 0;
                af.id = -1;
            }
        }
        // Detect a recycle (front id changed) and re-render the slot list.
        if ((f3Platforms.length ? f3Platforms[0].id : -1) !== before) bump();
    });

    return (
        <group>
            {/* Flat cartoon sky-blue + cloud field that follows the endless climb */}
            <SkyBackground />
            <CeuMemo />

            {/* Lighting — bright & flat for the rubber-hose cel look */}
            <ambientLight intensity={0.85} color="#eef4ff" />
            <directionalLight position={[-6, 14, 8]} intensity={1.6} color="#fffaf0" castShadow />
            <hemisphereLight args={['#eaf3ff', '#9aa6b4', 0.6]} />
            {/* ── Endless parkour pool ─────────────────────────────────────
                Rendered straight from the live recycling array (f3Parkour),
                floating in the open cloud sky (no chamber — matches the
                rubber-hose reference). Keyed by stable id so React reuses
                slots across recycles; moving bridges driven in the frame loop. */}
            {/* The live climb is hidden during the defeat cutscene — that scene
                renders its OWN staged "high up the obby" set so it never looks
                like the starting landing. */}
            {!fallActive && f3Platforms.map((p) => (
                <PlatformView
                    key={p.id}
                    plat={p}
                    ref={(el) => {
                        if (el) groupRefs.current.set(p.id, el);
                        else groupRefs.current.delete(p.id);
                    }}
                />
            ))}

            {/* Elevator facade */}
            {elevator && !fallActive && (
                <group position={[0, 0, -10]}>
                    <ElevatorFacade z={0} height={5} width={10} />
                </group>
            )}

            {/* First-person cartoon gloves (procedural idle/walk/jump) — hidden
                during the fall cutscene (camera leaves first-person to frame the devil) */}
            {gloves && !fallActive && (
                <Suspense fallback={null}>
                    <FpHands />
                </Suspense>
            )}

            {/* O Diabrete — rival that runs ahead, intro must be done first
                (hidden during the fall cutscene; that scene shows its own devil) */}
            {hands && !fallActive && (
                <Suspense fallback={null}>
                    <Floor3Rival />
                </Suspense>
            )}

            {/* The devil's sabotage: drawn spike-strips + paintbrush pickups */}
            {hands && !fallActive && <Floor3Hazards />}
        </group>
    );
};

export default Floor3Environment;
