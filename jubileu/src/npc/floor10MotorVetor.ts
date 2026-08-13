// ── O CAMINHO A, QUE COMEÇOU COMO CAMINHO B ──────────────────────────────
//
// Três caminhos foram à bancada, nos sete pensamentos reais do dono do jogo:
//
//     A) vetor sozinho .............. 5/7 ·   838 ms ·      0 MB
//     B) vetor + qwen se apertado ... 6/7 ·  4761 ms · +639 MB, qwen 3x
//     C) qwen entre os 3 ............ 4/7 ·  9763 ms · +639 MB
//
// O B ganhou essa primeira medição, e este cabeçalho dizia "O CAMINHO B,
// LIGADO". DEPOIS o desempate saiu: um caso em sete não distingue 5/7 de 6/7
// com sete amostras, e não paga 639 MB no aparelho nem 3,5 s por rodada. A
// decisão e o porquê estão em `floor10MotorBrain`, no lugar onde a chamada
// deixou de ser feita.
//
// O cabeçalho ficou para trás e passou a MENTIR sobre o código: dizia que o
// Qwen acorda quando o vetor duvida, e ele não acorda mais. Neste projeto
// comentário envelhecido já virou defeito duas vezes — quando o comentário e o
// código discordam, alguém acaba consertando o código para casar com o
// comentário errado.
//
// O que ficou de pé do B é o MECANISMO, não o gasto: `naDuvida` continua sendo
// calculado e continua marcando quando a margem é apertada. Religar o desempate
// é uma linha em `floor10MotorBrain`, e a peça (`translateWithMotorEngine`)
// continua testada. O que saiu foi a chamada.
//
// Este arquivo é a metade que fala com o mundo: pega o vetor do pensamento no
// modelo residente, desempacota os rótulos e devolve o veredito. A decisão em
// si mora em `floor10Classificador`, que é puro.
import {
    FLOOR10_MOTOR_VETORES, type VetorDoRotuloEmpacotado,
} from './floor10MotorVetores';
import {
    candidatosDoMotor,
    desempacotar,
    margemDoMotor,
    normalizar,
    ranquearAlvos,
    type VetorDoRotulo,
} from './floor10Classificador';
import { textoDoPensamento } from './floor10Rotulos';
import { vetorDoTexto } from './floor10Memoria';
import type {
    Floor10MotorDuration,
    Floor10MotorPace,
    Floor10MotorPlan,
    Floor10MotorTarget,
} from './floor10MotorCortex';
import { verboDaProsa } from './floor10Prosa';
import { anotar } from './floor10CaixaPreta';

/**
 * ── O LIMIAR, E POR QUE ELE É GENEROSO ───────────────────────────────────
 *
 * Nos sete casos medidos, os dois ERROS do vetor tiveram margem 0,014 e
 * 0,040. Mas um ACERTO teve margem 0,001 — ou seja, nenhum corte separa
 * limpo, e cravar um número em cima de sete amostras é chute com cara de
 * dado.
 *
 * Eu cravei 0,08 assim mesmo, dizendo "na dúvida, pergunta". AS MARGENS
 * REAIS DO APARELHO DELE derrubaram o número: 0,037 · 0,062 · 0,076 — as três
 * abaixo do corte. O Qwen acordou em TODAS as rodadas, que é exatamente o
 * caminho C que a bancada já tinha reprovado, e cada rodada custou ~100 s.
 *
 * Um limiar que dispara sempre não é um limiar, é um `if (true)`.
 *
 * 0,05 fica entre os erros medidos na bancada (0,014 e 0,040) e as margens
 * confiantes do campo (0,062 e 0,076): as duas últimas passam direto, a
 * apertada ainda pergunta. Continua sendo pouca amostra — por isso a margem
 * de cada rodada vai para a caixa-preta e aparece na tela do `?campo`, para
 * o número ser MEDIDO conforme mais pensamentos reais aparecem, e não
 * chutado de novo.
 */
export const MARGEM_SEGURA = 0.05;

let cache: VetorDoRotulo[] | null = null;

/** Os rótulos desempacotados, uma vez por sessão. */
export function rotulosVetorizados(): VetorDoRotulo[] {
    cache ??= FLOOR10_MOTOR_VETORES.map((r: VetorDoRotuloEmpacotado) => ({
        alvo: r.alvo,
        v: normalizar(desempacotar(r.v, r.escala)),
    }));
    return cache;
}

export type VeredictoDoVetor = {
    /** O melhor palpite do vetor. */
    alvo: Floor10MotorTarget;
    /** Distância entre o 1º e o 2º. Alta = confiante. */
    margem: number;
    /** Os candidatos que iriam ao desempate, o primeiro incluso. */
    candidatos: Floor10MotorTarget[];
    /** `true` quando a margem é apertada e vale acordar o Qwen. */
    naDuvida: boolean;
};

/**
 * O VEREDITO DO VETOR sobre um pensamento.
 *
 * `null` quando o modelo de embedding não está no ar ou nada se pareceu com
 * nada. Nunca lança. Sem veredito o motor não produz plano, e sem plano o
 * corpo mantém o que fazia — a falha segura.
 */
export async function classificarPensamento(
    pensamento: string,
): Promise<VeredictoDoVetor | null> {
    const texto = pensamento.trim();
    if (!texto) return null;
    const v = await vetorDoTexto(textoDoPensamento(texto));
    if (!v) {
        // Silencioso e esperado durante o passeio se o roteamento tiver
        // desligado a memória. Anotar mesmo assim: se isto aparecer em TODA
        // rodada, o motor novo está morto e ninguém veria.
        anotar('motor:vetor-sem-modelo');
        return null;
    }
    const rotulos = rotulosVetorizados();
    const placar = ranquearAlvos(v, rotulos);
    const candidatos = candidatosDoMotor(v, rotulos);
    if (candidatos.length === 0 || !placar[0]) {
        anotar('motor:vetor-nada-parecido', { melhor: placar[0]?.nota ?? 0 });
        return null;
    }
    const margem = margemDoMotor(placar);
    const veredito: VeredictoDoVetor = {
        alvo: placar[0].alvo,
        margem,
        candidatos,
        naDuvida: margem < MARGEM_SEGURA,
    };
    anotar('motor:vetor', {
        alvo: veredito.alvo,
        margem: +margem.toFixed(3),
        duvida: veredito.naDuvida,
    });
    return veredito;
}

// ── O RESTO DO PLANO SAI DA PRÓPRIA FRASE ─────────────────────────────────
//
// O vetor decide PARA ONDE. Verbo, ritmo e duração são muito mais fáceis: as
// palavras estão escritas no pensamento ("slowly", "backs away", "five
// steps"), e ler palavra é trabalho de expressão regular, não de modelo.
//
// `floor10Prosa` já faz e já é testado contra saídas REAIS do Qwen — o mesmo
// mapa que traduz "walk"->approach e "backs away"->withdraw serve aqui.

/** Ritmo pela palavra escrita; `normal` quando nada indica pressa nem calma. */
function ritmoDoTexto(texto: string): Floor10MotorPace {
    if (/\b(fast|quick(ly)?|hurr(y|ied)|rush|run(s|ning)?)\b/i.test(texto)) return 'fast';
    if (/\b(slow(ly)?|careful(ly)?|cautious(ly)?|quiet(ly)?|creep)\b/i.test(texto)) return 'slow';
    return 'normal';
}

/**
 * Quanto tempo o gesto dura. Sem pista na frase, 6 s — o meio da tabela, que
 * é tempo de atravessar meia sala sem parecer que travou nem que correu.
 */
function duracaoDoTexto(texto: string): Floor10MotorDuration {
    if (/\b(a moment|briefly|a second|quick)\b/i.test(texto)) return 3;
    if (/\b(a while|long|keep(s)? (on|going)|for some time)\b/i.test(texto)) return 12;
    return 6;
}

/**
 * O PLANO SEM LLM NENHUM.
 *
 * Alvo do vetor, resto da frase. É o caminho que roda na maioria das rodadas
 * — nos sete casos medidos, quatro tinham margem larga o bastante para nunca
 * acordar o Qwen.
 */
export function planoDoVetor(
    alvo: Floor10MotorTarget,
    pensamento: string,
    /** Identifica ESTA rodada. Ver a nota sobre `raw` no corpo da função. */
    selo: number = Date.now(),
): Floor10MotorPlan {
    // `stay` quando o alvo é o próprio corpo: "aproximar-se de si mesmo" faria
    // o passo calcular um destino igual à posição e o corpo tremer no lugar.
    const verbo = alvo === 'self'
        ? 'stay'
        : verboDaProsa(pensamento) ?? 'approach';
    return {
        verb: verbo,
        target: alvo,
        pace: ritmoDoTexto(pensamento),
        duration: duracaoDoTexto(pensamento),
        // ── O `raw` PRECISA SER ÚNICO POR RODADA ──────────────────────────
        //
        // `floor10Passo` usa o `raw` como identidade do plano para travar o
        // destino dos alvos RELATIVOS: `to-my-left` vira uma coordenada fixa na
        // primeira vez que aquele plano aparece, e só é recalculada quando
        // chega um plano DIFERENTE.
        //
        // Sem o selo, duas rodadas seguidas que dessem `approach | to-my-left`
        // produziriam o mesmo `raw` — e o corpo, já tendo chegado ao destino
        // travado, ficaria PARADO na segunda, achando que a ordem era a mesma
        // que ele já cumpriu. "Cinco passos à esquerda" duas vezes tem de andar
        // dez, não cinco.
        raw: `vetor#${selo}: ${verbo} | ${alvo}`,
    };
}
