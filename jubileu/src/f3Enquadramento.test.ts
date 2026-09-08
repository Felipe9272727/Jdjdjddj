import { describe, it, expect } from 'vitest';
import {
    enquadrar, afastar, ASPECTO_DE_PROJETO, FOV_MAXIMO, RECUO_MAXIMO,
} from './f3Enquadramento';

/** Meia-abertura HORIZONTAL, em tangente. É o que o conserto tem que preservar. */
const meiaHorizontal = (fov: number, aspecto: number) =>
    Math.tan((fov * Math.PI) / 360) * aspecto;

describe('enquadrar', () => {
    it('não toca no plano quando a tela é a de projeto', () => {
        expect(enquadrar(44, ASPECTO_DE_PROJETO)).toEqual({ fov: 44, recuo: 1 });
    });

    it('não toca no plano em telas MAIS largas — elas só ganham cenário', () => {
        for (const a of [1.7, 2.0, 2.35, 3.0]) {
            expect(enquadrar(44, a)).toEqual({ fov: 44, recuo: 1 });
        }
    });

    it('abre a lente em tela mais estreita', () => {
        const r = enquadrar(44, 1.0);
        expect(r.fov).toBeGreaterThan(44);
    });

    it('nunca aproxima a câmera: o recuo é sempre >= 1', () => {
        for (const a of [0.3, 0.45, 0.8, 1.0, 1.6, 2.4]) {
            expect(enquadrar(44, a).recuo).toBeGreaterThanOrEqual(1);
        }
    });

    it('respeita o teto do fov — nada de olho de peixe na cara dele', () => {
        // Celular em pé: 412 x 915.
        const r = enquadrar(44, 412 / 915);
        expect(r.fov).toBeLessThanOrEqual(FOV_MAXIMO);
        expect(r.fov).toBe(FOV_MAXIMO);   // esta tela bate no teto
    });

    it('respeita o teto do recuo', () => {
        // Uma janela ridícula de estreita não pode mandar a câmera para fora do
        // andar: é onde ela atravessaria o cenário no caminho.
        expect(enquadrar(44, 0.05).recuo).toBeLessThanOrEqual(RECUO_MAXIMO);
    });

    it('DEVOLVE o enquadramento horizontal do plano, que é o objetivo todo', () => {
        // Com lente + recuo, a largura aparente do que está no alvo volta ao que
        // era. `recuo` multiplica a distância, então a largura vista no alvo é
        //     meiaHorizontal(fov', aspecto) * recuo
        // e ela tem que bater com a original.
        for (const [fov, aspecto] of [[44, 1.0], [46, 0.75], [42, 0.6]] as const) {
            const alvo = meiaHorizontal(fov, ASPECTO_DE_PROJETO);
            const r = enquadrar(fov, aspecto);
            const obtido = meiaHorizontal(r.fov, aspecto) * r.recuo;
            expect(obtido).toBeCloseTo(alvo, 6);
        }
    });

    it('num celular em pé o conserto CABE nos dois tetos', () => {
        // Este é o caso que motivou o arquivo, então vale o número exato: a
        // lente bate no teto (66) e o recuo fica em 2,21 — abaixo do teto de
        // 2,5. Ou seja o enquadramento volta INTEIRO, sem precisar aparar nada,
        // e sobra margem para telas ainda mais estreitas.
        const r = enquadrar(44, 412 / 915);
        expect(r.fov).toBe(FOV_MAXIMO);
        expect(r.recuo).toBeCloseTo(2.21, 2);
        expect(r.recuo).toBeLessThan(RECUO_MAXIMO);
    });

    // ── Entrada suja não pode virar câmera com NaN ────────────────────────────
    // Uma câmera com NaN não fica torta: ela some, e o andar fica preto. E o
    // aspecto ZERO acontece de verdade — é o primeiro quadro, antes do canvas
    // ter tamanho.
    it('aguenta aspecto zero, negativo e NaN sem devolver NaN', () => {
        for (const a of [0, -1, NaN, Infinity]) {
            const r = enquadrar(44, a);
            expect(Number.isFinite(r.fov)).toBe(true);
            expect(Number.isFinite(r.recuo)).toBe(true);
            expect(r.recuo).toBe(1);
        }
    });

    it('aguenta fov inválido', () => {
        for (const f of [0, -10, NaN]) {
            const r = enquadrar(f, 0.5);
            expect(Number.isFinite(r.fov)).toBe(true);
            expect(r.fov).toBeGreaterThan(0);
        }
    });
});

describe('afastar', () => {
    it('não mexe quando não há recuo', () => {
        const cam = { x: 1, y: 2, z: 3 };
        expect(afastar(cam, { x: 0, y: 0, z: 0 }, 1)).toEqual(cam);
    });

    it('afasta ao longo da linha de visão, mantendo a direção', () => {
        const p = afastar({ x: 0, y: 0, z: 4 }, { x: 0, y: 0, z: 0 }, 2);
        expect(p).toEqual({ x: 0, y: 0, z: 8 });
    });

    it('afasta a partir do alvo, não da origem do mundo', () => {
        const p = afastar({ x: 10, y: 5, z: 4 }, { x: 10, y: 5, z: 2 }, 3);
        expect(p).toEqual({ x: 10, y: 5, z: 8 });
    });

    it('não inventa direção quando a câmera está em cima do alvo', () => {
        const a = { x: 2, y: 2, z: 2 };
        expect(afastar(a, a, 2)).toEqual(a);
    });

    it('devolve objeto novo — o chamador reusa o dele a cada quadro', () => {
        const cam = { x: 1, y: 1, z: 1 };
        const fora = afastar(cam, { x: 0, y: 0, z: 0 }, 2);
        expect(fora).not.toBe(cam);
        expect(cam).toEqual({ x: 1, y: 1, z: 1 });
    });
});
