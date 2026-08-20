import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    planejarRevisorOnnx, textoDaSaida, REVISOR_ONNX_BYTES, REVISOR_ONNX_REPO,
    resetRevisorOnnxParaTestes, SomaDeArquivos,
} from '../npc/floor10RevisorOnnx';
import { REVISORES } from '../npc/floor10Revisores';

const comGpu = (gpu: unknown) => {
    const antes = (globalThis as { navigator?: unknown }).navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { gpu }, configurable: true });
    return () => Object.defineProperty(globalThis, 'navigator', { value: antes, configurable: true });
};

afterEach(() => resetRevisorOnnxParaTestes());

describe('planejarRevisorOnnx', () => {
    // A LIÇÃO QUE ESTE TESTE GUARDA: a sonda antiga olhava `navigator.gpu` e
    // dizia "WebGPU: true" numa caixa sem GPU nenhuma. O objeto existe; o
    // ADAPTADOR é que não. Esse falso positivo me fez procurar o defeito no
    // lugar errado por uma rodada inteira.
    it('recusa quando navigator.gpu existe mas não há adaptador', async () => {
        const desfazer = comGpu({ requestAdapter: async () => null });
        try {
            const plano = await planejarRevisorOnnx();
            expect(plano.pode).toBe(false);
            expect(plano.motivo).toMatch(/sem adaptador/);
        } finally { desfazer(); }
    });

    it('recusa quando não há navigator.gpu', async () => {
        const desfazer = comGpu(undefined);
        try {
            expect((await planejarRevisorOnnx()).pode).toBe(false);
        } finally { desfazer(); }
    });

    it('recusa quando requestAdapter estoura, em vez de deixar subir', async () => {
        const desfazer = comGpu({ requestAdapter: async () => { throw new Error('sem driver'); } });
        try {
            const plano = await planejarRevisorOnnx();
            expect(plano.pode).toBe(false);
            expect(plano.motivo).toMatch(/sem driver/);
        } finally { desfazer(); }
    });

    it('com adaptador, escolhe q4f16 — o único que cabe num celular', async () => {
        const desfazer = comGpu({ requestAdapter: async () => ({}) });
        try {
            const plano = await planejarRevisorOnnx();
            expect(plano).toMatchObject({ pode: true, device: 'webgpu', dtype: 'q4f16' });
            // 760 MB contra 1,77 GB do q8 e 2,36 GB do fp16. O número está no
            // código porque é ele que a barra de download promete.
            expect(REVISOR_ONNX_BYTES).toBe(760_279_040);
        } finally { desfazer(); }
    });
});

describe('textoDaSaida', () => {
    // Os dois formatos são reais: `text-generation` devolve string quando a
    // entrada é texto e lista de mensagens quando é chat. Ler só um deles
    // devolvia remendo vazio sem ninguém saber por quê.
    it('lê a saída em texto', () => {
        expect(textoDaSaida([{ generated_text: '  It opens when it wants.  ' }]))
            .toBe('It opens when it wants.');
    });

    it('lê a saída em mensagens, pegando a última', () => {
        expect(textoDaSaida([{ generated_text: [
            { role: 'user', content: 'conserte' },
            { role: 'assistant', content: 'It opens when it wants.' },
        ] }])).toBe('It opens when it wants.');
    });

    it('devolve vazio para forma desconhecida, em vez de "undefined"', () => {
        expect(textoDaSaida(undefined)).toBe('');
        expect(textoDaSaida([{ }])).toBe('');
    });
});

describe('o catálogo', () => {
    it('marca o revisor de ONNX com runtime próprio — quem escolhe diz qual', () => {
        const onnx = REVISORES.find((r) => r.id === 'lfm-onnx');
        expect(onnx?.runtime).toBe('onnx');
        // A vontade continua sendo o gguf: o ONNX serve só o REMENDO, e é por
        // isso que esta opção custa 760 MB A MAIS em vez de trocar de arquivo.
        expect(onnx?.cerebro).toBe('lfm2-1b');
    });

    it('os outros continuam no wllama, sem precisar declarar nada', () => {
        for (const r of REVISORES.filter((x) => x.id !== 'lfm-onnx')) {
            expect(r.runtime ?? 'wllama').toBe('wllama');
        }
    });

    it('aponta para o build oficial da Liquid, não para uma conversão de terceiro', () => {
        expect(REVISOR_ONNX_REPO).toBe('LiquidAI/LFM2.5-1.2B-Instruct-ONNX');
    });
});

describe('SomaDeArquivos — a barra que andava para trás', () => {
    // O CASO REAL, fotografado no celular do dono do jogo: a instalação mostrou
    // "922 MB de 1,74 GB" e depois "162 MB de 1,74 GB". A causa era ler
    // `p.progress`, que é a porcentagem DAQUELE ARQUIVO — quando o arquivo
    // seguinte começa, ela volta a zero.
    //
    // E o estrago não era só visual: o vigia de download mede PROGRESSO, e um
    // número que não anda para a frente é igual a um download travado. Depois
    // de 36 s "parado", a peça falhou.
    it('soma arquivos diferentes em vez de trocar um pelo outro', () => {
        const soma = new SomaDeArquivos();
        soma.push({ file: 'tokenizer.json', loaded: 3_000_000, total: 3_000_000 });
        const depois = soma.push({ file: 'onnx/model_q4f16.onnx_data', loaded: 100_000_000, total: 760_000_000 });
        expect(depois.loaded).toBe(103_000_000);
        expect(depois.total).toBe(763_000_000);
    });

    it('nunca encolhe: arquivo novo começando em zero não apaga o que já desceu', () => {
        const soma = new SomaDeArquivos();
        const antes = soma.push({ file: 'grande.onnx_data', loaded: 700_000_000, total: 760_000_000 });
        const agora = soma.push({ file: 'config.json', loaded: 0, total: 1_800 });
        expect(agora.loaded).toBeGreaterThanOrEqual(antes.loaded);
    });

    it('ignora evento fora de ordem que traria um `loaded` menor', () => {
        const soma = new SomaDeArquivos();
        soma.push({ file: 'a', loaded: 500, total: 1_000 });
        expect(soma.push({ file: 'a', loaded: 200, total: 1_000 }).loaded).toBe(500);
    });

    it('aguenta evento sem nome de arquivo sem quebrar a conta', () => {
        const soma = new SomaDeArquivos();
        expect(soma.push({ loaded: 10, total: 20 }).loaded).toBe(10);
        expect(soma.push({ loaded: 15, total: 20 }).loaded).toBe(15);
    });
});
