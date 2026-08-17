import { describe, it, expect } from 'vitest';
import {
    julgarTom, semelhanca, FLOOR10_MARGEM_DE_TOM,
    FLOOR10_ANCORAS_BOAS, FLOOR10_ANCORAS_RUINS,
} from '../npc/floor10JuizDeTom';

/**
 * A REGRA DO JUIZ DE TOM, testada sem baixar 110 MB de ONNX.
 *
 * O que estes testes protegem é a REGRA — o sinal do desvio, o comportamento
 * sem âncoras, e a margem. O acerto do modelo (5/6 no conjunto cego) está
 * medido em `bancada-navegador/juiz-tom.mjs` e registrado em VELOCIDADE.md;
 * isso é medição, não teste unitário, porque depende do embedder.
 */
const unit = (v: number[]): number[] => {
    const n = Math.hypot(...v);
    return n === 0 ? v : v.map((x) => x / n);
};

describe('julgarTom', () => {
    const boas = [unit([1, 0, 0]), unit([0.9, 0.1, 0])];
    const ruins = [unit([0, 1, 0]), unit([0, 0.9, 0.1])];

    it('frase que se parece com as BOAS não é marcada', () => {
        const r = julgarTom(unit([1, 0.05, 0]), boas, ruins);
        expect(r.desvio).toBeLessThan(0);
        expect(r.foraDoTom).toBe(false);
    });

    it('frase que se parece com as RUINS é marcada', () => {
        const r = julgarTom(unit([0.05, 1, 0]), boas, ruins);
        expect(r.desvio).toBeGreaterThan(0);
        expect(r.foraDoTom).toBe(true);
    });

    it('sem âncoras ele NÃO julga — não julgar é melhor que julgar no escuro', () => {
        // Marcar por engano custa uma chamada de revisor (~11,6 s) por fala. Se
        // o embedder não subiu, o certo é deixar passar e não cobrar o jogador.
        expect(julgarTom(unit([0, 1, 0]), [], ruins).foraDoTom).toBe(false);
        expect(julgarTom(unit([0, 1, 0]), boas, []).foraDoTom).toBe(false);
        expect(julgarTom([], boas, ruins).foraDoTom).toBe(false);
    });

    it('a margem sobe o custo de marcar', () => {
        // Inclinado para as RUINS, mas sem ser extremo: desvio ~0,15. Passa em
        // margem 0 e não passa em 0,5. (Minha primeira versão usava [0.5,0.55]
        // e caía do lado das boas — a segunda âncora boa, [0.9,0.1], puxa a
        // diagonal mais do que a intuição sugere.)
        const emCima = unit([0.5, 0.7, 0]);
        expect(julgarTom(emCima, boas, ruins, 0).foraDoTom).toBe(true);
        expect(julgarTom(emCima, boas, ruins, 0.5).foraDoTom).toBe(false);
    });

    it('a margem padrão é ZERO, e o motivo está medido', () => {
        // Varrida em 0 / 0,02 / 0,05 / 0,10 contra o conjunto cego: 0 dá 5/6
        // com um falso positivo; 0,10 cai para 3/6 sem ganhar precisão. Zero é
        // "empatou, então marca" — o lado certo do erro, porque falso negativo
        // é uma fala fora do personagem na cara do jogador.
        expect(FLOOR10_MARGEM_DE_TOM).toBe(0);
    });
});

describe('semelhanca', () => {
    it('vetores idênticos dão 1, ortogonais dão 0', () => {
        expect(semelhanca(unit([1, 2, 3]), unit([1, 2, 3]))).toBeCloseTo(1, 5);
        expect(semelhanca([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    it('tamanhos diferentes ou vazio devolvem 0 em vez de NaN', () => {
        // Um NaN aqui viraria `foraDoTom: false` silencioso — o juiz desligado
        // sem ninguém saber. Melhor devolver 0 explicitamente.
        expect(semelhanca([1, 2], [1, 2, 3])).toBe(0);
        expect(semelhanca([], [])).toBe(0);
    });
});

describe('as âncoras', () => {
    it('há os dois lados, e em número parecido', () => {
        expect(FLOOR10_ANCORAS_BOAS.length).toBeGreaterThanOrEqual(6);
        expect(FLOOR10_ANCORAS_RUINS.length).toBeGreaterThanOrEqual(6);
    });

    it('estão em INGLÊS, que é onde o juiz age', () => {
        // O juiz roda ANTES da tradução, no texto do rascunhador. Âncora em
        // português mediria distância de idioma em vez de distância de tom.
        const pt = /\b(?:você|não|é|está|aqui|elevador)\b/i;
        for (const a of [...FLOOR10_ANCORAS_BOAS, ...FLOOR10_ANCORAS_RUINS]) {
            expect(a).not.toMatch(pt);
        }
    });

    it('as âncoras BOAS são curtas — é a definição operante do personagem', () => {
        // "Seco e curto" não é estilo aqui, é o que separa o Nilo do assistente.
        // Âncora boa comprida ensinaria o juiz a aceitar prolixidade.
        for (const a of FLOOR10_ANCORAS_BOAS) expect(a.length).toBeLessThan(60);
    });

    it('nenhuma âncora aparece nos dois lados', () => {
        const cruz = FLOOR10_ANCORAS_BOAS.filter((b) => FLOOR10_ANCORAS_RUINS.includes(b));
        expect(cruz).toEqual([]);
    });
});
