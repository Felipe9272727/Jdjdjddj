// ── BAIXAR NÃO É LIGAR ────────────────────────────────────────────────────
//
// O desenho é do dono do jogo, e ele o descreveu assim:
//
//   "primeiro, baixe tudo de uma vez, sem ligar, deixe os pesos desses modelos
//    na memória, assim não vai gastar na CPU, eles não podem ter uma thread
//    ativa enquanto não estão sendo usados, será um roteamento inteligente"
//
// Hoje as duas coisas são a MESMA chamada: `loadModelFromUrl` baixa o .gguf e,
// no fim, sobe um llama.cpp inteiro — pool de threads, heap do WASM, tudo.
// Enquanto forem a mesma chamada, "baixe tudo sem ligar" é impossível, e é por
// isso que este arquivo existe antes de qualquer roteador.
//
// ── POR QUE ISTO IMPORTA, COM NÚMERO ──────────────────────────────────────
// Medido no celular emulado, separando memória ANÔNIMA de cache de arquivo:
//
//     RSS sustentado ..... 5,09 GB
//     anônima ............ 4,52 GB   <- alocada, o kernel não tem para onde mandar
//     cache de arquivo ... 0,57 GB   <- descartável sob pressão
//
// RESSALVA, escrita depois: estes três números saíram de perfil EFÊMERO do
// Chrome, que guarda o armazenamento do site na RAM — ou seja, o .gguf entrou
// na conta como se fosse custo do runtime. Os valores absolutos estão inflados
// (ver a correção lá embaixo, em `desligarQuemNaoEDaVez`: o custo real de um
// cérebro de pé é ~1,05x o arquivo, não 2x). O que a medição continua provando
// é a PROPORÇÃO: a maior parte do custo é memória anônima, que o kernel não tem
// para onde mandar. Um cérebro de pé pesa mesmo, e descarregá-lo devolve mesmo —
// isso foi confirmado depois com perfil persistente, medindo 2,25 GB de volta.
//
// O Colibri (744B em 25 GB de RAM) chega ao mesmo
// princípio por outro caminho — disco como fonte, RAM só para o que está ativo.
// Ele fatia por especialista de MoE; aqui a granularidade é o cérebro inteiro,
// que é mais simples e serve.
//
// O QUE ESTE MÓDULO NÃO FAZ: decidir quem liga e quando. Isso é o roteador, e
// ele vem depois — sobre esta separação.

import { vigiarInatividade } from './floor10Carga';

/** O contrato mínimo do CacheManager do wllama que o download usa. */
export type CofreDeModelos = {
    download?: (
        url: string,
        opcoes?: { progressCallback?: (p: { loaded: number; total: number }) => void },
    ) => Promise<unknown>;
    getSize?: (nome: string) => Promise<number>;
};

export type ProgressoDoDownload = (loaded: number, total: number) => void;

/**
 * Baixa o .gguf para o OPFS SEM subir runtime nenhum.
 *
 * Devolve `false` quando o runtime não expõe `download` — e nesse caso quem
 * chama deve seguir pelo caminho antigo (baixar junto de carregar) em vez de
 * ficar sem modelo. Degradar é aceitável; sumir com o cérebro não é.
 */
export async function baixarSemSubir(
    cofre: CofreDeModelos | null | undefined,
    url: string,
    aoProgredir?: ProgressoDoDownload,
): Promise<boolean> {
    if (typeof cofre?.download !== 'function') return false;
    // ── E ESTE DOWNLOAD PRECISA DE CÃO DE GUARDA ──────────────────────────
    //
    // Buraco que EU abri nesta sessão. A fila chamava `precarregar*`, e esses
    // passavam por `ensureSmallEngine`, que tem `vigiarInatividade` desde que
    // uma carga silenciosa deixou a vontade "carregando" até a página ser
    // recarregada. Ao trocar a fila para `baixar*` — que é o certo, "baixar não
    // é ligar" — eu levei o download para fora dessa proteção e não levei a
    // proteção junto.
    //
    // O `cacheManager.download` do wllama 3.5.1 não aceita AbortSignal: se a
    // rede do celular morrer no meio, a promessa não resolve nem rejeita. E a
    // fila roda os passos em SEQUÊNCIA, então travar aqui não custa um cérebro,
    // custa TODOS OS SEGUINTES:
    //
    //     memória trava  -> reflexo, vontade e motor nunca baixam
    //     vontade trava  -> o motor nunca baixa
    //
    // É o mesmo defeito que acabou de aparecer no reflexo, no arquivo ao lado,
    // pela mesma causa: uma espera sem prazo dentro de uma fila sequencial.
    //
    // Como não dá para abortar, o vigia DESISTE DE ESPERAR e devolve `false`.
    // Quem chama já trata `false` como "não deu" e a fila segue para o próximo
    // — e os bytes que chegaram continuam no OPFS para a próxima tentativa.
    let vivo = true;
    let desistir: (v: boolean) => void = () => {};
    const desistencia = new Promise<boolean>((resolve) => { desistir = resolve; });
    const vigia = vigiarInatividade(() => { vivo = false; desistir(false); });
    try {
        const chegou = await Promise.race([
            desistencia,
            cofre.download(url, {
                progressCallback: ({ loaded, total }) => {
                    // ── O ZUMBI NÃO PODE ESCREVER NA FILA ─────────────────
                    //
                    // Desistir de esperar não para o download: `download` não
                    // aceita AbortSignal, então ele segue chamando este
                    // callback. Sem esta guarda, um download já dado como
                    // falhado continuava mexendo em `floor10Fila` e no npcStore
                    // — roubava a barra do passo que estava rodando AGORA e,
                    // ao chegar a 100%, se marcava como pronto enquanto ainda
                    // constava como falhado. Contabilidade de duas fontes para
                    // o mesmo id, que é como uma barra volta a mentir.
                    if (!vivo) return;
                    vigia.avancou();
                    aoProgredir?.(loaded, total);
                },
            }).then(() => true),
        ]);
        return chegou && vivo;
    } finally {
        vigia.parar();
    }
}

/**
 * Os quatro estados de um cérebro, e a distinção que o jogo não tinha.
 *
 * Até aqui existiam só dois — "carregado" ou não — e por isso a fila precisava
 * SUBIR cada modelo para poder dizer que ele estava pronto. `no-aparelho` é o
 * estado que faltava: os pesos chegaram, e nada está gastando CPU por eles.
 */
export type EstadoDoCerebro = 'ausente' | 'baixando' | 'no-aparelho' | 'de-pe';

/**
 * Quem deve estar DE PÉ agora, dado o que o jogador está fazendo.
 *
 * Pura de propósito: é a regra inteira do roteamento, e ela precisa ser
 * legível e testável sem subir nada. A tabela é a que o dono do jogo escreveu:
 *
 *   no chat ....... mente (fala) + memória. A vontade e o motor esperam.
 *   fora do chat .. vontade + motor. A fala e a memória esperam.
 */
export type Cerebro = 'fala' | 'memoria' | 'vontade' | 'motor';

/**
 * TODOS os cérebros que podem estar ocupando memória. Não é decoração do tipo:
 * é a lista sobre a qual o complemento é calculado, e foi a falta dela que
 * deixou 639 MB residentes (ver `quemDevoDesligar`).
 */
export const CEREBROS: readonly Cerebro[] = ['fala', 'memoria', 'vontade', 'motor'];

export function quemDevoLigar(noChat: boolean): readonly Cerebro[] {
    // ── A MEMÓRIA FICA DOS DOIS LADOS, E O MOTOR SAIU ─────────────────────
    //
    // O `embeddinggemma` deixou de ser só o cérebro de memória: ele é agora
    // também o MOTOR, classificando o pensamento do Nilo contra as 35 redações
    // de movimento (floor10Rotulos). Então ele precisa estar de pé no passeio,
    // que é justamente quando a tabela antiga o desligava.
    //
    // E NÃO, os dois papéis não brigam. Embedding é sem estado: `createEmbedding`
    // não guarda KV cache nem carrega nada entre chamadas. Os dois usos são dois
    // ARRAYS diferentes comparados em JavaScript depois — o modelo nem sabe que
    // existem dois. O que compartilham é o worker, e aí uma classificação pode
    // ficar na fila atrás de uma busca do cânone; as duas quase nunca coincidem
    // (o motor pensa fora da conversa, o cânone é lido dentro dela), e se o teto
    // de 2,5 s estourar o motor fica sem plano — a falha segura.
    //
    // O MOTOR QWEN3 SAIU DA TABELA. Medido nos sete pensamentos reais do dono
    // do jogo, quatro desempatadores de três famílias:
    //
    //     só o vetor ........ 5/7 · ~1 s  ·      0 MB
    //     Qwen3-0.6B ........ 6/7 · 4,8 s · +639 MB
    //     LFM2.5-350M ....... 5/7 · 3,9 s · +379 MB  (ecoa o vetor)
    //     LFM2.5-1.2B ....... 5/7 · 9,4 s · +1,25 GB (julga, e julga mal)
    //
    // O Qwen comprava UM caso em sete, e sete amostras não distinguem 5/7 de
    // 6/7. Não vale 639 MB nem 3,5 s por rodada.
    //
    // E a troca deixa o passeio MAIS LEVE: sai o motor de 639 MB, entra o
    // embedding de 333 MB — 306 MB a menos de pico enquanto ele anda.
    return noChat ? ['fala', 'memoria'] : ['vontade', 'memoria'];
}

/** O complemento: quem deve sair de pé para o outro grupo caber. */
export function quemDevoDesligar(noChat: boolean): readonly Cerebro[] {
    // ── O COMPLEMENTO PRECISA TIRAR A INTERSEÇÃO ──────────────────────────
    //
    // Enquanto os dois grupos eram disjuntos, "desligar" era só o outro grupo.
    // Agora a MEMÓRIA está nos dois lados (ela virou o motor também), e o
    // complemento cru mandaria desligá-la no mesmo instante em que a manda
    // ligar — o modelo subiria e cairia a cada abertura de chat, que é a
    // definição do lag que esta tabela existe para evitar.
    //
    // ── E O COMPLEMENTO PRECISA SER SOBRE TUDO, NÃO SOBRE O OUTRO GRUPO ──
    //
    // Aqui estava `quemDevoLigar(!noChat).filter(...)`: "o outro grupo, menos a
    // interseção". Enquanto todo cérebro estava em algum dos dois grupos, isso
    // dava no mesmo. Só que o MOTOR Qwen3 saiu da tabela quando o vetor assumiu
    // a classificação — e sair da tabela do LIGAR significou sair também da
    // conta do DESLIGAR. Ele não estava em grupo nenhum, então nunca era
    // devolvido por esta função, e ninguém o descarregava.
    //
    // O efeito é o defeito que esta tabela existe para matar, de volta: o
    // jogador passeia, a vontade pede um desempate, o motor de 639 MB sobe e
    // fica residente; ele abre o chat e a FALA sobe por cima dele. "Laga tudo".
    //
    // O `Floor10NpcChat` até registrava `motor: () => unloadFloor10MotorBrain()`
    // nas manobras — a função certa, escrita, e nunca invocada, porque o laço só
    // percorre o que ESTA função devolve. Callback registrado que nunca é
    // chamado é pior que callback ausente: parece coberto.
    //
    // Desligar é agora o complemento sobre `CEREBROS`. Quem não está escalado
    // para ficar de pé, cai — inclusive quem ninguém lembrou de escalar.
    const ficam = quemDevoLigar(noChat);
    return CEREBROS.filter((c) => !ficam.includes(c));
}

/** Como devolver a memória de cada cérebro. Só quem está na tabela é desligado. */
export type Manobras = Partial<Record<Cerebro, () => Promise<unknown>>>;

/**
 * ── A TABELA PASSA A MANDAR DE VERDADE ────────────────────────────────────
 *
 * `quemDevoLigar`/`quemDevoDesligar` existiam há vários commits e NINGUÉM as
 * chamava: a tela implementava a metade de baixo à mão (fechar o chat descarrega
 * fala e memória e sobe a vontade) e a metade de cima simplesmente não existia.
 *
 * O buraco que isso deixou é o defeito que o dono do jogo relatou primeiro:
 *
 *     "quando eu saio do chat, e entro, LAGA TUDO"
 *
 * E lagava mesmo. Saindo do chat a vontade sobe (1,32 GB) e, terminada a rodada,
 * fica RESIDENTE — `abortDeliberation` só encerra o worker quando ele está
 * gerando naquele instante; parado entre rodadas, nada o tira. Voltando ao chat,
 * nada o desligava. Então a fala reabria 3,9 GB EM CIMA da vontade parada e do
 * motor parado, no exato momento em que o jogador está esperando uma resposta.
 *
 * ── QUANTO ISSO VALE: AGORA MEDIDO, NÃO PROJETADO ────────────────────────
 *
 * Os dois cenários foram montados de verdade no celular emulado, com os três
 * modelos reais, e o RSS lido dos dois (`ROTEAMENTO=1` em celular.mjs):
 *
 *                            SEM o roteamento   COM o roteamento
 *     aba vazia ...........      1,35 GB            1,36 GB
 *     vontade+motor de pé .      3,59 GB            3,60 GB
 *     PICO (fala de pé) ...      5,61 GB            3,36 GB   <- -2,25 GB
 *     anônima no pico .....      4,97 GB            2,73 GB
 *
 * DUAS EXECUÇÕES, porque uma só já me enganou três vezes nesta sessão:
 *
 *                    1a          2a       variação
 *     PICO sem .... 5,61 GB    5,58 GB     0,5%
 *     PICO com .... 3,36 GB    3,38 GB     0,6%
 *     economia .... 2,25 GB    2,20 GB
 *
 * **40% a menos no pico**, no caminho que ele mais usa. E repare que o pico do
 * cenário novo (3,36) fica ABAIXO do marco de vontade+motor de pé (3,60): a
 * fala não sobe por cima de ninguém, ela sobe no lugar deles.
 *
 * ── E A REGRA DO "2x" ESTAVA INFLADA ─────────────────────────────────────
 *
 * Este arquivo dizia `RSS = 2,00 × (GB de arquivo) + 1,49 GB`, e eu projetei
 * daí 9,91 GB antes / 5,99 GB depois. A reta estava CONTAMINADA: as medições
 * que a produziram rodaram em perfil efêmero do Chrome, que é tratado como
 * anônimo — e perfil anônimo guarda o armazenamento do site NA MEMÓRIA. Ou
 * seja, o .gguf no "OPFS" era RAM, e entrava na conta como se fosse custo do
 * runtime. Com perfil persistente, medido:
 *
 *     vontade+motor .... +2,24 GB para 1,960 GB de arquivo = 1,14x
 *     fala por cima .... +2,02 GB para 1,915 GB de arquivo = 1,05x
 *     fala sozinha ..... +2,00 GB para 1,915 GB de arquivo = 1,04x
 *
 * O custo real de um cérebro de pé é ~1,05x o próprio arquivo, não 2x. Logo o
 * estado ANTES do conserto era ~6 GB, não ~10 GB — ruim para um celular, mas eu
 * exagerei, e o exagero saiu daqui. O ganho do conserto (2,25 GB) é medido e
 * não muda.
 *
 * Aqui a tabela vira ação. Um de cada vez, e nunca lançando: descarregar quem já
 * saiu não é erro, e um cérebro que se recusa a sair não pode impedir o outro.
 *
 * O QUE ESTA FUNÇÃO NÃO FAZ: ligar. Desligar é simétrico e pode ser tabelado;
 * ligar não é — o motor, por exemplo, só serve depois de a vontade ter pensado,
 * então subi-lo junto seria manter 640 MB de pé sem nada para traduzir.
 */
export async function desligarQuemNaoEDaVez(
    noChat: boolean,
    desligar: Manobras,
): Promise<Cerebro[]> {
    const saiu: Cerebro[] = [];
    for (const cerebro of quemDevoDesligar(noChat)) {
        const acao = desligar[cerebro];
        if (!acao) continue;
        try {
            await acao();
            saiu.push(cerebro);
        } catch { /* já estava fora, ou o worker morreu antes de responder */ }
    }
    return saiu;
}
