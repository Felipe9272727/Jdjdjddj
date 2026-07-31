// ─── PhysicsProps ───────────────────────────────────────────────────────────
//
// R3F bridge over the Rapier (WASM) core in rapierPhysics.ts. Renders a small
// set of dynamic rigid-body crates/debris that fall, stack, collide and get
// shoved when the player walks into them. Purely additive: it never touches the
// player's own movement/collision (that stays on the proven physics.ts path).
//
// Quality-gated by the caller (profile.physicsProps, high only) so low/mobile
// never pay the WASM step cost. The world is built once Rapier finishes loading;
// until then it renders nothing (a dropped frame, not a crash).

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { initRapier, PropsWorld, type DynamicBoxSpec } from './rapierPhysics';

export interface CrateSpec extends DynamicBoxSpec {
    color?: string;
}

interface PhysicsPropsProps {
    /** Live player position; the kinematic capsule follows this. */
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    /** Top surface Y of the floor the crates rest on. */
    groundY?: number;
    /** Crates/debris to spawn. */
    crates: CrateSpec[];
    /** Optional static wall segments [ax,az,bx,bz] to keep debris in the room. */
    walls?: number[][];
    /** Pause stepping (e.g. dialogue/menus) so debris freezes cleanly. */
    paused?: boolean;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export const PhysicsProps: React.FC<PhysicsPropsProps> = ({
    playerPositionRef, groundY = 0, crates, walls, paused = false,
}) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const worldRef = useRef<PropsWorld | null>(null);
    const [ready, setReady] = useState(false);

    // Per-crate scale (unit box geometry, scaled per instance) + colour.
    const scales = useMemo(
        () => crates.map((c) => new THREE.Vector3(c.hx * 2, c.hy * 2, c.hz * 2)),
        [crates],
    );

    // Build the physics world once Rapier's WASM is ready.
    useEffect(() => {
        let cancelled = false;
        initRapier().then((R) => {
            if (cancelled) return;
            const w = new PropsWorld(R, -9.81);
            w.addGround(groundY);
            if (walls && walls.length) w.addWallSegments(walls, 3, 0.2, groundY);
            for (const c of crates) w.addDynamicBox(c);
            const pp = playerPositionRef.current;
            w.setCapsule(pp.x, groundY, pp.z, 0.5, 0.6);
            worldRef.current = w;
            setReady(true);
        });
        return () => {
            cancelled = true;
            worldRef.current?.dispose();
            worldRef.current = null;
            setReady(false);
        };
        // Rebuild only if the crate/wall layout itself changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crates, walls, groundY]);

    // Apply per-instance colours once the mesh exists.
    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh || !ready) return;
        const col = new THREE.Color();
        crates.forEach((c, i) => {
            col.set(c.color ?? '#8a6a3a');
            mesh.setColorAt(i, col);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [ready, crates]);

    useFrame((_, dt) => {
        const w = worldRef.current;
        const mesh = meshRef.current;
        if (!w || !mesh) return;
        const pp = playerPositionRef.current;
        w.updateCapsule(pp.x, groundY, pp.z);
        if (!paused) w.step(dt);
        for (let i = 0; i < w.dynamicCount; i++) {
            const t = w.bodyTransform(i);
            _p.set(t.position.x, t.position.y, t.position.z);
            _q.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
            _s.copy(scales[i] ?? _s.set(1, 1, 1));
            _m.compose(_p, _q, _s);
            mesh.setMatrixAt(i, _m);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    if (!ready) return null;
    return (
        <instancedMesh
            ref={meshRef}
            args={[undefined, undefined, crates.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
        >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial roughness={0.85} metalness={0.05} />
        </instancedMesh>
    );
};

export default PhysicsProps;
