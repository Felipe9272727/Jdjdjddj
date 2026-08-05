import { readFileSync } from 'node:fs';
import { FLOOR10_GPU_START_LAYERS } from '../npc/floor10Gpu';
import { describe, expect, it } from 'vitest';
import {
    CHAT_COMPLETION_CONFIG,
    CPU_INIT_WATCHDOG_MS,
    CPU_LOAD_CONFIG,
    FLOOR10_MODEL,
    GenerationTimeoutError,
    SPEECH_WEBGPU_ENABLED,
    SPEECH_WEBGPU_LAYERS,
    SPEECH_MODEL_BYTES,
    WEBGPU_INIT_WATCHDOG_MS,
    WLLAMA_PATHS,
    WebGpuInitTimeoutError,
    describeModelLoadActivity,
    floor10ComparisonDiagnosticsEnabled,
    modelInitStalledMs,
    modelInitWatchdogStalledMs,
    NGRAM_CPU_INIT_HARD_LIMIT_MS,
    NGRAM_CPU_INIT_WATCHDOG_MS,
    conversationModelLoadTrace,
    publicarEtapaDeCarga,
    raceGpuInitWatchdog,
    buildFloor10CorrectionPrompt,
    chunkDelta,
    chunkOpensReply,
    consumeChatStream,
    cpuThreadCount,
    formatTimings,
    modelHistory,
    prepareFloor10SystemPrompt,
    sendToNpc,
    speechGpuLayerCount,
    speechRuntimeLabel,
    stringifyModelLoadLog,
    TETO_GGUF_BYTES,
    excedeTetoDoGguf,
    visibleText,
} from '../npc/wllamaEngine';
import { npc, npcSet } from '../npc/npcStore';
import { perceiveFloor10 } from '../npc/floor10Perception';
import { INITIAL_FLOOR10_WILL } from '../npc/floor10Will';

describe('npc/wllamaEngine — contrato do wllama 3.5.1', () => {
    it('usa a chave WASM obrigatória "default"', () => {
        expect(Object.keys(WLLAMA_PATHS)).toEqual(['default']);
        expect(WLLAMA_PATHS.default).toMatch(/@wllama\/wllama@3\.5\.1\/esm\/wasm\/wllama\.wasm$/);
    });

    it('mantém configuração-base CPU e contexto curto', () => {
        expect(CPU_LOAD_CONFIG).toEqual({
            n_ctx: 1536,
            n_batch: 512,
            n_threads: 1,
            n_gpu_layers: 0,
            cache_type_k: 'q8_0',
            cache_type_v: 'q8_0',
            jinja: true,
            reasoning: false,
            default_template_kwargs: { enable_thinking: false },
            warmup: true,
        });
    });

    it('usa todos os núcleos, até oito — medido no aparelho, não suposto', () => {
        expect(cpuThreadCount(false, 12)).toBe(1);
        expect(cpuThreadCount(true, 2)).toBe(2);
        // METADE dos núcleos, e o motivo não é a fala: o ggml espera GIRANDO
        // nas barreiras, então thread ociosa ocupa núcleo. Com 8 de 8 não
        // sobrava nada para o render nem para o sistema — travava o aparelho
        // inteiro. E num big.LITTLE (4×A78 + 4×A55 no 7s Gen 2) as threads
        // lentas ainda atrasam CADA token, porque a barreira espera a última.
        expect(cpuThreadCount(true, 4)).toBe(2);
        expect(cpuThreadCount(true, 8)).toBe(4);
        expect(cpuThreadCount(true, 6)).toBe(3);
        // Nunca passa do teto, mesmo numa máquina enorme.
        expect(cpuThreadCount(true, 32)).toBe(8);
        expect(cpuThreadCount(true, 16)).toBe(8);
        expect(cpuThreadCount(true, Number.NaN)).toBe(1);
    });

    it('permite forçar as threads para medir escalonamento', () => {
        const alvo = globalThis as { __npcThreads?: number };
        try {
            alvo.__npcThreads = 2;
            expect(cpuThreadCount(true, 8)).toBe(2);
        } finally {
            delete alvo.__npcThreads;
        }
        expect(cpuThreadCount(true, 8)).toBe(4);
    });

    it('a GPU só entra pela mão do gerente, e começa pequena', () => {
        // A regra ANTIGA aqui era "nunca WebGPU", e estava certa para o que
        // existia: 12 de 36 camadas fixas, sem ninguém medindo, travavam o
        // aparelho do dono do jogo. Ele reabriu a porta com uma condição —
        // "deixa pelo menos uma pequena parte ligada, e o resto pra ia que
        // gerência" — e o que entra agora é isso, não o offload antigo.
        expect(SPEECH_WEBGPU_ENABLED).toBe(true);
        // Sem adaptador ou com pouca memória, continua zero: as portas velhas
        // seguem fechadas.
        expect(speechGpuLayerCount(false, 12)).toBe(0);
        expect(speechGpuLayerCount(true, 4)).toBe(0);
        // E o padrão do gerente é ZERO: no aparelho do dono do jogo as 3
        // camadas mataram a fala duas vezes. A engrenagem fica ligada, a
        // partida fica no botão do ?bancada.
        const camadas = speechGpuLayerCount(true, 12);
        expect(camadas).toBe(FLOOR10_GPU_START_LAYERS);
        expect(camadas).toBe(0);
        expect(camadas).toBeLessThan(SPEECH_WEBGPU_LAYERS);
    });

    it('mantém a etiqueta capaz de descrever os dois modos', () => {
        expect(speechRuntimeLabel(12, 4)).toBe('WebGPU×12 + CPU×4');
        expect(speechRuntimeLabel(0, 6)).toBe('CPU×6');
    });

    it('usa o SmolLM3-3B oficial como cérebro de fala', () => {
        expect(FLOOR10_MODEL.label).toBe('SmolLM3-3B');
        expect(FLOOR10_MODEL.url).toMatch(/ggml-org\/SmolLM3-3B-GGUF/i);
        expect(FLOOR10_MODEL.url).toMatch(/SmolLM3-Q4_K_M\.gguf$/i);
        expect(FLOOR10_MODEL.disableThinking).toBe(true);
    });

    it('preserva a persona e desliga o thinking no template do Smol', () => {
        const prompt = prepareFloor10SystemPrompt('Você é Nilo Azevedo.');
        expect(prompt).toContain('/system_override');
        expect(prompt).toContain('/no_think');
        expect(prompt).toContain('Você é Nilo Azevedo.');
    });

    it('pede autocorreção ao próprio cérebro sem fornecer resposta pronta', () => {
        const prompt = buildFloor10CorrectionPrompt(
            'CONTEXTO RAG PARA O MODELO',
            'contradição com o cânone',
        );
        expect(prompt).toContain('CONTEXTO RAG PARA O MODELO');
        expect(prompt).toContain('contradição com o cânone');
        expect(prompt).toContain('Nenhuma resposta pronta é fornecida');
    });

    it('usa os nomes OpenAI-compatible aceitos pela API v3', () => {
        expect(CHAT_COMPLETION_CONFIG).toMatchObject({
            stream: true,
            max_tokens: 96,
            temperature: 0.45,
            top_p: 0.85,
            top_k: 40,
            cache_prompt: true,
            // Sem isto um modelo pequeno pode entrar em loop e a fala reprovada dispara uma
            // segunda geração completa, dobrando a espera.
            penalty_repeat: 1.15,
            penalty_last_n: 256,
        });
        expect(CHAT_COMPLETION_CONFIG).not.toHaveProperty('nPredict');
        expect(CHAT_COMPLETION_CONFIG).not.toHaveProperty('sampling');
    });

    it('mostra a velocidade MEDIDA pelo motor, não uma estimativa', () => {
        expect(formatTimings({
            prompt_n: 337,
            prompt_per_second: 12.4,
            predicted_per_second: 3.2,
        })).toBe('leitura 12 tok/s · fala 3 tok/s · 337 lidos');
        expect(formatTimings(null)).toBe('');
        expect(formatTimings({})).toBe('');
    });

    it('não transforma um cache PERFEITO no pior número da tela', () => {
        // O caso real medido no navegador: 376 dos 380 tokens vieram do KV
        // guardado, sobraram 4 para ler, e a divisão pelo custo fixo da chamada
        // dava "leitura 2 tok/s". Foi esse número que fez o dono do jogo achar
        // que a leitura estava quebrada — quando ela tinha sido de graça.
        const quase_tudo_reusado = formatTimings({
            prompt_n: 4,
            cache_n: 376,
            prompt_per_second: 2.1,
            predicted_per_second: 2.4,
        });
        expect(quase_tudo_reusado).not.toContain('leitura');
        expect(quase_tudo_reusado).toContain('376 reaproveitados');
        expect(quase_tudo_reusado).toContain('fala 2 tok/s');
        // Com prompt de verdade para ler, a taxa volta — e o reaproveitamento
        // continua aparecendo, porque é ele que explica a diferença.
        const prompt_real = formatTimings({
            prompt_n: 380,
            cache_n: 0,
            prompt_per_second: 3.2,
            predicted_per_second: 2.2,
        });
        expect(prompt_real).toContain('leitura 3 tok/s');
        expect(prompt_real).not.toContain('reaproveitados');
    });

    it('guarda o KV em 8 bits: +15% de fala medidos, sem mudar a resposta', () => {
        expect(CPU_LOAD_CONFIG.cache_type_k).toBe('q8_0');
        expect(CPU_LOAD_CONFIG.cache_type_v).toBe('q8_0');
        // flash_attn foi medido e deu 0,99× nesta build WASM. Ligar um botão
        // que não paga nada só adiciona risco.
        expect(CPU_LOAD_CONFIG).not.toHaveProperty('flash_attn');
    });

    it('extrai texto do streaming OpenAI choices[0].delta.content', () => {
        expect(chunkDelta({
            choices: [{ delta: { content: 'Oi' } }],
        })).toBe('Oi');
        expect(chunkDelta({
            choices: [{ delta: { content: null } }],
        })).toBe('');
    });

    it('mantém compatibilidade defensiva com chunks antigos', () => {
        expect(chunkDelta({ piece: ' legado' })).toBe(' legado');
    });

    it('remove o raciocínio interno antes de exibir a resposta', () => {
        expect(visibleText('<think>pensando</think>  resposta')).toBe('resposta');
    });

    it('limita o contexto sem apagar a conversa exibida', () => {
        const history = ['1', '2', '3', '4', '5', '6', '7', '8'];
        expect(modelHistory(history)).toEqual(['3', '4', '5', '6', '7', '8']);
        expect(history).toHaveLength(8);
    });

    it('consome o stream OpenAI e publica somente o texto visível', async () => {
        async function* chunks() {
            yield { choices: [{ delta: { content: '<think>' } }] };
            yield { choices: [{ delta: { content: '</think> Oi' } }] };
            yield { choices: [{ delta: { content: ', tudo bem?' } }] };
        }
        const visible: string[] = [];
        const raw = await consumeChatStream(
            Promise.resolve(chunks()),
            (text) => visible.push(text),
            { firstTokenMs: 200, nextTokenMs: 200 },
        );
        expect(raw).toBe('<think></think> Oi, tudo bem?');
        expect(visible.at(-1)).toBe('Oi, tudo bem?');
    });

    it('não republica texto que não mudou — tokens ocultos custavam um render cada', async () => {
        // O <think> do template rende vários chunks sem UMA letra visível. Antes
        // cada um deles virava um npcSet idêntico ao anterior, e cada npcSet é um
        // re-render do painel na thread que desenha o jogo.
        const chunks = async function* () {
            yield { currentText: '<think>' };
            yield { currentText: '<think>hmm' };
            yield { currentText: '<think>hmm, ele quer saber' };
            yield { currentText: '<think>hmm, ele quer saber</think>' };
            yield { currentText: '<think>hmm, ele quer saber</think> Oi' };
            yield { currentText: '<think>hmm, ele quer saber</think> Oi.' };
        };
        const publicados: string[] = [];
        await consumeChatStream(
            Promise.resolve(chunks()),
            (text) => publicados.push(text),
            { firstTokenMs: 200, nextTokenMs: 200 },
        );
        // 6 chunks; só 3 estados visíveis distintos ('', 'Oi', 'Oi.').
        expect(publicados).toEqual(['', 'Oi', 'Oi.']);
    });

    it('o texto final sempre chega, mesmo publicando só as mudanças', async () => {
        const chunks = async function* () {
            yield { currentText: 'Oi' };
            yield { currentText: 'Oi' };
            yield { currentText: 'Oi, tudo bem?' };
        };
        const publicados: string[] = [];
        const raw = await consumeChatStream(
            Promise.resolve(chunks()),
            (text) => publicados.push(text),
            { firstTokenMs: 200, nextTokenMs: 200 },
        );
        expect(raw).toBe('Oi, tudo bem?');
        expect(publicados.at(-1)).toBe('Oi, tudo bem?');
        expect(publicados).toHaveLength(2);
    });

    it('interrompe um stream que não produz o primeiro token', async () => {
        const never: AsyncIterable<never> = {
            [Symbol.asyncIterator]() {
                return { next: () => new Promise(() => {}) };
            },
        };
        let timeoutStage = '';
        await expect(consumeChatStream(
            Promise.resolve(never),
            () => undefined,
            {
                firstTokenMs: 15,
                nextTokenMs: 15,
                onTimeout: (stage) => { timeoutStage = stage; },
            },
        )).rejects.toBeInstanceOf(GenerationTimeoutError);
        expect(timeoutStage).toBe('first-token');
    });

    it('não corta uma resposta longa enquanto os chunks continuam chegando', async () => {
        async function* slowChunks() {
            yield { choices: [{ delta: { content: 'Oi' } }] };
            await new Promise((resolve) => setTimeout(resolve, 20));
            yield { choices: [{ delta: { content: ', jogador' } }] };
            await new Promise((resolve) => setTimeout(resolve, 20));
            yield { choices: [{ delta: { content: '!' } }] };
        }
        const raw = await consumeChatStream(
            Promise.resolve(slowChunks()),
            () => undefined,
            { firstTokenMs: 100, nextTokenMs: 100 },
        );
        expect(raw).toBe('Oi, jogador!');
    });

    it('preserva a resposta parcial e identifica timeout após o texto começar', async () => {
        async function* partialThenStall() {
            yield { choices: [{ delta: { content: 'Ainda estou aqui' } }] };
            await new Promise(() => {});
        }
        let thrown: unknown;
        try {
            await consumeChatStream(
                Promise.resolve(partialThenStall()),
                () => undefined,
                { firstTokenMs: 100, nextTokenMs: 30 },
            );
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(GenerationTimeoutError);
        expect(thrown).toMatchObject({
            stage: 'next-token',
            hadVisibleText: true,
            partialText: 'Ainda estou aqui',
        });
    });

    it('preserva a fala própria dos olhos sem iniciar o 2B', async () => {
        npcSet({
            phase: 'ready',
            history: [],
            perception: perceiveFloor10({
                npcPosition: { x: 0, y: 0, z: 2.2 },
                npcYaw: Math.PI,
                playerPosition: { x: 0, y: 0, z: 0 },
            }),
            error: '',
        });
        await sendToNpc('Onde você está?');
        expect(npc.phase).toBe('ready');
        expect(npc.modelLabel).toContain('Olhos');
        expect(npc.history).toHaveLength(2);
        expect(npc.history[1]?.content).toContain('Estou no 10º andar');
    });

    it('preserva a fala própria da vontade sem iniciar o 2B', async () => {
        npcSet({
            phase: 'ready',
            history: [],
            autonomy: {
                ...INITIAL_FLOOR10_WILL,
                decisionId: 12,
                goal: 'inspect-elevator',
                label: 'examinar o elevador',
                reason: 'quero investigar a única saída visível',
            },
            error: '',
        });
        await sendToNpc('O que você quer fazer?');
        expect(npc.phase).toBe('ready');
        expect(npc.modelLabel).toContain('Vontade');
        expect(npc.history).toHaveLength(2);
        expect(npc.history[1]?.content).toContain('examinar o elevador');
    });

});

describe('npc/wllamaEngine — cão de guarda do WebGPU', () => {
    it('deixa o download demorar o quanto precisar', async () => {
        // Baixando: stalledMs devolve null, então o cronômetro nem começa.
        let done = false;
        const load = new Promise<void>((resolve) => {
            setTimeout(() => { done = true; resolve(); }, 60);
        });
        await expect(
            raceGpuInitWatchdog(load, () => null, 10, 5),
        ).resolves.toBeUndefined();
        expect(done).toBe(true);
    });

    it('reprova o plano quando a inicialização trava depois do download', async () => {
        // Download terminou há muito tempo e a carga nunca resolve: é o caso
        // medido nesta caixa (processo de GPU queimando CPU sem lançar erro).
        const nunca = new Promise<void>(() => { /* trava de propósito */ });
        await expect(
            raceGpuInitWatchdog(nunca, () => 50_000, 10, 5),
        ).rejects.toBeInstanceOf(WebGpuInitTimeoutError);
    });

    it('propaga a falha real do wllama sem mascarar de timeout', async () => {
        const boom = Promise.reject(new Error('sem VRAM'));
        await expect(
            raceGpuInitWatchdog(boom, () => null, 10, 5),
        ).rejects.toThrow('sem VRAM');
    });

    it('mede atividade para os runtimes que possuem heartbeat confiável', () => {
        expect(modelInitStalledMs(null, null, 50_000)).toBeNull();
        expect(modelInitStalledMs(1_000, null, 11_000)).toBe(10_000);
        expect(modelInitStalledMs(1_000, 10_500, 11_000)).toBe(500);
    });

    it('não inventa travamento só onde realmente não há heartbeat', () => {
        // Carga rápida: a cópia OPFS roda numa chamada síncrona e não pulsa.
        expect(modelInitWatchdogStalledMs(0, true, 1_000, 10_500, 500_000)).toBeNull();
        // CPU com leitura JSPI (normal E N-gram): cada bloco lido é um pulso.
        expect(modelInitWatchdogStalledMs(0, false, 1_000, 10_500, 11_000)).toBe(500);
        // GPU usa tempo total pós-download; logs não prolongam compilação ruim.
        expect(modelInitWatchdogStalledMs(2, false, 1_000, 10_500, 11_000)).toBe(10_000);
    });

    it('o N-gram ganha corda maior que a CPU normal, não corda infinita', () => {
        // A cauda silenciosa do N-gram monta contexto E especulador; ainda
        // assim é uma cauda com fim.
        expect(NGRAM_CPU_INIT_WATCHDOG_MS).toBeGreaterThan(CPU_INIT_WATCHDOG_MS);
        expect(NGRAM_CPU_INIT_WATCHDOG_MS).toBeLessThanOrEqual(300_000);
    });

    it('o teto da carga rápida não pode custar mais que a carga que funciona', () => {
        // Estourar o teto significa recomeçar do zero pela leitura JSPI. Se o
        // teto for maior que uma carga inteira, o recuo chega tarde demais para
        // ter valor — foi o que aconteceu com 900 s no aparelho.
        expect(NGRAM_CPU_INIT_HARD_LIMIT_MS).toBeLessThanOrEqual(NGRAM_CPU_INIT_WATCHDOG_MS);
    });

    it('liga diagnóstico nativo somente na rota de comparação', () => {
        expect(floor10ComparisonDiagnosticsEnabled('?comparacao')).toBe(true);
        expect(floor10ComparisonDiagnosticsEnabled('?foo=1&comparacao=1')).toBe(true);
        expect(floor10ComparisonDiagnosticsEnabled('?especulativa')).toBe(false);
        expect(floor10ComparisonDiagnosticsEnabled('?comparacaox')).toBe(false);
    });

    it('preserva a etapa nativa e resume o avanço da leitura do GGUF', () => {
        expect(stringifyModelLoadLog([
            'llama_model_loader:',
            { tensors: 123 },
            new Error('falhou'),
        ])).toBe('llama_model_loader: {"tensors":123} Error: falhou');
        expect(describeModelLoadActivity({
            stage: 'native-log',
            message: '  llama_context:   n_ctx = 1536  ',
        })).toBe('llama_context: n_ctx = 1536');
        expect(describeModelLoadActivity({
            stage: 'file-read',
            offset: 1_000_000_000,
            size: 100_000_000,
            total: 2_000_000_000,
        })).toBe('GGUF 1.10 GB de 2.00 GB');
        expect(describeModelLoadActivity({
            stage: 'opfs-mmap',
            offset: 1_000_000_000,
            size: 100_000_000,
            total: 2_000_000_000,
        })).toBe('GGUF 1.10 GB de 2.00 GB');
    });

    it('avisa do teto de 2 GiB antes de baixar à toa', () => {
        // Medido: granite-4.0-h-tiny (4,25 GB) e SmolLM3-Q8_0 (3,27 GB) morrem
        // os dois em "data is not within the file bounds". O SmolLM3 de hoje
        // (1,92 GB) passa — está a 89% do teto.
        expect(TETO_GGUF_BYTES).toBe(2_147_483_648);
        expect(excedeTetoDoGguf(SPEECH_MODEL_BYTES)).toBe('');
        expect(excedeTetoDoGguf(null)).toBe('');
        expect(excedeTetoDoGguf(4_254_815_392)).toContain('passa do teto');
        // Nada de mandar o jogador culpar o armazenamento por um limite do runtime.
        expect(excedeTetoDoGguf(4_254_815_392)).toContain('não falta de espaço');
    });

    it('as etapas anteriores ao modelo entram no relatório e na tela', () => {
        publicarEtapaDeCarga('buscando o runtime N-gram', 'buscando o runtime…');
        expect(npc.loadText).toBe('buscando o runtime…');
        expect(conversationModelLoadTrace().at(-1)).toContain('buscando o runtime N-gram');
    });

    it('mantém um teto absoluto mesmo se chegarem pulsos para sempre', async () => {
        const nunca = new Promise<void>(() => { /* trava de propósito */ });
        await expect(
            raceGpuInitWatchdog(
                nunca,
                () => 0,
                50_000,
                5,
                { elapsedMs: () => 50_000, limitMs: 10 },
            ),
        ).rejects.toBeInstanceOf(WebGpuInitTimeoutError);
    });

    it('só entra em ação depois do download, com folga de verdade', () => {
        expect(WEBGPU_INIT_WATCHDOG_MS).toBeGreaterThanOrEqual(30_000);
        expect(NGRAM_CPU_INIT_HARD_LIMIT_MS).toBeGreaterThan(CPU_INIT_WATCHDOG_MS);
    });

    it('o override manda mais que o gerente, para a sonda poder medir', () => {
        const alvo = globalThis as { __npcGpuLayers?: number };
        try {
            alvo.__npcGpuLayers = 12;
            expect(speechGpuLayerCount(true, 8)).toBe(12);
            alvo.__npcGpuLayers = 0;
            expect(speechGpuLayerCount(true, 8)).toBe(0);
        } finally {
            delete alvo.__npcGpuLayers;
        }
        // Sem override, quem decide é o gerente.
        expect(speechGpuLayerCount(true, 8)).toBe(FLOOR10_GPU_START_LAYERS);
    });
});

describe('npc/wllamaEngine — restos da geração anterior no início do stream', () => {
    const abre = (content: string | null = null) => ({
        choices: [{ delta: { role: 'assistant', content } }],
    });
    const pedaco = (content: string) => ({ choices: [{ delta: { content } }] });

    it('reconhece o pedaço que abre uma resposta', () => {
        expect(chunkOpensReply(abre())).toBe(true);
        expect(chunkOpensReply(pedaco('oi'))).toBe(false);
        expect(chunkOpensReply({})).toBe(false);
    });

    it('descarta a cauda da rodada anterior — sequência REAL capturada', async () => {
        // Vista crua na sala da mente: um content solto e o "stop" da rodada
        // passada chegam ANTES da abertura desta. Sem descartar, o texto saía
        // "OSE: idleCHO" em vez de "CHOICE: approach-player".
        async function* chunks() {
            yield pedaco('\n');
            yield { choices: [{ finish_reason: 'stop', delta: {} }] };
            yield abre();
            yield pedaco('CHO');
            yield pedaco('ICE');
            yield pedaco(':');
            yield pedaco(' approach');
            yield pedaco('-player');
        }
        const raw = await consumeChatStream(
            Promise.resolve(chunks() as never),
            () => undefined,
            { firstTokenMs: 5_000, nextTokenMs: 5_000 },
        );
        expect(raw).toBe('CHOICE: approach-player');
        expect(raw).not.toContain('\n');
    });

    it('não estraga um stream limpo, que abre já no primeiro pedaço', async () => {
        async function* chunks() {
            yield abre();
            yield pedaco('Meu nome é Nilo.');
        }
        await expect(consumeChatStream(
            Promise.resolve(chunks() as never),
            () => undefined,
            { firstTokenMs: 5_000, nextTokenMs: 5_000 },
        )).resolves.toBe('Meu nome é Nilo.');
    });

    it('limpa também o texto JÁ MOSTRADO, senão a fala velha pisca na tela', async () => {
        async function* chunks() {
            yield pedaco('resto velho');
            yield abre();
            yield pedaco('fala nova');
        }
        const vistos: string[] = [];
        await consumeChatStream(
            Promise.resolve(chunks() as never),
            (t) => vistos.push(t),
            { firstTokenMs: 5_000, nextTokenMs: 5_000 },
        );
        expect(vistos.at(-1)).toBe('fala nova');
        expect(vistos).toContain('');
    });
});

describe('divisaoDaEspera — a conta que decide onde vale otimizar', () => {
    it('separa leitura de fala a partir do que o motor mediu', async () => {
        const { divisaoDaEspera } = await import('../npc/wllamaEngine');
        // Caso realista de celular: 600 tokens de prompt lidos a 20 tok/s (30s
        // de LEITURA) e fala a 2,5 tok/s. Aqui encolher o prompt vale ouro.
        expect(divisaoDaEspera({
            prompt_n: 600,
            prompt_per_second: 20,
            predicted_per_second: 2.5,
            cache_n: 120,
        })).toEqual({
            lidos: 600,
            reusados: 120,
            leitura_s: 30,
            leitura_tps: 20,
            fala_tps: 2.5,
        });
    });

    it('prompt inteiro reaproveitado: não há leitura para cobrar', async () => {
        const { divisaoDaEspera } = await import('../npc/wllamaEngine');
        expect(divisaoDaEspera({ prompt_n: 0, cache_n: 700, predicted_per_second: 2.4 }))
            .toEqual({ reusados: 700, fala_tps: 2.4 });
    });

    it('sem medição, não inventa número', async () => {
        const { divisaoDaEspera } = await import('../npc/wllamaEngine');
        expect(divisaoDaEspera(null)).toEqual({});
        expect(divisaoDaEspera({})).toEqual({});
    });
});

describe('o reflexo não pode gerar junto com a fala', () => {
    // O arquivo já jurava, em comentário: "Nunca, em hipótese alguma, gera ao
    // mesmo tempo que a fala: foi assim que o celular desligou sozinho." O
    // código fazia `void reagir(text)` e SEGUIA na mesma hora — 135M em ONNX e
    // 3B em llama.cpp gerando juntos, com os dois pools de threads abertos.
    //
    // O teto de 2,5s do reagir não salvava: `Promise.race` faz o JavaScript
    // parar de esperar, não o ONNX parar de trabalhar. Mesmo engano do
    // abortSignal do wllama, no outro motor.
    it('o reflexo é esperado antes de a fala começar', () => {
        const fonte = readFileSync(
            new URL('../npc/wllamaEngine.ts', import.meta.url),
            'utf8',
        );
        const trecho = fonte.slice(fonte.indexOf('if (reflexoJaCarregado()) {'));
        const chamada = trecho.slice(0, trecho.indexOf('npcSet({ reflexo'));
        expect(chamada).toContain('await reagir(text)');
        expect(chamada).not.toContain('void reagir(');
    });

    it('o reflexo roda com UMA thread, não com o aparelho inteiro', async () => {
        // `env.backends` estava declarado no tipo e nunca configurado: sem
        // isso o onnxruntime-web abre `navigator.hardwareConcurrency` threads.
        const { REFLEXO_THREADS } = await import('../npc/floor10Reflexo');
        expect(REFLEXO_THREADS).toBe(1);
        const fonte = readFileSync(
            new URL('../npc/floor10Reflexo.ts', import.meta.url),
            'utf8',
        );
        expect(fonte).toContain('numThreads = REFLEXO_THREADS');
        // UMA thread não basta: com numThreads 1 o onnxruntime-web usa a build
        // single-thread, que roda na thread principal. Medido no emulador, um
        // buraco de 6.016ms entre dois quadros. `proxy` move para um Worker sem
        // mexer no orçamento de CPU.
        expect(fonte).toContain('.proxy = true');
    });
});

describe('a etiqueta de leitura não pode assustar com o melhor caso', () => {
    // Do aparelho, hoje: "leitura 2 tok/s · 273 reaproveitados · 321 lidos".
    // O piso de 24 tokens existia justamente para esconder esse artefato, mas
    // contava `lidos`, que INCLUI o cache. 321 passava, a etiqueta aparecia, e
    // a taxa era o custo fixo da chamada dividido por 48 tokens reais.
    it('esconde a taxa quando quase tudo veio do cache', () => {
        const txt = formatTimings({
            prompt_n: 321, cache_n: 273, prompt_per_second: 2, predicted_per_second: 2,
        } as never);
        expect(txt).not.toContain('leitura');
        // O que importa continua na tela: o trabalho economizado.
        expect(txt).toContain('273 reaproveitados');
        expect(txt).toContain('fala 2 tok/s');
    });

    it('mostra a taxa quando houve prompt de verdade para ler', () => {
        const txt = formatTimings({
            prompt_n: 321, cache_n: 0, prompt_per_second: 6, predicted_per_second: 3,
        } as never);
        expect(txt).toContain('leitura 6 tok/s');
    });
});
