import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNpc, npc, npcSet } from './npc/npcStore';
// Motor do NPC agora é o wllama (CPU/WASM, sem WebGPU). O llmEngine (WebGPU) fica
// preservado no repo; trocar só esta linha volta pra ele.
import { initLLM, sendToNpc } from './npc/wllamaEngine';
import { NPC_NAME } from './npc/floor10Canon';

// ── UI DE CONVERSA COM O NPC (overlay DOM) ─────────────────────────────────
// Vive FORA do Canvas. Reage ao npcStore: mostra a dica quando o player chega
// perto, abre o painel de chat (tecla E ou toque), dispara o download do modelo
// (com barra de progresso), e transmite a resposta do LLM token a token.
// Mobile-first (o Felipe joga no celular): input embaixo, alvos grandes.
//
// REGRA DE OURO: erro NUNCA fica invisível. Antes, falhas na geração só
// escreviam st.error na fase 'ready' — e a UI só mostrava erro na fase
// 'error' → silêncio total (o "tudo quieto" do bug). Agora a faixa de erro
// aparece em QUALQUER fase enquanto houver mensagem.

const Floor10NpcChat: React.FC = () => {
    const st = useNpc();
    const [input, setInput] = useState('');
    const [thinkingSeconds, setThinkingSeconds] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    const open = useCallback(() => {
        if (npc.open) return;
        npcSet({ open: true });
        if (npc.phase === 'cold' || npc.phase === 'error') { void initLLM(); }
    }, []);
    const close = useCallback(() => { npcSet({ open: false }); }, []);

    // tecla E abre (quando perto), Esc fecha
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && npc.open) { e.preventDefault(); close(); }
            else if ((e.key === 'e' || e.key === 'E') && npc.near && !npc.open) {
                const tag = (document.activeElement?.tagName ?? '').toLowerCase();
                if (tag === 'input' || tag === 'textarea') return;
                e.preventDefault(); open();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, close]);

    // auto-scroll pro fim quando chega texto
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [st.history.length, st.streaming, st.phase, st.error]);

    // O prefill de um LLM local é a parte mais lenta. Mostrar tempo corrido
    // distingue "a CPU está trabalhando" de um Worker realmente morto; o
    // watchdog do motor continua sendo o limite de segurança.
    useEffect(() => {
        if (st.phase !== 'thinking') {
            setThinkingSeconds(0);
            return;
        }
        const startedAt = Date.now();
        setThinkingSeconds(0);
        const timer = window.setInterval(
            () => setThinkingSeconds(Math.floor((Date.now() - startedAt) / 1000)),
            1000,
        );
        return () => window.clearInterval(timer);
    }, [st.phase]);

    // Fala iniciada pela própria vontade desaparece da tela, mas permanece no
    // histórico: quando o jogador responder, o Qwen sabe o que Nilo acabou de
    // dizer e a conversa não recomeça do zero.
    useEffect(() => {
        if (!st.autonomousSpeech) return;
        const speechId = st.autonomousSpeechId;
        const timer = window.setTimeout(() => {
            if (npc.autonomousSpeechId === speechId) npcSet({ autonomousSpeech: '' });
        }, 7000);
        return () => window.clearTimeout(timer);
    }, [st.autonomousSpeech, st.autonomousSpeechId]);

    const send = () => {
        const t = input.trim();
        if (!t || st.phase === 'thinking') return;
        setInput('');
        void sendToNpc(t);
    };

    // dica flutuante quando perto e fechado
    if (!st.open) {
        const speechAudible = st.autonomousSpeech !== ''
            && (st.perception.player?.distance ?? Infinity) <= 9;
        if (!st.near && !speechAudible) return null;
        return (
            <>
                {speechAudible && (
                    <div style={autonomousSpeechStyle}>
                        <strong style={{ color: '#f5c96b' }}>{NPC_NAME}</strong>
                        <span>{st.autonomousSpeech}</span>
                    </div>
                )}
                {st.near && (
                    <button onClick={open} style={hintStyle}>
                        💬 {st.autonomousSpeech ? 'Responder' : 'Conversar'} <span style={{ opacity: 0.7 }}>(E)</span>
                    </button>
                )}
            </>
        );
    }

    const loading = st.phase === 'loading';
    const pct = Math.round(st.loadProgress * 100);

    return (
        <div style={panelStyle}>
            <div style={headerStyle}>
                <span>{NPC_NAME} · Hóspede do 10º{st.modelLabel ? ` · ${st.modelLabel}` : ''} · 👁🧭</span>
                <button onClick={close} style={xStyle} aria-label="Fechar">✕</button>
            </div>

            {loading && (
                <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                        Baixando o cérebro do hóspede (só na 1ª vez, fica em cache)…
                    </div>
                    <div style={barOuter}><div style={{ ...barInner, width: `${pct}%` }} /></div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>{pct}% — {st.loadText}</div>
                </div>
            )}

            {st.phase === 'error' && (
                <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, color: '#ff9a9a', marginBottom: 10 }}>{st.error}</div>
                    <button onClick={() => void initLLM()} style={retryStyle}>Tentar de novo</button>
                </div>
            )}

            {(st.phase === 'ready' || st.phase === 'thinking') && (
                <>
                    <div ref={scrollRef} style={logStyle}>
                        {st.history.length === 0 && (
                            <div style={{ opacity: 0.5, fontSize: 13, textAlign: 'center', marginTop: 20 }}>
                                Vontade atual: {st.autonomy.label}. Os olhos e a autonomia continuam ativos.
                            </div>
                        )}
                        {st.history.map((m, i) => (
                            <div key={i} style={{ ...bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={m.role === 'user' ? userBubble : npcBubble}>{m.content}</div>
                            </div>
                        ))}
                        {st.phase === 'thinking' && (
                            <div style={{ ...bubbleRow, justifyContent: 'flex-start' }}>
                                <div style={npcBubble} aria-live="polite">
                                    {st.streaming || `Pensando na CPU… ${thinkingSeconds}s`}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* faixa de erro SEMPRE visível (fase ready/thinking também) —
                        nunca mais "tudo quieto" */}
                    {st.error !== '' && (
                        <div style={errBannerStyle}>
                            <span style={{ flex: 1 }}>{st.error}</span>
                            <button onClick={() => npcSet({ error: '' })} style={errXStyle} aria-label="Dispensar">✕</button>
                        </div>
                    )}
                    <div style={inputRow}>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                            placeholder="Fale com ele…"
                            style={inputStyle}
                            autoFocus
                        />
                        <button onClick={send} disabled={st.phase === 'thinking'} style={sendStyle}>➤</button>
                    </div>
                </>
            )}
        </div>
    );
};

// ── estilos inline (o projeto não usa CSS-modules aqui) ──
const hintStyle: React.CSSProperties = {
    position: 'fixed', bottom: 'max(88px, 14vh)', left: '50%', transform: 'translateX(-50%)',
    zIndex: 60, padding: '10px 18px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(20,22,28,0.82)', color: '#fff', fontSize: 15, fontWeight: 600,
    backdropFilter: 'blur(6px)', cursor: 'pointer', fontFamily: 'system-ui, sans-serif',
};
const autonomousSpeechStyle: React.CSSProperties = {
    position: 'fixed', bottom: 'max(142px, 21vh)', left: '50%', transform: 'translateX(-50%)',
    zIndex: 60, width: 'min(560px, 88vw)', display: 'flex', flexDirection: 'column', gap: 5,
    padding: '12px 16px', borderRadius: 15, border: '1px solid rgba(245,201,107,0.32)',
    background: 'rgba(16,18,24,0.9)', color: '#f3f3f3', fontSize: 14, lineHeight: 1.4,
    boxShadow: '0 10px 32px rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
    pointerEvents: 'none', fontFamily: 'system-ui, sans-serif',
};
const panelStyle: React.CSSProperties = {
    position: 'fixed', zIndex: 61, right: 'max(12px, 3vw)', bottom: 'max(12px, 3vh)',
    width: 'min(420px, 94vw)', height: 'min(560px, 76vh)', display: 'flex', flexDirection: 'column',
    borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(16,18,24,0.94)', color: '#f2f2f2', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(10px)', fontFamily: 'system-ui, sans-serif',
};
const headerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600,
    letterSpacing: 0.2, background: 'rgba(255,255,255,0.03)',
};
const xStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#bbb', fontSize: 16, cursor: 'pointer', padding: 4 };
const logStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 };
const bubbleRow: React.CSSProperties = { display: 'flex', width: '100%' };
const baseBubble: React.CSSProperties = { maxWidth: '82%', padding: '9px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
const userBubble: React.CSSProperties = { ...baseBubble, background: '#3a6df0', color: '#fff', borderBottomRightRadius: 4 };
const npcBubble: React.CSSProperties = { ...baseBubble, background: 'rgba(255,255,255,0.09)', color: '#f0f0f0', borderBottomLeftRadius: 4 };
const inputRow: React.CSSProperties = { display: 'flex', gap: 8, padding: 10, borderTop: '1px solid rgba(255,255,255,0.1)' };
const inputStyle: React.CSSProperties = {
    flex: 1, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, outline: 'none',
};
const sendStyle: React.CSSProperties = {
    padding: '0 16px', borderRadius: 12, border: 'none', background: '#3a6df0', color: '#fff',
    fontSize: 16, cursor: 'pointer', minWidth: 48,
};
const retryStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 10, border: 'none', background: '#3a6df0', color: '#fff', fontSize: 14, cursor: 'pointer' };
const barOuter: React.CSSProperties = { height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' };
const barInner: React.CSSProperties = { height: '100%', background: 'linear-gradient(90deg,#3a6df0,#7aa2ff)', transition: 'width 0.2s' };
const errBannerStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px',
    borderTop: '1px solid rgba(255,120,120,0.35)', background: 'rgba(120,30,30,0.35)',
    color: '#ffb4b4', fontSize: 12.5, lineHeight: 1.4,
};
const errXStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#ffb4b4', fontSize: 13, cursor: 'pointer', padding: 0 };

export default Floor10NpcChat;
