/**
 * Floor3Hazards.tsx — renders the Diabrete's sabotage: spiked ink-strips that
 * "draw themselves" onto platforms ahead, and the cartoon paintbrush pickups
 * that appear every couple of obstacles.
 *
 * The state lives in f3Hazards.ts (shared with Player physics + the rival). A
 * single useFrame here owns the per-frame tick and drives every transform
 * imperatively (live platform X for moving bridges, the staggered spike "draw-
 * on", the brush bob/spin/collect-pop), re-rendering the React list only when
 * the set of live ids changes — same pattern as Floor3.tsx.
 */

import React, { useRef, useReducer } from 'react';
import { useFrame } from '@react-three/fiber';
import { Outlines } from '@react-three/drei';
import * as THREE from 'three';
import {
    hazards, brushes, tickHazards, hazardBox, brushPos, silhuetaDoEspinho,
    type Hazard,
} from './f3Hazards';

const INK = '#0a0712';
// O CREME DO ANDAR. E o mesmo tom das maos, do topo das plataformas e da parte
// clara do Diabrete — nada de cor nova entrando pela porta dos fundos.
const CREME = '#f7f3ea';
// O vermelho ja existe neste andar: e a gravata do Diabrete e a ponta pingando
// do pincel. O espinho e tinta MOLHADA recem-passada, entao termina no mesmo
// vermelho de quem o pintou.
const TINTA_MOLHADA = '#c0271a';

// ── POR QUE O ESPINHO NAO ERA VISTO ──────────────────────────────────────────
//
// Ele era `MeshToonMaterial('#17121d')` com contorno PRETO: exatamente o mesmo
// valor dos postes da ponte e da lateral das plataformas, que sao silhueta
// chapada de tinta. Preto sobre preto. Na foto de altura de jogador os cinco
// espinhos sumiam dentro dos postes da corda — a peca que MACHUCA era a menos
// visivel do andar.
//
// O conserto e o que um desenho de 1930 faz: contorno CLARO. Sobre o tampo
// creme o halo nao aparece e o dente le como tinta preta; sobre o poste preto o
// halo recorta o dente. Uma linha resolve os dois fundos, e custa o mesmo que o
// contorno preto que ela substitui.
const ESPINHO_GEO = (() => {
    // QUATRO ANEIS DE ALTURA, E NAO UM. Com o cone padrao (base + apice, sem
    // divisao nenhuma) a cor por vertice interpola do pe ate a ponta ao longo de
    // toda a face: o dente saia VERMELHO INTEIRO, um cone de transito. Com aneis
    // no meio da para prender o vermelho no ultimo quarto, que e onde a tinta
    // ainda esta molhada, e deixar o resto tinta preta como o resto do andar.
    const g = new THREE.ConeGeometry(0.17, 0.6, 4, 4);
    // A ponta vermelha vai na GEOMETRIA, nao numa malha a mais: com cor por
    // vertice a peca continua sendo um unico draw call por espinho, e a
    // geometria e compartilhada por todos eles.
    const pos = g.attributes.position;
    const cor = new Float32Array(pos.count * 3);
    const seca = new THREE.Color('#1b1520');
    const molhada = new THREE.Color(TINTA_MOLHADA);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
        const t = THREE.MathUtils.smoothstep(pos.getY(i), 0.15, 0.29);   // topo = +0.3
        c.copy(seca).lerp(molhada, t);
        cor[i * 3] = c.r; cor[i * 3 + 1] = c.g; cor[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    return g;
})();

// ── Shared materials ──────────────────────────────────────────────────────────
const spikeMat  = new THREE.MeshToonMaterial({ vertexColors: true });
const strokeMat = new THREE.MeshToonMaterial({ color: INK });
const handleMat = new THREE.MeshToonMaterial({ color: '#e0a94a' });   // warm wood — pops in B&W
const ferruleMat= new THREE.MeshToonMaterial({ color: '#c2c7cf' });
const bristleMat= new THREE.MeshToonMaterial({ color: '#1a1420' });
const tipMat    = new THREE.MeshToonMaterial({ color: TINTA_MOLHADA });   // red ink, ties to the bowtie

const easeOutBack = (t: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ── One spiked ink-strip ──────────────────────────────────────────────────────
// A ordem dos filhos É o contrato com o laço de quadro lá embaixo: filho 0 é o
// traço de tinta, filhos 1..N são os espinhos. (Havia um `spikeRefs` aqui
// coletando cada cone — nunca lido por ninguém, porque quem posiciona é o pai,
// pelo índice. Saiu.)
const SpikeStrip = React.forwardRef<THREE.Group, { hazard: Hazard }>(({ hazard }, ref) => {
    const N = hazard.spikes;
    return (
        <group ref={ref}>
            {/* A BORRADA DE TINTA. Era um `boxGeometry` de 6 cm deitado em
                y=0.03: metade enterrada no tampo, invisivel na altura do olho.
                Uma esfera achatada le como tinta molhada espalhada, e o giro em
                Y tira a simetria de maquina — ninguem passa um pincel reto. */}
            <mesh position={[0, 0.025, 0]} rotation={[0, 0.07, 0]}>
                <sphereGeometry args={[0.5, 14, 6]} />
                <primitive object={strokeMat} attach="material" />
            </mesh>
            {Array.from({ length: N }).map((_, i) => (
                // `castShadow` saiu porque era MENTIRA: o Canvas do jogo nao
                // passa `shadows`, entao `gl.shadowMap.enabled` e falso, o
                // Andar 3 nao tem mapa de sombra e esta prop nunca fez nada
                // (medido na sonda da bancada, nao deduzido de foto). Quem
                // aterra o espinho e a borrada de tinta — que e a sombra de
                // contato que um desenho de verdade usa.
                <mesh key={i} geometry={ESPINHO_GEO}>
                    <primitive object={spikeMat} attach="material" />
                    <Outlines thickness={0.05} color={CREME} />
                </mesh>
            ))}
        </group>
    );
});
SpikeStrip.displayName = 'SpikeStrip';

// ── One paintbrush pickup ─────────────────────────────────────────────────────
const BrushPickup = React.forwardRef<THREE.Group>((_props, ref) => (
    <group ref={ref}>
        {/* tilt so it reads as a held brush */}
        <group rotation={[0, 0, Math.PI * 0.18]}>
            {/* handle */}
            <mesh position={[0, 0.32, 0]} castShadow>
                <cylinderGeometry args={[0.07, 0.085, 0.9, 12]} />
                <primitive object={handleMat} attach="material" />
                <Outlines thickness={0.03} color={INK} />
            </mesh>
            {/* ferrule */}
            <mesh position={[0, -0.18, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.16, 12]} />
                <primitive object={ferruleMat} attach="material" />
                <Outlines thickness={0.03} color={INK} />
            </mesh>
            {/* bristles */}
            <mesh position={[0, -0.4, 0]} castShadow>
                <coneGeometry args={[0.12, 0.42, 12]} />
                <primitive object={bristleMat} attach="material" />
                <Outlines thickness={0.03} color={INK} />
            </mesh>
            {/* dripping red ink tip */}
            <mesh position={[0, -0.62, 0]}>
                <sphereGeometry args={[0.06, 10, 8]} />
                <primitive object={tipMat} attach="material" />
            </mesh>
        </group>
    </group>
));
BrushPickup.displayName = 'BrushPickup';

// ── Container ─────────────────────────────────────────────────────────────────
const Floor3Hazards: React.FC = () => {
    const spikeGroups = useRef<Map<number, THREE.Group>>(new Map());
    const brushGroups = useRef<Map<number, THREE.Group>>(new Map());
    const [, bump] = useReducer((n: number) => n + 1, 0);
    const sig = useRef(0);

    useFrame((estado, dt) => {
        const safeDt = Math.min(dt, 0.05);
        const t = estado.clock.elapsedTime;
        tickHazards(safeDt);

        // Spikes — position on the live platform + staggered draw-on.
        for (const h of hazards) {
            const g = spikeGroups.current.get(h.id);
            const box = hazardBox(h);
            if (!g || !box) continue;
            const cz = (box.z0 + box.z1) / 2;
            g.position.set(box.x, box.topY, cz);
            const span = box.hw * 2 * 0.82;
            const N = h.spikes;

            // A BORRADA VARRE DE UM LADO AO OUTRO. Antes ela so era escalada, o
            // que a fazia CRESCER a partir do meio para os dois lados — um
            // retangulo aparecendo, nao um pincel passando. Escalar e deslocar
            // junto e o que faz o traco comecar numa ponta e chegar na outra.
            //
            // A largura cheia e a da CAIXA que machuca (`box.hw`), nao a fileira
            // de dentes: o mesmo principio que este arquivo ja aplica em Z — o
            // que empurra o jogador tem de ser o que ele ve.
            const larguraCheia = box.hw * 2;
            const stroke = g.children[0] as THREE.Mesh;
            if (stroke) {
                const feito = Math.max(0.001, h.reveal) * larguraCheia;
                stroke.scale.set(feito, 0.05, 0.36);
                stroke.position.x = -larguraCheia / 2 + feito / 2;
            }

            for (let i = 0; i < N; i++) {
                const m = g.children[i + 1] as THREE.Mesh;
                if (!m) continue;
                // N === 1 dividiria por zero e mandaria o único espinho para NaN.
                const x = N > 1 ? -span / 2 + (span / (N - 1)) * i : 0;
                const local = Math.max(0, Math.min(1, (h.reveal - (i / N) * 0.7) / 0.3));
                const s = local <= 0 ? 0 : easeOutBack(local);

                // Mao tremida + fervilhar. A conta mora em `f3Hazards` porque
                // la ela e testavel; aqui so se aplica o resultado.
                const { alto, largo, torto, desvio, ferve } = silhuetaDoEspinho(h.id, i, t);

                m.position.set(x + desvio, 0.3 * s * alto, ferve * 0.4);
                m.rotation.z = torto + ferve * 2.0;
                const cresce = Math.min(1, local * 1.6);
                m.scale.set(cresce * largo * (1 + ferve), s * alto, cresce * largo);
            }
        }

        // Brushes — bob, spin, collect-pop.
        for (const b of brushes) {
            const g = brushGroups.current.get(b.id);
            const wp = brushPos(b);
            if (!g || !wp) continue;
            g.position.set(wp.x, wp.y, wp.z);
            g.rotation.y += safeDt * 1.8;
            const pop = b.collected ? 1 + (1 - b.fade) * 1.2 : 1;
            g.scale.setScalar(b.collected ? pop * b.fade + 0.0001 : 1);
            g.visible = !(b.collected && b.fade <= 0.02);
        }

        // Re-render the React lists only when the id sets change. Hash the ids
        // numerically (no per-frame string/array allocation — this runs 60×/s).
        let s = (hazards.length * 1000003 + brushes.length) | 0;
        for (let i = 0; i < hazards.length; i++) s = (s * 31 + hazards[i].id) | 0;
        for (let i = 0; i < brushes.length; i++) s = (s * 31 + brushes[i].id) | 0;
        if (s !== sig.current) { sig.current = s; bump(); }
    });

    return (
        <group>
            {hazards.map((h) => (
                <SpikeStrip key={h.id} hazard={h}
                    ref={(el) => { if (el) spikeGroups.current.set(h.id, el); else spikeGroups.current.delete(h.id); }} />
            ))}
            {brushes.map((b) => (
                <BrushPickup key={b.id}
                    ref={(el) => { if (el) brushGroups.current.set(b.id, el); else brushGroups.current.delete(b.id); }} />
            ))}
        </group>
    );
};

export default Floor3Hazards;
