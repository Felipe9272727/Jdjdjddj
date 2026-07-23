/**
 * Floor8Cutscene.tsx — a DIREÇÃO DE CÂMERA do Andar 8 (molde Floor7IntroCutscene).
 *
 * Montado DEPOIS do <Player> no Canvas: o useFrame de prioridade 0 roda depois
 * e sobrescreve a câmera enquanto uma cena está ativa. Três cenas:
 *
 *  INTERROGATÓRIO — um plano por fala (corte seco entre falas, como montagem
 *    de cinema): over-shoulder de apresentação, plano médio no livro-tombo,
 *    INSERT na fotografia erguida, perfis laterais nas falas do player,
 *    dolly-in lento com dutch no "…você é o escolhido", contra-plongée nos
 *    dois monólogos e plongée na mesa quando a imagem desliza.
 *  DESPERTAR — a câmera acorda NO CHÃO olhando a lâmpada balançar, rolando
 *    tonta; sobe um degrau a cada fala até ficar de pé encarando o Arquivista.
 *  ARREMESSO — ele te ergue: a câmera sobe, treme e rola enquanto o overlay
 *    DOM gira e apaga.
 *
 * Fora dessas fases o componente não toca a câmera (o Player retoma; o FOV
 * ele mesmo re-lerpa). camera.up é restaurado no hand-off.
 */
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { f8, f8ArqWorld, F8_DESPERTAR_LINES } from './f8Arquivo';

const smooth = (a: number, b: number, t: number) => {
    const k = Math.max(0, Math.min(1, t)); const e = k * k * (3 - 2 * k); return a + (b - a) * e;
};

// marcas fixas da sala (world): mesa em z=-1.6, lâmpada pendendo sobre ela
const LAMP: [number, number, number] = [0, 1.98, -1.6];
const IMG_DESK: [number, number, number] = [0.1, 1.0, -1.75];

/** Um plano do interrogatório: posição/alvo iniciais e finais (drift lento
 *  dentro da fala), fov e dutch (roll). Alvo padrão = o rosto do Arquivista. */
interface Shot {
    p0: [number, number, number]; p1: [number, number, number];
    t0?: [number, number, number]; t1?: [number, number, number];
    fov: number; roll?: number;
    /** duração do drift (s) — depois disso o plano segura parado */
    dur?: number;
}

// os 9 planos do interrogatório, um por fala (índice = f8.line)
const SHOTS: Shot[] = [
    // 0 "Chegou." — over-shoulder de apresentação, dolly-in devagar
    { p0: [1.45, 1.6, -3.9], p1: [1.15, 1.55, -3.25], fov: 44, dur: 6 },
    // 1 "ficha em BRANCO" — plano médio frontal; ele consulta o livro
    { p0: [-0.9, 1.52, -2.6], p1: [-0.76, 1.49, -2.4], fov: 40, dur: 6 },
    // 2 a FOTOGRAFIA — insert: a câmera desce pro nível da foto ao lado do rosto
    { p0: [-0.14, 1.44, -2.25], p1: [-0.1, 1.32, -1.7], t0: [-0.16, 1.4, -0.7], t1: [-0.18, 1.32, -0.82], fov: 34, dur: 5 },
    // 3 "…essa fotografia não é minha." — perfil lateral (two-shot da mesa)
    { p0: [2.75, 1.5, -2.35], p1: [2.5, 1.47, -2.3], t0: [0, 1.22, -1.5], t1: [0, 1.22, -1.5], fov: 42, dur: 7 },
    // 4 "objetivo maior" — perfil do outro lado
    { p0: [-2.75, 1.45, -2.5], p1: [-2.52, 1.44, -2.42], t0: [0, 1.22, -1.55], t1: [0, 1.22, -1.55], fov: 42, dur: 7 },
    // 5 "…você é o escolhido." — dolly-in LENTO até o rosto, dutch sutil
    { p0: [0.38, 1.46, -2.75], p1: [0.13, 1.42, -1.5], fov: 35, roll: 0.05, dur: 8 },
    // 6 "Apagou VOCÊ" — leve contra-plongée acima da tralha da mesa
    { p0: [0.75, 1.3, -2.5], p1: [0.62, 1.33, -2.3], t0: [0.05, 1.52, -0.58], t1: [0.05, 1.52, -0.58], fov: 42, dur: 6 },
    // 7 "lembrar de SI" — 3/4 fechado do outro lado
    { p0: [-0.48, 1.18, -2.15], p1: [-0.3, 1.26, -1.78], t0: [0, 1.46, -0.6], t1: [0, 1.44, -0.6], fov: 37, dur: 6 },
    // 8 a imagem desliza — plongée na mesa (o objeto vira o assunto)
    { p0: [0.72, 2.12, -2.8], p1: [0.55, 2.0, -2.6], t0: [0.05, 1.0, -1.55], t1: IMG_DESK, fov: 44, dur: 6 },
];

const Floor8Cutscene: React.FC<{ playerPositionRef: React.MutableRefObject<THREE.Vector3> }> = ({ playerPositionRef }) => {
    const { camera } = useThree();
    const wasActive = useRef(false);
    const lastLine = useRef(-1);
    const lastPhase = useRef('');
    const tShot = useRef(0);          // segundos dentro do plano atual
    const camPos = useRef(new THREE.Vector3());
    const camLook = useRef(new THREE.Vector3());
    const _p = useRef(new THREE.Vector3());
    const _t = useRef(new THREE.Vector3());

    useFrame((_s, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const ph = f8.phase;
        const wakeTalking = ph === 'despertar' && f8.line < F8_DESPERTAR_LINES.length;
        const active = ph === 'interrogatorio' || wakeTalking || ph === 'arremesso';
        if (!active) {
            if (wasActive.current) {
                camera.up.set(0, 1, 0);          // devolve o horizonte ao Player
                wasActive.current = false;
                lastLine.current = -1; lastPhase.current = '';
            }
            return;
        }

        const P = _p.current, T = _t.current;
        const pl = playerPositionRef.current;
        let fov = 42, roll = 0, lerp = 0.14, snap = false;

        // corte seco quando muda a fala ou a fase
        if (f8.line !== lastLine.current || ph !== lastPhase.current) {
            lastLine.current = f8.line; lastPhase.current = ph;
            tShot.current = 0; snap = true;
        }
        tShot.current += dt;
        const ts = tShot.current;

        if (ph === 'interrogatorio') {
            const sh = SHOTS[Math.min(f8.line, SHOTS.length - 1)];
            const k = smooth(0, 1, ts / (sh.dur ?? 6));
            P.set(
                sh.p0[0] + (sh.p1[0] - sh.p0[0]) * k,
                sh.p0[1] + (sh.p1[1] - sh.p0[1]) * k,
                sh.p0[2] + (sh.p1[2] - sh.p0[2]) * k,
            );
            const t0 = sh.t0 ?? [f8ArqWorld.x, f8ArqWorld.y + 1.42, f8ArqWorld.z];
            const t1 = sh.t1 ?? t0;
            T.set(
                t0[0] + (t1[0] - t0[0]) * k,
                t0[1] + (t1[1] - t0[1]) * k,
                t0[2] + (t1[2] - t0[2]) * k,
            );
            fov = sh.fov; roll = sh.roll ?? 0;
            // handheld sutil — o plano respira
            P.x += Math.sin(ts * 0.55 + f8.line) * 0.022;
            P.y += Math.sin(ts * 0.72 + f8.line * 2) * 0.016;
        } else if (wakeTalking) {
            // DESPERTAR — do chão à vertical, um degrau por fala
            const L = f8.line;
            if (L === 0) {
                // no chão, tonto: olhando a lâmpada balançar, rolando
                P.set(0.35, 0.42 + Math.sin(ts * 0.5) * 0.03, -3.05);
                T.set(LAMP[0] + Math.sin(ts * 0.62) * 0.25, LAMP[1], LAMP[2] + Math.sin(ts * 0.41) * 0.15);
                fov = 58; roll = Math.sin(ts * 0.7) * 0.2; lerp = 0.08;
            } else if (L === 1) {
                // meio erguido: o Arquivista guardando a imagem
                P.set(0.22, 0.98, -3.15);
                T.set(f8ArqWorld.x, f8ArqWorld.y + 1.3, f8ArqWorld.z);
                fov = 48; roll = Math.sin(ts * 0.6) * 0.08; lerp = 0.07;
            } else {
                // "Você está pronto." — de pé, cara a cara, perto DEMAIS
                P.set(0.06, 1.4, -1.72);
                T.set(f8ArqWorld.x, f8ArqWorld.y + 1.41, f8ArqWorld.z);
                fov = 36; roll = 0.02; lerp = 0.07;
            }
        } else {
            // ARREMESSO — erguido pelo casaco: sobe, treme, rola; o DOM gira por cima
            const k = Math.min(1, ts / 1.6);
            const shake = k * k * 0.08;
            P.set(
                pl.x + Math.sin(ts * 31) * shake,
                1.55 + k * 1.15 + Math.sin(ts * 27) * shake,
                pl.z + Math.cos(ts * 29) * shake,
            );
            T.set(f8ArqWorld.x, f8ArqWorld.y + 1.5 + k * 0.4, f8ArqWorld.z);
            fov = 46 + k * 10; roll = k * 0.35; lerp = 0.2;
        }

        if (!wasActive.current) { wasActive.current = true; snap = true; }
        const a = snap ? 1 : 1 - Math.pow(1 - lerp, dt * 60);
        camPos.current.lerp(P, a);
        camLook.current.lerp(T, a);
        camera.up.set(Math.sin(roll), Math.cos(roll), 0);
        camera.position.copy(camPos.current);
        camera.lookAt(camLook.current);
        const cam = camera as THREE.PerspectiveCamera;
        cam.fov += (fov - cam.fov) * a; cam.updateProjectionMatrix();
    });

    return null;
};

export default Floor8Cutscene;
