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
import { coletarRelatorio, limparCaixaPreta } from './npc/floor10CaixaPreta';
import { npc, npcSubscribe, npcReset } from './npc/npcStore';
import {
    FLOOR10_GPU_MAX_LAYERS, floor10Gpu, layersThatFit, probeWebGpuAdapter,
} from './npc/floor10Gpu';
import {
    initLLM, sendToNpc, FLOOR10_MODEL, cpuThreadCount, speechGpuLayerCount,
    readSavedThreads, saveThreads,
} from './npc/wllamaEngine';
import {
    formatGB, medirModelo, planModelCache, readStorageEstimate,
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
    // `medirModelo` e não `probeModelBytes`: a fala vem em DOIS shards e um
    // `HEAD` só vê o primeiro. Este quadro chegou a dizer "o modelo pesa
    // 1,50 GB · cabe: SIM" para um granite de 2,59 GB — a resposta errada
    // justamente na tela que existe para responder isso.
    const [estimativa, medida] = await Promise.all([
        readStorageEstimate(),
        medirModelo(FLOOR10_MODEL.url),
    ]);
    const bytes = medida.total;
    const plano = planModelCache(estimativa, bytes);
    return {
        cota: estimativa.quota === null ? 'desconhecida' : formatGB(estimativa.quota),
        emUso: formatGB(estimativa.usage),
        modeloPesa: bytes === null
            ? 'desconhecido'
            : `${formatGB(bytes)}${medida.shards > 1 ? ` (${medida.shards} partes)` : ''}`,
        cabe: plano.ok ? 'SIM' : 'NÃO',
        recado: plano.message || '—',
    };
}

/**
 * Apaga o modelo guardado, dos DOIS lugares onde o wllama pode tê-lo posto.
 * A API dele só alcança o OPFS, então aqui varremos OPFS e Cache API na mão —
 * é o único jeito de sair de um cache que ficou inconsistente.
 */
async function limparTudo() {
    try {
        const raiz = await navigator.storage.getDirectory();
        const alvos: string[] = [];
        for await (const [nome] of (raiz as unknown as {
            entries: () => AsyncIterable<[string, unknown]>;
        }).entries()) alvos.push(nome);
        for (const nome of alvos) {
            await raiz.removeEntry(nome, { recursive: true }).catch(() => undefined);
        }
    } catch { /* navegador sem OPFS: segue para o Cache API */ }
    try {
        for (const nome of await caches.keys()) await caches.delete(nome);
    } catch { /* idem */ }
    return medirCota();
}

const Bancada: React.FC = () => {
    const [, force] = useState(0);
    const [marcos, setMarcos] = useState<Marco[]>([]);
    const [erros, setErros] = useState<string[]>([]);
    const [texto, setTexto] = useState('Oi, qual o seu nome?');
    const [copiado, setCopiado] = useState(false);

    /**
     * Copia o relatório da caixa-preta. No celular não há DevTools, então a
     * área de transferência é o único caminho real — e quando ela não existe
     * (contexto sem permissão), o texto vai para a tela para poder ser
     * selecionado à mão. Falhar em silêncio aqui seria o pior dos mundos:
     * o defeito continuaria invisível E o diagnóstico também.
     */
    const copiarDiagnostico = async () => {
        const relatorio = await coletarRelatorio();
        try {
            await navigator.clipboard.writeText(relatorio);
            setCopiado(true);
            globalThis.setTimeout(() => setCopiado(false), 2500);
        } catch {
            // Sem área de transferência o texto vai para a lista de erros, que
            // é a única superfície de texto longo que esta bancada já tem.
            setErros((e) => [...e, 'sem acesso à área de transferência:', relatorio]);
        }
        limparCaixaPreta();
    };
    const [cota, setCota] = useState<Record<string, string> | null>(null);
    // O EXPERIMENTO DA GPU. Ver o painel lá embaixo: o offload matou a fala
    // duas vezes neste tipo de aparelho, e ficou uma pergunta que só o celular
    // responde — estourou o buffer de 128 MB, ou o backend não roda ali?
    const [gpuInfo, setGpuInfo] = useState<
        { ok: boolean; motivo: string; maxBindingBytes: number | null } | null
    >(null);
    const [gpuEstado, setGpuEstado] = useState(() => floor10Gpu.snapshot());
    useEffect(() => { void probeWebGpuAdapter().then(setGpuInfo); }, []);
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
                {/* SAÍDA DE EMERGÊNCIA. O wllama grava o modelo em dois lugares
                    (OPFS e um store por sha256), mas só sabe listar e apagar o
                    primeiro — dá para ficar com um registro que aponta para um
                    arquivo que a listagem não enxerga, e aí toda carga morre em
                    "Model file not found" sem nada no jogo capaz de desfazer.
                    Este botão apaga TUDO e força um download limpo. */}
                <button
                    type="button"
                    style={{ ...btn, background: '#7a2f2f' }}
                    onClick={() => { void limparTudo().then(setCota); }}
                >
                    apagar modelo baixado
                </button>
                {/* A CAIXA-PRETA — o botão que fecha a distância entre quem
                    tem o aparelho e quem lê o código.
                    Quando algo der errado no celular, é daqui que sai o texto
                    para colar na conversa: o que carregou, quem interrompeu
                    quem, quantos tokens, quanto tempo, quanta memória. Sem
                    isto, o defeito chega como uma frase e a investigação vira
                    adivinhação — foi o que custou horas nesta sessão. */}
                <button
                    type="button"
                    style={{ ...btn, background: '#2f5f7a' }}
                    onClick={() => { void copiarDiagnostico(); }}
                >
                    {copiado ? '✓ diagnóstico copiado' : 'copiar diagnóstico'}
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

            {/* O NÚMERO QUE SÓ O APARELHO SABE. Em celular big.LITTLE, mais
                threads pode ser mais LENTO: o llama.cpp reparte o trabalho por
                igual e a thread no núcleo fraco segura cada token. Mede aqui,
                do mais alto para o mais baixo, e fixa o vencedor. */}
            <div style={box}>
                <b>Threads (mede e escolhe)</b>
                <div style={{ color: '#999', margin: '4px 0 8px', fontSize: 13 }}>
                    Troca, recarrega, carrega o modelo e compara o <b>fala tok/s</b> da
                    etiqueta. Mais threads nem sempre é mais rápido.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[1, 2, 3, 4, 6, 8].map((n) => (
                        <button
                            key={n}
                            type="button"
                            style={{
                                ...btn, marginRight: 0, padding: '8px 14px',
                                background: readSavedThreads() === n ? '#2d6cdf' : '#333',
                            }}
                            onClick={() => { saveThreads(n); location.reload(); }}
                        >
                            {n}
                        </button>
                    ))}
                    <button
                        type="button"
                        style={{ ...btn, marginRight: 0, padding: '8px 14px', background: '#333' }}
                        onClick={() => { saveThreads(null); location.reload(); }}
                    >
                        automático
                    </button>
                </div>
                <div style={{ marginTop: 8 }}>
                    em uso agora: <b style={{ color: '#ffd479' }}>
                        {readSavedThreads() ?? 'automático'}
                    </b>
                </div>
            </div>

            {/* O EXPERIMENTO DA GPU — desligado por padrão, e com o motivo à
                vista. O offload matou a fala DUAS vezes neste aparelho, com
                três camadas; depois descobri que três provavelmente nem cabiam
                (Android limita o binding a 128 MB, cada camada pesa ~53 MB).
                Ficou uma pergunta que só o celular responde: estourou o buffer,
                ou o backend não roda ali? UMA camada separa as duas. */}
            <div style={box}>
                <b>WebGPU (experimento)</b>
                <div style={{ color: '#999', margin: '4px 0 8px', fontSize: 13 }}>
                    Já quebrou a fala duas vezes neste aparelho, com 3 camadas.
                    O padrão é CPU. <b>Uma</b> camada é metade do limite do
                    Android: se rodar, o problema era tamanho; se morrer, o
                    backend não serve aqui.
                </div>
                <div style={{ color: '#888', marginBottom: 8 }}>
                    {gpuInfo === null ? 'perguntando ao adaptador…' : gpuInfo.ok ? (
                        <>
                            adaptador <b style={{ color: '#9fd3a0' }}>sim</b>
                            {' · limite de buffer '}
                            <b style={{ color: '#ffd479' }}>
                                {gpuInfo.maxBindingBytes
                                    ? `${Math.round(gpuInfo.maxBindingBytes / 1048576)} MB`
                                    : 'não informado'}
                            </b>
                            {' · cabem '}
                            <b style={{ color: '#ffd479' }}>
                                {layersThatFit(gpuInfo.maxBindingBytes, 1_915_305_312, 36)}
                            </b>
                            {' camadas'}
                        </>
                    ) : (
                        <>adaptador <b style={{ color: '#ff9c9c' }}>não</b> — {gpuInfo.motivo}</>
                    )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[0, 1, 2].map((n) => (
                        <button
                            key={n}
                            type="button"
                            disabled={n > 0 && !gpuInfo?.ok}
                            style={{
                                ...btn, marginRight: 0, padding: '8px 14px',
                                background: gpuEstado.nextLayers === n ? '#2d6cdf' : '#333',
                                opacity: n > 0 && !gpuInfo?.ok ? 0.4 : 1,
                            }}
                            onClick={() => { floor10Gpu.force(n); location.reload(); }}
                        >
                            {n === 0 ? 'CPU pura' : `${n} camada${n > 1 ? 's' : ''}`}
                        </button>
                    ))}
                    <button
                        type="button"
                        style={{ ...btn, marginRight: 0, padding: '8px 14px', background: '#444' }}
                        onClick={() => { setGpuEstado(floor10Gpu.reset()); location.reload(); }}
                    >
                        esquecer
                    </button>
                </div>
                <div style={{ marginTop: 8, color: '#888' }}>
                    veredito <b style={{ color: '#ffd479' }}>{gpuEstado.verdict}</b>
                    {' · próxima carga '}
                    <b style={{ color: '#ffd479' }}>{gpuEstado.nextLayers}</b>
                    {` camadas (teto ${FLOOR10_GPU_MAX_LAYERS})`}
                    <div style={{ marginTop: 4 }}>{gpuEstado.reason}</div>
                </div>
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
                {/* Sem teto de altura a conversa empurrava os botões e o
                    cronômetro para fora da tela do celular depois de 3 ou 4
                    falas, e não dava mais para testar. Aqui ela rola sozinha. */}
                <div style={{ maxHeight: '38vh', overflowY: 'auto', marginTop: 4 }}>
                    {npc.history.length === 0 ? <div style={{ color: '#777' }}>vazia</div> : null}
                    {npc.history.map((m, i) => (
                        <div key={i} style={{ marginTop: 4, color: m.role === 'user' ? '#8fb8ff' : '#c8e6c9' }}>
                            <b>{m.role}:</b> {m.content}
                        </div>
                    ))}
                </div>
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
