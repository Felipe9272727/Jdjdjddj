import { describe, expect, it } from 'vitest';
import {
    FLOOR10_CANON, LIMIAR_DE_TROCA, consultaDoCurador, fatoComHisterese,
    fatoDaConversa, pontuarFloor10Canon, retrieveFloor10Canon,
} from '../npc/floor10Canon';
import type { NpcMsg } from '../npc/npcStore';

/**
 * ── POR QUE TROCAR DE FATO CUSTA CARO ────────────────────────────────────
 *
 * O fato do cânone mora perto do começo do prompt; o que vem depois dele —
 * guardas, já-dito e o histórico inteiro — é relido quando ele muda. Medido com
 * o SmolLM3, prompt real, motor da casa, 4 fios:
 *
 *     fato IGUAL ao do turno anterior ... reaproveita 409, relê  24 →  6,5 s
 *     fato DIFERENTE ................... reaproveita 310, relê 338 → 40,2 s
 *
 * A histerese existe para pagar esse preço menos vezes — e NUNCA à custa de
 * responder com o assunto errado, que é o que os dois primeiros testes travam.
 */
const fala = (role: 'user' | 'assistant', content: string): NpcMsg => ({ role, content });

describe('histerese na escolha do fato do cânone', () => {
    it('sem fato anterior, escolhe o melhor — igual à busca de sempre', () => {
        const pergunta = 'o que você fazia antes, qual era sua profissão?';
        expect(fatoComHisterese(pergunta, null)?.id)
            .toBe(retrieveFloor10Canon(pergunta, 1)[0]?.id);
    });

    it('TROCA quando o fato que está no prompt não fala do que foi perguntado', () => {
        // A trava mais importante. Economizar prefill entregando o assunto
        // errado não é ganho: é uma resposta pior, mais rápido.
        const passado = retrieveFloor10Canon('qual era sua profissão antes?', 1)[0];
        const sobreMemoria = 'você lembra do seu nome?';
        const notaDoAntigo = pontuarFloor10Canon(sobreMemoria)
            .find((r) => r.entry.id === passado.id)?.score ?? 0;
        expect(notaDoAntigo).toBe(0);
        expect(fatoComHisterese(sobreMemoria, passado)?.id).not.toBe(passado.id);
    });

    it('FICA no fato anterior quando ele ainda responde, e o novo não é bem melhor', () => {
        // Construído a partir do ranking real, para não depender de eu adivinhar
        // que pergunta empata: pega uma em que o atual pontua e não é o topo por
        // muito.
        const ranking = pontuarFloor10Canon('você lembra do que fazia antes, no seu trabalho?');
        const empatam = ranking.length >= 2 && ranking[0].score < ranking[1].score * LIMIAR_DE_TROCA;
        if (!empatam) return; // o cânone mudou; o caso abaixo deixa de existir
        const segundo = ranking[1].entry;
        expect(fatoComHisterese('você lembra do que fazia antes, no seu trabalho?', segundo)?.id)
            .toBe(segundo.id);
    });

    it('TROCA quando o novo é claramente melhor', () => {
        const ranking = pontuarFloor10Canon('qual era sua profissão antes, no seu emprego?');
        const fraco = FLOOR10_CANON.find((e) => {
            const nota = ranking.find((r) => r.entry.id === e.id)?.score ?? 0;
            return nota > 0 && ranking[0].score >= nota * LIMIAR_DE_TROCA && e.id !== ranking[0].entry.id;
        });
        if (!fraco) return; // nenhum par com essa distância no cânone de hoje
        expect(fatoComHisterese('qual era sua profissão antes, no seu emprego?', fraco)?.id)
            .toBe(ranking[0].entry.id);
    });
});

describe('o fato da conversa não guarda estado escondido', () => {
    it('o mesmo histórico dá sempre o mesmo fato', () => {
        const historico: NpcMsg[] = [
            fala('user', 'oi, quem é você?'),
            fala('assistant', 'Sou Nilo Azevedo.'),
            fala('user', 'você era técnico de quê?'),
            fala('assistant', 'De elevadores.'),
        ];
        const a = fatoDaConversa('e como foi o último dia?', historico);
        const b = fatoDaConversa('e como foi o último dia?', historico);
        expect(a?.id).toBe(b?.id);
    });

    it('duas conversas diferentes não contaminam uma à outra', () => {
        // O motivo de não guardar o fato numa variável de módulo: dois painéis
        // abertos, ou um teste depois do outro, veriam o fato da outra conversa.
        const sobrePassado: NpcMsg[] = [fala('user', 'qual era sua profissão antes?')];
        const sobreMemoria: NpcMsg[] = [fala('user', 'você lembra do seu nome?')];
        const primeiro = fatoDaConversa('e o que mais?', sobrePassado);
        const segundo = fatoDaConversa('e o que mais?', sobreMemoria);
        const denovo = fatoDaConversa('e o que mais?', sobrePassado);
        expect(denovo?.id).toBe(primeiro?.id);
        expect(segundo?.id).not.toBe(undefined);
    });

    it('conversa vazia se comporta como a busca de sempre', () => {
        const pergunta = 'quem manda nesse hotel?';
        expect(fatoDaConversa(pergunta, [])?.id)
            .toBe(retrieveFloor10Canon(pergunta, 1)[0]?.id);
    });
});

describe('a consulta do curador não pode encolher sem querer', () => {
    it('leva as DUAS últimas falas do jogador junto com a atual', () => {
        expect(consultaDoCurador('e depois?', ['qual era sua profissão?', 'gostava disso?']))
            .toBe('qual era sua profissão? gostava disso? e depois?');
    });

    it('só as duas últimas, não a conversa inteira', () => {
        expect(consultaDoCurador('e depois?', ['a', 'b', 'c'])).toBe('b c e depois?');
    });

    it('um seguimento curto herda o assunto das falas anteriores', () => {
        // ── A REGRESSÃO QUE ESTE TESTE EXISTE PARA IMPEDIR ────────────────
        //
        // "e o que mais?" não casa palavra-chave nenhuma sozinho. A primeira
        // versão de `fatoDaConversa` pontuava a pergunta pelada, e com isso o
        // curador perderia o assunto no primeiro seguimento curto — além de
        // mudar o PRIMEIRO turno, onde a histerese nem age (375 → 341 tokens
        // lidos foi como o defeito apareceu na bancada).
        const sozinha = retrieveFloor10Canon('e o que mais?', 1)[0];
        const comContexto = retrieveFloor10Canon(
            consultaDoCurador('e o que mais?', ['qual era sua profissão antes?']), 1,
        )[0];
        expect(sozinha).toBeUndefined();
        expect(comContexto).toBeDefined();
    });

    it('o encadeamento usa a mesma consulta que o montador do prompt usa', () => {
        // Sem histórico os dois caminhos têm de dar no mesmo fato: a histerese
        // não tem o que segurar, então qualquer diferença aqui é mudança de
        // comportamento disfarçada.
        for (const pergunta of ['quem manda nesse hotel?', 'qual era sua profissão?', 'oi']) {
            expect(fatoDaConversa(pergunta, [])?.id)
                .toBe(retrieveFloor10Canon(consultaDoCurador(pergunta, []), 1)[0]?.id);
        }
    });
});
