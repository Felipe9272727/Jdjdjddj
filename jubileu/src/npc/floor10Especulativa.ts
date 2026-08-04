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
// ── A PONTE DE PTHREAD, SEM A QUAL NADA DISTO CARREGAVA ───────────────────
// Medido num Chromium de verdade, com o binário deste diretório: a carga do
// N-gram não era LENTA, era eterna. O emscripten desta build já não olha
// `Module.mainScriptUrlOrBlob` (o wllama ainda entrega) e cria cada pthread com
//
//   var pthreadMainJs = _scriptName;
//
// Dentro de um Worker criado a partir de Blob, `_scriptName` é
// `self.location.href` — o Blob do PRÓPRIO worker do wllama, que não tem o
// bootstrap de pthread. Os workers do pool subiam e nunca respondiam o
// handshake, `addRunDependency('loading-workers')` nunca era removido e
// `onRuntimeInitialized` nunca disparava. O sintoma no aparelho do Felipe era
// exatamente este: "Loading wllama.wasm" e depois silêncio até o relógio
// estourar — 1280 s numa vez, 402 s na outra, e nenhuma das duas ia terminar.
//
// O conserto está em `public/wllama-espec/index.js` e são duas linhas: o worker
// publica `globalThis.__emPthreadUrl` a partir do Blob do módulo (a única URL
// que contém o bootstrap), e o glue passa a preferi-la a `_scriptName`. Com
// isso o pool fecha em milissegundos.
//
// ── AGORA É O PADRÃO, E POR MEDIÇÃO ───────────────────────────────────────
// Passou a valer para todo mundo depois de rodar num Chromium de verdade
// (ver `bancada-navegador/`), três rodadas de cada lado, greedy, mesmo modelo:
//
//   texto que ecoa o contexto   11,80 → 16,84 tok/s   1,43×   aceitos 68/81
//   conversa livre              11,87 → 11,90 tok/s   1,00×   aceitos 18/27
//   texto gerado                IDÊNTICO nas seis rodadas
//
// A leitura honesta desses números: o n-grama nunca CUSTA, e às vezes paga
// caro. Um recurso que empata no pior caso e ganha 43% no melhor não merece
// ficar atrás de uma flag que só quem lê o código sabe que existe.
//
// `?semngram` volta para o wllama do CDN — é a saída de emergência para o dia
// em que este binário implicar com algum aparelho. E, ligado ou não, isto vale
// SÓ para a fala: vontade, motor e memória seguem no wllama de prateleira.
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
 * A carga OPFS -> Worker -> HeapFS/mmap fica atrás da SUA PRÓPRIA flag, e
 * desligada por padrão. Ela não é uma variação inofensiva da carga normal:
 * ligá-la DESLIGA a leitura JSPI (a que o jogo usa hoje, sob demanda) e passa a
 * exigir 1,92 GB contíguos alocados de uma vez dentro do heap WASM, copiados do
 * OPFS por uma chamada síncrona dentro do Worker.
 *
 * Foi o que ficou 900 s sem terminar no aparelho — e, por ser síncrona, ela
 * também cega o único heartbeat que provaria se ainda está avançando. Enquanto
 * não houver medição de um celular dizendo que compensa, o N-gram carrega pelo
 * mesmo caminho do runtime normal: é o que a bancada A/B precisa (uma variável
 * de cada vez) e é o caminho que sabidamente termina.
 */
export function cargaRapidaLigada(busca = globalThis.location?.search ?? ''): boolean {
    return /[?&]cargarapida\b/i.test(busca);
}

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

/**
 * DESLIGADA por padrão. `?ngram` liga (a bancada A/B usa isso).
 *
 * ERA ligada, e o dono do jogo mandou tirar depois de continuar sentindo o
 * celular travar. A medição que está logo abaixo, feita por mim, dá razão a
 * ele: mesmo no orçamento mínimo (n_max = 1), na CONVERSA — que é o que o
 * jogador faz — o n-grama custava 10% de velocidade e 1,7 s a mais de CPU por
 * resposta. O ganho de 1,43× só apareceu em texto que ecoa o contexto, que não
 * é o caso de uso do Nilo.
 *
 * Um recurso que empata no melhor caso e cobra no caso comum não é padrão.
 *
 * ATENÇÃO ao que isto NÃO desliga: o runtime remendado continua valendo (ver
 * `runtimeEspecLigado`). Ele carrega os kernels SIMD de WASM (+51% medidos), a
 * ponte de pthread sem a qual a carga era eterna e o conserto do erro não
 * clonável. Confundir as duas coisas — como o `?semngram` antigo fazia, caindo
 * para o CDN — trocaria um custo de 10% por uma perda de 51%.
 */
export function especulativaLigada(busca?: string): boolean {
    // Uma busca explícita é uma consulta pura (inclusive nos testes); somente
    // quem pergunta pelo modo ATUAL recebe a escolha feita pela bancada.
    if (busca === undefined && runtimeForcado !== null) return runtimeForcado === 'ngram';
    const alvo = busca ?? globalThis.location?.search ?? '';
    if (/[?&]semngram\b/i.test(alvo)) return false;
    return /[?&](ngram|especulativa)\b/i.test(alvo);
}

/**
 * O BINÁRIO REMENDADO — e ele NÃO é o n-grama.
 *
 * Vale por padrão para todo mundo, com ou sem especulação, porque o que ele
 * carrega não tem nada a ver com rascunhar tokens:
 *
 *   kernels SIMD de WASM do ggml ...... +51% na fala, medidos no Chromium
 *   ponte de pthread (__emPthreadUrl) .. sem ela a carga NUNCA terminava
 *   erro clonável no postMessage ....... sem ele, QuotaExceeded travava tudo
 *
 * `?wllamacdn` é a saída de emergência que o `?semngram` costumava ser: se um
 * aparelho implicar com o nosso binário, o jogador volta ao wllama de
 * prateleira sem esperar commit nenhum — pagando os 51%, conscientemente.
 */
export function runtimeEspecLigado(busca = globalThis.location?.search ?? ''): boolean {
    return !/[?&]wllamacdn\b/i.test(busca);
}

/**
 * ORÇAMENTO DE RASCUNHO: 1. Este número custou um travamento no celular.
 *
 * O `ngram-cache` do llama.cpp vinha com `uint16_t n_draft = 8; // TODO get
 * from config?` — 8 propostas por passo, fixas, ignorando qualquer parâmetro.
 * Numa pergunta comum ele acerta ZERO das 8, e o modelo verifica 9 posições
 * para aproveitar 1. Medido no navegador com o SmolLM3-3B (4 threads, mesma
 * pergunta, greedy):
 *
 *   sem n-grama   2,86 tok/s   47,5 s de CPU
 *   n_max = 1     2,57 tok/s   49,2 s   (−10%)
 *   n_max = 2     2,48 tok/s   50,4 s   (−13%)
 *   n_max = 3     2,27 tok/s   52,3 s   (−21%)
 *   n_draft = 8   1,77 tok/s   58,3 s   (−38%, +22% de CPU)
 *
 * Num PC isso é uma barra mais lenta; num celular é o aparelho inteiro travando,
 * porque especular troca um trabalho limitado por MEMÓRIA (núcleos esperando)
 * por um limitado por CONTA (núcleos a 100%), e não sobra nada para a tela.
 *
 * Por que 1 e não zero: com 1 proposta o passo continua limitado por banda —
 * verificar 2 tokens relê os mesmos pesos que verificar 1 —, o prejuízo no pior
 * caso é 10%, e o ganho aparece sempre que a resposta repete algo do contexto
 * (medido: 68 de 81 aceitos num texto que ecoa, 1,43× de fala). O empate fica em
 * 10% de aceitação: acima disso, 1 já paga.
 *
 * O `n_draft` do llama.cpp só obedece porque o binário em `public/wllama-espec`
 * foi recompilado com o patch que lê `spec_draft_n_max`.
 *
 * ── E AÍ O NÚMERO DESMENTIU O PARÁGRAFO ACIMA ────────────────────────────
 * Rodei o A/B outra vez (bancada-navegador/ngram.html?prompt=conversa), agora
 * com `spec_draft_n_max: 1` nos dois lados — porque o bench antigo comparava
 * contra o padrão interno de 8, uma configuração que o jogo nunca rodou.
 * Seis rodadas alternadas, mesmo modelo, mesmo cache, greedy:
 *
 *   normal0  2,92 tok/s     ngram0   —
 *   normal1  3,23 tok/s     ngram1   4,02 tok/s
 *   normal2  4,09 tok/s     ngram2   4,12 tok/s
 *
 *   rascunhados: 0     aceitos: 0     EM TODAS AS SEIS RODADAS
 *
 * Duas leituras, e as duas importam:
 *
 * 1. COM `n_max = 1` O N-GRAMA NÃO RASCUNHA NADA. Zero propostas, zero
 *    aceitas. A mesma coluna que já mostrou "68 de 81 aceitos" com o
 *    orçamento cheio mostra zero aqui — o campo funciona, o rascunho é que
 *    não acontece. Ou seja: desde o commit que baixou o orçamento para 1, o
 *    n-grama do jogo era PESO MORTO. Não acelerava e não podia acelerar.
 *
 * 2. ESTE BENCH NÃO MEDE MAIS NADA ALÉM DISSO. Os números sobem
 *    monotonicamente ao longo da sessão (2,92 → 4,12) independente do braço:
 *    é aquecimento/cache desta caixa, não runtime. O "1,057×" do resumo é
 *    artefato da ordem. E a mesma desconfiança vale para o −10% que está
 *    escrito acima, medido no mesmo tipo de rig.
 *
 * O texto saiu IDÊNTICO nas seis rodadas, então nada disto toca a qualidade.
 *
 * A conclusão honesta: tirar o n-grama é certo por ser peso morto e uma peça a
 * menos para dar errado — NÃO por ser a causa do travamento do celular. Uma
 * coisa que não rascunha nada também não queima CPU rascunhando.
 */
export const RASCUNHO_N_MAX = 1;

/** Os campos que entram na mensagem de carga do wllama. */
export function parametrosEspeculativos(): Record<string, unknown> {
    return {
        spec_draft_model: TIPOS_NGRAMA,
        spec_draft_n_max: RASCUNHO_N_MAX,
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

/** De onde o par ESM/WASM veio nesta carga. Entra no relatório da bancada. */
export type OrigemDoRuntime = 'embutido' | 'guardado' | 'rede';

export type RuntimeEspeculativo = {
    esm: string;
    wasm: string;
    origem: OrigemDoRuntime;
};

/** O balde do runtime é separado do jogo: apagar um não apaga o outro. */
export const CACHE_RUNTIME_ESPECULATIVO = 'tne-wllama-espec-v1';

let preparo: Promise<RuntimeEspeculativo> | null = null;

/**
 * Deixa o runtime N-gram pronto para usar, de preferência SEM rede.
 *
 * O binário recompilado tem 5,85 MB e o glue tem 320 KB, e no build da Vercel
 * os dois eram buscados por HTTP a CADA carga — inclusive a carga que o
 * jogador refaz dez vezes seguidas testando. O wllama do CDN não paga isso
 * (o navegador o guarda por conta própria), então essa conta aparecia só do
 * lado N-gram e envenenava justamente a comparação que a bancada existe para
 * fazer.
 *
 * Agora o par vive no Cache Storage e é servido por Blob URL. A primeira carga
 * numa origem ainda paga a rede; da segunda em diante, nenhuma.
 *
 * A regra de sempre continua valendo: isto é uma otimização, e otimização não
 * derruba fala. Qualquer tropeço aqui devolve os caminhos HTTP de sempre.
 */
export function prepararEspeculativa(): Promise<RuntimeEspeculativo> {
    preparo ??= (async (): Promise<RuntimeEspeculativo> => {
        const pacote = (globalThis as GlobalComPacoteEspeculativo).__TNE_WLLAMA_ESPEC__;
        if (pacote?.esm && pacote.wasmBase64) {
            const { esm, wasm } = caminhosDaEspeculativa();
            return { esm, wasm, origem: 'embutido' };
        }

        const rede = caminhosDaEspeculativa();
        try {
            const balde = await globalThis.caches?.open(CACHE_RUNTIME_ESPECULATIVO);
            if (!balde) return { ...rede, origem: 'rede' };

            let estavaGuardado = true;
            const buscar = async (caminho: string): Promise<Response> => {
                const guardado = await balde.match(caminho);
                if (guardado) return guardado;
                estavaGuardado = false;
                await balde.add(caminho);
                const agora = await balde.match(caminho);
                if (!agora) throw new Error(`não guardou ${caminho}`);
                return agora;
            };

            const [respostaEsm, respostaWasm] = await Promise.all([
                buscar(rede.esm),
                buscar(rede.wasm),
            ]);
            // O tipo é reconstruído de propósito: `instantiateStreaming` recusa
            // um Blob que não se declare `application/wasm`, e um ESM que não se
            // declare JavaScript nem chega a ser importado.
            const esm = URL.createObjectURL(new Blob(
                [await respostaEsm.text()],
                { type: 'text/javascript' },
            ));
            const wasm = URL.createObjectURL(new Blob(
                [await respostaWasm.arrayBuffer()],
                { type: 'application/wasm' },
            ));
            anotar('espec:runtime', { origem: estavaGuardado ? 'guardado' : 'rede' });
            return { esm, wasm, origem: estavaGuardado ? 'guardado' : 'rede' };
        } catch (erro) {
            anotar('espec:runtime-http', {
                motivo: erro instanceof Error ? erro.message : String(erro),
            });
            return { ...rede, origem: 'rede' };
        }
    })();
    return preparo;
}

/** Somente para isolar testes que injetam o pacote do single-file. */
export function resetCaminhosEspeculativosForTests(): void {
    caminhosEmbutidos = null;
    preparo = null;
}

/** Somente para impedir vazamento da seleção A/B entre testes. */
export function resetRuntimeFloor10ForTests(): void {
    runtimeForcado = null;
}
