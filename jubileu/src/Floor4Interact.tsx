/**
 * Floor4Interact.tsx — the DOM interaction layer of the 2D Floor 4 (mounted by
 * Floor4Canvas2D over its canvas). Lore discovery per FLOOR4_LORE.md:
 *
 *  • contextual prompt ([E] / touch button) when the player nears a point
 *    (points + rules live in f4Lore.ts);
 *  • typewriter reading panel (examines + the Forgotten One's diary pages);
 *  • puzzle UIs: breaker levers (P1), reception bell (P2), safe keypad 404 (P3,
 *    + the photo of the original lobby), the back door ("ainda não.");
 *  • pages HUD ("PÁGINAS n/5"), screen shake (knocks from below), and the
 *    final card ("VOCÊ LEMBROU DO ANDAR 4").
 *
 * While any panel is open `uiLockRef` freezes the player. State changes
 * re-render through the PARENT (Floor4Canvas2D owns the f4SetOnChange
 * subscription) — this component must stay un-memoized.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    f4, f4NearestPoint, f4CollectPage, f4FinishIfLastPage,
    f4SetLever, f4RingBell, f4TrySafe, f4TryDoor, f4PagesCollected,
    F4_DIARY, type F4Point,
} from './f4Lore';
import {
    playF4Paper, playF4Bell, playF4Knocks, playF4Clack, playF4PowerOn,
    playF4BoardCrack, playF4SafeTick, playF4SafeOpen, playF4DoorCreak,
    playF4MemoryChime,
} from './floor4Sfx';
import { lobbyPhotoUrl } from './Floor4Scene2D';

type Panel =
    | { kind: 'none' }
    | { kind: 'read'; title?: string; text: string; finishPage?: number }
    | { kind: 'breaker' }
    | { kind: 'safe' }
    | { kind: 'photo' };

const PIX: React.CSSProperties = {
    fontFamily: 'monospace', color: '#f4f0e6', background: 'rgba(13,15,22,0.96)',
    border: '3px solid #f4f0e6', borderRadius: 6, boxShadow: '0 6px 0 rgba(0,0,0,0.45)',
};

/** Typewriter line(s). */
const Type: React.FC<{ text: string }> = ({ text }) => {
    const [n, setN] = useState(0);
    useEffect(() => {
        setN(0);
        const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 2)), 28);
        return () => clearInterval(id);
    }, [text]);
    return <span>{text.slice(0, n)}<span style={{ opacity: n < text.length ? 1 : 0 }}>▌</span></span>;
};

export const Floor4Interact: React.FC<{
    playerXRef: React.MutableRefObject<number>;
    uiLockRef: React.MutableRefObject<boolean>;
    shakeRef: React.MutableRefObject<number>;
}> = ({ playerXRef, uiLockRef, shakeRef }) => {
    const [prompt, setPrompt] = useState<F4Point | null>(null);
    const [panel, setPanel] = useState<Panel>({ kind: 'none' });
    const [safeCode, setSafeCode] = useState('');
    const [toast, setToast] = useState<string | null>(null);     // brief center text ("ainda não.")
    const [finale, setFinale] = useState(false);
    const panelRef = useRef(panel);
    panelRef.current = panel;
    const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

    useEffect(() => { uiLockRef.current = panel.kind !== 'none' || finale; }, [panel, finale, uiLockRef]);

    // poll the player position for the nearest available point
    useEffect(() => {
        const id = setInterval(() => {
            setPrompt(panelRef.current.kind === 'none' ? f4NearestPoint(playerXRef.current) : null);
        }, 120);
        return () => clearInterval(id);
    }, [playerXRef]);

    const boardOff = () => { playF4BoardCrack(); };

    const activate = (p: F4Point) => {
        if (p.kind === 'examine' && p.text) setPanel({ kind: 'read', text: p.text });
        if (p.kind === 'page' && p.page !== undefined) {
            f4CollectPage(p.page);
            playF4Paper();
            setPanel({ kind: 'read', title: F4_DIARY[p.page].title, text: F4_DIARY[p.page].text, finishPage: p.page });
        }
        if (p.kind === 'breaker') setPanel({ kind: 'breaker' });
        if (p.kind === 'safe') { setSafeCode(''); setPanel({ kind: 'safe' }); }
        if (p.kind === 'bell') {
            playF4Bell();
            const r = f4RingBell(Date.now());
            if (r === 'solved') {
                playF4Knocks();
                setTimeout(() => { shakeRef.current = 1; }, 1200);   // shake when the knocks land
                setTimeout(boardOff, 2600);
            }
        }
        if (p.kind === 'door') {
            const r = f4TryDoor();
            if (r === 'boarded') setPanel({ kind: 'read', text: 'As tábuas são novas. Alguém ainda vem aqui pregar.' });
            if (r === 'notyet') {
                playF4DoorCreak();
                setTimeout(() => setToast('ainda não.'), 900);
                setTimeout(() => setToast(null), 3400);
            }
            if (r === 'silent') setPanel({ kind: 'read', text: 'Só o escuro responde.' });
        }
    };

    const closeRead = () => {
        const pn = panelRef.current;
        setPanel({ kind: 'none' });
        if (pn.kind === 'read' && pn.finishPage !== undefined && f4FinishIfLastPage(pn.finishPage)) {
            playF4MemoryChime();
            setTimeout(() => setFinale(true), 400);
        }
    };

    // [E] activates the prompt / closes panels; Escape closes.
    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            const pn = panelRef.current;
            if (k === 'e' || k === 'enter') {
                if (pn.kind === 'read') closeRead();
                else if (pn.kind === 'photo') setPanel({ kind: 'none' });
                else if (pn.kind === 'none') { const p = f4NearestPoint(playerXRef.current); if (p) activate(p); }
            }
            if (k === 'escape' && pn.kind !== 'none') setPanel({ kind: 'none' });
        };
        window.addEventListener('keydown', kd);
        return () => window.removeEventListener('keydown', kd);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const flipLever = (i: number) => {
        playF4Clack();
        const r = f4SetLever(i, f4.levers[i] ? 0 : 1);
        if (r === 'solved') {
            playF4PowerOn();
            setTimeout(boardOff, 900);
            setTimeout(() => setPanel({ kind: 'none' }), 1100);
        }
    };

    const safeDigit = (dch: string) => {
        playF4SafeTick();
        if (dch === '<') { setSafeCode((c) => c.slice(0, -1)); return; }
        const next = (safeCode + dch).slice(0, 3);
        setSafeCode(next);
        if (next.length === 3) {
            if (f4TrySafe(next)) {
                playF4SafeOpen();
                setTimeout(boardOff, 700);
                setTimeout(() => setPanel({ kind: 'photo' }), 650);
            } else {
                setTimeout(() => setSafeCode(''), 350);
            }
        }
    };

    const pages = f4PagesCollected();
    const btn: React.CSSProperties = {
        ...PIX, padding: '10px 18px', fontSize: 15, fontWeight: 700, letterSpacing: 1,
        cursor: 'pointer', userSelect: 'none',
    };

    return (
        <>
            {/* pages HUD */}
            {pages > 0 && !finale && (
                <div style={{ ...PIX, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', right: 'calc(env(safe-area-inset-right) + 14px)', padding: '6px 10px', fontSize: 12, fontWeight: 700, letterSpacing: 2, border: '2px solid #f4f0e6', opacity: 0.92 }}>
                    PÁGINAS {pages}/5
                </div>
            )}

            {/* contextual prompt */}
            {prompt && panel.kind === 'none' && !finale && (
                <button
                    onClick={() => activate(prompt)}
                    style={{ ...btn, position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom) + 116px)' }}>
                    {isTouch ? prompt.label : `[E] ${prompt.label}`}
                </button>
            )}

            {/* reading panel */}
            {panel.kind === 'read' && (
                <div onClick={closeRead} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 'calc(env(safe-area-inset-bottom) + 110px)', background: 'rgba(0,0,0,0.25)', cursor: 'pointer' }}>
                    <div style={{ ...PIX, maxWidth: 520, margin: '0 16px', padding: '14px 18px', fontSize: 14, lineHeight: 1.65 }}>
                        {panel.title && <div style={{ color: '#FFD54F', fontSize: 11, letterSpacing: 3, marginBottom: 8, fontWeight: 700 }}>{panel.title}</div>}
                        <Type text={panel.text} />
                        <div style={{ marginTop: 10, fontSize: 10, opacity: 0.55, letterSpacing: 2 }}>{isTouch ? 'TOQUE PARA FECHAR' : '[E] FECHAR'}</div>
                    </div>
                </div>
            )}

            {/* P1 — breaker panel */}
            {panel.kind === 'breaker' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
                    <div style={{ ...PIX, padding: 18, textAlign: 'center' }}>
                        <div style={{ color: '#FFD54F', fontSize: 12, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>DISJUNTORES</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 12 }}>a luz insiste: curto, curto, curto, longo</div>
                        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                            {f4.levers.map((lv, i) => (
                                <button key={i} onClick={() => flipLever(i)}
                                    style={{ ...PIX, width: 52, height: 84, cursor: 'pointer', position: 'relative', border: '2px solid #f4f0e6', background: '#1a1e28' }}>
                                    <div style={{ position: 'absolute', left: 10, right: 10, top: lv ? 8 : 44, height: 32, background: lv ? '#81C784' : '#FF5252', border: '2px solid #0d0f16', transition: 'top 0.12s' }} />
                                    <div style={{ position: 'absolute', bottom: -22, left: 0, right: 0, fontSize: 10, color: '#f4f0e6', opacity: 0.6 }}>{lv ? 'CIMA' : 'BAIXO'}</div>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setPanel({ kind: 'none' })} style={{ ...btn, marginTop: 34, fontSize: 11, padding: '6px 12px' }}>FECHAR</button>
                    </div>
                </div>
            )}

            {/* P3 — safe keypad */}
            {panel.kind === 'safe' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
                    <div style={{ ...PIX, padding: 18, textAlign: 'center' }}>
                        <div style={{ color: '#FFD54F', fontSize: 12, letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>COFRE</div>
                        <div style={{ ...PIX, display: 'inline-block', minWidth: 110, padding: '8px 12px', fontSize: 26, letterSpacing: 10, marginBottom: 12, background: '#05060a', color: '#81C784', border: '2px solid #f4f0e6' }}>
                            {safeCode.padEnd(3, '_')}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gap: 8, justifyContent: 'center' }}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0'].map((dch) => (
                                <button key={dch} onClick={() => safeDigit(dch)}
                                    style={{ ...btn, padding: '12px 0', fontSize: 18, gridColumn: dch === '0' ? 2 : undefined }}>
                                    {dch === '<' ? '⌫' : dch}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setPanel({ kind: 'none' })} style={{ ...btn, marginTop: 14, fontSize: 11, padding: '6px 12px' }}>FECHAR</button>
                    </div>
                </div>
            )}

            {/* P3 payoff — the photo of the original lobby */}
            {panel.kind === 'photo' && (
                <div onClick={() => setPanel({ kind: 'none' })} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(0,0,0,0.72)', cursor: 'pointer' }}>
                    <img src={lobbyPhotoUrl} alt="O Saguão original, intacto" style={{ width: 'min(70vw, 560px)', imageRendering: 'pixelated', border: '4px solid #f4f0e6', borderRadius: 4, boxShadow: '0 10px 0 rgba(0,0,0,0.5)' }} />
                    <div style={{ ...PIX, padding: '10px 16px', fontSize: 13, maxWidth: 480, textAlign: 'center' }}>
                        <Type text={'Era aqui. Antes de decidirem esquecer.'} />
                    </div>
                </div>
            )}

            {/* door toast — "ainda não." */}
            {toast && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 30, fontWeight: 700, color: '#f4f0e6', textShadow: '0 0 18px rgba(0,0,0,0.9), 0 3px 0 #000', letterSpacing: 3 }}>{toast}</div>
                </div>
            )}

            {/* finale card */}
            {finale && (
                <div onClick={() => setFinale(false)} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(0,0,0,0.88)', cursor: 'pointer', animation: 'f4FinaleIn 1.2s ease-out' }}>
                    <div style={{ fontFamily: 'monospace', color: '#FFD54F', fontSize: 'min(5.4vw, 34px)', fontWeight: 700, letterSpacing: 4, textAlign: 'center' }}>VOCÊ LEMBROU DO ANDAR 4</div>
                    <div style={{ fontFamily: 'monospace', color: '#f4f0e6', opacity: 0.75, fontSize: 13, letterSpacing: 2 }}>PÁGINAS 5/5 — é só disso que ele precisa.</div>
                    <style>{'@keyframes f4FinaleIn { from { opacity: 0 } to { opacity: 1 } }'}</style>
                </div>
            )}
        </>
    );
};

export default Floor4Interact;
