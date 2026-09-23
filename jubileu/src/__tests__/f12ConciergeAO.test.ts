import { describe, expect, it } from 'vitest';
import { conciergeVertices } from '../f12ConciergeMesh';
import { conciergeAO } from '../f12ConciergeAO';
import { createConciergeGeometry } from '../f12ConciergeGeometry';

/**
 * A oclusão do rosto é assada fora do jogo (tools/blender/bake_concierge_ao.py)
 * e casa com a malha pelo índice do vértice. Estes testes são o alarme de que
 * alguém mexeu no rosto e esqueceu de assar de novo — e a prova de que o que
 * está no arquivo é oclusão de verdade, não um preenchimento qualquer.
 */
const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const ao = bytes(conciergeAO);
const geometria = createConciergeGeometry();
const pos = geometria.getAttribute('position');
const nor = geometria.getAttribute('normal');
const cor = geometria.getAttribute('color');

/** Média de `valor` nos vértices que caem em `regiao` (posição e normal já processadas). */
function media(regiao: (x: number, y: number, nz: number) => boolean, valor: (i: number) => number) {
    let soma = 0, n = 0;
    for (let i = 0; i < pos.count; i++) {
        if (!regiao(pos.getX(i), pos.getY(i), nor.getZ(i))) continue;
        soma += valor(i); n++;
    }
    expect(n).toBeGreaterThan(40);
    return soma / n;
}
const orbita = (x: number, y: number) => [-1, 1].some(lado =>
    Math.hypot((x - lado * 1.55) / 1.035, (y - 1.15) / .735) < 1.3);
const nariz = (x: number, y: number, nz: number) => Math.abs(x) < .25 && y > -.2 && y < .8 && nz > .6;
const bochecha = (x: number, y: number, nz: number) =>
    Math.abs(x) > 1.9 && Math.abs(x) < 2.6 && y > -1 && y < .2 && nz > .5;

describe('a luz assada do rosto do concierge', () => {
    it('tem exatamente um byte por vértice do rosto — rosto novo sem bake novo acusa aqui', () => {
        expect(ao.length).toBe(bytes(conciergeVertices).length / 6);
        expect(ao.length).toBe(pos.count);
    });

    it('é oclusão de verdade: órbitas fundas, nariz e bochechas abertos', () => {
        const aoDe = (i: number) => ao[i] / 255;
        const fundo = media(orbita, aoDe);
        expect(fundo).toBeLessThan(.5);
        expect(media(nariz, aoDe)).toBeGreaterThan(.8);
        expect(media(bochecha, aoDe)).toBeGreaterThan(.75);
    });

    it('chega na cor que o material desenha: a órbita sai bem mais escura que o nariz', () => {
        const luz = (i: number) => (cor.getX(i) + cor.getY(i) + cor.getZ(i)) / 3;
        expect(media(orbita, luz)).toBeLessThan(media(nariz, luz) * .6);
        for (let i = 0; i < cor.array.length; i++) {
            expect(cor.array[i]).toBeGreaterThanOrEqual(0);
            expect(cor.array[i]).toBeLessThanOrEqual(1);
        }
    });
});
