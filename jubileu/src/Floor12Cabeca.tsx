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
 * a mandíbula desce de verdade, o interior acende, e os olhos apertam.
 *
 * O crânio tem uma cavidade real, com mandíbula e garganta independentes. Nada de GLB: o andar 12
 * carrega zero bytes de asset, e num celular isso é a diferença entre entrar no
 * andar e olhar uma tela preta esperando.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { victoryBeat, defeatBeat, turnBeat, avancoDaCabecaNaDerrota, CENA_DA_DERROTA } from './f12Cinema';
import { Floor12Facework } from './Floor12Facework';
import { Floor12BossCrown } from './Floor12BossCrown';
import { mat64 } from './Floor5Player64';
import {
    f12, ARENA, bocaNoInstante, vulneravel, VIDA_MAXIMA, LIMIAR_DA_VIRADA, BOCA_ALVO,
    ALTURA_DA_CABECA, BOCA_ABAIXO_DO_CENTRO,
} from './f12Boss';

/**
 * A escala dela. A cabeça tem de LER como colossal contra um avião de 1,6 —
 * então ela é da altura da arena inteira, e o jogador voa na frente do queixo.
 */
export const ESCALA = 7.2;

const CORES = {
    pele: '#233f46',        // um cinza-lilás de gesso velho: parede de hotel
    peleEsc: '#12313a',
    interior: '#140f19',    // a garganta
    brasa: '#ff7a3a',       // o que arde lá dentro
    olho: '#f4f1e4',
    pupila: '#062d32',
    dente: '#e9e3d2',
    ferida: '#c8443a',
};

/** A real cavity: discard the front lower skull, leaving the jaw independent. */
function cranioAberto() {
    const sphere = new THREE.SphereGeometry(3.6, 64, 48);
    const flat = sphere.toNonIndexed();
    sphere.dispose();
    const p = flat.getAttribute('position');
    const n = flat.getAttribute('normal');
    const vertices: number[] = [], normals: number[] = [];
    for (let i = 0; i < p.count; i += 3) {
        const x = (p.getX(i) + p.getX(i+1) + p.getX(i+2)) / 3;
        const y = (p.getY(i) + p.getY(i+1) + p.getY(i+2)) / 3;
        const z = (p.getZ(i) + p.getZ(i+1) + p.getZ(i+2)) / 3;
        if (z > 0.45 && y < -0.62 && Math.abs(x) < 2.48) continue;
        for (let j = i; j < i + 3; j++) {
            const vy = p.getY(j);
            const taper = .86 + .16 * THREE.MathUtils.smoothstep(vy, -2.6, .8);
            vertices.push(p.getX(j) * taper, vy * 1.015, p.getZ(j) * .88);
            normals.push(n.getX(j) / taper, n.getY(j) / 1.015, n.getZ(j) / .88);
        }
    }
    flat.dispose();
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    result.computeBoundingSphere();
    return result;
}

export const Floor12Cabeca: React.FC<{
    /** Sobe quando um tiro entra: a cabeça pisca de dano. */
    flashRef: React.MutableRefObject<number>;
    naveRef?: React.MutableRefObject<{ x: number; y: number }>;
    cinemaClock?: React.MutableRefObject<number>;
}> = ({ flashRef, naveRef, cinemaClock }) => {
    const raiz = useRef<THREE.Group>(null);
    const cranio = useMemo(cranioAberto, []);
    const jaw = useMemo(() => {
        const s = new THREE.Shape();
        s.moveTo(-2.35, .65); s.lineTo(2.35, .65);
        s.quadraticCurveTo(2.5, -.45, 1.78, -.86);
        s.quadraticCurveTo(0, -1.1, -1.78, -.86);
        s.quadraticCurveTo(-2.5, -.45, -2.35, .65);
        const g = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true,
            bevelSize: .14, bevelThickness: .13, bevelSegments: 3, curveSegments: 12 });
        g.translate(0, 0, -1.1); return g;
    }, []);
    const brow = useMemo(() => {
        const s = new THREE.Shape();
        s.moveTo(-.9, -.12); s.quadraticCurveTo(0, .4, .9, .08);
        s.lineTo(.85, -.12); s.quadraticCurveTo(0, .06, -.9, -.28);
        s.closePath();
        return new THREE.ExtrudeGeometry(s, { depth: .18, bevelEnabled: true,
            bevelSize: .05, bevelThickness: .04, bevelSegments: 2 });
    }, []);
    const face = useRef<THREE.Group>(null);
    const mandibula = useRef<THREE.Group>(null);
    const garganta = useRef<THREE.Mesh>(null);
    const reator = useRef<THREE.Group>(null);
    const olhoE = useRef<THREE.Group>(null);
    const olhoD = useRef<THREE.Group>(null);
    const sobrE = useRef<THREE.Mesh>(null);
    const sobrD = useRef<THREE.Mesh>(null);

    const M = useMemo(() => ({
        pele: new THREE.MeshStandardMaterial({ color: CORES.pele, roughness: .43, metalness: .28 }),
        porcelana: new THREE.MeshStandardMaterial({ color: '#e9ddbd', roughness: .38, metalness: .12 }),
        brilhoOlho: new THREE.MeshBasicMaterial({ color: '#a0fff1', toneMapped: false }),
        peleEsc: mat64(CORES.peleEsc),
        interior: mat64(CORES.interior),
        brasa: mat64(CORES.brasa, CORES.brasa, 0.9),
        olho: new THREE.MeshStandardMaterial({ color: CORES.olho, roughness: .24, metalness: .08 }),
        pupila: mat64(CORES.pupila),
        dente: mat64(CORES.dente),
        ferida: mat64(CORES.ferida, CORES.ferida, 0.35),
    }), []);

    useEffect(() => () => { cranio.dispose(); jaw.dispose(); brow.dispose(); Object.values(M).forEach(m => m.dispose()); }, [cranio, jaw, brow, M]);

    // As feridas aparecem conforme a vida cai: a cabeça CONTA a luta no corpo,
    // e não só na barra do HUD. Um chefe cuja aparência não muda faz o jogador
    // duvidar de que está acertando.
    /**
     * ── AS FERIDAS ERAM BLUSH DE PALHAÇO ─────────────────────────────────
     *
     * Eram seis esferas de raio 0,5 em `#c8443a` chapado, postas a z entre 2,7
     * e 3,4 num crânio de raio 3,6 — ou seja DENTRO da superfície, estourando
     * para fora dela como bolas. Fotografadas, duas caíam nas bochechas e uma
     * dentro da boca, em cima da língua. O resultado era uma cara de palhaço,
     * na cara do chefe, durante toda a segunda metade da luta.
     *
     * A intenção estava certa — a cabeça CONTA a luta no corpo, e um chefe que
     * não muda de aparência faz o jogador duvidar de que está acertando. O
     * desenho é que dizia outra coisa.
     *
     * Agora cada ferida é uma CRATERA: as direções são normalizadas e a ferida
     * é assentada exatamente sobre a casca, virada para fora, com a chapa
     * queimada escura por cima e a brasa aparecendo por dentro. Buraco lê como
     * dano; bola vermelha lê como bochecha.
     *
     * As direções também saíram da faixa central do rosto, onde moram os olhos
     * e a boca. Uma ferida em cima do olho não é dano, é maquiagem.
     */
    const feridas = useMemo(() => {
        const R = 3.6;
        // AS DIREÇÕES PRECISAM OLHAR PARA A CÂMERA, e não para os lados.
        // A primeira leva destas crateras era lateral demais (z em torno de
        // 0,5 normalizado): fotografada, a cara ficou limpa — elas assentavam
        // perto da silhueta e não apareciam em quadro nenhum. Trocar uma
        // ferida feia por ferida invisível é pior, porque aí a cabeça para de
        // contar a luta no corpo, que era o ponto.
        //
        // Elas ficam na METADE DA FRENTE (z alto), fora da faixa dos olhos
        // (y ~1,4 a 2,3, x ~±1,6) e acima da boca.
        const dirs: [number, number, number][] = [
            [-2.30, 0.10, 2.60],   // bochecha esquerda
            [2.30, 0.05, 2.60],    // bochecha direita
            [-1.15, 2.95, 2.10],   // testa, à esquerda
            [1.50, 2.80, 2.05],    // testa, à direita
            [-2.70, 1.45, 1.85],   // têmpora esquerda
            [2.70, 1.35, 1.85],    // têmpora direita
        ];
        return dirs.map(([x, y, z]) => {
            const m = Math.hypot(x, y, z);
            return [(x / m) * R, (y / m) * R, (z / m) * R] as [number, number, number];
        });
    }, []);
    const feridaRefs = useRef<(THREE.Mesh | null)[]>([]);

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const b = bocaNoInstante(f12.bocaT);
        const t = state.clock.elapsedTime;
        const dying = f12.fase === 'queda';
        const gone = f12.fase === 'vitoria' || f12.fase === 'despedida';
        const ct = cinemaClock?.current ?? 0;
        const beat = victoryBeat(ct);
        // ── A CABEÇA FECHA O PLANO DA DERROTA ────────────────────────────
        // Sem isto, a cena de derrota seria só a câmera passeando: a cabeça
        // ficaria parada, batendo o compasso da boca como se a luta não tivesse
        // acabado. Ela AVANÇA para dentro do quadro, inclina e escancara — a
        // última coisa que o jogador vê é quem o derrubou, não o próprio avião.
        // A cabeça SEGURA A POSE no card de derrota. Enquanto isto era só
        // 'abatido', ela voltava à pose normal na tela seguinte e o chefe
        // aparecia inteiro e calmo logo depois de engolir o jogador.
        const abatido = f12.fase === 'abatido';
        const dv = abatido ? defeatBeat(ct)
            : f12.fase === 'derrota' ? defeatBeat(CENA_DA_DERROTA.total) : null;
        // ── A CABEÇA RUGE NA VIRADA ──────────────────────────────────────
        // Ela ficava parada, batendo o compasso da boca como se nada tivesse
        // acontecido, enquanto uma caixa de texto avisava que tudo tinha
        // mudado. Aqui ela escancara e treme, e é isso que o jogador vê.
        const tv = f12.fase === 'virada' ? turnBeat(ct) : null;
        if (dying) b.abertura = .4 + beat.tremor * .6;
        if (dv) b.abertura = Math.max(b.abertura, dv.engolir);
        if (tv) b.abertura = Math.max(b.abertura, tv.rugido);
        if (raiz.current) {
            raiz.current.visible = !gone && (!dying || beat.fall < .995);
            raiz.current.position.set(
                (dying ? Math.sin(ct * 32) * beat.tremor * .10 : 0)
                    + (tv ? Math.sin(ct * 71) * tv.tremor * .26 : 0),
                ALTURA_DA_CABECA - (dying ? beat.fall * 26 : 0)
                    - (dv ? dv.engolir * 2.4 : 0),
                ARENA.zCabeca - (dying ? beat.fall * 7 : 0)
                    + (dv ? avancoDaCabecaNaDerrota(dv.engolir) : 0)
                    + (tv ? tv.aproxima * 1.5 : 0));
            raiz.current.rotation.set(
                (dying ? beat.fall * .9 : 0) + (dv ? dv.engolir * .22 : 0),
                dying ? beat.fall * -.35 : 0,
                dying ? Math.sin(ct * 23) * .018 * beat.tremor + beat.fall * .65 : 0);
        }

        // ── A MANDÍBULA ──────────────────────────────────────────────────
        // Ela GIRA num pivô atrás do queixo, não desliza para baixo: mandíbula
        // que translada lê como gaveta.
        if (mandibula.current) mandibula.current.rotation.x = b.abertura * 0.86;

        // A garganta acende quando abre — é o que faz a boca parecer perigosa
        // em vez de um buraco.
        if (garganta.current) {
            const m = garganta.current.material as THREE.MeshLambertMaterial;
            m.emissiveIntensity = dying ? (1 - beat.rupture) * (2 + beat.tremor * 5) : 0.25 + b.abertura * 1.5;
            garganta.current.scale.setScalar(0.85 + b.abertura * 0.3);
        }

        if (reator.current) reator.current.rotation.z += dt * (dying ? 2 + beat.tremor * 12
            : tv ? 3 + tv.rugido * 9 : .18 + b.abertura * 1.6);

        // ── OS OLHOS ─────────────────────────────────────────────────────
        // Apertam quando a boca abre. É o telegrafo redundante: quem estiver
        // olhando para os olhos e não para a boca também vê o ataque vir.
        const blink = !dying && b.abertura < .1 && t % 5.7 < .12 ? .15 : 1;
        const aperto = dying ? Math.max(.04, 1 - beat.rupture) : (1 - b.abertura * .32) * blink;
        for (const o of [olhoE.current, olhoD.current]) if (o) o.scale.y = aperto;
        const franzir = b.abertura * 0.4;
        if (sobrE.current) sobrE.current.rotation.z = -0.18 - franzir;
        if (sobrD.current) sobrD.current.rotation.z = 0.18 + franzir;

        // Mouth and collision stay anchored. The upper face breathes and recoils.
        if (face.current) {
            const recoil = b.estado === 'abrindo' ? Math.sin(b.t / 0.55 * Math.PI) * 0.09 : 0;
            face.current.position.y = Math.sin(t * 0.55) * 0.035;
            face.current.position.z = -recoil;
        }
        for (const eye of [olhoE.current, olhoD.current]) {
            const pupil = eye?.children[1];
            if (pupil) {
                pupil.position.x = THREE.MathUtils.clamp((naveRef?.current.x ?? 0) * 0.025, -0.14, 0.14);
                pupil.position.y = THREE.MathUtils.clamp(((naveRef?.current.y ?? 5) - 5) * 0.025, -0.12, 0.1);
            }
        }

        // ── O PISCA DE DANO ──────────────────────────────────────────────
        if (flashRef.current > 0) flashRef.current = Math.max(0, flashRef.current - dt * 4.5);
        const brilho = flashRef.current;
        M.pele.emissive.setRGB(brilho * 0.9, brilho * 0.35, brilho * 0.3);
        M.peleEsc.emissive.setRGB(brilho * 0.7, brilho * 0.25, brilho * 0.22);

        // ── AS FERIDAS ───────────────────────────────────────────────────
        const perdida = 1 - f12.vida / VIDA_MAXIMA;
        feridaRefs.current.forEach((m, i) => {
            if (!m) return;
            const limiar = (i + 0.6) / feridas.length;
            const aberta = THREE.MathUtils.clamp((perdida - limiar) * 4, 0, 1);
            m.visible = aberta > 0.02;
            // Cratera não CRESCE como bola: ela abre. A escala fica quase toda
            // no plano da casca e quase nada na normal, senão volta a estourar
            // para fora e vira bola outra vez.
            m.scale.set(0.45 + aberta * 0.75, 0.45 + aberta * 0.75, 0.6 + aberta * 0.4);
        });
    });

    // Meia-largura do crânio em unidades locais (a escala vem no group).
    const R = 3.6;

    return (
        <group ref={raiz} name="cabeca" scale={ESCALA / R} position={[0, ALTURA_DA_CABECA, ARENA.zCabeca]}>
            {/* ── O CRÂNIO ── */}
            <mesh material={M.pele} geometry={cranio} />
            <group ref={face}>
            <Floor12BossCrown />
            <Floor12Facework />
            {/* têmporas achatadas, para não ser uma bola perfeita */}
            <mesh material={M.peleEsc} position={[0, R * 0.25, -R * 0.25]}>
                <sphereGeometry args={[R * 0.70, 16, 10]} />
            </mesh>

            {/* ── OS OLHOS ── */}
            {[[-1, olhoE, sobrE] as const, [1, olhoD, sobrD] as const].map(([lado, ro, rs]) => (
                <React.Fragment key={lado}>
                    <group ref={ro} position={[lado * 1.55, 1.15, 3.27]}>
                        <mesh material={M.olho} scale={[1, .67, .38]}><sphereGeometry args={[.78, 24, 16]} /></mesh>
                        <mesh material={M.pupila} position={[lado * 0.12, -0.05, .30]} scale={[.82, 1, .35]}>
                            <sphereGeometry args={[0.31, 16, 10]} />
                        </mesh>
                        <mesh material={M.brilhoOlho} position={[.07, .02, .43]}>
                            <sphereGeometry args={[.055, 10, 8]} />
                        </mesh>
                    </group>
                    <mesh ref={rs} geometry={brow} material={M.peleEsc} position={[lado * 1.6, 2.03, 3.28]} />
                </React.Fragment>
            ))}



            </group>

            {/* ── A BOCA ──
                O interior fica FIXO e a mandíbula gira na frente dele: assim a
                garganta já está lá quando a boca abre, em vez de nascer junto. */}
            {/* A altura vem de `BOCA_ABAIXO_DO_CENTRO`, o MESMO número de que a
                hitbox sai. O grupo fica onde a cavidade tem de ficar, e a
                cavidade dentro dele em zero — assim não há dois deslocamentos
                somando por acaso, que foi como o anel de mira acabou em cima do
                nariz na primeira montagem. */}
            <group position={[0, -BOCA_ABAIXO_DO_CENTRO / (ESCALA / R), R * 0.42]}>
                <mesh material={M.interior} position={[0, 0, -0.9]}>
                    <boxGeometry args={[4.9, 3.2, 0.25]} />
                </mesh>
                {[-1, 1].map(side => <mesh key={side} material={M.interior} position={[side * 2.35, 0, 0.25]}>
                    <boxGeometry args={[0.25, 2.7, 2.4]} />
                </mesh>)}
                <mesh ref={garganta} material={M.brasa} position={[0, -0.2, 0.15]}>
                    <sphereGeometry args={[.72, 20, 14]} />
                </mesh>
                <group ref={reator} position={[0, -.2, .48]}>
                    <mesh material={M.peleEsc}><torusGeometry args={[1.23, .22, 8, 28]} /></mesh>
                    <mesh material={M.brasa} position={[0, 0, .06]}><torusGeometry args={[1.18, .065, 6, 28]} /></mesh>
                    {Array.from({length: 8}, (_, i) => {
                        const a = i * Math.PI / 4;
                        return <mesh key={i} material={M.dente} position={[Math.cos(a)*1.18, Math.sin(a)*1.18, .12]} rotation={[0, 0, a]}>
                            <boxGeometry args={[.29, .13, .12]} />
                        </mesh>;
                    })}
                </group>
                {/* dentes de cima, presos ao crânio */}
                {[-1.75, -1.05, -0.35, 0.35, 1.05, 1.75].map((x, i) => (
                    <mesh key={i} material={M.dente} position={[x, 0.88, 1.0]}>
                        <boxGeometry args={[0.55, 0.7, 0.42]} />
                    </mesh>
                ))}
                {/* a mandíbula: pivô ATRÁS, para ela girar como maxilar */}
                <group ref={mandibula} position={[0, 0.5, -0.9]}>
                    <mesh geometry={jaw} material={M.porcelana} position={[0, -.75, 1.15]} />
                    <mesh position={[0, -1.05, 2.38]} scale={[1, .28, .22]} material={M.peleEsc}>
                        <sphereGeometry args={[1.72, 24, 12]} />
                    </mesh>
                    {[-1.75, -1.05, -0.35, 0.35, 1.05, 1.75].map((x, i) => (
                        <mesh key={i} material={M.dente} position={[x, -0.05, 2.1]}>
                            <boxGeometry args={[0.55, 0.66, 0.42]} />
                        </mesh>
                    ))}
                </group>
            </group>

            {/* ── AS FERIDAS ── */}
            {feridas.map((p, i) => (
                <group key={i} position={p}
                    // virada PARA FORA: o eixo +Z de cada cratera aponta para
                    // longe do centro do crânio, então ela assenta na casca em
                    // vez de estourar através dela.
                    rotation={[Math.atan2(-p[1], Math.hypot(p[0], p[2])), Math.atan2(p[0], p[2]), 0]}
                    ref={(g) => { feridaRefs.current[i] = g as unknown as THREE.Mesh; }} visible={false}>
                    {/* a brasa, no fundo do buraco */}
                    <mesh material={M.brasa} position={[0, 0, -.18]}>
                        <sphereGeometry args={[.30, 10, 8]} />
                    </mesh>
                    {/* a chapa rasgada em volta: escura, e é ela que faz o buraco */}
                    <mesh material={M.peleEsc} position={[0, 0, -.02]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[.40, .17, 6, 12]} />
                    </mesh>
                    {/* lascas levantadas, para a borda não ser um anel perfeito */}
                    {[0, 1, 2].map((k) => (
                        <mesh key={k} material={M.peleEsc}
                            position={[Math.cos(k * 2.1 + i) * .44, Math.sin(k * 2.1 + i) * .44, .06]}
                            rotation={[.5 + k * .4, k * .7, k * 2.1 + i]}>
                            <boxGeometry args={[.26, .07, .20]} />
                        </mesh>
                    ))}
                </group>
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
            <meshBasicMaterial color="#71fff0" transparent opacity={0.6} side={THREE.DoubleSide} fog={false} />
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
