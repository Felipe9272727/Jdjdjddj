import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { enunciadoDoRemendo, REMENDO_MAX_TOKENS, PERSONA_DO_REVISOR } from '../npc/floor10SmallBrain';
import { PERSONA_DO_RASCUNHO } from '../npc/floor10Rascunhador';

const real = readFileSync(new URL('../npc/floor10PipelineReal.ts', import.meta.url), 'utf8');

/**
 * A COSTURA entre a orquestração testada e o encanamento medido.
 *
 * O que estes testes protegem é o que não dá para ver rodando: quem chama quem,
 * em que ordem, e as invariantes que já custaram caro neste projeto.
 */
describe('as peças reais', () => {
    it('o pipeline NUNCA baixa nada na hora da fala', () => {
        // Baixar 822 MB para acelerar UMA resposta é o contrário de acelerar, e
        // a cota deste jogo já recusou 2,07 GB uma vez — o Nilo emudeceu.
        expect(real).toContain('rascunhadorJaCarregado()');
        expect(real).toContain('if (!pipelineDisponivel()) return null;');
    });

    it('as travas de superfície rodam ANTES do juiz de tom', () => {
        // Não é a economia de 10 ms que importa: uma frase já pega pela catraca
        // não precisa de segunda opinião, e o juiz de tom tem falso positivo.
        const i = real.indexOf('const t = travaQuePegou(f);');
        const j = real.indexOf('frasesForaDoTom(');
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });

    it('o revisor não é chamado se a vontade não estiver de pé', () => {
        // Um rascunho com uma frase torta é melhor que 30 s carregando revisor.
        //
        // ── E O PREDICADO ESTAVA MENTINDO ────────────────────────────────
        //
        // Era `vontadeJaCarregada()`, que responde
        // `enginePromise !== null || pesosNoAparelho` — e `baixarVontade` marca
        // `pesosNoAparelho = true`. Depois de apenas BAIXAR, ela já dizia "sim",
        // o pipeline passava, e `remendarFraseEmIngles` ia subir 1,25 GB no
        // meio da fala com o rascunhador residente. A tela do dono do jogo ficou
        // em "corrigindo uma frase…" para sempre.
        //
        // A intenção deste teste sempre foi a certa; o nome em que ele confiava
        // é que prometia mais do que entregava.
        expect(real).toContain('if (!vontadeDePeAgora()) return null;');
        // O que vale é o que ele IMPORTA — citar o nome antigo no comentário
        // que explica a troca é outra coisa, e a primeira versão deste teste
        // reprovou por isso.
        const imports = real.slice(0, real.indexOf('export const PECAS_REAIS'))
            .split('\n').filter((l) => l.includes("from './floor10SmallBrain'")
                || l.includes('remendarFraseEmIngles')).join('\n');
        expect(imports).not.toContain('vontadeJaCarregada');
    });

    it('e o revisor tem prazo, porque era a última peça que podia pendurar', () => {
        expect(real).toMatch(/comPrazo\(\s*remendarFraseEmIngles/);
    });

    it('e o erro do pipeline nunca sobe — sempre vira null', () => {
        const i = real.indexOf('export async function falarPeloPipelineReal');
        expect(real.slice(i)).toMatch(/catch[\s\S]*return null;/);
    });

    it('a caixa-preta registra o que decide o desenho', () => {
        // `marcadas` é o número que diz se o pipeline paga: o ponto de
        // equilíbrio é o juiz aprovar 17% dos rascunhos.
        expect(real).toContain("anotar('pipeline:fim'");
        for (const campo of ['marcadas', 'remendadas', 'limpezas']) {
            expect(real).toContain(campo);
        }
    });
});

describe('o enunciado do remendo', () => {
    it('cita a frase e NÃO pede número de volta', () => {
        // `7b8a2889`: pedir duas coisas na mesma resposta ("qual está errada E
        // escreva a substituta") fez o modelo deslocar índices e contradizer a
        // si mesmo, 3 de 3. Aqui há um grau de liberdade só.
        const e = enunciadoDoRemendo('Who are you?', 'I live in the elevator.');
        expect(e).toContain('"I live in the elevator."');
        expect(e).toMatch(/One sentence/i);
        expect(e).not.toMatch(/number|índice|\bFIX\b/i);
    });

    it('o teto é de uma frase', () => {
        // Doze tokens bastaram nos três casos medidos; 40 dá folga sem convidar
        // o modelo a escrever parágrafo.
        expect(REMENDO_MAX_TOKENS).toBeLessThanOrEqual(40);
    });
});

describe('as duas personas', () => {
    it('rascunhador e revisor medem contra o MESMO cânone', () => {
        // Se divergirem, o revisor "conserta" frases certas para outra coisa.
        for (const fato of ['not inside the elevator', 'never left', 'does not obey', 'no label']) {
            expect(PERSONA_DO_RASCUNHO).toMatch(new RegExp(fato, 'i'));
            expect(PERSONA_DO_REVISOR).toMatch(new RegExp(fato, 'i'));
        }
    });

    it('as duas em inglês', () => {
        expect(PERSONA_DO_REVISOR).not.toMatch(/\bvocê\b/i);
    });
});
