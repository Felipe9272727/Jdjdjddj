/**
 * Floor9Overlay.tsx — a camada DOM do Viveiro: legendas da chegada (que ENSINAM
 * o objetivo), a linha-objetivo das 3 OFERENDAS, a SETA/distância que sempre
 * aponta pro PRÓXIMO passo certo, o aviso da onda, o VEIL do replantio e o
 * TEASER de fim de andar. Mesmo contrato de uiOpen dos outros andares.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    f9, f9Subscribe, f9Objective, f9ChegadaDone, f9ReplantioDone,
    F9_CHEGADA_LINES, F9_RAIZ_LINES, F9_OCOS, F9_RAIZ,
} from './f9Floresta';
import { f9eco, f9EcoOn, f9EcoSubscribe } from './f9Eco';

const mono: React.CSSProperties = { fontFamily: 'monospace', color: '#dfe8d2', userSelect: 'none' };

type ObjKind = 'oco' | 'oferenda' | 'raiz' | 'passagem';
interface ObjTarget { dist: number; kind: ObjKind; }
const OBJ_LABEL: Record<ObjKind, string> = {
    oco: '⌂ OCO', oferenda: '➤ OFERENDA', raiz: '➤ A RAIZ', passagem: '➤ A PASSAGEM',
};

/**
 * A SETA do HUD: sempre aponta pro PRÓXIMO passo certo, com distância legível.
 * Prioridade: EMERGÊNCIA (aviso/onda → OCO) > passagem aberta (→ portal) >
 * carregando (→ Raiz) > achar a próxima oferenda no chão. Atualiza a 2 Hz, fora
 * do rerender do three.
 */
const useObjectiveTarget = (playerPositionRef?: React.MutableRefObject<{ x: number; z: number }>): ObjTarget | null => {
    const [t, setT] = useState<ObjTarget | null>(null);
    useEffect(() => {
        if (!playerPositionRef) return;
        const id = window.setInterval(() => {
            const p = playerPositionRef.current;
            if (!p || f9.phase !== 'explorar') { setT(null); return; }
            // 1) EMERGÊNCIA: durante o aviso/onda, o único alvo que salva é o OCO
            if (f9eco.phase === 'aviso' || f9eco.phase === 'onda') {
                let best = Infinity;
                for (const [ox, oz] of F9_OCOS) best = Math.min(best, Math.hypot(p.x - ox, p.z - oz));
                setT({ dist: Math.round(best), kind: 'oco' });
                return;
            }
            // 2) a passagem já abriu → o portal, à frente da Raiz
            if (f9eco.rootState === 'desabrochada') {
                setT({ dist: Math.round(Math.hypot(p.x - F9_RAIZ[0], p.z - (F9_RAIZ[1] + 2.5))), kind: 'passagem' });
                return;
            }
            // 3) carregando uma oferenda → leve-a à Raiz
            if (f9eco.offerings.some((o) => o.state === 'carregada')) {
                setT({ dist: Math.round(Math.hypot(p.x - F9_RAIZ[0], p.z - F9_RAIZ[1])), kind: 'raiz' });
                return;
            }
            // 4) padrão → o fruto (no chão) mais próximo
            let best = Infinity;
            for (const o of f9eco.offerings) {
                if (o.state !== 'noChao') continue;
                best = Math.min(best, Math.hypot(p.x - o.x, p.z - o.z));
            }
            setT(best < Infinity
                ? { dist: Math.round(best), kind: 'oferenda' }
                : { dist: Math.round(Math.hypot(p.x - F9_RAIZ[0], p.z - F9_RAIZ[1])), kind: 'raiz' });
        }, 500);
        return () => window.clearInterval(id);
    }, [playerPositionRef]);
    return t;
};

export const Floor9Overlay: React.FC<{
    onUiOpenChange: (open: boolean) => void;
    playerPositionRef?: React.MutableRefObject<{ x: number; z: number }>;
    onComplete?: () => void;
}> = ({ onUiOpenChange, playerPositionRef, onComplete }) => {
    const [, setV] = useState(0);
    const [line, setLine] = useState(0);
    const [completo, setCompleto] = useState(false);   // V4: teaser do Andar 10
    const [bloomFlash, setBloomFlash] = useState(0);   // V4: flash branco→dourado da desabrochada
    const prevPhase = useRef(f9.phase);

    useEffect(() => f9Subscribe(() => setV((x) => x + 1)), []);
    useEffect(() => f9EcoSubscribe(() => setV((x) => x + 1)), []);
    useEffect(() => f9Subscribe(() => {
        if (f9.phase !== prevPhase.current) {
            if (f9.phase === 'chegada') setLine(0);
            prevPhase.current = f9.phase;
        }
    }), []);
    // V4: eventos do motor (fan-out — o drain da cena não é tocado)
    useEffect(() => f9EcoOn((e) => {
        if (e === 'f9Completo') {
            setCompleto(true);
            // a conclusão REAL do andar grava a flag (a antiga chegada por
            // proximidade da Raiz, que gravava isto, saiu do f9Tick).
            try { if (typeof window !== 'undefined') window.localStorage.setItem('tne_raiz_9', '1'); } catch { /* ignore */ }
        }
        if (e === 'raizDesabrocha') setBloomFlash((k) => k + 1);
    }), []);

    const chegada = f9.phase === 'chegada';
    const apagando = f9.phase === 'apagando';
    const uiOpen = chegada || apagando || completo || f9.phase === 'queda';
    useEffect(() => { onUiOpenChange(uiOpen); }, [uiOpen, onUiOpenChange]);
    useEffect(() => () => onUiOpenChange(false), [onUiOpenChange]);

    // SOFTLOCK FIX (P0): o fim do veil dependia SÓ do onAnimationEnd do CSS —
    // frágil (main thread engasgada no mobile atrasa/perde o evento e o jogo
    // ficava preso no 'apagando'). Fallback por timer: 3.4s do wipe + margem.
    // f9ReplantioDone é idempotente (checa a fase), então tanto faz quem chega
    // primeiro; o timer é cancelado se a fase sair por outro caminho.
    useEffect(() => {
        if (!apagando) return;
        const t = setTimeout(() => { f9ReplantioDone(); }, 3600);
        return () => clearTimeout(t);
    }, [apagando]);

    const emergency = f9.phase === 'explorar' && (f9eco.phase === 'aviso' || f9eco.phase === 'onda');
    const aviso = f9.phase === 'explorar' && f9eco.phase === 'aviso';
    const carrying = f9eco.offerings.some((o) => o.state === 'carregada');

    // V4: o objetivo principal são as OFERENDAS; a emergência da onda (que salva
    // a vida) tem prioridade sobre ele.
    let objective = f9Objective();
    if (f9.phase === 'explorar' && !emergency && !completo) {
        if (f9eco.rootState === 'desabrochada') objective = 'A passagem abriu. Entre na luz.';
        else if (carrying) objective = `Leve a Oferenda até a Raiz  ·  ${f9eco.rootWake}/3`;
        else objective = `Ache um fruto de luz  ·  ${f9eco.rootWake}/3 entregues`;
    }
    const target = useObjectiveTarget(playerPositionRef);
    // vinheta opressiva em CSS puro (zero GPU): aperta quando o ciclo fecha.
    const vigK = f9eco.phase === 'onda' ? 0.78 : aviso ? 0.66 : 0.52;

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            {/* a moldura úmida do Viveiro (atrás de todo o texto) */}
            <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse at center, transparent 40%, rgba(3,7,5,${vigK}) 100%)`,
            }} />

            {/* objetivo + seta/distância: PRA ONDE, QUÃO LONGE e POR QUÊ */}
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
                            fontSize: 15, letterSpacing: 3, marginTop: 4, fontWeight: 700,
                            color: emergency ? '#ffca7a'
                                : target.kind === 'oferenda' ? '#ffd97a'
                                : target.kind === 'passagem' ? '#ffca4a'
                                : '#e88a8a',
                        }}>
                            {OBJ_LABEL[target.kind]} · {target.dist} m
                        </div>
                    )}
                </div>
            )}

            {/* V4: os 3 PIPS de oferenda (canto superior esquerdo) */}
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

            {/* V4: o hint de carregar (pesado e barulhento) */}
            {carrying && f9.phase === 'explorar' && !completo && (
                <div style={{
                    ...mono, position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 18px)', left: 0, right: 0,
                    textAlign: 'center', fontSize: 12, letterSpacing: 1, color: '#ffd97a',
                    textShadow: '0 1px 3px #000', animation: 'f9pulse 1.6s ease-in-out infinite',
                }}>uma oferenda nos ombros — lento, barulhento. leve-a à Raiz.</div>
            )}

            {/* V4: o FLASH branco→dourado da desabrochada */}
            {bloomFlash > 0 && (
                <div key={bloomFlash} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'radial-gradient(circle at 50% 60%, #fff8e8 0%, #ffca4a 55%, rgba(255,202,74,0) 100%)',
                    animation: 'f9bloom 1.5s ease-out forwards',
                }} />
            )}

            {/* V4: o CARTÃO TEASER do fim de andar (Andar 10) — com a lore da Raiz */}
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

            {/* legendas da chegada (toque pra avançar) — ENSINAM as oferendas */}
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

            {/* o REPLANTIO: pego fora do oco — branco engole, e devolve */}
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
            `}</style>
        </div>
    );
};

export default Floor9Overlay;
