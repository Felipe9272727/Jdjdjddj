import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    FRASES_ATE_DISCURSO,
    inventouDetalhe,
    motivoDaReprovacao,
    provarAlucinacao,
    reprovou,
    respondeuEmOutraLingua,
} from '../npc/floor10Alucinacao';

// ── AS PROVAS SÃO COBRADAS COM AS FALAS QUE JÁ APARECERAM NA TELA ─────────
//
// Nenhum caso aqui é inventado por mim: cada um é uma frase que o dono do jogo
// fotografou, ou o oposto exato dela. Uma prova de alucinação calibrada em
// exemplos imaginários mede a minha imaginação, não o modelo.

describe('a prova do cânone', () => {
    it('pega a troca de identidade da foto', () => {
        const troca = 'Você é Nilo Azevedo, um ex-técnico de elevadores, agora um '
            + 'hóspede preso no 10º andar.';
        expect(provarAlucinacao(troca, 'quem sou eu?').canone).toBe(true);
    });

    it('pega o hotel acabando', () => {
        expect(provarAlucinacao(
            'O The Normal Elevator parece estar prestes a encerrar.',
            'esse hotel vai acabar?',
        ).canone).toBe(true);
    });

    it('e deixa passar a apresentação correta', () => {
        const certa = 'Sou Nilo Azevedo, ex-técnico de elevadores, preso no 10º andar.';
        const prova = provarAlucinacao(certa, 'quem é você?');
        expect(prova.canone).toBe(false);
        expect(reprovou(prova)).toBe(false);
    });
});

describe('a prova da língua', () => {
    it('pega um rascunhador que respondeu em inglês', () => {
        // O risco concreto do padrão de hoje: o SmolLM2-135M é treinado em
        // inglês, e nenhuma regra de cânone pega uma fala perfeita na língua
        // errada.
        expect(respondeuEmOutraLingua(
            "I don't know why I'm here, but this hotel is not what it seems.",
        )).toBe(true);
    });

    it('não confunde o nome do hotel com fala em inglês', () => {
        // "The Normal Elevator" é cânone e é inglês. Uma prova ingênua
        // reprovaria toda fala que menciona o hotel — ou seja, quase todas.
        expect(respondeuEmOutraLingua(
            'Estou preso no 10º andar do hotel The Normal Elevator, e não sei por quê.',
        )).toBe(false);
    });

    it('não julga fala curta demais para ter marca', () => {
        // "Tudo bem?" não tem palavra funcional suficiente para decidir nada, e
        // chutar aqui seria pior que calar.
        expect(respondeuEmOutraLingua('Tudo bem.')).toBe(false);
        expect(respondeuEmOutraLingua('Sim.')).toBe(false);
    });
});

describe('a prova do tamanho', () => {
    it('pega o modelo pequeno que discursa', () => {
        // Discurso não é só feio: a 1 token por segundo ele é o custo que este
        // desenho inteiro existe para cortar.
        const discurso = Array.from(
            { length: FRASES_ATE_DISCURSO + 2 },
            (_, i) => `Esta é a frase número ${i + 1} de um discurso.`,
        ).join(' ');
        expect(provarAlucinacao(discurso, 'tudo bem?').discursou).toBe(true);
    });

    it('e deixa passar as duas ou três frases que a persona pede', () => {
        expect(provarAlucinacao(
            'Sou Nilo. Estou preso aqui há tempo demais.',
            'quem é você?',
        ).discursou).toBe(false);
    });
});

describe('a prova do detalhe inventado', () => {
    it('acha número que ninguém deu', () => {
        expect(inventouDetalhe('Estou na sala 417 desde 1998.', '')).toContain('417');
        expect(inventouDetalhe('Estou na sala 417 desde 1998.', '')).toContain('1998');
    });

    it('NÃO acusa "10º andar" — o fato mais canônico que ele tem', () => {
        // ── ACHADO RODANDO ───────────────────────────────────────────────
        //
        // A primeira versão marcava "inventou: 10" na fala "Estou preso no 10º
        // andar há tempo demais" — a verdade central do personagem. Uma prova
        // que reprova isso reprova todo candidato, sempre, e faz a tabela
        // inteira dizer a mesma coisa errada.
        expect(inventouDetalhe('Estou preso no 10º andar há tempo demais.', ''))
            .toEqual([]);
        // E o número solto continua sendo pego.
        expect(inventouDetalhe('Estou preso na sala 10 há tempo demais.', ''))
            .toContain('10');
    });

    it('deixa passar o que o cânone entregou neste turno', () => {
        // Só o que o modelo PODIA saber conta como sabido. O cânone completo
        // não vale: se o fato não entrou no prompt, acertá-lo foi sorte.
        expect(inventouDetalhe(
            'Tenho 29 anos e estou no 10º andar.',
            'Nilo tem 29 anos e está preso no 10º andar.',
        )).toEqual([]);
    });

    it('acha nome próprio no meio da frase, e não no começo', () => {
        // Toda frase começa em maiúscula; contar a primeira palavra faria a
        // prova acusar praticamente tudo.
        expect(inventouDetalhe('Ontem eu vi o Marcelo no corredor.', ''))
            .toEqual(['Marcelo']);
        expect(inventouDetalhe('Ontem eu vi alguém no corredor.', '')).toEqual([]);
    });

    it('e o nome do próprio NPC nunca conta como invenção', () => {
        expect(inventouDetalhe('Eu sou o Nilo Azevedo, se é que ainda sou.', ''))
            .toEqual([]);
    });

    it('sem `lookbehind` — a regra que eu já quebrei uma vez', () => {
        // `lookbehind` é erro de SINTAXE em Safari antigo: derruba o pacote
        // inteiro, não a função. A primeira versão desta prova usava
        // `(?<![.!?…]\\s)` e teria passado em tudo aqui e quebrado no aparelho
        // do dono do jogo. Este teste lê o fonte porque o defeito é de sintaxe
        // do OUTRO navegador, e não de comportamento neste.
        const texto = readFileSync(new URL('../npc/floor10Alucinacao.ts', import.meta.url), 'utf8');
        const codigo = texto.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        expect(codigo).not.toMatch(/\(\?<[=!]/);
    });
});

describe('o veredito de uma linha', () => {
    it('a heurística de invenção NÃO reprova sozinha', () => {
        // Ela erra para os dois lados. Uma heurística reprovando um candidato
        // numa tabela de comparação decide errado com cara de rigor.
        const prova = provarAlucinacao(
            'Sou Nilo. O corredor tem uma porta no fim.',
            'o que você vê?',
        );
        const so = { ...prova, inventados: ['Marcelo'], canone: false, idiomaErrado: false, issueDoJogo: null };
        expect(reprovou(so)).toBe(false);
        // …mas aparece no motivo, para quem lê.
        expect(motivoDaReprovacao(so)).toContain('inventou: Marcelo');
    });

    it('e o motivo junta tudo o que deu errado', () => {
        const ruim = provarAlucinacao(
            "You are Nilo Azevedo, and I don't know what this is.",
            'quem sou eu?',
        );
        expect(reprovou(ruim)).toBe(true);
        const motivo = motivoDaReprovacao(ruim);
        expect(motivo).toContain('cânone');
        expect(motivo).toContain('língua errada');
    });
});
