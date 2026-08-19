import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    REVISORES, REVISOR_PADRAO, revisorEscolhido, revisorAtual,
    cerebroDoRevisor, definirRevisor, resetRevisorParaTestes,
} from '../npc/floor10Revisores';
import { SMALL_BRAIN_CATALOG } from '../npc/floor10Brains';
import {
    composicaoDaFila, bytesDaFila, pecaDaVontade, pecasEssenciais,
} from '../npc/floor10Composicao';

afterEach(() => resetRevisorParaTestes());

/**
 * ── UM CÉREBRO PEQUENO, NÃO DOIS ──────────────────────────────────────────
 *
 * A primeira versão desta escolha ACRESCENTAVA o Llama à fila, ao lado do
 * LFM2.5 — 2,27 GB de cérebro pequeno para usar um. O dono do jogo cortou:
 * "isso é burrice, não precisa baixar os dois; no ?revisor=llama deixe baixar
 * só o llama, e no pipeline normal, o lfm".
 *
 * Esta suíte prende a versão certa: a escolha troca QUAL arquivo desce, e a
 * fila continua com um cérebro pequeno só.
 */
describe('a escolha de revisor troca o arquivo, não acrescenta um', () => {
    const PIPE = '?pipeline';

    it('o padrão é o LFM2.5 — "por enquanto", e por deliberar melhor', () => {
        expect(REVISOR_PADRAO).toBe('lfm');
        expect(revisorEscolhido()).toBe('lfm');
        expect(cerebroDoRevisor()).toBe('lfm2-1b');
    });

    it('a fila tem UM cérebro pequeno, nas duas escolhas', () => {
        // Este é o teste que a versão anterior teria reprovado: lá eram dois.
        const conta = (busca: string) =>
            composicaoDaFila(busca).filter((p) => p.papel === 'vontade').length;
        expect(conta(PIPE)).toBe(1);
        definirRevisor('llama');
        expect(conta(PIPE)).toBe(1);
    });

    it('e trocar de revisor troca o TAMANHO da fila, não soma', () => {
        // Se somasse, a diferença seria +1,02 GB. Trocando, ela é a diferença
        // entre os dois arquivos: o Llama Q6 é 224 MB MENOR que o LFM2.5 Q8.
        const comLfm = bytesDaFila(PIPE);
        definirRevisor('llama');
        const comLlama = bytesDaFila(PIPE);
        expect(comLlama).toBeLessThan(comLfm);
        expect(comLfm - comLlama).toBe(1_246_253_888 - 1_021_800_576);
    });

    it('a peça mostra o modelo que vai MESMO descer', () => {
        expect(pecaDaVontade().bytes).toBe(1_246_253_888);
        definirRevisor('llama');
        expect(pecaDaVontade().label).toContain('Llama 3.2');
        expect(pecaDaVontade().bytes).toBe(1_021_800_576);
    });

    it('e ele continua NÃO sendo essencial', () => {
        // O rascunho só vai ao revisor quando o juiz marca alguma coisa. Fazer
        // a conversa esperar 1 GB por uma etapa opcional troca qualidade por
        // silêncio, e silêncio é o pior defeito deste andar.
        definirRevisor('llama');
        expect(pecaDaVontade().essencial).toBe(false);
        expect(pecasEssenciais(PIPE).some((p) => p.papel === 'vontade')).toBe(false);
    });

    it('cada escolha aponta um modelo que EXISTE no catálogo', () => {
        // Um id órfão não quebra compilação: o `find` falha, cai no fallback, e
        // a fila cobra por um arquivo enquanto o motor abre outro.
        for (const r of REVISORES) {
            expect(
                SMALL_BRAIN_CATALOG.some((m) => m.id === r.cerebro),
                `${r.id} aponta para ${r.cerebro}, que não está no catálogo`,
            ).toBe(true);
        }
    });

    it('id desconhecido não troca nada', () => {
        definirRevisor('llama');
        definirRevisor('nao-existe' as never);
        expect(revisorEscolhido()).toBe(REVISOR_PADRAO);
        expect(revisorAtual().cerebro).toBe('lfm2-1b');
    });
});

describe('`?revisor=` é quem escolhe o cérebro que desce', () => {
    const brains = readFileSync(new URL('../npc/floor10Brains.ts', import.meta.url), 'utf8');

    it('o leitor de URL consulta a escolha de revisor', () => {
        // Sem esta linha, `?revisor=llama` mudaria o rótulo na tela e baixaria
        // o LFM2.5 assim mesmo — a barra prometendo um arquivo e trazendo outro.
        expect(brains).toContain("new URLSearchParams(busca).has('revisor') ? cerebroDoRevisor() : null");
    });

    it('e `?vontade=` continua ganhando quando as duas aparecem', () => {
        // Ela nomeia um modelo do catálogo diretamente — é mais específica, e
        // existe desde antes para testar cérebros que nem são candidatos a
        // revisor.
        const linha = brains.slice(brains.indexOf('const pedido = new URLSearchParams'), brains.indexOf('if (!pedido) return null;'));
        expect(linha.indexOf("get('vontade')")).toBeLessThan(linha.indexOf("has('revisor')"));
    });
});

describe('a sala do ?pipeline mostra o modelo escolhido', () => {
    // ── DUAS LISTAS PARA A MESMA INSTALAÇÃO ──────────────────────────────
    //
    // `?revisor=llama` não mudou nada na primeira tentativa, e o relato foi
    // seco: "não mudou de revisor". A escolha estava ligada em
    // `composicaoDaFila` — a fila do JOGO — e esta sala tem lista PRÓPRIA, com
    // quatro peças fixas. Ela nunca leu de lá. O defeito de origem é haver duas
    // listas, e ele continua de pé; até virarem uma só, isto prende o mínimo.
    const sala = readFileSync(new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8');
    const inicio = sala.indexOf("id: 'revisor',");
    // A busca do fim parte do COMEÇO: um `indexOf` solto casava com o
    // `reportaProgresso` do tradutor, anterior ao bloco, e a fatia saía vazia —
    // as asserções passavam testando string vazia.
    const peca = sala.slice(inicio, sala.indexOf('reportaProgresso: true', inicio));

    it('a fatia lida é o bloco do revisor, e não vazio', () => {
        expect(inicio).toBeGreaterThan(-1);
        expect(peca.length).toBeGreaterThan(200);
    });

    it('o nome e o tamanho saem da ESCOLHA, não de um literal', () => {
        expect(peca).toContain('modeloDoRevisor().label');
        expect(peca).toContain('modeloDoRevisor().bytes');
    });

    it('e `modeloDoRevisor` resolve pelo catálogo, não por SMALL_BRAIN_MODEL', () => {
        // `SMALL_BRAIN_MODEL` é lido no topo do módulo, antes de a escolha ser
        // aplicada — a tela mostraria o padrão para sempre.
        const fn = sala.slice(sala.indexOf('function modeloDoRevisor'), sala.indexOf('function modeloDoRevisor') + 300);
        expect(fn).toContain('cerebroDoRevisor()');
        expect(fn).toContain('SMALL_BRAIN_CATALOG.find');
    });
});
