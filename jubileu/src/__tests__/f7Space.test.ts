import { describe, it, expect, beforeEach } from 'vitest';
import {
    F7_PLATFORMS, F7_STARS, F7_STAR_COUNT, F7_GRAVITY, F7_JUMP, F7_VOID_Y,
    f7State, f7Reset, f7TryCollectStar, f7StarTaken, f7Checkpoint, f7RespawnPoint,
    setOnF7Progress,
} from '../f7Space';

// Física de referência do pulo lunar (mesma matemática do Player.tsx)
const MAX_JUMP_H = (F7_JUMP * F7_JUMP) / (2 * F7_GRAVITY);
const AIR_TIME = (2 * F7_JUMP) / F7_GRAVITY;
const SPEED = 4.0;                                   // SPEED do jogo
const MAX_REACH = SPEED * AIR_TIME;

describe('f7Space — layout das ilhas', () => {
    it('pad inicial cobre a saída do elevador (porta em z=-10, x∈[-1.3,1.3])', () => {
        const start = F7_PLATFORMS[0];
        expect(start.topY).toBe(0);
        expect(start.cx - start.hw).toBeLessThanOrEqual(-1.3);
        expect(start.cx + start.hw).toBeGreaterThanOrEqual(1.3);
        expect(start.cz - start.hd).toBeLessThanOrEqual(-9.0);
    });

    it('TODO salto consecutivo é possível com a física lunar (com folga)', () => {
        for (let i = 1; i < F7_PLATFORMS.length; i++) {
            const a = F7_PLATFORMS[i - 1], b = F7_PLATFORMS[i];
            const rise = b.topY - a.topY;
            // subida: bem abaixo da altura máxima do pulo
            expect(rise).toBeLessThanOrEqual(MAX_JUMP_H - 0.6);
            // distância horizontal borda-a-borda: dentro do alcance com folga
            const dx = Math.max(0, Math.abs(b.cx - a.cx) - a.hw - b.hw);
            const dz = Math.max(0, Math.abs(b.cz - a.cz) - a.hd - b.hd);
            const gap = Math.hypot(dx, dz);
            expect(gap).toBeLessThanOrEqual(MAX_REACH * 0.75);
        }
    });

    it('o percurso sobe sempre (nunca desce) e termina acima do vazio', () => {
        for (let i = 1; i < F7_PLATFORMS.length; i++) {
            expect(F7_PLATFORMS[i].topY).toBeGreaterThanOrEqual(F7_PLATFORMS[i - 1].topY);
        }
        expect(F7_VOID_Y).toBeLessThan(0);
    });
});

describe('f7Space — estrelas', () => {
    it('são 7, cada uma flutuando sobre a própria plataforma-âncora', () => {
        expect(F7_STARS).toHaveLength(F7_STAR_COUNT);
        expect(F7_STAR_COUNT).toBe(7);
        for (const st of F7_STARS) {
            const anchor = F7_PLATFORMS.find((p) =>
                Math.abs(p.cx - st.x) < 0.01 && Math.abs(p.cz - st.z) < 0.01);
            expect(anchor).toBeDefined();
            expect(st.y).toBeCloseTo(anchor!.topY + 1.2);
        }
    });
});

describe('f7Space — estado compartilhado', () => {
    beforeEach(() => {
        f7Reset();
        setOnF7Progress(null);
    });

    it('coleta em pé na plataforma-âncora funciona; longe, não', () => {
        const st = F7_STARS[0];
        const anchor = F7_PLATFORMS.find((p) => Math.abs(p.cx - st.x) < 0.01 && Math.abs(p.cz - st.z) < 0.01)!;
        expect(f7TryCollectStar(st.x + 0.4, anchor.topY, st.z)).toBe(st.id);
        expect(f7State.stars).toBe(1);
        expect(f7StarTaken(st.id)).toBe(true);
        expect(f7TryCollectStar(st.x, anchor.topY, st.z)).toBe(-1);      // já pega
        expect(f7TryCollectStar(st.x, anchor.topY - 8, st.z)).toBe(-1);  // muito abaixo
    });

    it('7 estrelas → won, com notificação a cada coleta', () => {
        let calls = 0;
        setOnF7Progress(() => { calls++; });
        for (const st of F7_STARS) {
            expect(f7TryCollectStar(st.x, st.y - 1, st.z)).toBe(st.id);
        }
        expect(calls).toBe(7);
        expect(f7State.stars).toBe(7);
        expect(f7State.won).toBe(true);
    });

    it('respawn volta pro último checkpoint pisado', () => {
        f7Checkpoint.current = 5;
        const rp = f7RespawnPoint();
        expect(rp.x).toBe(F7_PLATFORMS[5].cx);
        expect(rp.z).toBe(F7_PLATFORMS[5].cz);
        expect(rp.y).toBeCloseTo(F7_PLATFORMS[5].topY + 0.1);
        // índice fora do range é clampado (nunca explode)
        f7Checkpoint.current = 999;
        expect(f7RespawnPoint().x).toBe(F7_PLATFORMS[F7_PLATFORMS.length - 1].cx);
    });

    it('f7Reset zera estrelas, vitória e checkpoint', () => {
        const st = F7_STARS[1];
        f7TryCollectStar(st.x, st.y - 1, st.z);
        f7Checkpoint.current = 9;
        f7Reset();
        expect(f7State.stars).toBe(0);
        expect(f7State.won).toBe(false);
        expect(f7StarTaken(st.id)).toBe(false);
        expect(f7Checkpoint.current).toBe(0);
    });
});
