import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    ERRO_MODELO_VAZIO,
    FLOOR10_INATIVIDADE_MS,
    FLOOR10_TENTATIVAS,
    conferirModeloCarregado,
    ehFalhaTransitoria,
    entradaIntacta,
    esperar,
    esperaDaTentativa,
    inatividadeMs,
    modeloVazio,
    textoDaTentativa,
    vigiaReprova,
    vigiarInatividade,
} from '../npc/floor10Carga';
import { isBrokenModelCacheError } from '../npc/floor10ModelStorage';

describe('o teto de inatividade das cargas', () => {
    it('NÃO reprova um download lento que está andando', () => {
        // O caso que o teto total de 180s matava: 334 MB a 1,5 MB/s = 222s de
        // download saudável. Aqui cada bloco que chega renova o prazo.
        const inicio = 1_000_000;
        let ultimoSinal = inicio;
        for (let seg = 1; seg <= 222; seg += 1) {
            ultimoSinal = inicio + seg * 1_000; // um bloco por segundo
            expect(vigiaReprova(ultimoSinal, FLOOR10_INATIVIDADE_MS, ultimoSinal))
                .toBe(false);
        }
        // 222s depois do começo, e nada de reprovar.
        expect(ultimoSinal - inicio).toBe(222_000);
    });

    it('reprova quando o download realmente para', () => {
        const parouEm = 1_000_000;
        const teto = FLOOR10_INATIVIDADE_MS;
        expect(vigiaReprova(parouEm, teto, parouEm + teto - 1_000)).toBe(false);
        expect(vigiaReprova(parouEm, teto, parouEm + teto + 1_000)).toBe(true);
    });

    it('o teto é generoso o bastante para a fase que não emite nada', () => {
        // A última fase da carga — ler o GGUF do OPFS para o WASM — trabalha em
        // silêncio. Reprovar um celular lento fazendo o trabalho certo é pior
        // que esperar mais um minuto por um que morreu.
        expect(FLOOR10_INATIVIDADE_MS).toBeGreaterThanOrEqual(180_000);
    });

    it('conta desde o começo, não desde o primeiro byte', () => {
        // Modelo inteiro em cache não emite progresso NENHUM. Se o relógio só
        // começasse no primeiro byte, essa carga ficaria sem teto — que é o
        // "carregando para sempre" que este módulo existe para impedir.
        const comecou = 500;
        const morreu = comecou + FLOOR10_INATIVIDADE_MS + 10_000;
        expect(inatividadeMs(comecou, morreu)).toBe(FLOOR10_INATIVIDADE_MS + 10_000);
        expect(vigiaReprova(comecou, FLOOR10_INATIVIDADE_MS, morreu)).toBe(true);
    });

    it('o vigia dispara sozinho e para de disparar depois de parado', async () => {
        let travou = 0;
        const vigia = vigiarInatividade(() => { travou += 1; }, 20, 5);
        await esperar(120);
        expect(travou).toBe(1); // uma vez só, mesmo com vários polls
        vigia.parar();
        await esperar(40);
        expect(travou).toBe(1);
    });

    it('o vigia não dispara enquanto alguém chama avancou()', async () => {
        let travou = 0;
        const vigia = vigiarInatividade(() => { travou += 1; }, 60, 5);
        const fim = Date.now() + 150;
        while (Date.now() < fim) {
            vigia.avancou();
            await esperar(10);
        }
        vigia.parar();
        expect(travou).toBe(0);
    });
});

describe('o que vale tentar de novo', () => {
    it('rede caída vale', () => {
        expect(ehFalhaTransitoria(new TypeError('Failed to fetch'))).toBe(true);
        expect(ehFalhaTransitoria(new TypeError('NetworkError when attempting to fetch resource')))
            .toBe(true);
        expect(ehFalhaTransitoria(new TypeError('Load failed'))).toBe(true);
        expect(ehFalhaTransitoria(new Error('net::ERR_CONNECTION_RESET'))).toBe(true);
        expect(ehFalhaTransitoria('Failed to fetch')).toBe(true);
    });

    it('servidor tropeçando vale', () => {
        expect(ehFalhaTransitoria(new Error('HTTP 503 Service Unavailable'))).toBe(true);
        expect(ehFalhaTransitoria(new Error('request failed with status 429'))).toBe(true);
    });

    it('cota estourada NÃO vale — insistir só queima bateria', () => {
        const quota = new Error('QuotaExceededError: quota exceeded');
        quota.name = 'QuotaExceededError';
        expect(ehFalhaTransitoria(quota)).toBe(false);
        expect(ehFalhaTransitoria(new Error('o modelo não cabe: só 300 MB livres')))
            .toBe(false);
    });

    it('aborto NÃO vale — abortar foi decisão de alguém', () => {
        const abort = new Error('Motor brain interrupted');
        abort.name = 'AbortError';
        expect(ehFalhaTransitoria(abort)).toBe(false);
        expect(ehFalhaTransitoria(new Error('interrompido'))).toBe(false);
    });

    it('arquivo quebrado NÃO vale — tem tratamento próprio', () => {
        expect(ehFalhaTransitoria(new Error('model is corrupted or incomplete')))
            .toBe(false);
    });

    it('404 não vale: o arquivo não vai aparecer na segunda tentativa', () => {
        expect(ehFalhaTransitoria(new Error('HTTP 404 Not Found'))).toBe(false);
    });

    it('nada e coisa nenhuma não valem', () => {
        expect(ehFalhaTransitoria(null)).toBe(false);
        expect(ehFalhaTransitoria(undefined)).toBe(false);
        expect(ehFalhaTransitoria(new Error('deu ruim'))).toBe(false);
    });
});

describe('o modelo que "carrega" e está vazio', () => {
    // A forma exata que o Chromium devolveu com 48 MB de zeros no lugar do
    // GGUF (bancada-navegador/rede.html). `loadModelFromUrl` RESOLVEU.
    const CASCA = { hparams: { nVocab: 0, nCtxTrain: 0, nEmbd: 0, nLayer: 0 }, meta: {} };
    const INTEIRO = {
        hparams: { nVocab: 262_144, nCtxTrain: 2_048, nEmbd: 768, nLayer: 24 },
        meta: {},
    };

    it('reconhece a casca medida no navegador', () => {
        expect(modeloVazio(CASCA)).toBe(true);
        expect(modeloVazio(INTEIRO)).toBe(false);
    });

    it('zero em QUALQUER dimensão é casca', () => {
        expect(modeloVazio({ hparams: { nVocab: 32_000, nEmbd: 768, nLayer: 0 } })).toBe(true);
        expect(modeloVazio({ hparams: { nVocab: 0, nEmbd: 768, nLayer: 24 } })).toBe(true);
        expect(modeloVazio({ hparams: { nVocab: 32_000, nEmbd: 0, nLayer: 24 } })).toBe(true);
    });

    it('runtime que não informa passa direto — não se inventa falha', () => {
        expect(modeloVazio(null)).toBe(false);
        expect(modeloVazio(undefined)).toBe(false);
        expect(modeloVazio({})).toBe(false);
    });

    it('a conferência lança, e o erro cai no caminho de cache quebrado', async () => {
        // Esta é a razão de a mensagem ser aquela: o conserto que já existe
        // (apagar do cache e baixar de novo) só roda para erros que
        // `isBrokenModelCacheError` reconhece.
        const casca = { getModelMetadata: async () => CASCA };
        await expect(conferirModeloCarregado(casca)).rejects.toThrow();
        try {
            await conferirModeloCarregado(casca);
        } catch (erro) {
            expect(isBrokenModelCacheError(erro)).toBe(true);
        }
        expect(ehFalhaTransitoria(new Error(ERRO_MODELO_VAZIO))).toBe(false);
    });

    it('modelo inteiro passa, e engine sem metadata também', async () => {
        await expect(conferirModeloCarregado({ getModelMetadata: async () => INTEIRO }))
            .resolves.toBeUndefined();
        await expect(conferirModeloCarregado({})).resolves.toBeUndefined();
        await expect(conferirModeloCarregado(null)).resolves.toBeUndefined();
        // Não conseguir perguntar não é prova de nada.
        await expect(conferirModeloCarregado({
            getModelMetadata: async () => { throw new Error('worker morreu'); },
        })).resolves.toBeUndefined();
    });
});

describe('a espera entre tentativas', () => {
    it('cresce, mas some ao lado de um download de 334 MB', () => {
        expect(esperaDaTentativa(1)).toBe(2_000);
        expect(esperaDaTentativa(2)).toBe(4_000);
        expect(esperaDaTentativa(3)).toBe(6_000);
        expect(esperaDaTentativa(9)).toBe(6_000);
        // Total das esperas com o número de tentativas de hoje.
        let total = 0;
        for (let t = 1; t < FLOOR10_TENTATIVAS; t += 1) total += esperaDaTentativa(t);
        expect(total).toBeLessThanOrEqual(10_000);
    });

    it('acorda na hora quando alguém aborta no meio', async () => {
        const controller = new AbortController();
        const comecou = Date.now();
        const espera = esperar(5_000, controller.signal);
        controller.abort();
        await espera;
        expect(Date.now() - comecou).toBeLessThan(1_000);
    });

    it('a tela diz qual tentativa é, não só "erro"', () => {
        expect(textoDaTentativa('Memória EmbeddingGemma 300M', 1, 2_000))
            .toBe(
                'a rede falhou ao baixar Memória EmbeddingGemma 300M · '
                + 'tentando de novo em 2s (tentativa 2 de 3)',
            );
    });
});

describe('"já está no aparelho" contra "está inteiro"', () => {
    // ── A ENTRADA EXISTE DESDE O PRIMEIRO BYTE ────────────────────────────
    //
    // O `cacheManager` do wllama cria a entrada quando o download COMEÇA. Um
    // arquivo interrompido no meio aparece na lista igual a um completo — e
    // quem pergunta "já está em cache?" pula, com o "sim", o planejamento de
    // espaço inteiro. Aí o wllama valida o tamanho ao abrir, rebaixa 1,9 GB
    // sozinho, e o jogo tinha acabado de prometer que não precisava de nada.
    const inteira = { size: 1_900_000_000, metadata: { originalSize: 1_900_000_000 } };
    const pelaMetade = { size: 812_000_000, metadata: { originalSize: 1_900_000_000 } };

    it('arquivo completo é aceito', () => {
        expect(entradaIntacta(inteira)).toBe(true);
    });

    it('download interrompido no meio NÃO conta como em cache', () => {
        expect(entradaIntacta(pelaMetade)).toBe(false);
    });

    it('sem os tamanhos, deixa passar', () => {
        // Inventar "corrompido" por falta de instrumento apagaria um modelo bom
        // e cobraria o download de novo — o mesmo critério de
        // `conferirModeloCarregado`, e o inverso do defeito que este teste pega.
        expect(entradaIntacta({})).toBe(true);
        expect(entradaIntacta({ size: 10 })).toBe(true);
        expect(entradaIntacta({ metadata: { originalSize: 10 } })).toBe(true);
        expect(entradaIntacta({ size: 10, metadata: {} })).toBe(true);
        expect(entradaIntacta({ size: 0, metadata: { originalSize: 0 } })).toBe(true);
    });

    it('e o motor da fala pergunta com essa régua', () => {
        // O defeito não era a função errada: era a pergunta certa feita sem
        // ela. Um teste de comportamento aqui exigiria um wllama de mentira
        // inteiro; ler a linha prende exatamente o que faltava.
        const fonte = readFileSync(new URL('../npc/wllamaEngine.ts', import.meta.url), 'utf8');
        const pergunta = fonte.match(/entries\?\.some\([^\n]*/)?.[0] ?? '';
        expect(pergunta).toContain('originalURL === url');
        expect(pergunta, 'volta a aceitar um arquivo pela metade como "em cache"')
            .toContain('entradaIntacta(');
    });
});
