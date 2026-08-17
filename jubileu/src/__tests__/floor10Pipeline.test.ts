import { describe, it, expect, vi } from 'vitest';
import {
    falarPeloPipeline, limparFrase, enumerarEmIngles, pipelineLigado,
    type PecasDoPipeline,
} from '../npc/floor10Pipeline';

/**
 * A ORQUESTRAÇÃO do pipeline, testada sem baixar 1 GB.
 *
 * As peças entram por parâmetro justamente para isto: o que precisa ser
 * protegido é a ORDEM (juiz antes da tradução), o comportamento quando cada
 * peça falha, e a regra que me custou 60 segundos numa medição — defeito de
 * forma nunca vai ao revisor.
 */
const pecas = (over: Partial<PecasDoPipeline> = {}): PecasDoPipeline => ({
    rascunhar: async () => 'I am Nilo. The door does not obey me.',
    julgar: async () => [],
    remendar: async () => 'A patched sentence.',
    traduzir: async (t) => `PT<${t}>`,
    ...over,
});

describe('falarPeloPipeline', () => {
    it('caminho feliz: juiz não marca, revisor nem é chamado', () => expect((async () => {
        const remendar = vi.fn(async () => 'nunca');
        const r = await falarPeloPipeline('Who are you?', pecas({ remendar }));
        expect(remendar).not.toHaveBeenCalled();
        expect(r?.marcadas).toBe(0);
        expect(r?.fala).toContain('I am Nilo.');
        return true;
    })()).resolves.toBe(true));

    it('o JUIZ roda ANTES da tradução — é em inglês que ele enxerga', async () => {
        const ordem: string[] = [];
        await falarPeloPipeline('Who are you?', pecas({
            julgar: async (f) => { ordem.push(`julgar:${f[0]}`); return []; },
            traduzir: async (t) => { ordem.push('traduzir'); return t; },
        }));
        // Se a tradução viesse antes, o juiz veria português — onde ele mede
        // 0,29 de contradição contra 0,94 em inglês, no mesmo par de frases.
        expect(ordem[0]).toMatch(/^julgar:I am Nilo/);
        expect(ordem[1]).toBe('traduzir');
    });

    it('remenda SÓ a frase marcada, e conta certo', async () => {
        const r = await falarPeloPipeline('Who are you?', pecas({
            julgar: async () => [2],
            remendar: async () => 'It never opens.',
        }));
        expect(r?.marcadas).toBe(1);
        expect(r?.remendadas).toBe(1);
        expect(r?.fala).toContain('I am Nilo.');
        expect(r?.fala).toContain('It never opens.');
        expect(r?.fala).not.toContain('does not obey');
    });

    it('remendo que devolve a MESMA frase não conta como troca', async () => {
        // Foi o que o SmolLM3 fez em 2 de 3: devolveu a frase intacta com
        // "(No correction needed)". Contar isso como conserto inflaria o placar
        // e esconderia que o revisor não serve para o posto.
        const r = await falarPeloPipeline('Who are you?', pecas({
            julgar: async () => [1],
            remendar: async () => 'I am Nilo.',
        }));
        expect(r?.marcadas).toBe(1);
        expect(r?.remendadas).toBe(0);
    });

    it('índice fora da lista é ignorado, não quebra', async () => {
        // O juiz do 3B chegou a apontar a "frase 4" de um rascunho com duas.
        const r = await falarPeloPipeline('Who are you?', pecas({ julgar: async () => [9, 0] }));
        expect(r?.remendadas).toBe(0);
        expect(r?.fala).toBeTruthy();
    });

    it('qualquer peça falhando devolve null — nunca um erro na tela', async () => {
        for (const quebrada of [
            { rascunhar: async () => null },
            { rascunhar: async () => '   ' },
            { traduzir: async () => null },
            { traduzir: async () => '' },
        ] as Partial<PecasDoPipeline>[]) {
            expect(await falarPeloPipeline('Who are you?', pecas(quebrada))).toBeNull();
        }
    });

    it('juiz que falha (lista vazia) deixa o rascunho passar', async () => {
        // Não julgar custa o que já custava; marcar por engano custa ~11,6 s de
        // revisor por fala. O lado certo do erro é deixar passar.
        const r = await falarPeloPipeline('Who are you?', pecas({ julgar: async () => [] }));
        expect(r?.fala).toBeTruthy();
        expect(r?.marcadas).toBe(0);
    });
});

describe('limparFrase — defeito de FORMA nunca vai ao revisor', () => {
    it('tira o rótulo, as aspas e o eco do prompt', () => {
        // Numa medição eu mandei um `"Nilo: "` ao revisor: 60 segundos para
        // tirar um prefixo, e ele devolveu o rótulo de volta. Aquele caso
        // sozinho respondeu por 60 dos 87 segundos do pipeline.
        expect(limparFrase('Nilo: Well, it never comes.').texto).toBe('Well, it never comes.');
        expect(limparFrase('"The door is shut."').texto).toBe('The door is shut.');
        expect(limparFrase("I wait. Nilo's line only, no label.").texto).toBe('I wait.');
    });

    it('avisa quando mexeu, para o placar saber o que foi de graça', () => {
        expect(limparFrase('Nilo: hi').mudou).toBe(true);
        expect(limparFrase('The door is shut.').mudou).toBe(false);
    });
});

describe('enumerarEmIngles', () => {
    it('quebra em frases e limita a 4', () => {
        expect(enumerarEmIngles('One. Two! Three? Four. Five.')).toHaveLength(4);
    });

    it('descarta fragmento curto demais para julgar', () => {
        expect(enumerarEmIngles('I am here. a. Ok.')).not.toContain('a.');
    });
});

describe('pipelineLigado', () => {
    it('DESLIGADO por padrão', () => {
        // ~950 MB de download novo e três modos de falha novos, nada disso
        // medido no aparelho de quem joga. Cinco técnicas já ganharam nesta
        // bancada e perderam lá.
        expect(pipelineLigado('')).toBe(false);
        expect(pipelineLigado('?bancada')).toBe(false);
    });

    it('`?pipeline` liga', () => {
        expect(pipelineLigado('?pipeline')).toBe(true);
        expect(pipelineLigado('?fresh=1&pipeline')).toBe(true);
    });
});
