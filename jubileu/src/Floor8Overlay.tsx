/**
 * Floor8Overlay.tsx — a camada DOM do Andar 8: o interrogatório.
 *
 * Quando o player chega perto da mesa (f8Tick → fase 'interrogatorio'), esta
 * caixa de diálogo assume a tela: as falas do Arquivista e as respostas do
 * player, uma a uma (typewriter; 1º toque revela, 2º avança). Ao fim, ele
 * estende a imagem sobre a mesa (fase 'entregaImagem' — o mergulho é o M3).
 *
 * Reporta "UI aberta" pro App congelar o Player, mesmo contrato dos overlays
 * do Floor 6.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { f8, f8Subscribe, f8Lines, f8AdvanceLine, f8EnterImage, f8DiveDone, f8Objective, type F8Speaker } from './f8Arquivo';

const mono: React.CSSProperties = { fontFamily: 'monospace', color: '#e8e2d2', userSelect: 'none' };

const SPEAKER: Record<F8Speaker, { name: string; color: string }> = {
    arq: { name: 'O ARQUIVISTA', color: '#d9b96a' },
    voce: { name: 'VOCÊ', color: '#8fb4c9' },
};

/** typewriter simples; fastRef revela tudo de uma vez. */
const Typer: React.FC<{ text: string; onDone: () => void; fastRef: React.MutableRefObject<boolean> }> =
    ({ text, onDone, fastRef }) => {
        const [n, setN] = useState(0);
        useEffect(() => { setN(0); }, [text]);
        useEffect(() => {
            if (n >= text.length) { onDone(); return; }
            const id = setTimeout(() => setN((v) => Math.min(text.length, v + (fastRef.current ? text.length : 1))), fastRef.current ? 0 : 34);
            return () => clearTimeout(id);
        }, [n, text, onDone, fastRef]);
        return <>{text.slice(0, n)}</>;
    };

export const Floor8Overlay: React.FC<{ onUiOpenChange: (open: boolean) => void }> = ({ onUiOpenChange }) => {
    const [, setV] = useState(0);
    const [typed, setTyped] = useState(false);
    const fastRef = useRef(false);

    useEffect(() => f8Subscribe(() => setV((x) => x + 1)), []);

    const talking = f8.phase === 'interrogatorio';
    const handing = f8.phase === 'entregaImagem';
    const diving = f8.phase === 'mergulho';
    const inImage = f8.phase === 'corredor20' || f8.phase === 'porta21' || f8.phase === 'platformer';
    // congela o Player 3D sempre que o overlay/imagem está no controle (menos
    // em entregaImagem, onde o player ainda pode caminhar até a mesa).
    const uiOpen = talking || diving || inImage;
    useEffect(() => { onUiOpenChange(uiOpen); }, [uiOpen, onUiOpenChange]);
    useEffect(() => () => onUiOpenChange(false), [onUiOpenChange]);

    const lines = f8Lines();
    const cur = lines[Math.min(f8.line, lines.length - 1)];
    const isLast = f8.line >= lines.length - 1;

    const advance = useCallback(() => {
        if (!typed) { fastRef.current = true; setV((x) => x + 1); return; }
        fastRef.current = false;
        setTyped(false);
        f8AdvanceLine();
    }, [typed]);

    // teclado: E/Espaço/Enter avança a fala; E entra na imagem
    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (f8.phase === 'interrogatorio') { if (k === 'e' || k === ' ' || k === 'enter') { e.preventDefault(); advance(); } }
            else if (f8.phase === 'entregaImagem') { if (k === 'e' || k === 'enter') { e.preventDefault(); f8EnterImage(); } }
        };
        window.addEventListener('keydown', kd);
        return () => window.removeEventListener('keydown', kd);
    }, [advance]);

    const objective = f8Objective();

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            {/* linha-objetivo (fora do diálogo) */}
            {objective && !talking && (
                <div style={{
                    ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 62px)', left: 0, right: 0,
                    textAlign: 'center', fontSize: 13, letterSpacing: 1, color: '#cfc7b0', textShadow: '0 1px 3px #000',
                }}>{objective}</div>
            )}

            {/* o interrogatório */}
            {talking && cur && (
                <div onPointerDown={advance} style={{
                    position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)',
                }}>
                    <div style={{
                        margin: '0 14px calc(env(safe-area-inset-bottom) + 20px)', maxWidth: 660, alignSelf: 'center',
                        width: 'calc(100% - 28px)', background: 'rgba(9,8,7,0.93)',
                        border: `1px solid ${cur.who === 'arq' ? '#5a4f30' : '#33454f'}`,
                        borderRadius: 10, padding: '14px 18px 12px', boxShadow: '0 10px 40px rgba(0,0,0,0.9)',
                    }}>
                        <div style={{ ...mono, fontSize: 12, letterSpacing: 3, color: SPEAKER[cur.who].color, marginBottom: 8 }}>
                            {SPEAKER[cur.who].name}
                        </div>
                        <div style={{ ...mono, fontSize: 16, lineHeight: 1.6, minHeight: 58 }}>
                            <Typer text={cur.t} onDone={() => setTyped(true)} fastRef={fastRef} />
                        </div>
                        {typed && (
                            <div style={{ ...mono, fontSize: 11, color: '#7a715c', marginTop: 8, textAlign: 'right' }}>
                                {isLast ? 'toque…' : 'toque ▸'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* entregaImagem: o prompt de entrar na imagem */}
            {handing && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 110px)', textAlign: 'center' }}>
                    <button onPointerDown={() => f8EnterImage()} style={{
                        pointerEvents: 'auto', ...mono, fontSize: 16, padding: '12px 26px',
                        background: 'rgba(122,74,18,0.72)', border: '1px solid #f0d89a', borderRadius: 12, color: '#fff4dc', cursor: 'pointer',
                        boxShadow: '0 0 26px rgba(255,184,97,0.45)',
                    }}><span style={{ color: '#ffd98a' }}>[E]</span> Entrar na imagem</button>
                </div>
            )}

            {/* mergulho: a imagem engole a tela (dip quente + zoom) */}
            {diving && (
                <div onAnimationEnd={() => f8DiveDone()} style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', background: '#000', animation: 'f8dive 2.4s ease-in forwards' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 48%, #ffcf8a 0%, #a86a24 30%, #1a0f06 70%)', animation: 'f8diveZoom 2.4s ease-in forwards' }} />
                </div>
            )}

            <style>{`
                @keyframes f8dive { 0%{opacity:0} 20%{opacity:1} 88%{opacity:1} 100%{opacity:1} }
                @keyframes f8diveZoom { 0%{transform:scale(0.15);opacity:0;filter:blur(6px)} 30%{opacity:0.9} 100%{transform:scale(2.6);opacity:1;filter:blur(0)} }
            `}</style>
        </div>
    );
};

export default Floor8Overlay;
