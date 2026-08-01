import { beforeEach, describe, expect, it } from 'vitest';
import {
    descartarPensamento,
    JANELA_RETOMADA_MS,
    limparPausas,
    pausarPensamento,
    pensamentoPausado,
    promptDeRetomada,
} from '../npc/floor10Pausa';

const PENSAMENTO = 'O elevador não abre faz horas. Se eu chamar o hóspede, talvez ele';

describe('floor10Pausa — pausar deixou de significar jogar fora', () => {
    beforeEach(() => limparPausas());

    it('guarda o raciocínio interrompido e devolve na rodada seguinte', () => {
        expect(pausarPensamento('vontade', PENSAMENTO, 41)).toBe(true);
        expect(pensamentoPausado('vontade')?.parcial).toBe(PENSAMENTO);
        expect(pensamentoPausado('vontade')?.tokens).toBe(41);
    });

    it('cada cérebro tem a sua pausa — o motor não lê o pensamento da vontade', () => {
        pausarPensamento('vontade', PENSAMENTO, 41);
        expect(pensamentoPausado('motor')).toBeNull();
    });

    it('meia palavra não vale retomada', () => {
        expect(pausarPensamento('vontade', 'O ele', 2)).toBe(false);
        expect(pensamentoPausado('vontade')).toBeNull();
    });

    it('depois da janela o mundo já mudou: descarta em vez de continuar velho', () => {
        const t0 = 1_000_000;
        pausarPensamento('vontade', PENSAMENTO, 41, t0);
        expect(pensamentoPausado('vontade', t0 + JANELA_RETOMADA_MS - 1)).not.toBeNull();
        expect(pensamentoPausado('vontade', t0 + JANELA_RETOMADA_MS + 1)).toBeNull();
        // e some de vez, sem ficar ocupando lugar
        expect(pensamentoPausado('vontade', t0)).toBeNull();
    });

    it('ler NÃO consome: uma retomada interrompida de novo continua valendo', () => {
        pausarPensamento('vontade', PENSAMENTO, 41);
        expect(pensamentoPausado('vontade')).not.toBeNull();
        expect(pensamentoPausado('vontade')).not.toBeNull();
    });

    it('quando a rodada fecha, o pensamento é descartado', () => {
        pausarPensamento('vontade', PENSAMENTO, 41);
        descartarPensamento('vontade');
        expect(pensamentoPausado('vontade')).toBeNull();
    });

    it('o prompt de retomada manda CONTINUAR e carrega o que já foi pensado', () => {
        const prompt = promptDeRetomada('ESTADO DO MUNDO: ...', PENSAMENTO);
        expect(prompt).toContain('ESTADO DO MUNDO: ...');
        expect(prompt).toContain(PENSAMENTO);
        expect(prompt).toMatch(/CONTINUE/);
        expect(prompt).toMatch(/não recomece/i);
    });
});

describe('emendarPensamento — a retomada não pode sair gaguejando', () => {
    it('remove a sobreposição quando o modelo reescreve o fim da frase', async () => {
        const { emendarPensamento } = await import('../npc/floor10Pausa');
        expect(emendarPensamento(
            'Estou preso neste andar faz',
            'preso neste andar faz tempo demais.',
        )).toBe('Estou preso neste andar faz tempo demais.');
    });

    it('junta com espaço quando não há sobreposição nenhuma', async () => {
        const { emendarPensamento } = await import('../npc/floor10Pausa');
        expect(emendarPensamento('Primeira parte.', 'Segunda parte.'))
            .toBe('Primeira parte. Segunda parte.');
    });

    it('coincidência curta não é tratada como repetição', async () => {
        const { emendarPensamento } = await import('../npc/floor10Pausa');
        // " o " aparece nos dois lados, mas 3 caracteres não provam nada.
        expect(emendarPensamento('penso no elevador e o', 'o hóspede espera'))
            .toBe('penso no elevador e o o hóspede espera');
    });

    it('lado vazio devolve o outro inteiro', async () => {
        const { emendarPensamento } = await import('../npc/floor10Pausa');
        expect(emendarPensamento('', 'só o novo')).toBe('só o novo');
        expect(emendarPensamento('só a base', '')).toBe('só a base');
    });
});
