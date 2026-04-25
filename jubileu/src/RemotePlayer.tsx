import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { WALKING_URL, IDLE_URL } from './constants';
import { SkeletonUtils } from 'three-stdlib';

useGLTF.preload(WALKING_URL);
useGLTF.preload(IDLE_URL);

export const RemotePlayer = ({ id, x, y, z, ry, state }: any) => {
    const groupRef = useRef<any>(null);
    const hipsRef = useRef<any>(null);
    const hipsBindRef = useRef<Vector3 | null>(null);
    const { scene, animations: walkAnims } = useGLTF(WALKING_URL) as any;
    const { animations: idleAnims } = useGLTF(IDLE_URL) as any;

    const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
    const anims = useMemo(() => {
        const w = walkAnims.map((a: any) => a.clone(true));
        const i = idleAnims.map((a: any) => a.clone(true));
        if (w[0]) w[0].name = 'Walking';
        if (i[0]) i[0].name = 'Idle';
        return [...i, ...w];
    }, [walkAnims, idleAnims]);
    const { actions } = useAnimations(anims, clonedScene);

    useEffect(() => {
        clonedScene.traverse((c: any) => {
            if (c.isMesh) {
                c.castShadow = true;
                if (c.material) {
                    c.material = c.material.clone();
                    c.material.transparent = false;
                    c.material.depthWrite = true;
                    c.material.side = THREE.DoubleSide;
                    c.material.metalness = 0;
                    c.material.roughness = 1;
                    c.material.needsUpdate = true;
                }
            }
            if ((c.isBone || c.type === 'Bone') && !hipsRef.current) {
                const n = c.name.toLowerCase();
                if (n.includes('hips') || n.includes('root')) {
                    hipsRef.current = c;
                    hipsBindRef.current = c.position.clone();
                }
            }
        });
    }, [clonedScene]);

    useEffect(() => {
        const walking = state === 'walking';
        const a = actions[walking ? 'Walking' : 'Idle'];
        const o = actions[walking ? 'Idle' : 'Walking'];
        if (o) o.fadeOut(0.2);
        if (a) a.reset().fadeIn(0.2).play();
    }, [state, actions]);

    const targetPos = useRef(new Vector3(x, y, z));
    const targetRot = useRef(ry);
    useEffect(() => {
        targetPos.current.set(x, y, z);
        targetRot.current = ry;
    }, [x, y, z, ry]);

    // Initialize transform once on mount; subsequent updates are smoothed in useFrame.
    // Setting position/rotation as JSX props would overwrite the lerp every render.
    useEffect(() => {
        if (groupRef.current) {
            groupRef.current.position.set(x, y, z);
            groupRef.current.rotation.y = ry;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFrame((_, dt) => {
        if (!groupRef.current) return;
        if (hipsRef.current && hipsBindRef.current) { hipsRef.current.position.copy(hipsBindRef.current); }
        const k = Math.min(1, 10 * dt);
        groupRef.current.position.lerp(targetPos.current, k);
        let d = targetRot.current - groupRef.current.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        groupRef.current.rotation.y += d * k;
    });

    return (
        <group ref={groupRef}>
            <hemisphereLight intensity={1} color="#ffffff" groundColor="#444444" />
            <primitive object={clonedScene} scale={[30, 30, 30]} position={[0, 0, 0]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} renderOrder={-1}>
                <circleGeometry args={[0.5, 24]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} />
            </mesh>
            <Html position={[0, 2.2, 0]} center distanceFactor={8}>
                <div className="pointer-events-none select-none whitespace-nowrap">
                    <div className="bg-black/70 text-white px-2 py-0.5 rounded text-xs font-mono border border-white/20 backdrop-blur-sm">
                        {'P-' + (id || '').slice(0, 4).toUpperCase()}
                    </div>
                </div>
            </Html>
        </group>
    );
};
