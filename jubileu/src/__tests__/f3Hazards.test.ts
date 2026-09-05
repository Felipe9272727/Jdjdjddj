import { describe, it, expect, beforeEach } from 'vitest';
import { reset as resetParkour, platforms } from '../f3Parkour';
import {
    resetHazards, registerJump, hazards, brushes, f3Progress,
    hazardBox, hazardKnockback, tickHazards, isDizzy,
    f3DevilPos, f3DevilPosValid, devilStageBase,
} from '../f3Hazards';

// Drive the sabotage loop deterministically: each call advances the jump tally
// by 10 (one obstacle), passing a fixed playerZ so pickNear has platforms ahead.
function spawnNObstacles(n: number, playerZ = 0): void {
    for (let o = 0; o < n; o++) for (let j = 0; j < 10; j++) registerJump(playerZ);
}

// Array-adjacency of two platform ids in the live pool.
function areNeighbors(idA: number, idB: number): boolean {
    const ia = platforms.findIndex((p) => p.id === idA);
    const ib = platforms.findIndex((p) => p.id === idB);
    return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1;
}

describe('f3Hazards — Floor 3 sabotage loop', () => {
    beforeEach(() => {
        resetParkour();      // rebuild a fresh platform pool
        resetHazards();      // clear hazards/brushes/progress
    });

    describe('resetHazards', () => {
        it('restores needed to 3 even if it was mutated', () => {
            f3Progress.needed = 1;
            resetHazards();
            expect(f3Progress.needed).toBe(3);
        });

        it('clears the devil position back to the sentinel + invalid', () => {
            f3DevilPos.current.set(2, 3, 4);
            f3DevilPosValid.current = true;
            resetHazards();
            expect(f3DevilPosValid.current).toBe(false);
            expect(f3DevilPos.current.z).toBe(14);
        });
    });

    describe('obstacle / brush cadence', () => {
        it('inks one obstacle every 10 jumps', () => {
            spawnNObstacles(3);
            expect(f3Progress.obstacles).toBe(3);
            expect(hazards.length).toBeGreaterThanOrEqual(1);
        });

        it('drops the FIRST brush already on obstacle #1 (teaches the steal)', () => {
            spawnNObstacles(1);
            expect(f3Progress.obstacles).toBe(1);
            expect(brushes.length).toBe(1);
        });

        it('never places a brush on a platform adjacent to a spike (and vice-versa)', () => {
            spawnNObstacles(5);
            for (const h of hazards)
                for (const b of brushes)
                    expect(areNeighbors(h.platId, b.platId)).toBe(false);
        });
    });

    describe('dizzy suppresses sabotage', () => {
        it('does not count jumps while the devil is dazed', () => {
            f3Progress.dizzyUntil = Date.now() + 5000;   // force a daze window
            expect(isDizzy()).toBe(true);
            const before = f3Progress.jumps;
            for (let j = 0; j < 30; j++) registerJump(0);
            expect(f3Progress.jumps).toBe(before);       // tally paused
            expect(hazards.length).toBe(0);              // nothing inked itself
        });
    });

    describe('spike knockback fairness', () => {
        it('only bites a fully-inked strip, shoves clear of the near edge, and is one-shot', () => {
            spawnNObstacles(1);
            const h = hazards[0];
            const box = hazardBox(h)!;
            const insideX = box.x;
            const insideZ = (box.z0 + box.z1) / 2;
            const lowY = box.topY;                       // feet at deck level → below the tips

            // Half-inked strip must NOT hit yet (telegraph window).
            h.reveal = 0.5;
            expect(hazardKnockback(insideX, lowY, insideZ)).toBeNull();

            // Fully inked → it shoves, and clears the player BEHIND the near edge.
            h.reveal = 1;
            const kb = hazardKnockback(insideX, lowY, insideZ);
            expect(kb).not.toBeNull();
            expect(kb!.z).toBeLessThan(box.z0);          // atrás da tira
            expect(kb!.vy).toBeGreaterThan(0);

            // One-shot: a second hit on the same pass (still overlapping) is null.
            expect(hazardKnockback(insideX, lowY, insideZ)).toBeNull();
        });

        it('lets the player pass a strip cleanly when hopping over it (high feet)', () => {
            spawnNObstacles(1);
            const h = hazards[0];
            h.reveal = 1;
            const box = hazardBox(h)!;
            const highY = box.topY + 1.0;                // jumped above the spikes
            expect(hazardKnockback(box.x, highY, (box.z0 + box.z1) / 2)).toBeNull();
        });

        // ── O QUE MACHUCA É O QUE SE VÊ ─────────────────────────────────
        // A caixa ia de `cz − 0,15·hd` a `cz + hd`: 1,15·hd de fundura contra
        // 0,34 m de tira desenhada. Quase 80% do que empurrava o jogador era
        // invisível, e ele levava o tranco a um metro dos espinhos.
        it('a faixa que empurra tem a fundura da tira desenhada, não da plataforma', () => {
            spawnNObstacles(1);
            const h = hazards[0];
            h.reveal = 1;
            const box = hazardBox(h)!;
            const plat = platforms.find((p) => p.id === h.platId)!;
            const fundura = box.z1 - box.z0;
            expect(fundura).toBeCloseTo(0.56, 6);            // a tira tem 0,34 + folga
            expect(fundura).toBeLessThan(plat.hd);           // era 1,15 × hd

            // O ponto que a caixa ANTIGA pegava e o desenho nunca ocupou.
            const zAntigo = plat.cz - plat.hd * 0.1;
            expect(zAntigo).toBeLessThan(box.z0);
            expect(hazardKnockback(box.x, box.topY, zAntigo)).toBeNull();
        });

        // ── UM TRANCO NÃO DÁ PASSE LIVRE ────────────────────────────────
        // O rearme pedia `pz < box.z0 − 1.3`, ESTRITAMENTE menor, e o empurrão
        // largava o jogador exatamente em `box.z0 − 1.3`. Nunca rearmava: quem
        // tomasse um tranco atravessava aquela tira de graça para sempre.
        it('rearma depois do empurrão — a mesma tira morde de novo', () => {
            spawnNObstacles(1);
            const h = hazards[0];
            h.reveal = 1;
            const box = hazardBox(h)!;
            const dentroZ = (box.z0 + box.z1) / 2;

            const primeiro = hazardKnockback(box.x, box.topY, dentroZ);
            expect(primeiro).not.toBeNull();
            expect(h.hit).toBe(true);

            // O jogador fica exatamente onde o empurrão o largou.
            // (Bem no passado, e não 0: `now()` é `performance.now()`, que num
            // worker recém-criado pode valer menos que o próprio tempo de
            // espera — com 0 este teste passava sozinho e falhava na suíte.)
            h.hitAt = -1e6;                                // a espera já passou
            expect(hazardKnockback(box.x, box.topY, primeiro!.z)).toBeNull();
            expect(h.hit).toBe(false);                     // ← rearmou

            const segundo = hazardKnockback(box.x, box.topY, dentroZ);
            expect(segundo).not.toBeNull();
        });
    });

    // ── O CASTIGO NÃO PODE SER O VAZIO ──────────────────────────────────
    // O tranco era `box.z0 - 1.3`, contado só a partir da tira. Numa plataforma
    // de meia-profundidade 1,0 esse ponto fica ATRÁS da borda de trás: raspar
    // num espinho jogava o jogador para fora do convés, e cair não é o castigo
    // por não pular — é o castigo por não chegar.
    it('o empurrão sempre larga o jogador EM CIMA da plataforma', () => {
        let total = 0, cairiamNoVazio = 0;
        for (const seed of [0x9e3779b9, 1, 7, 42, 1337]) {
            resetParkour(seed);
            resetHazards();
            for (let n = 0; n < 4; n++) {
                spawnNObstacles(1);
                for (const h of hazards) {
                    h.reveal = 1;
                    const box = hazardBox(h)!;
                    const plat = platforms.find((p) => p.id === h.platId)!;
                    total += 1;
                    if (box.z0 - 1.3 < plat.cz - plat.hd) cairiamNoVazio += 1;
                    expect(box.zSeguro, `semente ${seed}, hd=${plat.hd}`)
                        .toBeGreaterThanOrEqual(plat.cz - plat.hd);
                    expect(box.zSeguro).toBeLessThanOrEqual(plat.cz + plat.hd);
                    expect(box.zSeguro).toBeLessThan(box.z0);   // e atrás da tira
                }
            }
        }
        // A regra não é vazia: a esmagadora maioria dos trancos cairia fora do
        // convés sem a trava. (Medido: 40 de 50. Com a fórmula ANTIGA da caixa
        // — `cz − 0,15·hd` — a conta dá 0,85·hd < 1,3, ou seja TODOS os hd do
        // gerador {1,0 1,2 1,4} caíam. O ímã do pouso é que escondia isso,
        // puxando o jogador de volta para alguma plataforma.)
        expect(total).toBeGreaterThan(20);
        expect(cairiamNoVazio / total).toBeGreaterThan(0.5);
    });

    describe('devilStageBase fallback', () => {
        it('stages ahead of the player on a real platform (never the sentinel)', () => {
            const s = devilStageBase();
            expect(s.z).toBeGreaterThan(0);              // ahead of playerZ=0
            expect(Number.isFinite(s.x)).toBe(true);
            expect(Number.isFinite(s.y)).toBe(true);
        });
    });
});

// Keep tickHazards referenced (renderer-owned per-frame tick) so a future
// refactor that drops it trips this import rather than silently dead-coding it.
describe('tickHazards', () => {
    // ── O PINCEL ÓRFÃO ──────────────────────────────────────────────────────
    // Só os espinhos eram varridos quando a plataforma reciclava. O pincel
    // ficava na lista para sempre: `brushPos` passava a devolver null, o
    // renderer fazia `continue`, e o grupo congelava no ar na última posição
    // válida — um pincel pendurado no nada, impossível de pegar.
    it('varre o pincel cuja plataforma reciclou, não só o espinho', () => {
        resetParkour();
        resetHazards();
        spawnNObstacles(1);
        expect(brushes.length).toBe(1);
        expect(hazards.length).toBe(1);

        // Recicla para fora TODAS as plataformas que carregam alguma coisa.
        const ocupadas = new Set([...brushes.map((b) => b.platId), ...hazards.map((h) => h.platId)]);
        for (let i = platforms.length - 1; i >= 0; i--) {
            if (ocupadas.has(platforms[i].id)) platforms.splice(i, 1);
        }
        tickHazards(1 / 60);
        expect(brushes.length).toBe(0);
        expect(hazards.length).toBe(0);
    });

    it('advances ink reveal toward 1', () => {
        resetParkour();
        resetHazards();
        for (let j = 0; j < 10; j++) registerJump(0);
        const h = hazards[0];
        h.reveal = 0;
        tickHazards(0.5);
        expect(h.reveal).toBeGreaterThan(0);
    });
});
