/**
 * Floor12Projeteis.tsx — tudo que voa: o que sai da boca e o que sai das armas.
 *
 * ── POR QUE POOL, E NÃO UM COMPONENTE POR PROJÉTIL ───────────────────────────
 *
 * O jeito natural em React seria `f12.projeteis.map(p => <mesh key={p.id}/>)`.
 * Num quadro de pico este andar tem cinco do leque, um teleguiado, quatro
 * camareiras, quatro cabines e umas vinte balas — quarenta objetos que nascem e
 * morrem várias vezes por segundo. Isso é quarenta montagens e desmontagens de
 * componente por segundo no reconciliador, num celular, no meio de um jogo de
 * nave. É exatamente o tipo de custo que a regra número um do dono do jogo não
 * perdoa.
 *
 * Aqui cada tipo tem um POOL de tamanho fixo, criado uma vez. A cada quadro o
 * pool é reposicionado a partir do estado puro e o que sobra fica invisível.
 * Zero alocação, zero remontagem — e o React não sabe que alguma coisa mudou.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mat64 } from './Floor5Player64';
import {
    f12, ARENA, MARE, frestaDaMare, LEQUE, ENQUADRAMENTO,
    type Projetil, type NomeDoAtaque,
} from './f12Boss';

const CORES = {
    leque: '#ffd34a',        // os cinco andares: âmbar de placa de elevador
    teleguiado: '#e03a3a',   // o fio vermelho
    fio: '#8c1d1d',
    naves: '#cfd6e0',        // as camareiras: cinza de uniforme
    navesLuz: '#7ad4ff',
    mare: '#3fa9d6',         // a maré do 2º
    mareEsc: '#1d6e94',
    elevadores: '#c9b28a',   // a espinha: a mesma cabine creme do elevador
    elevadoresEsc: '#6f6350',
    tiro: '#b6ff4a',
    carregado: '#8ff0ff',
    tiroIrmao: '#ff9d5a',
};

/** Quantos de cada tipo cabem no ar ao mesmo tempo. Generoso, mas fixo. */
const TETO: Record<string, number> = {
    leque: 12, teleguiado: 3, naves: 8, mare: 3, elevadores: 10, tiro: 36, carregado: 4,
};

interface Pool {
    grupo: THREE.Group;
    itens: THREE.Object3D[];
}

/**
 * A ONDA da maré é o único projétil que não é um corpo: é uma parede larga com
 * um buraco. Ela é desenhada como duas placas (a da esquerda da fresta e a da
 * direita), que é o jeito mais barato de ter um buraco que anda.
 */
function fazerOnda(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
        const parede = new THREE.Mesh(new THREE.BoxGeometry(1, ARENA.yAlto - ARENA.yBaixo + 4, 1.1), M.mare);
        parede.name = i === 0 ? 'esq' : 'dir';
        g.add(parede);
        const crista = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1.2), M.mareEsc);
        crista.name = i === 0 ? 'cristaEsq' : 'cristaDir';
        g.add(crista);
    }
    return g;
}

function fazerCabine(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.9, 1.5), M.elevadores);
    const teto = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 1.6), M.elevadoresEsc);
    teto.position.y = 1.0;
    const porta = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 1.2), M.elevadoresEsc);
    porta.position.set(0, 0, 0.78); porta.rotation.y = Math.PI / 2;
    g.add(corpo, teto, porta);
    return g;
}

function fazerCamareira(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.2), M.naves);
    const cupula = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.navesLuz);
    cupula.position.set(0, 0.3, -0.1);
    const asa = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.4), M.naves);
    g.add(corpo, cupula, asa);
    return g;
}

function fazerMissil(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8), M.teleguiado);
    corpo.rotation.x = Math.PI / 2;
    // o FIO que ele arrasta atrás — a referência ao 9º andar
    const fio = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3.2), M.fio);
    fio.position.z = -1.8;
    g.add(corpo, fio);
    return g;
}

export const Floor12Projeteis: React.FC = () => {
    const raiz = useRef<THREE.Group>(null);

    const M = useMemo(() => ({
        leque: mat64(CORES.leque, CORES.leque, 0.5),
        teleguiado: mat64(CORES.teleguiado, CORES.teleguiado, 0.4),
        fio: mat64(CORES.fio),
        naves: mat64(CORES.naves), navesLuz: mat64(CORES.navesLuz, CORES.navesLuz, 0.6),
        mare: mat64(CORES.mare, CORES.mare, 0.15), mareEsc: mat64(CORES.mareEsc),
        elevadores: mat64(CORES.elevadores), elevadoresEsc: mat64(CORES.elevadoresEsc),
        tiro: mat64(CORES.tiro, CORES.tiro, 1.0),
        carregado: mat64(CORES.carregado, CORES.carregado, 1.4),
        tiroIrmao: mat64(CORES.tiroIrmao, CORES.tiroIrmao, 1.0),
    }), []);

    const pools = useMemo<Record<string, Pool>>(() => {
        const cria = (n: number, fab: () => THREE.Object3D): Pool => {
            const grupo = new THREE.Group();
            const itens: THREE.Object3D[] = [];
            for (let i = 0; i < n; i++) {
                const o = fab(); o.visible = false; grupo.add(o); itens.push(o);
            }
            return { grupo, itens };
        };
        const esferaLeque = new THREE.SphereGeometry(LEQUE.raio, 10, 8);
        // ── A BALA PRECISA SER VISTA ─────────────────────────────────────
        // Ela era uma cápsula de 0,11 de raio voando a 34 u/s numa tela de 412
        // px: três pixels de verde por 0,7 s. O dono do jogo disse que o tiro
        // estava ruim, e uma das razões é essa — não dá para saber se você
        // atirou. Agora ela é grossa, longa e acesa, com um rastro atrás.
        const balaGeo = new THREE.CapsuleGeometry(0.2, 1.1, 4, 8);
        return {
            leque: cria(TETO.leque, () => new THREE.Mesh(esferaLeque, M.leque)),
            teleguiado: cria(TETO.teleguiado, () => fazerMissil(M as never)),
            naves: cria(TETO.naves, () => fazerCamareira(M as never)),
            mare: cria(TETO.mare, () => fazerOnda(M as never)),
            elevadores: cria(TETO.elevadores, () => fazerCabine(M as never)),
            // O TIRO CARREGADO: grande, azul e com anéis. Ele é a recompensa de
            // ter desviado apertado cinco vezes, e uma recompensa que parece
            // igual ao tiro comum não é recompensa nenhuma.
            carregado: cria(TETO.carregado, () => {
                const g = new THREE.Group();
                const nucleo = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.5, 4, 10), M.carregado);
                nucleo.rotation.x = Math.PI / 2;
                g.add(nucleo);
                for (let i = 0; i < 3; i++) {
                    const anel = new THREE.Mesh(new THREE.TorusGeometry(0.62 + i * 0.16, 0.07, 6, 14), M.carregado);
                    anel.position.z = 0.5 + i * 0.55;
                    anel.name = `anel${i}`;
                    g.add(anel);
                }
                return g;
            }),
            tiro: cria(TETO.tiro, () => {
                const g = new THREE.Group();
                const bala = new THREE.Mesh(balaGeo, M.tiro);
                bala.rotation.x = Math.PI / 2;
                bala.name = 'bala';
                // COMPRIMENTO 1, e a escala de verdade vem por quadro em
                // `desenhar`: o rastro tem de encolher quando a câmera se
                // aproxima. Ver a nota lá.
                const rastro = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1), M.tiro);
                rastro.position.z = 0.5;       // atrás dela (a bala vai para -z)
                rastro.name = 'rastro';
                g.add(bala, rastro);
                return g;
            }),
        };
    }, [M]);

    useFrame((state) => {
        const g = raiz.current; if (!g) return;
        // Quantos de cada tipo já foram usados neste quadro.
        const usados: Record<string, number> = { leque: 0, teleguiado: 0, naves: 0, mare: 0, elevadores: 0, tiro: 0, carregado: 0 };

        for (const p of f12.projeteis) {
            const chave = (p.tipo === 'tiro' || p.tipo === 'carregado') ? p.tipo : (p.tipo as NomeDoAtaque);
            const pool = pools[chave]; if (!pool) continue;
            const i = usados[chave]; if (i >= pool.itens.length) continue;
            usados[chave] = i + 1;
            const o = pool.itens[i];
            o.visible = true;
            desenhar(o, p, state.clock.elapsedTime, M);
        }

        // O que sobrou do pool some. Sem isto os projéteis mortos ficariam
        // congelados no céu, que é o defeito clássico de pool.
        for (const chave of Object.keys(pools)) {
            const pool = pools[chave];
            for (let i = usados[chave] ?? 0; i < pool.itens.length; i++) pool.itens[i].visible = false;
        }
    });

    return (
        <group ref={raiz}>
            {Object.values(pools).map((p, i) => <primitive key={i} object={p.grupo} />)}
        </group>
    );
};

/** Põe um objeto do pool no lugar do projétil, e dá a ele o gesto do seu tipo. */
/** Reaproveitado por quadro: alocar um Vector3 por bala por quadro é lixo. */
const MIRA = new THREE.Vector3();

function desenhar(o: THREE.Object3D, p: Projetil, t: number, M: Record<string, THREE.Material>): void {
    o.position.set(p.x, p.y, p.z);

    if (p.tipo === 'carregado') {
        // os anéis correm para trás: dá sensação de velocidade num objeto que,
        // visto de trás, quase não muda de tamanho enquanto se afasta
        const g = o as THREE.Group;
        for (let i = 0; i < g.children.length; i++) {
            const c = g.children[i];
            if (c.name.startsWith('anel')) {
                c.rotation.z = t * (3 + i);
                c.scale.setScalar(1 + Math.sin(t * 9 - i) * 0.18);
            }
        }
        MIRA.set(p.x - p.vx, p.y - p.vy, p.z - p.vz);
        o.lookAt(MIRA);
        return;
    }

    if (p.tipo === 'tiro') {
        const m = p.de === 'irmao' ? M.tiroIrmao : M.tiro;

        // ── O RASTRO SEGUE A BALA, E ENCOLHE COM A CÂMERA ────────────────
        //
        // Ele era uma caixa de 4,2 fixa ao longo de +Z, e as duas coisas
        // estavam erradas:
        //
        // 1. O TIRO PASSOU A SUBIR (`subidaDoTiro`): a bala vai na diagonal e o
        //    rastro continuava deitado no eixo Z, ou seja apontando para um
        //    lugar por onde ela não passou.
        // 2. +Z É A DIREÇÃO DA CÂMERA. Um bastão de 4,2 apontado quase para a
        //    lente atravessa a tela inteira quando a câmera está perto — e no
        //    celular DEITADO a câmera fica a 5,2 em vez de 15,5. Na foto os
        //    tiros viraram feixes de sabre de luz cruzando o quadro.
        //
        // Agora ele aponta pela VELOCIDADE e o comprimento é uma fração do
        // recuo, então ele ocupa a mesma fatia de tela em qualquer aparelho.
        const comprimento = ENQUADRAMENTO.recuo * 0.27 * (p.de === 'irmao' ? 0.55 : 1);
        const v = Math.hypot(p.vx, p.vy, p.vz) || 1;
        for (const filho of (o as THREE.Group).children) {
            (filho as THREE.Mesh).material = m;
            if (filho.name === 'rastro') {
                filho.scale.z = comprimento;
                filho.position.z = comprimento / 2;
            }
        }
        // o grupo inteiro olha para onde a bala VAI (o -Z local segue a
        // velocidade), então a bala e o rastro ficam na mesma reta
        MIRA.set(p.x - p.vx / v, p.y - p.vy / v, p.z - p.vz / v);
        o.lookAt(MIRA);
        return;
    }

    if (p.tipo === 'leque') {
        // giram: uma esfera lisa parada lê como bolha, girando lê como projétil
        o.rotation.set(t * 3 + p.id, t * 2.2, 0);
        return;
    }

    if (p.tipo === 'teleguiado') {
        // aponta para onde vai — é o que faz o jogador ler a curva dele
        const alvo = new THREE.Vector3(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        o.lookAt(alvo);
        return;
    }

    if (p.tipo === 'naves') {
        // A posição já vem bamboleada do módulo (`passoDoProjetil`): aqui só a
        // INCLINAÇÃO, que é o único pedaço puramente visual, e ela sai da
        // velocidade lateral real — não de um seno paralelo que poderia
        // discordar dela.
        o.rotation.z = THREE.MathUtils.clamp(-p.vx * 0.25, -0.5, 0.5);
        return;
    }

    if (p.tipo === 'elevadores') {
        o.rotation.y = Math.sin(t * 1.4 + (p.p ?? 0)) * 0.12;
        return;
    }

    if (p.tipo === 'mare') {
        // Duas paredes, com a fresta entre elas. As larguras são recalculadas
        // por quadro porque a fresta PASSEIA.
        const fresta = frestaDaMare(p);
        const g = o as THREE.Group;
        const bordaE = -ARENA.x - 6, bordaD = ARENA.x + 6;
        const fimEsq = fresta - MARE.fresta, iniDir = fresta + MARE.fresta;
        const larguraE = Math.max(0.01, fimEsq - bordaE);
        const larguraD = Math.max(0.01, bordaD - iniDir);
        const meioY = (ARENA.yBaixo + ARENA.yAlto) / 2;
        for (const filho of g.children) {
            const crista = filho.name.startsWith('crista');
            const esq = filho.name.endsWith('sq');
            const larg = esq ? larguraE : larguraD;
            const cx = esq ? bordaE + larg / 2 : iniDir + larg / 2;
            filho.position.set(cx - p.x, crista ? ARENA.yAlto + 0.4 - p.y + meioY - meioY : meioY - p.y, 0);
            filho.scale.x = larg;
            filho.visible = larg > 0.05;
        }
        return;
    }
}

export default Floor12Projeteis;
