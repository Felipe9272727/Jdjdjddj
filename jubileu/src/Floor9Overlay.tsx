/**
 * Floor9Overlay.tsx — a camada DOM do Viveiro. Além das legendas/veils, aqui
 * mora a LEGIBILIDADE do andar (o feedback que faltava nas mecânicas):
 *  - BÚSSOLA: a seta do objetivo GIRA apontando a direção real relativa à
 *    câmera (antes era só "26 m" sem direção — inútil no mato escuro).
 *  - COLHER: hint ao se aproximar do fruto + barra "colhendo memória…" nos
 *    0.4 s de segurar (o motor era invisível — o player não descobria).
 *  - SUSSURROS: cada fruto colhido conta a memória que ele é (a lore — a foto
 *    do 6º, o navio do 7º, o interrogatório do 8º) e a Raiz responde a cada
 *    entrega.
 *  - TUTORIAL DA ONDA: callout grande na PRIMEIRA vez que o ar clareia.
 *  - NOVO OBJETIVO: banner ao ganhar o controle (chegada → explorar).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    f9, f9Subscribe, f9Objective, f9ChegadaDone, f9ReplantioDone,
    F9_CHEGADA_LINES, F9_RAIZ_LINES, F9_MEMORIA_LINES, F9_ENTREGA_LINES,
    F9_OCOS, F9_RAIZ,
} from './f9Floresta';
import { f9eco, f9EcoOn, f9EcoSubscribe, f9PickupProgress } from './f9Eco';

const mono: React.CSSProperties = { fontFamily: 'monospace', color: '#dfe8d2', userSelect: 'none' };

type ObjKind = 'oco' | 'oferenda' | 'raiz' | 'passagem';
interface ObjTarget { dist: number; kind: ObjKind; bearing: number | null; }
const OBJ_LABEL: Record<ObjKind, string> = {
    oco: 'OCO', oferenda: 'OFERENDA', raiz: 'A RAIZ', passagem: 'A PASSAGEM',
};

/**
 * O alvo do HUD (10 Hz): prioridade EMERGÊNCIA (aviso/onda → oco) > passagem
 * aberta (→ portal) > carregando (→ Raiz) > o fruto no chão mais próximo.
 * `bearing` = ângulo do alvo RELATIVO à câmera (0 = à frente, +90° = à
 * direita) — vira a rotação da seta; null sem cameraThetaRef (a seta fica ↑).
 */
const useObjectiveTarget = (
    playerPositionRef?: React.MutableRefObject<{ x: number; z: number }>,
    cameraThetaRef?: React.MutableRefObject<number>,
): ObjTarget | null => {
    const [t, setT] = useState<ObjTarget | null>(null);
    useEffect(() => {
        if (!playerPositionRef) return;
        const id = window.setInterval(() => {
            const p = playerPositionRef.current;
            if (!p || f9.phase !== 'explorar') { setT(null); return; }
            let tx: number, tz: number, kind: ObjKind;
            if (f9eco.phase === 'aviso' || f9eco.phase === 'onda') {
                let bx = F9_OCOS[0][0], bz = F9_OCOS[0][1], bd = Infinity;
                for (const [ox, oz] of F9_OCOS) {
                    const d = Math.hypot(p.x - ox, p.z - oz);
                    if (d < bd) { bd = d; bx = ox; bz = oz; }
                }
                tx = bx; tz = bz; kind = 'oco';
            } else if (f9eco.rootState === 'desabrochada') {
                tx = F9_RAIZ[0]; tz = F9_RAIZ[1] + 2.5; kind = 'passagem';
            } else if (f9eco.offerings.some((o) => o.state === 'carregada')) {
                tx = F9_RAIZ[0]; tz = F9_RAIZ[1]; kind = 'raiz';
            } else {
                let bx = F9_RAIZ[0], bz = F9_RAIZ[1], bd = Infinity;
                for (const o of f9eco.offerings) {
                    if (o.state !== 'noChao') continue;
                    const d = Math.hypot(p.x - o.x, p.z - o.z);
                    if (d < bd) { bd = d; bx = o.x; bz = o.z; }
                }
                tx = bx; tz = bz; kind = bd < Infinity ? 'oferenda' : 'raiz';
            }
            const dx = tx - p.x, dz = tz - p.z;
            let bearing: number | null = null;
            if (cameraThetaRef) {
                // forward do player: (-sinθ, -cosθ); right: (cosθ, -sinθ).
                const th = cameraThetaRef.current;
                const fx = -Math.sin(th), fz = -Math.cos(th);
                const rx = Math.cos(th), rz = -Math.sin(th);
                bearing = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz) * 180 / Math.PI;
            }
            setT({ dist: Math.round(Math.hypot(dx, dz)), kind, bearing });
        }, 100);
        return () => window.clearInterval(id);
    }, [playerPositionRef, cameraThetaRef]);
    return t;
};

/** Proximidade do fruto + progresso da colheita (10 Hz — feedback da mecânica). */
const usePickup = (playerPositionRef?: React.MutableRefObject<{ x: number; z: number }>) => {
    const [st, setSt] = useState<{ near: boolean; k: number }>({ near: false, k: 0 });
    useEffect(() => {
        if (!playerPositionRef) return;
        const id = window.setInterval(() => {
            const p = playerPositionRef.current;
            if (!p || f9.phase !== 'explorar' || f9eco.offerings.some((o) => o.state === 'carregada')) {
                setSt((s) => (s.near || s.k ? { near: false, k: 0 } : s));
                return;
            }
            let near = false;
            for (const o of f9eco.offerings) {
                if (o.state !== 'noChao') continue;
                if (Math.hypot(p.x - o.x, p.z - o.z) < 4.5) { near = true; break; }
            }
            const prog = f9PickupProgress();
            setSt({ near, k: prog ? prog.k : 0 });
        }, 100);
        return () => window.clearInterval(id);
    }, [playerPositionRef]);
    return st;
};

export const Floor9Overlay: React.FC<{
    onUiOpenChange: (open: boolean) => void;
    playerPositionRef?: React.MutableRefObject<{ x: number; z: number }>;
    cameraThetaRef?: React.MutableRefObject<number>;
    onComplete?: () => void;
}> = ({ onUiOpenChange, playerPositionRef, cameraThetaRef, onComplete }) => {
    const [, setV] = useState(0);
    const [line, setLine] = useState(0);
    const [completo, setCompleto] = useState(false);   // V4: teaser do Andar 10
    const [bloomFlash, setBloomFlash] = useState(0);   // V4: flash da desabrochada
    const [whisper, setWhisper] = useState<{ text: string; key: number } | null>(null);
    const [banner, setBanner] = useState(false);       // "novo objetivo" pós-chegada
    const [ondaTut, setOndaTut] = useState(false);     // tutorial da 1ª onda
    const ondaSeen = useRef(false);
    const prevPhase = useRef(f9.phase);
    const prevEco = useRef(f9eco.phase);

    useEffect(() => f9Subscribe(() => setV((x) => x + 1)), []);
    useEffect(() => f9EcoSubscribe(() => setV((x) => x + 1)), []);
    // transições de fase do ANDAR: reset das legendas + banner de objetivo
    useEffect(() => f9Subscribe(() => {
        if (f9.phase !== prevPhase.current) {
            if (f9.phase === 'chegada') setLine(0);
            if (prevPhase.current === 'chegada' && f9.phase === 'explorar') setBanner(true);
            prevPhase.current = f9.phase;
        }
    }), []);
    useEffect(() => {
        if (!banner) return;
        const t = setTimeout(() => setBanner(false), 4000);
        return () => clearTimeout(t);
    }, [banner]);
    // transições do ECO: o tutorial da PRIMEIRA onda
    useEffect(() => f9EcoSubscribe(() => {
        if (f9eco.phase !== prevEco.current) {
            if (f9eco.phase === 'aviso' && !ondaSeen.current && f9.phase === 'explorar') {
                ondaSeen.current = true;
                setOndaTut(true);
            }
            prevEco.current = f9eco.phase;
        }
    }), []);
    useEffect(() => {
        if (!ondaTut) return;
        const t = setTimeout(() => setOndaTut(false), 5000);
        return () => clearTimeout(t);
    }, [ondaTut]);
    // eventos do motor: conclusão, flash, e os SUSSURROS de lore
    useEffect(() => f9EcoOn((e) => {
        if (e === 'f9Completo') {
            setCompleto(true);
            try { if (typeof window !== 'undefined') window.localStorage.setItem('tne_raiz_9', '1'); } catch { /* ignore */ }
        }
        if (e === 'raizDesabrocha') setBloomFlash((k) => k + 1);
        if (e === 'oferendaPega') {
            const o = f9eco.offerings.find((x) => x.state === 'carregada');
            const text = o ? F9_MEMORIA_LINES[o.id] : null;
            if (text) setWhisper({ text, key: Date.now() });
        }
        if (e === 'oferendaEntregue' && f9eco.rootWake <= F9_ENTREGA_LINES.length) {
            setWhisper({ text: F9_ENTREGA_LINES[f9eco.rootWake - 1], key: Date.now() });
        }
    }), []);
    useEffect(() => {
        if (!whisper) return;
        const t = setTimeout(() => setWhisper(null), 6500);
        return () => clearTimeout(t);
    }, [whisper]);

    const chegada = f9.phase === 'chegada';
    const apagando = f9.phase === 'apagando';
    const uiOpen = chegada || apagando || completo || f9.phase === 'queda';
    useEffect(() => { onUiOpenChange(uiOpen); }, [uiOpen, onUiOpenChange]);
    useEffect(() => () => onUiOpenChange(false), [onUiOpenChange]);

    // SOFTLOCK FIX (P0): fallback por timer do fim do veil (onAnimationEnd é
    // frágil no mobile); f9ReplantioDone é idempotente.
    useEffect(() => {
        if (!apagando) return;
        const t = setTimeout(() => { f9ReplantioDone(); }, 3600);
        return () => clearTimeout(t);
    }, [apagando]);

    const emergency = f9.phase === 'explorar' && (f9eco.phase === 'aviso' || f9eco.phase === 'onda');
    const aviso = f9.phase === 'explorar' && f9eco.phase === 'aviso';
    const carrying = f9eco.offerings.some((o) => o.state === 'carregada');

    let objective = f9Objective();
    if (f9.phase === 'explorar' && !emergency && !completo) {
        if (f9eco.rootState === 'desabrochada') objective = 'A passagem abriu. Entre na luz.';
        else if (carrying) objective = `Leve a Oferenda até a Raiz  ·  ${f9eco.rootWake}/3`;
        else objective = `Ache um fruto de luz  ·  ${f9eco.rootWake}/3 entregues`;
    }
    const target = useObjectiveTarget(playerPositionRef, cameraThetaRef);
    const pickup = usePickup(playerPositionRef);
    const vigK = f9eco.phase === 'onda' ? 0.78 : aviso ? 0.66 : 0.52;
    const accent = emergency ? '#ffca7a'
        : target?.kind === 'oferenda' ? '#ffd97a'
        : target?.kind === 'passagem' ? '#ffca4a'
        : '#e88a8a';

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            {/* a moldura úmida do Viveiro */}
            <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse at center, transparent 40%, rgba(3,7,5,${vigK}) 100%)`,
            }} />

            {/* objetivo + BÚSSOLA (a seta gira pra direção real) + distância */}
            {objective && !chegada && !completo && (
                <div style={{
                    ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 58px)', left: 0, right: 0,
                    textAlign: 'center', textShadow: '0 1px 3px #000',
                    animation: aviso ? 'f9pulse 1.1s ease-in-out infinite' : undefined,
                }}>
                    <div style={{
                        fontSize: 13, letterSpacing: 1,
                        color: emergency ? '#ffe9c9' : '#cfdcc0',
                    }}>{objective}</div>
                    {target && (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            marginTop: 4, fontSize: 15, letterSpacing: 3, fontWeight: 700, color: accent,
                        }}>
                            <span style={{
                                display: 'inline-block', fontSize: 19, lineHeight: 1,
                                transform: `rotate(${(target.bearing ?? 0) - 90}deg)`,
                                transition: 'transform 0.12s linear',
                            }}>➤</span>
                            {OBJ_LABEL[target.kind]} · {target.dist} m
                        </div>
                    )}
                </div>
            )}

            {/* os 3 PIPS de oferenda */}
            {f9.phase === 'explorar' && !completo && (
                <div style={{
                    position: 'absolute', top: 'calc(env(safe-area-inset-top) + 14px)', left: 16,
                    display: 'flex', alignItems: 'center', gap: 7, pointerEvents: 'none',
                }}>
                    {[0, 1, 2].map((i) => (
                        <div key={i} style={{
                            width: 11, height: 11, borderRadius: '50%',
                            border: '1.5px solid #d9b96a',
                            background: f9eco.rootWake > i ? '#ffca4a' : 'transparent',
                            boxShadow: f9eco.rootWake > i ? '0 0 9px #ffca4a' : 'none',
                            transition: 'background 0.4s, box-shadow 0.4s',
                        }} />
                    ))}
                    <div style={{ ...mono, fontSize: 11, color: '#d9b96a', letterSpacing: 1, textShadow: '0 1px 3px #000', marginLeft: 4 }}>
                        Oferendas {f9eco.rootWake}/3
                    </div>
                </div>
            )}

            {/* COLHER: hint de proximidade + barra de progresso dos 0.4 s */}
            {f9.phase === 'explorar' && !completo && !emergency && (pickup.near || pickup.k > 0) && (
                <div style={{
                    position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 64px)', left: 0, right: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}>
                    <div style={{
                        ...mono, fontSize: 12.5, letterSpacing: 1, color: '#ffe9b0',
                        textShadow: '0 1px 3px #000',
                        animation: pickup.k > 0 ? undefined : 'f9pulse 1.4s ease-in-out infinite',
                    }}>
                        {pickup.k > 0 ? 'colhendo a memória…' : 'chegue JUNTO do fruto pra colher'}
                    </div>
                    {pickup.k > 0 && (
                        <div style={{ width: 150, height: 5, borderRadius: 3, background: 'rgba(255,233,176,0.18)', overflow: 'hidden' }}>
                            <div style={{
                                width: `${Math.round(pickup.k * 100)}%`, height: '100%',
                                background: '#ffca4a', boxShadow: '0 0 8px #ffca4a',
                                transition: 'width 0.1s linear',
                            }} />
                        </div>
                    )}
                </div>
            )}

            {/* o hint de carregar */}
            {carrying && f9.phase === 'explorar' && !completo && (
                <div style={{
                    ...mono, position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 18px)', left: 0, right: 0,
                    textAlign: 'center', fontSize: 12, letterSpacing: 1, color: '#ffd97a',
                    textShadow: '0 1px 3px #000', animation: 'f9pulse 1.6s ease-in-out infinite',
                }}>uma oferenda nos ombros — lento, barulhento. leve-a à Raiz.</div>
            )}

            {/* SUSSURRO de lore (fruto colhido / resposta da Raiz) */}
            {whisper && f9.phase === 'explorar' && !completo && (
                <div key={whisper.key} style={{
                    position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 108px)',
                    display: 'flex', justifyContent: 'center', padding: '0 18px',
                }}>
                    <div style={{
                        ...mono, maxWidth: 520, textAlign: 'center', fontSize: 13.5, lineHeight: 1.55,
                        fontStyle: 'italic', color: '#e8dfc4', textShadow: '0 2px 6px #000',
                        background: 'rgba(8,10,6,0.66)', border: '1px solid rgba(217,185,106,0.35)',
                        borderRadius: 10, padding: '10px 14px', animation: 'f9whisper 6.5s ease-in-out forwards',
                    }}>{whisper.text}</div>
                </div>
            )}

            {/* NOVO OBJETIVO (pós-chegada) */}
            {banner && f9.phase === 'explorar' && (
                <div style={{
                    position: 'absolute', left: 0, right: 0, top: '30%',
                    display: 'flex', justifyContent: 'center',
                }}>
                    <div style={{
                        ...mono, textAlign: 'center', animation: 'f9banner 4s ease-in-out forwards',
                        background: 'rgba(8,10,6,0.7)', border: '1px solid #d9b96a', borderRadius: 10,
                        padding: '12px 22px',
                    }}>
                        <div style={{ fontSize: 10, letterSpacing: 4, color: '#d9b96a', marginBottom: 6 }}>NOVO OBJETIVO</div>
                        <div style={{ fontSize: 15, letterSpacing: 1 }}>As três Oferendas — leve os frutos de luz à Raiz</div>
                    </div>
                </div>
            )}

            {/* TUTORIAL DA PRIMEIRA ONDA */}
            {ondaTut && (
                <div style={{
                    position: 'absolute', left: 0, right: 0, top: '38%',
                    display: 'flex', justifyContent: 'center', padding: '0 16px',
                }}>
                    <div style={{
                        ...mono, maxWidth: 460, textAlign: 'center', animation: 'f9banner 5s ease-in-out forwards',
                        background: 'rgba(20,14,4,0.85)', border: '1px solid #ffca7a', borderRadius: 10,
                        padding: '14px 20px', boxShadow: '0 0 30px rgba(255,202,122,0.25)',
                    }}>
                        <div style={{ fontSize: 11, letterSpacing: 3, color: '#ffca7a', marginBottom: 7 }}>O AR ESTÁ CLAREANDO</div>
                        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: '#ffe9c9' }}>
                            A ONDA DE APAGAMENTO vem aí. Corra pro OCO mais perto — a árvore de boca AZUL. Fora dela, você é apagado.
                        </div>
                    </div>
                </div>
            )}

            {/* o FLASH da desabrochada */}
            {bloomFlash > 0 && (
                <div key={bloomFlash} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'radial-gradient(circle at 50% 60%, #fff8e8 0%, #ffca4a 55%, rgba(255,202,74,0) 100%)',
                    animation: 'f9bloom 1.5s ease-out forwards',
                }} />
            )}

            {/* o CARTÃO TEASER do fim de andar — com a lore da Raiz */}
            {completo && (
                <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(6,8,5,0.72)',
                }}>
                    <div style={{
                        ...mono, maxWidth: 500, margin: '0 16px', textAlign: 'center',
                        background: 'rgba(14,12,6,0.96)', border: '1px solid #d9b96a', borderRadius: 12,
                        padding: '26px 24px 22px', boxShadow: '0 0 44px rgba(255,202,74,0.25)',
                    }}>
                        <div style={{ fontSize: 11, letterSpacing: 4, color: '#d9b96a', marginBottom: 14 }}>ANDAR 9 — O VIVEIRO</div>
                        {F9_RAIZ_LINES.map((l, i) => (
                            <div key={i} style={{
                                fontSize: 15.5, lineHeight: 1.6, fontStyle: 'italic', marginBottom: 10,
                                color: i === F9_RAIZ_LINES.length - 1 ? '#ffe4a6' : '#dfe8d2',
                            }}>{l}</div>
                        ))}
                        <div style={{ fontSize: 12, color: '#9a8f6c', marginTop: 8, letterSpacing: 1 }}>(Andar 10 em breve)</div>
                        <button
                            onPointerDown={(e) => { e.stopPropagation(); if (onComplete) onComplete(); }}
                            style={{
                                ...mono, marginTop: 20, fontSize: 14, letterSpacing: 1.5, cursor: 'pointer',
                                background: '#d9b96a', color: '#14100a', border: 'none', borderRadius: 8,
                                padding: '11px 22px',
                            }}
                        >Voltar ao elevador</button>
                    </div>
                </div>
            )}

            {/* legendas da chegada */}
            {chegada && (
                <div onPointerDown={() => {
                    if (line < F9_CHEGADA_LINES.length - 1) setLine((l) => l + 1);
                    else f9ChegadaDone();
                }} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)',
                }}>
                    <div style={{
                        ...mono, maxWidth: 620, margin: '0 16px calc(env(safe-area-inset-bottom) + 34px)',
                        fontSize: 15.5, lineHeight: 1.65, fontStyle: 'italic', textAlign: 'center',
                        textShadow: '0 2px 8px #000',
                    }}>
                        {F9_CHEGADA_LINES[line]}
                        <div style={{ fontSize: 11, color: '#8a967c', marginTop: 10 }}>
                            {line < F9_CHEGADA_LINES.length - 1 ? 'toque ▸' : 'toque pra começar ▸'}
                        </div>
                    </div>
                </div>
            )}

            {/* o REPLANTIO */}
            {apagando && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
                    <div onAnimationEnd={() => f9ReplantioDone()} style={{ position: 'absolute', inset: 0, background: '#eef4e8', animation: 'f9wipe 3.4s ease-in-out forwards' }} />
                    <div style={{
                        ...mono, position: 'absolute', left: 0, right: 0, top: '46%', textAlign: 'center',
                        fontSize: 15, color: '#41503c', letterSpacing: 2, animation: 'f9wipeTxt 3.4s ease-in-out forwards', opacity: 0,
                    }}>
                        {f9.causa === 'vulto'
                            ? 'dentes na nuca. escuro. …o Viveiro não te deixa acabar: algo te replanta.'
                            : 'a onda te encontrou. algo te replanta perto de um oco.'}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes f9pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
                @keyframes f9wipe { 0%{opacity:0} 22%{opacity:1} 74%{opacity:1} 100%{opacity:0} }
                @keyframes f9wipeTxt { 0%{opacity:0} 30%{opacity:0} 45%{opacity:1} 70%{opacity:1} 85%{opacity:0} 100%{opacity:0} }
                @keyframes f9bloom { 0%{opacity:1} 100%{opacity:0} }
                @keyframes f9whisper { 0%{opacity:0; transform: translateY(8px)} 8%{opacity:1; transform: translateY(0)} 82%{opacity:1} 100%{opacity:0} }
                @keyframes f9banner { 0%{opacity:0; transform: scale(0.96)} 10%{opacity:1; transform: scale(1)} 82%{opacity:1} 100%{opacity:0} }
            `}</style>
        </div>
    );
};

export default Floor9Overlay;
