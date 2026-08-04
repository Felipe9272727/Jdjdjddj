// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR:
//
//   `TypeError: Failed to fetch` no meio do download e o cérebro fica morto
//   até alguém recarregar a página.
//
// Ele apareceu na tela do dono do jogo, baixando a memória de 334 MB no
// celular. Rede de celular cai — trocar de célula, sair do Wi-Fi, um túnel — e
// o wllama guarda no OPFS o que já desceu, então tentar de novo CONTINUA em vez
// de recomeçar. Não tentar era jogar fora 300 MB já baixados por um soluço.
//
// O outro caso, mais traiçoeiro, é o download que morre EM SILÊNCIO: sem erro,
// sem progresso, sem fim. Esse só o vigia de inatividade pega.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PASTA_FAKE = pathToFileURL(
    path.join(import.meta.dirname, 'fakeWllamaRede'),
).href;

type Controle = {
    construidos: number;
    cargas: number;
    falhasRestantes: number;
    travarApos: number;
    cascasRestantes: number;
    apagados: number;
    encerrados: number;
    erro: () => Error;
    reset(): void;
};

type Memoria = typeof import('../npc/floor10Memoria');
type Store = typeof import('../npc/npcStore');

let controle: Controle;
let memoria: Memoria;
let store: Store;

beforeAll(async () => {
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
    (globalThis as Record<string, unknown>).__memoryModelUrl = 'https://exemplo/fake-mem.gguf';
    // A espera entre tentativas é real no jogo (2s, 4s) e irrelevante aqui.
    (globalThis as Record<string, unknown>).__f10EsperaMs = 1;

    ({ controle } = await import(`${PASTA_FAKE}/index.js`) as { controle: Controle });
    memoria = await import('../npc/floor10Memoria');
    store = await import('../npc/npcStore');
});

beforeEach(() => {
    controle.reset();
    memoria.resetFloor10MemoriaForTests();
});

describe('a carga da memória quando a rede falha', () => {
    it('a rede cai uma vez e a memória carrega mesmo assim', async () => {
        controle.falhasRestantes = 1;
        const ok = await memoria.precarregarMemoria();
        expect(ok).toBe(true);
        expect(controle.cargas).toBe(2);
        expect(store.npc.memoriaPhase).toBe('ready');
    });

    it('a rede cai duas vezes e a terceira ainda salva', async () => {
        controle.falhasRestantes = 2;
        const ok = await memoria.precarregarMemoria();
        expect(ok).toBe(true);
        expect(controle.cargas).toBe(3);
    });

    it('desiste depois do teto — não fica tentando para sempre', async () => {
        controle.falhasRestantes = 99;
        const ok = await memoria.precarregarMemoria();
        expect(ok).toBe(false);
        expect(controle.cargas).toBe(3);
        expect(store.npc.memoriaPhase).toBe('unavailable');
        expect(store.npc.memoriaLoadText).toContain('Failed to fetch');
    });

    it('cota estourada NÃO é tentada de novo — insistir só queima bateria', async () => {
        controle.falhasRestantes = 99;
        controle.erro = () => {
            const erro = new Error('QuotaExceededError: the quota has been exceeded');
            erro.name = 'QuotaExceededError';
            return erro;
        };
        const ok = await memoria.precarregarMemoria();
        expect(ok).toBe(false);
        expect(controle.cargas).toBe(1);
    });

    it('404 não é tentado de novo: o arquivo não vai aparecer na segunda vez', async () => {
        controle.falhasRestantes = 99;
        controle.erro = () => new Error('HTTP 404 Not Found');
        const ok = await memoria.precarregarMemoria();
        expect(ok).toBe(false);
        expect(controle.cargas).toBe(1);
    });

    it('a tela conta a tentativa em vez de só mostrar o erro', async () => {
        controle.falhasRestantes = 1;
        const textos: string[] = [];
        const parar = store.npcSubscribe(() => {
            const t = store.npc.memoriaLoadText;
            if (t && textos[textos.length - 1] !== t) textos.push(t);
        });
        await memoria.precarregarMemoria();
        parar();
        expect(textos.some((t) => t.includes('tentativa 2 de 3'))).toBe(true);
    });
});

describe('o modelo que carrega e está vazio', () => {
    // MEDIDO NO CHROMIUM (bancada-navegador/rede.html): 48 MB de zeros no lugar
    // do GGUF fazem `loadModelFromUrl` RESOLVER, com nVocab/nLayer zerados. Sem
    // a conferência, o cérebro ia para 'ready', a fila dava a etapa por
    // concluída, e o estouro só vinha na primeira frase — dentro do Worker,
    // como `RangeError: Invalid typed array length`, sem conserto possível.
    it('a casca é pega na hora e o arquivo truncado é apagado do cache', async () => {
        controle.cascasRestantes = 1;
        const ok = await memoria.precarregarMemoria();
        expect(ok).toBe(true);
        expect(controle.apagados).toBe(1);
        expect(controle.cargas).toBe(2);
        expect(store.npc.memoriaPhase).toBe('ready');
    });

    it('não confunde modelo bom com casca', async () => {
        controle.cascasRestantes = 0;
        const ok = await memoria.precarregarMemoria();
        expect(ok).toBe(true);
        expect(controle.apagados).toBe(0);
        expect(controle.cargas).toBe(1);
    });
});

describe('a carga que morre em silêncio', () => {
    it('o vigia reprova um download que parou de andar e não deu erro', async () => {
        // Sem o vigia esta carga NUNCA terminaria: não resolve nem rejeita, e a
        // barra fica "baixando" para sempre. Era assim que o jogador esperava
        // 300s por nada.
        controle.travarApos = 2;
        controle.falhasRestantes = 0;
        (globalThis as Record<string, unknown>).__f10InatividadeMs = 60;
        const ok = await memoria.precarregarMemoria();
        delete (globalThis as Record<string, unknown>).__f10InatividadeMs;
        expect(ok).toBe(false);
        expect(store.npc.memoriaPhase).toBe('unavailable');
        // Travar é transitório: ele tentou de novo antes de desistir.
        expect(controle.cargas).toBe(3);
    });
});
