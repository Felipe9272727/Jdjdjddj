import { beforeEach, describe, expect, it } from 'vitest';
import {
    anotar,
    CAIXA_PRETA_TETO,
    eventosDaCaixaPreta,
    formatarEvento,
    limparCaixaPreta,
    relatorioCaixaPreta,
} from '../npc/floor10CaixaPreta';

describe('floor10CaixaPreta — o que faltava para parar de adivinhar', () => {
    beforeEach(() => limparCaixaPreta());

    it('grava o evento com o que aconteceu', () => {
        anotar('vontade:preemptada', { pensado: 142, guardou: true });
        const [evento] = eventosDaCaixaPreta();
        expect(evento.tipo).toBe('vontade:preemptada');
        expect(evento.dados).toEqual({ pensado: 142, guardou: true });
        expect(evento.t).toBeGreaterThanOrEqual(0);
    });

    it('NUNCA CRESCE SEM LIMITE — é um celular apertado, não um servidor', () => {
        for (let i = 0; i < CAIXA_PRETA_TETO + 50; i++) anotar('teste', { i });
        expect(eventosDaCaixaPreta()).toHaveLength(CAIXA_PRETA_TETO);
        // E o que sobra é o FIM, que é onde o defeito acabou de acontecer.
        expect(eventosDaCaixaPreta().at(-1)?.dados?.i).toBe(CAIXA_PRETA_TETO + 49);
    });

    it('campo indefinido não polui a linha', () => {
        anotar('carga', { ms: 12, motivo: undefined });
        expect(eventosDaCaixaPreta()[0].dados).toEqual({ ms: 12 });
    });

    it('arredonda número comprido — 17 casas decimais não ajudam ninguém', () => {
        anotar('tps', { v: 2.333333333333 });
        expect(eventosDaCaixaPreta()[0].dados?.v).toBe(2.33);
    });

    it('anotar nunca lança, aconteça o que acontecer', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => anotar('estranho', circular as never)).not.toThrow();
    });

    it('a linha formatada é legível numa mensagem de celular', () => {
        expect(formatarEvento({ t: 1500, tipo: 'fala:fim', dados: { tps: 2.5, fps: 41 } }))
            .toBe('[   1.5s] fala:fim · tps=2.5 fps=41');
        expect(formatarEvento({ t: 0, tipo: 'vontade:pronta' })).toBe('[   0.0s] vontade:pronta');
    });

    it('o relatório abre dizendo QUAL BUILD é — sem isso os eventos não valem nada', () => {
        anotar('vontade:pensando');
        const texto = relatorioCaixaPreta({ build: 'cf344693d319', nucleos: 8, cotaGB: 12 });
        expect(texto).toContain('cf344693d319');
        expect(texto).toContain('núcleos: 8');
        expect(texto).toContain('12 GB');
        expect(texto).toContain('vontade:pensando');
    });

    it('sem eventos ele diz que não houve Andar 10, em vez de mentir por omissão', () => {
        expect(relatorioCaixaPreta()).toContain('não chegou a rodar');
    });
});
