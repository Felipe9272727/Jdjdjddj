/**
 * index.tsx — Main Floor2Environment component
 *
 * Composes all the split modules into the final cave level.
 * Re-exports everything that other files (App.tsx, Player.tsx) need.
 */

import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import {
    caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO,
    caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO,
    caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO,
    uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO,
    uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO,
} from '../assets/textureImports';

import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, WATER_LEVEL_Y,
    ROCK_MODEL_URLS, BOULDER_MODEL_URL,
    CAVE_ROCKS_DARK, CAVE_ROCKS_MID, CAVE_ROCKS_LIGHT,
    POOL_RIM, STALAGMITES, STALACTITES, CRYSTALS, TORCH_POSITIONS,
    UW_BOULDERS, UW_PEBBLES, SHARD_POSITIONS,
} from './constants';

import { CAVE_FLOOR_GEO, UW_FLOOR_GEO, PEBBLE_GEO, GLOW_TEXTURE } from './geometry';

import {
    usePBRSet,
    CrystalCluster, Torch, DustMotes,
    WaterSurface, DynamicFog, UnderwaterCaustics,
    UnderwaterFlora, GodRayShafts, DeepMist,
    DebrisField, FishSchool, PlanktonField, BubbleField,
    Shard, ElevatorShell,
} from './components';

// ─── Re-export constants that other files import ─────────────────────
export {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
    SHARD_POSITIONS,
    CAVE_ROCK_COLLIDERS, UW_ROCK_COLLIDERS, CAVE_WALL_COLLIDERS,
} from './constants';

// ═══════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════

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
    // ─── Load PBR texture sets ───────────────────────────────────────
    const caveFloor = usePBRSet(caveFloorColor, caveFloorNormal, caveFloorRoughness, caveFloorAO, 12, 12);
    const caveWall = usePBRSet(caveWallColor, caveWallNormal, caveWallRoughness, caveWallAO, 4, 2);
    const caveRock = usePBRSet(caveRockColor, caveRockNormal, caveRockRoughness, caveRockAO, 1, 1);
    const uwFloor = usePBRSet(uwFloorColor, uwFloorNormal, uwFloorRoughness, uwFloorAO, 16, 16);
    const uwRock = usePBRSet(uwRockColor, uwRockNormal, uwRockRoughness, uwRockAO, 1, 1);

    // ─── Load rock GLB models ───────────────────────────────────────
    const rockModelA = useGLTF(ROCK_MODEL_URLS[0]);
    const rockModelB = useGLTF(ROCK_MODEL_URLS[1]);
    const rockModelC = useGLTF(ROCK_MODEL_URLS[2]);
    const rockModelD = useGLTF(ROCK_MODEL_URLS[3]);
    const boulderModel_ = useGLTF(BOULDER_MODEL_URL);

    const rockScenes = useMemo(
        () => [rockModelA, rockModelB, rockModelC, rockModelD].map(m => m.scene.clone(true)),
        [rockModelA, rockModelB, rockModelC, rockModelD]
    );

    return (
        <group>
            <color attach="background" args={['#0e0a08']} />
            <fog attach="fog" args={['#0e0a08', 14, 55]} />

            {/* Horror lighting */}
            <ambientLight intensity={0.25} color="#d8c0a0" />
            <hemisphereLight intensity={0.20} color="#c8a888" groundColor="#1a1612" />
            <directionalLight position={[5, 20, 5]} intensity={0.20} color="#ffe8c0" />

            {/* Ember glow sprites */}
            <sprite position={[-25, 0.8, 0]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#3a1008" transparent opacity={0.2} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
            <sprite position={[25, 0.8, -5]} scale={[6, 6, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#3a1008" transparent opacity={0.2} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>
            <sprite position={[0, 0.8, 25]} scale={[5, 5, 1]}><spriteMaterial map={GLOW_TEXTURE} color="#3a1008" transparent opacity={0.15} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>

            <DynamicFog playerPositionRef={playerPositionRef} />

            {/* ─── CAVE FLOOR with hole ─── */}
            <mesh geometry={CAVE_FLOOR_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <meshStandardMaterial
                    color="#1a1610" map={caveFloor.color} normalMap={caveFloor.normal}
                    normalScale={new THREE.Vector2(4.0, 4.0)} roughnessMap={caveFloor.rough}
                    roughness={0.92} aoMap={caveFloor.ao} aoMapIntensity={1.0}
                />
            </mesh>

            {/* Cave ceiling */}
            <mesh position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[60, 60]} />
                <meshStandardMaterial color="#2a221c" roughness={1} side={THREE.DoubleSide} />
            </mesh>

            {/* CAVE WALLS — real PBR textures */}
            {/* North (z = -30) */}
            <mesh position={[-8, 2.5, -29.6]}><boxGeometry args={[24, 5, 1.0]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[10, 3.2, -29.4]}><boxGeometry args={[18, 6.4, 1.2]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[-2, 6.0, -29.8]}><boxGeometry args={[60, 4, 0.6]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            {/* South (z = 30) */}
            <mesh position={[6, 2.4, 29.6]}><boxGeometry args={[26, 4.8, 1.0]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[-12, 3.5, 29.4]}><boxGeometry args={[20, 7, 1.2]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[4, 6.2, 29.8]}><boxGeometry args={[60, 3.6, 0.6]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            {/* West (x = -30) */}
            <mesh position={[-29.6, 2.6, 0]}><boxGeometry args={[1.0, 5.2, 28]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[-29.4, 3.4, -12]}><boxGeometry args={[1.2, 6.8, 18]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[-29.8, 6.2, 3]}><boxGeometry args={[0.6, 3.6, 60]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            {/* East (x = 30) */}
            <mesh position={[29.6, 2.5, 8]}><boxGeometry args={[1.0, 5, 22]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[29.4, 3.6, -10]}><boxGeometry args={[1.2, 7.2, 20]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>
            <mesh position={[29.8, 6.0, -2]}><boxGeometry args={[0.6, 4, 60]} /><meshStandardMaterial map={caveWall.color} normalMap={caveWall.normal} normalScale={new THREE.Vector2(2.5, 2.5)} roughnessMap={caveWall.rough} roughness={0.95} aoMap={caveWall.ao} aoMapIntensity={0.5} /></mesh>

            {/* Cave boulders */}
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

            {/* Light pebbles — instanced */}
            <Instances limit={CAVE_ROCKS_LIGHT.length} range={CAVE_ROCKS_LIGHT.length} geometry={PEBBLE_GEO}>
                <meshStandardMaterial map={caveRock.color} normalMap={caveRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={caveRock.rough} roughness={0.85} aoMap={caveRock.ao} aoMapIntensity={0.5} />
                {CAVE_ROCKS_LIGHT.map(([x, y, z, s, ry], i) => (
                    <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.7, s]} rotation={[0, ry, 0]} />
                ))}
            </Instances>

            {/* Pool rim */}
            {POOL_RIM.map(([x, y, z, s, ry], i) => (
                <group key={`rim-${i}`} position={[x, y + s * 0.25, z]} scale={[s, s * 0.5, s]} rotation={[0, ry, 0]}>
                    <primitive object={rockScenes[i % 4].clone(true)} />
                </group>
            ))}

            {/* Stalagmites */}
            {STALAGMITES.map(([x, z, h, r], i) => (
                <mesh key={`stalagmite-${i}`} position={[x, h / 2, z]}>
                    <coneGeometry args={[r, h, 6]} />
                    <meshStandardMaterial color="#3a3024" roughness={1} flatShading />
                </mesh>
            ))}

            {/* Stalactites */}
            {STALACTITES.map(([x, z, h, r], i) => (
                <mesh key={`stalactite-${i}`} position={[x, 8 - h / 2, z]} rotation={[Math.PI, 0, 0]}>
                    <coneGeometry args={[r, h, 6]} />
                    <meshStandardMaterial color="#322a1f" roughness={1} flatShading />
                </mesh>
            ))}

            {/* Crystals */}
            {CRYSTALS.map(([x, y, z, color], i) => (
                <CrystalCluster key={`crystal-${i}`} x={x} y={y} z={z} color={color} />
            ))}

            {/* Torches */}
            {TORCH_POSITIONS.map(([x, y, z], i) => (
                <Torch key={`torch-${i}`} x={x} y={y} z={z} seed={i * 7.3} />
            ))}

            <DustMotes />

            {/* ─── WATER SURFACE ─── */}
            <WaterSurface reflective={reflective} />

            {/* Opaque water column — blocks X-ray from sides */}
            <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y - 4, HOLE_CENTER_Z]}>
                <cylinderGeometry args={[HOLE_RADIUS + 0.15, HOLE_RADIUS + 0.15, 8, 32, 1, true]} />
                <meshBasicMaterial color="#010508" side={THREE.FrontSide} depthWrite={true} transparent={false} />
            </mesh>
            {/* Opaque disc at water surface — X-ray blocker from below */}
            <mesh position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.02, HOLE_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[HOLE_RADIUS + 0.15, 32]} />
                <meshBasicMaterial color="#010508" side={THREE.FrontSide} depthWrite={true} transparent={false} />
            </mesh>

            {/* ─── UNDERWATER ─── */}
            <mesh geometry={UW_FLOOR_GEO} rotation={[-Math.PI / 2, 0, 0]} position={[0, -30, 0]}>
                <meshStandardMaterial
                    color="#060804" map={uwFloor.color} normalMap={uwFloor.normal}
                    normalScale={new THREE.Vector2(6.0, 6.0)} roughnessMap={uwFloor.rough}
                    roughness={0.95} aoMap={uwFloor.ao} aoMapIntensity={1.2}
                />
            </mesh>

            <UnderwaterCaustics />
            <UnderwaterFlora />
            <GodRayShafts />
            <DeepMist />
            <DebrisField />
            <FishSchool />

            {/* Underwater boulders */}
            {UW_BOULDERS.map(([x, y, z, s, ry], i) => (
                <group key={`uwb-${i}`} position={[x, y + s * 0.4, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]}>
                    <primitive object={rockScenes[i % 4].clone(true)} />
                </group>
            ))}

            {/* Underwater pebbles */}
            <Instances limit={UW_PEBBLES.length} range={UW_PEBBLES.length} geometry={PEBBLE_GEO}>
                <meshStandardMaterial color="#0c0c0a" map={uwRock.color} normalMap={uwRock.normal} normalScale={new THREE.Vector2(2.0, 2.0)} roughnessMap={uwRock.rough} roughness={0.95} aoMap={uwRock.ao} aoMapIntensity={0.5} />
                {UW_PEBBLES.map(([x, y, z, s, ry], i) => (
                    <Instance key={i} position={[x, y + s * 0.5, z]} scale={[s, s * 0.6, s]} rotation={[0, ry, 0]} />
                ))}
            </Instances>

            <BubbleField />
            <PlanktonField />

            {/* Shards */}
            {SHARD_POSITIONS.map((pos, i) => (
                <Shard
                    key={i} index={i} position={pos}
                    collected={collectedShards.has(i)}
                    onCollect={onCollectShard}
                    playerPositionRef={playerPositionRef}
                />
            ))}

            <ElevatorShell />
        </group>
    );
};
