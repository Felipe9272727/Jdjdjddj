import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    REVISORES, REVISOR_PADRAO, revisorEscolhido, revisorAtual,
    cerebroDoRevisor, definirRevisor, resetRevisorParaTestes,
} from '../npc/floor10Revisores';
import { SMALL_BRAIN_CATALOG } from '../npc/floor10Brains';
import { composicaoDaFila, bytesDaFila, pecaDoRevisor, pecasEssenciais } from '../npc/floor10Composicao';

afterEach(() => resetRevisorParaTestes());

/**
 * ── A ESCOLHA DE REVISOR ──────────────────────────────────────────────────
 *
 * Pedido do dono do jogo: "coloca o llama como revisor — eu quero que deixe
 * como opção no pipeline, colocar o llama ou o lfm, aí vc escolhe, e entra na
 * linha única de download". As duas metades são testadas aqui, e a segunda é a
 * que tem armadilha: os dois candidatos não custam o mesmo em disco.
 */
describe('os dois candidatos a revisor', () => {
    it('o padrão é o que NÃO baixa nada', () => {
        // 1,02 GB numa fila que já tem 4,2 GB é decisão de quem baixa. Este
        // projeto já derrubou o celular do dono do jogo com download e já viu a
        // cota recusar 2,07 GB e emudecer o Nilo.
        expect(REVISOR_PADRAO).toBe('lfm');
        expect(revisorEscolhido()).toBe('lfm');
        expect(revisorAtual().bytesExtras).toBe(0);
    });

    it('o padrão NÃO tem cérebro próprio — é o mesmo arquivo da vontade', () => {
        // `null` aqui é o que faz a peça sumir da fila e o motor não trocar de
        // arquivo ao mudar de papel.
        expect(cerebroDoRevisor()).toBeNull();
    });

    it('`llama` aponta para um modelo que EXISTE no catálogo', () => {
        // Um id órfão não quebra compilação: `brainAtual()` não acha, cai no
        // fallback e o revisor volta a ser a vontade — em silêncio, com a fila
        // tendo cobrado 1,02 GB por um arquivo que ninguém usa.
        definirRevisor('llama');
        const id = cerebroDoRevisor();
        expect(id).toBe('llama32-1b-q6');
        expect(SMALL_BRAIN_CATALOG.some((m) => m.id === id)).toBe(true);
    });

    it('e os bytes da escolha batem com os do modelo no catálogo', () => {
        // Dois números para o mesmo arquivo: um na fila (o que a barra promete)
        // e outro no catálogo (o que de fato desce). Divergir é a barra mentir.
        const entrada = REVISORES.find((r) => r.id === 'llama')!;
        const modelo = SMALL_BRAIN_CATALOG.find((m) => m.id === entrada.cerebro)!;
        expect(entrada.bytesExtras).toBe(modelo.bytes);
    });

    it('id desconhecido não troca nada', () => {
        definirRevisor('llama');
        definirRevisor('nao-existe' as never);
        expect(revisorEscolhido()).toBe(REVISOR_PADRAO);
    });
});

describe('a fila única aprende a contar o revisor', () => {
    const PIPE = '?pipeline';

    it('com o padrão, a peça não existe e a fila não muda de tamanho', () => {
        expect(pecaDoRevisor()).toBeNull();
        expect(composicaoDaFila(PIPE).some((p) => p.papel === 'revisor')).toBe(false);
    });

    it('com `llama`, a peça entra e a barra cobra o 1,02 GB', () => {
        // É ISTO que "entra na linha única de download" quer dizer: um download
        // de 1 GB fora da conta é a barra mentindo — o defeito exato que a fila
        // única foi criada para acabar.
        const semLlama = bytesDaFila(PIPE);
        definirRevisor('llama');
        const peca = pecaDoRevisor();
        expect(peca?.papel).toBe('revisor');
        expect(composicaoDaFila(PIPE).some((p) => p.papel === 'revisor')).toBe(true);
        expect(bytesDaFila(PIPE) - semLlama).toBe(1_021_800_576);
    });

    it('e ele NÃO é essencial — a conversa não espera por um remendo', () => {
        // Mesma razão da vontade: o rascunho só vai ao revisor quando o juiz
        // marca alguma coisa, e sem ele a frase marcada segue como está. Fazer
        // a conversa esperar 1 GB por uma etapa opcional troca qualidade por
        // silêncio, e silêncio é o pior defeito deste andar.
        definirRevisor('llama');
        expect(pecaDoRevisor()?.essencial).toBe(false);
        expect(pecasEssenciais(PIPE).some((p) => p.papel === 'revisor')).toBe(false);
    });

    it('fora do pipeline ele não entra nem escolhido', () => {
        definirRevisor('llama');
        expect(composicaoDaFila('').some((p) => p.papel === 'revisor')).toBe(false);
    });
});

describe('um motor, dois papéis, às vezes dois arquivos', () => {
    const fonte = readFileSync(new URL('../npc/floor10SmallBrain.ts', import.meta.url), 'utf8');

    it('trocar de papel DESCARREGA antes, quando o arquivo muda', () => {
        // Dois modelos de ~1 GB vivos ao mesmo tempo é literalmente como o
        // aparelho do dono do jogo desligou.
        expect(fonte).toContain('if (brainAtual().id !== antes) await unloadSmallBrain();');
    });

    it('e NÃO descarrega quando o arquivo é o mesmo', () => {
        // No padrão os dois papéis são o mesmo arquivo. Descarregar aí seria
        // jogar fora 1,25 GB já abertos para recarregar os mesmos 1,25 GB.
        expect(fonte).toContain('const antes = brainAtual().id;');
        expect(fonte).toContain("if (papelDoMotor === papel) return;");
    });

    it('os pesos baixados são rastreados POR MODELO, não por um booleano', () => {
        // ── O DEFEITO QUE ISTO IMPEDE ────────────────────────────────────
        //
        // Com um `pesosNoAparelho` global, baixar a vontade marcava "já tenho"
        // e o download do revisor saía pela porta dos fundos na primeira linha
        // de `baixarVontade`. A barra fechava, o arquivo nunca descia, e a
        // falha só apareceria minutos depois, na hora de abrir o modelo.
        expect(fonte).toContain('const pesosBaixados = new Set<string>()');
        expect(fonte).toContain('pesosBaixados.has(SMALL_BRAIN_MODEL.id)');
        // A DECLARAÇÃO, na coluna zero — e não a palavra solta. A primeira
        // versão desta linha era `not.toContain('let pesosNoAparelho')` e
        // reprovou casando com o COMENTÁRIO logo acima do conjunto, que cita o
        // código antigo para explicar o defeito. Já aconteceu antes neste
        // repositório: asserção de fonte que lê prosa em vez de código.
        expect(fonte).not.toMatch(/^let pesosNoAparelho/m);
    });

    it('baixarRevisor não baixa nada quando o revisor é a própria vontade', () => {
        expect(fonte).toContain("if (cerebroDoRevisor() === null) return true;");
    });
});

// ── DUAS LISTAS PARA A MESMA INSTALAÇÃO ───────────────────────────────────
//
// `?revisor=llama` não mudou nada na primeira tentativa, e o relato foi seco:
// "não mudou de revisor". A escolha estava ligada em `composicaoDaFila` — a
// fila do JOGO — e a sala do `?pipeline` tem lista PRÓPRIA, com quatro peças
// fixas e o modelo da vontade escrito no meio. Ela nunca leu de lá.
//
// O defeito de origem é haver duas listas. Até virarem uma só, esta suíte
// prende o mínimo: a segunda tem de responder às mesmas perguntas que a
// primeira responde.
describe('a sala do ?pipeline obedece à escolha de revisor', () => {
    const sala = readFileSync(new URL('../Floor10PipelineSala.tsx', import.meta.url), 'utf8');
    // A fatia procura o fim A PARTIR do começo. A primeira versão usava um
    // `indexOf` solto e pegava o `reportaProgresso` do TRADUTOR, que vem antes:
    // a fatia saía vazia e as asserções passavam a testar string vazia — o
    // silêncio mais perigoso que um teste de fonte pode ter.
    const inicio = sala.indexOf("id: 'revisor',");
    const peca = sala.slice(inicio, sala.indexOf('reportaProgresso: true', inicio));

    it('a fatia lida é o bloco do revisor, e não vazio', () => {
        expect(inicio).toBeGreaterThan(-1);
        expect(peca.length).toBeGreaterThan(200);
    });

    it('o nome e o tamanho saem da ESCOLHA, não de um literal', () => {
        expect(peca).toContain('modeloDoRevisor().label');
        expect(peca).toContain('modeloDoRevisor().bytes');
    });

    it('e baixa pelo caminho que conhece o arquivo próprio', () => {
        // `baixarVontade` desce o modelo da VONTADE. Com `?revisor=llama` o
        // arquivo é outro, e a barra fecharia sem ter baixado o que promete.
        expect(peca).toContain('carregar: baixarRevisor');
    });

    it('modeloDoRevisor NÃO pode depender do papel corrente do motor', () => {
        // `SMALL_BRAIN_MODEL` responde ao papel que o motor está servindo, e no
        // momento em que a lista é montada o papel ainda é 'vontade' — a tela
        // mostraria o arquivo errado até alguém remendar uma frase.
        const fn = sala.slice(sala.indexOf('function modeloDoRevisor'), sala.indexOf('const PALAVRA') > 0
            ? sala.indexOf('const PALAVRA') : sala.indexOf('function modeloDoRevisor') + 600);
        expect(fn).toContain('cerebroDoRevisor()');
        expect(fn).toContain('SMALL_BRAIN_CATALOG.find');
    });

    it('e o detalhe diz ao jogador se aquilo custa download novo', () => {
        // A diferença entre "é o mesmo arquivo da vontade" e "arquivo próprio"
        // é 1,02 GB do plano de dados dele.
        expect(peca).toContain('cerebroDoRevisor() === null');
        expect(peca).toContain('arquivo próprio');
    });
});
