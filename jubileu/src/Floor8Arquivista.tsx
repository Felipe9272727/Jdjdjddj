/**
 * Floor8Arquivista.tsx — O ARQUIVISTA, o NPC do futuro Andar 8.
 *
 * Guardado no estaleiro a pedido do Felipe (2026-07-11): o andar ainda não
 * existe, mas o seu habitante já — ele representa a IA que construiu estes
 * andares (ex-Capitão Fable, ex-Comodoro Bússola). Num hotel onde a
 * administração APAGA o que é esquecido, o Arquivista é quem LEMBRA:
 * ele guarda as fichas de tudo e de todos ("máquina não esquece").
 *
 * Não é animação em loop — é um agente autônomo:
 *  - UTILITY AI: a cada ~0.6s pontua ações (vaguear, consultar o livro-tombo,
 *    visitar pontos de interesse, cumprimentar) por vontades que crescem com
 *    o tempo (tédio, curiosidade, sociabilidade).
 *  - PERCEPÇÃO: distância do jogador, obstáculos, colegas.
 *  - MEMÓRIA: conta encontros — o 1º cumprimento é diferente dos seguintes.
 *
 * NADA monta este componente ainda. Quando o Andar 8 nascer, passe os POIs
 * e obstáculos do cenário via props (o cérebro é agnóstico de layout) e
 * escreva os barks definitivos pro tema do andar.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const AM = {
    vest: new THREE.MeshStandardMaterial({ color: '#3c3328', roughness: 0.85 }),
    vestDk: new THREE.MeshStandardMaterial({ color: '#2b2419', roughness: 0.9 }),
    shirt: new THREE.MeshStandardMaterial({ color: '#cfc4a8', roughness: 0.9 }),
    slacks: new THREE.MeshStandardMaterial({ color: '#33302a', roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: '#c2a381', roughness: 0.68 }),
    shoe: new THREE.MeshStandardMaterial({ color: '#1c1510', roughness: 0.45 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08d45', roughness: 0.35, metalness: 0.7 }),
    hair: new THREE.MeshStandardMaterial({ color: '#4a423a', roughness: 1 }),
    eye: new THREE.MeshStandardMaterial({ color: '#1c1710', roughness: 0.2 }),
    lens: new THREE.MeshStandardMaterial({ color: '#9fb4bd', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.45 }),
    ledger: new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.8 }),
    pages: new THREE.MeshStandardMaterial({ color: '#e0d3ad', roughness: 0.95 }),
};

export type ArquivistaPoi = {
    x: number; z: number;
    /** para onde olhar ao chegar */
    face?: [number, number];
    kind: 'ler' | 'observar' | 'vaguear';
};
export type ArquivistaObstacle = [number, number, number];   // cx, cz, raio

// POIs de fallback (um quadrado pequeno) — substitua pelos do Andar 8 real.
const DEFAULT_POIS: ArquivistaPoi[] = [
    { x: 2, z: 2, kind: 'vaguear' },
    { x: -2, z: 2, face: [0, 0], kind: 'observar' },
    { x: -2, z: -2, kind: 'ler' },
    { x: 2, z: -2, kind: 'vaguear' },
];

// Barks provisórios (tom do personagem; troque pelos do tema do Andar 8).
const BARKS = {
    greet0: 'Ah. Um hóspede LEMBRADO. Eu sou o Arquivista — eu guardo as fichas do que o hotel tenta esquecer.',
    greet1: 'De volta. A sua ficha engrossou desde a última vez.',
    greet2: 'Você de novo. Já é praticamente um item de acervo.',
    ler: 'Campos, Aurélio — quarto 612. Arquivado. Lembrado. A administração ODEIA esta página.',
    observar: 'Vinte andares. Eu tenho ficha de dezenove. O último... o último tem ficha de MIM.',
    bump: 'Cuidado com o acervo, hóspede.',
};

function makeBubble(): { tex: THREE.CanvasTexture; draw: (t: string) => void } {
    const c = document.createElement('canvas'); c.width = 640; c.height = 160;
    const x = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const draw = (t: string) => {
        x.clearRect(0, 0, 640, 160);
        const words = t.split(' '); const lines: string[] = []; let cur = '';
        x.font = '26px monospace';
        for (const w of words) {
            const test = cur ? cur + ' ' + w : w;
            if (x.measureText(test).width > 560 && cur) { lines.push(cur); cur = w; } else cur = test;
        }
        lines.push(cur);
        const bh = 34 + lines.length * 30;
        x.fillStyle = 'rgba(10,12,14,0.85)';
        x.strokeStyle = 'rgba(217,185,106,0.9)'; x.lineWidth = 3;
        x.beginPath();
        (x as CanvasRenderingContext2D & { roundRect: (a: number, b: number, c: number, d: number, e: number) => void })
            .roundRect(20, 130 - bh, 600, bh, 14);
        x.fill(); x.stroke();
        x.beginPath(); x.moveTo(300, 130); x.lineTo(340, 130); x.lineTo(316, 156); x.closePath(); x.fill();
        x.fillStyle = '#e8e2d2'; x.textAlign = 'center';
        lines.forEach((l, i) => x.fillText(l, 320, 130 - bh + 40 + i * 30));
        tex.needsUpdate = true;
    };
    return { tex, draw };
}

export const Arquivista: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    pois?: ArquivistaPoi[];
    obstacles?: ArquivistaObstacle[];
    /** altura do piso em (x,z) — plano por padrão */
    floorY?: (x: number, z: number) => number;
    /** limites de andar [minX, maxX, minZ, maxZ] */
    bounds?: [number, number, number, number];
}> = ({ playerPositionRef, pois: poisProp = DEFAULT_POIS, obstacles = [], floorY = () => 0, bounds = [-6, 6, -6, 6] }) => {
    const pois = poisProp.length > 0 ? poisProp : DEFAULT_POIS;
    const root = useRef<THREE.Group>(null!);
    const body = useRef<THREE.Group>(null!);
    const head = useRef<THREE.Group>(null!);
    const armBook = useRef<THREE.Group>(null!);
    const bubbleM = useRef<THREE.Mesh>(null!);
    const bubble = useMemo(makeBubble, []);
    const _pl = useRef(new THREE.Vector3());

    const ai = useRef({
        pos: new THREE.Vector2(pois[0]?.x ?? 0, pois[0]?.z ?? 0), heading: 0,
        target: pois[0] ?? DEFAULT_POIS[0], mode: 'walk' as 'walk' | 'act',
        actT: 0, think: 0, walkPh: 0, read: 0,
        bored: 0.4, curious: 0.6, social: 1,
        greets: 0, greetCd: 0, saidBump: 0,
        bark: '', barkT: 0,
    });

    const say = (t: string) => {
        const a = ai.current;
        if (a.bark === t && a.barkT > 0) return;
        a.bark = t; a.barkT = 4.2; bubble.draw(t);
    };

    useFrame(({ clock, camera }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const g = root.current;
        if (!g) return;
        const a = ai.current;

        // ── percepção ──
        if (g.parent) { _pl.current.copy(playerPositionRef.current); g.parent.worldToLocal(_pl.current); }
        const pdx = _pl.current.x - a.pos.x, pdz = _pl.current.z - a.pos.y;
        const pdist = Math.hypot(pdx, pdz);
        a.bored = Math.min(1, a.bored + dt * 0.05);
        a.curious = Math.min(1, a.curious + dt * 0.035);
        a.social = Math.min(1, a.social + dt * 0.05);
        a.greetCd = Math.max(0, a.greetCd - dt);

        // ── decisão (utility) ──
        a.think -= dt;
        if (a.think <= 0) {
            a.think = 0.6;
            if (pdist < 2.7 && a.greetCd <= 0) {
                a.mode = 'act'; a.actT = 2.8;
                a.target = { x: a.pos.x, z: a.pos.y, face: [_pl.current.x, _pl.current.z], kind: 'vaguear' };
                say(a.greets === 0 ? BARKS.greet0 : a.greets === 1 ? BARKS.greet1 : BARKS.greet2);
                a.greets++; a.greetCd = 26; a.social = 0;
            } else if (a.mode === 'walk') {
                let best = a.target, bestS = -1;
                for (const p of pois) {
                    let s = Math.random() * 0.25;
                    if (p.kind === 'ler') s += a.curious;
                    if (p.kind === 'observar') s += a.bored;
                    if (p.kind === 'vaguear') s += 0.35;
                    const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.y);
                    if (d < 0.6) s -= 0.8;
                    if (s > bestS) { bestS = s; best = p; }
                }
                a.target = best;
            }
        }
        if (a.mode === 'act') {
            a.actT -= dt;
            if (a.actT <= 0) { a.mode = 'walk'; a.think = 0; }
        }

        // ── locomoção com desvio ──
        const tx = a.target.x - a.pos.x, tz = a.target.z - a.pos.y;
        const tdist = Math.hypot(tx, tz);
        if (a.mode === 'walk' && tdist > 0.28) {
            let mvx = tx / tdist, mvz = tz / tdist;
            for (const [ox, oz, or_] of obstacles) {
                const dx = a.pos.x - ox, dz = a.pos.y - oz;
                const d = Math.hypot(dx, dz);
                if (d < or_ + 0.42 && d > 0.001) { const f = (or_ + 0.42 - d) * 2.2; mvx += (dx / d) * f; mvz += (dz / d) * f; }
            }
            const ml = Math.hypot(mvx, mvz) || 1;
            a.pos.x += (mvx / ml) * 0.6 * dt; a.pos.y += (mvz / ml) * 0.6 * dt;
            a.pos.x = Math.max(bounds[0], Math.min(bounds[1], a.pos.x));
            a.pos.y = Math.max(bounds[2], Math.min(bounds[3], a.pos.y));
            a.walkPh += dt * 7;
            const want = Math.atan2(mvx / ml, mvz / ml);
            let dh = want - a.heading;
            while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
            a.heading += dh * Math.min(1, dt * 5);
        } else {
            if (a.mode === 'walk') {
                a.mode = 'act';
                a.actT = a.target.kind === 'ler' ? 5.5 : a.target.kind === 'observar' ? 6 : 2.5;
                if (a.target.kind === 'ler') { a.curious = 0; say(BARKS.ler); }
                if (a.target.kind === 'observar') { a.bored = 0; if (Math.random() < 0.6) say(BARKS.observar); }
            }
            if (a.target.face) {
                const want = Math.atan2(a.target.face[0] - a.pos.x, a.target.face[1] - a.pos.y);
                let dh = want - a.heading;
                while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
                a.heading += dh * Math.min(1, dt * 4);
            }
        }
        if (pdist < 0.55) {
            const away = Math.atan2(-pdx, -pdz);
            a.pos.x += Math.sin(away) * dt * 0.9; a.pos.y += Math.cos(away) * dt * 0.9;
            if (a.saidBump <= 0) { say(BARKS.bump); a.saidBump = 12; }
        }
        a.saidBump = Math.max(0, a.saidBump - dt);

        // ── corpo ──
        const moving = a.mode === 'walk' && tdist > 0.28;
        const bob = moving ? Math.abs(Math.sin(a.walkPh)) * 0.03 : 0;
        g.position.set(a.pos.x, floorY(a.pos.x, a.pos.y) + bob, a.pos.y);
        g.rotation.y = a.heading;
        if (body.current) body.current.rotation.z = moving ? Math.sin(a.walkPh) * 0.04 : Math.sin(t * 0.3) * 0.012;

        // cabeça segue o jogador quando perto
        if (head.current) {
            let hy = 0;
            if (pdist < 5.5) {
                const wantH = Math.atan2(pdx, pdz) - a.heading;
                hy = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(wantH), Math.cos(wantH))));
            }
            head.current.rotation.y += (hy - head.current.rotation.y) * Math.min(1, dt * 3);
        }
        // o livro-tombo sobe quando ele "lê"
        const readWant = a.mode === 'act' && a.target.kind === 'ler' ? 1 : 0;
        a.read += (readWant - a.read) * Math.min(1, dt * 3);
        if (armBook.current) armBook.current.rotation.x = -0.2 - a.read * 1.15;
        if (head.current) head.current.rotation.x = 0.05 + a.read * 0.35;

        // balão de fala
        a.barkT = Math.max(0, a.barkT - dt);
        if (bubbleM.current) {
            const op = Math.min(1, a.barkT / 0.35) * Math.min(1, Math.max(0, 5 - pdist));
            (bubbleM.current.material as THREE.MeshBasicMaterial).opacity = op;
            bubbleM.current.visible = op > 0.02;
            bubbleM.current.quaternion.copy(camera.quaternion);
        }
    });

    return (
        <group ref={root}>
            <group ref={body}>
                {/* sapatos + calça */}
                {[-0.09, 0.09].map((x) => (
                    <group key={x} position={[x, 0, 0]}>
                        <mesh position={[0, 0.05, 0.04]} material={AM.shoe}><boxGeometry args={[0.09, 0.1, 0.24]} /></mesh>
                        <mesh position={[0, 0.42, 0]} material={AM.slacks}><capsuleGeometry args={[0.05, 0.5, 4, 8]} /></mesh>
                    </group>
                ))}
                {/* camisa + colete com botões de latão */}
                <mesh position={[0, 0.98, 0]} material={AM.shirt}><cylinderGeometry args={[0.145, 0.16, 0.42, 12]} /></mesh>
                <mesh position={[0, 0.97, 0]} scale={[1.12, 0.92, 1.1]} material={AM.vest}><cylinderGeometry args={[0.15, 0.165, 0.4, 12, 1, true]} /></mesh>
                {[0.88, 0.98, 1.08].map((y) => (
                    <mesh key={y} position={[0, y, 0.165]} material={AM.brass}><sphereGeometry args={[0.013, 6, 6]} /></mesh>
                ))}
                {/* braçadeira de escriturário na manga direita */}
                <group position={[0.19, 1.06, 0]} rotation={[0.1, 0, -0.28]}>
                    <mesh position={[0, -0.16, 0]} material={AM.shirt}><capsuleGeometry args={[0.042, 0.24, 4, 8]} /></mesh>
                    <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={AM.vestDk}><torusGeometry args={[0.047, 0.012, 6, 10]} /></mesh>
                    <mesh position={[0, -0.31, 0.01]} material={AM.skin}><sphereGeometry args={[0.042, 8, 6]} /></mesh>
                </group>
                {/* braço esquerdo com o LIVRO-TOMBO (sobe quando ele consulta) */}
                <group ref={armBook} position={[-0.19, 1.06, 0]} rotation={[-0.2, 0, 0.25]}>
                    <mesh position={[0, -0.15, 0]} material={AM.shirt}><capsuleGeometry args={[0.042, 0.22, 4, 8]} /></mesh>
                    <mesh position={[0, -0.28, 0.02]} material={AM.skin}><sphereGeometry args={[0.042, 8, 6]} /></mesh>
                    <group position={[0.02, -0.3, 0.12]} rotation={[0.25, -0.35, 0]}>
                        <mesh material={AM.ledger}><boxGeometry args={[0.06, 0.24, 0.32]} /></mesh>
                        <mesh position={[0.012, 0, 0]} material={AM.pages}><boxGeometry args={[0.045, 0.22, 0.29]} /></mesh>
                        <mesh position={[-0.028, 0.06, 0.05]} material={AM.brass}><boxGeometry args={[0.012, 0.03, 0.03]} /></mesh>
                    </group>
                </group>
                {/* carimbo de latão pendurado no cinto */}
                <mesh position={[0.12, 0.74, 0.14]} rotation={[0.4, 0, 0]} material={AM.brass}><cylinderGeometry args={[0.022, 0.03, 0.07, 8]} /></mesh>
                {/* cabeça: óculos redondos, cabelo penteado ralo */}
                <group ref={head} position={[0, 1.32, 0]}>
                    <mesh position={[0, 0.05, 0]} material={AM.skin}><sphereGeometry args={[0.105, 14, 12]} /></mesh>
                    {[-0.045, 0.045].map((x) => (
                        <group key={x} position={[x, 0.055, 0.095]}>
                            <mesh material={AM.eye}><sphereGeometry args={[0.011, 6, 6]} /></mesh>
                            <mesh position={[0, 0, 0.012]} material={AM.lens}><cylinderGeometry args={[0.032, 0.032, 0.006, 12]} /></mesh>
                            <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} material={AM.brass}><torusGeometry args={[0.032, 0.004, 5, 12]} /></mesh>
                        </group>
                    ))}
                    <mesh position={[0, 0.058, 0.108]} material={AM.brass}><boxGeometry args={[0.026, 0.005, 0.005]} /></mesh>
                    <mesh position={[0, 0.02, 0.11]} rotation={[1.3, 0, 0]} scale={[0.6, 1, 0.7]} material={AM.skin}><capsuleGeometry args={[0.015, 0.04, 3, 6]} /></mesh>
                    <mesh position={[0, -0.045, 0.095]} scale={[1, 0.22, 0.3]} material={AM.eye}><capsuleGeometry args={[0.017, 0.032, 3, 8]} /></mesh>
                    <mesh position={[0, 0.1, -0.015]} rotation={[0.22, 0, 0]} scale={[0.92, 0.5, 1.0]} material={AM.hair}><sphereGeometry args={[0.108, 14, 10]} /></mesh>
                </group>
            </group>
            {/* balão de fala (billboard) */}
            <mesh ref={bubbleM} position={[0, 1.95, 0]} visible={false}>
                <planeGeometry args={[1.7, 0.425]} />
                <meshBasicMaterial map={bubble.tex} transparent opacity={0} depthWrite={false} />
            </mesh>
        </group>
    );
};

export default Arquivista;
