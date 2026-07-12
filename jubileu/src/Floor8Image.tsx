/**
 * Floor8Image.tsx — DENTRO DA IMAGEM: o corredor de vinte portas + a porta 21.
 *
 * Quando o player mergulha na imagem que o Arquivista estende (fase corredor20),
 * este overlay 2.5D lateral assume a tela: um corredor de hotel infinito, vinte
 * portas numeradas recuando na penumbra. O player anda pra direita com a própria
 * luz revelando as portas — e no fim, a PORTA 21, que não pertence a andar
 * nenhum: a memória apagada dele mesmo, brilhando morna, com fios de lã
 * escapando por baixo (o prenúncio do tricô do M4).
 *
 * Câmera ortográfica (2.5D real, molde Floor4Canvas2D). Ao alcançar a porta 21,
 * o prompt de entrar chama f8EnterDoor21 → o platformer (M4).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f8, f8SetOnChange, f8ReachDoor21, f8EnterDoor21, f8Objective, F8_DOORS } from './f8Arquivo';

const DOOR0 = 3;        // x da primeira porta
const DOOR_GAP = 2.4;   // espaçamento
const DOOR21_X = DOOR0 + F8_DOORS * DOOR_GAP + 1.4;   // a 21ª, um pouco além
const END_X = DOOR21_X + 2;

// ── etiquetas numéricas (cache) ──────────────────────────────────────────────
const numCache = new Map<string, THREE.CanvasTexture>();
function numTex(label: string, warm = false): THREE.CanvasTexture {
    const key = label + (warm ? 'w' : '');
    const hit = numCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = warm ? '#241a0e' : '#0e0c0a'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = warm ? '#7a5a2a' : '#3a3226'; x.lineWidth = 3; x.strokeRect(3, 3, 58, 58);
    x.fillStyle = warm ? '#f0d89a' : '#b7a377';
    x.font = 'bold 34px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, 32, 35);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    numCache.set(key, t); return t;
}

// carpete com padrão sujo
const carpetTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = '#3a1f1a'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(20,10,8,${Math.random() * 0.3})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    x.strokeStyle = 'rgba(90,60,30,0.25)'; for (let i = 0; i < 128; i += 16) { x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 2); return t;
})();
const paperTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = '#4a4030'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(30,26,18,0.18)`; x.fillRect(i * 16 + 6, 0, 3, 128); }
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(20,16,10,${Math.random() * 0.25})`; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, Math.random() * 4, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 3); return t;
})();

const CM = {
    floor: new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ map: paperTex, roughness: 1 }),
    ceil: new THREE.MeshStandardMaterial({ color: '#120f0c', roughness: 1 }),
    door: new THREE.MeshStandardMaterial({ color: '#5a4433', roughness: 0.7 }),
    doorDk: new THREE.MeshStandardMaterial({ color: '#2c2015', roughness: 0.8 }),
    trim: new THREE.MeshStandardMaterial({ color: '#3a2c1e', roughness: 0.8 }),
    door21: new THREE.MeshStandardMaterial({ color: '#c98a3a', emissive: '#7a4a12', emissiveIntensity: 0.6, roughness: 0.5 }),
    yarn: new THREE.MeshStandardMaterial({ color: '#c0432f', emissive: '#5a1a10', emissiveIntensity: 0.4, roughness: 1 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffcf8a' }),
    skin: new THREE.MeshStandardMaterial({ color: '#c2a381', roughness: 0.7 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.9 }),
};

const Bx: React.FC<{ a: [number, number, number]; p: [number, number, number]; m: THREE.Material; r?: [number, number, number] }> =
    ({ a, p, m, r }) => (<mesh position={p} rotation={r} material={m}><boxGeometry args={a} /></mesh>);
const Plane: React.FC<{ a: [number, number]; p: [number, number, number]; m: THREE.Material }> =
    ({ a, p, m }) => (<mesh position={p} material={m}><planeGeometry args={a} /></mesh>);

/** Uma porta de hotel numerada, encaixada na parede do fundo. */
const HotelDoor: React.FC<{ x: number; n: number }> = ({ x, n }) => (
    <group position={[x, 0, -0.4]}>
        <Bx a={[1.15, 2.55, 0.14]} p={[0, 1.3, 0]} m={CM.trim} />
        <Bx a={[0.92, 2.34, 0.1]} p={[0, 1.24, 0.05]} m={CM.door} />
        <Bx a={[0.8, 1.0, 0.02]} p={[0, 1.62, 0.11]} m={CM.doorDk} />
        <Bx a={[0.8, 0.9, 0.02]} p={[0, 0.62, 0.11]} m={CM.doorDk} />
        <mesh position={[0.32, 1.2, 0.13]} material={CM.glow}><sphereGeometry args={[0.05, 8, 8]} /></mesh>
        {/* plaqueta com o número */}
        <mesh position={[0, 2.05, 0.12]}><planeGeometry args={[0.34, 0.24]} /><meshStandardMaterial map={numTex(String(n))} roughness={0.6} /></mesh>
    </group>
);

/** A porta 21 — a memória do player. Brilha morna, fios de lã escapando. */
const Door21: React.FC = () => {
    const glow = useRef<THREE.PointLight>(null!);
    useFrame(({ clock }) => { if (glow.current) glow.current.intensity = 6 + Math.sin(clock.elapsedTime * 2.3) * 1.6; });
    const yarns = useMemo(() => Array.from({ length: 7 }, (_, i) => -0.5 + i * 0.16), []);
    return (
        <group position={[DOOR21_X, 0, -0.4]}>
            <Bx a={[1.35, 2.75, 0.16]} p={[0, 1.4, 0]} m={CM.trim} />
            <Bx a={[1.02, 2.5, 0.1]} p={[0, 1.32, 0.06]} m={CM.door21} />
            {/* fresta de luz por baixo */}
            <Plane a={[1.0, 0.12]} p={[0, 0.08, 0.12]} m={CM.glow} />
            {/* fios de lã escapando por baixo */}
            {yarns.map((yx, i) => (
                <mesh key={i} position={[yx, 0.03, 0.16]} rotation={[0, 0, (i - 3) * 0.12]} material={CM.yarn}>
                    <cylinderGeometry args={[0.018, 0.018, 0.5 + (i % 3) * 0.2, 5]} />
                </mesh>
            ))}
            <mesh position={[0, 2.1, 0.12]}><planeGeometry args={[0.4, 0.28]} /><meshStandardMaterial map={numTex('21', true)} roughness={0.5} /></mesh>
            <pointLight ref={glow} position={[0, 1.3, 0.9]} distance={7} decay={1.6} color="#ffb861" intensity={6} />
        </group>
    );
};

/** O avatar do player, silhueta simples, com passo. */
const Walker: React.FC<{ xRef: React.MutableRefObject<number>; movingRef: React.MutableRefObject<number> }> = ({ xRef, movingRef }) => {
    const g = useRef<THREE.Group>(null!);
    const lamp = useRef<THREE.PointLight>(null!);
    const ph = useRef(0);
    useFrame((_, dt) => {
        const g0 = g.current; if (!g0) return;
        g0.position.x = xRef.current;
        const mv = movingRef.current;
        if (mv !== 0) { ph.current += dt * 9; g0.scale.x = mv < 0 ? -1 : 1; }
        const sw = mv !== 0 ? Math.sin(ph.current) * 0.4 : 0;
        (g0.children[3] as THREE.Mesh).rotation.z = sw;
        (g0.children[4] as THREE.Mesh).rotation.z = -sw;
        g0.position.y = mv !== 0 ? Math.abs(Math.sin(ph.current)) * 0.04 : 0;
        if (lamp.current) lamp.current.position.x = xRef.current;
    });
    return (
        <>
            <group ref={g}>
                <mesh position={[0, 1.45, 0.5]} material={CM.skin}><sphereGeometry args={[0.16, 12, 12]} /></mesh>
                <Bx a={[0.36, 0.6, 0.24]} p={[0, 1.05, 0.5]} m={CM.cloth} />
                <Bx a={[0.12, 0.55, 0.14]} p={[0.22, 1.05, 0.5]} m={CM.cloth} />
                <mesh position={[-0.1, 0.5, 0.5]} material={CM.cloth}><boxGeometry args={[0.14, 0.6, 0.16]} /></mesh>
                <mesh position={[0.1, 0.5, 0.5]} material={CM.cloth}><boxGeometry args={[0.14, 0.6, 0.16]} /></mesh>
            </group>
            <pointLight ref={lamp} position={[0, 1.6, 1.4]} distance={7} decay={1.5} color="#ffe6bf" intensity={7} />
        </>
    );
};

const CorridorScene: React.FC<{ xRef: React.MutableRefObject<number>; movingRef: React.MutableRefObject<number>; keys: React.MutableRefObject<Record<string, boolean>>; touchRef: React.MutableRefObject<number> }> =
    ({ xRef, movingRef, keys, touchRef }) => {
        const cam = useThree((s) => s.camera);
        const [, force] = useState(0);
        const verSeen = useRef(f8.version);
        useFrame((_, rawDt) => {
            const dt = Math.min(rawDt, 0.05);
            if (f8.phase === 'corredor20') {
                const dir = (keys.current['d'] || keys.current['arrowright'] ? 1 : 0) - (keys.current['a'] || keys.current['arrowleft'] ? 1 : 0) + touchRef.current;
                movingRef.current = dir;
                if (dir !== 0) xRef.current = Math.max(0, Math.min(END_X, xRef.current + dir * 4 * dt));
                if (xRef.current >= DOOR21_X - 1.0) f8ReachDoor21();
            } else if (f8.phase === 'porta21') {
                // desliza pra frente da porta 21
                movingRef.current = xRef.current < DOOR21_X - 0.05 ? 1 : 0;
                xRef.current = Math.min(DOOR21_X, xRef.current + 4 * dt);
            } else movingRef.current = 0;
            // câmera segue
            cam.position.x += (xRef.current + 1.6 - cam.position.x) * Math.min(1, dt * 4);
            cam.position.y = 2.0; cam.position.z = 10; cam.rotation.set(0, 0, 0); cam.lookAt(cam.position.x, 2.0, 0);
            if (f8.version !== verSeen.current) { verSeen.current = f8.version; force((v) => v + 1); }
        });
        const doors = [];
        for (let i = 1; i <= F8_DOORS; i++) doors.push(<HotelDoor key={i} x={DOOR0 + (i - 1) * DOOR_GAP} n={i} />);
        return (
            <>
                <ambientLight color="#2a2436" intensity={0.28} />
                {/* casca do corredor */}
                <Plane a={[END_X + 10, 4.4]} p={[END_X / 2, 0.01, -0.55]} m={CM.wall} />
                <mesh position={[END_X / 2, 0, 1]} rotation={[-Math.PI / 2, 0, 0]} material={CM.floor}><planeGeometry args={[END_X + 10, 4]} /></mesh>
                <Bx a={[END_X + 10, 0.3, 4]} p={[END_X / 2, 4.2, 0]} m={CM.ceil} />
                {/* rodapé + sanca */}
                <Bx a={[END_X + 10, 0.22, 0.1]} p={[END_X / 2, 0.11, -0.34]} m={CM.trim} />
                {doors}
                <Door21 />
                {/* parede-fim */}
                <Bx a={[0.4, 4.4, 3]} p={[END_X + 1, 2, 0]} m={CM.doorDk} />
                <Walker xRef={xRef} movingRef={movingRef} />
            </>
        );
    };

export const Floor8Image: React.FC<{ onEnterPlatformer?: () => void }> = ({ onEnterPlatformer }) => {
    const [, setV] = useState(0);
    const xRef = useRef(0);
    const movingRef = useRef(0);
    const keys = useRef<Record<string, boolean>>({});
    const touchRef = useRef(0);

    useEffect(() => { f8SetOnChange(() => setV((x) => x + 1)); return () => f8SetOnChange(null); }, []);
    useEffect(() => { if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8img = { xRef }; }, []);
    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            keys.current[e.key.toLowerCase()] = true;
            if ((e.key.toLowerCase() === 'e' || e.key === 'Enter') && f8.phase === 'porta21') { f8EnterDoor21(); onEnterPlatformer?.(); }
        };
        const ku = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, [onEnterPlatformer]);

    const active = f8.phase === 'corredor20' || f8.phase === 'porta21' || f8.phase === 'platformer';
    if (!active) return null;
    const objective = f8Objective();
    const atDoor = f8.phase === 'porta21';

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 55, background: '#080607', touchAction: 'none' }}>
            <Canvas orthographic camera={{ position: [1.6, 2, 10], zoom: 82, near: 0.1, far: 100 }} gl={{ antialias: true }}>
                <CorridorScene xRef={xRef} movingRef={movingRef} keys={keys} touchRef={touchRef} />
            </Canvas>

            {/* moldura fotográfica: vinheta + grão (a gente está DENTRO da imagem) */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 220px 60px rgba(0,0,0,0.9)' }} />

            {/* objetivo */}
            {objective && (
                <div style={{
                    position: 'absolute', top: 'calc(env(safe-area-inset-top) + 20px)', left: 0, right: 0, textAlign: 'center',
                    fontFamily: 'monospace', fontSize: 14, letterSpacing: 1, color: '#e8dcc0', textShadow: '0 2px 6px #000',
                }}>{objective}</div>
            )}

            {/* controles touch */}
            <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 24px', pointerEvents: 'none' }}>
                {(['◀', '▶'] as const).map((s, i) => (
                    <button key={s}
                        onPointerDown={() => { touchRef.current = i === 0 ? -1 : 1; }}
                        onPointerUp={() => { touchRef.current = 0; }}
                        onPointerLeave={() => { touchRef.current = 0; }}
                        style={{
                            pointerEvents: 'auto', width: 76, height: 76, borderRadius: 40, fontSize: 26,
                            background: 'rgba(20,16,12,0.6)', border: '1px solid rgba(232,220,192,0.4)', color: '#e8dcc0', touchAction: 'none',
                        }}>{s}</button>
                ))}
            </div>

            {/* prompt de entrar na porta 21 */}
            {atDoor && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 130, textAlign: 'center' }}>
                    <button onPointerDown={() => { f8EnterDoor21(); onEnterPlatformer?.(); }} style={{
                        pointerEvents: 'auto', fontFamily: 'monospace', fontSize: 16, padding: '12px 26px',
                        background: 'rgba(122,74,18,0.75)', border: '1px solid #f0d89a', borderRadius: 12, color: '#fff4dc', cursor: 'pointer',
                        boxShadow: '0 0 28px rgba(255,184,97,0.5)',
                    }}><span style={{ color: '#ffd98a' }}>[E]</span> Entrar</button>
                </div>
            )}
        </div>
    );
};

export default Floor8Image;
