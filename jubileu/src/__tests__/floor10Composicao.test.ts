import { describe, it, expect } from 'vitest';
import {
    composicaoDaFila, bytesDaFila, pecasEssenciais, smolNaFila,
    smolDisponivelParaBancada, PECA_RASCUNHO, PECA_TRADUTOR,
} from '../npc/floor10Composicao';
import { FLOOR10_TRADUTOR_BYTES } from '../npc/floor10Tradutor';

/**
 * A COMPOSIÇÃO DA FILA — a decisão de quem o jogo baixa.
 *
 * Ela deixou de ser óbvia quando o pipeline entrou, e estes testes travam as
 * três coisas que não podem regredir sem alguém perceber: o SmolLM3 fora da
 * fila do pipeline, o tradutor tratado como essencial, e a conta de bytes.
 */
describe('composicaoDaFila', () => {
    it('sem pipeline, a fila é a de hoje e o SmolLM3 lidera', () => {
        const f = composicaoDaFila('');
        expect(f[0].papel).toBe('fala');
        expect(smolNaFila('')).toBe(true);
    });

    it('COM pipeline, o SmolLM3 sai da fila', () => {
        // Pedido explícito do dono do jogo: "tire o smol da fila, deixe ele só
        // como testagem na bancada".
        expect(smolNaFila('?pipeline')).toBe(false);
        expect(composicaoDaFila('?pipeline').map((p) => p.papel)).not.toContain('fala');
    });

    it('e o rascunhador MoE entra no lugar dele', () => {
        const f = composicaoDaFila('?pipeline');
        expect(f[0]).toBe(PECA_RASCUNHO);
        // 822 MB contra 1,92 GB: quem escreve o primeiro jato é o MoE, a 3,2 s
        // contra 13,4 s do SmolLM3.
        expect(PECA_RASCUNHO.bytes).toBeLessThan(1_000_000_000);
    });

    it('o tradutor vem LOGO DEPOIS do rascunhador, e é essencial', () => {
        // Sem ele não sai português — e, com os dois pares, sem ele nem entra
        // pergunta. É a segunda metade da mesma condição que solta a conversa,
        // e são 51 MB.
        const f = composicaoDaFila('?pipeline');
        expect(f[1]).toBe(PECA_TRADUTOR);
        expect(PECA_TRADUTOR.essencial).toBe(true);
    });

    it('o peso do tradutor é IMPORTADO dele, não copiado aqui', () => {
        // Ele já mudou uma vez sem avisar (o par `pt → en` entrou depois e
        // dobrou o número). Uma cópia teria deixado a barra prometendo 26 MB
        // enquanto a rede baixava 51.
        expect(PECA_TRADUTOR.bytes).toBe(FLOOR10_TRADUTOR_BYTES);
    });

    it('o juiz NÃO é essencial', () => {
        // Sem juiz o rascunho passa direto: perde qualidade, não vira silêncio.
        // Prender a conversa por ele seria trocar um problema por um pior.
        const juiz = composicaoDaFila('?pipeline').find((p) => p.papel === 'juiz');
        expect(juiz?.essencial).toBe(false);
    });

    it('as essenciais são UMA fora do pipeline e DUAS dentro', () => {
        expect(pecasEssenciais('').map((p) => p.papel)).toEqual(['fala']);
        expect(pecasEssenciais('?pipeline').map((p) => p.papel)).toEqual(['rascunho', 'tradutor']);
    });
});

describe('bytesDaFila', () => {
    it('o pipeline baixa QUASE UM GIGA A MENOS', () => {
        const hoje = bytesDaFila('');
        const comPipeline = bytesDaFila('?pipeline');
        expect(comPipeline).toBeLessThan(hoje);
        // 4,28 GB → 3,34 GB. O SmolLM3 de 1,92 GB sai; entram rascunhador
        // (822 MB), juiz (110 MB) e tradutor (51 MB, os dois pares).
        expect(hoje - comPipeline).toBeGreaterThan(900_000_000);
    });

    it('e os totais batem com o que a tela vai prometer', () => {
        expect(bytesDaFila('')).toBe(4_273_849_255);
        expect(bytesDaFila('?pipeline')).toBe(3_341_954_558);
        // A economia, por extenso, para não virar "quase um giga" sem número.
        // Ela encolheu 25.596.942 quando o par `pt → en` entrou — o preço de
        // descobrir que o jogador pergunta em português.
        expect(bytesDaFila('') - bytesDaFila('?pipeline')).toBe(931_894_697);
    });
});

describe('o SmolLM3 fora da fila continua alcançável', () => {
    it('`?mente=smol` e `?bancada` o trazem de volta', () => {
        // Ele é a RÉGUA contra a qual o pipeline foi medido (13,4 s escrevendo
        // a fala inteira). Uma régua que some não serve para medir nada.
        expect(smolDisponivelParaBancada('?mente=smol')).toBe(true);
        expect(smolDisponivelParaBancada('?bancada')).toBe(true);
    });

    it('mas não no jogo comum', () => {
        expect(smolDisponivelParaBancada('')).toBe(false);
        expect(smolDisponivelParaBancada('?pipeline')).toBe(false);
    });
});
