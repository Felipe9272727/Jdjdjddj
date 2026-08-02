import type { Floor10Runtime } from './floor10Especulativa';
import type { NpcMsg } from './npcStore';

export const FLOOR10_RUNTIME_NAMES: Record<Floor10Runtime, string> = {
  normal: 'Normal · wllama oficial',
  ngram: 'N-gram · auto-especulação',
};

export type Floor10LoadResult = {
  downloadMs: number | null;
  /** Só a fase posterior ao download (ou a carga inteira quando já estava em cache). */
  modelMs: number;
  prewarmMs: number;
  /** Do toque em carregar até poder perguntar. */
  readyMs: number;
  runtimeLabel: string;
  error: string;
  /** Últimos sinais do Worker/llama.cpp durante a carga, já prontos para copiar. */
  loadTrace: string[];
};

export type Floor10QuestionMetrics = {
  tps: number | null;
  fps: number | null;
  readSeconds: number | null;
  readTps: number | null;
  readTokens: number | null;
  reusedTokens: number | null;
};

export type Floor10QuestionResult = {
  questionId: number;
  question: string;
  answer: string;
  totalMs: number;
  firstTokenMs: number | null;
  runtimeLabel: string;
  metrics: Floor10QuestionMetrics;
  error: string;
};

export type Floor10ComparisonEnvironment = {
  build: string;
  userAgent: string;
  cores: number | null;
  deviceMemoryGB: number | null;
  isolated: boolean;
};

export type Floor10ComparisonData = {
  generatedAt: string;
  environment: Floor10ComparisonEnvironment;
  loads: Partial<Record<Floor10Runtime, Floor10LoadResult>>;
  results: Record<Floor10Runtime, Floor10QuestionResult[]>;
};

const fmtSeconds = (ms: number | null): string =>
  ms === null || !Number.isFinite(ms) ? '—' : `${(ms / 1000).toFixed(1)}s`;

const fmtNumber = (value: number | null, suffix = ''): string =>
  value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}${suffix}`;

function formatLoad(load: Floor10LoadResult | undefined): string[] {
  if (!load) return ['carga: ainda não executada'];
  const lines = [
    `download concluído: ${fmtSeconds(load.downloadMs)}`,
    `instalação na memória: ${fmtSeconds(load.modelMs)}`,
    `prewarm da persona: ${fmtSeconds(load.prewarmMs)}`,
    `total até poder perguntar: ${fmtSeconds(load.readyMs)}`,
    `runtime detectado: ${load.runtimeLabel || '—'}`,
    `erro de carga: ${load.error || 'nenhum'}`,
  ];
  if (load.loadTrace.length > 0) {
    lines.push('últimos estágios da carga:');
    lines.push(...load.loadTrace.map((entry) => `  ${entry}`));
  } else {
    lines.push('últimos estágios da carga: nenhum sinal registrado');
  }
  return lines;
}

function formatQuestion(result: Floor10QuestionResult): string[] {
  const metrics = result.metrics;
  return [
    `#${result.questionId} PERGUNTA: ${result.question}`,
    `tempo total: ${fmtSeconds(result.totalMs)}`,
    `primeiro texto: ${fmtSeconds(result.firstTokenMs)}`,
    `fala: ${fmtNumber(metrics.tps, ' tok/s')}`,
    `leitura: ${fmtNumber(metrics.readTps, ' tok/s')} · ${fmtNumber(metrics.readSeconds, 's')}`,
    `tokens: ${fmtNumber(metrics.readTokens)} lidos · ${fmtNumber(metrics.reusedTokens)} reaproveitados`,
    `FPS durante a fala: ${fmtNumber(metrics.fps)}`,
    `runtime: ${result.runtimeLabel || '—'}`,
    `erro: ${result.error || 'nenhum'}`,
    `RESPOSTA: ${result.answer || '(sem resposta)'}`,
  ];
}

/** Histórico isolado por runtime ao alternar as duas metades do teste. */
export function comparisonHistory(results: Floor10QuestionResult[]): NpcMsg[] {
  return results.flatMap((result): NpcMsg[] => {
    const messages: NpcMsg[] = [{ role: 'user', content: result.question }];
    if (result.answer) messages.push({ role: 'assistant', content: result.answer });
    return messages;
  });
}

/** Texto simples e completo: feito para colar inteiro na conversa. */
export function formatFloor10ComparisonReport(data: Floor10ComparisonData): string {
  const { environment } = data;
  const lines = [
    '=== ANDAR 10 · COMPARAÇÃO NORMAL × N-GRAM ===',
    `gerado: ${data.generatedAt}`,
    `build: ${environment.build || '?'}`,
    `aparelho: ${environment.userAgent || '?'}`,
    `núcleos: ${environment.cores ?? '?'} · RAM informada: ${environment.deviceMemoryGB ?? '?'} GB`,
    `isolamento/pthreads: ${environment.isolated ? 'sim' : 'não'}`,
    'controle: mesmo SmolLM3-Q4_K_M, cache, perguntas e aparelho; muda apenas o runtime',
    '',
  ];

  for (const runtime of ['normal', 'ngram'] as const) {
    lines.push(`--- ${FLOOR10_RUNTIME_NAMES[runtime].toUpperCase()} ---`);
    lines.push(...formatLoad(data.loads[runtime]));
    const results = data.results[runtime];
    if (results.length === 0) lines.push('perguntas: nenhuma executada');
    for (const result of results) {
      lines.push('', ...formatQuestion(result));
    }
    lines.push('');
  }

  lines.push('--- PARES DIRETOS ---');
  const ids = new Set([
    ...data.results.normal.map((result) => result.questionId),
    ...data.results.ngram.map((result) => result.questionId),
  ]);
  if (ids.size === 0) lines.push('nenhum par executado');
  for (const id of [...ids].sort((a, b) => a - b)) {
    const normal = data.results.normal.find((result) => result.questionId === id);
    const ngram = data.results.ngram.find((result) => result.questionId === id);
    lines.push(
      `#${id}: total normal ${fmtSeconds(normal?.totalMs ?? null)} × n-gram ${fmtSeconds(ngram?.totalMs ?? null)}`,
      `    fala normal ${fmtNumber(normal?.metrics.tps ?? null, ' tok/s')} × n-gram ${fmtNumber(ngram?.metrics.tps ?? null, ' tok/s')}`,
    );
  }

  return lines.join('\n').trim();
}
