/**
 * Floor6.tsx — Andar 6 "Labirinto Amarelo" (backrooms liminal).
 *
 * Loop do andar: as portas abrem numa antecâmara amarelada → um labirinto de
 * corredores fluorescentes (f6Maze.ts, determinístico). Ache os 3 FUSÍVEIS nos
 * becos mais fundos e volte pro elevador — com o 3º fusível o App arma o
 * destino 7 (o painel do elevador "religa"). No caminho, a ENTIDADE: uma
 * silhueta que vagueia pelos corredores e, quando te VÊ (linha de visão real,
 * f6LosClear), caça usando MIRA ESPECULATIVA no padrão DeepSpec/DSpark do
 * DeepSeek — rascunha onde você vai estar (f6Intercept), verifica o palpite a
 * cada replanejamento e corrige com a posição real quando o chute é rejeitado.
 *
 * Auto-contido no padrão Floor4: App só monta o componente, chama
 * useFloor6Audio(1 linha) e reage a onPlayerCaught / setOnF6Progress.
 * Tudo procedural (CanvasTexture) — zero asset externo, roda offline.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    F6_MAZE_WALLS, F6_WALL_H, F6_CELL, F6_COLS, F6_ROWS, F6_X0, F6_Z0,
    F6_FUSES, F6_ENTITY_SPAWN, f6State, f6FuseTaken, f6TryCollectFuse,
    f6RegisterCaught, f6Path, f6LosClear, f6Intercept, worldToCell, cellCenter,
} from './f6Maze';
import type { QualityProfile } from './Settings';
import { configureFloor6Sfx, clearFloor6Sfx, playF6Step, playF6Fuse, playF6Sting, startF6Drone, stopF6Drone, setF6Hunt } from './floor6Sfx';
import { getMusicBus, setMusicActive } from './musicDirector';

// ── Ciclo de áudio do andar (App chama 1 linha; padrão useFloor4Audio) ───────
export function useFloor6Audio(
    active: boolean,
    audioCtx: AudioContext | null,
    busRef: React.MutableRefObject<AudioNode | null>,
): void {
    useEffect(() => {
        if (!active || !audioCtx) return;
        configureFloor6Sfx(audioCtx, busRef.current);
        const bus = getMusicBus('floor6', 62);
        if (bus) startF6Drone(audioCtx, bus);
        setMusicActive('floor6', true);
        return () => {
            setMusicActive('floor6', false);
            stopF6Drone();
            clearFloor6Sfx();
        };
    }, [active, audioCtx, busRef]);
}

// ── Tema ──────────────────────────────────────────────────────────────────────
const FLOOR6 = {
    wall:      '#c9b458',   // papel de parede amarelado
    wallDark:  '#a89440',
    carpet:    '#8f823d',   // carpete úmido
    carpetDark:'#6e6330',
    ceiling:   '#d6cfae',
    panel:     '#fff6c9',   // painel de luz fluorescente
    fog:       '#171204',
    ambient:   '#cabd8b',
};

// ── Texturas procedurais (singletons preguiçosos — Env e Prefetch compartilham,
//    e o custo de canvas só é pago quando o andar realmente é usado) ──────────
let _wallTex: THREE.CanvasTexture | null = null;
let _carpetTex: THREE.CanvasTexture | null = null;
let _ceilTex: THREE.CanvasTexture | null = null;

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    draw(c);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}
// PRNG local — texturas sempre idênticas entre loads (nada de Math.random em asset)
function texRng(seed: number): () => number {
    let s = seed | 0;
    return () => { s = (s * 16807) % 2147483647; return (s & 0x7fffffff) / 2147483647; };
}
function getWallTex(): THREE.CanvasTexture {
    if (!_wallTex) _wallTex = canvasTex(64, (c) => {
        const rng = texRng(777);
        c.fillStyle = FLOOR6.wall; c.fillRect(0, 0, 64, 64);
        c.fillStyle = FLOOR6.wallDark;
        for (let x = 0; x < 64; x += 8) c.fillRect(x, 0, 1, 64);        // listras do papel
        c.globalAlpha = 0.12;                                            // manchas de idade
        for (let i = 0; i < 26; i++) {
            c.fillStyle = rng() < 0.5 ? '#7a6a2e' : '#57491f';
            c.fillRect(Math.floor(rng() * 64), Math.floor(rng() * 64), 1 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 3));
        }
        c.globalAlpha = 1;
    });
    return _wallTex;
}
function getCarpetTex(): THREE.CanvasTexture {
    if (!_carpetTex) _carpetTex = canvasTex(64, (c) => {
        const rng = texRng(4242);
        c.fillStyle = FLOOR6.carpet; c.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 900; i++) {                                  // fiapos
            c.fillStyle = rng() < 0.5 ? FLOOR6.carpetDark : '#9c8f4b';
            c.globalAlpha = 0.25 + rng() * 0.3;
            c.fillRect(Math.floor(rng() * 64), Math.floor(rng() * 64), 1, 1);
        }
        c.globalAlpha = 1;
    });
    return _carpetTex;
}
function getCeilTex(): THREE.CanvasTexture {
    if (!_ceilTex) _ceilTex = canvasTex(64, (c) => {
        c.fillStyle = FLOOR6.ceiling; c.fillRect(0, 0, 64, 64);
        c.strokeStyle = '#b3ab86'; c.lineWidth = 2;                      // grade de forro
        c.strokeRect(1, 1, 62, 62);
    });
    return _ceilTex;
}

// ── Fundo + névoa do andar (restaura o anterior ao sair) ─────────────────────
const MazeAtmosphere: React.FC = () => {
    const { scene } = useThree();
    useEffect(() => {
        const prevBg = scene.background, prevFog = scene.fog;
        scene.background = new THREE.Color(FLOOR6.fog);
        scene.fog = new THREE.FogExp2(FLOOR6.fog, 0.055);   // corredores somem no escuro
        return () => { scene.background = prevBg; scene.fog = prevFog; };
    }, [scene]);
    return null;
};

// ── Paredes: UMA instancedMesh pra todos os segmentos do labirinto ───────────
const MazeWalls: React.FC = () => {
    const ref = useRef<THREE.InstancedMesh>(null!);
    const count = F6_MAZE_WALLS.length;
    useEffect(() => {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        F6_MAZE_WALLS.forEach((w, i) => {
            const [x1, z1, x2, z2] = w;
            const len = Math.hypot(x2 - x1, z2 - z1);
            const ang = Math.atan2(z2 - z1, x2 - x1);
            q.setFromAxisAngle(up, -ang);
            m.compose(
                new THREE.Vector3((x1 + x2) / 2, F6_WALL_H / 2, (z1 + z2) / 2),
                q,
                new THREE.Vector3(len + 0.24, F6_WALL_H, 0.24),   // +0.24: fecha as quinas
            );
            ref.current.setMatrixAt(i, m);
        });
        ref.current.instanceMatrix.needsUpdate = true;
    }, []);
    const tex = useMemo(() => { const t = getWallTex().clone(); t.needsUpdate = true; t.repeat.set(2, 1.6); return t; }, []);
    return (
        <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial map={tex} roughness={0.92} />
        </instancedMesh>
    );
};

// ── Painéis de luz do forro (emissivos, baratos) + 4 pontuais no high ─────────
const CeilingLights: React.FC<{ nightLights: boolean }> = ({ nightLights }) => {
    const panels = useMemo(() => {
        const out: { x: number; z: number }[] = [];
        for (let r = 0; r < F6_ROWS; r++) for (let c = 0; c < F6_COLS; c++) {
            if ((c + r) % 2 === 0) out.push(cellCenter(c, r));           // xadrez de painéis
        }
        out.push({ x: 0, z: -8 });                                        // antecâmara
        return out;
    }, []);
    const ref = useRef<THREE.InstancedMesh>(null!);
    useEffect(() => {
        const m = new THREE.Matrix4();
        panels.forEach((p, i) => {
            m.makeTranslation(p.x, F6_WALL_H - 0.02, p.z);
            ref.current.setMatrixAt(i, m);
        });
        ref.current.instanceMatrix.needsUpdate = true;
    }, [panels]);
    // pontuais reais só no perfil alto — o resto do clima vem dos emissivos
    const points = useMemo(() => (
        nightLights ? [cellCenter(2, 1), cellCenter(6, 2), cellCenter(3, 5), cellCenter(7, 5)] : []
    ), [nightLights]);
    return (
        <group>
            <instancedMesh ref={ref} args={[undefined, undefined, panels.length]} frustumCulled={false}>
                <boxGeometry args={[1.7, 0.06, 0.9]} />
                <meshBasicMaterial color={FLOOR6.panel} toneMapped={false} />
            </instancedMesh>
            {points.map((p, i) => (
                <pointLight key={i} position={[p.x, F6_WALL_H - 0.5, p.z]} intensity={4.5} distance={9} decay={1.8} color="#fff3c0" />
            ))}
        </group>
    );
};

// ── Fusível coletável (pedestal + caixa que pulsa) ───────────────────────────
const FusePickup: React.FC<{ id: number; x: number; z: number }> = ({ id, x, z }) => {
    const boxRef = useRef<THREE.Mesh>(null!);
    const groupRef = useRef<THREE.Group>(null!);
    useFrame(({ clock }) => {
        const taken = f6FuseTaken(id);
        groupRef.current.visible = !taken;
        if (taken) return;
        const t = clock.getElapsedTime();
        boxRef.current.rotation.y = t * 1.4;
        boxRef.current.position.y = 1.15 + Math.sin(t * 2.2 + id) * 0.08;
    });
    return (
        <group ref={groupRef} position={[x, 0, z]}>
            <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.22, 0.3, 0.9, 8]} />
                <meshStandardMaterial color="#3a3320" roughness={0.9} />
            </mesh>
            <mesh ref={boxRef} position={[0, 1.15, 0]}>
                <boxGeometry args={[0.34, 0.44, 0.2]} />
                <meshStandardMaterial color="#20180a" emissive="#ffd54f" emissiveIntensity={1.6} roughness={0.4} />
            </mesh>
        </group>
    );
};

// ── Quadro de fusíveis ao lado do elevador (feedback do objetivo) ────────────
const FuseBoard: React.FC = () => {
    const slotRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([null, null, null]);
    useFrame(() => {
        for (let i = 0; i < 3; i++) {
            const m = slotRefs.current[i];
            if (m) m.emissiveIntensity = i < f6State.fuses ? 1.8 : 0.06;
        }
    });
    return (
        <group position={[3.4, 1.5, -9.86]}>
            <mesh><boxGeometry args={[1.3, 1.1, 0.14]} /><meshStandardMaterial color="#2c2413" roughness={0.7} /></mesh>
            {[0, 1, 2].map((i) => (
                <mesh key={i} position={[-0.38 + i * 0.38, -0.05, 0.09]}>
                    <boxGeometry args={[0.22, 0.32, 0.06]} />
                    <meshStandardMaterial ref={(m) => { slotRefs.current[i] = m; }} color="#141008" emissive="#ffd54f" emissiveIntensity={0.06} />
                </mesh>
            ))}
        </group>
    );
};

// ── A ENTIDADE ────────────────────────────────────────────────────────────────
// Silhueta que patrulha os corredores. Vê o player (LOS real) → caça com mira
// especulativa (draft do intercepto verificado a cada replanejamento).
const ROAM_SPEED = 1.55;
const HUNT_SPEED = 3.35;              // < SPEED do player (4.0): dá pra fugir
const SEE_DIST = 11;
const CATCH_DIST = 1.05;
const LOSE_SIGHT_MS = 3500;

const Entity: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    onPlayerCaught: () => void;
    paused: boolean;
}> = ({ playerPositionRef, onPlayerCaught, paused }) => {
    const groupRef = useRef<THREE.Group>(null!);
    // material único pros DOIS olhos — muda de cor junto (branco → vermelho)
    const eyeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e8e6df', toneMapped: false }), []);
    useEffect(() => () => eyeMat.dispose(), [eyeMat]);
    const s = useRef({
        pos: new THREE.Vector3(F6_ENTITY_SPAWN.x, 0, F6_ENTITY_SPAWN.z),
        path: [] as { x: number; z: number }[],
        pathIdx: 0,
        mode: 'roam' as 'roam' | 'hunt',
        nextThinkAt: 0,
        nextPlanAt: 0,
        lastSeenAt: 0,
        prevPlayer: new THREE.Vector3(),
        playerVel: new THREE.Vector3(),
        velSampleAt: 0,
        catchCooldownUntil: 0,
        heading: 0,
    }).current;

    useFrame(({ clock }, dt) => {
        if (paused) return;
        const now = performance.now();
        const t = clock.getElapsedTime();
        const player = playerPositionRef.current;
        const safeDt = Math.min(dt, 0.05);

        // ── Velocidade do player (amostrada a 10Hz — insumo do draft) ──
        if (now >= s.velSampleAt) {
            const span = Math.max(0.05, (now - (s.velSampleAt - 100)) / 1000);
            s.playerVel.set((player.x - s.prevPlayer.x) / span, 0, (player.z - s.prevPlayer.z) / span);
            s.prevPlayer.copy(player);
            s.velSampleAt = now + 100;
        }

        // ── Decisões a 10Hz (LOS é o custo dominante) ──
        if (now >= s.nextThinkAt) {
            s.nextThinkAt = now + 100;
            const dx = player.x - s.pos.x, dz = player.z - s.pos.z;
            const dist = Math.hypot(dx, dz);
            const sees = dist < SEE_DIST && f6LosClear(s.pos.x, s.pos.z, player.x, player.z);
            if (sees) {
                s.lastSeenAt = now;
                if (s.mode === 'roam') {
                    s.mode = 'hunt';
                    f6State.hunting = true;
                    playF6Sting();
                    setF6Hunt(true);
                    s.nextPlanAt = 0;                    // replaneja já
                }
            } else if (s.mode === 'hunt' && now - s.lastSeenAt > LOSE_SIGHT_MS) {
                s.mode = 'roam';
                f6State.hunting = false;
                setF6Hunt(false);
                s.path = []; s.pathIdx = 0;              // volta a vagar
            }

            // ── CAPTURA ──
            if (dist < CATCH_DIST && now > s.catchCooldownUntil) {
                s.catchCooldownUntil = now + 2500;
                f6RegisterCaught();
                onPlayerCaught();
                // recomeça longe (spawn) e esfria a caçada
                s.pos.set(F6_ENTITY_SPAWN.x, 0, F6_ENTITY_SPAWN.z);
                s.mode = 'roam';
                f6State.hunting = false;
                setF6Hunt(false);
                s.path = []; s.pathIdx = 0;
            }
        }

        // ── Replanejamento da CAÇADA (draft→verify do DeepSpec) ──
        if (s.mode === 'hunt' && now >= s.nextPlanAt) {
            s.nextPlanAt = now + 350;
            const speed = HUNT_SPEED + Math.min(0.45, f6State.caught * 0.15);   // escala leve
            // draft: intercepto especulativo; verify dentro do f6Intercept
            const guess = f6Intercept(player.x, player.z, s.playerVel.x, s.playerVel.z, s.pos.x, s.pos.z, speed);
            if (f6LosClear(s.pos.x, s.pos.z, guess.x, guess.z)) {
                // alvo visível → vai reto nele (caminho verificado trivialmente)
                s.path = [{ x: guess.x, z: guess.z }];
                s.pathIdx = 0;
            } else {
                // alvo atrás de paredes → BFS até a célula do palpite
                const from = worldToCell(s.pos.x, s.pos.z);
                const to = worldToCell(guess.x, guess.z);
                s.path = f6Path(from, to);
                s.pathIdx = 0;
            }
        }

        // ── Patrulha: caminho aleatório determinístico o suficiente ──
        if (s.mode === 'roam' && s.pathIdx >= s.path.length) {
            const from = worldToCell(s.pos.x, s.pos.z);
            const to = { c: Math.floor(Math.abs(Math.sin(t * 12.9898) * 43758.5453) % F6_COLS), r: Math.floor(Math.abs(Math.sin(t * 78.233) * 12543.21) % F6_ROWS) };
            s.path = f6Path(from, to);
            s.pathIdx = 0;
        }

        // ── Movimento ao longo do caminho ──
        const speed = s.mode === 'hunt' ? HUNT_SPEED + Math.min(0.45, f6State.caught * 0.15) : ROAM_SPEED;
        if (s.pathIdx < s.path.length) {
            const wp = s.path[s.pathIdx];
            const dx = wp.x - s.pos.x, dz = wp.z - s.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.25) {
                s.pathIdx++;
            } else {
                s.pos.x += (dx / d) * speed * safeDt;
                s.pos.z += (dz / d) * speed * safeDt;
                const target = Math.atan2(dx, dz);
                let diff = target - s.heading;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                s.heading += diff * Math.min(1, 8 * safeDt);
            }
        }

        // ── Render ──
        const g = groupRef.current;
        g.position.set(s.pos.x, Math.sin(t * 7) * 0.04, s.pos.z);
        g.rotation.y = s.heading;
        eyeMat.color.set(s.mode === 'hunt' ? '#ff2b2b' : '#e8e6df');
    });

    return (
        <group ref={groupRef}>
            {/* corpo: silhueta preta que "bebe" a luz */}
            <mesh position={[0, 1.0, 0]}>
                <cylinderGeometry args={[0.3, 0.42, 2.0, 10]} />
                <meshStandardMaterial color="#08080a" roughness={1} />
            </mesh>
            <mesh position={[0, 2.2, 0]}>
                <sphereGeometry args={[0.29, 12, 10]} />
                <meshStandardMaterial color="#08080a" roughness={1} />
            </mesh>
            {/* braços compridos demais */}
            <mesh position={[0.42, 1.05, 0]} rotation={[0, 0, 0.12]}>
                <cylinderGeometry args={[0.07, 0.05, 1.7, 6]} />
                <meshStandardMaterial color="#08080a" roughness={1} />
            </mesh>
            <mesh position={[-0.42, 1.05, 0]} rotation={[0, 0, -0.12]}>
                <cylinderGeometry args={[0.07, 0.05, 1.7, 6]} />
                <meshStandardMaterial color="#08080a" roughness={1} />
            </mesh>
            {/* olhos (brancos vagando; vermelhos caçando) */}
            <mesh position={[0.1, 2.26, 0.24]} material={eyeMat}>
                <sphereGeometry args={[0.045, 8, 6]} />
            </mesh>
            <mesh position={[-0.1, 2.26, 0.24]} material={eyeMat}>
                <sphereGeometry args={[0.045, 8, 6]} />
            </mesh>
        </group>
    );
};

// ── Ambiente completo do andar ────────────────────────────────────────────────
interface Floor6EnvironmentProps {
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    onPlayerCaught: () => void;
    profile: QualityProfile;
    paused?: boolean;
}

export const Floor6Environment: React.FC<Floor6EnvironmentProps> = ({
    playerPositionRef, onPlayerCaught, profile, paused = false,
}) => {
    const carpet = useMemo(() => { const t = getCarpetTex().clone(); t.needsUpdate = true; t.repeat.set(18, 16); return t; }, []);
    const ceil = useMemo(() => { const t = getCeilTex().clone(); t.needsUpdate = true; t.repeat.set(F6_COLS, 8); return t; }, []);
    const exitTex = useMemo(() => canvasTex(128, (c) => {
        c.fillStyle = '#04220c'; c.fillRect(0, 0, 128, 128);
        c.fillStyle = '#41ff7a'; c.font = 'bold 34px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('SAÍDA', 64, 64);
    }), []);

    // passos + coleta de fusível, amostrados por distância andada (10Hz)
    const walk = useRef({ prev: new THREE.Vector3(), acc: 0, nextAt: 0 }).current;
    useFrame(() => {
        const now = performance.now();
        if (now < walk.nextAt) return;
        walk.nextAt = now + 100;
        const p = playerPositionRef.current;
        const d = Math.hypot(p.x - walk.prev.x, p.z - walk.prev.z);
        walk.prev.copy(p);
        if (d > 0.02 && d < 3) {                       // ignora teleporte/respawn
            walk.acc += d;
            if (walk.acc >= 0.78) { walk.acc = 0; playF6Step(); }
        }
        const got = f6TryCollectFuse(p.x, p.z);
        if (got >= 0) playF6Fuse(f6State.fuses);
    });

    const W = F6_COLS * F6_CELL;                        // 36
    const D = F6_ROWS * F6_CELL + 4;                    // 32 (labirinto + antecâmara)
    const CZ = F6_Z0 + (F6_ROWS * F6_CELL) / 2 - 2;     // centro em z (inclui antecâmara)

    return (
        <group>
            <MazeAtmosphere />
            <ambientLight intensity={0.42} color={FLOOR6.ambient} />
            <hemisphereLight intensity={0.2} color="#fff3c0" groundColor="#4a4020" />

            {/* carpete (y=0) e forro (y=F6_WALL_H) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, CZ]}>
                <planeGeometry args={[W, D]} />
                <meshStandardMaterial map={carpet} roughness={1} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, F6_WALL_H, CZ]}>
                <planeGeometry args={[W, D]} />
                <meshStandardMaterial map={ceil} roughness={0.95} />
            </mesh>

            <MazeWalls />
            <CeilingLights nightLights={profile.nightLights} />

            {/* placa SAÍDA sobre a porta do elevador (aponta o caminho de volta) */}
            <mesh position={[0, 2.72, -9.8]}>
                <boxGeometry args={[1.2, 0.42, 0.08]} />
                <meshBasicMaterial map={exitTex} toneMapped={false} />
            </mesh>
            <FuseBoard />

            {F6_FUSES.map((f) => <FusePickup key={f.id} id={f.id} x={f.x} z={f.z} />)}

            <Entity playerPositionRef={playerPositionRef} onPlayerCaught={onPlayerCaught} paused={paused} />
        </group>
    );
};

// ── Prefetch ESPECULATIVO (DeepSpec: trabalhe antes da confirmação) ──────────
// Montado pelo App enquanto o Andar 6 é um destino PROVÁVEL (ex.: durante o
// Andar 4, cuja saída sobe pra cá). Compila os shaders e sobe as texturas na
// GPU fora da tela; se o player nunca vier, o rascunho é descartado de graça.
export const Floor6Prefetch: React.FC = () => {
    const wall = useMemo(() => { const t = getWallTex().clone(); t.needsUpdate = true; return t; }, []);
    const carpet = useMemo(() => { const t = getCarpetTex().clone(); t.needsUpdate = true; return t; }, []);
    const ceilT = useMemo(() => { const t = getCeilTex().clone(); t.needsUpdate = true; return t; }, []);
    return (
        <group position={[0, -60, 0]} scale={0.01}>
            <mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial map={wall} roughness={0.92} /></mesh>
            <mesh position={[2, 0, 0]}><planeGeometry args={[1, 1]} /><meshStandardMaterial map={carpet} roughness={1} /></mesh>
            <mesh position={[4, 0, 0]}><planeGeometry args={[1, 1]} /><meshStandardMaterial map={ceilT} roughness={0.95} /></mesh>
            <mesh position={[6, 0, 0]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color={FLOOR6.panel} toneMapped={false} /></mesh>
            <mesh position={[8, 0, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#08080a" roughness={1} /></mesh>
            <mesh position={[10, 0, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#20180a" emissive="#ffd54f" emissiveIntensity={1.6} /></mesh>
        </group>
    );
};

export default Floor6Environment;
