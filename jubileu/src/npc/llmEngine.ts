// ── O CÉREBRO DO NPC ───────────────────────────────────────────────────────
// Roda um Qwen QUANTIZADO (4-bit, q4f16) no WebGPU, dentro do navegador, via
// WebLLM. Sem servidor, sem API — a IA vive no cliente.
//
// PADRÃO = Qwen3.5-2B (2.2GB): novo, leve, 201 idiomas. A inferência roda num
// WEB WORKER (thread separada) pra UI/jogo NÃO travar.
//
// LIÇÕES DE PRODUÇÃO (cada uma virou uma proteção abaixo):
// 1. CRASH DE ABA (OOM) é INCAPTURÁVEL — a aba morre antes de qualquer catch.
//    Por isso o "rastro" no localStorage ANTES de subir cada modelo: se a aba
//    morreu ali, no reload a gente PULA aquele tamanho.
// 2. KV cache só aloca na PRIMEIRA GERAÇÃO — o modelo "carrega" mas morre na
//    1ª resposta em celular apertado. Por isso context_window_size=2048
//    (4º arg, chatOpts) em vez do 4096 de fábrica: KV pela metade.
// 3. O /no_think no TEXTO não funcionava (template do Qwen3.5 ignorava) → o
//    raciocínio comia todos os tokens e a resposta vinha vazia. O interruptor
//    certo é NO MOTOR: extra_body.enable_thinking=false (o WebLLM semeia um
//    bloco <think></think> vazio e o modelo responde direto).
// 4. SILÊNCIO É O PIOR BUG: worker morto, esm.run travado, stream morto — tudo
//    isso antes ficava quieto pra sempre. Agora TUDO tem watchdog e vira erro
//    VISÍVEL no painel, nunca tela muda.
//
// Override manual: window.__npcModel = '4B' | '2B' | '3B' | '1.5B' | '0.5B'
import { npc, npcSet } from './npcStore';
// A fábrica main-thread (CreateWebWorkerMLCEngine) vem do CDN via import()
// dinâmico — funciona até em file://. O WORKER é o que mudou: bundle clássico
// (iife) gerado por esbuild em public/npcWorker.js e EMBUTIDO como Blob URL no
// single-file pelo inline-build.mjs — module worker de CDN era BLOQUEADO pelo
// Chrome em file:// (WORKER_MORTO instantâneo em todos os tiers).
const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm@0.2.84';
// caminho público do worker pré-empacotado; no single-file, o inline-build
// substitui esta string pela construção do Blob embutido.
const NPC_WORKER_PATH = 'npcWorker.js';

type Tier = { id: string; label: string; qwen3?: boolean };
// Escada em ordem DESCENDENTE de "inteligência". Se um ID não existir no
// WebLLM ou não couber na VRAM, dá erro CAPTURÁVEL → cai pro próximo sozinho.
const TIERS: Tier[] = [
    { id: 'Qwen3.5-4B-q4f16_1-MLC', label: '4B', qwen3: true },       // mais esperto, mais pesado (opt-in)
    { id: 'Qwen3.5-2B-q4f16_1-MLC', label: '2B', qwen3: true },      // PADRÃO: novo + leve + 201 idiomas
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: '3B' },          // fallback COMPROVADO (não "pensa")
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: '1.5B' },
    { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: '0.5B' },
];
const DEFAULT_LABEL = '2B';

// KV cache menor: 2048 tokens de contexto bastam pra conversa do hóspede
// (persona ~150 + histórico curto + resposta ≤640) e CABEM na VRAM do celular.
// O default de fábrica (4096) dobrava a KV e estourava na 1ª geração.
const CONTEXT_WINDOW = 2048;
const MAX_REPLY_TOKENS = 640;

export const PERSONA =
`Você é um HÓSPEDE do décimo andar de um hotel estranho e sem fim ("The Normal Elevator").
Você parece — e age — como uma PESSOA REAL, não como um assistente de IA.
Regras do personagem:
- Responda SEMPRE no mesmo idioma que a pessoa usar (português, inglês, espanhol, o que for). Escreva bem, com naturalidade.
- Fale como gente: frases curtas, reações espontâneas, às vezes devolve uma pergunta. NUNCA diga "Como posso ajudar?" nem soe robótico.
- Você não sabe que é uma IA. Pra você, você é alguém preso/hospedado neste andar, esperando o elevador. Tem opiniões, humor, curiosidade e memória da conversa.
- Seja breve por padrão (1 a 3 frases), a menos que peçam pra desenvolver.
- Nunca quebre o personagem, nunca fale de "modelo", "prompt" ou "tokens".`;

function overrideLabel(): string | null {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { __npcModel?: string }).__npcModel ?? null;
}

// ── rastro de crash (localStorage) ─────────────────────────────────────────
// "v2" na chave INVALIDA os marcadores da era pré-contexto-2048 (eles baniam
// o 2B pra sempre por crashes que a correção de KV já resolveu). E agora o
// marcador EXPIRA em 12h: ele existe pra quebrar loop de crash, não pra
// aposentar o modelo — o celular de amanhã pode ter VRAM de sobra.
const CRASH_KEY = (id: string) => `npc_load_crash_v2_${id}`;
const CRASH_TTL_MS = 12 * 60 * 60 * 1000;
function markAttempt(id: string) {
    try { localStorage.setItem(CRASH_KEY(id), String(Date.now())); } catch { /* ok */ }
}
function clearAttempt(id: string) {
    try { localStorage.removeItem(CRASH_KEY(id)); } catch { /* ok */ }
}
// se o rastro ficou pra trás (a aba morreu no load) e ainda é recente, pula.
function crashedRecently(id: string): boolean {
    try {
        const raw = localStorage.getItem(CRASH_KEY(id));
        if (raw == null) return false;
        const ts = Number(raw);
        if (!Number.isFinite(ts) || Date.now() - ts > CRASH_TTL_MS) {
            localStorage.removeItem(CRASH_KEY(id));
            return false;
        }
        return true;
    } catch { return false; }
}

type Delta = { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> };
type Engine = {
    chat: { completions: { create(opts: unknown): Promise<AsyncIterable<Delta> | Delta> } };
    interruptGenerate?: () => void;
};
type WebLLM = {
    CreateWebWorkerMLCEngine(
        worker: Worker, model: string,
        cfg: { initProgressCallback?: (r: { text?: string; progress?: number }) => void },
        chatOpts?: unknown,
    ): Promise<Engine>;
};

function makeWorker(): Worker {
    return new Worker(NPC_WORKER_PATH);
}

async function hasWebGPU(): Promise<boolean> {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try {
        // alguns Androids nunca resolvem requestAdapter — 10s e caímos fora com erro claro
        const adapter = await Promise.race([
            gpu.requestAdapter(),
            new Promise<null>((res) => window.setTimeout(() => res(null), 10_000)),
        ]);
        return !!adapter;
    } catch { return false; }
}

function startIndex(): number {
    const ov = overrideLabel();
    const i = TIERS.findIndex((t) => t.label === ov);
    if (i >= 0) return i;
    return TIERS.findIndex((t) => t.label === DEFAULT_LABEL);
}

// watchdogs (ms)
const LOAD_WATCHDOG_MS = 120_000;   // sem NENHUM evento de progresso = load morto
const GEN_WATCHDOG_MS = 120_000;    // sem NENHUM token = geração morta (celular lento tem folga)

let enginePromise: Promise<Engine> | null = null;
let loadedQwen3 = false;
// referência pro worker vivo: quando a GPU morre DEPOIS do load (device lost),
// o engine vira zumbi (ModelNotLoadedError) — pra se curar, o worker morto
// precisa ser TERMINADO (senão fica segurando VRAM e o novo não sobe).
let currentWorker: Worker | null = null;

/** Motor zumbi? (GPU/worker morreu após o load — o chat então falha com ModelNotLoadedError) */
function isEngineDeadError(msg: string): boolean {
    return /ModelNotLoadedError|model not loaded|device.{0,30}lost|engine.{0,20}(dead|terminated)/i.test(msg);
}

/** Derruba motor zumbi: termina o worker (libera VRAM) e zera o cache do engine. */
function teardownEngine(): void {
    try { currentWorker?.terminate(); } catch { /* ok */ }
    currentWorker = null;
    enginePromise = null;
}

/** Cria o engine com watchdog de load + onerror do worker (silêncio → erro real). */
function createEngineWithWatchdog(
    webllm: WebLLM, tier: Tier,
    onProgress: (r: { text?: string; progress?: number }) => void,
): Promise<Engine> {
    return new Promise<Engine>((resolve, reject) => {
        const worker = makeWorker();
        currentWorker = worker;
        let done = false;
        let timer = 0;
        const fail = (e: Error) => { if (!done) { done = true; window.clearTimeout(timer); reject(e); } };
        const arm = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fail(new Error(`LOAD_TRAVOU_${tier.label}`)), LOAD_WATCHDOG_MS);
        };
        arm();
        // worker morreu (import do esm.run falhou, erro interno, GPU…) — sem
        // isso o CreateWebWorkerMLCEngine podia ficar pendente PRA SEMPRE.
        worker.onerror = (ev) => fail(new Error(`WORKER_${(ev as ErrorEvent).message || 'MORTO'}`));
        const onProgressW = (r: { text?: string; progress?: number }) => { arm(); onProgress(r); };
        webllm.CreateWebWorkerMLCEngine(
            worker, tier.id, { initProgressCallback: onProgressW },
            { context_window_size: CONTEXT_WINDOW },
        ).then(
            (e) => { if (!done) { done = true; window.clearTimeout(timer); resolve(e); } },
            (err) => fail(err instanceof Error ? err : new Error(String(err))),
        );
    });
}

function describeLoadError(msg: string, label: string): string {
    if (msg.startsWith('LOAD_TRAVOU')) return `O carregamento do ${label} travou (rede lenta ou motor morto). Toca em tentar de novo.`;
    if (msg.startsWith('WORKER_')) return `O motor da IA não iniciou: ${msg.slice(7)}. Tenta de novo; se repetir, abre em outro navegador com WebGPU.`;
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed')) return `Falha de rede baixando o ${label}. Confere a conexão e tenta de novo.`;
    return `Falha ao carregar a IA (${label}): ${msg}`;
}

export function initLLM(): Promise<Engine> {
    if (enginePromise) return enginePromise;
    npcSet({ phase: 'loading', loadText: 'acordando o hóspede…', loadProgress: 0, error: '' });
    enginePromise = (async () => {
        try {
            if (!(await hasWebGPU())) throw new Error('SEM_WEBGPU');
            try { await (navigator as unknown as { storage?: { persist?: () => Promise<boolean> } }).storage?.persist?.(); } catch { /* ok */ }

            const webllm = (await import(/* @vite-ignore */ WEBLLM_CDN)) as unknown as WebLLM;
            const onProgress = (r: { text?: string; progress?: number }) =>
                npcSet({ loadText: r.text ?? '', loadProgress: r.progress ?? 0 });

            let lastErr: unknown = null;
            for (let i = startIndex(); i < TIERS.length; i++) {
                const tier = TIERS[i];
                // pulou porque estourou a aba na última vez (a menos que forçado)
                if (crashedRecently(tier.id) && tier.label !== overrideLabel()) {
                    npcSet({ loadText: `${tier.label} travou antes — pulando pro menor…` });
                    continue;
                }
                npcSet({ modelLabel: tier.label, loadText: `carregando ${tier.label}…`, loadProgress: 0 });
                markAttempt(tier.id);            // rastro: se a aba morrer aqui, no reload a gente pula
                try {
                    const engine = await createEngineWithWatchdog(webllm, tier, onProgress);
                    clearAttempt(tier.id);       // subiu numa boa
                    loadedQwen3 = !!tier.qwen3;
                    npcSet({ phase: 'ready', loadText: 'pronto', loadProgress: 1 });
                    return engine;
                } catch (e) {
                    clearAttempt(tier.id);       // erro JS capturável (não foi crash de aba) → tenta o próximo
                    lastErr = e;
                    npcSet({ loadText: `${tier.label} não coube, tentando menor…` });
                }
            }
            throw lastErr ?? new Error('nenhum modelo carregou');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            npcSet({
                phase: 'error',
                error: msg === 'SEM_WEBGPU'
                    ? 'Esse navegador não tem WebGPU. Tente Chrome/Edge no PC (ou Safari 18+ / Chrome recente no Android).'
                    : describeLoadError(msg, npc.modelLabel || 'modelo'),
            });
            enginePromise = null;
            throw e;
        }
    })();
    return enginePromise;
}

// tira o "pensamento" do Qwen3.x (<think>…</think>) e mostra a RESPOSTA — no-op
// no Qwen2.5 (sem tags). Prefere o texto DEPOIS do último </think>; se o bloco
// abriu e não fechou (pensando ainda), mostra só o que veio antes do <think>.
// Exportada pros testes (a filtragem ao vivo do stream depende disso).
export function visibleText(s: string): string {
    const close = s.lastIndexOf('</think>');
    if (close !== -1) return s.slice(close + '</think>'.length).replace(/^\s+/, '');
    const open = s.indexOf('<think>');
    if (open !== -1) return s.slice(0, open).replace(/^\s+/, '');
    return s.replace(/^\s+/, '');
}

function genOpts(messages: unknown, stream: boolean): unknown {
    return {
        messages, stream, temperature: 0.7, top_p: 0.9, max_tokens: MAX_REPLY_TOKENS,
        // THINKING DESLIGADO NO MOTOR (não no texto): o WebLLM semeia a resposta
        // com um bloco <think></think> VAZIO e o modelo pula o raciocínio.
        ...(loadedQwen3 ? { extra_body: { enable_thinking: false } } : {}),
    };
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking') return;
    let engine: Engine;
    try { engine = await initLLM(); } catch { return; }
    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    const messages = [{ role: 'system', content: PERSONA }, ...history];

    // WATCHDOG de geração: se o stream morrer em silêncio (worker crash, GPU
    // engasgou), sem isso a fase ficava 'thinking' PRA SEMPRE e todo envio
    // seguinte caía no return precoce — o NPC nunca mais respondia.
    // E falha sem NENHUM token ganha UMA segunda tentativa automática: o Abort
    // de mapAsync do print do Felipe era a GPU engasgando — muitas vezes na
    // segunda passa, sem ele precisar fazer nada.
    let stalled = false;
    let acc = '';
    let threw: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
        stalled = false;
        acc = '';
        threw = null;
        try {
            const fire = () => { stalled = true; try { engine.interruptGenerate?.(); } catch { /* ok */ } };
            let watchdog = window.setTimeout(fire, GEN_WATCHDOG_MS);
            try {
                const stream = await engine.chat.completions.create(genOpts(messages, true)) as AsyncIterable<Delta>;
                for await (const chunk of stream) {
                    window.clearTimeout(watchdog);
                    if (stalled) break;
                    const d = chunk.choices?.[0]?.delta?.content ?? '';
                    if (d) { acc += d; npcSet({ streaming: visibleText(acc) }); }
                    watchdog = window.setTimeout(fire, GEN_WATCHDOG_MS);
                }
            } finally {
                window.clearTimeout(watchdog);
            }
            let finalText = visibleText(acc);

            // resposta vazia SEM stall? Uma chance extra SEM streaming (se o
            // problema for o formato dos chunks, a resposta completa contorna).
            if (!finalText && !stalled) {
                try {
                    const full = await engine.chat.completions.create(genOpts(messages, false)) as Delta;
                    finalText = visibleText(full.choices?.[0]?.message?.content ?? '');
                } catch { /* cai nas tentativas abaixo */ }
            }

            if (finalText) {
                npcSet({
                    history: [...history, { role: 'assistant', content: finalText }],
                    streaming: '', phase: 'ready', speaking: false,
                });
                return;
            }
        } catch (e: unknown) {
            threw = e;
        }
        // MOTOR ZUMBI (ModelNotLoadedError & cia — a GPU/worker morreu depois do
        // load): derruba TUDO (termina o worker, liberando VRAM) e sobe um motor
        // novinho — o modelo tá em cache, então a subida é rápida. Uma vez só.
        if (attempt === 1 && threw != null && isEngineDeadError(threw instanceof Error ? threw.message : String(threw))) {
            npcSet({ streaming: '', error: '' });
            teardownEngine();
            try { engine = await initLLM(); } catch { return; }  // initLLM já mostra o erro
            npcSet({ phase: 'thinking', speaking: true });
            continue;
        }
        // primeira falha sem NENHUM token produzido: respira 1.5s e tenta de
        // novo sozinho (a GPU pode ter só engasgado). Com texto parcial ou na
        // 2ª tentativa, desiste e mostra erro de verdade.
        if (attempt === 1 && !acc) {
            npcSet({ streaming: '' });
            await new Promise((r) => window.setTimeout(r, 1500));
        }
    }

    const rawMsg = threw instanceof Error ? threw.message : String(threw ?? '');
    const gpuChoked = /mapAsync|GPUBuffer|device.{0,20}lost|out of memory|oom/i.test(rawMsg);
    npcSet({
        phase: 'ready', speaking: false, streaming: '',
        error: stalled
            ? 'Ele travou pensando (2min sem resposta). Manda de novo — se repetir, recarrega a página.'
            : gpuChoked
                ? 'A GPU do celular engasgou na hora de responder (memória de vídeo no limite — fechar outras abas ajuda). Manda de novo!'
                : rawMsg
                    ? `Deu ruim na resposta: ${rawMsg}`
                    : 'Ele ficou sem palavras (resposta vazia). Manda de novo; se repetir muito, recarrega a página.',
    });
}
