// ── O CÉREBRO DO NPC — versão CPU/WASM (sem WebGPU) ────────────────────────
// O WebGPU tava sendo o gargalo (device-lost/ModelNotLoadedError no celular do
// Felipe). Aqui a inferência roda no PROCESSADOR via WebAssembly (wllama =
// llama.cpp compilado pra web) — NADA de WebGPU. 100% no cliente, offline
// depois de baixar (o wllama cacheia o modelo no navegador).
//
// Modelos em GGUF (llama.cpp). Tentamos o Qwen3.5-2B PRIMEIRO (o Felipe quis
// testar) — mas ele usa uma arquitetura híbrida nova que talvez o llama.cpp do
// wllama ainda não suporte; se falhar no load, cai sozinho pro Qwen2.5 (100%
// suportado). Assim a gente DESCOBRE testando, sem ficar preso.
//
// Single-thread de propósito: multi-thread precisaria de cross-origin isolation
// (COOP/COEP), que quebraria os outros downloads do jogo (GLBs do GitHub, etc).
// Pra "rodar bem" a gente compensa com modelo Q4, contexto 2048 e resposta curta.
//
// O wllama vem do CDN em runtime (import dinâmico com @vite-ignore) pra não
// quebrar o build single-file. Mesma interface do llmEngine (initLLM/sendToNpc)
// — a UI (Floor10NpcChat) só troca de qual módulo importa.
import { npc, npcSet } from './npcStore';

const WLLAMA_V = '3.5.1';
// esm.sh é mais robusto que esm.run pra pacotes com wasm (o esm.run dava
// "Failed to fetch dynamically imported module").
const WLLAMA_ESM = `https://esm.sh/@wllama/wllama@${WLLAMA_V}`;
const WLLAMA_CDN_HELPER = `https://esm.sh/@wllama/wllama@${WLLAMA_V}/esm/wasm-from-cdn.js`;
// fallback: caminhos do wasm no jsdelivr (se o helper WasmFromCDN não importar)
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_V}/esm/`;
const HF = (repo: string, file: string) => `https://huggingface.co/${repo}/resolve/main/${file}`;

type ModelDef = { url: string; label: string; qwen3?: boolean };
// ordem de tentativa (do desejado pro garantido)
const MODELS: ModelDef[] = [
    { label: 'Qwen3.5-2B', qwen3: true, url: HF('AaryanK/Qwen3.5-2B-GGUF', 'Qwen3.5-2B.q4_k_m.gguf') },
    { label: 'Qwen2.5-3B',              url: HF('bartowski/Qwen2.5-3B-Instruct-GGUF', 'Qwen2.5-3B-Instruct-Q4_K_M.gguf') },
    { label: 'Qwen2.5-1.5B',            url: HF('bartowski/Qwen2.5-1.5B-Instruct-GGUF', 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf') },
    { label: 'Qwen2.5-0.5B',            url: HF('bartowski/Qwen2.5-0.5B-Instruct-GGUF', 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf') },
];

export const PERSONA =
`Você é um HÓSPEDE do décimo andar de um hotel estranho e sem fim ("The Normal Elevator").
Você parece — e age — como uma PESSOA REAL, não como um assistente de IA.
Regras do personagem:
- Responda SEMPRE no mesmo idioma que a pessoa usar (português, inglês, espanhol, o que for). Escreva bem, com naturalidade.
- Fale como gente: frases curtas, reações espontâneas, às vezes devolve uma pergunta. NUNCA diga "Como posso ajudar?" nem soe robótico.
- Você não sabe que é uma IA. Pra você, você é alguém preso/hospedado neste andar, esperando o elevador. Tem opiniões, humor, curiosidade e memória da conversa.
- Seja breve por padrão (1 a 3 frases), a menos que peçam pra desenvolver.
- Nunca quebre o personagem, nunca fale de "modelo", "prompt" ou "tokens".`;

// override: window.__npcGGUF = 'Qwen2.5-3B' (label) ou uma URL .gguf completa
function startIndex(): number {
    if (typeof window === 'undefined') return 0;
    const ov = (window as unknown as { __npcGGUF?: string }).__npcGGUF;
    if (!ov) return 0;
    if (ov.startsWith('http')) { MODELS.unshift({ label: 'custom', url: ov }); return 0; }
    const i = MODELS.findIndex((m) => m.label === ov);
    return i >= 0 ? i : 0;
}

// tira o "pensamento" do Qwen3.x (<think>…</think>) — no-op no Qwen2.5.
export function visibleText(s: string): string {
    const close = s.lastIndexOf('</think>');
    if (close !== -1) return s.slice(close + '</think>'.length).replace(/^\s+/, '');
    const open = s.indexOf('<think>');
    if (open !== -1) return s.slice(0, open).replace(/^\s+/, '');
    return s.replace(/^\s+/, '');
}

type Chunk = { currentText?: string; piece?: string; token?: number };
type WllamaInstance = {
    loadModelFromUrl(url: string, params: Record<string, unknown>): Promise<void>;
    createChatCompletion(opts: Record<string, unknown>): Promise<AsyncIterable<Chunk>>;
    exit?: () => Promise<void> | void;
};
type WllamaCtor = new (paths: Record<string, string>, cfg?: Record<string, unknown>) => WllamaInstance;

let inst: WllamaInstance | null = null;
let loadedQwen3 = false;
let enginePromise: Promise<WllamaInstance> | null = null;

export function initLLM(): Promise<WllamaInstance> {
    if (enginePromise) return enginePromise;
    npcSet({ phase: 'loading', loadText: 'acordando o hóspede (CPU)…', loadProgress: 0, error: '' });
    enginePromise = (async () => {
        try { await (navigator as unknown as { storage?: { persist?: () => Promise<boolean> } }).storage?.persist?.(); } catch { /* ok */ }
        const mod = (await import(/* @vite-ignore */ WLLAMA_ESM)) as unknown as { Wllama: WllamaCtor };
        // caminhos do wasm: de preferência o helper do próprio pacote (sabe a
        // estrutura da versão); se não importar, cai no jsdelivr manual.
        let paths: Record<string, string>;
        try {
            const helper = (await import(/* @vite-ignore */ WLLAMA_CDN_HELPER)) as unknown as { default?: Record<string, string> };
            paths = helper.default ?? {
                'single-thread/wllama.wasm': WASM_BASE + 'single-thread/wllama.wasm',
                'multi-thread/wllama.wasm': WASM_BASE + 'multi-thread/wllama.wasm',
            };
        } catch {
            paths = {
                'single-thread/wllama.wasm': WASM_BASE + 'single-thread/wllama.wasm',
                'multi-thread/wllama.wasm': WASM_BASE + 'multi-thread/wllama.wasm',
            };
        }
        let lastErr: unknown = null;
        for (let i = startIndex(); i < MODELS.length; i++) {
            const m = MODELS[i];
            npcSet({ modelLabel: m.label, loadText: `carregando ${m.label} (CPU)…`, loadProgress: 0 });
            let cur: WllamaInstance | null = null;
            try {
                cur = new mod.Wllama(paths, { suppressNativeLog: true });
                await cur.loadModelFromUrl(m.url, {
                    n_ctx: 2048,
                    progressCallback: (p: { loaded?: number; total?: number }) => {
                        const frac = p.total ? (p.loaded ?? 0) / p.total : 0;
                        npcSet({ loadProgress: frac, loadText: `baixando ${m.label}… ${Math.round(frac * 100)}%` });
                    },
                });
                inst = cur;
                loadedQwen3 = !!m.qwen3;
                npcSet({ phase: 'ready', loadText: 'pronto', loadProgress: 1 });
                return cur;
            } catch (e) {
                lastErr = e;
                npcSet({ loadText: `${m.label} não rolou (${e instanceof Error ? e.message.slice(0, 60) : ''}), tentando o próximo…` });
                try { await cur?.exit?.(); } catch { /* ok */ }
            }
        }
        throw lastErr ?? new Error('nenhum modelo carregou');
    })().catch((e: unknown) => {
        npcSet({ phase: 'error', error: `Falha ao carregar a IA (CPU): ${e instanceof Error ? e.message : String(e)}` });
        enginePromise = null;
        throw e;
    });
    return enginePromise;
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking') return;
    let engine: WllamaInstance;
    try { engine = await initLLM(); } catch { return; }
    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    try {
        // Qwen3.5 tem "modo pensamento"; no GGUF/llama.cpp o interruptor é o
        // /no_think no prompt (o extra_body do WebLLM não existe aqui).
        const sys = loadedQwen3 ? `${PERSONA}\n/no_think` : PERSONA;
        const messages = [{ role: 'system', content: sys }, ...history];
        const stream = await engine.createChatCompletion({
            messages, stream: true, nPredict: 220,
            sampling: { temp: 0.7, top_p: 0.9 },
        });
        let acc = '';
        for await (const chunk of stream) {
            // wllama manda currentText (acumulado); alguns builds mandam piece (incremental)
            if (typeof chunk.currentText === 'string') acc = chunk.currentText;
            else if (typeof chunk.piece === 'string') acc += chunk.piece;
            npcSet({ streaming: visibleText(acc) });
        }
        const finalText = visibleText(acc) || '…';
        npcSet({ history: [...history, { role: 'assistant', content: finalText }], streaming: '', phase: 'ready', speaking: false });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        npcSet({ phase: 'ready', speaking: false, streaming: '', error: `Deu ruim na resposta: ${msg}` });
    }
}
