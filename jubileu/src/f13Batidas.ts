/**
 * Três Batidas — bater e escutar.
 *
 * Bater de novo na mesma porta (em até 25 s) não chama o morador: o hóspede
 * encosta o ouvido na madeira. A 2ª batida devolve o que se ouve lá dentro —
 * e o que se ouve casa com as pistas (a lareira, o latão, o botão).
 *
 * A 3ª já é curiosidade demais. Numa porta errada ela volta de DENTRO, e no
 * susto a voz deixa escapar UM fato verdadeiro da casa — o suficiente para
 * riscá-la da lista. Na casa certa a 3ª confirma: o zumbido e o ding.
 *
 * Da 4ª em diante ninguém responde. A porta errada emudece de vez; a certa
 * faz o zumbido parar de uma vez — e isso é bem pior.
 */
import { CASAS, CASA_CERTA } from './f13Lore';

const JANELA_MS = 25000;   // dá tempo de ler o que o morador disse e bater de novo

/** Última batida e quantas seguidas em cada porta. */
const seguidas = new Map<number, { n: number; t: number }>();

export function zerarBatidas(): void { seguidas.clear(); }

/** Registra uma batida e devolve quantas seguidas já são nesta porta (1, 2, 3…). */
export function contarBatida(i: number, agora: number): number {
    const s = seguidas.get(i);
    const n = s && agora - s.t < JANELA_MS ? s.n + 1 : 1;
    seguidas.set(i, { n, t: agora });
    return n;
}

/** O que se escuta com o ouvido na porta (2ª batida). Derivado dos fatos da casa. */
export function oQueSeOuve(i: number): string {
    const c = CASAS[i];
    if (i === CASA_CERTA) return 'Lá dentro, nada de fogo. Só um zumbido baixo, constante, como uma colmeia de ferro.';
    const partes: string[] = [];
    partes.push(c.fumaca ? 'Lenha estalando na lareira' : 'Nenhum estalo de fogo, a casa está fria');
    if (c.botao) partes.push('e, perto do batente, alguma coisa que zune quando você encosta');
    else if (c.portaDeLatao) partes.push('e a porta de metal gelada contra a orelha');
    else partes.push('e passos de alguém que para, esperando você ir embora');
    return partes.join(', ') + '.';
}

// ── A 3ª BATIDA ──────────────────────────────────────────────────────────────

/** Qual pista a casa deixa escapar na 3ª batida. */
export type PistaQueElimina = 'fumaca' | 'latao' | 'botao';

/**
 * O fato que a porta errada entrega sem querer: sempre VERDADEIRO sobre a casa
 * e sempre contrário ao que a casa certa exige — logo, risca a casa da lista.
 * A casa certa não tem o que eliminar: devolve null.
 */
export function pistaQueElimina(i: number): PistaQueElimina | null {
    if (i === CASA_CERTA) return null;
    const c = CASAS[i];
    if (c.fumaca) return 'fumaca';          // a casa certa não solta fumaça
    if (!c.portaDeLatao) return 'latao';    // a casa certa é de latão
    if (!c.botao) return 'botao';           // a casa certa tem botão
    return null;
}

/** O que a voz lá dentro deixa escapar, sem perceber que se entregou. */
const ESCAPOU: Record<PistaQueElimina, string> = {
    fumaca: "'Aqui a lareira nunca apaga', resmunga ela lá dentro. 'Nem no verão.'",
    latao: "'Essa porta é de carvalho, forasteiro', diz a voz, entediada. 'Carvalho e nada mais.'",
    botao: "'Botão?', bufa ela. 'Aqui não tem botão nenhum. Procura direito.'",
};

export interface RespostaBatida { texto: string; errada: boolean }

/** A 3ª batida: a certa confirma; a errada responde de dentro e se entrega. */
export function terceiraBatida(i: number): RespostaBatida {
    if (i === CASA_CERTA) {
        return { texto: 'Você bate a terceira vez. Lá dentro, bem baixinho: ding.', errada: false };
    }
    const susto = 'Você bate a terceira vez. Do outro lado, batem de volta — três vezes, secas, na sua cadência. Então a voz chega junto à madeira e deixa escapar o que não devia.';
    const p = pistaQueElimina(i);
    return { texto: p ? `${susto} ${ESCAPOU[p]}` : susto, errada: true };
}

// ── DA 4ª EM DIANTE ──────────────────────────────────────────────────────────

/** Porta errada: acabou. Ninguém mais responde. */
const SILENCIO_ERRADO = 'Ninguém responde mais. Até os passos pararam.';

/** Casa certa: o zumbido morre — e alguém fica esperando. */
const SILENCIO_CERTO = 'Você bate de novo e o zumbido para. Não diminui: para de uma vez, como se alguém tivesse desligado a máquina. E no silêncio você entende — lá dentro não tem mais ninguém escutando. Tem alguém esperando.';

/**
 * Resposta a partir da 3ª batida na mesma porta.
 * n = 3 devolve a terceira; n >= 4 devolve o que vem depois (o silêncio).
 */
export function batidaNaPorta(i: number, n: number): RespostaBatida {
    if (n < 4) return terceiraBatida(i);
    if (i === CASA_CERTA) return { texto: SILENCIO_CERTO, errada: false };
    return { texto: SILENCIO_ERRADO, errada: true };
}
