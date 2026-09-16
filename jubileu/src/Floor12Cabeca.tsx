/**
 * Floor12Cabeca.tsx — A CABEÇA: o chefe do andar 12.
 *
 * Uma cabeça colossal flutuando nas nuvens, no mesmo plástico chapado N64 do
 * andar 5 — porque o irmão do TROCO-64 e o avatar do jogador vêm de lá, e um
 * chefe em outro acabamento faria os três parecerem colados de jogos
 * diferentes.
 *
 * ── A BOCA É A LUTA ──────────────────────────────────────────────────────────
 *
 * Ela não é enfeite: é o relógio (`bocaNoInstante` em `f12Boss`) e é o ponto
 * fraco. Fechada, a cabeça é invulnerável e o jogador descansa; abrindo, é o
 * telegrafo — dá para ver o que vem antes de vir; aberta, ela cospe e FICA
 * aberta, e é aí que o tiro entra. O desenho tem de deixar isso óbvio sem HUD:
 * a mandíbula desce de verdade, as PORTAS abrem, o interior acende, e os olhos
 * apertam.
 *
 * A malha é toda de caixas, cilindros e esferas de baixa contagem. Nada de GLB:
 * o andar 12 carrega zero bytes de asset, e num celular isso é a diferença
 * entre entrar no andar e olhar uma tela preta esperando.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mat64 } from './Floor5Player64';
import {
    f12, ARENA, bocaNoInstante, vulneravel, VIDA_MAXIMA, LIMIAR_DA_VIRADA, BOCA_ALVO,
    ALTURA_DA_CABECA, BOCA_ABAIXO_DO_CENTRO, ESCALA_DA_CABECA,
    MORTE, quedaDaMorte, tombamentoDaMorte,
} from './f12Boss';

/**
 * O RAIO dela, em unidades de mundo.
 *
 * Vem de `f12Boss` e não é escrito aqui, porque a COMPOSIÇÃO depende dele: a
 * distância em que a cabeça flutua é calculada a partir do tamanho que ela tem
 * de ter na tela, e esse tamanho é este número. Dois números separados seriam
 * duas verdades sobre o mesmo crânio, e a que decide o enquadramento não é a
 * que desenha.
 */
export const ESCALA = ESCALA_DA_CABECA;

/** Meia-largura do crânio em unidades LOCAIS (a escala de verdade vem no group). */
const R = 3.6;
/** Quanto uma unidade local vale em mundo. A boca usa isto e só isto. */
const ESC = ESCALA / R;

/**
 * ── A BOCA DESENHADA TEM DE TER O TAMANHO DA BOCA DE VERDADE ────────────────
 *
 * `BOCA_ALVO.raio` é 2,0 de mundo: a mira tem 4,0 de diâmetro. O vão desenhado
 * chegou a ter 3,8 em unidades locais — 8,2 de mundo, DUAS VEZES a hitbox. Um
 * chefe cuja boca aberta é o dobro do lugar em que o tiro conta ensina o jogador
 * a mirar num alvo que não existe, e ele não tem como descobrir o porquê: ele vê
 * a bala entrar na boca e nada acontecer. É a mesma família de defeito que já pôs
 * o anel de mira em cima do nariz dela, do outro lado.
 *
 * O conjunto inteiro da boca é escalado para o vão ficar um pouco MAIOR que a
 * mira — generoso o bastante para convidar, perto o bastante para não mentir. A
 * escala não mexe na origem do grupo, então a cavidade continua centrada em
 * `BOCA_ABAIXO_DO_CENTRO`, que é o que a hitbox cobra.
 */
const VAO_CRU = 3.8;                                   // largura da cavidade como ela é modelada
const ESCALA_DA_BOCA = ((BOCA_ALVO.raio * 2 * 1.35) / ESC) / VAO_CRU;

// ── O QUE A FOTO DE PERTO MOSTROU, E QUE A FOTO DE LONGE ESCONDIA ────────────
//
// Um retrato fechado da cabeça (recorte do alto do quadro, celular em pé)
// mostrou três coisas que a folha de contato não mostra:
//
// 1. A CÂMERA OLHA DE BAIXO PARA CIMA. A cabeça mora a 62% da altura da tela e
//    o avião a 27%; o que o jogador vê é a face INFERIOR do chefe. Qualquer
//    detalhe posto no alto do crânio é desenhado ATRÁS dele. A coroa de doze
//    portinholas de latão que existia ali aparecia como DOIS pixels dourados
//    entre os olhos — vinte e quatro malhas para nada.
// 2. A BOCA ESTAVA ENTERRADA. Havia uma segunda esfera fazendo de "queixo",
//    centrada em y -1,51 e com 2,81 de raio em Z; na altura da cavidade ela
//    chegava a z 3,24, e a frente da cavidade estava em 2,38. A boca — que é o
//    ponto fraco e a leitura inteira da luta — era desenhada DENTRO da bochecha.
// 3. NÃO HAVIA MÁQUINA NENHUMA. Era uma bola com dois olhos. Nada de chapa,
//    junta, parafuso, eixo: o "MECÂNICA" do nome não estava na malha.
//
// Daí a reconstrução: o volume de trás continua um crânio (silhueta escura,
// achatada, contra um céu claro), e tudo o que precisa ser LIDO passa para a
// frente e para BAIXO da cara, onde a câmera de verdade está.

// ── A PALETA TEM DE TER AMPLITUDE, E O CLARO TEM DE FICAR POR DENTRO ─────────
//
// A versão anterior era três roxos de luminosidade parecida e virava uma mancha.
// A correção óbvia — clarear a pele — tem uma armadilha que a foto mostra: o céu
// deste andar é PÁLIDO e tem um sol branco exatamente atrás da cabeça. Uma
// cabeça creme ali some pela borda.
//
// Então a divisão é por função, não por gosto: a CASCA (o que forma a silhueta)
// é escura, para recortar contra o céu claro; o ROSTO (as chapas de cabine
// aparafusadas na frente) é creme, para ter contraste interno; o LATÃO faz as
// linhas duras entre um e outro. Funciona nas duas metades da luta — na
// primeira o escuro recorta contra o azul claro, na segunda o creme e a febre
// seguram a cabeça contra o céu escuro.
const CORES = {
    // ── O ESCURO TEM PISO, E QUEM O DEFINE É A LUZ DE BAIXO ──────────
    //
    // A casca começou em #453a52 e a foto de jogo saiu um bloco preto. A culpa
    // não é da cor: a cena acende com um `hemisphereLight` cuja metade de BAIXO
    // é #5a5570, e esta câmera olha a cabeça POR BAIXO — quase toda a área
    // visível dela é face descendente, iluminada só por essa metade escura. Uma
    // cor de casca abaixo do roxo do chão vira silhueta sólida sem relevo.
    casco: '#6b5d7a',       // a casca do crânio: é ela que faz a silhueta
    cascoEsc: '#403651',    // as juntas, os vãos e a barriga da casca
    creme: '#f7eed6',       // a chapa de cabine: o rosto do hotel
    cremeEsc: '#c2b090',    // a mesma chapa na sombra
    latao: '#e0ad3e',       // o metal do hotel: cornija, aros, portas
    lataoEsc: '#8f6a22',
    poco: '#17111e',        // o fundo das órbitas e dos recessos
    interior: '#140811',    // a garganta
    brasa: '#ff7a3a',       // o que arde lá dentro
    lente: '#ffcf6e',       // a lâmpada do olho (é lâmpada, não globo ocular)
    pupila: '#2a1408',
    dente: '#fff4de',
    ferida: '#e05a34',
};

export const Floor12Cabeca: React.FC<{
    /** Sobe quando um tiro entra: a cabeça pisca de dano. */
    flashRef: React.MutableRefObject<number>;
}> = ({ flashRef }) => {
    const raiz = useRef<THREE.Group>(null);
    const mandibula = useRef<THREE.Group>(null);
    const garganta = useRef<THREE.Mesh>(null);
    const portaE = useRef<THREE.Group>(null);
    const portaD = useRef<THREE.Group>(null);
    const palpE = useRef<THREE.Mesh>(null);
    const palpD = useRef<THREE.Mesh>(null);
    const sobrE = useRef<THREE.Mesh>(null);
    const sobrD = useRef<THREE.Mesh>(null);
    const tamborE = useRef<THREE.Group>(null);
    const tamborD = useRef<THREE.Group>(null);
    const ponteiro = useRef<THREE.Mesh>(null);

    const M = useMemo(() => ({
        casco: mat64(CORES.casco),
        cascoEsc: mat64(CORES.cascoEsc),
        creme: mat64(CORES.creme),
        cremeEsc: mat64(CORES.cremeEsc),
        latao: mat64(CORES.latao),
        lataoEsc: mat64(CORES.lataoEsc),
        poco: mat64(CORES.poco),
        interior: mat64(CORES.interior),
        brasa: mat64(CORES.brasa, CORES.brasa, 0.9),
        lente: mat64(CORES.lente, CORES.lente, 0.7),
        pupila: mat64(CORES.pupila),
        dente: mat64(CORES.dente),
        ferida: mat64(CORES.ferida, CORES.ferida, 0.6),
    }), []);

    // As geometrias que se repetem nascem UMA vez. São poucas malhas no total,
    // mas um dente é um dente: doze `boxGeometry` iguais no JSX são doze buffers
    // no cartão de um celular, e não custa nada não fazer isso.
    const G = useMemo(() => ({
        dente: new THREE.ConeGeometry(0.32, 0.80, 4),
        tique: new THREE.BoxGeometry(0.12, 0.30, 0.12),
        parafuso: new THREE.CylinderGeometry(0.16, 0.16, 0.14, 6),
        ferida: new THREE.IcosahedronGeometry(0.55, 0),
    }), []);

    // As feridas aparecem conforme a vida cai: a cabeça CONTA a luta no corpo,
    // e não só na barra do HUD. Um chefe cuja aparência não muda faz o jogador
    // duvidar de que está acertando.
    //
    // Elas moram na CHAPA DA CARA e nas bochechas — a metade de baixo e da
    // frente do crânio —, e não espalhadas pela esfera: metade das antigas caía
    // na nuca, onde a câmera deste andar nunca chega.
    const feridas = useMemo(() => ([
        [-1.95, 1.75, 2.75], [2.55, 0.15, 2.45], [-2.95, -1.05, 1.85],
        [1.55, 2.30, 2.45], [2.85, -1.95, 1.35], [-1.10, -1.35, 3.05],
    ] as [number, number, number][]), []);
    const feridaRefs = useRef<(THREE.Mesh | null)[]>([]);

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const b = bocaNoInstante(f12.bocaT);
        const t = state.clock.elapsedTime;

        // ── A MANDÍBULA ──────────────────────────────────────────────────
        // Ela GIRA num pivô atrás do queixo, não desliza para baixo: mandíbula
        // que translada lê como gaveta.
        if (mandibula.current) mandibula.current.rotation.x = b.abertura * 0.72;

        // ── AS PORTAS ────────────────────────────────────────────────────
        //
        // A boca dela é uma PORTA DE ELEVADOR: duas folhas de latão que se
        // encontram no meio quando ela está fechada e correm para os lados
        // quando ela vai cuspir. É o motivo do andar desenhado na cara do chefe
        // — e, de graça, um segundo telegrafo horizontal, que é o eixo em que o
        // jogador se move. A mandíbula abre o vão em Y, as portas abrem em X, e
        // o buraco preto no meio cresce nos dois eixos ao mesmo tempo.
        const corre = 0.08 + b.abertura * 0.98;
        if (portaE.current) portaE.current.position.x = -corre;
        if (portaD.current) portaD.current.position.x = corre;

        // A garganta acende quando abre — é o que faz a boca parecer perigosa
        // em vez de um buraco.
        if (garganta.current) {
            const m = garganta.current.material as THREE.MeshLambertMaterial;
            m.emissiveIntensity = 0.2 + b.abertura * 1.6;
            garganta.current.scale.setScalar(0.8 + b.abertura * 0.35);
        }

        // ── OS TAMBORES DAS TÊMPORAS ─────────────────────────────────────
        //
        // Dois tambores de cabo, um em cada lado, no ponto mais largo da
        // silhueta — que é o único lugar onde um adereço ainda aparece com a
        // câmera olhando de baixo. Eles giram sempre devagar (ela está LIGADA
        // mesmo parada) e ACELERAM enquanto a boca abre: é máquina puxando
        // carga, e o jogador ouve o telegrafo com os olhos antes de a boca
        // chegar ao fim do curso.
        const giro = dt * (0.5 + b.abertura * 5.5);
        if (tamborE.current) tamborE.current.rotation.x += giro;
        if (tamborD.current) tamborD.current.rotation.x -= giro;

        // ── OS OLHOS ─────────────────────────────────────────────────────
        // A pálpebra DESCE em vez de o olho encolher: um globo achatado em Y lê
        // como bug de escala, uma chapa descendo lê como pálpebra.
        const desce = 0.88 - b.abertura * 0.70;
        if (palpE.current) palpE.current.position.y = desce;
        if (palpD.current) palpD.current.position.y = desce;
        const franzir = b.abertura * 0.34;
        if (sobrE.current) sobrE.current.rotation.z = -0.16 - franzir;
        if (sobrD.current) sobrD.current.rotation.z = 0.16 + franzir;
        M.lente.emissiveIntensity = 0.55 + b.abertura * 1.5;

        // ── O INDICADOR DE ANDAR ─────────────────────────────────────────
        //
        // O arco de latão na testa é o mostrador de andar de uma cabine, e o
        // ponteiro dele CAI com a vida dela. Existe porque a barra do HUD conta
        // a luta fora do mundo: quem olha para o chefe — que é para onde o
        // jogador olha — não via nada mudar. Aqui o hotel anuncia a própria
        // descida.
        if (ponteiro.current) {
            const v = THREE.MathUtils.clamp(f12.vida / VIDA_MAXIMA, 0, 1);
            const a = Math.PI * (0.13 + 0.74 * v);
            ponteiro.current.position.set(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0.32);
        }

        // ── O CORPO INTEIRO ──────────────────────────────────────────────
        // Uma respiração lenta, e um TRANCO quando a boca escancara. Sem o
        // tranco a cabeça parece um cenário; com ele, parece que ela empurrou
        // o ataque para fora.
        if (raiz.current) {
            const respiro = Math.sin(t * 0.55) * 0.22;
            const tranco = b.estado === 'abrindo' ? Math.sin(b.t / 0.55 * Math.PI) * 0.5 : 0;
            // O X VEM DE `f12.bocaX`, e não de zero: a cabeça passeia, e quem
            // decide onde ela está é o módulo puro — a hitbox da boca, a saída
            // dos ataques e este crânio leem todos do mesmo número. Desenhar a
            // cabeça parada enquanto a hitbox anda seria a pior versão disto.
            raiz.current.position.set(f12.bocaX, ALTURA_DA_CABECA + respiro, ARENA.zCabeca - tranco);
            raiz.current.rotation.z = Math.sin(t * 0.31) * 0.02;
            // com pouca vida ela treme: o jogador sente o fim chegando
            const agonia = f12.vida < VIDA_MAXIMA * 0.25 ? (1 - f12.vida / (VIDA_MAXIMA * 0.25)) : 0;
            if (agonia > 0) {
                raiz.current.position.x += (Math.random() - 0.5) * agonia * 0.22;
                raiz.current.position.y += (Math.random() - 0.5) * agonia * 0.18;
            }
            // ── E ENTÃO ELA MORRE ────────────────────────────────────────
            //
            // Até o estouro grande ela só treme com força; depois, TOMBA e cai
            // acelerando para fora do quadro. As duas curvas moram em `f12Boss`
            // (`quedaDaMorte`, `tombamentoDaMorte`) porque são regra: a cena
            // dura o que a tabela diz que dura, e isso tem de ser conferível sem
            // ninguém cronometrar a olho.
            // A VITÓRIA conta como morte consumada, e não como "a luta acabou".
            //
            // O gate era só `'morrendo'`: quando a fase virava `'vitoria'`, a
            // queda e o tombamento voltavam a zero e a cabeça RESSUSCITAVA,
            // inteira e boiando, atrás do balão de vitória — visto na folha de
            // fotos da morte. Matar o chefe e vê-lo reaparecer no quadro
            // seguinte é pior do que não ter cena nenhuma.
            if (f12.fase === 'morrendo' || f12.fase === 'vitoria') {
                const mt = f12.fase === 'vitoria' ? MORTE.duracao : f12.morteT;
                const espasmo = mt < MORTE.oGrande ? 1 - mt / MORTE.oGrande : 0;
                raiz.current.position.x += (Math.random() - 0.5) * (0.35 + espasmo * 0.9);
                raiz.current.position.y += (Math.random() - 0.5) * (0.3 + espasmo * 0.8)
                    - quedaDaMorte(mt);
                raiz.current.rotation.z += tombamentoDaMorte(mt);
                raiz.current.rotation.x = tombamentoDaMorte(mt) * 0.45;
            }
        }

        // ── O PISCA DE DANO ──────────────────────────────────────────────
        if (flashRef.current > 0) flashRef.current = Math.max(0, flashRef.current - dt * 4.5);
        const brilho = flashRef.current;
        // ── DEPOIS DA VIRADA ELA ACENDE POR DENTRO ───────────────────────
        //
        // O céu escurece na segunda metade, e o dono do jogo reclamou que aí o
        // chefe — escuro — sumia no azul escuro. O céu já mudou de matiz para
        // devolver contraste; isto ataca o outro lado do mesmo problema: ela
        // passa a emitir uma brasa fraca, constante e pulsante, como se o que
        // arde na garganta estivesse vazando pelas juntas da casca. A silhueta
        // se separa do fundo por LUZ, que é o que funciona quando as duas cores
        // são escuras, e de quebra ela fica mais ameaçadora do que estava.
        //
        // O pisca entra nas TRÊS famílias de material (casca, chapa e latão) e
        // não só na pele: com o rosto dividido em três valores, acender um só
        // fazia o dano parecer uma mancha numa parte da cara.
        const febre = f12.passouDaVirada ? 0.16 + Math.sin(t * 2.2) * 0.05 : 0;
        const acender = (m: THREE.MeshLambertMaterial, k: number) =>
            m.emissive.setRGB(
                (brilho * 0.9 + febre) * k,
                (brilho * 0.32 + febre * 0.26) * k,
                (brilho * 0.26 + febre * 0.28) * k,
            );
        acender(M.casco, 1);
        acender(M.cascoEsc, 0.85);
        acender(M.creme, 0.75);
        acender(M.cremeEsc, 0.9);
        acender(M.latao, 0.6);

        // ── AS FERIDAS ───────────────────────────────────────────────────
        const perdida = 1 - f12.vida / VIDA_MAXIMA;
        feridaRefs.current.forEach((m, i) => {
            if (!m) return;
            const limiar = (i + 0.6) / feridas.length;
            const aberta = THREE.MathUtils.clamp((perdida - limiar) * 4, 0, 1);
            m.visible = aberta > 0.02;
            m.scale.setScalar(0.25 + aberta * 0.95);
            // Ela pulsa: uma ferida parada vira textura, uma ferida que respira
            // vira dano.
            (m.material as THREE.MeshLambertMaterial).emissiveIntensity =
                0.35 + Math.sin(t * 3.1 + i) * 0.2;
        });
    });

    return (
        <group ref={raiz} name="cabeca" scale={ESC} position={[0, ALTURA_DA_CABECA, ARENA.zCabeca]}>
            {/* ── A CASCA ──
                O volume de trás, e só ele: é quem faz a silhueta. ACHATADO em Y
                (uma cabeça é mais larga que alta) e com poucos gomos de
                propósito — 10 x 6 dá um poliedro de arestas grandes, que é o
                acabamento do andar 5. Uma esfera lisa aqui viraria um ovo, e um
                ovo foi exatamente o que a foto anterior mostrou. */}
            <mesh material={M.casco} position={[0, 0.55, 0]} scale={[0.95, 0.94, 0.92]}>
                <sphereGeometry args={[R, 10, 6]} />
            </mesh>
            {/* A NUCA, uma calota mais escura: divide a casca em duas peças
                aparafusadas em vez de uma bola. Aparece de raspão nas bordas e é
                o que dá espessura à silhueta. */}
            <mesh material={M.cascoEsc} position={[0, 0.70, -1.25]} scale={[0.93, 0.86, 0.75]}>
                <sphereGeometry args={[R, 10, 6]} />
            </mesh>
            {/* A BASE. A câmera deste andar olha de BAIXO, e a barriga de uma
                esfera é a coisa menos mecânica que existe: esta chapa dá à
                cabeça um fundo CHATO, que é o que separa "máquina pendurada" de
                "bola flutuando". */}
            <mesh material={M.cascoEsc} position={[0, -2.35, -0.70]}>
                <boxGeometry args={[5.0, 0.8, 4.2]} />
            </mesh>
            <mesh material={M.latao} position={[0, -2.45, -2.25]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.85, 0.85, 1.5, 8]} />
            </mesh>

            {/* ── A CHAPA DA CARA ──
                Uma placa de cabine creme aparafusada na frente do crânio. É a
                única área clara grande da cabeça, e é ela que dá a LEITURA: sem
                um plano de valor alto o rosto inteiro vira sombra chapada, que
                foi o parecer do avaliador sobre a versão anterior.

                Ela avança até z 3,25 — rente à casca na altura dos olhos e
                proeminente para cima, o que produz a saliência da testa sem uma
                peça a mais. */}
            <mesh material={M.creme} position={[0, 0.45, 2.55]}>
                <boxGeometry args={[4.7, 2.9, 1.4]} />
            </mesh>
            {/* A CORNIJA: a linha dura de latão no alto da cara. Ela é mais larga
                que a chapa e sobra dos dois lados de propósito — é a única
                aresta horizontal da cabeça, e é o que impede a silhueta de
                voltar a ser um círculo. */}
            <mesh material={M.latao} position={[0, 2.05, 2.25]}>
                <boxGeometry args={[5.0, 0.40, 1.5]} />
            </mesh>
            {[-2.35, -1.4, 1.4, 2.35].map((x) => (
                <mesh key={x} geometry={G.parafuso} material={M.lataoEsc}
                    position={[x, 2.05, 3.05]} rotation={[Math.PI / 2, 0, 0]} />
            ))}

            {/* ── O INDICADOR DE ANDAR ──
                O arco de latão com sete marcas e um ponteiro aceso: o mostrador
                que fica sobre a porta de uma cabine. É o único adereço da cabeça
                que diz DE QUEM ela é, e mora na testa — de frente para a câmera
                — e não no alto do crânio, onde a coroa antiga era invisível. */}
            <group position={[0, 2.38, 1.95]}>
                <mesh material={M.latao}>
                    <torusGeometry args={[1.45, 0.22, 4, 12, Math.PI]} />
                </mesh>
                {Array.from({ length: 5 }, (_, i) => {
                    const a = Math.PI * (0.13 + (0.74 * i) / 4);
                    return (
                        <mesh key={i} geometry={G.tique} material={M.lataoEsc}
                            position={[Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0.32]}
                            rotation={[0, 0, a - Math.PI / 2]} />
                    );
                })}
                <mesh ref={ponteiro} material={M.brasa}>
                    <boxGeometry args={[0.40, 0.40, 0.34]} />
                </mesh>
            </group>

            {/* ── AS TÊMPORAS: OS TAMBORES DE CABO ──
                No ponto mais largo da cabeça, que é o único lugar em que um
                adereço continua na silhueta com a câmera olhando de baixo. São a
                peça que faz a palavra MECÂNICA aparecer na malha: eixo, tambor,
                aro e um pino fora de centro para o giro ser visível. */}
            {[-1, 1].map((lado) => (
                <group key={lado} position={[lado * 2.72, -1.35, 1.45]}>
                    <mesh material={M.cascoEsc} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[1.08, 1.08, 0.55, 8]} />
                    </mesh>
                    <group ref={lado < 0 ? tamborE : tamborD}
                        position={[lado * 0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                        <mesh material={M.latao}>
                            <cylinderGeometry args={[0.90, 0.90, 0.66, 8]} />
                        </mesh>
                        <mesh material={M.lataoEsc} position={[0, lado * 0.34, 0]}>
                            <cylinderGeometry args={[0.44, 0.44, 0.3, 8]} />
                        </mesh>
                        {/* o pino fora de centro: sem ele um cilindro girando
                            fica parado aos olhos de quem olha */}
                        <mesh material={M.cascoEsc} position={[0.58, lado * 0.36, 0]}>
                            <boxGeometry args={[0.24, 0.3, 0.24]} />
                        </mesh>
                    </group>
                </group>
            ))}

            {/* ── AS MAÇÃS DO ROSTO ──
                Duas chapas cremes ladeando os olhos. Elas existem para o olho
                ficar num VÃO entre dois planos claros — é a sombra entre chapas
                que faz o olhar, e não uma bola preta pintada na cara. */}
            {[-1, 1].map((lado) => (
                <mesh key={lado} material={M.cremeEsc}
                    position={[lado * 2.50, -0.05, 2.35]} rotation={[0, lado * -0.24, 0]}>
                    <boxGeometry args={[1.35, 2.0, 1.3]} />
                </mesh>
            ))}
            {/* ── A QUILHA ──
                A aresta central que desce da testa até a boca, com três frestas
                de ventilação. Faz as vezes de nariz e, mais importante, dá um
                eixo vertical ao rosto: sem ele os dois olhos e a boca ficam
                soltos numa chapa lisa. */}
            <mesh material={M.creme} position={[0, -0.35, 2.95]}>
                <boxGeometry args={[0.92, 1.4, 1.1]} />
            </mesh>
            {[-0.55, 0, 0.55].map((y) => (
                <mesh key={y} material={M.poco} position={[0, y * 0.70 - 0.45, 3.52]}>
                    <boxGeometry args={[0.72, 0.16, 0.12]} />
                </mesh>
            ))}

            {/* ── OS OLHOS ──
                Não são globos: são LÂMPADAS num soquete, porque ela é uma
                máquina. Aro de latão, lente acesa, e uma chapa de pálpebra que
                desce por cima quando a boca abre. O poço atrás é quase preto de
                propósito — é o degrau de valor que faz o olho existir sem uma
                luz nova, que é tudo o que `MeshLambertMaterial` permite. */}
            {[-1, 1].map((lado) => (
                <React.Fragment key={lado}>
                    <mesh material={M.poco} position={[lado * 1.62, 0.05, 2.75]}>
                        <boxGeometry args={[1.7, 1.5, 1.0]} />
                    </mesh>
                    <mesh material={M.latao} position={[lado * 1.62, 0.05, 3.18]}
                        rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.78, 0.78, 0.30, 8]} />
                    </mesh>
                    <mesh material={M.lente} position={[lado * 1.62, 0.05, 3.30]}
                        rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.58, 0.62, 0.26, 8]} />
                    </mesh>
                    <mesh material={M.pupila} position={[lado * 1.62, 0.05, 3.44]}
                        rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.24, 0.24, 0.14, 6]} />
                    </mesh>
                    {/* a pálpebra, presa ao poço e descendo por dentro do aro */}
                    <mesh ref={lado < 0 ? palpE : palpD} material={M.cremeEsc}
                        position={[lado * 1.62, 0.88, 3.26]}>
                        <boxGeometry args={[1.62, 0.95, 0.34]} />
                    </mesh>
                    {/* SOBRANCELHA: uma barra de latão que franze. Encaixada
                        embaixo da cornija, e não espetada para fora da cara —
                        na foto anterior as sobrancelhas liam como antenas. */}
                    <mesh ref={lado < 0 ? sobrE : sobrD} material={M.latao}
                        position={[lado * 1.66, 1.12, 3.22]}>
                        <boxGeometry args={[1.9, 0.30, 0.6]} />
                    </mesh>
                </React.Fragment>
            ))}

            {/* ── OS MONTANTES DA MANDÍBULA ──
                Duas colunas escuras descendo do tambor da têmpora até a caixa da
                boca. Elas são estrutura de verdade — a boca fica pendurada nelas
                — e, no desenho, são o que fecha o vão entre a bochecha larga e a
                boca estreita, que antes era um degrau vazio na silhueta. */}
            {[-1, 1].map((lado) => (
                <mesh key={lado} material={M.casco}
                    position={[lado * 2.30, -2.20, 1.10]} rotation={[0, 0, lado * 0.17]}>
                    <boxGeometry args={[0.9, 1.9, 1.9]} />
                </mesh>
            ))}

            {/* ── A BOCA ──
                O interior fica FIXO e a mandíbula gira na frente dele: assim a
                garganta já está lá quando a boca abre, em vez de nascer junto.

                A BOCA AGORA SE PROJETA PARA FORA. Ela era uma cavidade embutida
                atrás de uma segunda esfera de bochecha, e no retrato fechado a
                bochecha cobria a cavidade inteira: o ponto fraco da luta era
                desenhado dentro da cara. Aqui a caixa da boca AVANÇA à frente da
                casca (na altura dela a casca acaba em z 1,9 e o portal chega a
                2,6), com batente de latão em volta — é uma porta de elevador
                enfiada no rosto, e porta é coisa que se vê.

                A altura vem de `BOCA_ABAIXO_DO_CENTRO`, o MESMO número de que a
                hitbox sai. O grupo fica onde a cavidade tem de ficar, e a
                cavidade dentro dele em zero — assim não há dois deslocamentos
                somando por acaso, que foi como o anel de mira acabou em cima do
                nariz na primeira montagem. */}
            <group position={[0, -BOCA_ABAIXO_DO_CENTRO / ESC, R * 0.30]} rotation={[0.34, 0, 0]}
                scale={ESCALA_DA_BOCA}>
                <mesh material={M.interior}>
                    <boxGeometry args={[3.8, 2.4, 1.9]} />
                </mesh>
                <mesh ref={garganta} material={M.brasa} position={[0, -0.1, -0.45]}>
                    <sphereGeometry args={[1.05, 10, 8]} />
                </mesh>

                {/* O BATENTE: verga de latão em cima, ombreiras escuras dos
                    lados. É o que faz o buraco virar PORTA — e as ombreiras são
                    de casca, não de latão: a primeira montagem contornou a boca
                    inteira de dourado e, na foto de jogo, o ouro do batente, o
                    da cornija e o dos tambores viraram uma coisa só. O latão
                    marca as duas ARESTAS QUE SE SEPARAM (verga e soleira), que
                    é a informação que o jogador precisa ler. */}
                <mesh material={M.latao} position={[0, 1.42, 0.45]}>
                    <boxGeometry args={[4.4, 0.55, 1.2]} />
                </mesh>
                {[-1, 1].map((lado) => (
                    <mesh key={lado} material={M.cascoEsc} position={[lado * 2.10, 0.05, 0.45]}>
                        <boxGeometry args={[0.7, 3.0, 1.2]} />
                    </mesh>
                ))}
                {/* OS DENTES ficam no BATENTE, atrás das portas: fechada, ela é
                    uma porta de elevador de latão e nada mais; aberta, o que
                    aparece no vão preto é uma dentadura. Se os dentes viajassem
                    com as folhas, eles sairiam de cena junto com elas e a boca
                    escancarada ficaria sem boca. */}
                {[-1.25, -0.42, 0.42, 1.25].map((x) => (
                    <mesh key={`c${x}`} geometry={G.dente} material={M.dente}
                        position={[x, 0.86, 0.62]} rotation={[0, 0, Math.PI]} />
                ))}

                {/* AS DUAS FOLHAS DA PORTA. Correm em X (ver `corre` no laço) e
                    param dentro das ombreiras: uma porta que sai do batente lê
                    como peça solta, e na primeira montagem elas voavam para fora
                    da cabeça. */}
                {[-1, 1].map((lado) => (
                    <group key={lado} ref={lado < 0 ? portaE : portaD} position={[lado * 0.10, 0, 0]}>
                        <mesh material={M.latao} position={[lado * 0.92, 0.02, 1.02]}>
                            <boxGeometry args={[1.8, 2.5, 0.38]} />
                        </mesh>
                        {/* as frisas: uma porta de cabine tem nervura. Aqui
                            elas fazem trabalho de desenho — sem elas a folha é
                            uma chapa lisa de 1,8 por 2,5, e na foto as duas
                            juntas liam como a tampa de uma mala. */}
                        {[-0.85, -0.3, 0.3, 0.85].map((y) => (
                            <mesh key={y} material={M.lataoEsc}
                                position={[lado * 0.92, y, 1.23]}>
                                <boxGeometry args={[1.5, 0.12, 0.06]} />
                            </mesh>
                        ))}
                        {/* a aresta interna, clara: é ela que o jogador vê
                            partir-se em duas quando a boca começa a abrir */}
                        <mesh material={M.dente} position={[lado * 0.06, 0.02, 1.24]}>
                            <boxGeometry args={[0.12, 2.5, 0.08]} />
                        </mesh>
                    </group>
                ))}

                {/* A MANDÍBULA: pivô ATRÁS, para ela girar como maxilar.

                    ELA NÃO PODE AVANÇAR À FRENTE DO VÃO, e isto foi medido numa
                    foto: a montagem anterior punha a chapa do queixo 0,95 à
                    frente do plano da cavidade, e o retrato fechado mostrou a
                    BOCA INTEIRA tapada por ela — com a câmera olhando de baixo,
                    o que vem à frente e embaixo cobre o que está atrás e em
                    cima. Foi o mesmo defeito que a bochecha esférica causava
                    antes dela. Hoje a frente da chapa encosta no plano do vão e
                    não passa dele. */}
                <group ref={mandibula} position={[0, 0.30, -1.05]}>
                    <mesh material={M.casco} position={[0, -1.85, 0.95]}>
                        <boxGeometry args={[3.9, 1.3, 2.2]} />
                    </mesh>
                    {/* a SOLEIRA de latão: a aresta clara que diz onde o vão
                        acaba. É o que o jogador vê DESCER quando ela abre, e a
                        única peça brilhante que se move na cabeça inteira. */}
                    <mesh material={M.latao} position={[0, -1.30, 1.45]}>
                        <boxGeometry args={[4.1, 0.45, 0.95]} />
                    </mesh>
                    {[-1.25, -0.42, 0.42, 1.25].map((x) => (
                        <mesh key={x} geometry={G.dente} material={M.dente}
                            position={[x, -0.92, 1.47]} />
                    ))}
                    {/* a barriga do queixo: a câmera olha de BAIXO, e é esta
                        face que ela mais vê. Chapa escura e três parafusos —
                        sem eles o queixo é uma caixa lisa vista de barriga. */}
                    <mesh material={M.cascoEsc} position={[0, -2.40, 0.70]}>
                        <boxGeometry args={[3.2, 0.5, 1.8]} />
                    </mesh>
                    {[-1.15, 0, 1.15].map((x) => (
                        <mesh key={x} geometry={G.parafuso} material={M.lataoEsc}
                            position={[x, -2.38, 1.52]} rotation={[Math.PI / 2, 0, 0]} />
                    ))}
                </group>
            </group>

            {/* ── AS FERIDAS ──
                Cacos de vinte faces, e não bolinhas: o que rompe numa máquina de
                chapa é uma aresta, não uma gota. */}
            {feridas.map((p, i) => (
                <mesh key={i} geometry={G.ferida} material={M.ferida} position={p}
                    rotation={[i * 1.1, i * 0.7, i * 0.4]}
                    ref={(m) => { feridaRefs.current[i] = m; }} visible={false} />
            ))}
        </group>
    );
};

/**
 * O ANEL DA BOCA — o convite para atirar.
 *
 * `vulneravel()` é uma regra invisível: a cabeça só apanha de boca aberta, e o
 * jogador não tem como descobrir isso sozinho. A mandíbula descer já ajuda, mas
 * ela desce também quando a boca vai CUSPIR, então "aberta" sozinha não separa
 * "cuidado" de "atire agora".
 *
 * Este anel só aparece na janela em que o tiro conta, ele pulsa, e ele fica
 * exatamente do tamanho da hitbox de verdade (`BOCA_ALVO.raio`) — não de um
 * tamanho decorativo. É a regra do jogo desenhada na tela.
 */
export const AnelDaBoca: React.FC = () => {
    const anel = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        const a = anel.current; if (!a) return;
        const b = bocaNoInstante(f12.bocaT);
        const pode = vulneravel(b) && f12.fase === 'luta';
        a.visible = pode;
        if (!pode) return;
        // O X TEM DE SER ESCRITO POR QUADRO. Ele vinha do JSX
        // (`position={[BOCA_ALVO.x, ...]}`), que é avaliado uma vez na
        // montagem — com a boca parada isso funcionava; com ela passeando, o
        // anel ficaria plantado onde a boca ESTAVA no primeiro quadro, e o
        // jogador seria ensinado a mirar no lugar errado. É o mesmo defeito que
        // já pôs este anel em cima do nariz dela, por outro caminho.
        a.position.x = BOCA_ALVO.x;
        const pulso = 1 + Math.sin(state.clock.elapsedTime * 7) * 0.07;
        a.scale.setScalar(pulso);
        const m = a.material as THREE.MeshBasicMaterial;
        m.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 7) * 0.2;
    });
    return (
        // Z À FRENTE DA CARA, e isto é conta, não gosto: na altura da boca o
        // crânio tem raio 6,75 em Z, ou seja a frente dele está em -19,25. Em
        // -21 (a primeira tentativa) o anel nascia DENTRO da cabeça e o próprio
        // chefe o escondia — a única pista visual da regra do jogo, invisível.
        <mesh ref={anel} position={[BOCA_ALVO.x, BOCA_ALVO.y, ARENA.zCabeca + 8.6]} visible={false}>
            <ringGeometry args={[BOCA_ALVO.raio * 0.82, BOCA_ALVO.raio, 28]} />
            <meshBasicMaterial color="#b6ff4a" transparent opacity={0.6} side={THREE.DoubleSide} fog={false} />
        </mesh>
    );
};

/**
 * O ALVO DA BOCA, desenhado — só em desenvolvimento.
 *
 * `BOCA_ALVO` é uma esfera invisível em `f12Boss`, e alvo invisível é como se
 * afina um chefe injusto sem perceber: eu ajusto o raio no código, jogo, e
 * "sinto" que está bom. Isto põe a hitbox na tela para a bancada poder
 * fotografá-la em cima da boca de verdade.
 */
export const AlvoDaBoca: React.FC = () => (
    <mesh position={[BOCA_ALVO.x, BOCA_ALVO.y, ARENA.zCabeca + 1]}>
        <sphereGeometry args={[BOCA_ALVO.raio, 16, 12]} />
        <meshBasicMaterial color="#39ff88" wireframe transparent opacity={0.55} />
    </mesh>
);

/** A cabeça já passou da metade? (a cena usa para trocar o céu) */
export const naSegundaMetade = (): boolean => f12.vida <= LIMIAR_DA_VIRADA;
export { vulneravel };
