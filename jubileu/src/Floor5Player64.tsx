/**
 * Floor5Player64.tsx — the THIRD-PERSON N64 avatar for Floor 5.
 *
 * The same kid from the Floor-4 sprite (bacon-brown hair, blue shirt, navy
 * pants) rebuilt as a chunky low-poly Mario-64-era model: big head, flat
 * shading, blob shadow, squash & stretch. All procedural primitives — no GLB.
 *
 * Movement is the shared `stepRacer` integrator from f5Race.ts (the robot
 * runs the same one): camera-relative analog run, queued jump with coyote
 * time, hazard knockback with a cartoon tumble.
 */
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f5, stepRacer, groundHeightAt, type Racer, GAP } from './f5Race';
import { playF5Jump, playF5Bonk } from './floor5RaceSfx';

// N64 plastic: flat lambert, no texture, loud colors
export const mat64 = (color: string, emissive = '#000000', ei = 0) =>
    new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, flatShading: true });

const SKIN = '#e8b48a', HAIR = '#7a4a24', HAIR_LT = '#94613a',
    SHIRT = '#3b6fb0', SHIRT_DK = '#2c5489', PANTS = '#2c3550', SHOE = '#43321f';

/** Soft round blob shadow (the N64 way). */
export const blobTex: THREE.CanvasTexture = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,0.42)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); return t;
})();

export const BlobShadow: React.FC<{ size?: number }> = ({ size = 1.5 }) => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={blobTex} transparent depthWrite={false} />
    </mesh>
);

const B: React.FC<{ args: [number, number, number]; p?: [number, number, number]; m: THREE.Material }> =
    ({ args, p = [0, 0, 0], m }) => (
        <mesh position={p} material={m}><boxGeometry args={args} /></mesh>
    );

// shared materials (module-level: built once)
const M = {
    skin: mat64(SKIN), hair: mat64(HAIR), hairLt: mat64(HAIR_LT),
    shirt: mat64(SHIRT), shirtDk: mat64(SHIRT_DK), pants: mat64(PANTS),
    shoe: mat64(SHOE), white: mat64('#ffffff'), black: mat64('#1c1614'),
    mouth: mat64('#8a5a48'),
};

export interface AvatarRefs {
    root: React.MutableRefObject<THREE.Group | null>;
    visual: React.MutableRefObject<THREE.Group | null>;   // tumble/squash live here
    body: React.MutableRefObject<THREE.Group | null>;     // yaw
    armL: React.MutableRefObject<THREE.Group | null>;
    armR: React.MutableRefObject<THREE.Group | null>;
    legL: React.MutableRefObject<THREE.Group | null>;
    legR: React.MutableRefObject<THREE.Group | null>;
    head: React.MutableRefObject<THREE.Group | null>;
    shadow: React.MutableRefObject<THREE.Group | null>;
}
export function useAvatarRefs(): AvatarRefs {
    return {
        root: useRef(null), visual: useRef(null), body: useRef(null),
        armL: useRef(null), armR: useRef(null), legL: useRef(null),
        legR: useRef(null), head: useRef(null), shadow: useRef(null),
    };
}

/** The kid, ~1.75 units tall, hips at 0.82. */
export const Avatar64: React.FC<{ refs: AvatarRefs }> = ({ refs }) => (
    <group ref={refs.root}>
        <group ref={refs.shadow}><BlobShadow size={1.5} /></group>
        <group ref={refs.visual}>
            <group ref={refs.body}>
                {/* legs (pivot at hip, y=0.82) */}
                <group ref={refs.legL} position={[-0.16, 0.82, 0]}>
                    <B args={[0.24, 0.52, 0.26]} p={[0, -0.28, 0]} m={M.pants} />
                    <B args={[0.26, 0.16, 0.42]} p={[0, -0.58, 0.07]} m={M.shoe} />
                </group>
                <group ref={refs.legR} position={[0.16, 0.82, 0]}>
                    <B args={[0.24, 0.52, 0.26]} p={[0, -0.28, 0]} m={M.pants} />
                    <B args={[0.26, 0.16, 0.42]} p={[0, -0.58, 0.07]} m={M.shoe} />
                </group>
                {/* torso */}
                <B args={[0.62, 0.56, 0.38]} p={[0, 1.12, 0]} m={M.shirt} />
                <B args={[0.64, 0.12, 0.4]} p={[0, 0.86, 0]} m={M.shirtDk} />
                {/* arms (pivot at shoulder, y=1.34) */}
                <group ref={refs.armL} position={[-0.40, 1.34, 0]}>
                    <B args={[0.18, 0.46, 0.2]} p={[0, -0.2, 0]} m={M.shirt} />
                    <B args={[0.16, 0.14, 0.18]} p={[0, -0.48, 0]} m={M.skin} />
                </group>
                <group ref={refs.armR} position={[0.40, 1.34, 0]}>
                    <B args={[0.18, 0.46, 0.2]} p={[0, -0.2, 0]} m={M.shirt} />
                    <B args={[0.16, 0.14, 0.18]} p={[0, -0.48, 0]} m={M.skin} />
                </group>
                {/* BIG head (chibi ratio) + bacon hair + face */}
                <group ref={refs.head} position={[0, 1.66, 0]}>
                    <B args={[0.58, 0.52, 0.52]} p={[0, 0.26, 0]} m={M.skin} />
                    {/* hair: crown slab, back flap, side flaps, jagged fringe */}
                    <B args={[0.64, 0.18, 0.58]} p={[0, 0.5, 0]} m={M.hair} />
                    <B args={[0.64, 0.08, 0.58]} p={[0, 0.58, 0]} m={M.hairLt} />
                    <B args={[0.62, 0.3, 0.14]} p={[0, 0.32, -0.24]} m={M.hair} />
                    <B args={[0.1, 0.26, 0.5]} p={[-0.28, 0.36, 0]} m={M.hair} />
                    <B args={[0.1, 0.26, 0.5]} p={[0.28, 0.36, 0]} m={M.hair} />
                    {[-0.21, -0.07, 0.07, 0.21].map((fx, i) => (
                        <B key={i} args={[0.12, i % 2 ? 0.16 : 0.1, 0.06]} p={[fx, 0.42 - (i % 2 ? 0.05 : 0.02), 0.265]} m={i === 2 ? M.hairLt : M.hair} />
                    ))}
                    {/* face (front +z): eyes + brows + smile */}
                    <B args={[0.1, 0.14, 0.02]} p={[-0.13, 0.26, 0.262]} m={M.white} />
                    <B args={[0.1, 0.14, 0.02]} p={[0.13, 0.26, 0.262]} m={M.white} />
                    <B args={[0.05, 0.09, 0.025]} p={[-0.12, 0.25, 0.265]} m={M.black} />
                    <B args={[0.05, 0.09, 0.025]} p={[0.14, 0.25, 0.265]} m={M.black} />
                    <B args={[0.16, 0.04, 0.02]} p={[0, 0.1, 0.262]} m={M.mouth} />
                </group>
            </group>
        </group>
    </group>
);

/** Run/idle/jump/tumble animation, shared with the robot driver. */
export function animateAvatar(refs: AvatarRefs, r: Racer, dt: number, t: number): void {
    const v = refs.visual.current, b = refs.body.current;
    if (!v || !b) return;
    const speed = Math.hypot(r.vx, r.vz);
    // yaw eases toward facing
    let dy = r.facing - b.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    b.rotation.y += dy * Math.min(1, dt * 12);

    if (r.stun > 0) {
        v.rotation.x += dt * 13;                                   // cartoon tumble
        v.position.y = 0.25;
    } else {
        v.rotation.x = THREE.MathUtils.lerp(v.rotation.x % (Math.PI * 2), 0, Math.min(1, dt * 10));
        v.position.y = 0;
    }
    const run = Math.min(1, speed / 7);
    const ph = r.runPhase;
    const set = (g: React.MutableRefObject<THREE.Group | null>, rx: number) => { if (g.current) g.current.rotation.x = rx; };
    if (!r.onGround) {
        set(refs.legL, -0.75); set(refs.legR, -0.35);
        set(refs.armL, -2.5); set(refs.armR, -2.5);                // arms up — wahoo
    } else if (run > 0.12) {
        set(refs.legL, Math.sin(ph) * 0.95 * run); set(refs.legR, -Math.sin(ph) * 0.95 * run);
        set(refs.armL, -Math.sin(ph) * 0.8 * run); set(refs.armR, Math.sin(ph) * 0.8 * run);
        b.rotation.x = run * 0.12;
        b.position.y = Math.abs(Math.sin(ph)) * 0.07 * run;
    } else {
        set(refs.legL, 0); set(refs.legR, 0);
        set(refs.armL, Math.sin(t * 2.1) * 0.06); set(refs.armR, -Math.sin(t * 2.1) * 0.06);
        b.rotation.x = 0;
        b.position.y = Math.sin(t * 2.4) * 0.015;
    }
    // squash & stretch from vertical velocity
    const sy = THREE.MathUtils.clamp(1 + r.vy * 0.022, 0.8, 1.18);
    v.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    // blob shadow hugs the ground below
    const sh = refs.shadow.current;
    if (sh) {
        const gh = groundHeightAt(r.x - r.lane, r.z);
        sh.position.y = (gh ?? GAP.foamY) - r.y + 0.03;
        const d = r.y - (gh ?? GAP.foamY);
        sh.scale.setScalar(Math.max(0.35, 1 - d * 0.12));
        sh.visible = d < 6;
    }
}

/** Player driver: input → shared physics → model pose. The parent owns the
 *  racer object (the HUD and the director read it too). */
export const Floor5Player64: React.FC<{
    racer: React.MutableRefObject<Racer>;
    inputRef: React.MutableRefObject<{ x: number; z: number }>;
    jumpRef: React.MutableRefObject<boolean>;
    lockRef: React.MutableRefObject<boolean>;
    hiddenNearCamRef?: React.MutableRefObject<boolean>;
}> = ({ racer, inputRef, jumpRef, lockRef, hiddenNearCamRef }) => {
    const refs = useAvatarRefs();
    const camera = useThree((s) => s.camera);
    const fwd = useRef(new THREE.Vector3());
    const right = useRef(new THREE.Vector3());
    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const r = racer.current;
        // camera-relative analog input
        camera.getWorldDirection(fwd.current);
        fwd.current.y = 0; fwd.current.normalize();
        right.current.crossVectors(fwd.current, new THREE.Vector3(0, 1, 0));
        const inp = lockRef.current
            ? { mx: 0, mz: 0, jump: false }
            : {
                mx: right.current.x * inputRef.current.x + fwd.current.x * inputRef.current.z,
                mz: right.current.z * inputRef.current.x + fwd.current.z * inputRef.current.z,
                jump: jumpRef.current,
            };
        jumpRef.current = false;
        const freeRoam = f5.phase !== 'race';
        const ev = stepRacer(r, inp, dt, f5.clock, freeRoam && r.z < -0.3);
        if (ev.jumped) playF5Jump();
        if (ev.hit) playF5Bonk();
        if (ev.fellRespawn) playF5Bonk();
        // hold racers on the start line until JÁ
        if (f5.phase !== 'race' && f5.phase !== 'finish' && r.z > -0.4) { r.z = -0.4; r.vz = Math.min(0, r.vz); }
        const g = refs.root.current;
        if (g) {
            g.position.set(r.x, r.y, r.z);
            g.visible = !(hiddenNearCamRef?.current ?? false);
        }
        animateAvatar(refs, r, dt, state.clock.elapsedTime);
    });
    return <Avatar64 refs={refs} />;
};
