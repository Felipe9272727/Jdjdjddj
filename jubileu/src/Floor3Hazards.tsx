/**
 * Floor3Hazards.tsx — renders the Diabrete's sabotage: spiked ink-strips that
 * "draw themselves" onto platforms ahead, and the cartoon paintbrush pickups
 * that appear every couple of obstacles.
 *
 * The state lives in f3Hazards.ts (shared with Player physics + the rival). A
 * single useFrame here owns the per-frame tick and drives every transform
 * imperatively (live platform X for moving bridges, the staggered spike "draw-
 * on", the brush bob/spin/collect-pop), re-rendering the React list only when
 * the set of live ids changes — same pattern as Floor3.tsx.
 */

import React, { useRef, useReducer } from 'react';
import { useFrame } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import * as THREE from 'three';
import {
    hazards, brushes, tickHazards, hazardBox, brushPos,
    type Hazard, type Brush,
} from './f3Hazards';

const INK = '#0a0712';

// ── Shared materials ──────────────────────────────────────────────────────────
const spikeMat  = new THREE.MeshToonMaterial({ color: '#17121d' });   // near-black ink
const strokeMat = new THREE.MeshToonMaterial({ color: INK });
const handleMat = new THREE.MeshToonMaterial({ color: '#e0a94a' });   // warm wood — pops in B&W
const ferruleMat= new THREE.MeshToonMaterial({ color: '#c2c7cf' });
const bristleMat= new THREE.MeshToonMaterial({ color: '#1a1420' });
const tipMat    = new THREE.MeshToonMaterial({ color: '#c0271a' });   // red ink, ties to the bowtie

const easeOutBack = (t: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ── One spiked ink-strip ──────────────────────────────────────────────────────
const SpikeStrip = React.forwardRef<THREE.Group, { hazard: Hazard }>(({ hazard }, ref) => {
    const spikeRefs = useRef<THREE.Mesh[]>([]);
    const strokeRef = useRef<THREE.Mesh>(null);
    const N = hazard.spikes;
    return (
        <group ref={ref}>
            {/* the ink baseline stroke that "sweeps" as it's drawn */}
            <mesh ref={strokeRef} position={[0, 0.03, 0]}>
                <boxGeometry args={[1, 0.06, 0.34]} />
                <primitive object={strokeMat} attach="material" />
            </mesh>
            {Array.from({ length: N }).map((_, i) => (
                <mesh key={i} ref={(el) => { if (el) spikeRefs.current[i] = el; }} castShadow>
                    <coneGeometry args={[0.17, 0.6, 4]} />
                    <primitive object={spikeMat} attach="material" />
                    <Outlines thickness={0.035} color={INK} />
                </mesh>
            ))}
        </group>
    );
});
SpikeStrip.displayName = 'SpikeStrip';

// ── One paintbrush pickup ─────────────────────────────────────────────────────
const BrushPickup = React.forwardRef<THREE.Group, { brush: Brush }>((_props, ref) => (
    <group ref={ref}>
        {/* tilt so it reads as a held brush */}
        <group rotation={[0, 0, Math.PI * 0.18]}>
            {/* handle */}
            <mesh position={[0, 0.32, 0]} castShadow>
                <cylinderGeometry args={[0.07, 0.085, 0.9, 12]} />
                <primitive object={handleMat} attach="material" />
                <Outlines thickness={0.03} color={INK} />
            </mesh>
            {/* ferrule */}
            <mesh position={[0, -0.18, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.16, 12]} />
                <primitive object={ferruleMat} attach="material" />
                <Outlines thickness={0.03} color={INK} />
            </mesh>
            {/* bristles */}
            <mesh position={[0, -0.4, 0]} castShadow>
                <coneGeometry args={[0.12, 0.42, 12]} />
                <primitive object={bristleMat} attach="material" />
                <Outlines thickness={0.03} color={INK} />
            </mesh>
            {/* dripping red ink tip */}
            <mesh position={[0, -0.62, 0]}>
                <sphereGeometry args={[0.06, 10, 8]} />
                <primitive object={tipMat} attach="material" />
            </mesh>
        </group>
    </group>
));
BrushPickup.displayName = 'BrushPickup';

// ── Container ─────────────────────────────────────────────────────────────────
const Floor3Hazards: React.FC = () => {
    const spikeGroups = useRef<Map<number, THREE.Group>>(new Map());
    const brushGroups = useRef<Map<number, THREE.Group>>(new Map());
    const [, bump] = useReducer((n: number) => n + 1, 0);
    const sig = useRef(0);

    useFrame((_, dt) => {
        const safeDt = Math.min(dt, 0.05);
        tickHazards(safeDt);

        // Spikes — position on the live platform + staggered draw-on.
        for (const h of hazards) {
            const g = spikeGroups.current.get(h.id);
            const box = hazardBox(h);
            if (!g || !box) continue;
            const cz = (box.z0 + box.z1) / 2;
            g.position.set(box.x, box.topY, cz);
            const span = box.hw * 2 * 0.82;
            const N = h.spikes;
            // ink baseline sweeps left→right with reveal
            const stroke = g.children[0] as THREE.Mesh;
            if (stroke) { stroke.scale.x = Math.max(0.001, h.reveal) * span; }
            for (let i = 0; i < N; i++) {
                const m = g.children[i + 1] as THREE.Mesh;
                if (!m) continue;
                const x = -span / 2 + (span / (N - 1)) * i;
                const local = Math.max(0, Math.min(1, (h.reveal - (i / N) * 0.7) / 0.3));
                const s = local <= 0 ? 0 : easeOutBack(local);
                m.position.set(x, 0.3 * s, 0);
                m.scale.set(Math.min(1, local * 1.6), s, Math.min(1, local * 1.6));
            }
        }

        // Brushes — bob, spin, collect-pop.
        for (const b of brushes) {
            const g = brushGroups.current.get(b.id);
            const wp = brushPos(b);
            if (!g || !wp) continue;
            g.position.set(wp.x, wp.y, wp.z);
            g.rotation.y += safeDt * 1.8;
            const pop = b.collected ? 1 + (1 - b.fade) * 1.2 : 1;
            g.scale.setScalar(b.collected ? pop * b.fade + 0.0001 : 1);
            g.visible = !(b.collected && b.fade <= 0.02);
        }

        // Re-render the React lists only when the id sets change. Hash the ids
        // numerically (no per-frame string/array allocation — this runs 60×/s).
        let s = (hazards.length * 1000003 + brushes.length) | 0;
        for (let i = 0; i < hazards.length; i++) s = (s * 31 + hazards[i].id) | 0;
        for (let i = 0; i < brushes.length; i++) s = (s * 31 + brushes[i].id) | 0;
        if (s !== sig.current) { sig.current = s; bump(); }
    });

    return (
        <group>
            {hazards.map((h) => (
                <SpikeStrip key={h.id} hazard={h}
                    ref={(el) => { if (el) spikeGroups.current.set(h.id, el); else spikeGroups.current.delete(h.id); }} />
            ))}
            {brushes.map((b) => (
                <BrushPickup key={b.id} brush={b}
                    ref={(el) => { if (el) brushGroups.current.set(b.id, el); else brushGroups.current.delete(b.id); }} />
            ))}
        </group>
    );
};

export default Floor3Hazards;
