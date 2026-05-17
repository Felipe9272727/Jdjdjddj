/**
 * Floor2/index.tsx — Main Floor2Environment component + re-exports.
 *
 * Assembles the cave + underwater scene from constants, geometry,
 * shaders, and sub-components. Re-exports everything that was
 * previously exported from the monolithic Floor2Underwater.tsx.
 */

import React, { useMemo } from 'react';
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
export {
    CrystalCluster, Torch, DustMotes,
    WaterSurface, WaterCeilingDisc, DynamicFog, UnderwaterOverlay, WaterOccluder,
    UnderwaterCaustics, KelpField, Coral, UnderwaterFlora, BioluminescentReef,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, Shard,
} from './components';

// Internal imports (not re-exported)
import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y,
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
    UnderwaterCaustics, UnderwaterFlora, BioluminescentReef,
    GodRayShafts, DeepMist, DebrisField, FishSchool,
    UnderwaterSediment, PlanktonField, BubbleField, SurfaceBubbleRing,
    GodRay, GodRays, Shard,
} from './components';

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
        <color attach="background" args={['#0e0a08']} />
        <fog attach="fog" args={['#0e0a08', 8, 70]} />

        {/* Horror lighting — dark but visible: textures need enough light */}
        <ambientLight intensity={0.45} color="#d8c0a0" />
        <hemisphereLight intensity={0.35} color="#c8a888" groundColor="#1a1612" />
        <directionalLight position={[5, 20, 5]} intensity={0.40} color="#ffe8c0" />

        {/* Ember sprites — warm glow on floor, NO pointLight (square artifact) */}
        <sprite position={[-25, 0.8, 0]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#5a2008" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[25, 0.8, -5]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#5a2008" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
        <sprite position={[0, 0.8, 25]} scale={[5, 5, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#5a2008" transparent opacity={0.30} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>

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

        {/* ─── WATER SURFACE inside the hole ─────────────────────────── */}
        <WaterSurface reflective={reflective} />

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
        <UnderwaterCaustics />

        {/* Underwater flora — kelp, coral, and low-cost bioluminescent reef blooms */}
        <UnderwaterFlora />
        <BioluminescentReef />

        {/* God ray shafts descending from the surface */}
        <GodRayShafts />
        <GodRays playerPositionRef={playerPositionRef} />

        {/* God ray — volumetric light beam from the water hole */}
        <GodRay />

        {/* Deep Mist — drifting fog plane */}
        <DeepMist />

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
