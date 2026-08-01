import { beforeEach, describe, expect, it } from 'vitest';
import {
    aproveitarResumo,
    blocoDoResumo,
    dobrarConversa,
    GATILHO_RESUMO,
    limparResumo,
    mensagensParaDobrar,
    promptDeResumo,
    quantasCobertas,
    RESUMO_MAX_CHARS,
    resumoDaConversa,
} from '../npc/floor10Compressor';

const conversa = (n: number) => Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: i % 2 === 0 ? `pergunta ${i}` : `resposta ${i}`,
}));

describe('floor10Compressor — o micro dobra a conversa para o 3B ler menos', () => {
    beforeEach(() => limparResumo());

    it('conversa curta não é dobrada: não há o que economizar ainda', async () => {
        const gerou = await dobrarConversa(conversa(GATILHO_RESUMO - 1), 4, async () => 'resumo');
        expect(gerou).toBe(false);
        expect(resumoDaConversa()).toBe('');
    });

    it('dobra só o que o 3B JÁ NÃO LÊ — o resto ele lê palavra por palavra', () => {
        // 10 mensagens, 4 verbatim → as 6 primeiras são candidatas.
        expect(mensagensParaDobrar(conversa(10), 4)).toHaveLength(6);
    });

    it('resume e o resumo entra no prompt', async () => {
        const ok = await dobrarConversa(
            conversa(10), 4,
            async () => 'Ele perguntou do elevador e o Nilo disse que nunca abre.',
        );
        expect(ok).toBe(true);
        expect(blocoDoResumo()).toContain('nunca abre');
        expect(blocoDoResumo()).toContain('JÁ CONVERSARAM');
        expect(quantasCobertas()).toBe(6);
    });

    it('nada de dobrar duas vezes a mesma mensagem', async () => {
        const historia = conversa(10);
        await dobrarConversa(historia, 4, async () => 'primeiro resumo do que houve.');
        expect(mensagensParaDobrar(historia, 4)).toHaveLength(0);
    });

    it('sem resumo, o prompt fica EXATAMENTE como era antes', () => {
        expect(blocoDoResumo()).toBe('');
    });

    it('falha do micro não piora nada: fica o resumo que já existia', async () => {
        await dobrarConversa(conversa(10), 4, async () => 'um resumo bom o bastante.');
        const bom = resumoDaConversa();
        await dobrarConversa(conversa(20), 4, async () => { throw new Error('sem rede'); });
        expect(resumoDaConversa()).toBe(bom);
    });
});

describe('aproveitarResumo — o que volta do 135M precisa passar por uma peneira', () => {
    it('aceita uma frase de verdade', () => {
        expect(aproveitarResumo('  "Falaram sobre o elevador."  ', ''))
            .toBe('Falaram sobre o elevador.');
    });

    it('recusa papagaio da instrução', () => {
        expect(aproveitarResumo('Escreva uma frase curta dizendo o que foi conversado', 'antigo'))
            .toBe('antigo');
    });

    it('recusa texto girando no lugar', () => {
        expect(aproveitarResumo('ele disse ele disse ele disse ele disse', 'antigo'))
            .toBe('antigo');
    });

    it('recusa migalha', () => {
        expect(aproveitarResumo('ok', 'antigo')).toBe('antigo');
    });

    it('corta no teto — resumo comprido perde a graça', () => {
        // Texto longo e VARIADO: repetido cairia (com razão) no detector de
        // texto girando no lugar, e o teste estaria medindo outra coisa.
        const longo = Array.from({ length: 60 }, (_, i) => `assunto${i}`).join(' ');
        expect(aproveitarResumo(longo, '').length).toBe(RESUMO_MAX_CHARS);
    });
});

describe('promptDeResumo — um 135M copia formato, não segue instrução elaborada', () => {
    it('nomeia quem falou e pede UMA frase', () => {
        const p = promptDeResumo('', [{ role: 'user', content: 'cadê a saída?' }]);
        expect(p).toContain('Visitante: cadê a saída?');
        expect(p).toMatch(/UMA frase curta/);
        expect(p).toMatch(/Não invente/);
    });

    it('encadeia o resumo anterior em vez de recomeçar', () => {
        const p = promptDeResumo('já falaram do elevador', [{ role: 'assistant', content: 'não sei' }]);
        expect(p).toContain('Resumo até agora: já falaram do elevador');
        expect(p).toContain('Nilo: não sei');
    });
});
