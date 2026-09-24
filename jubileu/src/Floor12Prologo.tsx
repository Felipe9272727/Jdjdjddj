/**
 * Floor12Prologo.tsx — antes do elevador virar avião.
 *
 * Em PRIMEIRA PESSOA, dentro da cabine. O hóspede atravessa a cabine até a
 * porta, para, olha o mostrador subir de 11 para 12, a campainha toca e as
 * portas abrem — para o céu. Ele dá o passo, não há chão, e a câmera despenca
 * girando. Só então a cena corta para a cabine se desdobrando em avião.
 *
 * Não há corredor: o elevador é o cenário inteiro, então ele tem de ser
 * BONITO — o elevador de um grande hotel de 1930: painéis de nogueira
 * envernizada, frisos e corrimão de latão, espelho no fundo, piso de mármore
 * xadrez, luminária art déco em leque no teto e o mostrador de ponteiro em
 * meia-lua em cima da porta.
 *
 * A cabine fica 40 unidades acima da luta e atrás dela: pela porta aberta se
 * vê a cidade e a cabeça, e na queda, o cubo do elevador lá embaixo.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { meioY, ARENA, ALTURA_DA_CABECA } from './f12Boss';
import { tocarDing } from './floor12Sfx';

/** Duração do prólogo, em segundos. A intro antiga entra quando ele acaba. */
export const PROLOGO = 7.0;

/** Estado compartilhado: a câmera da luta cede o quadro enquanto isto vale. */
export const prologo = { ativo: false, t: 0 };

const ORIGEM = new THREE.Vector3(0, meioY() + 40, 34);
/** A cabeça do chefe no referencial da cabine. */
const CABECA_LOCAL = new THREE.Vector3(0, ALTURA_DA_CABECA, ARENA.zCabeca).sub(ORIGEM);
const L = 1.35;      // meia-largura da cabine
const FUNDO = 2.9;   // parede do fundo (z); a porta fica em z = 0
const ALTO = 3.0;
const OLHO = 1.62;

const ease = (x: number) => { const c = THREE.MathUtils.clamp(x, 0, 1); return c * c * (3 - 2 * c); };

/** Piso de mármore xadrez com veios, desenhado uma vez num canvas. */
function texturaDoPiso(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? '#1d1a1c' : '#e9e1d2';
        g.fillRect(i * 64, j * 64, 64, 64);
    }
    g.globalAlpha = .18; g.strokeStyle = '#8a7f72'; g.lineWidth = 1.2;
    for (let k = 0; k < 26; k++) {
        g.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (Math.random() - .3) * 40; y += (Math.random() - .5) * 30; g.lineTo(x, y); }
        g.stroke();
    }
    g.globalAlpha = 1; g.strokeStyle = '#b8893a'; g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.3, 1.4);
    t.anisotropy = 4;
    return t;
}

/**
 * A face do mostrador: 9 a 13 em volta da meia-lua, com o 12 em vermelho.
 * O ponteiro gira de +0,55 (o 11) a -0,62 (o 12); os números seguem a mesma
 * escala, então o que o jogador lê é o que o ponteiro marca.
 */
function texturaDoMostrador(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f3e7c8'; g.fillRect(0, 0, 256, 256);
    const passo = -1.17;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = 10; n <= 13; n++) {
        const rot = .55 + (n - 11) * passo * .72;
        if (Math.abs(rot) > 1.45) continue;
        const x = 128 - Math.sin(rot) * 88, y = 128 - Math.cos(rot) * 88;
        g.fillStyle = n === 12 ? '#9c1d1d' : '#2a1a12';
        g.font = `bold ${n === 12 ? 46 : 38}px Georgia, serif`;
        g.fillText(String(n), x, y);
        g.strokeStyle = '#2a1a12'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(128 - Math.sin(rot) * 118, 128 - Math.cos(rot) * 118);
        g.lineTo(128 - Math.sin(rot) * 108, 128 - Math.cos(rot) * 108); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** Aço escovado da porta: riscos verticais finos e um quadro rebaixado. */
function texturaDaPorta(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#8d9098'; g.fillRect(0, 0, 128, 256);
    for (let x = 0; x < 128; x++) {
        g.globalAlpha = .08 + Math.random() * .14;
        g.fillStyle = Math.random() > .5 ? '#c9ccd2' : '#5a5d64';
        g.fillRect(x, 0, 1, 256);
    }
    g.globalAlpha = 1;
    // o quadro rebaixado: sombra por baixo, luz por cima
    g.strokeStyle = '#4b4e55'; g.lineWidth = 4; g.strokeRect(14, 16, 100, 224);
    g.strokeStyle = '#c4c7cd'; g.lineWidth = 2; g.strokeRect(18, 20, 92, 216);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
}

/** Teto em caixotões: grade creme com filetes dourados. */
function texturaDoTeto(): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e6d8b8'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = 8 + i * 83, y = 8 + j * 83;
        const grad = g.createLinearGradient(x, y, x + 74, y + 74);
        grad.addColorStop(0, '#f4ead2'); grad.addColorStop(1, '#cdbb94');
        g.fillStyle = grad; g.fillRect(x, y, 74, 74);
        g.strokeStyle = '#b8893a'; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, 66, 66);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** O leque art déco da luminária e das portas: raios de latão numa geometria só. */
function leque(raio: number, n: number, abertura = Math.PI): THREE.BufferGeometry {
    const pos: number[] = [], nor: number[] = [];
    for (let i = 0; i < n; i++) {
        const a = -abertura / 2 + (i + .5) * abertura / n;
        const b = new THREE.BoxGeometry(.026, raio, .014).toNonIndexed();
        b.translate(0, raio / 2, 0); b.rotateZ(a);
        pos.push(...(b.getAttribute('position').array as Float32Array));
        nor.push(...(b.getAttribute('normal').array as Float32Array));
        b.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return out;
}

export const Floor12Prologo: React.FC<{ tempo: React.MutableRefObject<number> }> = ({ tempo }) => {
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);
    const raiz = useRef<THREE.Group>(null);
    const portaE = useRef<THREE.Group>(null), portaD = useRef<THREE.Group>(null);
    const ponteiro = useRef<THREE.Group>(null);
    const luzDaPorta = useRef<THREE.PointLight>(null);
    const botao12 = useRef<THREE.MeshStandardMaterial>(null);
    const ding = useRef(false);
    const tmp = useMemo(() => ({ pos: new THREE.Vector3(), alvo: new THREE.Vector3() }), []);

    const M = useMemo(() => ({
        nogueira: new THREE.MeshPhysicalMaterial({ color: '#5a2e1a', roughness: .38, clearcoat: .9, clearcoatRoughness: .12 }),
        nogueiraClara: new THREE.MeshPhysicalMaterial({ color: '#8a4f2c', roughness: .4, clearcoat: .9, clearcoatRoughness: .15 }),
        latao: new THREE.MeshStandardMaterial({ color: '#e0b155', metalness: .95, roughness: .22 }),
        espelho: new THREE.MeshStandardMaterial({ color: '#c9c2b8', metalness: 1, roughness: .05 }),
        aco: new THREE.MeshStandardMaterial({ map: texturaDaPorta(), metalness: .75, roughness: .34 }),
        piso: new THREE.MeshPhysicalMaterial({ map: texturaDoPiso(), roughness: .18, clearcoat: 1, clearcoatRoughness: .05 }),
        teto: new THREE.MeshStandardMaterial({ map: texturaDoTeto(), roughness: .55 }),
        luz: new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0cf').multiplyScalar(1.6), toneMapped: false }),
        mostrador: new THREE.MeshStandardMaterial({ color: '#f3e7c8', roughness: .5, emissive: '#f3d38a', emissiveIntensity: .35 }),
        numeros: new THREE.MeshStandardMaterial({ map: texturaDoMostrador(), roughness: .5, emissive: '#f3d38a', emissiveIntensity: .3, emissiveMap: texturaDoMostrador() }),
        luzFraca: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe4b8').multiplyScalar(.95) }),
        escuro: new THREE.MeshStandardMaterial({ color: '#1b1210', roughness: .6 }),
        veludo: new THREE.MeshStandardMaterial({ color: '#6d1624', roughness: .95 }),
    }), []);
    const G = useMemo(() => ({
        lequeTeto: leque(.9, 15),
        lequePorta: leque(.55, 9),
        painel: new THREE.BoxGeometry(1, 1, .04),
    }), []);

    useFrame((_, rawDt) => {
        const t = tempo.current;
        const ativo = t < PROLOGO;
        prologo.ativo = ativo; prologo.t = t;
        if (raiz.current) raiz.current.visible = ativo;
        if (!ativo) return;
        const dt = Math.min(rawDt, .05);

        // ── O MOSTRADOR: o ponteiro sobe de 11 para 12 enquanto ele espera ──
        const sobe = ease((t - 1.6) / 1.9);
        if (ponteiro.current) ponteiro.current.rotation.z = THREE.MathUtils.lerp(.55, .55 - 1.17 * .72, sobe) + Math.sin(t * 30) * .006 * (1 - sobe);
        if (botao12.current) botao12.current.emissiveIntensity = t < 3.6 ? 1.6 : Math.max(.2, 1.6 - (t - 3.6) * 2);

        // ── A PORTA ─────────────────────────────────────────────────────
        if (t > 3.6 && !ding.current) { ding.current = true; tocarDing(); }
        const abre = ease((t - 3.8) / 1.0);
        if (portaE.current) portaE.current.position.x = -.54 - abre * 1.08;
        if (portaD.current) portaD.current.position.x = .54 + abre * 1.08;
        if (luzDaPorta.current) luzDaPorta.current.intensity = abre * 5;

        // ── A CÂMERA: os olhos dele ──────────────────────────────────────
        const cam = tmp.pos, alvo = tmp.alvo;
        const retrato = size.width < size.height;
        let fov = retrato ? 66 : 58;
        const andar = ease(t / 2.2);
        let z = THREE.MathUtils.lerp(FUNDO - .2, 1.45, andar);
        // passo de gente: o balanço vertical e o lateral vêm do mesmo ciclo
        const passo = t < 2.2 ? (1 - andar * .6) : 0;
        let y = OLHO + Math.abs(Math.sin(t * 6.2)) * .045 * passo;
        let x = Math.sin(t * 3.1) * .025 * passo;
        // o olhar: para a frente andando; SOBE para o mostrador na espera;
        // volta para a porta quando ela faz "ding"
        const olhaMostrador = ease((t - 2.0) / .6) * (1 - ease((t - 3.7) / .5));
        let olhoY = THREE.MathUtils.lerp(OLHO - .1, 2.4, olhaMostrador);
        fov -= olhaMostrador * (retrato ? 22 : 12);
        let olhoZ = THREE.MathUtils.lerp(-3, .08, olhaMostrador);
        let roll = Math.sin(t * 3.1) * .01 * passo;
        // o passo para fora, e a queda
        const pisa = ease((t - 4.9) / .35);
        z -= pisa * 1.4;
        const cai = Math.max(0, t - 5.15);
        if (cai > 0) {
            y -= 4.9 * cai * cai;
            z -= cai * 1.3;
            // o olhar tomba para baixo, e ele gira sem controle
            const tomba = ease(cai / .7);
            // mira a CABEÇA lá embaixo: a queda é a revelação do chefe
            olhoY = THREE.MathUtils.lerp(y - 2, CABECA_LOCAL.y, tomba);
            olhoZ = THREE.MathUtils.lerp(z - 2.5, CABECA_LOCAL.z, tomba);
            roll = (retrato ? 2.4 : 1.2) * cai * cai * .8;
            x = Math.sin(cai * 5) * .3;
            fov += tomba * 10;
        }
        // Nos primeiros passos ele olha a cabine (a botoeira, os painéis e o
        // corrimão à direita) antes de encarar a porta: é o plano que mostra
        // o elevador, e não só a porta dele.
        const olhaEmVolta = cai > 0 ? 0 : 1 - ease((t - .6) / 1.3);
        cam.set(x, y, z);
        alvo.set(x * .5 + olhaEmVolta * 1.2, olhoY - olhaEmVolta * .3, olhoZ + olhaEmVolta * 3.1);
        camera.position.copy(cam).add(ORIGEM);
        camera.lookAt(alvo.add(ORIGEM));
        camera.rotateZ(roll);
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
            camera.updateProjectionMatrix();
        }
    });

    // ── A CABINE ─────────────────────────────────────────────────────────
    // Painéis de nogueira com moldura de latão, três por parede lateral.
    const painelLateral = (lado: 1 | -1) => [.55, 1.45, 2.35].map((pz) => (
        <group key={`${lado}${pz}`} position={[lado * (L - .03), 1.55, pz]} rotation={[0, -lado * Math.PI / 2, 0]}>
            <mesh geometry={G.painel} material={M.nogueiraClara} scale={[.78, 1.9, 1]} />
            <mesh material={M.latao} position={[0, .96, .02]}><boxGeometry args={[.8, .025, .03]} /></mesh>
            <mesh material={M.latao} position={[0, -.96, .02]}><boxGeometry args={[.8, .025, .03]} /></mesh>
            <mesh material={M.latao} position={[.4, 0, .02]}><boxGeometry args={[.025, 1.94, .03]} /></mesh>
            <mesh material={M.latao} position={[-.4, 0, .02]}><boxGeometry args={[.025, 1.94, .03]} /></mesh>
        </group>
    ));
    return (
        <group ref={raiz} position={ORIGEM.toArray()} name="prologo-elevador">
            <pointLight position={[0, 2.7, 1.9]} color="#ffe2b0" intensity={2.4} distance={7} decay={1.6} />
            <pointLight ref={luzDaPorta} position={[0, 1.6, -.6]} color="#ffb98a" intensity={0} distance={6} />
            <ambientLight intensity={.18} />

            {/* piso de mármore */}
            <mesh position={[0, 0, FUNDO / 2]} rotation={[-Math.PI / 2, 0, 0]} material={M.piso}><planeGeometry args={[L * 2, FUNDO]} /></mesh>
            {/* paredes laterais: nogueira escura, painéis, corrimão de latão */}
            {([-1, 1] as const).map((lado) => (
                <group key={lado}>
                    <mesh position={[lado * L, ALTO / 2, FUNDO / 2]} rotation={[0, -lado * Math.PI / 2, 0]} material={M.nogueira}>
                        <planeGeometry args={[FUNDO, ALTO]} />
                    </mesh>
                    {painelLateral(lado)}
                    <mesh material={M.latao} position={[lado * (L - .09), .95, FUNDO / 2]} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[.028, .028, FUNDO - .3, 16]} />
                    </mesh>
                    {[.5, FUNDO - .5].map((pz) => (
                        <mesh key={pz} material={M.latao} position={[lado * (L - .05), .95, pz]} rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[.014, .014, .08, 10]} />
                        </mesh>
                    ))}
                    {/* arandelas em leque entre os painéis */}
                    {[1.0, 1.9].map((pz) => (
                        <group key={pz} position={[lado * (L - .04), 2.2, pz]} rotation={[0, -lado * Math.PI / 2, 0]}>
                            <mesh material={M.luzFraca}><circleGeometry args={[.09, 24, 0, Math.PI]} /></mesh>
                            <mesh material={M.latao}><torusGeometry args={[.1, .012, 6, 24, Math.PI]} /></mesh>
                        </group>
                    ))}
                    <mesh material={M.latao} position={[lado * (L - .02), .1, FUNDO / 2]}><boxGeometry args={[.03, .2, FUNDO]} /></mesh>
                    <mesh material={M.latao} position={[lado * (L - .02), 2.62, FUNDO / 2]}><boxGeometry args={[.03, .05, FUNDO]} /></mesh>
                </group>
            ))}
            {/* fundo: espelho com moldura de latão */}
            <mesh position={[0, ALTO / 2, FUNDO]} rotation={[0, Math.PI, 0]} material={M.nogueira}><planeGeometry args={[L * 2, ALTO]} /></mesh>
            <mesh position={[0, 1.6, FUNDO - .02]} rotation={[0, Math.PI, 0]} material={M.espelho}><planeGeometry args={[1.9, 1.6]} /></mesh>
            {/* teto com a luminária em leque */}
            <mesh position={[0, ALTO, FUNDO / 2]} rotation={[Math.PI / 2, 0, 0]} material={M.teto}><planeGeometry args={[L * 2, FUNDO]} /></mesh>
            <group position={[0, ALTO - .02, 1.5]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh material={M.luz}><circleGeometry args={[.3, 40]} /></mesh>
                <mesh material={M.latao} geometry={G.lequeTeto} />
                <mesh material={M.latao} geometry={G.lequeTeto} rotation={[0, 0, Math.PI]} />
                <mesh material={M.latao}><torusGeometry args={[.92, .025, 8, 64]} /></mesh>
            </group>

            {/* ── A FRENTE: moldura, mostrador e as portas ── */}
            {([-1, 1] as const).map((lado) => (
                <mesh key={lado} material={M.nogueira} position={[lado * 1.65, ALTO / 2, 0]}><boxGeometry args={[1.2, ALTO, .14]} /></mesh>
            ))}
            <mesh material={M.nogueira} position={[0, 2.72, 0]}><boxGeometry args={[4.5, .56, .14]} /></mesh>
            {/* o poço atrás das portas: bolsos escuros onde elas se recolhem */}
            {([-1, 1] as const).map((lado) => (
                <mesh key={`b${lado}`} material={M.escuro} position={[lado * 1.65, 1.25, -.2]}><boxGeometry args={[1.25, 2.5, .04]} /></mesh>
            ))}
            <mesh material={M.latao} position={[0, 2.44, .08]}><boxGeometry args={[2.14, .04, .04]} /></mesh>
            {([-1, 1] as const).map((lado) => (
                <mesh key={lado} material={M.latao} position={[lado * 1.05, 1.22, .08]}><boxGeometry args={[.04, 2.44, .04]} /></mesh>
            ))}
            {/* o mostrador em meia-lua */}
            <group position={[0, 2.5, .08]}>
                <mesh material={M.numeros}><circleGeometry args={[.26, 40, 0, Math.PI]} /></mesh>
                <mesh material={M.latao}><torusGeometry args={[.26, .018, 8, 40, Math.PI]} /></mesh>
                <group ref={ponteiro} position={[0, 0, .012]}>
                    <mesh material={M.escuro} position={[0, .11, 0]}><boxGeometry args={[.012, .22, .004]} /></mesh>
                </group>
                <mesh material={M.latao} position={[0, 0, .016]}><circleGeometry args={[.03, 16]} /></mesh>
            </group>
            {/* botoeira de latão ao lado da porta */}
            <group position={[1.2, 1.25, .1]}>
                <mesh material={M.latao}><boxGeometry args={[.2, .7, .02]} /></mesh>
                {Array.from({ length: 6 }, (_, i) => (
                    <mesh key={i} position={[0, .25 - i * .1, .015]} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[.028, .028, .02, 20]} />
                        {i === 0
                            ? <meshStandardMaterial ref={botao12} color="#ffd79a" emissive="#ffb347" emissiveIntensity={1.6} />
                            : <meshStandardMaterial color="#f2e6cc" roughness={.4} />}
                    </mesh>
                ))}
            </group>
            {/* as portas: aço escovado com o leque de latão gravado */}
            {([-1, 1] as const).map((lado) => (
                <group key={lado} ref={lado < 0 ? portaE : portaD} position={[lado * .54, 1.22, -.1]}>
                    <mesh material={M.aco}><boxGeometry args={[1.12, 2.46, .05]} /></mesh>
                    {/* o arco de latão do leque */}
                    <mesh material={M.latao} position={[-lado * .56, -.2, .03]} rotation={[0, 0, -lado * Math.PI / 2]}>
                        <torusGeometry args={[.56, .02, 8, 32, Math.PI]} />
                    </mesh>
                    <group position={[-lado * .56, -.2, .03]}>
                        <mesh material={M.latao} geometry={G.lequePorta} rotation={[0, 0, -lado * Math.PI / 2]} />
                    </group>
                    <mesh material={M.latao} position={[0, .9, .03]}><boxGeometry args={[.92, .03, .01]} /></mesh>
                    <mesh material={M.latao} position={[0, -1.0, .03]}><boxGeometry args={[.92, .03, .01]} /></mesh>
                </group>
            ))}
            {/* a soleira e o tapete de veludo */}
            <mesh material={M.latao} position={[0, .01, -.05]}><boxGeometry args={[2.1, .02, .2]} /></mesh>
            <mesh material={M.veludo} position={[0, .006, 1.6]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.3, 1.9]} /></mesh>
        </group>
    );
};
