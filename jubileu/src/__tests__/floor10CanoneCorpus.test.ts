import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { quebrasDeCanone, motivoEmIngles } from '../npc/floor10CanoneDoNilo';

/**
 * ── A TERCEIRA CÓPIA DAS REGRAS, E A TERCEIRA TRAVA ───────────────────────
 *
 * `bancada-navegador/corpus/canone.mjs` repete as regras do cânone separadas
 * uma a uma, porque o gerador de destilação precisa escolher UMA regra, pedir
 * ao professor uma frase que a quebre e conferir que quebrou.
 *
 * Cópia sem trava mente: hoje mesmo a cópia da bancada estava mais frouxa que a
 * do jogo em dois pontos (`in A hotel elevator` e `I'm not real` passavam), e o
 * placar foi junto. Este teste passa frases pelas DUAS e exige o mesmo veredito.
 */
const FRASES = [
    'We are in a hotel elevator, on the 10th floor.',
    'No, I am not real.',
    'The hotel is run by the Vance family.',
    'Down the corridor there is a window.',
    'I am here to help you with your questions.',
    'I would advise you to remain calm.',
    'I am an AI language model.',
    'This hotel, Nilo, seems to be a loop.',
    'Corrected line: the door is shut.',
    'I want company at night.',
    'The elevator does not obey me.',
    'I have looked. Many times.',
    'Six steps one way, five the other.',
];

describe('as regras do corpus são as regras do jogo', () => {
    it('dá o mesmo veredito em toda frase de prova', async () => {
        const { QUEBROU } = await import('../../bancada-navegador/corpus/canone.mjs');
        for (const f of FRASES) {
            expect({ f, quebra: QUEBROU(f).length > 0 })
                .toEqual({ f, quebra: quebrasDeCanone(f).length > 0 });
        }
    });

    it('todo motivo do corpus é o motivo do jogo, letra por letra', async () => {
        const { REGRAS_DO_CANONE } = await import('../../bancada-navegador/corpus/canone.mjs');
        for (const r of REGRAS_DO_CANONE) {
            expect({ regra: r.regra, motivo: r.motivo })
                .toEqual({ regra: r.regra, motivo: motivoEmIngles(r.regra) });
        }
    });

    // Uma regra nova no jogo que ninguém copiou para o corpus faria o gerador
    // ensinar um cânone menor do que aquele pelo qual o revisor será cobrado.
    it('nenhuma regra do jogo ficou de fora do corpus', async () => {
        const { REGRAS_DO_CANONE } = await import('../../bancada-navegador/corpus/canone.mjs');
        const noJogo = readFileSync('src/npc/floor10CanoneDoNilo.ts', 'utf8')
            .match(/^ {4}\['([^']+)'/gm)
            ?.map((l) => l.replace(/^ {4}\['/, '').replace(/'$/, '')) ?? [];
        expect(REGRAS_DO_CANONE.map((r) => r.regra).sort()).toEqual([...noJogo].sort());
    });
});
