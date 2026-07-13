/**
 * Floor8Overlay.tsx — interface e cutscenes DOM do interrogatório.
 * A sala continua visível por baixo; esta camada dirige ritmo, texto e transições.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    f8, f8AdvanceLine, f8AdvanceRecovery, f8BoardElevator, f8DiveDone,
    f8EnterImage, f8Lines, f8Objective, f8Subscribe, F8_RECOVERY_LINES,
    type F8Speaker,
} from './f8Arquivo';
import { f8BoardCue, f8DiveCue, f8Page, f8RecoveryCue } from './floor8Sfx';

const mono: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', userSelect: 'none' };
const SPEAKER: Record<F8Speaker, { name: string; color: string; tag: string }> = {
    arq: { name: 'O ARQUIVISTA', color: '#e4c17b', tag: 'REGISTRO 08' },
    voce: { name: 'VOCÊ', color: '#9bc9df', tag: 'FICHA SEM NOME' },
};

const Typer: React.FC<{ text: string; onDone: () => void; fastRef: React.MutableRefObject<boolean> }> = ({ text, onDone, fastRef }) => {
    const [n, setN] = useState(0);
    useEffect(() => { setN(0); }, [text]);
    useEffect(() => {
        if (n >= text.length) { onDone(); return; }
        const id = window.setTimeout(() => setN((v) => Math.min(text.length, v + (fastRef.current ? text.length : 1))), fastRef.current ? 0 : 24);
        return () => window.clearTimeout(id);
    }, [n, text, onDone, fastRef]);
    return <>{text.slice(0, n)}</>;
};

const PhotoCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
    <div style={{ width: compact ? 164 : 'min(76vw,390px)', aspectRatio: '1.42', padding: compact ? 7 : 12, background: '#d8c7a6', boxShadow: '0 18px 60px rgba(0,0,0,.7),0 0 0 1px rgba(255,231,183,.55)', transform: 'rotate(-2deg)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: compact ? 12 : 20, overflow: 'hidden', background: 'linear-gradient(#251d19,#080708)' }}>
            <div style={{ position: 'absolute', inset: '18% 5% 13%', borderTop: '2px solid #826847', borderBottom: '7px solid #33251c', display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 3, alignItems: 'end' }}>
                {Array.from({ length: 20 }, (_, i) => <span key={i} style={{ height: `${38 + (i % 3) * 9}%`, border: '1px solid #806842', background: '#251b16', boxShadow: 'inset 0 0 8px #000' }} />)}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle,transparent 25%,rgba(0,0,0,.72) 100%)' }} />
        </div>
        <div style={{ ...mono, position: 'absolute', left: 0, right: 0, bottom: 3, textAlign: 'center', color: '#57462f', fontSize: compact ? 7 : 10, letterSpacing: 2 }}>FOTOGRAFIA · ORIGEM DESCONHECIDA</div>
    </div>
);

export const Floor8Overlay: React.FC<{
    onUiOpenChange: (open: boolean) => void;
    onLeave?: () => void;
}> = ({ onUiOpenChange, onLeave }) => {
    const [, setV] = useState(0);
    const [typed, setTyped] = useState(false);
    const [boarding, setBoarding] = useState(false);
    const fastRef = useRef(false);
    const leaveTimer = useRef(0);
    useEffect(() => f8Subscribe(() => setV((x) => x + 1)), []);
    useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

    const talking = f8.phase === 'interrogatorio';
    const handing = f8.phase === 'entregaImagem';
    const diving = f8.phase === 'mergulho';
    const recovery = f8.phase === 'memoriaRecuperada';
    const leaving = f8.phase === 'leave';
    const inImage = ['corredor20', 'porta21', 'platformer'].includes(f8.phase);
    const uiOpen = talking || handing || diving || inImage || recovery || leaving;
    useEffect(() => { onUiOpenChange(uiOpen); }, [uiOpen, onUiOpenChange]);
    useEffect(() => () => onUiOpenChange(false), [onUiOpenChange]);

    const lines = f8Lines();
    const cur = lines[Math.min(f8.line, lines.length - 1)];
    const advanceDialogue = useCallback(() => {
        if (!typed) { fastRef.current = true; setV((x) => x + 1); return; }
        fastRef.current = false; setTyped(false); f8Page(); f8AdvanceLine();
    }, [typed]);
    const advanceRecovery = useCallback(() => { f8RecoveryCue(f8.recoveryLine + 1); f8AdvanceRecovery(); }, []);
    const enterImage = useCallback(() => { f8DiveCue(); f8EnterImage(); }, []);
    const board = useCallback(() => {
        if (!f8BoardElevator()) return;
        f8BoardCue(); setBoarding(true);
        leaveTimer.current = window.setTimeout(() => onLeave?.(), 1050);
    }, [onLeave]);

    useEffect(() => {
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (talking && ['e', ' ', 'enter'].includes(k)) { e.preventDefault(); advanceDialogue(); }
            else if (handing && ['e', 'enter'].includes(k)) { e.preventDefault(); enterImage(); }
            else if (recovery && ['e', ' ', 'enter'].includes(k)) { e.preventDefault(); advanceRecovery(); }
            else if (leaving && ['e', 'enter'].includes(k)) { e.preventDefault(); board(); }
        };
        window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
    }, [talking, handing, recovery, leaving, advanceDialogue, advanceRecovery, enterImage, board]);

    const objective = f8Objective();
    const recoveryLine = F8_RECOVERY_LINES[Math.min(f8.recoveryLine, F8_RECOVERY_LINES.length - 1)];

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 58, pointerEvents: 'none' }}>
            {objective && !talking && !inImage && !recovery && !leaving && <div style={{ ...mono, position: 'absolute', top: 'calc(env(safe-area-inset-top) + 54px)', left: 18, right: 18, textAlign: 'center', fontSize: 12, letterSpacing: 1.5, color: '#ddd2ba', textShadow: '0 2px 8px #000' }}>{objective}</div>}

            {talking && cur && <div onPointerDown={advanceDialogue} style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'linear-gradient(to bottom,rgba(0,0,0,.1) 0%,transparent 40%,rgba(0,0,0,.82) 100%)' }}>
                <div className="f8-letterbox f8-top" />
                <div className="f8-letterbox f8-bottom" />
                <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 28px)', left: 0, right: 0, textAlign: 'center', ...mono, color: '#9b8864', fontSize: 10, letterSpacing: 4 }}>{SPEAKER[cur.who].tag}</div>
                <div style={{ margin: '0 auto calc(env(safe-area-inset-bottom) + clamp(18px,4vh,44px))', width: 'min(92vw,820px)', display: 'grid', gridTemplateColumns: '4px 1fr', background: 'linear-gradient(100deg,rgba(10,9,10,.97),rgba(17,14,13,.94))', border: `1px solid ${cur.who === 'arq' ? '#625335' : '#355464'}`, borderRadius: 4, boxShadow: '0 18px 70px rgba(0,0,0,.75)', overflow: 'hidden' }}>
                    <div style={{ background: SPEAKER[cur.who].color, boxShadow: `0 0 18px ${SPEAKER[cur.who].color}` }} />
                    <div style={{ padding: 'clamp(13px,2.3vw,23px) clamp(15px,3vw,30px)' }}>
                        <div style={{ ...mono, fontSize: 11, letterSpacing: 3.5, color: SPEAKER[cur.who].color, marginBottom: 9, display: 'flex', justifyContent: 'space-between' }}><span>{SPEAKER[cur.who].name}</span><span style={{ color: '#605b54', letterSpacing: 1 }}>0{f8.line + 1}/0{lines.length}</span></div>
                        <div style={{ ...mono, color: '#f0e8d9', fontSize: 'clamp(14px,2.3vw,18px)', lineHeight: 1.55, minHeight: 'clamp(64px,10vh,92px)' }}><Typer text={cur.t} onDone={() => setTyped(true)} fastRef={fastRef} /></div>
                        <div style={{ ...mono, height: 14, color: '#857963', fontSize: 10, textAlign: 'right', opacity: typed ? 1 : 0 }}>{f8.line === lines.length - 1 ? 'ENTRAR NO REGISTRO  ↵' : 'CONTINUAR  ▸'}</div>
                    </div>
                </div>
            </div>}

            {handing && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 50% 48%,rgba(95,63,29,.12),rgba(0,0,0,.68))' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, animation: 'f8-photo-in .75s cubic-bezier(.2,.8,.2,1) both' }}>
                    <PhotoCard />
                    <button onPointerDown={enterImage} style={{ ...mono, padding: '13px 25px', borderRadius: 4, border: '1px solid #e8c781', color: '#fff0ce', background: 'rgba(83,49,18,.86)', letterSpacing: 1.5, fontSize: 13, boxShadow: '0 0 34px rgba(229,174,82,.25)', cursor: 'pointer' }}>TOCAR A FOTOGRAFIA <span style={{ color: '#f6cf77' }}>[E]</span></button>
                </div>
            </div>}

            {diving && <div onAnimationEnd={() => f8DiveDone()} style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', overflow: 'hidden', background: '#050404', animation: 'f8-dive-bg 2.8s ease-in forwards' }}>
                <div style={{ position: 'absolute', left: '50%', top: '50%', animation: 'f8-dive-photo 2.8s cubic-bezier(.55,.02,.9,.45) forwards' }}><PhotoCard compact /></div>
                <div style={{ position: 'absolute', inset: '-20%', background: 'repeating-radial-gradient(circle at 50% 50%,transparent 0 12px,rgba(214,177,111,.14) 13px 15px)', animation: 'f8-dive-lines 2.8s ease-in forwards' }} />
                <div style={{ ...mono, position: 'absolute', left: 0, right: 0, bottom: '18%', textAlign: 'center', color: '#d8c6a1', letterSpacing: 5, fontSize: 11, animation: 'f8-dive-copy 2.5s ease both' }}>ENTRANDO NO QUE FOI APAGADO</div>
            </div>}

            {recovery && <div onPointerDown={advanceRecovery} style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'pointer', display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'radial-gradient(circle at 50% 45%,#342033 0%,#100b16 48%,#030305 100%)' }}>
                <div className="f8-thread-ring" />
                <div key={f8.recoveryLine} style={{ position: 'relative', width: 'min(86vw,760px)', textAlign: 'center', animation: 'f8-recover-line .8s ease both' }}>
                    <div style={{ ...mono, color: '#bc7584', fontSize: 10, letterSpacing: 5, marginBottom: 24 }}>MEMÓRIA RECUPERADA · 0{f8.recoveryLine + 1}</div>
                    <div style={{ fontFamily: f8.recoveryLine === 2 ? 'Georgia,serif' : 'ui-monospace,monospace', fontWeight: f8.recoveryLine === 2 ? 800 : 500, color: '#f7e7dc', fontSize: f8.recoveryLine === 2 ? 'clamp(34px,9vw,78px)' : 'clamp(18px,4vw,34px)', lineHeight: 1.35, letterSpacing: f8.recoveryLine === 2 ? 7 : 1, textShadow: '0 0 30px rgba(211,74,98,.5)' }}>{recoveryLine}</div>
                    <div style={{ ...mono, color: '#77646f', fontSize: 10, letterSpacing: 2, marginTop: 34 }}>TOQUE PARA CONTINUAR</div>
                </div>
            </div>}

            {leaving && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: boarding ? '#000' : 'linear-gradient(to bottom,rgba(0,0,0,.05),rgba(0,0,0,.86))', transition: 'background 1s ease' }}>
                {!boarding && <div style={{ width: 'min(92vw,680px)', margin: '0 auto calc(env(safe-area-inset-bottom) + 26px)', padding: 'clamp(18px,4vw,30px)', boxSizing: 'border-box', border: '1px solid #685438', borderRadius: 5, background: 'rgba(10,9,9,.96)', boxShadow: '0 18px 80px #000' }}>
                    <div style={{ ...mono, color: '#e2bd74', fontSize: 11, letterSpacing: 3, marginBottom: 14 }}>O ARQUIVISTA · REGISTRO FINAL</div>
                    <div style={{ ...mono, color: '#eee4d5', fontSize: 'clamp(15px,3vw,19px)', lineHeight: 1.55 }}>“Pronto. Sua ficha deixou de estar em branco. O hotel pode apagar papel — não o que você costurou por dentro.”</div>
                    <div style={{ marginTop: 18, padding: '13px 15px', borderLeft: '3px solid #c94e66', background: '#171217', ...mono, color: '#e8d6c8', fontSize: 12, letterSpacing: 1.5 }}>STATUS: <strong style={{ color: '#ef788e' }}>LEMBRADO</strong></div>
                    <button onPointerDown={board} style={{ ...mono, width: '100%', marginTop: 18, padding: '14px 18px', border: '1px solid #d6b473', borderRadius: 3, background: 'linear-gradient(#6e4b23,#3f2b17)', color: '#fff0d5', letterSpacing: 2, cursor: 'pointer' }}>VOLTAR AO ELEVADOR [E]</button>
                </div>}
                {boarding && <div style={{ ...mono, position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#8e7d67', letterSpacing: 5, fontSize: 11, animation: 'f8-board 1s ease both' }}>ARQUIVANDO ANDAR 08</div>}
            </div>}

            <style>{`
                .f8-letterbox{position:absolute;left:0;right:0;height:5.2vh;background:#030303;pointer-events:none}.f8-top{top:0}.f8-bottom{bottom:0}
                @keyframes f8-photo-in{from{opacity:0;transform:translateY(28px) scale(.88) rotate(2deg)}to{opacity:1;transform:none}}
                @keyframes f8-dive-bg{0%{opacity:0}16%{opacity:1}100%{opacity:1}}
                @keyframes f8-dive-photo{0%{transform:translate(-50%,-50%) scale(.8) rotate(-2deg);filter:blur(0)}62%{transform:translate(-50%,-50%) scale(3.8) rotate(1deg);filter:blur(1px)}100%{transform:translate(-50%,-50%) scale(18);filter:blur(6px);opacity:0}}
                @keyframes f8-dive-lines{from{transform:scale(.3) rotate(0);opacity:0}35%{opacity:.8}to{transform:scale(4) rotate(8deg);opacity:0}}
                @keyframes f8-dive-copy{0%,18%{opacity:0;transform:translateY(8px)}30%,70%{opacity:1;transform:none}100%{opacity:0}}
                .f8-thread-ring{position:absolute;width:min(78vw,610px);aspect-ratio:1;border:2px dashed rgba(210,72,98,.42);border-radius:50%;box-shadow:0 0 80px rgba(191,54,81,.22),inset 0 0 80px rgba(191,54,81,.14);animation:f8-ring 12s linear infinite}
                @keyframes f8-ring{to{transform:rotate(360deg)}}
                @keyframes f8-recover-line{from{opacity:0;transform:translateY(18px) scale(.97);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
                @keyframes f8-board{from{opacity:0;letter-spacing:9px}to{opacity:1;letter-spacing:5px}}
                @media(max-width:520px){.f8-letterbox{height:3.2vh}}
            `}</style>
        </div>
    );
};

export default Floor8Overlay;
