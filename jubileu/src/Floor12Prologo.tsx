/**
 * Floor12Prologo.tsx — antes do elevador virar avião.
 *
 * A introdução começava na primeira pessoa, dentro da cabine, no escuro. O
 * dono do jogo pediu o que vem ANTES: ver o hóspede andando até o elevador,
 * a porta abrindo para o nada e ele caindo. Só então a cena corta para dentro
 * da cabine, e a transformação (que já funcionava) segue igual.
 *
 * Linguagem de câmera, em ordem:
 *   1. travelling baixo por trás, com balanço de câmera na mão — é o hóspede
 *      indo para o trabalho, cansado;
 *   2. corte em ângulo de três quartos pela frente, empurrando devagar — a
 *      porta está atrás dele no quadro e o "ding" chega antes do rosto;
 *   3. contraplano por cima do ombro: a porta abre e do outro lado é CÉU, com
 *      a cabeça ao longe;
 *   4. ele dá o passo, o chão não existe, e a câmera tomba para olhar para
 *      baixo enquanto ele cai girando em direção às nuvens.
 *
 * O corredor fica 40 unidades acima da luta e atrás dela, então quem cai vê a
 * cidade, a cabeça e o cubo do elevador lá embaixo — que é para onde ele vai.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Avatar64, useAvatarRefs } from './Floor5Player64';
import { meioY } from './f12Boss';
import { tocarDing } from './floor12Sfx';

/** Duração do prólogo, em segundos. A intro antiga começa quando ele acaba. */
export const PROLOGO = 6.5;

/** Estado compartilhado: a câmera da luta cede o quadro enquanto isto vale. */
export const prologo = { ativo: false, t: 0 };

const ORIGEM = new THREE.Vector3(0, meioY() + 40, 34);
/** Porta do elevador (z local). O corredor vai de +12 até aqui. */
const PORTA_Z = 0;
const PASSO_ATE = 4.35;   // quando ele chega na porta e pisa no vazio

const ease = (x: number) => { const c = THREE.MathUtils.clamp(x, 0, 1); return c * c * (3 - 2 * c); };

export const Floor12Prologo: React.FC<{ tempo: React.MutableRefObject<number> }> = ({ tempo }) => {
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);
    const raiz = useRef<THREE.Group>(null);
    const portaE = useRef<THREE.Mesh>(null), portaD = useRef<THREE.Mesh>(null);
    const luzDaPorta = useRef<THREE.PointLight>(null);
    const av = useAvatarRefs();
    const ding = useRef(false);
    const tmp = useMemo(() => ({ pos: new THREE.Vector3(), alvo: new THREE.Vector3() }), []);

    const mats = useMemo(() => ({
        parede: new THREE.MeshStandardMaterial({ color: '#7b3b3a', roughness: .8 }),
        rodape: new THREE.MeshStandardMaterial({ color: '#3a2420', roughness: .6 }),
        tapete: new THREE.MeshStandardMaterial({ color: '#5c1f2a', roughness: .95 }),
        friso: new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: .35, metalness: .7 }),
        teto: new THREE.MeshStandardMaterial({ color: '#e8dcc4', roughness: .9 }),
        portaQuarto: new THREE.MeshStandardMaterial({ color: '#4a2c1e', roughness: .55 }),
        aco: new THREE.MeshStandardMaterial({ color: '#b8bcc4', roughness: .25, metalness: .85 }),
        arandela: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79a').multiplyScalar(1.8), toneMapped: false }),
    }), []);

    useFrame((_, rawDt) => {
        const t = tempo.current;
        const ativo = t < PROLOGO;
        prologo.ativo = ativo; prologo.t = t;
        if (raiz.current) raiz.current.visible = ativo;
        if (!ativo) return;
        const dt = Math.min(rawDt, .05);

        // ── O HÓSPEDE ─────────────────────────────────────────────────
        // Anda em ritmo de gente (1,5 u/s), desacelera nos últimos passos,
        // hesita meio segundo diante da porta aberta e pisa no vazio.
        const andar = Math.min(t, 3.4);
        let z = Math.max(PORTA_Z + .6, 7.5 - andar * 1.9 - Math.max(0, t - 3.4) * .5);
        let y = 0;
        const caindo = Math.max(0, t - PASSO_ATE);
        if (caindo > 0) { z -= Math.min(caindo, .5) * 2.4; y = -4.9 * caindo * caindo; }
        const root = av.root.current;
        if (root) {
            root.position.set(0, y, z);
            root.rotation.set(caindo * 2.2, Math.PI, caindo * .9);
        }
        const fase = t * 7.2;
        const ritmo = t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) * 1.6);
        const set = (g: React.MutableRefObject<THREE.Group | null>, rx: number) => { if (g.current) g.current.rotation.x = rx; };
        if (caindo > 0) {
            set(av.armL, -2.6 + Math.sin(t * 20) * .4); set(av.armR, -2.4 - Math.sin(t * 20) * .4);
            set(av.legL, -.8 + Math.sin(t * 17) * .5); set(av.legR, -.3 - Math.sin(t * 17) * .5);
        } else {
            set(av.legL, Math.sin(fase) * .7 * ritmo); set(av.legR, -Math.sin(fase) * .7 * ritmo);
            set(av.armL, -Math.sin(fase) * .5 * ritmo); set(av.armR, Math.sin(fase) * .5 * ritmo);
            if (av.body.current) av.body.current.position.y = Math.abs(Math.sin(fase)) * .06 * ritmo;
            // ele olha para a porta quando ela faz "ding"
            if (av.head.current) av.head.current.rotation.x = t > 3.1 ? -.12 * ease((t - 3.1) / .4) : .08;
        }
        if (av.shadow.current) av.shadow.current.visible = caindo === 0;

        // ── A PORTA ────────────────────────────────────────────────────
        if (t > 3.0 && !ding.current) { ding.current = true; tocarDing(); }
        const abre = ease((t - 3.2) / 1.0);
        if (portaE.current) portaE.current.position.x = -.62 - abre * 1.8;
        if (portaD.current) portaD.current.position.x = .62 + abre * 1.8;
        if (luzDaPorta.current) luzDaPorta.current.intensity = abre * 14;

        // ── A CÂMERA ───────────────────────────────────────────────────
        // Balanço de câmera na mão: dois senos fora de fase, pequenos.
        const mao = (a: number) => Math.sin(t * 1.7 + a) * .035 + Math.sin(t * 3.1 + a * 2) * .018;
        const cam = tmp.pos, alvo = tmp.alvo;
        // Em pé a lente é estreita: a câmera recua para o corpo caber.
        const r = size.width < size.height ? 1.55 : 1;
        let fov = 50;
        if (t < 2.2) {
            // 1. travelling baixo por trás
            cam.set((r > 1 ? 1.05 : .55) + mao(0), .95 + (r - 1) * .7 + mao(1), z + 2.9 * r);
            alvo.set(0, 1.3, z - 4);
        } else if (t < 3.0) {
            // 2. três quartos pela frente, empurrando
            const k = ease((t - 2.2) / .8);
            cam.set(-1.2 + k * .15 + mao(2), 1.25 + mao(3), PORTA_Z + .6 - k * .2);
            fov = (r > 1 ? 60 : 44) - k * 4;
            alvo.set(0, 1.3, z);
        } else if (t < PASSO_ATE + .15) {
            // 3. por cima do ombro: a porta abre para o céu
            cam.set(1.2 + mao(4), 2.35 + mao(5), z + 2.2 * r);
            alvo.set(0, .6, PORTA_Z - 12);
            fov = r > 1 ? 62 : 52;
        } else {
            // 4. a queda: a câmera vai à beira e tomba para baixo
            // e depois MERGULHA atrás dele: céu vazio com um cisco caindo lia
            // como tela de carregamento. A câmera cai junto, um pouco acima.
            const k = ease((t - PASSO_ATE - .15) / .8);
            const seg = ease((t - PASSO_ATE - .7) / .6);
            cam.set(mao(6) * 2 + seg * 1.2, THREE.MathUtils.lerp(1.9 - k * .6, y + 3.2, seg), PORTA_Z + .4 - k * .9 + seg * 1.6);
            alvo.set(0, y + .6 - seg * 1.5, z - .2 - (1 - k) * 6);
            fov = 52 + k * 14;
        }
        camera.position.copy(cam).add(ORIGEM);
        camera.lookAt(alvo.add(ORIGEM));
        camera.rotation.z += mao(7) * .6;
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
            camera.updateProjectionMatrix();
        }
    });

    // Os pedaços do corredor: paredes de 12 de comprimento, portas de quarto,
    // arandelas acesas — o hotel de sempre, antes de o céu entrar pela porta.
    const quartos = [3, 6.5, 10];
    return (
        <group ref={raiz} position={ORIGEM.toArray()} name="prologo">
            <pointLight position={[0, 2.6, 6]} color="#ffcf8a" intensity={9} distance={14} />
            <pointLight ref={luzDaPorta} position={[0, 1.4, -1]} color="#ffb98a" intensity={0} distance={9} />
            <ambientLight intensity={.25} />
            {/* chão (tapete) e teto */}
            <mesh position={[0, 0, 6.2]} rotation={[-Math.PI / 2, 0, 0]} material={mats.tapete}><planeGeometry args={[3.2, 12.4]} /></mesh>
            <mesh position={[0, 3, 6.2]} rotation={[Math.PI / 2, 0, 0]} material={mats.teto}><planeGeometry args={[3.2, 12.4]} /></mesh>
            {[-1, 1].map((lado) => (
                <group key={lado}>
                    <mesh position={[lado * 1.6, 1.5, 6.2]} rotation={[0, -lado * Math.PI / 2, 0]} material={mats.parede}><planeGeometry args={[12.4, 3]} /></mesh>
                    <mesh position={[lado * 1.57, .08, 6.2]} material={mats.rodape}><boxGeometry args={[.06, .16, 12.4]} /></mesh>
                    <mesh position={[lado * 1.57, 2.2, 6.2]} material={mats.friso}><boxGeometry args={[.04, .05, 12.4]} /></mesh>
                    {quartos.map((qz) => (
                        <group key={qz}>
                            <mesh position={[lado * 1.56, 1.05, qz]} material={mats.portaQuarto}><boxGeometry args={[.08, 2.1, .95]} /></mesh>
                            <mesh position={[lado * 1.5, 1.0, qz + .32]} material={mats.friso}><sphereGeometry args={[.05, 12, 8]} /></mesh>
                            <mesh position={[lado * 1.55, 2.0, qz + 1.4]} material={mats.arandela}><sphereGeometry args={[.11, 14, 10]} /></mesh>
                        </group>
                    ))}
                </group>
            ))}
            {/* a parede do fundo, com o vão do elevador */}
            {[-1, 1].map((lado) => (
                <mesh key={lado} position={[lado * 1.35, 1.5, PORTA_Z]} material={mats.parede}><boxGeometry args={[.5, 3, .2]} /></mesh>
            ))}
            <mesh position={[0, 2.75, PORTA_Z]} material={mats.parede}><boxGeometry args={[2.2, .5, .2]} /></mesh>
            <mesh position={[0, 2.52, PORTA_Z + .12]} material={mats.friso}><boxGeometry args={[2.3, .06, .06]} /></mesh>
            {/* a seta de latão acesa em cima da porta */}
            <mesh position={[0, 2.78, PORTA_Z + .12]} material={mats.arandela}><coneGeometry args={[.09, .16, 3]} /></mesh>
            <mesh ref={portaE} position={[-.62, 1.25, PORTA_Z - .14]} material={mats.aco}><boxGeometry args={[1.22, 2.5, .06]} /></mesh>
            <mesh ref={portaD} position={[.62, 1.25, PORTA_Z - .14]} material={mats.aco}><boxGeometry args={[1.22, 2.5, .06]} /></mesh>
            <Avatar64 refs={av} />
        </group>
    );
};
