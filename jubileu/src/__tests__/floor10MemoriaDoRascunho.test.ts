import { describe, expect, it } from 'vitest';
import { FLOOR10_CANON } from '../npc/floor10Canon';
import { CANONE_EM_INGLES, fatosValidos } from '../npc/floor10CanoneEmIngles';
import { memoriaDoRascunho, turnoDoRascunho } from '../npc/floor10MemoriaDoRascunho';
import { quebrasDeCanone } from '../npc/floor10CanoneDoNilo';

describe('o cânone em inglês acompanha o cânone', () => {
    it('tem exatamente os mesmos fatos, pelo id', () => {
        expect(CANONE_EM_INGLES.map((f) => f.id).sort())
            .toEqual(FLOOR10_CANON.map((f) => f.id).sort());
    });

    // Se um fato do cânone quebrasse as regras do próprio cânone, o
    // rascunhador leria uma instrução e produziria a violação — e o revisor
    // depois reprovaria a frase que o prompt mandou escrever.
    it('nenhum fato quebra as regras que o revisor aplica', () => {
        for (const f of CANONE_EM_INGLES) {
            const quebras = quebrasDeCanone(f.texto).map((q) => q.regra);
            // A ÚNICA exceção tolerada: o fato do andar NEGA o cenário ("no
            // corridor, no window"), e a regra do revisor pega a palavra, não a
            // negação. Qualquer outra quebra é defeito de verdade — foi assim
            // que apareceu o `company` de "I want company", que reprovava a
            // fala mais do Nilo que existe.
            const semNegacao = quebras.filter((r) => r !== 'inventa cenário que não existe');
            expect({ id: f.id, quebras: semNegacao }).toEqual({ id: f.id, quebras: [] });
        }
    });
});

describe('a memória do rascunho', () => {
    it('devolve vazio quando nada casa', () => {
        expect(memoriaDoRascunho('zzz qqq xxx')).toBe('');
    });

    it('acha o fato do elevador quando a pergunta é do elevador', () => {
        const bloco = memoriaDoRascunho('will the elevator come if I press the button?');
        expect(bloco).toContain('never once obeyed me');
    });

    it('prefere o que a memória por significado lembrou', () => {
        const bloco = memoriaDoRascunho('anything', { id: 'past', fact: 'ignorado' });
        expect(bloco).toContain('night maintenance');
    });

    // O ponto do `lugar`: quando o Nilo sair do 10º, os fatos DELE continuam e
    // os do andar saem de cena sem que ninguém edite o cânone.
    it('esconde o fato do andar quando o andar não está na lista de lugares', () => {
        const bloco = memoriaDoRascunho('what is this room like?', null, []);
        expect(bloco).not.toContain('grate floor');
    });

    it('mantém os fatos do Nilo em qualquer lugar', () => {
        expect(fatosValidos([]).map((f) => f.id)).toContain('past');
        expect(fatosValidos([]).map((f) => f.id)).not.toContain('floor10');
    });
});

describe('o turno do rascunho', () => {
    it('não muda a pergunta quando não há memória', () => {
        expect(turnoDoRascunho('Are you real?', '')).toBe('Are you real?');
    });

    it('põe a memória ANTES da pergunta', () => {
        const t = turnoDoRascunho('Are you real?', 'What you know that matters here: X');
        expect(t.indexOf('What you know')).toBeLessThan(t.indexOf('Are you real?'));
    });
});
