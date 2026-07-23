import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { npc, npcSet } from './npc/npcStore';

// ── O CORPO DO NPC (procedural, v1) ────────────────────────────────────────
// Um hóspede humanoide de pé na base do Andar 10. Por enquanto o corpo é
// procedural (o Felipe pediu "inicialmente pode ser procedural"); o CÉREBRO é o
// LLM (npc/llmEngine). Ele respira, encara o player, e quando está "falando"
// (streaming da resposta) a cabeça balança de leve. Detecta proximidade e
// escreve npc.near — a UI de conversa (overlay DOM) reage a isso.
// Movimento por IA (andar pelo cenário) fica pra fase 3.

const NPC_POS = new THREE.Vector3(0, 0, 2.2);   // em frente ao walk-in do elevador
const NEAR_DIST = 2.8;

const SKIN = '#c9986f';
const SHIRT = '#3b4a6b';
const PANTS = '#2a2d34';
const HAIR = '#2b2119';

const Floor10Npc: React.FC<{ playerPositionRef?: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const root = useRef<THREE.Group>(null);
    const torso = useRef<THREE.Group>(null);
    const head = useRef<THREE.Group>(null);
    const armL = useRef<THREE.Group>(null);
    const armR = useRef<THREE.Group>(null);
    const nearRef = useRef(false);
    const tmp = useMemo(() => new THREE.Vector3(), []);

    useFrame(({ clock }, dt) => {
        const t = clock.elapsedTime;
        // respiração + leve balanço
        if (torso.current) {
            torso.current.scale.y = 1 + Math.sin(t * 1.6) * 0.02;
            torso.current.rotation.z = Math.sin(t * 0.5) * 0.02;
        }
        if (armL.current) armL.current.rotation.x = Math.sin(t * 0.8) * 0.06;
        if (armR.current) armR.current.rotation.x = Math.sin(t * 0.8 + Math.PI) * 0.06;

        // encara o player + proximidade
        const pp = playerPositionRef?.current;
        if (pp && root.current) {
            tmp.copy(pp).sub(NPC_POS); tmp.y = 0;
            const dist = tmp.length();
            const near = dist < NEAR_DIST;
            if (near !== nearRef.current) { nearRef.current = near; npcSet({ near }); }
            // o tronco vira devagar pro player; a cabeça acompanha mais rápido
            const yaw = Math.atan2(tmp.x, tmp.z);
            if (root.current) {
                let d = yaw - root.current.rotation.y;
                while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
                root.current.rotation.y += d * Math.min(1, dt * 3);
            }
        }
        // "fala": cabeça balança enquanto o NPC responde
        if (head.current) {
            const talk = npc.speaking ? Math.sin(t * 9) * 0.05 + Math.sin(t * 13) * 0.03 : 0;
            head.current.rotation.x = talk;
            head.current.position.y = 1.52 + (npc.speaking ? Math.abs(Math.sin(t * 7)) * 0.01 : 0);
        }
    });

    return (
        <group ref={root} position={[NPC_POS.x, 0, NPC_POS.z]}>
            {/* pernas */}
            <mesh position={[-0.11, 0.42, 0]}><capsuleGeometry args={[0.1, 0.62, 4, 8]} /><meshStandardMaterial color={PANTS} roughness={0.9} /></mesh>
            <mesh position={[0.11, 0.42, 0]}><capsuleGeometry args={[0.1, 0.62, 4, 8]} /><meshStandardMaterial color={PANTS} roughness={0.9} /></mesh>
            {/* tronco */}
            <group ref={torso} position={[0, 0.82, 0]}>
                <mesh position={[0, 0.22, 0]}><capsuleGeometry args={[0.22, 0.42, 6, 12]} /><meshStandardMaterial color={SHIRT} roughness={0.85} /></mesh>
                {/* braços */}
                <group ref={armL} position={[-0.26, 0.36, 0]}>
                    <mesh position={[0, -0.24, 0]}><capsuleGeometry args={[0.07, 0.44, 4, 8]} /><meshStandardMaterial color={SHIRT} roughness={0.85} /></mesh>
                    <mesh position={[0, -0.5, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
                </group>
                <group ref={armR} position={[0.26, 0.36, 0]}>
                    <mesh position={[0, -0.24, 0]}><capsuleGeometry args={[0.07, 0.44, 4, 8]} /><meshStandardMaterial color={SHIRT} roughness={0.85} /></mesh>
                    <mesh position={[0, -0.5, 0]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
                </group>
            </group>
            {/* cabeça */}
            <group ref={head} position={[0, 1.52, 0]}>
                <mesh><sphereGeometry args={[0.17, 20, 20]} /><meshStandardMaterial color={SKIN} roughness={0.65} /></mesh>
                {/* cabelo */}
                <mesh position={[0, 0.06, -0.02]}><sphereGeometry args={[0.178, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.62]} /><meshStandardMaterial color={HAIR} roughness={0.9} /></mesh>
                {/* olhos */}
                <mesh position={[-0.06, 0.01, 0.15]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#141414" /></mesh>
                <mesh position={[0.06, 0.01, 0.15]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#141414" /></mesh>
            </group>
            {/* luzinha suave pra destacar o NPC na base cinza */}
            <pointLight position={[0, 1.7, 0.5]} intensity={0.5} distance={4} color="#ffe6c0" />
        </group>
    );
};

export default Floor10Npc;
