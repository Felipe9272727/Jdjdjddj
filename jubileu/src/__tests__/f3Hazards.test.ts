import { describe, it, expect, beforeEach } from 'vitest';
import { reset as resetParkour, platforms } from '../f3Parkour';
import {
    resetHazards, registerJump, hazards, brushes, f3Progress,
    hazardBox, hazardKnockback, tickHazards, isDizzy,
    f3DevilPos, f3DevilPosValid, devilStageBase,
    silhuetaDoEspinho, BOIL_HZ, BOIL_AMP,
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
        const medidos: { hd: number; cai: boolean }[] = [];
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
                    const cai = box.z0 - 1.3 < plat.cz - plat.hd;
                    if (cai) cairiamNoVazio += 1;
                    medidos.push({ hd: plat.hd, cai });
                    expect(box.zSeguro, `semente ${seed}, hd=${plat.hd}`)
                        .toBeGreaterThanOrEqual(plat.cz - plat.hd);
                    expect(box.zSeguro).toBeLessThanOrEqual(plat.cz + plat.hd);
                    expect(box.zSeguro).toBeLessThan(box.z0);   // e atrás da tira
                }
            }
        }
        // A REGRA NÃO É VAZIA — E DÁ PARA DIZER EXATAMENTE QUANDO ELA MORDE.
        //
        // `z0 − 1,3 < cz − hd` sai da própria geometria da tira: com
        // `z0 = cz + 0,425·hd − 0,28`, a conta vira `1,425·hd < 1,58`, ou seja
        // hd < 1,11. Só o deck mais raso do gerador (hd = 1,0) cai — e cai
        // SEMPRE. Medido: 9 de 9 em hd=1,0; 0 de 41 em hd ≥ 1,2.
        //
        // (Este teste já afirmou `> 0,5` do total. Passou a falhar quando as
        // armadilhas deixaram de cair em PONTE — que é rasa — e foram para
        // decks mais fundos. O número era um retrato do sorteio, não da regra;
        // a relação abaixo é a regra.)
        expect(total).toBeGreaterThan(20);
        expect(cairiamNoVazio).toBeGreaterThan(0);
        for (const { hd, cai } of medidos) {
            if (cai) expect(hd, 'só deck raso precisa da trava').toBeLessThan(1.11);
            else expect(hd, 'deck fundo nunca precisou dela').toBeGreaterThanOrEqual(1.11);
        }
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

// ── A SILHUETA DESENHADA À MÃO ───────────────────────────────────────────────
// Os espinhos eram cinco cones idênticos, igualmente espaçados, perfeitamente
// em pé — um obstáculo de video-game num andar que quer parecer desenhado a
// pincel. Estes testes prendem as duas propriedades que fazem a diferença: cada
// dente é diferente dos outros, e a linha NUNCA fica parada.
describe('silhuetaDoEspinho — a mão que treme', () => {
    it('é determinística: a mesma armadilha desenha a mesma silhueta', () => {
        const a = silhuetaDoEspinho(7, 2, 1.234);
        const b = silhuetaDoEspinho(7, 2, 1.234);
        expect(a).toEqual(b);
    });

    it('nenhum dente sai igual ao vizinho', () => {
        const t = 0;
        const vistos = new Set<string>();
        for (let i = 0; i < 5; i++) {
            const s = silhuetaDoEspinho(3, i, t);
            vistos.add(`${s.alto.toFixed(4)}|${s.largo.toFixed(4)}|${s.torto.toFixed(4)}`);
        }
        expect(vistos.size).toBe(5);
    });

    it('duas armadilhas não desenham a mesma fileira', () => {
        const uma = Array.from({ length: 5 }, (_, i) => silhuetaDoEspinho(1, i, 0).alto);
        const outra = Array.from({ length: 5 }, (_, i) => silhuetaDoEspinho(2, i, 0).alto);
        expect(uma).not.toEqual(outra);
    });

    it('fica dentro dos limites: nada de dente invertido nem deitado', () => {
        for (let id = 1; id <= 12; id++) {
            for (let i = 0; i < 5; i++) {
                for (let q = 0; q < 40; q++) {
                    const s = silhuetaDoEspinho(id, i, q / BOIL_HZ);
                    expect(s.alto).toBeGreaterThan(0.5);       // sempre em pé
                    expect(s.alto).toBeLessThan(1.4);
                    expect(s.largo).toBeGreaterThan(0.5);
                    expect(s.largo).toBeLessThan(1.3);
                    expect(Math.abs(s.torto)).toBeLessThan(0.2);   // ~11°: torto, não caído
                    expect(Math.abs(s.desvio)).toBeLessThan(0.06); // não sai da tira
                    expect(Math.abs(s.ferve)).toBeLessThanOrEqual(BOIL_AMP / 2);
                }
            }
        }
    });

    // O FERVILHAR É O PONTO. Se a silhueta deslizasse suave ela seria animação
    // de computador; o que faz parecer tinta é ela SALTAR ~8× por segundo — e
    // ficar parada entre um salto e outro.
    it('ferve em degraus de ~8 Hz, e não desliza', () => {
        const dentro = [0.02, 0.06, 0.10].map((d) => silhuetaDoEspinho(5, 1, 1 / BOIL_HZ + d).ferve);
        expect(new Set(dentro.map((v) => v.toFixed(9))).size).toBe(1);   // parado no degrau

        let saltos = 0;
        let anterior = silhuetaDoEspinho(5, 1, 0).ferve;
        for (let q = 1; q <= 16; q++) {
            const agora = silhuetaDoEspinho(5, 1, q / BOIL_HZ).ferve;
            if (agora !== anterior) saltos += 1;
            anterior = agora;
        }
        expect(saltos).toBe(16);          // um salto por degrau, sem repetir
    });
});
