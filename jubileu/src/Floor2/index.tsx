/**
 * Floor2/index.tsx — Main Floor2Environment component + re-exports.
 *
 * Assembles the cave + underwater scene from constants, geometry,
 * shaders, and sub-components. Re-exports everything that was
 * previously exported from the monolithic Floor2Underwater.tsx.
 */

import React, { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Instances, Instance, useTexture, useGLTF } from '@react-three/drei';
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
export { CrystalCluster, Torch, TorchField, DustMotes } from './cave-features';
export {
    WaterSurface, WaterCeilingDisc, DynamicFog, UnderwaterOverlay, WaterOccluder,
} from './water-effects';
export {
    UnderwaterCaustics, KelpField, Coral, UnderwaterFlora,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, Shard, ShardField,
} from './underwater-effects';
export { BioluminescentPatches, UpwardLightShaft, CeilingReflectionCaustics, UnderwaterLighting, CaveIBL } from './lighting';

// Internal imports (not re-exported)
import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
    CAVE_ROCKS_DARK, CAVE_ROCKS_MID, CAVE_ROCKS_LIGHT,
    POOL_RIM, STALAGMITES, STALACTITES,
    CRYSTALS, TORCH_POSITIONS,
    UW_BOULDERS, UW_PEBBLES, UW_SCATTERED_ROCKS,
    UW_CORAL_PILLARS, UW_ARCHES,
    swimmerY,
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

import { CrystalCluster, TorchField, DustMotes } from './cave-features';
import { WaterSurface, WaterCeilingDisc, DynamicFog, UnderwaterOverlay, WaterOccluder } from './water-effects';
import {
    UnderwaterCaustics, UnderwaterFlora,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, ShardField,
} from './underwater-effects';
import { BioluminescentPatches, UpwardLightShaft, CeilingReflectionCaustics, UnderwaterLighting, CaveIBL } from './lighting';
import { MonsterFish } from './MonsterFish';


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

// Stable Vector2 instances — avoids new allocations (and forced material
// uniform updates) every time Floor2Environment renders.
const V2_15 = /*@__PURE__*/ new THREE.Vector2(1.5, 1.5);
const V2_18 = /*@__PURE__*/ new THREE.Vector2(1.8, 1.8);
const V2_20 = /*@__PURE__*/ new THREE.Vector2(2.0, 2.0);
const V2_22 = /*@__PURE__*/ new THREE.Vector2(2.2, 2.2);
const V2_24 = /*@__PURE__*/ new THREE.Vector2(2.4, 2.4);
const V2_25 = /*@__PURE__*/ new THREE.Vector2(2.5, 2.5);


// ─── Full level ────────────────────────────────────────────────────────
interface Floor2EnvironmentProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    collectedShards: Set<number>;
    onCollectShard: (i: number) => void;
    onPlayerCaught?: () => void;
    reflective?: boolean;
    monsterPositionRef?: React.MutableRefObject<THREE.Vector3>;
    monsterProximityRef?: React.MutableRefObject<number>;
}
export const Floor2Environment: React.FC<Floor2EnvironmentProps> = ({
    playerPositionRef,
    collectedShards,
    onCollectShard,
    onPlayerCaught,
    reflective = false,
    monsterPositionRef,
    monsterProximityRef,
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
    const rockModels = useGLTF(ROCK_MODEL_URLS);
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
                    normalScale: V2_20,
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
                    normalScale: V2_20,
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
                    normalScale: V2_20,
                    roughnessMap: caveRock.rough,
                    roughness: 0.92,
                    aoMap: caveRock.ao,
                    aoMapIntensity: 0.6,
                });
            }
        });
        return scene;
    }, [boulderModel_, caveRock]);

    // Pre-clone all individual rock GLB scenes so they are never re-cloned
    // during render (JSX re-evaluation would call .clone(true) every frame
    // otherwise, which is extremely expensive for complex scene graphs).
    const caveRockClones = useMemo(() => [
        ...CAVE_ROCKS_DARK.map((_, i) => rockScenes[i % 4].clone(true)),
        ...CAVE_ROCKS_MID.map((_, i) => rockScenes[(i + 1) % 4].clone(true)),
    ], [rockScenes]);

    const uwRockClones = useMemo(() =>
        UW_BOULDERS.map((_, i) => uwRockScenes[i % 4].clone(true)),
        [uwRockScenes]);

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
                normalScale={V2_20}
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
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={V2_25} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>

        {/* CAVE WALLS — ORGANIC displaced PlaneGeometry */}
        {/* North wall (z = -30) — faces +Z (inward) */}
        <mesh position={[0, 5, -30]} rotation={[0, 0, 0]} geometry={CAVE_WALL_N_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={V2_25} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
        {/* South wall (z = 30) — faces -Z (inward) */}
        <mesh position={[0, 5, 30]} rotation={[0, Math.PI, 0]} geometry={CAVE_WALL_S_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={V2_25} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
        {/* West wall (x = -30) — faces +X (inward) */}
        <mesh position={[-30, 5, 0]} rotation={[0, Math.PI / 2, 0]} geometry={CAVE_WALL_W_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={V2_25} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>
        {/* East wall (x = 30) — faces -X (inward) */}
        <mesh position={[30, 5, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={CAVE_WALL_E_GEO}>
            <meshStandardMaterial color="#221c14" map={caveWall.color} normalMap={caveWall.normal} normalScale={V2_25} roughnessMap={caveWall.rough} roughness={0.92} aoMap={caveWall.ao} aoMapIntensity={0.8} side={THREE.DoubleSide} />
        </mesh>

        {/* Cave boulders — real GLB models, pre-cloned in useMemo */}
        {CAVE_ROCKS_DARK.map(([x, y, z, s, ry], i) => (
            <group key={`dark-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]}>
                <primitive object={caveRockClones[i]} />
            </group>
        ))}
        {CAVE_ROCKS_MID.map(([x, y, z, s, ry], i) => (
            <group key={`mid-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]}>
                <primitive object={caveRockClones[CAVE_ROCKS_DARK.length + i]} />
            </group>
        ))}
        {/* Light pebbles — instanced icosahedra */}
        <Instances limit={CAVE_ROCKS_LIGHT.length} range={CAVE_ROCKS_LIGHT.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial map={caveRock.color} normalMap={caveRock.normal} normalScale={V2_20} roughnessMap={caveRock.rough} roughness={0.85} aoMap={caveRock.ao} aoMapIntensity={0.5} />
            {CAVE_ROCKS_LIGHT.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {/* Stalagmites — procedural noise-displaced cones rising from the floor */}
        {STALAGMITES.map(([x, z, h, r], i) => (
            <mesh key={`stalagmite-${i}`} position={[x, h / 2, z]} geometry={PROC_STALAGMITE_GEOS[i % PROC_STALAGMITE_GEOS.length]}>
                <meshStandardMaterial color="#3a3024" map={caveRock.color} normalMap={caveRock.normal} normalScale={V2_15} roughness={0.95} />
            </mesh>
        ))}

        {/* Stalactites — procedural noise-displaced inverted cones from the ceiling */}
        {STALACTITES.map(([x, z, h, r], i) => (
            <mesh key={`stalactite-${i}`} position={[x, 8 - h / 2, z]} rotation={[Math.PI, 0, 0]} geometry={PROC_STALACTITE_GEOS[i % PROC_STALACTITE_GEOS.length]}>
                <meshStandardMaterial color="#322a1f" map={caveRock.color} normalMap={caveRock.normal} normalScale={V2_15} roughness={0.95} />
            </mesh>
        ))}

        {/* Decorative glowing crystal clusters on the walls */}
        {CRYSTALS.map(([x, y, z, color], i) => (
            <CrystalCluster key={`crystal-${i}`} x={x} y={y} z={z} color={color} />
        ))}

        {/* Wall-mounted torches with flicker — single TorchField (1 useFrame total) */}
        <TorchField positions={TORCH_POSITIONS} />

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
                normalScale={V2_22}
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
                normalScale={V2_24}
                roughnessMap={caveRock.rough}
                roughness={0.97}
                aoMap={caveRock.ao}
                aoMapIntensity={1.2}
            />
        </mesh>
        {/* Strong downward point light hanging above the water — illuminates
            the well walls and water surface from above so the depth reads. */}
        <pointLight position={[HOLE_CENTER_X, 1.2, HOLE_CENTER_Z]} intensity={3.5} distance={8} decay={1.4} color="#a8d8f0" />
        {reflective && <pointLight position={[HOLE_CENTER_X, WATER_LEVEL_Y + 0.5, HOLE_CENTER_Z]} intensity={2.2} distance={5} decay={1.5} color="#7ac0d4" />}

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
                normalScale={V2_20}
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

        {/* Underwater sediment, debris, fish — gated to high quality */}
        {reflective && <UnderwaterSediment />}
        {reflective && <DebrisField />}
        {reflective && <FishSchool />}

        {/* Underwater boulders — pre-cloned in useMemo */}
        {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
            <group key={`uwb-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]}>
                <primitive object={uwRockClones[i]} />
            </group>
        ))}

        {/* Underwater pebbles — darkened */}
        <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
            <meshStandardMaterial color="#0c0c0a" map={uwRock.color} normalMap={uwRock.normal} normalScale={V2_18} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.5} />
            {UW_PEBBLES.map(([x, y, z, s, ry], i) => (
                <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
            ))}
        </Instances>

        {reflective && <BubbleField />}
        <SurfaceBubbleRing />
        {reflective && <PlanktonField />}

        {/* Scattered 3D rock formations on the underwater floor — procedural noise rocks */}
        {UW_SCATTERED_ROCKS.map(([x, y, z, s, ry, rx], i) => (
            <mesh
                key={`uwrock-${i}`}
                position={[x, y + s * 0.4, z]}
                scale={[s, s * 0.7, s]}
                rotation={[rx, ry, 0]}
                geometry={i % 4 === 0 ? PROC_ROCK_A : i % 4 === 1 ? PROC_ROCK_B : i % 4 === 2 ? PROC_ROCK_C : PROC_ROCK_D}
            >
                <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={V2_20} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
            </mesh>
        ))}

        {/* ─── UNDERWATER CAVE WALLS — organic displaced PlaneGeometry ─── */}
        {/* North underwater wall (z = -30) — faces +Z (inward) */}
        <mesh position={[0, -15, -30]} rotation={[0, 0, 0]} geometry={UW_WALL_NORTH_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={V2_20} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* South underwater wall (z = 30) — faces -Z (inward) */}
        <mesh position={[0, -15, 30]} rotation={[0, Math.PI, 0]} geometry={UW_WALL_SOUTH_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={V2_20} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* West underwater wall (x = -30) — faces +X (inward) */}
        <mesh position={[-30, -15, 0]} rotation={[0, Math.PI / 2, 0]} geometry={UW_WALL_WEST_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={V2_20} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>
        {/* East underwater wall (x = 30) — faces -X (inward) */}
        <mesh position={[30, -15, 0]} rotation={[0, -Math.PI / 2, 0]} geometry={UW_WALL_EAST_GEO}>
            <meshStandardMaterial color="#0a0c08" map={uwWall.color} normalMap={uwWall.normal} normalScale={V2_20} roughnessMap={uwWall.rough} roughness={0.92} aoMap={uwWall.ao} aoMapIntensity={1.2} side={THREE.DoubleSide} />
        </mesh>

        {/* Underwater coral/rock pillars — tall vertical formations */}
        {UW_CORAL_PILLARS.map(([x, z, h, rTop, rBot], i) => (
            <mesh key={`coral-${i}`} position={[x, -30 + h / 2, z]}>
                <cylinderGeometry args={[rTop, rBot, h, 8]} />
                <meshStandardMaterial color="#0c0e08" map={uwRock.color} normalMap={uwRock.normal} normalScale={V2_25} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading side={THREE.DoubleSide} />
            </mesh>
        ))}

        {/* Underwater arches — curved rock formations spanning the seafloor */}
        {UW_ARCHES.map(([x, z, h, span, thick], i) => (
            <group key={`arch-${i}`} position={[x, -30, z]}>
                {/* Left pillar */}
                <mesh position={[-span / 2, h / 2, 0]}>
                    <cylinderGeometry args={[thick, thick * 1.3, h, 6]} />
                    <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={V2_20} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
                {/* Right pillar */}
                <mesh position={[span / 2, h / 2, 0]}>
                    <cylinderGeometry args={[thick, thick * 1.3, h, 6]} />
                    <meshStandardMaterial color="#0a0c08" map={uwRock.color} normalMap={uwRock.normal} normalScale={V2_20} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
                {/* Top beam */}
                <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[thick * 0.8, thick * 0.8, span + thick * 2, 6]} />
                    <meshStandardMaterial color="#0c0e08" map={uwRock.color} normalMap={uwRock.normal} normalScale={V2_20} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.8} flatShading />
                </mesh>
            </group>
        ))}

        <ShardField
            collectedShards={collectedShards}
            onCollectShard={onCollectShard}
            playerPositionRef={playerPositionRef}
        />

        {/* Monster fish — spawns after the first shard is collected */}
        {onPlayerCaught && (
            <MonsterFish
                playerPositionRef={playerPositionRef}
                collectedShards={collectedShards}
                onPlayerCaught={onPlayerCaught}
                monsterPositionRef={monsterPositionRef}
                monsterProximityRef={monsterProximityRef}
            />
        )}

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
