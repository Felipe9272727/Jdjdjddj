import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLOOR10_MODEL } from '../npc/wllamaEngine';
import { FLOOR10_MEMORIA_MODEL } from '../npc/floor10Memoria';
import { FLOOR10_MOTOR_MODEL } from '../npc/floor10MotorBrain';

/**
 * ── `main` É PONTEIRO MÓVEL, E ELE JÁ DERRUBOU O JOGO ────────────────────
 *
 * Do aparelho do dono do jogo, com o SmolLM3 recém-devolvido ao posto:
 *
 *     falhou · 51 MB de 51 MB
 *     Model file not found:
 *     .../SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf
 *
 * A mesma URL respondia 200 da minha caixa no mesmo minuto. Quem publica o
 * repositório pode mexer no `main` a qualquer hora, e o jogo baixa o tradutor
 * inteiro (51 MB) antes de descobrir que a fala sumiu.
 *
 * E não é a primeira vez: `floor10MotorBrain` já trazia um comentário dizendo
 * "revisão fixa: uma mudança futura em `main` não repete o erro que já derrubou
 * o SmolLM3 no celular" — com `main` na linha logo abaixo. **Comentário não
 * pina nada.** É por isso que esta trava é um teste e não um aviso.
 */
const PINADO = /\/resolve\/[0-9a-f]{40}\//;

describe('os modelos do jogo comum têm revisão fixa', () => {
    it('a fala', () => {
        expect(FLOOR10_MODEL.url).toMatch(PINADO);
    });

    it('a memória', () => {
        expect(FLOOR10_MEMORIA_MODEL.url).toMatch(PINADO);
    });

    it('o motor', () => {
        expect(FLOOR10_MOTOR_MODEL.url).toMatch(PINADO);
    });

    it('a vontade — o modelo que a fila realmente baixa', () => {
        // Lido do arquivo porque `floor10Brains` exporta um CATÁLOGO, e o que
        // importa aqui é o padrão do jogo comum.
        const fonte = readFileSync(new URL('../npc/floor10Brains.ts', import.meta.url), 'utf8');
        const lfm = /huggingface\.co\/LiquidAI\/LFM2\.5-1\.2B-Instruct-GGUF\/resolve\/([^/]+)\//
            .exec(fonte);
        expect(lfm?.[1]).toMatch(/^[0-9a-f]{40}$/);
    });

    it('o ajudante de URL EXIGE a revisão — esquecer não pode compilar', () => {
        // A defesa que não depende de ninguém lembrar: se o `HF()` aceitasse
        // dois argumentos, a próxima troca de modelo voltaria para `main` sem
        // que nada reclamasse.
        const fonte = readFileSync(new URL('../npc/wllamaEngine.ts', import.meta.url), 'utf8');
        expect(fonte).toMatch(/const HF = \(repo: string, file: string, sha: string\)/);
        // Sem os COMENTÁRIOS. A primeira versão desta linha reprovava o arquivo
        // por causa do comentário que CITA a mensagem de erro — proibir
        // documentar o defeito é o oposto do que esta trava quer.
        const semComentario = fonte
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        expect(semComentario).not.toMatch(/resolve\/main/);
    });
});
