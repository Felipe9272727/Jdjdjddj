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
import {
    f8, f8Subscribe, f8Lines, f8AdvanceLine, f8EnterImage, f8DiveDone, f8Objective,
    f8AdvanceWake, f8ThrownDone, F8_DESPERTAR_LINES, F8_SUMIU_LINES, type F8Speaker,
} from './f8Arquivo';

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

export const Floor8Overlay: React.FC<{ onUiOpenChange: (open: boolean) => void; onLeave?: () => void }> = ({ onUiOpenChange, onLeave }) => {
    const [, setV] = useState(0);
    const [typed, setTyped] = useState(false);
    const fastRef = useRef(false);

    useEffect(() => f8Subscribe(() => setV((x) => x + 1)), []);

    const talking = f8.phase === 'interrogatorio';
    const handing = f8.phase === 'entregaImagem';
    const diving = f8.phase === 'mergulho';
    const inImage = f8.phase === 'corredor20' || f8.phase === 'porta21' || f8.phase === 'platformer' || f8.phase === 'memoriaRecuperada';
    // o despertar: zonzo; fala primeiro (congela), depois manca livre até o sul
    const waking = f8.phase === 'despertar';
    const wakeTalking = waking && f8.line < F8_DESPERTAR_LINES.length;
    const goneTalking = f8.phase === 'elevadorSumiu';
    const throwing = f8.phase === 'arremesso';
    // congela o Player 3D sempre que o overlay/imagem está no controle (menos
    // em entregaImagem, onde o player ainda pode caminhar até a mesa).
    const uiOpen = talking || diving || inImage || wakeTalking || goneTalking || throwing;
    useEffect(() => { onUiOpenChange(uiOpen); }, [uiOpen, onUiOpenChange]);
    useEffect(() => () => onUiOpenChange(false), [onUiOpenChange]);

    // qual roteiro está na tela? (interrogatório / despertar / sumiu)
    const wakeScript = wakeTalking ? F8_DESPERTAR_LINES : goneTalking ? F8_SUMIU_LINES : null;
    const lines = wakeScript ?? f8Lines();
    const cur = lines[Math.min(f8.line, lines.length - 1)];
    const isLast = f8.line >= lines.length - 1;
    const showDialogue = talking || wakeTalking || goneTalking;

    const advance = useCallback(() => {
        if (!typed) { fastRef.current = true; setV((x) => x + 1); return; }
        fastRef.current = false;
        setTyped(false);
        if (f8.phase === 'despertar' || f8.phase === 'elevadorSumiu') f8AdvanceWake();
        else f8AdvanceLine();
    }, [typed]);

    // teclado: E/Espaço/Enter avança a fala; E entra na imagem
    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            const ph = f8.phase;
            if (ph === 'interrogatorio' || ph === 'elevadorSumiu' || (ph === 'despertar' && f8.line < F8_DESPERTAR_LINES.length)) {
                if (k === 'e' || k === ' ' || k === 'enter') { e.preventDefault(); advance(); }
            } else if (ph === 'entregaImagem') { if (k === 'e' || k === 'enter') { e.preventDefault(); f8EnterImage(); } }
        };
        window.addEventListener('keydown', kd);
        return () => window.removeEventListener('keydown', kd);
    }, [advance]);

    const objective = f8Objective();

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}>
            {/* o despertar: zonzo — vinheta pulsando + visão dupla leve */}
            {(waking || goneTalking) && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 34%, rgba(10,6,4,0.62) 100%)', animation: 'f8dizzy 3.6s ease-in-out infinite' }} />
                    <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(1.2px)', animation: 'f8dizzyBlur 4.8s ease-in-out infinite' }} />
                </div>
            )}

            {/* linha-objetivo (fora do diálogo) */}
            {objective && !showDialogue && (
                <div style={{
                    ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 62px)', left: 0, right: 0,
                    textAlign: 'center', fontSize: 13, letterSpacing: 1, color: '#cfc7b0', textShadow: '0 1px 3px #000',
                }}>{objective}</div>
            )}

            {/* o interrogatório / o despertar / o elevador sumiu */}
            {showDialogue && cur && (
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

            {/* o ARREMESSO: a sala gira violenta e apaga */}
            {throwing && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', overflow: 'hidden' }}>
                    <div
                        onAnimationEnd={() => { f8ThrownDone(); onLeave?.(); }}
                        style={{ position: 'absolute', inset: 0, background: 'transparent', animation: 'f8throw 1.7s cubic-bezier(0.5,0,0.9,0.4) forwards' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: '#000', animation: 'f8throwFade 1.7s ease-in forwards' }} />
                </div>
            )}

            <style>{`
                @keyframes f8dive { 0%{opacity:0} 20%{opacity:1} 88%{opacity:1} 100%{opacity:1} }
                @keyframes f8diveZoom { 0%{transform:scale(0.15);opacity:0;filter:blur(6px)} 30%{opacity:0.9} 100%{transform:scale(2.6);opacity:1;filter:blur(0)} }
                @keyframes f8dizzy { 0%,100%{opacity:0.7} 50%{opacity:1} }
                @keyframes f8dizzyBlur { 0%,100%{opacity:0.3} 50%{opacity:0.9} }
                @keyframes f8throw {
                    0%{backdrop-filter:blur(0);transform:rotate(0) scale(1)}
                    35%{backdrop-filter:blur(2px);transform:rotate(9deg) scale(1.06)}
                    70%{backdrop-filter:blur(7px);transform:rotate(-16deg) scale(1.2)}
                    100%{backdrop-filter:blur(14px);transform:rotate(28deg) scale(1.45)}
                }
                @keyframes f8throwFade { 0%{opacity:0} 45%{opacity:0.12} 82%{opacity:0.85} 100%{opacity:1} }
            `}</style>
        </div>
    );
};

/** A VOLTA: acorda dentro do elevador, subindo. E tem algo diferente nele —
 *  um fio vermelho amarrado no corrimão, saindo por baixo da porta… e o painel
 *  marcando um andar que nunca esteve lá: o 9. Monta sempre (App), self-gate na
 *  fase 'leave'; morre sozinho quando o andar troca (f8Reset). */
export const Floor8Ride: React.FC = () => {
    const [, setV] = useState(0);
    useEffect(() => f8Subscribe(() => setV((x) => x + 1)), []);
    if (f8.phase !== 'leave') return null;
    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none' }}>
            {/* acorda: pisca preto → abre */}
            <div style={{ position: 'absolute', inset: 0, background: '#000', animation: 'f8wakeup 3.2s ease-out forwards' }} />
            {/* o fio vermelho: amarrado no canto, escorrendo pra baixo da tela */}
            <svg style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 180, opacity: 0.9 }} viewBox="0 0 960 180" preserveAspectRatio="none">
                <path d="M -10 60 C 140 40, 260 120, 430 96 S 760 150, 980 120" fill="none" stroke="#b3232a" strokeWidth="5" strokeLinecap="round" />
                <path d="M -10 66 C 140 48, 260 126, 430 102 S 760 156, 980 126" fill="none" stroke="#7a1218" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="430" cy="99" r="13" fill="#b3232a" />
                <circle cx="430" cy="99" r="7" fill="#8a161c" />
            </svg>
            {/* o painel que marca o 9 */}
            <div style={{
                ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 84px)', right: 26,
                padding: '10px 16px', background: 'rgba(8,7,5,0.82)', border: '1px solid #5a4f30', borderRadius: 8,
                textAlign: 'center', animation: 'f8nine 1.6s steps(2) infinite',
            }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: '#8a7a55' }}>SUBINDO</div>
                <div style={{ fontSize: 34, color: '#ffd98a', textShadow: '0 0 14px rgba(255,196,97,0.7)' }}>9</div>
            </div>
            <div style={{
                ...mono, position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 200px)',
                textAlign: 'center', fontSize: 13, fontStyle: 'italic', color: '#d8ccb0', textShadow: '0 2px 8px #000',
                animation: 'f8rideCap 9s ease-in-out forwards', padding: '0 30px',
            }}>
                Você acorda com o solavanco da subida. Há um fio vermelho amarrado no corrimão,
                escorrendo por baixo da porta. E o painel marca um andar que não existia ontem.
            </div>
            <style>{`
                @keyframes f8wakeup { 0%{opacity:1} 35%{opacity:1} 55%{opacity:0.25} 65%{opacity:0.7} 100%{opacity:0} }
                @keyframes f8nine { 0%{opacity:1} 50%{opacity:0.55} 100%{opacity:1} }
                @keyframes f8rideCap { 0%{opacity:0} 30%{opacity:0} 45%{opacity:1} 88%{opacity:1} 100%{opacity:0} }
            `}</style>
        </div>
    );
};

export default Floor8Overlay;
