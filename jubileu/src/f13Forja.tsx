/** A forja do Brokk: fornalha, coifa, bigorna e telheiro. Separada do Floor13Mundo para o co-builder. */
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ILHAS } from './f13Mundo';
import { pbr } from './f13Texturas';
import { P13 } from './Floor13Mundo';
import { FagulhasDaForja } from './f13Fagulhas';
import { BrasasDaFornalha } from './f13Brasas';

/* ----------------------------------------------------------------------------
 * Apoio: cor por vértice e ruído determinístico.
 * Tudo aqui roda uma vez, no carregamento do módulo — nada é alocado por quadro.
 * -------------------------------------------------------------------------- */

/** Ruído barato e determinístico (0..1) a partir de uma posição. */
function ruido(x: number, y: number, z: number): number {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return n - Math.floor(n);
}

/** Grava uma cor por vértice numa geometria: casca do cepo, fuligem da coifa, ferro gasto. */
function corPorVertice(
    geo: THREE.BufferGeometry,
    pintar: (x: number, y: number, z: number, nx: number, ny: number, nz: number, saida: THREE.Color) => void,
): THREE.BufferGeometry {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const cores = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
        pintar(pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0, c);
        cores[i * 3] = c.r; cores[i * 3 + 1] = c.g; cores[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    return geo;
}

/** Sulco de casca do cepo: aplicado no tronco e na borda do topo, para casarem. */
function sulcoCasca(a: number, y: number): number {
    return 1 + Math.cos(a * 7) * .05 + Math.cos(a * 3 + y * 6) * .035 + Math.sin(y * 11 + a * 2) * .02;
}

/* ----------------------------------------------------------------------------
 * Materiais compartilhados: um objeto para cada uso, criados uma única vez.
 * -------------------------------------------------------------------------- */

/** Ferro fosco dos adereços: tenaz, martelo, aros do balde, pinos. */
const MAT_FERRO = new THREE.MeshStandardMaterial({ color: '#33343a', metalness: .8, roughness: .45, flatShading: true });
/** Ferro escuro com arestas gastas — exige cor por vértice na geometria (bigorna). */
const MAT_FERRO_GASTO = new THREE.MeshStandardMaterial({ color: '#9ba1ab', metalness: .86, roughness: .34, flatShading: true, vertexColors: true });
/** Aço polido: face do martelo. */
const MAT_ACO = new THREE.MeshStandardMaterial({ color: '#a9aeba', metalness: .9, roughness: .25 });
/** Madeira com cor por vértice: casca e anéis do cepo, toras da lenha. */
const MAT_MADEIRA = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, ...pbr('carvalho', .5, 1.5) });
/** Pedra da coifa, com a fuligem pintada por vértice. */
const MAT_COIFA = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, ...pbr('rocha', 2.4, 1.6) });
/** Aduelas do balde de têmpera. */
const MAT_ADUELA = new THREE.MeshStandardMaterial({ color: '#8a6a48', flatShading: true, ...pbr('tabua', 1.2, 1) });
/** Água parada dentro do balde. */
const MAT_AGUA = new THREE.MeshStandardMaterial({ color: '#1d2f38', metalness: .35, roughness: .08 });
/** Marca de calor em volta da boca da coifa: só brilho de material, nenhuma luz nova. */
const MAT_BRASA = new THREE.MeshStandardMaterial({ color: '#3a1206', emissive: '#c04a12', emissiveIntensity: .5, roughness: 1 });

/* ----------------------------------------------------------------------------
 * Geometrias próprias: criadas uma vez, fora do quadro de render.
 * -------------------------------------------------------------------------- */

/** Casca do cepo: tronco irregular, escuro na base e mais claro onde bate o sol. */
const GEO_CEPO_CASCA = (() => {
    const g = new THREE.CylinderGeometry(.27, .30, .6, 16, 5, true);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const a = Math.atan2(z, x);
        const r = Math.hypot(x, z) * sulcoCasca(a, y);
        pos.setX(i, Math.cos(a) * r);
        pos.setZ(i, Math.sin(a) * r);
    }
    g.computeVertexNormals();
    return corPorVertice(g, (x, y, z, _nx, _ny, _nz, c) => {
        const t = THREE.MathUtils.clamp(y / .6 + .5, 0, 1); // 0 = base, 1 = topo
        const n = ruido(x * 11, y * 11, z * 11);
        const claro = .26 + t * .34 + n * .18; // casca escura em baixo, mais clara em cima
        c.setRGB(claro, claro * .72, claro * .5);
    });
})();

/** Topo do cepo: anéis de crescimento serrados e a casca grossa na borda. */
const GEO_CEPO_ANEL = (() => {
    const g = new THREE.RingGeometry(.015, .27, 16, 5);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const r = Math.hypot(x, y);
        if (r > .25) {
            // a borda recebe o mesmo sulco do tronco, no mesmo ângulo e na mesma altura
            const a = Math.atan2(-y, x);
            const rr = r * sulcoCasca(a, .3);
            pos.setX(i, Math.cos(a) * rr);
            pos.setY(i, -Math.sin(a) * rr);
        }
    }
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return corPorVertice(g, (x, _y, z, _nx, _ny, _nz, c) => {
        const r = Math.hypot(x, z);
        const anel = Math.sin(r * 120) * .5 + .5;
        let claro = .34 + anel * .3 + ruido(x * 30, z * 30, 0) * .07;
        if (r > .245) claro *= .55; // casca na borda
        if (r < .03) claro *= .8;   // miolo
        c.setRGB(claro, claro * .68, claro * .46);
    });
})();

/** Corpo da bigorna: pé alargado, cintura estreita, corpo, mesa e calcanhar (perfil extrudado). */
const GEO_BIGORNA_CORPO = (() => {
    const perfil = new THREE.Shape();
    perfil.moveTo(-.132, 0);
    perfil.lineTo(.142, 0);        // pé alargado
    perfil.lineTo(.156, .05);
    perfil.lineTo(.088, .092);     // afina para a cintura
    perfil.lineTo(.072, .148);
    perfil.lineTo(.092, .196);     // o corpo abre de novo
    perfil.lineTo(.118, .214);
    perfil.lineTo(.206, .214);     // calcanhar saliente
    perfil.lineTo(.206, .276);
    perfil.lineTo(-.108, .276);    // mesa de trabalho
    perfil.lineTo(-.108, .236);
    perfil.lineTo(-.122, .196);    // corpo pelo lado esquerdo
    perfil.lineTo(-.088, .148);
    perfil.lineTo(-.094, .092);
    perfil.lineTo(-.162, .05);     // pé alargado do outro lado
    perfil.closePath();
    const g = new THREE.ExtrudeGeometry(perfil, { depth: .17, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -.085);
    g.computeVertexNormals();
    return corPorVertice(g, (x, y, z, _nx, ny, _nz, c) => {
        // ferro escuro; o topo da mesa e as arestas chanfradas ficam gastos e claros
        const gasto = THREE.MathUtils.clamp(ny * 1.25 - .3, 0, 1);
        const claro = .34 + gasto * .62 + ruido(x * 45, y * 45, z * 45) * .07;
        c.setRGB(claro, claro, claro * 1.03);
    });
})();

/** Chifre cônico e curvado para cima, afinando até a ponta polida. */
const GEO_BIGORNA_CHIFRE = (() => {
    const g = new THREE.ConeGeometry(.08, .28, 12, 8);
    g.rotateZ(Math.PI / 2); // eixo passa a ser x, com a ponta em -x
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = THREE.MathUtils.clamp((.14 - x) / .28, 0, 1); // 0 = base, 1 = ponta
        pos.setY(i, pos.getY(i) + t * t * .06);                 // sobe um pouco na ponta
        pos.setX(i, x - t * t * .02);
    }
    g.computeVertexNormals();
    return corPorVertice(g, (x, _y, _z, _nx, _ny, _nz, c) => {
        const t = THREE.MathUtils.clamp((.14 - x) / .28, 0, 1);
        const claro = .34 + t * .58; // a ponta é a parte mais gasta
        c.setRGB(claro, claro, claro * 1.03);
    });
})();

/** Coifa de pedra com fuligem: preta no alto (junto da chaminé) e marrom-avermelhada na boca. */
const GEO_COIFA = (() => {
    const boca = new THREE.Color('#a85a34');
    const meio = new THREE.Color('#472b1c');
    const alto = new THREE.Color('#0f0b0a');
    const calor = new THREE.Color('#c85a1e');
    const g = new THREE.CylinderGeometry(.28, .75, 1, 4, 6);
    return corPorVertice(g, (x, y, z, _nx, _ny, _nz, c) => {
        const t = THREE.MathUtils.clamp(y + .5, 0, 1); // 0 = boca, 1 = alto
        if (t < .4) c.copy(boca).lerp(meio, t / .4);
        else c.copy(meio).lerp(alto, (t - .4) / .6);
        if (t < .14) c.lerp(calor, (1 - t / .14) * .7); // marca de calor em volta da boca
        c.multiplyScalar(.86 + ruido(x * 5, y * 7, z * 5) * .28); // fuligem manchada, não degradê liso
    });
})();

/** Tora serrada: casca escura nas laterais e anéis claros nos topos. */
const GEO_LENHA = (() => {
    const g = new THREE.CylinderGeometry(.075, .075, .72, 9, 1);
    g.rotateZ(Math.PI / 2);
    g.computeVertexNormals();
    return corPorVertice(g, (x, y, z, nx, _ny, _nz, c) => {
        if (Math.abs(nx) > .6) {
            const r = Math.hypot(y, z);
            const anel = Math.sin(r * 130) * .5 + .5;
            const claro = .62 + anel * .22 - r * .8;
            c.setRGB(claro, claro * .8, claro * .58);
        } else {
            const n = ruido(x * 12, y * 12, z * 12);
            const claro = .28 + n * .22;
            c.setRGB(claro, claro * .7, claro * .48);
        }
    });
})();

/** A forja: bigorna, fogo e um telheiro. */
export const Forja: React.FC = () => {
    const ilha = ILHAS.find((i) => i.id === 'forja')!;
    const fogo = useRef<THREE.PointLight>(null);
    useFrame(({ clock }) => { if (fogo.current) fogo.current.intensity = 6 + Math.sin(clock.elapsedTime * 13) * 1.5 + Math.sin(clock.elapsedTime * 7) * 1; });
    return <group position={[ilha.x, ilha.y, ilha.z - 1.5]}>
        {/* a fornalha: pedra de cantaria, boca em arco e a coifa afunilando até a chaminé */}
        <mesh position={[0, .5, 0]} castShadow><boxGeometry args={[1.6, 1, 1.2]} /><meshStandardMaterial color="#a89c8c" {...pbr('rocha', 1.2, .8)} /></mesh>
        <BrasasDaFornalha />
        {/* a coifa: pedra fuliginosa, preta no alto e queimada de vermelho na boca */}
        <mesh geometry={GEO_COIFA} material={MAT_COIFA} position={[0, 1.6, -.2]} castShadow />
        {/* marca de calor em volta da boca: material quente, não é luz nova */}
        <mesh material={MAT_BRASA} position={[0, 1.12, -.2]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[.745, .045, 5, 4]} /></mesh>
        <mesh position={[0, 3.2, -.2]} castShadow><boxGeometry args={[.38, 2.5, .38]} /><meshStandardMaterial color="#b3a898" {...pbr('rocha', .5, .8)} /></mesh>
        <pointLight ref={fogo} position={[0, 1.5, .5]} color="#ff8a3a" distance={9} intensity={6} />
        {/* a bigorna: cepo com casca e anéis no topo, bigorna de silhueta inteira em cima */}
        <group position={[1.7, 0, .9]} rotation={[0, -.4, 0]}>
            <mesh geometry={GEO_CEPO_CASCA} material={MAT_MADEIRA} position={[0, .3, 0]} castShadow />
            <mesh geometry={GEO_CEPO_ANEL} material={MAT_MADEIRA} position={[0, .601, 0]} />
            <group position={[0, .6, 0]}>
                {/* corpo com cintura, mesa e calcanhar */}
                <mesh geometry={GEO_BIGORNA_CORPO} material={MAT_FERRO_GASTO} castShadow />
                {/* chifre cônico curvado, encaixado na mesa */}
                <mesh geometry={GEO_BIGORNA_CHIFRE} material={MAT_FERRO_GASTO} position={[-.248, .196, 0]} castShadow />
            </group>
            {/* cada martelada solta uma rajada de fagulhas da mesa (f13Fagulhas) */}
            <FagulhasDaForja posicao={[0, .87, 0]} />
        </group>
        {/* postes de tronco com mão-francesa e o telhado de duas águas em turfa */}
        {[[-1.4, -1], [1.4, -1], [-1.4, 1.6], [1.4, 1.6]].map(([x, z]) => (
            <group key={`${x}${z}`} position={[x, 0, z]}>
                <mesh position={[0, 1.35, 0]} castShadow><cylinderGeometry args={[.1, .13, 2.7, 8]} /><meshStandardMaterial color="#5a3d26" {...pbr('carvalho', .3, 1.5)} /></mesh>
                <mesh position={[-Math.sign(x) * .22, 2.45, 0]} rotation={[0, 0, Math.sign(x) * .8]}><boxGeometry args={[.07, .6, .07]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
            </group>
        ))}
        {[-1, 1.6].map((z) => <mesh key={z} position={[0, 2.72, z]}><boxGeometry args={[3.1, .14, .16]} /><meshStandardMaterial color={P13.madeiraEsc} {...pbr('carvalho', .5, .3)} /></mesh>)}
        <mesh position={[0, 3.92, .3]}><boxGeometry args={[.16, .16, 3.8]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>
        {[-1, 1].map((l) => (
            <group key={l}>
                <mesh position={[l * .88, 3.12, .3]} rotation={[0, 0, -l * .78]} castShadow>
                    <boxGeometry args={[2.35, .14, 3.7]} /><meshStandardMaterial color={P13.turfa} {...pbr('grama', 2, .35)} />
                </mesh>
                {/* o forro de tábuas por baixo da turfa: de dentro da forja se vê madeira, não grama chapada */}
                <mesh position={[l * .88 - l * Math.sin(.78) * .08, 3.12 - Math.cos(.78) * .08, .3]} rotation={[0, 0, -l * .78]}>
                    <boxGeometry args={[2.3, .02, 3.65]} /><meshStandardMaterial color="#b08a62" {...pbr('tabua', 1.5, 2)} />
                </mesh>
                {/* caibros por baixo: de dentro da forja se vê a estrutura, não uma tampa */}
                {[-1.2, -.3, .6, 1.5].map((z) => <mesh key={z} position={[l * .82, 3.02, z]} rotation={[0, 0, -l * .78]}><boxGeometry args={[2.25, .09, .09]} /><meshStandardMaterial color={P13.madeiraEsc} /></mesh>)}
            </group>
        ))}

        {/* vida de oficina: tenaz e martelo pendurados na viga da frente */}
        <group position={[-.55, 2.62, 1.5]}>
            {/* pino de ferro saindo da viga */}
            <mesh material={MAT_FERRO} position={[0, .035, .04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.012, .012, .14, 6]} /></mesh>
            {/* argola pendurada no pino */}
            <mesh material={MAT_FERRO} position={[0, 0, -.045]}><torusGeometry args={[.028, .008, 4, 8]} /></mesh>
            {/* haste esquerda e direita, fechadas no topo e abertas na garra */}
            <mesh material={MAT_FERRO} position={[-.028, -.19, -.045]} rotation={[0, 0, -.1]} castShadow><boxGeometry args={[.02, .34, .028]} /></mesh>
            <mesh material={MAT_FERRO} position={[.028, -.19, -.045]} rotation={[0, 0, .1]} castShadow><boxGeometry args={[.02, .34, .028]} /></mesh>
            <mesh material={MAT_FERRO} position={[-.062, -.375, -.045]} rotation={[0, 0, -.5]} castShadow><boxGeometry args={[.018, .1, .03]} /></mesh>
            <mesh material={MAT_FERRO} position={[.062, -.375, -.045]} rotation={[0, 0, .5]} castShadow><boxGeometry args={[.018, .1, .03]} /></mesh>
            {/* rebite do eixo */}
            <mesh material={MAT_FERRO} position={[0, -.02, -.045]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.011, .011, .034, 6]} /></mesh>
        </group>
        <group position={[.5, 2.62, 1.5]}>
            <mesh material={MAT_FERRO} position={[0, .035, .04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.012, .012, .14, 6]} /></mesh>
            <mesh material={MAT_FERRO} position={[0, 0, -.045]}><torusGeometry args={[.028, .008, 4, 8]} /></mesh>
            {/* cabeça apoiada no pino, de face polida, e o cabo pendurado */}
            <mesh material={MAT_FERRO} position={[0, -.075, -.045]} castShadow><boxGeometry args={[.06, .05, .1]} /></mesh>
            <mesh material={MAT_ACO} position={[0, -.075, .007]} castShadow><boxGeometry args={[.058, .048, .012]} /></mesh>
            <mesh material={MAT_FERRO} position={[0, -.29, -.045]} castShadow><boxGeometry args={[.022, .4, .022]} /></mesh>
        </group>

        {/* balde de têmpera: aduelas com aros de ferro e a água preta dentro */}
        <group position={[1.08, 0, 1.18]}>
            <mesh material={MAT_ADUELA} position={[0, .14, 0]} castShadow><cylinderGeometry args={[.18, .145, .28, 10, 1, true]} /></mesh>
            <mesh material={MAT_ADUELA} position={[0, .012, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.148, 10]} /></mesh>
            <mesh material={MAT_FERRO} position={[0, .07, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[.155, .012, 4, 10]} /></mesh>
            <mesh material={MAT_FERRO} position={[0, .225, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[.174, .012, 4, 10]} /></mesh>
            <mesh material={MAT_AGUA} position={[0, .235, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[.163, 10]} /></mesh>
            {/* alça de ferro caída de lado */}
            <mesh material={MAT_FERRO} position={[0, .28, 0]} rotation={[0, .7, 0]}><torusGeometry args={[.175, .008, 4, 10, Math.PI]} /></mesh>
        </group>

        {/* pilha de lenha encostada no canto do telheiro */}
        <group position={[-1.02, 0, 1.02]}>
            {[[-.15, .075], [0, .075], [.15, .075], [-.075, .205], [.075, .205]].map(([z, y]) => (
                <mesh key={`lenha${z}`} geometry={GEO_LENHA} material={MAT_MADEIRA} position={[0, y, z]} castShadow />
            ))}
        </group>

        {/* estoque de ferro bruto no chão, ao lado da fornalha */}
        <group position={[1.14, 0, .34]}>
            {[-.06, 0, .06].map((z, i) => (
                <mesh key={`ferro1${z}`} material={MAT_FERRO} position={[0, .028, z]} rotation={[0, i * .05 - .05, 0]} castShadow>
                    <boxGeometry args={[.4, .055, .05]} />
                </mesh>
            ))}
            {[-.03, .03].map((z, i) => (
                <mesh key={`ferro2${z}`} material={MAT_FERRO} position={[0, .086, z]} rotation={[0, .06 - i * .12, 0]} castShadow>
                    <boxGeometry args={[.4, .055, .05]} />
                </mesh>
            ))}
        </group>
    </group>;
};
