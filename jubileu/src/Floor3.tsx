/**
 * Floor3.tsx — "Campos de Cristal" — Spyro-inspired cartoon outdoor world.
 *
 * First-person, cel-shaded (MeshToonMaterial) open field with rolling green
 * hills, a terracotta/sandstone castle, lush grass, scattered trees, and
 * wildflowers. The elevator sits at z = -10 (same as every other floor).
 * Collision bounds cover X: ±25, Z: -10..+30 — see constants.ts FLOOR3_BND.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ElevatorFacade } from './Elevator';

// ─── Colour palette ──────────────────────────────────────────────────────────
const C = {
    sky:        '#9acfed',
    skyFog:     '#b8ddf5',
    grass:      '#5ec44a',
    grassDark:  '#3ea830',
    path:       '#c8a060',
    pathEdge:   '#b08840',
    stone:      '#c8a870',
    stoneDark:  '#a08050',
    stoneLight: '#e0c898',
    rooftop:    '#7858c8',
    flag:       '#e82040',
    leaf:       '#44c040',
    leafDark:   '#2a9830',
    trunk:      '#7a5028',
    flowerY:    '#f8e030',
    flowerP:    '#e030b0',
    flowerB:    '#3060f8',
    hillA:      '#68cc50',
    hillB:      '#50b43c',
    hillC:      '#3c9a2a',
    white:      '#f8f4ec',
    battlements:'#b89060',
};

// ─── Toon gradient map (4-step cel shading) ──────────────────────────────────
function useToonGrad() {
    return useMemo(() => {
        const data = new Uint8Array([56, 120, 190, 255]);
        const t = new THREE.DataTexture(data, 4, 1);
        (t as any).format = THREE.RedFormat;
        t.minFilter = THREE.NearestFilter;
        t.magFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        t.needsUpdate = true;
        return t;
    }, []);
}

// ─── Tree: trunk cylinder + layered cones ───────────────────────────────────
const Tree: React.FC<{ x: number; z: number; scale?: number; gradientMap: THREE.DataTexture }> = ({
    x, z, scale = 1, gradientMap,
}) => (
    <group position={[x, 0, z]} scale={[scale, scale, scale]}>
        <mesh position={[0, 0.9, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.25, 1.8, 7]} />
            <meshToonMaterial color={C.trunk} gradientMap={gradientMap} />
        </mesh>
        <mesh position={[0, 2.5, 0]} castShadow>
            <coneGeometry args={[1.35, 2.2, 7]} />
            <meshToonMaterial color={C.leafDark} gradientMap={gradientMap} />
        </mesh>
        <mesh position={[0, 3.6, 0]} castShadow>
            <coneGeometry args={[1.0, 2.0, 7]} />
            <meshToonMaterial color={C.leaf} gradientMap={gradientMap} />
        </mesh>
        <mesh position={[0, 4.65, 0]} castShadow>
            <coneGeometry args={[0.6, 1.6, 7]} />
            <meshToonMaterial color={C.leaf} gradientMap={gradientMap} />
        </mesh>
    </group>
);

// ─── Flower: coloured disc on a short stem ──────────────────────────────────
const Flower: React.FC<{ x: number; z: number; color: string; rot?: number; gradientMap: THREE.DataTexture }> = ({
    x, z, color, rot = 0, gradientMap,
}) => (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
        <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 5]} />
            <meshToonMaterial color="#50a030" gradientMap={gradientMap} />
        </mesh>
        <mesh position={[0, 0.34, 0]}>
            <sphereGeometry args={[0.13, 7, 5]} />
            <meshToonMaterial color={color} gradientMap={gradientMap} />
        </mesh>
    </group>
);

// ─── Hill: squashed sphere peeking above the ground plane ───────────────────
const Hill: React.FC<{ x: number; z: number; sx: number; sy: number; sz: number; color: string; gradientMap: THREE.DataTexture }> = ({
    x, z, sx, sy, sz, color, gradientMap,
}) => (
    <mesh position={[x, -sy * 0.45, z]} scale={[sx, sy, sz]} castShadow receiveShadow>
        <sphereGeometry args={[1, 12, 8]} />
        <meshToonMaterial color={color} gradientMap={gradientMap} />
    </mesh>
);

// ─── Castle tower: cylinder body + battlement ring + cone rooftop + flag ────
const Tower: React.FC<{ x: number; z: number; r: number; h: number; flag?: boolean; gradientMap: THREE.DataTexture }> = ({
    x, z, r, h, flag = false, gradientMap,
}) => (
    <group position={[x, 0, z]}>
        <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[r, r * 1.07, h, 12]} />
            <meshToonMaterial color={C.stone} gradientMap={gradientMap} />
        </mesh>
        {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
                <mesh key={i} position={[Math.cos(a) * r * 0.88, h + 0.22, Math.sin(a) * r * 0.88]} castShadow>
                    <boxGeometry args={[0.35, 0.44, 0.35]} />
                    <meshToonMaterial color={C.battlements} gradientMap={gradientMap} />
                </mesh>
            );
        })}
        <mesh position={[0, h + 1.2, 0]} castShadow>
            <coneGeometry args={[r * 1.1, 2.8, 12]} />
            <meshToonMaterial color={C.rooftop} gradientMap={gradientMap} />
        </mesh>
        {flag && (
            <group position={[0, h + 2.7, 0]}>
                <mesh position={[0, 0.7, 0]}>
                    <cylinderGeometry args={[0.04, 0.04, 1.4, 5]} />
                    <meshToonMaterial color={C.white} gradientMap={gradientMap} />
                </mesh>
                <mesh position={[0.28, 1.2, 0]}>
                    <boxGeometry args={[0.55, 0.35, 0.04]} />
                    <meshToonMaterial color={C.flag} gradientMap={gradientMap} />
                </mesh>
            </group>
        )}
    </group>
);

// ─── Main environment ────────────────────────────────────────────────────────
export const Floor3Environment: React.FC = () => {
    const gradientMap = useToonGrad();

    return (
        <group>
            {/* Sky + fog */}
            <color attach="background" args={[C.sky]} />
            <fog attach="fog" args={[C.skyFog, 30, 72]} />

            {/* Lighting */}
            <directionalLight position={[-10, 18, 8]} intensity={2.8} color="#fff8e8" castShadow />
            <ambientLight intensity={1.0} color="#d8eeff" />
            <hemisphereLight args={['#c8eeff', '#a0d860', 0.55]} />

            {/* Ground grass plane (50 wide × 42 deep, centred at z=+10) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 10]} receiveShadow>
                <planeGeometry args={[50, 42]} />
                <meshToonMaterial color={C.grass} gradientMap={gradientMap} />
            </mesh>

            {/* Stone path from elevator to castle gate */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 7]}>
                <planeGeometry args={[2.8, 34]} />
                <meshToonMaterial color={C.path} gradientMap={gradientMap} />
            </mesh>
            {[-1.5, 1.5].map((ox) => (
                <mesh key={ox} rotation={[-Math.PI / 2, 0, 0]} position={[ox, 0.018, 7]}>
                    <planeGeometry args={[0.14, 34]} />
                    <meshToonMaterial color={C.pathEdge} gradientMap={gradientMap} />
                </mesh>
            ))}
            {/* Tile joint lines across the path */}
            {Array.from({ length: 11 }).map((_, i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -8 + i * 3]}>
                    <planeGeometry args={[2.5, 0.1]} />
                    <meshToonMaterial color={C.pathEdge} gradientMap={gradientMap} />
                </mesh>
            ))}

            {/* Castle curtain wall */}
            <mesh position={[0, 4.5, 24.5]} castShadow receiveShadow>
                <boxGeometry args={[16, 9, 2.2]} />
                <meshToonMaterial color={C.stone} gradientMap={gradientMap} />
            </mesh>
            {/* Battlements on wall top */}
            {Array.from({ length: 12 }).map((_, i) => (
                <mesh key={i} position={[-7.15 + i * 1.3, 9.4, 24.5]} castShadow>
                    <boxGeometry args={[0.55, 0.8, 2.4]} />
                    <meshToonMaterial color={C.battlements} gradientMap={gradientMap} />
                </mesh>
            ))}
            {/* Gate pillars */}
            <mesh position={[-1.7, 2.5, 24.0]} castShadow>
                <boxGeometry args={[1.1, 5, 2.4]} />
                <meshToonMaterial color={C.stoneDark} gradientMap={gradientMap} />
            </mesh>
            <mesh position={[1.7, 2.5, 24.0]} castShadow>
                <boxGeometry args={[1.1, 5, 2.4]} />
                <meshToonMaterial color={C.stoneDark} gradientMap={gradientMap} />
            </mesh>
            {/* Gate lintel */}
            <mesh position={[0, 5.3, 24.0]} castShadow>
                <boxGeometry args={[4.6, 1.1, 2.4]} />
                <meshToonMaterial color={C.stone} gradientMap={gradientMap} />
            </mesh>
            {/* Gate dark opening */}
            <mesh position={[0, 2.4, 24.05]}>
                <boxGeometry args={[2.4, 4.8, 0.1]} />
                <meshToonMaterial color="#1a1208" gradientMap={gradientMap} />
            </mesh>
            {/* Gate keystone gem */}
            <mesh position={[0, 5.3, 23.75]} rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.7, 0.7, 0.3]} />
                <meshToonMaterial color="#4888d8" emissive="#1040a0" emissiveIntensity={0.6} gradientMap={gradientMap} />
            </mesh>

            {/* Main towers flanking gate */}
            <Tower x={-8}  z={24} r={3.0} h={12} flag  gradientMap={gradientMap} />
            <Tower x={ 8}  z={24} r={3.0} h={12} flag  gradientMap={gradientMap} />
            {/* Outer flanking towers */}
            <Tower x={-14} z={22} r={2.0} h={8}        gradientMap={gradientMap} />
            <Tower x={ 14} z={22} r={2.0} h={8}        gradientMap={gradientMap} />
            {/* Background depth towers */}
            <Tower x={-5}  z={28} r={1.6} h={9}        gradientMap={gradientMap} />
            <Tower x={ 5}  z={28} r={1.6} h={9}        gradientMap={gradientMap} />

            {/* Rolling hills along sides and back */}
            <Hill x={-18} z={0}  sx={9} sy={5} sz={8}  color={C.hillB} gradientMap={gradientMap} />
            <Hill x={-21} z={8}  sx={8} sy={6} sz={9}  color={C.hillA} gradientMap={gradientMap} />
            <Hill x={-20} z={17} sx={9} sy={5} sz={7}  color={C.hillC} gradientMap={gradientMap} />
            <Hill x={-17} z={26} sx={8} sy={6} sz={10} color={C.hillB} gradientMap={gradientMap} />
            <Hill x={ 18} z={0}  sx={9} sy={5} sz={8}  color={C.hillB} gradientMap={gradientMap} />
            <Hill x={ 21} z={8}  sx={8} sy={6} sz={9}  color={C.hillA} gradientMap={gradientMap} />
            <Hill x={ 20} z={17} sx={9} sy={5} sz={7}  color={C.hillC} gradientMap={gradientMap} />
            <Hill x={ 17} z={26} sx={8} sy={6} sz={10} color={C.hillB} gradientMap={gradientMap} />
            <Hill x={-10} z={30} sx={10} sy={7} sz={8} color={C.hillC} gradientMap={gradientMap} />
            <Hill x={  0} z={32} sx={12} sy={6} sz={7} color={C.hillB} gradientMap={gradientMap} />
            <Hill x={ 10} z={30} sx={10} sy={7} sz={8} color={C.hillC} gradientMap={gradientMap} />

            {/* Trees — left grove */}
            <Tree x={-6}  z={4}  scale={1.0} gradientMap={gradientMap} />
            <Tree x={-8}  z={7}  scale={1.2} gradientMap={gradientMap} />
            <Tree x={-5}  z={10} scale={0.9} gradientMap={gradientMap} />
            <Tree x={-9}  z={13} scale={1.1} gradientMap={gradientMap} />
            <Tree x={-7}  z={18} scale={1.3} gradientMap={gradientMap} />
            <Tree x={-12} z={5}  scale={1.0} gradientMap={gradientMap} />
            <Tree x={-11} z={16} scale={1.2} gradientMap={gradientMap} />
            {/* Trees — right grove */}
            <Tree x={ 6}  z={4}  scale={1.0} gradientMap={gradientMap} />
            <Tree x={ 8}  z={7}  scale={1.2} gradientMap={gradientMap} />
            <Tree x={ 5}  z={10} scale={0.9} gradientMap={gradientMap} />
            <Tree x={ 9}  z={13} scale={1.1} gradientMap={gradientMap} />
            <Tree x={ 7}  z={18} scale={1.3} gradientMap={gradientMap} />
            <Tree x={ 12} z={5}  scale={1.0} gradientMap={gradientMap} />
            <Tree x={ 11} z={16} scale={1.2} gradientMap={gradientMap} />
            {/* Trees — scattered */}
            <Tree x={-4}  z={20} scale={0.8} gradientMap={gradientMap} />
            <Tree x={ 4}  z={20} scale={0.8} gradientMap={gradientMap} />

            {/* Wildflowers — left meadow */}
            <Flower x={-3.5} z={2}   color={C.flowerY} rot={0.3}  gradientMap={gradientMap} />
            <Flower x={-5.0} z={3}   color={C.flowerP} rot={1.1}  gradientMap={gradientMap} />
            <Flower x={-4.2} z={5}   color={C.flowerB} rot={0.7}  gradientMap={gradientMap} />
            <Flower x={-6.5} z={2.5} color={C.flowerY} rot={2.0}  gradientMap={gradientMap} />
            <Flower x={-3.8} z={8}   color={C.flowerP} rot={0.5}  gradientMap={gradientMap} />
            <Flower x={-7.0} z={10}  color={C.flowerY} rot={1.6}  gradientMap={gradientMap} />
            <Flower x={-4.5} z={14}  color={C.flowerB} rot={0.9}  gradientMap={gradientMap} />
            <Flower x={-9.0} z={8}   color={C.flowerP} rot={0.2}  gradientMap={gradientMap} />
            {/* Wildflowers — right meadow */}
            <Flower x={ 3.5} z={2}   color={C.flowerP} rot={0.4}  gradientMap={gradientMap} />
            <Flower x={ 5.0} z={3}   color={C.flowerB} rot={1.8}  gradientMap={gradientMap} />
            <Flower x={ 4.2} z={5}   color={C.flowerY} rot={0.6}  gradientMap={gradientMap} />
            <Flower x={ 6.5} z={2.5} color={C.flowerP} rot={1.2}  gradientMap={gradientMap} />
            <Flower x={ 3.8} z={8}   color={C.flowerY} rot={0.8}  gradientMap={gradientMap} />
            <Flower x={ 7.0} z={10}  color={C.flowerB} rot={1.4}  gradientMap={gradientMap} />
            <Flower x={ 4.5} z={14}  color={C.flowerP} rot={0.3}  gradientMap={gradientMap} />
            <Flower x={ 9.0} z={8}   color={C.flowerY} rot={1.9}  gradientMap={gradientMap} />

            {/* Decorative rocks flanking the path */}
            {([ [-2.2, 1], [2.2, 5], [-2.3, 9], [2.4, 13], [-2.1, 17], [2.3, 21] ] as [number,number][]).map(([rx, rz], i) => (
                <mesh key={i} position={[rx, 0.18, rz]} rotation={[0, i * 0.8, 0]} castShadow>
                    <dodecahedronGeometry args={[0.28, 0]} />
                    <meshToonMaterial color={C.stoneDark} gradientMap={gradientMap} />
                </mesh>
            ))}

            {/* Elevator facade (entry from Floor 2) */}
            <group position={[0, 0, -10]}>
                <ElevatorFacade z={0} height={5} width={10} />
            </group>
        </group>
    );
};

export default Floor3Environment;
