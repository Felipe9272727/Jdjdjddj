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
}> = ({ aberturaRef, heliceRef }) => {
    const asaE = useRef<THREE.Group>(null);
    const asaD = useRef<THREE.Group>(null);
    const cauda = useRef<THREE.Group>(null);
    const nariz = useRef<THREE.Group>(null);
    const helice = useRef<THREE.Group>(null);

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
        if (helice.current) {
            const v = heliceRef ? heliceRef.current : 1;
            helice.current.rotation.z += dt * 26 * v * k;
            helice.current.scale.setScalar(k);
        }
    });

    return (
        <group>
            {/* fuselagem: a cabine, agora comprida — ver a nota das proporções */}
            <B args={[1.15, 1.05, 2.6]} m={M.cabine} />
            <B args={[1.2, 0.12, 2.65]} p={[0, 0.53, 0]} m={M.cabineEsc} />
            <B args={[1.2, 0.12, 2.65]} p={[0, -0.53, 0]} m={M.cabineEsc} />
            {/* a quilha traseira: afina a fuselagem até a cauda, para o corpo
                não acabar num tijolo cortado */}
            <B args={[0.8, 0.72, 0.7]} p={[0, -0.02, 1.55]} m={M.cabineEsc} />
            {/* o painel de botões do elevador, do lado do piloto — o detalhe que
                diz que isto era um elevador */}
            <B args={[0.08, 0.5, 0.3]} p={[0.6, 0.05, 0.15]} m={M.latao} />
            {[0.16, 0.03, -0.1].map((y, i) => (
                <B key={i} args={[0.05, 0.07, 0.07]} p={[0.64, y, 0.15]} m={M.botao} />
            ))}
            {/* para-brisa */}
            <B args={[0.86, 0.4, 0.06]} p={[0, 0.24, -1.25]} m={M.vidro} />

            {/* nariz = a porta */}
            <group ref={nariz} position={[0, 0, -1.45]}>
                <B args={[1.0, 0.9, 0.5]} m={M.ferro} />
                <B args={[0.08, 0.9, 0.52]} m={M.ferroEsc} />
                <group ref={helice} position={[0, 0, -0.3]}>
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
                asa de verdade) e ponta marcada — três coisas que dão silhueta em
                vez de traço. */}
            <group ref={asaE} position={[-0.45, -0.05, 0.25]} rotation={[0, 0, 0.20]}>
                <B args={[1.05, 0.26, 1.15]} p={[-0.52, 0, 0]} m={M.metal} />
                <B args={[0.55, 0.20, 0.78]} p={[-1.30, 0.06, -0.08]} m={M.metal} />
                {/* ponta marcada, mais clara: é ela que o olho segue na rolagem */}
                <B args={[0.30, 0.34, 0.44]} p={[-1.62, 0.13, -0.14]} m={M.metalEsc} />
                {/* luz de navegação na ponta da asa — e é DAQUI que o tiro sai */}
                <B args={[0.16, 0.16, 0.16]} p={[-1.72, 0.16, -0.22]} m={M.fogo} />
            </group>
            <group ref={asaD} position={[0.45, -0.05, 0.25]} rotation={[0, 0, -0.20]}>
                <B args={[1.05, 0.26, 1.15]} p={[0.52, 0, 0]} m={M.metal} />
                <B args={[0.55, 0.20, 0.78]} p={[1.30, 0.06, -0.08]} m={M.metal} />
                <B args={[0.30, 0.34, 0.44]} p={[1.62, 0.13, -0.14]} m={M.metalEsc} />
                <B args={[0.16, 0.16, 0.16]} p={[1.72, 0.16, -0.22]} m={M.fogo} />
            </group>

            {/* ── CAUDA ──
                Ela sai do teto e é ALTA de propósito: de trás, a deriva é a
                única peça que quebra a linha horizontal das asas, e é ela que
                faz o olho ler "avião" num vulto de trinta pixels. */}
            <group ref={cauda} position={[0, 0.12, 1.35]}>
                {/* A DERIVA É ALTA DE PROPÓSITO. De trás, ela é a única peça
                    vertical num vulto que é todo horizontal, e é ela que faz o
                    olho ler "avião" a trinta pixels. A anterior tinha 1,25 numa
                    malha de 5,30 de envergadura — 24% — e sumia. Esta tem 1,55
                    numa de 4,00: 39%, quase o dobro de altura relativa. */}
                <B args={[0.18, 1.55, 0.66]} p={[0, 0.77, 0]} m={M.metal} />
                <B args={[0.22, 0.44, 0.34]} p={[0, 1.52, 0.06]} m={M.metalEsc} />
                {/* estabilizador horizontal: o "T" que fecha a leitura */}
                <B args={[1.35, 0.15, 0.46]} p={[0, 0.12, 0.06]} m={M.metalEsc} />
                <B args={[1.4, 0.1, 0.12]} p={[0, 0.2, 0.2]} m={M.metal} />
            </group>

            {/* ── O ESCAPE ──
                Duas chamas atrás. Elas dizem para que lado o avião aponta, o que
                de trás não é óbvio, e ancoram a nave no quadro quando tudo o
                mais está voando. */}
            <B args={[0.3, 0.3, 0.58]} p={[-0.3, -0.08, 1.72]} m={M.fogo} />
            <B args={[0.3, 0.3, 0.58]} p={[0.3, -0.08, 1.72]} m={M.fogo} />
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

    useFrame((state) => {
        const g = raiz.current; if (!g) return;
        const n = naveRef.current;
        g.position.set(n.x, n.y, 0);
        g.visible = visivelRef ? visivelRef.current : true;
        if (visual.current) {
            visual.current.rotation.z = n.rolagem;
            // o nariz sobe/desce com a velocidade vertical: dá peso ao avião
            visual.current.rotation.x = THREE.MathUtils.clamp(-n.vy * 0.045, -0.35, 0.35);
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
                    <CascoDoElevador aberturaRef={aberturaRef} heliceRef={heliceRef} />
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
        if (visual.current) {
            visual.current.rotation.z = n.rolagem * 0.8;
            visual.current.visible = n.piscando <= 0
                || Math.floor(state.clock.elapsedTime * 14) % 2 === 0;
        }
        if (helice.current) helice.current.rotation.z += dt * 24;
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
