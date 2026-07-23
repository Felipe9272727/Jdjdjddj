/**
 * Floor2/lighting.tsx — Dynamic lighting and atmospheric effects.
 * BioluminescentPatches, UpwardLightShaft, CeilingReflectionCaustics,
 * UnderwaterLighting, CaveIBL.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three-stdlib';
import * as THREE from 'three';

import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
    swimmerY,
} from './constants';
import { LightShaftMaterial, CausticsMaterial } from './shaders';

// ─── BioluminescentPatches — scattered emissive sprite glow points ─────
const BIO_POSITIONS: readonly [number, number, number, string, number][] = [
    // ── Cave level (Y > 0) ──────────────────────────────────────────
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
    [-19, 3.0, -16, '#a06aff', 1.3],
    [ 22, 5.0, 5, '#b07aff', 1.1],
    [-12, 1.5, 6, '#c08aff', 1.0],
    [ 9, 4.2, -22, '#a06aff', 1.2],
    // ── Underwater (Y < -2) — bioluminescent algae & deep-sea organisms ─
    [-18, -12, -8,  '#00ffaa', 1.8],
    [ 22,  -8, 12,  '#00ccff', 1.5],
    [ -8, -20, -18, '#66ff88', 1.6],
    [ 15, -15, 20,  '#00ffcc', 1.4],
    [-22, -18,  4,  '#44ffaa', 1.7],
    [  8, -25, -14, '#22ddff', 1.3],
    [ -5, -10, 18,  '#88ff88', 1.2],
    [ 20, -22,  -8, '#00aaff', 1.5],
    [-15, -28, 10,  '#00ff88', 1.9],
    [  5, -15, -20, '#44ccff', 1.3],
    [-12, -22, 15,  '#00ffbb', 1.4],
    [ 18, -18,   4, '#22ffcc', 1.6],
    [-24, -10, -16, '#55ffdd', 1.2],
    [ 10, -28,  18, '#00ffee', 1.7],
];

export const BioluminescentPatches: React.FC = () => {
    // Group patches into 4 material groups based on phase
    const groupedMats = React.useRef<(THREE.SpriteMaterial | null)[]>(new Array(4).fill(null));
    const groupedHalos = React.useRef<(THREE.SpriteMaterial | null)[]>(new Array(4).fill(null));
    const frameTickRef = React.useRef(0);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        const tick = frameTickRef.current++;
        // Update only 1 material group per frame (round-robin every 4 frames)
        const updateGroup = tick % 4;

        // Compute breath value for each of 4 phase groups
        for (let g = 0; g < 4; g++) {
            if (g !== updateGroup) continue;  // Skip other groups
            const phase = g * 0.97;
            const breath = 0.55 + Math.sin(t * 0.8 + phase) * 0.25 + Math.sin(t * 2.3 + phase * 1.7) * 0.08;
            const mat = groupedMats.current[g];
            if (mat) mat.opacity = breath * 0.42;
            const halo = groupedHalos.current[g];
            if (halo) halo.opacity = breath * 0.08;
        }
    });

    return (
        <group>
            {BIO_POSITIONS.map(([x, y, z, color, scl], i) => {
                const group = i % 4;  // Assign to one of 4 phase groups
                return (
                    <React.Fragment key={i}>
                        <sprite position={[x, y, z]} scale={[0.5 * scl, 0.5 * scl, 1]}>
                            <spriteMaterial ref={(r: any) => { groupedMats.current[group] = r; }} color={color} transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                        </sprite>
                        <sprite position={[x, y, z]} scale={[2 * scl, 2 * scl, 1]}>
                            <spriteMaterial ref={(r: any) => { groupedHalos.current[group] = r; }} color={color} transparent opacity={0.08} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                        </sprite>
                    </React.Fragment>
                );
            })}
        </group>
    );
};

// ─── UpwardLightShaft — magical vertical glow rising from the water ────
export const UpwardLightShaft: React.FC = () => {
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
        if (haloRef.current) haloRef.current.opacity = 0.22 + breath * 0.08;
        if (topGlowRef.current) topGlowRef.current.opacity = 0.10 + breath * 0.06;
    });
    return (
        <group position={[HOLE_CENTER_X, WATER_LEVEL_Y, HOLE_CENTER_Z]}>
            <mesh position={[0, 4.0, 0]}>
                <cylinderGeometry args={[1.2, 1.8, 8.0, 64, 4, true]} />
                <primitive object={matInner} attach="material" />
            </mesh>
            <mesh position={[0, 4.0, 0]}>
                <cylinderGeometry args={[2.4, 3.0, 8.0, 64, 4, true]} />
                <primitive object={matOuter} attach="material" />
            </mesh>
            <sprite position={[0, 0.08, 0]} scale={[6, 6, 1]}>
                <spriteMaterial ref={haloRef} color="#a8e8ff" transparent opacity={0.28} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
            <sprite position={[0, 7.6, 0]} scale={[4, 1.8, 1]}>
                <spriteMaterial ref={topGlowRef} color="#9ad8ee" transparent opacity={0.14} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </sprite>
        </group>
    );
};

// ─── CeilingReflectionCaustics — light dancing on the cave ceiling ─────
export const CeilingReflectionCaustics: React.FC = () => {
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
        <mesh position={[HOLE_CENTER_X, 7.85, HOLE_CENTER_Z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[HOLE_RADIUS * 4.5, HOLE_RADIUS * 4.5]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── UnderwaterLighting — animates ambient + hemisphere based on player Y ─
export const UnderwaterLighting: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    reflective: boolean;
}> = ({ playerPositionRef, reflective }) => {
    const ambientRef = useRef<THREE.AmbientLight>(null);
    const hemiRef = useRef<THREE.HemisphereLight>(null);
    const dirRef = useRef<THREE.DirectionalLight>(null);
    const shaftPointRef = useRef<THREE.PointLight>(null);

    const _ambCave = useMemo(() => new THREE.Color('#e8d4b0'), []);
    const _ambWater = useMemo(() => new THREE.Color('#4090b0'), []);
    const _hemiCave = useMemo(() => new THREE.Color('#d0b89a'), []);
    const _hemiWater = useMemo(() => new THREE.Color('#3aa0c0'), []);
    const _ambTmp = useMemo(() => new THREE.Color(), []);
    const _hemiTmp = useMemo(() => new THREE.Color(), []);
    const lastUpdateRef = useRef(0);

    useFrame((state, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const y = playerPositionRef.current?.y ?? 0;
        swimmerY.current = y;

        // Throttle color lerps to ~10Hz (update every 0.1s)
        lastUpdateRef.current += dt;
        if (lastUpdateRef.current < 0.1) return;
        lastUpdateRef.current = 0;

        const tWater = Math.max(0, Math.min(1, (SWIM_THRESHOLD_Y - y) / 5));
        const depth = Math.max(0, Math.min(1, -y / 29));

        const k = Math.min(1, 8 * safeDt);

        if (ambientRef.current) {
            _ambTmp.copy(_ambCave).lerp(_ambWater, tWater);
            ambientRef.current.color.lerp(_ambTmp, k);
            // Cave is very dark — NV goggles are the primary light source.
            // Underwater slightly brighter (bioluminescence + caustics).
            const tgtInt = 0.08 + tWater * 0.52;  // brighter underwater so environment is visible
            ambientRef.current.intensity += (tgtInt - ambientRef.current.intensity) * k;
        }
        if (hemiRef.current) {
            _hemiTmp.copy(_hemiCave).lerp(_hemiWater, tWater);
            hemiRef.current.color.lerp(_hemiTmp, k);
            const tgtInt = 0.06 + tWater * 0.18;  // stronger hemisphere fill underwater
            hemiRef.current.intensity += (tgtInt - hemiRef.current.intensity) * k;
        }
        if (dirRef.current) {
            const tgt = tWater * (1.0 - depth * 0.6) * 1.2;
            dirRef.current.intensity += (tgt - dirRef.current.intensity) * k;
        }
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
export const CaveIBL: React.FC = () => {
    const { gl, scene } = useThree();
    useEffect(() => {
        const pmrem = new THREE.PMREMGenerator(gl);
        pmrem.compileEquirectangularShader();
        const room = RoomEnvironment();
        const envRT = pmrem.fromScene(room, 0.04);
        scene.environment = envRT.texture;
        return () => {
            scene.environment = null;
            envRT.dispose();
            pmrem.dispose();
        };
    }, [gl, scene]);
    return null;
};
