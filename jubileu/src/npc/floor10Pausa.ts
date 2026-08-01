// ── PAUSAR É PARAR O WORKER, E RETOMAR É NÃO COMEÇAR DO ZERO ──────────────
//
// O DEFEITO, escrito no próprio código que o causava:
//
//     "o `abort` do wllama 3.5.1 só faz o JS PARAR DE LER (getResponse checa o
//      sinal entre um get_result e outro); o worker continua gerando até o EOS
//      ou até os 320 tokens. Portanto isto não devolve CPU."
//
// Ou seja: quando o jogador mandava uma mensagem, `abortDeliberation()` fazia o
// JavaScript virar as costas — e o Llama 1B seguia gerando 320 tokens em N
// threads. Ao mesmo tempo o SmolLM3 começava a gerar em até 8. Dois llama.cpp
// disputando os mesmos núcleos do celular, e às vezes três com o córtex motor
// junto. É isso que trava o aparelho a ponto de ele desligar sozinho: não é o
// modelo ser pesado, é serem DOIS ao mesmo tempo sem ninguém ter pedido.
//
// E o pensamento que continuou gerando ia para o lixo, porque ninguém estava
// lendo. Na rodada seguinte ele recomeçava do primeiro token. Um raciocínio de
// ~320 tokens a 2 tok/s não fecha em 160 s se for reiniciado a cada fala — daí
// "o pensamento da llama está demorando 10 anos pra mostrar".
//
// ESTE MÓDULO É A METADE "RETOMAR". A metade "parar" vive em quem tem o worker
// na mão (floor10SmallBrain / floor10MotorBrain): encerrar o Worker é a ÚNICA
// forma de devolver CPU de verdade nesta versão do wllama. Os pesos não são
// baixados de novo — eles ficam no OPFS; o que se paga na volta é a releitura
// do disco, e o que se ganha é o celular respirando enquanto o Nilo fala.

/** Quem pode ter um pensamento pausado. */
export type DonoPausado = 'vontade' | 'motor';

export type PensamentoPausado = {
    /** O que ele já tinha pensado quando a fala interrompeu. */
    parcial: string;
    /** Quantos tokens isso custou — só para a tela poder dizer o que se salvou. */
    tokens: number;
    /** Quando pausou (ms). */
    em: number;
};

/**
 * Depois disto o mundo já mudou demais e o raciocínio velho atrapalha mais do
 * que ajuda: o jogador andou, a conversa acabou, os impulsos são outros.
 */
export const JANELA_RETOMADA_MS = 90_000;

/** Abaixo disto não há o que retomar — só ruído de meia palavra. */
const MINIMO_UTIL = 24;

const pausados = new Map<DonoPausado, PensamentoPausado>();

/** Guarda o que já foi pensado. Texto curto demais é descartado na hora. */
export function pausarPensamento(
    dono: DonoPausado,
    parcial: string,
    tokens: number,
    agora = Date.now(),
): boolean {
    const limpo = parcial.trim();
    if (limpo.length < MINIMO_UTIL) {
        pausados.delete(dono);
        return false;
    }
    pausados.set(dono, { parcial: limpo, tokens, em: agora });
    return true;
}

/**
 * O pensamento pausado, se ainda valer a pena. Não remove: quem consome decide
 * quando descartar (uma retomada que também é interrompida continua valendo).
 */
export function pensamentoPausado(
    dono: DonoPausado,
    agora = Date.now(),
): PensamentoPausado | null {
    const guardado = pausados.get(dono);
    if (!guardado) return null;
    if (agora - guardado.em > JANELA_RETOMADA_MS) {
        pausados.delete(dono);
        return null;
    }
    return guardado;
}

/** Chamado quando a rodada fecha (decidiu, ou o raciocínio se enrolou). */
export function descartarPensamento(dono: DonoPausado): void {
    pausados.delete(dono);
}

export function limparPausas(): void {
    pausados.clear();
}

/**
 * O prompt que faz o modelo CONTINUAR em vez de recomeçar.
 *
 * Por que vai no texto do usuário e não como uma mensagem do assistente: o
 * template de chat de cada modelo fecha o turno do assistente do seu jeito, e
 * depender disso é depender do template. Dizer "você já começou a pensar isto,
 * continue" funciona em qualquer um deles.
 */
export function promptDeRetomada(prompt: string, parcial: string): string {
    return `${prompt}

VOCÊ JÁ TINHA COMEÇADO A PENSAR ISTO (a fala do jogador interrompeu no meio):
«${parcial.trim()}»

CONTINUE exatamente daí. Não repita o que já está escrito acima, não recomece:
feche o raciocínio e assine a escolha.`;
}

/** Quanto do fim do pensamento antigo é comparado com o começo do novo. */
const JANELA_EMENDA = 240;
/** Sobreposição menor que isto é coincidência de palavra comum, não repetição. */
const MINIMO_EMENDA = 12;

/**
 * Emenda o que ele pensou ANTES da pausa com o que pensou DEPOIS.
 *
 * Mandar "continue de onde parou" não impede o modelo de reescrever o fim da
 * frase anterior antes de seguir — foi o que apareceu no teste:
 * "…neste andar faz" + "Estou preso neste andar faz tempo demais" virava
 * "…faxEstou preso neste andar faz tempo demais". O pensamento na tela ficava
 * gaguejando, e o texto duplicado ainda ia para o parser da decisão.
 *
 * Aqui a maior sobreposição entre o fim de um e o começo do outro é removida.
 */
export function emendarPensamento(base: string, continuacao: string): string {
    if (!base) return continuacao;
    if (!continuacao) return base;
    const janela = base.slice(-JANELA_EMENDA);
    const teto = Math.min(janela.length, continuacao.length);
    for (let n = teto; n >= MINIMO_EMENDA; n--) {
        if (janela.slice(-n) === continuacao.slice(0, n)) {
            return base + continuacao.slice(n);
        }
    }
    const emenda = /\s$/.test(base) || /^\s/.test(continuacao) ? '' : ' ';
    return base + emenda + continuacao;
}
