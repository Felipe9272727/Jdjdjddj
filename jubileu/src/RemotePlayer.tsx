import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations, Html } from '@react-three/drei';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { WALKING_URL, IDLE_URL } from './constants';
import { SkeletonUtils } from 'three-stdlib';

export const RemotePlayer = ({ id, x, y, z, ry, state, name, chatMsg, chatAt }: any) => {
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

    const [groundY, setGroundY] = useState(0);
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
        try {
            clonedScene.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(clonedScene);
            if (Number.isFinite(box.min.y)) setGroundY(-box.min.y);
        } catch { /* ignored */ }
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

    const lastInitPos = useRef(new Vector3(x, y, z));
    useEffect(() => {
        if (groupRef.current) {
            const dx = x - lastInitPos.current.x;
            const dz = z - lastInitPos.current.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 5) {
                groupRef.current.position.set(x, y, z);
                groupRef.current.rotation.y = ry;
                targetPos.current.set(x, y, z);
                targetRot.current = ry;
            }
            lastInitPos.current.set(x, y, z);
        }
    }, [x, y, z, ry]);

    useFrame((_, dt) => {
        if (!groupRef.current) return;
        if (hipsRef.current && hipsBindRef.current) {
            hipsRef.current.position.x = hipsBindRef.current.x;
            hipsRef.current.position.z = hipsBindRef.current.z;
        }
        const k = Math.min(1, 15 * dt);
        groupRef.current.position.lerp(targetPos.current, k);
        let d = targetRot.current - groupRef.current.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        groupRef.current.rotation.y += d * k;
    });

    // Chat bubble visibility — show for 8s after last chatAt
    const [showChat, setShowChat] = useState(false);
    useEffect(() => {
        if (!chatMsg || !chatAt) { setShowChat(false); return; }
        const age = Date.now() - chatAt;
        if (age > 8000) { setShowChat(false); return; }
        setShowChat(true);
        const remaining = 8000 - age;
        const timer = setTimeout(() => setShowChat(false), remaining);
        return () => clearTimeout(timer);
    }, [chatMsg, chatAt]);

    const displayName = name || 'P-' + (id || '').slice(0, 4).toUpperCase();

    return (
        <group ref={groupRef}>
            <primitive object={clonedScene} scale={[30, 30, 30]} position={[0, groundY, 0]} />
            <Html position={[0, 2.2, 0]} center distanceFactor={8}>
                <div className="pointer-events-none select-none whitespace-nowrap flex flex-col items-center gap-0.5">
                    {/* Chat bubble */}
                    {showChat && chatMsg && (
                        <div className="mb-1 animate-fade-in-up">
                            <div className="bg-white/95 text-black px-3 py-1.5 rounded-xl text-xs font-medium shadow-lg max-w-[180px] text-center relative">
                                <span>{chatMsg}</span>
                                {/* Triangle pointer */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white/95 rotate-45" />
                            </div>
                        </div>
                    )}
                    {/* Player name */}
                    <div className="bg-black/70 text-white px-2 py-0.5 rounded text-[10px] font-bold font-mono border border-white/20 backdrop-blur-sm tracking-wider">
                        {displayName}
                    </div>
                </div>
            </Html>
        </group>
    );
};
