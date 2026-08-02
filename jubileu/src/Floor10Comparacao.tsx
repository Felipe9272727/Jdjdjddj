import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  comparisonHistory,
  FLOOR10_RUNTIME_NAMES,
  formatFloor10ComparisonReport,
  type Floor10LoadResult,
  type Floor10QuestionMetrics,
  type Floor10QuestionResult,
} from './npc/floor10Comparacao';
import { eventosDaCaixaPreta } from './npc/floor10CaixaPreta';
import { downloadLine, formatBytes } from './npc/floor10Download';
import {
  runtimeFloor10,
  type Floor10Runtime,
} from './npc/floor10Especulativa';
import { npc, npcSet, npcSubscribe, useNpc } from './npc/npcStore';
import {
  FLOOR10_MODEL,
  conversationModelLoadTrace,
  initLLM,
  selectConversationRuntime,
  sendToNpc,
  settlePersonaPrewarm,
} from './npc/wllamaEngine';

type BusyState = 'switching' | 'loading' | 'sending' | null;
type ComparisonQuestion = { id: number; text: string };
type ResultsByRuntime = Record<Floor10Runtime, Floor10QuestionResult[]>;
type LoadClock = { totalMs: number; memoryMs: number | null };

const EMPTY_RESULTS = (): ResultsByRuntime => ({ normal: [], ngram: [] });

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function metricsFromLastEvent(startIndex: number): Floor10QuestionMetrics {
  const event = [...eventosDaCaixaPreta().slice(startIndex)]
    .reverse()
    .find((candidate) => candidate.tipo === 'fala:fim');
  const data = event?.dados ?? {};
  return {
    tps: asNumber(data.fala_tps) ?? asNumber(data.tps),
    fps: asNumber(data.fps),
    readSeconds: asNumber(data.leitura_s),
    readTps: asNumber(data.leitura_tps),
    readTokens: asNumber(data.lidos),
    reusedTokens: asNumber(data.reusados),
  };
}

const seconds = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);

const metric = (value: number | null, suffix = ''): string => (value === null ? '—' : `${value.toFixed(2)}${suffix}`);

const normalizeQuestion = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();

const Floor10Comparacao: React.FC = () => {
  const st = useNpc();
  const [runtime, setRuntime] = useState<Floor10Runtime>(() => runtimeFloor10());
  const [busy, setBusy] = useState<BusyState>(null);
  const [activeReady, setActiveReady] = useState(false);
  const [question, setQuestion] = useState('');
  const [questions, setQuestions] = useState<ComparisonQuestion[]>([]);
  const [results, setResults] = useState<ResultsByRuntime>(EMPTY_RESULTS);
  const [loads, setLoads] = useState<Partial<Record<Floor10Runtime, Floor10LoadResult>>>({});
  const [copied, setCopied] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [loadClock, setLoadClock] = useState<LoadClock>({ totalMs: 0, memoryMs: null });
  const [liveLoadTrace, setLiveLoadTrace] = useState<string[]>([]);
  const nextQuestionId = useRef(1);
  const loadTicker = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const environment = useRef({
    build: (globalThis as { __TNE_BUILD__?: { build?: string } }).__TNE_BUILD__?.build ?? '?',
    userAgent: navigator.userAgent,
    cores: Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    isolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
  });

  useEffect(() => {
    npcSet({
      phase: 'cold',
      history: [],
      streaming: '',
      speaking: false,
      modelLabel: '',
      loadText: '',
      loadProgress: 0,
      error: '',
    });
    return () => {
      if (loadTicker.current !== null) globalThis.clearInterval(loadTicker.current);
      // O motor da fala é global e pertence à aba, não a esta tela. Mantê-lo
      // vivo evita remontar 1,92 GB quando React remonta a bancada ou o jogador
      // fecha uma interface. O navegador libera Worker/WASM ao fechar a aba;
      // a troca Normal <-> N-gram continua descarregando explicitamente porque
      // um celular não comporta os dois SmolLM3 residentes ao mesmo tempo.
    };
  }, []);

  const report = useMemo(
    () =>
      formatFloor10ComparisonReport({
        generatedAt: new Date().toISOString(),
        environment: environment.current,
        loads,
        results,
      }),
    [loads, results],
  );

  const pendingQuestions = questions.filter(
    (candidate) => !results[runtime].some((result) => result.questionId === candidate.id),
  );

  const loadRuntime = async (): Promise<boolean> => {
    if (busy) return false;
    setBusy('loading');
    setActiveReady(false);
    const started = performance.now();
    let downloadAt: number | null = null;
    setLoadClock({ totalMs: 0, memoryMs: null });
    setLiveLoadTrace([]);
    loadTicker.current = globalThis.setInterval(() => {
      const now = performance.now();
      setLoadClock({
        totalMs: now - started,
        memoryMs: downloadAt === null ? null : now - downloadAt,
      });
      setLiveLoadTrace(conversationModelLoadTrace());
    }, 1000);
    const unsubscribe = npcSubscribe(() => {
      if (downloadAt === null && npc.phase === 'loading' && npc.loadProgress >= 1) {
        downloadAt = performance.now();
      }
      setLiveLoadTrace(conversationModelLoadTrace());
    });
    try {
      await initLLM();
      const modelAt = performance.now();
      await settlePersonaPrewarm();
      const readyAt = performance.now();
      const load: Floor10LoadResult = {
        downloadMs: downloadAt === null ? null : downloadAt - started,
        modelMs: modelAt - (downloadAt ?? started),
        prewarmMs: readyAt - modelAt,
        readyMs: readyAt - started,
        runtimeLabel: npc.modelLabel,
        error: npc.error,
        loadTrace: conversationModelLoadTrace(),
      };
      setLoads((current) => ({ ...current, [runtime]: load }));
      setActiveReady(!npc.error);
      return !npc.error;
    } catch (error) {
      const ended = performance.now();
      const message = error instanceof Error ? error.message : String(error);
      setLoads((current) => ({
        ...current,
        [runtime]: {
          downloadMs: downloadAt === null ? null : downloadAt - started,
          modelMs: ended - (downloadAt ?? started),
          prewarmMs: 0,
          readyMs: ended - started,
          runtimeLabel: npc.modelLabel,
          error: npc.error || message,
          loadTrace: conversationModelLoadTrace(),
        },
      }));
      setActiveReady(false);
      return false;
    } finally {
      unsubscribe();
      const ended = performance.now();
      if (loadTicker.current !== null) {
        globalThis.clearInterval(loadTicker.current);
        loadTicker.current = null;
      }
      setLoadClock({
        totalMs: ended - started,
        memoryMs: downloadAt === null ? null : ended - downloadAt,
      });
      setLiveLoadTrace(conversationModelLoadTrace());
      setBusy(null);
    }
  };

  const switchRuntime = async (next: Floor10Runtime) => {
    if (busy || next === runtime) return;
    setBusy('switching');
    setActiveReady(false);
    try {
      await selectConversationRuntime(next);
      setRuntime(next);
      npcSet({
        history: comparisonHistory(results[next]),
        phase: 'cold',
        streaming: '',
        speaking: false,
        error: '',
      });
    } finally {
      setBusy(null);
    }
  };

  const sendQuestion = async () => {
    const text = question.trim();
    if (!text || busy || !activeReady) return;

    const normalized = normalizeQuestion(text);
    let selected = questions.find(
      (candidate) =>
        normalizeQuestion(candidate.text) === normalized &&
        !results[runtime].some((result) => result.questionId === candidate.id),
    );
    if (!selected) {
      selected = { id: nextQuestionId.current++, text };
      setQuestions((current) => [...current, selected!]);
    }

    setBusy('sending');
    setQuestion('');
    const started = performance.now();
    let firstTokenAt: number | null = null;
    const historyStart = npc.history.length;
    const eventStart = eventosDaCaixaPreta().length;
    const unsubscribe = npcSubscribe(() => {
      if (firstTokenAt === null && npc.streaming.trim()) firstTokenAt = performance.now();
    });

    try {
      // A comparação é do SmolLM3. Olhos/vontade responderem em 0 ms
      // tornaria o relatório bonito e completamente inválido.
      await sendToNpc(text, { forceMainModel: true });
    } finally {
      const ended = performance.now();
      unsubscribe();
      const additions = npc.history.slice(historyStart);
      const answer = [...additions].reverse().find((message) => message.role === 'assistant')?.content ?? '';
      const result: Floor10QuestionResult = {
        questionId: selected.id,
        question: selected.text,
        answer,
        totalMs: ended - started,
        firstTokenMs: firstTokenAt === null ? null : firstTokenAt - started,
        runtimeLabel: npc.modelLabel,
        metrics: metricsFromLastEvent(eventStart),
        error: npc.error,
      };
      setResults((current) => ({
        ...current,
        [runtime]: [...current[runtime], result],
      }));
      if (npc.error && !answer) setActiveReady(false);
      setBusy(null);
    }
  };

  const copyReport = async () => {
    setShowReport(true);
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  };

  const resetComparison = () => {
    setQuestions([]);
    setResults(EMPTY_RESULTS());
    setLoads({});
    setQuestion('');
    nextQuestionId.current = 1;
    npcSet({ history: [], streaming: '', error: '' });
  };

  const currentResults = results[runtime];
  const currentLoad = loads[runtime];
  const isLoading = busy === 'loading';
  const visibleLoadTrace = isLoading ? liveLoadTrace : currentLoad?.loadTrace ?? [];
  const lastLoadSignal = visibleLoadTrace[visibleLoadTrace.length - 1] ?? '';

  return (
    <main className="f10compare">
      <style>{COMPARISON_CSS}</style>
      <header className="f10compare__hero">
        <span className="f10compare__eyebrow">ANDAR 10 · TESTE A/B LOCAL</span>
        <h1>Normal × N-gram</h1>
        <p>
          O mesmo <strong>{FLOOR10_MODEL.label}</strong>, no mesmo cache e aparelho. Só o runtime muda. Execute as
          perguntas numa versão, troque e repita.
        </p>
      </header>

      <section className="f10compare__card f10compare__sticky" aria-label="Selecionar runtime">
        <div className="f10compare__tabs">
          {(['normal', 'ngram'] as const).map((candidate) => (
            <button
              type="button"
              key={candidate}
              className={candidate === runtime ? 'is-active' : ''}
              disabled={busy !== null}
              onClick={() => {
                void switchRuntime(candidate);
              }}
            >
              <span>{candidate === 'normal' ? 'Normal' : 'N-gram'}</span>
              <small>{results[candidate].length} resposta(s)</small>
            </button>
          ))}
        </div>
        <div className="f10compare__mode-line">
          <div>
            <b>{FLOOR10_RUNTIME_NAMES[runtime]}</b>
            <span>{activeReady ? 'pronto para perguntar' : 'descarregado'}</span>
          </div>
          <button
            type="button"
            className="f10compare__primary f10compare__compact"
            disabled={busy !== null || activeReady}
            onClick={() => {
              void loadRuntime();
            }}
          >
            {busy === 'loading' ? 'Carregando…' : activeReady ? 'Pronto ✓' : 'Carregar versão'}
          </button>
        </div>
      </section>

      <section className="f10compare__card" aria-live="polite">
        <div className="f10compare__section-title">
          <h2>Estado</h2>
          <span className={`f10compare__phase phase-${st.phase}`}>{st.phase}</span>
        </div>
        <strong className="f10compare__status-text">{st.loadText || 'aguardando você carregar'}</strong>
        {isLoading ? (
          <>
            <div className="f10compare__progress" aria-label={`Carga ${Math.round(st.loadProgress * 100)}%`}>
              <i style={{ width: `${Math.max(1, st.loadProgress * 100)}%` }} />
            </div>
            <span className="f10compare__muted">
              {st.loadProgress >= 1
                ? `${formatBytes(st.loadDownload.totalBytes || st.loadDownload.bytes)} no cache`
                : downloadLine(st.loadDownload)}{' '}
              · {Math.round(st.loadProgress * 100)}% ·{' '}
              {loadClock.memoryMs === null
                ? `total ${seconds(loadClock.totalMs)}`
                : `memória ${seconds(loadClock.memoryMs)} · total ${seconds(loadClock.totalMs)}`}
            </span>
            {loadClock.memoryMs !== null && loadClock.memoryMs >= 30_000 ? (
              <span className="f10compare__memory-note">
                O arquivo já terminou de baixar. Agora o runtime está montando o modelo e os buffers na memória.
              </span>
            ) : null}
          </>
        ) : null}
        {lastLoadSignal ? (
          <span className="f10compare__native-stage">Último sinal: {lastLoadSignal}</span>
        ) : null}
        {currentLoad ? (
          <div className="f10compare__stats four">
            <Metric label="Download" value={seconds(currentLoad.downloadMs)} />
            <Metric label="Na memória" value={seconds(currentLoad.modelMs)} />
            <Metric label="Prewarm" value={seconds(currentLoad.prewarmMs)} />
            <Metric label="Total" value={seconds(currentLoad.readyMs)} />
          </div>
        ) : null}
        {st.error ? <div className="f10compare__error">{st.error}</div> : null}
      </section>

      <section className="f10compare__card">
        <div className="f10compare__section-title">
          <h2>Pergunta</h2>
          <span>{currentResults.length} concluída(s)</span>
        </div>
        {pendingQuestions.length > 0 ? (
          <div className="f10compare__pending">
            <b>Faltam nesta versão</b>
            {pendingQuestions.map((item) => (
              <button type="button" key={item.id} onClick={() => setQuestion(item.text)}>
                #{item.id} {item.text}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          value={question}
          rows={3}
          disabled={busy !== null}
          placeholder={activeReady ? 'Digite exatamente a pergunta do teste…' : 'Carregue a versão primeiro…'}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button
          type="button"
          className="f10compare__primary f10compare__send"
          disabled={!activeReady || busy !== null || !question.trim()}
          onClick={() => {
            void sendQuestion();
          }}
        >
          {busy === 'sending' ? 'Nilo está respondendo…' : `Executar no ${runtime === 'normal' ? 'Normal' : 'N-gram'}`}
        </button>
        {st.streaming ? <div className="f10compare__stream">{st.streaming}</div> : null}
      </section>

      <section className="f10compare__results">
        {currentResults.length === 0 ? (
          <div className="f10compare__empty">As respostas e medições desta versão aparecerão aqui.</div>
        ) : (
          currentResults.map((result) => (
            <article className="f10compare__card f10compare__result" key={`${runtime}-${result.questionId}`}>
              <span className="f10compare__eyebrow">PERGUNTA #{result.questionId}</span>
              <h3>{result.question}</h3>
              <p>{result.answer || '(sem resposta)'}</p>
              <div className="f10compare__stats">
                <Metric label="Total" value={seconds(result.totalMs)} />
                <Metric label="1º texto" value={seconds(result.firstTokenMs)} />
                <Metric label="Fala" value={metric(result.metrics.tps, ' tok/s')} />
                <Metric label="Leitura" value={metric(result.metrics.readTps, ' tok/s')} />
              </div>
              {result.error ? <div className="f10compare__error">{result.error}</div> : null}
            </article>
          ))
        )}
      </section>

      <section className="f10compare__card f10compare__export">
        <h2>Resultado completo</h2>
        <p>Depois de testar os dois lados, copie e cole o texto inteiro aqui na conversa.</p>
        <button
          type="button"
          className="f10compare__primary"
          onClick={() => {
            void copyReport();
          }}
        >
          {copied ? 'Copiado ✓' : 'Copiar comparação'}
        </button>
        <button type="button" className="f10compare__secondary" disabled={busy !== null} onClick={resetComparison}>
          Limpar medições
        </button>
        {showReport ? <textarea className="f10compare__report" readOnly rows={12} value={report} /> : null}
      </section>
    </main>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="f10compare__metric">
    <span>{label}</span>
    <b>{value}</b>
  </div>
);

const COMPARISON_CSS = `
  :root { color-scheme: dark; }
  body { margin: 0; background: #07080b; }
  .f10compare { min-height: 100dvh; box-sizing: border-box; padding: 18px 14px 44px; color: #f4f5f8; background: radial-gradient(circle at 50% -10%, #39260c 0, #111016 34%, #07080b 68%); font: 16px/1.45 Inter, system-ui, sans-serif; }
  .f10compare > * { width: min(100%, 760px); margin-left: auto; margin-right: auto; box-sizing: border-box; }
  .f10compare__hero { padding: 18px 4px 10px; }
  .f10compare__hero h1 { margin: 5px 0 8px; font-size: clamp(30px, 9vw, 48px); line-height: 1; letter-spacing: -0.04em; }
  .f10compare__hero p { margin: 0; color: #b7bac3; max-width: 620px; }
  .f10compare__eyebrow { color: #f5bd4f; font-size: 12px; font-weight: 800; letter-spacing: .16em; }
  .f10compare__card { margin-top: 12px; padding: 16px; background: rgba(22,23,29,.96); border: 1px solid #343640; border-radius: 18px; box-shadow: 0 18px 44px rgba(0,0,0,.2); }
  .f10compare__sticky { position: sticky; top: 8px; z-index: 5; backdrop-filter: blur(14px); }
  .f10compare__tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px; background: #0b0c10; border-radius: 14px; }
  .f10compare__tabs button { min-height: 58px; padding: 8px; border: 1px solid transparent; border-radius: 11px; color: #a6a9b2; background: transparent; font: inherit; font-weight: 800; touch-action: manipulation; }
  .f10compare__tabs button.is-active { color: #161008; background: linear-gradient(135deg, #ffd875, #efa92d); box-shadow: 0 6px 18px rgba(239,169,45,.22); }
  .f10compare__tabs small { display: block; margin-top: 2px; font-size: 11px; opacity: .72; }
  .f10compare__mode-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
  .f10compare__mode-line div { min-width: 0; }
  .f10compare__mode-line b, .f10compare__mode-line span { display: block; overflow-wrap: anywhere; }
  .f10compare__mode-line span { color: #9296a1; font-size: 13px; }
  .f10compare button, .f10compare textarea { font: inherit; }
  .f10compare button { cursor: pointer; }
  .f10compare button:disabled { cursor: not-allowed; opacity: .48; }
  .f10compare__primary, .f10compare__secondary { min-height: 50px; padding: 11px 16px; border-radius: 13px; border: 0; font-weight: 800; touch-action: manipulation; }
  .f10compare__primary { color: #111318; background: linear-gradient(135deg, #ffd875, #efa92d); }
  .f10compare__secondary { margin-left: 8px; color: #dddfe7; background: #292b33; }
  .f10compare__compact { min-height: 44px; flex: 0 0 auto; }
  .f10compare__section-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }
  .f10compare__section-title h2, .f10compare__export h2 { margin: 0; font-size: 18px; }
  .f10compare__section-title > span { color: #9296a1; font-size: 12px; }
  .f10compare__phase { padding: 3px 8px; border-radius: 999px; background: #292b33; text-transform: uppercase; font-weight: 800; letter-spacing: .05em; }
  .phase-ready { color: #8ee4aa !important; } .phase-error { color: #ff9898 !important; } .phase-loading, .phase-thinking { color: #f5bd4f !important; }
  .f10compare__status-text { display: block; overflow-wrap: anywhere; }
  .f10compare__progress { height: 10px; margin: 13px 0 7px; overflow: hidden; border-radius: 999px; background: #30323a; }
  .f10compare__progress i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #eea824, #ffda72); transition: width .2s ease; }
  .f10compare__muted { color: #9296a1; font-size: 13px; overflow-wrap: anywhere; }
  .f10compare__memory-note { display: block; margin-top: 8px; color: #d8bf82; font-size: 13px; overflow-wrap: anywhere; }
  .f10compare__native-stage { display: block; margin-top: 8px; padding: 8px 10px; color: #b9c9e8; background: #101725; border: 1px solid #283958; border-radius: 10px; font: 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
  .f10compare__stats { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin-top: 14px; }
  .f10compare__stats.four { grid-template-columns: repeat(4, minmax(0,1fr)); }
  .f10compare__metric { min-width: 0; padding: 10px; border-radius: 12px; background: #0d0e13; }
  .f10compare__metric span, .f10compare__metric b { display: block; overflow-wrap: anywhere; }
  .f10compare__metric span { color: #8d909a; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .f10compare__metric b { margin-top: 2px; color: #f7d37b; font-size: 15px; }
  .f10compare textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 13px; color: #f5f6f8; background: #0b0c10; border: 1px solid #41434d; border-radius: 13px; outline: none; font-size: 16px; }
  .f10compare textarea:focus { border-color: #eeb144; box-shadow: 0 0 0 3px rgba(238,177,68,.12); }
  .f10compare__send { width: 100%; margin-top: 10px; }
  .f10compare__pending { display: grid; gap: 7px; margin: 0 0 12px; }
  .f10compare__pending b { font-size: 12px; color: #f5bd4f; text-transform: uppercase; letter-spacing: .08em; }
  .f10compare__pending button { min-height: 44px; padding: 9px 11px; text-align: left; color: #d9dbe2; background: #252730; border: 1px solid #3a3c46; border-radius: 11px; overflow-wrap: anywhere; }
  .f10compare__stream { margin-top: 12px; padding: 12px; color: #d8e5ff; background: #101725; border: 1px solid #23365b; border-radius: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .f10compare__results { margin-top: 0; }
  .f10compare__result h3 { margin: 6px 0 10px; font-size: 17px; overflow-wrap: anywhere; }
  .f10compare__result p { margin: 0; color: #d6d8de; white-space: pre-wrap; overflow-wrap: anywhere; }
  .f10compare__empty { margin-top: 12px; padding: 24px 16px; color: #777b86; text-align: center; border: 1px dashed #363842; border-radius: 16px; }
  .f10compare__error { margin-top: 12px; padding: 11px; color: #ffaaaa; background: #2a1317; border: 1px solid #6c2c34; border-radius: 11px; overflow-wrap: anywhere; }
  .f10compare__export p { margin: 5px 0 14px; color: #9da0aa; }
  .f10compare__report { margin-top: 12px; font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace !important; }
  @media (max-width: 520px) {
    .f10compare { padding-left: 10px; padding-right: 10px; }
    .f10compare__card { padding: 13px; border-radius: 16px; }
    .f10compare__sticky { top: 5px; }
    .f10compare__mode-line { align-items: stretch; flex-direction: column; }
    .f10compare__compact { width: 100%; }
    .f10compare__stats.four { grid-template-columns: 1fr 1fr; }
    .f10compare__secondary { margin: 8px 0 0; width: 100%; }
    .f10compare__export .f10compare__primary { width: 100%; }
  }
`;

export default Floor10Comparacao;
