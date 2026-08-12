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

describe('salvar nunca piora o que já estava salvo', () => {
    // ── A CORRIDA QUE FAZIA `floor10Retomada` PISCAR ──────────────────────
    //
    // Dois lugares salvam a MESMA pausa, um logo após o outro: o
    // `abortDeliberation` (com `deliberationLive`, publicado a cada 150 ms) e o
    // `finally` da rodada (com o `texto` local). Havia um `delete` no ramo do
    // texto curto, então a segunda chamada — se chegasse com ruído — apagava o
    // pensamento bom que a primeira tinha guardado.
    //
    // O sintoma era um teste falhando sob carga e passando isolado: exatamente
    // o tipo de coisa que se chama de "flake" e se ignora. Não era.
    beforeEach(() => limparPausas());

    it('uma gravação curta não apaga a boa que já estava lá', () => {
        expect(pausarPensamento('vontade', 'o jogador está parado perto da porta há um tempo', 40)).toBe(true);
        expect(pausarPensamento('vontade', 'oi', 1)).toBe(false);
        expect(pensamentoPausado('vontade')?.parcial).toContain('jogador está parado');
    });

    it('uma gravação válida porém MAIS CURTA também não derruba a mais longa', () => {
        const longo = 'ele se aproximou da placa oeste e ficou olhando para mim sem dizer nada';
        expect(pausarPensamento('vontade', longo, 60)).toBe(true);
        expect(pausarPensamento('vontade', 'ele se aproximou da placa', 12)).toBe(false);
        expect(pensamentoPausado('vontade')?.parcial).toBe(longo);
    });

    it('mas uma gravação MAIOR substitui — a rodada continuou pensando', () => {
        expect(pausarPensamento('vontade', 'ele se aproximou da placa', 12)).toBe(true);
        const maior = 'ele se aproximou da placa oeste e ficou olhando para mim';
        expect(pausarPensamento('vontade', maior, 30)).toBe(true);
        expect(pensamentoPausado('vontade')?.parcial).toBe(maior);
    });

    it('descartar de propósito continua funcionando — é o que tem essa função', () => {
        // O `delete` que saiu do `pausarPensamento` era redundante: quem quer
        // esquecer chama `descartarPensamento`, que existe para isso.
        pausarPensamento('vontade', 'o jogador está parado perto da porta há um tempo', 40);
        descartarPensamento('vontade');
        expect(pensamentoPausado('vontade')).toBeNull();
    });
});
