/**
 * Floor12Faiscas.tsx — as faíscas do impacto.
 *
 * O andar tinha exatamente um retorno visual de acerto: a cabeça INTEIRA
 * piscando. Isso diz "algo aconteceu" e não diz onde, e "onde" é a informação
 * que ensina o jogador a mirar. Uma penca de faíscas nascendo no ponto exato do
 * acerto diz as duas coisas de uma vez, e é a peça que faz acertar deixar de ser
 * informação e virar sensação.
 *
 * ── UMA CHAMADA DE DESENHO, SEMPRE ───────────────────────────────────────────
 *
 * `InstancedMesh` com o anel inteiro alocado na montagem. As faíscas mortas são
 * escondidas com escala zero em vez de sair do array: mexer no `count` por
 * quadro obrigaria a reescrever todas as matrizes em outra ordem, e o ganho
 * seria zero — o custo de uma instância invisível é uma matriz que a GPU
 * descarta no vertex shader.
 *
 * O estado vive em `f12Impacto`, que não importa three. Este arquivo só lê e
 * desenha — a mesma divisão de `f12Boss` e `Floor12Projeteis`, e pelo mesmo
 * motivo: o que é regra tem de ser testável sem uma tela.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { todasAsFaiscas, FAISCAS_MAX } from './f12Impacto';

/** As três cores de faísca, na ordem de `Faisca.tipo`. */
const CORES = ['#ffe36b', '#8ff0ff', '#ff6b4a'];

export const Faiscas: React.FC = () => {
    const malha = useRef<THREE.InstancedMesh>(null);
    const aux = useMemo(() => new THREE.Object3D(), []);
    const cor = useMemo(() => new THREE.Color(), []);
    const cores = useMemo(() => CORES.map((c) => new THREE.Color(c)), []);

    // O que cada instância estava fazendo no quadro passado. Sem isto, o laço
    // reescreve as 120 matrizes E as 120 cores TODO QUADRO, mesmo com a tela
    // vazia de faíscas — e `instanceColor.needsUpdate` reenvia o buffer inteiro
    // para a GPU. Medido, a versão ingênua derrubou o FPS de 52,5 para 44,4.
    // Faíscas são o efeito mais barato do andar; não podem ser o mais caro.
    const eraViva = useRef<boolean[]>(new Array(FAISCAS_MAX).fill(false));
    const eraTipo = useRef<number[]>(new Array(FAISCAS_MAX).fill(-1));

    useFrame(() => {
        const m = malha.current; if (!m) return;
        const fs = todasAsFaiscas();
        let mexeuMatriz = false, mexeuCor = false;
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            const viva = f.vida > 0;
            if (!viva) {
                // já escondida no quadro passado: não há o que escrever
                if (!eraViva.current[i]) continue;
                eraViva.current[i] = false;
                aux.position.set(0, -9999, 0);
                aux.scale.setScalar(0);
                aux.updateMatrix();
                m.setMatrixAt(i, aux.matrix);
                mexeuMatriz = true;
                continue;
            }
            eraViva.current[i] = true;
            // a cor só muda quando o TIPO daquele lugar do anel muda
            if (eraTipo.current[i] !== f.tipo) {
                eraTipo.current[i] = f.tipo;
                cor.copy(cores[f.tipo] ?? cores[0]);
                m.setColorAt(i, cor);
                mexeuCor = true;
            }
            {
                // A faísca ENCOLHE e não desbota: `MeshBasicMaterial` com
                // `vertexColors` não tem alfa por instância sem um atributo a
                // mais, e encolher lê melhor num jogo de cor chapada — desbotar
                // num céu claro vira uma mancha cinza antes de sumir.
                const k = f.vida / f.total;
                aux.position.set(f.x, f.y, f.z);
                aux.scale.setScalar(f.tamanho * k);
                aux.rotation.z = f.x + f.y;
            }
            aux.updateMatrix();
            m.setMatrixAt(i, aux.matrix);
            mexeuMatriz = true;
        }
        if (mexeuMatriz) m.instanceMatrix.needsUpdate = true;
        if (mexeuCor && m.instanceColor) m.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={malha} args={[undefined as never, undefined as never, FAISCAS_MAX]}
            frustumCulled={false}>
            {/* quatro lados: de longe é um ponto, e um ponto não precisa de
                mais do que isso. Vinte faíscas a oito lados custariam o dobro
                de triângulo pelo mesmo pixel. */}
            <circleGeometry args={[1, 4]} />
            <meshBasicMaterial toneMapped={false} fog={false} depthWrite={false} />
        </instancedMesh>
    );
};

export default Faiscas;
