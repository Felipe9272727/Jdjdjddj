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
    validateNoOverlaps, type F3Plat,
} from './f3Parkour';
import { createToonMaterial, type ToonOpts } from './cartoonToon';
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

const PlatformArrow: React.FC<{ topY: number; size: number }> = ({ topY, size }) => (
    <mesh geometry={ARROW_GEO} material={ARROW_MAT}
        position={[0, topY + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[size, size, 1]} />
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
const CLOUD_FILL_TOON: ToonOpts = { color: '#ffffff', shadow: '#c4ccd6', bands: 2, rimStrength: 0.4 };
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
const CREAM  = '#f3ecdd';
const CREAM_S= '#c9bd9f';
const WHITE_S= '#c8cdd4';
const CARTOON_PALETTE: ToonOpts[] = [
    { color: '#ffffff', shadow: WHITE_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: CREAM,     shadow: CREAM_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: '#ffffff', shadow: WHITE_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: CREAM,     shadow: CREAM_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: '#ffffff', shadow: WHITE_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
    { color: CREAM,     shadow: CREAM_S, bands: 2, rimStrength: 0.35, specThreshold: 0.95 },
];
const LANDING_TOON: ToonOpts = { color: '#ffffff', shadow: WHITE_S, seams: 4, seamColor: '#d7dde4', rimStrength: 0.3, bands: 2 };

function platToon(p: F3Plat): ToonOpts {
    if (p.palette < 0) return LANDING_TOON;
    // moving bridge: a touch greyer so it reads as "this one slides"
    if (p.moving) return { color: '#dfd9cb', shadow: '#a89c80', bands: 2, rimStrength: 0.35, specThreshold: 0.95 };
    return CARTOON_PALETTE[p.palette % CARTOON_PALETTE.length];
}

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
            {!big && <PlatformArrow topY={plat.topY} size={Math.min(w, d) * 0.78} />}
        </group>
    );
});
PlatformView.displayName = 'PlatformView';

// ─── O céu de nuvens que SEGUE o jogador na subida infinita ──────────────────
// O curso não acaba, então o fundo não pode ficar preso na origem: o jogador
// sairia dele. As nuvens se espalham em volta — acima, ao lado E abaixo — para
// que a subida esteja sempre embrulhada em céu aberto (a referência não tem
// chão nem vazio, só céu). Posições LOCAIS; o grupo é que persegue o Y/Z do
// jogador, e por isso o campo nunca esvazia. (Não há mais esfera de céu nem
// piso do vazio aqui: o fundo é a cor de limpeza da cena e a névoa.)
const CLOUDS: Array<{ p: [number,number,number]; s: number }> = [
    { p: [-34, 10, -18], s: 3.4 }, { p: [36, 16, -6], s: 4.0 },  { p: [-40, 20, 12], s: 3.0 },
    { p: [30, 6, 22], s: 2.6 },    { p: [-26, 22, 2], s: 3.6 },  { p: [42, 14, 16], s: 3.2 },
    { p: [0, 26, -30], s: 4.4 },   { p: [-44, 4, -2], s: 2.8 },  { p: [22, 18, -22], s: 3.0 },
    { p: [-18, -16, 8], s: 3.8 },  { p: [20, -22, -10], s: 4.2 }, { p: [-38, -10, 20], s: 3.0 },
    { p: [40, -18, 6], s: 3.4 },   { p: [4, -28, 24], s: 4.6 },  { p: [-10, -12, -24], s: 3.2 },
];

// ── O CAMPO DE NUVENS NÃO DÁ MAIS SALTOS ─────────────────────────────────────
// Ele seguia o jogador travado numa grade de 8 unidades, "para o paralaxe ler
// como movimento e não como skybox". A intenção estava certa e o efeito era o
// contrário: uma nuvem a 20–45 unidades que anda 8 de uma vez não faz paralaxe,
// ela TELETRANSPORTA — um pulo de 10 a 20 graus de arco, a cada poucos segundos.
//
// Um seguimento amortecido dá as duas coisas de graça: em movimento o campo
// fica para trás por uma distância constante (v/k ≈ 6,7 m a 4 m/s), que é
// exatamente o paralaxe que se queria, e quando o jogador para ele alcança
// suavemente. E, ao contrário de um fator de paralaxe fixo, converge — nunca
// fica para trás para sempre num curso que não acaba.
const SEGUE_NUVENS = 0.6;   // 1/s — quanto menor, mais o céu fica para trás

const FollowEnv: React.FC = () => {
    const ref = useRef<THREE.Group>(null);
    useFrame((_, dt) => {
        if (!ref.current) return;
        const k = 1 - Math.exp(-SEGUE_NUVENS * Math.min(dt, 0.05));
        ref.current.position.z += (f3PlayerZ.current - ref.current.position.z) * k;
        ref.current.position.y += (f3PlayerY.current - ref.current.position.y) * k;
    });
    return (
        <group ref={ref}>
            {CLOUDS.map((c,i)=>(<CloudPuff key={i} position={c.p} scale={c.s} />))}
        </group>
    );
};
// O céu não depende de nada do React: memoizado, ele para de reconciliar 150
// malhas de nuvem toda vez que a piscina de plataformas recicla (~1×/s).
const FollowEnvMemo = React.memo(FollowEnv);

// ── O HORIZONTE QUE NÃO EXISTIA ──────────────────────────────────────────────
// A névoa era fixa em 60 → 240. O `far` da câmera do jogo é 40, 80 ou 120
// conforme a qualidade: na baixa a névoa NEM COMEÇAVA antes do plano de corte
// (60 > 40), então a escadaria sumia de uma vez, com uma borda dura; na alta
// chegava a 33% de opacidade no corte. Em nenhuma qualidade a névoa fazia o
// trabalho dela.
//
// E a cor estava fora do céu (#e7ebef contra #dde2e7): o que se dissolvia não
// virava céu, virava um fantasma pálido um tom acima do fundo. A névoa agora é
// da cor exata do céu e termina onde a câmera corta, em qualquer qualidade —
// então a plataforma mais distante se apaga em vez de piscar para fora.
const CEU = '#dde2e7';          // pale grey-white (B&W)

/** Paints the scene background a flat cartoon sky (reliable clear color —
 *  `<color attach="background">` nested in a group never reaches the scene). */
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

    useFrame((s) => {
        const before = f3Platforms.length ? f3Platforms[0].id : -1;
        f3Tick(s.clock.elapsedTime, f3PlayerZ.current);
        // Animate moving bridges' live X onto their group transforms.
        for (const p of f3Platforms) {
            if (p.moving) { const g = groupRefs.current.get(p.id); if (g) g.position.x = p.x; }
        }
        // Detect a recycle (front id changed) and re-render the slot list.
        if ((f3Platforms.length ? f3Platforms[0].id : -1) !== before) bump();
    });

    return (
        <group>
            {/* Flat cartoon sky-blue + cloud field that follows the endless climb */}
            <SkyBackground />
            <FollowEnvMemo />

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
