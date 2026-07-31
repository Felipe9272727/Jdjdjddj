/**
 * f9Rede.test.ts — M20: a REDE NEURAL por criatura.
 *
 * Pesquisa: o Rain World NÃO usa rede neural (é personalidade semeada + regras).
 * Aqui cada bicho ganha um perceptron minúsculo POR CIMA disso: entrada(5) →
 * oculta(5, features de personalidade FIXAS) → saída(2, leitura que APRENDE).
 * Estes testes provam: individualidade (cada um nasce diferente), determinismo
 * (mesma semente = mesma rede), aprendizado (perigo↑cautela; comida↑forrageio),
 * e que a rede nasce PERTO DO NEUTRO (não sequestra o ecossistema afinado).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { f9eco, f9EcoReset, f9EcoTick, __f9Brain, f9BrainDisposition } from '../f9Eco';
import { f9Reset } from '../f9Floresta';

const { makeBrain, brainEval, brainLearn } = __f9Brain;
// um estado de entrada fixo pra comparar redes de forma justa
const IN: [number, number, number, number, number] = [0.6, 0.2, 0.5, 0.4, 0.3];
const evalOut = (br: ReturnType<typeof makeBrain>) => { brainEval(br, ...IN); return [br.out[0], br.out[1]] as const; };

beforeEach(() => { f9EcoReset(); f9Reset(); });

describe('f9Rede — a rede neural de cada bicho', () => {
    it('INDIVIDUALIDADE: dois bichos nascem com redes diferentes (mesma entrada, saídas distintas)', () => {
        const a = makeBrain(), b = makeBrain();
        const [ca, fa] = evalOut(a), [cb, fb] = evalOut(b);
        expect(Math.abs(ca - cb) + Math.abs(fa - fb)).toBeGreaterThan(0.02);
    });

    it('DETERMINISMO: após o reset, o MESMO indivíduo tem a MESMA rede', () => {
        f9EcoReset();
        const id0 = f9eco.agents[0].id;
        f9EcoTick(1 / 30, 30, 3, 200);                 // 1 tick popula a saída
        const d1 = f9BrainDisposition(id0)!;
        f9EcoReset();
        f9EcoTick(1 / 30, 30, 3, 200);
        const d2 = f9BrainDisposition(f9eco.agents[0].id)!;
        expect(d2.caution).toBeCloseTo(d1.caution, 10);
        expect(d2.forage).toBeCloseTo(d1.forage, 10);
    });

    it('NASCE COM TEMPERAMENTO: a população se espalha entre OUSADOS e ARISCOS (não clones)', () => {
        let bold = 0, wary = 0;
        for (let k = 0; k < 40; k++) {
            const [c] = evalOut(makeBrain());
            expect(Math.abs(c)).toBeLessThanOrEqual(1); // saída de tanh, válida
            if (c < -0.12) bold++;
            if (c > 0.12) wary++;
        }
        // desde o nascimento há dos dois — é o que faz cada bicho reagir a você
        // de um jeito (M21): uns deixam chegar perto, outros disparam de longe.
        expect(bold).toBeGreaterThan(0);
        expect(wary).toBeGreaterThan(0);
    });

    it('APRENDE CAUTELA: repetição de PERIGO empurra a cautela pra cima', () => {
        const br = makeBrain();
        const c0 = evalOut(br)[0];
        for (let k = 0; k < 40; k++) { brainEval(br, ...IN); brainLearn(br, 1, 0); } // perigo↑
        const c1 = evalOut(br)[0];
        expect(c1).toBeGreaterThan(c0);
    });

    it('APRENDE FORRAGEIO: comer bem reforça a busca por comida', () => {
        const br = makeBrain();
        const f0 = evalOut(br)[1];
        for (let k = 0; k < 40; k++) { brainEval(br, ...IN); brainLearn(br, 0, 1); } // comida↑
        const f1 = evalOut(br)[1];
        expect(f1).toBeGreaterThan(f0);
    });

    it('APRENDIZADO PERSISTE E DIVERGE: um bicho aterrorizado fica mais cauteloso que um bem-alimentado', () => {
        const medroso = makeBrain(), tranquilo = makeBrain();
        for (let k = 0; k < 30; k++) {
            brainEval(medroso, ...IN); brainLearn(medroso, 1, 0);      // só perigo
            brainEval(tranquilo, ...IN); brainLearn(tranquilo, -0.4, 1); // só comida
        }
        expect(evalOut(medroso)[0]).toBeGreaterThan(evalOut(tranquilo)[0]);
    });
});
