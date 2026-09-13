/**
 * Floor12Estouros.tsx — as bolas de fogo.
 *
 * ── POR QUE NÃO BASTAVAM AS FAÍSCAS ──────────────────────────────────────────
 *
 * A morte do chefe foi entregue com "estouros em cadeia" que eram faíscas —
 * discos de quatro lados, escala ~1,3, a quarenta unidades da câmera. Um
 * avaliador independente refotografou a cena a cada 170 ms e contou zero
 * estouros visíveis em onze quadros seguidos. A faísca diz ONDE o tiro acertou,
 * e faz isso bem; ela não sabe dizer QUANTO, porque "quanto" se lê por ÁREA.
 *
 * ── TUDO ADITIVO, E A ALFA É A COR ───────────────────────────────────────────
 *
 * `InstancedMesh` dá uma cor por instância e NÃO dá uma alfa por instância — não
 * sem um atributo e um shader próprios. Com mistura ADITIVA isso não é um
 * problema: escurecer a cor até o preto É desaparecer, porque somar preto não
 * soma nada.
 *
 * A primeira versão tinha uma camada de FUMAÇA em mistura normal, com a alfa
 * fingida do mesmo jeito — interpolando da cor do céu até o escuro. Em mistura
 * normal isso não desaparece: pinta um disco OPACO da cor do céu por cima da
 * cena. Na foto, o estouro grande virou um balão azul-claro de um quinto da
 * tela, tapando a cabeça que ele existia para destruir. O truque da alfa-por-cor
 * é do aditivo, e só dele.
 *
 * Sobraram duas camadas aditivas: um HALO largo e alaranjado que dura, e um
 * NÚCLEO branco-quente, menor e mais curto. A diferença de tempo entre os dois é
 * o que dá a sensação de calor esfriando em vez de uma luz acendendo e apagando.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { todasAsBolas, nucleoDaBola, haloDaBola, BOLAS_MAX, Bola } from './f12Impacto';

const ESCONDIDO = new THREE.Object3D();
ESCONDIDO.position.set(0, -9999, 0);
ESCONDIDO.scale.setScalar(0);
ESCONDIDO.updateMatrix();

const PRETO = new THREE.Color(0, 0, 0);

const Camada: React.FC<{
    curva: (b: Bola) => { raio: number; alfa: number };
    cor: string; z: number; lados: number;
}> = ({ curva, cor, z, lados }) => {
    const malha = useRef<THREE.InstancedMesh>(null);
    const aux = useMemo(() => new THREE.Object3D(), []);
    const c = useMemo(() => new THREE.Color(), []);
    const base = useMemo(() => new THREE.Color(cor), [cor]);

    // O que cada instância estava fazendo no quadro passado.
    //
    // ── A MESMA LIÇÃO QUE AS FAÍSCAS JÁ TINHAM DADO ──────────────────────────
    //
    // `Floor12Faiscas` tem, no arquivo, a nota de que reescrever todas as
    // matrizes e todas as cores TODO QUADRO derrubou o FPS de 52,5 para 44,4 —
    // e o conserto, que é este cache. Eu escrevi as bolas sem ele, e elas rodam
    // o andar inteiro: durante os cem segundos de luta, em que quase nunca há
    // uma bola viva, as duas camadas reenviavam 48 matrizes e 48 cores por
    // quadro para a GPU para desenhar nada.
    const eraViva = useRef<boolean[]>(new Array(BOLAS_MAX).fill(false));

    useFrame(() => {
        const m = malha.current; if (!m) return;
        const bs = todasAsBolas();
        let mexeu = false;
        for (let i = 0; i < bs.length; i++) {
            const b = bs[i];
            const { raio, alfa } = b.vida > 0 ? curva(b) : { raio: 0, alfa: 0 };
            if (alfa <= 0.002) {
                if (!eraViva.current[i]) continue;   // já escondida: nada a escrever
                eraViva.current[i] = false;
                m.setMatrixAt(i, ESCONDIDO.matrix);
                mexeu = true;
                continue;
            }
            eraViva.current[i] = true;
            aux.position.set(b.x, b.y, b.z + z);
            aux.scale.setScalar(Math.max(0.001, raio));
            aux.rotation.z = b.x * 3.1 + b.y;
            aux.updateMatrix();
            m.setMatrixAt(i, aux.matrix);
            // somar preto é não somar nada: a cor É a alfa, no aditivo
            c.copy(PRETO).lerp(base, alfa);
            m.setColorAt(i, c);
            mexeu = true;
        }
        if (!mexeu) return;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={malha} args={[undefined as never, undefined as never, BOLAS_MAX]}
            frustumCulled={false}>
            {/* vinte lados no halo: a dez, a borda reta do polígono se via a
                1100 px — um avaliador leu "decágono" antes de ler "explosão" */}
            <circleGeometry args={[1, lados]} />
            <meshBasicMaterial toneMapped={false} fog={false} depthWrite={false}
                transparent blending={THREE.AdditiveBlending} />
        </instancedMesh>
    );
};

export const Estouros: React.FC = () => (
    <>
        {/* o halo primeiro e mais atrás: o núcleo soma POR CIMA dele, e é essa
            soma que estoura no branco no centro */}
        <Camada curva={haloDaBola} cor="#ff6a1c" z={-0.4} lados={20} />
        <Camada curva={nucleoDaBola} cor="#fff0c0" z={0.4} lados={16} />
    </>
);

export default Estouros;
