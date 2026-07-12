import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createFloor7V2Materials } from './materials';

export interface Floor7ViewModelV2Props {
    heldRef: React.MutableRefObject<boolean>;
    cleaningRef: React.MutableRefObject<boolean>;
    bucketFillRef: React.MutableRefObject<number>;
}

export const Floor7ViewModelV2: React.FC<Floor7ViewModelV2Props> = ({ heldRef, cleaningRef, bucketFillRef }) => {
    const root = useRef<THREE.Group>(null), brush = useRef<THREE.Group>(null), bucket = useRef<THREE.Group>(null);
    const water = useRef<THREE.Mesh>(null);
    const M = useMemo(createFloor7V2Materials, []);
    useFrame((state, dt) => {
        const g = root.current; if (!g) return;
        g.visible = heldRef.current;
        g.position.copy(state.camera.position); g.quaternion.copy(state.camera.quaternion);
        const t = state.clock.elapsedTime;
        if (brush.current) {
            const target = cleaningRef.current ? Math.sin(t * 12) * .105 : Math.sin(t * 1.7) * .008;
            brush.current.position.x += (.28 + target - brush.current.position.x) * Math.min(1, dt * 18);
            brush.current.position.y = -.29 - (cleaningRef.current ? Math.abs(Math.sin(t * 12)) * .03 : 0);
            brush.current.rotation.z = cleaningRef.current ? target * 1.8 : Math.sin(t * 1.4) * .015;
        }
        if (bucket.current) bucket.current.rotation.z = Math.sin(t * 1.65) * .025;
        const fill = THREE.MathUtils.clamp(bucketFillRef.current, 0, 1);
        if (water.current) { water.current.visible = fill > .01; water.current.position.y = -.28 + fill * .205; water.current.scale.setScalar(.82 + fill * .16); }
    });
    return <group ref={root} name="floor7-v2-viewmodel" visible={false} frustumCulled={false}>
        {/* Right hand: a flattened palm and four small fingers around a real brush handle. */}
        <group ref={brush} position={[.28, -.3, -.72]}>
            <mesh position={[.09, -.055, .13]} rotation={[1.0, 0, -.22]} material={M.sleeve}><cylinderGeometry args={[.047, .07, .23, 10]} /></mesh>
            <mesh position={[.02, .005, .015]} rotation={[Math.PI / 2 + .18, 0, -.1]} scale={[1, .58, .92]} material={M.skin}><capsuleGeometry args={[.041, .052, 4, 8]} /></mesh>
            {[-.03, -.01, .01, .03].map((x, i) => <mesh key={i} position={[x, -.028, -.035 - i * .004]} rotation={[1.1, 0, 0]} material={M.skin}><capsuleGeometry args={[.01, .038 - i * .003, 3, 6]} /></mesh>)}
            <mesh position={[.052, -.008, -.005]} rotation={[.95, 0, .72]} material={M.skin}><capsuleGeometry args={[.011, .034, 3, 6]} /></mesh>
            <mesh position={[0, -.035, -.13]} rotation={[Math.PI / 2, 0, 0]} material={M.trim}><cylinderGeometry args={[.018, .022, .2, 8]} /></mesh>
            <mesh position={[0, -.05, -.245]} material={M.trim}><boxGeometry args={[.17, .04, .1]} /></mesh>
            <mesh position={[0, -.086, -.245]} material={M.bristle}><boxGeometry args={[.155, .035, .09]} /></mesh>
        </group>
        {/* Left hand grips the top of a vertical bail; the whole pail stays visible. */}
        <group ref={bucket} position={[-.3, -.16, -.75]}>
            <mesh position={[-.08, .075, .14]} rotation={[1.0, 0, .2]} material={M.sleeve}><cylinderGeometry args={[.05, .073, .24, 10]} /></mesh>
            <mesh position={[0, .085, .015]} rotation={[Math.PI / 2 + .16, 0, .08]} scale={[1, .58, .9]} material={M.skin}><capsuleGeometry args={[.04, .05, 4, 8]} /></mesh>
            {[-.026, -.008, .01, .028].map((x, i) => <mesh key={i} position={[x, .055, -.015]} rotation={[1.05, 0, 0]} material={M.skin}><capsuleGeometry args={[.009, .034 - i * .002, 3, 6]} /></mesh>)}
            <mesh position={[.048, .072, -.002]} rotation={[.92, 0, .72]} material={M.skin}><capsuleGeometry args={[.01, .032, 3, 6]} /></mesh>
            <mesh position={[0, -.045, 0]} material={M.iron}><torusGeometry args={[.13, .011, 7, 20, Math.PI]} /></mesh>
            <mesh position={[0, -.21, 0]} material={M.trim}><cylinderGeometry args={[.15, .125, .27, 14, 1, true]} /></mesh>
            <mesh position={[0, -.35, 0]} material={M.darkWood}><cylinderGeometry args={[.126, .126, .025, 14]} /></mesh>
            {[-.105, -.295].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><torusGeometry args={[y > -.2 ? .151 : .13, .011, 6, 16]} /></mesh>)}
            <mesh ref={water} position={[0, -.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.water}><circleGeometry args={[.14, 18]} /></mesh>
        </group>
    </group>;
};

export default Floor7ViewModelV2;
