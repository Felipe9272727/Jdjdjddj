/**
 * f3Voz.test.ts — o que dá para provar de uma voz sem ouvi-la.
 *
 * Eu não escuto o Andar 3. Se o timbre agrada é ouvido do Felipe no celular
 * dele, e isto aqui não decide isso. O que ISTO decide é tudo que seria um
 * defeito mesmo soando bem: fala que vira melodia de doze notas, acento que cai
 * na palavra errada, pergunta que termina descendo, e — a parte que é história —
 * o arco do timbre andando na direção certa conforme ele perde os pincéis.
 */

import { describe, it, expect } from 'vitest';
import {
    vozDoDiabrete, ehAcento, curvaFinal, encaixarNoTeto,
    TETO_DE_BLATS, PISO_DE_BLATS,
} from './f3Voz';
import { escolherFala, type EventoDoDiabrete } from './f3Falas';
import { DIABRETE_SCRIPT } from './diabreteScript';
import { BOIL_HZ } from './f3Tinta';

const EVENTOS: EventoDoDiabrete[] = ['desenhou', 'espetou', 'roubou', 'caiu', 'provoca'];
/** Uma amostra das falas reais do andar, não frases inventadas para o teste. */
const FALAS_REAIS = [
    ...EVENTOS.flatMap(e => [0, 1, 2, 3].map(r => escolherFala(e, { roubados: r }).texto)),
    ...DIABRETE_SCRIPT.map(l => l.text),
];

describe('acento: o texto já grita, a voz só obedece', () => {
    it('CAIXA ALTA com duas letras ou mais é acento', () => {
        expect(ehAcento('PENA')).toBe(true);
        expect(ehAcento('AI!')).toBe(true);
        expect(ehAcento('HAHAHA!')).toBe(true);
        expect(ehAcento('MEU!')).toBe(true);
    });
    it('acento do português conta como letra', () => {
        expect(ehAcento('PINCÉIS')).toBe(true);
        expect(ehAcento('TRÊS')).toBe(true);
    });
    it('palavra normal, inicial maiúscula e letra solta não são acento', () => {
        expect(ehAcento('gracinha')).toBe(false);
        expect(ehAcento('Doeu?')).toBe(false);
        expect(ehAcento('Espinho')).toBe(false);
        expect(ehAcento('A')).toBe(false);
        expect(ehAcento('—')).toBe(false);
    });
});

describe('a pontuação faz a curva do fim', () => {
    it('pergunta sobe mais que exclamação, e reticência DESCE', () => {
        const interrog = curvaFinal('Tá cansando, perna-curta?');
        const exclam = curvaFinal('Espinho meu não erra, gracinha!');
        const suspenso = curvaFinal('N-não… esse não… sem ele eu não sou NADA aqui…');
        expect(interrog).toBeGreaterThan(exclam);
        expect(exclam).toBeGreaterThan(1);
        expect(suspenso).toBeLessThan(1);
    });
    it('sem pontuação, não mexe', () => {
        expect(curvaFinal('sem nada no fim')).toBe(1);
    });
    it('espaço sobrando no fim não engana', () => {
        expect(curvaFinal('subiu!   ')).toBe(curvaFinal('subiu!'));
    });
});

describe('o corte no teto guarda a piada', () => {
    it('frase curta passa inteira', () => {
        expect(encaixarNoTeto(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });
    it('frase longa perde o miolo, nunca a última palavra', () => {
        const p = ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
        const c = encaixarNoTeto(p);
        expect(c).toHaveLength(TETO_DE_BLATS);
        expect(c[c.length - 1]).toBe('nove');
        expect(c[0]).toBe('um');
    });
});

describe('a partitura de toda fala do andar', () => {
    it('tem entre o piso e o teto de notas', () => {
        for (const t of FALAS_REAIS) {
            const v = vozDoDiabrete(t);
            expect(v.blats.length).toBeGreaterThanOrEqual(PISO_DE_BLATS);
            expect(v.blats.length).toBeLessThanOrEqual(TETO_DE_BLATS);
        }
    });
    it('é curta: resmungo, não melodia — nenhuma passa de 0,7 s', () => {
        for (const t of FALAS_REAIS) {
            expect(vozDoDiabrete(t).total).toBeLessThanOrEqual(0.7);
        }
    });
    it('as notas andam para a frente e começam no zero', () => {
        for (const t of FALAS_REAIS) {
            const { blats } = vozDoDiabrete(t);
            expect(blats[0].t).toBe(0);
            for (let i = 1; i < blats.length; i++) expect(blats[i].t).toBeGreaterThan(blats[i - 1].t);
        }
    });
    it('nenhuma nota sai inaudível nem estourada', () => {
        for (const t of FALAS_REAIS) {
            for (const b of vozDoDiabrete(t).blats) {
                expect(b.ganho).toBeGreaterThan(0.05);
                expect(b.ganho).toBeLessThan(0.32);
                expect(b.hz).toBeGreaterThan(120);
                expect(b.hz).toBeLessThan(700);
            }
        }
    });
    it('é determinística: a mesma frase soa igual em toda partida', () => {
        for (const t of FALAS_REAIS.slice(0, 6)) {
            expect(vozDoDiabrete(t, { roubados: 2 })).toEqual(vozDoDiabrete(t, { roubados: 2 }));
        }
    });
});

describe('o acento é o mais alto e o mais forte da frase', () => {
    it('a nota da palavra gritada bate mais que as vizinhas', () => {
        const v = vozDoDiabrete('AI! Doeu? Doeu, né? Que PENA!');
        const acentos = v.blats.filter(b => b.acento);
        const normais = v.blats.filter(b => !b.acento);
        expect(acentos.length).toBeGreaterThan(0);
        expect(normais.length).toBeGreaterThan(0);
        const maiorNormal = Math.max(...normais.map(b => b.ganho));
        expect(Math.min(...acentos.map(b => b.ganho))).toBeGreaterThan(maiorNormal);
    });
});

describe('O ARCO — a voz envelhece junto com o andar', () => {
    const frase = 'Olha o TRAÇO! Espinho fresquinho, saindo do forno!';
    const etapas = [0, 1, 2, 3].map(r => vozDoDiabrete(frase, { roubados: r }));

    it('cada pincel perdido sobe a voz dele', () => {
        for (let i = 1; i < etapas.length; i++) {
            expect(etapas[i].blats[0].hz).toBeGreaterThan(etapas[i - 1].blats[0].hz);
        }
    });
    it('a surdina FECHA: de trombone gordo a kazoo fininho', () => {
        for (let i = 1; i < etapas.length; i++) {
            expect(etapas[i].surdina).toBeLessThan(etapas[i - 1].surdina);
            expect(etapas[i].q).toBeGreaterThan(etapas[i - 1].q);
        }
        expect(etapas[3].surdina).toBeGreaterThan(0);   // sem virar filtro mudo
    });
    it('o fervilhar acelera — ele treme mais a cada perda', () => {
        expect(etapas[0].boilHz).toBe(BOIL_HZ);          // no começo, o 8 Hz do chão
        for (let i = 1; i < etapas.length; i++) {
            expect(etapas[i].boilHz).toBeGreaterThan(etapas[i - 1].boilHz);
        }
    });
    it('o acento RACHA mais alto quando ele já perdeu tudo', () => {
        const ac = etapas.map(v => v.blats.find(b => b.acento)!);
        expect(ac.every(Boolean)).toBe(true);
        expect(ac[3].hz / etapas[3].blats[0].hz).toBeGreaterThan(ac[0].hz / etapas[0].blats[0].hz);
    });
    it('roubados fora da faixa não quebra o arco', () => {
        expect(vozDoDiabrete(frase, { roubados: 99 })).toEqual(etapas[3]);
        expect(vozDoDiabrete(frase, { roubados: -5 })).toEqual(etapas[0]);
        expect(vozDoDiabrete(frase, { roubados: NaN })).toEqual(etapas[0]);
    });
});

describe('dá para ouvir de olhos fechados quem está falando', () => {
    const frase = 'Você jogou espinhos em mim. Várias vezes.';
    const dele = vozDoDiabrete(frase, { quem: 'diabrete' });
    const meu = vozDoDiabrete(frase, { quem: 'jogador' });

    it('o jogador é mais grave e não tem surdina de trombone', () => {
        expect(meu.timbre).toBe('simples');
        expect(dele.timbre).toBe('trombone');
        expect(meu.blats[0].hz).toBeLessThan(dele.blats[0].hz);
        expect(meu.q).toBeLessThan(dele.q);
    });
    it('o jogador NÃO ferve: ele não é traço do Diabrete', () => {
        expect(meu.boilHz).toBe(0);
        expect(dele.boilHz).toBeGreaterThan(0);
    });
    it('e não tem arco — quem se desmancha no andar é o Diabrete', () => {
        for (const r of [1, 2, 3]) {
            expect(vozDoDiabrete(frase, { quem: 'jogador', roubados: r })).toEqual(meu);
        }
    });
});

describe('o grito é interjeição, não discurso', () => {
    const frase = 'Isso, sobe. Quanto mais alto, mais bonito o tombo!';
    it('corta mais curto e bate mais forte que a leitura normal', () => {
        const normal = vozDoDiabrete(frase);
        const grito = vozDoDiabrete(frase, { grito: true });
        expect(grito.total).toBeLessThan(normal.total);
        expect(grito.blats.length).toBeLessThan(normal.blats.length);
        expect(Math.max(...grito.blats.map(b => b.ganho)))
            .toBeGreaterThan(Math.max(...normal.blats.map(b => b.ganho)));
    });
    it('mesmo cortado, ainda termina na última palavra da frase', () => {
        const g = vozDoDiabrete('um dois três quatro cinco seis sete oito!', { grito: true });
        expect(g.blats[g.blats.length - 1].hz)
            .toBeCloseTo(vozDoDiabrete('um oito!', { grito: true }).blats[1].hz, 5);
    });
});

describe('fala degenerada não quebra nem emudece', () => {
    it('uma palavra só ainda faz duas notas', () => {
        expect(vozDoDiabrete('HÁ!').blats.length).toBe(PISO_DE_BLATS);
    });
    it('só pontuação não explode', () => {
        const v = vozDoDiabrete('…');
        expect(v.blats.length).toBe(PISO_DE_BLATS);
        expect(v.blats.every(b => Number.isFinite(b.hz))).toBe(true);
    });
});
