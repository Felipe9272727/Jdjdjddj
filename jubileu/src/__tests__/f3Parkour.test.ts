import { describe, it, expect, beforeEach } from 'vitest';
import {
    reset, platforms, nearestPlatform, respawnPoint, tick, type F3Plat,
} from '../f3Parkour';

describe('f3Parkour — nearestPlatform (rival ground resolution)', () => {
    beforeEach(() => reset());

    it('returns the platform whose center Z is nearest the query', () => {
        for (const probe of [-5, 0, 4, 9, 14, 20]) {
            let best = platforms[0];
            for (const p of platforms) if (Math.abs(p.cz - probe) < Math.abs(best.cz - probe)) best = p;
            const got = nearestPlatform(probe);
            expect(got.topY).toBe(best.topY);
            expect(got.x).toBe(best.x);
        }
    });

    it('resolves a queried platform to ITS OWN height (the anti-float guarantee)', () => {
        // The dizzy "float" bug came from resolving the rival's resting height
        // from a far-ahead target Z instead of its actual Z. Querying any
        // platform's own center must return that platform's surface — so when the
        // rival asks nearestPlatform(its own Z) it gets the ground underfoot, not
        // a platform far up the climb.
        for (let i = 0; i < platforms.length; i += 3) {
            const p = platforms[i];
            expect(nearestPlatform(p.cz).topY).toBe(p.topY);
        }
    });

    it('a far-ahead Z and the rival\'s actual Z map to DIFFERENT heights mid-climb', () => {
        // (so using one in place of the other visibly lifts/sinks the character)
        const backZ = platforms[1].cz;                       // just ahead of the start
        const aheadZ = platforms[platforms.length - 1].cz;   // top of the live pool
        // The climb rises overall, so the far-ahead platform sits higher.
        expect(nearestPlatform(aheadZ).topY).toBeGreaterThan(nearestPlatform(backZ).topY);
    });

    it('falls back to origin when the pool is empty', () => {
        platforms.length = 0;
        expect(nearestPlatform(3)).toEqual({ x: 0, topY: 0 });
        reset();
    });

    it('respawnPoint still lands on a real platform at/behind the player', () => {
        const r = respawnPoint(8);
        expect(Number.isFinite(r.x)).toBe(true);
        expect(r.z).toBeLessThanOrEqual(8 + 1);
    });
});

// ── O CURSO DEIXOU DE SER SORTEIO E VIROU FRASE ──────────────────────────────
//
// Antes toda peça era o mesmo quadrado e todo passo o mesmo sorteio: isso dá
// variedade estatística e nenhuma INTENÇÃO, e um parkour sem intenção cansa
// mesmo sendo diferente a cada passo, porque o jogador nunca reconhece nada.
//
// Agora existe compasso de quatro (apoio, corpo, corpo, acento), existem papéis
// com medidas próprias, e a dificuldade sobe devagar. Estes testes seguram as
// três coisas — e a garantia física do vão continua no agenteSalto.test.ts.
describe('f3Parkour — o desenho do curso', () => {
    /** A subida como ela é jogada: a piscina viva rolando para a frente. */
    const subir = (seed: number, passos = 140): F3Plat[] => {
        reset(seed);
        tick(0, 0);
        const vistos = new Map<number, F3Plat>();
        for (let i = 0; i < passos; i++) {
            tick(i * 0.05 + 0.01, i * 1.6);
            for (const p of platforms) if (!vistos.has(p.id)) vistos.set(p.id, { ...p });
        }
        return [...vistos.values()].sort((a, b) => a.id - b.id);
    };

    it('os quatro papéis aparecem, e o passo comum continua sendo a maioria', () => {
        const conta: Record<string, number> = {};
        for (let seed = 1; seed <= 30; seed++) {
            for (const p of subir(seed)) conta[p.tipo] = (conta[p.tipo] ?? 0) + 1;
        }
        const total = Object.values(conta).reduce((a, b) => a + b, 0);
        for (const papel of ['passo', 'descanso', 'viga', 'ponte']) {
            expect(conta[papel] ?? 0, `faltou ${papel}`).toBeGreaterThan(0);
        }
        // O acento existe para acentuar: se ele virar a norma, não acentua nada.
        expect(conta.passo / total).toBeGreaterThan(0.6);
        expect((conta.viga + conta.ponte) / total).toBeLessThan(0.25);
    });

    it('o acento cai no tempo do compasso, e o respiro no apoio', () => {
        // É isto que faz a escadaria ser LIDA em vez de reagida: o jogador
        // aprende onde a peça diferente vem.
        for (let seed = 1; seed <= 30; seed++) {
            for (const p of subir(seed)) {
                if (p.tipo === 'viga' || p.tipo === 'ponte') {
                    expect(p.id % 4, `semente ${seed}, peça ${p.id}`).toBe(3);
                }
                if (p.tipo === 'descanso') {
                    expect(p.id % 4, `semente ${seed}, peça ${p.id}`).toBe(0);
                }
            }
        }
    });

    it('a escadaria ABRE: o fim exige mais que o começo', () => {
        let vaoComeco = 0, vaoFim = 0, n = 0;
        for (let seed = 1; seed <= 40; seed++) {
            const c = subir(seed);
            const vao = (i: number) => (c[i + 1].cz - c[i + 1].hd) - (c[i].cz + c[i].hd);
            for (let i = 1; i < 9; i++) vaoComeco += vao(i);
            for (let i = c.length - 10; i < c.length - 1; i++) vaoFim += vao(i);
            n += 8;
        }
        expect(vaoFim / n).toBeGreaterThan((vaoComeco / n) * 1.2);
    });

    it('cada papel tem a forma do trabalho dele', () => {
        for (let seed = 1; seed <= 20; seed++) {
            for (const p of subir(seed)) {
                if (p.tipo === 'viga') {
                    expect(p.hw).toBeLessThan(1.0);      // estreita: precisão
                    expect(p.hd).toBeGreaterThan(1.8);   // comprida: corre-se em cima
                }
                if (p.tipo === 'descanso') {
                    expect(p.hw).toBeGreaterThan(2.0);   // larga: dá para parar
                    expect(p.hd).toBeGreaterThan(2.0);
                }
                // Só a ponte se move — o resto do curso é chão firme.
                expect(p.moving).toBe(p.tipo === 'ponte' && p.amp > 0);
            }
        }
    });

    it('a viga e o descanso são PLANOS: uma coisa difícil por vez', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const c = subir(seed);
            for (let i = 1; i < c.length; i++) {
                if (c[i].tipo === 'viga' || c[i].tipo === 'descanso') {
                    expect(c[i].topY, `${c[i].tipo} na peça ${c[i].id}`).toBeCloseTo(c[i - 1].topY, 9);
                }
            }
        }
    });

    it('continua determinístico: a mesma semente, a mesma escadaria', () => {
        const a = subir(1234).map((p) => `${p.tipo}${p.cz.toFixed(4)}${p.topY.toFixed(4)}`);
        const b = subir(1234).map((p) => `${p.tipo}${p.cz.toFixed(4)}${p.topY.toFixed(4)}`);
        expect(a).toEqual(b);
        expect(a.length).toBeGreaterThan(40);
    });
});
