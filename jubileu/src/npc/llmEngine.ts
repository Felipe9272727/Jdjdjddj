// ── O CÉREBRO DO NPC ───────────────────────────────────────────────────────
// Roda um Qwen2.5-Instruct QUANTIZADO (4-bit, q4f16) no WebGPU, dentro do
// navegador, via WebLLM. Sem servidor, sem API — a IA vive no cliente.
//
// Qwen2.5 é o melhor 7B em MULTILÍNGUE (29+ idiomas, PT incluso) e escrita —
// exatamente o que o NPC precisa. O padrão é o 7B quantizado (q4f16 ~4.7GB); se
// o aparelho não der conta (sem WebGPU ou pouca memória), cai pra um Qwen2.5
// menor da MESMA família (mesma "personalidade") só pra continuar rodando.
//
// O WebLLM é carregado do CDN em RUNTIME (import dinâmico com @vite-ignore), pra
// NÃO entrar no bundle single-file (o inline-build.mjs só embute 1 script). Ele
// baixa os pesos do modelo do HuggingFace na primeira vez (fica em cache no
// navegador). Precisa de internet + WebGPU (Chrome/Edge no PC, Safari 18+/
// Chrome Android recente).
import { npc, npcSet } from './npcStore';

const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm@0.2.79';

// escada de modelos Qwen2.5-Instruct quantizados (q4f16), do maior pro menor
type Tier = { id: string; label: string; vramMB: number };
const TIERS: Tier[] = [
    { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: '7B', vramMB: 5107 },
    { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: '3B', vramMB: 2505 },
    { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: '1.5B', vramMB: 1630 },
    { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: '0.5B', vramMB: 945 },
];

// Personagem: um HÓSPEDE do 10º andar que age como gente de verdade. Fica fácil
// de reescrever depois quando o Felipe fechar a lore do andar.
export const PERSONA =
`Você é um HÓSPEDE do décimo andar de um hotel estranho e sem fim ("The Normal Elevator").
Você parece — e age — como uma PESSOA REAL, não como um assistente de IA.
Regras do personagem:
- Responda SEMPRE no mesmo idioma que a pessoa usar (português, inglês, espanhol, o que for). Escreva bem, com naturalidade.
- Fale como gente: frases curtas, reações espontâneas, às vezes devolve uma pergunta. NUNCA diga "Como posso ajudar?" nem soe robótico.
- Você não sabe que é uma IA. Pra você, você é alguém preso/hospedado neste andar, esperando o elevador. Tem opiniões, humor, curiosidade e memória da conversa.
- Seja breve por padrão (1 a 3 frases), a menos que peçam pra desenvolver.
- Nunca quebre o personagem, nunca fale de "modelo", "prompt" ou "tokens".`;

// permite forçar um tamanho pra teste: window.__npcModel = '7B' | '3B' | '1.5B' | '0.5B'
function forcedLabel(): string | null {
    if (typeof window === 'undefined') return null;
    const v = (window as unknown as { __npcModel?: string }).__npcModel;
    return v ?? null;
}

async function pickTier(): Promise<Tier> {
    const forced = forcedLabel();
    if (forced) return TIERS.find((t) => t.label === forced) ?? TIERS[0];
    const gpu = (navigator as unknown as { gpu?: unknown }).gpu as
        | { requestAdapter(): Promise<{ limits?: { maxBufferSize?: number } } | null> } | undefined;
    if (!gpu) throw new Error('SEM_WEBGPU');
    const adapter = await gpu.requestAdapter().catch(() => null);
    if (!adapter) throw new Error('SEM_WEBGPU');
    const maxBufMB = ((adapter.limits?.maxBufferSize ?? 0) / (1024 * 1024)) || 0;
    const devMemGB = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    // orçamento de memória (heurístico). No PC deixa o 7B passar; no celular limita.
    let budgetMB = devMemGB * 1024 * 0.6;
    if (mobile) budgetMB = Math.min(budgetMB, 2600);
    for (const t of TIERS) {
        const bufOk = maxBufMB === 0 || maxBufMB >= t.vramMB * 0.32; // maior buffer precisa caber
        if (t.vramMB <= budgetMB && bufOk) return t;
    }
    return TIERS[TIERS.length - 1]; // 0.5B: último recurso
}

// WebLLM tipado no mínimo necessário (vem do CDN, sem @types no bundle)
type Delta = { choices?: Array<{ delta?: { content?: string } }> };
type Engine = {
    chat: { completions: { create(opts: unknown): Promise<AsyncIterable<Delta>> } };
    interruptGenerate?: () => void;
};
type WebLLM = {
    CreateMLCEngine(
        model: string,
        cfg: { initProgressCallback?: (r: { text?: string; progress?: number }) => void },
    ): Promise<Engine>;
};

let enginePromise: Promise<Engine> | null = null;

export function initLLM(): Promise<Engine> {
    if (enginePromise) return enginePromise;
    npcSet({ phase: 'loading', loadText: 'acordando o hóspede…', loadProgress: 0, error: '' });
    enginePromise = (async () => {
        try {
            const webllm = (await import(/* @vite-ignore */ WEBLLM_CDN)) as unknown as WebLLM;
            const tier = await pickTier();
            npcSet({ modelLabel: tier.label });
            const engine = await webllm.CreateMLCEngine(tier.id, {
                initProgressCallback: (r) => npcSet({ loadText: r.text ?? '', loadProgress: r.progress ?? 0 }),
            });
            npcSet({ phase: 'ready', loadText: 'pronto', loadProgress: 1 });
            return engine;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            npcSet({
                phase: 'error',
                error: msg === 'SEM_WEBGPU'
                    ? 'Esse aparelho/navegador não tem WebGPU. Tente o Chrome ou Edge no PC (ou Safari 18+ / Chrome recente no Android).'
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
            messages, stream: true, temperature: 0.7, top_p: 0.9, max_tokens: 512,
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
