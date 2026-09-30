import { describe, it, expect, beforeEach } from 'vitest';
import {
    atencao, zerarAtencao, mudarAtencao, fixarAtencao, nivelDe, aoBaterErrado, aoConversar, passoDaAtencao,
    pistaDistorcida, congelaIdle, desafinoEmCents, aberturaDoOlho, GANHO, CONVERSAS_ATE, PERDA, ENCARAR_ATE, CORRER_ATE,
} from './f13Atencao';

const calmo = { encarando: false, andando: false, sentado: false };
const zero = { gatos: 0, graveto: 0, sinos: false, ovelhas: 0 };

beforeEach(() => zerarAtencao());

describe('limiares', () => {
    it('cruza 35, 65 e 90 com histerese', () => {
        expect(nivelDe(34.9)).toBe(0);
        expect(nivelDe(35)).toBe(1);
        expect(nivelDe(65)).toBe(2);
        expect(nivelDe(90)).toBe(3);
        expect(nivelDe(33, 1)).toBe(1);   // ainda dentro da folga
        expect(nivelDe(31, 1)).toBe(0);
        expect(nivelDe(88, 3)).toBe(3);
        expect(nivelDe(86, 3)).toBe(2);
    });
    it('é reversível: volta a 0 quando cai', () => {
        fixarAtencao(95); expect(atencao.nivel).toBe(3); expect(pistaDistorcida()).toBe(true);
        fixarAtencao(10); expect(atencao.nivel).toBe(0); expect(pistaDistorcida()).toBe(false);
    });
    it('cada limiar avisa só na primeira vez', () => {
        fixarAtencao(40); expect(atencao.pendente).toBe(1); atencao.pendente = 0;
        fixarAtencao(10); fixarAtencao(40); expect(atencao.pendente).toBe(0);
        fixarAtencao(70); expect(atencao.pendente).toBe(2);
    });
    it('salto direto para 90 explica o nível mais alto', () => {
        fixarAtencao(92); expect(atencao.pendente).toBe(3);
    });
    it('limita a 0..100', () => {
        mudarAtencao(500); expect(atencao.valor).toBe(100);
        mudarAtencao(-500); expect(atencao.valor).toBe(0);
    });
});

describe('o que sobe', () => {
    it('porta errada: primeira vez pesa mais que repetir', () => {
        aoBaterErrado(true); expect(atencao.valor).toBe(GANHO.portaErrada);
        aoBaterErrado(false); expect(atencao.valor).toBe(GANHO.portaErrada + GANHO.portaRepetida);
    });
    it('conversa repetida só conta depois de CONVERSAS_ATE (voltar para cruzar pistas é permitido)', () => {
        for (let i = 0; i < CONVERSAS_ATE; i++) aoConversar('brokk');
        expect(atencao.valor).toBe(0);
        aoConversar('brokk'); expect(atencao.valor).toBe(GANHO.conversaRepetida);
        aoConversar('sigrun'); expect(atencao.valor).toBe(GANHO.conversaRepetida);
    });
    it('encarar: carência e zera ao desviar o olhar', () => {
        passoDaAtencao(ENCARAR_ATE - .1, { ...calmo, encarando: true }, zero);
        expect(atencao.valor).toBeLessThan(1);
        passoDaAtencao(2, { ...calmo, encarando: true }, zero);
        expect(atencao.valor).toBeGreaterThan(5);
        passoDaAtencao(.1, calmo, zero); expect(atencao.tEncarando).toBe(0);
    });
    it('correr sem parar só sobe depois da carência', () => {
        passoDaAtencao(CORRER_ATE - 1, { ...calmo, andando: true }, zero);
        expect(atencao.valor).toBe(0);
        passoDaAtencao(10, { ...calmo, andando: true }, zero);
        expect(atencao.valor).toBeGreaterThan(5);
    });
});

describe('o que desce', () => {
    it('gato, graveto, sinos e ovelha contam uma vez cada', () => {
        fixarAtencao(80);
        passoDaAtencao(0, calmo, { gatos: 1, graveto: 0, sinos: false, ovelhas: 0 }); expect(atencao.valor).toBe(80 - PERDA.gato);
        passoDaAtencao(0, calmo, { gatos: 1, graveto: 1, sinos: false, ovelhas: 0 }); expect(atencao.valor).toBe(80 - PERDA.gato - PERDA.graveto);
        const v = atencao.valor;
        passoDaAtencao(0, calmo, { gatos: 1, graveto: 1, sinos: true, ovelhas: 2 });
        expect(atencao.valor).toBe(v - PERDA.sinos - 2 * PERDA.ovelha);
        const w = atencao.valor;
        passoDaAtencao(0, calmo, { gatos: 1, graveto: 1, sinos: true, ovelhas: 2 }); expect(atencao.valor).toBe(w);
    });
    it('sentar com o Árni acalma', () => {
        fixarAtencao(60);
        passoDaAtencao(2, { ...calmo, sentado: true }, zero);
        expect(atencao.valor).toBeLessThan(60 - PERDA.sentarUmaVez);
    });
    it('decai devagar sozinho', () => {
        fixarAtencao(50); passoDaAtencao(10, calmo, zero);
        expect(atencao.valor).toBeCloseTo(50 - 10 * PERDA.decaimentoPorSegundo, 5);
    });
});

describe('efeitos', () => {
    it('desafino só a partir do nível 1 e limitado', () => {
        expect(desafinoEmCents(20, 0)).toBe(0);
        expect(desafinoEmCents(35, 1)).toBeLessThan(0);
        expect(desafinoEmCents(100, 3)).toBe(-90);
    });
    it('congelar o parado: só com nível, por pouco tempo, e alguém por janela', () => {
        const ids = ['halvard', 'brokk', 'sigrun', 'ragnhild', 'ulfgar', 'eira', 'torvald', 'arni'];
        expect(ids.some((i) => congelaIdle(i, 3.5, 0))).toBe(false);
        let alguem = false, sempre = true;
        for (let j = 0; j < 40; j++) for (const i of ids) if (congelaIdle(i, j * 6 + .5, 1)) alguem = true;
        for (const i of ids) if (!congelaIdle(i, 6 * 5 + 4, 1)) { /* fora da duração */ } else sempre = false;
        expect(alguem).toBe(true); expect(sempre).toBe(true);
    });
    it('abertura do olho é proporcional', () => {
        expect(aberturaDoOlho(0)).toBe(0); expect(aberturaDoOlho(50)).toBe(.5); expect(aberturaDoOlho(150)).toBe(1);
    });
});
