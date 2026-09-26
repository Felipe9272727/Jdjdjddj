/**
 * Floor2/water-effects.tsx — Water surface, ceiling disc, fog, underwater overlay, occluder.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import {
    HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS,
    WATER_LEVEL_Y, SWIM_THRESHOLD_Y,
} from './constants';
import { WaterCeilingMaterial, UnderwaterOverlayMaterial, WaterMaterial } from './shaders';

// Circular radial grid: waves resolve across the full pool, with a pinned shoreline.
export const WaterSurface: React.FC<{
    reflective?: boolean;
    playerPositionRef?: React.MutableRefObject<THREE.Vector3>;
}> = ({ reflective = false, playerPositionRef }) => {
    const geometry = useMemo(() => {
        const g = new THREE.RingGeometry(0, HOLE_RADIUS, reflective ? 96 : 64, reflective ? 24 : 16);
        g.rotateX(-Math.PI / 2);
        return g;
    }, [reflective]);
    const mat = useMemo(() => {
        const m = new (WaterMaterial as any)();
        m.radius = HOLE_RADIUS; m.side = THREE.DoubleSide;
        return m;
    }, []);
    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => mat.dispose(), [mat]);
    const previousY = useRef<number | null>(null);
    useFrame((state) => {
        mat.time = state.clock.elapsedTime;
        const p = playerPositionRef?.current;
        if (!p) return;
        if (previousY.current !== null && (p.y-WATER_LEVEL_Y)*(previousY.current-WATER_LEVEL_Y) < 0
            && Math.hypot(p.x-HOLE_CENTER_X,p.z-HOLE_CENTER_Z) < HOLE_RADIUS) {
            mat.impactX=p.x-HOLE_CENTER_X; mat.impactZ=p.z-HOLE_CENTER_Z; mat.impactAt=mat.time;
        }
        previousY.current=p.y;
    });
    return <mesh name="floor2-water" position={[HOLE_CENTER_X,WATER_LEVEL_Y,HOLE_CENTER_Z]} geometry={geometry}>
        <primitive object={mat} attach="material" />
    </mesh>;
};

// Wet masonry above the surface; the water no longer climbs the shaft walls.
export const WellShaftWater: React.FC = () => <mesh position={[HOLE_CENTER_X,WATER_LEVEL_Y/2,HOLE_CENTER_Z]}>
    <cylinderGeometry args={[HOLE_RADIUS-.01,HOLE_RADIUS-.01,Math.abs(WATER_LEVEL_Y),64,1,true]} />
    <meshStandardMaterial color="#253b3b" roughness={.31} metalness={.12} side={THREE.BackSide} />
</mesh>;

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
        const previousFog = scene.fog;
        if (!(scene.fog instanceof THREE.Fog)) scene.fog = new THREE.Fog('#0e0a08', 8, 70);
        scene.background = new THREE.Color('#0e0a08');
        return () => { scene.background = prev; scene.fog = previousFog; };
    }, [scene]);
    const _tgtFog = useRef(new THREE.Color());
    const _tgtBg = useRef(new THREE.Color());
    const _surfaceFog = new THREE.Color('#123d43');
    const _midFog = new THREE.Color('#0a2933');
    const _deepFog = new THREE.Color('#071b28');
    const _caveFog = new THREE.Color('#0e0a08');
    const _surfaceBg = new THREE.Color('#123d43');
    const _midBg = new THREE.Color('#0a2933');
    const _deepBg = new THREE.Color('#071b28');
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
            const baseFar = 29 - t * 7;
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
                const camera = state.camera as THREE.PerspectiveCamera;
                const height = 2 * .3 * Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
                m.scale.set(height*camera.aspect*1.02,height*1.02,1);
            }
        }
        (mat as any).time = state.clock.elapsedTime;
        (mat as any).depth = Math.min(Math.abs(y - SWIM_THRESHOLD_Y) / 29, 1);
        (mat as any).intensity = intensityRef.current;
    });
    return (
        <mesh ref={meshRef} renderOrder={100} frustumCulled={false}>
            <planeGeometry args={[1, 1]} />
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
