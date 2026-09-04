// ── QUEM A FILA BAIXA — e o que muda quando o pipeline entra ──────────────
//
// Este arquivo existe porque a composição da fila deixou de ser óbvia. Até
// agora ela era uma lista fixa no `passosDoAndar10`; com o pipeline
// inglês-primeiro ela passa a ter duas formas, e a diferença é grande demais
// para ficar espalhada em `if`s pelo caminho de carga.
//
// ── A TROCA, EM BYTES ─────────────────────────────────────────────────────
//
//     HOJE                                    COM `?pipeline`
//     fala ....... SmolLM3-3B   1,92 GB       rascunho ... granite a400m  822 MB
//     vontade .... LFM2.5-1.2B  1,25 GB       vontade .... LFM2.5-1.2B   1,25 GB
//     motor ...... Qwen3-0.6B    639 MB       motor ...... Qwen3-0.6B     639 MB
//     memória .... embedgemma    334 MB       memória .... embedgemma     334 MB
//     reflexo .... SmolLM2-135M  139 MB       reflexo .... SmolLM2-135M   139 MB
//                                             juiz ....... mpnet          110 MB
//                                             tradutor ... Bergamot en↔pt  51 MB
//     ────────────────────────────────         ──────────────────────────────────
//     total ...................  4,28 GB      total ..................   3,34 GB
//
// **Quase um giga a menos.** O SmolLM3 sai porque no pipeline ele não escreve
// nada: quem rascunha é o MoE (3,2 s contra 13,4 s) e quem remenda é o LFM2.5
// (11,6 s e 3/3 de acerto, contra 18,4 s e 1/3 do SmolLM3).
//
// ── O QUE ISSO CUSTA, E PRECISA ESTAR ESCRITO ─────────────────────────────
//
// Sem o SmolLM3 não existe mais "o 3B escreve tudo em português" como rede de
// segurança. A cadeia de recuo passa a ser:
//
//   1. o MoE rascunha, o juiz confere, o LFM2.5 remenda, o Bergamot traduz;
//   2. se o rascunhador falhar → o LFM2.5 escreve a fala inteira EM INGLÊS e o
//      Bergamot traduz. Custa 30,8 s (o cache de prefixo dele não reaproveita),
//      mas fala;
//   3. se o TRADUTOR falhar → não há português, e nem sequer há pergunta: são
//      DOIS pares (`pt → en` para a pergunta do jogador, `en → pt` para a
//      resposta), porque a cadeia inteira do meio trabalha em inglês. Este é o
//      buraco, e por isso o tradutor entra em `conversaLiberada`: 51 MB que
//      precisam estar em pé antes de a conversa abrir, como a fala sempre
//      precisou.
//
// Um NPC que emudece porque a otimização falhou é pior que um NPC lento — é
// regra deste andar desde o começo, e a lista acima é ela aplicada.

import { pipelineLigado } from './floor10Pipeline';
import { FLOOR10_TRADUTOR_BYTES } from './floor10Tradutor';
import { cerebroDoRevisor, pesoDoRevisor, revisorAtual } from './floor10Revisores';
import { SMALL_BRAIN_CATALOG } from './floor10Brains';

export type PapelNaFila =
    | 'fala' | 'rascunho' | 'vontade' | 'motor' | 'memoria' | 'reflexo' | 'juiz' | 'tradutor';

export type PecaDaFila = {
    papel: PapelNaFila;
    /**
     * O NOME DO ARQUIVO, para quem mede. Continua obrigatório e continua indo
     * para as bancadas (`?velocidade`, `?mente`, `?bancada`) e para a
     * caixa-preta: "granite-4.0-h-tiny 7B-A1B" é a única coisa que responde
     * "qual binário produziu este número". Ele só não vai mais para a tela do
     * JOGO — ver `nome`.
     */
    label: string;
    /**
     * O MESMO PEDAÇO, NO IDIOMA DE QUEM JOGA.
     *
     * Reclamação do dono do jogo sobre a tela de carga do Andar 10: "parece
     * algo dev-only". Ela estava certa e o motivo é este campo não existir —
     * a tela mostrava `label`, e "embeddinggemma-300M" não quer dizer nada
     * para quem está esperando o Nilo falar. O que ele quer saber é O QUE
     * ainda falta chegar, e a resposta disso é "as lembranças dele", não o
     * nome do arquivo.
     *
     * NÃO é lore novo: o Nilo continua sendo um hóspede preso no 10º andar, e
     * estes nomes só dizem, em português seco, qual pedaço dele está descendo.
     */
    nome: string;
    /**
     * A LINHA INTEIRA QUE O JOGADOR LÊ QUANDO ESTA PEÇA NÃO DESCE.
     *
     * Frase pronta, e não um pedaço para a tela montar: "a voz dele" e "os
     * reflexos" concordam com verbos diferentes ("não desceu" / "não
     * desceram"), e uma tela que colava nome + verbo escreveria "os reflexos
     * não desceu" no primeiro celular com rede ruim.
     *
     * A FALHA CONTINUA VISÍVEL — isto não é negociável. Engolir falha já
     * custou um bug caro (ver `Floor10Fila.falhar`): a barra pulava os bytes
     * de um modelo que nunca chegou e seguia como se estivesse tudo bem. O que
     * muda aqui é o IDIOMA, não a visibilidade; o motivo técnico continua
     * inteiro na fila, e a bancada continua mostrando ele.
     */
    falha: string;
    bytes: number;
    /** Sem esta peça o jogador não recebe uma fala em português. */
    essencial: boolean;
};

/**
 * ── O NOME QUE O JOGADOR LÊ — QUE NÃO É O NOME DO MODELO ──────────────────
 *
 * Esta tabela morava em `floor10Fila` (a constante `ROTULO`) e veio para cá
 * pelo motivo que o próprio `floor10Fila` documenta um pouco acima da lista da
 * barra: duas listas com a mesma verdade e nenhuma obrigação de concordarem já
 * fizeram o jogador ler "2 de 5 · vontade" enquanto a memória baixava. A
 * composição é onde a peça é DEFINIDA; é aqui que ela ganha os dois nomes, e
 * assim não existe caminho para uma peça nova entrar sem o nome de jogador.
 *
 * A lição que a `ROTULO` já carregava, e que continua valendo: o rascunhador
 * aparece com o MESMO nome da fala. Do lado de fora é a mesma coisa chegando —
 * aquilo sem o que ele não conversa — e trocar por "granite MoE" seria
 * informar o desenvolvedor às custas de quem joga.
 *
 * ── POR QUE A MEMÓRIA CARREGA DUAS COISAS NO NOME ────────────────────────
 *
 * Porque ela é duas: desde que o embeddinggemma passou a SER o córtex motor
 * (ver `floor10MotorVetor`), o arquivo das lembranças é também o que faz o
 * Nilo andar. O rótulo antigo já dizia isso ("memória e movimento"); apagar
 * essa metade aqui faria "o corpo" aparecer por último como se o corpo só
 * chegasse no fim — e o Qwen3 do fim é a RESERVA do corpo, não o corpo.
 */
export const NOME_EM_JOGO: Readonly<Record<PapelNaFila, string>> = Object.freeze({
    fala: 'a voz dele',
    rascunho: 'a voz dele',
    tradutor: 'as palavras em português',
    juiz: 'o senso do que dizer',
    memoria: 'as lembranças dele — e o corpo',
    reflexo: 'os reflexos',
    vontade: 'a vontade própria',
    motor: 'o corpo, de reserva',
});

/**
 * O QUE O JOGADOR PERDE QUANDO A PEÇA NÃO DESCE, em uma frase e sem jargão.
 *
 * O texto técnico não some: ele continua guardado em `FilaEstado.falhados[].motivo`
 * — "o navegador só libera 1.87 GB", a mensagem do `Error`, o que for — e é
 * ele que a bancada mostra. Esta frase é a tradução, e ela diz a consequência
 * porque é a consequência que muda o que o jogador vai ver acontecer depois:
 * um Nilo que esquece não é um Nilo quebrado, e ele precisa saber a diferença.
 */
export const FALHA_EM_JOGO: Readonly<Record<PapelNaFila, string>> = Object.freeze({
    fala: 'a voz dele não desceu — sem ela, ele não responde',
    rascunho: 'a voz dele não desceu — sem ela, ele não responde',
    tradutor: 'as palavras em português não desceram — a conversa volta pelo caminho de sempre',
    juiz: 'o senso do que dizer não desceu — ele fala sem ninguém conferir antes',
    memoria: 'as lembranças dele não desceram — ele conversa, mas esquece o que já passou',
    reflexo: 'os reflexos não desceram — ele demora mais para reagir',
    vontade: 'a vontade própria não desceu — ele responde, mas para de decidir sozinho',
    motor: 'o corpo de reserva não desceu — ele se move pelas lembranças, como já fazia',
});

/**
 * Toda peça nasce por aqui, e é por isso que nenhuma consegue nascer sem nome
 * de jogador: o papel entra, os dois nomes saem da tabela. Foi assim que o
 * `label` técnico e o `nome` deixaram de ser duas listas para manter.
 */
function pecaComNome(p: Omit<PecaDaFila, 'nome' | 'falha'>): PecaDaFila {
    return Object.freeze({
        ...p,
        nome: NOME_EM_JOGO[p.papel],
        falha: FALHA_EM_JOGO[p.papel],
    });
}

/** O nome de jogador de um papel, para quem só tem o id da fila na mão. */
export function nomeEmJogo(papel: string): string {
    return NOME_EM_JOGO[papel as PapelNaFila] ?? 'uma parte dele';
}

/** A linha de falha, em português de jogador, a partir do id da fila. */
export function falhaEmJogo(papel: string): string {
    return FALHA_EM_JOGO[papel as PapelNaFila]
        ?? 'uma parte dele não desceu — ele continua, com menos';
}

/**
 * A fala. Foi SmolLM3-3B, virou granite-4.0-h-tiny 7B-A1B, e voltou.
 *
 * O `bytes` NÃO é detalhe de vitrine: a fila usa este número para planejar cota
 * e para desenhar a barra. Na ida, deixá-lo no valor do SmolLM3 faria a barra
 * terminar em 75% e o planejador autorizar 670 MB a mais do que ele achava; na
 * volta, deixá-lo no valor do granite faz a barra terminar cedo demais e o
 * planejador recusar aparelho onde o modelo cabia. O erro troca de sinal, mas
 * não some — por isso ele anda junto com a URL, sempre.
 *
 * Por que voltou: o granite é híbrido e não reaproveita prefixo, o que fixa o
 * turno em ~48 s. O SmolLM3 reaproveita, e numa conversa que fica no mesmo
 * assunto cai para 12,8 s e 6,5 s. Ver `bancada-navegador/JA-TENTADO.md`.
 */
export const PECA_FALA: PecaDaFila = pecaComNome({
    papel: 'fala',
    label: 'SmolLM3-3B',
    bytes: 1_915_305_312,
    essencial: true,
});

export const PECA_RASCUNHO: PecaDaFila = pecaComNome({
    papel: 'rascunho', label: 'granite-3.1-1b-a400m (MoE, 400M ativos)', bytes: 821_847_360, essencial: true,
});
/**
 * O cérebro pequeno, que no pipeline serve DOIS papéis com UM arquivo.
 *
 * Deixou de ser constante quando `?revisor=` passou a trocar o modelo: com
 * `llama` a fila baixa 1,02 GB de Llama 3.2 em vez de 1,25 GB de LFM2.5 — não
 * os dois. Um rótulo fixo aqui faria a barra prometer o arquivo errado.
 */
export function pecaDaVontade(): PecaDaFila {
    // `pesoDoRevisor` e não o catálogo: com `?revisor=lfm-onnx` o arquivo não
    // é um gguf, e ler o catálogo aqui prometia 1,25 GB enquanto a rede baixava
    // 760 MB. O PAPEL continua sendo 'vontade' — é a mesma peça, outro arquivo,
    // exatamente como `?revisor=llama` já fazia.
    const m = pesoDoRevisor();
    // O `label` acompanha o arquivo (`?revisor=llama` baixa outro), mas o NOME
    // DE JOGADOR não: para quem joga é a mesma vontade própria chegando, e o
    // arquivo por trás dela nunca foi assunto dele. É o mesmo motivo pelo qual
    // o papel continua sendo 'vontade'.
    return pecaComNome({
        papel: 'vontade' as const, label: m.label, bytes: m.bytes, essencial: false,
    });
}
export const PECA_MOTOR: PecaDaFila = pecaComNome({
    papel: 'motor', label: 'Qwen3-0.6B', bytes: 639_446_688, essencial: false,
});
export const PECA_MEMORIA: PecaDaFila = pecaComNome({
    papel: 'memoria', label: 'embeddinggemma-300M', bytes: 333_590_944, essencial: false,
});
export const PECA_REFLEXO: PecaDaFila = pecaComNome({
    papel: 'reflexo', label: 'SmolLM2-135M (ONNX)', bytes: 139_252_423, essencial: false,
});
export const PECA_JUIZ: PecaDaFila = pecaComNome({
    papel: 'juiz', label: 'juiz de tom (all-mpnet-base-v2)', bytes: 110_100_000, essencial: false,
});
/**
 * O peso vem IMPORTADO do próprio tradutor, e não copiado.
 *
 * Ele já mudou uma vez sem avisar: o par `pt → en` entrou depois — o jogador
 * pergunta em português e o rascunhador só lê inglês — e dobrou o número. Uma
 * cópia aqui teria continuado prometendo 26 MB na barra enquanto a rede baixava
 * 51, e a barra é a única coisa que o jogador tem para saber quanto falta.
 */
export const PECA_TRADUTOR: PecaDaFila = pecaComNome({
    papel: 'tradutor', label: 'Bergamot en↔pt', bytes: FLOOR10_TRADUTOR_BYTES, essencial: true,
});

/**
 * A fila, na ordem em que ela desce.
 *
 * A ordem não é estética: a primeira peça essencial é a que solta a conversa,
 * e as leves vêm antes das pesadas para que o jogador possa falar mais cedo.
 * No pipeline o tradutor (26 MB) vem logo depois do rascunhador porque sem ele
 * não sai português — é a segunda metade da mesma condição.
 */
export function composicaoDaFila(busca?: string): PecaDaFila[] {
    if (!pipelineLigado(busca ?? globalThis.location?.search ?? '')) {
        // ── O JUIZ DE TOM PASSOU A DESCER NO JOGO COMUM ──────────────────
        //
        // Ele era peça só do pipeline. Fora dele, quem confere a fala é a régua
        // do `floor10Canon` — regex sobre o texto — e ela é cega para o defeito
        // mais comum: a frase que não quebra nenhuma regra escrita e mesmo
        // assim não é o Nilo.
        //
        // MEDIDO jogando (`bancada-navegador/jogo-de-verdade.mjs`), seis
        // perguntas: o juiz marcou SETE frases, e os motivos eram concretos —
        // "chama o jogador de Nilo", "põe o Nilo dentro do elevador", "fala como
        // uma máquina se descrevendo". Nenhuma dessas a régua vê.
        //
        // São 110 MB e ele NÃO é essencial: desce depois da fala, e se falhar a
        // conversa continua com a régua sozinha, como era antes.
        return [PECA_FALA, PECA_MEMORIA, PECA_JUIZ, PECA_REFLEXO, pecaDaVontade(), PECA_MOTOR];
    }
    return [
        PECA_RASCUNHO,
        PECA_TRADUTOR,
        PECA_JUIZ,
        PECA_MEMORIA,
        PECA_REFLEXO,
        // A vontade é também o REVISOR do pipeline — UM arquivo, dois papéis,
        // e é `?revisor=` que escolhe qual. Ela não é essencial para a
        // primeira fala porque o rascunho só vai ao revisor quando o juiz
        // marca alguma coisa.
        //
        // NÃO EXISTE UMA SEGUNDA PEÇA AQUI, e essa foi a correção: a primeira
        // versão acrescentava o Llama ao lado do LFM2.5 — 2,27 GB de cérebro
        // pequeno para usar um.
        // ── E COM `?revisor=rascunhador` NEM ISSO DESCE ──────────────────
        //
        // Quando quem remenda é o próprio rascunhador, o cérebro pequeno não
        // tem papel nenhum no pipeline — e são 1,25 GB. Manter a peça na fila
        // seria baixar um modelo para não usar, que é exatamente a crítica que
        // o dono do jogo fez quando a fila baixava dois.
        ...(revisorAtual().runtime === 'rascunhador' ? [] : [pecaDaVontade()]),
        PECA_MOTOR,
    ];
}

/** Quantos bytes a fila inteira baixa. É o número que a barra promete. */
export function bytesDaFila(busca?: string): number {
    return composicaoDaFila(busca).reduce((s, p) => s + p.bytes, 0);
}

/**
 * As peças sem as quais não sai uma fala em português — as que a conversa
 * espera antes de abrir.
 *
 * Fora do pipeline é uma só (o SmolLM3). Dentro, são duas: o rascunhador e o
 * tradutor. O juiz NÃO entra: sem ele o rascunho passa direto, que é pior em
 * qualidade e não em silêncio.
 */
export function pecasEssenciais(busca?: string): PecaDaFila[] {
    return composicaoDaFila(busca).filter((p) => p.essencial);
}

/**
 * O SmolLM3 continua no código e sai da fila.
 *
 * Pedido do dono do jogo: "tire o smol da fila, deixe ele só como testagem na
 * bancada". Ele continua sendo carregável por `?mente=smol` e pelas bancadas —
 * é a régua contra a qual o pipeline é medido, e uma régua que some não serve
 * para medir nada.
 */
export function smolNaFila(busca?: string): boolean {
    return composicaoDaFila(busca).some((p) => p.papel === 'fala');
}

export function smolDisponivelParaBancada(busca = globalThis.location?.search ?? ''): boolean {
    return /[?&]mente=smol\b/i.test(busca) || /[?&]bancada\b/i.test(busca);
}
