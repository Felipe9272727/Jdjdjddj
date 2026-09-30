/**
 * Três Batidas — bater e escutar.
 *
 * Bater de novo na mesma porta (em até 25 s) não chama o morador: o hóspede
 * encosta o ouvido na madeira. A 2ª batida devolve o que se ouve lá dentro —
 * e o que se ouve casa com as pistas (a lareira, o latão, o botão). A 3ª é
 * curiosidade demais: numa porta errada a batida volta de DENTRO, e a vila
 * repara. Na casa certa, a 3ª confirma: o zumbido e o ding.
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

/** A 3ª batida: a certa confirma; a errada responde de dentro. */
export function terceiraBatida(i: number): { texto: string; errada: boolean } {
    if (i === CASA_CERTA) return { texto: 'Você bate a terceira vez. Lá dentro, bem baixinho: ding.', errada: false };
    return { texto: 'Você bate a terceira vez… e alguém bate de volta. Três vezes. De dentro.', errada: true };
}
