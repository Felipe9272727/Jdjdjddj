/**
 * Floor2/water-effects.tsx — Water surface, ceiling disc, fog, underwater overlay, occluder.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MeshReflectorMaterial } from '@react-three/drei';
import * as THREE from 'three';

import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
} from './constants';
import { WaterCeilingMaterial, UnderwaterOverlayMaterial, WaterMaterial } from './shaders';

// ─── WaterSurface — Gerstner wave plane ───────────────────────────────
interface WaterSurfaceProps {
    reflective?: boolean;
}
export const WaterSurface: React.FC<WaterSurfaceProps> = ({ reflective = false }) => {
    const mat = useMemo(() => {
        const m = new (WaterMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
        if (reflective) (mat as any).opacity = 0.45;
    });
    return (
        <group position={[HOLE_CENTER_X, WATER_LEVEL_Y, HOLE_CENTER_Z]}>
            {reflective && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
                    <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05]} />
                    <MeshReflectorMaterial
                        blur={[200, 60]}
                        resolution={768}
                        mixBlur={0.7}
                        mixStrength={2.2}
                        roughness={0.35}
                        depthScale={0.6}
                        minDepthThreshold={0.3}
                        maxDepthThreshold={1.4}
                        color="#06121e"
                        metalness={0.55}
                        mirror={0.95}
                    />
                </mesh>
            )}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[HOLE_RADIUS * 2 - 0.05, HOLE_RADIUS * 2 - 0.05, 64, 64]} />
                <primitive object={mat} attach="material" />
            </mesh>
        </group>
    );
};

// ─── WaterCeilingDisc — opaque BackSide disc with ripple shader ───────
export const WaterCeilingDisc: React.FC = () => {
    const mat = useMemo(() => {
        const m = new (WaterCeilingMaterial as any)();
        m.side = THREE.BackSide;
        m.depthWrite = true;
        m.transparent = false;
        return m;
    }, []);
    useFrame((state) => {
        (mat as any).time = state.clock.elapsedTime;
    });
    return (
        <mesh
            position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.1, HOLE_CENTER_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
        >
            <circleGeometry args={[HOLE_RADIUS + 0.15, 48]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── DynamicFog — depth-based color absorption (Beer-Lambert style) ───
export const DynamicFog: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useThree();
    const _fogColor = useRef(new THREE.Color('#0e0a08'));
    const _bgColor = useRef(new THREE.Color('#0e0a08'));

    useEffect(() => {
        const prev = scene.background;
        scene.background = new THREE.Color('#0e0a08');
        return () => { scene.background = prev; };
    }, [scene]);
    const _tgtFog = useRef(new THREE.Color());
    const _tgtBg = useRef(new THREE.Color());
    const _surfaceFog = new THREE.Color('#0a2a50');
    const _midFog = new THREE.Color('#061a3a');
    const _deepFog = new THREE.Color('#03102a');
    const _caveFog = new THREE.Color('#0e0a08');
    const _surfaceBg = new THREE.Color('#0a2a50');
    const _midBg = new THREE.Color('#061a3a');
    const _deepBg = new THREE.Color('#03102a');
    const _caveBg = new THREE.Color('#0e0a08');

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.033);
        const y = playerPositionRef.current?.y ?? 0;
        if (!scene.fog || !(scene.fog instanceof THREE.Fog)) return;

        if (y >= SWIM_THRESHOLD_Y) {
            _tgtFog.current.copy(_caveFog);
            _tgtBg.current.copy(_caveBg);
            const k = Math.min(1, 8 * safeDt);
            _fogColor.current.lerp(_tgtFog.current, k);
            _bgColor.current.lerp(_tgtBg.current, k);
            scene.fog.color.copy(_fogColor.current);
            scene.fog.near = scene.fog.near + (8 - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (70 - scene.fog.far) * k;
        } else {
            const depth = Math.abs(y - SWIM_THRESHOLD_Y);
            const t = Math.min(depth / 29, 1);

            if (t < 0.4) {
                _tgtFog.current.copy(_surfaceFog).lerp(_midFog, t / 0.4);
                _tgtBg.current.copy(_surfaceBg).lerp(_midBg, t / 0.4);
            } else {
                _tgtFog.current.copy(_midFog).lerp(_deepFog, (t - 0.4) / 0.6);
                _tgtBg.current.copy(_midBg).lerp(_deepBg, (t - 0.4) / 0.6);
            }

            const breathe = Math.sin(performance.now() * 0.0003) * 0.5;
            const baseNear = 1.5 - t * 0.6;
            const baseFar = 20 - t * 8;
            const tgtNear = Math.max(0.5, baseNear + breathe * 0.1);
            const tgtFar = Math.max(8, baseFar + breathe * 0.5);

            const k = Math.min(1, 8 * safeDt);
            _fogColor.current.lerp(_tgtFog.current, k);
            _bgColor.current.lerp(_tgtBg.current, k);
            scene.fog.color.copy(_fogColor.current);
            scene.fog.near = scene.fog.near + (tgtNear - scene.fog.near) * k;
            scene.fog.far = scene.fog.far + (tgtFar - scene.fog.far) * k;
        }
        if (scene.background && (scene.background as any).isColor) {
            (scene.background as THREE.Color).copy(_bgColor.current);
        }
    });
    return null;
};

// ─── UnderwaterOverlay — camera-following tint + caustic ──────────────
export const UnderwaterOverlay: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const intensityRef = useRef(0);
    const mat = useMemo(() => {
        const m = new (UnderwaterOverlayMaterial as any)();
        m.transparent = true;
        m.depthWrite = false;
        m.depthTest = false;
        m.renderOrder = 999;
        m.side = THREE.DoubleSide;
        return m;
    }, []);
    useFrame((state, dt) => {
        const y = playerPositionRef.current?.y ?? 0;
        const isUnderwater = y < SWIM_THRESHOLD_Y;
        const safeDt = Math.min(dt, 0.033);
        const targetIntensity = isUnderwater ? 1.0 : 0.0;
        intensityRef.current += (targetIntensity - intensityRef.current) * Math.min(1, 5 * safeDt);
        const m = meshRef.current;
        if (m) {
            m.visible = intensityRef.current > 0.01;
            if (m.visible) {
                m.position.copy(state.camera.position);
                m.quaternion.copy(state.camera.quaternion);
                m.translateZ(-0.3);
            }
        }
        (mat as any).time = state.clock.elapsedTime;
        (mat as any).depth = Math.min(Math.abs(y - SWIM_THRESHOLD_Y) / 29, 1);
        (mat as any).intensity = intensityRef.current;
    });
    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[1.6, 1.6]} />
            <primitive object={mat} attach="material" />
        </mesh>
    );
};

// ─── WaterOccluder — depth-only mesh that blocks X-ray from underwater ──
export const WaterOccluder: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        const m = meshRef.current;
        if (m) {
            m.visible = playerPositionRef.current.y < SWIM_THRESHOLD_Y;
        }
    });
    return (
        <mesh
            ref={meshRef}
            position={[HOLE_CENTER_X, WATER_LEVEL_Y - 0.05, HOLE_CENTER_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={-1}
        >
            <circleGeometry args={[HOLE_RADIUS + 0.3, 48]} />
            <meshBasicMaterial colorWrite={false} depthWrite={true} transparent={false} side={THREE.DoubleSide} />
        </mesh>
    );
};
