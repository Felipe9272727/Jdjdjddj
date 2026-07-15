import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    p8, p8Reset, p8JumpToMemory, stepPlayer, groundAt, curMem, activeAnchor, p8BossPrompt, MEMORIES, P8, type Memory,
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

    it('uma queda muito rápida não atravessa a plataforma entre dois frames', () => {
        const l = curMem().ledges[0];
        p8.x = (l.x0 + l.x1) / 2; p8.y = l.y + 1.1; p8.vy = -52; p8.onGround = false;
        const ev = stepPlayer({ ...IDLE }, 0.05);
        expect(ev.landed).toBe(true);
        expect(p8.onGround).toBe(true);
        expect(p8.y).toBe(l.y);
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

    it('respawn descarta ponto temporário expirado e volta para chão permanente', () => {
        p8.lastGroundX = 11; p8.lastGroundY = 4;
        p8.patch = { x: 11, y: 4, t: 0.01 };
        p8.x = 11; p8.y = P8.VOID_DY - 2; p8.onGround = false;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.respawned).toBe(true);
        expect(p8.patch).toBeNull();
        expect(curMem().ledges.some((l) => p8.x >= l.x0 && p8.x <= l.x1 && Math.abs(p8.lastGroundY - l.y) < 0.01)).toBe(true);
        for (let i = 0; i < 80; i++) expect(stepPlayer({ ...IDLE }, 1 / 60).respawned).toBe(false);
    });

    it('checkpoint sobre fio preto é afastado antes do respawn', () => {
        p8JumpToMemory(2);
        const h = curMem().hazards[0];
        p8.lastGroundX = h.x; p8.lastGroundY = h.y;
        p8.x = h.x; p8.y = P8.VOID_DY - 1; p8.onGround = false;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.respawned).toBe(true);
        expect(Math.abs(p8.x - h.x)).toBeGreaterThan(1);
        for (let i = 0; i < 80; i++) expect(stepPlayer({ ...IDLE }, 1 / 60).respawned).toBe(false);
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

    it('cair EM CIMA abre uma costura do nó e quica o player', () => {
        const def = curMem().enemies[0];
        const e = p8.enemies[0];
        const before = e.seams;
        p8.x = e.x; p8.y = def.y + 0.9; p8.vy = -4; p8.onGround = false; p8.stun = 0;
        const ev = stepPlayer({ ...IDLE }, 1 / 60);
        expect(ev.stomped).toBe(true);
        expect(e.dead).toBe(false);                    // stomp sozinho não é mais um ataque genérico
        expect(e.seams).toBe(before - 1);
        expect(e.stunned).toBeGreaterThan(0);          // janela para FIO + AGULHA
        expect(p8.vy).toBeGreaterThan(0);          // o quique
        expect(ev.hurt).toBe(false);
    });

    it('o ciclo completo é atordoar → fisgar → tensionar → descosturar', () => {
        const def = curMem().enemies[0];
        const e = p8.enemies[0];
        p8.x = e.x; p8.y = def.y + 0.9; p8.vy = -4; p8.onGround = false;
        stepPlayer({ ...IDLE }, 1 / 60);               // abre a primeira costura
        p8.x = e.x - 1.4; p8.y = def.y; p8.onGround = true; p8.vy = 0;
        const grabbed = stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        expect(grabbed.grabbed).toBe(true);
        expect(p8.tetherEnemy).toBe(0);
        for (let i = 0; i < 18; i++) stepPlayer({ ...IDLE, move: -1, grapple: true }, 1 / 60);
        const stitched = stepPlayer({ ...IDLE, grapple: true, stitch: true }, 1 / 60);
        expect(stitched.unravelled).toBe(true);
        expect(e.dead).toBe(true);
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

    it('YOURSELF só termina depois das cinco costuras, então persiste a memória', () => {
        const setItem = vi.fn();
        vi.stubGlobal('window', { localStorage: { setItem, getItem: () => null } });
        const last = MEMORIES.length - 1;
        p8JumpToMemory(last);
        f8.phase = 'platformer';
        expect(p8.boss?.seams).toBe(5);
        let final = stepPlayer({ ...IDLE }, 1 / 60);
        for (let i = 0; i < 5; i++) {
            const boss = p8.boss!;
            boss.phase = 'bound'; boss.tethered = true;
            p8.bossTether = true; p8.tension = 1; p8.stitchCd = 0;
            final = stepPlayer({ ...IDLE, grapple: true, stitch: true }, 1 / 60);
            if (i < 4) {
                expect(final.bossSeam).toBe(true);
                stepPlayer({ ...IDLE }, 1 / 60);        // solta a borda do botão
            }
        }
        expect(final.bossWon).toBe(true);
        expect(final.won).toBe(true);
        expect(p8.won).toBe(true);
        expect(f8.phase).toBe('memoriaRecuperada');
        expect(setItem).toHaveBeenCalledWith('tne_memoria_player', '1');
        vi.unstubAllGlobals();
    });
});

describe('f8Platformer — novas operações de crochê', () => {
    beforeEach(() => p8Reset());

    it('AGULHA perto de um rasgo repara ponto por ponto e abre a passagem', () => {
        const gate = curMem().gates[0];
        p8.x = gate.x - 1; p8.y = gate.y; p8.onGround = true;
        for (let i = 0; i < gate.needed; i++) {
            p8.stitchCd = 0;
            const ev = stepPlayer({ ...IDLE, stitch: true }, 1 / 60);
            stepPlayer({ ...IDLE }, 1 / 60);
            if (i === gate.needed - 1) expect(ev.gateRepaired).toBe(true);
        }
        expect(p8.gateProgress[0]).toBe(gate.needed);
    });

    it('AGULHA sem alvo no ar cria um ponto temporário e consome fio', () => {
        p8.x = 4; p8.y = 5; p8.onGround = false; p8.threadCharge = 1;
        stepPlayer({ ...IDLE, stitch: true }, 1 / 60);
        expect(p8.patch).not.toBeNull();
        expect(p8.threadCharge).toBeLessThan(1);
    });

    it('pensamento intrusivo voa e não pode ser eliminado com stomp genérico', () => {
        p8JumpToMemory(1);
        const idx = curMem().enemies.findIndex((e) => e.kind === 'intrusive');
        const e = p8.enemies[idx], def = curMem().enemies[idx];
        const y0 = e.y;
        p8.x = -3; p8.y = 0;
        for (let i = 0; i < 30; i++) stepPlayer({ ...IDLE }, 1 / 60);
        expect(e.y).not.toBeCloseTo(y0, 3);
        expect(def.kind).toBe('intrusive');
        expect(e.dead).toBe(false);
    });

    it('o boss anuncia o golpe e FIO na janela certa abre a costura', () => {
        p8JumpToMemory(4);
        const boss = p8.boss!;
        boss.phase = 'telegraph'; boss.timer = 0.2;
        const ev = stepPlayer({ ...IDLE, grapple: true }, 1 / 60);
        expect(ev.parried).toBe(true);
        expect(boss.phase).toBe('exposed');
    });

    it('o tutorial do boss acompanha as três ações que o motor aceita', () => {
        p8JumpToMemory(4);
        const boss = p8.boss!;
        boss.phase = 'telegraph'; boss.pattern = 0; boss.timer = 1.1;
        expect(p8BossPrompt()).toMatchObject({ step: 1, verb: 'LEIA', ready: false });
        boss.timer = 0.4;
        expect(p8BossPrompt()).toMatchObject({ step: 1, verb: 'REBATA', ready: true });
        boss.phase = 'exposed';
        expect(p8BossPrompt()).toMatchObject({ step: 2, verb: 'FISGUE', ready: true });
        boss.phase = 'bound'; p8.tension = 0.4;
        expect(p8BossPrompt()).toMatchObject({ step: 3, verb: 'TENSIONE', ready: false });
        p8.tension = 0.8;
        expect(p8BossPrompt()).toMatchObject({ step: 3, verb: 'COSTURE', ready: true });
    });

    it('o rasante acerta no chão e pode ser evitado pulando', () => {
        p8JumpToMemory(4);
        let boss = p8.boss!;
        p8.x = 36; p8.y = 0; p8.onGround = true; p8.invuln = 0;
        boss.phase = 'telegraph'; boss.attack = 'sweep'; boss.timer = 0.01;
        expect(stepPlayer({ ...IDLE }, 0.02).hurt).toBe(true);

        p8JumpToMemory(4); boss = p8.boss!;
        p8.x = 36; p8.y = 3; p8.vy = 2; p8.onGround = false; p8.invuln = 0;
        boss.phase = 'telegraph'; boss.attack = 'sweep'; boss.timer = 0.01;
        expect(stepPlayer({ ...IDLE }, 0.02).hurt).toBe(false);
    });

    it('a gaiola acerta a marca antiga, mas erra quem sai dela', () => {
        p8JumpToMemory(4);
        let boss = p8.boss!;
        boss.phase = 'telegraph'; boss.attack = 'cage'; boss.targetX = 30; boss.timer = 0.01;
        p8.x = 30; p8.y = 0; p8.onGround = true; p8.invuln = 0;
        expect(stepPlayer({ ...IDLE }, 0.02).hurt).toBe(true);

        p8JumpToMemory(4); boss = p8.boss!;
        boss.phase = 'telegraph'; boss.attack = 'cage'; boss.targetX = 30; boss.timer = 0.01;
        p8.x = 34; p8.y = 0; p8.onGround = true; p8.invuln = 0;
        expect(stepPlayer({ ...IDLE }, 0.02).hurt).toBe(false);
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
