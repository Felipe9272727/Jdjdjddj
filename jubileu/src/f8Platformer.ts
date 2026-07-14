/**
 * f8Platformer.ts — DENTRO DA PORTA 21: a MEMÓRIA do player, em CROCHÊ.
 *
 * O player empunha uma AGULHA GIGANTE de crochê com os dois braços; do bico da
 * agulha corre um FIO. O fio é uma corda de gancho: mira num PONTO DE CROCHÊ
 * (uma laçada pendurada no céu tecido), engancha, BALANÇA como pêndulo e SOLTA
 * pra ser arremessado ao outro lado. Os vãos são largos demais pra pular — só o
 * balanço atravessa.
 *
 * A jornada são QUATRO MEMÓRIAS (mini-fases) da vida do player, e elas vão
 * ficando cada vez mais fundas e obscuras: a infância macia → o lar e uma perda
 * → algo rasgado, com fios pretos → o fundo obscuro (a verdade que apagaram).
 * Vencer a última = recuperar a si mesmo.
 *
 * Módulo puro (sem three/react): o motor (pêndulo + corrida + pulo) e o layout
 * das memórias moram aqui; a cena (Floor8Platformer) e o HUD leem daqui — uma
 * única fonte de verdade, mesmo padrão de f6Escape/f5Race/f8Arquivo.
 */
import { f8WinMemory } from './f8Arquivo';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface Vec2 { x: number; y: number; }
export interface Ledge { x0: number; x1: number; y: number; }

/** Paleta de uma memória — dirige as cores da cena (croma → escuridão). */
export interface Palette {
    bgHi: string; bgLo: string;      // gradiente de fundo (céu tecido)
    wool: string; woolHi: string; woolLo: string;   // a lã das plataformas
    anchor: string;                  // a laçada de gancho
    thread: string;                  // o fio do player
    hazard: string;                  // os fios pretos / espinhos
    fog: string;                     // névoa de profundidade
    ambient: string; light: string;  // luz da memória
}

/** Uma memória = uma mini-fase (layout próprio + humor próprio). */
export interface Memory {
    key: string;
    title: string;
    caption: string;                 // a frase da memória (aparece ao entrar)
    ledges: Ledge[];
    anchors: Vec2[];                 // laçadas de crochê pra enganchar
    hazards: Vec2[];                 // fios pretos (encostar = desfaz)
    spools: Vec2[];                  // novelos coletáveis (opcional)
    startX: number; startY: number;
    goalX: number;                   // alcançar = próxima memória
    endX: number;                    // largura do mundo
    pal: Palette;
}

// ── Tuning físico ─────────────────────────────────────────────────────────────
export const P8 = {
    RUN: 6.4,
    ACCEL: 28,
    AIR_CTRL: 0.55,
    GRAV: -28,
    JUMP_V: 10.5,
    COYOTE: 0.12,
    JUMP_BUF: 0.12,
    GRAB_RANGE: 8.5,     // alcance pra fisgar uma laçada
    MAX_ROPE: 8.5,
    MIN_ROPE: 1.6,
    SWING_ACCEL: 15,     // "bombear" o balanço com esquerda/direita
    REEL: 3.2,           // subir/descer no fio (cima/baixo)
    RELEASE_BOOST: 3.0,  // empurrãozinho vertical ao soltar pulando
    VOID_DY: -6,         // dy abaixo do respawn = caiu
} as const;

// ── As quatro memórias ────────────────────────────────────────────────────────
// Paletas: começam quentes e macias, terminam frias e escuras.
const PAL_INFANCIA: Palette = {
    bgHi: '#f6d9c2', bgLo: '#e7a9b0', wool: '#f0a7b8', woolHi: '#ffcbd6', woolLo: '#d07f95',
    anchor: '#8fd4c2', thread: '#e8738f', hazard: '#c98a3a', fog: '#f2c4bd',
    ambient: '#f4c9b8', light: '#fff2d8',
};
const PAL_LAR: Palette = {
    bgHi: '#9fb4c9', bgLo: '#5f7690', wool: '#7b93ad', woolHi: '#a7bdd2', woolLo: '#516781',
    anchor: '#c9b57a', thread: '#dcc98a', hazard: '#3f4a5a', fog: '#7b8ea6',
    ambient: '#8ba0b8', light: '#dfe7f0',
};
const PAL_RASGADO: Palette = {
    bgHi: '#4a2b34', bgLo: '#1f1218', wool: '#7a3543', woolHi: '#a4505f', woolLo: '#4c1f28',
    anchor: '#b06a5a', thread: '#e06a5a', hazard: '#120a0d', fog: '#341a22',
    ambient: '#5a2f38', light: '#c98a86',
};
const PAL_OBSCURO: Palette = {
    bgHi: '#16151f', bgLo: '#05040a', wool: '#26243a', woolHi: '#3b3856', woolLo: '#141324',
    anchor: '#5a6a8a', thread: '#8a9ec9', hazard: '#000000', fog: '#0a0912',
    ambient: '#1a1830', light: '#6a78a8',
};

export const MEMORIES: Memory[] = [
    {
        key: 'infancia', title: 'I. A INFÂNCIA',
        caption: 'Havia sol nas cortinas, e lã por todo canto. Alguém tricotava, e eu ria.',
        pal: PAL_INFANCIA,
        startX: 0, startY: 0, goalX: 40, endX: 46,
        ledges: [
            { x0: -3, x1: 7, y: 0 },
            { x0: 15, x1: 24, y: 0.6 },
            { x0: 31, x1: 46, y: 0 },
        ],
        anchors: [{ x: 11, y: 6.2 }, { x: 20, y: 7.0 }, { x: 28, y: 6.4 }],
        hazards: [],
        spools: [{ x: 11, y: 3.2 }, { x: 38, y: 1.6 }],
    },
    {
        key: 'lar', title: 'II. O LAR',
        caption: 'Uma casa. Uma porta que se fechou e não abriu de novo. O fio ficou frouxo.',
        pal: PAL_LAR,
        startX: 0, startY: 0, goalX: 52, endX: 58,
        ledges: [
            { x0: -3, x1: 6, y: 0 },
            { x0: 13, x1: 19, y: 1.4 },
            { x0: 26, x1: 32, y: 0.4 },
            { x0: 40, x1: 58, y: 0 },
        ],
        anchors: [{ x: 10, y: 6.6 }, { x: 16, y: 7.6 }, { x: 23, y: 7.0 }, { x: 36, y: 6.6 }],
        hazards: [{ x: 29, y: 0.4 }],
        spools: [{ x: 16, y: 4.4 }, { x: 46, y: 1.6 }],
    },
    {
        key: 'rasgado', title: 'III. O RASGO',
        caption: 'Aqui a lã se rasga. Fios pretos crescem no que deveria ser meu. Não olhe muito.',
        pal: PAL_RASGADO,
        startX: 0, startY: 0, goalX: 60, endX: 66,
        ledges: [
            { x0: -3, x1: 5, y: 0 },
            { x0: 12, x1: 16, y: 1.0 },
            { x0: 23, x1: 27, y: 2.0 },
            { x0: 34, x1: 38, y: 1.0 },
            { x0: 46, x1: 66, y: 0 },
        ],
        anchors: [{ x: 8.5, y: 7.0 }, { x: 19.5, y: 7.8 }, { x: 30.5, y: 8.0 }, { x: 42, y: 7.2 }],
        hazards: [{ x: 25, y: 2.0 }, { x: 36, y: 1.0 }, { x: 52, y: 0 }],
        spools: [{ x: 21, y: 5.4 }, { x: 30, y: 5.0 }, { x: 58, y: 1.6 }],
    },
    {
        key: 'obscuro', title: 'IV. O FUNDO',
        caption: 'No fundo não há sol. Só a verdade que apagaram de você. Alcance-a — e acorde.',
        pal: PAL_OBSCURO,
        startX: 0, startY: 0, goalX: 82, endX: 88,
        ledges: [
            { x0: -3, x1: 4, y: 0 },
            { x0: 11, x1: 14, y: 1.2 },
            { x0: 21, x1: 24, y: 0.4 },
            { x0: 31, x1: 34, y: 1.6 },
            { x0: 42, x1: 45, y: 0.6 },
            // o VÃO LONGO final: uma ilhota estreita no meio — balanço duplo,
            // laçada → pouso apertado → laçada, sem chão em volta
            { x0: 57, x1: 59.5, y: 1.0 },
            { x0: 67, x1: 88, y: 0 },
        ],
        anchors: [
            { x: 8, y: 7.2 }, { x: 17.5, y: 7.4 }, { x: 27.5, y: 7.8 }, { x: 38, y: 8.0 },
            { x: 50.5, y: 6.4 }, { x: 63, y: 7.8 },
        ],
        hazards: [{ x: 13, y: 1.2 }, { x: 23, y: 0.4 }, { x: 33, y: 1.6 }, { x: 44, y: 0.6 }, { x: 74, y: 0 }],
        spools: [{ x: 20, y: 5.2 }, { x: 37, y: 5.4 }, { x: 58.2, y: 3.4 }, { x: 80, y: 1.6 }],
    },
];

const HAZARD_HALF = 0.5, HAZARD_H = 1.4, SPOOL_R = 0.8;

export function curMem(): Memory { return MEMORIES[Math.min(p8.memIdx, MEMORIES.length - 1)]; }

/** Topo mais alto sob `x` que o player (pés em `feetY`) pode pousar, ou null. */
export function groundAt(x: number, feetY: number): number | null {
    let best: number | null = null;
    for (const l of curMem().ledges) {
        if (x < l.x0 || x > l.x1) continue;
        if (l.y <= feetY + 0.28 && (best === null || l.y > best)) best = l.y;
    }
    return best;
}

// ── Estado ────────────────────────────────────────────────────────────────────
export interface P8State {
    memIdx: number;
    x: number; y: number;
    vx: number; vy: number;
    onGround: boolean;
    coyote: number;
    jumpBuf: number;
    stun: number;
    facing: number;
    runPhase: number;
    anchor: number | null;    // índice da laçada presa (na memória atual), ou null
    ropeLen: number;
    grabCd: number;           // carência anti-refisga logo após soltar
    lastGroundX: number; lastGroundY: number;   // respawn suave
    gotSpools: boolean[];
    spools: number;
    hurtFlash: number;
    transition: number;       // >0 → acabou de entrar numa memória (fade na cena)
    won: boolean;
    t: number;
    version: number;
}

function freshFor(memIdx: number): Partial<P8State> {
    const m = MEMORIES[memIdx];
    return {
        memIdx, x: m.startX, y: m.startY, vx: 0, vy: 0, onGround: true, coyote: 0, jumpBuf: 0,
        stun: 0, facing: 1, runPhase: 0, anchor: null, ropeLen: 0, grabCd: 0,
        lastGroundX: m.startX, lastGroundY: m.startY, gotSpools: m.spools.map(() => false),
        hurtFlash: 0, transition: 1.0,
    };
}

const FRESH = (): P8State => ({
    ...(freshFor(0) as P8State), spools: 0, won: false, t: 0, version: 0,
});

export const p8: P8State = FRESH();

const listeners = new Set<() => void>();
export function p8Subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function p8Bump(): void { p8.version++; listeners.forEach((fn) => fn()); }
export function p8Reset(): void { const v = p8.version; Object.assign(p8, FRESH()); p8.version = v; p8Bump(); }

// ── Passo físico ──────────────────────────────────────────────────────────────
export interface P8Input { move: number; vert: number; jump: boolean; grapple: boolean; }
export interface P8Events {
    jumped: boolean; landed: boolean; hurt: boolean; respawned: boolean;
    collected: number; grabbed: boolean; released: boolean; advanced: boolean; won: boolean;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function respawn(p: P8State, ev: P8Events): void {
    p.x = p.lastGroundX; p.y = p.lastGroundY + 0.02; p.vx = 0; p.vy = 0;
    p.onGround = true; p.anchor = null; p.stun = 0.45; p.hurtFlash = 0.6; ev.respawned = true;
}

/** Tenta fisgar a laçada mais próxima à frente/acima, no alcance. */
function tryGrab(p: P8State, m: Memory): boolean {
    let best = -1;
    let bestD: number = P8.GRAB_RANGE;
    for (let i = 0; i < m.anchors.length; i++) {
        const a = m.anchors[i];
        if (a.y < p.y - 0.5) continue;                       // laçadas ficam acima
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return false;
    p.anchor = best;
    p.ropeLen = clamp(bestD, P8.MIN_ROPE, P8.MAX_ROPE);
    return true;
}

export function stepPlayer(inp: P8Input, dt: number): P8Events {
    const p = p8;
    const ev: P8Events = { jumped: false, landed: false, hurt: false, respawned: false, collected: 0, grabbed: false, released: false, advanced: false, won: false };
    if (p.won) return ev;
    const m = curMem();

    p.stun = Math.max(0, p.stun - dt);
    p.coyote = Math.max(0, p.coyote - dt);
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    p.grabCd = Math.max(0, p.grabCd - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.transition = Math.max(0, p.transition - dt);
    p.t += dt;
    if (inp.jump) p.jumpBuf = P8.JUMP_BUF;

    // ── gancho: pega / solta ──
    if (inp.grapple && p.anchor === null && p.grabCd <= 0 && p.stun <= 0) { if (tryGrab(p, m)) ev.grabbed = true; }
    if (!inp.grapple && p.anchor !== null) { p.anchor = null; p.grabCd = 0.2; ev.released = true; }

    if (p.anchor !== null) {
        // ── BALANÇO (pêndulo) ──
        const a = m.anchors[p.anchor];
        // rebobina/estica o fio (cima/baixo)
        p.ropeLen = clamp(p.ropeLen - inp.vert * P8.REEL * dt, P8.MIN_ROPE, P8.MAX_ROPE);
        // gravidade
        p.vy += P8.GRAV * dt;
        // bombeia o balanço na tangente
        let dx = p.x - a.x, dy = p.y - a.y;
        let d = Math.hypot(dx, dy) || 0.0001;
        const tanx = -dy / d, tany = dx / d;
        p.vx += tanx * inp.move * P8.SWING_ACCEL * dt;
        p.vy += tany * inp.move * P8.SWING_ACCEL * dt;
        // integra
        p.x += p.vx * dt; p.y += p.vy * dt;
        // restringe ao raio do fio (corda esticada)
        dx = p.x - a.x; dy = p.y - a.y; d = Math.hypot(dx, dy) || 0.0001;
        if (d > p.ropeLen) {
            const nx = dx / d, ny = dy / d;
            p.x = a.x + nx * p.ropeLen; p.y = a.y + ny * p.ropeLen;
            const vdot = p.vx * nx + p.vy * ny;               // remove a componente radial
            p.vx -= vdot * nx; p.vy -= vdot * ny;
        }
        p.onGround = false;
        if (Math.abs(p.vx) > 0.1) p.facing = p.vx < 0 ? -1 : 1;
        // soltar pulando dá um empurrão
        if (p.jumpBuf > 0) { p.anchor = null; p.grabCd = 0.28; p.vy += P8.RELEASE_BOOST; p.jumpBuf = 0; ev.released = true; ev.jumped = true; }
    } else {
        // ── CORRIDA / PULO ──
        const ctrl = p.stun > 0 ? 0 : (p.onGround ? 1 : P8.AIR_CTRL);
        const target = clamp(inp.move, -1, 1) * P8.RUN;
        p.vx += (target - p.vx) * Math.min(1, P8.ACCEL * ctrl * dt);
        if (p.stun <= 0 && Math.abs(inp.move) > 0.12) p.facing = inp.move < 0 ? -1 : 1;
        if (p.jumpBuf > 0 && p.stun <= 0 && (p.onGround || p.coyote > 0)) {
            p.vy = P8.JUMP_V; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; ev.jumped = true;
        }
        p.vy += P8.GRAV * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;

        const gh = groundAt(p.x, p.y);
        if (gh === null) {
            if (p.onGround) { p.onGround = false; p.coyote = P8.COYOTE; }
        } else if (p.y <= gh + 0.02 && p.vy <= 0) {
            if (!p.onGround && p.vy < -3) ev.landed = true;
            p.y = gh; p.vy = 0; p.onGround = true;
            p.lastGroundX = clamp(p.x, m.startX, m.goalX); p.lastGroundY = gh;
        } else if (p.onGround && p.y > gh + 0.06) {
            p.onGround = false; p.coyote = P8.COYOTE;
        }
    }

    p.x = clamp(p.x, -3, m.endX + 3);
    p.runPhase += (p.onGround ? Math.abs(p.vx) : 0) * dt * 1.6;

    // caiu no vão fundo → respawn
    if (p.y < P8.VOID_DY) { respawn(p, ev); p8Bump(); return ev; }

    // fios pretos (hazards)
    if (p.stun <= 0) {
        for (const h of m.hazards) {
            if (Math.abs(p.x - h.x) < HAZARD_HALF && p.y < h.y + HAZARD_H && p.y > h.y - 0.9) {
                respawn(p, ev); ev.hurt = true; p8Bump(); return ev;
            }
        }
    }

    // novelos
    m.spools.forEach((s, i) => {
        if (!p.gotSpools[i] && Math.hypot(p.x - s.x, (p.y + 0.7) - s.y) < SPOOL_R) {
            p.gotSpools[i] = true; p.spools++; ev.collected++;
        }
    });

    // fim da memória → próxima, ou vitória
    if (p.x >= m.goalX && p.onGround) {
        if (p.memIdx < MEMORIES.length - 1) {
            Object.assign(p, freshFor(p.memIdx + 1));
            ev.advanced = true; p8Bump();
        } else {
            p.won = true; ev.won = true; f8WinMemory(); p8Bump();
        }
        return ev;
    }

    if (ev.collected || ev.grabbed || ev.released) p8Bump();
    return ev;
}

/** Posição da laçada presa (pra desenhar o fio), ou null. */
export function activeAnchor(): Vec2 | null {
    return p8.anchor !== null ? curMem().anchors[p8.anchor] : null;
}

/** Linha-objetivo do HUD. */
export function p8Objective(): string {
    if (p8.won) return 'Você se lembrou.';
    return curMem().title;
}
