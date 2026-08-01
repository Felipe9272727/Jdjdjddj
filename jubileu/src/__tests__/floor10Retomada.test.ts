// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR:
//
//   "depois de eu mandar mensagem, o llama 1b não volta a pensar"
//
// Ele apareceu quando a pausa passou a ENCERRAR o worker (que é o que devolve
// CPU e parou de travar o celular). Encerrar o runtime é certo; o que faltava
// era garantir que a rodada seguinte consiga reabri-lo. Nenhum teste montava a
// sequência inteira — carregar, gerar, preemptar, tentar de novo — e é
// exatamente nela que o defeito mora.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PASTA_FAKE = pathToFileURL(
    path.join(import.meta.dirname, 'fakeWllama'),
).href;

type Controle = {
    construidos: number;
    geracoes: number;
    encerrados: number;
    prompts: string[];
    tokens: string[];
    atrasoMs: number;
    reset(): void;
};

type SmallBrain = typeof import('../npc/floor10SmallBrain');
type Store = typeof import('../npc/npcStore');
type Pausa = typeof import('../npc/floor10Pausa');
type Perception = typeof import('../npc/floor10Perception');

let controle: Controle;
let brain: SmallBrain;
let store: Store;
let pausa: Pausa;
let perception: Perception;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera uma condição por até `teto` ms — o stream é assíncrono de verdade. */
async function ate(condicao: () => boolean, teto = 2_000): Promise<boolean> {
    const fim = Date.now() + teto;
    while (Date.now() < fim) {
        if (condicao()) return true;
        await espera(5);
    }
    return condicao();
}

beforeAll(async () => {
    // O aparelho falso: armazenamento com espaço de sobra e 8 núcleos.
    // `navigator` no Node só tem getter: define-se a propriedade, não se atribui.
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            hardwareConcurrency: 8,
            storage: {
                getDirectory: async () => ({}),
                estimate: async () => ({ quota: 12e9, usage: 1e9 }),
                persist: async () => true,
                persisted: async () => true,
            },
        },
    });
    (globalThis as Record<string, unknown>).__wllamaCdn = PASTA_FAKE;
    (globalThis as Record<string, unknown>).__smallBrainModelUrl = 'https://exemplo/fake-1b.gguf';
    (globalThis as Record<string, unknown>).__npcThreads = 2;

    ({ controle } = await import(`${PASTA_FAKE}/index.js`) as { controle: Controle });
    brain = await import('../npc/floor10SmallBrain');
    store = await import('../npc/npcStore');
    pausa = await import('../npc/floor10Pausa');
    perception = await import('../npc/floor10Perception');
});

const entrada = () => ({
    perception: perception.perceiveFloor10({
        npcPosition: { x: 0, y: 0, z: 2.2 },
        npcYaw: 0,
        playerPosition: null,
    }),
    drives: {
        curiosity: 0.5, social: 0.5, energy: 0.5, comfort: 0.5, hope: 0.5, fear: 0.2,
    } as never,
    memory: {
        inspectedElevatorCount: 0,
        sleeps: 44,
        playerSilentSeconds: 10,
        lastGoals: [],
        agreedAction: null,
        agreedReason: null,
        mood: 'cansado',
    } as never,
    prison: null,
    now: 1,
});

describe('a vontade volta a pensar depois que a fala interrompe', () => {
    beforeEach(() => {
        controle.reset();
        pausa.limparPausas();
        store.npcSet({ phase: 'ready', deliberationLive: '', deliberationPhase: 'off' });
    });

    it('a deliberação NÃO baixa nada por conta própria — quem carrega é a fila', async () => {
        // Regra do projeto: pisar no andar não pode disparar 1,32 GB.
        expect(await brain.deliberateFloor10(entrada())).toBeNull();
        expect(controle.geracoes).toBe(0);
    });

    it('depois que a fila carrega, a rodada pensa', async () => {
        expect(await brain.precarregarVontade()).toBe(true);
        const rodada = brain.deliberateFloor10(entrada());
        expect(await ate(() => controle.geracoes >= 1)).toBe(true);
        await rodada;
        expect(controle.construidos).toBeGreaterThan(0);
    });

    it('A FALA INTERROMPE E A VONTADE VOLTA — era isto que estava quebrado', async () => {
        await brain.precarregarVontade();
        controle.atrasoMs = 40; // dá tempo de interromper no meio
        const primeira = brain.deliberateFloor10(entrada());
        expect(await ate(() => store.npc.deliberationPhase === 'thinking')).toBe(true);
        expect(await ate(() => store.npc.deliberationLive.length > 0)).toBe(true);

        // O jogador manda mensagem: é isto que o sendToNpc dispara.
        brain.abortDeliberation();
        await primeira;

        // O worker foi ENCERRADO de verdade (é o que devolve CPU ao aparelho).
        expect(controle.encerrados).toBeGreaterThan(0);

        // E agora o ponto do defeito: a próxima rodada tem de rodar de novo.
        const geracoesAntes = controle.geracoes;
        controle.atrasoMs = 1;
        store.npcSet({ phase: 'ready' });
        const segunda = await brain.deliberateFloor10(entrada());
        expect(controle.geracoes).toBeGreaterThan(geracoesAntes);
        expect(segunda === null || typeof segunda === 'object').toBe(true);
    });

    it('e ela RETOMA de onde parou, em vez de recomeçar do zero', async () => {
        await brain.precarregarVontade();
        controle.atrasoMs = 40;
        const primeira = brain.deliberateFloor10(entrada());
        expect(await ate(() => store.npc.deliberationLive.length > 10)).toBe(true);
        const pensadoAntes = store.npc.deliberationLive;
        brain.abortDeliberation();
        await primeira;

        const guardado = pausa.pensamentoPausado('vontade');
        expect(guardado).not.toBeNull();
        expect(pensadoAntes).toContain(guardado?.parcial.slice(0, 10) ?? '@@');

        controle.atrasoMs = 1;
        store.npcSet({ phase: 'ready' });
        await brain.deliberateFloor10(entrada());
        // Alguma rodada depois da pausa pediu CONTINUAÇÃO, carregando o que ele
        // já tinha pensado. (A última chamada pode ser o resgate da assinatura,
        // que tem prompt próprio.)
        expect(controle.prompts.some((p) => p.includes('CONTINUE'))).toBe(true);
        expect(controle.prompts.some((p) => p.includes(guardado?.parcial ?? '@@'))).toBe(true);
    });

    it('a rodada cortada pela fala CEDE A VEZ — não conta como fracasso', async () => {
        // Este é o "não volta a pensar". Contada como fracasso, a espera dobrava
        // a cada mensagem (5s → 10s → 20s… → 300s) e a vontade ficava de castigo.
        await brain.precarregarVontade();
        controle.atrasoMs = 40;
        const rodada = brain.deliberateFloor10(entrada());
        expect(await ate(() => store.npc.deliberationPhase === 'thinking')).toBe(true);
        brain.abortDeliberation();
        expect(await rodada).toBeNull();
        expect(brain.deliberationYieldedTurn()).toBe(true);
    });

    it('o pensamento retomado não sai gaguejando', async () => {
        await brain.precarregarVontade();
        controle.atrasoMs = 40;
        const primeira = brain.deliberateFloor10(entrada());
        expect(await ate(() => store.npc.deliberationLive.length > 10)).toBe(true);
        brain.abortDeliberation();
        await primeira;

        controle.atrasoMs = 1;
        store.npcSet({ phase: 'ready' });
        await brain.deliberateFloor10(entrada());
        // O modelo falso reescreve o começo; o texto final não pode repetir.
        const vivo = store.npc.deliberationLive;
        expect(vivo).not.toMatch(/(Estou preso neste andar)[\s\S]*\1/);
    });
});

describe('a tela precisa DIZER que ele voltou', () => {
    it('reabrir o runtime não é anunciado como download', async () => {
        const { deliberationThought } = await import('../npc/floor10Deliberation');
        // A barra de download some (a fase deixou de ser 'loading') e no lugar
        // entra a frase que responde "ele morreu ou está voltando?".
        expect(deliberationThought('reopening', '')).toBe('voltando a pensar…');
        expect(deliberationThought('thinking', '')).toBe('pensando…');
        expect(deliberationThought('off', '')).toBe('');
    });

    it('a segunda rodada anuncia REABERTURA, não carga', async () => {
        await brain.precarregarVontade();
        controle.atrasoMs = 40;
        const primeira = brain.deliberateFloor10(entrada());
        expect(await ate(() => store.npc.deliberationPhase === 'thinking')).toBe(true);
        brain.abortDeliberation();
        await primeira;

        controle.atrasoMs = 1;
        store.npcSet({ phase: 'ready' });
        const fases: string[] = [];
        const parar = store.npcSubscribe(() => fases.push(store.npc.deliberationPhase));
        await brain.deliberateFloor10(entrada());
        parar();
        expect(fases).toContain('reopening');
        expect(fases).not.toContain('loading');
    });
});
