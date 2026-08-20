// ── QUEM REMENDA A FRASE MARCADA ──────────────────────────────────────────
//
// O revisor é a etapa CARA do pipeline. O juiz custa 0,5 s e aponta; o remendo
// custa dezenas de segundos e é chamado uma vez por frase apontada. Com o
// rascunhador quebrando cânone em ~30% das falas, é ele que decide se a
// conversa é fluida ou se o Nilo trava meio minuto por resposta.
//
// ── POR QUE VIROU ESCOLHA, E NÃO UMA TROCA DIRETA ────────────────────────
//
// Pedido do dono do jogo: "coloca o llama como revisor — eu quero que deixe
// como opção no pipeline, colocar o llama ou o lfm, aí vc escolhe, e entra na
// linha única de download". As duas metades importam, e a segunda é a que
// obriga este módulo a existir: a escolha muda QUAL arquivo a fila baixa, e
// portanto precisa ser lida por ela.
//
// ── UM CÉREBRO PEQUENO, NÃO DOIS ─────────────────────────────────────────
//
// A primeira versão disto ACRESCENTAVA o Llama à fila, ao lado do LFM2.5 — 2,27
// GB de cérebro pequeno para usar um. O dono do jogo cortou na hora: "isso é
// burrice, não precisa baixar os dois; no ?revisor=llama deixe baixar só o
// llama, e no pipeline normal, o lfm".
//
// Ele está certo, e a consequência é maior que economia de banda: se só existe
// UM arquivo, ele serve os dois papéis (vontade e revisor) e toda a máquina de
// "trocar de papel descarregando o modelo" que eu tinha escrito some junto.
//
//     ?pipeline ................. baixa o LFM2.5, 1,25 GB
//     ?pipeline&revisor=llama ... baixa o Llama 3.2, 1,02 GB
//
// O QUE ISSO CUSTA, e não é zero: com `llama` a DELIBERAÇÃO também passa a ser
// o Llama. Medido em `floor10Brains`, ele assina a escolha em 14/15 rodadas
// contra 15/15 do LFM2.5, e a rodada sobe de 44,8 s para 64,8 s. Pior, não
// quebrado — e é o preço de não baixar dois modelos de 1 GB.
//
// ── O QUE FOI MEDIDO ─────────────────────────────────────────────────────
//
// Os dois no MESMO processo (comparar entre rodadas nesta bancada já deu 30,6 s
// e 52,1 s para a MESMA configuração), com o enunciado que leva o motivo do
// juiz, e a régua conferindo o cânone inteiro:
//
//     candidato        conserta  desviou  estraga  custo/frase  lê
//     LFM2.5 1.2B         3/6      1/6      0/3      52,1 s    267 tok
//     Llama 3.2 1B Q6     4/6      1/6      0/3      11,6 s     97 tok
//
// E O PLACAR DE QUALIDADE NÃO SOBREVIVEU À REPETIÇÃO: numa segunda rodada, o
// mesmo Llama fez 2/6, ecoando a frase errada letra por letra em três casos.
// Com 6 casos e temperatura 0,7, o "4/6 contra 3/6" era ruído — eu avisei que
// cabia no ruído e mesmo assim usei o número para recomendar. Só a diferença de
// TEMPO era estrutural, e ela também não se confirmou no celular (ver abaixo).
//
// A diferença de TEMPO, essa, é estrutural e não sorte: `llama` é transformer
// puro e o llama.cpp reaproveita o prefixo entre chamadas, então ele relê só o
// que mudou. O `lfm2` é híbrido (`shortconv.l_cache` no gguf) e não aceita
// reaproveitamento PARCIAL — relê os ~270 tokens inteiros, toda vez.
//
// SÓ QUE NEM ELA SOBREVIVEU AO APARELHO: no celular o Llama custou 14,7 s a
// 71,9 s por frase, contra os 11,6 s desta bancada. A bancada AQUECE antes de
// medir, e no jogo o revisor sobe do zero a cada turno — a primeira frase
// marcada paga a persona inteira, que é justamente o que o reaproveitamento
// pouparia. Eu medi o caso que o jogo não faz.
//
// ── A PISTA DO GRANITE FOI ATRÁS, E MORREU MEDIDA ────────────────────────
//
// Estava escrito aqui que o granite 3.3 2B Q4 fez 5/6 com zero desvios a 34,7 s
// — "a pista viva", com a ressalva de que não tinha sido repetida nem medida a
// frio. As duas ressalvas se confirmaram, e na direção contrária à pista.
//
// Repetido (2 rodadas, 12 frases, mesmo processo, bancada SEM aquecimento):
//
//     candidato        conserta  desviou  estraga  intacta   1ª FRIA   depois   lê
//     LFM2.5 1.2B        8/12      3/12     0/3      0/3      35,0 s   34,6 s  267 tok
//     granite 3.3 2B     8/12      3/12     0/3      0/3      66,2 s   27,4 s  125 tok
//
// EMPATE EM TUDO QUE É QUALIDADE. O 5/6 era a mesma coisa que o 4/6 do Llama:
// seis casos a 0,7 de temperatura.
//
// E o TEMPO inverte de lado dependendo de qual coluna se lê — que é exatamente
// o erro que me custou o Llama. O granite lê 306 tokens na primeira chamada e
// 110 nas seguintes, porque é transformer puro e o llama.cpp reaproveita o
// prefixo. O LFM2.5 lê 267 SEMPRE (é híbrido, `shortconv.l_cache`, sem
// reaproveitamento parcial).
//
// Numa conversa em que o revisor fica de pé, o granite ganha: 27,4 s contra
// 34,6 s. SÓ QUE O JOGO NÃO FAZ ISSO. `trocarRascunhadorPeloRevisor` descarrega
// o rascunhador e sobe o revisor do ZERO a cada turno — porque dois llama.cpp
// de 1 GB foi o que desligou o aparelho do dono do jogo. Toda chamada do jogo é
// a coluna FRIA. E lá o granite custa 66,2 s contra 35,0 s: quase o dobro.
//
// A vantagem estrutural do transformer puro é real e é inútil para nós
// enquanto a troca de RAM existir. O titular fica.
//
// (Nota que vale para os dois: `intacta` é 0/3 em ambos. Nenhum dos dois
// devolve intacta uma frase que já estava certa — os dois reescrevem sempre.
// Quando o juiz erra, erram junto.)

import type { SmallBrainId } from './floor10Brains';

export type RevisorId = 'lfm' | 'llama' | 'falcon' | 'lfm-onnx';

export type RevisorEntry = {
    id: RevisorId;
    label: string;
    /**
     * EM QUAL RUNTIME O REMENDO ACONTECE.
     *
     * Ficou explícito quando o dono do jogo pediu o LFM2.5 por ONNX: até então
     * "revisor" e "arquivo gguf" eram a mesma coisa, e o código todo assumia
     * isso em silêncio. Com dois runtimes, quem escolhe precisa dizer qual —
     * porque a diferença não é de desempenho, é de MECÂNICA: o caminho do
     * wllama exige descarregar o rascunhador para caber, e o do ONNX não.
     */
    runtime?: 'wllama' | 'onnx';
    /** O cérebro pequeno que esta escolha coloca na fila. Sempre existe um. */
    cerebro: SmallBrainId;
    nota: string;
};

export const REVISORES: readonly RevisorEntry[] = Object.freeze([
    {
        id: 'lfm',
        label: 'LFM2.5 1.2B',
        cerebro: 'lfm2-1b',
        nota: 'relê os ~270 tokens do enunciado toda chamada: 52,1s por frase — mas delibera melhor',
    },
    {
        // ── O ÚNICO SOBREVIVENTE DA CAÇADA, E POR QUE NÃO É O PADRÃO ─────
        //
        // Sete modelos, cinco arquiteturas, todos com a mesma régua (a que
        // reprova eco e fragmento — as duas fraudes que quase me fizeram
        // recomendar um 350M que devolvia a pergunta do jogador):
        //
        //     candidato            conserta  ecoou  pedaço  quebrou   1ª FRIA
        //     granite-3.3-2B         8/12      0      0        4      66,2 s
        //     Falcon-H1-1.5B         8/12      2      0        4      41,2 s
        //     LFM2.5-1.2B            7/12      2      0        4      35,0 s
        //     granite4-h-350m        4/12      7      0        2      10,4 s
        //     granite4-h-1B          3/12      0      5        4      31,9 s
        //     BitNet-2B ternário     2/12      1      0       10      84,5 s
        //     Qwen3-1.7B             0/12     10      0       12      35,5 s
        //
        // Ele empata com o melhor e é o único candidato NOVO que não colapsa:
        // escreve frase inteira, no assunto, e foi o único a devolver uma frase
        // boa sem estragar (`intacta 1/3`) — que é o que importa quando o juiz
        // marca errado.
        //
        // NÃO é o padrão porque 1 conserto a mais em 12 por 6 s a mais cabe no
        // ruído desta bancada, e este arquivo já registra duas vezes o preço de
        // trocar o titular por diferença que não se repete.
        id: 'falcon',
        label: 'Falcon-H1 1.5B (empata com o melhor, 6s mais lento)',
        cerebro: 'falcon-h1-1.5b',
        nota: '8/12 no remendo contra 7/12 do titular, frases inteiras; 41,2s a frio e sem reaproveitar prefixo',
    },
    {
        // ── REPROVADO NO APARELHO, e o registro fica ─────────────────────
        //
        // Na bancada ele marcou 11,6 s por frase contra 52,1 s do LFM2.5, e eu
        // recomendei a troca. NO CELULAR DO DONO DO JOGO ele custou 14,7 s,
        // 21,4 s, 64,5 s e 71,9 s — "a ponto de chegar numa demora nível
        // smollm3 sozinho" — e o veredito foi "llama está DESCARTADO".
        //
        // Duas coisas explicam a diferença, e as duas são falha da minha
        // medição, não do modelo:
        //
        //   1. a bancada AQUECE antes de medir (`await remendar(SYS, 'hi'…)`),
        //      e no jogo o revisor sobe do zero a cada turno — a primeira frase
        //      marcada paga a persona inteira, sem cache nenhum;
        //   2. o celular dele é muito mais lento que esta caixa, e eu nunca
        //      medi nada lá.
        //
        // E o pior não foi o tempo: numa das falas ele devolveu `The player
        // asks, "I've been on the ground floor…"` — inventou uma fala do
        // JOGADOR, que chegou traduzida à tela. Isso virou a conferência de
        // cânone em `floor10CanoneDoNilo`, que vale para qualquer revisor.
        //
        // Continua selecionável para a bancada. Não é recomendação.
        id: 'llama',
        label: 'Llama 3.2 1B Q6 (REPROVADO no aparelho)',
        cerebro: 'llama32-1b-q6',
        nota: 'rápido na bancada (11,6s) e lento no celular (14,7 a 71,9s); inventou fala do jogador uma vez',
    },
    {
        // ── O MESMO MODELO, PELO RUNTIME QUE O APARELHO DELE ACEITA ──────
        //
        // "o do wllama é muito ruim, o do onnx deu menos problema" — sobre
        // WebGPU, depois de o backend do wllama quebrar duas vezes no celular
        // dele. Então aqui o titular vai pelo outro runtime.
        //
        // O QUE MUDA, e o ganho maior não é a GPU: pelo ONNX o revisor NÃO
        // precisa da troca de RAM. Hoje o turno descarrega o granite e sobe
        // 1,25 GB do zero só para consertar uma frase; o runtime do ONNX tem
        // outro alocador e não disputa o mesmo espaço do llama.cpp. Se isso se
        // confirmar no aparelho, o que some não são os 35 s de leitura — são os
        // ~18 s de recarga que vêm antes, todo turno.
        //
        // O QUE CUSTA: 760 MB de ONNX ALÉM do gguf, porque a VONTADE continua
        // sendo o gguf. É o oposto da regra "um arquivo, dois papéis" que vale
        // para os outros — e por isso é opção de URL, nunca padrão.
        //
        // E só roda com adaptador de GPU: os pesos usam GatherBlockQuantized,
        // que não tem kernel no wasm. Sem adaptador, `carregarRevisorOnnx`
        // devolve nulo e o revisor do wllama continua sendo o caminho.
        id: 'lfm-onnx',
        label: 'LFM2.5 1.2B por ONNX + WebGPU (experimento)',
        cerebro: 'lfm2-1b',
        runtime: 'onnx',
        nota: 'mesmos pesos do titular, no runtime que funciona no aparelho dele; sem GPU não sobe',
    },
]);

/**
 * O PADRÃO CONTINUA O LFM2.5 — "por enquanto", nas palavras do dono do jogo.
 *
 * Ele ganha do Llama na DELIBERAÇÃO (15/15 contra 14/15 ao assinar a escolha,
 * e 44,8 s contra 64,8 s por rodada) e perde feio no REMENDO (52,1 s contra
 * 11,6 s). Enquanto um arquivo só serve os dois papéis, a escolha é essa
 * troca — e ela ainda não foi medida no aparelho de quem joga.
 */
export const REVISOR_PADRAO: RevisorId = 'lfm';

function lerDaUrl(busca: string): RevisorId | null {
    const pedido = new URLSearchParams(busca).get('revisor');
    if (!pedido) return null;
    return REVISORES.find((r) => r.id === pedido)?.id ?? null;
}

let escolhido: RevisorId | null = null;

/**
 * Qual revisor está em vigor.
 *
 * `?revisor=llama|lfm` troca sem recompilar — é assim que os dois são
 * comparados na MESMA pergunta, no MESMO aparelho. Sem isso a escolha seria
 * opinião, e opinar sobre desempenho já saiu caro neste projeto mais de uma vez.
 */
export function revisorEscolhido(): RevisorId {
    if (escolhido) return escolhido;
    const forcado = (globalThis as { __f10Revisor?: RevisorId }).__f10Revisor;
    if (forcado && REVISORES.some((r) => r.id === forcado)) return forcado;
    const busca = typeof window === 'undefined' ? '' : window.location.search;
    return lerDaUrl(busca) ?? REVISOR_PADRAO;
}

/** A entrada em vigor, inteira. */
export function revisorAtual(): RevisorEntry {
    return REVISORES.find((r) => r.id === revisorEscolhido()) ?? REVISORES[0];
}

/**
 * O cérebro pequeno que esta escolha põe na fila — e que serve os DOIS papéis.
 *
 * É lido por `floor10Brains` para decidir qual arquivo desce, o que faz de
 * `?revisor=` a chave que troca o modelo inteiro, e não um segundo download.
 */
export function cerebroDoRevisor(): SmallBrainId {
    return revisorAtual().cerebro;
}

/** Troca em tempo de execução (bancada, console, painel). */
export function definirRevisor(id: RevisorId): void {
    escolhido = REVISORES.some((r) => r.id === id) ? id : null;
}

export function resetRevisorParaTestes(): void {
    escolhido = null;
}
