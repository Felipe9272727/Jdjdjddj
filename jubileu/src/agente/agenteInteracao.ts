// ── O AGENTE-JOGADOR: A PARTE QUE ENCOSTA NAS COISAS ──────────────────────
//
// Terceiro pedaço do "faça tudo": interagir. Pegar, apertar, chamar.
//
// ── O QUE EU FUI CONFERIR ANTES DE INVENTAR UM MODELO ────────────────────
//
// A tentação era desenhar um sistema de "ações" com verbos, alcances por tipo,
// prioridades. Fui ler como o jogo REALMENTE decide que dá para interagir, em
// todos os lugares onde ele decide isso:
//
//   Player.tsx  porta da casa .... nível 1 && dist(pos, HOUSE_DOOR) < 3.0
//   Player.tsx  NPC do saguão .... nível 0 && dist(pos, npcRef)    < 4.0
//   Player.tsx  recepção ......... nível 0 && dist(pos, CASHIER)   < 2.5
//   App.tsx     cama ............. dist(pos, BED_POS)              < 3.0
//   f10Prison   placa/alavanca ... dist(pos, device)               < 0.9
//
// É sempre a MESMA forma: um ponto, um raio, e o andar em que o jogo escuta.
// Cinco lugares, uma regra. Então o agente não precisa de um sistema de ações
// — precisa de uma habilidade só: CHEGAR A MENOS DE R DE UM PONTO. O resto
// (apertar a tecla) o jogo já resolve quando o corpo está no lugar certo.
//
// ── POR QUE NÃO BASTA MANDAR O A* NO PONTO ───────────────────────────────
//
// Quase todo interagível é SÓLIDO: a recepção é um balcão, a cama é um móvel,
// a porta é uma parede. O centro deles é célula ocupada. Pedir caminho até lá
// faz o A* aproximar para "a célula livre mais próxima" — que pode ser do lado
// ERRADO do balcão, ou dentro de outra sala com a parede no meio.
//
// O alvo certo não é o objeto: é o melhor lugar ALCANÇÁVEL para ficar perto
// dele. Isso sai da inundação, não do A*: das células que ele consegue pisar,
// a que fica mais perto do objeto. Se a mais perto ainda estiver fora do raio,
// a resposta honesta é "não dá para alcançar isto daqui" — e é uma resposta
// útil, porque manda procurar o caminho em vez de bater no balcão.
import {
    BED_INTERACT_DIST, BED_POS, CASHIER_INTERACT_DIST, CASHIER_POS,
    DOOR_INTERACT_DIST, HOUSE_DOOR_X, HOUSE_DOOR_Z, NPC_INTERACT_DIST,
} from '../constants';
import { PRISON_DEVICES, PRISON_REACH } from '../npc/f10Prison';
import { type Ponto, alcancaveis, paraMundo } from './agenteMapa';
import { type Tentativa, irAte } from './agenteAndar';
import type { EstadoDoAndar } from './agenteObjetivo';

export type Interagivel = {
    nome: string;
    pos: Ponto;
    /** A que distância o JOGO aceita a interação. Nunca um número meu. */
    alcance: number;
};

/**
 * ── O CATÁLOGO É DADO, NÃO RAMIFICAÇÃO ───────────────────────────────────
 *
 * Uma tabela por andar, não uma escada de `if`. A diferença importa para a
 * exigência "tem que funcionar em andares futuros": um andar que não está na
 * tabela devolve lista vazia, e lista vazia é uma resposta que o agente sabe
 * tratar — ele explora. Uma escada de `if` sem o `else` certo devolveria
 * `undefined` e quebraria.
 *
 * Os interagíveis que só existem em tempo de execução (o NPC do saguão anda; o
 * Nilo também) entram por `extras`, porque a posição deles não é constante.
 */
const CATALOGO: Readonly<Record<number, readonly Interagivel[]>> = Object.freeze({
    0: [
        { nome: 'recepção', pos: { ...CASHIER_POS }, alcance: CASHIER_INTERACT_DIST },
    ],
    1: [
        { nome: 'porta da casa', pos: { x: HOUSE_DOOR_X, z: HOUSE_DOOR_Z }, alcance: DOOR_INTERACT_DIST },
        { nome: 'cama', pos: { ...BED_POS }, alcance: BED_INTERACT_DIST },
    ],
    10: PRISON_DEVICES.map((d) => ({
        nome: d.id, pos: { x: d.x, z: d.z }, alcance: PRISON_REACH,
    })),
});

/** O raio com que o jogo aceita conversa com um NPC — para montar `extras`. */
export const ALCANCE_DE_CONVERSA = NPC_INTERACT_DIST;

export function interagiveisDoAndar(
    nivel: number,
    extras: readonly Interagivel[] = [],
): readonly Interagivel[] {
    return [...(CATALOGO[nivel] ?? []), ...extras];
}

export type Aproximacao = Tentativa & {
    /** Terminou dentro do raio em que o jogo aceita a interação. */
    encostou: boolean;
    /** Já estava perto quando começou. */
    jaEstava: boolean;
    /** Distância final até o objeto — o número que decide `encostou`. */
    distancia: number;
};

const dist = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Leva o corpo até uma distância em que o jogo aceita a interação.
 *
 * O alvo do caminho é a célula ALCANÇÁVEL mais próxima do objeto, e a
 * tolerância de chegada é apertada de propósito: com `PRISON_REACH = 0,9 m`, os
 * 0,45 m de folga que o andador usa por padrão são metade do raio inteiro —
 * parar "quase lá" ali é não acionar a placa.
 */
export function chegarPerto(
    andar: EstadoDoAndar,
    de: Ponto,
    alvo: Interagivel,
): Aproximacao {
    const jaEstava = dist(de, alvo.pos) <= alvo.alcance;
    if (jaEstava) {
        return {
            chegou: true, fim: { ...de }, faltou: 0, passos: 0, plano: [],
            motivo: 'chegou', encostou: true, jaEstava: true, distancia: dist(de, alvo.pos),
        };
    }

    const { grade } = andar;
    const marca = alcancaveis(grade, de);
    let posto: Ponto | null = null;
    let melhor = Infinity;
    for (let j = 0; j < grade.altura; j += 1) {
        for (let i = 0; i < grade.largura; i += 1) {
            if (!marca[j * grade.largura + i]) continue;
            const p = paraMundo(grade, i, j);
            const d = dist(p, alvo.pos);
            if (d < melhor) { melhor = d; posto = p; }
        }
    }
    if (!posto || melhor > alvo.alcance) {
        return {
            chegou: false, fim: { ...de }, faltou: dist(de, alvo.pos), passos: 0,
            plano: [], motivo: 'sem-caminho', encostou: false, jaEstava: false,
            distancia: dist(de, alvo.pos),
        };
    }

    // A folga de chegada é o que sobra do raio depois de descontar a distância
    // do posto ao objeto — nunca mais que isso, ou ele "chega" fora do alcance.
    const folga = Math.max(0.05, alvo.alcance - melhor);
    const r = irAte(grade, andar.paredes, de, posto, 4000, folga);
    const distancia = dist(r.fim, alvo.pos);
    return {
        ...r, distancia, jaEstava: false, encostou: r.chegou && distancia <= alvo.alcance,
    };
}

/**
 * O interagível mais perto que ele consegue alcançar a pé — ou `null`.
 *
 * `null` não é falha: num andar sem nada com que interagir (a maioria), é a
 * resposta certa, e quem chamou segue para o objetivo de explorar.
 */
export function oQueDaParaAlcancar(
    andar: EstadoDoAndar,
    de: Ponto,
    extras: readonly Interagivel[] = [],
): Interagivel | null {
    const marca = alcancaveis(andar.grade, de);
    const { grade } = andar;
    let escolhido: Interagivel | null = null;
    let melhor = Infinity;
    for (const alvo of interagiveisDoAndar(andar.nivel, extras)) {
        let perto = Infinity;
        for (let j = 0; j < grade.altura; j += 1) {
            for (let i = 0; i < grade.largura; i += 1) {
                if (!marca[j * grade.largura + i]) continue;
                perto = Math.min(perto, dist(paraMundo(grade, i, j), alvo.pos));
            }
        }
        if (perto > alvo.alcance) continue;
        const daqui = dist(de, alvo.pos);
        if (daqui < melhor) { melhor = daqui; escolhido = alvo; }
    }
    return escolhido;
}
