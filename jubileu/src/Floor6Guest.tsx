/**
 * Floor6Guest.tsx — O HÓSPEDE QUE SABIA DEMAIS, in person.
 *
 * Agora um GLB de verdade (casaco escuro "Midnight Trenchcoat", enviado pelo
 * Felipe) no lugar do boneco procedural. A malha é ESTÁTICA (sem rig, sem
 * animações), então toda a vida vem do grupo: respiração lenta, um balanço
 * de peso quase imperceptível, o giro atrasado encarando o player — e o
 * arrastar de pés para o lado quando a fase vira 'free'/'leave' (ele sai da
 * frente do elevador, não do mundo).
 *
 * O inquietante continua sendo a QUIETUDE: ele só... espera.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { f6 } from './f6Escape';
import { guestTrenchcoatModel } from './assets/textureImports';

const GUEST_GLB_URL = guestTrenchcoatModel;
useGLTF.preload(GUEST_GLB_URL);

const GUEST_START = new THREE.Vector3(0, 0, -8.2);     // barrando a porta
const GUEST_ASIDE = new THREE.Vector3(-2.35, 0, -8.75); // encostado, vão livre
const ASIDE_SPEED = 0.35;                               // m/s — arrastar de pés

export const Floor6Guest: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { scene } = useGLTF(GUEST_GLB_URL);
    const root = useRef<THREE.Group>(null!);
    const inner = useRef<THREE.Group>(null!);
    const pos = useRef(GUEST_START.clone());
    const walkPh = useRef(0);

    // clone próprio (a cache do useGLTF é compartilhada) + materiais no clima
    // do quarto: roughness alto, reflexo baixo — nada de brilho de vitrine.
    const model = useMemo(() => {
        const m = scene.clone(true);
        m.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
                const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
                mat.roughness = Math.max(0.75, mat.roughness);
                mat.envMapIntensity = 0.35;
                mesh.material = mat;
                mesh.castShadow = false; mesh.receiveShadow = false;
            }
        });
        return m;
    }, [scene]);
    useEffect(() => () => {
        model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
        });
    }, [model]);

    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const g = root.current;
        if (!g) return;

        // ── step-aside: arrasta os pés até o canto quando 'free'/'leave' ──
        const target = (f6.phase === 'free' || f6.phase === 'leave') ? GUEST_ASIDE : GUEST_START;
        const dx = target.x - pos.current.x, dz = target.z - pos.current.z;
        const dist = Math.hypot(dx, dz);
        const moving = dist > 0.02;
        if (moving) {
            const step = Math.min(dist, ASIDE_SPEED * dt);
            pos.current.x += (dx / dist) * step;
            pos.current.z += (dz / dist) * step;
            walkPh.current += dt * 5.2;
        }
        // bob de passos arrastados só enquanto anda
        const bob = moving ? Math.abs(Math.sin(walkPh.current)) * 0.022 : 0;
        g.position.set(pos.current.x, bob, pos.current.z);

        // ── encara: o player, ou a direção da caminhada — sempre um tempo atrasado ──
        const p = playerPositionRef.current;
        const lookX = moving ? pos.current.x + dx : p.x;
        const lookZ = moving ? pos.current.z + dz : p.z;
        const want = Math.atan2(lookX - pos.current.x, lookZ - pos.current.z);
        let d = want - g.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        g.rotation.y += d * Math.min(1, dt * 1.6);

        // ── respiração + tremor + troca de peso (no grupo interno — o GLB não tem ossos) ──
        if (inner.current) {
            const br = Math.sin(t * 1.7);
            inner.current.scale.set(0.9 + br * 0.004, 0.9 + br * 0.008, 0.9 + br * 0.005);
            inner.current.rotation.z = Math.sin(t * 0.31) * 0.014 + Math.sin(t * 13.7) * 0.0018;
            inner.current.rotation.x = Math.sin(t * 0.23 + 1.2) * 0.008;
        }
    });

    return (
        <group ref={root} position={[0, 0, -8.2]}>
            {/* bbox do GLB: y ∈ [-1, 1] → sobe 0.9·1 e escala 0.9 ⇒ ~1.8 m de altura */}
            <group ref={inner} scale={0.9} position={[0, 0.9, 0]}>
                <primitive object={model} />
            </group>
        </group>
    );
};

export default Floor6Guest;
