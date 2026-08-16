import { describe, it, expect } from 'vitest';
import { bolhaDeEspera } from '../npc/npcStore';

/**
 * O RELÓGIO DA BOLHA DE ESPERA — a regressão que o dono do jogo pegou jogando.
 *
 * Print dele, primeira partida com o pipeline de rascunho ligado:
 *
 *   "antes, era pensando, e o quanto tempo ele demorava, agr só fica
 *    'rascunhando...' E isso é um problema grave"
 *
 * A causa era `{st.streaming || 'Pensando localmente… Ns'}`: o pipeline escrevia
 * o nome da etapa DENTRO de `streaming`, o `||` via string cheia, e o contador
 * desaparecia. Ele ficou ~150s olhando um rótulo parado sem ter como saber se
 * o jogo trabalhava ou tinha travado.
 *
 * Estes testes travam a regra nas três formas, para que a próxima etapa que
 * alguém acrescentar ao pipeline não apague o relógio de novo.
 */
describe('bolhaDeEspera', () => {
    it('sem etapa e sem texto: o rótulo antigo, COM o relógio', () => {
        expect(bolhaDeEspera('', '', 41)).toBe('Pensando localmente… 41s');
    });

    it('com etapa: a etapa E o relógio — nunca a etapa sozinha', () => {
        const saida = bolhaDeEspera('', 'rascunhando…', 41);
        expect(saida).toContain('rascunhando…');
        expect(saida).toContain('41s');
    });

    it('TODA etapa do pipeline mantém o relógio', () => {
        // Os três rótulos que o motor escreve hoje. Se alguém acrescentar um
        // quarto e ele passar por `bolhaDeEspera`, ganha relógio de graça.
        const etapas = [
            'rascunhando…',
            'O SmolLM3-3B está conferindo o rascunho…',
            'O SmolLM3-3B está revisando a consistência…',
        ];
        for (const etapa of etapas) {
            expect(bolhaDeEspera('', etapa, 7)).toMatch(/\b7s$/);
        }
    });

    it('texto do Nilo chegando: mostra o texto e NÃO enfia relógio no meio da fala', () => {
        // Aqui o relógio seria ruído: o texto crescendo já prova que anda, e
        // "…não sairei deste 10º andar. 41s" seria lido como fala do Nilo.
        expect(bolhaDeEspera('Meu nome é Nilo', 'rascunhando…', 41)).toBe('Meu nome é Nilo');
    });

    it('o relógio nunca aparece negativo nem quebrado', () => {
        expect(bolhaDeEspera('', '', -3)).toBe('Pensando localmente… 0s');
        expect(bolhaDeEspera('', '', 12.6)).toBe('Pensando localmente… 13s');
    });
});
