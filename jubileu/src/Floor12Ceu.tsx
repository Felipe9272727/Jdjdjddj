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
import { ARENA, f12, xParaFracao, yParaFracao } from './f12Boss';

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

/** Três fachadas bastam: de longe ninguém compara duas torres. */
const FACHADAS: THREE.CanvasTexture[] = [fachada(7, 3, 7), fachada(19, 4, 9), fachada(53, 3, 11)];

// ── A CIDADE NO CÉU ──────────────────────────────────────────────────────────
//
// O céu tinha UMA torre magra a 160 de distância, e o dono do jogo escreveu: "o
// céu é vazio; este é o andar de um hotel que virou céu — quero ver o hotel".
// Ele tem razão, e a referência que ele mandou diz o que falta: não é um prédio,
// é um ARQUIPÉLAGO — torres flutuando em vários planos, com passarelas, janelas
// acesas e estandartes, e o hotel principal grande à esquerda.
//
// Tudo aqui é caixa e plano, com material compartilhado, e vive em z < -55 ou
// bem fora do X da arena: cenário que entra no caminho da boca é cenário que
// esconde a regra do jogo, e este arquivo já pagou por isso uma vez.

/** O pano de um estandarte, com o lema do hotel. */
function texturaDoEstandarte(linhas: string[]): THREE.CanvasTexture {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2c3f6b'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#e8c97a'; g.fillRect(0, 0, 128, 8); g.fillRect(0, 214, 128, 6);
    // o rabo de andorinha embaixo
    g.fillStyle = '#0000'; g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, 256); g.lineTo(64, 214); g.lineTo(128, 256); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#f3e2b0'; g.textAlign = 'center'; g.font = 'bold 21px monospace';
    linhas.forEach((t, i) => g.fillText(t, 64, 66 + i * 28));
    // a coroa
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
            // balança de leve: pano parado lê como placa
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

/**
 * Uma torre do arquipélago: a rocha, o corpo com janelas e o telhado com coroa.
 *
 * `semente` decide a altura, o número de janelas e quais estão acesas — assim
 * dez torres saem diferentes de uma função só, em vez de dez blocos de JSX.
 */
const Torre: React.FC<{ p: [number, number, number]; e: number; semente: number; M: Record<string, THREE.Material> }> =
    ({ p, e, semente, M }) => {
        const { altura, temCoroa, mat } = useMemo(() => {
            const r = baralho(semente);
            const andares = 5 + Math.floor(r() * 7);
            const tex = FACHADAS[Math.floor(r() * FACHADAS.length)];
            return {
                altura: andares * 1.5 + 1.6,
                temCoroa: r() < 0.55,
                // uma malha, uma fachada; o material é criado por torre mas a
                // TEXTURA é compartilhada, que é o que custa memória
                mat: new THREE.MeshLambertMaterial({ map: tex, flatShading: true }),
            };
        }, [semente]);
        return (
            <group position={p} scale={e}>
                {/* ── A ÂNCORA É O TOPO, NÃO A BASE ──
                    `yParaFracao` devolve onde o ORIGEM do grupo cai na tela, e a
                    torre crescia para CIMA a partir dele. Então pedir "v = 0,05"
                    punha a base lá embaixo e o prédio inteiro subia até a faixa
                    do avião — foi assim que a cidade invadiu o espaço do jogador
                    pela terceira vez seguida, cada vez por um motivo diferente.
                    Descendo tudo por `altura`, o número que eu peço passa a ser
                    o que eu vejo: o topo. */}
                <group position={[0, -altura, 0]}>
                {/* ERETAS. Elas herdavam a inclinação do grupo pai e saíam
                    tortas em ângulos diferentes, o que é a assinatura visual de
                    destroço, não de prédio. Prédio é vertical; é disso que o
                    olho tira "isso foi construído". */}
                {/* a rocha pendurada embaixo: é o que faz a torre FLUTUAR em vez
                    de estar cortada */}
                <mesh material={M.rocha} position={[0, -1.6, 0]} scale={[1, 0.75, 1]}>
                    <coneGeometry args={[2.6, 5.0, 7]} />
                </mesh>
                <mesh material={mat} position={[0, altura / 2, 0]}>
                    <boxGeometry args={[3.6, altura, 3.6]} />
                </mesh>
                <mesh material={M.telhado} position={[0, altura + 0.35, 0]}>
                    <boxGeometry args={[4.4, 0.7, 4.4]} />
                </mesh>
                {temCoroa && (
                    <mesh material={M.ouro} position={[0, altura + 1.1, 0]}>
                        <cylinderGeometry args={[0.55, 0.75, 0.9, 6]} />
                    </mesh>
                )}
                </group>
            </group>
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
        <group position={p} scale={3.2} rotation={[0, 0.42, 0]}>
          {/* o hotel também pende do topo — ver a nota em `Torre` */}
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
            {/* a coroa no topo, como na referência */}
            <mesh material={M.ouro} position={[0, 27.2, 0]}>
                <cylinderGeometry args={[1.5, 2.0, 2.2, 6]} />
            </mesh>
            {/* o letreiro */}
            <mesh position={[0, 21.5, 4.7]}>
                <planeGeometry args={[8.4, 2.1]} />
                <meshBasicMaterial map={letreiro} transparent fog={false} toneMapped={false} />
            </mesh>
          </group>
        </group>
    );
};

/** Uma passarela ligando duas torres: é o que faz o arquipélago virar cidade. */
const Passarela: React.FC<{ p: [number, number, number]; comprimento: number; e: number; M: Record<string, THREE.Material> }> =
    ({ p, comprimento, e, M }) => (
        <group position={p} scale={e}>
            <mesh material={M.telhado}><boxGeometry args={[comprimento, 0.5, 1.6]} /></mesh>
            {(() => {
                const n = Math.max(2, Math.round(comprimento / 3));
                return Array.from({ length: n }, (_, i) => (
                    <mesh key={i} material={M.ouro}
                        position={[-comprimento / 2 + (comprimento * i) / (n - 1), 0.9, 0]}>
                        <boxGeometry args={[0.22, 1.3, 0.22]} />
                    </mesh>
                ));
            })()}
        </group>
    );

/**
 * A CIDADE inteira. As posições são escritas à mão, e de propósito: sorteá-las
 * poria uma torre na frente da boca uma vez a cada tantas partidas, e "às vezes
 * o chefe fica escondido" é o tipo de defeito que ninguém consegue reproduzir.
 */
const CidadeNoCeu: React.FC = () => {
    const M = useMemo(() => ({
        parede: mat64('#565068'),
        telhado: mat64('#2e2937'),
        rocha: mat64('#464054'),
        ouro: mat64('#d9a441'),
        janela: mat64('#ffd98a', '#ffd98a', 0.85),
    }), []);

    // ── AS PEÇAS SÃO COLOCADAS POR FRAÇÃO DE TELA ────────────────────────
    //
    // `u` é a fração da largura (0 = borda esquerda, 1 = direita) e `v` a da
    // altura (0 = base). O mundo sai disso, e não o contrário.
    //
    // A montagem anterior escrevia x e y à mão. Funcionava numa orientação e
    // errava na outra por dezenas de unidades, porque a câmera olha para cima e
    // a altura do eixo dela CRESCE com a profundidade: para cair a 60% da tela
    // em z = -200 é preciso y = 93 deitado e y = 62 em pé. As torres saíram na
    // faixa do avião, disputando o terço de baixo com o jogador.
    //
    // Todas ficam em v >= 0,52 de propósito: o terço de baixo é do jogador e da
    // nuvem, como na referência. E `useMemo` sem dependência é o certo aqui — a
    // composição é resolvida uma vez, na entrada do andar, antes deste render.
    const pecas = useMemo(() => {
        const torre = (u: number, v: number, z: number, e: number, semente: number) =>
            ({ tipo: 'torre' as const, p: [xParaFracao(u, z), yParaFracao(v, z), z] as [number, number, number], e, semente });
        const ponte = (u: number, v: number, z: number, c: number, e: number) =>
            ({ tipo: 'ponte' as const, p: [xParaFracao(u, z), yParaFracao(v, z), z] as [number, number, number], c, e });
        // ── A CIDADE DESCEU, E O MOTIVO É O QUE ELA TEM DE SER ───────────
        //
        // Elas ficavam em v = 0,54 a 0,90 — a faixa do chefe e acima. Um
        // avaliador independente olhou as fotos e disse: "lê como entulho
        // orbitando, não como cidade lá embaixo". Ele está certo, e o erro foi
        // meu de duas vezes seguidas: primeiro pus as torres na faixa do AVIÃO
        // (disputando com o jogador), depois corrigi para a faixa do CHEFE
        // (disputando com o chefe). Nenhuma das duas é onde uma cidade fica.
        //
        // Cidade fica EMBAIXO. O andar é "o hotel virou céu": o jogador voa
        // ACIMA do prédio, e o que dá altitude é ver o mundo lá no fundo,
        // afundando nas nuvens. Agora elas moram em v = 0,02 a 0,30, abaixo da
        // linha de voo e atrás do mar de nuvens, com o topo aparecendo entre as
        // camadas — que é como uma torre distante se vê de um avião.
        //
        // Sobram duas bem altas e MUITO longe (v ~0,80, z -290): não são
        // cidade, são silhueta de fundo para o chefe não flutuar contra o vazio.
        return [
            // Os `v` agora são o TOPO da torre, e todos ficam ABAIXO do avião
            // (que a composição põe em 0,25): a cidade afunda nas nuvens, que é
            // como uma torre distante se vê de um avião.
            torre(0.04, 0.17, -150, 2.0, 11),
            torre(0.16, 0.11, -120, 1.6, 23),
            torre(0.28, 0.19, -198, 2.4, 31),
            torre(0.96, 0.16, -156, 2.0, 47),
            torre(0.84, 0.10, -126, 1.7, 59),
            torre(0.72, 0.20, -204, 2.3, 71),
            torre(0.45, 0.14, -244, 2.8, 83),
            torre(0.57, 0.12, -232, 2.6, 89),
            ponte(0.12, 0.13, -174, 20, 2.0),
            ponte(0.88, 0.12, -172, 16, 1.8),
        ];
    }, []);

    // Os estandartes ficam ALTOS: eles são do hotel, não da cidade, e são a
    // única peça de texto do cenário. Embaixo, entre as nuvens, ninguém os lê.
    const estandartes = useMemo(() => ([
        { u: 0.86, v: 0.72, z: -138, e: 5.4, linhas: ['MAIS', 'ALTO', 'É', 'MELHOR'] },
        { u: 0.14, v: 0.74, z: -144, e: 5.2, linhas: ['ANDAR', '12'] },
    ].map((b) => ({ ...b, p: [xParaFracao(b.u, b.z), yParaFracao(b.v, b.z), b.z] as [number, number, number] }))), []);

    // O HOTEL é o mais baixo de todos: ele é o prédio de onde o jogador veio.
    const hotel = useMemo(() => {
        const z = -190;
        return [xParaFracao(0.11, z), yParaFracao(0.02, z), z] as [number, number, number];
    }, []);

    return (
        <group>
            <HotelGrande M={M} p={hotel} />
            {pecas.map((q, i) => (q.tipo === 'torre'
                ? <Torre key={i} p={q.p} e={q.e} semente={q.semente} M={M} />
                : <Passarela key={i} p={q.p} comprimento={q.c} e={q.e} M={M} />))}
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
