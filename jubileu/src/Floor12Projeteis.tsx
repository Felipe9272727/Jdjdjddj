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
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mat64 } from './Floor5Player64';
import {
    f12, ARENA, MARE, frestaDaMare, LEQUE, ELEVADORES,
    type Projetil, type NomeDoAtaque,
} from './f12Boss';

/**
 * ── UMA FAIXA DE COR RESERVADA PARA O QUE MACHUCA ────────────────────────────
 *
 * As cores antigas foram escolhidas por LORE — âmbar de placa de elevador para
 * o leque, creme de cabine para os elevadores, azul para a maré do 2º andar.
 * Cada escolha fazia sentido sozinha, e juntas produziram o pior defeito de
 * legibilidade possível: QUATRO DOS CINCO ATAQUES dividiam família de cor com o
 * cenário.
 *
 *   leque       #ffd34a  âmbar  ×  janelas dos prédios  #f1c777  âmbar
 *   elevadores  #c9b28a  creme  ×  a própria cabeça, creme
 *   naves       #cfd6e0  cinza  ×  os bancos de nuvem, cinza
 *   maré        #3fa9d6  azul   ×  o céu, azul
 *
 * O objeto mais saturado da tela era DECORAÇÃO, e a coisa que mata era o mais
 * apagado. Um jogador que morre sem ter visto o tiro não aprende nada — ele só
 * conclui que o jogo é injusto.
 *
 * Agora existe uma regra: a faixa QUENTE (laranja → vermelho → magenta) é
 * exclusiva do que causa dano. Nada de cenário entra nela. Dentro da faixa os
 * cinco continuam distinguíveis por VALOR e por forma, que é como um jogador
 * reconhece padrão de chefe — pela silhueta, não pelo matiz.
 *
 * O teleguiado já era vermelho e já era o único que se lia. Ele virou a
 * referência, em vez de a exceção.
 */
const CORES = {
    leque: '#ff7a2f',        // laranja quente: os cinco andares, mas visíveis
    teleguiado: '#e03a3a',   // o fio vermelho — a referência da faixa
    fio: '#8c1d1d',
    naves: '#d8604a',        // as camareiras: o uniforme puxado para o quente
    navesLuz: '#ffd08a',     // a luz delas, para separar da fuselagem
    mare: '#c0345f',         // a maré do 2º: magenta, para não sumir no céu
    mareEsc: '#7d1f3e',
    elevadores: '#e8552c',   // a espinha: a cabine, mas em brasa
    elevadoresEsc: '#7a2b17',
    // O JOGADOR fica do lado FRIO da paleta, e sozinho nele. Assim "ciano é
    // meu, quente é o que me mata" vira uma regra que se aprende sem texto.
    tiro: '#65fff0',
    tiroIrmao: '#7ad4ff',
};

/** Quantos de cada tipo cabem no ar ao mesmo tempo. Generoso, mas fixo. */
const TETO: Record<string, number> = {
    leque: 12, teleguiado: 3, naves: 8, mare: 3, elevadores: 10, tiro: 64,
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
    const panel = new THREE.Mesh(new THREE.BoxGeometry(.72, .20, .06), M.leque);
    panel.position.set(0, .69, .79); g.add(panel);
    const warning = new THREE.Group(); warning.name = 'aviso-descida';
    warning.position.set(0, 1.5, .9);
    for (const side of [-1, 1]) {
        const arrow = new THREE.Mesh(new THREE.BoxGeometry(.48, .09, .07), M.leque);
        arrow.position.x = side * .16; arrow.rotation.z = side * Math.PI / 4;
        warning.add(arrow);
    }
    g.add(warning);
    for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(.10, 2.7, .12), M.elevadoresEsc);
        rail.position.set(side * .89, 0, 0); g.add(rail);
    }
    return g;
}

function fazerCamareira(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.2), M.naves);
    const cupula = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.navesLuz);
    cupula.position.set(0, 0.3, -0.1);
    const asa = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.4), M.naves);
    g.add(corpo, cupula, asa);
    for (const side of [-1, 1]) {
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .58, 8), M.elevadoresEsc);
        motor.rotation.x = Math.PI / 2; motor.position.set(side * .67, 0, .15); g.add(motor);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), M.navesLuz);
        lamp.position.set(side * .67, 0, .47); g.add(lamp);
    }
    return g;
}

function fazerMissil(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 8), M.teleguiado);
    corpo.rotation.x = Math.PI / 2;
    // o FIO que ele arrasta atrás — a referência ao 9º andar
    const fio = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3.2), M.fio);
    fio.position.z = -1.8;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(.23, .45, 10), M.teleguiado);
    nose.rotation.x = Math.PI / 2; nose.position.z = .65;
    g.add(corpo, fio, nose);
    for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(.62, .07, .40), M.elevadoresEsc);
        fin.rotation.z = i * Math.PI / 2; fin.position.z = -.35; g.add(fin);
    }
    const exhaust = new THREE.Mesh(new THREE.ConeGeometry(.19, .9, 8), M.tiroIrmao);
    exhaust.rotation.x = -Math.PI / 2; exhaust.position.z = -.9; g.add(exhaust);
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
        missil: mat64('#d7b465'),
        missilLuz: mat64('#ffc768', '#ffb94d', 1.0),
        core: new THREE.MeshBasicMaterial({ color: '#efffff', toneMapped: false }),
        tiro: mat64(CORES.tiro, CORES.tiro, 1.0),
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
        const esferaLeque = new THREE.OctahedronGeometry(LEQUE.raio, 0);
        // ── A BALA PRECISA SER VISTA ─────────────────────────────────────
        // Ela era uma cápsula de 0,11 de raio voando a 34 u/s numa tela de 412
        // px: três pixels de verde por 0,7 s. O dono do jogo disse que o tiro
        // estava ruim, e uma das razões é essa — não dá para saber se você
        // atirou. Agora ela é grossa, longa e acesa, com um rastro atrás.
        const balaGeo = new THREE.CapsuleGeometry(.115, .72, 4, 8);
        return {
            leque: cria(TETO.leque, () => {
                const g = new THREE.Group();
                const shard = new THREE.Mesh(esferaLeque, M.leque); shard.scale.set(.72, 1.18, .72);
                const orbit = new THREE.Mesh(new THREE.TorusGeometry(LEQUE.raio * .86, .055, 6, 16), M.elevadoresEsc);
                g.add(shard, orbit); return g;
            }),
            teleguiado: cria(TETO.teleguiado, () => fazerMissil(M as never)),
            naves: cria(TETO.naves, () => fazerCamareira(M as never)),
            mare: cria(TETO.mare, () => fazerOnda(M as never)),
            elevadores: cria(TETO.elevadores, () => fazerCabine(M as never)),
            tiro: cria(TETO.tiro, () => {
                const g = new THREE.Group();
                const bala = new THREE.Mesh(balaGeo, M.tiro);
                bala.rotation.x = Math.PI / 2;
                bala.name = 'bala';
                const rastro = new THREE.Mesh(new THREE.ConeGeometry(.12, 2.0, 6), M.tiro);
                rastro.rotation.x = -Math.PI / 2;
                rastro.position.z = 1.2;       // atrás dela (a bala vai para -z)
                rastro.name = 'rastro';
                const core = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), M.core);
                core.name = 'core'; core.scale.z = 2.8;
                const missile = new THREE.Group(); missile.name = 'missile';
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(.20, 1.05, 4, 10), M.missil);
                body.rotation.x = Math.PI / 2; missile.add(body);
                const nose = new THREE.Mesh(new THREE.ConeGeometry(.21, .45, 10), M.core);
                nose.rotation.x = -Math.PI / 2; nose.position.z = -.76; missile.add(nose);
                for (let j = 0; j < 2; j++) {
                    const fin = new THREE.Mesh(new THREE.BoxGeometry(.8, .07, .38), M.missil);
                    fin.rotation.z = j * Math.PI / 2; fin.position.z = .43; missile.add(fin);
                }
                g.add(bala, rastro, core, missile);
                return g;
            }),
        };
    }, [M]);

    useEffect(() => () => {
        const geometries = new Set<THREE.BufferGeometry>();
        Object.values(pools).forEach(pool => pool.grupo.traverse(obj => {
            if (obj instanceof THREE.Mesh) geometries.add(obj.geometry);
        }));
        geometries.forEach(g => g.dispose());
        Object.values(M).forEach(m => m.dispose());
    }, [pools, M]);

    useFrame((state) => {
        const g = raiz.current; if (!g) return;
        // Quantos de cada tipo já foram usados neste quadro.
        const usados: Record<string, number> = { leque: 0, teleguiado: 0, naves: 0, mare: 0, elevadores: 0, tiro: 0 };

        for (const p of f12.projeteis) {
            const chave = p.tipo === 'tiro' ? 'tiro' : (p.tipo as NomeDoAtaque);
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
function desenhar(o: THREE.Object3D, p: Projetil, t: number, M: Record<string, THREE.Material>): void {
    o.position.set(p.x, p.y, p.z);

    if (p.tipo === 'tiro') {
        const m = p.de === 'irmao' ? M.tiroIrmao : M.tiro;
        for (const filho of (o as THREE.Group).children) {
            if (filho.name === 'missile') { filho.visible = !!p.carregado; continue; }
            filho.visible = !p.carregado || filho.name === 'rastro';
            (filho as THREE.Mesh).material = filho.name === 'core' ? M.core : p.carregado ? M.missilLuz : m;
            // o rastro do irmão é mais curto: a arma dele é menor, e isso tem de
            // dar para ver sem ler o HUD
            // O RASTRO DO MÍSSIL É O QUE TORNA O MÍSSIL ACHÁVEL.
            //
            // Ele cruza a arena em dois quadros. Num quadro fotografado logo
            // depois do lançamento não dava para localizar o foguete na imagem
            // — e é o prêmio que custa ficar parado no meio de uma salva. O
            // corpo pode ser pequeno; o risco que ele deixa atrás de si é que
            // precisa ser grande, porque é ele que fica no quadro tempo
            // suficiente para ser visto.
            if (filho.name === 'rastro') filho.scale.set(
                p.carregado ? 2.6 : 1,
                p.carregado ? 2.6 : 1,
                p.carregado ? 3.4 : p.de === 'irmao' ? .55 : 1);
        }
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
        const warning = o.getObjectByName('aviso-descida');
        if (warning) {
            const urgency = p.z > ARENA.zNave - 8 ? 14 : 6;
            warning.scale.setScalar(.9 + Math.sin(p.t * urgency) * .13);
            warning.position.y = 1.5 + Math.sin(p.t * urgency) * .08;
        }
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
