import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    GRAMATICA_DO_REMENDO,
    MAXIMO_DE_FRASES,
    aplicarRemendos,
    blocoDeRevisao,
    enumerarFrases,
    lerVeredito,
    listaParaRevisao,
    remendoInutil,
    remendosQueValem,
} from '../npc/floor10Remendo';

// ── A CONTA QUE JUSTIFICA ESTE MÓDULO ─────────────────────────────────────
//
// Medido no aparelho do dono do jogo: fala a 1 token por segundo, e uma tela
// dizendo "Pensando localmente… 142s". Uma resposta de quarenta tokens custa
// quarenta segundos SÓ de geração, e o teto é 96.
//
// Reescrever tudo quando uma frase está errada é pagar o preço inteiro por um
// defeito parcial. Este módulo é o formato que deixa o 3B trocar uma frase.

const RASCUNHO = 'Sou Nilo Azevedo, ex-técnico de elevadores. '
    + 'Estou preso no 10º andar. '
    + 'O hotel vai encerrar amanhã.';

describe('quebrar o rascunho em frases apontáveis', () => {
    it('numera a partir de 1, na ordem', () => {
        const frases = enumerarFrases(RASCUNHO);
        expect(frases.map((f) => f.n)).toEqual([1, 2, 3]);
        expect(frases[2].texto).toBe('O hotel vai encerrar amanhã.');
    });

    it('a lista que o revisor lê tem uma frase por linha', () => {
        expect(listaParaRevisao(enumerarFrases(RASCUNHO)))
            .toBe('1. Sou Nilo Azevedo, ex-técnico de elevadores.\n'
                + '2. Estou preso no 10º andar.\n'
                + '3. O hotel vai encerrar amanhã.');
    });

    it('rascunho sem pontuação nenhuma continua sendo UMA frase', () => {
        expect(enumerarFrases('não sei o que dizer')).toEqual([
            { n: 1, texto: 'não sei o que dizer' },
        ]);
    });

    it('vazio não vira frase fantasma', () => {
        expect(enumerarFrases('')).toEqual([]);
        expect(enumerarFrases('   ')).toEqual([]);
    });

    it('além do nono, o texto GRUDA em vez de sumir', () => {
        // ── POR QUE ISTO IMPORTA ─────────────────────────────────────────
        //
        // A gramática aponta um dígito só. Uma frase 10 existiria na lista e
        // não existiria na gramática: o revisor a leria sem ter como reprová-la
        // — pior que não a mostrar. Descartar também não serve: seria apagar
        // texto do Nilo sem ninguém decidir isso.
        const doze = Array.from({ length: 12 }, (_, i) => `Frase número ${i + 1}.`).join(' ');
        const frases = enumerarFrases(doze);
        expect(frases).toHaveLength(MAXIMO_DE_FRASES);
        expect(frases.at(-1)!.texto).toContain('Frase número 12.');
        // E a costura devolve tudo o que entrou.
        for (let i = 1; i <= 12; i += 1) {
            expect(aplicarRemendos(frases, [])).toContain(`Frase número ${i}.`);
        }
    });
});

describe('ler o veredito do revisor', () => {
    it('OK aprova sem remendo nenhum', () => {
        expect(lerVeredito('OK', 3)).toEqual({ aprovado: true, remendos: [], motivo: '' });
        expect(lerVeredito('  ok\n', 3).aprovado).toBe(true);
    });

    it('FIX troca só a frase apontada', () => {
        const v = lerVeredito('FIX 3: Não sei quanto tempo este lugar ainda dura.\n', 3);
        expect(v.aprovado).toBe(false);
        expect(v.remendos).toEqual([
            { n: 3, texto: 'Não sei quanto tempo este lugar ainda dura.' },
        ]);
    });

    it('duas correções numa resposta só', () => {
        const v = lerVeredito('FIX 1: Sou Nilo.\nFIX 3: O hotel continua de pé.\n', 3);
        expect(v.remendos.map((r) => r.n)).toEqual([1, 3]);
    });

    it('índice fora do rascunho é RECUSADO, não vira texto torto', () => {
        // É esta a propriedade que fez escolher frase numerada em vez de diff:
        // o erro do modelo é verificável contra o rascunho, aqui, de graça.
        const v = lerVeredito('FIX 7: frase que não existe\n', 3);
        expect(v.remendos).toEqual([]);
        expect(v.aprovado).toBe(true);
        expect(v.motivo).toBe('veredito ilegível');
    });

    it('correção vazia é recusada', () => {
        expect(lerVeredito('FIX 2:   \n', 3).remendos).toEqual([]);
    });

    it('a mesma frase apontada duas vezes conta uma', () => {
        const v = lerVeredito('FIX 2: primeira.\nFIX 2: segunda.\n', 3);
        expect(v.remendos).toEqual([{ n: 2, texto: 'primeira.' }]);
    });

    it('revisor mudo ou ilegível APROVA, e diz que foi por isso', () => {
        // A escolha certa, e vale escrever por quê: o rascunho já passou pelas
        // checagens determinísticas de quem chama. Reprovar por não ter
        // entendido o revisor trocaria uma resposta provavelmente boa por mais
        // um minuto de espera no aparelho dele.
        expect(lerVeredito('', 3)).toEqual({
            aprovado: true, remendos: [], motivo: 'revisor mudo',
        });
        expect(lerVeredito('acho que está bom, parabéns', 3).aprovado).toBe(true);
        expect(lerVeredito('acho que está bom, parabéns', 3).motivo).toBe('veredito ilegível');
    });
});

describe('costurar o rascunho com o remendo', () => {
    it('o que NÃO foi apontado sai igual ao que entrou', () => {
        // A propriedade que separa este desenho de "gerar tudo de novo" — e é
        // literalmente o que foi pedido: sem ter que apagar tudo.
        const frases = enumerarFrases(RASCUNHO);
        const final = aplicarRemendos(frases, [{ n: 3, texto: 'O hotel segue de pé.' }]);
        expect(final).toBe('Sou Nilo Azevedo, ex-técnico de elevadores. '
            + 'Estou preso no 10º andar. '
            + 'O hotel segue de pé.');
    });

    it('sem remendo, devolve o rascunho', () => {
        expect(aplicarRemendos(enumerarFrases(RASCUNHO), [])).toBe(RASCUNHO);
    });

    it('remendo que só reescreve a mesma coisa é descartado', () => {
        // Custa tokens, não conserta nada e faz o registro mentir dizendo que
        // houve conserto.
        const frases = enumerarFrases(RASCUNHO);
        const disfarcado = [{
            n: 1, texto: 'Sou o Nilo Azevedo, um ex-técnico de elevadores.',
        }];
        expect(remendoInutil(frases[0].texto, disfarcado[0].texto)).toBe(true);
        expect(remendosQueValem(frases, disfarcado)).toEqual([]);
        // E um conserto de verdade passa.
        const real = [{ n: 3, texto: 'Não faço ideia de quando isso acaba.' }];
        expect(remendosQueValem(frases, real)).toEqual(real);
    });
});

describe('a gramática que impede o revisor de inventar formato', () => {
    it('só deixa sair OK ou linhas FIX', () => {
        expect(GRAMATICA_DO_REMENDO).toContain('root ::= aprovado | correcoes');
        expect(GRAMATICA_DO_REMENDO).toContain('aprovado ::= "OK"');
    });

    it('a quebra de linha vai ESCAPADA, e não crua', () => {
        // ── O ERRO QUE NENHUM TESTE DE STRING PEGAVA ─────────────────────
        //
        // Escrito como quebra de verdade dentro de um literal da GBNF, o parser
        // do worker recusa a gramática inteira, `createChatCompletion` estoura
        // e o `catch` de quem chama devolve null EM SILÊNCIO. Aconteceu neste
        // projeto, no `floor10MotorCortex`, e a string "parecia certa".
        const literais = GRAMATICA_DO_REMENDO.match(/"[^"]*"/g) ?? [];
        expect(literais.length).toBeGreaterThan(0);
        for (const literal of literais) {
            expect(literal, `literal com quebra crua: ${JSON.stringify(literal)}`)
                .not.toMatch(/\n/);
        }
        expect(GRAMATICA_DO_REMENDO).toContain('\\n');
    });

    it('o dígito da gramática cobre exatamente as frases que a lista mostra', () => {
        // Duas metades que precisam concordar: a gramática aceita [1-9] e a
        // lista para de numerar em MAXIMO_DE_FRASES. Se alguém mexer numa e
        // esquecer a outra, o revisor fica sem como apontar a última frase.
        expect(GRAMATICA_DO_REMENDO).toContain('digito ::= [1-9]');
        expect(MAXIMO_DE_FRASES).toBe(9);
    });
});

describe('o enunciado da revisão', () => {
    const bloco = blocoDeRevisao('quem sou eu?', enumerarFrases(RASCUNHO));

    it('mostra o rascunho numerado e a pergunta do jogador', () => {
        expect(bloco).toContain('3. O hotel vai encerrar amanhã.');
        expect(bloco).toContain('quem sou eu?');
    });

    it('diz ao 3B que não é a vez dele de falar', () => {
        // Sem isto ele responde a pergunta do jogador em vez de revisar — que é
        // o modo dele desde sempre, e o mais caro que existe aqui.
        expect(bloco).toContain('NÃO É SUA VEZ DE FALAR');
        expect(bloco).toContain('Não reescreva o rascunho inteiro');
    });

    it('e começa com quebra de linha, para colar NO FIM do prompt que já existe', () => {
        // Não é estilo, é dinheiro: o llama.cpp reaproveita o maior prefixo
        // comum entre uma chamada e a seguinte, e é daí que vêm os "515
        // reaproveitados" do cabeçalho. Revisão antes da persona invalidaria o
        // prefixo a cada fala e recobraria o prefill inteiro.
        expect(bloco.startsWith('\n')).toBe(true);
    });
});


describe('a fiação do rascunho dentro do motor', () => {
    // ── POR QUE ESTES TESTES LEEM O FONTE ─────────────────────────────────
    //
    // Exercitar `falarRevisando` de verdade exigiria dois wllama de mentira, um
    // coordenador falso e um watchdog de mentira. O que se quer prender aqui
    // não é o comportamento das peças — isso está nos 21 testes acima — e sim
    // as CONDIÇÕES em que o caminho novo tem permissão de existir. Cada uma
    // delas foi escrita por um motivo, e sumir com qualquer uma volta a
    // introduzir um defeito conhecido.
    const motor = readFileSync(new URL('../npc/wllamaEngine.ts', import.meta.url), 'utf8');
    const funcao = motor.slice(
        motor.indexOf('async function falarRevisando'),
        motor.indexOf('export function buildFloor10CorrectionPrompt'),
    );

    it('existe e é chamada antes da geração normal', () => {
        expect(funcao.length).toBeGreaterThan(0);
        const chamada = motor.indexOf('await falarRevisando(');
        const geracaoNormal = motor.indexOf('isFloor10IdentityQuestion(text)\n');
        expect(chamada).toBeGreaterThan(0);
        expect(chamada, 'o rascunho tem de ser tentado ANTES do 3B escrever')
            .toBeLessThan(geracaoNormal);
    });

    it('pedido corporal NUNCA passa pelo rascunho', () => {
        // "Me segue": só a decisão verbal do 3B vira ação, pelo marcador
        // `[[WILL:…]]` que o cérebro pequeno não conhece. Um rascunho dessa fala
        // dá um Nilo que concorda por escrito e não sai do lugar — e a resposta
        // na tela parece perfeita, que é o que torna o defeito traiçoeiro.
        expect(funcao).toContain('hasFloor10PhysicalActionCue(text)');
    });

    it('não baixa modelo nenhum para acelerar uma resposta', () => {
        // Baixar 1,25 GB para ir mais rápido é o contrário de ir mais rápido.
        expect(funcao).toContain('vontadeJaCarregada()');
    });

    it('o texto costurado ainda passa pelas checagens determinísticas', () => {
        // O 3B não deixa de ser a autoridade: um rascunho que ele aprovou por
        // engano morre aqui como morreria uma fala escrita por ele mesmo.
        expect(funcao).toContain('floor10ReplyIssue(costurado');
        expect(funcao).toContain('if (problema) return null;');
    });

    it('e o costurado passa pelo mesmo conserto de fala do caminho normal', () => {
        expect(funcao).toContain('arrumarFala(aplicarRemendos(');
    });

    it('a revisão vai como ÚLTIMA mensagem, não colada no prompt de sistema', () => {
        // É onde está o dinheiro: o llama.cpp reaproveita o maior prefixo
        // comum. Mexer no sistema recobraria o prefill de tudo, inclusive do
        // histórico; como última mensagem, só o rascunho é novo.
        expect(funcao).toContain('extraUser: blocoDeRevisao(');
        expect(motor).toContain("role: 'user' as const, content: revisao.extraUser");
    });

    it('o revisor sai preso na gramática e com teto curto', () => {
        expect(funcao).toContain('grammar: GRAMATICA_DO_REMENDO');
        expect(funcao).toContain('maxTokens: REVISAO_MAX_TOKENS');
    });

    it('e todo desvio devolve null — nenhum vira erro na tela', () => {
        // Nunca ficar pior que hoje é requisito, não elegância: um NPC que
        // emudece porque a otimização falhou é pior que um NPC lento.
        const saidas = funcao.match(/return [^;]+;/g) ?? [];
        for (const saida of saidas) {
            expect(saida, `saída que não é null nem o texto pronto: ${saida}`)
                .toMatch(/return (null|costurado);/);
        }
        expect(funcao).not.toContain('throw ');
    });
});
