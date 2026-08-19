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
    escolhaAssinada,
    raceWithAbort,
    readCompletionText,
    REMENDO_MAX_TOKENS,
    REMENDO_TIMEOUT_MS,
} from '../npc/floor10SmallBrain';
import { MAX_SPEECH_THREADS } from '../npc/wllamaEngine';
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
    it('começa no LFM2.5 — escolha de quem joga, não da minha planilha', () => {
        // A regra deste teste nunca foi "é este modelo": é "o padrão é o que o
        // DONO do jogo escolheu, e não o que a minha medição preferiu". Já
        // guardou o Llama contra o Gemma (que ganhava nos meus 8 cenários e
        // perdia jogando: repetia a mesma abertura e usava 4 das 8 metas).
        // Agora guarda o LFM2.5, que ele mandou pôr no lugar do Llama depois de
        // ver 15/15 contra 4/10 de assinatura e 1,45x por decisão.
        // Todos continuam no catálogo, e `?vontade=<id>` troca sem código.
        expect(SMALL_BRAIN_MODEL.label).toContain('LFM2.5');
        expect(SMALL_BRAIN_MODEL.url).toMatch(/\.gguf$/i);
        expect(SMALL_BRAIN_MODEL.id).toBe('lfm2-1b');
    });

    it('o catálogo continua oferecendo o antigo, para o dono do jogo comparar', () => {
        const ids = SMALL_BRAIN_CATALOG.map((m) => m.id);
        expect(ids).toContain('minicpm5-1b');
        expect(ids).toContain('gemma3-1b');
        // A MESMA cabeça em Q4, para quem não tem cota para o Q8.
        expect(ids).toContain('llama32-1b-q4');
        for (const m of SMALL_BRAIN_CATALOG) {
            expect(m.url).toMatch(/^https:\/\/huggingface\.co\/.*\.gguf$/);
            // Dois modelos de 800 MB vivos ao mesmo tempo é como o aparelho
            // trava; nenhum candidato pode ser gordo.
            expect(m.bytes).toBeLessThan(1_400_000_000);
        }
    });

    it('trocar para um id desconhecido não mexe em nada', async () => {
        const antes = SMALL_BRAIN_MODEL.id;
        await setSmallBrain('nao-existe' as never);
        expect(SMALL_BRAIN_MODEL.id).toBe(antes);
    });

    it('a vontade usa o teto da fala: ela roda SOZINHA', () => {
        // Cortei para 2 e o dono do jogo corrigiu: "a vontade tem que ser mais
        // RÁPIDA que a mente". Ela pensa quando o jogador não está no chat —
        // sozinha no aparelho. O "2 pra vontade" dele contava MODELOS de pé
        // (llama 1b + motor), não threads; eu confundi as duas coisas.
        expect(SMALL_BRAIN_THREADS).toBe(8);
        expect(smallBrainThreads()).toBeLessThanOrEqual(SMALL_BRAIN_THREADS);
        expect(smallBrainThreads()).toBeGreaterThanOrEqual(1);
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

describe('ceder a vez não é falhar — o castigo de 5 minutos que não fazia sentido', () => {
    it('marca DESISTÊNCIA quando a conversa tem prioridade', async () => {
        const { deliberateFloor10, deliberationYieldedTurn, resetSmallBrainForTests } =
            await import('../npc/floor10SmallBrain');
        const { npcSet } = await import('../npc/npcStore');
        resetSmallBrainForTests();
        // Enquanto o modelo de fala baixa, isto acontece a cada 5 segundos —
        // por minutos, no celular. O jogo contava cada uma como fracasso e
        // dobrava a espera até o teto de 300s. Quando a CPU enfim liberava, o
        // cérebro de vontade estava de castigo sem nunca ter tentado nada.
        npcSet({ open: true, phase: 'loading' });
        expect(await deliberateFloor10({
            perception: PERCEPTION,
            drives: { social: 0.5, curiosity: 0.5, restlessness: 0.5, fatigue: 0.1 },
            memory: { inspectedElevatorCount: 0, sleeps: 0, playerSilentSeconds: 0, lastGoals: [] },
            now: 0,
        })).toBeNull();
        expect(deliberationYieldedTurn()).toBe(true);
        npcSet({ open: false, phase: 'cold' });
    });

    it('a espera só cresce em fracasso de verdade', async () => {
        const { deliberationRetryDelay } = await import('../npc/floor10Deliberation');
        // A curva em si continua certa: rápido no começo, com teto.
        expect(deliberationRetryDelay(1)).toBe(5);
        expect(deliberationRetryDelay(20)).toBeLessThanOrEqual(300);
        // O que estava errado era CONTAR desistência como fracasso, não a curva.
        expect(deliberationRetryDelay(9)).toBeGreaterThan(deliberationRetryDelay(3));
    });
});

describe('pisar no andar NÃO pode disparar 1,32 GB de download', () => {
    it('a deliberação automática usa o cérebro, mas nunca manda baixar', async () => {
        const { deliberateFloor10, deliberationYieldedTurn, vontadeJaCarregada,
            resetSmallBrainForTests } = await import('../npc/floor10SmallBrain');
        const { npcSet } = await import('../npc/npcStore');
        resetSmallBrainForTests();
        npcSet({ open: false, phase: 'cold' });
        // O laço de deliberação roda assim que o NPC nasce no andar. Antes ele
        // chamava o carregador, e pisar no 10º baixava 1,32 GB sem ninguém
        // pedir — competindo com a fala e com a própria fila de pré-carga.
        expect(vontadeJaCarregada()).toBe(false);
        const decidido = await deliberateFloor10({
            perception: PERCEPTION,
            drives: { social: 0.5, curiosity: 0.5, restlessness: 0.5, fatigue: 0.1 },
            memory: { inspectedElevatorCount: 0, sleeps: 0, playerSilentSeconds: 0, lastGoals: [] },
            now: 0,
        });
        expect(decidido).toBeNull();
        // E desistir assim é CEDER A VEZ, não fracassar: contar como fracasso
        // faria a espera crescer até o teto por um download que ninguém pediu.
        expect(deliberationYieldedTurn()).toBe(true);
        // O carregador continua intocado — nenhum byte foi pedido.
        expect(vontadeJaCarregada()).toBe(false);
    });
});

describe('npc/floor10SmallBrain — a rodada acaba quando ele assina', () => {
    it('reconhece a escolha completa, e só depois de terminada', () => {
        // "approach" é prefixo de "approach-player": parar cedo demais trocaria
        // a decisão por outra, que é pior do que esperar mais dois tokens.
        expect(escolhaAssinada('penso...\nCHOICE: approach')).toBe(false);
        expect(escolhaAssinada('penso...\nCHOICE: approach-player\n')).toBe(true);
        expect(escolhaAssinada('penso...\nCHOICE: idle\n')).toBe(true);
    });

    it('não confunde a palavra CHOICE no meio do pensamento', () => {
        expect(escolhaAssinada('a escolha (CHOICE) ainda não foi feita')).toBe(false);
        // O eco do enunciado DENTRO de uma frase não encerra a rodada: se
        // encerrasse, a decisão do Nilo viraria a instrução que ele releu.
        expect(escolhaAssinada('devo terminar com CHOICE: idle no fim')).toBe(false);
        expect(escolhaAssinada('nada aqui')).toBe(false);
        expect(escolhaAssinada('')).toBe(false);
    });
});

// ── O REVISOR QUE NUNCA TEVE CHANCE ───────────────────────────────────────
//
// Relato, diante da tela: *"o revisor até foi acionado (tanto que parece que
// ele pensou) mas ele simplesmente decide não mudar — será um bug, ou uma
// escolha?"*. Bug, e o relógio já dizia: 45,6 s e 30,6 s com o teto em 25 s.
// Uma guarda recusando custa 0,0 s.
//
// MEDIDO no navegador com o LFM2.5-1.2B de produção (`revisor-pensa.mjs`),
// mesmo código, mudando só o prazo:
//
//     corte em 25 s .......... 0/3 consertou · 3 VAZIOS · 26,1 s por frase
//     prazo de sobra ......... 2/3 consertou · 0 vazios · 30,6 s por frase
//
// A chamada custa ~30 s e o corte caía aos 25. Ele nunca entregou nada.
describe('o prazo do remendo cabe uma chamada inteira', () => {
    it('não pode voltar para baixo de um minuto', () => {
        // 30,6 s NESTA bancada; o celular do dono do jogo é mais lento. E cortar
        // não devolve tempo: `abortSignal` só é conferido entre leituras de
        // resultado, e um corte aos 8 s levou 37,9 s para voltar — vazio.
        expect(REMENDO_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    });

    it('e o teto de tokens fica em 40, que é o que o aparelho sente', () => {
        // O `abort` do wllama 3.5.1 não devolve CPU: ele só faz o JS parar de
        // ler, e o worker segue gerando. `max_tokens` é o único número aqui que
        // o aparelho obedece — e sete frases medidas fecharam entre 15 e 30
        // tokens, com uma não fechando dentro de 32.
        expect(REMENDO_MAX_TOKENS).toBeGreaterThanOrEqual(40);
    });
});
