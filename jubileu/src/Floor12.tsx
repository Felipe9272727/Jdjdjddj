import { F12_CINEMA, cinemaEase, victoryBeat } from './f12Cinema';
import { Floor12CinemaEffects } from './Floor12CinemaEffects';
import { nascerMissilCarregado, danoDoTiro } from './f12Boss';
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
    ataqueDaVez, fichaDoAtaque, VIDA_MAXIMA, ferir,
    nascerLeque, nascerTeleguiado, nascerNaves, nascerMare, nascerElevadores,
    nascerTiro, TIRO, PONTA_DA_ASA, passoDoProjetil, saiuDeCena, encostou, tiroNaBoca,
    F12_ENCONTRO, F12_VIRADA, F12_VITORIA, F12_DERROTA, F12_DESPEDIDA,
    type Nave, type NomeDoAtaque, type F12Linha,
} from './f12Boss';
import { Floor12Ceu } from './Floor12Ceu';
import { Floor12Cabeca, AnelDaBoca } from './Floor12Cabeca';
import { Floor12Projeteis } from './Floor12Projeteis';
import { AviaoDoJogador, AviaoDoIrmao } from './Floor12Avioes';
import { newFlightWeapon, stepFlightWeapon, type FlightWeapon } from './f12FlightWeapon';
import { f12IntroCamera, f12ChaseDistance } from './f12Presentation';
import {
    configureFloor12Sfx, tocarMotor, pararMotor, tocarTiro, tocarTiroIrmao,
    tocarAcerto, tocarBocaAbrindo, tocarAtaque, tocarDano, tocarExplosao,
    tocarFalaDoIrmao, tocarDesdobrar, tocarDing, tocarVitoria, tocarDerrota,
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
    introProgressRef: React.MutableRefObject<number>;
    introAtivaRef: React.MutableRefObject<boolean>;
    avisar: () => void;
}> = ({ portaRef, aberturaRef, sumindoRef, camRef, introProgressRef, introAtivaRef, avisar }) => {
    const t = useRef(0);
    const marcos = useRef({ ding: false, desdobrar: false, motor: false });
    useFrame((_, rawDt) => {
        if (f12.fase !== 'intro' && f12.fase !== 'virando') {
            introAtivaRef.current = false;
            return;
        }
        introAtivaRef.current = true;
        // Cinematic time must not run in slow motion below 20 FPS.
        if (typeof document === 'undefined' || !document.hidden) t.current += Math.min(rawDt, .25);
        const tt = t.current;
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
        const dt = Math.min(rawDt, 0.05);
        const n = naveRef.current;
        const recuo = f12ChaseDistance(size.width / Math.max(1, size.height));

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
                camera.fov = THREE.MathUtils.lerp(mark.fov, ENQUADRAMENTO.fov, handoff);
                camera.updateProjectionMatrix();
            }
            camera.lookAt(alvo.current);
            return;
        }

        // A three-quarter front shot lets the older brother actually perform.
        if (f12.fase === 'encontro' && f12.linhaDoDialogo < 3) {
            const ir = irmaoRef.current;
            camera.position.lerp(new THREE.Vector3(ir.x + (f12.linhaDoDialogo === 1 ? 1.8 : 2.7), ir.y + 1.6, f12.linhaDoDialogo === 2 ? -5.6 : -4.2), 1 - Math.exp(-dt * 3.2));
            alvo.current.lerp(new THREE.Vector3(ir.x, ir.y + .9, .4), 1 - Math.exp(-dt * 4));
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.fov = THREE.MathUtils.lerp(camera.fov, f12.linhaDoDialogo === 1 ? 42 : 48, 1 - Math.exp(-dt * 3));
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
        const py = THREE.MathUtils.lerp(dentroY, atrasY + 6, suave);
        // O RECUO É MEDIDO, não escolhido no olho: ele vem de `ENQUADRAMENTO`,
        // que é onde a largura da arena, o aspecto da tela em pé e o tamanho do
        // avião são conciliados — ver a nota longa em `f12Boss`.
        const pz = THREE.MathUtils.lerp(dentroZ, recuo, suave);
        camera.position.lerp(new THREE.Vector3(px, py, pz), Math.min(1, dt * 7));
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = ENQUADRAMENTO.fov;
            camera.updateProjectionMatrix();
        }

        // O alvo fica ENTRE o avião e a boca: a câmera de um jogo de nave tem de
        // enquadrar os dois ao mesmo tempo, senão o jogador escolhe entre ver
        // para onde vai e ver de onde vem o ataque.
        alvo.current.set(
            THREE.MathUtils.lerp(0, n.x * 0.5, suave),
            THREE.MathUtils.lerp(dentroY, n.y * 0.35 + meioY() * 0.35 + BOCA_ALVO.y * 0.3 + 2, suave),
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
        if (['queda', 'vitoria', 'despedida'].includes(f12.fase)) return;

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
            anunciou.current = -1; cuspiu.current = -1;
            F.arma.current.active = false;
            return;
        }

        // ── O RELÓGIO DA BOCA ────────────────────────────────────────────
        f12.relogio += dt;
        f12.bocaT += dt;
        const b = bocaNoInstante(f12.bocaT);
        const ciclo = Math.floor(f12.bocaT / CICLO_DA_BOCA);

        if (b.estado === 'abrindo' && anunciou.current !== ciclo) {
            anunciou.current = ciclo;
            const qual = ataqueDaVez(ciclo, f12.passouDaVirada);
            F.gritoRef.current = fichaDoAtaque(qual).grito;
            tocarBocaAbrindo();
            F.avisar();
        }

        // ── A BOCA CUSPIU ────────────────────────────────────────────────
        // No PRIMEIRO instante do estado aberto, e uma vez por ciclo.
        if (b.estado === 'aberta' && cuspiu.current !== ciclo) {
            cuspiu.current = ciclo;
            const qual = ataqueDaVez(ciclo, f12.passouDaVirada);
            f12.ataqueNoAr = qual;
            cuspir(qual, n, faixaDoElevador, faseDaMare);
            tocarAtaque(qual);
        }

        // ── AS ARMAS ─────────────────────────────────────────────────────
        const moving = Math.hypot(n.vx, n.vy) > .12;
        const shots = stepFlightWeapon(F.arma.current, dtDoRelogio, F.touchAtivo.current || F.gatilho.current, moving);
        if (F.arma.current.missile) {
            f12.projeteis.push(nascerMissilCarregado(n.x, n.y));
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
                        if ((q.hp ?? 0) <= 0) { mortos.add(q.id); tocarExplosao(); }
                        else tocarAcerto();
                        break;
                    }
                }
                if (mortos.has(p.id)) continue;
                // tiro × boca
                if (podeFerir && tiroNaBoca(p)) {
                    mortos.add(p.id);
                    const virou = ferir(danoDoTiro(p));
                    F.flash.current = 1;
                    if (p.carregado) { F.sacode.current = .25; tocarExplosao(); } else tocarAcerto();
                    if (virou) abrirAVirada(F);
                    if (f12.vida <= 0) { acabar(F, 'vitoria'); return; }
                    F.avisar();
                }
                continue;
            }
            // ataque × jogador
            if (encostou(p, n.x, n.y, NAVE.raio) && tomarToque(n)) {
                F.sacode.current = 1; tocarDano();
                if (p.tipo !== 'mare') mortos.add(p.id);
                if (n.vidas <= 0) { acabar(F, 'derrota'); return; }
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
            f12.projeteis.push(...nascerElevadores(faixa.current, alvo.y));
            break;
    }
}

function abrirAVirada(F: Ferramentas): void {
    f12.passouDaVirada = true;
    f12.fase = 'virada';
    f12.linhaDoDialogo = 0;
    f12.projeteis = f12.projeteis.filter((p) => p.tipo === 'tiro');
    tocarExplosao(); tocarFalaDoIrmao();
    F.avisar();
}

function acabar(F: Ferramentas, como: 'vitoria' | 'derrota'): void {
    f12.fase = como === 'vitoria' ? 'queda' : como;
    F.cinemaClock.current = 0;
    F.touchAtivo.current = false; F.gatilho.current = false;
    F.arma.current.active = false; F.arma.current.flash = 0;
    f12.linhaDoDialogo = 0;
    f12.projeteis = [];
    if (como === 'derrota') { pararMotor(); tocarDerrota(); }
    else tocarBocaAbrindo();
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
            setLegendaIntro(p < .08 ? 'ANDAR 12' : p < .26 ? 'AS PORTAS SE ABREM…'
                : p < .52 ? 'O ELEVADOR SE DESDOBRA…' : p < .70 ? 'MOTORES ACESOS.'
                : p < .86 ? 'TROCO-63, NA SUA ALA.' : 'PRÓXIMA PARADA: O IMPOSSÍVEL.');
        }, 120);
        return () => window.clearInterval(id);
    }, []);

    const fase = f12.fase;
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
        } else if (f12.fase === 'derrota') {
            // Recomeça a luta, mas mantendo o que a cabeça já perdeu seria
            // cruel do avesso: ela volta inteira e o jogador também.
            f12Reset();
            arma.current = newFlightWeapon();
            touchAtivo.current = false; gatilho.current = false;
            nave.current = novaNave(0, meioY());
            irmao.current = novaNave(-4, meioY() + 1.2, 3);
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
    // acompanha o contato: soltar o dedo corta o tiro, parar acumula a rajada.
    //
    // A conversão de pixel para mundo sai do enquadramento: a largura do quadro
    // no plano do avião dividida pela largura da tela. Sem isso o arrasto teria
    // um "ganho" arbitrário que mudaria de celular para celular.
    const arrasto = useRef<{ id: number; x: number; y: number } | null>(null);

    const pixelParaMundo = useCallback(() => {
        const meiaV = Math.tan((ENQUADRAMENTO.fov * Math.PI) / 180 / 2);
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
        onPointerUp: (e: React.PointerEvent) => {
            if (arrasto.current?.id !== e.pointerId) return;
            touchAtivo.current = false; arrasto.current = null;
        },
        onPointerCancel: (e: React.PointerEvent) => {
            if (arrasto.current?.id !== e.pointerId) return;
            touchAtivo.current = false; arrasto.current = null;
        },
        onLostPointerCapture: (e: React.PointerEvent) => {
            if (arrasto.current?.id !== e.pointerId) return;
            touchAtivo.current = false; arrasto.current = null;
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

    const mostrarControles = fase === 'luta';
    const vidaFrac = Math.max(0, f12.vida / VIDA_MAXIMA);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#0d2029', touchAction: 'none', display: 'flex', flexDirection: 'column' }}>
        <Canvas
                style={{ flex: '1 1 0', height: 0, minHeight: 0, width: '100%' }}
                dpr={1}
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
                <AnelDaBoca />
                <Floor12Projeteis />
                {fase === 'luta' && <><Mira naveRef={nave} />
                <Floor12FlightFeedback nave={nave} arma={arma} /></>}
                <CabineDeDentro portaRef={porta} sumindoRef={sumindo} />
                <AviaoDoJogador naveRef={nave} aberturaRef={abertura} heliceRef={helice} visivelRef={visivel} />
                <AviaoDoIrmao naveRef={irmao} falandoRef={falando} introRef={introProgress} />
                <DiretorDaIntro portaRef={porta} aberturaRef={abertura} sumindoRef={sumindo}
                    camRef={cam} introProgressRef={introProgress} introAtivaRef={introAtiva}
                    avisar={() => { visivel.current = true; avisar(); }} />
                <CameraDaLuta irmaoRef={irmao} naveRef={nave} camRef={cam} introProgressRef={introProgress}
                    introAtivaRef={introAtiva} sacodeRef={sacode} cinemaClock={cinemaClock} />
                <DiretorDaLuta touchAtivo={touchAtivo} gatilho={gatilho} arma={arma} nave={nave} irmao={irmao} entrada={entrada}
                    flash={flash} sacode={sacode} gritoRef={gritoRef} avisar={avisar} cinemaClock={cinemaClock} />
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
            {mostrarControles && <DicaDeControle />}
            {mostrarControles && <Floor12ChargeMeter arma={arma} />}

            {/* a legenda da introdução: sem ela o jogador não sabe que o
                elevador está virando avião, ele só vê o metal se mexendo */}
            {fase === 'queda' && <LegendaDaVitoria clock={cinemaClock} />}
            {(fase === 'intro' || fase === 'virando') && (
                <div data-testid="f12-intro-caption" style={{ ...t64, flex: '0 0 auto', padding: '10px 12px calc(env(safe-area-inset-bottom) + 10px)', background: '#10242d', textAlign: 'center', fontSize: 'clamp(12px, 2.5vh, 16px)', pointerEvents: 'none' }}>
                    {legendaIntro}
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
const DicaDeControle: React.FC = () => {
    const [visivel, setVisivel] = useState(true);
    useEffect(() => {
        const id = window.setTimeout(() => setVisivel(false), 6000);
        return () => window.clearTimeout(id);
    }, []);
    if (!visivel) return null;
    return (
        <div style={{
            ...t64, position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 8px)',
            left: 0, right: 0, textAlign: 'center', fontSize: 13, zIndex: 3, pointerEvents: 'none',
            opacity: 0.92,
        }}>
            {/* UMA linha, e rente à borda. Duas linhas a 30 px do fundo caíam em
                cima do avião do jogador — o tutorial tapava a coisa que ele
                estava aprendendo a pilotar. */}
            ARRASTE PARA VOAR E ATIRAR · PARAR CARREGA A RAJADA
        </div>
    );
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
            ...t64, ...CANTO_DO_HUD, top: 'calc(env(safe-area-inset-top) + 92px)',
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
            {texto}
            <style>{'@keyframes f12pisca { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }'}</style>
        </div>
    );
};

export { configureFloor12Sfx };
export default Floor12;
