/**
 * Floor6Overlay.tsx — the DOM layer of the Suíte 612 escape room: the
 * proximity prompt ([E] / tap), examine cards, the padlock keypad, the
 * hold-to-crank panel, the item chips, the objective line, the blackout
 * veil and the guest's dialogue box.
 *
 * Mounted by App OUTSIDE the canvas when level === 6 and the doors are open.
 * Reports "UI open" upward so App can pause the Player + drop pointer lock
 * (same contract as the shop/dialogue overlays).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import {
    f6, f6SetOnChange, f6Hotspots, f6Interact, f6TryCode, f6Crank,
    f6AdvanceGuest, f6Objective, F6_GUEST_LINES, type F6Action, type F6Sfx,
} from './f6Escape';
import {
    playF6Paper, playF6Click, playF6Clank, playF6Drawer, playF6Water,
    playF6Static, playF6Chain, playF6Breath, playF6Beep,
} from './floor6Sfx';

const SFX: Record<F6Sfx, () => void> = {
    paper: playF6Paper, click: playF6Click, clank: playF6Clank,
    water: playF6Water, static: playF6Static, unlock: () => {}, // event-side
    chain: () => {},                                            // event-side
    drawer: playF6Drawer, breath: () => playF6Breath(0.7), none: () => {},
};

const mono: React.CSSProperties = {
    fontFamily: 'monospace', color: '#e8e2d2', userSelect: 'none',
};

/** Slow human typewriter for the guest. */
const GuestType: React.FC<{ text: string; onDone: () => void; fastRef: React.MutableRefObject<boolean> }> =
    ({ text, onDone, fastRef }) => {
        const [n, setN] = useState(0);
        useEffect(() => { setN(0); }, [text]);
        useEffect(() => {
            if (n >= text.length) { onDone(); return; }
            const id = setTimeout(() => {
                setN((v) => Math.min(text.length, v + (fastRef.current ? text.length : 1)));
            }, fastRef.current ? 0 : 38);
            return () => clearTimeout(id);
        }, [n, text, onDone, fastRef]);
        return <>{text.slice(0, n)}</>;
    };

export const Floor6Overlay: React.FC<{
    playerPositionRef: React.MutableRefObject<Vector3>;
    onUiOpenChange: (open: boolean) => void;
}> = ({ playerPositionRef, onUiOpenChange }) => {
    const [, setV] = useState(0);
    const [card, setCard] = useState<{ title: string; text: string } | null>(null);
    const [keypadOpen, setKeypadOpen] = useState(false);
    const [code, setCode] = useState('');
    const [codeShake, setCodeShake] = useState(false);
    const [crankOpen, setCrankOpen] = useState(false);
    const [prompt, setPrompt] = useState<{ id: string; label: string } | null>(null);
    const promptRef = useRef<{ id: string; label: string } | null>(null);
    const [guestTyped, setGuestTyped] = useState(false);
    const guestFastRef = useRef(false);
    const crankHeld = useRef(false);
    const crankRaf = useRef(0);
    const crankBar = useRef<HTMLDivElement>(null);
    const crankTick = useRef(0);

    useEffect(() => {
        f6SetOnChange(() => setV((x) => x + 1));
        return () => f6SetOnChange(null);
    }, []);

    // proximity prompt: nearest reachable hotspot, polled — no per-frame React
    useEffect(() => {
        const id = setInterval(() => {
            if (f6.phase === 'arrive' || f6.phase === 'blackout' || f6.phase === 'guest') { setPrompt(null); return; }
            const p = playerPositionRef.current;
            let best: { id: string; label: string } | null = null;
            let bestD = Infinity;
            for (const h of f6Hotspots()) {
                const d = Math.hypot(p.x - h.x, p.z - h.z);
                if (d < (h.reach ?? 1.8) && d < bestD) { bestD = d; best = { id: h.id, label: h.label }; }
            }
            promptRef.current = best;          // the kd handler reads THIS (never stale)
            setPrompt((prev) => (prev?.id === best?.id && prev?.label === best?.label ? prev : best));
        }, 130);
        return () => clearInterval(id);
    }, [playerPositionRef]);

    const runAction = useCallback((a: F6Action) => {
        if (a.kind === 'text') { SFX[a.sfx](); setCard({ title: a.title, text: a.text }); }
        else if (a.kind === 'keypad') { playF6Click(); setCode(''); setKeypadOpen(true); }
        else if (a.kind === 'crank') { setCrankOpen(true); }
    }, []);

    // Always reads promptRef (the poll keeps it fresh) — the prompt can flip
    // between a React commit and the effect re-subscription, and a player
    // pressing E in that window must hit the hotspot they're SEEING.
    const interact = useCallback(() => {
        const p = promptRef.current;
        if (!p) return;
        runAction(f6Interact(p.id));
    }, [runAction]);

    // [E] interacts / closes
    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() !== 'e' && e.key !== 'Escape') return;
            if (card) { setCard(null); return; }
            if (keypadOpen) { if (e.key === 'Escape') setKeypadOpen(false); return; }
            if (crankOpen) { if (e.key === 'Escape') setCrankOpen(false); return; }
            if (e.key.toLowerCase() === 'e') interact();
        };
        window.addEventListener('keydown', kd);
        return () => window.removeEventListener('keydown', kd);
    }, [card, keypadOpen, crankOpen, interact]);

    // tell App when the player should be frozen (cards, keypad, crank, the guest)
    const uiOpen = card !== null || keypadOpen || crankOpen
        || f6.phase === 'blackout' || f6.phase === 'guest';
    useEffect(() => { onUiOpenChange(uiOpen); }, [uiOpen, onUiOpenChange]);
    useEffect(() => () => onUiOpenChange(false), [onUiOpenChange]);

    // keypad
    const pushDigit = (d: string) => {
        if (code.length >= 4) return;
        playF6Beep();
        const next = code + d;
        setCode(next);
        if (next.length === 4) {
            setTimeout(() => {
                if (f6TryCode(next)) {
                    playF6Beep(true);
                    setKeypadOpen(false);
                    setCard({ title: 'CADEADO', text: 'O cadeado cede com um clique gordo e cai no carpete.\n\nO banheiro dele, aberto.' });
                } else {
                    playF6Beep(false);
                    setCodeShake(true);
                    setTimeout(() => { setCodeShake(false); setCode(''); }, 450);
                }
            }, 220);
        }
    };

    // crank: hold to wind
    useEffect(() => {
        if (!crankOpen) { crankHeld.current = false; cancelAnimationFrame(crankRaf.current); return; }
        let last = performance.now();
        const loop = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            if (crankHeld.current) {
                crankTick.current += dt;
                if (crankTick.current > 0.4) { crankTick.current = 0; playF6Click(); }
                if (f6Crank(dt)) { setCrankOpen(false); return; }
            }
            if (crankBar.current) crankBar.current.style.width = `${(f6.crankT * 100).toFixed(1)}%`;
            crankRaf.current = requestAnimationFrame(loop);
        };
        crankRaf.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(crankRaf.current);
    }, [crankOpen]);

    const objective = f6Objective();
    const items: Array<[keyof typeof f6.inv, string]> = [
        ['cabide', 'CABIDE'], ['chave', 'CHAVE'], ['gelo', 'GELO'],
        ['manivela', 'MANIVELA'], ['fusivel', 'FUSÍVEL'], ['rele', 'RELÉ'],
    ];
    const carried = items.filter(([k]) => f6.inv[k]);

    const advanceGuest = () => {
        if (!guestTyped) { guestFastRef.current = true; return; }
        guestFastRef.current = false;
        setGuestTyped(false);
        playF6Breath(0.5);
        f6AdvanceGuest();
    };

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            {/* objective line */}
            {objective && !uiOpen && (
                <div style={{
                    ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: 0, right: 0,
                    textAlign: 'center', fontSize: 13, letterSpacing: 1, color: '#cfc7b0',
                    textShadow: '0 1px 3px #000',
                }}>{objective}</div>
            )}

            {/* item chips */}
            {carried.length > 0 && !uiOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(env(safe-area-inset-top) + 40px)', right: 12,
                    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end',
                }}>
                    {carried.map(([k, label]) => (
                        <div key={k} style={{
                            ...mono, fontSize: 11, letterSpacing: 1, padding: '4px 10px',
                            background: 'rgba(12,12,14,0.72)', border: '1px solid rgba(232,226,210,0.35)',
                            borderRadius: 6,
                        }}>{label}</div>
                    ))}
                </div>
            )}

            {/* proximity prompt */}
            {prompt && !uiOpen && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 96px)', textAlign: 'center' }}>
                    <button onPointerDown={interact} style={{
                        ...mono, pointerEvents: 'auto', fontSize: 15, padding: '10px 20px',
                        background: 'rgba(12,12,14,0.78)', border: '1px solid rgba(232,226,210,0.5)',
                        borderRadius: 10, cursor: 'pointer', color: '#e8e2d2',
                    }}>
                        <span style={{ color: '#d9b96a' }}>[E]</span> {prompt.label}
                    </button>
                </div>
            )}

            {/* examine card */}
            {card && (
                <div onPointerDown={() => setCard(null)} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer',
                    background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 18,
                }}>
                    <div style={{
                        maxWidth: 520, width: '100%', background: '#15130f', border: '1px solid #6a5c44',
                        borderRadius: 10, padding: '18px 20px 16px', boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
                    }}>
                        <div style={{ ...mono, fontSize: 12, letterSpacing: 3, color: '#d9b96a', marginBottom: 10 }}>{card.title}</div>
                        <div style={{ ...mono, fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{card.text}</div>
                        <div style={{ ...mono, fontSize: 11, color: '#7a715c', marginTop: 14, textAlign: 'right' }}>toque para fechar</div>
                    </div>
                </div>
            )}

            {/* padlock keypad */}
            {keypadOpen && (
                <div onPointerDown={(e) => { if (e.target === e.currentTarget) setKeypadOpen(false); }} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto',
                    background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#191713', border: '1px solid #6a5c44', borderRadius: 12,
                        padding: 18, width: 250, boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
                        animation: codeShake ? 'f6shake 0.4s' : undefined,
                    }}>
                        <div style={{ ...mono, fontSize: 12, letterSpacing: 3, color: '#d9b96a', textAlign: 'center' }}>CADEADO — 4 DÍGITOS</div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '14px 0' }}>
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} style={{
                                    ...mono, width: 38, height: 46, lineHeight: '46px', textAlign: 'center', fontSize: 24,
                                    background: '#0c0b09', border: `1px solid ${codeShake ? '#a33' : '#4a4234'}`, borderRadius: 6,
                                }}>{code[i] ?? ''}</div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✕'].map((k) => (
                                <button key={k} onPointerDown={() => {
                                    if (k === '⌫') { setCode((c) => c.slice(0, -1)); playF6Click(); }
                                    else if (k === '✕') setKeypadOpen(false);
                                    else pushDigit(k);
                                }} style={{
                                    ...mono, fontSize: 18, padding: '10px 0', cursor: 'pointer',
                                    background: '#26221b', border: '1px solid #4a4234', borderRadius: 8, color: '#e8e2d2',
                                }}>{k}</button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* hold-to-crank */}
            {crankOpen && (
                <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto',
                    background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: '#191713', border: '1px solid #6a5c44', borderRadius: 12,
                        padding: 22, width: 290, textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.8)',
                    }}>
                        <div style={{ ...mono, fontSize: 12, letterSpacing: 3, color: '#d9b96a' }}>MANIVELA DE EMERGÊNCIA</div>
                        <div style={{ height: 10, background: '#0c0b09', border: '1px solid #4a4234', borderRadius: 6, margin: '16px 0', overflow: 'hidden' }}>
                            <div ref={crankBar} style={{ height: '100%', width: `${f6.crankT * 100}%`, background: 'linear-gradient(90deg,#8a6d2c,#d9b96a)' }} />
                        </div>
                        <button
                            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); crankHeld.current = true; }}
                            onPointerUp={() => { crankHeld.current = false; }}
                            onPointerCancel={() => { crankHeld.current = false; }}
                            style={{
                                ...mono, fontSize: 17, padding: '16px 0', width: '100%', cursor: 'pointer',
                                background: '#26221b', border: '1px solid #6a5c44', borderRadius: 10, color: '#e8e2d2',
                                touchAction: 'none',
                            }}>SEGURE PARA GIRAR</button>
                        <button onPointerDown={() => setCrankOpen(false)} style={{
                            ...mono, fontSize: 11, marginTop: 10, background: 'none', border: 'none',
                            color: '#7a715c', cursor: 'pointer',
                        }}>sair</button>
                    </div>
                </div>
            )}

            {/* blackout veil + the whisper */}
            {f6.phase === 'blackout' && (
                <div style={{
                    position: 'absolute', inset: 0, background: '#000', pointerEvents: 'auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'f6fadein 0.35s',
                }}>
                    <div style={{ ...mono, fontSize: 17, color: '#8a8276', opacity: 0, animation: 'f6whisper 1.2s 0.5s forwards' }}>
                        "não."
                    </div>
                </div>
            )}

            {/* the guest's dialogue */}
            {f6.phase === 'guest' && (
                <div onPointerDown={advanceGuest} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                }}>
                    <div style={{
                        margin: '0 14px calc(env(safe-area-inset-bottom) + 18px)',
                        maxWidth: 620, alignSelf: 'center', width: 'calc(100% - 28px)',
                        background: 'rgba(10,9,8,0.92)', border: '1px solid #5a4438',
                        borderRadius: 10, padding: '14px 18px 12px', boxShadow: '0 10px 36px rgba(0,0,0,0.9)',
                    }}>
                        <div style={{ ...mono, fontSize: 12, letterSpacing: 3, color: '#b06a52', marginBottom: 8 }}>O HÓSPEDE</div>
                        <div style={{ ...mono, fontSize: 16, lineHeight: 1.6, minHeight: 54 }}>
                            <GuestType
                                text={F6_GUEST_LINES[f6.guestLine]}
                                onDone={() => setGuestTyped(true)}
                                fastRef={guestFastRef}
                            />
                        </div>
                        {guestTyped && (
                            <div style={{ ...mono, fontSize: 11, color: '#7a715c', marginTop: 8, textAlign: 'right' }}>
                                {f6.guestLine < F6_GUEST_LINES.length - 1 ? 'toque ▸' : 'toque…'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes f6shake { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-7px) } 75% { transform: translateX(7px) } }
                @keyframes f6fadein { from { opacity: 0 } to { opacity: 1 } }
                @keyframes f6whisper { from { opacity: 0 } to { opacity: 0.9 } }
            `}</style>
        </div>
    );
};

export default Floor6Overlay;
