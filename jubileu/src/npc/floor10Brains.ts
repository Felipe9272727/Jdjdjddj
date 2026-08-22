// ── OS CÉREBROS DE ~1B QUE PODEM DIRIGIR A VONTADE DO NILO ────────────────
// Módulo sem NENHUMA dependência de propósito: tanto o cérebro da FALA quanto o
// da VONTADE precisam desta lista, e importar um do outro fecharia um ciclo.
//
// A fala precisa dela por um motivo concreto e medido: o modelo da vontade
// ocupa o MESMO cofre de armazenamento do site, e um cérebro pequeno baixado
// derrubava a cota abaixo do que o SmolLM3 precisa — "o navegador só libera
// 1.87 GB e o modelo precisa de 2.07 GB". Resultado no aparelho do Felipe: o
// Nilo simplesmente parava de falar. A vontade é opcional por construção; a
// fala, não. Então a fala pode reciclar isto aqui, e só isto.

// Só o mapa `revisor -> cérebro`. Import de TIPO no outro sentido, então não
// há ciclo em tempo de execução.
import { cerebroDoRevisor } from './floor10Revisores';

export type SmallBrainId =
    | 'gemma3-1b' | 'llama32-1b' | 'llama32-1b-q4' | 'llama32-1b-q6'
    | 'minicpm5-1b' | 'lfm2-1b' | 'llama32-horror' | 'falcon-h1-1.5b'
    | 'granite3-3b-a800m' | 'huihui-moe-08b' | 'nilo-revisor-360m';

export type SmallBrainEntry = {
    id: SmallBrainId;
    label: string;
    url: string;
    bytes: number;
    /** O que a medição no prompt real do Andar 10 mostrou sobre ele. */
    nota: string;
    /**
     * SÓ SERVE DE REVISOR, NUNCA DE VONTADE AO LADO DA FALA.
     *
     * Existe por causa de um guarda medido: nenhum cérebro pode passar de 1,4
     * GB, porque a fala (SmolLM3) já pede ~2,07 GB de cota e a cota do aparelho
     * do dono do jogo JÁ RECUSOU esse total uma vez. Quem paga essa conta é a
     * fala.
     *
     * O granite MoE tem 2,02 GB e mesmo assim entra — mas só no `?pipeline`,
     * onde não existe SmolLM3 nenhum: lá o companheiro de RAM é o rascunhador
     * de 822 MB. Marcar a entrada é mais honesto que afrouxar o teto de todo
     * mundo para caber um caso.
     */
    soRevisor?: boolean;
};

/**
 * Não é lista de gosto: os três rodaram o MESMO prompt de deliberação, nos
 * mesmos 8 cenários do andar, no mesmo llama.cpp que roda no navegador, com 2
 * seeds. O que decide aqui não é nota de benchmark, é caber no orçamento do
 * celular (≈320 tokens por rodada) E soar como o Nilo, não como um aluno
 * comentando um enunciado.
 */
export const SMALL_BRAIN_CATALOG: readonly SmallBrainEntry[] = Object.freeze([
    {
        id: 'gemma3-1b',
        label: 'Gemma 3 1B',
        url: 'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
        bytes: 806_058_240,
        nota: 'assina a escolha em 16/16 rodadas; o pensamento mais curto e mais dentro do personagem',
    },
    {
        id: 'llama32-1b',
        label: 'Llama 3.2 1B (Q8)',
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q8_0.gguf',
        bytes: 1_321_083_008,
        nota: 'assina a escolha em 14/15 rodadas e fala em 1ª pessoa — o Q4 fazia 5/15',
    },
    {
        // ── O Q6, QUE ENTROU PELO POSTO DE REVISOR ────────────────────────
        //
        // Não é candidato a vontade: para assinar escolha o LFM2.5 faz 15/15 e
        // o Llama faz 2/5 de primeira. Ele entrou porque o posto de REVISOR
        // tem outra exigência, e nela ele ganha do titular — medido no mesmo
        // processo, com o enunciado que leva o motivo:
        //
        //     LFM2.5 1.2B .... 3/6 consertou · 52,1 s por frase · lê 267 tok
        //     Llama 3.2 Q6 ... 4/6 consertou · 11,6 s por frase · lê  97 tok
        //
        // Os 4,5x não são sorte: `llama` é transformer puro, o llama.cpp
        // reaproveita o prefixo entre chamadas e ele relê só o que mudou. O
        // `lfm2` é híbrido (`shortconv.l_cache` no gguf) e relê tudo, sempre.
        //
        // Q6 e não Q8 por 300 MB: este projeto mediu que o Llama 3.2 1B em Q4
        // despenca (5/15 contra 14/15), e o Q6 é o degrau que preserva sem
        // pagar o arquivo inteiro.
        id: 'llama32-1b-q6',
        label: 'Llama 3.2 1B (Q6, revisor)',
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q6_K.gguf',
        bytes: 1_021_800_576,
        nota: 'revisor: 4/6 em 11,6s contra 3/6 em 52,1s do LFM2.5 — lê 97 tokens contra 267',
    },
    {
        // A MESMA cabeça em 4 bits. Fica no catálogo porque o cofre do
        // navegador é finito: com o SmolLM3 (1,92 GB) já dentro, o Q8 pede
        // ~3,5 GB de cota somando os dois, e no aparelho do Felipe a cota já
        // recusou 2,07 GB uma vez. Quando não couber, esta é a que cabe.
        id: 'llama32-1b-q4',
        label: 'Llama 3.2 1B (Q4, cabe em menos espaço)',
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        bytes: 807_694_464,
        nota: 'mesma cabeça comprimida: 513 MB menor, mas assina escolha em 5/15 e quase não fala em 1ª pessoa',
    },
    {
        // ── O CANDIDATO DE 2026, E POR QUE ELE ENTROU NA LISTA ────────────
        //
        // Entra como OPÇÃO, não como padrão: o dono do jogo escolheu os outros
        // a dedo e disse "não aceito a proposta pra trocar de modelo". Trocar
        // por conta própria seria decidir por ele. O que eu posso fazer é
        // colocá-lo ao lado, com o número, para ele julgar no aparelho dele.
        //
        // Medido na bancada da vontade, DUAS execuções independentes, mesmas 5
        // situações do jogo, mesmo prompt de deliberação, mesmo llama.cpp:
        //
        //                    assina na 1ª   resgates   tok/s   ms por rodada
        //     Llama 3.2 1B       2/5           3        4,8       64.800
        //     LFM2.5-1.2B        5/5           0        5,9       44.800
        //
        // O 5/5 e o 2/5 saíram IDÊNTICOS nas duas execuções — não é sorte de
        // uma rodada. Assinar de primeira é o que apaga o resgate inteiro
        // (13,7 s por 5 rodadas no Llama, 0 aqui), e é por isso que a rodada
        // fica 1,45× mais rápida com só 1,2× de tok/s.
        //
        // As ESCOLHAS também foram mais estáveis: entre as duas execuções ele
        // repetiu 4 das 5, contra 1 das 5 do Llama. Para uma vontade isso
        // importa — o mesmo mundo não devia produzir intenções diferentes toda
        // vez. O que NÃO afirmo é que ele escolhe MELHOR: cinco situações com
        // uma rodada cada não decidem isso, e ambos deram respostas defensáveis.
        //
        // Arquitetura híbrida (convolução curta + atenção) feita para CPU, GGUF
        // publicado pela própria Liquid e marcado `llama.cpp`. E é 75 MB MENOR
        // que o Llama Q8, então não custa cota nenhuma a mais.
        //
        // O irmão `LFM2.5-1.2B-Thinking` foi medido junto e REPROVOU: 0/5 de
        // primeira, 5 resgates, 107,7 s por rodada. O traço de raciocínio come
        // os 320 tokens do orçamento e a linha CHOICE nunca chega.
        id: 'lfm2-1b',
        label: 'LFM2.5 1.2B (o mais rápido a assinar)',
        url: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/main/LFM2.5-1.2B-Instruct-Q8_0.gguf',
        bytes: 1_246_253_888,
        nota: 'assina a escolha de primeira em 5/5 (o Llama faz 2/5) e a rodada inteira cai de 64,8s para 44,8s',
    },
    {
        // ── O CANDIDATO QUE APARECEU PROCURANDO RASCUNHADOR ───────────────
        //
        // Não entrou por benchmark: entrou porque é a interseção exata do que
        // este jogo precisa e eu não tinha procurado.
        //
        //   base ...... Llama-3.2-1B-Instruct, o MESMO que já está acima e que
        //               declara `pt` na lista oficial da Meta
        //   card ...... en, fr, de, es, it, PT, zh, ja, ru, ko
        //   tags ...... horror, roleplaying, storytelling, vivid prosing
        //
        // E o detalhe técnico que faz eu confiar mais nele do que num
        // fine-tune de terror qualquer: NÃO É FINE-TUNE. É o mesmo Llama
        // 3.2 1B quantizado com uma matriz de importância (imatrix) calibrada
        // em texto de terror. Os pesos são os da Meta; o que muda é QUAIS
        // pesos a quantização preserva com mais fidelidade. Um fine-tune em
        // terror inglês poderia ter comido o português junto; isto não pode,
        // porque não treinou nada.
        //
        // O QUE PESA CONTRA, e é medido AQUI DENTRO: este projeto já mediu
        // que o Llama 3.2 1B em Q4 despenca (assina 5/15 contra 14/15 no Q8).
        // O autor não publica Q8 — diz que imatrix não faz efeito nele. O
        // Q6_K de 1,02 GB é o mais alto que existe, e é 300 MB MENOR que o Q8
        // simples já no catálogo. Ainda assim é um download novo de 1 GB, num
        // aparelho cuja cota já recusou 2,07 GB e emudeceu o Nilo.
        //
        // Entra como OPÇÃO, e explicitamente NÃO medido na deliberação: o
        // dono do jogo já disse uma vez "não aceito a proposta pra trocar de
        // modelo", e trocar por conta própria seria decidir por ele. Para
        // rascunhar a fala, ele é o candidato mais interessante que a busca
        // achou — `?rascunhador=vontade&vontade=llama32-horror`.
        id: 'llama32-horror',
        label: 'Llama 3.2 1B · imatrix de terror (Q6, para RASCUNHAR)',
        url: 'https://huggingface.co/DavidAU/Llama-3.2-1B-Instruct-NEO-WEE-HORROR-GGUF/resolve/main/Llama-3.2-1B-Instruct-NEO-WEE-HORROR-Q6_K-imat.gguf',
        bytes: 1_021_800_544,
        nota: 'mesmo Llama 3.2 (declara pt), quantizado com imatrix de terror; NÃO medido na vontade — entrou como candidato a rascunhador',
    },
    {
        // ── O ÚNICO CANDIDATO NOVO QUE SOBREVIVEU À CAÇADA DO REVISOR ─────
        //
        // Sete modelos e cinco arquiteturas foram medidos procurando revisor.
        // Este é o único que empatou com o melhor placar e não colapsou:
        //
        //     candidato            conserta  ecoou  pedaço   1ª FRIA
        //     granite-3.3-2B         8/12      0      0      66,2 s
        //     Falcon-H1-1.5B         8/12      2      0      41,2 s
        //     LFM2.5-1.2B (titular)  7/12      2      0      35,0 s
        //     granite4-h-350m        4/12      7      0      10,4 s
        //     granite4-h-1B          3/12      0      5      31,9 s
        //     BitNet-2B ternário     2/12      1      0      84,5 s
        //     Qwen3-1.7B             0/12     10      0      35,5 s
        //
        // Arquitetura `falcon-h1`: híbrido mamba2 + atenção. Ele escreve frases
        // inteiras ("The elevator will come when it is programmed to, and I
        // cannot predict when that might be.") em vez de ecoar a entrada ou
        // devolver pedaço, que foi como todos os outros novos falharam.
        //
        // O QUE ELE NÃO RESOLVE: 41,2 s a frio contra 35,0 s do titular. Ele lê
        // 301 tokens na primeira chamada e 283-295 nas seguintes, ou seja NÃO
        // reaproveita prefixo — mesmo limite do lfm2, pelo mesmo motivo
        // (estado recorrente). A arquitetura que dá conta da tarefa é a mesma
        // que impede o cache de ajudar.
        //
        // Entra como ESCOLHA (`?revisor=falcon`), não como padrão: 1 conserto a
        // mais em 12 por 6 s a mais cabe no ruído, e trocar o titular por isso
        // seria a quarta vez que eu recomendo por diferença que não se repete.
        id: 'falcon-h1-1.5b',
        label: 'Falcon-H1 1.5B (revisor, híbrido mamba2)',
        url: 'https://huggingface.co/tiiuae/Falcon-H1-1.5B-Instruct-GGUF/resolve/main/Falcon-H1-1.5B-Instruct-Q6_K.gguf',
        // Conferido no arquivo baixado, não no card do repositório.
        bytes: 1_280_071_424,
        nota: 'empata com o melhor placar de remendo (8/12) e escreve frase inteira; 41,2s a frio, e não reaproveita prefixo',
    },
    {
        // ── O MoE QUE O DONO DO JOGO LIBEROU ATÉ 4B PARA ACHAR ───────────
        //
        // "te libero até 4 b, desde que seja muito rápido (provavelmente uma
        // arquitetura MoE)". Este é o que existe dentro dessa faixa E abaixo da
        // parede de 2 GiB por gguf: 3B totais, 800M ATIVOS por token, 2,02 GB
        // em Q4_K_M.
        //
        // MEDIDO COMO REVISOR, a frio, 2 rodadas, régua que reprova eco e
        // fragmento: 6/12, contra 7/12 do titular e 8/12 do Falcon-H1. Dentro
        // do ruído para 12 casos — o que NÃO está dentro do ruído é o tempo:
        //
        //     1ª FRIA   22,6 s   (titular 35,0 · Falcon 41,2 · granite 3.3 66,2)
        //     depois    11,5 s   (titular 34,6 · Falcon 37,8)
        //     lê        125 tok  (titular 267 — transformer puro reaproveita)
        //
        // É o revisor mais rápido que passou de 5/12 nesta bancada, e por larga
        // margem no aquecido: 800M ativos custam 800M, não 3B.
        //
        // O QUE A TABELA NÃO MOSTRA, e o `JA-TENTADO` já dizia deste modelo em
        // OUTRO papel ("mais rápido e menos Nilo"): ele escreve empolado. Saíram
        // coisas como "a mirage, a trick of the light", "shrouded in mystery",
        // "the weight of the silence". O Nilo é seco. Seis dos doze remendos
        // quebraram alguma regra de cânone — o pior índice entre os que
        // consertam — e ele bateu no teto de 40 tokens em 7 das 12.
        //
        // Entra como OPÇÃO porque a escolha entre 12 s e uma frase seca é do
        // dono do jogo, e só o aparelho dele decide se a empolação incomoda.
        id: 'granite3-3b-a800m',
        soRevisor: true,
        label: 'granite 3.1 3B-A800M (MoE, 800M ativos)',
        url: 'https://huggingface.co/bartowski/granite-3.1-3b-a800m-instruct-GGUF/resolve/main/granite-3.1-3b-a800m-instruct-Q4_K_M.gguf',
        bytes: 2_016_888_384,
        nota: 'o mais rápido que consertou: 22,6s a frio e 11,5s depois, contra 35,0s do titular — mas escreve empolado e quebra cânone em 6 de 12',
    },
    {
        // MoE experimental de 2 especialistas, ≈300M ativos por token, e o
        // primeiro candidato a revisor que PENSA. Medido: 0/12 com teto de 40
        // tokens (tudo preso no `<think>`) e 8/12 com 320.
        // Sem `soRevisor`: essa marca existe para arquivo que não cabe ao lado
        // da fala (o teto medido é 1,4 GB), e 712 MB cabe folgado. Ele é
        // candidato a revisor por MEDIÇÃO, não por restrição de tamanho.
        id: 'huihui-moe-08b',
        label: 'Huihui-MoE 0.8B-2E (MoE, ~300M ativos)',
        url: 'https://huggingface.co/mradermacher/Huihui-MoE-0.8B-2E-GGUF/resolve/main/Huihui-MoE-0.8B-2E.Q6_K.gguf',
        bytes: 712_096_256,
        nota: 'pensa antes de responder: 8/12 com teto de 320 tokens, 0/12 com 40; em 2 de 12 pensa até o teto e devolve vazio',
    },
    {
        // ── O PRIMEIRO REVISOR QUE NÃO VEIO DE PRATELEIRA ─────────────────
        //
        // Todos os outros desta lista foram ACHADOS. Este foi FEITO: SmolLM2-360M
        // afinado (LoRA r=32) em 192 pares (frase errada + motivo) → (frase
        // certa), escritos para este cânone. Medido na prova de 24 defeitos,
        // duas rodadas, a frio, com a MESMA régua dos outros:
        //
        //     candidato                conserta  ecoou  copiou  quebrou  TURNO
        //     LFM2.5-1.2B (titular)      44/48      0      0        4     64 s
        //     este                       44/48      2      0        0     15 s
        //     SmolLM2-360M SEM treino     8/48     18     10       28     15 s
        //
        // A comparação que importa é a terceira linha: mesmo arquivo, mesmo
        // enunciado, mesma prova. O que mudou foi só o treino.
        //
        // ── O QUE ELE NÃO FAZ ─────────────────────────────────────────────
        //
        // Não delibera, não conversa, não escreve fala do zero: ele só conserta
        // uma frase quando lhe dizem qual e por quê. E o cânone que ele aprendeu
        // é o do 10º ANDAR — quando o Nilo subir, este arquivo precisa ser
        // treinado de novo, ou vai "consertar" verdade em mentira. Peso de
        // modelo é o pior lugar para guardar um fato que muda.
        //
        // Numa leitura humana das 24 saídas, ~8 ainda são frases plausíveis e
        // erradas ("a door that does not exist"). Régua automática não pega
        // isso; 192 linhas de corpus não ensinam coerência.
        id: 'nilo-revisor-360m',
        label: 'revisor treinado 360M (nosso)',
        url: 'https://huggingface.co/Felipe0282829273/nilo-revisor-360m/resolve/main/revisor-360m-q8_0.gguf',
        bytes: 386_404_864,
        nota: 'empata com o titular em nota (44/48) e é 4x mais rápido: 15s de turno contra 64s, e zero quebra de cânone',
    },
    {
        id: 'minicpm5-1b',
        label: 'MiniCPM5-1B',
        url: 'https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/MiniCPM5-1B-Q4_K_M.gguf',
        bytes: 688_065_920,
        nota: 'o antigo: gasta os 320 tokens discutindo o enunciado e assinou 0/16',
    },
] as const);

/**
 * O Felipe testou os três no aparelho dele e escolheu o Llama 3.2 1B.
 *
 * Minha medição tinha o Gemma na frente por assinar a escolha em 16/16 e ser o
 * mais rápido. Só que os meus 8 cenários não medem o que ele vê jogando: o
 * Gemma repete a mesma abertura entre situações diferentes ("It's cold here, a
 * dull ache…") e usa 4 das 8 metas; o Llama varia mais e acompanha melhor a
 * situação. Quem joga vê o que a planilha não mostra.
 */
/**
 * Tamanho do cérebro da FALA (SmolLM3-3B Q4_K_M), aqui e não no wllamaEngine
 * porque quem precisa do número é a VONTADE: é ela que tem de perguntar "cabem
 * os dois?" antes de gastar um byte. Importar o motor da fala de dentro do
 * cérebro pequeno fecharia um ciclo.
 */
export const SPEECH_BRAIN_BYTES = 1_915_305_312;

/**
 * ── O PADRÃO PASSOU A SER O LFM2.5, E QUEM DECIDIU FOI O DONO DO JOGO ─────
 *
 * "Deixe o lfm como principal, e fds o llama"
 *
 * Eu tinha deixado o Llama por instrução anterior dele ("todos llms que estão
 * aqui, foram escolhidos a dedo"), e até com um teste travando isso para eu não
 * trocar sozinho. A troca é dele, com os números na mão:
 *
 *                    assina na 1ª   escolhas repetidas   ms por decisão
 *     Llama 3.2 1B      4/10          1 de 5 entre runs      64.735
 *     LFM2.5-1.2B      15/15          5 de 5 entre runs      44.733
 *
 * Três execuções cada. O ganho de 1,45x por decisão não vem do tok/s (1,2x):
 * vem de o RESGATE deixar de acontecer — assinar de primeira apaga uma geração
 * inteira por rodada.
 *
 * E é 75 MB MENOR que o Llama Q8, então não custa cota. Quem paga a cota é a
 * fala, que já foi recusada uma vez no aparelho dele.
 *
 * `?vontade=llama32-1b` volta ao anterior sem mexer em código.
 */
export const SMALL_BRAIN_DEFAULT: SmallBrainId = 'lfm2-1b';

export const SMALL_BRAIN_STORAGE_KEY = 'floor10-small-brain';

/**
 * ── `?vontade=<id>` — TROCAR O CÉREBRO SEM SER PROGRAMADOR ────────────────
 *
 * Eu pus o LFM2.5 no catálogo, mostrei os números e disse a ele: "ele aparece
 * na lista de cérebros do painel; é só selecionar e testar no teu aparelho".
 * Estava ERRADO. O seletor existe só em `?mente`, a página de depuração — no
 * JOGO não há nenhum. Ou seja, eu entreguei uma escolha que ele não tinha como
 * fazer, e o relato veio na hora: "o lfm não está baixando, ao invés disso quem
 * tá baixando é o llama". Estava certo, e era isso mesmo que o código fazia.
 *
 * A URL é o caminho que funciona num celular: nada de menu novo, e ele já testa
 * o jogo por URL (`?fresh=1`). Vale para esta aba e FICA GUARDADO, então basta
 * uma vez; `?vontade=llama32-1b` volta atrás.
 *
 * Lido ANTES do `localStorage` de propósito: quem escreveu na URL agora está
 * mandando mais que a escolha de ontem.
 */
function readBrainFromUrl(): SmallBrainId | null {
    try {
        const busca = globalThis.location?.search ?? '';
        // ── `?revisor=` TAMBÉM ESCOLHE O CÉREBRO ─────────────────────────
        //
        // E não é atalho: no pipeline o cérebro pequeno serve DOIS papéis, a
        // vontade e o revisor, com UM arquivo. Baixar dois modelos de 1 GB para
        // usar um só foi o que o dono do jogo cortou — "isso é burrice, não
        // precisa baixar os dois". Então a chave que escolhe o revisor é a
        // mesma que escolhe o que desce.
        //
        // `?vontade=` continua ganhando quando as duas aparecem: ela nomeia um
        // modelo do catálogo diretamente, é mais específica, e existe desde
        // antes para quem quer testar um cérebro que nem é candidato a revisor.
        const pedido = new URLSearchParams(busca).get('vontade')
            ?? (new URLSearchParams(busca).has('revisor') ? cerebroDoRevisor() : null);
        if (!pedido) return null;
        const achado = SMALL_BRAIN_CATALOG.find((m) => m.id === pedido);
        if (!achado) return null;
        // Guarda, para a próxima abertura não precisar do parâmetro. Se falhar
        // (modo privado, por exemplo), a escolha ainda vale para esta sessão.
        try {
            globalThis.localStorage?.setItem(SMALL_BRAIN_STORAGE_KEY, achado.id);
        } catch { /* sem localStorage: vale só nesta aba */ }
        return achado.id;
    } catch {
        return null;
    }
}

function readSavedBrain(): SmallBrainId | null {
    try {
        const saved = globalThis.localStorage?.getItem(SMALL_BRAIN_STORAGE_KEY);
        return SMALL_BRAIN_CATALOG.some((m) => m.id === saved)
            ? (saved as SmallBrainId)
            : null;
    } catch {
        return null;
    }
}

// ── A ESCOLHA É PREGUIÇOSA, E ISSO É CONSERTO DE BUG ─────────────────────
//
// Isto era `let escolhido = readBrainFromUrl() ?? …`, resolvido no INSTANTE em
// que o módulo era avaliado. E `readBrainFromUrl` chama `cerebroDoRevisor()`,
// que mora em `floor10Revisores` — que por sua vez importa este arquivo. Com o
// ciclo, quem é avaliado primeiro depende de quem foi importado primeiro lá em
// cima: se `floor10Brains` roda enquanto `floor10Revisores` ainda está no meio
// da inicialização, `REVISORES` está na zona morta, a chamada estoura, o
// `catch` devolve null e a escolha cai no padrão — em silêncio.
//
// Medido: com `?pipeline&revisor=treinado`, a fila baixou 1,25 GB de LFM2.5 em
// vez dos 386 MB do revisor treinado, e o remendo saiu `sem-revisor`. Importando
// `floor10Brains` primeiro, num teste isolado, a mesma URL resolvia certo. Ou
// seja: a ORDEM DE IMPORT decidia qual modelo o jogador baixava.
//
// Resolver na primeira LEITURA elimina a corrida: quando alguém pergunta qual é
// o cérebro, os dois módulos já estão de pé.
let escolhido: SmallBrainId | null = null;

/** O id da vontade em vigor. Fonte única — o motor da fala lê daqui também. */
export function cerebroEscolhido(): SmallBrainId {
    escolhido ??= readBrainFromUrl() ?? readSavedBrain() ?? SMALL_BRAIN_DEFAULT;
    return escolhido;
}

/** Troca a escolha. Quem descarrega o cérebro anterior é floor10SmallBrain. */
export function definirCerebroEscolhido(id: SmallBrainId): void { escolhido = id; }

/**
 * A URL do .gguf da vontade EM USO.
 *
 * Existe para o cérebro da fala saber qual cache NÃO apagar quando precisa de
 * espaço: apagar o que está em uso custa um download inteiro de volta, e o
 * que sobra dos outros candidatos é lixo puro — especialmente depois de uma
 * troca de modelo, quando o antigo fica ocupando cota sem servir para nada.
 */
export function urlDoCerebroEscolhido(): string {
    const achado = SMALL_BRAIN_CATALOG.find((m) => m.id === escolhido) ?? SMALL_BRAIN_CATALOG[0];
    return (globalThis as { __smallBrainModelUrl?: string }).__smallBrainModelUrl ?? achado.url;
}


/**
 * Os caches de vontade que são LIXO: todos os candidatos menos o em uso.
 *
 * Passou a existir quando o dono do jogo trocou a vontade para o LFM2.5 — o
 * Llama de 1,32 GB ficou no OPFS ocupando cota que não serve mais para nada.
 * Apagar tudo de uma vez resolveria a cota e cobraria um download inteiro do
 * modelo que o jogo vai querer em seguida; apagar o lixo primeiro resolve de
 * graça na maioria das vezes.
 */
export function cachesDescartaveis(): string[] {
    const emUso = urlDoCerebroEscolhido();
    return smallBrainUrls().filter((u) => u !== emUso);
}

/** Todo cache que a FALA pode reciclar quando faltar espaço para ela. */
export function smallBrainUrls(): string[] {
    return SMALL_BRAIN_CATALOG.map((m) => m.url);
}
