// ── O CÉREBRO DO NPC ───────────────────────────────────────────────────────
// Roda um Qwen2.5-Instruct QUANTIZADO (4-bit, q4f16) no WebGPU, dentro do
// navegador, via WebLLM. Sem servidor, sem API — a IA vive no cliente.
//
// PADRÃO = 7B. A inferência roda num WEB WORKER (thread separada), então a UI/
// jogo NÃO congela enquanto o modelo pensa (o bug da v1 era rodar na thread
// principal). Se o 7B falhar em carregar no aparelho, cai sozinho pro 3B → 1.5B
// → 0.5B (mesma família Qwen2.5, mesma "personalidade"). Sem rebaixar por chute.
//
// O WebLLM é carregado do CDN em RUNTIME (import dinâmico com @vite-ignore, pra
// não entrar no bundle single-file). Baixa os pesos do HuggingFace só na 1ª vez
// e pede storage PERSISTENTE pro navegador não despejar o cache. Precisa de
// internet + WebGPU (Chrome/Edge no PC, Safari 18+/Chrome recente no Android).
import { npc, npcSet } from './npcStore';

const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm@0.2.79';

// escada Qwen2.5-Instruct quantizado (q4f16), do maior pro menor
type Tier = { id: string; label: string };
const TIERS: Tier[] = [
    { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: '7B' },
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: '3B' },
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: '1.5B' },
    { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: '0.5B' },
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

// override pra teste: window.__npcModel = '7B' | '3B' | '1.5B' | '0.5B'
function startIndex(): number {
    if (typeof window === 'undefined') return 0;
    const v = (window as unknown as { __npcModel?: string }).__npcModel;
    const i = TIERS.findIndex((t) => t.label === v);
    return i >= 0 ? i : 0;   // padrão: 7B (índice 0)
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

// worker de MÓDULO criado a partir de um Blob: importa o WebLLM do CDN e monta o
// handler que roda a inferência FORA da thread principal (não trava a UI).
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

let enginePromise: Promise<Engine> | null = null;

export function initLLM(): Promise<Engine> {
    if (enginePromise) return enginePromise;
    npcSet({ phase: 'loading', loadText: 'acordando o hóspede…', loadProgress: 0, error: '' });
    enginePromise = (async () => {
        try {
            if (!(await hasWebGPU())) throw new Error('SEM_WEBGPU');
            // pede pro navegador NÃO despejar o cache do modelo
            try { await (navigator as unknown as { storage?: { persist?: () => Promise<boolean> } }).storage?.persist?.(); } catch { /* ok */ }

            const webllm = (await import(/* @vite-ignore */ WEBLLM_CDN)) as unknown as WebLLM;
            const onProgress = (r: { text?: string; progress?: number }) =>
                npcSet({ loadText: r.text ?? '', loadProgress: r.progress ?? 0 });

            // tenta do 7B pra baixo; só desce se REALMENTE falhar
            let lastErr: unknown = null;
            for (let i = startIndex(); i < TIERS.length; i++) {
                const tier = TIERS[i];
                npcSet({ modelLabel: tier.label, loadText: `carregando ${tier.label}…`, loadProgress: 0 });
                try {
                    const engine = await webllm.CreateWebWorkerMLCEngine(makeWorker(), tier.id, { initProgressCallback: onProgress });
                    npcSet({ phase: 'ready', loadText: 'pronto', loadProgress: 1 });
                    return engine;
                } catch (e) {
                    lastErr = e;
                    npcSet({ loadText: `${tier.label} não coube, tentando menor…` });
                }
            }
            throw lastErr ?? new Error('falha ao carregar qualquer modelo');
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

/** Manda a fala do jogador e transmite a resposta token a token pro npcStore. */
export async function sendToNpc(userText: string): Promise<void> {
    const text = userText.trim();
    if (!text || npc.phase === 'thinking') return;
    let engine: Engine;
    try { engine = await initLLM(); } catch { return; }
    const history = [...npc.history, { role: 'user' as const, content: text }];
    npcSet({ history, phase: 'thinking', streaming: '', speaking: true, error: '' });
    try {
        const messages = [{ role: 'system', content: PERSONA }, ...history];
        const stream = await engine.chat.completions.create({
            messages, stream: true, temperature: 0.7, top_p: 0.9, max_tokens: 384,
        });
        let acc = '';
        for await (const chunk of stream) {
            const d = chunk.choices?.[0]?.delta?.content ?? '';
            if (d) { acc += d; npcSet({ streaming: acc }); }
        }
        npcSet({
            history: [...history, { role: 'assistant', content: acc || '…' }],
            streaming: '', phase: 'ready', speaking: false,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        npcSet({ phase: 'ready', speaking: false, streaming: '', error: `Deu ruim na resposta: ${msg}` });
    }
}
