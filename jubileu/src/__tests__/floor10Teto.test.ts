import { describe, it, expect, vi } from 'vitest';
import { TETO_ESTOUROU, comTeto } from '../npc/floor10Teto';

describe('floor10Teto — a corrida limpa o próprio relógio', () => {
    it('devolve o trabalho quando ele chega primeiro', async () => {
        await expect(comTeto(Promise.resolve('pronto'), 1000)).resolves.toBe('pronto');
    });

    it('devolve o símbolo quando o tempo acaba', async () => {
        const lento = new Promise((r) => { setTimeout(() => r('tarde'), 50); });
        await expect(comTeto(lento, 5)).resolves.toBe(TETO_ESTOUROU);
    });

    it('CANCELA o temporizador quando o trabalho vence — era o vazamento', async () => {
        // ── O DEFEITO ─────────────────────────────────────────────────────
        // O padrão antigo (`Promise.race` com um `setTimeout` solto) resolvia
        // certo e deixava o temporizador ARMADO até o fim do teto, segurando o
        // fecho. Quase inofensivo enquanto só a conversa usava; deixou de ser
        // quando o motor passou a classificar por vetor e `vetorDoTexto` virou
        // uma chamada por rodada de deliberação, para sempre.
        const limpar = vi.spyOn(globalThis, 'clearTimeout');
        const antes = limpar.mock.calls.length;
        await comTeto(Promise.resolve(1), 10_000);
        expect(limpar.mock.calls.length).toBeGreaterThan(antes);
        limpar.mockRestore();
    });

    it('cancela também quando o trabalho LANÇA', async () => {
        // O `finally` cobre os três desfechos. Sem ele, o caminho do erro
        // vazava igual — e é o caminho que mais acontece em rede ruim.
        const limpar = vi.spyOn(globalThis, 'clearTimeout');
        const antes = limpar.mock.calls.length;
        await expect(comTeto(Promise.reject(new Error('caiu')), 10_000)).rejects.toThrow('caiu');
        expect(limpar.mock.calls.length).toBeGreaterThan(antes);
        limpar.mockRestore();
    });

    it('o símbolo distingue "demorou" de "respondeu vazio"', () => {
        // A versão antiga usava `null` para o estouro — e `null` também é uma
        // resposta legítima de várias dessas funções. As duas coisas pedem
        // tratamento diferente.
        expect(TETO_ESTOUROU).not.toBe(null);
        expect(typeof TETO_ESTOUROU).toBe('symbol');
    });
});

describe('floor10Teto — ninguém sobrou com o padrão antigo', () => {
    it('memória e reflexo não têm mais setTimeout solto em corrida', async () => {
        const fs = await import('node:fs/promises');
        for (const nome of ['floor10Memoria.ts', 'floor10Reflexo.ts']) {
            const fonte = await fs.readFile(new URL(`../npc/${nome}`, import.meta.url), 'utf8');
            const soltos = fonte.match(/globalThis\.setTimeout\(\(\) => resolve\(/g) ?? [];
            expect(soltos.length, `${nome} ainda tem corrida com temporizador solto`).toBe(0);
            expect(fonte).toContain('comTeto');
        }
    });
});
