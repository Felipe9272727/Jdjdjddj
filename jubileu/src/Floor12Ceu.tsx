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
import { f12, xParaFracao, yParaFracao, larguraDoQuadro, alturaDoQuadro, ENQUADRAMENTO } from './f12Boss';

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
        vitoria: new THREE.Color('#ffe9c4'),
    }), []);
    useFrame((_, rawDt) => {
        const m = mat.current; if (!m) return;
        // O DOMO tem de clarear junto com a névoa na morte. A primeira versão
        // só clareou a névoa: na folha de fotos da morte o céu ficava mais
        // ESCURO — a névoa clara contra um domo que continuava sombrio — e o
        // clímax parecia um anoitecer. O fundo é o domo; ele é que manda.
        const morrendo = f12.fase === 'morrendo' || f12.fase === 'vitoria';
        const ondeIr = morrendo ? alvo.vitoria : (f12.passouDaVirada ? alvo.sombrio : alvo.claro);
        cor.current.lerp(ondeIr, Math.min(1, Math.min(rawDt, 0.05) * (morrendo ? 2.2 : 0.7)));
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
    // QUATRO bolotas de raios desencontrados, e não três parecidas: a camada de
    // baixo é cortada pela borda do quadro, e o que sobrava na tela era a calota
    // de uma bolota só — na foto do celular em pé isso saiu como uma BOLA branca
    // perfeita em cima da cidade. Uma silhueta comprida e desigual, cortada,
    // ainda lê como nuvem.
    const bolotas: [number, number, number][] = [
        [34, 43, 19], [60, 33, 26], [88, 40, 21], [110, 46, 13],
    ];
    for (const [x, y, r] of bolotas) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    g.fillRect(24, 42, 92, 18);
    // sombra chapada embaixo — duas cores, como todo o resto do andar
    g.fillStyle = '#cfd9e6';
    g.fillRect(24, 52, 92, 8);
    for (const [x, , r] of bolotas) { g.beginPath(); g.arc(x, 52, r * 0.7, 0, Math.PI); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    return t;
})();

/**
 * A nuvem ALTA: uma risca, não uma bolota.
 *
 * Na foto do céu antigo a metade de cima do quadro era gradiente puro de
 * horizonte a horizonte — nenhuma marca. Sem marca no alto, subir não tem contra
 * o que ser medido: o avião sobe e a tela não muda. Uma risca de cirro lá em
 * cima é a marca mais barata que existe, e ela não vira bolota porque bolota no
 * topo do quadro brigaria de silhueta com a cabeça.
 */
const texturaDoCirro: THREE.CanvasTexture = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 32);
    g.fillStyle = '#ffffff';
    // três riscas desencontradas: uma risca só lê como barra de interface
    g.fillRect(18, 12, 200, 7);
    g.fillRect(52, 6, 96, 6);
    g.fillRect(120, 19, 108, 5);
    g.fillStyle = '#dfe9f4';
    g.fillRect(18, 17, 200, 2);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    return t;
})();

/**
 * Quanto do alto de cada textura é transparente, em fração da altura dela.
 * [bolota, cirro]. Ver a conta de `meia` em `Nuvens`.
 */
const MARGEM: readonly [number, number] = [8 / 64, 6 / 32];

interface Camada {
    /** Quantas nuvens. */
    n: number;
    /** Profundidade. */
    z: number;
    /**
     * Velocidade em LARGURAS DE QUADRO POR SEGUNDO, à profundidade desta camada.
     *
     * Este número é o assunto inteiro do arquivo. Em unidades de mundo, "10 por
     * segundo" quer dizer coisas opostas a 10 e a 100 de distância, e foi assim
     * que a paralaxe daqui virou um punhado de constantes afinadas no olho. Em
     * larguras de tela por segundo o que está escrito é o que se VÊ: 0,62 cruza
     * o quadro em menos de dois segundos, 0,028 leva mais de meio minuto. A
     * razão entre as camadas — vinte e duas vezes daqui até lá — é a paralaxe,
     * e agora ela é legível no código e verificável na folha de fotos.
     */
    vTela: number;
    /**
     * Tamanho da nuvem em fração do MENOR lado do quadro, à profundidade dela.
     *
     * Menor lado, e não altura: medido pela altura, a folha de fotos do celular
     * EM PÉ virou uma papa branca. O celular em pé tem a MESMA altura de quadro
     * e menos da metade da largura (aspecto 0,45), então uma nuvem de "30% da
     * altura" ocupa lá dois terços da largura — e a metade de baixo da tela
     * sumiu debaixo de três nuvens, com hotel e cidade dentro. Pelo menor lado a
     * nuvem tem o mesmo tamanho RELATIVO nas duas orientações.
     */
    escalaTela: number;
    /** Quanto a nuvem é mais larga que alta. */
    alongar: number;
    opacidade: number;
    /** 0 = branco de nuvem perto; 1 = a cor da bruma do horizonte. */
    bruma: number;
    /**
     * Faixa em que cai o TOPO da nuvem, em fração de tela (0 = base, 1 = topo).
     *
     * O topo e não o centro, e a diferença é a regra de não tapar a luta: o que
     * precisa ficar abaixo do avião é a borda de cima da nuvem, e ela depende do
     * tamanho — que muda com a orientação da tela. Ancorando pelo centro, a
     * mesma camada que passava rente ao chão no monitor subia por cima do avião
     * no celular. Ancorando pelo topo, o limite escrito aqui é o limite que sai
     * na tela, em qualquer aspecto.
     */
    vDe: number;
    vAte: number;
    /**
     * Espessura da camada em Z, em unidades de mundo. A nuvem sorteia um `z`
     * dentro dela.
     *
     * Sem isto cada camada é uma PAREDE: todas as nuvens dela exatamente à mesma
     * distância, do mesmo tamanho na tela, e o olho lê um adesivo. Com espessura
     * a própria camada tem volume — e as de dentro dela já andam uma em relação
     * à outra quando a câmera acompanha o avião. Nas camadas de trás a espessura
     * é limitada para NENHUMA nuvem chegar à frente da cabeça (z > −36).
     */
    espessura: number;
    /** Riscas de cirro em vez de bolotas. */
    cirro?: boolean;
}

/**
 * ── NUVEM NENHUMA PODE PASSAR NA FRENTE DA LUTA ──────────────────────────────
 *
 * A primeira versão tinha três camadas em z = 6, −9 e −34, com o avião em 0 e a
 * cabeça em −26. Na foto o estrago foi imediato: a camada do meio ficava ENTRE
 * o avião e o chefe e tapava a boca dele — que é exatamente a única coisa que o
 * jogador precisa vigiar, porque é o telegrafo do ataque e o ponto fraco.
 *
 * A regra que sobrou é geométrica, e não de bom senso: uma nuvem ANDA em X e dá
 * a volta, então toda nuvem passa, mais cedo ou mais tarde, pelo meio do quadro.
 * Proibir o meio na hora de sortear não protege nada. Só duas coisas protegem:
 * estar atrás da cabeça em Z (z < −36, e aí o próprio zBuffer resolve, porque a
 * cabeça é opaca e o teste de profundidade continua ligado nas nuvens), ou estar
 * numa faixa de ALTURA que não encosta na cabeça. A cabeça ocupa de 65% a 90%
 * da altura da tela e a boca fica em 70%: por isso nenhuma camada à frente dela
 * sobe além de 50% do quadro.
 *
 * ── E POR QUE O CÉU DE CIMA DEIXOU DE SER VAZIO ──────────────────────────────
 *
 * A versão anterior media as faixas em unidades de mundo tiradas da ARENA (`yDe:
 * ARENA.yAlto + 16`). Vinte e cinco unidades de altura é o teto da arena a
 * z = 0 — e a 78 de distância é quase a linha do horizonte. Na foto de 1100x620
 * todas as nuvens das QUATRO camadas apareciam empilhadas no terço de baixo e a
 * metade de cima do quadro era gradiente liso. Pior: `LIMITE_X` era 34 para
 * todas, e 34 a 93 de distância é um terço da largura da tela — as camadas do
 * fundo só existiam numa tira central.
 *
 * Agora cada camada é colocada por FRAÇÃO DE TELA na profundidade dela, com a
 * mesma régua do resto do andar. É o que põe marca no alto, e marca no alto é o
 * que faz SUBIR parecer subir: a camada de baixo escorrega ~29% da tela quando o
 * avião vai do chão ao teto da arena, a de cima ~2%. Sem nada lá em cima essa
 * diferença não tinha contra o que ser medida.
 */
// ── O CUSTO DAS NUVENS É PREENCHIMENTO, NÃO CHAMADA DE DESENHO ───────────────
//
// Instanciar as camadas (uma chamada por camada em vez de uma por nuvem) quase
// não mexeu no FPS: 53,6 -> 51,7 de mediana, dentro do ruído. O que pesa é
// SOBREPOSIÇÃO — dezenas de quadriláteros transparentes e grandes empilhados,
// cada pixel pintado várias vezes. A instanciação ficou porque é gratuita, mas
// quem devolveu o quadro foi cortar nuvem grande perto da câmera. É por isso que
// encher o céu de cima veio junto com um corte no número de nuvens de baixo: a
// conta que importa é área de tela pintada, não quantidade.
const CAMADAS: ReadonlyArray<Camada> = Object.freeze([
    // 1. O CHÃO DE NUVENS: a camada mais rápida, cruzando o terço de baixo do
    //    quadro em dois segundos. É ela que dá a altitude e quase toda a
    //    sensação de velocidade, porque corre na FRENTE da cidade — que está
    //    parada a 260 de distância. Velocidade é sempre uma comparação.
    //
    //    ── E ELA FICA EM z = −4, ATRÁS DO AVIÃO, DE PROPÓSITO ────────────────
    //
    //    Tentei em z = +9, entre a câmera e o avião. A conta que isso impõe: com
    //    a câmera acompanhando em 0,30, o avião desce até 8,6% da altura da tela
    //    (4,5% contando a barriga dele), então nenhuma nuvem à frente dele pode
    //    subir além disso — e quatro por cento de tela é uma nesga. Na foto do
    //    recorte de baixo o que saiu foi uma mancha branca leitosa em cima dos
    //    prédios, sem silhueta de nuvem nenhuma, lavando a cidade.
    //
    //    Quatro unidades ATRÁS do avião a restrição some — o zBuffer resolve, o
    //    avião desenha por cima —, a nuvem aparece inteira, e a paralaxe contra a
    //    cidade continua sendo a mesma. O ganho de estar na frente do avião era
    //    zero; o preço era a única nesga em que ela cabia.
    {
        n: 9, z: -4, vTela: 0.50, escalaTela: 0.27, alongar: 2.3, espessura: 9,
        opacidade: 0.95, bruma: 0.03, vDe: 0.05, vAte: 0.17,
    },
    // 2. A segunda fileira, já atrás do avião: metade da velocidade da primeira.
    {
        n: 11, z: -10, vTela: 0.30, escalaTela: 0.26, alongar: 2.0, espessura: 12,
        opacidade: 0.90, bruma: 0.12, vDe: 0.10, vAte: 0.30,
    },
    // 3. O MEIO DO CÉU, atrás da arena e ainda longe da cabeça. Esta é a camada
    //    que faz o vão entre a cidade e o chefe deixar de ser papel de parede:
    //    é contra ela que o desvio lateral do avião se mede.
    {
        n: 11, z: -44, vTela: 0.145, escalaTela: 0.22, alongar: 2.0, espessura: 14,
        opacidade: 0.60, bruma: 0.22, vDe: 0.34, vAte: 0.60,
    },
    // 4. O ALTO, atrás da cabeça — o zBuffer a recorta na silhueta dela, então
    //    ela emoldura o chefe em vez de disputar com ele.
    {
        n: 8, z: -98, vTela: 0.062, escalaTela: 0.17, alongar: 2.2, espessura: 40,
        opacidade: 0.42, bruma: 0.42, vDe: 0.58, vAte: 0.95,
    },
    // 5. Os CIRROS do teto do quadro: quase parados (22x mais lentos que o chão
    //    de nuvens). São a régua fixa contra a qual tudo o mais corre.
    {
        n: 6, z: -160, vTela: 0.028, escalaTela: 0.075, alongar: 7.0, espessura: 40,
        opacidade: 0.45, bruma: 0.5, vDe: 0.86, vAte: 1.08, cirro: true,
    },
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

/**
 * ── UMA CHAMADA DE DESENHO POR CAMADA, NÃO UMA POR NUVEM ─────────────────────
 *
 * Cada nuvem era um `<mesh>`. Com o céu cheio isso deu 55 chamadas só de nuvem,
 * e somadas à cidade nova o FPS medido caiu de 60 para 39,6 de mediana. Um
 * `InstancedMesh` desenha a camada inteira de uma vez: o custo vira escrever 18
 * matrizes por quadro na CPU, que é nada, em vez de 18 trocas de estado na GPU.
 *
 * O movimento continua sendo o mesmo — as nuvens andam para +X e dão a volta —,
 * só que agora ele mora num array em vez de na árvore da cena, e a volta é dada
 * na borda do QUADRO daquela profundidade, não num limite fixo para todas.
 */
const Nuvens: React.FC<{ camada: Camada; semente: number }> = ({ camada, semente }) => {
    const malha = useRef<THREE.InstancedMesh>(null);
    const material = useMemo(() => new THREE.MeshBasicMaterial({
        map: camada.cirro ? texturaDoCirro : texturaDaNuvem,
        // A BRUMA é pintada no material, e não deixada para a névoa da cena: a
        // névoa deste andar só começa a 180 de distância e a nuvem mais funda
        // está a 175. Sem isto a camada do alto sairia do mesmo branco puro da
        // que passa debaixo do avião, e duas camadas com o mesmo contraste leem
        // como "nuvem em cima de nuvem", não "nuvem atrás de nuvem".
        color: new THREE.Color(embrumar('#ffffff', camada.bruma)),
        transparent: true, opacity: camada.opacidade,
        depthWrite: false, fog: true,
    }), [camada]);

    /** A régua desta camada: tudo aqui é resolvido na profundidade dela. */
    const regua = useMemo(() => {
        const d = ENQUADRAMENTO.recuo - camada.z;
        const larg = larguraDoQuadro(d);
        return {
            // 0,62 e não 0,5: a nuvem tem de nascer e morrer FORA do quadro,
            // senão ela aparece e some no meio do ar, à vista.
            limiteX: larg * 0.62,
            vMundo: camada.vTela * larg,
            alturaBase: camada.escalaTela * Math.min(alturaDoQuadro(d), larg),
        };
    }, [camada]);

    const pontos = useMemo(() => {
        const r = baralho(semente);
        return Array.from({ length: camada.n }, () => {
            const z = camada.z + (r() - 0.5) * camada.espessura;
            // A MESMA bolota repetida vinte vezes lê como ladrilho, e leu: na
            // foto do céu cheio a fileira da direita eram quatro nuvens
            // idênticas na mesma altura. Espelhar em X e achatar um pouco custa
            // um sinal e um número, e desfaz o padrão.
            const espelho = r() < 0.5 ? -1 : 1;
            const achatar = 0.78 + r() * 0.44;
            const e = regua.alturaBase * (0.7 + r() * 0.65);
            // do topo pedido para o CENTRO, descontando meia nuvem em fração de
            // tela — é isto que faz o limite escrito valer em qualquer aspecto
            const topo = camada.vDe + r() * (camada.vAte - camada.vDe);
            const altTela = (e * achatar) / alturaDoQuadro(ENQUADRAMENTO.recuo - z);
            // A MARGEM VAZIA DA TEXTURA entra na conta, e não é preciosismo: a
            // faixa desta camada é a borda de baixo do quadro, e com o topo do
            // QUADRILÁTERO em 4% da tela o que aparecia eram 4% de pixel
            // transparente — a foto do recorte de baixo saiu azul liso, sem
            // nuvem nenhuma. O que a faixa descreve é o topo do DESENHO.
            const meia = altTela / 2 + MARGEM[camada.cirro ? 1 : 0] * altTela;
            return {
                x: (r() * 2 - 1) * regua.limiteX,
                y: yParaFracao(topo - meia, z),
                z, e, espelho, achatar,
            };
        });
    }, [camada, semente, regua]);
    const aux = useMemo(() => new THREE.Object3D(), []);

    useFrame((_, rawDt) => {
        const m = malha.current; if (!m) return;
        const dt = Math.min(rawDt, 0.05);
        for (let i = 0; i < pontos.length; i++) {
            const q = pontos[i];
            // Andam para +X: o avião voa para -Z, então o cenário passa de lado.
            q.x += regua.vMundo * dt;
            if (q.x > regua.limiteX) q.x -= regua.limiteX * 2;
            aux.position.set(q.x, q.y, q.z);
            aux.scale.set(q.e * camada.alongar * q.espelho, q.e * q.achatar, 1);
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
/**
 * O estandarte INTEIRO — travessa, pano e mastro — pintado num canvas só.
 *
 * ── GEOMETRIA FINA E VERTICAL CISALHA; TEXTURA NÃO ───────────────────────────
 *
 * O mastro era um cilindro de mundo. Um avaliador fotografou a introdução: o da
 * esquerda tombava uns 40 graus, o da direita para o outro lado, cada um
 * apontando para o seu ponto de fuga. É perspectiva correta e leitura errada —
 * exatamente o defeito que fez as torres da cidade virarem painéis pintados, e
 * eu o repeti numa peça nova três commits depois.
 *
 * Num plano virado para a câmera, o que é vertical na textura é vertical na
 * TELA, custe o que custar a geometria. A posição ainda anda com a perspectiva;
 * a INCLINAÇÃO não existe mais.
 */
function texturaDoEstandarte(linhas: string[]): THREE.CanvasTexture {
    // três vezes mais alto: agora cabe o mastro embaixo do pano
    const L = 128, A = 768;
    const c = document.createElement('canvas'); c.width = L; c.height = A;
    const g = c.getContext('2d')!;
    // O MASTRO, primeiro e atrás: uma faixa vertical que desce até a base.
    g.fillStyle = '#6a6478'; g.fillRect(59, 4, 10, A - 4);
    g.fillStyle = '#585268'; g.fillRect(66, 4, 3, A - 4);
    // a travessa
    g.fillStyle = '#c9a24a'; g.fillRect(18, 4, 92, 9);
    // o pano
    g.fillStyle = '#2c3f6b'; g.fillRect(0, 13, 128, 243);
    g.fillStyle = '#e8c97a'; g.fillRect(0, 13, 128, 8); g.fillRect(0, 227, 128, 6);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, 269); g.lineTo(64, 227); g.lineTo(128, 269); g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#f3e2b0'; g.textAlign = 'center'; g.font = 'bold 21px monospace';
    linhas.forEach((t, i) => g.fillText(t, 64, 79 + i * 28));
    g.fillStyle = '#e8c97a';
    g.fillRect(50, 181, 28, 12);
    for (let i = 0; i < 3; i++) g.fillRect(50 + i * 12, 171, 6, 12);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/**
 * Um estandarte — e o MASTRO é metade do trabalho dele.
 *
 * ── UMA COISA OPACA BOIANDO NO CÉU NÃO É CENÁRIO, É ARTEFATO ────────────────
 *
 * Eles eram uma travessa e um pano, pendurados no nada a 26% da altura da tela.
 * Um avaliador, olhando a foto, leu exatamente isso: "retângulos azuis pendurados
 * no nada, sem mastro nem prédio". E ele tinha razão — o olho aceita qualquer
 * coisa flutuando desde que saiba POR QUÊ, e não havia porquê nenhum.
 *
 * O mastro desce até abaixo da linha do céu, onde a silhueta da cidade o come.
 * Não é decoração: é a explicação de por que o pano está lá em cima, e custa um
 * cilindro.
 */
const Estandarte: React.FC<{ p: [number, number, number]; e: number; mastro: number; linhas: string[] }> =
    ({ p, e, mastro, linhas }) => {
        const tex = useMemo(() => texturaDoEstandarte(linhas), [linhas]);
        const malha = useRef<THREE.Mesh>(null);
        // O balanço vira um leve vaivém em X: girar o plano inteiro devolveria a
        // inclinação que este componente existe para não ter.
        useFrame((state) => {
            if (malha.current) {
                malha.current.position.x = Math.sin(state.clock.elapsedTime * 0.8 + p[0]) * 0.06;
            }
        });
        // `mastro` é o comprimento total em unidades locais: o pano ocupa o topo
        // e o resto é haste, na mesma proporção da textura.
        const alturaDoPano = 4.0;
        const alt = Math.max(alturaDoPano * 1.2, mastro);
        return (
            <group position={p} scale={e}>
                <mesh ref={malha} position={[0, -alt / 2 + alturaDoPano * 0.52, 0]}>
                    <planeGeometry args={[alt * (128 / 768) * 2.0, alt]} />
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
        // Janelas acesas: a camada de trás não acende NENHUMA. Uma janela é um
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
        <group position={p} scale={1.9} rotation={[0, 0.22, 0]}>
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
    // O hotel ancorado pelo TOPO, como as camadas da cidade.
    //
    // Ele estava posicionado pela ORIGEM do grupo em 5% da altura — e o grupo
    // interno desce 28 unidades antes de o prédio começar a subir, então o
    // prédio inteiro caía para fora do quadro e sobrava um naco marrom cortado
    // no canto. `TOPO_DO_HOTEL` é a única fração que interessa: onde a ponta do
    // pináculo encosta na tela.
    const hotel = useMemo(() => {
        const z = -230;
        // topo do prédio em coordenadas do grupo: (27,2 - 28) * 2,6
        const doTopoAteAOrigem = (27.2 - 28) * 1.9;
        return [xParaFracao(0.17, z), yParaFracao(0.215, z) - doTopoAteAOrigem, z] as [number, number, number];
    }, []);
    // O mastro vai do pano até MERGULHAR na linha do céu (0,12): assim ele
    // termina dentro da silhueta da cidade e não no ar.
    const estandartes = useMemo(() => ([
        { u: 0.07, v: 0.28, z: -190, e: 3.4, linhas: ['MAIS', 'ALTO', 'É', 'MELHOR'] },
        { u: 0.93, v: 0.29, z: -196, e: 3.3, linhas: ['ANDAR', '12'] },
    ].map((b) => {
        const y = yParaFracao(b.v, b.z);
        return {
            ...b,
            p: [xParaFracao(b.u, b.z), y, b.z] as [number, number, number],
            // em unidades LOCAIS do grupo, que já está escalado por `e`
            mastro: Math.max(2, (y - yParaFracao(0.12, b.z)) / b.e + 1.1),
        };
    })), []);

    return (
        <group>
            {/* duas camadas: a de trás mais alta e mais clara (perspectiva
                aérea), a da frente mais baixa e mais escura */}
            <CamadaDaCidade semente={0xc1} topo={0.185} altura={0.075} z={-380}
                torres={120} variacao={0.42} desbotar={0.62} opacidade={0.85} />
            <CamadaDaCidade semente={0xc2} topo={0.150} altura={0.105} z={-260}
                torres={82} variacao={0.55} desbotar={0.28} opacidade={0.97} />
            <HotelGrande M={M} p={hotel} />
            {estandartes.map((b, i) => <Estandarte key={i} p={b.p} e={b.e} mastro={b.mastro} linhas={b.linhas} />)}
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
        vitoria: new THREE.Color('#ffe9c4'),
    }), []);

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        // O FUNDO agora é o domo; o que continua sendo cor é a NÉVOA, e ela tem
        // de acompanhar o horizonte do domo, senão a cidade ao longe se dissolve
        // numa cor que não existe no céu atrás dela.
        // Na MORTE o céu clareia — e depressa. O andar escureceu na virada para
        // dizer "isto ficou sério"; clarear na morte é a mesma frase ao
        // contrário, e é de graça: uma interpolação de cor, nenhum cenário novo.
        const morrendo = f12.fase === 'morrendo' || f12.fase === 'vitoria';
        fundo.current.lerp(
            morrendo ? alvo.vitoria : (f12.passouDaVirada ? alvo.sombrio : alvo.claro),
            Math.min(1, dt * (morrendo ? 2.2 : 0.7)));
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
