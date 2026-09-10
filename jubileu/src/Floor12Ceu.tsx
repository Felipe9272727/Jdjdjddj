/**
 * Floor12Ceu.tsx — o céu do andar 12, e o hotel lá embaixo.
 *
 * ── POR QUE UM CÉU PRECISA DE TRABALHO ───────────────────────────────────────
 *
 * Num jogo de nave a câmera quase não se mexe: o avião anda num plano e o fundo
 * fica. Sem paralaxe, o jogador não tem NENHUMA pista de que está voando — a
 * luta acontece num papel de parede. As camadas aqui existem só para dar essa
 * pista, e por isso elas correm em velocidades diferentes: as nuvens de baixo
 * passam depressa, as de cima quase param, e o hotel lá no fundo praticamente
 * não anda.
 *
 * ── E POR QUE ELE É BARATO ───────────────────────────────────────────────────
 *
 * Cada nuvem é UM sprite de bilhete (plano sempre virado para a câmera), não
 * uma malha. São dezenas delas, e a regra número um do dono do jogo é
 * velocidade no celular: dezenas de esferas custariam o andar inteiro. A
 * textura é desenhada uma vez num canvas e compartilhada por todas.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mat64 } from './Floor5Player64';
import { ARENA, f12 } from './f12Boss';

/** A nuvem N64: um borrão de bordas duras, não um algodão suave. */
const texturaDaNuvem: THREE.CanvasTexture = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 128, 64);
    g.fillStyle = '#ffffff';
    // três bolotas sobrepostas, com a de baixo mais larga: silhueta de desenho
    const bolotas: [number, number, number][] = [[42, 40, 22], [70, 34, 26], [96, 42, 18]];
    for (const [x, y, r] of bolotas) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillRect(34, 40, 72, 20);
    // sombra chapada embaixo — duas cores, como todo o resto do andar
    g.fillStyle = '#cfd9e6';
    g.fillRect(34, 52, 72, 8);
    for (const [x, , r] of bolotas) { g.beginPath(); g.arc(x, 52, r * 0.7, 0, Math.PI); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    return t;
})();

interface Camada {
    /** Quantas nuvens. */
    n: number;
    /** Profundidade. */
    z: number;
    /** Velocidade com que passam (unidades por segundo). */
    v: number;
    escala: number;
    opacidade: number;
    /** Faixa de altura em que esta camada pode nascer. */
    yDe: number;
    yAte: number;
}

/**
 * ── NUVEM NENHUMA PODE PASSAR NA FRENTE DA LUTA ──────────────────────────────
 *
 * A primeira versão tinha três camadas em z = 6, −9 e −34, com o avião em 0 e a
 * cabeça em −26. Na foto o estrago foi imediato: a camada do meio ficava ENTRE
 * o avião e o chefe e tapava a boca dele — que é exatamente a única coisa que o
 * jogador precisa vigiar, porque é o telegrafo do ataque e o ponto fraco. Uma
 * nuvem bonita escondendo a regra do jogo.
 *
 * As camadas de trás vão todas para ATRÁS da cabeça (z < −36). A sensação de
 * velocidade, que era o trabalho da camada da frente, passa a vir de nuvens
 * correndo POR BAIXO da arena: elas ficam na frente em Z, mas fora do caminho
 * em Y, então dão o mesmo empurrão sem cobrir nada.
 */
const CAMADAS: ReadonlyArray<Camada> = Object.freeze([
    { n: 12, z: 8, v: 17.0, escala: 3.0, opacidade: 0.95, yDe: ARENA.yBaixo - 9, yAte: ARENA.yBaixo - 1.6 },
    { n: 13, z: -40, v: 6.5, escala: 6.0, opacidade: 0.85, yDe: ARENA.yBaixo - 3, yAte: ARENA.yAlto + 7 },
    { n: 10, z: -66, v: 2.6, escala: 10.0, opacidade: 0.6, yDe: ARENA.yBaixo - 6, yAte: ARENA.yAlto + 12 },
]);

/** Sorteio estável: o mesmo céu em toda partida, e sem `Math.random` no quadro. */
function baralho(semente: number): () => number {
    let s = semente | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const LIMITE_X = 34;

const Nuvens: React.FC<{ camada: Camada; semente: number }> = ({ camada, semente }) => {
    const grupo = useRef<THREE.Group>(null);
    const material = useMemo(() => new THREE.MeshBasicMaterial({
        map: texturaDaNuvem, transparent: true, opacity: camada.opacidade,
        depthWrite: false, fog: false,
    }), [camada.opacidade]);
    const pontos = useMemo(() => {
        const r = baralho(semente);
        return Array.from({ length: camada.n }, () => ({
            x: (r() * 2 - 1) * LIMITE_X,
            y: camada.yDe + r() * (camada.yAte - camada.yDe),
            e: camada.escala * (0.65 + r() * 0.7),
        }));
    }, [camada, semente]);

    useFrame((_, rawDt) => {
        const g = grupo.current; if (!g) return;
        const dt = Math.min(rawDt, 0.05);
        for (const filho of g.children) {
            // Andam para +X: o avião voa para -Z, então o cenário passa de lado.
            filho.position.x += camada.v * dt;
            if (filho.position.x > LIMITE_X) filho.position.x -= LIMITE_X * 2;
        }
    });

    return (
        <group ref={grupo}>
            {pontos.map((p, i) => (
                <mesh key={i} position={[p.x, p.y, camada.z]} material={material}>
                    <planeGeometry args={[p.e * 2, p.e]} />
                </mesh>
            ))}
        </group>
    );
};

/**
 * O HOTEL, lá embaixo e muito longe.
 *
 * É a única coisa do andar 12 que amarra a luta ao resto do jogo: o jogador
 * está voando ACIMA do prédio em que passou onze andares. Uma torre magra com
 * janelas acesas, pequena o bastante para caber no fundo sem competir com a
 * cabeça.
 */
const Hotel: React.FC = () => {
    const M = useMemo(() => ({
        parede: mat64('#4a4453'),
        parede2: mat64('#3b3644'),
        janela: mat64('#ffd98a', '#ffd98a', 0.7),
        telhado: mat64('#2b2733'),
    }), []);
    const janelas = useMemo(() => {
        const fora: [number, number][] = [];
        for (let andar = 0; andar < 11; andar++) {
            for (let col = 0; col < 3; col++) {
                // nem toda janela acesa: um hotel cheio não seria este hotel
                if ((andar * 3 + col) % 4 === 1) continue;
                fora.push([(col - 1) * 1.5, andar * 1.55 + 1.2]);
            }
        }
        return fora;
    }, []);
    return (
        // Canto de baixo, à ESQUERDA, e muito longe. Nas duas primeiras
        // montagens ele ficou plantado atrás da cabeça e os dois se misturavam
        // num borrão roxo — a torre saía literalmente do queixo do chefe. Ele é
        // ambientação e não pode disputar o centro do quadro.
        <group position={[-24, -75, -160]} scale={2.2}>
            <mesh material={M.parede} position={[0, 9, 0]}>
                <boxGeometry args={[6, 18, 6]} />
            </mesh>
            <mesh material={M.parede2} position={[0, 9, 3.05]}>
                <boxGeometry args={[5.2, 17.4, 0.2]} />
            </mesh>
            <mesh material={M.telhado} position={[0, 18.3, 0]}>
                <boxGeometry args={[7, 0.8, 7]} />
            </mesh>
            {janelas.map(([x, y], i) => (
                <mesh key={i} material={M.janela} position={[x, y, 3.2]}>
                    <boxGeometry args={[0.75, 0.95, 0.1]} />
                </mesh>
            ))}
        </group>
    );
};

/**
 * O céu inteiro.
 *
 * `sombrio` escurece tudo depois da virada — é o sinal ambiente de que a luta
 * mudou de patamar, e ele custa uma interpolação de cor por quadro, não um
 * segundo cenário.
 */
export const Floor12Ceu: React.FC = () => {
    const fundo = useRef<THREE.Color>(new THREE.Color('#7ec0ef'));
    const alvo = useMemo(() => ({
        claro: new THREE.Color('#7ec0ef'),
        sombrio: new THREE.Color('#3a3f66'),
    }), []);

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const querSombrio = f12.passouDaVirada;
        fundo.current.lerp(querSombrio ? alvo.sombrio : alvo.claro, Math.min(1, dt * 0.7));
        const cena = state.scene;
        if (cena.background instanceof THREE.Color) cena.background.copy(fundo.current);
        if (cena.fog instanceof THREE.Fog) cena.fog.color.copy(fundo.current);
    });

    return (
        <group>
            {/* Luz chapada: o andar 5 é lambert com flatShading, e a cabeça herda
                isso. Uma direcional forte com hemisférica de apoio dá o volume
                sem custar sombra nenhuma (não há shadow map neste Canvas). */}
            <hemisphereLight args={['#dff0ff', '#5a5570', 1.0]} />
            <directionalLight position={[6, 14, 8]} intensity={1.25} />
            <directionalLight position={[-8, 4, -10]} intensity={0.45} />
            {CAMADAS.map((c, i) => <Nuvens key={i} camada={c} semente={0x1234 + i * 7919} />)}
            <Hotel />
        </group>
    );
};

export default Floor12Ceu;
