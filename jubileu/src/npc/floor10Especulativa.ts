// ── ESPECULATIVA POR N-GRAMAS — o wllama do jogo, com uma linha a mais ────
//
// COMO CHEGAMOS AQUI
// A decodificação especulativa já vinha compilada dentro do wllama 3.5.1 (ele
// embute o server_context do llama.cpp inteiro), mas ficava inalcançável: o
// glue C++ preenchia `params.speculative.draft.*` e NUNCA `params.speculative
// .types` — e é de `types` que `common_speculative_init()` decide tudo. Ou
// seja: dava para informar um rascunhador e nada acontecia.
//
// Então a wllama foi recompilada com o patch mínimo (ver
// `public/wllama-espec/`):
//
//   spec_draft_model = "types:ngram-cache" → liga os n-gramas
//   spec_draft_model = "models/x.gguf"     → modelo, e agora também liga o tipo
//
// O campo foi SOBRECARREGADO em vez de criado porque o GLUE lê os campos
// posicionalmente: um campo novo obrigaria o JavaScript a enviá-lo, e assim o
// mesmo protocolo de sempre continua valendo.
//
// ── POR QUE N-GRAMA, E NÃO UM MODELO RASCUNHADOR ──────────────────────────
// `ngram-cache` é AUTO-especulação: o próprio modelo propõe as continuações a
// partir do texto que ele já viu, e confere na mesma passada.
// Isso resolve as três perguntas que travavam a ideia:
//
//   - quem rascunha para o cérebro de 1B?  ele mesmo;
//   - precisa de um modelo compatível?     não, nenhum;
//   - custa download e memória?            zero dos dois.
//
// Um rascunhador POR MODELO exigiria o mesmo vocabulário do alvo, e o do
// SmolLM3 (128.256 tokens) pesa 263M parâmetros só na tabela de embeddings —
// o menor rascunhador possível teria ~240 MB, e não existe nenhum público.
//
// ── E A INTELIGÊNCIA? ─────────────────────────────────────────────────────
// Não muda. Nenhum token entra sem ter sido escolhido pelo próprio modelo; o
// n-grama só adivinha ONDE perguntar. Quem confere é o llama.cpp, em C++. O
// que se ganha é passada de máquina; o que sai é o mesmo texto.
//
// ── DESLIGADA POR PADRÃO ──────────────────────────────────────────────────
// `?especulativa` liga. Sem a flag, o jogo carrega o wllama do CDN, exatamente
// como sempre — este binário nem é baixado. E mesmo ligada, ela vale SÓ para a
// fala: vontade, motor e memória seguem no wllama de prateleira.
import { anotar } from './floor10CaixaPreta';

/**
 * O especulador pedido ao llama.cpp.
 *
 * Esta build do wllama expõe os controles `spec_draft_*`, mas esses controles
 * pertencem exclusivamente a um MODELO rascunhador. Em `ngram-simple`, portanto,
 * o aparente `spec_draft_n_max: 4` era ignorado e o llama.cpp dd4623a7 usava o
 * padrão interno de 48 propostas. Isso fazia o contexto reservar até 49 saídas
 * sobre o vocabulário de 128k justamente depois de o download chegar a 100% —
 * a etapa que ficou parada no Android.
 *
 * `ngram-cache` mantém a auto-especulação sem outro modelo e, nessa mesma versão
 * do llama.cpp, limita internamente a rodada a 8 propostas. É a opção segura
 * enquanto o bridge não expõe `ngram-simple.size_m` de verdade.
 */
export const TIPOS_NGRAMA = 'types:ngram-cache';

/**
 * Blocos grandes o bastante para evitar milhares de mensagens entre threads,
 * mas pequenos perto dos 1,92 GB do GGUF e da memória de um celular.
 */
export const FLOOR10_FAST_LOAD_CHUNK_BYTES = 16 * 1024 * 1024;

/**
 * Contrato da build customizada para o caminho OPFS -> Worker -> HeapFS/mmap.
 * O runtime usa a mesma URL para localizar a entrada criada pelo CacheManager;
 * se ela não existir ou o navegador não oferecer SyncAccessHandle, recua.
 */
export function configuracaoCargaRapida(url: string): {
    cacheURL: string;
    chunkBytes: number;
} {
    return {
        cacheURL: url,
        chunkBytes: FLOOR10_FAST_LOAD_CHUNK_BYTES,
    };
}

export type Floor10Runtime = 'normal' | 'ngram';

/**
 * A URL continua sendo a fonte de verdade no jogo. A bancada A/B pode forçar
 * um runtime sem recarregar a página, porque precisa alternar os dois usando o
 * MESMO cache, modelo e aparelho.
 */
let runtimeForcado: Floor10Runtime | null = null;

export function definirRuntimeFloor10(runtime: Floor10Runtime | null): void {
    runtimeForcado = runtime;
    if (runtime) anotar('comparacao:runtime', { runtime });
}

export function runtimeFloor10(): Floor10Runtime {
    return especulativaLigada() ? 'ngram' : 'normal';
}

/** `?especulativa` liga. Desligada é o padrão — o que funciona hoje não muda sozinho. */
export function especulativaLigada(busca?: string): boolean {
    // Uma busca explícita é uma consulta pura (inclusive nos testes); somente
    // quem pergunta pelo modo ATUAL recebe a escolha feita pela bancada.
    if (busca === undefined && runtimeForcado !== null) return runtimeForcado === 'ngram';
    return /[?&]especulativa\b/i.test(busca ?? globalThis.location?.search ?? '');
}

/** Os campos que entram na mensagem de carga do wllama. */
export function parametrosEspeculativos(): Record<string, unknown> {
    return {
        spec_draft_model: TIPOS_NGRAMA,
    };
}

/** Onde vive o wllama recompilado. Servido pela própria origem do jogo. */
export const PASTA_ESPECULATIVA = '/wllama-espec';

type PacoteEspeculativoEmbutido = {
    esm: string;
    wasmBase64: string;
};

type GlobalComPacoteEspeculativo = typeof globalThis & {
    __TNE_WLLAMA_ESPEC__?: PacoteEspeculativoEmbutido;
};

let caminhosEmbutidos: { esm: string; wasm: string } | null = null;

/**
 * O ESM e o .wasm do build com o patch.
 *
 * O single-file injeta os dois dentro do próprio index.html. Isso é necessário
 * porque previews protegidos da Vercel podem servir o HTML já guardado pelo
 * Service Worker e redirecionar um import novo para a tela de login — foi o
 * `Failed to fetch dynamically imported module` visto no aparelho. No Vite
 * normal, onde não há pacote injetado, os caminhos HTTP continuam servindo.
 */
export function caminhosDaEspeculativa(): { esm: string; wasm: string } {
    const pacote = (globalThis as GlobalComPacoteEspeculativo).__TNE_WLLAMA_ESPEC__;
    if (pacote?.esm && pacote.wasmBase64) {
        caminhosEmbutidos ??= {
            esm: URL.createObjectURL(new Blob(
                [pacote.esm],
                { type: 'text/javascript' },
            )),
            wasm: URL.createObjectURL(new Blob(
                [Uint8Array.from(atob(pacote.wasmBase64), (c) => c.charCodeAt(0))],
                { type: 'application/wasm' },
            )),
        };
        return caminhosEmbutidos;
    }
    return {
        esm: `${PASTA_ESPECULATIVA}/index.js`,
        wasm: `${PASTA_ESPECULATIVA}/wllama.wasm`,
    };
}

/** Somente para isolar testes que injetam o pacote do single-file. */
export function resetCaminhosEspeculativosForTests(): void {
    caminhosEmbutidos = null;
}

/** Somente para impedir vazamento da seleção A/B entre testes. */
export function resetRuntimeFloor10ForTests(): void {
    runtimeForcado = null;
}
