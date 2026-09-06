import { describe, it, expect } from 'vitest';
import { RodadaDoNilo } from '../npc/floor10Rodada';
describe('respostas atrasadas da vontade', () => {
    it('aceita a decisão vigente da visita atual', () => {
        const r = new RodadaDoNilo(); r.entrar(); const b = r.iniciar(1);
        expect(r.aceitar(b, 1)).toBe(true);
    });
    it('rejeita conclusão depois de desmontar, inclusive depois de remontar', () => {
        const r = new RodadaDoNilo(); r.entrar(); const b = r.iniciar(1);
        r.sair(); expect(r.aceitar(b, 1)).toBe(false);
        r.entrar(); expect(r.aceitar(b, 1)).toBe(false);
        expect(r.aceitar(r.iniciar(1), 1)).toBe(true);
    });
    it('não deixa uma intenção antiga sobrescrever o pedido mais recente', () => {
        const r = new RodadaDoNilo(); r.entrar(); const b = r.iniciar(1);
        expect(r.aceitar(b, 2)).toBe(false);
        const atual = r.iniciar(2);
        expect(r.aceitar(b, 1)).toBe(false);
        expect(r.aceitar(atual, 2)).toBe(true);
    });
});
