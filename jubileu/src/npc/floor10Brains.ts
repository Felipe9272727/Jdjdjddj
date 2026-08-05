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

export type SmallBrainId =
    | 'gemma3-1b' | 'llama32-1b' | 'llama32-1b-q4' | 'minicpm5-1b' | 'lfm2-1b';

export type SmallBrainEntry = {
    id: SmallBrainId;
    label: string;
    url: string;
    bytes: number;
    /** O que a medição no prompt real do Andar 10 mostrou sobre ele. */
    nota: string;
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

export const SMALL_BRAIN_DEFAULT: SmallBrainId = 'llama32-1b';

/** Todo cache que a FALA pode reciclar quando faltar espaço para ela. */
export function smallBrainUrls(): string[] {
    return SMALL_BRAIN_CATALOG.map((m) => m.url);
}
