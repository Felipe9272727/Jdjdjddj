import { f8 } from './f8Arquivo';
import {
    MEMORY_CHAPTERS, MEMORY_FRAGMENTS, MEMORY_GOAL_X, MEMORY_PLATFORMS,
    STITCH_ANCHORS, chapterForX, platformVisible, platformY,
} from './floor8MemoryData';

export type MemoryRenderPlayer = {
    x: number; y: number; vx: number; vy: number; grounded: boolean;
    facing: number; run: number; stitchAnim: number;
};

const fibres = Array.from({ length: 140 }, (_, i) => ({
    x: ((i * 73) % 997) / 997,
    y: ((i * 211) % 991) / 991,
    a: .025 + ((i * 19) % 31) / 720,
}));

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w * .5, h * .5)));
}

function yarnStroke(
    ctx: CanvasRenderingContext2D,
    points: ReadonlyArray<readonly [number, number]>,
    color: string,
    width: number,
    glow = 0,
): void {
    if (points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.shadowColor = color; ctx.shadowBlur = glow;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1], cur = points[i];
        const mx = (prev[0] + cur[0]) * .5;
        ctx.quadraticCurveTo(prev[0], prev[1], mx, (prev[1] + cur[1]) * .5);
    }
    const last = points[points.length - 1]; ctx.lineTo(last[0], last[1]); ctx.stroke();
    ctx.globalAlpha = .45; ctx.strokeStyle = '#ffe3df'; ctx.lineWidth = Math.max(.65, width * .18);
    ctx.translate(-width * .13, -width * .18); ctx.stroke();
    ctx.restore();
}

function knitPatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, stitch: string): void {
    ctx.save();
    rounded(ctx, x, y, w, h, Math.min(14, h * .22));
    ctx.fillStyle = base; ctx.fill(); ctx.clip();
    const shade = ctx.createLinearGradient(0, y, 0, y + h);
    shade.addColorStop(0, 'rgba(255,255,255,.18)'); shade.addColorStop(.28, 'rgba(255,255,255,.02)'); shade.addColorStop(1, 'rgba(0,0,0,.34)');
    ctx.fillStyle = shade; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = stitch; ctx.lineWidth = 1.15; ctx.globalAlpha = .32;
    for (let yy = y + 4; yy < y + h + 8; yy += 7) {
        for (let xx = x - 3; xx < x + w + 8; xx += 10) {
            ctx.beginPath();
            ctx.moveTo(xx, yy - 4); ctx.bezierCurveTo(xx + 2, yy, xx + 4, yy + 3, xx + 5, yy + 5);
            ctx.bezierCurveTo(xx + 6, yy + 3, xx + 8, yy, xx + 10, yy - 4); ctx.stroke();
        }
    }
    ctx.restore();
}

function drawHome(ctx: CanvasRenderingContext2D, width: number, height: number, drift: number, dark = false): void {
    const x = width * .5 - drift, floor = height * .72;
    ctx.save();
    ctx.globalAlpha = dark ? .38 : .82;
    ctx.fillStyle = dark ? '#1c1220' : '#6a3b4b';
    ctx.beginPath(); ctx.moveTo(x - 265, floor - 210); ctx.lineTo(x - 70, floor - 345); ctx.lineTo(x + 145, floor - 210); ctx.closePath(); ctx.fill();
    knitPatch(ctx, x - 235, floor - 215, 350, 220, dark ? '#2a1726' : '#936154', dark ? '#6b3146' : '#ddb09c');
    ctx.fillStyle = '#2c1b25'; ctx.fillRect(x - 84, floor - 112, 74, 116);
    ctx.strokeStyle = dark ? '#7f3349' : '#e2b292'; ctx.lineWidth = 5; ctx.strokeRect(x - 203, floor - 167, 92, 76);
    ctx.fillStyle = '#f0bd83'; ctx.globalAlpha *= .65; ctx.fillRect(x - 198, floor - 162, 82, 66);
    ctx.globalAlpha = dark ? .45 : .9;
    // Família bordada no vidro — os rostos foram arrancados da lembrança.
    for (let i = 0; i < 3; i++) {
        const px = x - 180 + i * 25, py = floor - 126 + (i === 1 ? -6 : 2);
        ctx.strokeStyle = '#52333c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, py + 7); ctx.lineTo(px, py + 27); ctx.stroke();
        ctx.strokeStyle = '#d34961'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px - 9, py - 8); ctx.lineTo(px + 9, py + 9); ctx.moveTo(px + 9, py - 8); ctx.lineTo(px - 9, py + 9); ctx.stroke();
    }
    ctx.fillStyle = '#3f2631'; ctx.fillRect(x + 145, floor - 34, 180, 12);
    ctx.fillRect(x + 166, floor - 22, 10, 36); ctx.fillRect(x + 292, floor - 22, 10, 36);
    ctx.strokeStyle = '#efd0af'; ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(x + 207 + i * 56, floor - 41, 24, 7, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
}

function drawRain(ctx: CanvasRenderingContext2D, width: number, height: number, drift: number, time: number): void {
    const x = width * .5 - drift, floor = height * .73;
    ctx.save(); ctx.globalAlpha = .78;
    const wet = ctx.createLinearGradient(0, floor - 100, 0, height); wet.addColorStop(0, 'rgba(44,78,98,0)'); wet.addColorStop(1, '#172b3c');
    ctx.fillStyle = wet; ctx.fillRect(0, floor - 100, width, height - floor + 100);
    ctx.strokeStyle = '#aacbd4'; ctx.lineWidth = 1.2; ctx.globalAlpha = .33;
    for (let i = -4; i < 55; i++) {
        const rx = ((i * 47 - time * 90) % (width + 160)) - 80;
        const ry = ((i * 83 + time * 135) % (height + 180)) - 90;
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 18, ry + 72); ctx.stroke();
    }
    ctx.globalAlpha = .86; ctx.fillStyle = '#182a38'; ctx.fillRect(x - 180, floor - 132, 360, 12);
    ctx.fillRect(x - 156, floor - 120, 12, 120); ctx.fillRect(x + 144, floor - 120, 12, 120);
    ctx.fillStyle = '#2c4656'; ctx.fillRect(x - 132, floor - 84, 245, 18); ctx.fillRect(x - 119, floor - 66, 13, 68); ctx.fillRect(x + 94, floor - 66, 13, 68);
    ctx.fillStyle = '#d9b69c'; ctx.beginPath(); ctx.arc(x - 35, floor - 89, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d5065'; ctx.fillRect(x - 48, floor - 78, 27, 47);
    ctx.strokeStyle = '#d44a68'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 34, floor - 45); ctx.quadraticCurveTo(x + 18, floor - 10, x + 86, floor + 3); ctx.stroke();
    ctx.fillStyle = '#e0d0b8'; ctx.fillRect(x - 26, floor - 67, 24, 17); ctx.strokeStyle = '#886c66'; ctx.lineWidth = 1; ctx.strokeRect(x - 26, floor - 67, 24, 17);
    ctx.fillStyle = '#243544'; ctx.font = '700 12px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('ÚLTIMO ÔNIBUS', x, floor - 142);
    ctx.restore();
}

function drawHotel(ctx: CanvasRenderingContext2D, width: number, height: number, drift: number): void {
    const x = width * .5 - drift, floor = height * .75;
    ctx.save(); ctx.globalAlpha = .82;
    ctx.fillStyle = '#201825'; ctx.fillRect(x - 410, floor - 310, 820, 320);
    ctx.fillStyle = '#382334';
    for (let i = 0; i < 8; i++) {
        const dx = x - 370 + i * 105;
        ctx.fillRect(dx, floor - 224, 72, 225);
        ctx.strokeStyle = i === 4 ? '#d64562' : '#614254'; ctx.lineWidth = i === 4 ? 4 : 2; ctx.strokeRect(dx, floor - 224, 72, 225);
        ctx.fillStyle = i === 4 ? '#f0b2a8' : '#9f8090'; ctx.font = '700 13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(String(i + 17), dx + 36, floor - 192);
        ctx.fillStyle = '#382334';
    }
    // Proprietário: só um recorte, como se tivesse sido bordado por trás do tecido.
    ctx.globalAlpha = .62; ctx.fillStyle = '#08070a';
    ctx.beginPath(); ctx.ellipse(x + 65, floor - 216, 27, 38, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 18, floor); ctx.quadraticCurveTo(x + 8, floor - 177, x + 58, floor - 183); ctx.quadraticCurveTo(x + 120, floor - 160, x + 124, floor); ctx.fill();
    ctx.fillStyle = '#d04761'; ctx.fillRect(x + 51, floor - 224, 10, 3); ctx.fillRect(x + 73, floor - 224, 10, 3);
    yarnStroke(ctx, [[x - 410, floor - 40], [x - 120, floor - 55], [x + 65, floor - 118], [x + 410, floor - 52]], '#d33e5b', 4, 10);
    ctx.restore();
}

function drawArchive(ctx: CanvasRenderingContext2D, width: number, height: number, drift: number, time: number): void {
    const x = width * .5 - drift;
    ctx.save(); ctx.globalAlpha = .72;
    for (let i = 0; i < 16; i++) {
        const px = x - 430 + ((i * 103) % 860), py = height * (.18 + ((i * 47) % 52) / 100) + Math.sin(time * .7 + i) * 12;
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(i * 2.2) * .14);
        ctx.fillStyle = i % 4 === 0 ? '#6f2940' : '#d2b8a3'; ctx.fillRect(-39, -24, 78, 48);
        ctx.strokeStyle = '#341624'; ctx.lineWidth = 1; for (let l = -11; l <= 13; l += 8) { ctx.beginPath(); ctx.moveTo(-29, l); ctx.lineTo(27, l); ctx.stroke(); }
        ctx.restore();
    }
    const eyeY = height * .36;
    ctx.globalAlpha = .92; ctx.strokeStyle = '#bd3152'; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(x, eyeY, 118, 53, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#130914'; ctx.beginPath(); ctx.ellipse(x, eyeY, 49, 49, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f05571'; ctx.beginPath(); ctx.arc(x, eyeY, 12 + Math.sin(time * 2) * 2, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 9; i++) {
        const a = Math.PI * 2 * i / 9;
        yarnStroke(ctx, [[x + Math.cos(a) * 128, eyeY + Math.sin(a) * 60], [x + Math.cos(a) * 310, eyeY + Math.sin(a) * 210]], '#8e2445', 2.4, 4);
    }
    ctx.restore();
}

function drawChapterArt(ctx: CanvasRenderingContext2D, width: number, height: number, cameraX: number, time: number, chapter: number, scale: number): void {
    const palette = MEMORY_CHAPTERS[chapter];
    const drift = Math.max(0, cameraX - palette.start) * scale * .04;
    if (chapter === 0) drawHome(ctx, width, height, drift);
    else if (chapter === 1) drawRain(ctx, width, height, drift, time);
    else if (chapter === 2) drawHotel(ctx, width, height, drift);
    else { drawHome(ctx, width, height, drift * .22, true); drawArchive(ctx, width, height, drift, time); }
}

function drawPlatform(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hue: string, kind: string, index: number): void {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.48)'; ctx.shadowBlur = 13; ctx.shadowOffsetY = 7;
    if (kind === 'yarn') {
        yarnStroke(ctx, [[x, y + h * .5], [x + w * .25, y + Math.sin(index) * 4 + h * .28], [x + w * .55, y + h * .68], [x + w, y + h * .42]], hue, Math.max(8, h * .78), 8);
    } else {
        knitPatch(ctx, x, y, w, h, hue, kind === 'photo' ? '#ead0bd' : '#ceb0b0');
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = kind === 'lace' ? '#ead0cf' : '#edc5bb'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
        rounded(ctx, x + 5, y + 5, w - 10, h - 10, Math.min(9, h * .18)); ctx.stroke(); ctx.setLineDash([]);
        if (kind === 'photo') {
            ctx.globalAlpha = .22; ctx.fillStyle = '#f8e2c9';
            for (let px = x + 12; px < x + w - 10; px += 28) ctx.fillRect(px, y + 10, 17, Math.max(5, h - 20));
        }
    }
    ctx.restore();
}

function drawAnchor(ctx: CanvasRenderingContext2D, x: number, y: number, index: number, stitched: boolean, time: number, color: string): void {
    ctx.save(); ctx.translate(x, y); const pulse = 1 + Math.sin(time * 3 + index) * .06; ctx.scale(pulse, pulse);
    ctx.shadowColor = stitched ? color : '#f4d9bd'; ctx.shadowBlur = stitched ? 24 : 14;
    ctx.strokeStyle = stitched ? color : '#e5c9ad'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = stitched ? '#ffe0da' : '#6d4c5c'; ctx.lineWidth = 2;
    for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; ctx.beginPath(); ctx.arc(Math.cos(a) * 14, Math.sin(a) * 14, 3.2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = stitched ? '#ffe5dd' : '#2b1a28'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    if (!stitched) {
        ctx.fillStyle = '#f8e1ce'; ctx.font = '800 10px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(String(index + 1), 0, -25);
    }
    ctx.restore();
}

function drawNeedlePlayer(ctx: CanvasRenderingContext2D, p: MemoryRenderPlayer, px: number, py: number, time: number, color: string): readonly [number, number] {
    ctx.save(); ctx.translate(px, py); ctx.scale(p.facing || 1, 1);
    const stride = Math.sin(p.run) * Math.min(5.5, Math.abs(p.vx));
    const bob = p.grounded ? Math.abs(Math.sin(p.run)) * 2 : 0; ctx.translate(0, -bob);
    // Pernas e corpo de amigurumi.
    ctx.strokeStyle = '#8f6e74'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-9 + stride, 15); ctx.moveTo(8, -4); ctx.lineTo(9 - stride, 15); ctx.stroke();
    knitPatch(ctx, -18, -48, 36, 48, '#c8a79d', '#f0d5c5');
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12; ctx.fillStyle = '#ddc0ae'; ctx.beginPath(); ctx.arc(0, -62, 18, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#977783'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(0, -62, 13, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#2a2027'; ctx.beginPath(); ctx.arc(-6, -65, 2.2, 0, Math.PI * 2); ctx.arc(6, -65, 2.2, 0, Math.PI * 2); ctx.fill();
    // Agulha colossal: duas mãos realmente se apoiam no cabo.
    const stab = Math.sin(Math.min(1, p.stitchAnim) * Math.PI) * 18;
    ctx.save(); ctx.translate(12 + stab, -31); ctx.rotate(-.56 + Math.sin(time * 1.7) * .025);
    const metal = ctx.createLinearGradient(-76, 0, 68, 0); metal.addColorStop(0, '#635e6c'); metal.addColorStop(.28, '#f4e8dc'); metal.addColorStop(.58, '#a5a0ad'); metal.addColorStop(1, '#fff5e8');
    ctx.strokeStyle = metal; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.shadowColor = '#f0cad4'; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.moveTo(-72, 0); ctx.lineTo(60, 0); ctx.quadraticCurveTo(76, -2, 80, -17); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#4d4654'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(-55, 0, 10, 4.3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // Braços em dois ângulos, cada mão fechando no cabo.
    ctx.strokeStyle = '#bea097'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -37); ctx.lineTo(-1, -25); ctx.lineTo(17 + stab * .5, -34); ctx.moveTo(13, -38); ctx.lineTo(28, -22); ctx.lineTo(38 + stab * .45, -44); ctx.stroke();
    ctx.fillStyle = '#e1c2b0'; ctx.beginPath(); ctx.arc(17 + stab * .5, -34, 5.5, 0, Math.PI * 2); ctx.arc(38 + stab * .45, -44, 5.5, 0, Math.PI * 2); ctx.fill();
    // Cachecol curto; o fio funcional é desenhado na camada de mundo.
    yarnStroke(ctx, [[-10, -48], [-24, -43], [-38 - Math.sin(time * 3) * 4, -34]], color, 4, 4);
    ctx.restore();
    return [px + (p.facing || 1) * -35, py - 62] as const;
}

export function renderFloor8Memory(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
    p: MemoryRenderPlayer,
    cameraX: number,
    time: number,
): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const scale = Math.max(30, Math.min(width / 18.2, height / 10.8));
    const base = Math.max(58, height * .105);
    const sx = (x: number) => (x - cameraX) * scale + width * .34;
    const sy = (y: number) => height - y * scale - base;
    const chapter = chapterForX(p.x), palette = MEMORY_CHAPTERS[chapter];

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, palette.sky[0]); sky.addColorStop(.52, palette.sky[1]); sky.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    drawChapterArt(ctx, width, height, cameraX, time, chapter, scale);

    // Malha de crochê no céu: cresce em densidade a cada memória.
    ctx.save(); ctx.globalAlpha = .09 + chapter * .025; ctx.strokeStyle = palette.fog; ctx.lineWidth = 1;
    for (let y = -8; y < height + 12; y += 13 - chapter) {
        for (let x = -8; x < width + 20; x += 17 - chapter) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 4, y + 7, x + 9, y + 7, x + 13, y); ctx.stroke();
        }
    }
    ctx.restore();

    MEMORY_PLATFORMS.forEach((q, i) => {
        if (!platformVisible(q, f8.stitchMask)) return;
        const yv = platformY(q, time), x = sx(q.x), y = sy(yv + q.h), w = q.w * scale, h = q.h * scale;
        if (x + w < -100 || x > width + 100) return;
        drawPlatform(ctx, x, y, w, h, q.hue, q.kind ?? 'cloth', i);
    });

    // Linha já costurada no mundo e a ponta viva ligada ao olho da agulha.
    const stitchedPoints: Array<readonly [number, number]> = [];
    STITCH_ANCHORS.forEach((a, i) => {
        if ((f8.stitchMask & (1 << i)) !== 0) stitchedPoints.push([sx(a.x), sy(a.y)] as const);
    });
    if (stitchedPoints.length) yarnStroke(ctx, stitchedPoints, palette.thread, 4.2, 11);

    STITCH_ANCHORS.forEach((a, i) => {
        const ax = sx(a.x), ay = sy(a.y);
        if (ax < -70 || ax > width + 70) return;
        drawAnchor(ctx, ax, ay, i, (f8.stitchMask & (1 << i)) !== 0, time, palette.thread);
    });

    MEMORY_FRAGMENTS.forEach((m, i) => {
        if ((f8.memoryMask & (1 << i)) !== 0) return;
        const x = sx(m.x), y = sy(m.y + Math.sin(time * 2 + i) * .12);
        if (x < -100 || x > width + 100) return;
        ctx.save(); ctx.translate(x, y); const pulse = 1 + Math.sin(time * 3 + i) * .045; ctx.scale(pulse, pulse);
        ctx.shadowColor = palette.thread; ctx.shadowBlur = 28;
        rounded(ctx, -49, -28, 98, 56, 14); ctx.fillStyle = '#efe0ca'; ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = palette.thread; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); rounded(ctx, -42, -21, 84, 42, 10); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#59243a'; ctx.font = '800 16px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.word, 0, 1);
        ctx.restore();
    });

    // Tear final: oito colunas só acendem quando a assinatura está completa.
    const gx = sx(MEMORY_GOAL_X), gy = sy(1.72);
    if (gx > -220 && gx < width + 220) {
        ctx.save(); ctx.translate(gx, gy); const complete = f8.stitchMask === 0xff && f8.memoryMask === 7;
        ctx.shadowColor = palette.thread; ctx.shadowBlur = complete ? 42 : 8;
        ctx.strokeStyle = '#a88668'; ctx.lineWidth = 10; ctx.strokeRect(-62, -154, 124, 170);
        ctx.fillStyle = '#1b101a'; ctx.fillRect(-54, -146, 108, 154);
        for (let i = 0; i < 8; i++) {
            ctx.strokeStyle = (f8.stitchMask & (1 << i)) ? palette.thread : '#4c3441'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-44 + i * 13, -139); ctx.lineTo(-44 + i * 13, -5); ctx.stroke();
        }
        rounded(ctx, -73, -84, 146, 58, 9); ctx.fillStyle = '#e6d3c2'; ctx.fill();
        ctx.fillStyle = '#4d2435'; ctx.font = '800 12px ui-monospace,monospace'; ctx.textAlign = 'center';
        ctx.fillText(complete ? 'EU AINDA EXISTO' : 'FICHA SEM NOME', 0, -54);
        ctx.restore();
    }

    const px = sx(p.x), py = sy(p.y);
    const eye = drawNeedlePlayer(ctx, p, px, py, time, palette.thread);
    if (stitchedPoints.length) {
        const last = stitchedPoints[stitchedPoints.length - 1];
        yarnStroke(ctx, [last, [(last[0] + eye[0]) * .5, Math.max(last[1], eye[1]) + 55], eye], palette.thread, 4.5, 10);
    } else {
        yarnStroke(ctx, [[px - 160, py + 30], [px - 90, py + 18], eye], palette.thread, 4.2, 8);
    }

    // Fibras na lente.
    for (const n of fibres) {
        const fx = (n.x * width + time * (3 + n.a * 55)) % width;
        const fy = (n.y * height + Math.sin(time + n.x * 20) * 6) % height;
        ctx.fillStyle = `rgba(255,232,218,${n.a})`; ctx.fillRect(fx, fy, 1.2, 1.2);
    }

    // Garante fundo opaco até em navegadores que preservam estado ruim do canvas.
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-over';
    drawChapterArt(ctx, width, height, cameraX, time, chapter, scale);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height); ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
    const vignette = ctx.createRadialGradient(width / 2, height * .44, Math.min(width, height) * .2, width / 2, height * .48, Math.max(width, height) * .75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, `rgba(7,3,10,${chapter === 3 ? .62 : .38})`);
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
}
