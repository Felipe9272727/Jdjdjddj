/**
 * Floor5.tsx — Andar 5: O NOVO BASEPLATE.
 *
 * The payoff of Floor 4's arc: "as partes que sobram também são bem tratadas."
 * This is where the un-remembered floor WENT — a pristine, sunlit, studded
 * baseplate with the salvaged pieces of Saguão 04 stacked neatly in a corner,
 * the lobby's plant REPLANTED and alive, and a polite sign from the
 * administration. Far away, the Zelador stands and watches. He always watches.
 *
 * Reached by riding the elevator after "VOCÊ LEMBROU DO ANDAR 4"
 * (handleFloor4Exit in App.tsx). The elevator zone rides you back to the lobby.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Canvas-texture helpers (no external assets, same as the rest of the game) ─
function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    draw(ctx);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** Classic studded baseplate tile (4×4 studs), tiled across the ground. */
const studsTex = (() => {
    const t = canvasTex(128, 128, (ctx) => {
        ctx.fillStyle = '#7b7d80'; ctx.fillRect(0, 0, 128, 128);
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
            const cx = sx * 32 + 16, cy = sy * 32 + 16;
            ctx.fillStyle = '#6b6d70';                                     // stud base shadow
            ctx.beginPath(); ctx.arc(cx + 1.5, cy + 1.5, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#8a8c90';                                     // stud top
            ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#9da0a5';                                     // highlight
            ctx.beginPath(); ctx.arc(cx - 2.5, cy - 2.5, 5, 0, Math.PI * 2); ctx.fill();
        }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(28, 28);
    return t;
})();

/** The administration's polite little plaque. */
const plaqueTex = canvasTex(256, 160, (ctx) => {
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = '#b9b4a4'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, 246, 150);
    ctx.fillStyle = '#3a3a3a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 21px monospace';
    ctx.fillText('AS PARTES QUE SOBRAM', 128, 42);
    ctx.fillText('SÃO BEM TRATADAS.', 128, 72);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#7a7568';
    ctx.fillText('— a administração', 128, 118);
});

/** Salvaged SAGUÃO sign (the one from downstairs, retired up here). */
const saguao5Tex = canvasTex(224, 64, (ctx) => {
    ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, 224, 64);
    ctx.fillStyle = '#bf9a2e'; ctx.fillRect(0, 0, 224, 4); ctx.fillRect(0, 60, 224, 4);
    ctx.fillStyle = '#FFD54F';
    ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SAGUÃO', 112, 34);
});

/** Checkered lobby tile slab (a stolen piece of the old floor). */
const tileSlabTex = (() => {
    const t = canvasTex(64, 64, (ctx) => {
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#b9ad92' : '#8e8470';
            ctx.fillRect(x * 16, y * 16, 16, 16);
        }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
})();

/** THE NORMAL ELEVATOR header for the lone shaft kiosk. */
const elevHeaderTex = canvasTex(256, 40, (ctx) => {
    ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, 256, 40);
    ctx.fillStyle = '#FFD54F';
    ctx.font = 'bold 19px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('THE NORMAL ELEVATOR', 128, 21);
});

/** Blocky classic cloud (three overlapping white boxes), drifting slowly. */
const Cloud: React.FC<{ x: number; y: number; z: number; s?: number; sp?: number }> = ({ x, y, z, s = 1, sp = 0.4 }) => {
    const g = useRef<THREE.Group>(null!);
    const t = useRef(Math.random() * 100);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (g.current) g.current.position.x = x + ((t.current * sp) % 90) - 45;
    });
    return (
        <group ref={g} position={[x, y, z]} scale={[s, s, s]}>
            <mesh><boxGeometry args={[7, 2, 3.5]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
            <mesh position={[-3.4, 1, 0.4]}><boxGeometry args={[4, 2, 2.8]} /><meshBasicMaterial color="#f4f8ff" toneMapped={false} /></mesh>
            <mesh position={[3.2, 0.9, -0.4]}><boxGeometry args={[4.5, 1.8, 2.6]} /><meshBasicMaterial color="#f4f8ff" toneMapped={false} /></mesh>
        </group>
    );
};

/** The lobby plant — REPLANTED, alive. Someone kept watering it. */
const ReplantedPlant: React.FC<{ x: number; z: number }> = ({ x, z }) => {
    const leaves = useRef<THREE.Group>(null!);
    const t = useRef(0);
    useFrame((_, dt) => {
        t.current += Math.min(dt, 0.05);
        if (leaves.current) leaves.current.rotation.z = Math.sin(t.current * 1.2) * 0.04;   // breeze
    });
    return (
        <group position={[x, 0, z]}>
            <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.4, 0.55, 0.9, 8]} /><meshStandardMaterial color="#b5532e" /></mesh>
            <mesh position={[0, 0.92, 0]}><cylinderGeometry args={[0.42, 0.42, 0.08, 8]} /><meshStandardMaterial color="#7e3a20" /></mesh>
            <group ref={leaves} position={[0, 0.95, 0]}>
                <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.05, 0.08, 1.1, 5]} /><meshStandardMaterial color="#357a37" /></mesh>
                {[0, 1, 2, 3, 4].map((i) => {
                    const a = (i / 5) * Math.PI * 2;
                    return (
                        <mesh key={i} position={[Math.cos(a) * 0.35, 0.85 + (i % 2) * 0.18, Math.sin(a) * 0.35]} rotation={[0.5 * Math.sin(a), -a, 0.5 * Math.cos(a)]}>
                            <boxGeometry args={[0.55, 0.06, 0.22]} />
                            <meshStandardMaterial color={i % 2 ? '#4ea04b' : '#3f8c41'} />
                        </mesh>
                    );
                })}
            </group>
        </group>
    );
};

/** The Zelador, far across the plate. He doesn't approach. He just watches. */
const DistantZelador: React.FC = () => {
    const g = useRef<THREE.Group>(null!);
    useFrame(({ camera }) => {
        if (g.current) g.current.lookAt(camera.position.x, 0, camera.position.z);   // always facing you
    });
    return (
        <group ref={g} position={[34, 0, 38]}>
            <mesh position={[0, 1.0, 0]}><boxGeometry args={[0.7, 2.0, 0.4]} /><meshBasicMaterial color="#16121a" /></mesh>
            <mesh position={[0, 2.35, 0]}><boxGeometry args={[0.55, 0.6, 0.45]} /><meshBasicMaterial color="#16121a" /></mesh>
            <mesh position={[0, 2.6, 0.1]}><boxGeometry args={[0.65, 0.12, 0.55]} /><meshBasicMaterial color="#0e0b11" /></mesh>
            {/* the smile carries at any distance */}
            <mesh position={[0, 2.25, 0.24]}><boxGeometry args={[0.3, 0.05, 0.02]} /><meshBasicMaterial color="#d9a43c" toneMapped={false} /></mesh>
        </group>
    );
};

/** The salvage pile: pieces of Saguão 04, stacked with unsettling care. */
const SalvagePile: React.FC = () => {
    const tileMat = useMemo(() => new THREE.MeshStandardMaterial({ map: tileSlabTex }), []);
    return (
        <group position={[10, 0, -2]} rotation={[0, -0.4, 0]}>
            {/* checkered floor slabs, squared up */}
            <mesh position={[0, 0.25, 0]} material={tileMat}><boxGeometry args={[3.2, 0.5, 2.4]} /></mesh>
            <mesh position={[0.3, 0.75, -0.2]} material={tileMat}><boxGeometry args={[2.4, 0.5, 1.8]} /></mesh>
            {/* wainscot planks */}
            <mesh position={[-2.4, 0.3, 1.2]} rotation={[0, 0.3, 0]}><boxGeometry args={[2.8, 0.18, 0.5]} /><meshStandardMaterial color="#6b4a2e" /></mesh>
            <mesh position={[-2.2, 0.5, 1.0]} rotation={[0, 0.22, 0]}><boxGeometry args={[2.6, 0.18, 0.5]} /><meshStandardMaterial color="#54371d" /></mesh>
            {/* the retired SAGUÃO sign, leaning against the pile */}
            <mesh position={[1.6, 0.9, 1.5]} rotation={[-0.25, 0.5, 0]}>
                <boxGeometry args={[2.6, 0.75, 0.1]} />
                <meshBasicMaterial map={saguao5Tex} toneMapped={false} />
            </mesh>
            {/* neat brick stacks */}
            {[0, 1, 2].map((i) => (
                <group key={i} position={[-1.2 + i * 0.9, 0, -1.6]}>
                    <mesh position={[0, 0.2, 0]}><boxGeometry args={[0.7, 0.4, 0.45]} /><meshStandardMaterial color="#5d3a30" /></mesh>
                    <mesh position={[0, 0.6, 0]}><boxGeometry args={[0.7, 0.4, 0.45]} /><meshStandardMaterial color={i === 1 ? '#3c241e' : '#5d3a30'} /></mesh>
                    {i !== 1 && <mesh position={[0, 1.0, 0]}><boxGeometry args={[0.7, 0.4, 0.45]} /><meshStandardMaterial color="#6e4a3a" /></mesh>}
                </group>
            ))}
        </group>
    );
};

/** Lone elevator kiosk: a clean shaft housing standing alone on the plate. */
const ElevatorKiosk: React.FC = () => (
    <group position={[0, 0, -13]}>
        {/* side + back shells around the global ElevatorInterior cab */}
        <mesh position={[-3.45, 2.5, -0.2]}><boxGeometry args={[0.5, 5, 6.6]} /><meshStandardMaterial color="#2b3238" /></mesh>
        <mesh position={[3.45, 2.5, -0.2]}><boxGeometry args={[0.5, 5, 6.6]} /><meshStandardMaterial color="#2b3238" /></mesh>
        <mesh position={[0, 2.5, -3.3]}><boxGeometry args={[7.4, 5, 0.5]} /><meshStandardMaterial color="#232a30" /></mesh>
        <mesh position={[0, 5.2, -0.2]}><boxGeometry args={[7.4, 0.6, 6.8]} /><meshStandardMaterial color="#2b3238" /></mesh>
        {/* gold header over the doorway */}
        <mesh position={[0, 4.6, 3.05]}>
            <boxGeometry args={[6.2, 0.8, 0.15]} />
            <meshBasicMaterial map={elevHeaderTex} toneMapped={false} />
        </mesh>
    </group>
);

/** Andar 5 — O NOVO BASEPLATE. Bright, flat, studded, suspiciously tidy. */
export const Floor5Environment: React.FC = () => (
    <group>
        {/* sunlit sky dome + soft haze at the horizon */}
        <mesh><sphereGeometry args={[280, 16, 12]} /><meshBasicMaterial color="#7ec4f4" side={THREE.BackSide} toneMapped={false} fog={false} /></mesh>
        <fog attach="fog" args={['#cfe7fb', 70, 230]} />
        {/* the sun */}
        <mesh position={[90, 120, -110]}><sphereGeometry args={[9, 12, 12]} /><meshBasicMaterial color="#fff6cf" toneMapped={false} fog={false} /></mesh>
        <hemisphereLight args={['#dff0ff', '#8a8c80', 0.9]} />
        <directionalLight position={[40, 70, -30]} intensity={1.4} color="#fff2d8" />

        {/* THE NEW BASEPLATE — studs to the horizon */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[116, 116]} />
            <meshStandardMaterial map={studsTex} />
        </mesh>
        {/* plate rim (it just… ends) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
            <planeGeometry args={[120, 120]} />
            <meshStandardMaterial color="#5f6164" />
        </mesh>

        {/* blocky clouds drifting */}
        <Cloud x={-20} y={34} z={-40} s={1.4} sp={0.5} />
        <Cloud x={25} y={42} z={-70} s={2.0} sp={0.3} />
        <Cloud x={0} y={38} z={50} s={1.6} sp={0.4} />

        {/* the lone elevator, pristine as ever */}
        <ElevatorKiosk />

        {/* the lore corner: salvage, the sign, the plant that lived */}
        <SalvagePile />
        <group position={[5.2, 0, 3.5]} rotation={[0, -0.3, 0]}>
            <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.07, 0.09, 2.2, 6]} /><meshStandardMaterial color="#d8d4c8" /></mesh>
            <mesh position={[0, 2.25, 0]}>
                <boxGeometry args={[2.6, 1.6, 0.1]} />
                <meshBasicMaterial map={plaqueTex} toneMapped={false} />
            </mesh>
        </group>
        <ReplantedPlant x={7.6} z={4.6} />

        {/* and, far across the plate… */}
        <DistantZelador />
    </group>
);

export default Floor5Environment;
