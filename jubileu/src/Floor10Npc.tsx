import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    npc,
    npcAutonomousSay,
    npcPublishAutonomy,
    npcPublishPerception,
    npcSet,
} from './npc/npcStore';
import { perceiveFloor10 } from './npc/floor10Perception';
import {
    Floor10WillBrain,
    speedForWillGoal,
    stepFloor10Movement,
} from './npc/floor10Will';
import { deliberateFloor10 } from './npc/floor10SmallBrain';
import type { Floor10Deliberation } from './npc/floor10Deliberation';
import { cpuThreadCount } from './npc/wllamaEngine';

// ── O CORPO DO NPC (procedural, v1) ────────────────────────────────────────
// Um hóspede humanoide de pé na base do Andar 10. Por enquanto o corpo é
// procedural (o Felipe pediu "inicialmente pode ser procedural"); o CÉREBRO é o
// LLM (npc/llmEngine). Olhos, vontade e fala são módulos separados: os olhos
// publicam a percepção real, a Utility AI escolhe uma intenção e este corpo
// executa a navegação. O LLM só precisa acordar quando há conversa aberta.

const NPC_START = { x: 0, y: 0, z: 2.2 } as const;
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
    const legL = useRef<THREE.Group>(null);
    const legR = useRef<THREE.Group>(null);
    const eyeL = useRef<THREE.Mesh>(null);
    const eyeR = useRef<THREE.Mesh>(null);
    const nearRef = useRef(false);
    const tmp = useMemo(() => new THREE.Vector3(), []);
    const npcWorld = useMemo(() => new THREE.Vector3(), []);
    const forward = useMemo(() => new THREE.Vector3(), []);
    const worldQuaternion = useMemo(() => new THREE.Quaternion(), []);
    const lastPerceptionAt = useRef(-Infinity);
    const willBrain = useMemo(() => new Floor10WillBrain(), []);
    const consumedWillCommandId = useRef(0);
    const autonomousTalkUntil = useRef(0);
    // ── DELIBERAÇÃO ────────────────────────────────────────────────────────
    // O cérebro pequeno pensa por fora, sem pressa. Guardamos só a última
    // intenção pronta; o reflexo abaixo continua decidindo a cada quadro.
    const deliberation = useRef<Floor10Deliberation | null>(null);
    const nextDeliberationAt = useRef(6);
    const elevatorInspections = useRef(0);
    const lastGoalTrail = useRef<string[]>([]);
    const playerQuietSince = useRef(0);

    useFrame(({ clock }, dt) => {
        const t = clock.elapsedTime;
        const safeDt = Math.min(0.1, Math.max(0, dt));
        const pp = playerPositionRef?.current;
        const g = root.current;

        // Primeiro os olhos leem a transformação atual. A vontade nunca decide
        // usando uma posição inventada ou a coordenada de spawn.
        let livePerception = npc.perception;
        if (g && t - lastPerceptionAt.current >= 1 / 6) {
            g.getWorldPosition(npcWorld);
            g.getWorldQuaternion(worldQuaternion);
            forward.set(0, 0, 1).applyQuaternion(worldQuaternion);
            const worldYaw = Math.atan2(forward.x, forward.z);
            livePerception = perceiveFloor10({
                npcPosition: npcWorld,
                npcYaw: worldYaw,
                playerPosition: pp ?? null,
            });
            npcPublishPerception(livePerception);
            lastPerceptionAt.current = t;
        }

        // A micro-IA escolhe. O corpo executa o alvo, mas conversa aberta e
        // fala em andamento sempre vencem o movimento.
        let moving = false;
        let desiredYaw: number | null = null;
        if (g) {
            const languageCommand = npc.willCommand;
            if (languageCommand && languageCommand.id !== consumedWillCommandId.current) {
                willBrain.applyLanguageDecision(
                    languageCommand.action,
                    t,
                    languageCommand.reason,
                );
                consumedWillCommandId.current = languageCommand.id;
            }
            // Dispara uma deliberação quando a anterior já envelheceu. É async e
            // pode levar minutos no celular: NADA aqui espera por ela. Se o
            // cérebro pequeno não carregar, a promessa resolve null e o reflexo
            // segue sozinho, como sempre fez.
            // Só delibera com a conversa REALMENTE parada. Medido: com os dois
            // modelos juntos a geração do 3B cai de 10,9 para 0,3 tok/s (36x),
            // que era a resposta que nunca chegava.
            if (!npc.open && npc.phase !== 'thinking' && npc.phase !== 'loading'
                && t >= nextDeliberationAt.current) {
                nextDeliberationAt.current = t + 60;
                void deliberateFloor10({
                    perception: livePerception,
                    drives: npc.autonomy.drives,
                    memory: {
                        inspectedElevatorCount: elevatorInspections.current,
                        sleeps: 44,
                        playerSilentSeconds: Math.max(0, t - playerQuietSince.current),
                        lastGoals: lastGoalTrail.current.slice(-3) as never,
                        // Os dois cérebros conversando: o que o 3B prometeu ao
                        // jogador chega aqui e a deliberação honra a palavra.
                        agreedAction: npc.willCommand?.action ?? npc.autonomy.commitment ?? null,
                        agreedReason: npc.willCommand?.reason
                            ?? npc.autonomy.commitmentReason ?? null,
                    },
                    now: t,
                    // 4 threads: seguro porque a deliberação NUNCA roda junto com
                    // a conversa (é abortada ao abrir o painel). Sozinha, ela
                    // pode usar metade dos núcleos e concluir bem mais rápido.
                    threads: 4,
                }).then((decided) => {
                    if (decided) deliberation.current = decided;
                });
            }

            const will = willBrain.tick({
                dt: safeDt,
                time: t,
                perception: livePerception,
                npcPosition: g.position,
                conversationOpen: npc.open,
                speaking: npc.speaking,
                deliberation: deliberation.current,
            });
            npcPublishAutonomy(will.snapshot);
            if (will.snapshot.goal !== lastGoalTrail.current.at(-1)) {
                lastGoalTrail.current = [...lastGoalTrail.current.slice(-4), will.snapshot.goal];
                if (will.snapshot.goal === 'inspect-elevator') elevatorInspections.current += 1;
            }
            if (npc.open || npc.speaking) playerQuietSince.current = t;
            if (will.speech) {
                autonomousTalkUntil.current = t + 2.8;
                npcAutonomousSay(will.speech);
            }

            if (!npc.open && !npc.speaking && will.snapshot.target) {
                const step = stepFloor10Movement(
                    g.position,
                    will.snapshot.target,
                    speedForWillGoal(will.snapshot.goal),
                    safeDt,
                );
                g.position.x = step.x;
                g.position.z = step.z;
                moving = step.moving;
                if (moving) desiredYaw = step.yaw;
            }

            const shouldFacePlayer = pp && (
                npc.open
                || npc.speaking
                || will.snapshot.goal === 'talk-player'
                || will.snapshot.goal === 'observe-player'
                || will.snapshot.goal === 'follow-player'
            );
            if (!moving && shouldFacePlayer) {
                tmp.copy(pp).sub(g.position);
                tmp.y = 0;
                if (tmp.lengthSq() > 0.0001) desiredYaw = Math.atan2(tmp.x, tmp.z);
            } else if (!moving && !shouldFacePlayer) {
                // Sem alvo imediato, Nilo varre a sala lentamente em vez de
                // ficar congelado olhando para uma direção para sempre.
                desiredYaw = g.rotation.y + 0.32;
            }

            if (desiredYaw !== null) {
                let deltaYaw = desiredYaw - g.rotation.y;
                while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
                while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
                g.rotation.y += deltaYaw * Math.min(1, safeDt * (moving ? 7 : 2.2));
            }
        }

        // Respiração e caminhada procedural. A animação é consequência da
        // decisão, não um loop visual desconectado do deslocamento.
        const walkPhase = t * 7.2;
        const walkAmount = moving ? 1 : 0;
        if (torso.current) {
            torso.current.scale.y = 1 + Math.sin(t * 1.6) * 0.02;
            torso.current.rotation.z = Math.sin(t * 0.5) * 0.02
                + Math.sin(walkPhase * 0.5) * 0.025 * walkAmount;
        }
        if (armL.current) {
            armL.current.rotation.x = Math.sin(t * 0.8) * 0.05
                + Math.sin(walkPhase + Math.PI) * 0.34 * walkAmount;
        }
        if (armR.current) {
            armR.current.rotation.x = Math.sin(t * 0.8 + Math.PI) * 0.05
                + Math.sin(walkPhase) * 0.34 * walkAmount;
        }
        if (legL.current) legL.current.rotation.x = Math.sin(walkPhase) * 0.38 * walkAmount;
        if (legR.current) legR.current.rotation.x = Math.sin(walkPhase + Math.PI) * 0.38 * walkAmount;

        // Proximidade acompanha a posição MÓVEL do corpo.
        if (pp && g) {
            tmp.copy(pp).sub(g.position); tmp.y = 0;
            const dist = tmp.length();
            const near = dist < NEAR_DIST;
            if (near !== nearRef.current) { nearRef.current = near; npcSet({ near }); }
        }

        // "fala": cabeça balança enquanto o NPC responde
        if (head.current) {
            const talking = npc.speaking || t < autonomousTalkUntil.current;
            const talk = talking ? Math.sin(t * 9) * 0.05 + Math.sin(t * 13) * 0.03 : 0;
            head.current.rotation.x = talk;
            head.current.position.y = 1.52 + (talking ? Math.abs(Math.sin(t * 7)) * 0.01 : 0);
        }

        // Piscar dá um feedback visual de que os olhos são um sistema vivo.
        const blinkPhase = t % 4.1;
        const eyeScaleY = blinkPhase > 3.94 ? 0.12 : 1;
        if (eyeL.current) eyeL.current.scale.y = eyeScaleY;
        if (eyeR.current) eyeR.current.scale.y = eyeScaleY;

    });

    return (
        <group ref={root} position={[NPC_START.x, NPC_START.y, NPC_START.z]}>
            {/* pernas */}
            <group ref={legL} position={[-0.11, 0.74, 0]}>
                <mesh position={[0, -0.32, 0]}><capsuleGeometry args={[0.1, 0.62, 4, 8]} /><meshStandardMaterial color={PANTS} roughness={0.9} /></mesh>
            </group>
            <group ref={legR} position={[0.11, 0.74, 0]}>
                <mesh position={[0, -0.32, 0]}><capsuleGeometry args={[0.1, 0.62, 4, 8]} /><meshStandardMaterial color={PANTS} roughness={0.9} /></mesh>
            </group>
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
                <mesh ref={eyeL} position={[-0.06, 0.01, 0.15]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#141414" /></mesh>
                <mesh ref={eyeR} position={[0.06, 0.01, 0.15]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#141414" /></mesh>
            </group>
            {/* luzinha suave pra destacar o NPC na base cinza */}
            <pointLight position={[0, 1.7, 0.5]} intensity={0.5} distance={4} color="#ffe6c0" />
        </group>
    );
};

export default Floor10Npc;
