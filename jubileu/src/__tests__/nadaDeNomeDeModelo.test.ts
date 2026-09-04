import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ── NENHUM NOME DE MODELO NA TELA DE QUEM VEIO JOGAR ─────────────────────
 *
 * Reclamação do dono do jogo, palavra por palavra: a tela de carregamento
 * "parece algo dev-only". Ela foi limpa — e um texto ficou para trás, escondido
 * atrás da condição de histórico vazio, que é justamente a PRIMEIRA coisa que o
 * jogador lê ao abrir a conversa:
 *
 *     "Vontade atual: … . Conversa usa o SmolLM3-3B; olhos, vontade e
 *      deliberação seguem por conta própria."
 *
 * Nome do modelo mais três subsistemas internos. Passou pela limpeza da barra
 * porque não estava na barra.
 *
 * Este teste existe porque a limpeza é fácil de desfazer sem querer: a próxima
 * troca de modelo de fala mexe em `FLOOR10_MODEL.label`, e quem estiver com
 * pressa reintroduz o nome numa string de interface sem perceber.
 */
const NOMES_DE_MODELO = [
    'SmolLM3', 'granite', 'embeddinggemma', 'mpnet', 'Qwen3', 'LFM2', 'Gemma 3',
];

describe('a interface do jogo não nomeia modelo', () => {
    const fonte = readFileSync(new URL('../Floor10NpcChat.tsx', import.meta.url), 'utf8');

    it('nenhum nome de modelo aparece escrito à mão numa string de tela', () => {
        // Comentários são onde as lições moram: eles CITAM os nomes de
        // propósito, e proibir isso empurraria contra documentar. A varredura
        // olha o código.
        const semComentario = fonte
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        for (const nome of NOMES_DE_MODELO) {
            expect(semComentario, `"${nome}" escrito na interface`).not.toContain(nome);
        }
    });

    it('quando o rótulo do modelo aparece, é atrás da bancada', () => {
        // `FLOOR10_MODEL.label` continua na tela — é informação boa para quem
        // está medindo. O que ele não pode é aparecer para quem veio jogar.
        const usos = [...fonte.matchAll(/FLOOR10_MODEL\.label/g)];
        expect(usos.length).toBeGreaterThan(0);
        for (const uso of usos) {
            const antes = fonte.slice(Math.max(0, uso.index! - 400), uso.index!);
            expect(antes, 'FLOOR10_MODEL.label sem guarda de bancada por perto')
                .toMatch(/bancadaLigada\(\)|mostrarNumeros/);
        }
    });
});
