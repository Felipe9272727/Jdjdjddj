/**
 * Floor4Interact.tsx — the DOM interaction layer of the 2D Floor 4 (mounted by
 * Floor4Canvas2D over its canvas). Drives the full arc (see f4Lore.ts):
 *
 *  • contextual prompt ([E] / touch button) when the player nears a point;
 *  • the Zelador cinematic trigger (first steps) + player freeze while it runs;
 *  • ROOM TRANSITIONS (lobby ⇄ basement, lobby → beyond) behind a quick fade;
 *  • typewriter reading panel (examines + the receptionist's diary pages);
 *  • puzzle UIs: GERADOR levers, reception bell (live ring tally), the
 *    reservation slip ("QUARTO 404 — NÃO ENCONTRADO"), safe keypad → master
 *    key + the photo of the original lobby;
 *  • THE KEEPER DIALOGUE: detailed fire-lit portrait + question buttons, the
 *    final question hands page 5 → finale ("VOCÊ LEMBROU DO ANDAR 4");
 *  • OBJETIVO HUD line + DICA buttons (3 progressive hints per puzzle).
 *
 * While any panel is open `uiLockRef` freezes the player. State changes
 * re-render through the PARENT (Floor4Canvas2D owns the f4SetOnChange
 * subscription) — this component must stay un-memoized.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    f4, f4NearestPoint, f4CollectPage, f4FinishIfLastPage,
    f4SetLever, f4RingBell, f4TrySafe, f4UseDoor, f4PagesCollected,
    f4GoRoom, f4TriggerRunner, f4TakeCode, f4MeetKeeper, f4AskKeeper,
    f4Objective, F4_HINTS, F4_BELL_RINGS, F4_DIARY, F4_KEEPER_DIALOG,
    type F4Point,
} from './f4Lore';
import {
    playF4Paper, playF4Bell, playF4Clack, playF4PowerOn,
    playF4SafeTick, playF4SafeOpen, playF4DoorCreak, playF4Lock,
    playF4MemoryChime,
} from './floor4Sfx';
import { lobbyPhotoUrl, keeperPortraitUrl } from './Floor4Scene2D';

type Panel =
    | { kind: 'none' }
    | { kind: 'read'; title?: string; text: string; finishPage?: number }
    | { kind: 'generator' }
    | { kind: 'safe' }
    | { kind: 'photo' }
    | { kind: 'slip' }
    | { kind: 'talk' };

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
    const [toast, setToast] = useState<string | null>(null);     // brief center text
    const [finale, setFinale] = useState(false);
    const [fade, setFade] = useState(false);                     // room-transition veil
    const [talkAnswer, setTalkAnswer] = useState<string | null>(null);
    // DICA progress per puzzle panel (0 = none revealed yet; resets per visit)
    const [hintN, setHintN] = useState<{ generator: number; safe: number }>({ generator: 0, safe: 0 });
    const panelRef = useRef(panel);
    panelRef.current = panel;
    const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

    useEffect(() => { uiLockRef.current = panel.kind !== 'none' || finale || fade || f4.runnerActive; });

    // poll the player position: nearest point, the runner trigger, the way back
    useEffect(() => {
        const id = setInterval(() => {
            const px = playerXRef.current;
            // the Zelador bursts in on the first real steps out of the elevator
            if (f4.room === 'lobby' && !f4.runnerSeen && !f4.runnerActive && px > -4.6) f4TriggerRunner();
            // beyond: walking back to the left edge returns through the door
            if (f4.room === 'beyond' && px <= -0.45 && panelRef.current.kind === 'none') {
                transition(() => f4GoRoom('lobby', 11.5));
                return;
            }
            setPrompt(panelRef.current.kind === 'none' && !f4.runnerActive ? f4NearestPoint(px) : null);
        }, 120);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playerXRef]);

    /** Quick black veil around a room swap (the swap runs mid-fade). */
    const transition = (apply: () => void) => {
        setFade(true);
        setTimeout(() => { apply(); }, 240);
        setTimeout(() => setFade(false), 520);
    };

    const activate = (p: F4Point) => {
        if (p.kind === 'examine' && p.text) setPanel({ kind: 'read', text: p.text });
        if (p.kind === 'page' && p.page !== undefined) {
            f4CollectPage(p.page);
            playF4Paper();
            setPanel({ kind: 'read', title: F4_DIARY[p.page].title, text: F4_DIARY[p.page].text, finishPage: p.page });
        }
        if (p.kind === 'generator') { setHintN((h) => ({ ...h, generator: 0 })); setPanel({ kind: 'generator' }); }
        if (p.kind === 'safe') { setSafeCode(''); setHintN((h) => ({ ...h, safe: 0 })); setPanel({ kind: 'safe' }); }
        if (p.kind === 'bell') {
            playF4Bell();
            const r = f4RingBell(Date.now());
            if (r === 'ring') {
                // live tally so the player SEES the count building toward the 5th risco
                const msg = '🔔 ' + '|'.repeat(f4.bellCount);
                setToast(msg);
                setTimeout(() => setToast((t) => (t === msg ? null : t)), 1100);
            }
            if (r === 'solved') {
                setToast('🔔 ' + '|'.repeat(F4_BELL_RINGS));
                setTimeout(() => setToast(null), 1100);
                setTimeout(() => { shakeRef.current = 0.7; }, 600);   // he stirs…
            }
        }
        if (p.kind === 'paper') {
            if (f4TakeCode()) { playF4Paper(); setPanel({ kind: 'slip' }); }
        }
        if (p.kind === 'door') {
            const r = f4UseDoor();
            if (r === 'locked') setPanel({ kind: 'read', text: 'Trancada. O cadeado é novo — e quem o fechou estava sorrindo.' });
            if (r === 'unlock') {
                playF4Lock();
                setTimeout(playF4DoorCreak, 350);
                setToast('destrancada.');
                setTimeout(() => setToast(null), 2200);
            }
            if (r === 'enter') transition(() => f4GoRoom('beyond', 0.4));
        }
        if (p.kind === 'descend') transition(() => f4GoRoom('basement', -3.2));
        if (p.kind === 'climb') transition(() => f4GoRoom('lobby', 6.2));
        if (p.kind === 'keeper') {
            f4MeetKeeper();
            setTalkAnswer(null);
            setPanel({ kind: 'talk' });
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
                else if (pn.kind === 'photo' || pn.kind === 'slip') setPanel({ kind: 'none' });
                else if (pn.kind === 'none') { const p = f4NearestPoint(playerXRef.current); if (p && !f4.runnerActive) activate(p); }
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
            setTimeout(() => setPanel({ kind: 'none' }), 900);
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
                setTimeout(() => setPanel({ kind: 'photo' }), 650);
            } else {
                setTimeout(() => setSafeCode(''), 350);
            }
        }
    };

    const ask = (id: string) => {
        const d = f4AskKeeper(id);
        if (!d) return;
        setTalkAnswer(d.a);
        if (d.final && !f4.pages[4]) {
            // the final question hands over page 5 — read it, then the finale
            setTimeout(() => {
                f4CollectPage(4);
                playF4Paper();
                setPanel({ kind: 'read', title: F4_DIARY[4].title, text: F4_DIARY[4].text, finishPage: 4 });
            }, 5200);
        }
    };

    const pages = f4PagesCollected();
    const objective = f4Objective();
    const btn: React.CSSProperties = {
        ...PIX, padding: '10px 18px', fontSize: 15, fontWeight: 700, letterSpacing: 1,
        cursor: 'pointer', userSelect: 'none',
    };

    return (
        <>
            {/* OBJETIVO HUD — always tells the player the next move */}
            {objective && !finale && panel.kind === 'none' && !f4.runnerActive && (
                <div style={{ ...PIX, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: 'calc(env(safe-area-inset-left) + 14px)', maxWidth: 'min(60vw, 440px)', padding: '7px 11px', fontSize: 11, lineHeight: 1.55, border: '2px solid #f4f0e6', opacity: 0.92 }}>
                    <span style={{ color: '#FFD54F', fontWeight: 700, letterSpacing: 2 }}>OBJETIVO</span>
                    <span style={{ opacity: 0.9 }}> — {objective}</span>
                </div>
            )}

            {/* pages HUD */}
            {pages > 0 && !finale && (
                <div style={{ ...PIX, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', right: 'calc(env(safe-area-inset-right) + 14px)', padding: '6px 10px', fontSize: 12, fontWeight: 700, letterSpacing: 2, border: '2px solid #f4f0e6', opacity: 0.92 }}>
                    PÁGINAS {pages}/5
                </div>
            )}

            {/* contextual prompt — above the jump button, NEVER over the player
                (the camera keeps the player center-frame, so center is taken) */}
            {prompt && panel.kind === 'none' && !finale && !fade && (
                <button
                    onClick={() => activate(prompt)}
                    style={{ ...btn, position: 'absolute', right: 'calc(env(safe-area-inset-right) + 22px)', bottom: 'calc(env(safe-area-inset-bottom) + 116px)' }}>
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

            {/* P1 — the GENERATOR panel (basement) */}
            {panel.kind === 'generator' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
                    <div style={{ ...PIX, padding: 18, textAlign: 'center' }}>
                        <div style={{ color: '#FFD54F', fontSize: 12, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>GERADOR</div>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 12 }}>a partida é um ritmo — a lâmpada insiste nele</div>
                        <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                            {f4.levers.map((lv, i) => (
                                <button key={i} onClick={() => flipLever(i)}
                                    style={{ ...PIX, width: 52, height: 84, cursor: 'pointer', position: 'relative', border: '2px solid #f4f0e6', background: '#1a1e28' }}>
                                    <div style={{ position: 'absolute', left: 10, right: 10, top: lv ? 8 : 44, height: 32, background: lv ? '#81C784' : '#FF5252', border: '2px solid #0d0f16', transition: 'top 0.12s' }} />
                                    <div style={{ position: 'absolute', bottom: -22, left: 0, right: 0, fontSize: 10, color: '#f4f0e6', opacity: 0.6 }}>{lv ? 'CIMA' : 'BAIXO'}</div>
                                </button>
                            ))}
                        </div>
                        {hintN.generator > 0 && (
                            <div style={{ marginTop: 30, maxWidth: 280, fontSize: 11, lineHeight: 1.55, color: '#FFD54F' }}>
                                💡 {F4_HINTS.generator[hintN.generator - 1]}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: hintN.generator > 0 ? 12 : 34 }}>
                            {hintN.generator < F4_HINTS.generator.length && (
                                <button onClick={() => setHintN((h) => ({ ...h, generator: h.generator + 1 }))} style={{ ...btn, fontSize: 11, padding: '6px 12px', color: '#FFD54F' }}>
                                    DICA ({hintN.generator + 1}/{F4_HINTS.generator.length})
                                </button>
                            )}
                            <button onClick={() => setPanel({ kind: 'none' })} style={{ ...btn, fontSize: 11, padding: '6px 12px' }}>FECHAR</button>
                        </div>
                    </div>
                </div>
            )}

            {/* the reservation slip — the guest's whole story in one paper */}
            {panel.kind === 'slip' && (
                <div onClick={() => setPanel({ kind: 'none' })} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', cursor: 'pointer' }}>
                    <div style={{ ...PIX, background: '#e8dfc8', color: '#3a3128', padding: '22px 26px', maxWidth: 360, textAlign: 'center', transform: 'rotate(-1.5deg)' }}>
                        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.7 }}>HOTEL — RECEPÇÃO</div>
                        <div style={{ fontSize: 12, letterSpacing: 2, margin: '12px 0 4px' }}>COMPROVANTE DE RESERVA</div>
                        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 6, margin: '10px 0', color: '#54090e' }}>QUARTO 404</div>
                        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#7e1416' }}>— NÃO ENCONTRADO —</div>
                        <div style={{ fontSize: 10, marginTop: 14, opacity: 0.65, lineHeight: 1.6 }}>ele segurou isto o tempo todo.<br />{isTouch ? 'toque para guardar' : '[E] guardar'}</div>
                    </div>
                </div>
            )}

            {/* P3 — safe keypad */}
            {panel.kind === 'safe' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
                    <div style={{ ...PIX, padding: 18, textAlign: 'center' }}>
                        <div style={{ color: '#FFD54F', fontSize: 12, letterSpacing: 3, fontWeight: 700, marginBottom: 10 }}>COFRE DA RECEPÇÃO</div>
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
                        {hintN.safe > 0 && (
                            <div style={{ marginTop: 14, maxWidth: 240, fontSize: 11, lineHeight: 1.55, color: '#FFD54F' }}>
                                💡 {F4_HINTS.safe[hintN.safe - 1]}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: hintN.safe > 0 ? 12 : 14 }}>
                            {hintN.safe < F4_HINTS.safe.length && (
                                <button onClick={() => setHintN((h) => ({ ...h, safe: h.safe + 1 }))} style={{ ...btn, fontSize: 11, padding: '6px 12px', color: '#FFD54F' }}>
                                    DICA ({hintN.safe + 1}/{F4_HINTS.safe.length})
                                </button>
                            )}
                            <button onClick={() => setPanel({ kind: 'none' })} style={{ ...btn, fontSize: 11, padding: '6px 12px' }}>FECHAR</button>
                        </div>
                    </div>
                </div>
            )}

            {/* P3 payoff — the master key + the photo of the original lobby */}
            {panel.kind === 'photo' && (
                <div onClick={() => setPanel({ kind: 'none' })} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'rgba(0,0,0,0.72)', cursor: 'pointer' }}>
                    <img src={lobbyPhotoUrl} alt="O Saguão original, intacto" style={{ width: 'min(70vw, 560px)', imageRendering: 'pixelated', border: '4px solid #f4f0e6', borderRadius: 4, boxShadow: '0 10px 0 rgba(0,0,0,0.5)' }} />
                    <div style={{ ...PIX, padding: '10px 16px', fontSize: 13, maxWidth: 480, textAlign: 'center' }}>
                        <Type text={'Era aqui. Antes de decidirem esquecer. Junto da foto: a CHAVE-MESTRA.'} />
                    </div>
                </div>
            )}

            {/* THE KEEPER — detailed portrait + questions (the deep talk) */}
            {panel.kind === 'talk' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.66)' }}>
                    <div style={{ ...PIX, display: 'flex', gap: 16, padding: 16, margin: '0 14px', maxWidth: 640, width: 'min(92vw, 640px)' }}>
                        <div style={{ flexShrink: 0, alignSelf: 'flex-start' }}>
                            <img src={keeperPortraitUrl} alt="O primeiro recepcionista" style={{ width: 'min(34vw, 190px)', imageRendering: 'pixelated', border: '3px solid #f4f0e6', borderRadius: 4, display: 'block' }} />
                            <div style={{ fontSize: 9, letterSpacing: 1.5, textAlign: 'center', marginTop: 6, opacity: 0.75 }}>O PRIMEIRO<br />RECEPCIONISTA</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, lineHeight: 1.6, minHeight: 86 }}>
                                {talkAnswer
                                    ? <Type text={talkAnswer} />
                                    : <Type text={'…você completou o quinto risco, não foi? Eu ouvi o sino daqui. Senta. Pergunta o que quiser — lembrar em voz alta também conta.'} />}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                                {F4_KEEPER_DIALOG.map((d) => (
                                    <button key={d.id} onClick={() => ask(d.id)}
                                        style={{
                                            ...PIX, textAlign: 'left', padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                                            border: '2px solid #f4f0e6',
                                            opacity: f4.asked[d.id] ? 0.5 : 1,
                                            color: d.final ? '#FFD54F' : '#f4f0e6',
                                        }}>
                                        {f4.asked[d.id] ? '· ' : '? '}{d.q}
                                    </button>
                                ))}
                                <button onClick={() => setPanel({ kind: 'none' })} style={{ ...PIX, padding: '6px 10px', fontSize: 11, cursor: 'pointer', border: '2px solid #f4f0e6', opacity: 0.7 }}>
                                    SAIR DA CONVERSA
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* center toast ("destrancada.", bell tally) */}
            {toast && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 30, fontWeight: 700, color: '#f4f0e6', textShadow: '0 0 18px rgba(0,0,0,0.9), 0 3px 0 #000', letterSpacing: 3 }}>{toast}</div>
                </div>
            )}

            {/* room-transition veil */}
            <div style={{
                position: 'absolute', inset: 0, background: '#000', pointerEvents: fade ? 'auto' : 'none',
                opacity: fade ? 1 : 0, transition: 'opacity 0.24s ease-in-out',
            }} />

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
