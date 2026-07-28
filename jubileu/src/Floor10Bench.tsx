/**
 * floor10-dev.tsx — BANCADA do cérebro do Nilo, SEM o jogo em volta.
 *
 * Existe por um motivo de medição: no jogo inteiro é impossível saber se a
 * demora vem do modelo ou de tudo o que roda junto (render 3D, física, IA de
 * utilidade, React). Aqui não há Canvas, não há cena, não há nada além do
 * wllama — então o número que aparece é o custo REAL do modelo naquele
 * aparelho. Comparando esta página com o Andar 10 de verdade dá pra atribuir a
 * culpa sem chutar.
 *
 * Também é a "aba de debug": mostra ambiente, fases, erros e o cronômetro de
 * cada etapa (baixar → instalar na memória → primeiro token → fim).
 *
 * Run:  cd jubileu && npm run dev  →  http://localhost:3000/floor10.html
 */
import React, { useEffect, useRef, useState } from 'react';
import { npc, npcSubscribe, npcReset } from './npc/npcStore';
import { initLLM, sendToNpc, FLOOR10_MODEL, cpuThreadCount, speechGpuLayerCount } from './npc/wllamaEngine';
import {
    formatGB, planModelCache, probeModelBytes, readStorageEstimate,
} from './npc/floor10ModelStorage';

type Marco = { nome: string; t: number };

const AMBIENTE = () => ({
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webgpu: 'gpu' in navigator,
    threadsQueVamosUsar: cpuThreadCount(),
    camadasNaGpu: speechGpuLayerCount(),
    modelo: FLOOR10_MODEL.url,
});

/**
 * A conta que decide tudo: cota do navegador × tamanho do modelo. Quando o
 * modelo não cabe, o Worker do wllama estoura QuotaExceeded e a carga trava
 * sem mensagem — então este quadro é a primeira coisa a olhar num aparelho novo.
 */
async function medirCota() {
    const [estimativa, bytes] = await Promise.all([
        readStorageEstimate(),
        probeModelBytes(FLOOR10_MODEL.url, FLOOR10_MODEL.sizeBytes),
    ]);
    const plano = planModelCache(estimativa, bytes);
    return {
        cota: estimativa.quota === null ? 'desconhecida' : formatGB(estimativa.quota),
        emUso: formatGB(estimativa.usage),
        modeloPesa: bytes === null ? 'desconhecido' : formatGB(bytes),
        cabe: plano.ok ? 'SIM' : 'NÃO',
        recado: plano.message || '—',
    };
}

const Bancada: React.FC = () => {
    const [, force] = useState(0);
    const [marcos, setMarcos] = useState<Marco[]>([]);
    const [erros, setErros] = useState<string[]>([]);
    const [texto, setTexto] = useState('Oi, qual o seu nome?');
    const [cota, setCota] = useState<Record<string, string> | null>(null);
    const t0 = useRef<number | null>(null);
    const visto = useRef(new Set<string>());
    const ambiente = useRef(AMBIENTE());

    useEffect(() => npcSubscribe(() => force((n) => n + 1)), []);
    useEffect(() => { void medirCota().then(setCota); }, []);

    // Erros do console e promessas rejeitadas viram lista visível: no celular
    // não dá pra abrir o DevTools.
    useEffect(() => {
        const onErr = (e: ErrorEvent) => setErros((l) => [...l, `erro: ${e.message}`].slice(-12));
        const onRej = (e: PromiseRejectionEvent) =>
            setErros((l) => [...l, `promessa: ${String(e.reason).slice(0, 200)}`].slice(-12));
        window.addEventListener('error', onErr);
        window.addEventListener('unhandledrejection', onRej);
        return () => {
            window.removeEventListener('error', onErr);
            window.removeEventListener('unhandledrejection', onRej);
        };
    }, []);

    // Cada transição interessante vira um marco com o tempo desde o clique.
    const marco = (nome: string) => {
        if (t0.current === null || visto.current.has(nome)) return;
        visto.current.add(nome);
        setMarcos((l) => [...l, { nome, t: (performance.now() - t0.current!) / 1000 }]);
    };
    if (npc.phase === 'loading' && npc.loadProgress >= 1) marco('download completo');
    if (npc.phase === 'ready') marco('modelo pronto');
    if (npc.phase === 'thinking') marco('começou a pensar');
    if (npc.streaming.length > 0) marco('primeiro token');
    if (npc.phase === 'ready' && npc.history.at(-1)?.role === 'assistant') marco('resposta completa');

    const comecar = (fn: () => void) => {
        t0.current = performance.now();
        visto.current = new Set();
        setMarcos([]);
        fn();
    };

    const box: React.CSSProperties = {
        background: '#141419', border: '1px solid #2a2a33', borderRadius: 8,
        padding: 12, marginBottom: 12,
    };
    const btn: React.CSSProperties = {
        background: '#2d6cdf', color: '#fff', border: 0, borderRadius: 6,
        padding: '10px 16px', fontSize: 15, cursor: 'pointer', marginRight: 8,
    };

    return (
        <div style={{
            font: '14px/1.5 ui-monospace, Menlo, Consolas, monospace',
            color: '#d8d8e0', padding: 16, maxWidth: 760, margin: '0 auto',
        }}>
            <h1 style={{ fontSize: 18, margin: '4px 0 14px' }}>
                Andar 10 — bancada do cérebro (sem jogo em volta)
            </h1>

            <div style={box}>
                <b>Ambiente</b>
                <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#9fd3a0' }}>
                    {JSON.stringify(ambiente.current, null, 2)}
                </pre>
            </div>

            <div style={{ ...box, borderColor: cota?.cabe === 'NÃO' ? '#8a2a2a' : '#2a2a33' }}>
                <b>Espaço no navegador</b>
                {cota === null ? (
                    <div style={{ color: '#777' }}>medindo…</div>
                ) : (
                    <pre style={{
                        margin: '8px 0 0', whiteSpace: 'pre-wrap',
                        color: cota.cabe === 'NÃO' ? '#ff9c9c' : '#9fd3a0',
                    }}>
                        {JSON.stringify(cota, null, 2)}
                    </pre>
                )}
            </div>

            <div style={box}>
                <b>Estado</b>
                <div style={{ marginTop: 6 }}>fase: <b style={{ color: '#ffd479' }}>{npc.phase}</b></div>
                <div>etiqueta: {npc.modelLabel || '—'}</div>
                <div>carga: {npc.loadText || '—'} ({Math.round(npc.loadProgress * 100)}%)</div>
                {npc.error ? <div style={{ color: '#ff8080' }}>erro: {npc.error}</div> : null}
                {npc.streaming ? (
                    <div style={{ marginTop: 6, color: '#a9c9ff' }}>saindo: {npc.streaming}</div>
                ) : null}
            </div>

            <div style={box}>
                <button
                    type="button"
                    style={btn}
                    onClick={() => comecar(() => { void initLLM(); })}
                >
                    1 — carregar o modelo
                </button>
                <button
                    type="button"
                    style={btn}
                    onClick={() => comecar(() => { void sendToNpc(texto); })}
                >
                    2 — mandar a fala
                </button>
                <button
                    type="button"
                    style={{ ...btn, background: '#444' }}
                    onClick={() => { npcReset(); setMarcos([]); setErros([]); }}
                >
                    limpar
                </button>
                <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    style={{
                        display: 'block', marginTop: 10, width: '100%', boxSizing: 'border-box',
                        background: '#0e0e12', color: '#d8d8e0', border: '1px solid #2a2a33',
                        borderRadius: 6, padding: 8, font: 'inherit',
                    }}
                />
            </div>

            <div style={box}>
                <b>Cronômetro</b>
                {marcos.length === 0 ? (
                    <div style={{ color: '#777' }}>nada medido ainda</div>
                ) : marcos.map((m) => (
                    <div key={m.nome}>
                        {m.nome}: <b style={{ color: '#ffd479' }}>{m.t.toFixed(1)}s</b>
                    </div>
                ))}
            </div>

            <div style={box}>
                <b>Conversa</b>
                {npc.history.length === 0 ? <div style={{ color: '#777' }}>vazia</div> : null}
                {npc.history.map((m, i) => (
                    <div key={i} style={{ marginTop: 4, color: m.role === 'user' ? '#8fb8ff' : '#c8e6c9' }}>
                        <b>{m.role}:</b> {m.content}
                    </div>
                ))}
            </div>

            <div style={box}>
                <b>Erros</b>
                {erros.length === 0 ? <div style={{ color: '#777' }}>nenhum</div> : null}
                {erros.map((e, i) => (
                    <div key={i} style={{ color: '#ff9c9c' }}>{e}</div>
                ))}
            </div>
        </div>
    );
};

// Mesmo gancho da sonda headless, para automatizar a medição desta página.
(window as unknown as Record<string, unknown>).__f10bench = {
    npc, initLLM, send: (t: string) => void sendToNpc(t), ambiente: AMBIENTE,
};

export default Bancada;
