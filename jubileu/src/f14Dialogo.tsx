/**
 * f14Dialogo.tsx — a caixa de fala do final do Andar 14.
 * Letra por letra; um toque (ou E / espaço / Enter) completa a frase e o próximo avança.
 * A voz da entidade é um "sussurro" sintetizado curto a cada fala (sem áudio externo).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Fala } from './f14Lore';

let ctx: AudioContext | null = null;
function sussurro() {
    try {
        ctx = ctx ?? new AudioContext(); const c = ctx, t = c.currentTime;
        const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * .5, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
        n.buffer = b;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.5;
        const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.06, t + .08); g.gain.exponentialRampToValueAtTime(.001, t + .5);
        n.connect(f).connect(g).connect(c.destination); n.start(t);
    } catch { /* sem áudio: segue mudo */ }
}

export const Dialogo: React.FC<{ falas: ReadonlyArray<Fala>; aoFim: () => void }> = ({ falas, aoFim }) => {
    const [i, setI] = useState(0), [n, setN] = useState(0);
    const fala = falas[Math.min(i, falas.length - 1)], completa = n >= fala.texto.length;
    const fimRef = useRef(aoFim); fimRef.current = aoFim;
    useEffect(() => { setN(0); sussurro(); }, [i]);
    useEffect(() => {
        if (completa) return;
        const id = window.setTimeout(() => setN((v) => v + 2), 24);
        return () => window.clearTimeout(id);
    }, [n, completa]);
    const avancar = useCallback(() => {
        if (!completa) { setN(fala.texto.length); return; }
        if (i + 1 < falas.length) setI(i + 1); else fimRef.current();
    }, [completa, fala, i, falas.length]);
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); avancar(); } };
        window.addEventListener('keydown', k, true);
        return () => window.removeEventListener('keydown', k, true);
    }, [avancar]);
    return <div onPointerDown={(e) => { e.stopPropagation(); avancar(); }}
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 16px max(28px, env(safe-area-inset-bottom))', zIndex: 5 }}>
        <div style={{ width: 'min(760px, 100%)', background: 'linear-gradient(180deg, rgba(10,6,16,.86), rgba(4,2,8,.93))', border: '1px solid rgba(160,120,255,.35)',
            borderRadius: 12, padding: '14px 18px 16px', color: '#ece4ff', fontFamily: 'Georgia, serif', boxShadow: '0 8px 40px rgba(0,0,0,.6), inset 0 0 30px rgba(110,60,220,.12)' }}>
            <div style={{ fontSize: 11, letterSpacing: 4, color: '#b49cff', marginBottom: 6, textShadow: '0 0 8px rgba(150,100,255,.6)' }}>{fala.quem}</div>
            <div style={{ fontSize: 'clamp(15px, 2.4vw, 19px)', lineHeight: 1.45, minHeight: '2.9em' }}>{fala.texto.slice(0, n)}</div>
            <div style={{ textAlign: 'right', fontSize: 11, opacity: completa ? .6 : 0, marginTop: 4, letterSpacing: 1 }}>{i + 1}/{falas.length} · toque ou E ▸</div>
        </div>
    </div>;
};

/** Legenda curta de cutscene (sem caixa, sem avanço). */
export const Legenda: React.FC<{ texto: string | null }> = ({ texto }) => texto ? <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'max(36px, env(safe-area-inset-bottom))', textAlign: 'center',
    padding: '0 16px', color: '#ece4ff', fontFamily: 'Georgia, serif', fontSize: 'clamp(15px, 2.3vw, 19px)', textShadow: '0 2px 8px #000, 0 0 14px rgba(110,60,220,.6)', pointerEvents: 'none', zIndex: 5 }}>{texto}</div> : null;
