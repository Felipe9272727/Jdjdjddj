import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, useGLTF, useAnimations, Html } from '@react-three/drei';
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

        {/* Balconista — Roblox-style placeholder. Stands behind the desk,
            facing the player (the desk's front is +Z local), wiping the
            counter top in a slow loop. SWAP TO GLB: replace this <Cashier/>
            with <primitive object={glbScene} scale=... position=... /> and
            remove the procedural arm-wipe useFrame — the GLB ships its own
            cleaning animation. */}
        <Cashier position={[0, 0.5, -1.5]} />
    </group>
));

// ─── Balconista (Cashier) — Mixamo-rigged FBX with cleaning loop ─────────
// Mixamo's FBX scale varies (sometimes cm, sometimes m, sometimes a custom
// armature unit). We don't trust the source scale — instead, on mount we
// measure the model's bounding box and normalize so the body is exactly
// CASHIER_HEIGHT_M tall, then offset Y so the lowest vertex sits on y=0.
// Console logs the measured size/scale so we can verify the placement.

const Cashier = React.memo(({ position }: { position: [number, number, number] }) => {
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
        <group ref={groupRef} position={position} scale={[2, 2, 2]}>
            <primitive object={gltf.scene} rotation={[0, Math.PI, 0]} />
        </group>
    );
});

// ─── DEBUG: Cashier Model Inspector (TEMPORARY — remove after debugging) ──
export const CashierDebug = React.memo(() => {
    const gltf = useGLTF(CASHIER_GLB_URL);
    const scene = gltf.scene;
    const nodes: any[] = [];
    scene.traverse((child: any) => {
        nodes.push({
            name: child.name || '(root)',
            type: child.type,
            isMesh: child.isMesh,
            isBone: child.isBone,
            rot: [child.rotation.x.toFixed(3), child.rotation.y.toFixed(3), child.rotation.z.toFixed(3)],
            pos: [child.position.x.toFixed(3), child.position.y.toFixed(3), child.position.z.toFixed(3)],
            scale: [child.scale.x.toFixed(3), child.scale.y.toFixed(3), child.scale.z.toFixed(3)],
        });
    });
    return (
        <group position={[0, 3, 0]}>
            <Html center style={{ pointerEvents: 'none', width: '320px' }}>
                <div style={{ background: 'rgba(0,0,0,0.9)', color: '#0f0', fontFamily: 'monospace', fontSize: '10px', padding: '8px', borderRadius: '6px', lineHeight: '1.4', maxHeight: '400px', overflow: 'auto' }}>
                    <div style={{ color: '#ff0', fontWeight: 'bold', marginBottom: '4px' }}>🔍 CASHIER DEBUG</div>
                    <div>URL: {CASHIER_GLB_URL.split('/').pop()}</div>
                    <div>Animations: {gltf.animations.length} ({gltf.animations.map((a: any) => a.name).join(', ')})</div>
                    <div>Scene rot: [{scene.rotation.x.toFixed(3)}, {scene.rotation.y.toFixed(3)}, {scene.rotation.z.toFixed(3)}]</div>
                    <div>Scene pos: [{scene.position.x.toFixed(3)}, {scene.position.y.toFixed(3)}, {scene.position.z.toFixed(3)}]</div>
                    <hr style={{ borderColor: '#333', margin: '4px 0' }} />
                    {nodes.filter(n => n.isMesh || n.isBone).map((n, i) => (
                        <div key={i} style={{ color: n.isBone ? '#0af' : '#0f0' }}>
                            {n.isBone ? '🦴' : '📦'} {n.name} rot:[{n.rot.join(',')}] pos:[{n.pos.join(',')}]
                        </div>
                    ))}
                </div>
            </Html>
        </group>
    );
});
