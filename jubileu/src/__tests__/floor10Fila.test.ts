import { beforeEach, describe, expect, it } from 'vitest';
import {
    FILA_VAZIA, Floor10Fila, filaLinha, type FilaItem,
} from '../npc/floor10Fila';

// Os DOIS nomes, como a fila os recebe: `label` é o arquivo (bancada e
// caixa-preta) e `nome` é o que o jogador lê. Fixá-los diferentes aqui é de
// propósito — um fixture onde os dois fossem iguais deixaria passar a troca de
// um pelo outro na tela.
const FALA: FilaItem = {
    id: 'fala', label: 'SmolLM3-3B', nome: 'a voz dele', bytes: 1_915_305_312,
};
const VONTADE: FilaItem = {
    id: 'vontade', label: 'LFM2.5-1.2B', nome: 'a vontade própria', bytes: 1_321_083_008,
};
const MOTOR: FilaItem = {
    id: 'motor', label: 'Qwen3-0.6B', nome: 'o corpo, de reserva', bytes: 639_446_688,
};
const TODOS = [FALA, VONTADE, MOTOR];
const TOTAL = TODOS.reduce((s, i) => s + i.bytes, 0);

const amostra = (bytes: number, total: number) => ({
    fraction: total > 0 ? bytes / total : 0,
    bytes, totalBytes: total, rate: 8e6, etaSec: 30, stalledSec: 0,
});

describe('npc/floor10Fila — uma barra só, um cérebro depois do outro', () => {
    let fila: Floor10Fila;
    beforeEach(() => { fila = new Floor10Fila(TODOS); });

    it('a fração é sobre o TOTAL da fila, não sobre o arquivo da vez', () => {
        // É esta a pergunta que o jogador faz e que três barras separadas nunca
        // respondiam: quanto falta AO TODO.
        const e = fila.progresso('fala', amostra(FALA.bytes / 2, FALA.bytes));
        expect(e.fracao).toBeCloseTo((FALA.bytes / 2) / TOTAL, 4);
        expect(e.bytesTotais).toBe(TOTAL);
        expect(e.posicao).toBe(1);
        expect(e.total).toBe(3);
    });

    it('a barra NUNCA anda para trás entre um cérebro e o outro', () => {
        // O defeito clássico de somar só a amostra viva: a fala termina, a
        // vontade começa do zero, e a barra despenca. Um item pronto conta
        // inteiro para sempre.
        fila.progresso('fala', amostra(FALA.bytes, FALA.bytes));
        const depoisDaFala = fila.estado().fracao;
        const comecoDaVontade = fila.progresso('vontade', amostra(0, VONTADE.bytes)).fracao;
        expect(comecoDaVontade).toBeGreaterThanOrEqual(depoisDaFala);
    });

    it('chegar ao fim do arquivo marca o cérebro como pronto sozinho', () => {
        const e = fila.progresso('fala', amostra(FALA.bytes, FALA.bytes));
        expect(e.prontos).toContain('fala');
    });

    it('quem veio do cache também conta — não precisa baixar para estar pronto', () => {
        // Na segunda partida os três já estão no aparelho. A fila tem de dizer
        // "tudo pronto", não "0%".
        for (const i of TODOS) fila.concluir(i.id);
        expect(fila.completa()).toBe(true);
        expect(fila.estado().fracao).toBe(1);
        expect(filaLinha(fila.ocioso())).toBe('tudo pronto');
    });

    it('diz onde está a fila em uma linha, sem abrir nada', () => {
        expect(filaLinha(fila.progresso('vontade', amostra(1e8, VONTADE.bytes))))
            .toBe('2 de 3 · a vontade própria');
    });

    it('e essa linha é a de JOGO: nunca o nome do arquivo', () => {
        // A reclamação que criou os dois nomes: "parece algo dev-only". O
        // `label` continua existindo e continua indo para as bancadas — mas a
        // linha que quem joga lê enquanto espera é a outra.
        const linha = filaLinha(fila.progresso('fala', amostra(1e8, FALA.bytes)));
        expect(linha).toContain(FALA.nome);
        expect(linha).not.toContain(FALA.label);
    });

    it('a velocidade e o "parado" vêm do arquivo em curso, que é o que trava', () => {
        const travado = { ...amostra(1e8, VONTADE.bytes), rate: 0, stalledSec: 40 };
        const e = fila.progresso('vontade', travado);
        expect(e.amostra.stalledSec).toBe(40);
        expect(e.amostra.rate).toBe(0);
    });

    it('acrescentar um QUARTO cérebro não exige tocar na lógica', () => {
        // A memória semântica entra assim: uma linha na lista.
        const memoria: FilaItem = {
            id: 'memoria',
            label: 'embeddinggemma-300M',
            nome: 'as lembranças dele',
            bytes: 113_000_000,
        };
        fila.definir([...TODOS, memoria]);
        const e = fila.progresso('memoria', amostra(0, memoria.bytes));
        expect(e.total).toBe(4);
        expect(e.posicao).toBe(4);
        expect(e.bytesTotais).toBe(TOTAL + memoria.bytes);
    });

    it('fila vazia não quebra e não inventa progresso', () => {
        const vazia = new Floor10Fila([]);
        expect(vazia.estado().fracao).toBe(0);
        expect(vazia.completa()).toBe(false);
        expect(filaLinha(vazia.estado())).toBe('preparando…');
        expect(FILA_VAZIA.atual).toBeNull();
    });

    it('reset devolve a fila ao começo, para o botão da bancada', () => {
        fila.concluir('fala');
        fila.reset();
        expect(fila.estado().prontos).toHaveLength(0);
        expect(fila.estado().fracao).toBe(0);
    });
});
