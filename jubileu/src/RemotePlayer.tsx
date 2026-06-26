import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import { Vector3 } from 'three';
import * as THREE from 'three';
import { WALKING_URL, IDLE_URL } from './constants';
import { SkeletonUtils } from 'three-stdlib';
import type { OtherPlayersDataRef } from './Multiplayer';

const CHAT_BUBBLE_TTL_MS = 8000;
const TELEPORT_DIST_SQ = 25;
// Distance bands for adaptive update rate. Past FAR_CULL_SQ we still render
// (Three.js handles frustum culling on its own) but skip lerp/animation
// updates entirely — distant remote players don't need 60fps motion.
const NEAR_FULL_SQ = 100;    // within 10m → update every frame
const FAR_HALF_SQ  = 900;    // within 30m → update every other frame
const FAR_CULL_SQ  = 2500;   // beyond 50m → update once per second, no anim crossfade

interface RemotePlayerProps {
    id: string;
    dataRef: OtherPlayersDataRef;
    chatBubbles3D?: boolean;
}

// All hot-path data (position, rotation, animation state, chat) is read from
// `dataRef` inside useFrame. Multiplayer's onSnapshot updates that ref every
// ~200ms WITHOUT re-rendering React. The component itself only re-renders on
// mount/unmount and on chat-bubble visibility changes (rare).
export const RemotePlayer = React.memo(({ id, dataRef, chatBubbles3D = true }: RemotePlayerProps) => {
    const groupRef = useRef<any>(null);
    const hipsRef = useRef<any>(null);
    const hipsBindRef = useRef<Vector3 | null>(null);
    const { scene, animations: walkAnims } = useGLTF(WALKING_URL) as any;
    const { animations: idleAnims } = useGLTF(IDLE_URL) as any;

    const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
    // Self-managed AnimationMixer instead of drei's useAnimations.
    // drei's useAnimations registers an internal useFrame that calls
    // mixer.update(delta) UNCONDITIONALLY every frame — so the distance-band
    // throttle below only skipped the cheap lerp, never the actual skinning
    // interpolation. Owning the mixer lets us drive mixer.update() from the
    // SAME throttled useFrame, so distant/half-rate remote players also pay
    // less per-frame skinning cost. Visuals are identical when near.
    const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
    const actions = useMemo(() => {
        const w = walkAnims.map((a: any) => a.clone(true));
        const i = idleAnims.map((a: any) => a.clone(true));
        if (w[0]) w[0].name = 'Walking';
        if (i[0]) i[0].name = 'Idle';
        const map: Record<string, THREE.AnimationAction> = {};
        if (i[0]) map['Idle'] = mixer.clipAction(i[0]);
        if (w[0]) map['Walking'] = mixer.clipAction(w[0]);
        return map;
    }, [walkAnims, idleAnims, mixer]);
    useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

    const [groundY, setGroundY] = useState(0);
    useEffect(() => {
        clonedScene.traverse((c: any) => {
            if (c.isMesh && c.material) {
                c.material = c.material.clone();
                c.material.transparent = false;
                c.material.depthWrite = true;
                c.material.side = THREE.DoubleSide;
                c.material.metalness = 0;
                c.material.roughness = 1;
                c.material.needsUpdate = true;
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

    // Initial snapshot — read once on mount so the avatar appears at its real
    // position instead of (0, 0, 0).
    const initialData = dataRef.current.get(id);
    const targetPos = useRef(new Vector3(initialData?.x ?? 0, initialData?.y ?? 0, initialData?.z ?? 0));
    const targetRot = useRef(initialData?.ry ?? 0);
    const lastStateRef = useRef<string>(initialData?.state ?? 'idle');
    const lastChatAtRef = useRef<number>(initialData?.chatAt ?? 0);

    useEffect(() => {
        if (groupRef.current && initialData) {
            groupRef.current.position.set(initialData.x, initialData.y, initialData.z);
            groupRef.current.rotation.y = initialData.ry;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [chatBubble, setChatBubble] = useState<{ msg: string; key: number } | null>(null);
    const frameCounter = useRef(0);
    const lastFarUpdateRef = useRef(0);
    // Accumulates wall-clock dt across throttled (skipped) frames so the mixer
    // advances by the true elapsed time when we DO update it — keeps the
    // walk/idle cadence correct at any update rate.
    const mixerAccumRef = useRef(0);
    const { camera } = useThree();

    useFrame((state, dt) => {
        if (!groupRef.current) return;
        const data = dataRef.current.get(id);
        if (!data) return;
        mixerAccumRef.current += dt;

        // Distance-band throttling. Reading squared distance avoids a sqrt.
        const dxCam = data.x - camera.position.x;
        const dzCam = data.z - camera.position.z;
        const distSq = dxCam * dxCam + dzCam * dzCam;

        // Beyond FAR_CULL_SQ, only refresh once per second. Animation x-fades
        // and chat-bubble pop-ins still fire, but lerp is skipped.
        if (distSq > FAR_CULL_SQ) {
            const now = state.clock.elapsedTime;
            if (now - lastFarUpdateRef.current < 1.0) return;
            lastFarUpdateRef.current = now;
        }
        // Between NEAR_FULL_SQ and FAR_HALF_SQ, update on every other frame.
        if (distSq > NEAR_FULL_SQ && distSq <= FAR_HALF_SQ) {
            frameCounter.current = (frameCounter.current + 1) & 1;
            if (frameCounter.current === 0) return;
        }

        // Drive the mixer with accumulated time on processed frames only.
        // Near (<10m) this is every frame → identical to before. Farther out
        // it runs at half/1Hz, advancing by the real elapsed time so the pose
        // is correct, just refreshed less often (imperceptible at distance).
        mixer.update(mixerAccumRef.current);
        mixerAccumRef.current = 0;

        if (hipsRef.current && hipsBindRef.current) {
            hipsRef.current.position.x = hipsBindRef.current.x;
            hipsRef.current.position.z = hipsBindRef.current.z;
        }

        // Snap on big jumps (teleport / level switch); otherwise lerp.
        const dx = data.x - targetPos.current.x;
        const dz = data.z - targetPos.current.z;
        targetPos.current.set(data.x, data.y, data.z);
        targetRot.current = data.ry;
        if (dx * dx + dz * dz > TELEPORT_DIST_SQ) {
            groupRef.current.position.set(data.x, data.y, data.z);
            groupRef.current.rotation.y = data.ry;
        } else {
            const k = Math.min(1, 15 * dt);
            groupRef.current.position.lerp(targetPos.current, k);
            let d = targetRot.current - groupRef.current.rotation.y;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            groupRef.current.rotation.y += d * k;
        }

        if (data.state !== lastStateRef.current) {
            lastStateRef.current = data.state;
            const walking = data.state === 'walking';
            const a = actions[walking ? 'Walking' : 'Idle'];
            const o = actions[walking ? 'Idle' : 'Walking'];
            if (o) o.fadeOut(0.2);
            if (a) a.reset().fadeIn(0.2).play();
        }

        if (data.chatMsg && data.chatAt && data.chatAt !== lastChatAtRef.current && Date.now() - data.chatAt < CHAT_BUBBLE_TTL_MS) {
            lastChatAtRef.current = data.chatAt;
            setChatBubble({ msg: data.chatMsg, key: data.chatAt });
        }
    });

    useEffect(() => {
        if (!chatBubble) return;
        const t = setTimeout(() => setChatBubble(null), CHAT_BUBBLE_TTL_MS);
        return () => clearTimeout(t);
    }, [chatBubble]);

    const displayName = useMemo(() => {
        const d = dataRef.current.get(id);
        return ((d?.name) || 'P-' + (id || '').slice(0, 4).toUpperCase()).slice(0, 16);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    return (
        <group ref={groupRef}>
            {/* Grounding shadow blob — single 16-segment disc at the feet.
                Not a real shadow map, just a dark transparent circle that
                makes remote players feel attached to the floor. Cost is
                negligible (32 triangles). */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} renderOrder={1}>
                <circleGeometry args={[0.5, 16]} />
                <meshBasicMaterial color="#000" transparent opacity={0.45} depthWrite={false} />
            </mesh>
            <primitive object={clonedScene} scale={[30, 30, 30]} position={[0, groundY, 0]} />
            <Html position={[0, 2.3, 0]} center distanceFactor={8}>
                <div className="pointer-events-none select-none whitespace-nowrap">
                    <div className="bg-black/70 text-white px-2.5 py-0.5 rounded-md text-[11px] font-bold border border-white/20 backdrop-blur-sm tracking-wider text-center shadow-lg">
                        {displayName}
                    </div>
                </div>
            </Html>
            {chatBubbles3D && chatBubble && (
                <Html key={chatBubble.key} position={[0, 2.7, 0]} center distanceFactor={8}>
                    <div className="pointer-events-none select-none whitespace-nowrap speech-bubble">
                        <div className="bg-white text-black px-3 py-1.5 rounded-xl border-2 border-black shadow-lg relative flex items-center justify-center max-w-[200px]">
                            <p className="text-[11px] sm:text-xs font-bold m-0 text-center break-words leading-snug">{chatBubble.msg}</p>
                        </div>
                        <div className="flex justify-center -mt-0.5">
                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black" />
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
});
