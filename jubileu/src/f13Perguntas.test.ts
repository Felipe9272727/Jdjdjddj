import { describe, it, expect } from 'vitest';
import { novoEstado13 } from './f13Mundo';
import { CASAS, CASA_CERTA, NPCS } from './f13Lore';
import { assuntosDe, perguntar, citar, citaveis, perguntas, sabeDe, CONVERSA } from './f13Perguntas';

describe('Perguntas Afiadas', () => {
    it('todo morador (menos Halvard) oferece 3 assuntos: sensível, dica e sabor', () => {
        for (const n of NPCS) {
            if (n.id === 'halvard') { expect(assuntosDe(n.id)).toEqual([]); continue; }
            const tipos = Object.values(CONVERSA[n.id]!).map((x) => x!.tipo).sort();
            expect(tipos).toEqual(['dica', 'sabor', 'sensivel']);
        }
    });
    it('assunto sensível emite aoSuspeitar', () => {
        const visto: string[] = [];
        const off = perguntas.aoSuspeitar.on((q, a) => visto.push(`${q}:${a}`));
        const e = novoEstado13();
        expect(perguntar(e, 'brokk', 'halvard')!.tipo).toBe('sensivel');
        perguntar(e, 'brokk', 'barulho');
        off();
        expect(visto).toEqual(['brokk:halvard']);
    });
    it('a dica só corrobora quando o jogador já tem a pista', () => {
        const e = novoEstado13();
        const sem = perguntar(e, 'eira', 'casa')!.falas[0].texto;
        e.pistas.add('botao');
        expect(perguntar(e, 'eira', 'casa')!.falas[0].texto).not.toBe(sem);
    });
    it('perguntar não altera as pistas', () => {
        const e = novoEstado13();
        for (const n of NPCS) for (const a of assuntosDe(n.id)) perguntar(e, n.id, a);
        expect(e.pistas.size).toBe(0);
    });
    it('citar: quem sabe confirma, quem não sabe diz que não sabe, sem pista não cita', () => {
        const e = novoEstado13();
        expect(citaveis(e)).toEqual([]);
        e.pistas.add('latao');
        expect(sabeDe('brokk', 'latao')).toBe(true);
        expect(citar(e, 'brokk', 'latao')[0].texto).toMatch(/botão/);
        expect(citar(e, 'eira', 'latao')[0].texto).toMatch(/não sei/i);
        expect(citar(e, 'eira', 'botao')[0].texto).toMatch(/não sei/i);
    });
    it('a casa certa nunca é apontada como errada nos detalhes', () => {
        const e = novoEstado13();
        e.pistas.add('latao'); e.pistas.add('fumaca'); e.pistas.add('botao');
        const errada = CASAS.map((c, i) => i).filter((i) => i !== CASA_CERTA).map((i) => CASAS[i].runa);
        const detalhe = citar(e, 'astrid', 'latao')[0].texto;
        // as runas ditas como descartadas (fogo/luto) não são a certa
        expect(detalhe).not.toContain(`a ${CASAS[CASA_CERTA].runa} tem fogo`);
        expect(errada.length).toBe(6);
    });
});
