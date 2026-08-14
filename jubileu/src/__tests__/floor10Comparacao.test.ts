import { formatTimings } from '../npc/wllamaEngine';
import { describe, expect, it } from 'vitest';
import { comparisonHistory, formatFloor10ComparisonReport, type Floor10ComparisonData } from '../npc/floor10Comparacao';

const DATA: Floor10ComparisonData = {
  generatedAt: '2026-08-01T22:00:00.000Z',
  environment: {
    build: 'teste-123',
    userAgent: 'Chrome Android teste',
    cores: 8,
    deviceMemoryGB: 8,
    isolated: true,
  },
  loads: {
    normal: {
      downloadMs: null,
      modelMs: 62_000,
      prewarmMs: 9_000,
      readyMs: 71_000,
      runtimeLabel: 'SmolLM3-3B · CPU×8',
      error: '',
      loadTrace: [],
    },
    ngram: {
      downloadMs: null,
      modelMs: 64_000,
      prewarmMs: 9_000,
      readyMs: 73_000,
      runtimeLabel: 'SmolLM3-3B · CPU×8',
      error: '',
      loadTrace: [
        '66.2s · nativo · llama_context: n_ctx = 1536',
        '72.4s · nativo · speculative decoding context initialized',
      ],
    },
  },
  results: {
    normal: [
      {
        questionId: 1,
        question: 'Qual é o seu nome?',
        answer: 'Meu nome é Nilo Azevedo.',
        totalMs: 30_000,
        firstTokenMs: 12_000,
        runtimeLabel: 'SmolLM3-3B · CPU×8',
        metrics: {
          tps: 2.1,
          fps: 45,
          readSeconds: 9,
          readTps: 40,
          readTokens: 360,
          reusedTokens: 0,
        },
        error: '',
      },
    ],
    ngram: [
      {
        questionId: 1,
        question: 'Qual é o seu nome?',
        answer: 'Eu sou Nilo Azevedo.',
        totalMs: 24_000,
        firstTokenMs: 11_000,
        runtimeLabel: 'SmolLM3-3B · CPU×8',
        metrics: {
          tps: 3.2,
          fps: 44,
          readSeconds: 8,
          readTps: 45,
          readTokens: 360,
          reusedTokens: 0,
        },
        error: '',
      },
    ],
  },
};

describe('floor10Comparacao — relatório A/B copiável', () => {
  it('pareia a mesma pergunta e preserva respostas e medições dos dois lados', () => {
    const report = formatFloor10ComparisonReport(DATA);
    expect(report).toContain('COMPARAÇÃO NORMAL × N-GRAM');
    expect(report).toContain('NORMAL · WLLAMA OFICIAL');
    expect(report).toContain('N-GRAM · AUTO-ESPECULAÇÃO');
    expect(report).toContain('#1 PERGUNTA: Qual é o seu nome?');
    expect(report).toContain('Meu nome é Nilo Azevedo.');
    expect(report).toContain('Eu sou Nilo Azevedo.');
    expect(report).toContain('#1: total normal 30.0s × n-gram 24.0s');
    expect(report).toContain('fala normal 2.10 tok/s × n-gram 3.20 tok/s');
    expect(report).toContain('últimos estágios da carga:');
    expect(report).toContain('speculative decoding context initialized');
  });

  it('reconstrói o histórico isolado de uma versão', () => {
    expect(comparisonHistory(DATA.results.normal)).toEqual([
      { role: 'user', content: 'Qual é o seu nome?' },
      { role: 'assistant', content: 'Meu nome é Nilo Azevedo.' },
    ]);
  });

  it('continua copiável quando só um lado foi executado', () => {
    const report = formatFloor10ComparisonReport({
      ...DATA,
      loads: { normal: DATA.loads.normal },
      results: { normal: DATA.results.normal, ngram: [] },
    });
    expect(report).toContain('carga: ainda não executada');
    expect(report).toContain('perguntas: nenhuma executada');
    expect(report).not.toContain('undefined');
  });
});

describe('a etiqueta de velocidade não pode assustar à toa', () => {
    // ── TRÊS FALSOS ALARMES, O ÚLTIMO COM PRINT ───────────────────────────
    //
    // "leitura 2 tok/s · fala 2 tok/s" parece catastrófico e é o oposto: com
    // `cache_prompt` ligado, quase todo o prompt vem de graça e sobram poucos
    // tokens de trabalho real, que divididos pelo custo fixo da chamada dão um
    // número minúsculo.
    //
    // O arquivo já contava DOIS episódios de caçar um problema que não existia
    // por causa dessa linha. Aconteceu o terceiro: o dono do jogo mandou o
    // print exatamente dela como evidência de erro. A guarda estava lá — e
    // comparava os valores CRUS enquanto a tela mostrava os ARREDONDADOS.
    const t = (over: Record<string, number>) => ({
        prompt_n: 303, cache_n: 273, prompt_per_second: 2.4, predicted_per_second: 1.6,
        ...over,
    } as never);

    it('leitura some quando ela APARECERIA igual à fala', () => {
        // Os números exatos do print: 303 lidos, 273 reaproveitados. Cru,
        // 2,4 > 1,6 e a guarda aprovava; arredondado, "2" e "2".
        const s = formatTimings(t({}));
        expect(s).not.toContain('leitura');
        expect(s).toContain('fala 2 tok/s');
        expect(s).toContain('273 reaproveitados');
    });

    it('mas continua aparecendo quando informa de verdade', () => {
        // Prefill é em lote e geração é token a token: leitura MUITO acima da
        // fala é o normal, e aí o número diz alguma coisa.
        expect(formatTimings(t({ prompt_per_second: 40, predicted_per_second: 3 })))
            .toContain('leitura 40 tok/s');
    });

    it('e some quando quase tudo veio do cache — trabalho real minúsculo', () => {
        // 303 lidos com 300 reaproveitados: 3 tokens de trabalho, abaixo do
        // piso. A taxa aí é custo fixo dividido por três, não vazão.
        expect(formatTimings(t({ cache_n: 300, prompt_per_second: 9 })))
            .not.toContain('leitura');
    });
});
