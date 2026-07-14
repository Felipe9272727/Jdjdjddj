import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    p8, p8Reset, p8JumpToMemory, stepPlayer, groundAt, curMem, activeAnchor, MEMORIES, P8, type Memory,
} from '../f8Platformer';
import { f8, f8Reset } from '../f8Arquivo';

const IDLE = { move: 0, vert: 0, jump: false, grapple: false };

describe('f8Platformer — groundAt (por memória)', () => {
    beforeEach(() => p8Reset());

    it('devolve o topo da plataforma sob x, e null nos vãos', () => {
        const m = curMem();
        for (const l of m.ledges) {
            const mid = (l.x0 + l.x1) / 2;
            expect(groundAt(mid, l.y)).toBe(l.y);
        }
        // entre a 1ª e a 2ª plataforma da memória 1 há um vão largo
        const gapX = (m.ledges[0].x1 + m.ledges[1].x0) / 2;
        expect(groundAt(gapX, 0)).toBeNull();
    });
});

describe('f8Platformer — corrida/pulo/pouso', () => {
    beforeEach(() => p8Reset());

    it('a gravidade puxa pra baixo no ar', () => {
        p8.onGround = false; p8.y = 5; p8.vy = 0;
        stepPlayer({ ...IDLE }, 1 / 60);
        expect(p8.vy).toBeLessThan(0);
    });

    it('pular sai do chão com impulso pra cima', () => {
        p8.onGround = true; p8.y = 0;
        stepPlayer({ ...IDLE, jump: true }, 1 / 60);
        expect(p8.vy).toBeGreaterThan(0);
        expect(p8.onGround).toBe(false);
    });

    it('pousa numa plataforma e grava o chão pro respawn', () => {
        const l = curMem().ledges[0];
        p8.x = (l.x0 + l.x1) / 2; p8.y = l.y + 0.5; p8.vy = -5; p8.onGround = false;
        for (let i = 0; i < 20; i++) stepPlayer({ ...IDLE }, 1 / 60);
        expect(p8.onGround).toBe(true);
        expect(p8.y).toBeCloseTo(l.y, 1);
        expect(p8.lastGroundY).toBeCloseTo(l.y, 1);
    });
});

describe('f8Platformer — o gancho (fisga / pêndulo / solta)', () => {
    beforeEach(() => p8Reset());

    it('segurar o FIO perto de uma laçada fisga', () => {
        const a = curMem().anchors[0];
        p8.x = a.x - 3; p8.y = 0; p8.onGround = true;
        const ev = stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        expect(ev.grabbed).toBe(true);
        expect(p8.anchor).not.toBeNull();
        expect(activeAnchor()).toEqual(a);
    });

    it('não fisga uma laçada fora de alcance', () => {
        const a = curMem().anchors[0];
        p8.x = a.x + 40; p8.y = 0;
        stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        expect(p8.anchor).toBeNull();
    });

    it('preso, o fio nunca estica além do comprimento (pêndulo)', () => {
        const a = curMem().anchors[0];
        p8.x = a.x - 2; p8.y = 0.5; p8.onGround = false;
        stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        const rope = p8.ropeLen;
        for (let i = 0; i < 120; i++) {
            stepPlayer({ ...IDLE, move: 1, grapple: true }, 1 / 60);
            const d = Math.hypot(p8.x - a.x, p8.y - a.y);
            expect(d).toBeLessThanOrEqual(rope + 0.05);
        }
    });

    it('soltar o FIO desprende', () => {
        const a = curMem().anchors[0];
        p8.x = a.x - 2; p8.y = 0.5;
        stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        expect(p8.anchor).not.toBeNull();
        const ev = stepPlayer({ ...IDLE, grapple: false }, 1 / 60);
        expect(ev.released).toBe(true);
        expect(p8.anchor).toBeNull();
    });

    it('pular preso solta com empurrão e NÃO refisga na hora (carência)', () => {
        const a = curMem().anchors[0];
        p8.x = a.x - 2; p8.y = 0.5;
        stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        const ev = stepPlayer({ ...IDLE, grapple: true, jump: true }, 1 / 60);
        expect(ev.jumped).toBe(true);
        expect(p8.anchor).toBeNull();
        // segurando o FIO no frame seguinte, a carência impede refisgar instantâneo
        stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        expect(p8.anchor).toBeNull();
    });
});

describe('f8Platformer — respawn e coleta', () => {
    beforeEach(() => p8Reset());

    it('cair no vão devolve ao último chão pisado', () => {
        p8.lastGroundX = 3; p8.lastGroundY = 0;
        p8.y = P8.VOID_DY - 2;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.respawned).toBe(true);
        expect(p8.x).toBe(3);
        expect(p8.stun).toBeGreaterThan(0);
    });

    it('encostar num fio preto desfaz (respawn + hurt)', () => {
        // a TEMPESTADE (memória 3) tem fios pretos; pula pra ela
        p8JumpToMemory(2);
        const m = curMem();
        const h = m.hazards[0];
        p8.x = h.x; p8.y = h.y + 0.3; p8.onGround = true; p8.stun = 0;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.hurt).toBe(true);
        expect(ev.respawned).toBe(true);
    });

    it('encostar num novelo coleta', () => {
        const s = curMem().spools[0];
        p8.x = s.x; p8.y = s.y - 0.7;
        stepPlayer({ ...IDLE }, 1 / 60);
        expect(p8.gotSpools[0]).toBe(true);
        expect(p8.spools).toBe(1);
    });
});

describe('f8Platformer — os valentões da ESCOLA (stomp)', () => {
    beforeEach(() => { p8Reset(); p8JumpToMemory(1); });   // II. A ESCOLA

    it('o valentão patrulha e inverte nas bordas', () => {
        const def = curMem().enemies[0];
        const e = p8.enemies[0];
        p8.x = -3; p8.y = 0;                       // longe, só observa
        e.x = def.x1 - 0.01; e.dir = 1;
        for (let i = 0; i < 5; i++) stepPlayer({ ...IDLE }, 1 / 60);
        expect(e.dir).toBe(-1);
        expect(e.x).toBeLessThanOrEqual(def.x1);
    });

    it('encostar DE LADO no valentão machuca (respawn)', () => {
        const def = curMem().enemies[0];
        const e = p8.enemies[0];
        p8.x = e.x - 0.3; p8.y = def.y; p8.onGround = true; p8.vy = 0; p8.stun = 0;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.hurt).toBe(true);
        expect(e.dead).toBe(false);
    });

    it('cair EM CIMA desfaz o valentão e quica o player (stomp)', () => {
        const def = curMem().enemies[0];
        const e = p8.enemies[0];
        p8.x = e.x; p8.y = def.y + 0.9; p8.vy = -4; p8.onGround = false; p8.stun = 0;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.stomped).toBe(true);
        expect(e.dead).toBe(true);
        expect(p8.vy).toBeGreaterThan(0);          // o quique
        expect(ev.hurt).toBe(false);
    });

    it('o valentão morto é inofensivo', () => {
        const def = curMem().enemies[0];
        const e = p8.enemies[0];
        e.dead = true;
        p8.x = e.x; p8.y = def.y; p8.onGround = true; p8.stun = 0;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.hurt).toBe(false);
    });
});

describe('f8Platformer — as batidas de história', () => {
    beforeEach(() => p8Reset());

    it('cruzar o x de uma batida mostra a legenda (e não repete)', () => {
        const b = curMem().beats[0];
        p8.x = b.x + 0.1; p8.y = 0; p8.onGround = true;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.beat).toBe(true);
        expect(p8.beatText).toBe(b.text);
        expect(p8.beatIdx).toBe(1);
        // a legenda expira sozinha (5.4s)
        for (let i = 0; i < 400; i++) stepPlayer({ ...IDLE }, 1 / 60);
        expect(p8.beatText).toBeNull();
    });

    it('cada memória carrega sua própria história (beats zerados ao avançar)', () => {
        const m0 = MEMORIES[0];
        p8.x = m0.goalX; p8.y = 0; p8.onGround = true;
        stepPlayer({ ...IDLE }, 1 / 60);
        expect(p8.memIdx).toBe(1);
        expect(p8.beatIdx).toBe(0);
        expect(p8.enemies.length).toBe(MEMORIES[1].enemies.length);
    });
});

describe('f8Platformer — progressão das memórias e vitória', () => {
    beforeEach(() => { p8Reset(); f8Reset(); });

    it('alcançar o fim de uma memória avança pra próxima (do começo dela)', () => {
        const m0 = MEMORIES[0];
        p8.x = m0.goalX; p8.y = 0; p8.onGround = true;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.advanced).toBe(true);
        expect(p8.memIdx).toBe(1);
        expect(p8.x).toBe(MEMORIES[1].startX);
    });

    it('a última memória vence: memoriaRecuperada + flag persistida', () => {
        const setItem = vi.fn();
        vi.stubGlobal('window', { localStorage: { setItem, getItem: () => null } });
        const last = MEMORIES.length - 1;
        p8.memIdx = last;
        const m = MEMORIES[last];
        p8.x = m.goalX; p8.y = 0; p8.onGround = true;
        f8.phase = 'platformer';
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.won).toBe(true);
        expect(p8.won).toBe(true);
        expect(f8.phase).toBe('memoriaRecuperada');
        expect(setItem).toHaveBeenCalledWith('tne_memoria_player', '1');
        vi.unstubAllGlobals();
    });
});

describe('f8Platformer — PROVA: toda memória é atravessável a balanço', () => {
    // Para cada vão entre plataformas consecutivas, existe uma laçada que (a) dá
    // pra fisgar da borda de saída e (b) alcança, no arco do fio, algum ponto da
    // plataforma de chegada. Sem laçada assim = salto impossível.
    function edgeReach(a: { x: number; y: number }, ex: number, ey: number): number {
        return Math.hypot(a.x - ex, a.y - ey);
    }
    function reachesLedge(a: { x: number; y: number }, b: Memory['ledges'][number]): boolean {
        const bx = Math.max(b.x0, Math.min(b.x1, a.x));   // ponto de B mais perto da laçada
        return Math.hypot(a.x - bx, a.y - b.y) <= P8.MAX_ROPE + 0.4;
    }

    it('cada vão de cada memória tem uma laçada que faz a ponte', () => {
        for (const m of MEMORIES) {
            const ls = [...m.ledges].sort((p, q) => p.x0 - q.x0);
            for (let i = 0; i < ls.length - 1; i++) {
                const A = ls[i], B = ls[i + 1];
                if (B.x0 <= A.x1 + 0.5) continue;   // encostadas, sem vão
                const ok = m.anchors.some((a) =>
                    edgeReach(a, A.x1, A.y) <= P8.GRAB_RANGE + 0.4 && reachesLedge(a, B));
                expect(ok, `${m.key}: vão ${A.x1.toFixed(1)}→${B.x0.toFixed(1)} sem laçada`).toBe(true);
            }
        }
    });
});
