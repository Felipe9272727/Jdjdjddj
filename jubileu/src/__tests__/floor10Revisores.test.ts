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

/**
 * ── O FALCON-H1 COMO TERCEIRA OPÇÃO ───────────────────────────────────────
 *
 * Pedido do dono do jogo: "deixe ele como revisor (parecido de como a gente
 * fez com o llama, tipo pipeline revisor=falcon)".
 *
 * Ele entrou por medição, e a medição está no comentário da entrada: sete
 * modelos e cinco arquiteturas mediram o mesmo remendo, com a régua que reprova
 * eco e fragmento, e ele foi o único candidato NOVO que não colapsou.
 *
 * O que esta suíte prende é o que já quebrou antes: a escolha tem de trocar o
 * ARQUIVO que desce, e a fila tem de continuar com um cérebro pequeno só.
 */
describe('o Falcon-H1 entra como escolha de revisor', () => {
    it('está no catálogo, apontando para o Q6_K medido', () => {
        const alvo = SMALL_BRAIN_CATALOG.find((m) => m.id === 'falcon-h1-1.5b');
        expect(alvo).toBeDefined();
        expect(alvo?.url).toContain('Falcon-H1-1.5B-Instruct-Q6_K.gguf');
        // Conferido no arquivo baixado, não no card do repositório: um `bytes`
        // errado faz a barra de download mentir e a conta de espaço recusar
        // instalação que caberia.
        expect(alvo?.bytes).toBe(1_280_071_424);
    });

    it('?revisor=falcon troca o arquivo que desce, e não acrescenta um', () => {
        definirRevisor('falcon');
        expect(revisorEscolhido()).toBe('falcon');
        expect(cerebroDoRevisor()).toBe('falcon-h1-1.5b');
        expect(revisorAtual().label).toContain('Falcon');

        const peca = pecaDaVontade();
        expect(peca.bytes).toBe(1_280_071_424);
        // UM cérebro pequeno na fila, sempre. Ver a suíte acima.
        const pequenos = composicaoDaFila('?pipeline&revisor=falcon')
            .filter((p) => p.bytes === 1_280_071_424 || p.bytes === 1_246_253_888);
        expect(pequenos).toHaveLength(1);
    });

    it('continua fora do padrão — a diferença medida cabe no ruído', () => {
        // 8/12 contra 7/12 do titular, por 6 s a mais a frio. Este arquivo já
        // registra duas vezes o preço de trocar o titular por diferença que não
        // se repete (o Llama, o granite). A terceira não acontece por descuido.
        expect(REVISOR_PADRAO).toBe('lfm');
        expect(REVISORES.map((r) => r.id)).toContain('falcon');
    });
});
