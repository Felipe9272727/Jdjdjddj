// O medidor que vai rodar no aparelho de quem joga, porque a emulação não
// reproduziu o sintoma dele em nove execuções.
import { beforeEach, describe, expect, it } from 'vitest';
import {
    ENGASGO_GRAVE_MS,
    ENGASGO_MIN_MS,
    ehEngasgo,
    engasgosRegistrados,
    limparEngasgos,
    pararDeVigiar,
    resumoDosEngasgos,
    vigiarEngasgos,
} from '../npc/floor10Engasgo';

beforeEach(() => {
    pararDeVigiar();
    limparEngasgos();
});

describe('o que conta como engasgo', () => {
    it('variação normal de quadro não conta', () => {
        expect(ehEngasgo(16)).toBe(false);
        expect(ehEngasgo(120)).toBe(false);
        expect(ehEngasgo(ENGASGO_MIN_MS - 1)).toBe(false);
    });

    it('a partir do piso, conta', () => {
        expect(ehEngasgo(ENGASGO_MIN_MS)).toBe(true);
        expect(ehEngasgo(6_000)).toBe(true);
    });

    it('aba em segundo plano NÃO é engasgo do jogo', () => {
        // O navegador pausa o rAF quando a aba sai de foco. Registrar isso
        // encheria o relatório de falso positivo justamente em quem alterna
        // entre apps — que é o caso de quem testa o jogo no celular.
        expect(ehEngasgo(60_000)).toBe(false);
        expect(ehEngasgo(29_000)).toBe(true);
    });
});

describe('o resumo diz a CAUSA provável, não os dados crus', () => {
    it('sem engasgo, diz isso e mais nada', () => {
        expect(resumoDosEngasgos()).toBe('engasgos: nenhum acima de 250ms');
    });

    it('distingue travada de engasgo, e aponta a fase', async () => {
        // Reproduz na mão o que o vigia gravaria: uma travada durante a
        // geração e um engasgo leve durante a carga.
        const quadros = [
            { t: 1000, dt: 300, fase: 'loading' },
            { t: 5000, dt: 6000, fase: 'thinking' },
        ];
        // Âncora em tempo real, não em zero: `performance.now()` nunca devolve
        // 0 no primeiro quadro, e o vigia ignora o quadro sem antecessor.
        let agora = 1000;
        const original = globalThis.requestAnimationFrame;
        const fila: FrameRequestCallback[] = [];
        globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            fila.push(cb);
            return fila.length;
        }) as typeof globalThis.requestAnimationFrame;
        let fase = 'ready';
        vigiarEngasgos(() => fase);
        // Primeiro quadro só ancora o relógio.
        fila.shift()?.(agora);
        for (const q of quadros) {
            fase = q.fase;
            agora += q.dt;
            fila.shift()?.(agora);
        }
        globalThis.requestAnimationFrame = original;

        const lista = engasgosRegistrados();
        expect(lista).toHaveLength(2);
        const resumo = resumoDosEngasgos();
        expect(resumo).toContain('engasgos: 2 acima de 250ms');
        expect(resumo).toContain(`pior 6000ms na fase "thinking"`);
        expect(resumo).toContain('travadas (>3s): 1');
        expect(resumo).toContain('thinking×1');
        expect(ENGASGO_GRAVE_MS).toBe(3_000);
    });
});
