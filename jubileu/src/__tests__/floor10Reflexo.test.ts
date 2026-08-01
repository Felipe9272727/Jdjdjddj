// O reflexo é a primeira IA do jogo fora do wllama. Estes testes existem para
// que ela nunca deixe de ser OPCIONAL: se o CDN cair, se o aparelho não der
// conta, se ela demorar — a conversa segue exatamente como seguia antes.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULO_FAKE = pathToFileURL(
    path.join(import.meta.dirname, 'fakeOnnx', 'transformers.min.js'),
).href;

type Controle = {
    criados: number;
    geracoes: number;
    resposta: string;
    atrasoMs: number;
    falharAoCriar: boolean;
    ultimoModelo?: string;
    ultimasOpcoes?: Record<string, unknown>;
    ultimasMensagens?: Array<{ role: string; content: string }>;
    ultimosParams?: Record<string, unknown>;
    reset(): void;
};

let controle: Controle;
let reflexo: typeof import('../npc/floor10Reflexo');
let store: typeof import('../npc/npcStore');
let fila: typeof import('../npc/floor10Fila');

beforeAll(async () => {
    (globalThis as Record<string, unknown>).__onnxModuleUrl = MODULO_FAKE;
    ({ controle } = await import(MODULO_FAKE) as { controle: Controle });
    reflexo = await import('../npc/floor10Reflexo');
    store = await import('../npc/npcStore');
    fila = await import('../npc/floor10Fila');
});

beforeEach(() => {
    controle.reset();
    reflexo.resetReflexoForTests();
    store.npcSet({ reflexo: '', reflexoPhase: 'off', reflexoLoadText: '' });
});

describe('floor10Reflexo — a quinta IA, e a primeira em ONNX', () => {
    it('carrega o SmolLM2 135M em int8, na CPU', async () => {
        expect(await reflexo.precarregarReflexo()).toBe(true);
        expect(controle.ultimoModelo).toBe('HuggingFaceTB/SmolLM2-135M-Instruct');
        expect(controle.ultimasOpcoes?.dtype).toBe('int8');
        // WASM de propósito: a GPU deste andar já custou duas falas perdidas.
        expect(controle.ultimasOpcoes?.device).toBe('wasm');
        expect(store.npc.reflexoPhase).toBe('ready');
    });

    it('o download reporta na FILA ÚNICA, junto dos outros quatro', async () => {
        fila.floor10Fila.reset();
        fila.definirFilaDoAndar10({
            fala: 1_915_305_312,
            vontade: 1_321_083_008,
            motor: 639_446_688,
            memoria: 333_590_944,
            reflexo: reflexo.FLOOR10_REFLEXO_MODEL.bytes,
        });
        await reflexo.precarregarReflexo();
        const estado = fila.floor10Fila.estado();
        expect(estado.total).toBe(5);
        expect(estado.prontos).toContain('reflexo');
    });

    it('sem o reflexo na lista de tamanhos, a fila continua com quatro', () => {
        fila.floor10Fila.reset();
        fila.definirFilaDoAndar10({
            fala: 1, vontade: 1, motor: 1, memoria: 1,
        });
        expect(fila.floor10Fila.estado().total).toBe(4);
    });

    it('reage curto, e a reação é dele — não a resposta', async () => {
        await reflexo.precarregarReflexo();
        const reacao = await reflexo.reagir('qual é o seu nome?');
        expect(reacao).toBe('Hm. Deixa eu pensar.');
        // O prompt PROÍBE responder: quem responde é o 3B, com o cânone.
        const sistema = controle.ultimasMensagens?.[0]?.content ?? '';
        expect(sistema).toMatch(/Nunca responda a pergunta/i);
        expect(controle.ultimosParams?.max_new_tokens).toBe(reflexo.REFLEXO_MAX_TOKENS);
    });

    it('DEMOROU, PERDEU A VEZ: estourar o teto devolve vazio em vez de atrasar a fala', async () => {
        await reflexo.precarregarReflexo();
        controle.atrasoMs = reflexo.REFLEXO_TIMEOUT_MS + 400;
        expect(await reflexo.reagir('oi')).toBe('');
    });

    it('sem estar carregado, não gera nada nem lança', async () => {
        expect(await reflexo.reagir('oi')).toBe('');
        expect(controle.geracoes).toBe(0);
    });

    it('CDN fora do ar é indisponibilidade, não pane', async () => {
        controle.falharAoCriar = true;
        expect(await reflexo.precarregarReflexo()).toBe(false);
        expect(store.npc.reflexoPhase).toBe('unavailable');
        // E o jogo continua: reagir simplesmente não devolve nada.
        expect(await reflexo.reagir('oi')).toBe('');
    });
});

describe('limparReacao — reflexo comprido atrapalha mais do que ajuda', () => {
    it('tira aspas e fica com a primeira linha', async () => {
        expect(reflexo.limparReacao('"Hm."\nE também acho que...')).toBe('Hm.');
    });

    it('corta na fronteira de frase quando o modelo se alonga', async () => {
        const longo = 'Espera aí. Isso me lembra de uma coisa que aconteceu no elevador ontem à noite';
        const curto = reflexo.limparReacao(longo);
        expect(curto.length).toBeLessThanOrEqual(61);
        expect(curto.startsWith('Espera aí.')).toBe(true);
    });

    it('texto vazio continua vazio', async () => {
        expect(reflexo.limparReacao('   ')).toBe('');
    });
});

describe('lerTextoGerado — o transformers.js já devolveu três formatos', () => {
    it('lê o formato de chat', () => {
        expect(reflexo.lerTextoGerado([
            { generated_text: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'Hm.' }] },
        ])).toBe('Hm.');
    });

    it('lê o formato de texto puro', () => {
        expect(reflexo.lerTextoGerado([{ generated_text: 'Hm.' }])).toBe('Hm.');
    });

    it('formato desconhecido não derruba nada', () => {
        expect(reflexo.lerTextoGerado(null)).toBe('');
        expect(reflexo.lerTextoGerado([{}])).toBe('');
    });
});
