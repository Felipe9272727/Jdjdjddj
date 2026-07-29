// Estado compartilhado entre o CORPO 3D do NPC (Floor10Npc, dentro do Canvas) e
// a UI de conversa (Floor10NpcChat, um overlay DOM fora do Canvas). Singleton
// observável simples — mesmo padrão dos outros módulos-estado do projeto
// (f6Escape / f9Eco). Sem dependência de three/react aqui.
import { useSyncExternalStore } from 'react';
import {
    INITIAL_FLOOR10_PERCEPTION,
    type Floor10Perception,
} from './floor10Perception';
import {
    INITIAL_FLOOR10_WILL,
    type Floor10WillCommand,
    type Floor10WillCommandAction,
    type Floor10WillSnapshot,
} from './floor10Will';
import { DOWNLOAD_ZERO, type DownloadSample } from './floor10Download';

export type NpcRole = 'system' | 'user' | 'assistant';
export type NpcMsg = { role: NpcRole; content: string };
export type NpcPhase = 'cold' | 'loading' | 'ready' | 'thinking' | 'error';

export type NpcState = {
    near: boolean;          // player está perto o suficiente pra conversar
    open: boolean;          // painel de conversa aberto
    phase: NpcPhase;        // ciclo de vida do modelo
    loadText: string;       // texto de progresso do download do modelo
    loadProgress: number;   // 0..1
    // Bytes de verdade, não só a fração. Uma porcentagem parada em 12% é
    // indistinguível de uma que ainda vai andar; "412 MB de 1,92 GB, parado há
    // 40s" não é. Foi a primeira coisa que faltou quando o download falhou.
    loadDownload: DownloadSample;
    modelLabel: string;     // "7B" / "3B" / ...
    history: NpcMsg[];      // conversa (sem o system prompt)
    streaming: string;      // resposta parcial sendo transmitida token a token
    speaking: boolean;      // true enquanto o NPC "fala" (pro corpo animar a boca)
    perception: Floor10Perception; // micro-IA dos olhos (sensores espaciais ao vivo)
    autonomy: Floor10WillSnapshot; // vontade atual escolhida pela Utility AI
    willCommand: Floor10WillCommand | null; // decisão verbal aceita pelo 2B
    autonomousSpeech: string; // iniciativa de fala fora do painel
    autonomousSpeechId: number;
    // ── DELIBERAÇÃO (o cérebro pequeno pensando por fora) ──────────────────
    // Visível na UI para dar para saber, olhando, se ele está vivo: sem isto o
    // segundo cérebro trabalharia invisível e não haveria como diferenciar
    // "pensando", "decidiu" e "não carregou".
    deliberationPhase: 'off' | 'loading' | 'thinking' | 'decided' | 'unavailable';
    deliberationLoadText: string;      // download/cache do cérebro pequeno
    deliberationLoadProgress: number;  // 0..1, progresso real do arquivo
    deliberationDownload: DownloadSample;
    deliberationGoal: string;   // a intenção que ele assinou
    deliberationCount: number;  // quantas vezes já deliberou nesta sessão
    /** Cota do site medida no aparelho — o que decide se dá pra baixar. */
    storage: { quota: number | null; usage: number; needBytes: number };
    error: string;
    version: number;
};

const s: NpcState = {
    near: false, open: false, phase: 'cold', loadText: '', loadProgress: 0,
    loadDownload: DOWNLOAD_ZERO,
    modelLabel: '', history: [], streaming: '', speaking: false,
    perception: INITIAL_FLOOR10_PERCEPTION,
    autonomy: INITIAL_FLOOR10_WILL,
    willCommand: null,
    autonomousSpeech: '', autonomousSpeechId: 0,
    deliberationPhase: 'off', deliberationLoadText: '', deliberationLoadProgress: 0,
    deliberationDownload: DOWNLOAD_ZERO,
    storage: { quota: null, usage: 0, needBytes: 0 },
    deliberationGoal: '', deliberationCount: 0,
    error: '', version: 0,
};

const subs = new Set<() => void>();
export const npc = s;
export function npcSubscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
export function npcBump() { s.version++; for (const f of subs) f(); }
export function npcSet(patch: Partial<NpcState>) { Object.assign(s, patch); npcBump(); }
// Percepção muda várias vezes por segundo. O LLM lê o snapshot vivo direto,
// mas a UI não precisa re-renderizar para cada centímetro que o player anda.
export function npcPublishPerception(perception: Floor10Perception) {
    s.perception = perception;
}
export function npcPublishAutonomy(autonomy: Floor10WillSnapshot) {
    const changedDecision = autonomy.decisionId !== s.autonomy.decisionId;
    s.autonomy = autonomy;
    if (changedDecision) npcBump();
}
let nextWillCommandId = 0;
export function npcIssueWillCommand(action: Floor10WillCommandAction, reason: string) {
    s.willCommand = {
        id: ++nextWillCommandId,
        action,
        reason,
    };
    npcBump();
}
export function npcAutonomousSay(content: string) {
    const speech = content.trim();
    if (!speech) return;
    s.history = [...s.history, { role: 'assistant', content: speech }];
    s.autonomousSpeech = speech;
    s.autonomousSpeechId++;
    npcBump();
}
export function npcReset() {
    Object.assign(s, { open: false, phase: s.phase === 'ready' || s.phase === 'thinking' ? 'ready' : s.phase,
        history: [], streaming: '', speaking: false, willCommand: null, autonomousSpeech: '', error: '' });
    npcBump();
}

// hook React. IMPORTANTE: o getSnapshot precisa devolver algo que MUDA a cada
// update — como o estado é mutado no lugar (mesma referência `s`), uso o
// contador `version` como snapshot. Se devolvesse `s`, o useSyncExternalStore
// via Object.is(s, s) === true e NUNCA re-renderizava (a UI ficava congelada até
// remontar). Devolvo `s` (dados vivos) e deixo a `version` disparar o re-render.
export function useNpc(): NpcState {
    useSyncExternalStore(npcSubscribe, () => s.version, () => s.version);
    return s;
}

// seletor enxuto: só o `open` (pro App congelar o player sem re-renderizar a
// cada token do streaming — o boolean só muda ao abrir/fechar).
export function useNpcOpen(): boolean {
    return useSyncExternalStore(npcSubscribe, () => s.open, () => s.open);
}
