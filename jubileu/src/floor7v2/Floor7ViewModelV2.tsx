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
            brush.current.position.x += (target - brush.current.position.x) * Math.min(1, dt * 18);
            brush.current.position.y = -.225 - (cleaningRef.current ? Math.abs(Math.sin(t * 12)) * .035 : 0);
            brush.current.rotation.z = cleaningRef.current ? target * 1.8 : Math.sin(t * 1.4) * .015;
        }
        if (bucket.current) bucket.current.rotation.z = Math.sin(t * 1.65) * .025;
        const fill = THREE.MathUtils.clamp(bucketFillRef.current, 0, 1);
        if (water.current) { water.current.visible = fill > .01; water.current.position.y = -.09 + fill * .16; water.current.scale.setScalar(.82 + fill * .16); }
    });
    return <group ref={root} name="floor7-v2-viewmodel" visible={false} frustumCulled={false}>
        {/* Right arm and articulated grip; compact enough not to cover interaction targets. */}
        <group ref={brush} position={[.245, -.225, -.48]}>
            <mesh position={[.11, -.09, .12]} rotation={[1.05, 0, -.28]} material={M.sleeve}><capsuleGeometry args={[.055, .28, 5, 9]} /></mesh>
            <mesh position={[.015, -.025, -.02]} rotation={[.25, 0, -.12]} material={M.skin}><capsuleGeometry args={[.052, .075, 5, 9]} /></mesh>
            {[-.032, -.01, .012, .034].map((x, i) => <mesh key={i} position={[x, -.052, -.075]} rotation={[1.18, 0, 0]} material={M.skin}><capsuleGeometry args={[.012, .055 - i * .004, 3, 6]} /></mesh>)}
            <mesh position={[0, -.078, -.125]} material={M.trim}><boxGeometry args={[.18, .045, .11]} /></mesh>
            <mesh position={[0, -.112, -.125]} material={M.bristle}><boxGeometry args={[.165, .035, .095]} /></mesh>
        </group>
        {/* Left arm naturally grips a vertical bail; the pail hangs below it. */}
        <group ref={bucket} position={[-.28, -.26, -.52]}>
            <mesh position={[-.08, .08, .12]} rotation={[1.0, 0, .24]} material={M.sleeve}><capsuleGeometry args={[.058, .29, 5, 9]} /></mesh>
            <mesh position={[0, .06, .01]} material={M.skin}><capsuleGeometry args={[.05, .06, 4, 8]} /></mesh>
            <mesh position={[0, -.11, 0]} rotation={[0, 0, 0]} material={M.iron}><torusGeometry args={[.13, .011, 7, 20, Math.PI]} /></mesh>
            <mesh position={[0, -.27, 0]} material={M.trim}><cylinderGeometry args={[.15, .125, .28, 14, 1, true]} /></mesh>
            <mesh position={[0, -.41, 0]} material={M.darkWood}><cylinderGeometry args={[.126, .126, .025, 14]} /></mesh>
            {[-.16, -.36].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.iron}><torusGeometry args={[y > -.2 ? .151 : .13, .011, 6, 16]} /></mesh>)}
            <mesh ref={water} position={[0, -.1, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.water}><circleGeometry args={[.14, 18]} /></mesh>
        </group>
    </group>;
};

export default Floor7ViewModelV2;
