import { describe, expect, it } from 'vitest';
import {
    setSmallBrain,
    SMALL_BRAIN_CATALOG,
    SMALL_BRAIN_COMPLETION_CONFIG,
    SMALL_BRAIN_EXTRACT_CONFIG,
    SMALL_BRAIN_LOAD_CONFIG,
    SMALL_BRAIN_MODEL,
    SMALL_BRAIN_THREADS,
    SMALL_BRAIN_THINK_TOKENS,
    smallBrainThreads,
    raceWithAbort,
    readCompletionText,
} from '../npc/floor10SmallBrain';
import { Floor10WillBrain } from '../npc/floor10Will';
import { perceiveFloor10 } from '../npc/floor10Perception';
import {
    DELIBERATION_EXTRACT_TAIL,
    DELIBERATION_EXTRACT_TOKENS,
    DELIBERATION_GRAMMAR,
    buildChoiceExtractionPrompt,
    parseDeliberation,
} from '../npc/floor10Deliberation';

const PERCEPTION = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: 0,
    playerPosition: null,
});

describe('npc/floor10SmallBrain — o cérebro pequeno da deliberação', () => {
    it('começa no Gemma 3 1B, que foi o medido no prompt real do Nilo', () => {
        // Os três do catálogo rodaram o MESMO prompt de deliberação, nos mesmos
        // 8 cenários do andar, no mesmo llama.cpp. O MiniCPM assinou escolha em
        // 0 de 16 rodadas e gastou os 320 tokens discutindo o enunciado; o
        // Gemma assinou em 16 de 16, em 7,6s por rodada, falando em 1ª pessoa.
        expect(SMALL_BRAIN_MODEL.label).toBe('Gemma 3 1B');
        expect(SMALL_BRAIN_MODEL.url).toMatch(/\.gguf$/i);
        expect(SMALL_BRAIN_MODEL.id).toBe('gemma3-1b');
    });

    it('o catálogo continua oferecendo o antigo, para o dono do jogo comparar', () => {
        const ids = SMALL_BRAIN_CATALOG.map((m) => m.id);
        expect(ids).toContain('minicpm5-1b');
        expect(ids).toContain('llama32-1b');
        for (const m of SMALL_BRAIN_CATALOG) {
            expect(m.url).toMatch(/^https:\/\/huggingface\.co\/.*\.gguf$/);
            // Dois modelos de 800 MB vivos ao mesmo tempo é como o aparelho
            // trava; nenhum candidato pode ser gordo.
            expect(m.bytes).toBeLessThan(1_100_000_000);
        }
    });

    it('trocar para um id desconhecido não mexe em nada', async () => {
        const antes = SMALL_BRAIN_MODEL.id;
        await setSmallBrain('nao-existe' as never);
        expect(SMALL_BRAIN_MODEL.id).toBe(antes);
    });

    it('cede a CPU para a fala: no máximo dois núcleos', () => {
        expect(SMALL_BRAIN_COMPLETION_CONFIG.max_tokens).toBe(SMALL_BRAIN_THINK_TOKENS);
        // Eu já subi isto para "metade das threads da fala" e voltei: no celular
        // do Felipe virou 8 + 4 = 12 threads em 8 núcleos, e a conversa travou
        // em "liberando a CPU". A deliberação roda em segundo plano num ciclo de
        // 60s e ninguém espera por ela; a fala do jogador, sim.
        expect(smallBrainThreads()).toBeLessThanOrEqual(SMALL_BRAIN_THREADS);
        expect(smallBrainThreads()).toBeGreaterThanOrEqual(1);
        expect(SMALL_BRAIN_THREADS).toBe(2);
        expect(SMALL_BRAIN_LOAD_CONFIG.n_ctx).toBe(2048);
        expect(SMALL_BRAIN_LOAD_CONFIG.n_batch).toBe(256);
        expect(SMALL_BRAIN_LOAD_CONFIG.n_gpu_layers).toBe(0);
        // O Nilo PENSA — decisão do dono do jogo. Quem impede o loop eterno é o
        // teto de tokens, não a mordaça.
        expect(SMALL_BRAIN_LOAD_CONFIG.default_template_kwargs).toEqual({
            enable_thinking: true,
        });
        expect(SMALL_BRAIN_COMPLETION_CONFIG.chat_template_kwargs).toEqual({
            enable_thinking: true,
        });
        expect(SMALL_BRAIN_COMPLETION_CONFIG).not.toHaveProperty('grammar');
        expect(SMALL_BRAIN_COMPLETION_CONFIG.cache_prompt).toBe(true);
    });

    it('guarda a gramática para a SEGUNDA passada, nunca para o pensamento', () => {
        // A primeira passada é livre (é onde ele pensa). A gramática só entra
        // depois, para não perder um raciocínio bom por causa de formatação —
        // 1B erra formato ~90% das vezes sem restrição e ~6% com ela.
        expect(SMALL_BRAIN_COMPLETION_CONFIG).not.toHaveProperty('grammar');
        expect(SMALL_BRAIN_EXTRACT_CONFIG.grammar).toBe(DELIBERATION_GRAMMAR);
        expect(SMALL_BRAIN_EXTRACT_CONFIG.max_tokens).toBe(DELIBERATION_EXTRACT_TOKENS);
        expect(SMALL_BRAIN_EXTRACT_CONFIG.max_tokens).toBeLessThan(SMALL_BRAIN_THINK_TOKENS / 10);
        expect(SMALL_BRAIN_EXTRACT_CONFIG.temperature).toBe(0);
    });

    it('o resgate relê o próprio raciocínio e pede só a linha final', () => {
        const pensamento = 'The player is close. I want to say something.';
        const prompt = buildChoiceExtractionPrompt(pensamento);
        expect(prompt).toContain(pensamento);
        expect(prompt).toContain('talk-player');
        // Cauda limitada: um raciocínio longo não pode estourar o contexto.
        const longo = 'x'.repeat(5000);
        expect(buildChoiceExtractionPrompt(longo).length)
            .toBeLessThan(DELIBERATION_EXTRACT_TAIL + 400);
    });

    it('a assinatura do resgate vira decisão sem apagar a justificativa', () => {
        const pensamento = 'He has been quiet for a while. I feel like talking.';
        // Sozinho o raciocínio não decide nada…
        expect(parseDeliberation(pensamento, 0)).toBeNull();
        // …com a assinatura anexada, decide — e a razão continua sendo a dele.
        const decidido = parseDeliberation(`${pensamento}\nCHOICE: talk-player`, 7);
        expect(decidido?.goal).toBe('talk-player');
        expect(decidido?.rationale).toContain('quiet');
        expect(decidido?.at).toBe(7);
    });

    it('lê o texto nos formatos que o wllama devolve', () => {
        expect(readCompletionText({ choices: [{ message: { content: 'CHOICE: idle' } }] }))
            .toBe('CHOICE: idle');
        expect(readCompletionText({ choices: [{ text: 'CHOICE: wander' }] }))
            .toBe('CHOICE: wander');
        expect(readCompletionText('cru')).toBe('cru');
        expect(readCompletionText(null)).toBe('');
        expect(readCompletionText({})).toBe('');
    });

    it('cancela imediatamente uma etapa de carga que nunca termina', async () => {
        const controller = new AbortController();
        const pendingForever = new Promise<string>(() => undefined);
        const result = raceWithAbort(pendingForever, controller.signal);
        controller.abort();
        await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    });
});

describe('a deliberação inclina o reflexo sem sequestrá-lo', () => {
    const tickFor = (deliberationRaw: string | null) => {
        const brain = new Floor10WillBrain();
        const deliberation = deliberationRaw ? parseDeliberation(deliberationRaw, 0) : null;
        let last = '';
        // Alguns ticks para a vontade assentar.
        for (let i = 0; i < 40; i += 1) {
            const tick = brain.tick({
                dt: 0.1,
                time: i * 0.1,
                perception: PERCEPTION,
                npcPosition: { x: 0, y: 0, z: 2.2 },
                conversationOpen: false,
                speaking: false,
                deliberation,
            });
            last = tick.snapshot.goal;
        }
        return last;
    };

    it('aceita a meta deliberada quando ela chega', () => {
        // Sem deliberação o reflexo decide sozinho; com ela, a meta escolhida
        // ganha peso suficiente para aparecer.
        const semDeliberacao = tickFor(null);
        const comDeliberacao = tickFor('[End thinking]\nCHOICE: inspect-elevator');
        expect(typeof semDeliberacao).toBe('string');
        expect(comDeliberacao).toBe('inspect-elevator');
    });

    it('não quebra quando o cérebro pequeno não assina escolha', () => {
        expect(() => tickFor('ainda pensando, sem decisão')).not.toThrow();
    });
});

describe('a conversa tem prioridade absoluta sobre a deliberação', () => {
    it('não delibera enquanto o 3B está respondendo', async () => {
        const { deliberateFloor10, resetSmallBrainForTests } = await import('../npc/floor10SmallBrain');
        const { npcSet } = await import('../npc/npcStore');
        resetSmallBrainForTests();
        // Jogador conversando: a deliberação precisa desistir sem tocar na CPU.
        npcSet({ open: true, phase: 'thinking' });
        const decided = await deliberateFloor10({
            perception: PERCEPTION,
            drives: { social: 0.5, curiosity: 0.5, restlessness: 0.5, fatigue: 0.1 },
            memory: { inspectedElevatorCount: 0, sleeps: 0, playerSilentSeconds: 0, lastGoals: [] },
            now: 0,
        });
        expect(decided).toBeNull();
        npcSet({ open: false, phase: 'cold' });
    });

    it('abortDeliberation devolve a fase para repouso', async () => {
        const { abortDeliberation } = await import('../npc/floor10SmallBrain');
        const { npc, npcSet } = await import('../npc/npcStore');
        npcSet({
            deliberationPhase: 'loading',
            deliberationLoadProgress: 0.42,
            deliberationLoadText: 'baixando MiniCPM5-1B… 42%',
        });
        abortDeliberation();
        expect(npc.deliberationPhase).toBe('off');
        expect(npc.deliberationLoadProgress).toBe(0.42);
        expect(npc.deliberationLoadText).toContain('interrompido');
    });
});

describe('descarga explícita do cérebro pequeno', () => {
    it('unloadSmallBrain devolve a fase para repouso e libera o motor', async () => {
        const { unloadSmallBrain } = await import('../npc/floor10SmallBrain');
        const { npc, npcSet } = await import('../npc/npcStore');
        npcSet({ deliberationPhase: 'thinking' });
        await unloadSmallBrain();
        expect(npc.deliberationPhase).toBe('off');
    });

    it('descarregar duas vezes seguidas não quebra', async () => {
        const { unloadSmallBrain } = await import('../npc/floor10SmallBrain');
        await unloadSmallBrain();
        await expect(unloadSmallBrain()).resolves.toBeUndefined();
    });
});
