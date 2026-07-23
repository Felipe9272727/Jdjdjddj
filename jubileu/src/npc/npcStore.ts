// Estado compartilhado entre o CORPO 3D do NPC (Floor10Npc, dentro do Canvas) e
// a UI de conversa (Floor10NpcChat, um overlay DOM fora do Canvas). Singleton
// observável simples — mesmo padrão dos outros módulos-estado do projeto
// (f6Escape / f9Eco). Sem dependência de three/react aqui.
import { useSyncExternalStore } from 'react';

export type NpcRole = 'system' | 'user' | 'assistant';
export type NpcMsg = { role: NpcRole; content: string };
export type NpcPhase = 'cold' | 'loading' | 'ready' | 'thinking' | 'error';

export type NpcState = {
    near: boolean;          // player está perto o suficiente pra conversar
    open: boolean;          // painel de conversa aberto
    phase: NpcPhase;        // ciclo de vida do modelo
    loadText: string;       // texto de progresso do download do modelo
    loadProgress: number;   // 0..1
    modelLabel: string;     // "7B" / "3B" / ...
    history: NpcMsg[];      // conversa (sem o system prompt)
    streaming: string;      // resposta parcial sendo transmitida token a token
    speaking: boolean;      // true enquanto o NPC "fala" (pro corpo animar a boca)
    error: string;
    version: number;
};

const s: NpcState = {
    near: false, open: false, phase: 'cold', loadText: '', loadProgress: 0,
    modelLabel: '', history: [], streaming: '', speaking: false, error: '', version: 0,
};

const subs = new Set<() => void>();
export const npc = s;
export function npcSubscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
export function npcBump() { s.version++; for (const f of subs) f(); }
export function npcSet(patch: Partial<NpcState>) { Object.assign(s, patch); npcBump(); }
export function npcReset() {
    Object.assign(s, { open: false, phase: s.phase === 'ready' || s.phase === 'thinking' ? 'ready' : s.phase,
        history: [], streaming: '', speaking: false, error: '' });
    npcBump();
}

// hook React (re-renderiza quando o estado muda)
export function useNpc(): NpcState {
    return useSyncExternalStore(npcSubscribe, () => s, () => s);
}

// seletor enxuto: só o `open` (pro App congelar o player sem re-renderizar a
// cada token do streaming — o boolean só muda ao abrir/fechar).
export function useNpcOpen(): boolean {
    return useSyncExternalStore(npcSubscribe, () => s.open, () => s.open);
}
