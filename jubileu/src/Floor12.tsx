/**
 * Floor12.tsx — ANDAR 12: "A CABEÇA".
 *
 * O elevador para, as portas abrem, e não há andar do outro lado: há CÉU. A
 * cabine se desdobra em avião com o hóspede dentro, a câmera sai das órbitas
 * dele para trás — e a partir daí é um jogo de nave em terceira pessoa contra
 * uma cabeça colossal que abre a boca para cuspir o hotel inteiro.
 *
 * ── COMO ESTE ARQUIVO ESTÁ ORGANIZADO ────────────────────────────────────────
 *
 * Ele NÃO tem regra de jogo. Toda a matemática — física da nave, compasso da
 * boca, os cinco padrões, colisão, vida — mora em `f12Boss.ts`, que é puro e
 * testado. Aqui ficam só três coisas:
 *
 *   1. os DIRETORES (componentes sem malha, dentro do Canvas, que rodam o
 *      relógio de uma fase e passam para a próxima);
 *   2. a CÂMERA, que é a única coisa que muda de linguagem entre a introdução
 *      (primeira pessoa) e a luta (terceira);
 *   3. o HUD e os controles, que são DOM por cima do Canvas.
 *
 * É a mesma divisão do `Floor5Race3D`, e ela existe porque a alternativa —
 * lógica espalhada entre o `useFrame` e o JSX — é o que torna um chefe
 * impossível de afinar depois.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    f12, f12Reset, f12AoMudar, f12Bump, ARENA, meioY, ENQUADRAMENTO, BOCA_ALVO,
    larguraDoQuadro, ajustarAoAspecto,
    novaNave, passoDaNave, conduzirNave, arrastarNave, tomarToque, NAVE, VIDAS_DO_JOGADOR,
    bocaNoInstante, vulneravel, CICLO_DA_BOCA, BOCA,
    ataqueDaVez, segundoAtaqueDaVez, ATRASO_DO_SEGUNDO, fichaDoAtaque, VIDA_MAXIMA, ferir,
    // o impacto: hitstop, tremor e faíscas, num módulo puro e testável
    RASPAO, contarRaspao, dispararCarregado, bocaXNoInstante,
    nascerLeque, nascerTeleguiado, nascerNaves, nascerMare, nascerElevadores,
    nascerTiro, TIRO, tentarAtirar, PONTA_DA_ASA, passoDoProjetil, saiuDeCena, encostou, tiroNaBoca,
    F12_ENCONTRO, F12_VIRADA, F12_VITORIA, F12_DERROTA, F12_DESPEDIDA, F12_ALERTAS,
    type Nave, type NomeDoAtaque, type F12Linha,
} from './f12Boss';
import {
    impacto, passoDoImpacto, escalaDoTempo, deslocamentoDoTremor, reiniciarImpacto,
    espalharFaiscas,
} from './f12Impacto';
import { Faiscas } from './Floor12Faiscas';
import { Floor12Ceu } from './Floor12Ceu';
import { Floor12Cabeca, AnelDaBoca } from './Floor12Cabeca';
import { Floor12Projeteis } from './Floor12Projeteis';
import { AviaoDoJogador, AviaoDoIrmao, CascoDoElevador } from './Floor12Avioes';
import {
    configureFloor12Sfx, tocarMotor, pararMotor, tocarTiro, tocarTiroIrmao,
    tocarAcerto, tocarBocaAbrindo, tocarAtaque, tocarDano, tocarExplosao,
    tocarFalaDoIrmao, tocarDesdobrar, tocarDing, tocarVitoria, tocarDerrota,
    tocarRaspao, tocarCarregado, tocarTrilha, intensificarTrilha, pararTrilha,
} from './floor12Sfx';

// ═══ A INTRODUÇÃO ════════════════════════════════════════════════════════════

/**
 * A CABINE, vista de dentro.
 *
 * Ela existe só na introdução, e some quando a transformação acaba — porque a
 * partir dali o interior dela É o cockpit, visto de fora. Duas portas que
 * deslizam, painel de botões, e o vão dando para o céu.
 */
const CabineDeDentro: React.FC<{ portaRef: React.MutableRefObject<number>; sumindoRef: React.MutableRefObject<number> }> =
    ({ portaRef, sumindoRef }) => {
        const esq = useRef<THREE.Mesh>(null);
        const dir = useRef<THREE.Mesh>(null);
        const raiz = useRef<THREE.Group>(null);
        useFrame(() => {
            const k = portaRef.current;
            if (esq.current) esq.current.position.x = -0.62 - k * 1.05;
            if (dir.current) dir.current.position.x = 0.62 + k * 1.05;
            if (raiz.current) {
                const s = 1 - sumindoRef.current;
                raiz.current.visible = s > 0.02;
                raiz.current.scale.setScalar(Math.max(0.02, s));
            }
        });
        return (
            <group ref={raiz} name="cabine" position={[0, meioY(), 0]}>
                {/* ── A CABINE É ABERTA NA FRENTE, E ISSO NÃO É DETALHE ──
                    A primeira versão era um `boxGeometry` com `BackSide`: uma
                    caixa FECHADA nos seis lados. As portas deslizavam e
                    revelavam… a parede de trás da própria caixa. A piada da
                    introdução inteira é o jogador ver CÉU do outro lado da
                    porta, e ela não acontecia. Aqui as paredes são planos, e o
                    lado -Z (o das portas) fica vazio de propósito. */}
                <mesh position={[-1.7, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                    <planeGeometry args={[3.6, 3.0]} />
                    <meshLambertMaterial color="#c9b28a" flatShading />
                </mesh>
                <mesh position={[1.7, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
                    <planeGeometry args={[3.6, 3.0]} />
                    <meshLambertMaterial color="#c9b28a" flatShading />
                </mesh>
                <mesh position={[0, 0, 1.8]} rotation={[0, Math.PI, 0]}>
                    <planeGeometry args={[3.4, 3.0]} />
                    <meshLambertMaterial color="#a48f6b" flatShading />
                </mesh>
                <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[3.4, 3.6]} />
                    <meshLambertMaterial color="#a48f6b" flatShading />
                </mesh>
                <mesh position={[0, -1.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[3.4, 3.6]} />
                    <meshLambertMaterial color="#6f6350" flatShading />
                </mesh>
                {/* o painel — o mesmo latão que vai parar na asa do avião */}
                <mesh position={[1.6, 0, 0.6]}>
                    <boxGeometry args={[0.1, 1.1, 0.5]} />
                    <meshLambertMaterial color="#d9a441" flatShading />
                </mesh>
                {[0.34, 0.12, -0.1, -0.32].map((y, i) => (
                    <mesh key={i} position={[1.66, y, 0.6]}>
                        <boxGeometry args={[0.06, 0.12, 0.12]} />
                        <meshLambertMaterial color="#ffd54f" emissive="#ffd54f" emissiveIntensity={0.6} flatShading />
                    </mesh>
                ))}
                {/* ── O QUE FAZ ISTO PARECER UM ELEVADOR ──
                    A cabine tinha paredes, teto, chão e portas, e mesmo assim a
                    introdução saía como "um retângulo cinza e depois céu". O
                    motivo é de lente e está resolvido em `CameraDaLuta` (o `fov`
                    abre para 92 na primeira pessoa), mas lente sozinha não
                    basta: o que diz "elevador" não é a caixa, é o mostrador de
                    andar em cima da porta e o corrimão. Sem eles a caixa podia
                    ser um armário. */}
                <mesh position={[0, 1.05, -1.72]}>
                    <boxGeometry args={[1.5, 0.42, 0.12]} />
                    <meshLambertMaterial color="#2b2f38" flatShading />
                </mesh>
                <mesh position={[0, 1.05, -1.65]}>
                    <boxGeometry args={[0.34, 0.26, 0.04]} />
                    <meshLambertMaterial color="#ffb648" emissive="#ffb648" emissiveIntensity={0.9} flatShading />
                </mesh>
                {/* a seta de subida, acesa: o elevador chegou vindo de baixo */}
                <mesh position={[-0.52, 1.05, -1.65]} rotation={[0, 0, Math.PI / 4]}>
                    <boxGeometry args={[0.16, 0.16, 0.04]} />
                    <meshLambertMaterial color="#7de08a" emissive="#7de08a" emissiveIntensity={0.8} flatShading />
                </mesh>
                {/* corrimão nas três paredes */}
                {[[-1.62, 0, 0, 0, 0, Math.PI / 2], [1.62, 0, 0, 0, 0, Math.PI / 2], [0, 0, 1.72, 0, 0, 0]].map((v, i) => (
                    <mesh key={i} position={[v[0], -0.28, v[2]]} rotation={[v[3], v[5] ? Math.PI / 2 : 0, 0]}>
                        <boxGeometry args={[i === 2 ? 3.2 : 3.4, 0.09, 0.09]} />
                        <meshLambertMaterial color="#d9a441" flatShading />
                    </mesh>
                ))}
                {/* a luz do teto: sem ela o teto é um vulto preto no alto do
                    quadro, que foi como ele saiu na foto da introdução */}
                <mesh position={[0, 1.42, 0]}>
                    <boxGeometry args={[1.5, 0.08, 1.5]} />
                    <meshLambertMaterial color="#fff6d8" emissive="#fff6d8" emissiveIntensity={0.75} flatShading />
                </mesh>

                {/* as portas */}
                <mesh ref={esq} position={[-0.62, 0, -1.79]}>
                    <boxGeometry args={[1.24, 2.7, 0.1]} />
                    <meshLambertMaterial color="#8e97a6" flatShading />
                </mesh>
                <mesh ref={dir} position={[0.62, 0, -1.79]}>
                    <boxGeometry args={[1.24, 2.7, 0.1]} />
                    <meshLambertMaterial color="#8e97a6" flatShading />
                </mesh>
            </group>
        );
    };

/**
 * O DIRETOR DA INTRODUÇÃO — o elevador virando avião.
 *
 * A coreografia, em segundos:
 *
 *   0,0  escuro, ding
 *   1,2  as portas abrem, e o que aparece é CÉU (não um corredor)
 *   3,0  o metal começa a se desdobrar: as paredes viram asas
 *   4,4  a câmera sai das órbitas do hóspede e recua para trás do avião
 *   6,2  a cabine de dentro some, o casco fica, e o irmão chega de ala
 *
 * A ORDEM IMPORTA e não é arbitrária. A porta abre ANTES de a transformação
 * começar porque a piada é essa: o jogador vê o céu e ainda não sabe o que vai
 * acontecer. E a câmera só recua DEPOIS de as asas existirem, senão ela revela
 * um cubo voando e a transformação perde o efeito.
 */
const DiretorDaIntro: React.FC<{
    portaRef: React.MutableRefObject<number>;
    aberturaRef: React.MutableRefObject<number>;
    sumindoRef: React.MutableRefObject<number>;
    camRef: React.MutableRefObject<number>;
    avisar: () => void;
}> = ({ portaRef, aberturaRef, sumindoRef, camRef, avisar }) => {
    const t = useRef(0);
    const marcos = useRef({ ding: false, desdobrar: false, motor: false });
    useFrame((_, rawDt) => {
        if (f12.fase !== 'intro' && f12.fase !== 'virando') return;
        t.current += Math.min(rawDt, 0.05);
        const tt = t.current;

        // ── A ORDEM DA INTRODUÇÃO FOI TROCADA, E ERA O DEFEITO ───────────
        //
        // O pedido do andar é "o elevador vira um avião". Na montagem anterior
        // isso acontecia, e ACONTECIA FORA DA TELA. A conta:
        //
        //     3,0 s   começa o desdobramento (`abertura` 0 -> 1 em 2,2 s)
        //     4,4 s   a câmera começa a sair de dentro do hóspede
        //     4,62 s  o avião FICA VISÍVEL (`RevelarAviao`, camRef > 0,12)
        //
        // Quando o casco aparecia, `abertura` já valia 0,74: três quartos da
        // transformação tinham corrido com o avião invisível, e o que o jogador
        // via era um corte de "céu vazio" para "avião pronto". A piada inteira
        // da introdução — a cabine do elevador abrindo asas — não estava na
        // tela em nenhum quadro.
        //
        // Agora a câmera sai PRIMEIRO, o casco aparece ainda FECHADO (um cubo
        // de elevador voando, que já é uma imagem), e só então ele se desdobra,
        // inteiro, à vista, com 2,4 s para isso.
        if (tt > 0.4 && !marcos.current.ding) { marcos.current.ding = true; tocarDing(); }

        //  0,0 -> 1,0   as portas fechadas: o jogador ainda está no elevador
        //  1,0 -> 2,4   elas abrem, e do outro lado não há andar: há céu
        portaRef.current = THREE.MathUtils.clamp((tt - 0.8) / 1.2, 0, 1);

        //  A CENA INTEIRA ENCOLHEU ~15%: medido, o caminho normal levava 17,1 s
        //  entre abrir o andar e poder tocar no jogo. O desdobramento continua
        //  tendo os seus dois segundos à vista (é o assunto da cena), mas cada
        //  espera em volta dele foi apertada.
        //
        //  2,0 -> 3,4   a câmera sai de dentro do hóspede para trás da cabine
        camRef.current = THREE.MathUtils.clamp((tt - 2.0) / 1.4, 0, 1);
        //  2,4 -> 3,4   a casca de primeira pessoa some: ela e o casco são a
        //               mesma coisa vista de dois lados, e mostrar as duas ao
        //               mesmo tempo entregaria o truque.
        sumindoRef.current = THREE.MathUtils.clamp((tt - 2.0) / 0.9, 0, 1);

        //  4,0 -> 6,4   O DESDOBRAMENTO, agora com a câmera já lá fora
        if (tt > 3.4) {
            if (!marcos.current.desdobrar) { marcos.current.desdobrar = true; tocarDesdobrar(); f12.fase = 'virando'; f12Bump(); }
            aberturaRef.current = THREE.MathUtils.clamp((tt - 3.4) / 2.1, 0, 1);
        }
        //  o motor pega quando a hélice já está montada
        if (tt > 4.9 && !marcos.current.motor) { marcos.current.motor = true; tocarMotor(); }

        if (tt > 5.9) { f12.fase = 'encontro'; f12.linhaDoDialogo = 0; tocarFalaDoIrmao(); avisar(); }
    });
    return null;
};

// ═══ A CÂMERA ════════════════════════════════════════════════════════════════

/**
 * `k` = 0 dentro dos olhos do hóspede; 1 atrás do avião.
 *
 * A saída é uma interpolação SÓ da posição, com o alvo indo junto: puxar a
 * câmera para trás sem mover o alvo faria o mundo inteiro girar em volta do
 * jogador, que é o efeito errado — aqui é a câmera que anda, não o mundo.
 */
/**
 * A abertura vertical de dentro da cabine. Ver a nota em `CameraDaLuta`.
 */
const FOV_DE_DENTRO = 92;

const MIRA_CAM = new THREE.Vector3();

const CameraDaLuta: React.FC<{
    naveRef: React.MutableRefObject<Nave>;
    irmaoRef: React.MutableRefObject<Nave>;
    camRef: React.MutableRefObject<number>;
}> = ({ naveRef, irmaoRef, camRef }) => {
    const camera = useThree((s) => s.camera);
    const alvo = useRef(new THREE.Vector3());
    const conversa = useRef(0);
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const n = naveRef.current;
        const k = THREE.MathUtils.clamp(camRef.current, 0, 1);
        const suave = k * k * (3 - 2 * k);

        // Dentro do hóspede: no meio da cabine, na altura dos olhos.
        const dentroY = meioY() + 0.35, dentroZ = 0.55;

        // ── A CÂMERA DA LUTA VEM DE `ENQUADRAMENTO`, INTEIRA ─────────────
        //
        // Antes ela era três lerps de números escolhidos no olho, e o resultado
        // medido foi: o avião a 48,5% da altura da tela, a boca a 50,7%, e a
        // arena desenhada 19,7% por cima da cara do chefe. Ela olhava para
        // BAIXO (posição y 5,1, alvo y 3,91) num andar cujo assunto está no
        // alto. Agora ela fica acima do avião e olha para CIMA, na cabeça, e os
        // três números saem do mesmo lugar em que a composição foi resolvida.
        //
        // O ATRASO continua: a câmera segue o avião com folga em X e Y, para
        // ele "escapar" um pouco do quadro quando o jogador manda — é o que dá
        // velocidade. O que ela não faz mais é decidir o enquadramento.
        const E = ENQUADRAMENTO;
        const atrasX = n.x * 0.55;
        const atrasY = E.camY + (n.y - meioY()) * 0.30;

        // ── NA CONVERSA, A CÂMERA OLHA QUEM FALA ─────────────────────
        //
        // Durante o encontro ela ficava exatamente onde fica na luta: o robô
        // dizia três falas de perfil, do tamanho de um selo, no canto. "A
        // encenação não existe" era isso — não faltava texto, faltava CÂMERA.
        // Aqui ela desliza para o lado dele e se aproxima enquanto o balão está
        // no ar, e volta sozinha quando a luta começa.
        const conversando = f12.fase === 'encontro' || f12.fase === 'virada';
        conversa.current += ((conversando ? 1 : 0) - conversa.current) * Math.min(1, dt * 2.2);
        const c = conversa.current * conversa.current * (3 - 2 * conversa.current);

        const px = THREE.MathUtils.lerp(0, atrasX, suave);
        const py = THREE.MathUtils.lerp(dentroY, atrasY, suave);
        const pz = THREE.MathUtils.lerp(dentroZ, E.recuo, suave);
        // o deslocamento da conversa: para o lado do ala (ele voa à esquerda) e
        // um pouco à frente
        const ir = irmaoRef.current;
        MIRA_CAM.set(
            THREE.MathUtils.lerp(px, ir.x * 0.9 + 1.1, c),
            THREE.MathUtils.lerp(py, ir.y + 1.0, c),
            THREE.MathUtils.lerp(pz, ARENA.zNave + 4.6, c),
        );
        camera.position.lerp(MIRA_CAM, Math.min(1, dt * 7));

        // O alvo fica no eixo composto, deslocado de leve pelo avião: a câmera
        // de um jogo de nave tem de enquadrar o jogador e a boca ao mesmo
        // tempo, senão ele escolhe entre ver para onde vai e ver de onde vem o
        // ataque. O deslocamento é pequeno de propósito — se o alvo seguisse o
        // avião inteiro, o quadro balançaria e a boca sairia do lugar dela.
        alvo.current.set(
            THREE.MathUtils.lerp(THREE.MathUtils.lerp(0, n.x * 0.28, suave), ir.x, c),
            THREE.MathUtils.lerp(THREE.MathUtils.lerp(dentroY, E.miraY + (n.y - meioY()) * 0.18, suave), ir.y + 0.35, c),
            THREE.MathUtils.lerp(THREE.MathUtils.lerp(-6, E.miraZ, suave), ARENA.zNave - 1.5, c),
        );

        // ── O TREMOR ─────────────────────────────────────────────────────
        //
        // Era `alvo += (Math.random() - 0.5) * s`, com `s` caindo em linha reta.
        // Ruído branco tem energia em toda frequência: a câmera vibrava como
        // tela quebrada, não como coisa pesada sendo atingida — e o decaimento
        // linear cortava o tremor no meio da amplitude, o que o olho pega.
        // Agora vem de `f12Impacto`: trauma ao quadrado (o fim é suave por
        // construção) e três senos incomensuráveis (tem forma, não chia).
        //
        // E ele mexe o GIRO, não só o alvo. A rotação é o que dá o soco; a
        // posição só apoia. Sacudir só o alvo de uma câmera que persegue briga
        // com a interpolação e sai borrado.
        const tr = deslocamentoDoTremor();
        alvo.current.x += tr.x; alvo.current.y += tr.y;
        camera.lookAt(alvo.current);
        camera.rotateZ(tr.giro);

        // ── A LENTE ABRE NA PRIMEIRA PESSOA ──────────────────────────────
        //
        // `fov`, no three, é VERTICAL: numa tela em pé a abertura horizontal é
        // menos da metade dela. Com os 62 da composição, o cone que a câmera vê
        // dentro da cabine tem 64 cm de largura no plano da porta — ou seja, de
        // dentro do elevador o jogador NÃO VÊ as paredes do elevador. A
        // introdução saía como "um retângulo cinza, e depois céu", e o dono do
        // jogo a chamou de simples e meio bugada. Não era cenário faltando:
        // era lente.
        //
        // 92 na primeira pessoa põe 1,7 m de largura no plano da porta — a
        // cabine inteira —, e a lente fecha até a composta conforme a câmera
        // sai. Fechar a lente enquanto se recua é, por acaso, um travelling
        // contra-zoom: o fundo se aproxima enquanto o avião encolhe, o que dá à
        // saída um empurrão que uma câmera que só anda não tem.
        const fovAlvo = THREE.MathUtils.lerp(FOV_DE_DENTRO, ENQUADRAMENTO.fov, suave);
        const cam = camera as THREE.PerspectiveCamera;
        if (Math.abs(cam.fov - fovAlvo) > 0.01) { cam.fov = fovAlvo; cam.updateProjectionMatrix(); }
    });
    return null;
};

// ═══ O DIRETOR DA LUTA ═══════════════════════════════════════════════════════

interface Ferramentas {
    /** Legenda do ala durante a luta, sem travar nada. */
    alertaRef: React.MutableRefObject<{ texto: string; ate: number }>;
    /** Padrões que ele já comentou: cada um fala uma vez só. */
    jaAvisou: React.MutableRefObject<Set<string>>;
    nave: React.MutableRefObject<Nave>;
    irmao: React.MutableRefObject<Nave>;
    entrada: React.MutableRefObject<{ x: number; y: number }>;
    flash: React.MutableRefObject<number>;
    gritoRef: React.MutableRefObject<string>;
    avisar: () => void;
}

/**
 * O coração do andar: um `useFrame` que roda o relógio, cospe os ataques, move
 * tudo pelo módulo puro, resolve as colisões e decide o fim.
 *
 * Ele é longo e é UM só de propósito. A alternativa — um diretor por
 * subsistema — obrigaria a ordem entre eles a virar acaso (quem move antes de
 * quem colide?), e num jogo de nave essa ordem É a justiça do jogo: mover,
 * depois colidir, depois recolher. Nesta ordem, sempre.
 */
/** Só para a bancada: dá ao atalho de dano o mesmo caminho que o jogo usa. */
const F12FERRAMENTAS: { atual: Ferramentas | null } = { atual: null };

const DiretorDaLuta: React.FC<Ferramentas> = (F) => {
    if (import.meta.env?.DEV) F12FERRAMENTAS.atual = F;
    const ladoDoTiro = useRef<-1 | 1>(1);
    const ladoDoIrmao = useRef<-1 | 1>(1);
    const proxAtaque = useRef(0);
    const segundo = useRef<{ ciclo: number; quando: number } | null>(null);
    const cuspiu = useRef(-1);
    const anunciou = useRef(-1);
    const faixaDoElevador = useRef(0);
    const faseDaMare = useRef(0);

    useFrame((_, rawDt) => {
        const dtReal = Math.min(rawDt, 0.05);
        // ── O HITSTOP ────────────────────────────────────────────────────
        // Ele escala o relógio do JOGO e não o da APRESENTAÇÃO: o tremor, as
        // faíscas e o som continuam correndo no tempo real durante a pausa. Se
        // congelassem junto não haveria pausa nenhuma — haveria um soluço.
        passoDoImpacto(dtReal);
        const dt = dtReal * escalaDoTempo();
        const lutando = f12.fase === 'luta';
        const n = F.nave.current, ir = F.irmao.current;

        // ── AS NAVES ─────────────────────────────────────────────────────
        // O ALVO já foi movido por quem toca a tela (arrasto) ou pelo teclado.
        // Aqui a nave só persegue. É um caminho só para dedo e tecla — ver a
        // nota longa em `f12Boss`.
        const e = F.entrada.current;
        if (lutando) conduzirNave(n, e.x, e.y, dt);
        passoDaNave(n, dt);
        // O irmão é um ALA: ele acompanha o jogador com atraso e desvia do que
        // estiver mais perto dele. Não é uma IA esperta — é uma presença.
        if (lutando) {
            // ── A FORMATURA SAI DA ARENA, NÃO DE UM NÚMERO SOLTO ─────
            //
            // Era `n.x - 3.2` numa arena que hoje tem 3,7 de meia-largura: o ala
            // ficava GRUDADO na parede esquerda o tempo todo, porque o ponto que
            // ele queria estava fora do mundo em quase toda posição do jogador,
            // e o `clamp` o prendia na borda. Na foto ele era uma mancha escura
            // parada no canto — não um ala. Metade da meia-largura o põe ao
            // alcance do olho do jogador e continua sendo formatura.
            const querX = THREE.MathUtils.clamp(n.x - ARENA.x * 0.5, -ARENA.x, ARENA.x);
            const querY = THREE.MathUtils.clamp(n.y + 1.1, ARENA.yBaixo, ARENA.yAlto);
            let fugaX = 0, fugaY = 0;
            for (const p of f12.projeteis) {
                if (p.tipo === 'tiro' || p.tipo === 'mare') continue;
                if (Math.abs(p.z - ARENA.zNave) > 6) continue;
                const dx = ir.x - p.x, dy = ir.y - p.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < 9 && d2 > 1e-4) { fugaX += dx / d2 * 3; fugaY += dy / d2 * 3; }
            }
            conduzirNave(ir,
                THREE.MathUtils.clamp((querX - ir.x) * 0.55 + fugaX, -1, 1),
                THREE.MathUtils.clamp((querY - ir.y) * 0.55 + fugaY, -1, 1), dt);
        }
        passoDaNave(ir, dt);

        if (!lutando) return;

        // ── O RELÓGIO DA BOCA ────────────────────────────────────────────
        f12.relogio += dt;
        f12.bocaT += dt;
        // A cabeça passeia. Um lugar só escreve isto, e `BOCA_ALVO`/`BOCA_SAIDA`
        // leem daqui — assim a hitbox, o anel de mira, a saída dos ataques e o
        // desenho do crânio não podem discordar sobre onde a boca está.
        f12.bocaX = bocaXNoInstante(f12.relogio);
        const b = bocaNoInstante(f12.bocaT);
        const ciclo = Math.floor(f12.bocaT / CICLO_DA_BOCA);

        if (b.estado === 'abrindo' && anunciou.current !== ciclo) {
            anunciou.current = ciclo;
            const qual = ataqueDaVez(ciclo);
            F.gritoRef.current = fichaDoAtaque(qual).grito;
            // A PRIMEIRA VEZ de cada padrão, o ala explica — sem travar nada.
            // É o momento em que o jogador mais precisa da pista e o único em
            // que uma explicação não é obstáculo. Ver `F12_ALERTAS`.
            if (!F.jaAvisou.current.has(qual)) {
                F.jaAvisou.current.add(qual);
                F.alertaRef.current = { texto: F12_ALERTAS[qual] ?? '', ate: f12.relogio + 4.5 };
                tocarFalaDoIrmao();
            }
            tocarBocaAbrindo();
            F.avisar();
        }

        // ── A BOCA CUSPIU ────────────────────────────────────────────────
        // No PRIMEIRO instante do estado aberto, e uma vez por ciclo.
        if (b.estado === 'aberta' && cuspiu.current !== ciclo) {
            cuspiu.current = ciclo;
            const qual = ataqueDaVez(ciclo);
            f12.ataqueNoAr = qual;
            cuspir(qual, n, faixaDoElevador, faseDaMare);
            tocarAtaque(qual);
            // ── A VIRADA: O SEGUNDO CUSPE ────────────────────────────
            // Ela não fazia NADA além de pintar a barra de vermelho: metade da
            // luta era um replay da primeira metade, e o ala gritava "dois
            // padrões novos" por cima disso. Agora a boca cospe de novo ainda
            // dentro da mesma janela aberta, com um padrão diferente do
            // primeiro — dois iguais juntos leem como o jogo repetindo.
            segundo.current = f12.passouDaVirada ? { ciclo, quando: f12.bocaT + ATRASO_DO_SEGUNDO } : null;
        }

        // o segundo cuspe, quando a hora dele chega
        const s2 = segundo.current;
        if (s2 && f12.bocaT >= s2.quando) {
            segundo.current = null;
            const qual2 = segundoAtaqueDaVez(s2.ciclo);
            f12.ataqueNoAr = qual2;
            cuspir(qual2, n, faixaDoElevador, faseDaMare);
            tocarAtaque(qual2);
            F.avisar();
        }

        // ── AS ARMAS ─────────────────────────────────────────────────────
        // TIRO AUTOMÁTICO. Havia um botão de segurar, e ele custava o polegar
        // direito inteiro num jogo em que os dois polegares já têm serviço:
        // um arrasta a nave e o outro... segura um botão para fazer a única
        // coisa que a nave sempre quer fazer. Todo shmup de celular atira
        // sozinho, e o motivo é este.
        // O RITMO da arma mora em `tentarAtirar`, no módulo puro — a simulação
        // que mede a dificuldade dispara pela mesma função, senão ela mediria
        // outro jogo. Aqui só sobra o efeito: som e a ponta de asa da vez.
        // A carga cheia sai sozinha: pedir um botão para ela custaria o polegar
        // que já está arrastando, e o jogador acabou de GANHAR isto desviando —
        // fazê-lo lembrar de gastar seria punir quem jogou bem.
        const carregado = dispararCarregado(n);
        if (carregado) { f12.projeteis.push(carregado); tocarCarregado(); F.avisar(); }

        if (tentarAtirar(n)) {
            // Alterna a ponta de asa: dois rastros paralelos em vez de uma fila
            // escondida atrás da fuselagem. Ver a nota em `nascerTiro`.
            ladoDoTiro.current = ladoDoTiro.current === 1 ? -1 : 1;
            f12.projeteis.push(nascerTiro(n.x, n.y, 'jogador', ladoDoTiro.current));
            tocarTiro();
        }
        // O irmão atira sozinho, e só quando há o que acertar: um ala que
        // metralha o céu vazio vira ruído.
        if ((vulneravel(b) || f12.projeteis.some((p) => p.tipo === 'naves')) && tentarAtirar(ir, true)) {
            ladoDoIrmao.current = ladoDoIrmao.current === 1 ? -1 : 1;
            f12.projeteis.push(nascerTiro(ir.x, ir.y, 'irmao', ladoDoIrmao.current));
            tocarTiroIrmao();
        }

        // ── MOVER ────────────────────────────────────────────────────────
        for (const p of f12.projeteis) passoDoProjetil(p, n.x, n.y, dt);

        // ── COLIDIR ──────────────────────────────────────────────────────
        const podeFerir = vulneravel(b);
        const mortos = new Set<number>();

        for (const p of f12.projeteis) {
            // ── O TIRO CARREGADO ─────────────────────────────────────
            // Ele fere com a boca ABERTA OU FECHADA, e é isto que quebra a
            // exclusão entre desviar e machucar. Ver a nota em `RASPAO`.
            if (p.tipo === 'carregado') {
                if (tiroNaBoca(p)) {
                    mortos.add(p.id);
                    const virou = ferir(RASPAO.dano);
                    // O carregado ainda acende a cabeça: ele é o golpe grande e
                    // o contraste com o tiro comum é a informação.
                    F.flash.current = 1.3;
                    impacto('carregado', p.x, p.y, ARENA.zCabeca + 2);
                    tocarExplosao();
                    if (virou) abrirAVirada(F);
                    if (f12.vida <= 0) acabar(F, 'vitoria');
                    F.avisar();
                }
                continue;
            }
            if (p.tipo === 'tiro') {
                // tiro × camareira
                for (const q of f12.projeteis) {
                    if (q.tipo !== 'naves' || mortos.has(q.id)) continue;
                    if (Math.hypot(p.x - q.x, p.y - q.y) < q.r + p.r && Math.abs(p.z - q.z) < 1.2) {
                        q.hp = (q.hp ?? 1) - 1;
                        mortos.add(p.id);
                        if ((q.hp ?? 0) <= 0) { mortos.add(q.id); tocarExplosao(); }
                        else tocarAcerto();
                        break;
                    }
                }
                if (mortos.has(p.id)) continue;
                // tiro × boca
                if (podeFerir && tiroNaBoca(p)) {
                    mortos.add(p.id);
                    const virou = ferir(p.de === 'irmao' ? TIRO.danoIrmao : TIRO.dano);
                    // ── O FLASH DA CABEÇA INTEIRA SAIU ───────────────
                    // Ele acendia o crânio todo, que é literalmente o defeito
                    // que o cabeçalho de `f12Impacto` descreve: diz "algo
                    // aconteceu" e não diz ONDE. Eu acrescentei a camada nova e
                    // deixei viva a que estava criticando — dois sistemas para
                    // a mesma coisa, e o pior deles por cima do melhor. Agora o
                    // acerto do tiro comum é só a faísca, no ponto exato.
                    impacto('tiro', p.x, p.y, ARENA.zCabeca + 2);
                    tocarAcerto();
                    if (virou) abrirAVirada(F);
                    if (f12.vida <= 0) acabar(F, 'vitoria');
                    F.avisar();
                }
                continue;
            }
            // ── O RASPÃO ─────────────────────────────────────────────
            // Passar perto sem ser atingido carrega a arma. Conta antes da
            // colisão de propósito: o quadro em que o projétil encosta não é
            // um raspão, e `contarRaspao` já rejeita distância negativa.
            if (contarRaspao(n, p, n.x, n.y)) { tocarRaspao(); F.avisar(); }

            // ataque × jogador
            if (encostou(p, n.x, n.y, NAVE.raio) && tomarToque(n)) {
                impacto('dano', n.x, n.y, ARENA.zNave);
                tocarDano();
                if (p.tipo !== 'mare') mortos.add(p.id);
                // ── O RESPIRO: o que está em volta SOME ──────────────
                // Ver a nota em `NAVE.limpezaAoLevar`. Sem isto, o projétil
                // seguinte da mesma salva cobra de novo enquanto o jogador
                // ainda se recoloca, e um erro custa três vidas.
                for (const q of f12.projeteis) {
                    if (q.tipo === 'tiro' || q.tipo === 'carregado' || q.tipo === 'mare') continue;
                    if (Math.abs(q.z - ARENA.zNave) > 10) continue;
                    if (Math.hypot(q.x - n.x, q.y - n.y) < NAVE.limpezaAoLevar) {
                        mortos.add(q.id);
                        espalharFaiscasDoRespiro(q.x, q.y, q.z);
                    }
                }
                if (n.vidas <= 0) acabar(F, 'derrota');
                F.avisar();
            }
            // ataque × irmão (ele perde vidas, mas nunca morre: some e volta)
            if (encostou(p, ir.x, ir.y, NAVE.raio) && tomarToque(ir)) {
                tocarDano();
                if (ir.vidas <= 0) ir.vidas = 2;      // ele se remenda; é robô
            }
        }

        // ── RECOLHER ─────────────────────────────────────────────────────
        if (mortos.size || f12.projeteis.some(saiuDeCena)) {
            f12.projeteis = f12.projeteis.filter((p) => !mortos.has(p.id) && !saiuDeCena(p));
        }
    });
    return null;
};

/** A boca cospe o padrão pedido. */
/** Cada projétil varrido pelo respiro vira faísca: o jogador VÊ o perdão. */
function espalharFaiscasDoRespiro(x: number, y: number, z: number): void {
    espalharFaiscas(x, y, z, 3, 3.2, 2);
}

function cuspir(
    qual: NomeDoAtaque, alvo: Nave,
    faixa: React.MutableRefObject<number>, faseMare: React.MutableRefObject<number>,
): void {
    switch (qual) {
        case 'leque':
            f12.projeteis.push(...nascerLeque(alvo.x * 0.4, alvo.y));
            break;
        case 'teleguiado':
            f12.projeteis.push(nascerTeleguiado());
            break;
        case 'naves':
            f12.projeteis.push(...nascerNaves());
            break;
        case 'mare':
            faseMare.current += 1.7;
            f12.projeteis.push(nascerMare(faseMare.current));
            break;
        case 'elevadores':
            // A faixa vazia ANDA a cada vez, para o jogador não decorar um
            // único canto seguro e ficar parado nele.
            faixa.current = (faixa.current + 2) % 5;
            f12.projeteis.push(...nascerElevadores(faixa.current));
            break;
    }
}

function abrirAVirada(F: Ferramentas): void {
    f12.passouDaVirada = true;
    // A trilha não TROCA na virada: entram o bumbo e a tensão por cima da mesma
    // base. Trocar de música no meio corta a tensão que a luta levou um minuto
    // para montar.
    intensificarTrilha(true);
    f12.fase = 'virada';
    f12.linhaDoDialogo = 0;
    f12.projeteis = f12.projeteis.filter((p) => p.tipo === 'tiro');
    tocarExplosao(); tocarFalaDoIrmao();
    F.avisar();
}

function acabar(F: Ferramentas, como: 'vitoria' | 'derrota'): void {
    f12.fase = como;
    f12.linhaDoDialogo = 0;
    f12.projeteis = [];
    pararMotor();
    pararTrilha();
    if (como === 'vitoria') { tocarVitoria(); tocarExplosao(); } else tocarDerrota();
    F.avisar();
}

// ═══ O OVERLAY ═══════════════════════════════════════════════════════════════

const t64: React.CSSProperties = {
    fontFamily: 'monospace', fontWeight: 900, color: '#FFD54F', letterSpacing: 2,
    textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 3px 0 #000',
    userSelect: 'none',
};
const btn64: React.CSSProperties = {
    ...t64, fontSize: 17, background: 'linear-gradient(180deg,#3b6fb0,#27508a)', color: '#fff',
    border: '3px solid #11131a', borderRadius: 12, padding: '10px 22px', cursor: 'pointer',
    boxShadow: '0 4px 0 #11131a',
};

const roteiroDaFase = (f: string): ReadonlyArray<F12Linha> =>
    f === 'encontro' ? F12_ENCONTRO
        : f === 'virada' ? F12_VIRADA
            : f === 'vitoria' ? F12_VITORIA
                : f === 'derrota' ? F12_DERROTA
                    : f === 'despedida' ? F12_DESPEDIDA
                        : [];

export const Floor12: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
    const [, forcar] = useState(0);
    const avisar = useCallback(() => forcar((v) => v + 1), []);

    const nave = useRef<Nave>(novaNave(0, meioY()));
    const irmao = useRef<Nave>(novaNave(-4, meioY() + 1.2, 3));
    const entrada = useRef({ x: 0, y: 0 });
    const flash = useRef(0);
    const gritoRef = useRef('');
    const porta = useRef(0);
    const abertura = useRef(0);
    const sumindo = useRef(0);
    const cam = useRef(0);
    const helice = useRef(1);
    const falando = useRef(false);
    const visivel = useRef(false);
    const alerta = useRef({ texto: '', ate: 0 });
    const jaAvisou = useRef(new Set<string>());

    useEffect(() => {
        // A arena se alarga ANTES de qualquer nave nascer: as posições iniciais
        // e as faixas dos ataques saem de `ARENA.x`, e alargar depois deixaria o
        // irmão fora da arena numa tela larga.
        ajustarAoAspecto(window.innerWidth / Math.max(1, window.innerHeight));
        reiniciarImpacto();
        f12Reset();
        nave.current = novaNave(0, meioY());
        irmao.current = novaNave(-ARENA.x * 0.55, meioY() + 1.2, 3);
        f12AoMudar(avisar);
        return () => { f12AoMudar(null); pararMotor(); pararTrilha(); };
    }, [avisar]);

    // Durante a introdução o avião só aparece quando a câmera já saiu de dentro
    // do hóspede — antes disso o jogador estaria vendo o próprio cockpit por
    // dentro E por fora ao mesmo tempo.
    useEffect(() => { visivel.current = false; }, []);

    const fase = f12.fase;
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
        const w = window as unknown as Record<string, unknown>;
        w.__f12fase = fase; w.__f12abertura = abertura.current;
        // A NAVE, para a bancada poder responder "o arrasto move o avião?".
        // Sem isto, a única prova de que o controle funciona é a foto — e uma
        // foto de um avião parado no meio da tela é indistinguível de um jogo
        // em que ninguém está tocando.
        w.__f12nave = nave.current; w.__f12arena = ARENA;
        // A bancada precisa contar PROJÉTEIS. "Não vi bala nenhuma na foto" é
        // uma frase sobre a foto, não sobre o jogo — e este andar já me fez
        // consertar coisa que não estava quebrada por causa disso.
        // A bancada precisa poder ADIANTAR a luta: metade do conteúdo deste
        // andar mora depois de 50% da vida do chefe, e jogando de verdade
        // ninguém chega lá. Sem isto, a virada e os dois ataques novos são
        // invisíveis para quem está avaliando o andar.
        // Ela tem de passar pelo MESMO caminho do jogo: `ferir` devolve "cruzou
        // o limiar", e quem liga a virada é `abrirAVirada`. A primeira versão
        // deste atalho ignorava o retorno, e a bancada relatou "os dois ataques
        // novos não aparecem nem depois da virada" — quando a virada é que
        // nunca tinha acontecido. Um atalho de bancada que desvia da regra mede
        // outro jogo, exatamente como a cópia do ritmo da arma media.
        w.__f12ferir = (d: number) => {
            if (ferir(d) && F12FERRAMENTAS.atual) abrirAVirada(F12FERRAMENTAS.atual);
            f12Bump();
        };
        w.__f12bocaX = BOCA_ALVO.x;
        w.__f12enq = { larg: larguraDoQuadro(ENQUADRAMENTO.recuo, ENQUADRAMENTO.aspecto) };
        w.__f12estado = {
            fase, vida: f12.vida, projeteis: f12.projeteis, nave: nave.current,
            irmao: irmao.current, ataqueNoAr: f12.ataqueNoAr, relogio: f12.relogio,
            bocaT: f12.bocaT, linhaDoDialogo: f12.linhaDoDialogo,
            passouDaVirada: f12.passouDaVirada, vidas: nave.current.vidas,
        };
    }
    // ── PULAR ────────────────────────────────────────────────────────────
    //
    // O andar tinha dezessete segundos entre abrir e poder jogar, e nenhuma
    // saída. Quem já viu a cena uma vez estava preso a ela toda vez que
    // perdesse — e perder era comum. Um botão de pular não é conforto: é o que
    // torna a derrota barata, e derrota barata é o que faz um chefe difícil
    // continuar sendo divertido.
    const pular = useCallback(() => {
        porta.current = 1; abertura.current = 1; cam.current = 1;
        sumindo.current = 1; visivel.current = true;
        f12.fase = 'luta'; f12.linhaDoDialogo = 0;
        tocarTrilha();
        avisar();
    }, [avisar]);

    const roteiro = roteiroDaFase(fase);
    const linha = roteiro[Math.min(f12.linhaDoDialogo, roteiro.length - 1)] ?? null;
    const ultimaLinha = f12.linhaDoDialogo >= roteiro.length - 1;
    falando.current = !!linha;

    const avancarFala = useCallback(() => {
        const r = roteiroDaFase(f12.fase);
        if (f12.linhaDoDialogo < r.length - 1) {
            f12.linhaDoDialogo += 1; tocarFalaDoIrmao(); f12Bump(); return;
        }
        // Fim do bloco de fala: para onde ele leva.
        if (f12.fase === 'encontro' || f12.fase === 'virada') {
            f12.fase = 'luta';
            tocarTrilha();
            if (!jaAvisou.current.has('inicio')) {
                jaAvisou.current.add('inicio');
                alerta.current = { texto: F12_ALERTAS.inicio, ate: f12.relogio + 5 };
            }
            f12.bocaT = 0;                 // o compasso recomeça limpo dos dois lados
            tocarMotor();
        } else if (f12.fase === 'derrota') {
            // Recomeça a luta, mas mantendo o que a cabeça já perdeu seria
            // cruel do avesso: ela volta inteira e o jogador também.
            f12Reset();
            nave.current = novaNave(0, meioY());
            irmao.current = novaNave(-ARENA.x * 0.55, meioY() + 1.2, 3);
            f12.fase = 'luta'; f12.bocaT = 0;
            abertura.current = 1; cam.current = 1; sumindo.current = 1; visivel.current = true;
            tocarMotor();
        } else if (f12.fase === 'vitoria') {
            f12.fase = 'despedida'; f12.linhaDoDialogo = 0;
        } else if (f12.fase === 'despedida') {
            onExit?.();
            return;
        }
        f12Bump();
    }, [onExit]);

    // ── CONTROLE: ARRASTAR A TELA INTEIRA ────────────────────────────────
    //
    // Havia um joystick fixo no canto e um botão de tiro no outro. Os dois
    // estavam errados pelo mesmo motivo: num shmup de celular a nave tem de ir
    // ONDE O DEDO ESTÁ, e não para onde um manivelinha aponta. Com joystick o
    // jogador olha para o polegar em vez de olhar para a tela, e cada desvio
    // passa por uma tradução (ângulo → direção → aceleração) que atrasa a mão.
    //
    // Aqui o dedo arrasta em qualquer lugar da tela e a nave vai junto, UM PARA
    // UM: o pixel que o dedo anda é o pixel que a nave anda. O botão de tiro
    // sumiu porque o tiro é automático.
    //
    // A conversão de pixel para mundo sai do enquadramento: a largura do quadro
    // no plano do avião dividida pela largura da tela. Sem isso o arrasto teria
    // um "ganho" arbitrário que mudaria de celular para celular.
    const arrasto = useRef<{ id: number; x: number; y: number } | null>(null);

    // O ASPECTO É O DA TELA DE VERDADE, não o da composição. Usar o composto
    // aqui dava um arrasto certo só no celular do dono do jogo: em qualquer
    // outra proporção o dedo e a nave andavam distâncias diferentes, e um a um
    // que não é um a um é pior do que um ganho assumido.
    const pixelParaMundo = useCallback(() => {
        const tela = Math.max(1, window.innerWidth);
        const aspecto = tela / Math.max(1, window.innerHeight);
        return larguraDoQuadro(ENQUADRAMENTO.recuo, aspecto) / tela;
    }, []);

    const arrastoHandlers = {
        onPointerDown: (e: React.PointerEvent) => {
            if (f12.fase !== 'luta') return;
            arrasto.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e: React.PointerEvent) => {
            const a = arrasto.current;
            if (!a || a.id !== e.pointerId || f12.fase !== 'luta') return;
            const k = pixelParaMundo();
            // Y da tela cresce para baixo; o do mundo, para cima.
            arrastarNave(nave.current, (e.clientX - a.x) * k, -(e.clientY - a.y) * k);
            a.x = e.clientX; a.y = e.clientY;
        },
        onPointerUp: () => { arrasto.current = null; },
        onPointerCancel: () => { arrasto.current = null; },
    };

    // teclado, para quem joga no computador
    useEffect(() => {
        const teclas = new Set<string>();
        const aplicar = () => {
            const x = (teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (teclas.has('a') || teclas.has('arrowleft') ? 1 : 0);
            const y = (teclas.has('w') || teclas.has('arrowup') ? 1 : 0) - (teclas.has('s') || teclas.has('arrowdown') ? 1 : 0);
            entrada.current.x = x; entrada.current.y = y;
        };
        const baixo = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if ([' ', 'w', 'a', 's', 'd', 'j', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
            teclas.add(k); aplicar();
        };
        const cima = (e: KeyboardEvent) => { teclas.delete(e.key.toLowerCase()); aplicar(); };
        window.addEventListener('keydown', baixo);
        window.addEventListener('keyup', cima);
        return () => { window.removeEventListener('keydown', baixo); window.removeEventListener('keyup', cima); };
    }, []);

    const mostrarControles = fase === 'luta';
    // Enquanto o ala fala, a dica de controle cede o lugar: duas frases no mesmo
    // rodapé é o mesmo que nenhuma.
    const [temAlerta, setTemAlerta] = useState(false);
    const vidaFrac = Math.max(0, f12.vida / VIDA_MAXIMA);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#7ec0ef', touchAction: 'none' }}>
            <Canvas
                // ── ORÇAMENTO DE PIXELS, E NÃO UM `dpr` FIXO ─────────────
                //
                // Era `dpr={0.6}` para todo mundo. `dpr` é um MULTIPLICADOR:
                // com ele fixo, uma tela maior renderiza proporcionalmente mais
                // pixels e paga proporcionalmente mais. Medido, o andar dava 46
                // quadros a 915x412 e 27 a 1280x720 — a mesma cena, quase
                // metade do quadro, só porque a janela é maior.
                //
                // Um teto de pixels faz o custo do quadro parar de depender do
                // tamanho da janela: telas grandes ficam um pouco mais macias e
                // continuam jogáveis, e o celular — que é o alvo — não perde
                // nada, porque ele já estava abaixo do teto.
                dpr={dprDoOrcamento()}
                camera={{ fov: ENQUADRAMENTO.fov, near: 0.1, far: 620, position: [0, meioY() + 0.35, 0.55] }}
                gl={{ antialias: false }}
                onCreated={({ gl, scene, camera }) => {
                    gl.domElement.style.imageRendering = 'pixelated';
                    scene.background = new THREE.Color('#7ec0ef');
                    // A névoa começa DEPOIS da cabeça (a 47 da câmera): com ela em 40 o
                    // chefe entrava no nevoeiro e perdia o contraste.
                    // ── A NÉVOA RECUOU, PORQUE AGORA HÁ CIDADE LÁ ATRÁS ──
                    // Ela ia de 58 a 270 num cenário cujo objeto mais distante
                    // era uma torre a 160. Com o arquipélago em z -150..-290, a
                    // mesma névoa dissolvia a cidade inteira num borrão branco:
                    // o céu voltava a parecer vazio, só que caro. De 120 a 560
                    // ela continua dando perspectiva aérea (o que está longe
                    // clareia) sem apagar o que foi posto para ser visto.
                    scene.fog = new THREE.Fog('#b7e2f7', 120, 560);
                    // DEV: a bancada precisa MEDIR o enquadramento. Sem isto, o
                    // tamanho do avião e da cabeça na tela é opinião — e opinião
                    // sobre enquadramento já custou caro neste repositório.
                    if (import.meta.env?.DEV && typeof window !== 'undefined') {
                        const w = window as unknown as Record<string, unknown>;
                        w.__f12cam = camera; w.__f12cena = scene; w.__THREE = THREE;
                    }
                }}
            >
                <Floor12Ceu />
                <Floor12Cabeca flashRef={flash} />
                <AnelDaBoca />
                <Floor12Projeteis />
                <Faiscas />
                <Mira naveRef={nave} />
                <CabineDeDentro portaRef={porta} sumindoRef={sumindo} />
                <AviaoDoJogador naveRef={nave} aberturaRef={abertura} heliceRef={helice} visivelRef={visivel} />
                {fase !== 'intro' && fase !== 'virando' && <AviaoDoIrmao naveRef={irmao} falandoRef={falando} />}
                <DiretorDaIntro portaRef={porta} aberturaRef={abertura} sumindoRef={sumindo}
                    camRef={cam} avisar={() => { visivel.current = true; avisar(); }} />
                <CameraDaLuta naveRef={nave} irmaoRef={irmao} camRef={cam} />
                <DiretorDaLuta alertaRef={alerta} jaAvisou={jaAvisou} nave={nave} irmao={irmao} entrada={entrada}
                    flash={flash} gritoRef={gritoRef} avisar={avisar} />
                <RevelarAviao camRef={cam} visivelRef={visivel} />
            </Canvas>

            {/* ── HUD ── */}
            {fase === 'luta' && (
                <>
                    {/* a vida da cabeça */}
                    <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: '8%', right: '8%', zIndex: 3, pointerEvents: 'none' }}>
                        <div style={{ ...t64, fontSize: 12, marginBottom: 3, textAlign: 'center' }}>A CABEÇA</div>
                        <div style={{ height: 16, background: 'rgba(0,0,0,0.5)', border: '3px solid #11131a', borderRadius: 9, overflow: 'hidden' }}>
                            <div style={{
                                width: `${vidaFrac * 100}%`, height: '100%',
                                background: f12.passouDaVirada
                                    ? 'linear-gradient(180deg,#ff7a3a,#c8443a)'
                                    : 'linear-gradient(180deg,#9dff6b,#3f9638)',
                                transition: 'width 0.15s linear',
                            }} />
                        </div>
                    </div>
                    {/* as vidas do jogador */}
                    <div style={{ ...t64, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 62px)', left: 14, fontSize: 20, zIndex: 3, pointerEvents: 'none' }}>
                        {/* ── AS VIDAS SÃO DESENHADAS, NÃO DIGITADAS ──
                            Eram `'✈'.repeat(vidas)`. O glifo U+2708 não existe
                            na fonte monoespaçada de muitos aparelhos e virava
                            tofu: na foto o HUD mostrava `+++++`. Ícone de
                            interface dependendo de dingbat da fonte do sistema é
                            uma aposta que se perde em silêncio, e ela aparece no
                            primeiro quadro do andar. Agora é um SVG: mesmo
                            desenho em todo lugar, e do formato do avião que o
                            jogador está pilotando. */}
                        {Array.from({ length: VIDAS_DO_JOGADOR }, (_, i) => (
                            <IconeDeVida key={i} cheia={i < nave.current.vidas} />
                        ))}
                    </div>
                    {/* o grito do ataque: o telegrafo escrito */}
                    <GritoDoAtaque gritoRef={gritoRef} />
                    <AvisoDeJanela />
                </>
            )}

            {/* ── balão de fala ── */}
            {linha && (
                <div onPointerDown={avancarFala}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4, padding: '0 14px calc(env(safe-area-inset-bottom) + 16px)', cursor: 'pointer' }}>
                    <div style={{
                        maxWidth: 680, margin: '0 auto', background: '#fffef2',
                        border: `4px solid ${linha.quem === 'jogador' ? '#3b6fb0' : '#11131a'}`,
                        borderRadius: 16, boxShadow: '0 6px 0 rgba(0,0,0,0.45)', padding: '12px 16px 14px',
                    }}>
                        <div style={{ ...t64, fontSize: 13, color: linha.quem === 'jogador' ? '#3b6fb0' : '#ff6b4a', textShadow: 'none', marginBottom: 4 }}>
                            {linha.quem === 'jogador' ? '▶ VOCÊ' : '● TROCO-63'}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 17, lineHeight: 1.45, color: '#1c2433', minHeight: 52 }}>
                            {linha.texto}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                            <button style={{
                                ...btn64,
                                background: ultimaLinha && fase === 'derrota' ? 'linear-gradient(180deg,#e8503a,#b03426)'
                                    : ultimaLinha && fase === 'despedida' ? 'linear-gradient(180deg,#555,#333)'
                                        : ultimaLinha ? 'linear-gradient(180deg,#58b84d,#3f9638)' : btn64.background,
                            }} onPointerDown={(e) => { e.stopPropagation(); avancarFala(); }}>
                                {!ultimaLinha ? '▶'
                                    : fase === 'encontro' ? 'BORA! ✈'
                                        : fase === 'virada' ? 'DE NOVO! ✈'
                                            : fase === 'derrota' ? 'TENTAR OUTRA VEZ'
                                                : fase === 'vitoria' ? '▶'
                                                    : 'SUBIR ⬆'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── A SUPERFÍCIE DE ARRASTO ──
                A tela inteira é o controle. Fica ATRÁS do balão de fala e do
                HUD (z-index menor), para um toque no ▶ não sair pilotando. */}
            {mostrarControles && (
                <div {...arrastoHandlers} style={{
                    position: 'absolute', inset: 0, zIndex: 1, touchAction: 'none',
                }} />
            )}
            {/* O aviso, só nos primeiros segundos da luta: sem joystick na tela,
                alguém tem de dizer que a tela é o joystick. */}
            {/* ── O RODAPÉ É UMA FILA, NÃO UMA PILHA ──
                Chegaram a ficar QUATRO textos sobrepostos na faixa de baixo — a
                legenda do ala, "ATIRE NA BOCA!", "ARRASTE..." e a linha do tiro
                automático — bem em cima de onde o avião voa. Eu tinha tirado a
                dica de cima da cara do chefe e empilhado tudo embaixo: troquei
                um estorvo por outro. Agora cada faixa tem a sua altura e só uma
                fala de cada vez, na ordem de urgência: o ala ensina o padrão que
                está chegando, e o resto espera. */}
            {mostrarControles && !temAlerta && <DicaDeControle naveRef={nave} />}
            <AlertaDoAla alertaRef={alerta} aoMudar={setTemAlerta} />

            {/* PULAR: fica no canto, discreto, e some quando a luta começa */}
            {(fase === 'intro' || fase === 'virando' || fase === 'encontro') && (
                <button onClick={pular} style={{
                    ...t64, position: 'absolute', zIndex: 6,
                    top: 'calc(env(safe-area-inset-top) + 10px)', right: 12,
                    fontSize: 13, padding: '7px 13px', color: '#fff',
                    background: 'rgba(17,19,26,0.62)', border: '2px solid rgba(255,255,255,0.35)',
                    borderRadius: 10, cursor: 'pointer',
                }}>PULAR ▸</button>
            )}

            {/* a legenda da introdução: sem ela o jogador não sabe que o
                elevador está virando avião, ele só vê o metal se mexendo */}
            {(fase === 'intro' || fase === 'virando') && (
                <div style={{ ...t64, position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 28px)', left: 0, right: 0, textAlign: 'center', fontSize: 18 }}>
                    {fase === 'intro' ? 'ANDAR 12' : 'O ELEVADOR ESTÁ SE ABRINDO…'}
                </div>
            )}
        </div>
    );
};

/**
 * A MIRA.
 *
 * Os tiros saem retos para -Z a partir de onde o avião está, então acertar a
 * boca é uma questão de ALINHAR o avião com ela. Isso é simples de entender e
 * impossível de ver: no meio de cinco padrões voando, ninguém acompanha uma
 * bala de 0,7 s até o fundo da tela para saber se estava alinhado.
 *
 * Este traço mostra a linha de tiro antes de o tiro sair, e fica VERDE quando a
 * linha cruza a boca. É a diferença entre "atirei e não sei o que aconteceu" e
 * "estou mirado".
 */
const Mira: React.FC<{ naveRef: React.MutableRefObject<Nave> }> = ({ naveRef }) => {
    const traco = useRef<THREE.Mesh>(null);
    useFrame(() => {
        const m = traco.current; if (!m) return;
        const n = naveRef.current;
        const ligada = f12.fase === 'luta';
        m.visible = ligada;
        if (!ligada) return;
        m.position.set(n.x, n.y, (ARENA.zNave + ARENA.zCabeca) / 2);
        // ── O ALINHAMENTO É SÓ EM X, E ESTAVA MEDINDO EM Y TAMBÉM ────────
        // Era `hypot(n.x - BOCA_ALVO.x, n.y - BOCA_ALVO.y)`. A nave voa por
        // volta de y=5 e a boca fica em y=24: essa distância NUNCA é menor que
        // o raio do alvo, então a mira nunca acendia — a única peça da tela que
        // ensina "você está mirado" estava desligada por aritmética. O tiro se
        // eleva sozinho (ver `subidaDoTiro`); quem o jogador alinha é o X.
        const alinhado = Math.abs(n.x - BOCA_ALVO.x) < BOCA_ALVO.raio;
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.set(alinhado ? '#b6ff4a' : '#ffffff');
        mat.opacity = alinhado ? 0.5 : 0.16;
    });
    return (
        <mesh ref={traco} visible={false}>
            <boxGeometry args={[0.1, 0.1, Math.abs(ARENA.zCabeca - ARENA.zNave)]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} fog={false} />
        </mesh>
    );
};

/**
 * A DICA DE CONTROLE.
 *
 * Sem joystick na tela, alguém tem de dizer que a tela É o joystick. Ela some
 * sozinha depois de seis segundos: um aviso que fica para sempre vira sujeira
 * em cima de um jogo que já tem muita coisa acontecendo.
 */
const DicaDeControle: React.FC<{ naveRef: React.MutableRefObject<Nave> }> = ({ naveRef }) => {
    // ── ELA SOME QUANDO O JOGADOR MEXE, E NÃO NO RELÓGIO ─────────────────
    //
    // Eram seis segundos fixos. Quem entende em um segundo continuava lendo
    // "ARRASTE EM QUALQUER LUGAR PARA VOAR" por mais cinco, em cima do próprio
    // avião — e quem estava perdido também perdia a frase aos seis. Uma
    // instrução tem um trabalho: ser obedecida. Quando ela é, acabou.
    const [visivel, setVisivel] = useState(true);
    useFrameFora(() => {
        if (visivel && Math.abs(naveRef.current.x) + Math.abs(naveRef.current.y - meioY()) > 0.9) {
            setVisivel(false);
        }
    });
    useEffect(() => {
        // teto de segurança para quem não mexe
        const id = window.setTimeout(() => setVisivel(false), 9000);
        return () => window.clearTimeout(id);
    }, []);
    if (!visivel) return null;
    return (
        <div style={{
            ...t64, position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 30px)',
            left: 0, right: 0, textAlign: 'center', fontSize: 15, zIndex: 3, pointerEvents: 'none',
            opacity: 0.92,
        }}>
            ARRASTE EM QUALQUER LUGAR PARA VOAR<br />
            <span style={{ fontSize: 12 }}>O TIRO É AUTOMÁTICO · MIRE NA BOCA ABERTA</span>
        </div>
    );
};

/** Mostra o avião quando a câmera já saiu de dentro do hóspede. */
const RevelarAviao: React.FC<{
    camRef: React.MutableRefObject<number>;
    visivelRef: React.MutableRefObject<boolean>;
}> = ({ camRef, visivelRef }) => {
    // 0,35 e não 0,12: abaixo disso a câmera ainda está praticamente dentro da
    // cabine e o casco seria desenhado em volta dela. Com a saída da câmera
    // durando 1,6 s, 0,35 cai um segundo inteiro ANTES de o desdobramento
    // começar — que é de propósito: o jogador vê a cabine do elevador voando
    // fechada antes de ela abrir asas, e é o contraste entre as duas imagens
    // que faz a transformação ser lida como transformação.
    useFrame(() => { if (camRef.current > 0.35) visivelRef.current = true; });
    return null;
};

/**
 * "ATIRE!" enquanto a boca está aberta.
 *
 * A janela de dano é a única regra do chefe, e ela é invisível: o jogador pode
 * passar a luta inteira atirando na hora errada sem nunca descobrir por que
 * nada acontece. O anel na boca diz isso em 3D; esta linha diz em palavras,
 * para quem estiver olhando para o próprio avião.
 */
const AvisoDeJanela: React.FC = () => {
    // ── ELE ERA PERMANENTE, E POR ISSO NÃO ERA DICA ──────────────────────
    //
    // Aparecia toda vez que a boca abria — 51% do ciclo, pelos dois minutos
    // inteiros. Uma frase que está sempre na tela para de ser lida em trinta
    // segundos e vira ruído: some das três coisas que o jogador processa e fica
    // ocupando o terço de baixo, que é justamente onde o avião dele voa. Num
    // jogo publicado a dica ensina e sai de cena.
    //
    // Três aberturas bastam. Se em três vezes o jogador não ligou a boca aberta
    // ao anel verde pulsando em volta dela, o problema não é a frase.
    const [aberta, setAberta] = useState(false);
    const vistas = useRef(0);
    const [gasto, setGasto] = useState(false);
    // `useFrameFora` e não `setInterval`: este arquivo já tinha TRÊS mecanismos
    // para o mesmo problema (o barramento `f12AoMudar`, um laço de quadro e dois
    // `setInterval` com períodos diferentes). Três relógios para a mesma verdade
    // é como duas partes da tela discordam sobre o que está acontecendo.
    // O CONTADOR NÃO PODE MORAR DENTRO DO UPDATER. Ele morava: o
    // `++vistas.current` e o `setGasto` estavam dentro do `setAberta(antes =>
    // ...)`. Em `StrictMode` o React invoca updaters DUAS VEZES em
    // desenvolvimento para achar exatamente esse tipo de impureza — e o
    // contador andava em dobro, matando a dica em duas aberturas em vez de
    // três. Funcionava em produção, que é a pior forma de um defeito existir.
    const eraAberta = useRef(false);
    useFrameFora(() => {
        const q = vulneravel(bocaNoInstante(f12.bocaT)) && f12.fase === 'luta';
        if (q !== eraAberta.current) {
            eraAberta.current = q;
            if (q) { vistas.current += 1; if (vistas.current > 3) setGasto(true); }
            setAberta(q);
        }
    });
    if (!aberta || gasto) return null;
    return (
        <div style={{
            // ── ELE SAIU DE CIMA DA CARA DELA ────────────────────────
            // Estava a 96 px do topo, que é exatamente onde a cabeça está: a
            // frase que ensina a regra do jogo era desenhada POR CIMA do alvo
            // que ela manda acertar, e junto com o nome do ataque virava uma
            // pilha de texto tapando o chefe. Agora ele mora na base, perto do
            // avião — que é para onde o jogador olha enquanto pilota.
            ...t64, position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 74px)',
            left: 0, right: 0, textAlign: 'center', fontSize: 20, color: '#b6ff4a',
            zIndex: 3, pointerEvents: 'none', animation: 'f12pisca 0.45s infinite',
        }}>
            ATIRE NA BOCA!
        </div>
    );
};

/** O nome do ataque, piscando quando a boca abre. DOM, fora do Canvas. */
const GritoDoAtaque: React.FC<{ gritoRef: React.MutableRefObject<string> }> = ({ gritoRef }) => {
    const [texto, setTexto] = useState('');
    // Ver a nota em `AvisoDeJanela`: um relógio só para a tela inteira.
    useFrameFora(() => setTexto((antes) => (antes === gritoRef.current ? antes : gritoRef.current)));
    const [visivel, setVisivel] = useState(false);
    useEffect(() => {
        if (!texto) return;
        setVisivel(true);
        const id = window.setTimeout(() => setVisivel(false), 1500);
        return () => window.clearTimeout(id);
    }, [texto]);
    if (!texto || !visivel) return null;
    return (
        <div style={{
            // Debaixo da BARRA DE VIDA, não a 22% da altura: a 22% ele caía na
            // testa do chefe. O nome do ataque é informação sobre ELA, então
            // mora junto da barra dela — e some da área em que ela é desenhada.
            ...t64, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 44px)',
            left: 0, right: 0, textAlign: 'center',
            fontSize: 22, color: '#ff8a6b', animation: 'f12pisca 0.4s infinite',
        }}>
            {texto}
            <style>{'@keyframes f12pisca { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }'}</style>
        </div>
    );
};

export { configureFloor12Sfx };
export default Floor12;

/**
 * A LEGENDA DO ALA — ele fala durante a luta, e o jogo não para.
 *
 * Metade do texto deste andar morava num bloco de seis caixas antes da luta, com
 * o jogador de mãos atadas. Aqui ele fala no mesmo instante em que a coisa
 * comentada aparece na tela, e o jogador pode estar desviando enquanto lê — que
 * é a diferença entre um personagem e um menu.
 */
const AlertaDoAla: React.FC<{
    alertaRef: React.MutableRefObject<{ texto: string; ate: number }>;
    aoMudar: (tem: boolean) => void;
}> = ({ alertaRef, aoMudar }) => {
        const [txt, setTxt] = useState('');
        // O `aoMudar` NÃO vai dentro do updater. Eu já tinha acabado de
        // consertar exatamente isto em `AvisoDeJanela` — em `StrictMode` o React
        // invoca updaters duas vezes de propósito, para achar impureza, e um
        // efeito colateral ali dispara em dobro. Repeti o erro na linha
        // seguinte; o jeito de não repetir é o estado anterior morar num ref.
        const anterior = useRef('');
        useFrameFora(() => {
            const a = alertaRef.current;
            const quer = a.texto && f12.relogio < a.ate ? a.texto : '';
            if (quer === anterior.current) return;
            anterior.current = quer;
            setTxt(quer);
            aoMudar(!!quer);
        });
        if (!txt) return null;
        return (
            <div style={{
                position: 'absolute', zIndex: 5, left: '5%', right: '5%',
                bottom: 'calc(env(safe-area-inset-bottom) + 108px)',
                pointerEvents: 'none', textAlign: 'center',
            }}>
                <span style={{
                    ...t64, fontSize: 13, color: '#ffd7a8', lineHeight: 1.4,
                    background: 'rgba(17,19,26,0.66)', padding: '7px 12px', borderRadius: 9,
                    borderLeft: '3px solid #ff6b4a', display: 'inline-block',
                }}>
                    <b style={{ color: '#ff6b4a' }}>TROCO-63 </b>{txt}
                </span>
            </div>
        );
    };

/**
 * Um `useFrame` que funciona FORA do Canvas (o HUD não vive na cena 3D).
 *
 * ── UM LAÇO, NÃO UM POR COMPONENTE ───────────────────────────────────────────
 *
 * A primeira versão abria um `requestAnimationFrame` próprio por chamador. Isso
 * trocou dois `setInterval` por TRÊS laços de quadro independentes, contra o
 * comentário que eu mesmo tinha escrito condenando "três relógios para a mesma
 * verdade". Relógio duplicado é como duas partes da tela discordam sobre o que
 * está acontecendo, e três rAF custam três vezes o agendamento por um trabalho
 * que cabe num.
 *
 * Agora há um só, criado quando o primeiro assinante entra e desligado quando o
 * último sai.
 */
const ASSINANTES = new Set<() => void>();
let lacoDoHud = 0;

function girarOHud(): void {
    for (const fn of ASSINANTES) fn();
    lacoDoHud = ASSINANTES.size ? requestAnimationFrame(girarOHud) : 0;
}

function useFrameFora(fn: () => void): void {
    const guardado = useRef(fn); guardado.current = fn;
    useEffect(() => {
        const chamar = () => guardado.current();
        ASSINANTES.add(chamar);
        if (!lacoDoHud) lacoDoHud = requestAnimationFrame(girarOHud);
        return () => {
            ASSINANTES.delete(chamar);
            if (!ASSINANTES.size && lacoDoHud) { cancelAnimationFrame(lacoDoHud); lacoDoHud = 0; }
        };
    }, []);
}

/**
 * Uma vida, no formato do avião do jogador.
 *
 * SVG e não fonte: ver a nota no HUD. O contorno preto é o mesmo truque do
 * `t64` — o andar é jogado contra um céu claro e um branco puro some nele.
 */
const IconeDeVida: React.FC<{ cheia: boolean }> = ({ cheia }) => (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden
        style={{ marginRight: 3, opacity: cheia ? 1 : 0.28 }}>
        <path
            d="M12 2.2 13.6 9l7.6 3.1v2.1L13.6 12.6l-.4 5 2.6 1.9v1.6L12 20l-3.8 1.1v-1.6l2.6-1.9-.4-5-7.6 1.6v-2.1L10.4 9 12 2.2Z"
            fill={cheia ? '#FFD54F' : '#cfd6e4'} stroke="#11131a" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
);


/**
 * O `dpr` que mantém o custo do quadro constante, seja qual for a janela.
 *
 * `ORCAMENTO` é em pixels de render. Ele sai da tela em que o andar foi
 * composto (412x915 a 0,6 de dpr) — abaixo dele nada muda, acima dele a escala
 * cai para caber. O teto de 0,62 existe porque o andar é pixelado de propósito
 * (`imageRendering: 'pixelated'`), e subir a resolução não o deixaria mais
 * bonito, só mais caro.
 */
const ORCAMENTO_DE_PIXELS = 412 * 915 * 0.6 * 0.6;

function dprDoOrcamento(): number {
    if (typeof window === 'undefined') return 0.6;
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    return Math.max(0.34, Math.min(0.62, Math.sqrt(ORCAMENTO_DE_PIXELS / (w * h))));
}
