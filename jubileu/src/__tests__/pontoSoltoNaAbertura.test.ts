import { describe, expect, it } from 'vitest';
import { arrumarFala } from '../npc/floor10Canon';

/**
 * ── O PONTO SOLTO QUE CHEGAVA NA TELA ────────────────────────────────────
 *
 * Colhido na bancada de qualidade (`bancada-navegador/qualidade-da-fala.mjs`),
 * em três modelos diferentes e nas duas rodadas — ou seja, não é mania de um
 * modelo, é o funil que não aparava.
 */
describe('a fala não começa com pontuação solta', () => {
    it('tira o ponto que sobra do bloco de raciocínio', () => {
        expect(arrumarFala('.Não. Não tenho motivos para sair.'))
            .toBe('Não. Não tenho motivos para sair.');
    });

    it('tira vírgula, dois-pontos e reticências também', () => {
        expect(arrumarFala(',Sim, quero sair daqui.')).toBe('Sim, quero sair daqui.');
        expect(arrumarFala('…Não sei quem manda.')).toBe('Não sei quem manda.');
        expect(arrumarFala(': Não há corredor.')).toBe('Não há corredor.');
    });

    it('o travessão e as aspas continuam abrindo fala', () => {
        // Duas aberturas legítimas: apará-las estragaria o que já está certo.
        expect(arrumarFala('— Não sei.')).toBe('— Não sei.');
        expect(arrumarFala('"Não sei", eu disse.')).toBe('"Não sei", eu disse.');
    });

    it('não mexe no que já começa bem', () => {
        expect(arrumarFala('Sou Nilo Azevedo, hóspede preso no 10º andar.'))
            .toBe('Sou Nilo Azevedo, hóspede preso no 10º andar.');
    });

    it('uma fala que era SÓ pontuação não vira exceção', () => {
        expect(arrumarFala('...')).toBe('');
        expect(arrumarFala('')).toBe('');
    });
});
