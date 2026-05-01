import React, { useRef, useEffect } from 'react';
import { Text, useGLTF, useAnimations } from '@react-three/drei';
import { TextureMaterial } from './Materials';
import { ASSETS, COLORS } from './constants';
import * as THREE from 'three';

// Cashier — Mixamo-rigged GLB (converted from Button Pushing.fbx).
// The model is roughly humanoid scale (~1.7 units tall) so it sits naturally
// behind the reception desk without rescaling.
const CASHIER_GLB_URL = "https://raw.githubusercontent.com/Felipe9272727/Jdjdjddj/main/button_pushing.glb";
useGLTF.preload(CASHIER_GLB_URL);

export const Door = React.memo(({ x, z, rot }: any) => (
    <group position={[x, 1.1, z]} rotation={[0, rot, 0]}>
      <mesh><boxGeometry args={[1.4, 2.2, 0.1]} /><meshStandardMaterial color="#E0E0E0" roughness={0.4} /></mesh>
      <mesh position={[0, 0, 0]}><boxGeometry args={[1.5, 2.3, 0.05]} /><meshStandardMaterial color="#9E9E9E" roughness={0.5} /></mesh>
      <mesh position={[0.6, 0, 0.08]}><sphereGeometry args={[0.05, 8, 8]} /><meshStandardMaterial color="#FFD54F" metalness={0.4} roughness={0.2} /></mesh>
    </group>
));

export const WallPanel = React.memo(({ x, z, rot }: any) => (
    <group position={[x, 2.2, z]} rotation={[0, rot, 0]}>
      <mesh><boxGeometry args={[2, 1.2, 0.05]} /><meshStandardMaterial color="#212121" roughness={0.2} /></mesh>
      <mesh position={[0, 0, 0.03]}><boxGeometry args={[1.8, 1.0, 0.01]} /><meshBasicMaterial color="#000000" /></mesh>
      <Text position={[0, 0, 0.04]} fontSize={0.2} color="#00FF00" anchorX="center" anchorY="middle">3</Text>
    </group>
));

export const CallPanel = React.memo(({ x, z, rot }: any) => (
    <group position={[x, 1.5, z]} rotation={[0, rot, 0]}>
        <mesh><boxGeometry args={[0.45, 0.75, 0.05]} /><meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.3} /></mesh>
        <mesh position={[0, 0, 0.026]}><boxGeometry args={[0.38, 0.68, 0.01]} /><meshStandardMaterial color={COLORS.elevPanel} metalness={0.4} roughness={0.35} /></mesh>
        <mesh position={[0, 0.15, 0.035]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, 0.02, 16]} /><meshStandardMaterial color="#FFD54F" emissive="#FFD54F" emissiveIntensity={0.8} toneMapped={false} /></mesh>
        <mesh position={[0, -0.05, 0.035]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, 0.02, 16]} /><meshStandardMaterial color="#424242" metalness={0.6} roughness={0.3} /></mesh>
        <mesh position={[0, -0.22, 0.035]}><planeGeometry args={[0.3, 0.15]} /><meshBasicMaterial color="#000000" /></mesh>
        <Text position={[0, -0.22, 0.04]} fontSize={0.09} color="#FF3333" anchorX="center" anchorY="middle">▲ 01</Text>
        <Text position={[0, 0.15, 0.05]} fontSize={0.08} color="#1a1a1a" anchorX="center" anchorY="middle">▲</Text>
    </group>
));

export const CeilingLight = React.memo(({ x, z }: any) => (
    <mesh position={[x, 4.45, z]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 3]} />
        <meshBasicMaterial color="#FFF9C4" toneMapped={false} />
    </mesh>
));

export const Armchair = React.memo(({ x, z, rot = 0, color = "#5D4037" }: any) => (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
        <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[1.1, 0.7, 0.9]} /><meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.9, -0.35]}>
            <boxGeometry args={[1.1, 0.9, 0.2]} /><meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.72, 0.05]}>
            <boxGeometry args={[0.95, 0.12, 0.75]} /><meshStandardMaterial color="#8D6E63" roughness={0.95} />
        </mesh>
        <mesh position={[-0.55, 0.55, -0.05]}><boxGeometry args={[0.12, 0.5, 0.85]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
        <mesh position={[0.55, 0.55, -0.05]}><boxGeometry args={[0.12, 0.5, 0.85]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
    </group>
));

export const TallPlant = React.memo(({ x, z, variant = 0 }: any) => {
    const leafColor = ["#2E7D32", "#388E3C", "#43A047"][variant % 3];
    const accentColor = ["#66BB6A", "#4CAF50", "#81C784"][variant % 3];
    return (
        <group position={[x, 0, z]}>
            <mesh position={[0, 0.25, 0]}>
                <cylinderGeometry args={[0.32, 0.24, 0.5, 10]} />
                <meshStandardMaterial color="#EFEBE9" roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.1, 0]}>
                <sphereGeometry args={[0.5, 10, 8]} /><meshStandardMaterial color={leafColor} roughness={0.9} />
            </mesh>
            <mesh position={[0.15, 1.5, 0.1]}>
                <sphereGeometry args={[0.3, 10, 8]} /><meshStandardMaterial color={accentColor} roughness={0.9} />
            </mesh>
            <mesh position={[-0.15, 1.45, -0.12]}>
                <sphereGeometry args={[0.28, 10, 8]} /><meshStandardMaterial color={leafColor} roughness={0.9} />
            </mesh>
        </group>
    );
});

export const FloorLamp = React.memo(({ x, z }: any) => (
    <group position={[x, 0, z]}>
        <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.22, 0.28, 0.1, 10]} />
            <meshStandardMaterial color="#212121" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.9, 6]} />
            <meshStandardMaterial color="#424242" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 2.0, 0]}>
            <coneGeometry args={[0.35, 0.5, 12, 1, true]} />
            <meshBasicMaterial color="#FFE0B2" side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
    </group>
));

export const ReceptionDesk = React.memo(({ x, z, rot = 0 }: any) => (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
        <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[3.5, 1.2, 0.7]} />
            <meshStandardMaterial color="#4E342E" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.22, 0.05]}>
            <boxGeometry args={[3.7, 0.06, 0.85]} />
            <meshStandardMaterial color="#F5F0EB" roughness={0.2} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.6, 0.36]}>
            <boxGeometry args={[3.3, 1.0, 0.04]} />
            <meshStandardMaterial color="#6D4C41" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.15, 0.38]}>
            <boxGeometry args={[3.4, 0.03, 0.02]} />
            <meshStandardMaterial color="#FFD54F" metalness={0.8} roughness={0.2} />
        </mesh>
        {[[-1.65, 0.4], [1.65, 0.4], [-1.65, -0.3], [1.65, -0.3]].map((p, i) => (
            <mesh key={i} position={[p[0], 0.05, p[1]]}>
                <boxGeometry args={[0.18, 0.1, 0.18]} />
                <meshStandardMaterial color="#3E2723" roughness={0.7} />
            </mesh>
        ))}
        <group position={[1.3, 1.25, 0]}>
            <mesh><cylinderGeometry args={[0.12, 0.15, 0.06, 12]} /><meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.3} /></mesh>
            <mesh position={[0, 0.25, 0]}><cylinderGeometry args={[0.025, 0.025, 0.5, 8]} /><meshStandardMaterial color="#212121" metalness={0.8} roughness={0.3} /></mesh>
            <mesh position={[0.18, 0.5, 0]} rotation={[0, 0, -0.7]}>
                <coneGeometry args={[0.18, 0.28, 12, 1, true]} />
                <meshStandardMaterial color="#FFD54F" side={THREE.DoubleSide} emissive="#FFB300" emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
        </group>
        <pointLight position={[1.3, 1.5, 0]} intensity={0.4} distance={3} color="#FFE0B2" decay={2} />
        <mesh position={[-1.2, 1.3, 0]}>
            <sphereGeometry args={[0.1, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#FFC107" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0.3, 1.26, 0.1]}>
            <boxGeometry args={[0.22, 0.025, 0.3]} />
            <meshStandardMaterial color="#FAFAFA" roughness={0.9} />
        </mesh>
        {/* Computer monitor — emissive screen draws the eye */}
        <group position={[-0.4, 1.27, 0.1]}>
            <mesh position={[0, 0.18, 0]}>
                <boxGeometry args={[0.45, 0.3, 0.04]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.18, 0.025]}>
                <boxGeometry args={[0.4, 0.25, 0.005]} />
                <meshBasicMaterial color="#1565C0" toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
                <boxGeometry args={[0.12, 0.04, 0.1]} />
                <meshStandardMaterial color="#212121" />
            </mesh>
        </group>
        {/* Potted plant on the right edge */}
        <group position={[1.55, 1.26, 0]}>
            <mesh position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.1, 0.08, 0.16, 10]} />
                <meshStandardMaterial color="#5D4037" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.32, 0]}>
                <sphereGeometry args={[0.18, 10, 8]} />
                <meshStandardMaterial color="#2E7D32" roughness={0.9} />
            </mesh>
            <mesh position={[0.06, 0.45, 0.04]}>
                <sphereGeometry args={[0.1, 8, 8]} />
                <meshStandardMaterial color="#43A047" roughness={0.9} />
            </mesh>
        </group>

        {/* Cashier was here — moved outside desk group for proper world-space positioning */}
    </group>
));

// ─── Balconista (Cashier) — Mixamo-rigged GLB with button-pushing animation ──
// Mixamo models have baked rotations (Hips -90°X, mesh node +90°X) that we
// MUST preserve — they convert Mixamo's Y-up to Three.js conventions.
// Position: feet sit on top of the stool seat. We use fixed values instead
// of `Box3.setFromObject` because the latter returns the UNSKINNED geometry
// bbox (rotated +π/2 X by the mesh node), which doesn't reflect where the
// SKINNED model actually renders. The skin matrices undo that rotation at
// draw time, so the visible model is upright with feet ~y=0 in local space.

const STOOL_HEIGHT = 0.08;
const SEAT_TOP_Y = STOOL_HEIGHT + 0.075; // top of stool seat (decorative cylinder)
const CASHIER_SCALE = 1.0;

export const Cashier = React.memo(({ position }: { position: [number, number, number] }) => {
    const gltf = useGLTF(CASHIER_GLB_URL);
    const groupRef = useRef<any>(null);
    const { actions, names } = useAnimations(gltf.animations, groupRef);

    useEffect(() => {
        const first = names[0];
        if (first && actions[first]) {
            actions[first].reset().fadeIn(0.4).play();
        }
    }, [actions, names]);

    return (
        <group
            ref={groupRef}
            position={[position[0], SEAT_TOP_Y, position[2]]}
            scale={CASHIER_SCALE}
            rotation={[0, -Math.PI / 2, 0]}
        >
            <primitive object={gltf.scene} />
        </group>
    );
});

// ─── Stool — standalone at y=0, always on the ground ──────────────────────
export const Stool = React.memo(({ x, z }: { x: number; z: number }) => (
    <group position={[x, 0, z]}>
        {/* Seat — thick wooden disc */}
        <mesh position={[0, STOOL_HEIGHT, 0]}>
            <cylinderGeometry args={[0.38, 0.38, 0.08, 16]} />
            <meshStandardMaterial color="#5D4037" roughness={0.8} />
        </mesh>
        <mesh position={[0, STOOL_HEIGHT + 0.05, 0]}>
            <cylinderGeometry args={[0.35, 0.35, 0.05, 16]} />
            <meshStandardMaterial color="#8D6E63" roughness={0.95} />
        </mesh>
        {/* 4 thick legs */}
        {[[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]].map((p, i) => (
            <mesh key={i} position={[p[0], STOOL_HEIGHT / 2, p[1]]}>
                <cylinderGeometry args={[0.035, 0.045, STOOL_HEIGHT, 8]} />
                <meshStandardMaterial color="#3E2723" roughness={0.6} metalness={0.2} />
            </mesh>
        ))}
        {/* Cross brace */}
        <mesh position={[0, STOOL_HEIGHT * 0.35, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[0.45, 0.03, 0.03]} />
            <meshStandardMaterial color="#4E342E" roughness={0.7} />
        </mesh>
        <mesh position={[0, STOOL_HEIGHT * 0.35, 0]} rotation={[0, -Math.PI / 4, 0]}>
            <boxGeometry args={[0.45, 0.03, 0.03]} />
            <meshStandardMaterial color="#4E342E" roughness={0.7} />
        </mesh>
    </group>
));


