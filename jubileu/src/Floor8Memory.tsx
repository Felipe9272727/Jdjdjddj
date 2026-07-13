/**
 * Floor8Memory.tsx — a memória da Porta 21.
 *
 * Um platformer 2.5D leve, desenhado em Canvas 2D para continuar suave em
 * celulares. Tudo é procedural: tecido, pontos, lã, partículas e cenário.
 * A física fica neste módulo; a progressão/lore continua em f8Arquivo.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    f8, f8CollectMemory, f8MemoryFall, f8Objective, f8Subscribe,
    f8WinMemory, F8_MEMORY_WORDS,
} from './f8Arquivo';
import { f8FallCue, f8FragmentCue, f8WinCue } from './floor8Sfx';

type Platform = { x: number; y: number; w: number; h: number; hue: string };
const PLATFORMS: Platform[] = [
    { x: -2, y: 0.6, w: 12, h: 0.9, hue: '#5d3040' },
    { x: 11.5, y: 1.25, w: 5.2, h: 0.72, hue: '#614039' },
    { x: 19.0, y: 2.35, w: 4.4, h: 0.68, hue: '#334b59' },
    { x: 25.3, y: 1.05, w: 6.4, h: 0.78, hue: '#5a3346' },
    { x: 34.0, y: 2.75, w: 4.6, h: 0.72, hue: '#493a64' },
    { x: 41.0, y: 1.35, w: 7.4, h: 0.82, hue: '#354c57' },
    { x: 51.0, y: 2.65, w: 4.6, h: 0.72, hue: '#673b3f' },
    { x: 57.8, y: 0.8, w: 8.3, h: 0.88, hue: '#54405f' },
    { x: 68.6, y: 2.05, w: 5.4, h: 0.76, hue: '#365166' },
    { x: 76.6, y: 3.25, w: 4.3, h: 0.7, hue: '#6b4243' },
    { x: 83.2, y: 1.0, w: 12.4, h: 0.9, hue: '#443e59' },
];
const SHARDS = [
    { x: 21.2, y: 4.1, word: F8_MEMORY_WORDS[0] },
    { x: 44.4, y: 3.35, word: F8_MEMORY_WORDS[1] },
    { x: 70.9, y: 4.05, word: F8_MEMORY_WORDS[2] },
] as const;
const CHECKPOINTS = [{ x: 2, y: 2.2 }, { x: 26.5, y: 2.7 }, { x: 59.4, y: 2.6 }, { x: 84.5, y: 2.8 }];
const GOAL_X = 92;

type PlayerState = {
    x: number; y: number; vx: number; vy: number; grounded: boolean;
    checkpoint: number; dead: boolean; facing: number; run: number;
};

const fabricNoise = Array.from({ length: 170 }, (_, i) => ({
    x: ((i * 73) % 997) / 997,
    y: ((i * 211) % 991) / 991,
    a: 0.08 + ((i * 19) % 31) / 220,
}));

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

/** Canvas renderer kept independent from React re-renders. */
function drawMemory(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
    p: PlayerState,
    cameraX: number,
    time: number,
) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.max(34, Math.min(width / 17.5, height / 10.5));
    const sx = (x: number) => (x - cameraX) * scale + width * 0.34;
    const sy = (y: number) => height - y * scale - Math.max(58, height * 0.105);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#080815'); sky.addColorStop(0.48, '#171323'); sky.addColorStop(1, '#2b1726');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);

    // trama gigante no fundo — barata, mas vende a ideia de estar dentro de tecido.
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = '#b59bb4'; ctx.lineWidth = 1;
    for (let y = -2; y < height; y += 7) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y + 2); ctx.stroke(); }
    ctx.strokeStyle = '#7d5d78';
    for (let x = -2; x < width; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2, height); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // Silhuetas de um hotel desmontando em camadas de bordado.
    for (let layer = 0; layer < 3; layer++) {
        const drift = cameraX * (0.06 + layer * 0.045);
        const baseY = height * (0.58 + layer * 0.075);
        ctx.globalAlpha = 0.13 + layer * 0.055;
        ctx.fillStyle = ['#52506b', '#393750', '#28243b'][layer];
        for (let i = -1; i < 7; i++) {
            const bx = i * 245 - (drift * scale) % 245;
            const bh = 90 + ((i * 47 + layer * 31) % 120 + 120) % 120;
            ctx.fillRect(bx, baseY - bh, 178, bh);
            ctx.fillStyle = '#b28a72';
            for (let wy = baseY - bh + 22; wy < baseY - 15; wy += 30) for (let wx = bx + 18; wx < bx + 160; wx += 34) ctx.fillRect(wx, wy, 12, 9);
            ctx.fillStyle = ['#52506b', '#393750', '#28243b'][layer];
        }
    }
    ctx.globalAlpha = 1;

    // Linha vermelha contínua: guia visual, lore e leitura do caminho.
    ctx.save();
    ctx.strokeStyle = '#d9465f'; ctx.lineWidth = 3.2; ctx.shadowColor = '#ff4f6f'; ctx.shadowBlur = 12;
    ctx.setLineDash([7, 9]); ctx.lineDashOffset = -time * 25;
    ctx.beginPath();
    ctx.moveTo(sx(-1), sy(1.75));
    for (const q of PLATFORMS) ctx.lineTo(sx(q.x + q.w * 0.52), sy(q.y + q.h + 0.22));
    ctx.lineTo(sx(GOAL_X), sy(2.2)); ctx.stroke();
    ctx.restore();

    // Plataformas: peças de tecido com costura e fios pendurados.
    for (let pi = 0; pi < PLATFORMS.length; pi++) {
        const q = PLATFORMS[pi];
        const x = sx(q.x), y = sy(q.y + q.h), w = q.w * scale, h = q.h * scale;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 8;
        rr(ctx, x, y, w, h, Math.min(14, h * 0.25)); ctx.fillStyle = q.hue; ctx.fill();
        ctx.shadowColor = 'transparent';
        const cloth = ctx.createLinearGradient(0, y, 0, y + h);
        cloth.addColorStop(0, 'rgba(255,255,255,.15)'); cloth.addColorStop(0.2, 'rgba(255,255,255,.02)'); cloth.addColorStop(1, 'rgba(0,0,0,.28)');
        rr(ctx, x, y, w, h, Math.min(14, h * 0.25)); ctx.fillStyle = cloth; ctx.fill();
        ctx.strokeStyle = '#d7b1ad'; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]);
        rr(ctx, x + 5, y + 5, w - 10, Math.max(1, h - 10), Math.min(10, h * 0.2)); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 0.19; ctx.strokeStyle = '#fff';
        for (let yy = y + 9; yy < y + h; yy += 6) { ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.lineTo(x + w - 8, yy + 1); ctx.stroke(); }
        ctx.globalAlpha = 0.75; ctx.strokeStyle = q.hue; ctx.lineWidth = 2;
        for (let f = 0; f < Math.min(9, Math.floor(q.w)); f++) {
            const fx = x + 12 + (f * 37) % Math.max(20, w - 24);
            const len = 8 + ((f * 13 + pi * 7) % 18);
            ctx.beginPath(); ctx.moveTo(fx, y + h - 2); ctx.quadraticCurveTo(fx + 5, y + h + len * 0.5, fx - 2, y + h + len); ctx.stroke();
        }
        ctx.restore();
    }

    // Fragmentos-palavra bordados.
    SHARDS.forEach((s, i) => {
        if ((f8.memoryMask & (1 << i)) !== 0) return;
        const x = sx(s.x), y = sy(s.y + Math.sin(time * 2.2 + i) * 0.12);
        const pulse = 1 + Math.sin(time * 3 + i) * 0.05;
        ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
        ctx.shadowColor = '#ffd2bc'; ctx.shadowBlur = 26;
        rr(ctx, -44, -24, 88, 48, 13); ctx.fillStyle = '#efe0ca'; ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = '#c34a61'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); rr(ctx, -38, -18, 76, 36, 9); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = '#68283c'; ctx.font = '700 15px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.word, 0, 1);
        ctx.restore();
    });

    // Tear / ficha em branco no fim.
    const gx = sx(GOAL_X), gy = sy(1.9);
    if (gx > -200 && gx < width + 200) {
        ctx.save(); ctx.translate(gx, gy);
        ctx.shadowColor = '#f9d7ad'; ctx.shadowBlur = f8.memoryMask === 7 ? 34 : 10;
        ctx.strokeStyle = '#9b744f'; ctx.lineWidth = 8;
        ctx.strokeRect(-52, -128, 104, 152);
        ctx.fillStyle = '#271b27'; ctx.fillRect(-45, -120, 90, 136);
        for (let i = -38; i <= 38; i += 9) { ctx.strokeStyle = i % 18 ? '#d0ad91' : '#c3465b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(i, -114); ctx.lineTo(i, 8); ctx.stroke(); }
        rr(ctx, -62, -67, 124, 52, 10); ctx.fillStyle = '#eadcc8'; ctx.fill();
        ctx.fillStyle = '#532738'; ctx.font = '700 13px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(f8.memoryMask === 7 ? 'EU AINDA EXISTO' : 'FICHA EM BRANCO', 0, -40);
        ctx.restore();
    }

    // Personagem de pano, com cachecol/fio vermelho reagindo ao movimento.
    const px = sx(p.x), py = sy(p.y);
    ctx.save(); ctx.translate(px, py); ctx.scale(p.facing, 1);
    const bob = p.grounded && Math.abs(p.vx) > 0.3 ? Math.abs(Math.sin(p.run)) * 2.5 : 0;
    ctx.translate(0, -bob);
    ctx.strokeStyle = '#d9465f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-7, -31); ctx.bezierCurveTo(-20, -34, -27 - Math.sin(time * 4) * 5, -22, -38, -28); ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 10;
    rr(ctx, -10, -28, 20, 30, 7); ctx.fillStyle = '#d2c2ad'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -37, 10.5, 0, Math.PI * 2); ctx.fillStyle = '#e2d2bd'; ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#332735'; ctx.fillRect(-5, -39, 3, 3); ctx.fillRect(3, -39, 3, 3);
    ctx.strokeStyle = '#8c7781'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); rr(ctx, -7, -25, 14, 22, 5); ctx.stroke(); ctx.setLineDash([]);
    const leg = Math.sin(p.run) * Math.min(5, Math.abs(p.vx));
    ctx.strokeStyle = '#b7a58f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-6 + leg, 12); ctx.moveTo(5, 0); ctx.lineTo(6 - leg, 12); ctx.stroke();
    ctx.restore();

    // Poeira/fibras na lente.
    for (const n of fabricNoise) {
        const fx = (n.x * width + time * (4 + n.a * 15)) % width;
        const fy = (n.y * height + Math.sin(time + n.x * 20) * 6) % height;
        ctx.fillStyle = `rgba(246,218,203,${n.a})`; ctx.fillRect(fx, fy, 1.2, 1.2);
    }
    const vignette = ctx.createRadialGradient(width / 2, height * 0.44, Math.min(width, height) * 0.18, width / 2, height * 0.48, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.78)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
}

export const Floor8Memory: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const player = useRef<PlayerState>({ x: 2, y: 2.2, vx: 0, vy: 0, grounded: false, checkpoint: 0, dead: false, facing: 1, run: 0 });
    const input = useRef({ left: false, right: false, jump: false, jumpLatch: false });
    const camera = useRef(0);
    const [version, setVersion] = useState(0);
    const [flash, setFlash] = useState('');

    useEffect(() => f8Subscribe(() => setVersion((v) => v + 1)), []);

    useEffect(() => {
        if (f8.phase !== 'platformer') return;
        const kd = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (['a', 'arrowleft'].includes(k)) input.current.left = true;
            if (['d', 'arrowright'].includes(k)) input.current.right = true;
            if (['w', 'arrowup', ' '].includes(k)) { input.current.jump = true; e.preventDefault(); }
        };
        const ku = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (['a', 'arrowleft'].includes(k)) input.current.left = false;
            if (['d', 'arrowright'].includes(k)) input.current.right = false;
            if (['w', 'arrowup', ' '].includes(k)) input.current.jump = false;
        };
        window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
        return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    }, [version]);

    useEffect(() => {
        if (f8.phase !== 'platformer') return;
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        let raf = 0, last = performance.now(), deadTimer = 0;
        const resize = () => {
            const dpr = Math.min(1.65, window.devicePixelRatio || 1);
            const r = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
        };
        resize(); window.addEventListener('resize', resize);

        const respawn = () => {
            const q = CHECKPOINTS[player.current.checkpoint];
            Object.assign(player.current, { x: q.x, y: q.y, vx: 0, vy: 0, grounded: false, dead: false });
            setFlash('');
        };
        const fail = () => {
            if (player.current.dead) return;
            player.current.dead = true; deadTimer = 0.62; f8MemoryFall(); f8FallCue(); setFlash('O fio não rompe. Tente outra vez.');
        };

        const frame = (now: number) => {
            const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000)); last = now;
            const p = player.current;
            if (p.dead) {
                deadTimer -= dt;
                if (deadTimer <= 0) respawn();
            } else {
                const dir = Number(input.current.right) - Number(input.current.left);
                const target = dir * 6.6;
                p.vx += (target - p.vx) * Math.min(1, dt * (dir ? 11 : 16));
                if (dir) p.facing = dir;
                if (input.current.jump && !input.current.jumpLatch && p.grounded) { p.vy = 10.3; p.grounded = false; }
                input.current.jumpLatch = input.current.jump;
                const oldY = p.y; p.vy -= 25 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.grounded = false;
                const halfW = 0.24, halfH = 0.62;
                if (p.vy <= 0) for (const q of PLATFORMS) {
                    const top = q.y + q.h;
                    const oldBottom = oldY - halfH, bottom = p.y - halfH;
                    if (p.x + halfW > q.x && p.x - halfW < q.x + q.w && oldBottom >= top - 0.08 && bottom <= top) {
                        p.y = top + halfH; p.vy = 0; p.grounded = true; break;
                    }
                }
                p.x = Math.max(-1, Math.min(95, p.x));
                if (Math.abs(p.vx) > 0.25 && p.grounded) p.run += dt * 9;
                if (p.y < -3.5) fail();

                SHARDS.forEach((s, i) => {
                    if ((f8.memoryMask & (1 << i)) === 0 && Math.hypot(p.x - s.x, p.y - s.y) < 1.05) {
                        if (f8CollectMemory(i)) { f8FragmentCue(i); setFlash(s.word); window.setTimeout(() => setFlash(''), 900); }
                    }
                });
                if (p.x > 27 && p.checkpoint < 1) p.checkpoint = 1;
                if (p.x > 60 && p.checkpoint < 2) p.checkpoint = 2;
                if (p.x > 85 && p.checkpoint < 3) p.checkpoint = 3;
                if (p.x > GOAL_X - 0.7) {
                    if (!f8WinMemory()) { p.vx = -2.5; setFlash('Faltam palavras na sua ficha.'); window.setTimeout(() => setFlash(''), 1100); }
                    else f8WinCue();
                }
            }
            camera.current += (p.x - camera.current) * Math.min(1, dt * 4.2);
            const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
            const dpr = canvas.width / Math.max(1, cssW);
            drawMemory(ctx, cssW, cssH, dpr, p, camera.current, now / 1000);
            if (f8.phase === 'platformer') raf = requestAnimationFrame(frame);
        };
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__f8memory = { player, win: () => { f8.memoryMask = 7; player.current.x = GOAL_X; } };
        raf = requestAnimationFrame(frame);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    }, [version]);

    if (f8.phase !== 'platformer') return null;
    const held = (key: 'left' | 'right' | 'jump', value: boolean) => { input.current[key] = value; };
    const objective = f8Objective();

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 62, background: '#080815', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(env(safe-area-inset-top) + 18px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, pointerEvents: 'none' }}>
                <div style={{ color: '#e9d8c7', font: '600 clamp(10px,2.5vw,13px) ui-monospace,monospace', letterSpacing: 1.3, textShadow: '0 2px 10px #000', textAlign: 'center', padding: '0 20px' }}>{objective}</div>
                <div style={{ display: 'flex', gap: 7 }}>
                    {F8_MEMORY_WORDS.map((word, i) => <span key={word} style={{ padding: '5px 9px', borderRadius: 7, font: '700 11px ui-monospace,monospace', letterSpacing: 1, border: `1px solid ${(f8.memoryMask & (1 << i)) ? '#e66679' : '#574553'}`, background: (f8.memoryMask & (1 << i)) ? 'rgba(118,33,55,.8)' : 'rgba(8,8,15,.65)', color: (f8.memoryMask & (1 << i)) ? '#ffe4d6' : '#6f6370' }}>{word}</span>)}
                </div>
            </div>

            {flash && <div key={flash + f8.version} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', color: '#ffe8d5', font: '800 clamp(18px,5vw,42px) ui-monospace,monospace', letterSpacing: 4, textShadow: '0 0 22px #d9465f,0 3px 10px #000', animation: 'f8mem-pop .75s ease-out both' }}>{flash}</div>}

            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 20px)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 clamp(18px,5vw,42px)', pointerEvents: 'none' }}>
                <div style={{ display: 'flex', gap: 12 }}>
                    {([['left', '◀'], ['right', '▶']] as const).map(([k, label]) => <button key={k} aria-label={k} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held(k, true); }} onPointerUp={() => held(k, false)} onPointerCancel={() => held(k, false)} style={{ pointerEvents: 'auto', width: 'clamp(62px,17vw,78px)', height: 'clamp(62px,17vw,78px)', borderRadius: 24, border: '1px solid rgba(235,205,192,.45)', background: 'linear-gradient(145deg,rgba(68,45,63,.88),rgba(17,14,25,.9))', color: '#f4dfd0', fontSize: 24, boxShadow: '0 10px 28px rgba(0,0,0,.38)', touchAction: 'none' }}>{label}</button>)}
                </div>
                <button aria-label="pular" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held('jump', true); }} onPointerUp={() => held('jump', false)} onPointerCancel={() => held('jump', false)} style={{ pointerEvents: 'auto', width: 'clamp(70px,19vw,88px)', height: 'clamp(70px,19vw,88px)', borderRadius: 999, border: '1px solid rgba(255,211,195,.62)', background: 'linear-gradient(145deg,#953b55,#3c2036)', color: '#fff0e4', font: '800 12px ui-monospace,monospace', letterSpacing: 1.5, boxShadow: '0 0 30px rgba(213,63,91,.26)', touchAction: 'none' }}>PULAR</button>
            </div>
            <div style={{ position: 'absolute', top: '18%', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', color: '#e7c9c4', font: '700 clamp(22px,5vw,48px) Georgia,serif', letterSpacing: 5, textShadow: '0 4px 18px #000', animation: 'f8mem-title 3.4s ease both' }}>A MEMÓRIA TECIDA</div>
            <style>{`
                @keyframes f8mem-title{0%{opacity:0;transform:translateY(16px)}18%{opacity:.9;transform:none}70%{opacity:.9}100%{opacity:0}}
                @keyframes f8mem-pop{0%{opacity:0;transform:scale(.7)}25%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1)}}
            `}</style>
        </div>
    );
};

export default Floor8Memory;
