/**
 * O que se cobra aqui NÃO é o desenho — é a INTENÇÃO, porque desenho a gente
 * olha na foto e intenção some sem ninguém ver.
 *
 * A lição vem cara: neste mesmo rosto eu já cobri o nariz do personagem três
 * vezes seguidas, cada vez de um jeito diferente, e o dono do jogo teve de
 * reclamar as três. O teste que teria pego isso na primeira é o de baixo — "o
 * repouso é a cara que o modelo já tem".
 */
import { describe, it, expect } from 'vitest';
import {
    OLHOS, NOMES_DOS_OLHOS, OLHO_EM_REPOUSO, PISCADA, QUADROS_DA_PISCADA,
    olhoPiscando, quadroDaPiscada, olhoDoDiabrete,
    INTERVALO_DA_PISCADA, DURACAO_DA_PISCADA, PISCADA_HZ,
    type NomeDoOlho,
} from './f3Olhos';
import {
    SOBRANCELHAS, NOMES_DAS_SOBRANCELHAS, SOBRANCELHA_EM_REPOUSO,
    sobrancelhaDoDiabrete,
} from './f3Sobrancelha';
import { BOIL_HZ } from './f3Tinta';

const MOMENTOS = ['apresentacao', 'desenhou', 'espetou', 'roubou', 'provoca',
    'caiu', 'suplica', 'ocioso', 'quaseLaEmCima', 'perdeuOPrimeiro',
    'perdeuOUltimo', 'tonto', 'pensando', 'confuso', 'vitorioso',
    'derrotado'] as const;

describe('a ficha dos olhos está no jogo', () => {
    it('as doze expressões existem e nenhuma é cópia de outra', () => {
        expect(NOMES_DOS_OLHOS).toHaveLength(12);
        const impressoes = NOMES_DOS_OLHOS.map(n => JSON.stringify(OLHOS[n]));
        expect(new Set(impressoes).size).toBe(12);
    });
    it('nenhum número sai da faixa que o pincel sabe desenhar', () => {
        for (const n of NOMES_DOS_OLHOS) {
            const o = OLHOS[n];
            expect(o.palpebraCima).toBeGreaterThanOrEqual(-0.2);
            expect(o.palpebraCima).toBeLessThanOrEqual(1);
            expect(o.palpebraBaixo).toBeGreaterThanOrEqual(0);
            expect(o.palpebraBaixo).toBeLessThanOrEqual(1);
            expect(Math.abs(o.olharX)).toBeLessThanOrEqual(1);
            expect(Math.abs(o.olharY)).toBeLessThanOrEqual(1);
            expect(Math.abs(o.anguloDaPalpebra)).toBeLessThanOrEqual(45);
            expect(o.pupila).toBeGreaterThanOrEqual(0);
            expect(o.pupila).toBeLessThanOrEqual(1);
        }
    });
});

// ── A REGRA DE OURO ──────────────────────────────────────────────────────────
// O GLB já vem com os olhos pintados. Desenhar por cima é COBRIR, e cobrir a
// cara do personagem sem ninguém pedir foi o defeito que atravessou quatro
// voltas com o nariz. Este teste é o que impede a repetição.
describe('o repouso é a cara que o modelo JÁ TEM', () => {
    it('o olho parado não desenha nada por cima: sem pálpebra, sem pupila, sem espiral', () => {
        const o = OLHOS[OLHO_EM_REPOUSO];
        expect(o.palpebraCima).toBe(0);
        expect(o.palpebraBaixo).toBe(0);
        expect(o.olharX).toBe(0);
        expect(o.olharY).toBe(0);
        expect(o.pupila).toBe(0);
        expect(o.espiral).toBe(false);
        expect(o.fechado).toBe(false);
    });
});

describe('a piscada é involuntária, e por isso tem relógio só dela', () => {
    it('NÃO cai no compasso do fervilhar nem da fala', () => {
        // Piscar no mesmo passo do resto entrega o truque: a cara inteira
        // pulsando junto lê como luz de aviso, não como personagem.
        expect(PISCADA_HZ).not.toBe(BOIL_HZ);
        expect(INTERVALO_DA_PISCADA % (1 / BOIL_HZ)).not.toBe(0);
    });
    it('ele passa a esmagadora maioria do tempo de olho aberto', () => {
        let fechados = 0;
        const passos = 2000;
        for (let i = 0; i < passos; i++) {
            if (quadroDaPiscada((i / passos) * INTERVALO_DA_PISCADA * 6) >= 0) fechados++;
        }
        expect(fechados / passos).toBeLessThan(0.2);
        expect(fechados).toBeGreaterThan(0);
    });
    it('a piscada é rápida — desenho animado, não sono', () => {
        expect(DURACAO_DA_PISCADA).toBeLessThan(0.4);
        expect(INTERVALO_DA_PISCADA).toBeGreaterThan(1.5);
    });
    it('os quatro quadros vão de aberto a fechado, sem voltar no meio', () => {
        expect(PISCADA).toHaveLength(QUADROS_DA_PISCADA);
        for (let i = 1; i < PISCADA.length; i++) {
            expect(PISCADA[i]).toBeGreaterThan(PISCADA[i - 1]);
        }
        expect(PISCADA[0]).toBe(0);
        expect(PISCADA[PISCADA.length - 1]).toBe(1);
    });
    it('piscar fecha o olho, venha ele de onde vier', () => {
        for (const n of NOMES_DOS_OLHOS) {
            const fim = olhoPiscando(OLHOS[n], QUADROS_DA_PISCADA - 1);
            expect(fim.fechado).toBe(true);
        }
    });
    it('e não ABRE um olho que já estava mais fechado que o quadro', () => {
        const meio = olhoPiscando(OLHOS.semicerrado, 1);
        expect(meio.palpebraCima).toBeGreaterThanOrEqual(OLHOS.semicerrado.palpebraCima);
    });
    it('quadro ou tempo estranho não trava a cara', () => {
        for (const q of [-5, 1e9, 2.7]) {
            expect(() => olhoPiscando(OLHOS.neutro, q)).not.toThrow();
        }
        for (const t of [-1, NaN, Infinity]) expect(quadroDaPiscada(t)).toBe(-1);
    });
    it('a fase desencontra dois personagens na mesma tela', () => {
        const juntos = [0, 0.05, 0.1, 0.15].map(t => quadroDaPiscada(t, 0) === quadroDaPiscada(t, 0.5));
        expect(juntos.some(x => !x)).toBe(true);
    });
});

describe('olho e sobrancelha seguem o MESMO arco do andar', () => {
    it('todo momento devolve um olho e uma sobrancelha que existem', () => {
        for (const m of MOMENTOS) {
            for (let r = 0; r <= 3; r++) {
                expect(NOMES_DOS_OLHOS).toContain(olhoDoDiabrete(m, r));
                expect(NOMES_DAS_SOBRANCELHAS).toContain(sobrancelhaDoDiabrete(m, r));
            }
        }
    });
    it('contagem fora da faixa não quebra a cara', () => {
        expect(olhoDoDiabrete('provoca', 99)).toBe(olhoDoDiabrete('provoca', 3));
        expect(olhoDoDiabrete('provoca', -2)).toBe(olhoDoDiabrete('provoca', 0));
        expect(sobrancelhaDoDiabrete('provoca', 99)).toBe(sobrancelhaDoDiabrete('provoca', 3));
    });
    it('ele se APRESENTA irônico — é a primeira cara que o jogador vê', () => {
        expect(olhoDoDiabrete('apresentacao', 0)).toBe('malicia');
        expect(sobrancelhaDoDiabrete('apresentacao', 0)).toBe('ironia');
        expect(SOBRANCELHA_EM_REPOUSO).toBe('ironia');
    });
    it('pendurado no abismo ele NÃO está de cara de deboche', () => {
        expect(olhoDoDiabrete('suplica', 3)).toBe('arregalado');
        expect(sobrancelhaDoDiabrete('suplica', 3)).toBe('preocupada');
    });
    it('nenhuma forma da ficha fica na gaveta', () => {
        const olhos = new Set<NomeDoOlho>();
        const cenhos = new Set<string>();
        for (const m of MOMENTOS) {
            for (let r = 0; r <= 3; r++) {
                olhos.add(olhoDoDiabrete(m, r));
                cenhos.add(sobrancelhaDoDiabrete(m, r));
            }
        }
        // As de olhar (esquerda/direita/cima) e a piscada vêm do movimento, não
        // do arco — então só se cobra que a MAIORIA seja alcançável pelo arco.
        expect(olhos.size).toBeGreaterThanOrEqual(8);
        expect(cenhos.size).toBeGreaterThanOrEqual(7);
    });
});

describe('a assimetria é o que faz a ironia', () => {
    it('a sobrancelha de ironia tem um lado mais alto que o outro', () => {
        expect(SOBRANCELHAS.ironia.assimetria).toBeGreaterThan(0.2);
    });
    it('e a de raiva NÃO — raiva é simétrica, ironia é torta', () => {
        expect(SOBRANCELHAS.raiva.assimetria).toBe(0);
        expect(SOBRANCELHAS.surpresa.assimetria).toBe(0);
    });
    it('raiva desce a ponta de dentro; preocupação desce a de fora', () => {
        expect(SOBRANCELHAS.raiva.angulo).toBeGreaterThan(0);
        expect(SOBRANCELHAS.bravaComRuga.angulo).toBeGreaterThan(0);
        expect(SOBRANCELHAS.preocupada.angulo).toBeLessThan(0);
    });
    it('e a pálpebra fala a mesma língua que a sobrancelha', () => {
        // Mesmo sinal, mesma emoção: sem isso as duas peças brigariam e alguém
        // teria de manter uma tabela de tradução entre elas.
        expect(OLHOS.bravo.anguloDaPalpebra).toBeGreaterThan(0);
        expect(OLHOS.triste.anguloDaPalpebra).toBeLessThan(0);
    });
});

describe('as oito sobrancelhas da ficha existem', () => {
    it('e nenhuma é cópia de outra', () => {
        expect(NOMES_DAS_SOBRANCELHAS).toHaveLength(8);
        const impressoes = NOMES_DAS_SOBRANCELHAS.map(n => JSON.stringify(SOBRANCELHAS[n]));
        expect(new Set(impressoes).size).toBe(8);
    });
    it('e nenhuma sai da testa', () => {
        for (const n of NOMES_DAS_SOBRANCELHAS) {
            const s = SOBRANCELHAS[n];
            expect(s.altura).toBeGreaterThan(0);
            expect(s.altura).toBeLessThan(0.8);
            expect(s.grossura).toBeGreaterThan(0.05);
            expect(Math.abs(s.angulo)).toBeLessThanOrEqual(45);
        }
    });
});
