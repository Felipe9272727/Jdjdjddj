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
    f12, ARENA, MARE, frestaDaMare, LEQUE, ENQUADRAMENTO, BOCA_SAIDA,
    silhuetaDe, ELEVADORES, NAVES, TELEGUIADO,
    type Projetil, type NomeDoAtaque,
} from './f12Boss';

const CORES = {
    leque: '#ffd34a',        // os cinco andares: âmbar de placa de elevador
    // ── O VERMELHO TINHA UMA COR SÓ, E ERA ISSO QUE O FAZIA PARECER CRU ──
    //
    // Era `#e03a3a` chapado no corpo inteiro e `#8c1d1d` num caixote de 3,2 de
    // comprimento e largura constante. Um objeto de uma cor só não tem volume, e
    // um retângulo escuro arrastado atrás não tem movimento: os dois juntos leem
    // como marcador de posição.
    //
    // Perigo, profundidade, movimento e energia são quatro coisas diferentes e
    // cada uma precisa da sua camada. Aqui: CASCA escura (volume), BANDA quente
    // (energia contida), OLHO que pulsa (perigo, e a informação de que ele está
    // travado em você) e CHAMA aditiva que treme (movimento).
    teleguiadoCasca: '#4a1418',   // metal cozido: a parte que dá volume
    teleguiado: '#c8302c',        // a banda quente do meio
    teleguiadoOlho: '#ff5a3c',    // o buscador — o único ponto saturado
    chama: '#ff9a3c',
    fio: '#7a1a1a',
    naves: '#cfd6e0',        // as camareiras: cinza de uniforme
    navesLuz: '#7ad4ff',
    mare: '#3fa9d6',         // a maré do 2º
    mareEsc: '#1d6e94',
    elevadores: '#c9b28a',   // a espinha: a mesma cabine creme do elevador
    // a PORTA GIRATÓRIA: latão do saguão, para ela se ler como peça de hotel e
    // não como mais um projétil colorido
    giratoria: '#d8a13c',
    giratoriaEsc: '#7a5a1e',
    elevadoresEsc: '#6f6350',
    tiro: '#b6ff4a',
    carregado: '#8ff0ff',
    tiroIrmao: '#ff9d5a',
};

/** Quantos de cada tipo cabem no ar ao mesmo tempo. Generoso, mas fixo. */
const TETO: Record<string, number> = {
    leque: 12, teleguiado: 3, naves: 8, mare: 3, elevadores: 10, tiro: 36, carregado: 4,
    // a giratória sai em fila de 14, e a segunda pode começar antes de a
    // primeira sair de cena — 16 e não 14, senão o fim da espiral some
    giratoria: 16,
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

/**
 * A cabine que cai — e a largura dela SAI DO RAIO DE COLISÃO.
 *
 * Ela era 1,5 de largura contra uma hitbox de Ø 1,24: sobravam 13 cm de cada
 * lado em que o jogador estava dentro da cabine desenhada e não levava nada. A
 * medida agora vem de `silhuetaDe(ELEVADORES.raio)`, que é o contrato — ver a
 * nota longa em `f12Boss`. Para a cabine ficar maior, quem tem de subir é o
 * raio, e o preço em dificuldade é pago de olhos abertos.
 */
function fazerCabine(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const L = silhuetaDe(ELEVADORES.raio) * 2;      // largura total
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(L, L * 1.27, L), M.elevadores);
    const teto = new THREE.Mesh(new THREE.BoxGeometry(L * 1.07, 0.2, L * 1.07), M.elevadoresEsc);
    teto.position.y = L * 0.67;
    const porta = new THREE.Mesh(new THREE.BoxGeometry(0.12, L, L * 0.8), M.elevadoresEsc);
    porta.position.set(0, 0, L * 0.52); porta.rotation.y = Math.PI / 2;
    g.add(corpo, teto, porta);
    return g;
}

/**
 * A camareira — e a ASA dela é o que estava mentindo.
 *
 * Ela tinha 1,9 de ponta a ponta contra uma hitbox de Ø 1,1: as pontas
 * atravessavam o avião sem cobrar nada, e a camareira é justamente o padrão em
 * que o jogador se aproxima para atirar. A envergadura agora sai de
 * `silhuetaDe(NAVES.raio)`.
 */
function fazerCamareira(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const L = silhuetaDe(NAVES.raio) * 2;           // envergadura total
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(L * 0.52, 0.5, 1.2), M.naves);
    const cupula = new THREE.Mesh(new THREE.SphereGeometry(L * 0.22, 10, 8), M.navesLuz);
    cupula.position.set(0, 0.3, -0.1);
    const asa = new THREE.Mesh(new THREE.BoxGeometry(L, 0.1, 0.4), M.naves);
    g.add(corpo, cupula, asa);
    return g;
}

/**
 * O míssil — e aqui o defeito era o OUTRO: dano onde não havia míssil.
 *
 * O corpo tinha Ø 0,44 e a hitbox Ø 0,84, quase o dobro. O jogador levava tiro
 * de um ponto vazio, e isso não tem conserto pelo lado dele. O corpo engordou
 * até `silhuetaDe(TELEGUIADO.raio)` e o raio desceu para encontrá-lo.
 *
 * O FIO continua sendo RASTRO e não ameaça — ele nunca cobrou dano —, e por isso
 * é fino e some para trás: uma coisa comprida atrás de um projétil é lida como
 * parte dele, e essa leitura tem de ser desmentida pela forma.
 */
/**
 * O míssil — quatro camadas, porque "vermelho" não é um efeito.
 *
 * O corpo engordou até `silhuetaDe(TELEGUIADO.raio)` (o dano tinha o dobro da
 * largura do desenho — ver a nota em `f12Boss`), e o resto é leitura:
 *
 *   CASCA   escura, mais larga, dá o volume e a sombra própria
 *   BANDA   quente no meio, estreita: a energia que ele carrega
 *   OLHO    o buscador, na ponta, pulsando — é o que diz "é em VOCÊ"
 *   CHAMA   aditiva, atrás, tremendo: é o que diz que ele está acelerando
 *
 * O FIO continua sendo a piada do 9º andar, mas agora AFINA para trás em vez de
 * ser um caixote de largura constante — um rastro de largura fixa não tem
 * direção, e sem direção ele lê como parte do corpo, ou seja como ameaça. Ele
 * nunca cobrou dano nenhum e não pode parecer que cobra.
 */
function fazerMissil(M: Record<string, THREE.Material>): THREE.Group {
    const g = new THREE.Group();
    const r = silhuetaDe(TELEGUIADO.raio);

    const casca = new THREE.Mesh(new THREE.CapsuleGeometry(r, r * 3.0, 4, 8), M.teleguiadoCasca);
    casca.rotation.x = Math.PI / 2;
    // a banda quente: um anel curto e um pouco mais gordo, no meio do corpo
    const banda = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, r * 0.9, 8), M.teleguiado);
    banda.rotation.x = Math.PI / 2;
    // as aletas, que dão silhueta a um corpo que senão é uma cápsula lisa
    const aletas = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(r * 0.14, r * 1.5, r * 1.3), M.teleguiadoCasca);
        a.position.set(0, r * 0.8, r * 1.3);
        const giro = new THREE.Group();
        giro.rotation.z = (i / 3) * Math.PI * 2;
        giro.add(a); aletas.add(giro);
    }
    const olho = new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 8, 6), M.teleguiadoOlho);
    olho.position.z = -r * 1.9; olho.name = 'olho';
    const chama = new THREE.Mesh(new THREE.ConeGeometry(r * 0.78, r * 2.6, 7), M.chama);
    chama.rotation.x = -Math.PI / 2; chama.position.z = r * 3.0; chama.name = 'chama';

    // o rastro AFINA: quatro elos cada vez mais finos e mais apagados
    const fio = new THREE.Group(); fio.name = 'fio';
    for (let i = 0; i < 4; i++) {
        const k = 1 - i / 4;
        const elo = new THREE.Mesh(new THREE.BoxGeometry(r * 0.20 * k, r * 0.20 * k, 0.8), M.fio);
        elo.position.z = r * 3.4 + 0.42 + i * 0.82;
        fio.add(elo);
    }
    g.add(casca, banda, aletas, olho, chama, fio);
    return g;
}

export const Floor12Projeteis: React.FC = () => {
    const raiz = useRef<THREE.Group>(null);

    const M = useMemo(() => ({
        leque: mat64(CORES.leque, CORES.leque, 0.5),
        teleguiado: mat64(CORES.teleguiado, CORES.teleguiado, 0.55),
        teleguiadoCasca: mat64(CORES.teleguiadoCasca),
        teleguiadoOlho: mat64(CORES.teleguiadoOlho, CORES.teleguiadoOlho, 1.5),
        chama: mat64(CORES.chama, CORES.chama, 1.3),
        fio: mat64(CORES.fio),
        naves: mat64(CORES.naves), navesLuz: mat64(CORES.navesLuz, CORES.navesLuz, 0.6),
        mare: mat64(CORES.mare, CORES.mare, 0.15), mareEsc: mat64(CORES.mareEsc),
        elevadores: mat64(CORES.elevadores), elevadoresEsc: mat64(CORES.elevadoresEsc),
        giratoria: mat64(CORES.giratoria, CORES.giratoria, 0.45),
        giratoriaEsc: mat64(CORES.giratoriaEsc),
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
            // ── A FOLHA DA PORTA GIRATÓRIA ───────────────────────────
            // Uma placa estreita e alta com moldura, e não uma esfera: a
            // espiral só se lê como PORTA se cada unidade tiver um eixo, e
            // uma bola não tem eixo nenhum. A folha gira em torno do próprio
            // centro enquanto vem — ver `desenhar`.
            giratoria: cria(TETO.giratoria, () => {
                const g = new THREE.Group();
                const folha = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.5, 0.6), M.giratoria);
                const eixo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.7, 6), M.giratoriaEsc);
                g.add(folha, eixo);
                return g;
            }),
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
        const usados: Record<string, number> = {
            leque: 0, teleguiado: 0, naves: 0, mare: 0, elevadores: 0,
            giratoria: 0, tiro: 0, carregado: 0,
        };

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
        // O BUSCADOR PULSA e a CHAMA TREME. As duas em ritmos diferentes de
        // propósito: em fase viram uma coisa só piscando, que é o que um
        // marcador de posição faz. O pulso é lento o bastante para ser lido como
        // varredura de radar, e a chama é rápida o bastante para ser fogo.
        const g = o as THREE.Group;
        const olho = g.getObjectByName('olho');
        if (olho) olho.scale.setScalar(1 + Math.sin(t * 9 + p.id) * 0.35);
        const chama = g.getObjectByName('chama');
        if (chama) {
            chama.scale.set(1, 0.75 + Math.abs(Math.sin(t * 31 + p.id)) * 0.6, 1);
        }
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

    if (p.tipo === 'giratoria') {
        // ── A FOLHA APONTA PARA FORA, E É ISSO QUE FAZ SER UMA PORTA ─────
        //
        // A primeira versão girava a folha em DOIS eixos com o relógio livre
        // (`t * 2,4` e `t * 1,1`), sem relação nenhuma com a espiral. Um
        // avaliador olhou a foto e leu "estilhaço dourado espalhado", não
        // "porta girando" — e estava certo: catorze coisas girando cada uma no
        // seu ritmo é estilhaço por definição.
        //
        // O que faz uma porta giratória ser legível é que as folhas são RAIOS
        // de um mesmo eixo. Aqui a folha é alinhada com a direção em que ela
        // está indo — que é o raio dela — e o conjunto passa a abrir como um
        // leque que roda.
        //
        // E o sentido alternado, que é a piada do padrão, era INVISÍVEL:
        // `Math.sign(nasceu || 1)` com `nasceu = 0` na primeira folha dava
        // sempre +1, e o resto seguia o relógio. Agora o sentido está na
        // própria posição das folhas, que é onde ele sempre esteve.
        o.rotation.z = Math.atan2(p.y - BOCA_SAIDA.y, p.x - BOCA_SAIDA.x) + Math.PI / 2;
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
