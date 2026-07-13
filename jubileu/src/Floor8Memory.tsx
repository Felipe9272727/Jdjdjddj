/**
 * A memória da Porta 21 — uma jornada 2.5D de crochê em quatro atos.
 * O canvas mantém o custo baixo no mobile; a progressão continua em f8Arquivo.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    F8_MEMORY_WORDS, F8_STITCH_COUNT, f8, f8CollectMemory, f8MemoryFall,
    f8Objective, f8SetMemoryChapter, f8Stitch, f8Subscribe, f8WinMemory,
} from './f8Arquivo';
import {
    MEMORY_CHAPTERS, MEMORY_CHECKPOINTS, MEMORY_FRAGMENTS, MEMORY_GOAL_X,
    MEMORY_PLATFORMS, STITCH_ANCHORS, STITCH_PATTERNS, type MemoryFragment,
    type StitchToken, chapterForX, platformVisible, platformY,
} from './floor8MemoryData';
import { renderFloor8Memory, type MemoryRenderPlayer } from './floor8MemoryRender';
import { f8FallCue, f8FragmentCue, f8StitchCue, f8WinCue } from './floor8Sfx';

type PlayerState = MemoryRenderPlayer & { checkpoint: number; dead: boolean };
type InputState = { left: boolean; right: boolean; jump: boolean; jumpLatch: boolean };
type PuzzleState = { anchor: number; step: number; error: string };

const TOKEN_COPY: Record<StitchToken, { key: string; label: string; mark: string }> = {
    under: { key: 'A', label: 'ENTRAR POR BAIXO', mark: '⌒' },
    loop: { key: 'E', label: 'FAZER A LAÇADA', mark: '∞' },
    pull: { key: 'D', label: 'PUXAR O FIO', mark: '↗' },
};

const mono: React.CSSProperties = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' };

function countBits(mask: number): number {
    let n = 0; for (let i = 0; i < 8; i++) n += Number(Boolean(mask & (1 << i))); return n;
}

export const Floor8Memory: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const player = useRef<PlayerState>({
        x: 2, y: 2.2, vx: 0, vy: 0, grounded: false, checkpoint: 0,
        dead: false, facing: 1, run: 0, stitchAnim: 0,
    });
    const input = useRef<InputState>({ left: false, right: false, jump: false, jumpLatch: false });
    const camera = useRef(0);
    const puzzleRef = useRef<PuzzleState | null>(null);
    const cardRef = useRef<MemoryFragment | null>(null);
    const nearRef = useRef<number | null>(null);
    const [revision, setRevision] = useState(0);
    const [flash, setFlash] = useState('');
    const [nearAnchor, setNearAnchor] = useState<number | null>(null);
    const [puzzle, setPuzzleState] = useState<PuzzleState | null>(null);
    const [memoryCard, setMemoryCardState] = useState<MemoryFragment | null>(null);
    const [chapterCard, setChapterCard] = useState(0);
    const [showChapter, setShowChapter] = useState(true);
    const active = f8.phase === 'platformer';

    const setPuzzle = useCallback((next: PuzzleState | null) => {
        puzzleRef.current = next; setPuzzleState(next);
    }, []);
    const setMemoryCard = useCallback((next: MemoryFragment | null) => {
        cardRef.current = next; setMemoryCardState(next);
    }, []);
    const showFlash = useCallback((copy: string, ms = 950) => {
        setFlash(copy); window.setTimeout(() => setFlash((current) => current === copy ? '' : current), ms);
    }, []);

    useEffect(() => f8Subscribe(() => setRevision((v) => v + 1)), []);

    const openPuzzle = useCallback((index: number) => {
        if (!active || index < 0 || index >= STITCH_ANCHORS.length || (f8.stitchMask & (1 << index))) return;
        input.current.left = false; input.current.right = false; input.current.jump = false;
        setPuzzle({ anchor: index, step: 0, error: '' });
    }, [active, setPuzzle]);

    const playToken = useCallback((token: StitchToken) => {
        const current = puzzleRef.current; if (!current) return;
        const pattern = STITCH_PATTERNS[current.anchor];
        if (pattern.sequence[current.step] !== token) {
            setPuzzle({ ...current, step: 0, error: 'A tensão escapou. Recomece o ponto.' });
            showFlash('FIO SOLTO', 520); return;
        }
        const nextStep = current.step + 1;
        if (nextStep < pattern.sequence.length) {
            setPuzzle({ ...current, step: nextStep, error: '' }); return;
        }
        if (f8Stitch(current.anchor)) {
            player.current.stitchAnim = 1;
            f8StitchCue(current.anchor);
            showFlash(`PONTO ${current.anchor + 1} PRESO`, 1050);
        }
        setPuzzle(null);
    }, [setPuzzle, showFlash]);

    useEffect(() => {
        if (!active) return;
        const keyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (puzzleRef.current) {
                const token = key === 'a' ? 'under' : key === 'd' ? 'pull' : (key === 'e' || key === ' ') ? 'loop' : null;
                if (token) { e.preventDefault(); playToken(token); }
                if (key === 'escape') setPuzzle(null);
                return;
            }
            if (cardRef.current) { if (['e', ' ', 'enter', 'escape'].includes(key)) { e.preventDefault(); setMemoryCard(null); } return; }
            if (['a', 'arrowleft'].includes(key)) input.current.left = true;
            if (['d', 'arrowright'].includes(key)) input.current.right = true;
            if (['w', 'arrowup', ' '].includes(key)) { input.current.jump = true; e.preventDefault(); }
            if (['e', 'f', 'enter'].includes(key) && nearRef.current !== null) { e.preventDefault(); openPuzzle(nearRef.current); }
        };
        const keyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (['a', 'arrowleft'].includes(key)) input.current.left = false;
            if (['d', 'arrowright'].includes(key)) input.current.right = false;
            if (['w', 'arrowup', ' '].includes(key)) input.current.jump = false;
        };
        window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
        return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); };
    }, [active, openPuzzle, playToken, setMemoryCard, setPuzzle]);

    useEffect(() => {
        if (!active) return;
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        let raf = 0, last = performance.now(), deadTimer = 0;

        const resize = () => {
            const dpr = Math.min(1.7, window.devicePixelRatio || 1), rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
        };
        const respawn = () => {
            const cp = MEMORY_CHECKPOINTS[player.current.checkpoint];
            Object.assign(player.current, { x: cp.x, y: cp.y, vx: 0, vy: 0, grounded: false, dead: false });
        };
        const fall = () => {
            if (player.current.dead) return;
            player.current.dead = true; deadTimer = .7; f8MemoryFall(); f8FallCue(); showFlash('O FIO SEGURA VOCÊ', 720);
        };
        const setNearby = (index: number | null) => {
            if (nearRef.current === index) return;
            nearRef.current = index; setNearAnchor(index);
        };
        resize(); window.addEventListener('resize', resize);

        const frame = (now: number) => {
            const dt = Math.min(.033, Math.max(.001, (now - last) / 1000)); last = now;
            const p = player.current, t = now / 1000;
            p.stitchAnim = Math.max(0, p.stitchAnim - dt * 2.25);
            const frozen = Boolean(puzzleRef.current || cardRef.current);
            if (p.dead) {
                deadTimer -= dt; if (deadTimer <= 0) respawn();
            } else if (!frozen) {
                const dir = Number(input.current.right) - Number(input.current.left);
                const target = dir * 7.05;
                p.vx += (target - p.vx) * Math.min(1, dt * (dir ? 12 : 17));
                if (dir) p.facing = dir;
                if (input.current.jump && !input.current.jumpLatch && p.grounded) { p.vy = 10.9; p.grounded = false; }
                input.current.jumpLatch = input.current.jump;
                const oldY = p.y; p.vy -= 25.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.grounded = false;
                const halfW = .25, halfH = .64;
                if (p.vy <= 0) {
                    for (const q of MEMORY_PLATFORMS) {
                        if (!platformVisible(q, f8.stitchMask)) continue;
                        const y = platformY(q, t), top = y + q.h;
                        const oldBottom = oldY - halfH, bottom = p.y - halfH;
                        if (p.x + halfW > q.x && p.x - halfW < q.x + q.w && oldBottom >= top - .1 && bottom <= top + .04) {
                            p.y = top + halfH; p.vy = 0; p.grounded = true;
                            if (q.motion) p.y += Math.cos(t * q.motion.speed + q.motion.phase) * q.motion.amp * q.motion.speed * dt;
                            break;
                        }
                    }
                }
                p.x = Math.max(-1, Math.min(MEMORY_GOAL_X + 1.2, p.x));
                if (p.grounded && Math.abs(p.vx) > .25) p.run += dt * 9.5;
                if (p.y < -4) fall();

                const chapter = chapterForX(p.x);
                if (chapter !== f8.memoryChapter) {
                    f8SetMemoryChapter(chapter); setChapterCard(chapter); setShowChapter(true);
                    window.setTimeout(() => setShowChapter(false), 3600);
                }
                for (let i = MEMORY_CHECKPOINTS.length - 1; i >= 0; i--) {
                    if (p.x >= MEMORY_CHECKPOINTS[i].x && p.checkpoint < i) { p.checkpoint = i; break; }
                }
                MEMORY_FRAGMENTS.forEach((fragment, i) => {
                    if ((f8.memoryMask & (1 << i)) || Math.hypot(p.x - fragment.x, p.y - fragment.y) >= 1.05) return;
                    if (f8CollectMemory(i)) { f8FragmentCue(i); setMemoryCard(fragment); showFlash(fragment.word, 850); }
                });
                if (p.x >= MEMORY_GOAL_X - .55) {
                    if (f8WinMemory()) f8WinCue();
                    else { p.x = MEMORY_GOAL_X - 1.4; p.vx = -3; showFlash('A FICHA AINDA ESTÁ INCOMPLETA', 1250); }
                }
            } else { p.vx *= Math.max(0, 1 - dt * 18); input.current.jumpLatch = input.current.jump; }

            let nearest: number | null = null, best = 1.65;
            STITCH_ANCHORS.forEach((anchor, i) => {
                if (f8.stitchMask & (1 << i)) return;
                const d = Math.hypot(p.x - anchor.x, p.y - anchor.y); if (d < best) { best = d; nearest = i; }
            });
            setNearby(nearest);
            camera.current += (p.x - camera.current) * Math.min(1, dt * 4.4);
            renderFloor8Memory(ctx, canvas.clientWidth, canvas.clientHeight, canvas.width / Math.max(1, canvas.clientWidth), p, camera.current, t);
            if (f8.phase === 'platformer') raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    }, [active, setMemoryCard, showFlash]);

    useEffect(() => {
        if (!import.meta.env.DEV || !active) return;
        const debug = {
            player, camera, canvas: canvasRef, puzzle: puzzleRef,
            openPuzzle,
            pose: (x: number, y: number) => { Object.assign(player.current, { x, y, vx: 0, vy: 0 }); camera.current = x; },
            hideChapter: () => setShowChapter(false),
            stitch: (i: number) => f8Stitch(i),
            collect: (i: number) => f8CollectMemory(i),
            closeCard: () => setMemoryCard(null),
            win: () => { for (let i = 0; i < F8_STITCH_COUNT; i++) f8Stitch(i); for (let i = 0; i < 3; i++) f8CollectMemory(i); return f8WinMemory(); },
        };
        (window as unknown as Record<string, unknown>).__f8memory = debug;
        return () => { delete (window as unknown as Record<string, unknown>).__f8memory; };
    }, [active, openPuzzle, setMemoryCard]);

    useEffect(() => {
        if (!active) return;
        const id = window.setTimeout(() => setShowChapter(false), 3600); return () => window.clearTimeout(id);
    }, [active]);

    if (!active) return null;
    void revision;
    const chapter = MEMORY_CHAPTERS[chapterCard] ?? MEMORY_CHAPTERS[0];
    const currentPuzzle = puzzle ? STITCH_PATTERNS[puzzle.anchor] : null;
    const nearby = nearAnchor === null ? null : STITCH_ANCHORS[nearAnchor];
    const held = (key: 'left' | 'right' | 'jump', value: boolean) => { input.current[key] = value; };
    const mobileButton: React.CSSProperties = {
        pointerEvents: 'auto', border: '1px solid rgba(255,225,213,.5)', color: '#fff0e5', touchAction: 'none',
        background: 'linear-gradient(145deg,rgba(100,48,75,.94),rgba(20,13,27,.94))', boxShadow: '0 12px 30px rgba(0,0,0,.42)',
    };

    return (
        <div data-testid="f8-memory" style={{ position: 'fixed', inset: 0, zIndex: 62, overflow: 'hidden', touchAction: 'none', userSelect: 'none', background: MEMORY_CHAPTERS[f8.memoryChapter].sky[0] }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', background: `linear-gradient(${MEMORY_CHAPTERS[f8.memoryChapter].sky[0]},${MEMORY_CHAPTERS[f8.memoryChapter].sky[1]} 52%,${MEMORY_CHAPTERS[f8.memoryChapter].sky[2]})` }} />

            <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 15px)', left: 16, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
                <div style={{ ...mono, color: '#f2e3dc', fontSize: 'clamp(9px,2.4vw,12px)', letterSpacing: 1.1, textAlign: 'center', textShadow: '0 2px 9px #000' }}>{f8Objective()}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {F8_MEMORY_WORDS.map((word, i) => <span key={word} style={{ ...mono, padding: '5px 8px', borderRadius: 7, fontSize: 10, fontWeight: 800, letterSpacing: 1, border: `1px solid ${(f8.memoryMask & (1 << i)) ? '#f46b83' : '#705764'}`, background: (f8.memoryMask & (1 << i)) ? 'rgba(126,34,58,.86)' : 'rgba(12,8,16,.7)', color: (f8.memoryMask & (1 << i)) ? '#ffe8df' : '#806d78' }}>{word}</span>)}
                    <span style={{ ...mono, marginLeft: 4, padding: '5px 8px', borderRadius: 7, fontSize: 10, color: '#f5cec8', border: '1px solid #7b435b', background: 'rgba(28,12,25,.76)' }}>PONTOS {countBits(f8.stitchMask)}/8</span>
                </div>
            </div>

            {showChapter && <div key={chapter.title} className="f8-memory-chapter" style={{ position: 'absolute', left: '7vw', right: '7vw', top: '23%', pointerEvents: 'none', textAlign: 'center' }}>
                <div style={{ font: '800 clamp(19px,5vw,48px) Georgia,serif', letterSpacing: 'clamp(2px,.8vw,7px)', color: '#fff0e7', textShadow: '0 4px 25px #000' }}>{chapter.title}</div>
                <div style={{ ...mono, marginTop: 12, fontSize: 'clamp(10px,2.4vw,14px)', letterSpacing: 1.5, color: '#f0d4cf', textShadow: '0 2px 10px #000' }}>{chapter.subtitle}</div>
            </div>}

            {flash && <div key={flash + f8.version} className="f8-memory-flash" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#ffe9df', font: '900 clamp(17px,5vw,43px) ui-monospace,monospace', letterSpacing: 4, textAlign: 'center', padding: 24, textShadow: '0 0 24px #df3d61,0 4px 12px #000' }}>{flash}</div>}

            {nearby && !puzzle && !memoryCard && <button aria-label="costurar" onClick={() => openPuzzle(nearAnchor as number)} className="f8-stitch-callout" style={{ ...mono, position: 'absolute', left: '50%', bottom: 'calc(env(safe-area-inset-bottom) + 122px)', transform: 'translateX(-50%)', pointerEvents: 'auto', border: '1px solid #f38a9d', borderRadius: 7, padding: '11px 16px', color: '#fff0e7', background: 'rgba(59,20,43,.92)', boxShadow: '0 0 24px rgba(238,65,98,.34)', fontSize: 11, fontWeight: 800, letterSpacing: 1.4 }}><span style={{ color: '#ff8da0' }}>COSTURAR</span> · {nearby.title} [E]</button>}

            {memoryCard && <div onPointerDown={() => setMemoryCard(null)} style={{ position: 'absolute', inset: 0, zIndex: 17, pointerEvents: 'auto', display: 'grid', placeItems: 'center', padding: 22, background: 'radial-gradient(circle at 50% 45%,rgba(103,45,65,.52),rgba(5,3,8,.94))' }}>
                <article className="f8-memory-card" style={{ width: 'min(88vw,620px)', padding: 'clamp(22px,5vw,42px)', boxSizing: 'border-box', border: '1px solid #d88a95', borderRadius: 8, background: 'linear-gradient(145deg,#ead7c5,#c9a9a3)', color: '#3c1f2d', boxShadow: '0 28px 100px #000,0 0 60px rgba(220,70,98,.25)', transform: 'rotate(-.7deg)' }}>
                    <div style={{ ...mono, color: '#a13952', fontSize: 10, fontWeight: 800, letterSpacing: 3 }}>{memoryCard.title}</div>
                    <h2 style={{ margin: '18px 0 10px', font: '800 clamp(23px,5vw,40px) Georgia,serif' }}>{memoryCard.subtitle}</h2>
                    <p style={{ margin: 0, font: '500 clamp(14px,2.8vw,18px)/1.65 Georgia,serif' }}>{memoryCard.body}</p>
                    <div style={{ ...mono, marginTop: 24, paddingTop: 13, borderTop: '1px dashed #a27678', textAlign: 'right', fontSize: 10, letterSpacing: 2 }}>TOQUE PARA COSTURAR A LEMBRANÇA</div>
                </article>
            </div>}

            {puzzle && currentPuzzle && <div className="f8-stitch-puzzle" style={{ position: 'absolute', inset: 0, zIndex: 18, pointerEvents: 'auto', display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(5,3,8,.94)' }}>
                <section className="f8-stitch-diagram" style={{ width: 'min(92vw,680px)', maxHeight: '88vh', overflow: 'auto', boxSizing: 'border-box', padding: 'clamp(18px,4vw,34px)', border: '1px solid #c66d82', borderRadius: 9, background: 'linear-gradient(160deg,#251423,#120b16)', boxShadow: '0 28px 100px #000,0 0 45px rgba(220,57,91,.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, ...mono, color: '#b96c7f', fontSize: 10, letterSpacing: 2 }}><span>DIAGRAMA {puzzle.anchor + 1}/8</span><button onClick={() => setPuzzle(null)} aria-label="fechar" style={{ border: 0, background: 'transparent', color: '#a4828d', cursor: 'pointer' }}>ESC ×</button></div>
                    <h2 style={{ margin: '12px 0 4px', color: '#ffe7dd', font: '800 clamp(25px,6vw,46px) Georgia,serif', letterSpacing: 2 }}>{currentPuzzle.name}</h2>
                    <p style={{ ...mono, margin: '0 0 23px', color: '#bb9fac', fontSize: 12, lineHeight: 1.55 }}>{currentPuzzle.note}</p>
                    <div aria-label="sequência do ponto" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
                        {currentPuzzle.sequence.map((token, i) => <React.Fragment key={`${token}-${i}`}><span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 999, border: `2px solid ${i < puzzle.step ? '#ff7089' : i === puzzle.step ? '#f5d8c7' : '#563848'}`, background: i < puzzle.step ? '#8f2847' : '#170e18', color: i <= puzzle.step ? '#ffe9df' : '#735666', fontSize: 20, boxShadow: i === puzzle.step ? '0 0 20px rgba(255,214,199,.25)' : 'none' }}>{TOKEN_COPY[token].mark}</span>{i < currentPuzzle.sequence.length - 1 && <span style={{ color: '#604252' }}>—</span>}</React.Fragment>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 9 }}>
                        {(Object.keys(TOKEN_COPY) as StitchToken[]).map((token) => <button key={token} onClick={() => playToken(token)} style={{ minHeight: 72, border: '1px solid #754458', borderRadius: 7, background: 'linear-gradient(#5b2942,#2b1526)', color: '#ffe5da', cursor: 'pointer', padding: '9px 5px' }}><strong style={{ display: 'block', fontSize: 19, marginBottom: 5 }}>{TOKEN_COPY[token].key}</strong><span style={{ ...mono, fontSize: 'clamp(7px,2vw,10px)', letterSpacing: .5 }}>{TOKEN_COPY[token].label}</span></button>)}
                    </div>
                    <div style={{ ...mono, minHeight: 18, marginTop: 14, color: puzzle.error ? '#ff738a' : '#92747f', fontSize: 10, letterSpacing: 1.2, textAlign: 'center' }}>{puzzle.error || STITCH_ANCHORS[puzzle.anchor].instruction}</div>
                </section>
            </div>}

            {!puzzle && !memoryCard && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 17px)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 clamp(15px,4vw,40px)', pointerEvents: 'none' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                    {([['left', '◀'], ['right', '▶']] as const).map(([key, label]) => <button key={key} aria-label={key} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held(key, true); }} onPointerUp={() => held(key, false)} onPointerCancel={() => held(key, false)} style={{ ...mobileButton, width: 'clamp(58px,16vw,76px)', height: 'clamp(58px,16vw,76px)', borderRadius: 22, fontSize: 23 }}>{label}</button>)}
                </div>
                <button aria-label="pular" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held('jump', true); }} onPointerUp={() => held('jump', false)} onPointerCancel={() => held('jump', false)} style={{ ...mobileButton, width: 'clamp(68px,18vw,86px)', height: 'clamp(68px,18vw,86px)', borderRadius: 999, font: '800 11px ui-monospace,monospace', letterSpacing: 1.3 }}>PULAR</button>
            </div>}

            <style>{`
                @keyframes f8-chapter{0%{opacity:0;transform:translateY(18px) scale(.98)}15%,72%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-10px)}}
                @keyframes f8-flash{0%{opacity:0;transform:scale(.76)}23%{opacity:1;transform:scale(1.04)}100%{opacity:0;transform:scale(1)}}
                @keyframes f8-diagram{from{opacity:0;transform:translateY(25px) scale(.96)}to{opacity:1;transform:none}}
                @keyframes f8-card{from{opacity:0;transform:translateY(28px) rotate(-2deg) scale(.95)}to{opacity:1;transform:rotate(-.7deg)}}
                @keyframes f8-callout{50%{box-shadow:0 0 35px rgba(238,65,98,.58)}}
                .f8-memory-chapter{animation:f8-chapter 3.5s ease both}.f8-memory-flash{animation:f8-flash .85s ease-out both}.f8-stitch-diagram{animation:f8-diagram .28s ease-out both}.f8-memory-card{animation:f8-card .45s ease-out both}.f8-stitch-callout{animation:f8-callout 1.3s ease-in-out infinite}
                @media(max-width:520px){.f8-stitch-diagram{max-height:82vh!important}.f8-memory-chapter{top:19%!important}}
            `}</style>
        </div>
    );
};

export default Floor8Memory;
