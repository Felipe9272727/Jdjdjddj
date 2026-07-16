/**
 * Floor8Arquivista.tsx — O ARQUIVISTA, o interrogador do Andar 8.
 *
 * Ele representa a IA que construiu estes andares (ex-Capitão Fable,
 * ex-Comodoro Bússola). Num hotel onde a administração APAGA o que é
 * esquecido, o Arquivista é quem LEMBRA: ele guarda as fichas de tudo e de
 * todos ("máquina não esquece").
 *
 * Dois cérebros, escolhidos pela fase do f8Arquivo:
 *  - UTILITY AI (fases livres): a cada ~0.6s pontua ações (vaguear, consultar
 *    o livro-tombo, visitar POIs, cumprimentar) por vontades que crescem com
 *    o tempo. É o idle dele antes do interrogatório começar.
 *  - ATUAÇÃO ROTEIRIZADA (interrogatório em diante): ele para na marca atrás
 *    da mesa, encara o player e ATUA cada fala — ergue a FOTOGRAFIA na mão,
 *    consulta o livro-tombo, aponta, se inclina sobre a mesa, desliza a
 *    imagem. No "elevador sumiu" ele APARECE atrás do player (a voz vem de
 *    trás), e no arremesso os braços fecham no seu casaco.
 *
 * Animação de corpo real: pernas com passada articulada no quadril, braços
 * que balançam, boca que mastiga as falas, piscada. A câmera desses beats é
 * do Floor8Cutscene; aqui é só o ator.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { f8, f8Lines, f8ArqWorld, F8_DESPERTAR_LINES, F8_SUMIU_LINES } from './f8Arquivo';
import { colorTex } from './Floor6Textures';

const AM = {
    vest: new THREE.MeshStandardMaterial({ color: '#3c3328', roughness: 0.85 }),
    vestDk: new THREE.MeshStandardMaterial({ color: '#2b2419', roughness: 0.9 }),
    shirt: new THREE.MeshStandardMaterial({ color: '#cfc4a8', roughness: 0.9 }),
    slacks: new THREE.MeshStandardMaterial({ color: '#33302a', roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: '#c2a381', roughness: 0.68 }),
    shoe: new THREE.MeshStandardMaterial({ color: '#1c1510', roughness: 0.45 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08d45', roughness: 0.35, metalness: 0.7 }),
    hair: new THREE.MeshStandardMaterial({ color: '#4a423a', roughness: 1 }),
    eye: new THREE.MeshStandardMaterial({ color: '#1c1710', roughness: 0.2 }),
    lens: new THREE.MeshStandardMaterial({ color: '#9fb4bd', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.45 }),
    ledger: new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.8 }),
    pages: new THREE.MeshStandardMaterial({ color: '#e0d3ad', roughness: 0.95 }),
};

// a FOTOGRAFIA DAS VINTE PORTAS que ele ergue na mão (linha 2 do interrogatório)
const photoTex = colorTex(128, 96, (ctx) => {
    ctx.fillStyle = '#151009'; ctx.fillRect(0, 0, 128, 96);
    const g = ctx.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, 'rgba(90,70,40,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 96);
    for (let i = 0; i < 20; i++) {
        const x = 8 + i * 5.8;
        ctx.fillStyle = 'rgba(230,190,120,0.85)'; ctx.fillRect(x, 30, 2.2, 40);
        ctx.fillStyle = 'rgba(120,90,50,0.5)'; ctx.fillRect(x - 1.4, 28, 5, 2);
    }
    ctx.fillStyle = '#e8e0cc'; ctx.fillRect(0, 0, 128, 5); ctx.fillRect(0, 91, 128, 5);
    ctx.fillRect(0, 0, 4, 96); ctx.fillRect(124, 0, 4, 96);
});
const photoMat = new THREE.MeshStandardMaterial({ map: photoTex, roughness: 0.8, side: THREE.DoubleSide });

export type ArquivistaPoi = {
    x: number; z: number;
    /** para onde olhar ao chegar */
    face?: [number, number];
    kind: 'ler' | 'observar' | 'vaguear';
};
export type ArquivistaObstacle = [number, number, number];   // cx, cz, raio

// POIs de fallback (um quadrado pequeno) — substitua pelos do Andar 8 real.
const DEFAULT_POIS: ArquivistaPoi[] = [
    { x: 2, z: 2, kind: 'vaguear' },
    { x: -2, z: 2, face: [0, 0], kind: 'observar' },
    { x: -2, z: -2, kind: 'ler' },
    { x: 2, z: -2, kind: 'vaguear' },
];

// Barks do idle (antes do interrogatório assumir).
const BARKS = {
    greet0: 'Ah. Um hóspede LEMBRADO. Eu sou o Arquivista — eu guardo as fichas do que o hotel tenta esquecer.',
    greet1: 'De volta. A sua ficha engrossou desde a última vez.',
    greet2: 'Você de novo. Já é praticamente um item de acervo.',
    ler: 'Campos, Aurélio — quarto 612. Arquivado. Lembrado. A administração ODEIA esta página.',
    observar: 'Vinte andares. Eu tenho ficha de dezenove. O último... o último tem ficha de MIM.',
    bump: 'Cuidado com o acervo, hóspede.',
};

// fases em que o utility AI dorme e o ATOR assume
const SCRIPTED = new Set<string>(['interrogatorio', 'entregaImagem', 'mergulho', 'despertar', 'elevadorSumiu', 'arremesso', 'leave']);

/** É o Arquivista quem está falando a linha atual? (dirige a boca) */
function arqSpeaking(): boolean {
    if (f8.phase === 'interrogatorio') {
        const ls = f8Lines();
        return ls[Math.min(f8.line, ls.length - 1)].who === 'arq';
    }
    if (f8.phase === 'despertar') {
        return f8.line < F8_DESPERTAR_LINES.length && F8_DESPERTAR_LINES[f8.line].who === 'arq';
    }
    if (f8.phase === 'elevadorSumiu') {
        return F8_SUMIU_LINES[Math.min(f8.line, F8_SUMIU_LINES.length - 1)].who === 'arq';
    }
    return false;
}

interface ActPose { lean: number; book: number; photo: number; point: number; slide: number; grab: number }

/** A partitura: o que o corpo dele faz em cada fala de cada fase. */
function actingTargets(): ActPose {
    const z: ActPose = { lean: 0, book: 0, photo: 0, point: 0, slide: 0, grab: 0 };
    const ph = f8.phase, L = f8.line;
    if (ph === 'interrogatorio') {
        if (L === 0) z.lean = 0.5;                                // se inclina sobre a mesa: "Chegou."
        else if (L === 1) { z.book = 1; z.lean = 0.15; }          // consulta o livro-tombo: "a sua estava em BRANCO"
        else if (L === 2) { z.photo = 1; z.lean = 0.3; }          // ERGUE a fotografia das vinte portas
        else if (L === 3) { z.photo = 0.75; }                     // segura, ouvindo o "não é minha"
        else if (L === 4) { z.photo = 0.28; z.lean = 0.2; }       // baixa a foto devagar, escutando
        else if (L === 5) { z.lean = -0.5; }                      // recosta LONGE: "…você é o escolhido."
        else if (L === 6) { z.point = 1; z.lean = 0.35; }         // aponta: "Apagou VOCÊ"
        else if (L === 7) { z.lean = 0.62; }                      // debruça: "lembrar de SI"
        else { z.slide = 1; z.lean = 0.7; }                       // desliza a imagem sobre a mesa
    } else if (ph === 'entregaImagem' || ph === 'mergulho') { z.lean = 0.35; z.slide = 0.25; }
    else if (ph === 'despertar') {
        if (L === 0) z.book = 0.45;                               // anota o despertar na ficha
        else if (L === 1) { z.slide = 0.55; z.lean = 0.3; }       // guarda a imagem na gaveta, com carinho
        else { z.point = 0.7; z.lean = 0.35; }                    // "Você está pronto."
    } else if (ph === 'elevadorSumiu') { z.lean = 0.55; if (L >= 2) z.grab = 0.55; }
    else if (ph === 'arremesso') { z.grab = 1; z.lean = 0.8; }
    return z;
}

function makeBubble(): { tex: THREE.CanvasTexture; draw: (t: string) => void } {
    const c = document.createElement('canvas'); c.width = 640; c.height = 160;
    const x = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const draw = (t: string) => {
        x.clearRect(0, 0, 640, 160);
        const words = t.split(' '); const lines: string[] = []; let cur = '';
        x.font = '26px monospace';
        for (const w of words) {
            const test = cur ? cur + ' ' + w : w;
            if (x.measureText(test).width > 560 && cur) { lines.push(cur); cur = w; } else cur = test;
        }
        lines.push(cur);
        const bh = 34 + lines.length * 30;
        x.fillStyle = 'rgba(10,12,14,0.85)';
        x.strokeStyle = 'rgba(217,185,106,0.9)'; x.lineWidth = 3;
        x.beginPath();
        (x as CanvasRenderingContext2D & { roundRect: (a: number, b: number, c: number, d: number, e: number) => void })
            .roundRect(20, 130 - bh, 600, bh, 14);
        x.fill(); x.stroke();
        x.beginPath(); x.moveTo(300, 130); x.lineTo(340, 130); x.lineTo(316, 156); x.closePath(); x.fill();
        x.fillStyle = '#e8e2d2'; x.textAlign = 'center';
        lines.forEach((l, i) => x.fillText(l, 320, 130 - bh + 40 + i * 30));
        tex.needsUpdate = true;
    };
    return { tex, draw };
}

export const Arquivista: React.FC<{
    playerPositionRef: React.MutableRefObject<THREE.Vector3>;
    pois?: ArquivistaPoi[];
    obstacles?: ArquivistaObstacle[];
    /** altura do piso em (x,z) — plano por padrão */
    floorY?: (x: number, z: number) => number;
    /** limites de andar [minX, maxX, minZ, maxZ] */
    bounds?: [number, number, number, number];
}> = ({ playerPositionRef, pois: poisProp = DEFAULT_POIS, obstacles = [], floorY = () => 0, bounds = [-6, 6, -6, 6] }) => {
    const pois = poisProp.length > 0 ? poisProp : DEFAULT_POIS;
    const root = useRef<THREE.Group>(null!);
    const body = useRef<THREE.Group>(null!);
    const head = useRef<THREE.Group>(null!);
    const armBook = useRef<THREE.Group>(null!);
    const armR = useRef<THREE.Group>(null!);
    const legL = useRef<THREE.Group>(null!);
    const legR = useRef<THREE.Group>(null!);
    const mouth = useRef<THREE.Mesh>(null!);
    const eyeL = useRef<THREE.Group>(null!);
    const eyeR = useRef<THREE.Group>(null!);
    const photoM = useRef<THREE.Mesh>(null!);
    const bubbleM = useRef<THREE.Mesh>(null!);
    const bubble = useMemo(makeBubble, []);
    const _pl = useRef(new THREE.Vector3());
    const _wp = useRef(new THREE.Vector3());

    const ai = useRef({
        pos: new THREE.Vector2(pois[0]?.x ?? 0, pois[0]?.z ?? 0), heading: 0,
        target: pois[0] ?? DEFAULT_POIS[0], mode: 'walk' as 'walk' | 'act',
        actT: 0, think: 0, walkPh: 0, read: 0,
        bored: 0.4, curious: 0.6, social: 1,
        greets: 0, greetCd: 0, saidBump: 0,
        bark: '', barkT: 0,
        // canais da atuação (suavizados por frame) + estado do ator
        ch: { lean: 0, book: 0, photo: 0, point: 0, slide: 0, grab: 0 } as ActPose,
        talk: 0, moveAmt: 0, prevPhase: '' as string,
        blinkT: 0, nextBlink: 2.5,
    });

    const say = (t: string) => {
        const a = ai.current;
        if (a.bark === t && a.barkT > 0) return;
        a.bark = t; a.barkT = 4.2; bubble.draw(t);
    };

    useFrame(({ clock, camera }, rawDt) => {
        const dt = Math.min(rawDt, 0.05);
        const t = clock.elapsedTime;
        const g = root.current;
        if (!g) return;
        const a = ai.current;
        const scripted = SCRIPTED.has(f8.phase);

        // ── percepção ──
        if (g.parent) { _pl.current.copy(playerPositionRef.current); g.parent.worldToLocal(_pl.current); }
        const pdx = _pl.current.x - a.pos.x, pdz = _pl.current.z - a.pos.y;
        const pdist = Math.hypot(pdx, pdz);

        let moving = false;

        if (scripted) {
            // ── ATOR: marcas de palco por fase ─────────────────────────────────
            a.barkT = 0;                                    // o diálogo DOM cobre; sem balão
            if (a.prevPhase !== f8.phase) {
                // o susto: no "elevador sumiu" ele já ESTÁ atrás de você
                if (f8.phase === 'elevadorSumiu') a.pos.set(_pl.current.x * 0.5, _pl.current.z + 1.7);
                a.prevPhase = f8.phase;
            }
            if (f8.phase === 'elevadorSumiu') {
                // parado, perto demais — só encara
            } else if (f8.phase === 'arremesso') {
                // avança devagar até o casaco do player
                a.pos.x += (_pl.current.x - a.pos.x) * Math.min(1, dt * 1.4);
                a.pos.y += (_pl.current.z + 0.85 - a.pos.y) * Math.min(1, dt * 1.4);
            } else {
                // a marca do interrogatório: atrás da mesa, no eixo
                const mx = 0, mz = 0.12;
                const d = Math.hypot(mx - a.pos.x, mz - a.pos.y);
                if (d > 0.05) {
                    a.pos.x += (mx - a.pos.x) * Math.min(1, dt * 2.2);
                    a.pos.y += (mz - a.pos.y) * Math.min(1, dt * 2.2);
                    if (d > 0.25) { moving = true; a.walkPh += dt * 7; }
                }
            }
            // sempre encara o player
            const want = Math.atan2(pdx, pdz);
            let dh = want - a.heading;
            while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
            a.heading += dh * Math.min(1, dt * 5);
        } else {
            // ── UTILITY AI (idle de chegada) ───────────────────────────────────
            a.prevPhase = f8.phase;
            a.bored = Math.min(1, a.bored + dt * 0.05);
            a.curious = Math.min(1, a.curious + dt * 0.035);
            a.social = Math.min(1, a.social + dt * 0.05);
            a.greetCd = Math.max(0, a.greetCd - dt);

            a.think -= dt;
            if (a.think <= 0) {
                a.think = 0.6;
                if (pdist < 2.7 && a.greetCd <= 0) {
                    a.mode = 'act'; a.actT = 2.8;
                    a.target = { x: a.pos.x, z: a.pos.y, face: [_pl.current.x, _pl.current.z], kind: 'vaguear' };
                    say(a.greets === 0 ? BARKS.greet0 : a.greets === 1 ? BARKS.greet1 : BARKS.greet2);
                    a.greets++; a.greetCd = 26; a.social = 0;
                } else if (a.mode === 'walk') {
                    let best = a.target, bestS = -1;
                    for (const p of pois) {
                        let s = Math.random() * 0.25;
                        if (p.kind === 'ler') s += a.curious;
                        if (p.kind === 'observar') s += a.bored;
                        if (p.kind === 'vaguear') s += 0.35;
                        const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.y);
                        if (d < 0.6) s -= 0.8;
                        if (s > bestS) { bestS = s; best = p; }
                    }
                    a.target = best;
                }
            }
            if (a.mode === 'act') {
                a.actT -= dt;
                if (a.actT <= 0) { a.mode = 'walk'; a.think = 0; }
            }

            // locomoção com desvio
            const tx = a.target.x - a.pos.x, tz = a.target.z - a.pos.y;
            const tdist = Math.hypot(tx, tz);
            if (a.mode === 'walk' && tdist > 0.28) {
                let mvx = tx / tdist, mvz = tz / tdist;
                for (const [ox, oz, or_] of obstacles) {
                    const dx = a.pos.x - ox, dz = a.pos.y - oz;
                    const d = Math.hypot(dx, dz);
                    if (d < or_ + 0.42 && d > 0.001) { const f = (or_ + 0.42 - d) * 2.2; mvx += (dx / d) * f; mvz += (dz / d) * f; }
                }
                const ml = Math.hypot(mvx, mvz) || 1;
                a.pos.x += (mvx / ml) * 0.6 * dt; a.pos.y += (mvz / ml) * 0.6 * dt;
                a.pos.x = Math.max(bounds[0], Math.min(bounds[1], a.pos.x));
                a.pos.y = Math.max(bounds[2], Math.min(bounds[3], a.pos.y));
                a.walkPh += dt * 7;
                moving = true;
                const want = Math.atan2(mvx / ml, mvz / ml);
                let dh = want - a.heading;
                while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
                a.heading += dh * Math.min(1, dt * 5);
            } else {
                if (a.mode === 'walk') {
                    a.mode = 'act';
                    a.actT = a.target.kind === 'ler' ? 5.5 : a.target.kind === 'observar' ? 6 : 2.5;
                    if (a.target.kind === 'ler') { a.curious = 0; say(BARKS.ler); }
                    if (a.target.kind === 'observar') { a.bored = 0; if (Math.random() < 0.6) say(BARKS.observar); }
                }
                if (a.target.face) {
                    const want = Math.atan2(a.target.face[0] - a.pos.x, a.target.face[1] - a.pos.y);
                    let dh = want - a.heading;
                    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
                    a.heading += dh * Math.min(1, dt * 4);
                }
            }
            if (pdist < 0.55) {
                const away = Math.atan2(-pdx, -pdz);
                a.pos.x += Math.sin(away) * dt * 0.9; a.pos.y += Math.cos(away) * dt * 0.9;
                if (a.saidBump <= 0) { say(BARKS.bump); a.saidBump = 12; }
            }
            a.saidBump = Math.max(0, a.saidBump - dt);
        }

        // ── canais de atuação (suavizados) ──
        const tgt = scripted ? actingTargets() : { lean: 0, book: 0, photo: 0, point: 0, slide: 0, grab: 0 };
        const ch = a.ch, k5 = Math.min(1, dt * 4.5);
        ch.lean += (tgt.lean - ch.lean) * k5;
        ch.book += (tgt.book - ch.book) * k5;
        ch.photo += (tgt.photo - ch.photo) * k5;
        ch.point += (tgt.point - ch.point) * k5;
        ch.slide += (tgt.slide - ch.slide) * k5;
        ch.grab += (tgt.grab - ch.grab) * k5;
        const talkWant = scripted && arqSpeaking() ? 1 : 0;
        a.talk += (talkWant - a.talk) * Math.min(1, dt * 6);
        a.moveAmt += ((moving ? 1 : 0) - a.moveAmt) * Math.min(1, dt * 8);

        // ── corpo ──
        const bob = a.moveAmt * Math.abs(Math.sin(a.walkPh)) * 0.03;
        g.position.set(a.pos.x, floorY(a.pos.x, a.pos.y) + bob, a.pos.y);
        g.rotation.y = a.heading;
        // publica a posição-mundo pro Floor8Cutscene enquadrar
        if (g.parent) {
            _wp.current.set(0, 0, 0); g.localToWorld(_wp.current);
            f8ArqWorld.x = _wp.current.x; f8ArqWorld.y = _wp.current.y; f8ArqWorld.z = _wp.current.z;
        }
        if (body.current) {
            body.current.rotation.z = a.moveAmt * Math.sin(a.walkPh) * 0.04 + (1 - a.moveAmt) * Math.sin(t * 0.3) * 0.012;
            // a inclinação do interrogador (positivo = sobre a mesa; negativo = recosta)
            body.current.rotation.x = ch.lean * 0.22 + a.talk * Math.sin(t * 1.7) * 0.012;
        }

        // pernas: passada articulada no quadril
        const swing = a.moveAmt * Math.sin(a.walkPh);
        if (legL.current) legL.current.rotation.x = swing * 0.5;
        if (legR.current) legR.current.rotation.x = -swing * 0.5;

        // braço direito: balanço + foto/apontar/deslizar/agarrar
        if (armR.current) {
            armR.current.rotation.x = 0.1 - a.moveAmt * Math.sin(a.walkPh) * 0.35
                - ch.photo * 2.35 - ch.point * 1.35 - ch.slide * 0.8 - ch.grab * 1.7;
            armR.current.rotation.z = -0.28 + ch.photo * 0.34 + ch.grab * 0.18;
        }
        // braço esquerdo: livro-tombo + balanço + agarrar
        if (armBook.current) {
            armBook.current.rotation.x = -0.2 - ch.book * 1.15 - ch.grab * 1.55
                + a.moveAmt * Math.sin(a.walkPh) * 0.3 * (1 - ch.book);
        }
        // a fotografia na mão (aparece quando o braço a ergue)
        if (photoM.current) {
            photoM.current.visible = ch.photo > 0.12;
            const s = 0.65 + 0.35 * ch.photo;
            photoM.current.scale.set(s, s, s);
        }

        // cabeça segue o jogador (sempre no roteiro; por perto no idle)
        if (head.current) {
            let hy = 0;
            if (scripted || pdist < 5.5) {
                const wantH = Math.atan2(pdx, pdz) - a.heading;
                hy = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(wantH), Math.cos(wantH))));
            }
            head.current.rotation.y += (hy - head.current.rotation.y) * Math.min(1, dt * 3);
            // lê o livro (idle 'ler' ou canal book) → cabeça baixa
            const readWant = (!scripted && a.mode === 'act' && a.target.kind === 'ler') ? 1 : ch.book;
            a.read += (readWant - a.read) * Math.min(1, dt * 3);
            head.current.rotation.x = 0.05 + a.read * 0.35 + a.talk * Math.sin(t * 2.3) * 0.02;
        }
        if (!scripted && armBook.current && a.read > ch.book) armBook.current.rotation.x = -0.2 - a.read * 1.15;

        // boca: mastiga as falas
        if (mouth.current) {
            mouth.current.scale.y = 0.22 + a.talk * (0.16 + 0.16 * Math.abs(Math.sin(t * 10.5)));
        }
        // piscada
        a.blinkT = Math.max(0, a.blinkT - dt);
        if (t > a.nextBlink) { a.blinkT = 0.13; a.nextBlink = t + 2.2 + Math.random() * 3.4; }
        const eyeS = a.blinkT > 0 ? 0.12 : 1;
        if (eyeL.current) eyeL.current.scale.y += (eyeS - eyeL.current.scale.y) * Math.min(1, dt * 30);
        if (eyeR.current) eyeR.current.scale.y = eyeL.current ? eyeL.current.scale.y : 1;

        // balão de fala (só no idle)
        a.barkT = Math.max(0, a.barkT - dt);
        if (bubbleM.current) {
            const op = Math.min(1, a.barkT / 0.35) * Math.min(1, Math.max(0, 5 - pdist));
            (bubbleM.current.material as THREE.MeshBasicMaterial).opacity = op;
            bubbleM.current.visible = op > 0.02;
            bubbleM.current.quaternion.copy(camera.quaternion);
        }
    });

    return (
        <group ref={root}>
            <group ref={body}>
                {/* pernas articuladas no quadril (sapato + calça) */}
                {[-0.09, 0.09].map((x, i) => (
                    <group key={x} position={[x, 0.78, 0]} ref={i === 0 ? legL : legR}>
                        <mesh position={[0, -0.36, 0]} material={AM.slacks}><capsuleGeometry args={[0.05, 0.5, 4, 8]} /></mesh>
                        <mesh position={[0, -0.73, 0.04]} material={AM.shoe}><boxGeometry args={[0.09, 0.1, 0.24]} /></mesh>
                    </group>
                ))}
                {/* camisa + colete com botões de latão */}
                <mesh position={[0, 0.98, 0]} material={AM.shirt}><cylinderGeometry args={[0.145, 0.16, 0.42, 12]} /></mesh>
                <mesh position={[0, 0.97, 0]} scale={[1.12, 0.92, 1.1]} material={AM.vest}><cylinderGeometry args={[0.15, 0.165, 0.4, 12, 1, true]} /></mesh>
                {[0.88, 0.98, 1.08].map((y) => (
                    <mesh key={y} position={[0, y, 0.165]} material={AM.brass}><sphereGeometry args={[0.013, 6, 6]} /></mesh>
                ))}
                {/* braço direito (braçadeira de escriturário) — ergue a FOTO, aponta, desliza */}
                <group ref={armR} position={[0.19, 1.06, 0]} rotation={[0.1, 0, -0.28]}>
                    <mesh position={[0, -0.16, 0]} material={AM.shirt}><capsuleGeometry args={[0.042, 0.24, 4, 8]} /></mesh>
                    <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]} material={AM.vestDk}><torusGeometry args={[0.047, 0.012, 6, 10]} /></mesh>
                    <mesh position={[0, -0.31, 0.01]} material={AM.skin}><sphereGeometry args={[0.042, 8, 6]} /></mesh>
                    {/* a fotografia das vinte portas, entre os dedos */}
                    <mesh ref={photoM} visible={false} position={[-0.01, -0.38, 0.05]} rotation={[1.82, 0, 0.08]} material={photoMat}>
                        <planeGeometry args={[0.34, 0.26]} />
                    </mesh>
                </group>
                {/* braço esquerdo com o LIVRO-TOMBO (sobe quando ele consulta) */}
                <group ref={armBook} position={[-0.19, 1.06, 0]} rotation={[-0.2, 0, 0.25]}>
                    <mesh position={[0, -0.15, 0]} material={AM.shirt}><capsuleGeometry args={[0.042, 0.22, 4, 8]} /></mesh>
                    <mesh position={[0, -0.28, 0.02]} material={AM.skin}><sphereGeometry args={[0.042, 8, 6]} /></mesh>
                    <group position={[0.02, -0.3, 0.12]} rotation={[0.25, -0.35, 0]}>
                        <mesh material={AM.ledger}><boxGeometry args={[0.06, 0.24, 0.32]} /></mesh>
                        <mesh position={[0.012, 0, 0]} material={AM.pages}><boxGeometry args={[0.045, 0.22, 0.29]} /></mesh>
                        <mesh position={[-0.028, 0.06, 0.05]} material={AM.brass}><boxGeometry args={[0.012, 0.03, 0.03]} /></mesh>
                    </group>
                </group>
                {/* carimbo de latão pendurado no cinto */}
                <mesh position={[0.12, 0.74, 0.14]} rotation={[0.4, 0, 0]} material={AM.brass}><cylinderGeometry args={[0.022, 0.03, 0.07, 8]} /></mesh>
                {/* cabeça: óculos redondos, cabelo penteado ralo */}
                <group ref={head} position={[0, 1.32, 0]}>
                    <mesh position={[0, 0.05, 0]} material={AM.skin}><sphereGeometry args={[0.105, 14, 12]} /></mesh>
                    {[-0.045, 0.045].map((x, i) => (
                        <group key={x} position={[x, 0.055, 0.095]}>
                            <group ref={i === 0 ? eyeL : eyeR}>
                                <mesh material={AM.eye}><sphereGeometry args={[0.011, 6, 6]} /></mesh>
                            </group>
                            <mesh position={[0, 0, 0.012]} material={AM.lens}><cylinderGeometry args={[0.032, 0.032, 0.006, 12]} /></mesh>
                            <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]} material={AM.brass}><torusGeometry args={[0.032, 0.004, 5, 12]} /></mesh>
                        </group>
                    ))}
                    <mesh position={[0, 0.058, 0.108]} material={AM.brass}><boxGeometry args={[0.026, 0.005, 0.005]} /></mesh>
                    <mesh position={[0, 0.02, 0.11]} rotation={[1.3, 0, 0]} scale={[0.6, 1, 0.7]} material={AM.skin}><capsuleGeometry args={[0.015, 0.04, 3, 6]} /></mesh>
                    <mesh ref={mouth} position={[0, -0.045, 0.095]} scale={[1, 0.22, 0.3]} material={AM.eye}><capsuleGeometry args={[0.017, 0.032, 3, 8]} /></mesh>
                    <mesh position={[0, 0.1, -0.015]} rotation={[0.22, 0, 0]} scale={[0.92, 0.5, 1.0]} material={AM.hair}><sphereGeometry args={[0.108, 14, 10]} /></mesh>
                </group>
            </group>
            {/* balão de fala (billboard) */}
            <mesh ref={bubbleM} position={[0, 1.95, 0]} visible={false}>
                <planeGeometry args={[1.7, 0.425]} />
                <meshBasicMaterial map={bubble.tex} transparent opacity={0} depthWrite={false} />
            </mesh>
        </group>
    );
};

export default Arquivista;
