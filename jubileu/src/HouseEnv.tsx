import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF, Instances, Instance, useTexture } from '@react-three/drei';
import { ASSETS, COLORS, BARNEY_URL } from './constants';
import { TextureMaterial } from './Materials';

useTexture.preload(BARNEY_URL);
import { ElevatorFacade } from './Elevator';
import { Sofa, CoffeeTable, Bed, KitchenCounter, Barrel } from './Furniture';
import * as THREE from 'three';

// Preload Dussekar's GLB at module load so the first time the player walks
// near the shop we don't fall to 4fps loading it synchronously.
const DUSSEKAR_URL = "https://raw.githubusercontent.com/Felipe9272727/Vers-o-definitiva/main/blocky%20character%203d%20model.glb";
useGLTF.preload(DUSSEKAR_URL);

export const DussekarCharacter = ({ position, rotation }: any) => {
  const [dialogue, setDialogue] = useState<string | null>(null);
  const { scene } = useGLTF(DUSSEKAR_URL) as any;
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  const group = useRef<any>(null);
  const timeRef = useRef(0);
  const proximityTimerRef = useRef(0);
  const secretTriggeredRef = useRef(false);
  useFrame((state, dt) => {
      if (!group.current) return;
      // Distance cull: the float wobble is invisible past ~12 units. Skipping
      // the math + matrix update when the camera is far is a free win.
      const dx = state.camera.position.x - position[0];
      const dz = state.camera.position.z - position[2];
      const distSq = dx * dx + dz * dz;
      if (distSq > 144) return;
      timeRef.current += dt;
      group.current.position.y = position[1] + Math.sin(timeRef.current * 0.8) * 0.015;

      // Easter egg: track proximity for 30-second secret message
      if (distSq < 9) { // within ~3 units
          proximityTimerRef.current += dt;
          if (proximityTimerRef.current >= 30 && !secretTriggeredRef.current) {
              secretTriggeredRef.current = true;
              setDialogue("You stayed. They always leave. You are... different.");
              setTimeout(() => setDialogue(null), 12000);
          }
      } else {
          proximityTimerRef.current = 0;
      }
  });
  useEffect(() => {
      let active = true; let showTimer: any; let hideTimer: any;
      const lines = ["The geometry is leaking.", "I saw a color that doesn't exist.", "Do the buttons feel pain?", "I am vibrating at the wrong frequency.", "Someone stole the floor yesterday.", "The air is too thick to chew.", "I remember when this was all orange.", "My reflection blinked first.", "Static tastes like lemons.", "The elevator knows what you did.", "Gravity is just a suggestion.", "I am waiting for the Tuesday that never comes.", "Do not look at the corners."];
      const runCycle = () => {
          if (!active) return;
          showTimer = setTimeout(() => {
              if (!active) return;
              // Don't override the secret message
              if (secretTriggeredRef.current) return;
              const text = lines[Math.floor(Math.random() * lines.length)];
              setDialogue(text);
              hideTimer = setTimeout(() => { if (active && !secretTriggeredRef.current) { setDialogue(null); runCycle(); } }, 10000);
          }, 5000);
      };
      runCycle(); return () => { active = false; clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, []);
  return (
      <group ref={group} position={position} rotation={rotation}>
          <primitive object={clonedScene} scale={3} position={[0, 0, 0]} />
           {dialogue && (
              // No `occlude` here. drei's <Html occlude> raycasts the entire scene
              // every frame to test visibility — that single prop was the cause of
              // 5fps drops near the shop. The bubble is fine without it.
              <Html position={[0, 1.0, 0]} center distanceFactor={10}>
                  <div className="pointer-events-none select-none whitespace-nowrap speech-bubble">
                      <div className="bg-white text-black px-4 py-2 rounded-xl border-2 border-black shadow-lg relative flex items-center justify-center transform -translate-y-full max-w-[180px]">
                          <p className="text-xs sm:text-sm font-bold m-0 text-center break-words leading-snug">{dialogue}</p>
                      </div>
                  </div>
              </Html>
           )}
      </group>
  )
};

export const Shop = ({ position }: any) => {
  const LIGHT_COLOR = "#FFEB3B";
  return (
      <group position={position}>
           <mesh position={[2.0, 0.05, 0]}><boxGeometry args={[4.0, 0.1, 4.8]} /><meshStandardMaterial color="#212121" roughness={0.9} /></mesh>
           <mesh position={[2.0, 3.95, 0]}><boxGeometry args={[4.0, 0.1, 4.8]} /><meshStandardMaterial color="#3E2723" /></mesh>
           <mesh position={[2.0, 3.85, 0]}><boxGeometry args={[2.5, 0.1, 3.5]} /><meshStandardMaterial color={LIGHT_COLOR} emissive={LIGHT_COLOR} emissiveIntensity={4.0} toneMapped={false} /></mesh>
           <mesh position={[3.95, 2.0, 0]}><boxGeometry args={[0.1, 4.0, 4.8]} /><TextureMaterial url={ASSETS.noise} color="#A65E2E" repeat={[4, 4]} roughness={0.5} /></mesh>
           <mesh position={[2.0, 2.0, -2.4]}><boxGeometry args={[4.0, 4.0, 0.1]} /><TextureMaterial url={ASSETS.noise} color="#A65E2E" repeat={[4, 4]} roughness={0.5} /></mesh>
           <mesh position={[2.0, 2.0, 2.4]}><boxGeometry args={[4.0, 4.0, 0.1]} /><TextureMaterial url={ASSETS.noise} color="#A65E2E" repeat={[4, 4]} roughness={0.5} /></mesh>
           <group position={[3.6, 1.1, -1.2]}><mesh><boxGeometry args={[0.2, 2.2, 1.0]} /><meshStandardMaterial color="#EEEEEE" /></mesh></group>
           <Barrel position={[3.0, 0, 1.8]} />
           <group position={[0.6, 0, 0]}><mesh position={[0, 1.05, 0]}><boxGeometry args={[1.0, 0.1, 5.0]} /><meshStandardMaterial color="#EEEEEE" roughness={0.2} metalness={0.1} /></mesh><mesh position={[0.1, 0.5, 0]}><boxGeometry args={[0.8, 1.0, 5.0]} /><TextureMaterial url={ASSETS.wood} color="#3E2723" repeat={[1, 1]} rotation={Math.PI/2} /></mesh></group>
           <group position={[0.6, 1.1, 0]}><mesh position={[0, 0.1, -0.6]}><cylinderGeometry args={[0.12, 0.1, 0.25, 16]} /><meshStandardMaterial color="#1565C0" roughness={0.3} /></mesh><mesh position={[0, 0.1, 0.6]}><cylinderGeometry args={[0.12, 0.1, 0.25, 16]} /><meshStandardMaterial color="#C62828" roughness={0.3} /></mesh></group>
           <DussekarCharacter position={[2.2, 1.1, 0]} rotation={[0, Math.PI, 0]} />
      </group>
  );
};

// ─── Animated chimney smoke (delight + overdrive) ─────────────────────────
const ChimneySmoke = ({ position }: { position: [number, number, number] }) => {
    const groupRef = useRef<any>(null);
    const timeRef = useRef(0);
    useFrame((_, dt) => {
        if (!groupRef.current) return;
        timeRef.current += dt;
        const t = timeRef.current;
        // Animate 3 smoke puffs drifting upward with slight sway
        for (let i = 0; i < 3; i++) {
            const child = groupRef.current.children[i];
            if (!child) continue;
            const phase = (t * 0.4 + i * 1.2) % 3.0; // 3s cycle
            const y = phase * 1.5;
            const sway = Math.sin(t * 0.8 + i * 2) * 0.15;
            child.position.set(sway, y, 0);
            const s = 0.15 + phase * 0.2;
            child.scale.set(s, s, s);
            if (child.material) child.material.opacity = Math.max(0, 0.35 - phase * 0.12);
        }
    });
    return (
        <group ref={groupRef} position={position}>
            {[0, 1, 2].map(i => (
                <mesh key={i}>
                    <sphereGeometry args={[1, 6, 6]} />
                    <meshBasicMaterial color="#888" transparent opacity={0.3} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
};

// ─── Window component — glass, frame, shutters, flower box (colorize + polish) ──
const HouseWindow = ({ position, rotation = [0, 0, 0] }: { position: [number, number, number]; rotation?: [number, number, number] }) => (
    <group position={position} rotation={rotation}>
        {/* Glass pane — slightly blue tint */}
        <mesh><planeGeometry args={[1.2, 1.2]} /><meshStandardMaterial color="#B3E5FC" emissive="#1565C0" emissiveIntensity={0.08} roughness={0.1} metalness={0.7} transparent opacity={0.5} /></mesh>
        {/* Frame — dark wood */}
        <mesh position={[0, 0.65, 0.02]}><boxGeometry args={[1.45, 0.1, 0.07]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
        <mesh position={[0, -0.65, 0.02]}><boxGeometry args={[1.45, 0.1, 0.07]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
        <mesh position={[-0.72, 0, 0.02]}><boxGeometry args={[0.1, 1.4, 0.07]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
        <mesh position={[0.72, 0, 0.02]}><boxGeometry args={[0.1, 1.4, 0.07]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
        {/* Cross bars */}
        <mesh position={[0, 0, 0.035]}><boxGeometry args={[1.35, 0.06, 0.04]} /><meshStandardMaterial color="#4E342E" roughness={0.5} /></mesh>
        <mesh position={[0, 0, 0.035]} rotation={[0, 0, Math.PI/2]}><boxGeometry args={[1.35, 0.06, 0.04]} /><meshStandardMaterial color="#4E342E" roughness={0.5} /></mesh>
        {/* Shutters — green for color pop */}
        <mesh position={[-0.9, 0, 0.04]}><boxGeometry args={[0.22, 1.35, 0.04]} /><meshStandardMaterial color="#33691E" roughness={0.75} /></mesh>
        <mesh position={[0.9, 0, 0.04]}><boxGeometry args={[0.22, 1.35, 0.04]} /><meshStandardMaterial color="#33691E" roughness={0.75} /></mesh>
        {/* Shutter slat details */}
        {[-0.3, 0, 0.3].map((sy, i) => (
            <group key={i}>
                <mesh position={[-0.9, sy, 0.065]}><boxGeometry args={[0.18, 0.02, 0.01]} /><meshStandardMaterial color="#2E7D32" roughness={0.7} /></mesh>
                <mesh position={[0.9, sy, 0.065]}><boxGeometry args={[0.18, 0.02, 0.01]} /><meshStandardMaterial color="#2E7D32" roughness={0.7} /></mesh>
            </group>
        ))}
        {/* Window sill */}
        <mesh position={[0, -0.72, 0.08]}><boxGeometry args={[1.5, 0.06, 0.16]} /><meshStandardMaterial color="#EFEBE9" roughness={0.6} /></mesh>
        {/* Flower box */}
        <mesh position={[0, -0.82, 0.12]}><boxGeometry args={[1.1, 0.18, 0.18]} /><meshStandardMaterial color="#5D4037" roughness={0.8} /></mesh>
        {/* Flowers in box */}
        {[-0.35, -0.1, 0.15, 0.4].map((fx, i) => (
            <group key={`f${i}`} position={[fx, -0.7, 0.12]}>
                <mesh><cylinderGeometry args={[0.01, 0.01, 0.12, 4]} /><meshStandardMaterial color="#2E7D32" /></mesh>
                <mesh position={[0, 0.08, 0]}><sphereGeometry args={[0.05, 6, 6]} /><meshStandardMaterial color={i % 2 === 0 ? "#E91E63" : "#FF9800"} emissive={i % 2 === 0 ? "#E91E63" : "#FF9800"} emissiveIntensity={0.15} /></mesh>
            </group>
        ))}
    </group>
);

// ─── Flower bed (delight) ─────────────────────────────────────────────────
const FlowerBed = ({ position, color = "#E91E63" }: { position: [number, number, number]; color?: string }) => (
    <group position={position}>
        <mesh position={[0, 0.08, 0]}><boxGeometry args={[1.5, 0.16, 0.5]} /><meshStandardMaterial color="#5D4037" roughness={0.9} /></mesh>
        <mesh position={[0, 0.2, 0]}><boxGeometry args={[1.3, 0.08, 0.35]} /><meshStandardMaterial color="#3E2723" roughness={0.9} /></mesh>
        {[-0.5, -0.2, 0.1, 0.4].map((fx, i) => (
            <group key={i} position={[fx, 0.3, 0]}>
                <mesh><cylinderGeometry args={[0.01, 0.01, 0.15, 4]} /><meshStandardMaterial color="#2E7D32" /></mesh>
                <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.06, 6, 6]} /><meshStandardMaterial color={i % 2 === 0 ? color : "#FF9800"} emissive={i % 2 === 0 ? color : "#FF9800"} emissiveIntensity={0.2} /></mesh>
            </group>
        ))}
    </group>
);

// ─── Mailbox (delight) ────────────────────────────────────────────────────
const Mailbox = ({ position }: { position: [number, number, number] }) => (
    <group position={position}>
        <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.04, 0.04, 0.8, 6]} /><meshStandardMaterial color="#795548" roughness={0.8} /></mesh>
        <mesh position={[0, 0.85, 0.08]}><boxGeometry args={[0.3, 0.2, 0.22]} /><meshStandardMaterial color="#D32F2F" roughness={0.4} metalness={0.1} /></mesh>
        <mesh position={[0, 0.96, 0.08]} rotation={[0.3, 0, 0]}><boxGeometry args={[0.32, 0.03, 0.15]} /><meshStandardMaterial color="#B71C1C" roughness={0.3} /></mesh>
    </group>
);

// ─── Pathway lantern (arrange + colorize) ──────────────────────────────────
const PathLantern = ({ position }: { position: [number, number, number] }) => (
    <group position={position}>
        <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.03, 0.04, 0.8, 6]} /><meshStandardMaterial color="#212121" metalness={0.6} roughness={0.3} /></mesh>
        <mesh position={[0, 0.85, 0]}><boxGeometry args={[0.15, 0.2, 0.15]} /><meshStandardMaterial color="#212121" metalness={0.5} roughness={0.3} /></mesh>
        <pointLight position={[0, 0.85, 0]} intensity={0.6} distance={4} color="#FFE0B2" decay={2} />
    </group>
);

// ─── House (redesigned — bolder, colorize, delight, arrange, polish, overdrive) ──
export const House = React.memo(({ x, z, rot, doorOpen, doorOpenAmount, nightMode }: any) => {
    const doorRef = useRef<any>(null);
    const interiorLightRef = useRef<any>(null);
    const timeRef = useRef(0);

    useFrame((state, delta) => {
        if (doorRef.current) {
            const target = doorOpenAmount !== undefined ? -2 * doorOpenAmount : (doorOpen ? -2 : 0);
            doorRef.current.rotation.y = THREE.MathUtils.lerp(doorRef.current.rotation.y, target, delta * 3);
        }
        if (interiorLightRef.current) {
            timeRef.current += delta;
            const base = nightMode ? 1.5 : 3.5;
            const flicker = nightMode ? Math.sin(timeRef.current * 3) * 0.3 + Math.sin(timeRef.current * 7) * 0.1 : 0;
            interiorLightRef.current.intensity = base + flicker;
            interiorLightRef.current.color.set(nightMode ? "#FF8A65" : "#FFD54F");
        }
    });

    return (
        <group position={[x, 0, z]} rotation={[0, rot, 0]}>

            {/* ═══════════════════════════════════════════════════════════
                AGENT 1: STRUCTURE — foundation, walls, roof, chimney
                ═══════════════════════════════════════════════════════════ */}
            <mesh position={[0, 0.12, 0]}><boxGeometry args={[8.6, 0.24, 8.6]} /><meshStandardMaterial color="#5D4037" roughness={0.95} /></mesh>
            <mesh position={[0, 0.26, 0]}><boxGeometry args={[8.3, 0.04, 8.3]} /><meshStandardMaterial color="#4E342E" roughness={0.8} /></mesh>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.29, 0]}><planeGeometry args={[8, 8]} /><TextureMaterial url={ASSETS.wood} color="#8D6E63" repeat={[4, 4]} roughness={0.45} /></mesh>
            <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 5.8, 0]}><planeGeometry args={[8, 8]} /><meshStandardMaterial color="#EFEBE9" roughness={0.95} /></mesh>
            <mesh position={[0, 3.1, -4.1]}><boxGeometry args={[8.2, 5.8, 0.3]} /><TextureMaterial url={ASSETS.wall} color="#D7CCC8" repeat={[2, 1]} roughness={0.9} /></mesh>
            <mesh position={[-4.1, 3.1, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[8.2, 5.8, 0.3]} /><TextureMaterial url={ASSETS.wall} color="#D7CCC8" repeat={[2, 1]} roughness={0.9} /></mesh>
            <mesh position={[4.1, 3.1, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[8.2, 5.8, 0.3]} /><TextureMaterial url={ASSETS.wall} color="#D7CCC8" repeat={[2, 1]} roughness={0.9} /></mesh>
            <mesh position={[-2.5, 3.1, 4.1]}><boxGeometry args={[3.0, 5.8, 0.3]} /><TextureMaterial url={ASSETS.wall} color="#D7CCC8" repeat={[1, 1]} roughness={0.9} /></mesh>
            <mesh position={[2.5, 3.1, 4.1]}><boxGeometry args={[3.0, 5.8, 0.3]} /><TextureMaterial url={ASSETS.wall} color="#D7CCC8" repeat={[1, 1]} roughness={0.9} /></mesh>
            <mesh position={[0, 5.0, 4.1]}><boxGeometry args={[2.0, 1.6, 0.3]} /><TextureMaterial url={ASSETS.wall} color="#D7CCC8" repeat={[0.5, 0.5]} roughness={0.9} /></mesh>
            <mesh position={[-2, 3.1, 0]}><boxGeometry args={[0.15, 5.8, 8]} /><meshStandardMaterial color="#EFEBE9" roughness={0.95} /></mesh>
            <mesh position={[0, 3.1, -2]}><boxGeometry args={[8, 5.8, 0.15]} /><meshStandardMaterial color="#EFEBE9" roughness={0.95} /></mesh>
            <mesh position={[0, 0.42, -3.95]}><boxGeometry args={[8.1, 0.12, 0.06]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
            <mesh position={[-3.95, 0.42, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[8.1, 0.12, 0.06]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
            <mesh position={[3.95, 0.42, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[8.1, 0.12, 0.06]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
            <mesh position={[0, 5.6, -3.95]}><boxGeometry args={[8.1, 0.08, 0.08]} /><meshStandardMaterial color="#EFEBE9" roughness={0.8} /></mesh>
            <mesh position={[0, 8.0, 0]} rotation={[0, Math.PI/4, 0]}><coneGeometry args={[7.5, 4.2, 4]} /><meshStandardMaterial color="#BF360C" roughness={0.6} metalness={0.05} /></mesh>
            <mesh position={[0, 10.15, 0]}><boxGeometry args={[0.2, 0.2, 9]} /><meshStandardMaterial color="#8D6E63" roughness={0.5} /></mesh>
            <mesh position={[0, 5.95, 4.5]}><boxGeometry args={[9, 0.1, 0.15]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            <mesh position={[0, 5.95, -4.5]}><boxGeometry args={[9, 0.1, 0.15]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            <mesh position={[-4.5, 5.95, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[9, 0.1, 0.15]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            <mesh position={[4.5, 5.95, 0]} rotation={[0, Math.PI/2, 0]}><boxGeometry args={[9, 0.1, 0.15]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            <mesh position={[3, 8.2, -2.5]}><boxGeometry args={[0.9, 3.5, 0.9]} /><meshStandardMaterial color="#C62828" roughness={0.85} /></mesh>
            <mesh position={[3, 10.05, -2.5]}><boxGeometry args={[1.0, 0.12, 1.0]} /><meshStandardMaterial color="#8D6E63" roughness={0.7} /></mesh>
            <mesh position={[3, 8.0, -2.06]}><boxGeometry args={[0.85, 0.02, 0.01]} /><meshStandardMaterial color="#8D6E63" /></mesh>
            <mesh position={[3, 8.3, -2.06]}><boxGeometry args={[0.85, 0.02, 0.01]} /><meshStandardMaterial color="#8D6E63" /></mesh>
            <mesh position={[3, 8.6, -2.06]}><boxGeometry args={[0.85, 0.02, 0.01]} /><meshStandardMaterial color="#8D6E63" /></mesh>
            <ChimneySmoke position={[3, 10.3, -2.5]} />

            {/* ═══════════════════════════════════════════════════════════
                AGENT 2: PORCH & DOOR — entrance with character
                ═══════════════════════════════════════════════════════════ */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.3, 5.8]}><planeGeometry args={[5, 3.5]} /><TextureMaterial url={ASSETS.wood} color="#6D4C41" repeat={[3, 2]} roughness={0.55} /></mesh>
            <mesh position={[0, 0.3, 7.55]}><boxGeometry args={[5, 0.3, 0.08]} /><meshStandardMaterial color="#4E342E" roughness={0.7} /></mesh>
            <mesh position={[0, 0.22, 7.7]}><boxGeometry args={[3.0, 0.12, 0.4]} /><meshStandardMaterial color="#795548" roughness={0.7} /></mesh>
            <mesh position={[0, 0.12, 8.0]}><boxGeometry args={[3.2, 0.12, 0.4]} /><meshStandardMaterial color="#6D4C41" roughness={0.75} /></mesh>
            <mesh position={[0, 0.04, 8.3]}><boxGeometry args={[3.4, 0.08, 0.4]} /><meshStandardMaterial color="#5D4037" roughness={0.8} /></mesh>
            <mesh position={[-2.2, 2.5, 7.2]}><cylinderGeometry args={[0.12, 0.14, 4.5, 8]} /><meshStandardMaterial color="#EFEBE9" roughness={0.5} /></mesh>
            <mesh position={[2.2, 2.5, 7.2]}><cylinderGeometry args={[0.12, 0.14, 4.5, 8]} /><meshStandardMaterial color="#EFEBE9" roughness={0.5} /></mesh>
            <mesh position={[-2.2, 0.35, 7.2]}><boxGeometry args={[0.35, 0.1, 0.35]} /><meshStandardMaterial color="#D7CCC8" roughness={0.6} /></mesh>
            <mesh position={[2.2, 0.35, 7.2]}><boxGeometry args={[0.35, 0.1, 0.35]} /><meshStandardMaterial color="#D7CCC8" roughness={0.6} /></mesh>
            <mesh position={[-2.2, 4.7, 7.2]}><boxGeometry args={[0.3, 0.1, 0.3]} /><meshStandardMaterial color="#D7CCC8" roughness={0.6} /></mesh>
            <mesh position={[2.2, 4.7, 7.2]}><boxGeometry args={[0.3, 0.1, 0.3]} /><meshStandardMaterial color="#D7CCC8" roughness={0.6} /></mesh>
            <mesh position={[0, 4.75, 6.5]}><boxGeometry args={[5.5, 0.15, 2.5]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            <mesh rotation={[Math.PI/2, 0, 0]} position={[0, 4.68, 6.5]}><planeGeometry args={[5.2, 2.2]} /><meshStandardMaterial color="#EFEBE9" roughness={0.95} /></mesh>
            <mesh position={[-2.5, 4.7, 5.8]}><boxGeometry args={[0.08, 0.08, 1.5]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            <mesh position={[2.5, 4.7, 5.8]}><boxGeometry args={[0.08, 0.08, 1.5]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            {/* Door */}
            <group position={[-0.7, 1.5, 4.15]} ref={doorRef}>
                <group position={[0.7, 0, 0]}>
                    <mesh><boxGeometry args={[1.5, 2.7, 0.12]} /><meshStandardMaterial color="#3E2723" roughness={0.5} /></mesh>
                    <mesh position={[0, 0.55, 0.07]}><boxGeometry args={[1.1, 0.9, 0.03]} /><meshStandardMaterial color="#4E342E" roughness={0.4} /></mesh>
                    <mesh position={[0, -0.55, 0.07]}><boxGeometry args={[1.1, 0.9, 0.03]} /><meshStandardMaterial color="#4E342E" roughness={0.4} /></mesh>
                    <mesh position={[0.55, 0, 0.1]}><sphereGeometry args={[0.06, 12, 12]} /><meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.15} /></mesh>
                    <mesh position={[0.55, -0.15, 0.08]}><cylinderGeometry args={[0.02, 0.02, 0.05, 8]} rotation={[Math.PI/2, 0, 0]} /><meshStandardMaterial color="#212121" metalness={0.9} roughness={0.1} /></mesh>
                    <mesh position={[0, 0.85, 0.07]}><cylinderGeometry args={[0.025, 0.025, 0.04, 8]} rotation={[Math.PI/2, 0, 0]} /><meshStandardMaterial color="#212121" metalness={0.8} roughness={0.2} /></mesh>
                </group>
                <mesh position={[-0.08, 0, -0.06]}><boxGeometry args={[0.12, 2.9, 0.18]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
                <mesh position={[1.48, 0, -0.06]}><boxGeometry args={[0.12, 2.9, 0.18]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
                <mesh position={[0.7, 1.45, -0.06]}><boxGeometry args={[1.7, 0.12, 0.18]} /><meshStandardMaterial color="#3E2723" roughness={0.6} /></mesh>
            </group>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.305, 4.8]}><planeGeometry args={[1.2, 0.6]} /><meshStandardMaterial color="#795548" roughness={0.95} /></mesh>
            {/* Porch hanging lantern */}
            <group position={[0, 4.3, 7.0]}>
                <mesh><boxGeometry args={[0.2, 0.3, 0.2]} /><meshStandardMaterial color="#212121" metalness={0.6} roughness={0.3} /></mesh>
                <mesh position={[0, 0.18, 0]}><boxGeometry args={[0.06, 0.06, 0.06]} /><meshStandardMaterial color="#212121" metalness={0.6} roughness={0.3} /></mesh>
                <pointLight position={[0, -0.1, 0]} intensity={1.5} distance={6} color="#FFE0B2" decay={2} />
            </group>

            {/* ═══════════════════════════════════════════════════════════
                AGENT 3: WINDOWS — glass, shutters, flower boxes
                ═══════════════════════════════════════════════════════════ */}
            <HouseWindow position={[-2.5, 3.5, 4.26]} />
            <HouseWindow position={[2.5, 3.5, 4.26]} />
            <HouseWindow position={[-4.26, 3.5, -1.5]} rotation={[0, -Math.PI/2, 0]} />
            <HouseWindow position={[-4.26, 3.5, 2.0]} rotation={[0, -Math.PI/2, 0]} />
            <HouseWindow position={[4.26, 3.5, -1.5]} rotation={[0, Math.PI/2, 0]} />
            <HouseWindow position={[4.26, 3.5, 2.0]} rotation={[0, Math.PI/2, 0]} />
            <HouseWindow position={[2, 3.5, -4.26]} rotation={[0, Math.PI, 0]} />
            <HouseWindow position={[-2, 3.5, -4.26]} rotation={[0, Math.PI, 0]} />

            {/* ═══════════════════════════════════════════════════════════
                AGENT 4: GARDEN — path, flowers, fence, mailbox, bushes
                ═══════════════════════════════════════════════════════════ */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.015, 8]}><planeGeometry args={[2.2, 7]} /><meshStandardMaterial color="#9E9E9E" roughness={0.95} /></mesh>
            {[5.5, 6.5, 7.5, 8.5, 9.5, 10.5].map((pz, i) => (
                <mesh key={`stone${i}`} rotation={[-Math.PI/2, 0, 0.15 * i]} position={[Math.sin(i) * 0.12, 0.02, pz]}><circleGeometry args={[0.25, 7]} /><meshStandardMaterial color="#BDBDBD" roughness={0.85} /></mesh>
            ))}
            <FlowerBed position={[-3.0, 0, 5.2]} color="#E91E63" />
            <FlowerBed position={[-3.0, 0, 6.5]} color="#FF5722" />
            <FlowerBed position={[3.0, 0, 5.2]} color="#9C27B0" />
            <FlowerBed position={[3.0, 0, 6.5]} color="#FFC107" />
            <FlowerBed position={[-4.5, 0, 0]} color="#E91E63" />
            <FlowerBed position={[4.5, 0, 0]} color="#4CAF50" />
            <FlowerBed position={[0, 0, -4.8]} color="#FF9800" />
            {/* White picket fence */}
            {[-3.8, -3.0, -2.2, -1.4, -0.2, 0.6, 1.4, 2.2, 3.0, 3.8].map((fx, i) => (
                <group key={`ff${i}`} position={[fx, 0, 10.5]}>
                    <mesh position={[0, 0.4, 0]}><boxGeometry args={[0.05, 0.8, 0.05]} /><meshStandardMaterial color="#EFEBE9" roughness={0.7} /></mesh>
                    <mesh position={[0, 0.82, 0]} rotation={[0, 0, Math.PI/4]}><boxGeometry args={[0.06, 0.06, 0.05]} /><meshStandardMaterial color="#EFEBE9" roughness={0.7} /></mesh>
                    <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.85, 0.04, 0.04]} /><meshStandardMaterial color="#EFEBE9" roughness={0.7} /></mesh>
                    <mesh position={[0, 0.6, 0]}><boxGeometry args={[0.85, 0.04, 0.04]} /><meshStandardMaterial color="#EFEBE9" roughness={0.7} /></mesh>
                </group>
            ))}
            <Mailbox position={[2.8, 0, 10.8]} />
            <PathLantern position={[-1.3, 0, 9.5]} />
            <PathLantern position={[1.3, 0, 9.5]} />
            {/* Garden bench */}
            <group position={[-4.5, 0, 4]} rotation={[0, Math.PI/2, 0]}>
                <mesh position={[0, 0.35, 0]}><boxGeometry args={[1.2, 0.06, 0.5]} /><meshStandardMaterial color="#5D4037" roughness={0.7} /></mesh>
                <mesh position={[-0.5, 0.2, 0]}><boxGeometry args={[0.06, 0.4, 0.5]} /><meshStandardMaterial color="#4E342E" roughness={0.7} /></mesh>
                <mesh position={[0.5, 0.2, 0]}><boxGeometry args={[0.06, 0.4, 0.5]} /><meshStandardMaterial color="#4E342E" roughness={0.7} /></mesh>
                <mesh position={[0, 0.65, -0.22]}><boxGeometry args={[1.2, 0.5, 0.05]} /><meshStandardMaterial color="#5D4037" roughness={0.7} /></mesh>
            </group>
            {/* Lamp post */}
            <group position={[4.5, 0, 5]}>
                <mesh position={[0, 1.0, 0]}><cylinderGeometry args={[0.04, 0.06, 2.0, 6]} /><meshStandardMaterial color="#212121" metalness={0.5} roughness={0.4} /></mesh>
                <mesh position={[0, 2.1, 0]}><boxGeometry args={[0.2, 0.25, 0.2]} /><meshStandardMaterial color="#212121" metalness={0.5} roughness={0.3} /></mesh>
                <pointLight position={[0, 2.0, 0]} intensity={1.0} distance={5} color="#FFE0B2" decay={2} />
            </group>
            {/* Bushes */}
            {[[-3.8, 0, -4.5], [3.8, 0, -4.5], [-4.5, 0, -2], [4.5, 0, -2], [-4.5, 0, 3], [4.5, 0, 3]].map(([bx, by, bz], i) => (
                <mesh key={`bush${i}`} position={[bx, 0.35, bz]}><sphereGeometry args={[0.45, 8, 6]} /><meshStandardMaterial color="#2E7D32" roughness={0.9} /></mesh>
            ))}

            {/* ═══════════════════════════════════════════════════════════
                AGENT 5: INTERIOR & LIGHTING — furniture, warm lights
                ═══════════════════════════════════════════════════════════ */}
            {/* Living room rug */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[-2.2, 0.3, 2.0]}><planeGeometry args={[3.2, 2.8]} /><meshStandardMaterial color="#6D4C41" roughness={0.95} opacity={0.8} transparent /></mesh>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[-2.2, 0.305, 2.0]}><planeGeometry args={[2.6, 2.2]} /><meshStandardMaterial color="#8D6E63" roughness={0.95} opacity={0.6} transparent /></mesh>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[-2.2, 0.31, 2.0]}><planeGeometry args={[1.8, 1.4]} /><meshStandardMaterial color="#A1887F" roughness={0.95} opacity={0.4} transparent /></mesh>
            <Sofa x={-2.5} z={2.5} rot={Math.PI/4} />
            <CoffeeTable x={-2.0} z={1.5} />
            {/* Wall art */}
            <group position={[-2.0, 3.5, 0.1]}>
                <mesh><boxGeometry args={[1.4, 1.0, 0.05]} /><meshStandardMaterial color="#3E2723" roughness={0.5} /></mesh>
                <mesh position={[0, 0, 0.03]}><planeGeometry args={[1.1, 0.7]} /><meshStandardMaterial color="#795548" roughness={0.8} /></mesh>
                <mesh position={[-0.2, 0.1, 0.04]}><planeGeometry args={[0.3, 0.25]} /><meshStandardMaterial color="#C62828" roughness={0.9} /></mesh>
                <mesh position={[0.15, -0.05, 0.04]}><planeGeometry args={[0.2, 0.3]} /><meshStandardMaterial color="#1565C0" roughness={0.9} /></mesh>
                <mesh position={[0.3, 0.15, 0.04]}><planeGeometry args={[0.15, 0.15]} /><meshStandardMaterial color="#FF8F00" roughness={0.9} /></mesh>
            </group>
            {/* Side table with lamp */}
            <group position={[-3.5, 0, 1.0]}>
                <mesh position={[0, 0.3, 0]}><boxGeometry args={[0.5, 0.6, 0.5]} /><meshStandardMaterial color="#5D4037" roughness={0.7} /></mesh>
                <mesh position={[0, 0.65, 0]}><boxGeometry args={[0.55, 0.04, 0.55]} /><meshStandardMaterial color="#6D4C41" roughness={0.6} /></mesh>
                <mesh position={[0, 0.85, 0]}><cylinderGeometry args={[0.03, 0.04, 0.35, 6]} /><meshStandardMaterial color="#212121" metalness={0.5} roughness={0.3} /></mesh>
                <mesh position={[0, 1.1, 0]}><coneGeometry args={[0.18, 0.2, 8]} /><meshStandardMaterial color="#FFE0B2" roughness={0.9} transparent opacity={0.8} /></mesh>
                <pointLight position={[0, 1.0, 0]} intensity={0.5} distance={3} color="#FFE0B2" decay={2} />
            </group>
            {/* Kitchen */}
            <KitchenCounter x={-3.0} z={-3.5} w={1.5} d={0.8} />
            <KitchenCounter x={-1.0} z={-3.5} w={1.5} d={0.8} />
            <mesh position={[-3.3, 1.5, -0.5]}><boxGeometry args={[0.9, 3.0, 0.85]} /><meshStandardMaterial color="#ECEFF1" metalness={0.3} roughness={0.2} /></mesh>
            <mesh position={[-3.3, 2.2, -0.06]}><boxGeometry args={[0.7, 0.03, 0.03]} /><meshStandardMaterial color="#90A4AE" metalness={0.6} roughness={0.2} /></mesh>
            <mesh position={[-3.3, 0.8, -0.06]}><boxGeometry args={[0.7, 0.03, 0.03]} /><meshStandardMaterial color="#90A4AE" metalness={0.6} roughness={0.2} /></mesh>
            <mesh position={[-2.0, 1.3, -3.55]}><boxGeometry args={[3.5, 0.8, 0.04]} /><meshStandardMaterial color="#FFECB3" roughness={0.3} /></mesh>
            <mesh position={[-2.0, 2.5, -3.6]}><boxGeometry args={[3.0, 0.04, 0.25]} /><meshStandardMaterial color="#5D4037" roughness={0.6} /></mesh>
            {/* Bedroom */}
            <Bed x={2.5} z={-2.5} rot={0} />
            <group position={[1.2, 0, -2.5]}>
                <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color="#5D4037" roughness={0.7} /></mesh>
                <mesh position={[0, 0.52, 0]}><boxGeometry args={[0.55, 0.04, 0.55]} /><meshStandardMaterial color="#6D4C41" roughness={0.6} /></mesh>
            </group>
            {/* Lighting */}
            <pointLight ref={interiorLightRef} position={[0, 5.2, 0]} intensity={3.5} distance={14} color="#FFD54F" decay={2} />
            <pointLight position={[2.5, 4.5, -2.5]} intensity={1.5} distance={6} color="#FFE0B2" decay={2} />
            <pointLight position={[-2, 4.8, -3]} intensity={1.0} distance={5} color="#FFF8E1" decay={2} />
            <pointLight position={[0, 4.0, 5.5]} intensity={2.0} distance={8} color={nightMode ? "#FF8A65" : "#FFE0B2"} decay={2} />
            <pointLight position={[0, 2.0, 8.0]} intensity={0.8} distance={6} color={nightMode ? "#FF6E40" : "#FFF8E1"} decay={2} />
        </group>
    );
});

export const BarneyActor = ({ gameState, barneyRef, barneyTargetRef, playerPosRef, houseDoorOpen }: any) => {
    const meshRef = useRef<any>(null);
    const groupRef = useRef<any>(null);
    const lightRef = useRef<any>(null);
    const materialRef = useRef<any>(null);
    const timeRef = useRef(0);
    const scaleRef = useRef(0);
    const texture = useTexture(BARNEY_URL);
    
    useEffect(() => {
        if (texture) {
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            texture.anisotropy = 1;
            texture.needsUpdate = true;
        }
    }, [texture]);
    
    const isScary = gameState === 'chase' || gameState === 'indoor_night';
    const isVisible = gameState === 'barney_greet' || gameState === 'indoor_day' || gameState === 'indoor_night' || gameState === 'chase' || gameState === 'sleep_fade';

    useFrame((state, dt) => {
        if (!groupRef.current || !meshRef.current) return;
        timeRef.current += dt;
        
        const b = barneyRef.current;
        const p = playerPosRef.current;
        const target = barneyTargetRef?.current || { x: b.x, z: b.z, scale: 1 };
        
        if (gameState === 'chase' && p) {
            const dx = p.x - b.x, dz = p.z - b.z;
            const d = Math.sqrt(dx*dx + dz*dz);
            if (d > 0.01) {
                const spd = 3.3 * dt;
                b.x += (dx/d) * spd;
                b.z += (dz/d) * spd;
            }
        } else {
            b.x = THREE.MathUtils.lerp(b.x, target.x, Math.min(1, dt * 2.5));
            b.z = THREE.MathUtils.lerp(b.z, target.z, Math.min(1, dt * 2.5));
        }
        
        // When not visible, force target scale to 0 so the actor fades out
        // instead of lingering at its last scale.
        const targetScale = isVisible ? (target.scale !== undefined ? target.scale : 1) : 0;
        scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, Math.min(1, dt * (isVisible ? 3 : 5)));
        groupRef.current.position.set(b.x, 0, b.z);
        
        const isActive = gameState === 'chase';
        const bobSpeed = isActive ? 8 : 2.2;
        const bobAmp = isActive ? 0.15 : 0.1;
        const swaySpeed = isActive ? 4 : 1.5;
        const swayAmp = isActive ? 0.08 : 0.05;
        
        const bob = Math.abs(Math.sin(timeRef.current * bobSpeed)) * bobAmp;
        const sway = Math.sin(timeRef.current * swaySpeed) * swayAmp;
        const tilt = Math.sin(timeRef.current * swaySpeed * 1.3) * 0.04;
        
        meshRef.current.position.set(sway, 0.935 + bob, 0);
        meshRef.current.rotation.z = tilt;
        
        let breathe;
        if (isActive) {
            breathe = 1 + Math.sin(timeRef.current * 8) * 0.08;
        } else {
            breathe = 1 + Math.sin(timeRef.current * 2.5) * 0.04;
        }
        const effectiveScale = isVisible ? scaleRef.current : THREE.MathUtils.lerp(scaleRef.current, 0, Math.min(1, dt * 5));
        scaleRef.current = effectiveScale;
        const finalScale = 2.4 * effectiveScale * breathe;
        meshRef.current.scale.set(finalScale, finalScale, finalScale);
        
        const cx = state.camera.position.x;
        const cz = state.camera.position.z;
        const fdx = cx - b.x, fdz = cz - b.z;
        groupRef.current.rotation.y = Math.atan2(fdx, fdz);
        
        if (lightRef.current) {
            lightRef.current.position.set(b.x, 1.5, b.z);
            lightRef.current.visible = isScary;
        }
    });
    
    if (!isVisible && scaleRef.current < 0.01) return null;
    
    return (
        <>
            <group ref={groupRef}>
                <mesh ref={meshRef}>
                    <planeGeometry args={[1.5, 2.0]} />
                    <meshBasicMaterial 
                        map={texture} 
                        transparent={true} 
                        alphaTest={0.05}
                        side={THREE.DoubleSide} 
                        toneMapped={false}
                        color={isScary ? "#A86090" : "#ffffff"}
                        depthWrite={false}
                    />
                </mesh>
            </group>
            <pointLight ref={lightRef} intensity={1.8} distance={6} color="#FF1744" decay={2} />
        </>
    );
};

// Tree positions extracted to module scope to avoid re-allocation on every render.
const TREE_COORDS: [number, number, number][] = [
    [13.06,0.55,0.91],[13.76,6.49,1.07],[-6.17,13.14,0.81],[-12.22,8.61,1.02],[-14.72,1.24,1.12],
    [-14.34,-5.65,1.08],[-7.28,-11.33,1.18],[13.59,-7.29,1.09],[19.92,0.29,1.09],[17.85,7.83,1.21],
    [11.2,15.02,1.25],[9.61,14.85,1.04],[2.96,17.45,0.95],[-5.66,18.04,1.08],[-11.8,13.1,1.03],
    [-18.5,4.1,1.2],[-19.02,2.52,0.98],[-18.8,-6.74,1.22],[-13.16,-13.78,1.32],[16.11,-11.22,1.06],
    [17.2,-5.9,1.36],[21.66,-0.45,1.15],[19.21,9.99,1.35],[10.05,19.57,1.13],[-0.54,22.27,1.05],
    [0.04,21.27,1.38],[-16.11,15.06,1.04],[-20.52,11.43,1.32],[-22.51,-5.4,1.01],[-19.25,-12.04,1.32],
    [-16.05,-15.91,1.07],[-5.63,-21.41,1.57],[8.68,-19.84,1.3],[11.42,-20.29,1.52],[19.27,-11.8,1.37],
    [-12.5,20.34,1.07],[10.03,18.71,0.8],[-6.33,15.14,1.26],[13.63,20.82,0.95],[-15.91,21.15,1.27],
    [-13.26,-20.06,0.93],[8.34,-18.94,0.95],[-0.79,-19.8,1.01],
];

const FENCE_DATA: [number, number, number, number, number][] = [
    [-6,5,-6,15],[6,5,6,15],[-6,15,6,15],[-6,5,-4.5,5],[4.5,5,6,5],
] as any;

export const FlatMapEnvironment = React.memo(({ houseDoorOpen, nightMode, doorOpenAmount }: any) => {
    const bgColor = nightMode ? '#05051a' : '#87CEEB';
    const fogColor = nightMode ? '#05051a' : '#C8E6F0';
    const skyColor = nightMode ? '#05051a' : COLORS.sky;
    const grassTint = nightMode ? '#1a2a1a' : COLORS.grass;
    return (
    <group>
        <color attach="background" args={[bgColor]} />
        <fog attach="fog" args={[fogColor, nightMode ? 8 : 25, nightMode ? 22 : 60]} />
        <ambientLight intensity={nightMode ? 0.07 : 0.5} color={nightMode ? '#1a1a40' : '#E3F2FD'} />
        <hemisphereLight intensity={nightMode ? 0.04 : 0.4} color={nightMode ? '#0a0a30' : '#87CEEB'} groundColor={nightMode ? '#000000' : '#4CAF50'} />
        <mesh position={[0, 24, 0]}><boxGeometry args={[60, 60, 60]} /><meshBasicMaterial color={skyColor} side={THREE.BackSide} /></mesh>
        {!nightMode && <>
            <mesh position={[-20, 30, -20]}><sphereGeometry args={[4, 32, 32]} /><meshBasicMaterial color="#FFD700" /></mesh>
            <pointLight position={[-20, 30, -20]} intensity={0.5} distance={80} color="#FFF9C4" />
        </>}
        {nightMode && <>
            <mesh position={[12, 26, -18]}><sphereGeometry args={[1.8, 16, 16]} /><meshBasicMaterial color="#E8E8D8" /></mesh>
            <pointLight position={[12, 26, -18]} intensity={0.3} distance={100} color="#7070a0" />
        </>}
        <directionalLight position={nightMode ? [12, 26, -18] : [-20, 30, -20]} intensity={nightMode ? 0.08 : 1.8} />
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0, 0]}><planeGeometry args={[50, 50]} /><TextureMaterial url={ASSETS.grass} color={grassTint} repeat={[12, 12]} roughness={0.8} /></mesh>
        <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.015, -2]}><planeGeometry args={[2.5, 14]} /><meshStandardMaterial color={nightMode ? '#555' : '#9E9E9E'} roughness={0.9} /></mesh>
        <House x={0} z={10} rot={Math.PI} doorOpen={houseDoorOpen} doorOpenAmount={doorOpenAmount} nightMode={nightMode} />
        <group position={[0, 0, -10]}>
            <ElevatorFacade z={0} height={5} width={10} />
            <mesh position={[0, 2.5, -6.5]}><boxGeometry args={[11, 5, 1]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
            <mesh position={[-5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
            <mesh position={[5, 2.5, -3.25]}><boxGeometry args={[1, 5, 7.5]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
            <mesh position={[0, 5.25, -3.25]}><boxGeometry args={[11, 0.5, 7.5]} /><meshStandardMaterial color={COLORS.wall} /></mesh>
        </group>
        <Instances limit={50} range={50}>
            <cylinderGeometry args={[0.15, 0.2, 3, 6]} />
            <meshStandardMaterial color="#5D4037" roughness={0.9} />
            {TREE_COORDS.map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 1.5*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        <Instances limit={50} range={50}>
            <coneGeometry args={[1.2, 2, 6]} />
            <meshStandardMaterial color="#2E7D32" roughness={0.85} />
            {TREE_COORDS.map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 3.5*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        <Instances limit={50} range={50}>
            <coneGeometry args={[0.9, 1.6, 6]} />
            <meshStandardMaterial color="#388E3C" roughness={0.85} />
            {TREE_COORDS.map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 4.3*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        <Instances limit={50} range={50}>
            <coneGeometry args={[0.6, 1.2, 6]} />
            <meshStandardMaterial color="#43A047" roughness={0.85} />
            {TREE_COORDS.map(([tx,tz,s],i) => (
                <Instance key={i} position={[tx, 4.9*s, tz]} scale={[s,s,s]} />
            ))}
        </Instances>
        {!nightMode && [[-15,22,10,3],[10,25,-5,4],[20,23,15,2.5],[-5,24,-15,3.5],[0,26,20,2]].map(([cx,cy,cz,cr],i) => (
            <mesh key={i} position={[cx,cy,cz]}><sphereGeometry args={[cr, 8, 8]} /><meshBasicMaterial color="#FFFFFF" transparent opacity={0.7} /></mesh>
        ))}
        {FENCE_DATA.map(([x1,z1,x2,z2],i) => {
            const dx=x2-x1, dz=z2-z1, len=Math.sqrt(dx*dx+dz*dz), ang=Math.atan2(dx,dz);
            return (<group key={i}>
                <mesh position={[(x1+x2)/2, 0.4, (z1+z2)/2]} rotation={[0,ang,0]}><boxGeometry args={[0.04, 0.04, len]} /><meshStandardMaterial color="#8D6E63" roughness={0.8} /></mesh>
                <mesh position={[(x1+x2)/2, 0.7, (z1+z2)/2]} rotation={[0,ang,0]}><boxGeometry args={[0.04, 0.04, len]} /><meshStandardMaterial color="#8D6E63" roughness={0.8} /></mesh>
            </group>);
        })}
    </group>
    );
});
