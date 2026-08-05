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
    emVoo: number;
    picoSimultaneo: number;
    encerrados: number;
    prompts: string[];
    tokens: string[];
    atrasoMs: number;
    travarApos: number | null;
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
        controle.atrasoMs = 30;
        controle.travarApos = 12; // segura o pensamento até o corte chegar
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
        controle.atrasoMs = 30;
        controle.travarApos = 12;
        const primeira = brain.deliberateFloor10(entrada());
        // 10 caracteres NÃO bastavam, e por isso este teste falhava em ~1 de 3
        // execuções: `pausarPensamento` descarta qualquer parcial abaixo de
        // MINIMO_UTIL (24) — "só ruído de meia palavra" — e devolve null. A
        // janela entre 11 e 23 caracteres era o sorteio. Esperar passar do
        // mínimo real fecha a janela, e um teste que pisca não prova nada.
        expect(await ate(() => store.npc.deliberationLive.trim().length > 30)).toBe(true);
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
        controle.atrasoMs = 30;
        controle.travarApos = 12;
        const rodada = brain.deliberateFloor10(entrada());
        expect(await ate(() => store.npc.deliberationPhase === 'thinking')).toBe(true);
        brain.abortDeliberation();
        expect(await rodada).toBeNull();
        expect(brain.deliberationYieldedTurn()).toBe(true);
    });

    it('o pensamento retomado não sai gaguejando', async () => {
        await brain.precarregarVontade();
        controle.atrasoMs = 30;
        controle.travarApos = 12;
        const primeira = brain.deliberateFloor10(entrada());
        expect(await ate(() => store.npc.deliberationLive.length > 10)).toBe(true);
        brain.abortDeliberation();
        await primeira;

        controle.travarApos = null;
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

describe('a caixa-preta conta a história que eu não conseguia ver', () => {
    it('registra carga, pensamento, preempção e retomada — na ordem', async () => {
        const caixa = await import('../npc/floor10CaixaPreta');
        caixa.limparCaixaPreta();
        // Este describe tem o seu próprio começo do zero: sem isto, um
        // pensamento pausado por outro teste faria a primeira rodada já nascer
        // como retomada.
        pausa.limparPausas();
        controle.reset();
        // O texto vivo do teste anterior ainda está no store; sem zerar, a
        // espera abaixo passa na hora e o corte cai ANTES de a geração começar.
        store.npcSet({ deliberationLive: '', deliberationPhase: 'off', phase: 'ready' });
        // Pensamento longo: precisa durar o bastante para a fala interromper no
        // MEIO. Com poucos tokens a rodada terminava sozinha antes do corte, e
        // aí não há preempção nenhuma para registrar.
        const original = controle.tokens;
        controle.tokens = Array.from({ length: 40 }, (_, i) => `palavra${i} `);

        await brain.precarregarVontade();
        controle.atrasoMs = 30;
        controle.travarApos = 12;
        const primeira = brain.deliberateFloor10(entrada());
        // Espera haver pensamento SUFICIENTE para valer a pena guardar: abortar
        // no primeiro instante de 'thinking' não salva nada, e a caixa-preta
        // registra isso honestamente (guardou=false).
        expect(await ate(() => store.npc.deliberationPhase === 'thinking')).toBe(true);
        expect(await ate(() => store.npc.deliberationLive.length > 24)).toBe(true);
        brain.abortDeliberation();
        await primeira;

        controle.travarApos = null;
        controle.atrasoMs = 1;
        store.npcSet({ phase: 'ready' });
        await brain.deliberateFloor10(entrada());

        const tipos = caixa.eventosDaCaixaPreta().map((e) => e.tipo);
        expect(tipos).toContain('vontade:pensando');
        expect(tipos).toContain('vontade:preemptada');
        expect(tipos).toContain('vontade:reabrindo');
        expect(tipos).toContain('vontade:retomando');
        // A preempção vem ANTES da retomada: é essa ordem que conta a história.
        expect(tipos.indexOf('vontade:preemptada'))
            .toBeLessThan(tipos.indexOf('vontade:retomando'));

        // E o evento diz QUANTO se salvou, que é o número que eu precisava.
        const preempcao = caixa.eventosDaCaixaPreta()
            .find((e) => e.tipo === 'vontade:preemptada');
        expect(preempcao?.dados?.guardou).toBe(true);
        expect(Number(preempcao?.dados?.pensado)).toBeGreaterThan(0);
        controle.tokens = original;
    });
});

describe('o painel aberto para a vontade — sem reabrir 1,32 GB', () => {
    beforeEach(() => {
        controle.reset();
        pausa.limparPausas();
        store.npcSet({
            phase: 'ready', open: false, deliberationLive: '', deliberationPhase: 'off',
        });
    });

    // O RELATO: "quando eu saio do chat, e entro, LAGA TUDO".
    //
    // Com o painel aberto liberado para deliberar, cada abre-e-fecha pagava
    // uma reabertura completa do modelo (os pesos ficam no OPFS, mas o Worker
    // é encerrado na pausa e voltar custa ler 1,32 GB para o WASM).
    it('com o chat aberto, nenhuma rodada nova começa', async () => {
        expect(await brain.precarregarVontade()).toBe(true);
        store.npcSet({ open: true, phase: 'ready' });
        const construidosAntes = controle.construidos;
        await brain.deliberateFloor10(entrada());
        // O ponto: NÃO gerou e NÃO construiu runtime. Sem reabertura, sem lag.
        expect(controle.geracoes).toBe(0);
        expect(controle.construidos).toBe(construidosAntes);
        // Ceder a vez não é fracasso: sem isto a espera vira castigo de 300s.
        expect(brain.deliberationYieldedTurn()).toBe(true);
    });

    it('com o chat fechado, ela volta a pensar', async () => {
        // A vontade nunca baixa por conta própria: quem carrega é a fila.
        expect(await brain.precarregarVontade()).toBe(true);
        store.npcSet({ open: false, phase: 'ready' });
        await brain.deliberateFloor10(entrada());
        expect(controle.geracoes).toBeGreaterThanOrEqual(1);
    });
});

describe('DOIS RUNTIMES NUNCA GERAM AO MESMO TEMPO', () => {
    // Esta é A invariante do andar. Não é sobre velocidade: é sobre o aparelho
    // do dono do jogo desligar sozinho, o que já aconteceu duas vezes.
    //
    // O fake conta `picoSimultaneo` — quantas gerações estavam acontecendo no
    // mesmo instante, em qualquer momento da sessão. Se esse número passar de
    // 1, existe um caminho em que dois llama.cpp dividem os núcleos, e nenhum
    // teste de tok/s enxergaria isso.
    beforeEach(() => {
        controle.reset();
        pausa.limparPausas();
        store.npcSet({
            phase: 'ready', open: false, deliberationLive: '', deliberationPhase: 'off',
        });
    });

    it('a vontade pensando + o jogador abrindo o chat e falando', async () => {
        expect(await brain.precarregarVontade()).toBe(true);

        // 1. Chat fechado: ela pensa, e o pensamento é longo (trava no meio).
        controle.travarApos = 2;
        const pensando = brain.deliberateFloor10(entrada());
        expect(await ate(() => controle.emVoo >= 1)).toBe(true);

        // 2. O jogador abre o chat. Nenhuma rodada NOVA pode começar.
        store.npcSet({ open: true });
        const geracoesAoAbrir = controle.geracoes;
        await espera(60);
        expect(controle.geracoes).toBe(geracoesAoAbrir);

        // 3. E manda mensagem: a fala pausa a vontade ANTES de gerar.
        store.npcSet({ phase: 'thinking' });
        pausa.limparPausas();
        brain.abortDeliberation();
        await pensando;

        // A vontade saiu de cena: nada mais está gerando.
        expect(await ate(() => controle.emVoo === 0)).toBe(true);

        // 4. Mensagens seguidas, que é a sequência que derrubava o aparelho.
        for (let i = 0; i < 4; i += 1) {
            store.npcSet({ phase: 'thinking' });
            await brain.deliberateFloor10(entrada());   // deve CEDER, não gerar
            store.npcSet({ phase: 'ready' });
        }

        // O VEREDITO: em nenhum instante houve duas gerações juntas.
        expect(controle.picoSimultaneo).toBe(1);
    });

    it('com o chat aberto a vontade nem tenta, então o pico continua 1', async () => {
        expect(await brain.precarregarVontade()).toBe(true);
        store.npcSet({ open: true, phase: 'ready' });
        await Promise.all([
            brain.deliberateFloor10(entrada()),
            brain.deliberateFloor10(entrada()),
            brain.deliberateFloor10(entrada()),
        ]);
        expect(controle.geracoes).toBe(0);
        expect(controle.picoSimultaneo).toBe(0);
    });
});
