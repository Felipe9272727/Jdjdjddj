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
import { ARENA, f12, xParaFracao, yParaFracao, larguraDoQuadro, ENQUADRAMENTO } from './f12Boss';

/**
 * ── O CÉU DEIXOU DE SER UMA COR CHAPADA ──────────────────────────────────────
 *
 * `scene.background` era um `THREE.Color`: um azul liso de horizonte a horizonte.
 * Na referência que o dono do jogo mandou, o que faz o céu parecer um LUGAR é
 * justamente o que uma cor chapada não tem — sol de um lado, o azul ficando mais
 * fundo no alto, horizonte claro. Isso custa UMA textura de 256 px desenhada uma
 * vez, num domo virado do avesso. Sem shader, sem postproc, sem custo por quadro.
 *
 * A cor do domo é multiplicada pelo material, então a virada continua sendo uma
 * interpolação de cor — não um segundo cenário.
 */
const texturaDoCeu: THREE.CanvasTexture = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#2f6fc4');
    grad.addColorStop(0.45, '#6fb4ea');
    grad.addColorStop(0.78, '#b7e2f7');
    grad.addColorStop(1.00, '#e8f6fd');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    // O SOL: um halo quente no alto, à direita. Ele é o que dá direção à luz —
    // e as direcionais da cena apontam do mesmo lado, senão o céu diz uma coisa
    // e o volume dos objetos diz outra.
    const sol = g.createRadialGradient(196, 46, 4, 196, 46, 120);
    sol.addColorStop(0.00, 'rgba(255,250,225,0.95)');
    sol.addColorStop(0.25, 'rgba(255,232,178,0.55)');
    sol.addColorStop(1.00, 'rgba(255,225,170,0)');
    g.fillStyle = sol; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
})();

const DomoDoCeu: React.FC = () => {
    const mat = useRef<THREE.MeshBasicMaterial>(null);
    const cor = useRef(new THREE.Color('#ffffff'));
    const alvo = useMemo(() => ({
        claro: new THREE.Color('#ffffff'),
        // Na virada o céu vai para um ÍNDIGO ESVERDEADO, e não para o azul
        // escuro de antes. É leitura: o chefe é roxo, e roxo escuro sobre azul
        // escuro some — o dono do jogo reclamou exatamente disso. O índigo puxa
        // para o verde e devolve o contraste de matiz que o azul tinha comido.
        sombrio: new THREE.Color('#5c7486'),
    }), []);
    useFrame((_, rawDt) => {
        const m = mat.current; if (!m) return;
        cor.current.lerp(f12.passouDaVirada ? alvo.sombrio : alvo.claro, Math.min(1, Math.min(rawDt, 0.05) * 0.7));
        m.color.copy(cor.current);
    });
    return (
        // BackSide, e NÃO uma escala negativa. A escala em -1 inverte o
        // determinante da matriz e o three passa a descartar o que a gente quer
        // ver: o domo simplesmente não aparecia, e o azul que sobrava na foto
        // era o `background` do div do Canvas por baixo.
        <mesh renderOrder={-1000} frustumCulled={false}>
            <sphereGeometry args={[290, 24, 16]} />
            <meshBasicMaterial ref={mat} map={texturaDoCeu} side={THREE.BackSide}
                depthWrite={false} depthTest={false} fog={false} toneMapped={false} />
        </mesh>
    );
};

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
// ── O CUSTO DAS NUVENS É PREENCHIMENTO, NÃO CHAMADA DE DESENHO ───────────────
//
// Instanciar as camadas (uma chamada por camada em vez de uma por nuvem) quase
// não mexeu no FPS: 53,6 -> 51,7 de mediana, dentro do ruído. O que pesa é
// SOBREPOSIÇÃO — dezenas de quadriláteros transparentes e grandes empilhados,
// cada pixel pintado várias vezes. A instanciação ficou porque é gratuita, mas
// quem devolveu o quadro foi cortar nuvem grande perto da câmera.
const CAMADAS: ReadonlyArray<Camada> = Object.freeze([
    // O MAR DE NUVENS: denso, logo abaixo da arena. Na referência é ele que
    // ocupa a metade de baixo do quadro e dá a altitude — sem ele o avião voa
    // num vazio azul e podia estar a três metros do chão.
    { n: 12, z: 6, v: 16.0, escala: 3.0, opacidade: 0.97, yDe: ARENA.yBaixo - 13, yAte: ARENA.yBaixo - 2.6 },
    { n: 10, z: -14, v: 10.0, escala: 4.4, opacidade: 0.9, yDe: ARENA.yBaixo - 20, yAte: ARENA.yBaixo - 3.4 },
    // as de trás continuam ATRÁS da cabeça: nuvem na frente da boca já tapou a
    // única coisa que o jogador precisa vigiar, e não volta a tapar
    { n: 10, z: -46, v: 6.0, escala: 7.0, opacidade: 0.85, yDe: ARENA.yBaixo - 4, yAte: ARENA.yAlto + 9 },
    { n: 8, z: -78, v: 2.6, escala: 12.0, opacidade: 0.62, yDe: ARENA.yBaixo - 8, yAte: ARENA.yAlto + 16 },
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

/**
 * ── UMA CHAMADA DE DESENHO POR CAMADA, NÃO UMA POR NUVEM ─────────────────────
 *
 * Cada nuvem era um `<mesh>`. Com o céu cheio isso deu 55 chamadas só de nuvem,
 * e somadas à cidade nova o FPS medido caiu de 60 para 39,6 de mediana. Um
 * `InstancedMesh` desenha a camada inteira de uma vez: o custo vira escrever 18
 * matrizes por quadro na CPU, que é nada, em vez de 18 trocas de estado na GPU.
 *
 * O movimento continua sendo o mesmo — as nuvens andam para +X e dão a volta —,
 * só que agora ele mora num array em vez de na árvore da cena.
 */
const Nuvens: React.FC<{ camada: Camada; semente: number }> = ({ camada, semente }) => {
    const malha = useRef<THREE.InstancedMesh>(null);
    const material = useMemo(() => new THREE.MeshBasicMaterial({
        map: texturaDaNuvem, transparent: true, opacity: camada.opacidade,
        depthWrite: false, fog: true,
    }), [camada.opacidade]);
    const pontos = useMemo(() => {
        const r = baralho(semente);
        return Array.from({ length: camada.n }, () => ({
            x: (r() * 2 - 1) * LIMITE_X,
            y: camada.yDe + r() * (camada.yAte - camada.yDe),
            e: camada.escala * (0.65 + r() * 0.7),
        }));
    }, [camada, semente]);
    const aux = useMemo(() => new THREE.Object3D(), []);

    useFrame((_, rawDt) => {
        const m = malha.current; if (!m) return;
        const dt = Math.min(rawDt, 0.05);
        for (let i = 0; i < pontos.length; i++) {
            const q = pontos[i];
            // Andam para +X: o avião voa para -Z, então o cenário passa de lado.
            q.x += camada.v * dt;
            if (q.x > LIMITE_X) q.x -= LIMITE_X * 2;
            aux.position.set(q.x, q.y, camada.z);
            aux.scale.set(q.e * 2, q.e, 1);
            aux.updateMatrix();
            m.setMatrixAt(i, aux.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={malha} args={[undefined as never, undefined as never, camada.n]}
            material={material} frustumCulled={false}>
            <planeGeometry args={[1, 1]} />
        </instancedMesh>
    );
};

/**
 * ── AS JANELAS VIRARAM TEXTURA, E O MOTIVO É O CELULAR ───────────────────────
 *
 * A primeira cidade desenhava cada janela como uma caixa: nove torres a ~15
 * janelas mais o hotel a 50 davam mais de duzentas malhas só de vidro. Medido
 * na bancada que joga, o FPS caiu de 60 para 39,6 de mediana, com mínimo de 29.
 * Cenário que custa um terço do quadro não é cenário, é dívida — e a primeira
 * regra deste projeto é velocidade no celular.
 *
 * Uma fachada pintada num canvas de 64x128, compartilhada por todas as torres,
 * põe cada torre em QUATRO malhas (rocha, corpo, telhado, coroa) em vez de
 * dezenove. E a janela pintada lê melhor de longe do que a janela modelada, que
 * a essa distância tem menos de um pixel de profundidade.
 */
function fachada(semente: number, cols: number, linhas: number): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d')!;
    const r = baralho(semente);
    g.fillStyle = '#565068'; g.fillRect(0, 0, 64, 128);
    // faixas horizontais de andar, para o prédio ter estrutura e não ser um bloco
    g.fillStyle = '#474155';
    for (let i = 0; i <= linhas; i++) g.fillRect(0, (i * 128) / linhas - 1, 64, 2);
    const lw = 64 / (cols * 2 + 1), lh = 128 / (linhas * 2 + 1);
    for (let a = 0; a < linhas; a++) {
        for (let col = 0; col < cols; col++) {
            const v = r();
            if (v < 0.28) continue;                       // hotel meio vazio, como sempre
            g.fillStyle = v < 0.55 ? '#3b3547' : (v < 0.85 ? '#ffd98a' : '#fff2c8');
            g.fillRect(lw * (col * 2 + 1), lh * (a * 2 + 1), lw, lh * 1.25);
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// ── A CIDADE NO CÉU ──────────────────────────────────────────────────────────
//
// ── POR QUE ELA É PINTADA, E NÃO CONSTRUÍDA ──────────────────────────────────
//
// Três tentativas com torres de verdade, e as três leram como entulho numa
// avaliação independente. A causa só apareceu na terceira: a câmera deste andar
// olha para CIMA, e um prédio vertical ABAIXO da linha do olho se esparrama para
// fora do quadro em perspectiva. Isso é perspectiva correta — e é a assinatura
// visual de destroço, não de cidade.
//
// E afastar não resolve. As peças são colocadas por FRAÇÃO DE TELA, então
// mandá-las para o dobro da distância as põe ao dobro da largura: o ângulo que
// elas ocupam, e portanto o esparramo, é exatamente o mesmo. Levei uma rodada
// inteira para ver isso.
//
// Um PAINEL virado para a câmera não tem esparramo por construção. Ele custa
// duas malhas em vez de catorze, desenha a linha do horizonte que o olho
// procura, e num jogo de cor chapada e pixel grande ele não é menos "real" que
// caixas — é o mesmo truque das nuvens, que ninguém nunca achou falso.
//
// O preço, escrito: a cidade não tem paralaxe de rotação. A câmera deste andar
// quase não gira, então o preço é zero na prática; num andar com câmera livre,
// não seria.

/** O pano de um estandarte, com o lema do hotel. */
function texturaDoEstandarte(linhas: string[]): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2c3f6b'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#e8c97a'; g.fillRect(0, 0, 128, 8); g.fillRect(0, 214, 128, 6);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, 256); g.lineTo(64, 214); g.lineTo(128, 256); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#f3e2b0'; g.textAlign = 'center'; g.font = 'bold 21px monospace';
    linhas.forEach((t, i) => g.fillText(t, 64, 66 + i * 28));
    g.fillStyle = '#e8c97a';
    g.fillRect(50, 168, 28, 12);
    for (let i = 0; i < 3; i++) g.fillRect(50 + i * 12, 158, 6, 12);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

const Estandarte: React.FC<{ p: [number, number, number]; e: number; linhas: string[] }> =
    ({ p, e, linhas }) => {
        const tex = useMemo(() => texturaDoEstandarte(linhas), [linhas]);
        const malha = useRef<THREE.Mesh>(null);
        useFrame((state) => {
            if (malha.current) malha.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8 + p[0]) * 0.045;
        });
        return (
            <group position={p} scale={e}>
                <mesh position={[0, 1.1, 0]}>
                    <boxGeometry args={[2.6, 0.18, 0.18]} />
                    <meshLambertMaterial color="#c9a24a" flatShading />
                </mesh>
                <mesh ref={malha} position={[0, -1.0, 0]}>
                    <planeGeometry args={[2.0, 4.0]} />
                    <meshBasicMaterial map={tex} transparent side={THREE.DoubleSide} fog={false} />
                </mesh>
            </group>
        );
    };

/** Mistura uma cor com a bruma do céu — perspectiva aérea, em número. */
function embrumar(hex: string, k: number): string {
    const B = [0xb7, 0xe2, 0xf7];
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const m = c.map((v, i) => Math.round(v + (B[i] - v) * k));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
}

/**
 * Desenha uma linha de horizonte de prédios num canvas.
 *
 * `desbotar` é a perspectiva aérea: quanto mais longe a camada, mais a silhueta
 * se aproxima da cor da bruma. Sem isso as duas camadas têm o mesmo contraste e
 * o olho lê "prédios em cima de prédios" em vez de "prédios atrás de prédios" —
 * foi exatamente o que a primeira versão desta cidade fez na foto.
 */
function texturaDaCidade(semente: number, torres: number, alturaMax: number, desbotar: number): THREE.CanvasTexture {
    const L = 2048, A = 256;
    const c = document.createElement('canvas'); c.width = L; c.height = A;
    const g = c.getContext('2d')!;
    const r = baralho(semente);
    g.clearRect(0, 0, L, A);
    const corpo = embrumar('#3f3950', desbotar);
    const telhado = embrumar('#2b2637', desbotar);
    const coroa = embrumar('#c9a24a', desbotar * 0.7);
    for (let i = 0; i < torres; i++) {
        const w = L * (0.0055 + r() * 0.0075);
        const x = (i / torres) * L + (r() - 0.5) * (L / torres) * 0.7;
        const h = A * (0.30 + r() * alturaMax);
        const y = A - h;
        g.fillStyle = corpo;
        g.fillRect(x, y, w, h);
        g.fillStyle = telhado;
        g.fillRect(x - w * 0.12, y - A * 0.018, w * 1.24, A * 0.020);
        if (r() < 0.3) {
            g.fillStyle = coroa;
            g.fillRect(x + w * 0.34, y - A * 0.062, w * 0.32, A * 0.044);
        }
        // Janelas acesas: a camada de trás quase não as tem. Uma janela é um
        // ponto de contraste máximo, e contraste máximo ao longe desfaz a
        // distância que o desbotamento acabou de construir.
        if (desbotar > 0.45) continue;
        const cols = Math.max(1, Math.floor(w / (L * 0.0028)));
        const linhas = Math.max(2, Math.floor(h / (A * 0.05)));
        for (let a = 0; a < linhas; a++) {
            for (let col = 0; col < cols; col++) {
                if (r() < 0.62) continue;
                g.fillStyle = embrumar(r() < 0.22 ? '#fff0c0' : '#ffd98a', desbotar + 0.25);
                g.fillRect(x + w * 0.16 + col * (w * 0.68 / cols), y + A * 0.04 + a * (h * 0.9 / linhas),
                    w * 0.34 / cols, A * 0.010);
            }
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/**
 * Uma camada da cidade: um painel virado para a câmera.
 *
 * ── ELA É ANCORADA PELO TOPO, E POR MEDIDA ───────────────────────────────────
 *
 * A versão anterior recebia a fração do CENTRO e uma altura em múltiplo da
 * largura do quadro (`larg * 0.25`). Como a largura do quadro a −260 é enorme, a
 * banda saía com quase metade da tela de altura e subia até a barra de vida: na
 * foto a cidade não era horizonte, era chão — o avião parecia rasante sobre uma
 * metrópole em vez de voar a mil metros.
 *
 * Agora entram as duas frações que a composição realmente quer: onde fica a
 * LINHA DO CÉU (`topo`) e quanto da tela a banda ocupa (`altura`). O mundo é
 * resolvido pela mesma régua do resto do andar (`yParaFracao`), então o
 * enquadramento da cidade é verificável em vez de afinado no olho.
 */
const CamadaDaCidade: React.FC<{
    semente: number; topo: number; altura: number; z: number;
    torres: number; variacao: number; desbotar: number; opacidade: number;
}> = ({ semente, topo, altura, z, torres, variacao, desbotar, opacidade }) => {
    const tex = useMemo(() => texturaDaCidade(semente, torres, variacao, desbotar),
        [semente, torres, variacao, desbotar]);
    const { pos, larg, alt } = useMemo(() => {
        const yTopo = yParaFracao(topo, z);
        const yBase = yParaFracao(topo - altura, z);
        return {
            pos: [0, (yTopo + yBase) / 2, z] as [number, number, number],
            larg: larguraDoQuadro(ENQUADRAMENTO.recuo - z) * 1.15,
            alt: yTopo - yBase,
        };
    }, [topo, altura, z]);
    return (
        <mesh position={pos}>
            <planeGeometry args={[larg, alt]} />
            <meshBasicMaterial map={tex} transparent opacity={opacidade}
                depthWrite={false} fog toneMapped={false} />
        </mesh>
    );
};

/** O HOTEL principal: grande, à esquerda, com letreiro. */
const HotelGrande: React.FC<{ M: Record<string, THREE.Material>; p: [number, number, number] }> = ({ M, p }) => {
    const letreiro = useMemo(() => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const g = c.getContext('2d')!;
        g.fillStyle = '#1a1420'; g.fillRect(0, 0, 256, 64);
        g.fillStyle = '#ffd98a'; g.textAlign = 'center'; g.font = 'bold 40px monospace';
        g.fillText('HOTEL', 128, 46);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }, []);
    const matFachada = useMemo(() => new THREE.MeshLambertMaterial({
        map: fachada(0x517e1, 5, 13), flatShading: true,
    }), []);
    return (
        // O hotel CONTINUA sendo geometria, e é o único que continua: ele é o
        // prédio de onde o jogador veio, o jogador precisa reconhecê-lo, e uma
        // peça só perto do centro do quadro quase não esparrama.
        <group position={p} scale={2.6} rotation={[0, 0.42, 0]}>
          <group position={[0, -28, 0]}>
            <mesh material={M.rocha} position={[0, -4, 0]} scale={[1.6, 0.8, 1.6]}>
                <coneGeometry args={[7, 12, 8]} />
            </mesh>
            <mesh material={matFachada} position={[0, 12.5, 0]}>
                <boxGeometry args={[11, 25, 9]} />
            </mesh>
            <mesh material={M.telhado} position={[0, 25.6, 0]}>
                <boxGeometry args={[12.6, 1.2, 10.6]} />
            </mesh>
            <mesh material={M.ouro} position={[0, 27.2, 0]}>
                <cylinderGeometry args={[1.5, 2.0, 2.2, 6]} />
            </mesh>
            <mesh position={[0, 21.5, 4.7]}>
                <planeGeometry args={[8.4, 2.1]} />
                <meshBasicMaterial map={letreiro} transparent fog={false} toneMapped={false} />
            </mesh>
          </group>
        </group>
    );
};

const CidadeNoCeu: React.FC = () => {
    const M = useMemo(() => ({
        telhado: mat64('#2e2937'),
        rocha: mat64('#464054'),
        ouro: mat64('#d9a441'),
    }), []);
    const hotel = useMemo(() => {
        const z = -230;
        return [xParaFracao(0.13, z), yParaFracao(0.05, z), z] as [number, number, number];
    }, []);
    const estandartes = useMemo(() => ([
        { u: 0.07, v: 0.26, z: -190, e: 3.4, linhas: ['MAIS', 'ALTO', 'É', 'MELHOR'] },
        { u: 0.93, v: 0.27, z: -196, e: 3.3, linhas: ['ANDAR', '12'] },
    ].map((b) => ({ ...b, p: [xParaFracao(b.u, b.z), yParaFracao(b.v, b.z), b.z] as [number, number, number] }))), []);

    return (
        <group>
            {/* duas camadas: a de trás mais alta e mais clara (perspectiva
                aérea), a da frente mais baixa e mais escura */}
            <CamadaDaCidade semente={0xc1} topo={0.185} altura={0.075} z={-380}
                torres={120} variacao={0.42} desbotar={0.62} opacidade={0.85} />
            <CamadaDaCidade semente={0xc2} topo={0.150} altura={0.105} z={-260}
                torres={82} variacao={0.55} desbotar={0.28} opacidade={0.97} />
            <HotelGrande M={M} p={hotel} />
            {estandartes.map((b, i) => <Estandarte key={i} p={b.p} e={b.e} linhas={b.linhas} />)}
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
        claro: new THREE.Color('#b7e2f7'),
        sombrio: new THREE.Color('#5c7486'),
    }), []);

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        // O FUNDO agora é o domo; o que continua sendo cor é a NÉVOA, e ela tem
        // de acompanhar o horizonte do domo, senão a cidade ao longe se dissolve
        // numa cor que não existe no céu atrás dela.
        fundo.current.lerp(f12.passouDaVirada ? alvo.sombrio : alvo.claro, Math.min(1, dt * 0.7));
        const cena = state.scene;
        cena.background = null;
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
            <DomoDoCeu />
            <CidadeNoCeu />
            {CAMADAS.map((c, i) => <Nuvens key={i} camada={c} semente={0x1234 + i * 7919} />)}
        </group>
    );
};

export default Floor12Ceu;
