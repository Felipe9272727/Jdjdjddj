import { describe, expect, it } from 'vitest';
import { CASAS, CASA_CERTA, NPCS, ENTIDADE } from '../f13Lore';
import {
    chaoEm, ILHAS, PONTES, TRECHOS_DAS_PONTES, alturaDoTablado, ESPESSURA_TABUA, LUGAR_DOS_NPCS, LUGAR_DAS_CASAS, portaDaCasa, portaNoMundo, foraDasCasas, OVELHAS, MARTELO, SINO, INICIO,
    novoEstado13, falarCom, pegarMartelo, acharOvelha, tocarSino, entidadeAcorda, baterNaCasa, favorFeito,
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
    it('feet follow the visible deck instead of floating above its sag', () => {
        for (const {a,b} of TRECHOS_DAS_PONTES) {
            const n=Math.floor(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.55);
            for(let i=0;i<n;i++) {
                const t=(i+.5)/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
                if(ILHAS.some(il=>Math.hypot(x-il.x,z-il.z)<=il.r))continue;
                const deck=alturaDoTablado(a.y,b.y,t)+ESPESSURA_TABUA/2;
                expect(chaoEm(x,z)).toBeCloseTo(deck,8);
            }
        }
        const bridge=TRECHOS_DAS_PONTES[1];
        expect(chaoEm((bridge.a.x+bridge.b.x)/2,(bridge.a.z+bridge.b.z)/2)).toBeCloseTo(1.115,3);
    });
    it('fora das ilhas é céu', () => {
        expect(chaoEm(40, 40)).toBeNull();
        expect(chaoEm(12, 20)).toBeNull();
    });
    it('as casas ficam dentro da ilha de cima', () => {
        for (const l of LUGAR_DAS_CASAS) expect(chaoEm(l.x, l.z)).toBe(3);
    });
    it('a casa é um retângulo sólido: o centro é empurrado para fora e o lugar de bater é livre', () => {
        LUGAR_DAS_CASAS.forEach((_, i) => {
            // quem tenta entrar pela porta fechada fica do lado de fora dela
            const p = portaNoMundo(i), dentro = { x: p.x - p.fx * .3, z: p.z - p.fz * .3 };
            const f = foraDasCasas(dentro.x, dentro.z, .38);
            expect((f.x - p.x) * p.fx + (f.z - p.z) * p.fz, `casa ${i}`).toBeGreaterThan(.3);
            const b = portaDaCasa(i), fb = foraDasCasas(b.x, b.z, .38);
            expect(fb.x, `bater ${i}`).toBeCloseTo(b.x, 6); expect(fb.z, `bater ${i}`).toBeCloseTo(b.z, 6);
        });
    });
    it('a porta de verdade fica na frente da casa, virada para o centro da ilha', () => {
        const ilha = ILHAS.find((i) => i.id === 'casas')!;
        LUGAR_DAS_CASAS.forEach((l, i) => {
            const p = portaNoMundo(i);
            expect(chaoEm(p.x, p.z), `porta ${i}`).toBe(3);
            // a direção da porta aponta (quase) para o centro da ilha
            const cx = ilha.x - l.x, cz = ilha.z - l.z, n = Math.hypot(cx, cz);
            expect((p.fx * cx + p.fz * cz) / n, `porta ${i}`).toBeGreaterThan(.98);
        });
    });
});

describe('f13 — conversas, buscas e a entidade', () => {
    it('primeira conversa e as seguintes são diferentes', () => {
        const e = novoEstado13();
        expect(falarCom(e, 'astrid')).toBe(NPCS.find((n) => n.id === 'astrid')!.primeira);
        expect(falarCom(e, 'astrid')).toBe(NPCS.find((n) => n.id === 'astrid')!.depois);
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
    it('a entidade só acorda com duas pistas — e pista só vem com favor pago', () => {
        const e = novoEstado13();
        expect(entidadeAcorda(e)).toBe(false);
        falarCom(e, 'ulfgar'); expect(entidadeAcorda(e)).toBe(false);
        tocarSino(e); falarCom(e, 'ulfgar');            // o sino pagou a pista da fumaça
        expect(e.pistas.has('fumaca')).toBe(true);
        expect(entidadeAcorda(e)).toBe(false);
        falarCom(e, 'brokk'); pegarMartelo(e); falarCom(e, 'brokk');   // e o martelo, a do latão
        expect(e.pistas.has('latao')).toBe(true);
        expect(entidadeAcorda(e)).toBe(true);
    });
    it('a fala da entidade termina cortada, sem ponto final', () => {
        expect(ENTIDADE[ENTIDADE.length - 1].texto).not.toMatch(/[.!?…]$/);
    });
    it('a casa certa só abre com as três pistas', () => {
        const e = novoEstado13();
        expect(baterNaCasa(e, CASA_CERTA).certa).toBe(false);
        e.pistas.add('latao'); e.pistas.add('fumaca');
        expect(baterNaCasa(e, CASA_CERTA).certa).toBe(false);
        e.pistas.add('botao');
        expect(baterNaCasa(e, CASA_CERTA).certa).toBe(true);
        expect(baterNaCasa(e, (CASA_CERTA + 1) % CASAS.length).certa).toBe(false);
    });
});

describe('f13 — o preço em favor: pista nenhuma sai de graça', () => {
    it('sem o favor, o que se ouve é um pedido — e pista nenhuma entra', () => {
        const e = novoEstado13();
        const pedidos: Record<string, string> = {
            ragnhild: falarCom(e, 'ragnhild').map((f) => f.texto).join(' '),
            ulfgar: falarCom(e, 'ulfgar').map((f) => f.texto).join(' '),
            eira: falarCom(e, 'eira').map((f) => f.texto).join(' '),
        };
        expect(e.pistas.size).toBe(0);
        // três conversas já pagam a fofoca da Ragnhild; a pista só entra quando ela for procurada de novo
        expect(favorFeito(e, 'ragnhild')).toBe(true);
        expect(favorFeito(e, 'ulfgar')).toBe(false);
        expect(favorFeito(e, 'eira')).toBe(false);
        for (const [id, t] of Object.entries(pedidos)) {
            expect(t.length, id).toBeLessThanOrEqual(110);           // pedido curto
            expect(t, id).toMatch(/[áéíóúãõçâêô]/i);                 // e em português
            expect(t, id).not.toMatch(/latão|latao|fumaça|botão|DING/i);   // sem entregar a pista
        }
        expect(pedidos.ragnhild, 'a fofoca').toMatch(/dois/i);
        expect(pedidos.ulfgar, 'o sino').toMatch(/sino/i);
        expect(pedidos.eira, 'as ovelhas ou o martelo').toMatch(/ovelhas|martelo/i);
    });

    it('Ragnhild só conta do latão depois da fofoca (conversar com dois outros)', () => {
        const e = novoEstado13();
        falarCom(e, 'ragnhild');                          // o pedido
        expect(e.pistas.has('latao')).toBe(false);
        falarCom(e, 'astrid');                            // um
        expect(favorFeito(e, 'ragnhild')).toBe(false);
        falarCom(e, 'halvard');                           // dois
        expect(favorFeito(e, 'ragnhild')).toBe(true);
        expect(e.pistas.has('latao')).toBe(false);        // ela conta na volta
        expect(falarCom(e, 'ragnhild').length).toBeGreaterThan(0);
        expect(e.pistas.has('latao')).toBe(true);
    });

    it('Ulfgar só conta da fumaça depois que o sino tocou', () => {
        const e = novoEstado13();
        falarCom(e, 'ulfgar');
        expect(e.pistas.has('fumaca')).toBe(false);
        expect(favorFeito(e, 'ulfgar')).toBe(false);
        tocarSino(e);
        const falas = falarCom(e, 'ulfgar').map((f) => f.texto).join(' ');
        expect(e.pistas.has('fumaca')).toBe(true);
        expect(falas).toMatch(/fumaça/i);                 // a pista vem na conversa, não só no estado
    });

    it('Eira só conta do botão com as ovelhas de volta — ou com o martelo devolvido', () => {
        const comOvelhas = novoEstado13();
        falarCom(comOvelhas, 'eira');                     // o pedido
        falarCom(comOvelhas, 'sigrun');
        acharOvelha(comOvelhas, 0); acharOvelha(comOvelhas, 1); acharOvelha(comOvelhas, 2);
        expect(favorFeito(comOvelhas, 'eira')).toBe(false);   // achadas ≠ devolvidas
        falarCom(comOvelhas, 'sigrun');                       // busca 'feita'
        expect(comOvelhas.pistas.has('botao')).toBe(false);
        falarCom(comOvelhas, 'eira');
        expect(comOvelhas.pistas.has('botao')).toBe(true);

        const comMartelo = novoEstado13();
        falarCom(comMartelo, 'eira');
        falarCom(comMartelo, 'brokk'); pegarMartelo(comMartelo); falarCom(comMartelo, 'brokk');
        expect(favorFeito(comMartelo, 'eira')).toBe(true);
        falarCom(comMartelo, 'eira');
        expect(comMartelo.pistas.has('botao')).toBe(true);
    });

    it('os favores podem ser pagos em qualquer ordem — sino, ovelhas, fofoca', () => {
        const e = novoEstado13();
        // 1) o sino
        tocarSino(e);
        falarCom(e, 'ulfgar');
        expect(e.pistas.has('fumaca')).toBe(true);
        // 2) as ovelhas (que também pagam o favor da Eira)
        falarCom(e, 'sigrun');
        acharOvelha(e, 0); acharOvelha(e, 1); acharOvelha(e, 2);
        falarCom(e, 'sigrun');
        falarCom(e, 'eira');
        expect(e.pistas.has('botao')).toBe(true);
        // 3) e a fofoca, por último
        expect(e.pistas.has('latao')).toBe(false);
        falarCom(e, 'ragnhild');
        expect(e.pistas.has('latao')).toBe(true);
        expect([...e.pistas].sort()).toEqual(['botao', 'fumaca', 'latao']);
    });

    it('e na ordem trocada — fofoca, martelo, sino', () => {
        const e = novoEstado13();
        falarCom(e, 'ragnhild');                          // pedido
        falarCom(e, 'astrid'); falarCom(e, 'halvard');    // a fofoca
        falarCom(e, 'ragnhild');
        expect(e.pistas.has('latao')).toBe(true);
        falarCom(e, 'brokk'); pegarMartelo(e); falarCom(e, 'brokk');   // o martelo paga a Eira
        falarCom(e, 'eira');
        expect(e.pistas.has('botao')).toBe(true);
        expect(e.pistas.has('fumaca')).toBe(false);
        tocarSino(e);
        falarCom(e, 'ulfgar');
        expect(e.pistas.has('fumaca')).toBe(true);
        expect([...e.pistas].sort()).toEqual(['botao', 'fumaca', 'latao']);
    });

    it('quem já sabe a pista por outro caminho não ouve o pedido', () => {
        const e = novoEstado13();
        falarCom(e, 'brokk'); pegarMartelo(e); falarCom(e, 'brokk');   // o latão vem do martelo
        expect(e.pistas.has('latao')).toBe(true);
        falarCom(e, 'ragnhild');
        expect(e.conversou.has('ragnhild')).toBe(true);
        expect(e.pistas.has('latao')).toBe(true);
    });
});
