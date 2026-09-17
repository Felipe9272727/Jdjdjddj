/**
 * Floor12Estilhacos.tsx — ESTILHAÇOS, o vocabulário de impacto que faltava.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * Fora da cena de vitória, o andar 12 não tinha nenhuma partícula. Derrubar uma
 * camareira tocava um som e o inimigo simplesmente SUMIA do quadro; acertar a
 * boca pintava a cabeça de branco por um instante. Os dois eventos que o jogador
 * provoca de propósito, dezenas de vezes por luta, não tinham consequência
 * visível — e é essa ausência que faz uma luta parecer um protótipo, mesmo com a
 * geometria toda certa.
 *
 * ── E POR QUE É UM POOL COM FILA, E NÃO `useState` ───────────────────────────
 *
 * Quem sabe que um impacto aconteceu é o laço de colisão, que roda dentro do
 * `useFrame` e não pode chamar `setState` (seria um render por bala). Então a
 * cena EMPILHA pedidos num ref e este componente os consome no próprio quadro.
 * Sem alocação por impacto: as instâncias existem desde o começo e são
 * recicladas — o mesmo motivo pelo qual os projéteis já são um pool.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface PedidoDeEstilhaco {
    x: number; y: number; z: number;
    cor: string;
    /** Espalhamento e tamanho. 1 = um tiro acertando; 2 = algo explodindo. */
    forca: number;
}

/** A fila que a cena escreve e a cena de estilhaços consome. */
export type FilaDeEstilhacos = React.MutableRefObject<PedidoDeEstilhaco[]>;

const QUANTOS = 72;
const VIDA = 0.62;

export const Floor12Estilhacos: React.FC<{ fila: FilaDeEstilhacos }> = ({ fila }) => {
    const malha = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const cor = useMemo(() => new THREE.Color(), []);
    // Cada lasca guarda a própria física. `t` acima de VIDA quer dizer "livre".
    const lascas = useMemo(() => Array.from({ length: QUANTOS }, () => ({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, giro: 0, t: VIDA + 1, tam: 1,
    })), []);
    const proxima = useRef(0);

    useFrame((_, rawDt) => {
        const m = malha.current;
        if (!m) return;
        const dt = Math.min(rawDt, 0.05);

        // 1. atender os pedidos da fila
        const pedidos = fila.current;
        while (pedidos.length) {
            const p = pedidos.pop()!;
            const quantas = Math.round(4 + p.forca * 4);
            for (let k = 0; k < quantas; k++) {
                const l = lascas[proxima.current];
                proxima.current = (proxima.current + 1) % QUANTOS;
                // Direções determinísticas em vez de `Math.random`: o mesmo
                // impacto sempre estoura igual, que é o que deixa o efeito
                // reproduzível numa foto de bancada.
                const a = (k / quantas) * Math.PI * 2 + p.x * 1.7;
                const b = Math.cos(k * 2.399 + p.y);
                const v = (2.6 + Math.abs(b) * 3.4) * p.forca;
                l.x = p.x; l.y = p.y; l.z = p.z;
                l.vx = Math.cos(a) * v; l.vy = Math.sin(a) * v + 1.2; l.vz = b * v * .6;
                l.giro = 6 + Math.abs(b) * 14;
                l.tam = (.09 + Math.abs(b) * .10) * p.forca;
                l.t = 0;
                m.setColorAt(proxima.current === 0 ? QUANTOS - 1 : proxima.current - 1, cor.set(p.cor));
            }
            if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }

        // 2. integrar e desenhar
        for (let i = 0; i < QUANTOS; i++) {
            const l = lascas[i];
            if (l.t > VIDA) { dummy.scale.setScalar(0); dummy.position.set(0, -999, 0); }
            else {
                l.t += dt;
                l.vy -= 11 * dt;                 // peso: lasca CAI, senão vira fumaça
                l.x += l.vx * dt; l.y += l.vy * dt; l.z += l.vz * dt;
                const k = Math.max(0, 1 - l.t / VIDA);
                dummy.position.set(l.x, l.y, l.z);
                dummy.rotation.set(l.t * l.giro, l.t * l.giro * .7, 0);
                dummy.scale.setScalar(l.tam * k);
            }
            dummy.updateMatrix();
            m.setMatrixAt(i, dummy.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={malha} args={[undefined, undefined, QUANTOS]} frustumCulled={false}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    );
};
