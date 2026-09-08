/**
 * f3Boca.test.ts — a ficha do Felipe, cobrada.
 *
 * Ele mandou dezoito bocas com nome e oito expressões de uso. Isto verifica que
 * o jogo tem todas, que nenhuma é cópia de outra, e — a parte que é personagem e
 * não desenho — que a cara dele segue o mesmo arco que o chão, a voz e a trilha
 * já seguem.
 *
 * O que ISTO não julga: se a boca desenhada parece a da ficha. Isso é olho, e
 * foi conferido na foto (bancada `ver-o-diabrete.mjs`, vistas `boca-*`).
 */

import { describe, it, expect } from 'vitest';
import {
    BOCAS, NOMES_DAS_BOCAS, BOCA_EM_REPOUSO, BOCA_HZ,
    bocaDaNota, expressaoDoDiabrete, bocaNoInstante, quadroDaBoca,
    type MomentoExtra,
    type NomeDaBoca,
} from './f3Boca';
import { vozDoDiabrete } from './f3Voz';
import { BOIL_HZ } from './f3Tinta';

describe('a ficha inteira está no jogo', () => {
    it('as dezoito bocas existem', () => {
        expect(NOMES_DAS_BOCAS).toHaveLength(18);
        for (const n of NOMES_DAS_BOCAS) expect(BOCAS[n]).toBeTruthy();
    });
    it('cada uma tem desenho: ou contorno fechado, ou traço', () => {
        for (const n of NOMES_DAS_BOCAS) {
            const f = BOCAS[n];
            expect(f.caminho.length + f.traco.length).toBeGreaterThan(2);
            // aberta = contorno cheio; fechada = traço. Nunca as duas coisas.
            expect(f.cheia ? f.caminho.length > 0 : f.traco.length > 0).toBe(true);
        }
    });
    it('nenhuma boca é cópia de outra — dezoito nomes, dezoito desenhos', () => {
        const impressoes = NOMES_DAS_BOCAS.map(n => JSON.stringify(BOCAS[n]));
        expect(new Set(impressoes).size).toBe(18);
    });
    it('nada sai do quadro normalizado', () => {
        for (const n of NOMES_DAS_BOCAS) {
            for (const p of [...BOCAS[n].caminho, ...BOCAS[n].traco]) {
                expect(Math.abs(p.x)).toBeLessThanOrEqual(1.0001);
                expect(Math.abs(p.y)).toBeLessThanOrEqual(1.0001);
            }
        }
    });
});

describe('o repouso é metade do personagem', () => {
    it('parado ele NÃO está neutro — a ficha diz Irônico e Travesso', () => {
        expect(BOCA_EM_REPOUSO).toBe('sorrisoIronico');
        expect(BOCA_EM_REPOUSO).not.toBe('neutra');
    });
    it('e o sorriso irônico é torto, que é o que faz ele ser irônico', () => {
        expect(Math.abs(BOCAS.sorrisoIronico.inclinacao)).toBeGreaterThan(4);
    });
});

describe('falar não é piscar', () => {
    it('as duas bocas de fala se alternam', () => {
        const seq = [0, 1, 2, 3, 4].map(i => bocaDaNota(i, false));
        expect(new Set(seq).size).toBe(2);
        expect(seq[0]).not.toBe(seq[1]);
    });
    it('a palavra em CAIXA ALTA abre mais que as outras', () => {
        expect(bocaDaNota(0, true)).toBe('deboche');
        expect(bocaDaNota(0, true)).not.toBe(bocaDaNota(0, false));
    });
});

describe('a boca segue a MESMA partitura que o trombone', () => {
    const frase = 'Olha o TRAÇO! Espinho fresquinho, saindo do forno!';
    const voz = vozDoDiabrete(frase, { roubados: 0 });

    it('antes da fala e depois dela, a cara é a de repouso', () => {
        expect(bocaNoInstante(voz, -0.2, 'sorrisoIronico')).toBe('sorrisoIronico');
        expect(bocaNoInstante(voz, voz.total + 0.5, 'sorrisoIronico')).toBe('sorrisoIronico');
    });
    it('durante a fala, a boca se mexe em toda nota', () => {
        const vistas = new Set<NomeDaBoca>();
        for (const b of voz.blats) vistas.add(bocaNoInstante(voz, b.t + 0.001, 'neutra'));
        expect(vistas.size).toBeGreaterThan(1);
        expect(vistas.has('neutra')).toBe(false);   // nenhuma nota fica de boca fechada
    });
    it('o acento da frase cai na boca de acento', () => {
        const i = voz.blats.findIndex(b => b.acento);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(bocaNoInstante(voz, voz.blats[i].t + 0.001, 'neutra')).toBe('deboche');
    });
    it('fala sem nota nenhuma não trava a cara', () => {
        expect(bocaNoInstante({ ...voz, blats: [] }, 0.5, 'triste')).toBe('triste');
    });
});

describe('a cara segue o arco do andar', () => {
    it('ele começa dono do lugar e termina assustado', () => {
        expect(expressaoDoDiabrete('apresentacao', 0)).toBe('sorrisoIronico');
        expect(expressaoDoDiabrete('suplica', 3)).toBe('assustado');
    });
    it('perder pincel piora a cara dele, nunca melhora', () => {
        const ordem: NomeDaBoca[] = ['sorrisoIronico', 'deboche', 'empolgado', 'feliz',
            'bravo', 'irritado', 'assustado', 'triste'];
        const pior = (n: NomeDaBoca) => ordem.indexOf(n);
        for (const momento of ['desenhou', 'provoca', 'roubou'] as const) {
            for (let r = 1; r <= 3; r++) {
                expect(pior(expressaoDoDiabrete(momento, r)))
                    .toBeGreaterThanOrEqual(pior(expressaoDoDiabrete(momento, r - 1)));
            }
        }
    });
    it('espetar o jogador é gozação, não desespero — mesmo já tendo perdido', () => {
        // Cobra a INTENÇÃO, não a forma exata: esta asserção fixava
        // 'empolgado' e quebrou quando o vocabulário se abriu e o espetar com o
        // andar inteiro passou a ser 'feliz'. Teste de intenção sobrevive ao
        // ajuste; teste de valor literal vira atrito.
        const gozacao: NomeDaBoca[] = ['feliz', 'empolgado', 'deboche', 'sorrisoIronico', 'sorriso'];
        expect(gozacao).toContain(expressaoDoDiabrete('espetou', 0));
        expect(expressaoDoDiabrete('espetou', 3)).not.toBe('assustado');
        expect(expressaoDoDiabrete('espetou', 3)).not.toBe('triste');
    });
    it('contagem fora da faixa não quebra a cara', () => {
        expect(expressaoDoDiabrete('provoca', 99)).toBe(expressaoDoDiabrete('provoca', 3));
        expect(expressaoDoDiabrete('provoca', -2)).toBe(expressaoDoDiabrete('provoca', 0));
    });
});

describe('a boca é tinta, não interpolação', () => {
    it('troca no mesmo 8 Hz do resto do andar', () => {
        expect(BOCA_HZ).toBe(BOIL_HZ);
        expect(quadroDaBoca(0.4)).toBe(quadroDaBoca(0.49));
        expect(quadroDaBoca(0.4)).not.toBe(quadroDaBoca(0.55));
    });
});

// ── NENHUMA FORMA DA FICHA FICA NA GAVETA ────────────────────────────────────
// O dono do jogo jogou e disse "tem poucas expressões". Estava certo: as
// dezoito estavam desenhadas e o jogo usava seis. Forma que nunca aparece é
// conteúdo morto — a mesma classe de defeito que `f3Coerencia` varre no andar.
describe('as dezoito formas são alcançáveis em jogo', () => {
    const MOMENTOS = ['apresentacao', 'desenhou', 'espetou', 'roubou', 'provoca',
        'caiu', 'suplica', 'ocioso', 'quaseLaEmCima', 'perdeuOPrimeiro',
        'perdeuOUltimo', 'tonto', 'pensando', 'confuso', 'vitorioso',
        'derrotado'] as const;

    it('toda forma da ficha tem pelo menos um momento que a produz', () => {
        const alcancadas = new Set<NomeDaBoca>();
        for (const m of MOMENTOS) {
            for (let r = 0; r <= 3; r++) alcancadas.add(expressaoDoDiabrete(m as MomentoExtra, r));
        }
        // as duas de fala vêm da partitura, não da expressão
        alcancadas.add(bocaDaNota(0, false));
        alcancadas.add(bocaDaNota(1, false));
        alcancadas.add(bocaDaNota(0, true));

        const naGaveta = NOMES_DAS_BOCAS.filter(n => !alcancadas.has(n));
        expect(naGaveta).toEqual([]);
    });

    it('e cada momento devolve uma forma que existe de verdade', () => {
        for (const m of MOMENTOS) {
            for (let r = 0; r <= 3; r++) {
                expect(NOMES_DAS_BOCAS).toContain(expressaoDoDiabrete(m as MomentoExtra, r));
            }
        }
    });
});
