import { useEffect as useDisposeEffects } from 'react';
import { f12Transformation, F12_PALETTE as FP } from './f12Presentation';
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
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Avatar64, useAvatarRefs, type AvatarRefs } from './Floor5Player64';
import { f12, NAVE, ENQUADRAMENTO, type Nave } from './f12Boss';

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
    // o irmão é o mesmo robô do andar 5 com a paleta azedada
    // Mais claro que antes: o cinza-azedo continua dizendo "o irmão mais
    // pobre", mas no valor antigo ele sumia contra as nuvens e lia como inimigo.
    irmao: '#8cc4b4',   // verde-água desbotado: da família do jogador, nunca cinza de destroço
    irmaoEsc: '#3f6f68',
    irmaoLuz: '#3fe0c8',   // luz amiga: mesmo verde-água do jogador, nunca a cor de inimigo
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
 * Material liso do andar 12. O `mat64` do andar 5 é Lambert com flatShading:
 * certo para o plástico N64 de lá, mas aqui ele facetava as quinas
 * arredondadas e o avião voltava a parecer papelão. Latão ganha metal.
 */
const mat64 = (color: string, emissive = '#000000', ei = 0) => {
    const c = new THREE.Color(color);
    const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    const latao = hsl.h > .08 && hsl.h < .17 && hsl.s > .35;
    return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei,
        roughness: latao ? .38 : .5, metalness: latao ? .65 : .08 });
};

const ENVERGADURA_MODELADA = 5.30;
const ESCALA_DO_AVIAO = ENQUADRAMENTO.envergadura / ENVERGADURA_MODELADA;

/**
 * Uma caixa — mas de quina arredondada. Caixa de quina viva é o que fazia o
 * avião, o objeto mais perto da câmera, parecer papelão: o chanfro pega o
 * brilho do sol na borda. As geometrias são guardadas por medida.
 */
const caixas = new Map<string, THREE.BufferGeometry>();
const caixa = (a: [number, number, number]) => {
    const k = a.join(',');
    let g = caixas.get(k);
    if (!g) {
        g = new RoundedBoxGeometry(a[0], a[1], a[2], 3, Math.min(...a) * .38);
        caixas.set(k, g);
    }
    return g;
};
const B: React.FC<{ args: [number, number, number]; p?: [number, number, number]; r?: [number, number, number]; m: THREE.Material }> =
    ({ args, p = [0, 0, 0], r = [0, 0, 0], m }) => (
        <mesh position={p} rotation={r} material={m} geometry={caixa(args)} />
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
    const asaE = useRef<THREE.Group>(null), asaD = useRef<THREE.Group>(null);
    const piso = useRef<THREE.Group>(null), teto = useRef<THREE.Group>(null);
    const cauda = useRef<THREE.Group>(null), nariz = useRef<THREE.Group>(null);
    const helice = useRef<THREE.Group>(null), vidro = useRef<THREE.Group>(null);
    const M = useMemo(() => ({
        hull: mat64(FP.hull), dark: mat64(FP.hullDark), ivory: mat64(FP.ivory),
        brass: mat64(FP.brass), trim: mat64(FP.brassDark),
        engine: mat64(FP.friendly, FP.friendly, .8), black: mat64('#091a24'),
        glass: new THREE.MeshLambertMaterial({ color: FP.glass, transparent: true, opacity: .34,
            depthWrite: false, side: THREE.DoubleSide }),
        // ── A HÉLICE ERA TRÊS BARRAS PRETAS ATRAVESSANDO O ROBÔ ──────────
        //
        // Três pás opacas de 1,42, e nada mais. No plano de diálogo do
        // TROCO-63 — o único plano de apresentação do companheiro — elas
        // desenhavam um X preto sólido por cima do corpo dele e do casco. Uma
        // hélice de verdade não se vê parada: na rotação ela vira um DISCO
        // translúcido, e é só a essa velocidade que as pás somem.
        //
        // Então as duas coisas existem e trocam de lugar conforme a rotação: a
        // pá some enquanto o disco aparece. Os dois sem `depthWrite`, porque
        // uma hélice girando não recorta o que está atrás dela.
        pa: new THREE.MeshLambertMaterial({ color: FP.hullDark, transparent: true,
            opacity: 1, depthWrite: false }),
        disco: new THREE.MeshLambertMaterial({ color: FP.hullDark, transparent: true,
            opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    }), []);
    const wing = useMemo(() => {
        const shape = new THREE.Shape();
        shape.moveTo(0, -.34); shape.lineTo(1.82, -.28); shape.quadraticCurveTo(2.13, -.22, 2.03, .12);
        shape.lineTo(1.79, .37); shape.lineTo(0, .53); shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: .12, bevelEnabled: true,
            bevelSize: .035, bevelThickness: .025, bevelSegments: 1, steps: 1, curveSegments: 6 });
        g.rotateX(Math.PI / 2); g.translate(0, .06, 0); return g;
    }, []);
    useDisposeEffects(() => () => { wing.dispose(); Object.values(M).forEach(m => m.dispose()); }, [wing, M]);
    useFrame(({ clock }, rawDt) => {
        const dt = Math.min(rawDt, .05), a = f12Transformation(aberturaRef.current);
        for (const [ref, side] of [[asaE, -1], [asaD, 1]] as const) if (ref.current) {
            ref.current.rotation.z = side * ((1 - a.wings) * Math.PI / 2 - a.wingRebound * .08);
            ref.current.scale.x = side * (.72 + a.wings * .28);
        }
        if (piso.current) {
            piso.current.scale.set(1 - a.shell * .07, 1 - a.shell * .16, .86 + a.shell * .40);
            piso.current.position.y = -.42 - a.shell * .05;
        }
        if (teto.current) {
            teto.current.position.set(0, 1.16 - a.canopy * .96, a.canopy * 1.06);
            teto.current.rotation.x = -.35 * a.canopy;
            teto.current.scale.z = 1 - a.canopy * .48;
        }
        if (cauda.current) {
            cauda.current.position.z = .83 + a.tail * .98;
            cauda.current.rotation.x = -(1 - a.tail) * Math.PI / 2;
        }
        if (nariz.current) nariz.current.position.z = -.65 - a.doors * .69;
        if (vidro.current) {
            vidro.current.scale.y = Math.max(.02, a.canopy);
            vidro.current.position.y = -.05 + a.canopy * .19;
        }
        if (helice.current) {
            const power = (heliceRef?.current ?? 1) * a.engine;
            const giro = (6 + power * 46) * a.engine;
            helice.current.rotation.z += dt * giro;
            helice.current.scale.setScalar(Math.max(.01, a.engine));
            // A TROCA. Abaixo de ~8 rad/s ainda dá para contar as pás; acima de
            // ~26 o olho já não as separa e o que resta é o disco. No meio os
            // dois coexistem de leve, que é o borrão.
            const borrao = THREE.MathUtils.clamp((giro - 8) / 18, 0, 1);
            M.pa.opacity = 1 - borrao * 0.88;
            M.disco.opacity = borrao * 0.30;
        }
        M.engine.emissiveIntensity = .25 + a.engine * (1.1 + Math.sin(clock.elapsedTime * 24) * .12);
    });
    return <group name="elevador-em-transformacao">
        <group ref={piso} position={[0, -.42, 0]}>
            <B args={[1.30, .34, 1.82]} m={M.hull} />
            <B args={[1.34, .09, 1.86]} p={[0, .21, 0]} m={M.brass} />
            <B args={[.88, .29, 2.08]} p={[0, -.20, -.06]} m={M.dark} />
            <B args={[.10, .045, 1.70]} p={[-.42, .28, 0]} m={M.trim} />
            <B args={[.10, .045, 1.70]} p={[.42, .28, 0]} m={M.trim} />
        </group>
        <group ref={teto} position={[0, 1.16, 0]}>
            <B args={[1.36, .12, 1.70]} m={M.hull} />
            <B args={[1.39, .035, 1.74]} p={[0, .075, 0]} m={M.brass} />
            <B args={[.80, .035, .90]} p={[0, -.079, 0]} m={M.ivory} />
        </group>
        {[-1, 1].map(side => <group key={side} ref={side < 0 ? asaE : asaD}
            position={[side * .64, -.19, -.05]}>
            <mesh geometry={wing} material={M.ivory} />
            <B args={[1.86, .025, .07]} p={[1.0, .12, -.19]} m={M.brass} />
            <B args={[1.48, .025, .10]} p={[.87, .12, .28]} m={M.hull} />
            {[.38, .79, 1.2, 1.61].map(x => <B key={x} args={[.035, .026, .46]} p={[x, .13, .04]} m={M.trim} />)}
            <B args={[.14, .12, .64]} p={[1.78, .01, -.11]} m={M.hull} />
            <B args={[.07, .06, .16]} p={[1.78, .02, -.49]} m={M.engine} />
            <mesh position={[.06, .02, .08]} rotation={[Math.PI / 2, 0, 0]} material={M.brass}>
                <cylinderGeometry args={[.12, .12, .86, 10]} />
            </mesh>
        </group>)}
        <group ref={nariz} position={[0, 0, -.65]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={M.hull}>
                <cylinderGeometry args={[.40, .54, .66, 12]} />
            </mesh>
            <mesh position={[0, 0, -.34]} material={M.brass}>
                <torusGeometry args={[.37, .065, 8, 24]} />
            </mesh>
            <B args={[.024, .64, .028]} p={[0, 0, -.39]} m={M.trim} />
            <group ref={helice} position={[0, 0, -.45]}>
                {[0, Math.PI / 3, Math.PI * 2 / 3].map(angle => <B key={angle} args={[1.42, .12, .055]} r={[0, 0, angle]} m={M.pa} />)}
                {/* o disco: é ele que a hélice VIRA quando gira de verdade */}
                <mesh material={M.disco} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[.71, .71, .012, 24, 1, true]} />
                </mesh>
                <mesh material={M.disco} position={[0, 0, .004]}>
                    <circleGeometry args={[.71, 24]} />
                </mesh>
                <mesh material={M.brass}><sphereGeometry args={[.16, 12, 8]} /></mesh>
            </group>
        </group>
        <group ref={cauda} position={[0, .10, .83]}>
            <B args={[.45, .23, .90]} p={[0, -.13, -.15]} m={M.hull} />
            <B args={[1.45, .10, .40]} p={[0, .02, .16]} m={M.ivory} />
            <B args={[.10, .76, .54]} p={[0, .39, .18]} r={[-.19, 0, 0]} m={M.hull} />
            <B args={[.13, .14, .48]} p={[0, .73, .12]} m={M.brass} />
        </group>
        <group ref={vidro} position={[0, .14, -.39]} rotation={[-.30, 0, 0]}>
            <B args={[.84, .38, .045]} m={M.glass} />
            <B args={[.88, .04, .065]} p={[0, .20, 0]} m={M.brass} />
            {[-.43, .43].map(x => <B key={x} args={[.035, .40, .065]} p={[x, 0, 0]} m={M.brass} />)}
        </group>
        <B args={[.75, .11, .30]} p={[0, -.04, -.34]} r={[-.3, 0, 0]} m={M.dark} />
        {[-.20, 0, .20].map((x, i) => <mesh key={i} position={[x, .036, -.33]} rotation={[-Math.PI / 2, 0, 0]} material={i === 1 ? M.engine : M.brass}>
            <circleGeometry args={[.055, 12]} />
        </mesh>)}
        <B args={[.045, .27, .045]} p={[0, -.015, .05]} r={[.2, 0, 0]} m={M.trim} />
        <B args={[.44, .19, .49]} p={[0, -.14, .39]} m={M.dark} />
    </group>;
};

/**
 * O AVIÃO DO JOGADOR.
 *
 * Ele lê `nave` (o estado puro) e desenha. Toda a física mora em `f12Boss`;
 * este componente não decide nada — se ele decidisse, o teste do módulo puro
 * estaria testando outra coisa que não o jogo.
 */
function sentar(refs: AvatarRefs) {
    if (refs.body.current) refs.body.current.rotation.y = Math.PI;
    for (const leg of [refs.legL, refs.legR]) if (leg.current) leg.current.rotation.x = -1.5;
    for (const arm of [refs.armL, refs.armR]) if (arm.current) arm.current.rotation.x = -1.15;
    if (refs.shadow.current) refs.shadow.current.visible = false;
}

export const AviaoDoJogador: React.FC<{
    naveRef: React.MutableRefObject<Nave>;
    aberturaRef: React.MutableRefObject<number>;
    heliceRef?: React.MutableRefObject<number>;
    /** Escondido durante a primeira pessoa da introdução. */
    visivelRef?: React.MutableRefObject<boolean>;
}> = ({ naveRef, aberturaRef, heliceRef, visivelRef }) => {
    const raiz = useRef<THREE.Group>(null);
    const visual = useRef<THREE.Group>(null);
    const refs = useAvatarRefs();
    const sentado = useRef(false);

    useFrame((state) => {
        const g = raiz.current; if (!g) return;
        const n = naveRef.current;
        g.position.set(n.x, n.y, 0);
        g.visible = visivelRef ? visivelRef.current : true;
        if (visual.current) {
            const unfolding = f12.fase === 'virando';
            const lift = unfolding ? Math.sin(Math.PI * aberturaRef.current) : 0;
            g.position.y -= lift * .35;
            visual.current.rotation.z = n.rolagem + Math.sin(aberturaRef.current * Math.PI * 3) * lift * .10;
            // o nariz sobe/desce com a velocidade vertical: dá peso ao avião
            visual.current.rotation.x = THREE.MathUtils.clamp(-n.vy * 0.045, -0.35, 0.35) + lift * .12;
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
                <CascoDoElevador aberturaRef={aberturaRef} heliceRef={heliceRef} />
                {/* o piloto, sentado, encolhido para caber na cabine */}
                <group position={[0, -0.44, 0.25]} scale={0.46}>
                    <Avatar64 refs={refs} />
                </group>
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
    introRef?: React.MutableRefObject<number>;
}> = ({ naveRef, falandoRef, introRef }) => {
    const raiz = useRef<THREE.Group>(null);
    const visual = useRef<THREE.Group>(null);
    const helice = useRef<THREE.Group>(null);
    const cabeca63 = useRef<THREE.Group>(null);
    const bracos63 = useRef<(THREE.Group | null)[]>([]);
    const falaT = useRef(0);
    const ultimoTexto = useRef(-1);
    const luzes = useRef<THREE.MeshStandardMaterial[]>([]);
    const olho = useRef<THREE.MeshStandardMaterial | null>(null);

    const M = useMemo(() => ({
        corpo: mat64('#91a1a4'), corpoEsc: mat64('#273e47'),
        metal: mat64(CORES.ferro), metalEsc: mat64(CORES.ferroEsc),
        helice: mat64(CORES.helice),
        luz: () => mat64(CORES.irmaoLuz, CORES.irmaoLuz, 1.1),
        olho: mat64('#75e6e0', '#75e6e0', 0.8),
    }), []);

    useDisposeEffects(() => () => {
        const materials = new Set([M.corpo, M.corpoEsc, M.metal, M.metalEsc, M.helice, M.olho, ...luzes.current]);
        materials.forEach(m => m?.dispose());
    }, [M]);
    useFrame((state, rawDt) => {
        const g = raiz.current; if (!g) return;
        const dt = Math.min(rawDt, 0.05);
        const n = naveRef.current;
        const introducing = f12.fase === 'intro' || f12.fase === 'virando';
        const rawEntry = introducing ? THREE.MathUtils.clamp(((introRef?.current ?? 0) - .67) / .22, 0, 1) : 1;
        const entry = rawEntry * rawEntry * (3 - 2 * rawEntry);
        g.visible = !introducing || rawEntry > 0;
        const arc = Math.sin(entry * Math.PI);
        g.position.set(n.x + 18 * (1 - entry), n.y + arc * 2.4 + (1 - entry) * 1.5, .4 + (1 - entry) * 8);
        g.rotation.y = -(1 - entry) * .45;
        if (ultimoTexto.current !== f12.linhaDoDialogo) { ultimoTexto.current = f12.linhaDoDialogo; falaT.current = 0; }
        falaT.current += dt;
        const gesture = Math.sin(Math.PI * Math.min(1, falaT.current / 1.4));
        if (f12.fase === 'encontro') {
            g.position.y += Math.sin(state.clock.elapsedTime * 1.8) * .12;
            bracos63.current.forEach((arm, i) => {
                if (!arm) return;
                const speaking = falandoRef.current;
                const point = f12.linhaDoDialogo >= 3 && i === 1 && falaT.current < 2.3;
                arm.rotation.x = point ? -1.05 : speaking ? -.85 * gesture : 0;
                arm.rotation.z = speaking ? (i ? -1 : 1) * .55 * gesture : 0;
            });
        } else bracos63.current.forEach(arm => { if (arm) arm.rotation.set(0, 0, 0); });
        if (visual.current) {
            visual.current.rotation.z = n.rolagem * 0.8 - arc * .35 - (1 - entry) * Math.PI * 2;
            visual.current.rotation.x = arc * .20;
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
        if (cabeca63.current) {
            cabeca63.current.rotation.y = (n.x < 0 ? .16 : -.16) + Math.sin(t * .9) * .035;
            cabeca63.current.rotation.z = -.09 + (falandoRef.current ? Math.sin(t * 5) * .055 : 0);
            cabeca63.current.rotation.x = falandoRef.current ? Math.sin(t * 8) * .035 : .04;
        }
    });

    return (
        <group ref={raiz} name="troco-63-aviao">
            <group ref={visual} scale={ESCALA_DO_AVIAO * 0.92}>
                {/* carrinho de serviço: chassi baixo e comprido */}
                <B args={[1.0, 0.7, 1.7]} m={M.corpo} />
                <B args={[1.05, 0.1, 1.75]} p={[0, 0.36, 0]} m={M.corpoEsc} />
                <B args={[0.9, 0.55, 0.4]} p={[0, 0.15, -1.0]} m={M.metal} />
                <group ref={helice} position={[0, 0.15, -1.3]}>
                    <B args={[1.7, 0.09, 0.06]} m={M.helice} />
                    <B args={[0.09, 1.7, 0.06]} m={M.helice} />
                </group>
                {/* asas retas e curtas — nada de elegante */}
                <B args={[3.0, 0.1, 0.62]} p={[0, -0.1, 0.1]} m={M.metal} />
                <B args={[0.08, 0.7, 0.5]} p={[0, 0.42, 0.75]} m={M.metalEsc} />
                {/* A mesma família do 64: cromo, juntas pretas, tela ciano,
                    três LEDs no peito e a antena vermelha do modelo antigo. */}
                <group position={[0, .47, .30]}>
                    <B args={[.65, .48, .40]} p={[0, .17, 0]} m={M.corpo} />
                    <B args={[.48, .22, .045]} p={[0, .17, -.23]} m={M.corpoEsc} />
                    {[-.16, 0, .16].map((x, i) => <mesh key={i} position={[x, .17, -.26]}
                        material={(luzes.current[i] ??= M.luz())}>
                        <boxGeometry args={[.10, .085, .03]} />
                    </mesh>)}
                    {[-1, 1].map(side => <group key={side}>
                        <group position={[side * .39, .32, 0]} ref={g => { bracos63.current[side === -1 ? 0 : 1] = g; }}>
                        <mesh material={M.metalEsc}>
                            <sphereGeometry args={[.105, 8, 6]} />
                        </mesh>
                        <B args={[.17, .35, .19]} p={[side * .01, -.17, -.12]} r={[-.60, 0, side * .12]} m={M.corpo} />
                        <B args={[.20, .14, .19]} p={[side * .01, -.30, -.28]} m={M.metalEsc} />
                        </group>
                        <B args={[.21, .15, .36]} p={[side * .19, -.16, -.13]} m={M.corpo} />
                        <B args={[.25, .13, .29]} p={[side * .19, -.23, -.38]} m={M.metalEsc} />
                    </group>)}
                    <group ref={cabeca63} position={[0, .71, .01]}>
                        <B args={[.76, .60, .57]} m={M.corpo} />
                        <B args={[.64, .43, .035]} p={[0, -.015, -.302]} m={M.corpoEsc} />
                        {[-1, 1].map(side => <group key={side}>
                            <mesh position={[side * .16, -.02, -.332]} material={(olho.current ??= M.olho)}>
                                <boxGeometry args={[.16, .105, .02]} />
                            </mesh>
                            <B args={[.23, .06, .04]} p={[side * .16, .075, -.35]}
                                r={[0, 0, side * -.24]} m={M.metalEsc} />
                            <B args={[.085, .22, .31]} p={[side * .41, -.04, .02]} m={M.metalEsc} />
                        </group>)}
                        <B args={[.052, .31, .052]} p={[.19, .43, .06]} r={[0, 0, .30]} m={M.metalEsc} />
                        <mesh position={[.14, .59, .06]} material={luzes.current[0] ?? M.olho}>
                            <sphereGeometry args={[.07, 8, 6]} />
                        </mesh>
                        <B args={[.47, .035, .03]} p={[0, -.19, -.327]} m={M.metal} />
                    </group>
                </group>
                {[-1, 1].map(side => <group key={side} position={[side * .98, -.09, .06]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]} material={M.corpoEsc}>
                        <cylinderGeometry args={[.18, .23, .68, 10]} />
                    </mesh>
                    <mesh position={[0, 0, .36]} material={M.olho}>
                        <circleGeometry args={[.14, 12]} />
                    </mesh>
                    <B args={[.09, .10, .40]} p={[0, .04, -.46]} m={M.metal} />
                </group>)}
            </group>
        </group>
    );
};

export { NAVE };
