// ── O CÉREBRO DO NPC ───────────────────────────────────────────────────────
// Roda um Qwen QUANTIZADO (4-bit, q4f16) no WebGPU, dentro do navegador, via
// WebLLM. Sem servidor, sem API — a IA vive no cliente.
//
// PADRÃO = Qwen2.5-3B-Instruct (2.5GB): melhor conversa multilíngue nesse
// tamanho e comprovadamente carrega no celular (o 7B/5GB estourava a aba). A
// inferência roda num WEB WORKER (thread separada) pra UI/jogo NÃO travar.
//
// CRASH DE ABA (OOM) é INCAPTURÁVEL — a aba morre antes de qualquer try/catch.
// Por isso deixo um "rastro" no localStorage ANTES de subir cada modelo pra GPU:
// se a aba morreu ali, no reload a gente PULA aquele tamanho e vai pra um menor.
// Assim o app se auto-ajusta pro maior modelo que REALMENTE roda no aparelho.
//
// Override manual: window.__npcModel = '4B' | '3B' | '1.5B' | '0.5B'
// ('4B' = Qwen3-4B, mais esperto porém mais pesado).
import { npc, npcSet } from './npcStore';

const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm@0.2.84';

type Tier = { id: string; label: string; qwen3?: boolean };
// Escada em ordem DESCENDENTE de tamanho. Os Qwen3.5 (mar/2026, 201 idiomas) são
// o que há de mais novo; o padrão é o Qwen3.5-2B (2.2GB) — novo, leve e seguro no
// celular (menor que os 2.5GB que já rodaram; os 5GB do 7B estouravam a aba). O
// 4B e o Qwen2.5-3B (comprovado) ficam ACIMA, alcançáveis via override ou como
// fallback. Se um ID novo não existir no WebLLM, dá erro CAPTURÁVEL → cai sozinho.
const TIERS: Tier[] = [
    { id: 'Qwen3.5-4B-q4f16_1-MLC', label: '4B', qwen3: true },       // mais esperto, mais pesado (opt-in)
    { id: 'Qwen3.5-2B-q4f16_1-MLC', label: '2B', qwen3: true },      // PADRÃO: novo + leve + 201 idiomas
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: '3B' },          // fallback COMPROVADO (se o 3.5 não existir/rodar)
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: '1.5B' },
    { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: '0.5B' },
];
const DEFAULT_LABEL = '2B';

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
const CRASH_KEY = (id: string) => `npc_load_crash_${id}`;
function markAttempt(id: string) {
    try { localStorage.setItem(CRASH_KEY(id), String(Date.now())); } catch { /* ok */ }
}
function clearAttempt(id: string) {
    try { localStorage.removeItem(CRASH_KEY(id)); } catch { /* ok */ }
}
// se o rastro ficou pra trás (a aba morreu no load), pula esse tamanho.
function crashedRecently(id: string): boolean {
    try { return localStorage.getItem(CRASH_KEY(id)) != null; } catch { return false; }
}

type Delta = { choices?: Array<{ delta?: { content?: string } }> };
type Engine = {
    chat: { completions: { create(opts: unknown): Promise<AsyncIterable<Delta>> } };
    interruptGenerate?: () => void;
};
type WebLLM = {
    CreateWebWorkerMLCEngine(
        worker: Worker, model: string,
        cfg: { initProgressCallback?: (r: { text?: string; progress?: number }) => void },
    ): Promise<Engine>;
};

function makeWorker(): Worker {
    const src =
        `import { WebWorkerMLCEngineHandler } from "${WEBLLM_CDN}";\n` +
        `const handler = new WebWorkerMLCEngineHandler();\n` +
        `self.onmessage = (m) => handler.onmessage(m);\n`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    return new Worker(url, { type: 'module' });
}

async function hasWebGPU(): Promise<boolean> {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    try { return !!(await gpu.requestAdapter()); } catch { return false; }
}

function startIndex(): number {
    const ov = overrideLabel();
    const i = TIERS.findIndex((t) => t.label === ov);
    if (i >= 0) return i;
    return TIERS.findIndex((t) => t.label === DEFAULT_LABEL);
}

let enginePromise: Promise<Engine> | null = null;
let loadedQwen3 = false;

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
                    const engine = await webllm.CreateWebWorkerMLCEngine(makeWorker(), tier.id, { initProgressCallback: onProgress });
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
                    : `Falha ao carregar a IA: ${msg}`,
            });
            enginePromise = null;
            throw e;
        }
    })();
    return enginePromise;
}

// remove blocos de "pensamento" do Qwen3 (<think>…</think>) — no-op no Qwen2.5.
function visibleText(s: string): string {
    let out = s.replace(/<think>[\s\S]*?<\/think>/g, '');
    const open = out.lastIndexOf('<think>');
    if (open !== -1) out = out.slice(0, open);   // bloco ainda aberto → esconde o resto
    return out.replace(/^\s+/, '');
}

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking') return;
    let engine: Engine;
    try { engine = await initLLM(); } catch { return; }
    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    try {
        const sys = loadedQwen3 ? `${PERSONA}\n/no_think` : PERSONA;   // desliga o "pensar" no Qwen3
        const messages = [{ role: 'system', content: sys }, ...history];
        const stream = await engine.chat.completions.create({
            messages, stream: true, temperature: 0.7, top_p: 0.9, max_tokens: 384,
        });
        let acc = '';
        for await (const chunk of stream) {
            const d = chunk.choices?.[0]?.delta?.content ?? '';
            if (d) { acc += d; npcSet({ streaming: visibleText(acc) }); }
        }
        const finalText = visibleText(acc) || '…';
        npcSet({
            history: [...history, { role: 'assistant', content: finalText }],
            streaming: '', phase: 'ready', speaking: false,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        npcSet({ phase: 'ready', speaking: false, streaming: '', error: `Deu ruim na resposta: ${msg}` });
    }
}
