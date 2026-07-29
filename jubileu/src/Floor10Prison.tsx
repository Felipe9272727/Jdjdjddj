import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PRISON_DEVICES, PRISON_REACH, f10prison } from './npc/f10Prison';

// ── OS APARELHOS DA PRISÃO ────────────────────────────────────────────────
// A parte visível do campo de provas. Duas placas de um lado da sala, duas
// alavancas do outro — longe o suficiente para nenhuma pessoa alcançar as duas
// de uma tranca. É a geometria que obriga a dupla, e ela precisa ser LEGÍVEL:
// quem entra na sala tem que perceber, sem texto, que aquilo pede duas pessoas.
//
// Nada aqui explica a regra. O feedback é físico: a placa afunda e acende
// quando alguém está em cima, e a tranca ZUMBE (um anel que cresce) enquanto os
// dois estão acionados. O zumbido é a única pista honesta que existe no andar,
// para o jogador e para o Nilo.

const FRIO = new THREE.Color('#4a5568');
const ACESO = new THREE.Color('#7fc7ff');
const ABERTO = new THREE.Color('#9fd3a0');

/** Uma placa de piso: afunda com peso em cima. */
const Placa: React.FC<{ id: string; x: number; z: number }> = ({ id, x, z }) => {
    const mesh = useRef<THREE.Mesh>(null);
    const mat = useRef<THREE.MeshStandardMaterial>(null);

    useFrame((_, dt) => {
        const d = f10prison.devices[id];
        if (!d || !mesh.current || !mat.current) return;
        const acionado = d.heldByNpc || d.heldByPlayer;
        const alvoY = acionado ? 0.03 : 0.11;
        mesh.current.position.y += (alvoY - mesh.current.position.y) * Math.min(1, dt * 9);
        const cor = f10prison.doorOpen ? ABERTO : (acionado ? ACESO : FRIO);
        mat.current.color.lerp(cor, Math.min(1, dt * 6));
        mat.current.emissiveIntensity = acionado ? 0.9 : 0.12;
        mat.current.emissive.copy(cor);
    });

    return (
        <group position={[x, 0, z]}>
            {/* moldura no chão, para a placa não parecer flutuando */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
                <ringGeometry args={[PRISON_REACH * 0.95, PRISON_REACH * 1.15, 32]} />
                <meshStandardMaterial color="#2f3540" roughness={0.9} />
            </mesh>
            <mesh ref={mesh} position={[0, 0.11, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[PRISON_REACH * 0.9, PRISON_REACH * 0.95, 0.14, 24]} />
                <meshStandardMaterial
                    ref={mat}
                    color={FRIO}
                    emissive={FRIO}
                    emissiveIntensity={0.12}
                    roughness={0.55}
                    metalness={0.25}
                />
            </mesh>
        </group>
    );
};

/** Uma alavanca: inclina quando alguém a segura. */
const Alavanca: React.FC<{ id: string; x: number; z: number }> = ({ id, x, z }) => {
    const braco = useRef<THREE.Group>(null);
    const mat = useRef<THREE.MeshStandardMaterial>(null);

    useFrame((_, dt) => {
        const d = f10prison.devices[id];
        if (!d || !braco.current || !mat.current) return;
        const acionado = d.heldByNpc || d.heldByPlayer;
        const alvo = acionado ? -0.7 : 0.35;
        braco.current.rotation.x += (alvo - braco.current.rotation.x) * Math.min(1, dt * 7);
        const cor = f10prison.doorOpen ? ABERTO : (acionado ? ACESO : FRIO);
        mat.current.color.lerp(cor, Math.min(1, dt * 6));
        mat.current.emissive.copy(cor);
        mat.current.emissiveIntensity = acionado ? 1 : 0.15;
    });

    return (
        <group position={[x, 0, z]}>
            <mesh position={[0, 0.35, 0]} castShadow>
                <boxGeometry args={[0.5, 0.7, 0.5]} />
                <meshStandardMaterial color="#39404c" roughness={0.85} metalness={0.3} />
            </mesh>
            <group ref={braco} position={[0, 0.72, 0]} rotation={[0.35, 0, 0]}>
                <mesh position={[0, 0.35, 0]} castShadow>
                    <cylinderGeometry args={[0.06, 0.06, 0.7, 12]} />
                    <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
                </mesh>
                <mesh position={[0, 0.72, 0]} castShadow>
                    <sphereGeometry args={[0.14, 16, 16]} />
                    <meshStandardMaterial
                        ref={mat}
                        color={FRIO}
                        emissive={FRIO}
                        emissiveIntensity={0.15}
                        roughness={0.35}
                        metalness={0.4}
                    />
                </mesh>
            </group>
        </group>
    );
};

/**
 * O ZUMBIDO da tranca: um anel que cresce entre os dois aparelhos enquanto
 * ambos estão acionados. É a ÚNICA pista da regra, e é honesta — ela só
 * aparece quando alguém não está sozinho, e some quando um dos dois sai.
 */
const Zumbido: React.FC<{ lockIndex: number }> = ({ lockIndex }) => {
    const anel = useRef<THREE.Mesh>(null);
    const mat = useRef<THREE.MeshBasicMaterial>(null);

    useFrame(({ clock }, dt) => {
        const lock = f10prison.locks[lockIndex];
        if (!lock || !anel.current || !mat.current) return;
        const fracao = lock.solved ? 1 : lock.progress / lock.holdSeconds;
        const alvo = fracao > 0 ? 0.7 + fracao * 2.6 : 0;
        anel.current.scale.x += (alvo - anel.current.scale.x) * Math.min(1, dt * 8);
        anel.current.scale.y = anel.current.scale.x;
        mat.current.opacity = fracao > 0
            ? (lock.solved ? 0.5 : 0.28 + Math.sin(clock.elapsedTime * 9) * 0.14)
            : 0;
        mat.current.color.set(lock.solved ? '#9fd3a0' : '#7fc7ff');
    });

    const lock = f10prison.locks[lockIndex];
    const [a, b] = lock.devices.map((id) => f10prison.devices[id]);
    return (
        <mesh
            ref={anel}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[(a.x + b.x) / 2, 0.06, (a.z + b.z) / 2]}
            scale={[0, 0, 1]}
        >
            <ringGeometry args={[0.9, 1.05, 48]} />
            <meshBasicMaterial ref={mat} transparent opacity={0} depthWrite={false} />
        </mesh>
    );
};

const Floor10Prison: React.FC = () => (
    <group>
        {PRISON_DEVICES.map((d) => (d.kind === 'plate'
            ? <Placa key={d.id} id={d.id} x={d.x} z={d.z} />
            : <Alavanca key={d.id} id={d.id} x={d.x} z={d.z} />))}
        {f10prison.locks.map((_, i) => <Zumbido key={i} lockIndex={i} />)}
    </group>
);

// Sonda: a sala viva, para o teste headless poder cobrar o que aconteceu.
(window as unknown as Record<string, unknown>).__f10prisao = f10prison;

export default Floor10Prison;
