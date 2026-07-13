/** Camera director for interrogation and the post-memory betrayal. Mount after Player. */
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f8, type F8Phase } from './f8Arquivo';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DIRECTED = new Set<F8Phase>(['interrogatorio', 'entregaImagem', 'awakening', 'ready', 'lookBack', 'shove']);

const DizzyHand: React.FC<{ root: React.MutableRefObject<THREE.Group> }> = ({ root }) => (
    <group ref={root} visible={false}>
        <group rotation={[-.78, -.18, -.22]}>
            <mesh position={[.07, -.2, 0]} rotation={[0, 0, .45]}><capsuleGeometry args={[.045, .31, 5, 9]} /><meshStandardMaterial color="#292532" roughness={.92} /></mesh>
            <mesh position={[.005, -.035, 0]} rotation={[0, 0, .2]}><capsuleGeometry args={[.035, .15, 5, 8]} /><meshStandardMaterial color="#9b6e5f" roughness={.84} /></mesh>
            <mesh position={[0, .065, 0]} scale={[1, .7, .65]}><sphereGeometry args={[.047, 10, 8]} /><meshStandardMaterial color="#b98470" roughness={.8} /></mesh>
            {[-.038, -.013, .013, .038].map((x, i) => (
                <mesh key={x} position={[x, .115 + i * .002, -.006]} rotation={[.18 + i * .035, 0, x * 2.2]}>
                    <capsuleGeometry args={[.012, .055 - Math.abs(i - 1.5) * .004, 4, 7]} />
                    <meshStandardMaterial color="#bd8a75" roughness={.82} />
                </mesh>
            ))}
            <mesh position={[-.055, .07, .006]} rotation={[0, 0, -.65]}><capsuleGeometry args={[.014, .05, 4, 7]} /><meshStandardMaterial color="#b47f6d" roughness={.82} /></mesh>
        </group>
    </group>
);

export const Floor8Cinematics: React.FC = () => {
    const camera = useThree((s) => s.camera);
    const hand = useRef<THREE.Group>(null!);
    const pos = useRef(v(.8, 1.5, -3.25));
    const look = useRef(v(0, 1.05, -.65));
    const lastPhase = useRef<F8Phase>(f8.phase);
    const phaseT = useRef(0);
    const forward = useRef(new THREE.Vector3());
    const right = useRef(new THREE.Vector3());
    const up = useRef(new THREE.Vector3());

    useFrame((_, rawDt) => {
        const phase = f8.phase;
        if (phase !== lastPhase.current) { lastPhase.current = phase; phaseT.current = 0; }
        phaseT.current += Math.min(rawDt, .05);
        const active = DIRECTED.has(phase);
        if (hand.current) hand.current.visible = active && ['awakening', 'ready', 'lookBack'].includes(phase);
        if (!active) return;
        const dt = Math.min(rawDt, .05), t = phaseT.current;
        let wantP = v(1.12, 1.48, -3.18), wantL = v(0, 1.03, -.63), targetFov = 55, roll = 0;

        if (phase === 'interrogatorio') {
            if (f8.line === 2 || f8.line >= 8) { wantP = v(1.18, 1.34, -2.76); wantL = v(-.05, 1.02, -1.1); }
            else if (f8.line === 3 || f8.line === 4) { wantP = v(-.62, 1.46, -3); wantL = v(0, 1.04, -.68); }
            else if (f8.line >= 5) { wantP = v(1.02, 1.42, -2.82); wantL = v(0, 1.08, -.62); }
        } else if (phase === 'entregaImagem') {
            wantP = v(1.15, 2.05, -2.95); wantL = v(.02, .98, -1.48); targetFov = 48;
        } else if (phase === 'awakening') {
            const rise = Math.min(1, Math.max(0, (t - .45) / 2.7));
            wantP = v(.18, .42 + rise * .48, -3.25); wantL = v(0, .76 + rise * .16, -.8);
            targetFov = 66 - rise * 7; roll = Math.sin(t * 4.1) * .045 * (1 - rise * .55);
        } else if (phase === 'ready') {
            wantP = v(.12, 1.24, -3.38); wantL = v(0, 1.07, -.68);
            targetFov = 57; roll = Math.sin(t * 2.8) * .018;
        } else if (phase === 'lookBack') {
            const turn = Math.min(1, Math.max(0, (t - .4) / 2.25));
            const ease = turn * turn * (3 - 2 * turn);
            wantP = v(.03, 1.32 - Math.sin(t * 4) * .018, THREE.MathUtils.lerp(-3.45, -5.65, ease));
            wantL = v(Math.sin(ease * Math.PI) * 1.1, 1.08, THREE.MathUtils.lerp(-.7, -10.65, ease));
            targetFov = 59 + ease * 5; roll = -.025 * ease + Math.sin(t * 3.2) * .01;
        } else if (phase === 'shove') {
            const fall = Math.min(1, t / 2.05), snap = Math.min(1, fall * 1.45);
            pos.current.set(Math.sin(t * 9) * .12 * fall, THREE.MathUtils.lerp(1.32, -2.1, fall * fall), THREE.MathUtils.lerp(-4.1, -10.7, snap));
            camera.position.copy(pos.current);
            camera.lookAt(Math.sin(t * 5) * .35, THREE.MathUtils.lerp(1.1, 2.7, fall), -7.2);
            camera.rotation.z = fall * .58 + Math.sin(t * 12) * .05;
            const c = camera as THREE.PerspectiveCamera; c.fov = 64 + fall * 18; c.updateProjectionMatrix();
            return;
        }

        const k = 1 - Math.exp(-dt * (phase === 'lookBack' ? 4.1 : 3.2));
        pos.current.lerp(wantP, k); look.current.lerp(wantL, k);
        camera.position.copy(pos.current); camera.lookAt(look.current); camera.rotation.z += (roll - camera.rotation.z) * Math.min(1, dt * 5);
        if ('fov' in camera) {
            const c = camera as THREE.PerspectiveCamera; c.fov += (targetFov - c.fov) * k; c.updateProjectionMatrix();
        }
        if (hand.current?.visible) {
            forward.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
            right.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
            up.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
            hand.current.position.copy(camera.position)
                .addScaledVector(forward.current, .74)
                .addScaledVector(right.current, .52)
                .addScaledVector(up.current, .17 + Math.sin(t * 3.5) * .008);
            hand.current.quaternion.copy(camera.quaternion); hand.current.scale.setScalar(.48);
        }
    });

    return <DizzyHand root={hand} />;
};

export default Floor8Cinematics;
