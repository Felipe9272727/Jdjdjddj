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
 * A malha é toda de caixas e esferas de baixa contagem. Nada de GLB: o andar 12
 * carrega zero bytes de asset, e num celular isso é a diferença entre entrar no
 * andar e olhar uma tela preta esperando.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mat64 } from './Floor5Player64';
import {
    f12, ARENA, bocaNoInstante, vulneravel, VIDA_MAXIMA, LIMIAR_DA_VIRADA, BOCA_ALVO,
    ALTURA_DA_CABECA, BOCA_ABAIXO_DO_CENTRO, ESCALA_DA_CABECA,
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

const CORES = {
    pele: '#8d7f9c',        // um cinza-lilás de gesso velho: parede de hotel
    peleEsc: '#6c6079',
    interior: '#2a1420',    // a garganta
    brasa: '#ff7a3a',       // o que arde lá dentro
    olho: '#f4f1e4',
    pupila: '#1a1520',
    dente: '#e9e3d2',
    orbita: '#3b3146',     // a sombra da órbita: é ela que dá o olhar
    latao: '#c9a24a',      // as portas de elevador da coroa
    ferida: '#c8443a',
};

export const Floor12Cabeca: React.FC<{
    /** Sobe quando um tiro entra: a cabeça pisca de dano. */
    flashRef: React.MutableRefObject<number>;
}> = ({ flashRef }) => {
    const raiz = useRef<THREE.Group>(null);
    const mandibula = useRef<THREE.Group>(null);
    const garganta = useRef<THREE.Mesh>(null);
    const olhoE = useRef<THREE.Group>(null);
    const olhoD = useRef<THREE.Group>(null);
    const sobrE = useRef<THREE.Mesh>(null);
    const sobrD = useRef<THREE.Mesh>(null);

    const M = useMemo(() => ({
        pele: mat64(CORES.pele),
        peleEsc: mat64(CORES.peleEsc),
        interior: mat64(CORES.interior),
        brasa: mat64(CORES.brasa, CORES.brasa, 0.9),
        olho: mat64(CORES.olho),
        pupila: mat64(CORES.pupila),
        dente: mat64(CORES.dente),
        orbita: mat64(CORES.orbita),
        latao: mat64(CORES.latao),
        ferida: mat64(CORES.ferida, CORES.ferida, 0.35),
    }), []);

    // As feridas aparecem conforme a vida cai: a cabeça CONTA a luta no corpo,
    // e não só na barra do HUD. Um chefe cuja aparência não muda faz o jogador
    // duvidar de que está acertando.
    const feridas = useMemo(() => ([
        [-1.9, 1.4, 3.3], [2.2, 0.6, 3.2], [-0.7, -1.9, 3.4], [1.4, 2.6, 2.9],
        [-2.6, -0.4, 2.9], [0.4, 3.1, 2.7],
    ] as [number, number, number][]), []);
    const feridaRefs = useRef<(THREE.Mesh | null)[]>([]);

    useFrame((state, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const b = bocaNoInstante(f12.bocaT);
        const t = state.clock.elapsedTime;

        // ── A MANDÍBULA ──────────────────────────────────────────────────
        // Ela GIRA num pivô atrás do queixo, não desliza para baixo: mandíbula
        // que translada lê como gaveta.
        if (mandibula.current) mandibula.current.rotation.x = b.abertura * 0.86;

        // A garganta acende quando abre — é o que faz a boca parecer perigosa
        // em vez de um buraco.
        if (garganta.current) {
            const m = garganta.current.material as THREE.MeshLambertMaterial;
            m.emissiveIntensity = 0.25 + b.abertura * 1.5;
            garganta.current.scale.setScalar(0.85 + b.abertura * 0.3);
        }

        // ── OS OLHOS ─────────────────────────────────────────────────────
        // Apertam quando a boca abre. É o telegrafo redundante: quem estiver
        // olhando para os olhos e não para a boca também vê o ataque vir.
        const aperto = 1 - b.abertura * 0.55;
        for (const o of [olhoE.current, olhoD.current]) if (o) o.scale.y = aperto;
        const franzir = b.abertura * 0.4;
        if (sobrE.current) sobrE.current.rotation.z = -0.18 - franzir;
        if (sobrD.current) sobrD.current.rotation.z = 0.18 + franzir;

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
            m.scale.setScalar(0.2 + aberta * 0.95);
        });
    });

    // Meia-largura do crânio em unidades locais (a escala vem no group).
    const R = 3.6;

    return (
        <group ref={raiz} name="cabeca" scale={ESCALA / R} position={[0, ALTURA_DA_CABECA, ARENA.zCabeca]}>
            {/* ── O CRÂNIO ──
                ACHATADO EM Y, e isso é a diferença entre uma cabeça e um ovo. A
                versão anterior era uma esfera perfeita com uma SEGUNDA esfera
                colada em cima das têmporas, e o resultado na foto era um ovo
                lilás com dois olhos — a peça de cima só alongava o topo. Uma
                cabeça é mais larga que alta e mais alta que funda; esta é
                1,00 x 0,86 x 0,92, e a silhueta passa a ser de crânio. */}
            <mesh material={M.pele} scale={[1, 0.86, 0.92]}>
                <sphereGeometry args={[R, 22, 16]} />
            </mesh>
            {/* a MANDÍBULA do crânio: a caixa da cara, mais estreita que o topo.
                Ela dá o queixo, que é o que faz o rosto ter fim. */}
            <mesh material={M.pele} position={[0, -R * 0.42, R * 0.16]} scale={[0.82, 0.62, 0.78]}>
                <sphereGeometry args={[R, 18, 12]} />
            </mesh>

            {/* ── A COROA DO HOTEL ──
                Uma faixa de portas de elevador em volta da testa. É o único
                lugar do andar que diz de QUEM é esta cabeça: sem ela, ela podia
                ser o chefe de qualquer jogo.

                A PRIMEIRA TENTATIVA VIROU CHIFRE. Eu pus os painéis num círculo
                de raio `R * 0,93`, que é onde a superfície estaria se o crânio
                fosse uma esfera — mas ele é achatado (escala 1 x 0,86 x 0,92), e
                na altura da testa a superfície de verdade está a `R * 0,81` em X
                e `R * 0,75` em Z. Trinta por cento fora da cabeça: na foto eram
                doze velas espetadas no alto do crânio.

                Agora eles seguem a ELIPSE do crânio, e afundam 6% para dentro,
                que é o que faz um adereço parecer preso e não pousado. */}
            {Array.from({ length: 12 }, (_, i) => {
                const a = (i / 12) * Math.PI * 2;
                // A superfície do elipsoide na altura da coroa (ver a nota).
                const alturaRel = 0.50;
                const corte = Math.sqrt(Math.max(0, 1 - (alturaRel / 0.86) ** 2));
                const rx = R * corte * 0.94, rz = R * corte * 0.92 * 0.94;
                return (
                    <group key={i}
                        position={[Math.sin(a) * rx, R * alturaRel, Math.cos(a) * rz]}
                        rotation={[0, a, 0]}>
                        <mesh material={M.latao}><boxGeometry args={[0.5, 0.6, 0.22]} /></mesh>
                        <mesh material={M.peleEsc} position={[0, 0, 0.12]}>
                            <boxGeometry args={[0.06, 0.48, 0.05]} />
                        </mesh>
                    </group>
                );
            })}

            {/* ── OS OLHOS ──
                Fundos numa órbita escura. A versão anterior eram duas bolas
                brancas coladas na frente da esfera, e de longe elas liam como
                olhos de brinquedo em vez de olhos de chefe. A órbita é o que dá
                a sombra que faz o olhar. */}
            {[[-1, olhoE, sobrE] as const, [1, olhoD, sobrD] as const].map(([lado, ro, rs]) => (
                <React.Fragment key={lado}>
                    <mesh material={M.orbita} position={[lado * 1.62, 0.95, R * 0.66]}>
                        <sphereGeometry args={[1.05, 14, 10]} />
                    </mesh>
                    {/* O GLOBO SAI DA ÓRBITA, senão a órbita engole o olho e a
                        cara fica com dois buracos pretos em vez de um olhar. */}
                    <group ref={ro} position={[lado * 1.62, 0.95, R * 0.84]}>
                        <mesh material={M.olho}><sphereGeometry args={[0.8, 14, 10]} /></mesh>
                        <mesh material={M.pupila} position={[lado * 0.1, -0.04, 0.52]}>
                            <sphereGeometry args={[0.33, 12, 8]} />
                        </mesh>
                        {/* o brilho: um ponto claro que faz o olho parecer vivo */}
                        <mesh material={M.olho} position={[lado * 0.24, 0.2, 0.62]}>
                            <sphereGeometry args={[0.1, 8, 6]} />
                        </mesh>
                    </group>
                    {/* SOBRANCELHA como bloco de testa, não como palito. Antes
                        eram barras de 1,7 x 0,34 espetadas para fora da cara, e
                        na foto pareciam duas antenas. */}
                    <mesh ref={rs} material={M.peleEsc} position={[lado * 1.66, 2.02, R * 0.66]}>
                        <boxGeometry args={[1.9, 0.62, 0.66]} />
                    </mesh>
                </React.Fragment>
            ))}

            {/* ── O NARIZ ── */}
            <mesh material={M.peleEsc} position={[0, -0.05, R * 0.86]}>
                <boxGeometry args={[0.9, 1.0, 0.8]} />
            </mesh>

            {/* ── A BOCA ──
                O interior fica FIXO e a mandíbula gira na frente dele: assim a
                garganta já está lá quando a boca abre, em vez de nascer junto.

                A CAVIDADE ENCOLHEU E ENTROU NA CARA. Ela era uma caixa de 4,6 x
                2,6 x 2,2 pendurada abaixo do queixo, e na foto lia como um
                caixote preto preso na cabeça — não como uma boca. Agora ela é
                mais estreita que o crânio e fica embutida na massa do rosto, com
                o lábio de cima marcado por cima dela.

                A altura vem de `BOCA_ABAIXO_DO_CENTRO`, o MESMO número de que a
                hitbox sai. O grupo fica onde a cavidade tem de ficar, e a
                cavidade dentro dele em zero — assim não há dois deslocamentos
                somando por acaso, que foi como o anel de mira acabou em cima do
                nariz na primeira montagem. */}
            <group position={[0, -BOCA_ABAIXO_DO_CENTRO / (ESCALA / R), R * 0.44]}>
                <mesh material={M.interior}>
                    <boxGeometry args={[3.9, 2.3, 1.6]} />
                </mesh>
                <mesh ref={garganta} material={M.brasa} position={[0, -0.15, -0.35]}>
                    <sphereGeometry args={[1.0, 14, 10]} />
                </mesh>
                {/* o lábio de cima: a borda de carne que fecha a cavidade */}
                <mesh material={M.peleEsc} position={[0, 1.22, 0.42]}>
                    <boxGeometry args={[4.2, 0.5, 0.9]} />
                </mesh>
                {/* dentes de cima, presos ao crânio */}
                {[-1.5, -0.9, -0.3, 0.3, 0.9, 1.5].map((x, i) => (
                    <mesh key={i} material={M.dente} position={[x, 0.82, 0.62]}>
                        <boxGeometry args={[0.44, 0.6, 0.4]} />
                    </mesh>
                ))}
                {/* a mandíbula: pivô ATRÁS, para ela girar como maxilar */}
                <group ref={mandibula} position={[0, 0.35, -0.7]}>
                    <mesh material={M.pele} position={[0, -0.7, 0.95]}>
                        <boxGeometry args={[4.0, 1.35, 2.0]} />
                    </mesh>
                    {/* o queixo, arredondado por baixo */}
                    <mesh material={M.pele} position={[0, -1.2, 0.8]} scale={[1, 0.5, 0.7]}>
                        <sphereGeometry args={[1.75, 14, 10]} />
                    </mesh>
                    {[-1.5, -0.9, -0.3, 0.3, 0.9, 1.5].map((x, i) => (
                        <mesh key={i} material={M.dente} position={[x, -0.12, 1.72]}>
                            <boxGeometry args={[0.44, 0.56, 0.4]} />
                        </mesh>
                    ))}
                </group>
            </group>

            {/* ── AS FERIDAS ── */}
            {feridas.map((p, i) => (
                <mesh key={i} material={M.ferida} position={p}
                    ref={(m) => { feridaRefs.current[i] = m; }} visible={false}>
                    <sphereGeometry args={[0.5, 10, 8]} />
                </mesh>
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
