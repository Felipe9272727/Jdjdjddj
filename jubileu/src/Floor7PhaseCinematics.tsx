import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { F7_STATE, type Floor7Brain } from './Floor7Brain';

type Phase = 'departure' | 'anchor' | 'return';

interface Props {
    brainRef: React.MutableRefObject<Floor7Brain | null>;
    shipRef: React.RefObject<THREE.Group | null>;
    disabled?: boolean;
}

const PHASE_DURATION: Record<Phase, number> = { departure: 5.5, anchor: 5.0, return: 7.5 };
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Short visual payoffs for departure, anchoring and the elevator's return. */
export const Floor7PhaseCinematics: React.FC<Props> = ({ brainRef, shipRef, disabled }) => {
    const { camera } = useThree();
    const phase = useRef<Phase | null>(null);
    const elapsed = useRef(0);
    const previousState = useRef(-1);
    const savedPos = useRef(new THREE.Vector3());
    const savedQuat = useRef(new THREE.Quaternion());
    const from = useRef(new THREE.Vector3());
    const to = useRef(new THREE.Vector3());
    const look = useRef(new THREE.Vector3());
    const world = useRef(new THREE.Vector3());
    const target = useRef(new THREE.Vector3());

    const begin = (next: Phase) => {
        phase.current = next; elapsed.current = 0;
        savedPos.current.copy(camera.position); savedQuat.current.copy(camera.quaternion);
    };

    useEffect(() => () => {
        if (phase.current) {
            camera.position.copy(savedPos.current);
            camera.quaternion.copy(savedQuat.current);
        }
    }, [camera]);

    useFrame((_, rawDt) => {
        const brain = brainRef.current, ship = shipRef.current;
        if (!brain || !ship || disabled) return;
        const state = brain.state();
        if (previousState.current !== state) {
            if (state === F7_STATE.DONE) begin('departure');
            else if (state === F7_STATE.ANCHOR) begin('anchor');
            else if (state === F7_STATE.FREE) begin('return');
            previousState.current = state;
        }
        const active = phase.current;
        if (!active) return;
        elapsed.current += Math.min(Math.max(rawDt, 0), 0.12);
        const p = clamp01(elapsed.current / PHASE_DURATION[active]);
        if (active === 'departure') {
            from.current.set(2.7, 1.8, -3.8); to.current.set(-5.3, 2.7, 7.4);
            look.current.set(0, 2.2, p < 0.52 ? -4.8 : 10.5);
        } else if (active === 'anchor') {
            from.current.set(-3.6, 2.5, 5.4); to.current.set(1.7, 1.35, -2.3);
            look.current.set(0.1, p < 0.45 ? 1.2 : 0.55, p < 0.45 ? 12 : -3);
        } else {
            from.current.set(3.8, 2.25, -1.8); to.current.set(1.2, 1.75, 4);
            look.current.set(0, 1.25, 5.2);
        }
        world.current.copy(from.current).lerp(to.current, ease(clamp01(p / 0.86)));
        ship.localToWorld(world.current);
        target.current.copy(look.current); ship.localToWorld(target.current);
        const weight = Math.min(ease(clamp01(p / 0.12)), 1 - ease(clamp01((p - 0.86) / 0.14)));
        camera.position.lerp(world.current, weight); camera.up.set(0, 1, 0); camera.lookAt(target.current);
        if (p >= 1) {
            camera.position.copy(savedPos.current); camera.quaternion.copy(savedQuat.current);
            camera.up.set(0, 1, 0); phase.current = null;
        }
    });
    return null;
};

export default Floor7PhaseCinematics;
