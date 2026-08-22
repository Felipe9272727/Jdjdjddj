import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    PERSONA_DO_REVISOR_TREINADO, enunciadoTreinado,
} from '../npc/floor10RevisorTreinado';

// O CORPUS É A FONTE. O modelo foi afinado no formato que este arquivo .mjs
// gera; se o jogo mandar outro, o revisor recebe uma forma que nunca viu e a
// medição de 44/48 deixa de valer. Duas cópias de régua já divergiram hoje —
// esta terceira falha em teste em vez de falhar no aparelho do jogador.
const FONTE = readFileSync('bancada-navegador/corpus/enunciado.mjs', 'utf8');

describe('o enunciado do revisor treinado é o do corpus', () => {
    it('a persona é idêntica, letra por letra', () => {
        const m = FONTE.match(/export const PERSONA = `([\s\S]*?)`;/);
        expect(m).not.toBeNull();
        expect(PERSONA_DO_REVISOR_TREINADO).toBe(m?.[1]);
    });

    it('o turno do usuário é idêntico', () => {
        // Reproduz o `enunciado` do .mjs sem importá-lo: o corpus é um módulo
        // de bancada e não entra no bundle do jogo.
        const q = 'Are you real?';
        const f = 'I am an AI language model.';
        const porque = 'Nilo is a human being and never speaks of AI.';
        const esperado = `The player asked: "${q}"\nWrong line: "${f}"\n`
            + `It is wrong because ${porque}\nCorrected line:`;
        expect(enunciadoTreinado(q, f, porque)).toBe(esperado);
        // E a forma do .mjs continua sendo essa — se alguém mudar lá, cai aqui.
        expect(FONTE).toContain('The player asked: "${String(q).trim()}"');
        expect(FONTE).toContain('Corrected line:');
    });
});
