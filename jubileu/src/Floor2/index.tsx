/**
 * Floor2/index.tsx — Main Floor2Environment component + re-exports.
 *
 * Assembles the cave + underwater scene from constants, geometry,
 * shaders, and sub-components. Re-exports everything that was
 * previously exported from the monolithic Floor2Underwater.tsx.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Instances, Instance, useTexture, useGLTF } from '@react-three/drei';
import { RoomEnvironment } from 'three-stdlib';
import * as THREE from 'three';
import { ElevatorFacade } from '../Elevator';
import {
    caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO,
    caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO,
    caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO,
    uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO,
    uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
    uwWallColor, uwWallNormal, uwWallRoughness, uwWallAO,
    rockModelA, rockModelB, rockModelC, rockModelD,
    boulderModel, pebbleModel,
} from '../assets/textureImports';

// Re-export everything that was exported from the original monolithic file
export {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
    CAVE_ROCK_COLLIDERS, UW_ROCK_COLLIDERS, CAVE_WALL_COLLIDERS,
    SHARD_POSITIONS,
} from './constants';

// Re-export sub-components (for anyone importing them directly)
export {
    CrystalCluster, Torch, DustMotes,
    WaterSurface, WaterCeilingDisc, DynamicFog, UnderwaterOverlay, WaterOccluder,
    UnderwaterCaustics, KelpField, Coral, UnderwaterFlora,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, Shard,
} from './components';

// Internal imports (not re-exported)
import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
    CAVE_ROCKS_DARK, CAVE_ROCKS_MID, CAVE_ROCKS_LIGHT,
    POOL_RIM, STALAGMITES, STALACTITES,
    CRYSTALS, TORCH_POSITIONS,
    UW_BOULDERS, UW_PEBBLES, UW_SCATTERED_ROCKS,
    UW_CORAL_PILLARS, UW_ARCHES,
    SHARD_POSITIONS,
} from './constants';

import {
    GLOW_TEXTURE,
    CAVE_FLOOR_GEO, PEBBLE_GEO,
    CAVE_CEILING_GEO,
    CAVE_WALL_N_GEO, CAVE_WALL_S_GEO, CAVE_WALL_W_GEO, CAVE_WALL_E_GEO,
    UW_WALL_NORTH_GEO, UW_WALL_SOUTH_GEO, UW_WALL_WEST_GEO, UW_WALL_EAST_GEO,
    UW_FLOOR_GEO,
    PROC_STALAGMITE_GEOS, PROC_STALACTITE_GEOS,
    PROC_ROCK_A, PROC_ROCK_B, PROC_ROCK_C, PROC_ROCK_D,
} from './geometry';

import {
    CrystalCluster, Torch, DustMotes,
    WaterSurface, WaterCeilingDisc, DynamicFog, UnderwaterOverlay, WaterOccluder,
    UnderwaterCaustics, UnderwaterFlora,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, Shard,
} from './components';

import { CausticsMaterial, LightShaftMaterial } from './shaders';

// ─── Texture loading helper ────────────────────────────────────────
function usePBRSet(colorUrl: string, normalUrl: string, roughUrl: string, aoUrl: string, repeatX: number, repeatY: number) {
    const [color, normal, rough, ao] = useTexture([colorUrl, normalUrl, roughUrl, aoUrl]);
    for (const tex of [color, normal, rough, ao]) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeatX, repeatY);
    }
    color.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    rough.colorSpace = THREE.NoColorSpace;
    ao.colorSpace = THREE.NoColorSpace;
    return { color, normal, rough, ao };
}

// ─── Rock GLB model URLs ──────────────────────────────────────────
const ROCK_MODEL_URLS = [rockModelA, rockModelB, rockModelC, rockModelD];
const BOULDER_MODEL_URL = boulderModel;
const PEBBLE_MODEL_URL = pebbleModel;

// ─── BioluminescentPatches — scattered emissive sprite glow points ─
// Cave gets a painterly "alive mineral" quality. Each patch breathes
// at its own phase so the cave hums softly. Quality-gated by the
// caller (only mounted when `reflective` is true).
const BIO_POSITIONS: readonly [number, number, number, string, number][] = [
    // [x, y, z, color, baseScale]
    [-27, 1.4, 12, '#3affaa', 1.4],
    [ 27, 2.2, -8, '#9affd0', 1.2],
    [-15, 0.4, 24, '#3affc8', 1.0],
    [ 18, 1.8, 26, '#5af0d0', 1.3],
    [-22, 4.5, -22, '#9aff80', 1.5],
    [ 24, 3.8, 18, '#3affaa', 1.1],
    [-8, 6.2, -28, '#7affc0', 1.0],
    [ 11, 5.5, 28, '#3affd0', 1.2],
    [-26, 2.5, -3, '#5affb0', 1.0],
    [ 28, 1.2, 22, '#9affb0', 1.3],
    [-2, 0.3, -25, '#3afff0', 0.9],
    [ 6, 0.5, 22, '#5affb0', 0.9],
    // violet/purple accents for mood variety
    [-19, 3.0, -16, '#a06aff', 1.3],
    [ 22, 5.0, 5, '#b07aff', 1.1],
    [-12, 1.5, 6, '#c08aff', 1.0],
    [ 9, 4.2, -22, '#a06aff', 1.2],
];

// ─── CeilingReflectionCaustics — light dancing on the cave ceiling ─
// Water reflects sunlight (or in our case the ember/torch light) up onto
// the cave ceiling — a real-world phenomenon that immediately reads as
// "there's water there". We project a caustic plane just below the
// ceiling, sized to the water hole, with a warm tint (matches the
// ember sprites' glow color) and additive blending so it brightens
// instead of darkening the ceiling texture.
// ─── UpwardLightShaft — magical vertical glow rising from the water ─
// Reads as "there's something supernatural about this hole" — a Subnautica/
// Sea of Thieves trope. A vertical cone with very low additive opacity,
// breathing softly so the cave never feels static. Visible from across
// the cave when the player is above water.
const UpwardLightShaft: React.FC = () => {
    // Two stacked, open-cylinder shells using the LightShaftMaterial.
    // Combined with a soft halo billboard at the source and a tight
    // additive halo at the top, the result reads as a continuous god
    // ray rather than a hard-edged cone.
    const matInner = useMemo(() => {
        const m = new (LightShaftMaterial as any)();
        m.transparent = true; m.depthWrite = false; m.toneMapped = false;
        m.blending = THREE.AdditiveBlending; m.side = THREE.DoubleSide;
        return m;
    }, []);
    const matOuter = useMemo(() => {
        const m = new (LightShaftMaterial as any)();
        m.transparent = true; m.depthWrite = false; m.toneMapped = false;
        m.blending = THREE.AdditiveBlending; m.side = THREE.DoubleSide;
        return m;
    }, []);
    const haloRef = useRef<THREE.SpriteMaterial>(null);
    const topGlowRef = useRef<THREE.SpriteMaterial>(null);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const breath = 0.85 + Math.sin(t * 0.6) * 0.12 + Math.sin(t * 1.7) * 0.05;
        (matInner as any).time = t;
        (matInner as any).intensity = breath * 1.20;
        (matOuter as any).time = t * 0.7 + 5.0;
        (matOuter as any).intensity = breath * 0.55;
        if (haloRef.current) haloRef.current.opacity = 0.55 + breath * 0.20;
        if (topGlowRef.current) topGlowRef.current.opacity = 0.30 + breath * 0.15;
    });
    return (
        <group position={[HOLE_CENTER_X, WATER_LEVEL_Y, HOLE_CENTER_Z]}>
            {/* Inner shaft: tighter, more concentrated.
                Open-ended cylinder (last arg = true) so we don't render top/bottom caps. */}
            <mesh position={[0, 4.0, 0]}>
                <cylinderGeometry args={[1.2, 1.8, 8.0, 64, 4, true]} />
                <primitive object={matInner} attach="material" />
            </mesh>
            {/* Outer shaft: wider, fainter, softer falloff for the volumetric halo */}
            <mesh position={[0, 4.0, 0]}>
                <cylinderGeometry args={[2.4, 3.0, 8.0, 64, 4, true]} />
                <primitive object={matOuter} attach="material" />
            </mesh>
            {/* Bright source halo on the water — billboard, soft falloff */}
            <sprite position={[0, 0.08, 0]} scale={[7, 7, 1]}>
                <spriteMaterial
                    ref={haloRef}
                    color="#a8e8ff"
                    transparent
                    opacity={0.55}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>
            {/* Subtle top glow where the shaft reaches the ceiling */}
            <sprite position={[0, 7.6, 0]} scale={[5, 2.2, 1]}>
                <spriteMaterial
                    ref={topGlowRef}
                    color="#9ad8ee"
                    transparent
                    opacity={0.30}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>
        </group>
    );
};

const CeilingReflectionCaustics: React.FC = () => {
    const mat = useMemo(() => {
        const m = new (CausticsMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.blending = THREE.AdditiveBlending;
        m.toneMapped = false;
        return m;
    }, []);
    useFrame((state) => { (mat as any).time = state.clock.elapsedTime * 0.6; });
    return (
        <mesh
            position={[HOLE_CENTER_X, 7.85, HOLE_CENTER_Z]}
            rotation={[Math.PI / 2, 0, 0]}
        >
            {/* Scale the projection wider than the hole — water reflection
                fans out across the ceiling, not just directly above. */}
            <planeGeometry args={[HOLE_RADIUS * 4.5, HOLE_RADIUS * 4.5]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

const BioluminescentPatches: React.FC = () => {
    const matRefs = React.useRef<(THREE.SpriteMaterial | null)[]>(new Array(BIO_POSITIONS.length).fill(null));
    const haloRefs = React.useRef<(THREE.SpriteMaterial | null)[]>(new Array(BIO_POSITIONS.length).fill(null));
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        for (let i = 0; i < BIO_POSITIONS.length; i++) {
            const phase = i * 0.97;
            const breath = 0.55 + Math.sin(t * 0.8 + phase) * 0.25 + Math.sin(t * 2.3 + phase * 1.7) * 0.08;
            const mat = matRefs.current[i];
            if (mat) mat.opacity = breath;
            const halo = haloRefs.current[i];
            if (halo) halo.opacity = breath * 0.18;
        }
    });
    return (
        <group>
            {BIO_POSITIONS.map(([x, y, z, color, scl], i) => (
                <React.Fragment key={i}>
                    {/* Core dot — bright additive */}
                    <sprite position={[x, y, z]} scale={[0.6 * scl, 0.6 * scl, 1]}>
                        <spriteMaterial
                            ref={(r: any) => { matRefs.current[i] = r; }}
                            color={color}
                            transparent
                            opacity={0.6}
                            depthWrite={false}
                            toneMapped={false}
                            blending={THREE.AdditiveBlending}
                        />
                    </sprite>
                    {/* Halo — larger softer glow */}
                    <sprite position={[x, y, z]} scale={[3 * scl, 3 * scl, 1]}>
                        <spriteMaterial
                            ref={(r: any) => { haloRefs.current[i] = r; }}
                            color={color}
                            transparent
                            opacity={0.15}
                            depthWrite={false}
                            toneMapped={false}
                            blending={THREE.AdditiveBlending}
                        />
                    </sprite>
                </React.Fragment>
            ))}
        </group>
    );
};

// ─── UnderwaterLighting — animates ambient + hemisphere + shaft point light
// based on player Y. Above water it stays warm/cave-toned; below water it
// drives cool cyan-blue tint with a downward focus and a soft "shaft of light
// from above" point light at the hole position.
const UnderwaterLighting: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    reflective: boolean;
}> = ({ playerPositionRef, reflective }) => {
    const ambientRef = useRef<THREE.AmbientLight>(null);
    const hemiRef = useRef<THREE.HemisphereLight>(null);
    const dirRef = useRef<THREE.DirectionalLight>(null);
    const shaftPointRef = useRef<THREE.PointLight>(null);

    // Stable Color instances to lerp toward — avoids allocating per frame
    const _ambCave = useMemo(() => new THREE.Color('#e8d4b0'), []);
    const _ambWater = useMemo(() => new THREE.Color('#4090b0'), []);
    const _hemiCave = useMemo(() => new THREE.Color('#d0b89a'), []);
    const _hemiWater = useMemo(() => new THREE.Color('#3aa0c0'), []);
    const _ambTmp = useMemo(() => new THREE.Color(), []);
    const _hemiTmp = useMemo(() => new THREE.Color(), []);

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const y = playerPositionRef.current?.y ?? 0;
        // 0 = above water, 1 = fully underwater
        const tWater = Math.max(0, Math.min(1, (SWIM_THRESHOLD_Y - y) / 5));
        // Depth fraction (0 at surface, 1 at deepest)
        const depth = Math.max(0, Math.min(1, -y / 29));

        const k = Math.min(1, 8 * safeDt);

        // Ambient — much brighter in the cave so the dark stone textures
        // are readable; cool down + dim slightly underwater for contrast.
        if (ambientRef.current) {
            _ambTmp.copy(_ambCave).lerp(_ambWater, tWater);
            ambientRef.current.color.lerp(_ambTmp, k);
            const tgtInt = 1.10 - tWater * 0.45;
            ambientRef.current.intensity += (tgtInt - ambientRef.current.intensity) * k;
        }
        // Hemisphere — same idea: bright warm key from above in the cave,
        // colder and dimmer underwater.
        if (hemiRef.current) {
            _hemiTmp.copy(_hemiCave).lerp(_hemiWater, tWater);
            hemiRef.current.color.lerp(_hemiTmp, k);
            const tgtInt = 0.70 - tWater * 0.10;
            hemiRef.current.intensity += (tgtInt - hemiRef.current.intensity) * k;
        }
        // Directional light — only "active" underwater, focused down from hole
        if (dirRef.current) {
            // Stronger when near surface, fades with depth (light absorption)
            const tgt = tWater * (1.0 - depth * 0.6) * 1.2;
            dirRef.current.intensity += (tgt - dirRef.current.intensity) * k;
        }
        // Shaft point light — only active when player is underwater AND
        // close-ish to the hole horizontally (avoid over-illuminating far corners)
        if (shaftPointRef.current) {
            const dx = (playerPositionRef.current?.x ?? 0) - HOLE_CENTER_X;
            const dz = (playerPositionRef.current?.z ?? 0) - HOLE_CENTER_Z;
            const horiz = Math.sqrt(dx * dx + dz * dz);
            const proximity = Math.max(0, 1 - horiz / 25);
            const tgt = tWater * proximity * (1.0 - depth * 0.4) * 1.4;
            shaftPointRef.current.intensity += (tgt - shaftPointRef.current.intensity) * k;
        }
    });

    return (
        <>
            <ambientLight ref={ambientRef} intensity={1.10} color="#e8d4b0" />
            <hemisphereLight ref={hemiRef} intensity={0.70} color="#d0b89a" groundColor="#1a1208" />
            <directionalLight
                position={[HOLE_CENTER_X, 12, HOLE_CENTER_Z]}
                target-position={[HOLE_CENTER_X, -25, HOLE_CENTER_Z]}
                intensity={0}
                color="#5acce0"
                ref={dirRef}
            />
            {/* "Shaft of light from above" — soft underwater point light at the hole.
                Distance ~22 so it focuses on the upper underwater zone. */}
            {reflective && (
                <pointLight
                    ref={shaftPointRef}
                    position={[HOLE_CENTER_X, -3, HOLE_CENTER_Z]}
                    intensity={0}
                    color="#7ad4e8"
                    distance={22}
                    decay={2}
                />
            )}
        </>
    );
};

// ─── CaveIBL — procedural environment map for PBR materials ───────────
// Generates a small PMREM (pre-filtered mipmap radiance environment map)
// from Three.js's RoomEnvironment.  This gives PBR materials (the GLB
// concierge, the wet rock around the well, the cave rocks) something to
// reflect, which is what makes them read as 3D surfaces instead of flat
// colour planes.  Self-contained — no HDRI download.
const CaveIBL: React.FC = () => {
    const { gl, scene } = useThree();
    useEffect(() => {
        const pmrem = new THREE.PMREMGenerator(gl);
        pmrem.compileEquirectangularShader();
        const room = RoomEnvironment();
        const envRT = pmrem.fromScene(room, 0.04);
        scene.environment = envRT.texture;
        // Don't set scene.background — DynamicFog owns background colour.
        return () => {
            scene.environment = null;
            envRT.dispose();
            pmrem.dispose();
        };
    }, [gl, scene]);
    return null;
};

// ─── Full level ────────────────────────────────────────────────────────
interface Floor2EnvironmentProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    collectedShards: Set<number>;
    onCollectShard: (i: number) => void;
    reflective?: boolean;
}
export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
    reflective = false,
}) => {
    // ─── Load real PBR texture sets ────────────────────────────────
    const caveFloor = usePBRSet(
        caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO,
        12, 12
    );
    const caveWall = usePBRSet(
        caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO,
        4, 2
    );
    const caveRock = usePBRSet(
        caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO,
        1, 1
    );
    const uwFloor = usePBRSet(
        uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO,
        20, 20
    );
    const uwRock = usePBRSet(
        uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
        1, 1
    );
    const uwWall = usePBRSet(
        uwWallColor, uwWallNormal, uwWallRoughness, uwWallAO,
        4, 2
    );

    // ─── Load rock GLB models ──────────────────────────────────────
    const rockModels = ROCK_MODEL_URLS.map(u => useGLTF(u));
    const boulderModel_ = useGLTF(BOULDER_MODEL_URL);

    // Clone scenes and override materials with our PBR cave rock textures
    // so GLB default materials (often too bright) don't clash with the dark cave
    const rockScenes = useMemo(() => rockModels.map(m => {
        const scene = m.scene.clone(true);
        scene.traverse((child: any) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    color: '#1a1610',
                    map: caveRock.color,
                    normalMap: caveRock.normal,
                    normalScale: new THREE.Vector2(2.0, 2.0),
                    roughnessMap: caveRock.rough,
                    roughness: 0.92,
                    aoMap: caveRock.ao,
                    aoMapIntensity: 0.6,
                });
            }
        });
        return scene;
    }), [rockModels, caveRock]);

    // UW rock scenes — same GLB models but with underwater PBR materials
    const uwRockScenes = useMemo(() => rockModels.map(m => {
        const scene = m.scene.clone(true);
        scene.traverse((child: any) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    color: '#0a0c08',
                    map: uwRock.color,
                    normalMap: uwRock.normal,
                    normalScale: new THREE.Vector2(2.0, 2.0),
                    roughnessMap: uwRock.rough,
                    roughness: 0.95,
                    aoMap: uwRock.ao,
                    aoMapIntensity: 0.5,
                });
            }
        });
        return scene;
    }), [rockModels, uwRock]);

    const boulderScene = useMemo(() => {
        const scene = boulderModel_.scene.clone(true);
        scene.traverse((child: any) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    color: '#1a1610',
                    map: caveRock.color,
                    normalMap: caveRock.normal,
                    normalScale: new THREE.Vector2(2.0, 2.0),
                    roughnessMap: caveRock.rough,
                    roughness: 0.92,
                    aoMap: caveRock.ao,
                    aoMapIntensity: 0.6,
                });
            }
        });
        return scene;
    }, [boulderModel_, caveRock]);

    return (
    <group>
        <color attach="background" args={['#1c1410']} />
        <fog attach="fog" args={['#1c1410', 14, 110]} />

        {/* Cave lighting — moody but visible. Significantly brighter than
            the original horror lobby so the player can read the geometry
            and see the diver/items. UnderwaterLighting handles the
            warm-cave-to-cool-cyan transition as the player submerges. */}
        <UnderwaterLighting playerPositionRef={playerPositionRef} reflective={reflective} />

        {/* IBL — feeds PBR materials (cave rocks, GLB NPC) with proper
            reflections.  Without an environment map the Tripo concierge's
            metallicRoughnessTexture has nothing to reflect, so the model
            renders as flat shaded surfaces ("PNG-like").
            Uses Three's procedural RoomEnvironment so the bundle stays
            self-contained (no external HDRI download). */}
        <CaveIBL />

        <directionalLight position={[5, 20, 5]} intensity={0.95} color="#ffe8c0" />
        {/* Secondary key light from the opposite side — fills shadows on
            the elevator wall when the player exits. */}
        <directionalLight position={[-8, 15, -8]} intensity={0.55} color="#fff0d0" />
        {/* Elevator exit lantern — bright warm pointLight right in front
            of the doors, so the player and the diver are both well-lit
            the moment doors open. Finite distance (never 0). */}
        <pointLight position={[0, 3.0, -7]} intensity={2.8} distance={12} decay={1.4} color="#FFE0B2" />

        {/* Ember sprites — warm glow on floor, NO pointLight (square artifact) */}
        <sprite position={[-25, 0.8, 0]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#7a3010" transparent opacity={0.55} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[25, 0.8, -5]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#7a3010" transparent opacity={0.55} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[0, 0.8, 25]} scale={[5, 5, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#7a3010" transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        {/* Extra ember glows near the elevator exit — frame the diver */}
        <sprite position={[-6, 0.6, -8]} scale={[5, 5, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#FFD080" transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[6, 0.6, -8]} scale={[5, 5, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#FFD080" transparent opacity={0.45} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>

        {/* Bioluminescent patches scattered across the cave — small breathing
            cyan/violet/teal sprites that read as "alive mineral" or glowing
            moss. Adds the painterly depth that pushes the cave from "dim"
            into "magical / haunted aquarium". Quality-gated to high. */}
        {reflective && <BioluminescentPatches />}

        <DynamicFog playerPositionRef={playerPositionRef} />

        {/* ─── CAVE FLOOR with hole ─── */}
        <mesh
            geometry={CAVE_FLOOR_GEO}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
        >
            <meshStandardMaterial
                color="#2a2218"
                map={caveFloor.color}
                normalMap={caveFloor.normal}
                normalScale={new THREE.Vector2(2.0, 2.0)}
                roughnessMap={caveFloor.rough}
                roughness={0.88}
                aoMap={caveFloor.ao}
                aoMapIntensity={1.0}
                side={THREE.DoubleSide}
            />
        </mesh>

        {/* Cave floor underside — blocks X-ray from underwater looking up */}
        <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[64, 64]} />
            <meshStandardMaterial color="#0a0806" map={caveFloor.color} normalMap={caveFloor.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughnessMap={caveFloor.rough} roughness={0.95} aoMap={caveFloor.ao} aoMapIntensity={1.2} side={THREE.BackSide} />
        </mesh>

        {/* Cave ceiling — 3D ORGANIC with stalactite-like bumps */}
        <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} geometry={CAVE_CEILING_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>

        {/* CAVE WALLS — ORGANIC displaced PlaneGeometry */}
        {/* North wall (z = -30) — faces +Z (inward) */}
        <mesh position={[0, 5, -30]} rotation={[0, 0, 0]} geometry={CAVE_WALL_N_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
        {/* South wall (z = 30) — faces -Z (inward) */}
        <mesh position={[0, 5, 30]} rotation={[0, Math.PI, 0]} geometry={CAVE_WALL_S_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
        {/* West wall (x = -30) — faces +X (inward) */}
        <mesh position={[-30, 5, 0]} rotation={[0, Math.PI / 2, 0]} geometry={CAVE_WALL_W_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
        {/* East wall (x = 30) — faces -X (inward) */}
        <mesh position={[30, 5, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={CAVE_WALL_E_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>

        {/* Cave boulders — real GLB models with PBR textures */}
        {CAVE_ROCKS_DARK.map(([x, y, z, s, ry], i) => (
            <group key={`dark-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}
        {CAVE_ROCKS_MID.map(([x, y, z, s, ry], i) => (
            <group key={`mid-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[(i + 1) % 4].clone(true)} />
            </group>
        ))}
        {/* Light pebbles — instanced icosahedra */}
        <Instances limit={CAVE_ROCKS_LIGHT.length} range={CAVE_ROCKS_LIGHT.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={caveRock.rough} roughness={0.85} aoMap={caveRock.ao} aoMapIntensity={0.5} />
            {CAVE_ROCKS_LIGHT.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* POOL RIM — individual boulders forming the circular edge */}
        {POOL_RIM.map(([x, y, z, s, ry], i) => (
            <group key={`rim-${i}`} position={[x, y + s * 0.25, z]} scale={[s, s * 0.5, s]} rotation={[0, ry, 0]}>
                <primitive object={rockScenes[i % 4].clone(true)} />
            </group>
        ))}

        {/* Stalagmites — procedural noise-displaced cones rising from the floor */}
        {STALAGMITES.map(([x, z, h, r], i) => (
            <mesh key={`stalagmite-${i}`} position={[x, h / 2, z]} geometry={PROC_STALAGMITE_GEOS[i % PROC_STALAGMITE_GEOS.length]}>
                <meshStandardMaterial color="#3a3024" map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughness={0.95} />
            </mesh>
        ))}

        {/* Stalactites — procedural noise-displaced inverted cones from the ceiling */}
        {STALACTITES.map(([x, z, h, r], i) => (
            <mesh key={`stalactite-${i}`} position={[x, 8 - h / 2, z]} rotation={[Math.PI, 0, 0]} geometry={PROC_STALACTITE_GEOS[i % PROC_STALACTITE_GEOS.length]}>
                <meshStandardMaterial color="#322a1f" map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(1.5, 1.5)} roughness={0.95} />
            </mesh>
        ))}

        {/* Decorative glowing crystal clusters on the walls */}
        {CRYSTALS.map(([x, y, z, color], i) => (
            <CrystalCluster key={`crystal-${i}`} x={x} y={y} z={z} color={color} />
        ))}

        {/* Wall-mounted torches with flicker */}
        {TORCH_POSITIONS.map(([x, y, z], i) => (
            <Torch key={`torch-${i}`} x={x} y={y} z={z} seed={i * 7.3} />
        ))}

        {/* Floating dust motes catching the warm light */}
        <DustMotes />

        {/* ─── WELL SHAFT — stone walls from cave floor down to water ─── */}
        {/* Inward-facing cylinder (BackSide) creates the illusion of a
            real well: the player walks over the rim, sees stone walls
            descending below, and the water surface sits at the bottom.
            Rock texture matches the surrounding cave rock for cohesion. */}
        <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y / 2, HOLE_CENTER_Z]}>
            <cylinderGeometry args={[HOLE_RADIUS - 0.02, HOLE_RADIUS - 0.02, Math.abs(WATER_LEVEL_Y), 96, 12, true]} />
            <meshStandardMaterial
                color="#1b1610"
                map={caveRock.color}
                normalMap={caveRock.normal}
                normalScale={new THREE.Vector2(2.2, 2.2)}
                roughnessMap={caveRock.rough}
                roughness={0.95}
                aoMap={caveRock.ao}
                aoMapIntensity={1.0}
                side={THREE.BackSide}
            />
        </mesh>
        {/* Inner foam / wet-rock ring just at the water line — bright,
            slightly emissive band so the eye instantly registers "water". */}
        <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y + 0.04, HOLE_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[HOLE_RADIUS - 0.20, HOLE_RADIUS - 0.02, 96, 4]} />
            <meshStandardMaterial
                color="#cbe8f0"
                emissive="#5aa8bd"
                emissiveIntensity={0.55}
                roughness={0.6}
                transparent
                opacity={0.85}
                side={THREE.DoubleSide}
                toneMapped={false}
            />
        </mesh>

        {/* Outer bevelled stone rim — thick collar of rock around the well
            mouth.  Torus segment gives the rim depth and softness instead of
            the flat circle a single plane would produce, which the
            "low-poly" feedback was about. */}
        <mesh position={[HOLE_CENTER_X, 0.02, HOLE_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[HOLE_RADIUS + 0.15, 0.35, 12, 64]} />
            <meshStandardMaterial
                color="#352a22"
                map={caveRock.color}
                normalMap={caveRock.normal}
                normalScale={new THREE.Vector2(2.4, 2.4)}
                roughnessMap={caveRock.rough}
                roughness={0.97}
                aoMap={caveRock.ao}
                aoMapIntensity={1.2}
            />
        </mesh>
        {/* Strong downward point light hanging above the water — illuminates
            the well walls and water surface from above so the depth reads. */}
        <pointLight position={[HOLE_CENTER_X, 1.2, HOLE_CENTER_Z]} intensity={3.5} distance={8} decay={1.4} color="#a8d8f0" />
        <pointLight position={[HOLE_CENTER_X, WATER_LEVEL_Y + 0.5, HOLE_CENTER_Z]} intensity={2.2} distance={5} decay={1.5} color="#7ac0d4" />

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface reflective={reflective} />

        {/* Light dancing on the cave ceiling above the water — sells the
            "there's water below" effect. Quality-gated to high. */}
        {reflective && <CeilingReflectionCaustics />}

        {/* Vertical cyan glow shaft from the water surface — visible from
            across the cave, magic-source feel. */}
        <UpwardLightShaft />

        {/* Opaque water column */}
        <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y - 16, HOLE_CENTER_Z]}>
            <cylinderGeometry args={[HOLE_RADIUS + 0.15, HOLE_RADIUS + 0.15, 32, 32, 1, true]} />
            <meshBasicMaterial color="#020508" side={THREE.BackSide} depthWrite={true} transparent={false} />
        </mesh>
        <WaterCeilingDisc />
        <WaterOccluder playerPositionRef={playerPositionRef} />

        {/* Underwater overlay */}
        <UnderwaterOverlay playerPositionRef={playerPositionRef} />

        {/* ─── UNDERWATER (Y < 0) ────────────────────────────────────── */}
        <mesh geometry={UW_FLOOR_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]}>
            <meshStandardMaterial
                color="#0c100a"
                map={uwFloor.color}
                normalMap={uwFloor.normal}
                normalScale={new THREE.Vector2(2.0, 2.0)}
                roughnessMap={uwFloor.rough}
                roughness={0.92}
                aoMap={uwFloor.ao}
                aoMapIntensity={0.8}
            />
        </mesh>

        {/* RGB caustics on the seafloor */}
        <UnderwaterCaustics playerPositionRef={playerPositionRef} />

        {/* Underwater flora — kelp & coral */}
        <UnderwaterFlora />

        {/* God ray shafts descending from the surface */}
        <GodRayShafts playerPositionRef={playerPositionRef} />
        <GodRays playerPositionRef={playerPositionRef} />

        {/* God ray — volumetric light beam from the water hole */}
        <GodRay />

        {/* Deep Mist — parallax fog layers */}
        <DeepMist reflective={reflective} />

        {/* Underwater sediment — floating particles for depth perception */}
        <UnderwaterSediment />

        {/* Debris particles — tiny specs drifting */}
        <DebrisField />

        {/* Small fish school looping around the boulder field */}
        <FishSchool />

        {/* Underwater boulders — with UW PBR materials */}
        {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
            <group key={`uwb-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]}>
                <primitive object={uwRockScenes[i % 4].clone(true)} />
            </group>
        ))}

        {/* Underwater pebbles — darkened */}
        <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#0c0c0a" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(1.8, 1.8)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.5} />
            {UW_PEBBLES.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        <BubbleField />
        <SurfaceBubbleRing />
        <PlanktonField />

        {/* Scattered 3D rock formations on the underwater floor — procedural noise rocks */}
        {UW_SCATTERED_ROCKS.map(([x, y, z, s, ry, rx], i) => (
            <mesh
                key={`uwrock-${i}`}
                position={[x, y + s * 0.4, z]}
                scale={[s, s * 0.7, s]}
                rotation={[rx, ry, 0]}
                geometry={i % 4 === 0 ? PROC_ROCK_A : i % 4 === 1 ? PROC_ROCK_B : i % 4 === 2 ? PROC_ROCK_C : PROC_ROCK_D}
            >
                <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
            </mesh>
        ))}

        {/* ─── UNDERWATER CAVE WALLS — organic displaced PlaneGeometry ─── */}
        {/* North underwater wall (z = -30) — faces +Z (inward) */}
        <mesh position={[0, -15, -30]} rotation={[0, 0, 0]} geometry={UW_WALL_NORTH_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* South underwater wall (z = 30) — faces -Z (inward) */}
        <mesh position={[0, -15, 30]} rotation={[0, Math.PI, 0]} geometry={UW_WALL_SOUTH_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* West underwater wall (x = -30) — faces +X (inward) */}
        <mesh position={[-30, -15, 0]} rotation={[0, Math.PI / 2, 0]} geometry={UW_WALL_WEST_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* East underwater wall (x = 30) — faces -X (inward) */}
        <mesh position={[30, -15, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={UW_WALL_EAST_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>

        {/* Underwater coral/rock pillars — tall vertical formations */}
        {UW_CORAL_PILLARS.map(([x, z, h, rTop, rBot], i) => (
            <mesh key={`coral-${i}`} position={[x, -30 + h / 2, z]}>
                <cylinderGeometry args={[rTop, rBot, h, 8]} />
                <meshStandardMaterial color="#0c0e08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading side={THREE.DoubleSide} />
            </mesh>
        ))}

        {/* Underwater arches — curved rock formations spanning the seafloor */}
        {UW_ARCHES.map(([x, z, h, span, thick], i) => (
            <group key={`arch-${i}`} position={[x, -30, z]}>
                {/* Left pillar */}
                <mesh position={[-span / 2, h / 2, 0]}>
                    <cylinderGeometry args={[thick, thick * 1.3, h, 6]} />
                    <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
                {/* Right pillar */}
                <mesh position={[span / 2, h / 2, 0]}>
                    <cylinderGeometry args={[thick, thick * 1.3, h, 6]} />
                    <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
                {/* Top beam */}
                <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[thick * 0.8, thick * 0.8, span + thick * 2, 6]} />
                    <meshStandardMaterial color="#0c0e08" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
            </group>
        ))}

        {SHARD_POSITIONS.map((pos, i) => (
            <Shard
                key={i}
                index={i}
                position={pos}
                collected={collectedShards.has(i)}
                onCollect={onCollectShard}
                playerPositionRef={playerPositionRef}
            />
        ))}

        {/* Elevator shell — in the cave wall */}
        <group position={[0, 0, -10]}>
            <ElevatorFacade z={0} height={5} width={10} />
            <mesh position={[0, 2.5, -6.5]}><boxGeometry args={[11, 5, 1]} /><meshStandardMaterial color="#1a1612" /></mesh>
            <mesh position={[-5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
            <mesh position={[5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
            <mesh position={[0, 5.25, -3.25]}><boxGeometry args={[11, 0.5, 7.5]} /><meshStandardMaterial color="#1a1612" /></mesh>
        </group>
    </group>
    );
};
