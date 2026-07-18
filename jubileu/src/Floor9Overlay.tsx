/**
 * Floor9Overlay.tsx — a camada DOM do Viveiro: legendas da chegada, a linha-
 * objetivo, o aviso da onda, o VEIL do replantio (pego fora do oco) e o beat
 * da RAIZ. Mesmo contrato de uiOpen dos outros andares.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    f9, f9Subscribe, f9Objective, f9ChegadaDone, f9LembrancaDone,
    f9ReplantioDone, f9RelicCount, F9_CHEGADA_LINES, F9_RAIZ_LINES, F9_RELICS,
} from './f9Floresta';
import { f9eco, f9EcoSubscribe } from './f9Eco';

const mono: React.CSSProperties = { fontFamily: 'monospace', color: '#dfe8d2', userSelect: 'none' };

interface Floor9OverlayProps {
    onUiOpenChange: (open: boolean) => void;
    onReplant?: (point: readonly [number, number]) => void;
}

export const Floor9Overlay: React.FC<Floor9OverlayProps> = ({ onUiOpenChange, onReplant }) => {
    const [, setV] = useState(0);
    const [line, setLine] = useState(0);
    const [memoryLine, setMemoryLine] = useState(0);
    const [raizLine, setRaizLine] = useState(0);
    const prevPhase = useRef(f9.phase);

    useEffect(() => f9Subscribe(() => setV((x) => x + 1)), []);
    useEffect(() => f9EcoSubscribe(() => setV((x) => x + 1)), []);
    useEffect(() => f9Subscribe(() => {
        if (f9.phase !== prevPhase.current) {
            if (f9.phase === 'chegada') setLine(0);
            if (f9.phase === 'lembranca') setMemoryLine(0);
            if (f9.phase === 'raiz') setRaizLine(0);
            prevPhase.current = f9.phase;
        }
    }), []);

    const chegada = f9.phase === 'chegada';
    const lembranca = f9.phase === 'lembranca';
    const apagando = f9.phase === 'apagando';
    const raiz = f9.phase === 'raiz' && raizLine < F9_RAIZ_LINES.length;
    const uiOpen = chegada || lembranca || apagando || raiz || f9.phase === 'queda';
    useEffect(() => { onUiOpenChange(uiOpen); }, [uiOpen, onUiOpenChange]);
    useEffect(() => () => onUiOpenChange(false), [onUiOpenChange]);

    const objective = f9Objective();
    const aviso = f9.phase === 'explorar' && f9eco.phase === 'aviso';
    const relicCount = f9RelicCount();
    const relic = f9.lembranca >= 0 ? F9_RELICS[f9.lembranca] : null;

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            {/* objetivo */}
            {objective && !chegada && (
                <div style={{
                    ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 62px)', left: 0, right: 0,
                    textAlign: 'center', fontSize: 13, letterSpacing: 1,
                    color: aviso || f9eco.phase === 'onda' ? '#ffe9c9' : '#cfdcc0',
                    textShadow: '0 1px 3px #000',
                    animation: aviso ? 'f9pulse 1.1s ease-in-out infinite' : undefined,
                }}>{objective}</div>
            )}

            {f9.phase === 'explorar' && (
                <div style={{
                    ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 92px)', left: 18,
                    padding: '7px 10px', border: '1px solid rgba(197,43,52,.38)', borderRadius: 6,
                    background: 'rgba(8,16,10,.58)', color: '#bdc9ae', fontSize: 11,
                    letterSpacing: 1.6, textShadow: '0 1px 3px #000',
                }}>
                    RELÍQUIAS&nbsp; {F9_RELICS.map((_, i) => i < relicCount ? '●' : '○').join(' ')}
                </div>
            )}

            {/* legendas da chegada (toque pra avançar) */}
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
                        <div style={{ fontSize: 11, color: '#8a967c', marginTop: 10 }}>toque ▸</div>
                    </div>
                </div>
            )}

            {/* cada objeto devolve uma lembrança antes de liberar o player */}
            {lembranca && relic && (
                <div onPointerDown={() => {
                    if (memoryLine < relic.lines.length - 1) setMemoryLine((l) => l + 1);
                    else f9LembrancaDone();
                }} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    background: 'radial-gradient(circle at 50% 62%, rgba(129,32,38,.16), rgba(2,7,4,.78) 78%)',
                }}>
                    <div style={{
                        ...mono, width: 'min(650px, calc(100vw - 32px))',
                        margin: '0 16px calc(env(safe-area-inset-bottom) + 34px)',
                        background: 'rgba(7,10,7,.94)', border: '1px solid #733039', borderRadius: 10,
                        boxShadow: '0 0 42px rgba(160,28,39,.2)', padding: '16px 19px',
                        fontSize: 15, lineHeight: 1.65,
                    }}>
                        <div style={{ fontSize: 10, letterSpacing: 2.8, color: '#b98472', marginBottom: 5 }}>{relic.kicker}</div>
                        <div style={{ fontSize: 17, letterSpacing: 1.4, color: '#e6d1a8', marginBottom: 11 }}>{relic.title}</div>
                        {relic.lines[memoryLine]}
                        <div style={{ fontSize: 11, color: '#746c5e', marginTop: 10, textAlign: 'right' }}>toque ▸</div>
                    </div>
                </div>
            )}

            {/* o REPLANTIO: pego fora do oco — branco engole, e devolve */}
            {apagando && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
                    <div onAnimationEnd={() => {
                        const point = f9ReplantioDone();
                        if (point) onReplant?.(point);
                    }} style={{ position: 'absolute', inset: 0, background: '#eef4e8', animation: 'f9wipe 3.4s ease-in-out forwards' }} />
                    <div style={{
                        ...mono, position: 'absolute', left: 0, right: 0, top: '46%', textAlign: 'center',
                        fontSize: 15, color: '#41503c', letterSpacing: 2, animation: 'f9wipeTxt 3.4s ease-in-out forwards', opacity: 0,
                    }}>
                        {f9.replantCause === 'vulto'
                            ? 'o vulto te alcançou. a mata te devolve dentro de um oco.'
                            : 'a onda te encontrou. algo te replanta dentro de um oco.'}
                    </div>
                </div>
            )}

            {/* a RAIZ */}
            {raiz && (
                <div onPointerDown={() => setRaizLine((l) => l + 1)} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(20,14,4,0.6) 100%)',
                }}>
                    <div style={{
                        ...mono, maxWidth: 640, margin: '0 16px calc(env(safe-area-inset-bottom) + 30px)',
                        background: 'rgba(10,9,6,0.92)', border: '1px solid #5a4f30', borderRadius: 10,
                        padding: '14px 18px', fontSize: 15.5, lineHeight: 1.6,
                    }}>
                        <div style={{ fontSize: 11, letterSpacing: 3, color: '#d9b96a', marginBottom: 8 }}>A RAIZ</div>
                        {F9_RAIZ_LINES[raizLine]}
                        <div style={{ fontSize: 11, color: '#7a715c', marginTop: 8, textAlign: 'right' }}>toque ▸</div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes f9pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
                @keyframes f9wipe { 0%{opacity:0} 22%{opacity:1} 74%{opacity:1} 100%{opacity:0} }
                @keyframes f9wipeTxt { 0%{opacity:0} 30%{opacity:0} 45%{opacity:1} 70%{opacity:1} 85%{opacity:0} 100%{opacity:0} }
            `}</style>
        </div>
    );
};

export default Floor9Overlay;
