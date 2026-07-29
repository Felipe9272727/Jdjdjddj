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

export type SmallBrainId = 'gemma3-1b' | 'llama32-1b' | 'minicpm5-1b';

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
        label: 'Llama 3.2 1B',
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        bytes: 807_694_464,
        nota: 'raciocínio rico em 1ª pessoa e o mais rápido; inventa lembranças de fora do hotel',
    },
    {
        id: 'minicpm5-1b',
        label: 'MiniCPM5-1B',
        url: 'https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/MiniCPM5-1B-Q4_K_M.gguf',
        bytes: 688_065_920,
        nota: 'o antigo: gasta os 320 tokens discutindo o enunciado e assinou 0/16',
    },
] as const);

export const SMALL_BRAIN_DEFAULT: SmallBrainId = 'gemma3-1b';

/** Todo cache que a FALA pode reciclar quando faltar espaço para ela. */
export function smallBrainUrls(): string[] {
    return SMALL_BRAIN_CATALOG.map((m) => m.url);
}
