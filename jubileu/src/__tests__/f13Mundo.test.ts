import { describe, expect, it } from 'vitest';
import { CASAS, CASA_CERTA, NPCS, ENTIDADE } from '../f13Lore';
import {
    chaoEm, ILHAS, PONTES, LUGAR_DOS_NPCS, LUGAR_DAS_CASAS, portaDaCasa, OVELHAS, MARTELO, SINO, INICIO,
    novoEstado13, falarCom, pegarMartelo, acharOvelha, tocarSino, entidadeAcorda, baterNaCasa,
} from '../f13Mundo';

describe('f13 — a casa certa só existe juntando as três pistas', () => {
    it('há exatamente uma casa com latão, sem fumaça e com botão', () => {
        expect(CASAS.filter((c) => c.portaDeLatao && !c.fumaca && c.botao)).toHaveLength(1);
        expect(CASA_CERTA).toBeGreaterThanOrEqual(0);
    });
    it('cada pista sozinha aponta para mais de uma casa', () => {
        expect(CASAS.filter((c) => c.portaDeLatao).length).toBeGreaterThan(1);
        expect(CASAS.filter((c) => !c.fumaca).length).toBeGreaterThan(1);
        expect(CASAS.filter((c) => c.botao).length).toBeGreaterThan(1);
    });
    it('duas pistas ainda deixam dúvida (a terceira importa)', () => {
        const par = (f: (c: typeof CASAS[number]) => boolean) => CASAS.filter(f).length;
        expect(par((c) => c.portaDeLatao && !c.fumaca)).toBeGreaterThan(1);
        expect(par((c) => !c.fumaca && c.botao)).toBeGreaterThan(1);
    });
    it('toda casa errada responde alguma coisa', () => {
        CASAS.forEach((c, i) => { if (i !== CASA_CERTA) expect(c.resposta.length).toBeGreaterThan(0); });
    });
});

describe('f13 — dá para andar por tudo que importa', () => {
    const pisavel = (p: { x: number; z: number }) => chaoEm(p.x, p.z) !== null;
    it('início, moradores, itens, portas e ovelhas estão em chão firme', () => {
        expect(pisavel(INICIO)).toBe(true);
        for (const [id, l] of Object.entries(LUGAR_DOS_NPCS)) expect(pisavel(l), id).toBe(true);
        CASAS.forEach((_, i) => expect(pisavel(portaDaCasa(i)), `porta ${i}`).toBe(true));
        OVELHAS.forEach((o, i) => expect(pisavel(o), `ovelha ${i}`).toBe(true));
        expect(pisavel(MARTELO)).toBe(true);
        expect(pisavel(SINO)).toBe(true);
    });
    it('toda ponte liga as duas ilhas sem buraco no meio', () => {
        for (const p of PONTES) {
            const a = ILHAS.find((i) => i.id === p.de)!, b = ILHAS.find((i) => i.id === p.para)!;
            for (let t = 0; t <= 1; t += .02) {
                expect(chaoEm(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), `${p.de}->${p.para} t=${t.toFixed(2)}`).not.toBeNull();
            }
        }
    });
    it('fora das ilhas é céu', () => {
        expect(chaoEm(40, 40)).toBeNull();
        expect(chaoEm(12, 20)).toBeNull();
    });
    it('as casas ficam dentro da ilha de cima', () => {
        for (const l of LUGAR_DAS_CASAS) expect(chaoEm(l.x, l.z)).toBe(3);
    });
});

describe('f13 — conversas, buscas e a entidade', () => {
    it('os três moradores-chave dão as três pistas', () => {
        const e = novoEstado13();
        falarCom(e, 'ragnhild'); falarCom(e, 'ulfgar'); falarCom(e, 'eira');
        expect([...e.pistas].sort()).toEqual(['botao', 'fumaca', 'latao']);
    });
    it('primeira conversa e as seguintes são diferentes', () => {
        const e = novoEstado13();
        expect(falarCom(e, 'ulfgar')).toBe(NPCS.find((n) => n.id === 'ulfgar')!.primeira);
        expect(falarCom(e, 'ulfgar')).toBe(NPCS.find((n) => n.id === 'ulfgar')!.depois);
    });
    it('o martelo: aceitar, achar, entregar — e a entrega dá a pista do latão', () => {
        const e = novoEstado13();
        falarCom(e, 'brokk'); expect(e.buscas.martelo).toBe('ativa');
        pegarMartelo(e); expect(e.buscas.martelo).toBe('pronta');
        falarCom(e, 'brokk'); expect(e.buscas.martelo).toBe('feita');
        expect(e.pistas.has('latao')).toBe(true);
    });
    it('as ovelhas só ficam prontas com as três', () => {
        const e = novoEstado13();
        acharOvelha(e, 0); acharOvelha(e, 2); expect(e.buscas.ovelhas).toBe('nova');
        acharOvelha(e, 1); expect(e.buscas.ovelhas).toBe('pronta');
    });
    it('o sino destrava a história do capitão', () => {
        const e = novoEstado13();
        tocarSino(e); expect(falarCom(e, 'torvald').some((f) => f.texto.includes('GRADE'))).toBe(true);
    });
    it('a entidade só acorda com duas pistas', () => {
        const e = novoEstado13();
        falarCom(e, 'eira'); expect(entidadeAcorda(e)).toBe(false);
        falarCom(e, 'ulfgar'); expect(entidadeAcorda(e)).toBe(true);
    });
    it('a fala da entidade termina cortada, sem ponto final', () => {
        expect(ENTIDADE[ENTIDADE.length - 1].texto).not.toMatch(/[.!?…]$/);
    });
    it('bater na casa certa abre o elevador', () => {
        const e = novoEstado13();
        expect(baterNaCasa(e, CASA_CERTA).certa).toBe(true);
        expect(baterNaCasa(e, (CASA_CERTA + 1) % CASAS.length).certa).toBe(false);
    });
});
