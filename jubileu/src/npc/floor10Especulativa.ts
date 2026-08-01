// ── DECODIFICAÇÃO ESPECULATIVA — ela já estava aqui dentro ────────────────
//
// A HISTÓRIA, porque ela importa para quem mexer nisto depois: eu afirmei duas
// vezes que especulativa era impossível neste projeto. Estava errado nas duas.
// Olhei a superfície JavaScript da wllama, não achei `getLogits`, e concluí.
// Quem manda no jogo insistiu três vezes — e tinha razão.
//
// A wllama 3.5.1 (a MESMA que já roda as quatro IAs) embute o `server_context`
// do llama.cpp inteiro, e o llama.cpp tem especulativa nativa. A prova está em
// `cpp/wllama-context.h`:
//
//     // speculative decoding
//     if (req.spec_draft_model.not_null())
//       params.speculative.draft.mparams.path = req.spec_draft_model.value;
//
// E `LoadModelParams` já declara `spec_draft_model`, `spec_draft_n_max`,
// `spec_draft_n_min`, `spec_draft_p_min` e os threads. Não é preciso recompilar
// WASM, forkar biblioteca, trocar para ONNX nem construir ponte entre versões.
//
// ── O QUE É, E POR QUE NÃO DEIXA O MODELO MAIS BURRO ──────────────────────
// Um modelo pequeno PROPÕE os próximos tokens; o grande confere todos numa
// passada só e aceita o prefixo em que concorda. Nenhum token entra sem ter
// sido escolhido pelo grande — o rascunho só adivinha ONDE perguntar. A saída
// é a mesma; muda quantas passadas ela custou. Quem faz a conferência é o
// llama.cpp, em C++, onde os logits por posição são de graça. Não há código
// meu no meio da decisão, e é por isso que a garantia vale.
//
// ── O BURACO QUE FALTAVA, E COMO ELE É TAPADO AQUI ────────────────────────
// `spec_draft_model` é um CAMINHO dentro do sistema de arquivos do WASM, e a
// API pública da wllama não monta arquivo avulso: `prepareBlobs()` transforma
// todo blob extra em shard do modelo principal. Ou seja, o recurso existe e
// está desligado por falta de encanamento.
//
// O encanamento é este arquivo, e ele é deliberadamente MÍNIMO: em vez de
// reimplementar a carga (cache, compat de Safari/Firefox, decisão de mmap,
// threads, template de chat — tudo que faz o jogo funcionar hoje), ele
// embrulha DOIS métodos internos e deixa a wllama fazer todo o resto igual:
//
//   1. `moduleInit`  → acrescenta o .gguf do rascunhador à lista de arquivos;
//   2. `wllamaAction('load')` → injeta os campos `spec_draft_*` na mensagem.
//
// Depois disso, `loadModelFromUrl` roda exatamente como roda hoje.
//
// ── O RASCUNHADOR NÃO CUSTA DOWNLOAD ──────────────────────────────────────
// Ele é o Llama 3.2 1B que a VONTADE já baixou. `cacheManager.open(url)`
// devolve o arquivo do cache como Blob. Se ele não estiver lá, a especulativa
// simplesmente não liga — e a fala carrega do jeito de sempre.
//
// ── ⚠ INERTE COM O WASM DE PRATELEIRA — LEIA ANTES DE MEXER ───────────────
//
// Este encanamento está CERTO e ainda assim não liga nada com o wllama.wasm
// publicado. O motivo, achado em `common/speculative.cpp` do llama.cpp que a
// 3.5.1 embute (commit dd4623a7):
//
//     common_speculative_init(params, n_seq) {
//       uint32_t enabled_configs = common_get_enabled_speculative_configs(params.types);
//
// TUDO depende de `params.speculative.types` — e o glue da wllama
// (`cpp/wllama-context.h`, linhas 524-538) preenche apenas
// `params.speculative.draft.*`. Nunca toca em `types`, que fica no padrão
// `{ COMMON_SPECULATIVE_TYPE_NONE }`. Resultado: o modelo rascunhador é
// aceito, guardado… e nenhum especulador é criado.
//
// O QUE FALTA É UMA LINHA no C++ da wllama (mais um campo na mensagem de
// carga) para repassar `types`. Todo o resto — draft-simple, eagle3, mtp e
// CINCO variantes de n-grama — já está compilado dentro do .wasm que o jogo
// baixa hoje:
//
//     COMMON_SPECULATIVE_TYPE_NGRAM_SIMPLE   // auto-especulação, SEM modelo
//     COMMON_SPECULATIVE_TYPE_NGRAM_MAP_K
//     COMMON_SPECULATIVE_TYPE_NGRAM_MAP_K4V
//     COMMON_SPECULATIVE_TYPE_NGRAM_MOD
//     COMMON_SPECULATIVE_TYPE_NGRAM_CACHE
//
// As variantes de n-grama são a resposta para "quem rascunha para o 1B?": ele
// mesmo. Elas dispensam segundo modelo, dispensam vocabulário compatível e
// dispensam download — servem a fala, a vontade e o motor igualmente.
//
// Por isso este arquivo fica: quando o .wasm modificado existir, o cano já
// está pronto e testado. Até lá ele é uma trilha documentada, não um recurso.
//
// ── DESLIGADA POR PADRÃO ──────────────────────────────────────────────────
// Só liga com `?especulativa` na URL. O caminho que funciona hoje não muda
// sozinho: primeiro se mede no aparelho de quem joga, depois se decide.
import { anotar } from './floor10CaixaPreta';

/** Nome do arquivo do rascunhador dentro do FS do WASM. */
export const ARQUIVO_RASCUNHO = 'draft.gguf';

/** O caminho como o llama.cpp o enxerga (a wllama monta tudo em `models/`). */
export const CAMINHO_RASCUNHO = `models/${ARQUIVO_RASCUNHO}`;

/**
 * Quantos tokens o rascunhador propõe por rodada.
 *
 * 4 é conservador de propósito: cada token rejeitado é trabalho jogado fora, e
 * num celular o rascunhador de 1B não é barato como seria um de 100M. O número
 * certo sai da medição no aparelho, não daqui.
 */
export const RASCUNHO_N_MAX = 4;

/** Abaixo disto nem vale propor: a rodada sai mais cara que a geração normal. */
export const RASCUNHO_N_MIN = 1;

/**
 * Confiança mínima do rascunhador para a proposta valer. Alto de propósito: um
 * palpite inseguro quase sempre é rejeitado, e rejeição custa.
 */
export const RASCUNHO_P_MIN = 0.75;

/**
 * Threads do rascunhador. Poucas, e a razão é a mesma que já derrubou este
 * celular uma vez: os dois modelos vão disputar os MESMOS núcleos, e a fala é
 * quem o jogador está esperando.
 */
export const RASCUNHO_THREADS = 2;

/** `?especulativa` liga. Desligada é o padrão — o que funciona hoje não muda sozinho. */
export function especulativaLigada(busca = globalThis.location?.search ?? ''): boolean {
    return /[?&]especulativa\b/i.test(busca);
}

/** Os campos que entram na mensagem de carga do wllama. */
export function parametrosEspeculativos(): Record<string, unknown> {
    return {
        spec_draft_model: CAMINHO_RASCUNHO,
        spec_draft_n_max: RASCUNHO_N_MAX,
        spec_draft_n_min: RASCUNHO_N_MIN,
        spec_draft_p_min: RASCUNHO_P_MIN,
        spec_draft_ngl: 0,
        spec_draft_threads: RASCUNHO_THREADS,
        spec_draft_threads_batch: RASCUNHO_THREADS,
    };
}

/** O mínimo da wllama que este módulo precisa enxergar. */
export type MotorEspeculavel = {
    cacheManager?: { open?: (nomeOuUrl: string) => Promise<Blob | null> };
    proxy?: {
        moduleInit: (arquivos: Array<{ name: string; blob: Blob }>) => Promise<void>;
        wllamaAction: (nome: string, msg: Record<string, unknown>) => Promise<unknown>;
    };
};

/**
 * Forma CHATA de propósito (um objeto só, sem união discriminada): o
 * `tsconfig` deste projeto não liga `strict`, e sem `strictNullChecks` o
 * TypeScript não estreita união por discriminante booleano. Um tipo plano
 * funciona em qualquer configuração e não custa nada.
 */
export type PreparoEspeculativo = {
    ok: boolean;
    /** Tamanho do rascunhador montado; 0 quando não deu. */
    bytes: number;
    /** Por que não deu; vazio quando deu. */
    motivo: string;
};

/**
 * Prepara o motor para carregar COM especulativa.
 *
 * Chamar isto ANTES do `loadModelFromUrl`. Se devolver `ok: false`, a carga
 * segue normal — nunca se troca uma fala que funciona por uma otimização.
 */
export async function prepararEspeculativa(
    motor: MotorEspeculavel,
    urlDoRascunhador: string,
): Promise<PreparoEspeculativo> {
    const proxy = motor.proxy;
    if (!proxy?.moduleInit || !proxy?.wllamaAction) {
        return { ok: false, bytes: 0, motivo: 'esta build da wllama não expõe o proxy interno' };
    }
    if (!motor.cacheManager?.open) {
        return { ok: false, bytes: 0, motivo: 'sem cacheManager para ler o rascunhador' };
    }

    let blob: Blob | null = null;
    try {
        blob = await motor.cacheManager.open(urlDoRascunhador);
    } catch (erro) {
        return {
            ok: false,
            bytes: 0,
            motivo: `falha ao abrir o rascunhador no cache: ${erro instanceof Error ? erro.message : String(erro)}`,
        };
    }
    if (!blob || blob.size === 0) {
        // O caminho normal quando a vontade ainda não baixou. Não é erro.
        return { ok: false, bytes: 0, motivo: 'o rascunhador ainda não está no aparelho' };
    }

    const rascunho = blob;
    const initOriginal = proxy.moduleInit.bind(proxy);
    const acaoOriginal = proxy.wllamaAction.bind(proxy);

    // (1) O arquivo entra na montagem, ao lado dos shards do modelo principal.
    //     Vai por último e com nome próprio: `prepareBlobs` numera os shards
    //     como `model-0000N-of-0000N.gguf`, então não há colisão possível.
    proxy.moduleInit = (arquivos) => initOriginal([
        ...arquivos,
        { name: ARQUIVO_RASCUNHO, blob: rascunho },
    ]);

    // (2) A mensagem de carga ganha os campos que o C++ já sabe ler. Só a de
    //     carga: qualquer outra ação passa intocada.
    proxy.wllamaAction = (nome, msg) => acaoOriginal(
        nome,
        nome === 'load' ? { ...msg, ...parametrosEspeculativos() } : msg,
    );

    anotar('especulativa:preparada', {
        rascunhador: Math.round(rascunho.size / 1e6),
        n_max: RASCUNHO_N_MAX,
    });
    return { ok: true, bytes: rascunho.size, motivo: '' };
}
