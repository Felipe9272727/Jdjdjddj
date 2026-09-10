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
import { AviaoDoJogador, AviaoDoIrmao, CascoDoElevador } from './Floor12Avioes';
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
    avisar: () => void;
}> = ({ portaRef, aberturaRef, sumindoRef, camRef, avisar }) => {
    const t = useRef(0);
    const marcos = useRef({ ding: false, desdobrar: false, motor: false });
    useFrame((_, rawDt) => {
        if (f12.fase !== 'intro' && f12.fase !== 'virando') return;
        t.current += Math.min(rawDt, 0.05);
        const tt = t.current;

        if (tt > 0.6 && !marcos.current.ding) { marcos.current.ding = true; tocarDing(); }

        portaRef.current = THREE.MathUtils.clamp((tt - 1.2) / 1.4, 0, 1);

        if (tt > 3.0) {
            if (!marcos.current.desdobrar) { marcos.current.desdobrar = true; tocarDesdobrar(); f12.fase = 'virando'; f12Bump(); }
            aberturaRef.current = THREE.MathUtils.clamp((tt - 3.0) / 2.2, 0, 1);
        }
        if (tt > 4.4 && !marcos.current.motor) { marcos.current.motor = true; tocarMotor(); }

        // A câmera sai de dentro do hóspede para trás do avião.
        camRef.current = THREE.MathUtils.clamp((tt - 4.4) / 1.8, 0, 1);
        // A cabine de dentro some junto — ela e o casco são a mesma coisa vista
        // de dois lados, e mostrar as duas ao mesmo tempo entregaria o truque.
        sumindoRef.current = THREE.MathUtils.clamp((tt - 4.6) / 1.2, 0, 1);

        if (tt > 6.2) { f12.fase = 'encontro'; f12.linhaDoDialogo = 0; tocarFalaDoIrmao(); avisar(); }
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
    camRef: React.MutableRefObject<number>;
    sacodeRef: React.MutableRefObject<number>;
}> = ({ naveRef, camRef, sacodeRef }) => {
    const camera = useThree((s) => s.camera);
    const alvo = useRef(new THREE.Vector3());
    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const n = naveRef.current;
        const k = THREE.MathUtils.clamp(camRef.current, 0, 1);
        const suave = k * k * (3 - 2 * k);

        // Dentro do hóspede: no meio da cabine, na altura dos olhos.
        const dentroY = meioY() + 0.35, dentroZ = 0.55;
        // Atrás do avião: acompanha X e Y com atraso, para a nave "escapar" um
        // pouco do quadro quando o jogador acelera — é o que dá velocidade.
        const atrasX = n.x * 0.72, atrasY = n.y * 0.55 + meioY() * 0.45;

        const px = THREE.MathUtils.lerp(0, atrasX, suave);
        const py = THREE.MathUtils.lerp(dentroY, atrasY + 1.1, suave);
        // O RECUO É MEDIDO, não escolhido no olho: ele vem de `ENQUADRAMENTO`,
        // que é onde a largura da arena, o aspecto da tela em pé e o tamanho do
        // avião são conciliados — ver a nota longa em `f12Boss`.
        const pz = THREE.MathUtils.lerp(dentroZ, ENQUADRAMENTO.recuo, suave);
        camera.position.lerp(new THREE.Vector3(px, py, pz), Math.min(1, dt * 7));

        // O alvo fica ENTRE o avião e a boca: a câmera de um jogo de nave tem de
        // enquadrar os dois ao mesmo tempo, senão o jogador escolhe entre ver
        // para onde vai e ver de onde vem o ataque.
        alvo.current.set(
            THREE.MathUtils.lerp(0, n.x * 0.5, suave),
            THREE.MathUtils.lerp(dentroY, n.y * 0.35 + meioY() * 0.35 + BOCA_ALVO.y * 0.3, suave),
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
    nave: React.MutableRefObject<Nave>;
    irmao: React.MutableRefObject<Nave>;
    entrada: React.MutableRefObject<{ x: number; y: number }>;
    flash: React.MutableRefObject<number>;
    sacode: React.MutableRefObject<number>;
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
const DiretorDaLuta: React.FC<Ferramentas> = (F) => {
    const ladoDoTiro = useRef<-1 | 1>(1);
    const ladoDoIrmao = useRef<-1 | 1>(1);
    const proxAtaque = useRef(0);
    const cuspiu = useRef(-1);
    const anunciou = useRef(-1);
    const faixaDoElevador = useRef(0);
    const faseDaMare = useRef(0);

    useFrame((_, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
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

        if (!lutando) return;

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
        // TIRO AUTOMÁTICO. Havia um botão de segurar, e ele custava o polegar
        // direito inteiro num jogo em que os dois polegares já têm serviço:
        // um arrasta a nave e o outro... segura um botão para fazer a única
        // coisa que a nave sempre quer fazer. Todo shmup de celular atira
        // sozinho, e o motivo é este.
        if (n.recarga <= 0) {
            n.recarga = TIRO.cadencia;
            // Alterna a ponta de asa: dois rastros paralelos em vez de uma fila
            // escondida atrás da fuselagem. Ver a nota em `nascerTiro`.
            ladoDoTiro.current = ladoDoTiro.current === 1 ? -1 : 1;
            f12.projeteis.push(nascerTiro(n.x, n.y, 'jogador', ladoDoTiro.current));
            tocarTiro();
        }
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
                    F.flash.current = 1;
                    tocarAcerto();
                    if (virou) abrirAVirada(F);
                    if (f12.vida <= 0) acabar(F, 'vitoria');
                    F.avisar();
                }
                continue;
            }
            // ataque × jogador
            if (encostou(p, n.x, n.y, NAVE.raio) && tomarToque(n)) {
                F.sacode.current = 1; tocarDano();
                if (p.tipo !== 'mare') mortos.add(p.id);
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
    const sacode = useRef(0);
    const gritoRef = useRef('');
    const porta = useRef(0);
    const abertura = useRef(0);
    const sumindo = useRef(0);
    const cam = useRef(0);
    const helice = useRef(1);
    const falando = useRef(false);
    const visivel = useRef(false);

    useEffect(() => {
        f12Reset();
        nave.current = novaNave(0, meioY());
        irmao.current = novaNave(-4, meioY() + 1.2, 3);
        f12AoMudar(avisar);
        return () => { f12AoMudar(null); pararMotor(); };
    }, [avisar]);

    // Durante a introdução o avião só aparece quando a câmera já saiu de dentro
    // do hóspede — antes disso o jogador estaria vendo o próprio cockpit por
    // dentro E por fora ao mesmo tempo.
    useEffect(() => { visivel.current = false; }, []);

    const fase = f12.fase;
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
        const w = window as unknown as Record<string, unknown>;
        w.__f12fase = fase; w.__f12abertura = abertura.current;
        // A bancada precisa contar PROJÉTEIS. "Não vi bala nenhuma na foto" é
        // uma frase sobre a foto, não sobre o jogo — e este andar já me fez
        // consertar coisa que não estava quebrada por causa disso.
        w.__f12estado = { fase, vida: f12.vida, projeteis: f12.projeteis, nave: nave.current };
    }
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
            f12.bocaT = 0;                 // o compasso recomeça limpo dos dois lados
            tocarMotor();
        } else if (f12.fase === 'derrota') {
            // Recomeça a luta, mas mantendo o que a cabeça já perdeu seria
            // cruel do avesso: ela volta inteira e o jogador também.
            f12Reset();
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
    // sumiu porque o tiro é automático.
    //
    // A conversão de pixel para mundo sai do enquadramento: a largura do quadro
    // no plano do avião dividida pela largura da tela. Sem isso o arrasto teria
    // um "ganho" arbitrário que mudaria de celular para celular.
    const arrasto = useRef<{ id: number; x: number; y: number } | null>(null);

    const pixelParaMundo = useCallback(() => {
        const meiaV = Math.tan((ENQUADRAMENTO.fov * Math.PI) / 180 / 2);
        const larguraDoMundo = 2 * ENQUADRAMENTO.recuo * meiaV * ENQUADRAMENTO.aspecto;
        const larguraDaTela = Math.max(1, window.innerWidth);
        return larguraDoMundo / larguraDaTela;
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
    const vidaFrac = Math.max(0, f12.vida / VIDA_MAXIMA);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#7ec0ef', touchAction: 'none' }}>
            <Canvas
                dpr={0.6}
                camera={{ fov: ENQUADRAMENTO.fov, near: 0.1, far: 320, position: [0, meioY() + 0.35, 0.55] }}
                gl={{ antialias: false }}
                onCreated={({ gl, scene, camera }) => {
                    gl.domElement.style.imageRendering = 'pixelated';
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
                    }
                }}
            >
                <Floor12Ceu />
                <Floor12Cabeca flashRef={flash} />
                <AnelDaBoca />
                <Floor12Projeteis />
                <Mira naveRef={nave} />
                <CabineDeDentro portaRef={porta} sumindoRef={sumindo} />
                <AviaoDoJogador naveRef={nave} aberturaRef={abertura} heliceRef={helice} visivelRef={visivel} />
                {fase !== 'intro' && fase !== 'virando' && <AviaoDoIrmao naveRef={irmao} falandoRef={falando} />}
                <DiretorDaIntro portaRef={porta} aberturaRef={abertura} sumindoRef={sumindo}
                    camRef={cam} avisar={() => { visivel.current = true; avisar(); }} />
                <CameraDaLuta naveRef={nave} camRef={cam} sacodeRef={sacode} />
                <DiretorDaLuta nave={nave} irmao={irmao} entrada={entrada}
                    flash={flash} sacode={sacode} gritoRef={gritoRef} avisar={avisar} />
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
            {mostrarControles && <DicaDeControle />}

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
    useFrame(() => { if (camRef.current > 0.12) visivelRef.current = true; });
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
            ...t64, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 96px)',
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
            ...t64, position: 'absolute', top: '22%', left: 0, right: 0, textAlign: 'center',
            fontSize: 26, color: '#ff8a6b', animation: 'f12pisca 0.4s infinite',
        }}>
            {texto}
            <style>{'@keyframes f12pisca { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }'}</style>
        </div>
    );
};

export { configureFloor12Sfx };
export default Floor12;
