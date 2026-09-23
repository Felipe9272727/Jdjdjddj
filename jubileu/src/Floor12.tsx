import { EffectComposer, Bloom, N8AO, SMAA } from '@react-three/postprocessing';
import { PerformanceMonitor } from '@react-three/drei';
import { F12_CINEMA, CENA_DA_DERROTA, CENA_DA_VIRADA, cinemaEase, victoryBeat, defeatBeat, turnBeat, avancoDaCabecaNaDerrota } from './f12Cinema';
import { Floor12CinemaEffects } from './Floor12CinemaEffects';
import { Floor12Prologo, PROLOGO, prologo } from './Floor12Prologo';
import { nascerMissilCarregado, danoDoTiro, expressao, LIMIAR_DA_VIRADA } from './f12Boss';
import { Floor12FlightFeedback, Floor12ChargeMeter } from './Floor12FlightFeedback';
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
    novaNave, passoDaNave, conduzirNave, arrastarNave, tomarToque, NAVE, VIDAS_DO_JOGADOR,
    bocaNoInstante, vulneravel, CICLO_DA_BOCA, BOCA,
    ataqueDaVez, marcarAbertura, fichaDoAtaque, VIDA_MAXIMA, ferir,
    nascerLeque, nascerTeleguiado, nascerNaves, nascerMare, nascerElevadores, nascerCruz, nascerLustre, nascerChuva, nascerPinca,
    nascerTiro, TIRO, PONTA_DA_ASA, passoDoProjetil, saiuDeCena, encostou, tiroNaBoca,
    F12_ENCONTRO, F12_VIRADA, F12_VITORIA, F12_DERROTA, F12_DESPEDIDA,
    type Nave, type NomeDoAtaque, type F12Linha,
} from './f12Boss';
import { Floor12Ceu } from './Floor12Ceu';
import { Floor12Cabeca, AnelDaBoca } from './Floor12Cabeca';
import { Floor12Projeteis } from './Floor12Projeteis';
import { AviaoDoJogador, AviaoDoIrmao } from './Floor12Avioes';
import { newFlightWeapon, stepFlightWeapon, FLIGHT_WEAPON, type FlightWeapon } from './f12FlightWeapon';
/** A rajada estava cheia no quadro anterior? (o aviso toca só na virada para cheia) */
let rajadaCheiaAntes = false;
import { Floor12Estilhacos, type PedidoDeEstilhaco } from './Floor12Estilhacos';
import { f12IntroCamera, f12ChaseDistance, f12ChaseFov, f12FrameHeight } from './f12Presentation';
import {
    configureFloor12Sfx, tocarMotor, pararMotor, tocarTiro, tocarTiroIrmao,
    tocarAcerto, tocarBocaAbrindo, tocarAtaque, tocarDano, tocarExplosao,
    tocarFalaDoIrmao, tocarDesdobrar, tocarDing, tocarVitoria, tocarDerrota,
    iniciarMusica, pararMusica, musicaDaVirada, tocarRugido, tocarMorteDoChefe, tocarAcertoCarregado, tocarDanoIrmao, tocarRajadaPronta,
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
                {/* as portas */}
                <mesh ref={esq} position={[-0.62, 0, -1.79]}>
                    <boxGeometry args={[1.24, 2.7, 0.1]} />
                    <meshStandardMaterial color="#b8bcc4" metalness={.85} roughness={.3} />
                </mesh>
                <mesh ref={dir} position={[0.62, 0, -1.79]}>
                    <boxGeometry args={[1.24, 2.7, 0.1]} />
                    <meshStandardMaterial color="#b8bcc4" metalness={.85} roughness={.3} />
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
/** Relógio do prólogo, escrito pelo diretor da intro e lido pelo prólogo. */
const tempoDoPrologo = { current: 99 };
const tCongelado: number | null = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('f12t')
    ? parseFloat(new URLSearchParams(location.search).get('f12t') ?? '0') : null;

const DiretorDaIntro: React.FC<{
    portaRef: React.MutableRefObject<number>;
    aberturaRef: React.MutableRefObject<number>;
    sumindoRef: React.MutableRefObject<number>;
    camRef: React.MutableRefObject<number>;
    introProgressRef: React.MutableRefObject<number>;
    introAtivaRef: React.MutableRefObject<boolean>;
    avisar: () => void;
}> = ({ portaRef, aberturaRef, sumindoRef, camRef, introProgressRef, introAtivaRef, avisar }) => {
    // O relógio começa NEGATIVO: os primeiros `PROLOGO` segundos são o
    // hóspede andando até o elevador (Floor12Prologo), e o zero continua
    // sendo o escuro dentro da cabine — a coreografia abaixo não mudou.
    // Na bancada (`?f12fase=2`, só em DEV) a cena inteira é pulada.
    const t = useRef(import.meta.env.DEV && typeof location !== 'undefined'
        && new URLSearchParams(location.search).get('f12fase') === '2' ? F12_CINEMA.intro - .05 : -PROLOGO);
    const marcos = useRef({ ding: false, desdobrar: false, motor: false });
    // ── TOCAR PULA ───────────────────────────────────────────────────────
    // Catorze segundos na primeira vez são uma apresentação; para quem já
    // viu (ou só quer voar) são uma espera. Um toque depois do "ding" leva o
    // relógio para o fim da cena: todo o resto dela é função de `tt`, então
    // o avião, a câmera e a porta caem na pose final sozinhos.
    useEffect(() => {
        const pular = () => {
            if ((f12.fase === 'intro' || f12.fase === 'virando') && t.current > -PROLOGO + .4)
                t.current = Math.max(t.current, F12_CINEMA.intro - .05);
        };
        window.addEventListener('pointerdown', pular);
        window.addEventListener('keydown', pular);
        return () => { window.removeEventListener('pointerdown', pular); window.removeEventListener('keydown', pular); };
    }, []);
    useFrame((_, rawDt) => {
        if (f12.fase !== 'intro' && f12.fase !== 'virando') {
            introAtivaRef.current = false;
            tempoDoPrologo.current = 99;
            return;
        }
        introAtivaRef.current = true;
        // Cinematic time must not run in slow motion below 20 FPS.
        const antes = t.current;
        if (typeof document === 'undefined' || !document.hidden) t.current += Math.min(rawDt, .25);
        // O prólogo JÁ abriu a porta e jogou o hóspede no vazio: a intro
        // antiga entra a partir das portas abertas, sem repetir o "ding".
        if (antes < 0 && t.current >= 0) { t.current = 3.0; marcos.current.ding = true; }
        // Bancada: `?f12t=3.2` congela o prólogo nesse instante (só em DEV).
        if (import.meta.env.DEV && tCongelado !== null) t.current = tCongelado - PROLOGO;
        const tt = t.current;
        tempoDoPrologo.current = tt + PROLOGO;
        const progress = THREE.MathUtils.clamp(tt / F12_CINEMA.intro, 0, 1);
        introProgressRef.current = progress;

        if (tt > 0.6 && !marcos.current.ding) { marcos.current.ding = true; tocarDing(); }

        portaRef.current = THREE.MathUtils.clamp((tt - 1.2) / 1.4, 0, 1);

        if (tt > 3.0) {
            if (!marcos.current.desdobrar) { marcos.current.desdobrar = true; tocarDesdobrar(); f12.fase = 'virando'; f12Bump(); }
            // Keep the legacy scalar alive while the richer presentation helper
            // is consumed by the shell. This preserves the current callback
            // contract during the staged migration of the aircraft component.
            aberturaRef.current = THREE.MathUtils.clamp((tt - 3.0) / 5.0, 0, 1);
        }
        if (tt > 4.4 && !marcos.current.motor) { marcos.current.motor = true; tocarMotor(); }

        // A câmera sai de dentro do hóspede para trás do avião.
        camRef.current = THREE.MathUtils.clamp((tt - 2.8) / 4.8, 0, 1);
        // A cabine de dentro some junto — ela e o casco são a mesma coisa vista
        // de dois lados, e mostrar as duas ao mesmo tempo entregaria o truque.
        sumindoRef.current = THREE.MathUtils.clamp((tt - 3.1) / 1.2, 0, 1);

        if (tt > F12_CINEMA.intro) {
            introProgressRef.current = 1;
            introAtivaRef.current = false;
            f12.fase = 'encontro'; f12.linhaDoDialogo = 0; tocarFalaDoIrmao(); avisar();
        }
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
const CameraDaLuta: React.FC<{
    naveRef: React.MutableRefObject<Nave>;
    irmaoRef: React.MutableRefObject<Nave>;
    camRef: React.MutableRefObject<number>;
    introProgressRef: React.MutableRefObject<number>;
    introAtivaRef: React.MutableRefObject<boolean>;
    sacodeRef: React.MutableRefObject<number>;
    cinemaClock: React.MutableRefObject<number>;
}> = ({ naveRef, irmaoRef, camRef, introProgressRef, introAtivaRef, sacodeRef, cinemaClock }) => {
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);
    const alvo = useRef(new THREE.Vector3());
    useFrame((_, rawDt) => {
        if (prologo.ativo) return;   // o prólogo dirige a própria câmera
        const dt = Math.min(rawDt, 0.05);
        const n = naveRef.current;
        const aspectoDaTela = size.width / Math.max(1, size.height);
        const recuo = f12ChaseDistance(aspectoDaTela);

        // ── A CÂMERA DA DERROTA ──────────────────────────────────────────
        // Ela larga o avião e SOBE para a cabeça. O plano final não é o jogador
        // caindo — é quem o derrubou, avançando para dentro do quadro com a
        // boca abrindo. A câmera roda junto com o avião enquanto ele ainda está
        // no enquadramento, para que a espiral seja sentida e não só vista.
        // ── A CÂMERA DA VIRADA ───────────────────────────────────────────
        // Ela FECHA na cara da cabeça enquanto ela se abre, e treme junto. Sem
        // isto a metade da vida era um congelamento com legenda.
        if (f12.fase === 'virada') {
            const t = cinemaClock.current, b = turnBeat(t);
            const retrato = Math.max(0, 1 - size.width / Math.max(1, size.height));
            // ── OS DOIS MOVIMENTOS SE SOMAM, E ISSO QUASE CUSTOU O PLANO ──
            // A câmera avança e a cabeça avança CONTRA ela. Com o fechamento
            // que eu tinha escrito primeiro, fotografado, a câmera terminava
            // DENTRO da boca: o quadro final era a garganta em tela cheia e a
            // cara tinha sumido. O alvo aqui é um plano de rosto, não um mergulho.
            const longe = new THREE.Vector3(0, BOCA_ALVO.y + 2.4, ARENA.zCabeca + 27 + retrato * 17);
            const perto = new THREE.Vector3(0, BOCA_ALVO.y + 1.6, ARENA.zCabeca + 22 + retrato * 14);
            camera.position.lerp(longe.lerp(perto, b.aproxima), 1 - Math.exp(-dt * 2.2));
            camera.position.x += Math.sin(t * 57) * b.tremor * .22;
            camera.position.y += Math.cos(t * 43) * b.tremor * .14;
            alvo.current.lerp(new THREE.Vector3(0, BOCA_ALVO.y + 1.1, ARENA.zCabeca), 1 - Math.exp(-dt * 4));
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.fov = THREE.MathUtils.lerp(camera.fov, 56 - b.aproxima * 4, 1 - Math.exp(-dt * 3));
                camera.updateProjectionMatrix();
            }
            camera.lookAt(alvo.current);
            return;
        }

        if (f12.fase === 'abatido') {
            const t = cinemaClock.current, b = defeatBeat(t);
            const retrato = Math.max(0, 1 - size.width / Math.max(1, size.height));
            const n2 = naveRef.current;
            const perto = new THREE.Vector3(n2.x + 2.2, n2.y + 2.0, 9 + retrato * 7);
            // A câmera é colocada RELATIVA à cabeça, e não num z absoluto: os
            // dois se moviam um contra o outro e cruzavam, deixando a cabeça
            // atrás da câmera no plano final. Ver `avancoDaCabecaNaDerrota`.
            const cabecaZ = ARENA.zCabeca + avancoDaCabecaNaDerrota(b.engolir);
            const cara = new THREE.Vector3(0, BOCA_ALVO.y + 1.2,
                cabecaZ + 17 + retrato * 12);
            camera.position.lerp(perto.lerp(cara, b.engolir), 1 - Math.exp(-dt * 2.6));
            camera.position.x += Math.sin(t * 47) * b.atingido * (1 - b.rodopio) * .16;
            camera.rotation.z = (1 - b.engolir) * Math.sin(b.rodopio * Math.PI * 2.2) * .28;
            const foco = new THREE.Vector3(n2.x, n2.y, ARENA.zNave)
                .lerp(new THREE.Vector3(0, BOCA_ALVO.y, cabecaZ), b.engolir);
            alvo.current.lerp(foco, 1 - Math.exp(-dt * 3.4));
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.fov = THREE.MathUtils.lerp(camera.fov, 52 + b.engolir * 18, 1 - Math.exp(-dt * 3));
                camera.updateProjectionMatrix();
            }
            const giro = camera.rotation.z;
            camera.lookAt(alvo.current);
            camera.rotateZ(giro);
            return;
        }

        if (f12.fase === 'queda' || f12.fase === 'vitoria' || f12.fase === 'despedida') {
            const t = cinemaClock.current;
            const b = victoryBeat(t);
            const escort = cinemaEase((t - 6) / 2.4);
            const portrait = Math.max(0, 1 - size.width / Math.max(1, size.height));
            const shock = Math.max(0, 1 - Math.abs(t - F12_CINEMA.rupture) / .45);
            const bossShot = new THREE.Vector3(3 + Math.sin(t * .3) * 2,
                BOCA_ALVO.y + 3 - b.fall * 5, ARENA.zCabeca + 21 + portrait * 16);
            const escortShot = new THREE.Vector3(n.x + 3, n.y + 3, 12 + portrait * 10);
            camera.position.lerp(bossShot.lerp(escortShot, escort), 1 - Math.exp(-dt * 3));
            camera.position.x += Math.sin(t * 61) * shock * .10;
            const focus = new THREE.Vector3(0, BOCA_ALVO.y - b.fall * 10, ARENA.zCabeca);
            focus.lerp(new THREE.Vector3(n.x - 1, n.y + .5, -2), escort);
            alvo.current.lerp(focus, 1 - Math.exp(-dt * 4));
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.fov = THREE.MathUtils.lerp(camera.fov, 52, 1 - Math.exp(-dt * 3));
                camera.updateProjectionMatrix();
            }
            camera.lookAt(alvo.current);
            return;
        }

        // The intro camera is a separate cinematic route. Its marks are relative
        // to the aircraft, so the aircraft can already be positioned by the same
        // Nave state that gameplay uses. At the end of the intro the normal chase
        // camera takes over with a damped lerp instead of a hard cut.
        if (introAtivaRef.current) {
            const aspecto = size.width / Math.max(1, size.height);
            const mark = f12IntroCamera(introProgressRef.current);
            // The presentation helper's final cinematic mark is intentionally
            // nearer than the gameplay framing. Blend to the exact chase pose
            // during its last 18% so leaving the intro cannot jump from z=9 to
            // ENQUADRAMENTO.recuo (19) on the first dialogue frame.
            const handoff = THREE.MathUtils.smoothstep(introProgressRef.current, 0.82, 1);
            const cinematic = new THREE.Vector3(n.x + mark.x, n.y + mark.y, mark.z);
            const chase = new THREE.Vector3(
                n.x * 0.72,
                n.y + 6,
                recuo,
            );
            camera.position.lerp(cinematic.lerp(chase, handoff), Math.min(1, dt * 7));
            const alvoCinematico = new THREE.Vector3(n.x, n.y + mark.targetY, mark.targetZ);
            const alvoGameplay = new THREE.Vector3(
                n.x * 0.5,
                n.y * 0.35 + meioY() * 0.35 + BOCA_ALVO.y * 0.3 + 2,
                -11,
            );
            alvo.current.copy(alvoCinematico.lerp(alvoGameplay, handoff));
            if (camera instanceof THREE.PerspectiveCamera) {
                // ── A INTRO TAMBÉM PRECISA COMPENSAR O ASPECTO ───────────
                // `f12ChaseFov` já fechava a lente em paisagem, mas SÓ na
                // câmera de perseguição. A intro devolvia `fov` fixo, então em
                // 844x390 o plano de REVELAÇÃO do chefe — o único plano cujo
                // trabalho inteiro é dizer "isso é colossal" — era o pior
                // enquadrado do andar: a cabeça ocupava um quinto da largura,
                // ilhada em céu vazio.
                //
                // A compensação é a MESMA RAZÃO que a perseguição usa, aplicada
                // por multiplicação. Assim a coreografia da intro (que já foi
                // ajustada quadro a quadro) não muda de forma — ela só deixa de
                // ser larga demais quando a tela é larga demais.
                const razaoDaLente = f12ChaseFov(aspecto) / ENQUADRAMENTO.fov;
                camera.fov = THREE.MathUtils.lerp(
                    mark.fov * razaoDaLente, f12ChaseFov(aspecto), handoff);
                camera.updateProjectionMatrix();
            }
            camera.lookAt(alvo.current);
            return;
        }

        // ── A APRESENTAÇÃO DO IRMÃO, E ELA ESTAVA OLHANDO PARA O LADO ERRADO ──
        //
        // Este plano de três quartos existe para o irmão mais velho ATUAR: são
        // seis falas de lore do hotel e de preparação do chefe, e é o único
        // plano de apresentação do companheiro no andar.
        //
        // Só que a câmera estava em z = -4,2 olhando para z = +0,4, ou seja
        // ATRÁS dos aviões e virada para o lado OPOSTO ao da cabeça (que está
        // em -26). Fotografado, o resultado eram seis falas contra um campo
        // azul-escuro chapado: sem céu, sem prédios, sem chefe, sem nada. O
        // pior quadro do andar era justamente o de "apresentação cinemática".
        //
        // Com a câmera do outro lado, olhando para -z, a composição vira o que
        // ela sempre devia ter sido: o TROCO-63 em primeiro plano e a CABEÇA
        // GIGANTE ao fundo, atrás dele, enquanto ele fala dela.
        if (f12.fase === 'encontro' && f12.linhaDoDialogo < 3) {
            const ir = irmaoRef.current;
            const perto = f12.linhaDoDialogo === 1;
            camera.position.lerp(new THREE.Vector3(
                ir.x + (perto ? 1.5 : 2.4), ir.y + (perto ? .8 : 1.5),
                f12.linhaDoDialogo === 2 ? 6.4 : 5.0), 1 - Math.exp(-dt * 3.2));
            // O alvo fica um pouco ALÉM do irmão, em -z: assim a cabeça cai
            // atrás dele no quadro em vez de ficar fora dele.
            alvo.current.lerp(new THREE.Vector3(ir.x - .5, ir.y + .7, -3.2), 1 - Math.exp(-dt * 4));
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.fov = THREE.MathUtils.lerp(camera.fov, perto ? 44 : 52, 1 - Math.exp(-dt * 3));
                camera.updateProjectionMatrix();
            }
            camera.lookAt(alvo.current);
            return;
        }

        const k = THREE.MathUtils.clamp(camRef.current, 0, 1);
        const suave = k * k * (3 - 2 * k);

        // Dentro do hóspede: no meio da cabine, na altura dos olhos.
        const dentroY = meioY() + 0.35, dentroZ = 0.55;
        // Atrás do avião: acompanha X e Y com atraso, para a nave "escapar" um
        // pouco do quadro quando o jogador acelera — é o que dá velocidade.
        const atrasX = n.x * 0.72, atrasY = n.y;

        const px = THREE.MathUtils.lerp(0, atrasX, suave);
        // ── O AVIÃO ESTAVA SAINDO PELA BORDA DE BAIXO ────────────────────
        // A câmera fica 6 unidades ACIMA do avião, o que em retrato deixa ele
        // no terço inferior e sobra céu embaixo. Em paisagem a altura do quadro
        // é menos da metade, então as mesmas 6 unidades empurram o avião para
        // FORA: fotografado a 844x390, ele aparecia cortado pela borda.
        //
        // O deslocamento encolhe junto com a altura do quadro, pela mesma razão
        // com que a lente já fecha — é o mesmo problema, medido no outro eixo.
        const alturaDoQuadro = f12FrameHeight(recuo, f12ChaseFov(aspectoDaTela));
        // ── E O AVIÃO NÃO PODE TAMPAR A BOCA ─────────────────────────────
        // Mirar é pôr o avião na frente da boca, e com a câmera logo atrás o
        // próprio jogador escondia o alvo. Subindo a câmera ela olha de cima:
        // o avião projeta ABAIXO da boca e o anel fica à vista.
        const acima = 9 * Math.min(1, alturaDoQuadro / 22);
        const py = THREE.MathUtils.lerp(dentroY, atrasY + acima, suave);
        // O RECUO É MEDIDO, não escolhido no olho: ele vem de `ENQUADRAMENTO`,
        // que é onde a largura da arena, o aspecto da tela em pé e o tamanho do
        // avião são conciliados — ver a nota longa em `f12Boss`.
        const pz = THREE.MathUtils.lerp(dentroZ, recuo, suave);
        camera.position.lerp(new THREE.Vector3(px, py, pz), Math.min(1, dt * 7));
        if (camera instanceof THREE.PerspectiveCamera) {
            // O `fov` acompanha o aspecto pelo mesmo motivo que o recuo já
            // acompanhava: em paisagem a lente de retrato alarga o quadro e a
            // cabeça deixa de ser colossal. Ver `f12ChaseFov`.
            camera.fov = f12ChaseFov(size.width / Math.max(1, size.height));
            camera.updateProjectionMatrix();
        }

        // O alvo fica ENTRE o avião e a boca: a câmera de um jogo de nave tem de
        // enquadrar os dois ao mesmo tempo, senão o jogador escolhe entre ver
        // para onde vai e ver de onde vem o ataque.
        alvo.current.set(
            THREE.MathUtils.lerp(0, n.x * 0.5, suave),
            // Em paisagem mirar mais alto (para o quepe não bater na barra)
            // empurrava o AVIÃO para fora do quadro. Com a barra virada fio, a
            // mira volta a ser a mesma da tela em pé e o avião aparece inteiro.
            // Em paisagem, +0,9: com a câmera um pouco mais recuada o avião tem
            // folga embaixo, e é isso que tira a copa do quepe de baixo da barra.
            THREE.MathUtils.lerp(dentroY, n.y * 0.35 + meioY() * 0.35 + BOCA_ALVO.y * 0.3 + 2
                + (aspectoDaTela > 1.3 ? .9 : 0), suave),
            THREE.MathUtils.lerp(-6, -11, suave),
        );

        // O SACODE do dano. Ele mexe o ALVO, não a posição: sacudir a posição
        // de uma câmera de perseguição briga com a interpolação e sai tremido.
        if (sacodeRef.current > 0) {
            sacodeRef.current = Math.max(0, sacodeRef.current - dt * 3);
            const s = sacodeRef.current;
            alvo.current.x += (Math.random() - 0.5) * s * 1.6;
            alvo.current.y += (Math.random() - 0.5) * s * 1.2;
        }
        camera.lookAt(alvo.current);
    });
    return null;
};

// ═══ O DIRETOR DA LUTA ═══════════════════════════════════════════════════════

interface Ferramentas {
    touchAtivo: React.MutableRefObject<boolean>;
    gatilho: React.MutableRefObject<boolean>;
    arma: React.MutableRefObject<FlightWeapon>;
    nave: React.MutableRefObject<Nave>;
    irmao: React.MutableRefObject<Nave>;
    entrada: React.MutableRefObject<{ x: number; y: number }>;
    flash: React.MutableRefObject<number>;
    sacode: React.MutableRefObject<number>;
    /** 1 no quadro do lançamento do míssil, e decai. */
    clarao: React.MutableRefObject<number>;
    /** 1 no quadro em que o jogador leva um toque, e decai. */
    baque: React.MutableRefObject<number>;
    /** Quantos toques o jogador já levou. SÓ SOBE — ver `BordaSangrando`. */
    baques: React.MutableRefObject<number>;
    /** A fila de estilhaços que a cena empilha e `Floor12Estilhacos` consome. */
    estilhacos: React.MutableRefObject<PedidoDeEstilhaco[]>;
    gritoRef: React.MutableRefObject<string>;
    avisar: () => void;
    cinemaClock: React.MutableRefObject<number>;
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
const DiretorDaLuta: React.FC<Ferramentas> = (F) => {
    const ladoDoTiro = useRef<-1 | 1>(1);
    const ladoDoIrmao = useRef<-1 | 1>(1);
    const cuspiu = useRef(-1);
    const anunciou = useRef(-1);
    const cicloVisto = useRef(-1);
    const faixaDoElevador = useRef(0);
    const faseDaMare = useRef(0);

    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        // O RELÓGIO DA ARMA É O DO MUNDO, e não o da física.
        //
        // `dt` está travado em 0,05 porque o passo da física precisa disso: um
        // quadro longo com o passo inteiro faz projétil ATRAVESSAR o avião. Só
        // que a carga da arma não é física, é um cronômetro — ela promete 2,4
        // SEGUNDOS de imobilidade. Passando o `dt` travado, a promessa virava
        // "2,4 s se o aparelho estiver a 20 fps ou mais, e quase 4 s a 11 fps":
        // num celular ruim o prêmio de 100% ficava fora de alcance, e nada na
        // tela explicava por quê. O travamento maior aqui é só um limite de
        // sanidade para aba em segundo plano; quem fecha em 0,1 é a arma.
        const dtDoRelogio = Math.min(rawDt, 0.25);
        const lutando = f12.fase === 'luta';
        const n = F.nave.current, ir = F.irmao.current;
        // 'derrota' ENTROU NESTA LISTA, e a falta dela era um defeito visível:
        // o loop da luta continuava rodando sobre o card de derrota, pilotando
        // o avião de volta para a arena e endireitando-o. Fotografado, o avião
        // aparecia INTEIRO e nivelado ao lado do ala um segundo e meio depois
        // de ser engolido — a consequência era retirada na tela seguinte.
        if (['queda', 'vitoria', 'despedida', 'abatido', 'derrota'].includes(f12.fase)) return;

        // ── AS NAVES ─────────────────────────────────────────────────────
        // O ALVO já foi movido por quem toca a tela (arrasto) ou pelo teclado.
        // Aqui a nave só persegue. É um caminho só para dedo e tecla — ver a
        // nota longa em `f12Boss`.
        const e = F.entrada.current;
        if (lutando && !F.touchAtivo.current) conduzirNave(n, e.x, e.y, dt);
        passoDaNave(n, dt);
        // O irmão é um ALA: ele acompanha o jogador com atraso e desvia do que
        // estiver mais perto dele. Não é uma IA esperta — é uma presença.
        if (lutando) {
            const querX = THREE.MathUtils.clamp(n.x - 3.2, -ARENA.x, ARENA.x);
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

        if (!lutando) {
            anunciou.current = -1; cuspiu.current = -1; cicloVisto.current = -1;
            F.arma.current.active = false;
            return;
        }

        // ── O RELÓGIO DA BOCA ────────────────────────────────────────────
        f12.relogio += dt;
        f12.bocaT += dt;
        const b = bocaNoInstante(f12.bocaT);
        const ciclo = Math.floor(f12.bocaT / CICLO_DA_BOCA);

        // ── O CURSOR DA ESCALADA NÃO É O RELÓGIO DA BOCA ─────────────────
        //
        // `bocaT` é a FASE da animação, e a virada o zera de propósito para o
        // compasso recomeçar limpo dos dois lados. Enquanto o rodízio saía de
        // `Math.floor(bocaT / CICLO)`, zerar a fase zerava também a escalada:
        // a metade da luta voltava para a abertura 0, `elevadores` (que entra
        // na 8ª e é o único ataque do eixo VERTICAL) NUNCA saía num
        // jogo inteiro, `mare` saía uma vez por metade, e o leque ficava com
        // 8 das 15 aberturas. Pior: a fala da virada anuncia "dois padrões
        // novos" e o que o jogador recebia era o leque de novo.
        //
        // `f12.aberturas` já existia no estado, com o comentário "é o cursor
        // do rodízio", e simplesmente nunca tinha sido ligado. Ele só sobe, e
        // a virada não o toca — que é a diferença entre as duas coisas que
        // `bocaT` estava fazendo ao mesmo tempo.
        const abertura = marcarAbertura(cicloVisto.current, ciclo);
        cicloVisto.current = ciclo;

        if (b.estado === 'abrindo' && anunciou.current !== ciclo) {
            anunciou.current = ciclo;
            const qual = ataqueDaVez(abertura, f12.aberturaDaVirada);
            // O ÍNDICE VAI JUNTO com o texto, e não é enfeite: `GritoDoAtaque`
            // só reaparece quando a string MUDA, então um leque seguido de
            // outro leque (acontece nas aberturas 0 e 1, que é a estreia do
            // jogador na luta) abria em silêncio. Com a abertura na frente, o
            // mesmo ataque duas vezes são duas strings diferentes.
            F.gritoRef.current = `${abertura}|${fichaDoAtaque(qual).grito}`;
            tocarBocaAbrindo(qual);
            F.avisar();
        }

        // ── A BOCA CUSPIU ────────────────────────────────────────────────
        // No PRIMEIRO instante do estado aberto, e uma vez por ciclo.
        if (b.estado === 'aberta' && cuspiu.current !== ciclo) {
            cuspiu.current = ciclo;
            const qual = ataqueDaVez(abertura, f12.aberturaDaVirada);
            f12.ataqueNoAr = qual;
            cuspir(qual, n, faixaDoElevador, faseDaMare);
            tocarAtaque(qual);
        }

        // ── AS ARMAS ─────────────────────────────────────────────────────
        const moving = Math.hypot(n.vx, n.vy) > .12;
        const shots = stepFlightWeapon(F.arma.current, dtDoRelogio, F.touchAtivo.current || F.gatilho.current, moving);
        // Rajada CHEIA avisa na mão e no ouvido: o jogador parado para carregar
        // está olhando os tiros, não o medidor.
        const cheia = F.arma.current.charge >= FLIGHT_WEAPON.chargeLimit - 1e-6;
        if (cheia && !rajadaCheiaAntes) tocarRajadaPronta();
        rajadaCheiaAntes = cheia;
        if (F.arma.current.missile) {
            // ── O DISPARO PRECISA SER UM EVENTO, E NÃO SÓ UM SOM ──────────
            //
            // O prêmio de 100% custa ficar PARADO no meio de uma salva do
            // chefe e vale dez tiros comuns. Ele saía com `tocarExplosao()` e
            // mais nada: a tela não piscava, não sacudia, e o foguete some em
            // dois quadros porque é rápido. Fotografado num quadro logo depois
            // do lançamento, não dava para achar o míssil na imagem. Uma
            // recompensa que o jogador não vê acontecer não é recompensa.
            //
            // O tranco aqui é o do COICE, e por isso é menor que o do impacto
            // (0,25) e muito menor que o de tomar dano (1,0): a ordem entre os
            // três é o que diz ao jogador o que aconteceu sem uma palavra.
            f12.projeteis.push(nascerMissilCarregado(n.x, n.y));
            F.sacode.current = Math.max(F.sacode.current, .14);
            F.clarao.current = 1;
            tocarExplosao();
        }
        for (let i = 0; i < shots; i++) {
            ladoDoTiro.current = ladoDoTiro.current === 1 ? -1 : 1;
            f12.projeteis.push(nascerTiro(n.x, n.y, 'jogador', ladoDoTiro.current));
        }
        if (shots > 0) tocarTiro();
        // O irmão atira sozinho, e só quando há o que acertar: um ala que
        // metralha o céu vazio vira ruído.
        if (ir.recarga <= 0 && (vulneravel(b) || f12.projeteis.some((p) => p.tipo === 'naves'))) {
            ir.recarga = TIRO.cadenciaIrmao;
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
            if (p.tipo === 'tiro') {
                // tiro × camareira
                for (const q of f12.projeteis) {
                    if (q.tipo !== 'naves' || mortos.has(q.id)) continue;
                    if (Math.hypot(p.x - q.x, p.y - q.y) < q.r + p.r && Math.abs(p.z - q.z) < 1.2) {
                        q.hp = (q.hp ?? 1) - (p.carregado ? danoDoTiro(p) : 1);
                        mortos.add(p.id);
                        if ((q.hp ?? 0) <= 0) {
                            mortos.add(q.id); tocarExplosao();
                            // A camareira SUMIA do quadro com um som. O jogador
                            // derruba dezenas delas por luta e nenhuma delas
                            // deixava rastro nenhum na tela.
                            F.estilhacos.current.push({ x: q.x, y: q.y, z: q.z, cor: '#cfd8dc', forca: 1.8 });
                        } else {
                            tocarAcerto();
                            F.estilhacos.current.push({ x: p.x, y: p.y, z: p.z, cor: '#ffd36b', forca: .7 });
                        }
                        break;
                    }
                }
                if (mortos.has(p.id)) continue;
                // tiro × boca
                if (podeFerir && tiroNaBoca(p)) {
                    mortos.add(p.id);
                    const virou = ferir(danoDoTiro(p));
                    F.flash.current = 1;
                    // Acertar a boca pintava a cabeça de branco por um quadro e
                    // mais nada. A faísca nasce NO PONTO do tiro, então ela diz
                    // onde acertou, e não só que acertou.
                    F.estilhacos.current.push({
                        x: p.x, y: p.y, z: p.z,
                        cor: p.carregado ? '#ffd575' : '#9fe8ff',
                        forca: p.carregado ? 2.4 : 1,
                    });
                    if (p.carregado) { F.sacode.current = .25; tocarAcertoCarregado(); } else tocarAcerto();
                    if (virou) abrirAVirada(F);
                    if (f12.vida <= 0) { acabar(F, 'vitoria'); return; }
                    F.avisar();
                }
                continue;
            }
            // ataque × jogador
            if (encostou(p, n.x, n.y, NAVE.raio) && tomarToque(n)) {
                F.sacode.current = 1; F.baque.current = 1; F.baques.current++; tocarDano(); expressao.deboche = 1;
                if (p.tipo !== 'mare') mortos.add(p.id);
                if (n.vidas <= 0) { acabar(F, 'derrota'); return; }
                F.avisar();
            }
            // ataque × irmão (ele perde vidas, mas nunca morre: some e volta)
            if (encostou(p, ir.x, ir.y, NAVE.raio) && tomarToque(ir)) {
                tocarDanoIrmao();   // o dele é outro: o jogador não pode achar que perdeu vida
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
const SEM_ESCOLTA = new Set<NomeDoAtaque>(['teleguiado', 'chuva', 'pinca', 'mare']);

function cuspir(
    qual: NomeDoAtaque, alvo: Nave,
    faixa: React.MutableRefObject<number>, faseMare: React.MutableRefObject<number>,
): void {
    // ── DEPOIS DA VIRADA, ELA ATACA EM DUPLA ─────────────────────────────
    // Todo ataque vem acompanhado de um fio vermelho: é o que faz a segunda
    // metade ser difícil de verdade, e não só a primeira com outra cor.
    if (f12.passouDaVirada && !SEM_ESCOLTA.has(qual)) f12.projeteis.push(nascerTeleguiado());
    // (os de posição exata — goteira, porta, maré — vêm sozinhos: com míssil junto viravam cara ou coroa)
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
            f12.projeteis.push(...nascerElevadores(faixa.current, alvo.y));
            break;
        case 'cruz':
            f12.projeteis.push(...nascerCruz(alvo.x * 0.5, alvo.y));
            break;
        case 'lustre':
            f12.projeteis.push(...nascerLustre(alvo.x, alvo.y));
            break;
        case 'chuva':
            f12.projeteis.push(...nascerChuva(alvo.x, alvo.y));
            break;
        case 'pinca':
            f12.projeteis.push(...nascerPinca());
            break;
    }
}

function abrirAVirada(F: Ferramentas): void {
    f12.passouDaVirada = true;
    // ── A PRÓXIMA ABERTURA, E O `-1` AQUI ERA UM DEFEITO ─────────────────
    //
    // `f12.aberturas` é a CONTAGEM, então a abertura corrente é `aberturas-1`.
    // Só que essa abertura JÁ CUSPIU: a virada acontece quando um tiro derruba
    // a vida abaixo da metade, e nesse instante o ataque dela há muito saiu da
    // boca. Marcando a estreia da maré nela, a estreia caía num índice que o
    // jogador nunca veria — e pior, o rodízio passava a tratar a maré como
    // "recém-usada" e a empurrava para umas quatro aberturas adiante.
    //
    // Medido: com a virada na 6ª, a primeira boca depois dela cuspia LEQUE (o
    // ataque que o jogador já viu uma dúzia de vezes) e a maré só chegava uns
    // 21 segundos de jogo depois — logo após o irmão anunciar "dois padrões
    // novos, um vem do 2º andar". Exatamente a promessa quebrada que o
    // comentário do `ESCALADA` diz ter consertado. O comentário estava certo
    // sobre a intenção e o código errava por um.
    //
    // A estreia é a PRÓXIMA abertura, que é `aberturas` sem subtrair nada.
    f12.aberturaDaVirada = f12.aberturas;
    f12.fase = 'virada';
    F.cinemaClock.current = 0;   // a virada agora TEM relógio
    f12.linhaDoDialogo = 0;
    f12.projeteis = f12.projeteis.filter((p) => p.tipo === 'tiro');
    tocarExplosao(); tocarFalaDoIrmao();
    F.avisar();
}

function acabar(F: Ferramentas, como: 'vitoria' | 'derrota'): void {
    // Os dois desfechos abrem uma CENA, e nenhum dos dois é a fase final.
    // A derrota ia direto para 'derrota' — balão de fala e botão REPETIR, sem
    // um quadro de consequência. 'abatido' é o negativo de 'queda'.
    f12.fase = como === 'vitoria' ? 'queda' : 'abatido';
    F.cinemaClock.current = 0;
    F.touchAtivo.current = false; F.gatilho.current = false;
    F.arma.current.active = false; F.arma.current.flash = 0;
    f12.linhaDoDialogo = 0;
    f12.projeteis = [];
    if (como === 'derrota') { pararMotor(); tocarDerrota(); }
    else tocarMorteDoChefe();
    F.avisar();
}


const DiretorDaVitoria: React.FC<{
    clock: React.MutableRefObject<number>; nave: React.MutableRefObject<Nave>;
    irmao: React.MutableRefObject<Nave>; avisar: () => void;
}> = ({ clock, nave, irmao, avisar }) => {
    const exploded = useRef(false);
    const origin = useRef<{ x: number; y: number; ix: number; iy: number } | null>(null);
    useFrame((_, rawDt) => {
        if (f12.fase !== 'queda') { exploded.current = false; origin.current = null; return; }
        const n = nave.current, ir = irmao.current;
        if (!origin.current) origin.current = { x: n.x, y: n.y, ix: ir.x, iy: ir.y };
        if (typeof document !== 'undefined' && document.hidden) return;
        clock.current = Math.min(F12_CINEMA.victory, clock.current + Math.min(rawDt, .25));
        const t = clock.current, b = victoryBeat(t), o = origin.current;
        if (t >= F12_CINEMA.rupture && !exploded.current) { exploded.current = true; tocarExplosao(); }
        const join = cinemaEase(t / 2.8);
        n.x = THREE.MathUtils.lerp(o.x, 1.6, b.escape);
        n.y = THREE.MathUtils.lerp(o.y, meioY() + .5, b.escape);
        n.alvoX = n.x; n.alvoY = n.y; n.rolagem = Math.sin(b.escape * Math.PI) * -.35;
        ir.x = THREE.MathUtils.lerp(o.ix, n.x - 2.8, join);
        ir.y = THREE.MathUtils.lerp(o.iy, n.y + 1.1, join);
        ir.alvoX = ir.x; ir.alvoY = ir.y; ir.rolagem = Math.sin(b.escape * Math.PI) * -.45;
        n.piscando = 0; ir.piscando = 0;
        if (b.finished) {
            f12.fase = 'vitoria'; f12.linhaDoDialogo = 0;
            tocarVitoria(); tocarFalaDoIrmao(); avisar();
        }
    });
    return null;
};

/**
 * O DIRETOR DA DERROTA — o negativo do `DiretorDaVitoria`.
 *
 * Mesma estrutura de propósito: um relógio, uma origem congelada no instante do
 * golpe, e a coreografia saindo de `defeatBeat`. O avião do jogador roda e cai;
 * o irmão MERGULHA ATRÁS DELE em vez de escoltar, que é o gesto que separa as
 * duas cenas; e a cabeça é quem fecha o plano.
 */
const DiretorDaDerrota: React.FC<{
    clock: React.MutableRefObject<number>; nave: React.MutableRefObject<Nave>;
    irmao: React.MutableRefObject<Nave>; avisar: () => void;
    reentrada: React.MutableRefObject<number>;
}> = ({ clock, nave, irmao, avisar, reentrada }) => {
    const origem = useRef<{ x: number; y: number; ix: number; iy: number } | null>(null);
    useFrame((_, rawDt) => {
        if (f12.fase !== 'abatido') { origem.current = null; return; }
        const n = nave.current, ir = irmao.current;
        if (!origem.current) origem.current = { x: n.x, y: n.y, ix: ir.x, iy: ir.y };
        if (typeof document !== 'undefined' && document.hidden) return;
        clock.current = Math.min(CENA_DA_DERROTA.total, clock.current + Math.min(rawDt, .25));
        const t = clock.current, b = defeatBeat(t), o = origem.current;

        // A ESPIRAL. O avião não "some": ele roda no próprio eixo enquanto
        // desce, e sai por baixo do quadro. `rodopio` é uma só curva, então a
        // queda e o giro são obrigatoriamente a mesma coisa.
        n.x = o.x + Math.sin(b.rodopio * Math.PI * 2.2) * 1.5 * b.rodopio;
        n.y = o.y - b.rodopio * (o.y - ARENA.yBaixo + 7.5);
        n.rolagem = b.rodopio * Math.PI * 3.4;
        n.alvoX = n.x; n.alvoY = n.y; n.piscando = 0;

        // O IRMÃO MERGULHA ATRÁS. Na vitória ele se junta à asa do jogador; aqui
        // ele vai atrás de um avião que está caindo, e não alcança.
        const mergulho = cinemaEase((t - .5) / 2.6);
        ir.x = THREE.MathUtils.lerp(o.ix, n.x - 1.4, mergulho);
        ir.y = THREE.MathUtils.lerp(o.iy, n.y + 2.6, mergulho);
        ir.rolagem = mergulho * .7; ir.alvoX = ir.x; ir.alvoY = ir.y; ir.piscando = 0;

        if (b.finished) {
            // O card NASCE no preto em que a cena terminou. Sem isto o preto
            // morre junto com a fase e o corte volta a ser seco.
            reentrada.current = 1;
            f12.fase = 'derrota'; f12.linhaDoDialogo = 0; avisar();
        }
    });
    return null;
};

/** As três batidas da derrota, escritas. */
/** Só adianta o relógio da virada: quem encerra a cena é o jogador. */
const DiretorDaVirada: React.FC<{ clock: React.MutableRefObject<number> }> = ({ clock }) => {
    useFrame((_, rawDt) => {
        if (f12.fase !== 'virada') return;
        if (typeof document !== 'undefined' && document.hidden) return;
        clock.current = Math.min(CENA_DA_VIRADA.entrada + 2, clock.current + Math.min(rawDt, .25));
    });
    return null;
};

const LegendaDaDerrota: React.FC<{ clock: React.MutableRefObject<number> }> = ({ clock }) => {
    const [beat, setBeat] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() =>
            setBeat(clock.current < 1.6 ? 0 : clock.current < CENA_DA_DERROTA.engolir ? 1 : 2), 100);
        return () => window.clearInterval(id);
    }, [clock]);
    return <div data-testid="f12-defeat-caption" style={{ flex: '0 0 auto', background: '#2d1218',
        color: '#ffc0b0', padding: '10px 12px calc(env(safe-area-inset-bottom) + 10px)',
        textAlign: 'center', font: '600 clamp(12px, 2.5vh, 16px) monospace' }}>
        {['TROCO-63: NÃO — teu motor! Puxa, puxa!',
          'TROCO-63: Eu não alcanço. Eu não alcanço!',
          'TROCO-63: …não olha pra cima. Por favor não olha pra cima.'][beat]}
    </div>;
};

const LegendaDaVitoria: React.FC<{ clock: React.MutableRefObject<number> }> = ({ clock }) => {
    const [beat, setBeat] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => setBeat(clock.current < 3.2 ? 0 : clock.current < 7 ? 1 : 2), 100);
        return () => window.clearInterval(id);
    }, [clock]);
    return <div data-testid="f12-victory-caption" style={{ flex: '0 0 auto', background: '#10242d',
        color: '#ffe0a0', padding: '10px 12px calc(env(safe-area-inset-bottom) + 10px)',
        textAlign: 'center', font: '600 clamp(12px, 2.5vh, 16px) monospace' }}>
        {['TROCO-63: Ih. Esse barulho não é de vitória. Afasta!',
          'TROCO-63: Agora sim. Sem cabeça… e sem reembolso.',
          'TROCO-63: Cola na minha asa. Vou tirar você daqui.'][beat]}
    </div>;
};

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
    const teclasPressionadas = useRef(new Set<string>());
    const touchAtivo = useRef(false);
    const gatilho = useRef(false);
    const arma = useRef(newFlightWeapon());
    const cinemaClock = useRef(0);
    const flash = useRef(0);
    const sacode = useRef(0);
    const clarao = useRef(0);
    const baque = useRef(0);
    const baques = useRef(0);
    const cardJaPassou = useRef(false);
    const reentrada = useRef(0);
    const estilhacos = useRef<PedidoDeEstilhaco[]>([]);
    const gritoRef = useRef('');
    const porta = useRef(0);
    const abertura = useRef(0);
    const sumindo = useRef(0);
    const cam = useRef(0);
    const introProgress = useRef(0);
    const [legendaIntro, setLegendaIntro] = useState('ANDAR 12');
    const introAtiva = useRef(true);
    const helice = useRef(1);
    const falando = useRef(false);
    const visivel = useRef(false);

    useEffect(() => {
        f12AoMudar(avisar);
        f12Reset();
        nave.current = novaNave(0, meioY());
        irmao.current = novaNave(-4, meioY() + 1.2, 3);
        return () => { f12AoMudar(null); pararMotor(); };
    }, [avisar]);

    // Durante a introdução o avião só aparece quando a câmera já saiu de dentro
    // do hóspede — antes disso o jogador estaria vendo o próprio cockpit por
    // dentro E por fora ao mesmo tempo.
    useEffect(() => { visivel.current = false; }, []);
    useEffect(() => {
        const id = window.setInterval(() => {
            if (!introAtiva.current) return;
            const p = introProgress.current;
            if (prologo.ativo) {
                const t = prologo.t;
                setLegendaIntro(t < 2.3 ? 'FIM DO EXPEDIENTE.' : t < 3.4 ? 'ANDAR 11… 12.'
                    : t < 4.5 ? 'DING.' : t < 5.0 ? 'AS PORTAS SE ABREM…' : 'NÃO HÁ CHÃO.');
                return;
            }
            setLegendaIntro(p < .52 ? 'O ELEVADOR SE DESDOBRA…' : p < .70 ? 'MOTORES ACESOS.'
                : p < .86 ? 'TROCO-63, NA SUA ALA.' : 'PRÓXIMA PARADA: O IMPOSSÍVEL.');
        }, 120);
        return () => window.clearInterval(id);
    }, []);

    const fase = f12.fase;
    // Celular começa sem a oclusão em tempo real: era o que travava o aparelho
    // (o monitor de desempenho a liga de volta se sobrar fôlego).
    const [aoLigado, setAoLigado] = useState(() => !(typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches));
    // Resolução até 1,5× e SMAA: sem isso cada chanfro e borda de oclusão
    // serrilhava na tela de celular. Cai para 1× se o aparelho sofrer.
    const [qualidade, setQualidade] = useState(true);
    // ── A TRILHA SEGUE A FASE ────────────────────────────────────────────
    // Luta e virada têm música; a virada ruge e a marcha endurece dali em
    // diante; vitória e derrota calam a marcha para os próprios sons tocarem.
    const rugiu = useRef(false);
    useEffect(() => {
        if (fase === 'luta' || fase === 'virada') iniciarMusica();
        // Na queda e no abate a música CORTA (0,15 s): o golpe final soa sozinho.
        else if (fase === 'queda' || fase === 'abatido') pararMusica(0.15);
        else if (fase === 'vitoria' || fase === 'derrota' || fase === 'despedida') pararMusica();
        if (fase === 'virada' && !rugiu.current) { rugiu.current = true; tocarRugido(); }
        if (fase === 'derrota') rugiu.current = false;
        musicaDaVirada(f12.passouDaVirada);
    }, [fase]);
    useEffect(() => () => pararMusica(0.2), []);
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
        const w = window as unknown as Record<string, unknown>;
        w.__f12fase = fase; w.__f12abertura = abertura.current;
        // A bancada precisa contar PROJÉTEIS. "Não vi bala nenhuma na foto" é
        // uma frase sobre a foto, não sobre o jogo — e este andar já me fez
        // consertar coisa que não estava quebrada por causa disso.
        w.__f12estado = {
            get fase() { return f12.fase; }, get vida() { return f12.vida; },
            get projeteis() { return f12.projeteis; }, get nave() { return nave.current; },
            get arma() { return arma.current; },
            get cinema() { return cinemaClock.current; },
            get intro() { return introProgress.current; },
        };
    }
    const roteiro = roteiroDaFase(fase);
    const linha = roteiro[Math.min(f12.linhaDoDialogo, roteiro.length - 1)] ?? null;
    const ultimaLinha = f12.linhaDoDialogo >= roteiro.length - 1;
    falando.current = linha?.quem === 'irmao';

    const avancarFala = useCallback(() => {
        const r = roteiroDaFase(f12.fase);
        if (f12.linhaDoDialogo < r.length - 1) {
            f12.linhaDoDialogo += 1; tocarFalaDoIrmao(); f12Bump(); return;
        }
        // Fim do bloco de fala: para onde ele leva.
        if (f12.fase === 'encontro' || f12.fase === 'virada') {
            f12.fase = 'luta';
            f12.bocaT = 0;                 // o compasso recomeça limpo dos dois lados
            tocarMotor();
            // Só para a bancada de fotos: `?f12fase=2` pula direto para depois
            // da virada, no estado VIVO (um import externo pega outra cópia).
            if (import.meta.env.DEV && typeof location !== 'undefined'
                && new URLSearchParams(location.search).get('f12fase') === '2') {
                f12.passouDaVirada = true; f12.vida = Math.min(f12.vida, LIMIAR_DA_VIRADA - 1);
            }
        } else if (f12.fase === 'derrota') {
            // Recomeça a luta, mas mantendo o que a cabeça já perdeu seria
            // cruel do avesso: ela volta inteira e o jogador também.
            f12Reset();
            cardJaPassou.current = false;   // o chefe é reapresentado no REPETIR
            arma.current = newFlightWeapon();
            touchAtivo.current = false; gatilho.current = false;
            nave.current = novaNave(0, meioY());
            irmao.current = novaNave(-4, meioY() + 1.2, 3);
            f12.fase = 'luta'; f12.bocaT = 0;
            abertura.current = 1; cam.current = 1; sumindo.current = 1; visivel.current = true;
            // ── UMA REENTRADA, EM VEZ DE UM CORTE ────────────────────────
            // O card de derrota termina no preto e a luta recomeçava com um
            // corte seco para o plano de perseguição: o jogador que acabou de
            // ser engolido era largado no ar, já voando, sem um quadro de
            // transição. Abrir do preto é o mínimo, e custa 0,8 s.
            reentrada.current = 1;
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
    // acompanha o contato: soltar o dedo corta o tiro, parar acumula a rajada.
    //
    // A conversão de pixel para mundo sai do enquadramento: a largura do quadro
    // no plano do avião dividida pela largura da tela. Sem isso o arrasto teria
    // um "ganho" arbitrário que mudaria de celular para celular.
    const arrasto = useRef<{ id: number; x: number; y: number } | null>(null);
    // O anel do dedo: mostra onde o toque está ancorado (o arrasto é relativo).
    const anelDoDedo = useRef<HTMLDivElement>(null);
    const moverAnel = (x: number, y: number, ligado: boolean) => {
        const el = anelDoDedo.current; if (!el) return;
        el.style.opacity = ligado ? '1' : '0';
        el.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
    };

    const pixelParaMundo = useCallback(() => {
        // O fov é o da CÂMERA DE VERDADE (fecha em paisagem): com o de retrato
        // o dedo e a nave desencontravam quando o celular deitava.
        const meiaV = Math.tan((f12ChaseFov(window.innerWidth / Math.max(1, window.innerHeight)) * Math.PI) / 180 / 2);
        // R3F updates the perspective camera with the live viewport aspect;
        // using the portrait authoring constant here made drag sensitivity wrong
        // as soon as the player rotated the device or played on desktop.
        const larguraDaTela = Math.max(1, window.innerWidth);
        const alturaDaTela = Math.max(1, window.innerHeight);
        const aspectoViewport = larguraDaTela / alturaDaTela;
        const larguraDoMundo = 2 * f12ChaseDistance(aspectoViewport) * meiaV * aspectoViewport;
        return larguraDoMundo / larguraDaTela;
    }, []);

    const arrastoHandlers = {
        onPointerDown: (e: React.PointerEvent) => {
            if (f12.fase !== 'luta' || arrasto.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
            e.preventDefault();
            touchAtivo.current = true;
            arrasto.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
            moverAnel(e.clientX, e.clientY, true);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e: React.PointerEvent) => {
            const a = arrasto.current;
            if (!a || a.id !== e.pointerId || f12.fase !== 'luta') return;
            // ── ZONA MORTA DE 3 px ─────────────────────────────────────────
            // Um polegar PARADO treme um ou dois pixels, e cada tremida contava
            // como voo: a rajada, que carrega com o avião parado, nunca enchia.
            // O movimento pequeno não é perdido — ele acumula (a âncora só anda
            // quando o passo é aplicado), então o 1:1 continua valendo.
            const dx = e.clientX - a.x, dy = e.clientY - a.y;
            if (Math.hypot(dx, dy) < 3) return;
            const k = pixelParaMundo();
            // Y da tela cresce para baixo; o do mundo, para cima.
            arrastarNave(nave.current, dx * k, -dy * k);
            a.x = e.clientX; a.y = e.clientY;
            moverAnel(e.clientX, e.clientY, true);
        },
        onPointerUp: (e: React.PointerEvent) => {
            if (arrasto.current?.id !== e.pointerId) return;
            touchAtivo.current = false; arrasto.current = null; moverAnel(0, 0, false);
        },
        onPointerCancel: (e: React.PointerEvent) => {
            if (arrasto.current?.id !== e.pointerId) return;
            touchAtivo.current = false; arrasto.current = null; moverAnel(0, 0, false);
        },
        onLostPointerCapture: (e: React.PointerEvent) => {
            if (arrasto.current?.id !== e.pointerId) return;
            touchAtivo.current = false; arrasto.current = null; moverAnel(0, 0, false);
        },
    };

    useEffect(() => {
        if (fase !== 'luta') { touchAtivo.current = false; gatilho.current = false; arrasto.current = null; entrada.current = {x: 0, y: 0}; teclasPressionadas.current.clear(); }
    }, [fase]);
    useEffect(() => {
        const clear = () => { touchAtivo.current = false; gatilho.current = false; arrasto.current = null; entrada.current = {x: 0, y: 0}; };
        const hidden = () => { if (document.hidden) clear(); };
        window.addEventListener('blur', clear);
        document.addEventListener('visibilitychange', hidden);
        return () => { clear(); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden); };
    }, []);

    // teclado, para quem joga no computador
    useEffect(() => {
        const teclas = teclasPressionadas.current;
        const aplicar = () => {
            const x = (teclas.has('d') || teclas.has('arrowright') ? 1 : 0) - (teclas.has('a') || teclas.has('arrowleft') ? 1 : 0);
            const y = (teclas.has('w') || teclas.has('arrowup') ? 1 : 0) - (teclas.has('s') || teclas.has('arrowdown') ? 1 : 0);
            entrada.current.x = x; entrada.current.y = y;
            gatilho.current = teclas.has(' ') || teclas.has('j');
        };
        const baixo = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if ([' ', 'w', 'a', 's', 'd', 'j', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
            if (f12.fase !== 'luta' || (e.repeat && !teclas.has(k))) return;
            teclas.add(k); aplicar();
        };
        const cima = (e: KeyboardEvent) => { teclas.delete(e.key.toLowerCase()); aplicar(); };
        const limparTeclas = () => { teclas.clear(); aplicar(); };
        window.addEventListener('blur', limparTeclas);
        window.addEventListener('keydown', baixo);
        window.addEventListener('keyup', cima);
        return () => { window.removeEventListener('blur', limparTeclas); window.removeEventListener('keydown', baixo); window.removeEventListener('keyup', cima); };
    }, []);

    // A dica é aula de primeira vez: uma por sessão, não a cada fase de luta.
    const mostrarControles = fase === 'luta';
    // A dica tem flag PRÓPRIA. Ela chegou a reusar `mostrarControles`, que
    // também monta a superfície de arrasto: quando a dica sumia, o toque sumia
    // junto e a nave parava de obedecer ao dedo.
    const mostrarDica = mostrarControles && !dicaJaDada.valor;
    const vidaFrac = Math.max(0, f12.vida / VIDA_MAXIMA);
    const baixa = typeof window !== 'undefined' && window.innerHeight < 520;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#0d2029', touchAction: 'none', display: 'flex', flexDirection: 'column' }}>
        <Canvas
                style={{ flex: '1 1 0', height: 0, minHeight: 0, width: '100%' }}
                dpr={qualidade ? [1, 1.25] : 1}
                camera={{ fov: ENQUADRAMENTO.fov, near: 0.1, far: 320, position: [0, meioY() + 0.35, 0.55] }}
                gl={{ antialias: true }}
                onCreated={({ gl, scene, camera }) => {
                    gl.domElement.style.imageRendering = 'auto';
                    scene.background = new THREE.Color('#7ec0ef');
                    // A névoa começa DEPOIS da cabeça (a 47 da câmera): com ela em 40 o
                    // chefe entrava no nevoeiro e perdia o contraste.
                    scene.fog = new THREE.Fog('#7ec0ef', 58, 270);
                    // DEV: a bancada precisa MEDIR o enquadramento. Sem isto, o
                    // tamanho do avião e da cabeça na tela é opinião — e opinião
                    // sobre enquadramento já custou caro neste repositório.
                    if (import.meta.env?.DEV && typeof window !== 'undefined') {
                        const w = window as unknown as Record<string, unknown>;
                        w.__f12cam = camera; w.__f12cena = scene; w.__THREE = THREE;
                        // O RENDERER também: `info.render.calls` é a única
                        // medida honesta de custo de cena. Contar malhas visíveis
                        // engana, porque o culling derruba boa parte delas antes
                        // de virarem chamada — e foi contando malha que eu quase
                        // saí otimizando a coisa errada.
                        w.__f12gl = gl;
                    }
                }}
            >
                <Floor12Ceu />
                <Floor12Cabeca flashRef={flash} naveRef={nave} cinemaClock={cinemaClock} />
                <Floor12CinemaEffects active={fase === 'queda'} clock={cinemaClock}
                    position={[0, BOCA_ALVO.y, ARENA.zCabeca + 8.6]} />
                <DiretorDaVitoria clock={cinemaClock} nave={nave} irmao={irmao} avisar={avisar} />
                <DiretorDaDerrota clock={cinemaClock} nave={nave} irmao={irmao} avisar={avisar} reentrada={reentrada} />
                <DiretorDaVirada clock={cinemaClock} />
                <AnelDaBoca />
                <Floor12Projeteis />
                {fase === 'luta' && <><Mira naveRef={nave} />
                <Floor12FlightFeedback nave={nave} arma={arma} /></>}
                <CabineDeDentro portaRef={porta} sumindoRef={sumindo} />
                <AviaoDoJogador naveRef={nave} aberturaRef={abertura} heliceRef={helice} visivelRef={visivel} />
                <AviaoDoIrmao naveRef={irmao} falandoRef={falando} introRef={introProgress} />
                <Floor12Prologo tempo={tempoDoPrologo} />
                <DiretorDaIntro portaRef={porta} aberturaRef={abertura} sumindoRef={sumindo}
                    camRef={cam} introProgressRef={introProgress} introAtivaRef={introAtiva}
                    avisar={() => { visivel.current = true; avisar(); }} />
                <CameraDaLuta irmaoRef={irmao} naveRef={nave} camRef={cam} introProgressRef={introProgress}
                    introAtivaRef={introAtiva} sacodeRef={sacode} cinemaClock={cinemaClock} />
                <DiretorDaLuta touchAtivo={touchAtivo} gatilho={gatilho} arma={arma} nave={nave} irmao={irmao} entrada={entrada}
                    flash={flash} sacode={sacode} clarao={clarao} baque={baque} baques={baques} estilhacos={estilhacos} gritoRef={gritoRef} avisar={avisar} cinemaClock={cinemaClock} />
                {/* o clarão do disparo do míssil: dourado, para a frente */}
                <Floor12Estilhacos fila={estilhacos} />
                <Estouro vida={clarao} nave={nave} cor="#ffd98a" />
                {/* ── O BAQUE ──
                    Levar dano era `sacode` mais um pisca-pisca de visibilidade
                    no avião, e mais nada: nenhuma faísca, nenhuma fumaça, nada
                    na borda da tela. Num jogo todo em azul-escuro, o único
                    elemento saturado era o brilho da boca — ou seja NADA
                    estourava no contato, nos dois sentidos. Este é laranja,
                    maior, mais lento, e nasce EM CIMA do avião. */}
                <Estouro vida={baque} nave={nave} cor="#ff8a3c" raio={.85} cresce={3.2} dz={.2} velocidade={2.4} />
                <RevelarAviao camRef={cam} visivelRef={visivel} />

                {/* ── O BLOOM, E POR QUE ELE SÓ PODIA VIR AGORA ────────────
                    O andar monta o próprio `Canvas` e nunca teve composer, ou
                    seja zero pós-processamento. Sem ele, a boca acesa, as
                    brasas das feridas, o míssil dourado e o clarão do disparo
                    renderizavam como POLÍGONOS CHAPADOS: a cor era de luz, o
                    pixel não era.

                    A ordem importou. Ligar bloom ENQUANTO as janelas dos
                    prédios eram o objeto mais saturado da tela teria feito o
                    CENÁRIO brilhar e engolir a ameaça — pioraria exatamente o
                    que eu queria consertar. Com a faixa quente já reservada
                    para o que machuca e as janelas rebaixadas, o bloom passa a
                    iluminar só o que é perigoso ou é prêmio.

                    `luminanceThreshold` alto de propósito: ele não é um filtro
                    de charme por cima de tudo, é um holofote no que EMITE.
                    `multisampling={0}` e uma passada só, porque isto roda em
                    celular. */}
                {/* Guarda de desempenho: abaixo de ~45 fps sustentados a oclusão
                    em tempo real se desliga (é o efeito mais caro da cena). */}
                <PerformanceMonitor flipflops={3} onFallback={() => { setAoLigado(false); setQualidade(false); }}
                    onDecline={() => { if (aoLigado) setAoLigado(false); else setQualidade(false); }}
                    onIncline={() => { if (!qualidade) setQualidade(true); else setAoLigado(true); }} />
                <EffectComposer multisampling={0} enableNormalPass={false}>
                    {/* ── OCLUSÃO EM TEMPO REAL (N8AO) ──────────────────────
                        Raios traçados no buffer de profundidade a cada quadro:
                        sombra de contato em toda dobra da cena — entre os gomos
                        das nuvens, sob as sacadas, no encaixe do quepe, entre os
                        dentes. É o que tira o ar de "caixas chapadas" do low
                        poly. Meia resolução e qualidade de desempenho: celular. */}
                    {/* Mais leve (era 2,4 e quase preto): forte demais, virava as
                        nuvens em pedra de barro. E some sozinho em celular fraco. */}
                    {aoLigado && <N8AO halfRes quality="performance" aoRadius={1.2} distanceFalloff={1.2} intensity={1.3} color="#3a2a36" />}
                    <SMAA />
                    <Bloom
                        intensity={0.85}
                        luminanceThreshold={0.62}
                        luminanceSmoothing={0.22}
                        mipmapBlur
                    />
                </EffectComposer>
            </Canvas>

            {/* ── HUD ── */}
            {(fase === 'luta' || fase === 'virada') && (
                <>
                    {/* a vida da cabeça.
                        ── ELA FICA DE PÉ NA VIRADA, E ISSO É O PONTO ──
                        O HUD inteiro estava preso a `fase === 'luta'`, então no
                        instante em que a barra cruza a metade e muda de verde
                        para vermelho, ela SOME — justamente o readout de que a
                        cena trata. O jogador lia "a cabeça mudou" num balão sem
                        poder ver a barra que mudou. */}
                    {/* EM PAISAGEM ela vira um fio no topo: o quadro é baixo e a
                        barra cheia deitava em cima do quepe, a silhueta que mais
                        diz quem é o chefe. */}
                    <div style={{ position: 'absolute', top: baixa ? 'calc(env(safe-area-inset-top) + 4px)' : 'calc(env(safe-area-inset-top) + 14px)', left: baixa ? '22%' : '8%', right: baixa ? '22%' : '8%', zIndex: 3, pointerEvents: 'none' }}>
                        <div style={{ ...t64, fontSize: baixa ? 9 : 12, marginBottom: baixa ? 1 : 3, textAlign: 'center' }}>A CABEÇA</div>
                        <div style={{ position: 'relative', height: baixa ? 11 : 16, background: 'rgba(0,0,0,0.5)', border: `${baixa ? 1 : 3}px solid #11131a`, borderRadius: 9, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,236,200,.45)' }}>
                            {/* marca da virada, na metade */}
                            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(255,240,210,.8)', zIndex: 1 }} />
                            <div style={{
                                width: `${vidaFrac * 100}%`, height: '100%',
                                background: f12.passouDaVirada
                                    ? 'linear-gradient(180deg,#ffb35a,#ff5a3a)'
                                    : 'linear-gradient(180deg,#9dff6b,#3f9638)',
                                transition: 'width 0.15s linear',
                            }} />
                        </div>
                    </div>
                    {/* as vidas do jogador */}
                    <div style={{ ...t64, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 62px)', left: 14, fontSize: 20, zIndex: 3, pointerEvents: 'none' }}>
                        {'✈'.repeat(Math.max(0, nave.current.vidas))}
                        <span style={{ opacity: 0.25 }}>{'✈'.repeat(Math.max(0, VIDAS_DO_JOGADOR - nave.current.vidas))}</span>
                    </div>
                    {/* o grito do ataque: o telegrafo escrito */}
                    <GritoDoAtaque gritoRef={gritoRef} />
                    <AvisoDeJanela />
                </>
            )}

            {/* ── balão de fala ── */}
            {linha && (
                <div data-testid="f12-dialogue" style={{ position: 'relative', flex: '0 0 auto', maxHeight: '42%', overflowY: 'auto', boxSizing: 'border-box', zIndex: 4, padding: '8px 12px calc(env(safe-area-inset-bottom) + 10px)' }}>
                    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr auto', gap: '5px 12px', alignItems: 'center', background: '#142b34', border: '1px solid #597278', borderRadius: 12, padding: '10px 14px' }}>
                        <div style={{ ...t64, gridColumn: 1, fontSize: 12, color: linha.quem === 'jogador' ? '#8cceff' : '#ffd78b', textShadow: 'none' }}>
                            {linha.quem === 'jogador' ? '▶ VOCÊ' : '● TROCO-63'}
                        </div>
                        <div style={{ gridColumn: 1, fontFamily: 'monospace', fontWeight: 600, fontSize: 'clamp(13px, 2.7vh, 17px)', lineHeight: 1.35, color: '#f1ecdc' }}>{linha.texto}</div>
                        <button style={{ ...btn64, gridColumn: 2, gridRow: '1 / 3', fontSize: 13, padding: '10px 14px', minWidth: 46, background: ultimaLinha ? '#3d805b' : '#36545f' }}
                            onPointerDown={(e) => { e.stopPropagation(); avancarFala(); }}>
                            {!ultimaLinha ? '▶' : fase === 'encontro' ? 'VOAR ✈' : fase === 'derrota' ? 'REPETIR' : fase === 'despedida' ? 'SUBIR ⬆' : 'CONTINUAR'}
                        </button>
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
            {mostrarControles && <div ref={anelDoDedo} style={{
                position: 'absolute', left: 0, top: 0, width: 44, height: 44, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,.45)', pointerEvents: 'none', zIndex: 2,
                opacity: 0, transition: 'opacity .15s',
            }} />}
            {mostrarDica && <DicaDeControle />}
            {mostrarControles && <Floor12ChargeMeter arma={arma} />}

            {/* a legenda da introdução: sem ela o jogador não sabe que o
                elevador está virando avião, ele só vê o metal se mexendo */}
            {fase === 'queda' && <LegendaDaVitoria clock={cinemaClock} />}
            {/* SÓ NA ABERTURA DA LUTA. O componente desmonta quando a fase sai
                de 'luta' (a virada faz isso), e remontar tocaria o card de novo
                — o anúncio do chefe viraria um anúncio a cada retomada. O ref
                lembra que ele já passou, e o REPETIR o zera. */}
            {fase === 'luta' && !cardJaPassou.current && (
                <CardDoChefe aoTerminar={() => { cardJaPassou.current = true; }} />
            )}
            {fase === 'luta' && <BordaSangrando baques={baques} />}
            {(fase === 'luta' || fase === 'derrota') && <Reentrada reentrada={reentrada} />}
            {fase === 'abatido' && <LegendaDaDerrota clock={cinemaClock} />}
            {fase === 'abatido' && <FechamentoDaDerrota clock={cinemaClock} />}
            {(fase === 'intro' || fase === 'virando') && (
                <div data-testid="f12-intro-caption" style={{ ...t64, position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4, padding: '26px 12px calc(env(safe-area-inset-bottom) + 12px)', background: 'linear-gradient(0deg, rgba(8,16,22,.72), rgba(8,16,22,0))', textAlign: 'center', fontSize: 'clamp(15px, 2.8vh, 19px)', pointerEvents: 'none' }}>
                    {legendaIntro}
                    <div style={{ fontSize: '0.75em', opacity: .85, marginTop: 4 }}>toque para pular</div>
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
        const alinhado = Math.hypot(n.x - BOCA_ALVO.x, n.y - BOCA_ALVO.y) < BOCA_ALVO.raio;
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.set(alinhado ? '#b6ff4a' : '#ffffff');
        // Fio fino: forte demais, ele cortava a cara ao meio e escondia o aviso.
        mat.opacity = alinhado ? 0.3 : 0;
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
const dicaJaDada = { valor: false };
const DicaDeControle: React.FC = () => {
    const [visivel, setVisivel] = useState(true);
    // Uma tela BAIXA é uma tela deitada. Medir a altura em vez de perguntar a
    // orientação ao sistema evita o caso do tablet largo e alto, onde sobra
    // espaço embaixo e a legenda pode ficar onde sempre esteve.
    const [paisagem, setPaisagem] = useState(
        typeof window !== 'undefined' && window.innerHeight < 520);
    useEffect(() => {
        const medir = () => setPaisagem(window.innerHeight < 520);
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, []);
    useEffect(() => {
        // Deitada, ela cobre a testa do chefe: dura menos.
        const id = window.setTimeout(() => setVisivel(false), window.innerHeight < 520 ? 2500 : 6000);
        // Quem já arrastou já aprendeu: o aviso sai no primeiro toque em vez
        // de ficar deitado em cima da cabeça na tela deitada.
        const aprendeu = () => setVisivel(false);
        window.addEventListener('pointerdown', aprendeu, { once: true });
        return () => { window.clearTimeout(id); window.removeEventListener('pointerdown', aprendeu); };
    }, []);
    if (!visivel) { dicaJaDada.valor = true; return null; }
    // ── EM PAISAGEM ELA VAI PARA O TOPO ──────────────────────────────────
    //
    // Rente ao fundo ela funciona em retrato, onde sobra céu embaixo do avião.
    // Em 844x390 não sobra: o avião já fica colado na borda de baixo, e a
    // legenda caía EM CIMA dele. O tutorial tapava exatamente a coisa que ele
    // estava ensinando a pilotar — o mesmo defeito que já tinha sido consertado
    // em retrato, reaparecendo na orientação que ninguém conferiu.
    //
    // No topo, em paisagem, ela divide a faixa com a barra de vida do chefe,
    // que é céu vazio nessa orientação.
    const deitado = paisagem;
    return (
        <div style={{
            ...t64, position: 'absolute',
            ...(deitado
                // 40 px punha a legenda EM CIMA da barra de vida do chefe —
                // fotografado, as duas se sobrepunham. Tirar o texto do avião
                // para jogá-lo no readout não é conserto, é troca de oclusão.
                // 62 px é logo ABAIXO do rótulo mais da barra.
                ? { top: 'calc(env(safe-area-inset-top) + 62px)' }
                : { bottom: 'calc(env(safe-area-inset-bottom) + 8px)' }),
            left: 0, right: 0, textAlign: 'center', fontSize: deitado ? 12 : 13,
            zIndex: 3, pointerEvents: 'none', opacity: 0.92,
        }}>
            {/* UMA linha, e rente à borda. Duas linhas a 30 px do fundo caíam em
                cima do avião do jogador — o tutorial tapava a coisa que ele
                estava aprendendo a pilotar. */}
            ARRASTE PARA VOAR E ATIRAR · PARAR CARREGA A RAJADA
        </div>
    );
};

/**
 * O CLARÃO DO LANÇAMENTO.
 *
 * Uma bola de luz que nasce na frente do avião no quadro do disparo e morre em
 * pouco mais de um quarto de segundo, crescendo enquanto apaga. É o que dá ao
 * míssil um INSTANTE — sem ele o foguete atravessa a arena em dois quadros e o
 * jogador só ouve um estouro sem origem.
 *
 * Desenhado com `depthWrite` desligado e material básico: ele é LUZ, e luz não
 * recorta o que está atrás dela.
 */
const Estouro: React.FC<{
    vida: React.MutableRefObject<number>;
    nave: React.MutableRefObject<Nave>;
    cor: string;
    raio?: number;
    cresce?: number;
    dz?: number;
    velocidade?: number;
}> = ({ vida, nave, cor, raio = .6, cresce = 2.4, dz = -1.4, velocidade = 3.6 }) => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((_, rawDt) => {
        const m = ref.current;
        if (!m) return;
        vida.current = Math.max(0, vida.current - Math.min(rawDt, .05) * velocidade);
        const c = vida.current;
        m.visible = c > 0.02;
        if (!m.visible) return;
        const n = nave.current;
        m.position.set(n.x, n.y, ARENA.zNave + dz);
        // cresce enquanto apaga: é assim que estouro lê como estouro, e não
        // como uma bola que encolhe
        m.scale.setScalar(0.5 + (1 - c) * cresce);
        (m.material as THREE.MeshBasicMaterial).opacity = c * c;
    });
    return (
        <mesh ref={ref} visible={false}>
            <sphereGeometry args={[raio, 12, 8]} />
            <meshBasicMaterial color={cor} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
    );
};

/**
 * O FECHAMENTO DA DERROTA — o beat que era calculado e jogado fora.
 *
 * `defeatBeat` devolve `preto` desde que a cena foi escrita, e o bloco de
 * documentação dela diz "preto — fecha, e só então entra a fala". Só que nada
 * no andar lia esse valor: um `grep` por `preto` achava o comentário e a conta,
 * e nenhum consumidor. Na prática a cena cortava SECO do plano da cabeça
 * engolindo para o card de repetir, com o céu ainda aceso.
 *
 * É o mesmo tipo de defeito que a virada e a estreia da maré já tinham: a prosa
 * descrevia um conserto que o código não entregava. Escrever o beat não é
 * encená-lo.
 *
 * Fica por cima de tudo (`zIndex` acima do canvas e do HUD) porque é um
 * fechamento de cena, e some sozinho quando a fase sai de 'abatido'.
 */
const FechamentoDaDerrota: React.FC<{ clock: React.MutableRefObject<number> }> = ({ clock }) => {
    const [op, setOp] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => setOp(defeatBeat(clock.current).preto), 40);
        return () => window.clearInterval(id);
    }, [clock]);
    if (op <= 0.01) return null;
    return <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
        background: '#000', opacity: op,
    }} />;
};

/**
 * ── O CARD DO CHEFE ──────────────────────────────────────────────────────────
 *
 * Furi, Cuphead e Titan Souls carimbam o nome do chefe na tela quando a luta
 * começa. Não é enfeite: é o gesto que separa "inimigo" de "CHEFE", e é o que
 * diz ao jogador que a partir daqui a regra do jogo é outra. O andar 12 tinha
 * catorze segundos de revelação cinematográfica e entrava na luta sem anunciar
 * nada.
 *
 * ── E ELE NÃO PODE TER UM NOME, POR CAUSA DO ROTEIRO ─────────────────────────
 *
 * O TROCO-63 diz, três falas antes: "Vê aquela cara? NÃO PERGUNTA DE QUEM É."
 * Inventar um nome próprio aqui contradiria a única coisa que o roteiro faz
 * questão de esconder. Então o card usa o anonimato em vez de furá-lo: carimba
 * o que o HUD já chama, e a legenda paga a fala que o jogador acabou de ouvir.
 * A convenção do gênero é cumprida sem mentir sobre a ficção.
 *
 * Fica no TERÇO INFERIOR, nunca no meio: o meio é da boca, e a boca é o relógio
 * da luta.
 */
const CardDoChefe: React.FC<{ aoTerminar: () => void }> = ({ aoTerminar }) => {
    const [t, setT] = useState(0);
    useEffect(() => {
        const inicio = performance.now();
        const id = window.setInterval(() => setT((performance.now() - inicio) / 1000), 50);
        return () => window.clearInterval(id);
    }, []);
    const DURACAO = 2.6;
    if (t > DURACAO) { aoTerminar(); return null; }
    const entrada = Math.min(1, t / .32);
    const saida = Math.min(1, Math.max(0, (DURACAO - t) / .45));
    const op = entrada * saida;
    return (
        <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, bottom: '21%',
            textAlign: 'center', zIndex: 4, pointerEvents: 'none', opacity: op,
        }}>
            <div style={{
                ...t64, fontSize: 'clamp(26px, 7vw, 46px)', color: '#ffe9b0',
                letterSpacing: 6, transform: `translateY(${(1 - entrada) * 14}px)`,
            }}>A CABEÇA</div>
            <div style={{
                height: 2, width: `${op * 62}%`, margin: '7px auto',
                background: 'linear-gradient(90deg, transparent, #d8a44a, transparent)',
            }} />
            <div style={{
                ...t64, fontSize: 'clamp(10px, 2.6vw, 14px)', color: '#c8b48a',
                letterSpacing: 3, fontWeight: 700,
            }}>12º ANDAR · NÃO PERGUNTE DE QUEM É</div>
        </div>
    );
};

/**
 * Abre do preto. Serve os DOIS cortes: a entrada do card de derrota e o
 * recomeço da luta depois dele.
 *
 * O fecho em preto do `abatido` sozinho não resolvia nada, e a foto mostrou por
 * quê: `FechamentoDaDerrota` só monta enquanto a fase é 'abatido', então ele
 * DESMONTA no exato quadro em que a fase vira 'derrota'. O preto existia e
 * morria antes de cobrir o corte que ele deveria cobrir — a cena entregava o
 * card com o céu aceso, que é exatamente o corte seco que eu tinha declarado
 * consertado. Fechar de um lado sem abrir do outro não é uma transição.
 */
const Reentrada: React.FC<{ reentrada: React.MutableRefObject<number> }> = ({ reentrada }) => {
    const [op, setOp] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => {
            reentrada.current = Math.max(0, reentrada.current - 0.05 / 0.8);
            setOp(reentrada.current);
        }, 50);
        return () => window.clearInterval(id);
    }, [reentrada]);
    if (op <= 0.01) return null;
    return <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
        background: '#000', opacity: op,
    }} />;
};

/**
 * A BORDA DA TELA SANGRA, e ela sangra só na BORDA de propósito.
 *
 * Levar dano não tinha linguagem de tela nenhuma: o avião piscava (um
 * `visible = false` cru, que é a coisa mais barata que existe) e a câmera
 * sacudia. Num andar inteiro em azul-escuro com janelas quentes, o único
 * elemento saturado era o brilho da boca — nada estourava no contato.
 *
 * O vermelho fica num anel de fora com o meio transparente porque o centro do
 * quadro é onde estão a boca e os projéteis, e tapar isso para avisar de um
 * dano que o jogador ACABOU de tomar seria cobrar duas vezes pelo mesmo erro.
 *
 * ── E O GATILHO É UM CONTADOR, PORQUE O LIMIAR NÃO FUNCIONOU ────────────────
 *
 * A primeira versão vigiava `baque.current > 0.9` a cada 40 ms. Só que `baque`
 * decai a 2,4 por segundo, então ele passa de 0,9 em pouco mais de 40 ms — a
 * janela e o intervalo tinham o MESMO tamanho, e na prática a vinheta quase
 * nunca disparava. Fotografado, o estouro laranja aparecia e a borda não.
 *
 * Um contador que só sobe não tem janela para perder: qualquer poll depois do
 * toque vê o número diferente. E toques em sequência viram remontagens
 * distintas, o que faz a animação de CSS rodar do começo em cada um.
 */
const BordaSangrando: React.FC<{ baques: React.MutableRefObject<number> }> = ({ baques }) => {
    const [n, setN] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => setN(baques.current), 40);
        return () => window.clearInterval(id);
    }, [baques]);
    if (n === 0) return null;
    return <div key={n} aria-hidden style={{
        // z ACIMA do canvas. Com 2 o elemento existia, o DOM dizia opacidade 1,
        // e a foto não tinha vermelho nenhum: ele estava sendo pintado ATRÁS da
        // cena. "Está no DOM" não é "está na tela".
        position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(214,46,36,0.78) 100%)',
        // SEGURA antes de apagar. A 0,52 s com apagamento imediato, o flash
        // durava uns cinco quadros num aparelho fraco e era fácil de perder
        // completamente — que é o oposto do que um aviso de dano serve para
        // fazer. Ele fica cheio por um quarto do tempo e só então some.
        animation: 'f12sangra 0.9s ease-out forwards',
    }}>
        <style>{'@keyframes f12sangra { 0%, 25% { opacity: 1 } 100% { opacity: 0 } }'}</style>
    </div>;
};

/** Mostra o avião quando a câmera já saiu de dentro do hóspede. */
const RevelarAviao: React.FC<{
    camRef: React.MutableRefObject<number>;
    visivelRef: React.MutableRefObject<boolean>;
}> = ({ camRef, visivelRef }) => {
    useFrame(() => { if (camRef.current > 0.12) visivelRef.current = true; });
    return null;
};

/**
 * A COLUNA DO MEIO É DA CABEÇA, e o HUD não entra nela.
 *
 * As duas linhas que a luta grita — o nome do ataque e a janela de dano —
 * estavam centralizadas e presas a 64 px e 96 px do topo. É exatamente onde
 * fica a cara do chefe: em retrato as duas cobriam a testa e a boca ao mesmo
 * tempo em que diziam "ATIRE NA BOCA!", tapando a única coisa que o jogador
 * precisava ver. O canto é o lugar certo para texto de apoio; o meio é do
 * desenho. Alinhadas à direita, elas espelham as vidas no canto esquerdo e
 * empilham sem se atropelar quando as duas aparecem juntas.
 */
const CANTO_DO_HUD: React.CSSProperties = {
    position: 'absolute', right: 14, textAlign: 'right',
    maxWidth: '42%', zIndex: 3, pointerEvents: 'none',
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
    const [aberta, setAberta] = useState(false);
    useEffect(() => {
        const id = window.setInterval(() => {
            setAberta(vulneravel(bocaNoInstante(f12.bocaT)) && f12.fase === 'luta');
        }, 90);
        return () => window.clearInterval(id);
    }, []);
    if (!aberta) return null;
    return (
        <div style={{
            ...t64, ...CANTO_DO_HUD, top: 'calc(env(safe-area-inset-top) + 126px)',
            fontSize: 18, color: '#b6ff4a', animation: 'f12pisca 0.45s infinite',
        }}>
            ATIRE NA BOCA!
        </div>
    );
};

/** O nome do ataque, piscando quando a boca abre. DOM, fora do Canvas. */
const GritoDoAtaque: React.FC<{ gritoRef: React.MutableRefObject<string> }> = ({ gritoRef }) => {
    const [texto, setTexto] = useState('');
    useEffect(() => {
        const id = window.setInterval(() => setTexto(gritoRef.current), 120);
        return () => window.clearInterval(id);
    }, [gritoRef]);
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
            ...t64, ...CANTO_DO_HUD, top: 'calc(env(safe-area-inset-top) + 62px)',
            fontSize: 18, color: '#ff8a6b', animation: 'f12pisca 0.4s infinite',
        }}>
            {texto.slice(texto.indexOf('|') + 1)}
            <style>{'@keyframes f12pisca { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }'}</style>
        </div>
    );
};

export { configureFloor12Sfx };
export default Floor12;
