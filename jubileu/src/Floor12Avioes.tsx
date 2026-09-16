/**
 * Floor12Avioes.tsx — o avião do jogador e o do irmão.
 *
 * ── O AVIÃO DO JOGADOR É O ELEVADOR ──────────────────────────────────────────
 *
 * Não é uma nave qualquer: é a CABINE do elevador do hotel com asas. As paredes
 * viraram fuselagem, as portas viraram o nariz, o painel de botões continua ali
 * do lado do piloto. É o que a introdução encena, e é o que faz o andar 12 ser
 * deste jogo e não de outro — o hotel não deu um avião ao hóspede, o hotel
 * DOBROU o elevador até virar um.
 *
 * O piloto é o `Avatar64` do andar 5, o mesmo modelo, sentado. Reaproveitar em
 * vez de refazer é o que garante que o jogador se reconheça: um segundo boneco
 * "parecido" seria lido na hora como outra pessoa.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mat64, Avatar64, useAvatarRefs, type AvatarRefs } from './Floor5Player64';
import { NAVE, ENQUADRAMENTO, RASPAO, type Nave } from './f12Boss';

const CORES = {
    cabine: '#c9b28a',      // o creme do elevador
    cabineEsc: '#a48f6b',
    // ── O AZUL É CONTRASTE, NÃO ENFEITE ──────────────────────────────────
    // O casco é a cabine do elevador, ou seja creme — e o chefe é um crânio
    // lilás claro do mesmo valor. Na foto o avião SUMIA em cima da cara dele: um
    // jogo de nave em que não dá para achar a própria nave. As asas e a cauda
    // ganharam o azul da camisa do avatar do andar 5, que é a cor do jogador
    // neste jogo desde lá e que separa na hora contra o roxo.
    metal: '#3b6fb0',
    metalEsc: '#2c5489',
    ferro: '#8e97a6',
    ferroEsc: '#5f6773',
    vidro: '#8fd4ff',
    helice: '#3a3a44',
    botao: '#ffd54f',
    latao: '#d9a441',
    // ── O IRMÃO É AZEDO, MAS TEM DE SER VISÍVEL ──────────────────────────
    // A paleta dele era #6f7d86 sobre #4d5860: dois cinzas escuros contra um céu
    // claro, e o resultado na foto era uma MANCHA PRETA de vinte pixels no canto
    // da tela. "Mal humorado" é uma decisão de cor, não de brilho — um verde
    // industrial encardido azeda tanto quanto e ainda se separa do azul. A
    // faixa laranja é o que o encontra no meio de um céu cheio de projétil.
    irmao: '#9aa88f',
    irmaoEsc: '#6b7862',
    irmaoFaixa: '#e07a3a',
    irmaoLuz: '#ff6b4a',
};

/**
 * A ESCALA DO AVIÃO, e por que ela é uma conta e não um gosto.
 *
 * O casco é modelado com 5,30 de envergadura em unidades locais. Isso o punha
 * MAIS LARGO QUE A TELA num celular em pé, e cinco vezes maior que a própria
 * caixa de colisão — o jogador levaria dano de coisas que passaram longe. A
 * envergadura alvo vem de `ENQUADRAMENTO`, que concilia arena, aspecto de tela
 * e caixa de colisão num lugar só.
 */
/**
 * ── AS PROPORÇÕES, E POR QUE ELAS MUDARAM ────────────────────────────────────
 *
 * A malha tinha 5,30 de envergadura para 1,90 de fuselagem: razão 2,8. Isso não
 * é um avião, é uma prancha com uma caixa em cima — e foi exatamente assim que
 * ele saiu na foto, um traço azul horizontal com um quadrado creme no meio.
 * Caça visto de trás fica entre 1,2 e 1,6 de envergadura por comprimento; o
 * corpo tem de ter fundura suficiente para o olho achar a direção do voo.
 *
 * Agora são 4,00 de envergadura para 2,60 de fuselagem: razão 1,54. Como a
 * envergadura DESENHADA é fixada por `ENQUADRAMENTO` (2,35 de mundo, 28,6% da
 * largura da tela), encurtar a asa na malha ENGORDA tudo o mais na mesma
 * proporção — a cabine sai de 0,51 para 0,68 de largura, e o piloto do andar 5
 * lá dentro cresce junto. Menos envergadura modelada, avião maior na tela.
 */
const ENVERGADURA_MODELADA = 4.00;
const ESCALA_DO_AVIAO = ENQUADRAMENTO.envergadura / ENVERGADURA_MODELADA;

/** Uma caixa, que é como todo este jogo é feito. */
const B: React.FC<{ args: [number, number, number]; p?: [number, number, number]; r?: [number, number, number]; m: THREE.Material }> =
    ({ args, p = [0, 0, 0], r = [0, 0, 0], m }) => (
        <mesh position={p} rotation={r} material={m}><boxGeometry args={args} /></mesh>
    );

// ── A ATITUDE DE VOO: O QUE FAZ ISTO SER UM ESPAÇO E NÃO UM SPRITE ───────────
//
// Fotografado com a bancada de voo (alvos fortes para os quatro lados), o avião
// deslizava pela arena SEM MUDAR DE POSTURA num eixo só: ele rolava e mais nada.
// Um avião que anda de lado continuando de frente para a câmera é um adesivo
// preso na tela, e era essa a leitura.
//
// Três coisas consertam isso, e nenhuma delas mexe na POSIÇÃO — este arquivo já
// pagou caro por desenho que discordava da conta: houve um bamboleio visual que
// discordava da caixa de colisão e o dano vinha de 90 cm de onde o jogador via
// a nave. Aqui só se gira.
//
//   • ROLAGEM, que já vinha da simulação, agora passa por uma mola e por isso
//     PASSA DO PONTO no fim da curva e volta — é o meio-grau a mais que separa
//     um avião com massa de um avião num trilho;
//   • GUINADA: o nariz aponta para onde ele está indo. É a única das três que
//     mostra o FLANCO do modelo, e é por isso que ela é a que mais vende que
//     existe um eixo Z ali;
//   • ARFAGEM: o nariz sobe quando ele sobe. Sem isto, subir e descer eram o
//     mesmo desenho deslizando, que é literalmente um sprite em 2D.
const ATITUDE = {
    /** Radianos de nariz para cima na subida mais rápida. */
    arfagem: 0.40,
    /** Radianos de guinada na corrida lateral mais rápida. */
    guinada: 0.32,
    /** Mola da postura: rígida o bastante para responder, frouxa para pesar. */
    rigidez: 90,
    atrito: 13,
    /** Quanto o leme e os ailerons defletem por radiano/s de manobra. */
    superficie: 0.075,
    /** O respiro parado: o avião nunca fica perfeitamente imóvel no ar. */
    respiro: 0.022,
};

/** A postura visual do avião. Mora aqui e não na `Nave` porque é enfeite. */
interface Atitude { rol: number; rolV: number; arf: number; arfV: number; gui: number }

const novaAtitude = (): Atitude => ({ rol: 0, rolV: 0, arf: 0, arfV: 0, gui: 0 });

const preso = (v: number): number => Math.max(-1, Math.min(1, v));

/**
 * Um passo da postura. `ganho` é o quanto o avião se entrega à manobra — o
 * irmão voa com menos, porque ele é velho e não tem pressa.
 */
function passoDaAtitude(a: Atitude, n: Nave, dt: number, ganho = 1): void {
    const d = Math.min(dt, 0.05);
    const V = NAVE.velocidadeDoAlvo;
    const alvoRol = n.rolagem * ganho;
    const alvoArf = preso(n.vy / V) * ATITUDE.arfagem * ganho;
    // Nariz para +x pede rotação Y NEGATIVA: a frente do modelo é -z.
    const alvoGui = -preso(n.vx / V) * ATITUDE.guinada * ganho;
    // Mola amortecida (ζ ≈ 0,68): ela alcança o alvo, passa um pouco e volta.
    a.rolV += ((alvoRol - a.rol) * ATITUDE.rigidez - a.rolV * ATITUDE.atrito) * d;
    a.rol += a.rolV * d;
    a.arfV += ((alvoArf - a.arf) * ATITUDE.rigidez - a.arfV * ATITUDE.atrito) * d;
    a.arf += a.arfV * d;
    // A guinada não precisa de excesso: um nariz que passa do ponto lateralmente
    // parece derrapagem, não peso.
    a.gui += (alvoGui - a.gui) * Math.min(1, d * 8);
}

/**
 * O CASCO — a cabine do elevador com asas.
 *
 * `abertura` (0..1) é o quanto ela já se desdobrou: 0 é um cubo de elevador
 * fechado, 1 é o avião pronto. A introdução anima esse número, e depois ele
 * fica em 1 pelo resto do andar. Ter UM parâmetro para isso é o que permite a
 * transformação ser encenada sem existir um segundo modelo.
 */
export const CascoDoElevador: React.FC<{
    aberturaRef: React.MutableRefObject<number>;
    heliceRef?: React.MutableRefObject<number>;
    /** A postura de voo, para as superfícies de comando defletirem com ela. */
    atitudeRef?: React.MutableRefObject<Atitude>;
}> = ({ aberturaRef, heliceRef, atitudeRef }) => {
    const asaE = useRef<THREE.Group>(null);
    const asaD = useRef<THREE.Group>(null);
    const cauda = useRef<THREE.Group>(null);
    const nariz = useRef<THREE.Group>(null);
    const portaE = useRef<THREE.Group>(null);
    const portaD = useRef<THREE.Group>(null);
    const helice = useRef<THREE.Group>(null);
    const leme = useRef<THREE.Group>(null);
    const profundor = useRef<THREE.Group>(null);
    const aileronE = useRef<THREE.Group>(null);
    const aileronD = useRef<THREE.Group>(null);

    const M = useMemo(() => ({
        cabine: mat64(CORES.cabine), cabineEsc: mat64(CORES.cabineEsc),
        metal: mat64(CORES.metal), metalEsc: mat64(CORES.metalEsc),
        ferro: mat64(CORES.ferro), ferroEsc: mat64(CORES.ferroEsc),
        vidro: mat64(CORES.vidro), helice: mat64(CORES.helice),
        botao: mat64(CORES.botao, CORES.botao, 0.6), latao: mat64(CORES.latao),
        fogo: mat64('#ffb347', '#ff7a2a', 1.1),
    }), []);

    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const k = THREE.MathUtils.clamp(aberturaRef.current, 0, 1);
        // As asas GIRAM para fora a partir da parede: é uma parede de elevador
        // se abrindo, não uma asa aparecendo.
        if (asaE.current) { asaE.current.rotation.z = (1 - k) * Math.PI * 0.52; asaE.current.scale.x = 0.25 + k * 0.75; }
        if (asaD.current) { asaD.current.rotation.z = -(1 - k) * Math.PI * 0.52; asaD.current.scale.x = 0.25 + k * 0.75; }
        // A cauda sobe do teto.
        if (cauda.current) { cauda.current.position.y = -0.5 + k * 0.62; cauda.current.scale.y = 0.1 + k * 0.9; }
        // O nariz é a PORTA do elevador, empurrada para a frente.
        if (nariz.current) nariz.current.position.z = -0.55 - k * 0.55;
        // ── E AS DUAS FOLHAS DA PORTA VIRAM O BICO ───────────────────
        // Empurrar uma porta fechada para a frente dá um TIJOLO na frente do
        // avião, que foi o que a foto mostrou. As duas folhas giram nos próprios
        // eixos até se encostarem em cunha: em 0 é a porta do elevador, de
        // frente e fechada; em 1 é um bico. A mesma peça conta as duas coisas,
        // que é a regra de ouro desta transformação.
        if (portaE.current) portaE.current.rotation.y = k * 0.30;
        if (portaD.current) portaD.current.rotation.y = -k * 0.30;
        if (helice.current) {
            const v = heliceRef ? heliceRef.current : 1;
            helice.current.rotation.z += dt * 26 * v * k;
            helice.current.scale.setScalar(k);
        }
        // ── AS SUPERFÍCIES DE COMANDO ────────────────────────────────
        // Leme, profundor e ailerons defletem com a VELOCIDADE da manobra, não
        // com o ângulo: é assim num avião de verdade e, num modelo de trinta
        // pixels, é o que dá a impressão de que alguém está pilotando.
        const a = atitudeRef?.current;
        if (a) {
            const d = (v: number) => THREE.MathUtils.clamp(v * ATITUDE.superficie, -0.5, 0.5);
            if (leme.current) leme.current.rotation.y = d(-a.gui * 9);
            if (profundor.current) profundor.current.rotation.x = d(-a.arfV);
            if (aileronE.current) aileronE.current.rotation.x = d(a.rolV);
            if (aileronD.current) aileronD.current.rotation.x = d(-a.rolV);
        }
    });

    return (
        <group>
            {/* ── A CABINE ──
                A caixa creme é a cabine; os montantes de latão nos cantos e os
                frisos de teto e piso são o que a fazem ler como CABINE e não
                como caixote. De trás — que é o ângulo do andar inteiro — são
                eles que dão as arestas que o sombreamento chapado precisa. */}
            <B args={[1.15, 1.05, 2.6]} m={M.cabine} />
            <B args={[1.22, 0.12, 2.66]} p={[0, 0.53, 0]} m={M.cabineEsc} />
            <B args={[1.22, 0.12, 2.66]} p={[0, -0.53, 0]} m={M.cabineEsc} />
            <B args={[0.10, 1.06, 0.10]} p={[-0.60, 0, 1.24]} m={M.latao} />
            <B args={[0.10, 1.06, 0.10]} p={[0.60, 0, 1.24]} m={M.latao} />
            {/* o painel de botões do elevador, do lado do piloto — o detalhe que
                diz que isto era um elevador */}
            <B args={[0.08, 0.5, 0.3]} p={[0.6, 0.05, 0.15]} m={M.latao} />
            {[0.16, 0.03, -0.1].map((y, i) => (
                <B key={i} args={[0.05, 0.07, 0.07]} p={[0.64, y, 0.15]} m={M.botao} />
            ))}
            {/* para-brisa */}
            <B args={[0.86, 0.4, 0.06]} p={[0, 0.24, -1.25]} m={M.vidro} />

            {/* ── A TRASEIRA, QUE É A ÚNICA PARTE QUE O JOGADOR OLHA ──
                O corpo acabava num tijolo cortado e o casco inteiro lia como
                caixa; agora ele AFINA em dois degraus até uma parede de fundo
                com corrimão e com o indicador de andar aceso. A piada do
                elevador estava toda nos lados do modelo, ou seja num lugar que
                a câmera de terceira pessoa nunca mostra — o indicador põe a
                piada exatamente no ângulo em que o andar é jogado. */}
            <B args={[0.92, 0.86, 0.62]} p={[0, -0.02, 1.60]} m={M.cabine} />
            <B args={[0.66, 0.62, 0.42]} p={[0, -0.06, 2.02]} m={M.cabineEsc} />
            <B args={[0.46, 0.26, 0.06]} p={[0, 0.10, 2.22]} m={M.latao} />
            <B args={[0.09, 0.13, 0.04]} p={[-0.10, 0.10, 2.25]} m={M.botao} />
            <B args={[0.09, 0.13, 0.04]} p={[0.10, 0.10, 2.25]} m={M.botao} />
            <B args={[0.64, 0.07, 0.07]} p={[0, -0.20, 2.21]} m={M.latao} />

            {/* nariz = a porta do elevador, que se dobra em bico */}
            <group ref={nariz} position={[0, 0, -1.45]}>
                {/* o batente: a moldura da porta ficou onde estava */}
                <B args={[1.08, 0.98, 0.14]} p={[0, 0, 0.22]} m={M.ferroEsc} />
                <group ref={portaE} position={[-0.26, 0, 0]}>
                    <B args={[0.50, 0.90, 0.50]} m={M.ferro} />
                    {/* o vidrinho da porta e a chapa de rodapé: é por eles que
                        a peça continua sendo uma PORTA depois de virar bico */}
                    <B args={[0.28, 0.24, 0.02]} p={[0, 0.24, -0.26]} m={M.vidro} />
                    <B args={[0.50, 0.12, 0.52]} p={[0, -0.36, 0]} m={M.latao} />
                </group>
                <group ref={portaD} position={[0.26, 0, 0]}>
                    <B args={[0.50, 0.90, 0.50]} m={M.ferro} />
                    <B args={[0.28, 0.24, 0.02]} p={[0, 0.24, -0.26]} m={M.vidro} />
                    <B args={[0.50, 0.12, 0.52]} p={[0, -0.36, 0]} m={M.latao} />
                </group>
                <group ref={helice} position={[0, 0, -0.42]}>
                    <B args={[2.0, 0.1, 0.06]} m={M.helice} />
                    <B args={[0.1, 2.0, 0.06]} m={M.helice} />
                    <mesh material={M.latao}><sphereGeometry args={[0.16, 10, 8]} /></mesh>
                </group>
            </group>

            {/* ── ASAS ──
                VISTO DE TRÁS, que é como o jogador passa o andar inteiro
                olhando, a primeira versão destas asas era uma LINHA: chapas de
                0,12 de espessura, de canto para a câmera. Um avião que de trás
                não parece um avião.
                Agora elas são grossas, têm DIEDRO (sobem para fora, como toda
                asa de verdade), carenagem na raiz — sem ela a prancha só
                ATRAVESSA a cabine, que era a leitura de "tábua espetada" — e
                aileron no bordo de fuga. */}
            <group ref={asaE} position={[-0.45, -0.05, 0.25]} rotation={[0, 0, 0.20]}>
                <B args={[0.44, 0.46, 1.34]} p={[-0.16, 0.02, 0]} m={M.cabineEsc} />
                <B args={[1.05, 0.26, 1.15]} p={[-0.60, 0, 0]} m={M.metal} />
                <B args={[0.55, 0.20, 0.78]} p={[-1.34, 0.06, -0.08]} m={M.metal} />
                {/* ponta marcada, mais clara: é ela que o olho segue na rolagem */}
                <B args={[0.30, 0.34, 0.44]} p={[-1.66, 0.13, -0.14]} m={M.metalEsc} />
                {/* luz de navegação na ponta da asa — e é DAQUI que o tiro sai */}
                <B args={[0.16, 0.16, 0.16]} p={[-1.76, 0.16, -0.22]} m={M.fogo} />
                <group ref={aileronE} position={[-1.05, 0.02, 0.58]}>
                    <B args={[0.96, 0.10, 0.26]} p={[0, 0, 0.13]} m={M.metalEsc} />
                </group>
            </group>
            <group ref={asaD} position={[0.45, -0.05, 0.25]} rotation={[0, 0, -0.20]}>
                <B args={[0.44, 0.46, 1.34]} p={[0.16, 0.02, 0]} m={M.cabineEsc} />
                <B args={[1.05, 0.26, 1.15]} p={[0.60, 0, 0]} m={M.metal} />
                <B args={[0.55, 0.20, 0.78]} p={[1.34, 0.06, -0.08]} m={M.metal} />
                <B args={[0.30, 0.34, 0.44]} p={[1.66, 0.13, -0.14]} m={M.metalEsc} />
                <B args={[0.16, 0.16, 0.16]} p={[1.76, 0.16, -0.22]} m={M.fogo} />
                <group ref={aileronD} position={[1.05, 0.02, 0.58]}>
                    <B args={[0.96, 0.10, 0.26]} p={[0, 0, 0.13]} m={M.metalEsc} />
                </group>
            </group>

            {/* ── CAUDA ──
                Ela sai do teto e é ALTA de propósito: de trás, a deriva é a
                única peça que quebra a linha horizontal das asas, e é ela que
                faz o olho ler "avião" num vulto de trinta pixels. */}
            <group ref={cauda} position={[0, 0.12, 1.35]}>
                {/* A DERIVA É ALTA DE PROPÓSITO. De trás, ela é a única peça
                    vertical num vulto que é todo horizontal, e é ela que faz o
                    olho ler "avião" a trinta pixels. A anterior tinha 1,25 numa
                    malha de 5,30 de envergadura — 24% — e sumia. Esta tem 1,50
                    numa de 4,00.
                    E ela tem CORDA em dois degraus: com 0,18 de espessura e uma
                    corda só, de trás ela saía na foto como um MASTRO — o avião
                    inteiro lia como cata-vento. Uma base larga que afina para o
                    topo é a diferença entre um mastro e uma deriva. */}
                {/* A ESPIGA DORSAL. Sem ela a deriva é um mastro ESPETADO no
                    teto — foi assim que ela saiu na foto de zoom, uma cruz azul
                    pousada em cima de uma caixa. A rampa que desce da base da
                    deriva para o teto da cabine é o que costura as duas peças
                    num corpo só. */}
                <B args={[0.22, 0.34, 1.05]} p={[0, 0.06, -0.62]} m={M.metal} />
                <B args={[0.26, 0.82, 0.92]} p={[0, 0.42, 0.06]} m={M.metal} />
                <B args={[0.22, 0.78, 0.62]} p={[0, 1.10, -0.02]} m={M.metal} />
                <B args={[0.26, 0.22, 0.46]} p={[0, 1.52, 0.02]} m={M.metalEsc} />
                <group ref={leme} position={[0, 0.80, 0.52]}>
                    <B args={[0.14, 1.30, 0.24]} p={[0, 0, 0.12]} m={M.metalEsc} />
                </group>
                {/* estabilizador: ele subiu para ACIMA do teto da cabine. Onde
                    estava, o corpo o escondia inteiro e a cauda não tinha o
                    "T" que fecha a leitura de avião. */}
                <B args={[1.45, 0.16, 0.50]} p={[0, 0.62, 0.10]} m={M.metalEsc} />
                <B args={[0.22, 0.26, 0.34]} p={[-0.74, 0.66, 0.06]} m={M.metal} />
                <B args={[0.22, 0.26, 0.34]} p={[0.74, 0.66, 0.06]} m={M.metal} />
                <group ref={profundor} position={[0, 0.62, 0.34]}>
                    <B args={[1.30, 0.10, 0.24]} p={[0, 0, 0.12]} m={M.metal} />
                </group>
            </group>

            {/* ── O ESCAPE ──
                Duas chamas atrás. Elas dizem para que lado o avião aponta, o que
                de trás não é óbvio, e ancoram a nave no quadro quando tudo o
                mais está voando. Agora saem de BOCAIS escuros e ficaram
                estreitas: soltas, eram dois quadrados laranja do tamanho da
                cabine e o olho lia o avião como uma cara com dois olhos. */}
            <B args={[0.32, 0.32, 0.34]} p={[-0.40, -0.26, 1.66]} m={M.ferroEsc} />
            <B args={[0.32, 0.32, 0.34]} p={[0.40, -0.26, 1.66]} m={M.ferroEsc} />
            <B args={[0.20, 0.20, 0.44]} p={[-0.40, -0.26, 1.94]} m={M.fogo} />
            <B args={[0.20, 0.20, 0.44]} p={[0.40, -0.26, 1.94]} m={M.fogo} />
        </group>
    );
};

/** Senta o avatar do andar 5 na cabine: joelhos dobrados, mãos no manche. */
function sentar(refs: AvatarRefs): void {
    const p = (r: React.MutableRefObject<THREE.Group | null>, x: number, z = 0) => {
        if (r.current) { r.current.rotation.x = x; r.current.rotation.z = z; }
    };
    p(refs.legL, -1.5, 0.12); p(refs.legR, -1.5, -0.12);
    p(refs.armL, -1.15, 0.25); p(refs.armR, -1.15, -0.25);
    if (refs.shadow.current) refs.shadow.current.visible = false;   // não há chão aqui
}

/**
 * O AVIÃO DO JOGADOR.
 *
 * Ele lê `nave` (o estado puro) e desenha. Toda a física mora em `f12Boss`;
 * este componente não decide nada — se ele decidisse, o teste do módulo puro
 * estaria testando outra coisa que não o jogo.
 */
export const AviaoDoJogador: React.FC<{
    naveRef: React.MutableRefObject<Nave>;
    aberturaRef: React.MutableRefObject<number>;
    heliceRef?: React.MutableRefObject<number>;
    /** Escondido durante a primeira pessoa da introdução. */
    visivelRef?: React.MutableRefObject<boolean>;
}> = ({ naveRef, aberturaRef, heliceRef, visivelRef }) => {
    const raiz = useRef<THREE.Group>(null);
    const visual = useRef<THREE.Group>(null);
    const casco = useRef<THREE.Group>(null);
    const refs = useAvatarRefs();
    const sentado = useRef(false);
    const atitude = useRef<Atitude>(novaAtitude());

    useFrame((state, rawDt) => {
        const g = raiz.current; if (!g) return;
        const n = naveRef.current;
        // A POSIÇÃO É A DA SIMULAÇÃO, SEM UM MILÍMETRO A MAIS. Toda a postura
        // abaixo é rotação pura: é o único jeito de o que se vê e o que
        // machuca continuarem sendo o mesmo lugar.
        g.position.set(n.x, n.y, 0);
        g.visible = visivelRef ? visivelRef.current : true;
        passoDaAtitude(atitude.current, n, rawDt);
        if (visual.current) {
            const a = atitude.current;
            const t = state.clock.elapsedTime;
            visual.current.rotation.z = a.rol + Math.sin(t * 1.7) * ATITUDE.respiro;
            visual.current.rotation.x = a.arf + Math.sin(t * 1.1) * ATITUDE.respiro * 0.6;
            visual.current.rotation.y = a.gui;
        }
        // ── O BRILHO DO RASPÃO E A CARGA ─────────────────────────────
        //
        // O raspão é invisível por natureza: o jogador não tem como descobrir
        // sozinho que passar perto de um projétil está carregando alguma coisa.
        // A nave acende a cada raspão e fica acesa de vez quando a carga enche —
        // é o que ensina a mecânica sem um tutorial, e é a única peça da tela
        // que diz "desviar apertado é a sua arma".
        if (casco.current) {
            const cheia = n.carga >= RASPAO.cheia;
            const k = cheia ? 0.55 + Math.sin(state.clock.elapsedTime * 12) * 0.25 : n.brilho / RASPAO.brilho;
            casco.current.traverse((o) => {
                const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
                if (m && m.emissive) m.emissiveIntensity = 0.15 + Math.max(0, k) * 1.5;
            });
        }

        // A PISCADA da invencibilidade. Sem ela o jogador não sabe que já tomou
        // o toque e continua achando que está sendo atingido de novo.
        if (visual.current) {
            visual.current.visible = n.piscando <= 0
                || Math.floor(state.clock.elapsedTime * 14) % 2 === 0;
        }
        if (!sentado.current && refs.legL.current) { sentar(refs); sentado.current = true; }
    });

    return (
        <group ref={raiz} name="aviao" scale={ESCALA_DO_AVIAO}>
            <group ref={visual}>
                <group ref={casco}>
                    <CascoDoElevador aberturaRef={aberturaRef} heliceRef={heliceRef} atitudeRef={atitude} />
                </group>
                {/* o piloto, sentado, encolhido para caber na cabine */}
                <group position={[0, -0.6, 0.1]} scale={0.44}>
                    <Avatar64 refs={refs} />
                </group>
                {/* o anel de raspão: mostra ONDE passar perto conta */}
                <AnelDeRaspao naveRef={naveRef} />
            </group>
        </group>
    );
};

/**
 * O AVIÃO DO IRMÃO — TROCO-63.
 *
 * O robô mais velho, na paleta azeda: cinza-esverdeado em vez do cromo do 64, e
 * a luz de peito VERMELHA em vez de âmbar. Ele não pilota uma cabine de
 * elevador — pilota uma coisa de manutenção, um carrinho de serviço com asas,
 * porque foi o que sobrou para ele. A diferença de casco entre os dois aviões é
 * o que conta a diferença entre os dois irmãos sem uma linha de diálogo.
 */
export const AviaoDoIrmao: React.FC<{
    naveRef: React.MutableRefObject<Nave>;
    /** Sobe quando ele fala: as luzes correm. */
    falandoRef: React.MutableRefObject<boolean>;
}> = ({ naveRef, falandoRef }) => {
    const raiz = useRef<THREE.Group>(null);
    const visual = useRef<THREE.Group>(null);
    const helice = useRef<THREE.Group>(null);
    const luzes = useRef<THREE.MeshLambertMaterial[]>([]);
    const olho = useRef<THREE.MeshLambertMaterial | null>(null);
    const fala = useRef(0);
    const atitude = useRef<Atitude>(novaAtitude());

    const M = useMemo(() => ({
        corpo: mat64(CORES.irmao), corpoEsc: mat64(CORES.irmaoEsc),
        faixa: mat64(CORES.irmaoFaixa),
        metal: mat64(CORES.ferro), metalEsc: mat64(CORES.ferroEsc),
        helice: mat64(CORES.helice),
        luz: () => mat64(CORES.irmaoLuz, CORES.irmaoLuz, 0.35),
        olho: mat64(CORES.irmaoLuz, CORES.irmaoLuz, 0.8),
    }), []);

    useFrame((state, rawDt) => {
        const g = raiz.current; if (!g) return;
        const dt = Math.min(rawDt, 0.05);
        const n = naveRef.current;
        g.position.set(n.x, n.y, 0.4);
        // ── ELE VOA COM MENOS ENTREGA ────────────────────────────────
        // Mesma mola do avião do jogador, com 0,72 de ganho: o irmão inclina
        // menos e chega depois na curva. É a formação inteira dizendo, sem uma
        // fala, que ele é o modelo velho seguindo o novo.
        passoDaAtitude(atitude.current, n, rawDt, 0.72);
        if (helice.current) helice.current.rotation.z += dt * 24;

        // ── ELE SE MEXE ENQUANTO FALA ────────────────────────────────
        //
        // Antes, falar era só as luzinhas correrem: nas três falas do encontro
        // ele ficava parado no ar como um adesivo, e a câmera nem olhava para
        // ele. Agora ele BALANÇA — gesticula com o casco, que é o único corpo
        // que um robô sem braços tem — e inclina o nariz para quem ouve. É o
        // mesmo truque do TROCO-64 no andar 5, um andar acima na escala.
        if (visual.current) {
            const t = state.clock.elapsedTime;
            const f = falandoRef.current ? 1 : 0;
            fala.current += (f - fala.current) * Math.min(1, dt * 6);
            const k = fala.current;
            const a = atitude.current;
            // A fala SOMA à postura de voo em vez de substituí-la: escrever por
            // cima fazia o avião parar de inclinar no meio de uma manobra só
            // porque ele tinha começado a resmungar.
            visual.current.position.y = Math.sin(t * 5.5) * 0.14 * k;
            visual.current.rotation.z = a.rol;
            visual.current.rotation.x = a.arf + Math.sin(t * 4.2) * 0.10 * k;
            visual.current.rotation.y = a.gui - 0.5 * k + Math.sin(t * 2.6) * 0.09 * k;
            visual.current.visible = n.piscando <= 0
                || Math.floor(state.clock.elapsedTime * 14) % 2 === 0;
        }
        // As luzes CORREM quando ele fala — é o mesmo truque do TROCO-64, e é o
        // que faz um robô sem boca parecer que está falando.
        const t = state.clock.elapsedTime;
        luzes.current.forEach((m, i) => {
            if (!m) return;
            const aceso = falandoRef.current
                ? (Math.floor(t * 9) % luzes.current.length) === i
                : (Math.sin(t * 1.6 + i) > 0.7);
            m.emissiveIntensity = aceso ? 1.1 : 0.2;
        });
        if (olho.current) olho.current.emissiveIntensity = 0.7 + Math.sin(t * 3.1) * 0.25;
    });

    return (
        <group ref={raiz}>
            <group ref={visual} scale={ESCALA_DO_AVIAO * 0.92}>
                {/* carrinho de serviço: chassi baixo e comprido */}
                <B args={[1.0, 0.7, 2.1]} m={M.corpo} />
                <B args={[1.05, 0.1, 2.15]} p={[0, 0.36, 0]} m={M.corpoEsc} />
                {/* a faixa de serviço: é ela que o acha no meio do céu */}
                <B args={[1.06, 0.2, 0.5]} p={[0, 0.05, 0.55]} m={M.faixa} />
                <B args={[0.9, 0.55, 0.4]} p={[0, 0.15, -1.0]} m={M.metal} />
                <group ref={helice} position={[0, 0.15, -1.3]}>
                    <B args={[1.7, 0.09, 0.06]} m={M.helice} />
                    <B args={[0.09, 1.7, 0.06]} m={M.helice} />
                </group>
                {/* asas retas e curtas — nada de elegante */}
                {/* asas retas e curtas — nada de elegante —, mas GROSSAS: de
                    trás, uma chapa de 0,1 é uma linha invisível. */}
                <B args={[2.6, 0.22, 0.72]} p={[0, -0.1, 0.1]} m={M.metal} />
                <B args={[0.34, 0.3, 0.4]} p={[-1.3, 0.0, 0.05]} m={M.faixa} />
                <B args={[0.34, 0.3, 0.4]} p={[1.3, 0.0, 0.05]} m={M.faixa} />
                {/* deriva alta, mesmo motivo do avião do jogador */}
                <B args={[0.12, 0.95, 0.55]} p={[0, 0.75, 0.9]} m={M.metal} />
                <B args={[0.9, 0.12, 0.34]} p={[0, 0.36, 0.95]} m={M.metalEsc} />
                {/* o robô sentado atrás: cabeça-tela e a barra de LED do peito */}
                <group position={[0, 0.62, 0.35]}>
                    <B args={[0.62, 0.5, 0.5]} m={M.corpo} />
                    <B args={[0.5, 0.34, 0.04]} p={[0, 0.02, -0.27]} m={M.corpoEsc} />
                    <mesh position={[0, 0.02, -0.29]} material={(olho.current ??= M.olho)}>
                        <boxGeometry args={[0.34, 0.1, 0.03]} />
                    </mesh>
                    {/* antena torta: ele é o modelo velho */}
                    <B args={[0.05, 0.34, 0.05]} p={[0.18, 0.38, 0.05]} r={[0, 0, 0.35]} m={M.metalEsc} />
                </group>
                {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
                    <mesh key={i} position={[x, 0.18, -0.86]}
                        material={(luzes.current[i] ??= M.luz())}>
                        <boxGeometry args={[0.12, 0.08, 0.05]} />
                    </mesh>
                ))}
            </group>
        </group>
    );
};

export { NAVE };


/**
 * O ANEL DE RASPÃO — a regra desenhada na nave.
 *
 * `RASPAO.raio` é 1,25 e a caixa de colisão é 0,36: existe um anel de quase um
 * metro em volta da nave em que um projétil CARREGA a arma em vez de matar. Isso
 * é a coisa mais importante da luta e é completamente invisível — nenhum
 * jogador descobre por dedução que chegar perto é bom.
 *
 * O anel fica fraco o tempo todo (para não poluir) e acende quando a carga
 * enche. Ele tem exatamente o tamanho da regra, não um tamanho decorativo: este
 * arquivo já pagou caro por desenho que discordava da conta.
 */
const AnelDeRaspao: React.FC<{ naveRef: React.MutableRefObject<Nave> }> = ({ naveRef }) => {
    const anel = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        const a = anel.current; if (!a) return;
        const n = naveRef.current;
        const cheia = n.carga >= RASPAO.cheia;
        const m = a.material as THREE.MeshBasicMaterial;
        const t = state.clock.elapsedTime;
        m.opacity = cheia ? 0.5 + Math.sin(t * 12) * 0.2 : 0.1 + (n.brilho / RASPAO.brilho) * 0.5;
        m.color.set(cheia ? '#8ff0ff' : '#ffffff');
        a.scale.setScalar(cheia ? 1 + Math.sin(t * 12) * 0.08 : 1);
    });
    // dividido pela escala do avião, porque ele mora dentro do grupo escalado
    const r = RASPAO.raio / ESCALA_DO_AVIAO;
    return (
        <mesh ref={anel} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, r * 0.035, 5, 22]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.1} depthWrite={false} fog={false} />
        </mesh>
    );
};
