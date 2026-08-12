// ── O AGENTE-JOGADOR: A PARTE QUE SABE QUE O MUNDO TEM ALTURA ─────────────
//
// Primeiro pedaço do "faça tudo". Tudo o que veio antes trata o andar como um
// plano: uma grade de x e z, e "chegar" é uma distância no chão. Isso vale nos
// andares de sala, e é rigorosamente falso no Andar 3, que é um parkour — lá o
// chão é um vão, e o caminho é uma sequência de plataformas com altura.
//
// ── POR QUE ISTO NÃO É "UMA GRADE 3D" ────────────────────────────────────
//
// A tentação é dar uma dimensão a mais para a grade. Seria caro e errado: o
// espaço entre duas plataformas não é caminhável em altura nenhuma, e o que
// liga uma à outra não é adjacência, é um PULO — que ou alcança, ou não.
//
// Então o modelo certo é um GRAFO: cada plataforma é um nó, e existe aresta de
// A para B quando o pulo do jogo leva de A a B. As arestas não saem de palpite:
// saem de `F3_JUMP` e `F3_GRAVITY`, os mesmos números que o `Player.tsx`
// integra todo quadro.
//
// ── O QUE A MEDIÇÃO CONFIRMOU ────────────────────────────────────────────
//
// O gerador do parkour tem um comentário afirmando que os vãos são jogáveis:
//
//     "Generation ranges (kept conservative so every gap is jumpable)"
//
// Isso é uma afirmação verificável, e nunca tinha sido verificada. Com os
// números do jogo, o pulo sobe 2,05 m e fica 0,86 s no ar; subindo o degrau
// máximo (1,4 m) ainda sobram 0,67 s de voo, que a 4 m/s valem 2,70 m de
// avanço — contra 2,25 m de vão de borda no pior caso do gerador. O comentário
// estava certo, com 45 cm de folga. Agora tem teste.
import { F3_GRAVITY, F3_JUMP, SPEED } from '../constants';

/** Altura máxima que um pulo alcança: v²/2g. */
export const ALTURA_DO_PULO = (F3_JUMP * F3_JUMP) / (2 * F3_GRAVITY);

/** Quanto tempo o pulo inteiro dura, subida e descida. */
export const TEMPO_NO_AR = (2 * F3_JUMP) / F3_GRAVITY;

/**
 * ── "DÁ" E "DÁ COM SOBRANDO" SÃO DUAS PERGUNTAS ──────────────────────────
 *
 * Eu tinha uma margem só, de 25 cm, embutida no `daParaPular` — "prudência".
 * Medindo o curso real ela reprova o degrau 3 do curso padrão, que sobra 13 cm
 * e o jogador atravessa. Uma margem de planejamento que recusa pulos LEGAIS
 * não é prudência: é o agente sendo pior que o jogo de propósito.
 *
 * Então `daParaPular` responde só a física, sem margem nenhuma, e o conforto
 * vira um número separado que o chamador lê (`folga`) e compara com isto
 * quando quiser preferir a rota folgada.
 */
export const FOLGA_CONFORTAVEL = 0.25;

export type Plataforma = {
    id: number;
    /** Centro em X. Numa plataforma que oscila, use o centro da oscilação. */
    x: number;
    /** Centro em Z. */
    z: number;
    /** Meias-extensões da superfície. */
    hw: number;
    hd: number;
    /** Altura do pé do jogador em cima dela. */
    topY: number;
    /** Amplitude da oscilação em X; 0 quando é fixa. */
    amp?: number;
};

/**
 * ── QUANTO TEMPO DE VOO SOBRA PARA SUBIR `desnivel` ──────────────────────
 *
 * `y(t) = v·t − g·t²/2`. Para pousar a uma altura `d` acima da saída, o
 * instante útil é a RAIZ MAIOR — a menor é o mesmo ponto ainda na subida, e
 * pousar ali significaria bater na quina da plataforma em vez de cair em cima.
 *
 * Descer é de graça em altura e caro em tempo: quanto mais fundo o alvo, mais
 * tempo no ar, e mais longe dá para chegar. Por isso o desnível negativo tem
 * raiz também, e maior.
 */
export function tempoDeVoo(desnivel: number): number | null {
    if (desnivel > ALTURA_DO_PULO) return null;
    const disc = F3_JUMP * F3_JUMP - 2 * F3_GRAVITY * desnivel;
    if (disc < 0) return null;
    return (F3_JUMP + Math.sqrt(disc)) / F3_GRAVITY;
}

/** Quanto ele avança no chão num pulo que precisa subir `desnivel`. */
export function alcanceDoPulo(desnivel: number, velocidade = SPEED): number {
    const t = tempoDeVoo(desnivel);
    return t === null ? 0 : velocidade * t;
}

/**
 * O vão de BORDA A BORDA entre duas plataformas, no plano.
 *
 * Distância entre centros seria uma medida errada e sempre pessimista: metade
 * de cada plataforma não é vão, é chão.
 *
 * ── A PONTE QUE SE MOVE É OPORTUNIDADE, NÃO OBSTÁCULO ────────────────────
 *
 * Eu tinha modelado a oscilação ao contrário: subtraía `amp` da meia-largura,
 * como se só valesse a faixa que a ponte cobre O TEMPO TODO. Fui ver os
 * números do gerador e a conta não fecha — `amp` chega a 2,4 e `hw` no máximo
 * a 1,4, então essa faixa é NEGATIVA na maioria das pontes móveis, e o meu vão
 * crescia em vez de encolher.
 *
 * O modelo certo é o do jogador: a ponte VEM até você. Quem espera a fase
 * certa alcança `bx ± (amp + hw)`. É o motivo de a ponte móvel existir — ela
 * atravessa vãos que uma fixa não atravessaria. Tratá-la como obstáculo era
 * inverter o propósito dela.
 */
export function vaoEntre(de: Plataforma, para: Plataforma): number {
    const util = (p: Plataforma) => p.hw + (p.amp ?? 0);
    const dx = Math.max(0, Math.abs(para.x - de.x) - util(de) - util(para));
    const dz = Math.max(0, Math.abs(para.z - de.z) - de.hd - para.hd);
    return Math.hypot(dx, dz);
}

export type Salto = {
    /** Dá para fazer? Só física, sem margem. */
    da: boolean;
    /** Vão de borda a borda. */
    vao: number;
    /** Quanto o pulo alcança com este desnível. */
    alcance: number;
    /** Subida exigida. Negativo é queda. */
    desnivel: number;
    /** `alcance − vao`. Negativo = não dá; perto de zero = dá raspando. */
    folga: number;
    porque: 'da' | 'alto-demais' | 'longe-demais';
};

/** Este pulo existe? A resposta usa a física do jogo, não uma tabela. */
export function daParaPular(
    de: Plataforma,
    para: Plataforma,
    velocidade = SPEED,
): Salto {
    const desnivel = para.topY - de.topY;
    const vao = vaoEntre(de, para);
    if (desnivel > ALTURA_DO_PULO) {
        return {
            da: false, vao, alcance: 0, desnivel, folga: -Infinity, porque: 'alto-demais',
        };
    }
    const alcance = alcanceDoPulo(desnivel, velocidade);
    const folga = alcance - vao;
    return {
        da: folga >= 0, vao, alcance, desnivel, folga,
        porque: folga >= 0 ? 'da' : 'longe-demais',
    };
}

/** Dá, e com sobra suficiente para não depender de execução perfeita. */
export function saltoConfortavel(s: Salto): boolean {
    return s.da && s.folga >= FOLGA_CONFORTAVEL;
}

/**
 * ── A ROTA PELO AR ────────────────────────────────────────────────────────
 *
 * Busca em largura sobre o grafo de pulos. Largura, e não A*: os nós são
 * dezenas, não milhares, e o que se quer é o MENOR NÚMERO DE PULOS — cada pulo
 * é uma chance de errar, e um caminho mais curto em metros com mais saltos é
 * pior para quem tem de executá-lo.
 *
 * Lista vazia = não há sequência de pulos daqui até lá. É resposta, não falha:
 * num parkour, "esta rota não fecha" é exatamente o que o jogador precisa saber
 * antes de pular.
 */
export function rotaDePulos(
    plataformas: readonly Plataforma[],
    deId: number,
    ateId: number,
    velocidade = SPEED,
): Plataforma[] {
    const porId = new Map(plataformas.map((p) => [p.id, p]));
    if (!porId.has(deId) || !porId.has(ateId)) return [];
    if (deId === ateId) return [porId.get(deId)!];

    const veioDe = new Map<number, number>();
    const vistos = new Set<number>([deId]);
    const fila = [deId];
    for (let cabeca = 0; cabeca < fila.length; cabeca += 1) {
        const atual = porId.get(fila[cabeca])!;
        if (atual.id === ateId) break;
        for (const p of plataformas) {
            if (vistos.has(p.id)) continue;
            if (!daParaPular(atual, p, velocidade).da) continue;
            vistos.add(p.id);
            veioDe.set(p.id, atual.id);
            fila.push(p.id);
        }
    }
    if (!vistos.has(ateId)) return [];
    const rota: Plataforma[] = [];
    for (let id: number | undefined = ateId; id !== undefined; id = veioDe.get(id)) {
        rota.push(porId.get(id)!);
        if (id === deId) break;
    }
    return rota.reverse();
}

/** A plataforma em que ele está — a mais alta cujo topo está sob os pés dele. */
export function ondeElePisa(
    plataformas: readonly Plataforma[],
    x: number,
    y: number,
    z: number,
    folga = 0.12,
): Plataforma | null {
    let melhor: Plataforma | null = null;
    for (const p of plataformas) {
        if (x < p.x - p.hw || x > p.x + p.hw) continue;
        if (z < p.z - p.hd || z > p.z + p.hd) continue;
        if (p.topY > y + folga) continue;
        if (!melhor || p.topY > melhor.topY) melhor = p;
    }
    return melhor;
}
