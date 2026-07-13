import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildFloor7V2Geometries } from './geometry';
import { createFloor7V2Materials } from './materials';

export interface Floor7ShipV2Props {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: number | [number, number, number];
    visible?: boolean;
    rollRef?: React.MutableRefObject<number>;
    children?: React.ReactNode;
}

/** A self-contained, coherent ship shell. Gameplay objects may be mounted as children. */
export const Floor7ShipV2 = forwardRef<THREE.Group, Floor7ShipV2Props>(function Floor7ShipV2({
    position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, visible = true, rollRef, children,
}, forwardedRef) {
    const group = useRef<THREE.Group>(null);
    useImperativeHandle(forwardedRef, () => group.current!, []);
    const G = useMemo(buildFloor7V2Geometries, []);
    const M = useMemo(createFloor7V2Materials, []);
    const barrels = useRef<THREE.InstancedMesh>(null);
    const crates = useRef<THREE.InstancedMesh>(null);

    useEffect(() => {
        // Keep repeated deck dressing out of the draw-call budget.
        const dummy = new THREE.Object3D();
        queueMicrotask(() => {
            const b = barrels.current;
            if (b) [[-1.75, .3, -3.2], [1.7, .3, 2.0], [-1.72, .3, 3.35], [1.62, .3, -4.25]].forEach((p, i) => {
                dummy.position.set(p[0], p[1], p[2]); dummy.rotation.y = i * 1.13; dummy.updateMatrix(); b.setMatrixAt(i, dummy.matrix);
            });
            const c = crates.current;
            if (c) [[-1.55, .24, -4.2], [1.5, .24, -3.8], [-1.45, .24, 5.0]].forEach((p, i) => {
                dummy.position.set(p[0], p[1], p[2]); dummy.rotation.y = i * .72; dummy.updateMatrix(); c.setMatrixAt(i, dummy.matrix);
            });
            if (b) b.instanceMatrix.needsUpdate = true; if (c) c.instanceMatrix.needsUpdate = true;
        });
    }, []);

    useFrame((_, dt) => {
        if (!group.current || !rollRef) return;
        const target = THREE.MathUtils.clamp(rollRef.current, -.12, .12);
        group.current.rotation.z += (rotation[2] + target - group.current.rotation.z) * Math.min(1, dt * 4);
    });

    return <group ref={group} name="floor7-v2-ship" position={position} rotation={rotation} scale={scale} visible={visible}>
        {/* Eleven stable material batches; props below are two instanced batches. */}
        <mesh name="lofted-hull" geometry={G.hull} material={M.hull} castShadow receiveShadow />
        <mesh name="continuous-deck" geometry={G.deck} material={M.deck} receiveShadow />
        <mesh name="raised-decks-and-stairs" geometry={G.upperDecks} material={M.deck} castShadow receiveShadow />
        <mesh name="stern-cabin" geometry={G.cabin} material={M.darkWood} castShadow receiveShadow />
        <mesh name="rails" geometry={G.rails} material={M.darkWood} castShadow />
        <mesh name="hull-trim" geometry={G.trim} material={M.trim} castShadow />
        <mesh name="masts-and-yards" geometry={G.masts} material={M.darkWood} castShadow />
        <mesh name="sails" geometry={G.sails} material={M.sail} castShadow />
        <mesh name="sail-patches" geometry={G.sailWear} material={M.sailDark} />
        <mesh name="rigging" geometry={G.rigging} material={M.rope} />
        <mesh name="gunports" geometry={G.iron} material={M.iron} />
        {/* Cabin windows frame the stern without adding another generated batch. */}
        {[-1.08, 0, 1.08].map((x) => <mesh key={x} position={[x, 1.4, -4.35]} material={M.glass}><planeGeometry args={[.52, .58]} /></mesh>)}
        <instancedMesh ref={barrels} args={[undefined, undefined, 4]} material={M.trim} castShadow>
            <cylinderGeometry args={[.22, .25, .56, 9]} />
        </instancedMesh>
        <instancedMesh ref={crates} args={[undefined, undefined, 3]} material={M.darkWood} castShadow>
            <boxGeometry args={[.48, .48, .48]} />
        </instancedMesh>
        {children}
    </group>;
});

export default Floor7ShipV2;
