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
