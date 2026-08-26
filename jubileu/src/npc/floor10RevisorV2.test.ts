// ── O v2 TEM QUE SER ESCOLHÍVEL PELA URL, E RECONHECIDO COMO TREINADO ────
//
// Dois contratos que já quebraram no dia em que o v2 entrou, e os dois falham
// em SILÊNCIO — o jogo responde pior sem dar erro, que é o modo de falha mais
// caro de achar:
//
//   1. `?pipeline&revisor=v2` precisa das duas chaves convivendo. Elas são
//      lidas da mesma `location.search` por funções diferentes, e nada além
//      deste teste garante que continuem convivendo.
//
//   2. `pensa: true` sobe o orçamento de 40 para 100 tokens. Sem essa marca o
//      corte cai DENTRO do bloco de pensamento e ele nunca chega a dizer a
//      frase: a tela mostra vazio e parece modelo quebrado.
import { describe, it, expect, beforeEach } from 'vitest';
import { revisorEscolhido, revisorAtual, revisorCabeJuntoDoRascunhador } from './floor10Revisores';

describe('?pipeline com ?revisor=v2', () => {
    beforeEach(() => { (globalThis as any).__f10Revisor = undefined; });
    it('as duas chaves convivem na mesma URL', () => {
        (globalThis as any).location = { search: '?pipeline&revisor=v2' };
        expect(revisorEscolhido()).toBe('v2');
        expect(revisorAtual().cerebro).toBe('nilo-revisor-v2-08b');
        expect(revisorAtual().pensa).toBe(true);
    });
    it('vale para ?pipeline=jogo também', () => {
        (globalThis as any).location = { search: '?pipeline=jogo&revisor=v2' };
        expect(revisorEscolhido()).toBe('v2');
    });
    it('e ele cabe ao lado do rascunhador', () => {
        (globalThis as any).location = { search: '?revisor=v2' };
        expect(revisorCabeJuntoDoRascunhador()).toBe(true);
    });
});
