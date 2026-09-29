import { describe, it, expect } from 'vitest';
import { foraDoTelhado, LUGAR_DAS_CASAS, FORMA_DAS_CASAS, CASA_MEIA, foraDasCasas } from './f13Mundo';

describe('foraDoTelhado', () => {
    it('tira o olho (com 5 cm de sobra onde o beiral de duas casas se encontra) de dentro do beiral, do lado e da frente, de todas as casas', () => {
        for (let i = 0; i < LUGAR_DAS_CASAS.length; i++) {
            const l = LUGAR_DAS_CASAS[i], f = FORMA_DAS_CASAS[i], c = Math.cos(f.giro), s = Math.sin(f.giro);
            for (const [u, v] of [[CASA_MEIA.x * f.escala[0] + .4, 0], [0, CASA_MEIA.z * f.escala[2] + .4], [CASA_MEIA.x * f.escala[0] + .4, CASA_MEIA.z * f.escala[2] + .4]]) {
                // onde a colisão do corpo (folga .38) deixa o hóspede parar
                const corpo = foraDasCasas(l.x + u * c + v * s, l.z - u * s + v * c, .38);
                const olho = foraDoTelhado(corpo.x, l.y + 1.72, corpo.z, .42);
                const dx = olho.x - l.x, dz = olho.z - l.z, U = Math.abs(dx * c - dz * s), V = Math.abs(dx * s + dz * c);
                const fora = U >= (CASA_MEIA.x + .55) * f.escala[0] + .42 - .05 || V >= (CASA_MEIA.z + .45) * f.escala[2] + .42 - .05;
                expect({ i, u, v, fora }).toMatchObject({ fora: true });
            }
        }
    });
    it('não mexe no olho que já está longe', () => {
        expect(foraDoTelhado(0, 1.72, 29, .42)).toEqual({ x: 0, z: 29 });
    });
});
