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
 * Máscara embutida no módulo, com mandíbula e garganta independentes.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { victoryBeat, defeatBeat, turnBeat, avancoDaCabecaNaDerrota, CENA_DA_DERROTA } from './f12Cinema';
import { Floor12Facework } from './Floor12Facework';
import { blinkScale, followGaze } from './f12Expression';
import { createConciergeGeometry } from './f12ConciergeGeometry';
import { createConciergeSkull, createConciergeJaw, createConciergeTooth, createShellSeams, createFaceDetails, shellPoint } from './f12HeadDetails';
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

/** [x, largura, altura (0 = caiu), coroa de latão] de cada dente. */
type Dente = [number, number, number, boolean];
const DENTES_DE_CIMA: Dente[] = [
    [-1.75, .86, .78, false], [-1.05, 1, 1.08, false], [-0.35, .92, .9, true],
    [0.35, 1, 0, false], [1.05, .95, 1.1, false], [1.75, .82, .7, false],
];
const DENTES_DE_BAIXO: Dente[] = [
    [-1.75, .8, .72, false], [-1.05, .96, .92, true], [-0.35, 1, 1.05, false],
    [0.35, .9, .84, false], [1.05, 1, 1, false], [1.75, .85, 0, false],
];

const CORES = {
    pele: '#233f46',        // um cinza-lilás de gesso velho: parede de hotel
    peleEsc: '#12313a',
    interior: '#140f19',    // a garganta
    brasa: '#ff7a3a',       // o que arde lá dentro
    olho: '#f4f1e4',
    pupila: '#062d32',
    dente: '#b9ab8a',       // marfim velho: branco puro era dente de desenho
    ferida: '#c8443a',
};

export const Floor12Cabeca: React.FC<{
    /** Sobe quando um tiro entra: a cabeça pisca de dano. */
    flashRef: React.MutableRefObject<number>;
    naveRef?: React.MutableRefObject<{ x: number; y: number }>;
    cinemaClock?: React.MutableRefObject<number>;
}> = ({ flashRef, naveRef, cinemaClock }) => {
    const raiz = useRef<THREE.Group>(null);
    const cranio = useMemo(createConciergeSkull, []);
    const jaw = useMemo(createConciergeJaw, []);
    const tooth = useMemo(createConciergeTooth, []);
    const seams = useMemo(createShellSeams, []);
    const faceAssets = useMemo(() => {
        const sculpt = createConciergeGeometry();
        return { sculpt, ...createFaceDetails(sculpt) };
    }, []);
    const detail = faceAssets.cracks;
    useEffect(() => () => {
        tooth.dispose(); seams.forEach(g => g.dispose());
        faceAssets.sculpt.dispose(); faceAssets.rims.forEach(g => g.dispose());
        detail.forEach(c => { c.edge.dispose(); c.ember.dispose(); });
    }, [tooth, seams, faceAssets, detail]);
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
    const bracosDaMandibula = useRef<(THREE.Mesh | null)[]>([]);
    const armScratch = useMemo(() => ({ start: new THREE.Vector3(), end: new THREE.Vector3(),
        span: new THREE.Vector3(), mid: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);

    const M = useMemo(() => ({
        pele: new THREE.MeshStandardMaterial({ color: CORES.pele, roughness: .43, metalness: .28 }),
        // ── AS COSTURAS E OS REBITES ──────────────────────────────────────
        // O que faz esta cabeça parecer barata não é a forma, é a AUSÊNCIA DE
        // ESCALA. Uma esfera lisa de sete metros e uma esfera lisa de setenta
        // centímetros são a mesma imagem: sem nada de tamanho conhecido na
        // superfície, o olho não tem como saber que a coisa é enorme.
        //
        // Rebite e chapa resolvem isso porque o jogador SABE o tamanho de um
        // rebite. É o truque mais velho de design industrial, e é por isso que
        // toda nave grande de cinema é coberta de painel.
        costura: new THREE.MeshStandardMaterial({ color: '#0b2027', roughness: .62, metalness: .40 }),
        rebite: new THREE.MeshStandardMaterial({ color: '#c9a04a', roughness: .30, metalness: .85 }),
        recesso: new THREE.MeshStandardMaterial({ color: '#081a20', roughness: .85, metalness: .10 }),
        porcelana: new THREE.MeshStandardMaterial({ color: '#c6b49b', roughness: .63, metalness: .03, vertexColors: true }),
        /**
         * A CHAPA DA MANDÍBULA.
         *
         * Ela usava `porcelana`, o creme mais CLARO da paleta — a mesma cor do
         * rosto. Fotografada, virava uma placa pálida arredondada pendurada
         * embaixo da cara: um babador. Numa cabeça-máquina a mandíbula é peça
         * MÓVEL, e peça móvel não tem a mesma cor do casco fixo; ela é mais
         * escura e mais metálica, porque é ferramenta.
         *
         * Escurecendo, ela também para de brigar com o rosto pela atenção: o
         * olho vai para a cara, e a boca só pesa quando ABRE e a garganta
         * acende — que é exatamente quando o jogo quer que o jogador olhe.
         */
        mandibulaPlaca: new THREE.MeshStandardMaterial({
            color: '#3c4a4e', roughness: .38, metalness: .62,
        }),
        brilhoOlho: new THREE.MeshBasicMaterial({ color: '#a0fff1', toneMapped: false }),
        peleEsc: mat64(CORES.peleEsc),
        interior: mat64(CORES.interior),
        brasa: mat64(CORES.brasa, CORES.brasa, 0.9),
        olho: new THREE.MeshStandardMaterial({ color: CORES.olho, roughness: .24, metalness: .08 }),
        iris: new THREE.MeshStandardMaterial({ color: '#98754a', roughness: .36, metalness: .57 }),
        /** O fundo do poço do olho: quase preto, para a lente acender contra ele. */
        recessoOlho: new THREE.MeshStandardMaterial({ color: '#05161c', roughness: .92, metalness: .05 }),
        /** A lente. Ela EMITE — é o que faz um olho de máquina parecer ligado. */
        lente: new THREE.MeshStandardMaterial({
            color: '#0e3b44', roughness: .18, metalness: .35,
            emissive: new THREE.Color('#42bcb1'), emissiveIntensity: .58,
        }),
        pupila: mat64(CORES.pupila),
        dente: mat64(CORES.dente),
        ferida: mat64(CORES.ferida, CORES.ferida, 0.35),
    }), []);

    useEffect(() => () => { cranio.dispose(); jaw.dispose(); brow.dispose(); Object.values(M).forEach(m => m.dispose()); }, [cranio, jaw, brow, M]);

    // Cracks remain seated on the sculpt while the upper face recoils.
    const feridaRefs = useRef<(THREE.Group | null)[]>([]);

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
        // Dois braços acompanham a mandíbula: o queixo não flutua abaixo da
        // máscara quando o chefe escancara a boca. Tudo fica fora da hitbox.
        for (let i = 0; i < 2; i++) {
            const arm = bracosDaMandibula.current[i];
            if (!arm) continue;
            const lado = i === 0 ? -1 : 1;
            const a = b.abertura * .86;
            armScratch.start.set(lado * 2.36, -1.38, 2.53);
            armScratch.end.set(lado * 2.10,
                -1.45 - .68 * Math.cos(a) - 1.55 * Math.sin(a),
                .612 - .68 * Math.sin(a) + 1.55 * Math.cos(a));
            armScratch.span.subVectors(armScratch.end, armScratch.start);
            armScratch.mid.addVectors(armScratch.start, armScratch.end).multiplyScalar(.5);
            arm.position.copy(armScratch.mid);
            const length = armScratch.span.length();
            arm.quaternion.setFromUnitVectors(armScratch.up, armScratch.span.multiplyScalar(1 / length));
            arm.scale.set(1, length, 1);
        }

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
        const blink = dying ? 1 : blinkScale(t, b.abertura);
        const aperto = dying ? Math.max(.04, 1 - beat.rupture) : (1 - b.abertura * .32) * blink;
        for (const o of [olhoE.current, olhoD.current]) if (o) o.scale.y = aperto;
        const franzir = b.abertura * 0.15;
        // ── O ÂNGULO DE REPOUSO DA ARCADA ────────────────────────────────
        // Era 0,18 rad: quase horizontal, com as pontas de fora um tico para
        // cima. Isso é sobrancelha ARQUEADA, e sobrancelha arqueada é susto —
        // parte do porquê a cabeça lia como personagem de desenho assustado.
        //
        // A inclinação agora para antes de atravessar a lente: a raiva fica no
        // contorno, e o franzir ao abrir a boca ainda serve de aviso de ataque.
        if (sobrE.current) sobrE.current.rotation.z = -0.24 - franzir;
        if (sobrD.current) sobrD.current.rotation.z = 0.24 + franzir;

        // Mouth and collision stay anchored. The upper face breathes and recoils.
        if (face.current) {
            const recoil = b.estado === 'abrindo' ? Math.sin(b.t / 0.55 * Math.PI) * 0.09 : 0;
            face.current.position.y = Math.sin(t * 0.55) * 0.035;
            face.current.position.z = -recoil;
        }
        for (const eye of [olhoE.current, olhoD.current]) {
            const pupil = eye?.children[1];
            if (pupil) {
                const targetX = THREE.MathUtils.clamp((naveRef?.current.x ?? 0) * 0.025, -0.14, 0.14);
                const targetY = THREE.MathUtils.clamp(((naveRef?.current.y ?? 5) - 5) * 0.025, -0.12, 0.1);
                pupil.position.x = followGaze(pupil.position.x, targetX, dt);
                pupil.position.y = followGaze(pupil.position.y, targetY, dt);
            }
        }

        // ── O PISCA DE DANO ──────────────────────────────────────────────
        if (flashRef.current > 0) flashRef.current = Math.max(0, flashRef.current - dt * 4.5);
        const brilho = flashRef.current;
        M.pele.emissive.setRGB(brilho * 0.9, brilho * 0.35, brilho * 0.3);
        M.peleEsc.emissive.setRGB(brilho * 0.7, brilho * 0.25, brilho * 0.22);
        M.porcelana.emissive.setRGB(brilho * .42, brilho * .22, brilho * .06);

        // ── AS FERIDAS ───────────────────────────────────────────────────
        const perdida = 1 - f12.vida / VIDA_MAXIMA;
        feridaRefs.current.forEach((m, i) => {
            if (!m) return;
            const limiar = (i + 0.6) / detail.length;
            const aberta = THREE.MathUtils.clamp((perdida - limiar) * 4, 0, 1);
            m.visible = aberta > 0.02;
            if (face.current) m.position.copy(face.current.position);
        });
    });

    // Meia-largura do crânio em unidades locais (a escala vem no group).
    const R = 3.6;

    return (
        <group ref={raiz} name="cabeca" scale={ESCALA / R} position={[0, ALTURA_DA_CABECA, ARENA.zCabeca]}>
            {/* ── O CRÂNIO ── */}
            <mesh material={M.pele} geometry={cranio} />

            {/* ── AS CHAPAS ──
                Três costuras horizontais em alturas diferentes. Elas não são
                enfeite: são a régua que diz ao olho que a cabeça é gigante. Sem
                elas, o crânio é uma esfera lisa e uma esfera lisa não tem
                tamanho. Ficam ligeiramente ACIMA da casca (raio um pouco maior)
                para não brigarem em profundidade com ela. */}
            {seams.map((g, i) => <mesh key={i} geometry={g} material={M.costura} />)}
            {Array.from({length: 14}, (_,i) => <mesh key={i} material={M.rebite}
                position={shellPoint(.55, Math.PI*(1.02+i/13*.96))}>
                <sphereGeometry args={[.07, 8, 6]} />
            </mesh>)}

            <group ref={face}>
            <Floor12BossCrown />
            <Floor12Facework material={M.porcelana} geometry={faceAssets.sculpt} rims={faceAssets.rims} />
            {/* têmporas achatadas, para não ser uma bola perfeita */}
            <mesh material={M.peleEsc} position={[0, R * 0.25, -R * 0.25]}>
                <sphereGeometry args={[R * 0.70, 16, 10]} />
            </mesh>

            {/* ── OS OLHOS ── */}
            {[[-1, olhoE, sobrE] as const, [1, olhoD, sobrD] as const].map(([lado, ro, rs]) => (
                <React.Fragment key={lado}>
                    {/* ── ISTO ERA UM OLHO DE KIKO ────────────────────────
                        Era uma esclera BRANCA de raio 0,78 com uma íris marrom
                        de 0,265 por cima, projetada para a frente do rosto. O
                        dono do jogo olhou e disse que a cabeça parecia o Kiko —
                        e estava certo: olho grande, redondo, com branco à mostra
                        é rosto de desenho humano assustado. Máquina não tem
                        esclera.

                        Agora é uma LENTE: um poço escuro, um anel de latão, e um
                        ponto aceso pequeno lá dentro. O que olha de volta é um
                        instrumento, não um menino.

                        A ordem dos filhos importa: o laço de quadro pega
                        `children[1]` para mirar a lente no avião do jogador.
                        Filho 0 é o poço (fixo), filho 1 é o que segue. */}
                    <group ref={ro} position={[lado * 1.55, 1.15, 3.26]}>
                        {/* O plano escuro é parte da máscara, não uma esclera clara.
                            Por estar na frente da porcelana, a lente permanece
                            legível até com luz forte e vista de celular. */}
                        <mesh material={M.recessoOlho} position={[0, 0, -.15]} scale={[1.02, .71, .18]}>
                            <sphereGeometry args={[1, 10, 6]} />
                        </mesh>
                        <group position={[0, 0, .10]}>
                            <mesh material={M.iris}>
                                <torusGeometry args={[.36, .065, 7, 20]} />
                            </mesh>
                            <mesh material={M.lente} scale={[1, 1, .52]}>
                                <sphereGeometry args={[.22, 16, 10]} />
                            </mesh>
                            <mesh material={M.brilhoOlho} position={[0, 0, .13]}>
                                <sphereGeometry args={[.05, 8, 6]} />
                            </mesh>
                        </group>
                    </group>
                    {/* A ARCADA desceu e engrossou: ela projeta sobre o poço e o
                        que sobra do olho é o ponto aceso no escuro. */}
                    <mesh ref={rs} geometry={brow} material={M.peleEsc}
                        position={[lado * 1.55, 2.05, 3.30]} scale={[1.14, .96, 1.05]} />
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
                <mesh material={M.interior} position={[0, -.12, -.35]} scale={[2.38, 1.65, .72]}>
                    <sphereGeometry args={[1, 32, 20]} />
                </mesh>
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
                {/* ── DENTES DE MÁQUINA, NÃO DE BONECO ──
                    Seis retângulos iguais e brancos eram o sorriso de um
                    boneco infantil. Dente de máquina velha é peça trocada:
                    alturas diferentes, um que caiu, uma coroa de latão. */}
                {DENTES_DE_CIMA.map(([x, sx, sy, latao], i) => sy > 0 && (
                    <mesh key={i} material={latao ? M.rebite : M.dente} geometry={tooth}
                        position={[x, .84 + (1 - sy) * .27, 1.06 - x*x*.055]} rotation={[0, -x*.055, (i % 2 ? .05 : -.04)]} scale={[sx, sy, 1]} />
                ))}
                {/* a mandíbula: pivô ATRÁS, para ela girar como maxilar */}
                <group ref={mandibula} position={[0, 0.5, -0.9]}>
                    <mesh geometry={jaw} material={[M.mandibulaPlaca, M.interior]} position={[0, -.75, 1.15]} />
                    {/* ── A FERRAGEM DO QUEIXO ──
                        Lisa, a mandíbula era uma tigela escura pendurada: a peça
                        que mais barateava a cabeça. Rebite e tira de latão dizem
                        "chapa aparafusada", e acompanham o giro por serem filhos
                        do mesmo grupo. O Z segue a curva da chapa (-0,052·x²). */}
                    {[-.55, -1.62].flatMap((y, fila) => Array.from({ length: fila ? 7 : 9 }, (_, i) => {
                        const n = fila ? 7 : 9, x = (i / (n - 1) - .5) * (fila ? 2.6 : 3.8);
                        return <mesh key={`${fila}-${i}`} material={M.rebite}
                            position={[x, y, 2.37 - .052 * x * x]}>
                            <sphereGeometry args={[.075, 8, 6]} />
                        </mesh>;
                    }))}
                    <mesh material={M.rebite} position={[0, -1.1, 2.39]}>
                        <boxGeometry args={[.16, 1.05, .07]} />
                    </mesh>
                    {DENTES_DE_BAIXO.map(([x, sx, sy, latao], i) => sy > 0 && (
                        <mesh key={i} material={latao ? M.rebite : M.dente} geometry={tooth}
                            position={[x, -.18 - (1 - sy) * .27, 2.10 - x*x*.055]} rotation={[0, -x*.055, Math.PI + (i % 2 ? -.05 : .04)]} scale={[sx, sy, 1]} />
                    ))}
                </group>
            </group>

            {[-1, 1].map((lado, i) => (
                <mesh key={lado} ref={m => { bracosDaMandibula.current[i] = m; }} material={M.mandibulaPlaca}>
                    <cylinderGeometry args={[.11, .15, 1, 8]} />
                </mesh>
            ))}

            {/* ── AS FERIDAS ── */}
            {detail.map((crack, i) => (
                <group key={i} ref={g => { feridaRefs.current[i] = g; }} visible={false}>
                    <mesh material={M.brasa} geometry={crack.ember} />
                    <mesh material={M.peleEsc} geometry={crack.edge} />
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
