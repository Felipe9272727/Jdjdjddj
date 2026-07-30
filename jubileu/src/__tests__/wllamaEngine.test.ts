import { describe, expect, it } from 'vitest';
import {
    CHAT_COMPLETION_CONFIG,
    CPU_LOAD_CONFIG,
    FLOOR10_MODEL,
    GenerationTimeoutError,
    SPEECH_WEBGPU_ENABLED,
    WEBGPU_INIT_WATCHDOG_MS,
    WLLAMA_PATHS,
    WebGpuInitTimeoutError,
    raceGpuInitWatchdog,
    buildFloor10CorrectionPrompt,
    chunkDelta,
    chunkOpensReply,
    consumeChatStream,
    effectiveChatFinishReason,
    cpuThreadCount,
    formatTimings,
    modelHistory,
    prepareFloor10SystemPrompt,
    sendToNpc,
    speechGpuLayerCount,
    speechRuntimeLabel,
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
            jinja: true,
            reasoning: false,
            default_template_kwargs: { enable_thinking: false },
            warmup: true,
        });
    });

    it('usa todos os núcleos, até oito — medido no aparelho, não suposto', () => {
        expect(cpuThreadCount(false, 12)).toBe(1);
        expect(cpuThreadCount(true, 2)).toBe(2);
        expect(cpuThreadCount(true, 4)).toBe(4);
        // O Felipe mediu de 1 a 8 no celular dele e 8 ganhou. A folga que eu
        // reservava "para o render" só estava deixando o jogador esperando.
        expect(cpuThreadCount(true, 8)).toBe(8);
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
        expect(cpuThreadCount(true, 8)).toBe(8);
    });

    it('roda em CPU: nenhum aparelho recebe offload de WebGPU', () => {
        // O dono do jogo testou no aparelho dele: com WebGPU o celular engasga,
        // pela CPU roda liso. Nem memória de sobra reabre essa porta.
        expect(SPEECH_WEBGPU_ENABLED).toBe(false);
        expect(speechGpuLayerCount(false, 12)).toBe(0);
        expect(speechGpuLayerCount(true, 4)).toBe(0);
        expect(speechGpuLayerCount(true, 6)).toBe(0);
        expect(speechGpuLayerCount(true, 8)).toBe(0);
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
        })).toBe('leitura 12 tok/s · fala 3 tok/s · 337 tokens lidos');
        expect(formatTimings(null)).toBe('');
        expect(formatTimings({})).toBe('');
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
            yield {
                choices: [{ delta: {}, finish_reason: 'stop' }],
                usage: { completion_tokens: 4 },
            };
        }
        const visible: string[] = [];
        const result = await consumeChatStream(
            Promise.resolve(chunks()),
            (text) => visible.push(text),
            { firstTokenMs: 200, nextTokenMs: 200 },
        );
        expect(result).toEqual({
            rawText: '<think></think> Oi, tudo bem?',
            finishReason: 'stop',
            completionTokens: 4,
        });
        expect(visible.at(-1)).toBe('Oi, tudo bem?');
    });

    it('deduz corte pelo teto quando o wllama omite finish_reason', () => {
        expect(effectiveChatFinishReason({
            rawText: 'Ainda estou',
            finishReason: null,
            completionTokens: 96,
        })).toBe('length');
        expect(effectiveChatFinishReason({
            rawText: 'Não',
            finishReason: null,
            completionTokens: 2,
        })).toBeNull();
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
        const result = await consumeChatStream(
            Promise.resolve(slowChunks()),
            () => undefined,
            { firstTokenMs: 100, nextTokenMs: 100 },
        );
        expect(result.rawText).toBe('Oi, jogador!');
        expect(result.finishReason).toBeNull();
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

    it('só entra em ação depois do download, com folga de verdade', () => {
        expect(WEBGPU_INIT_WATCHDOG_MS).toBeGreaterThanOrEqual(30_000);
    });

    it('deixa religar a GPU por override, só para medir', () => {
        const alvo = globalThis as { __npcGpuLayers?: number };
        try {
            alvo.__npcGpuLayers = 12;
            expect(speechGpuLayerCount(true, 8)).toBe(12);
        } finally {
            delete alvo.__npcGpuLayers;
        }
        // Fora da medição, volta a ser CPU pura.
        expect(speechGpuLayerCount(true, 8)).toBe(0);
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
        const result = await consumeChatStream(
            Promise.resolve(chunks() as never),
            () => undefined,
            { firstTokenMs: 5_000, nextTokenMs: 5_000 },
        );
        expect(result.rawText).toBe('CHOICE: approach-player');
        expect(result.rawText).not.toContain('\n');
        expect(result.finishReason).toBeNull();
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
        )).resolves.toMatchObject({ rawText: 'Meu nome é Nilo.' });
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

    it('registra o motivo final somente da resposta atual', async () => {
        async function* chunks() {
            yield pedaco('cauda velha');
            yield { choices: [{ finish_reason: 'stop', delta: {} }] };
            yield abre();
            yield pedaco('Ainda estou tentando');
            yield {
                choices: [{ finish_reason: 'length', delta: {} }],
                timings: { predicted_n: 96 },
            };
        }
        await expect(consumeChatStream(
            Promise.resolve(chunks() as never),
            () => undefined,
            { firstTokenMs: 5_000, nextTokenMs: 5_000 },
        )).resolves.toEqual({
            rawText: 'Ainda estou tentando',
            finishReason: 'length',
            completionTokens: 96,
        });
    });
});
