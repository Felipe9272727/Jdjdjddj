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
import { RASCUNHADORES, RASCUNHADOR_PADRAO } from '../npc/floor10Rascunhadores';
import { SMALL_BRAIN_CATALOG } from '../npc/floor10Brains';
import { quemDevoLigar } from '../npc/floor10Roteamento';

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
    // O corte para na PRÓXIMA declaração de topo, e não num nome específico:
    // a primeira versão fatiava até `buildFloor10CorrectionPrompt`, e no dia em
    // que uma função nova entrou entre as duas o teste passou a ler código que
    // não é o dele e reprovou por um `return ''` alheio. Fronteira que depende
    // de vizinho é fronteira que quebra sozinha.
    const inicio = motor.indexOf('async function falarRevisando');
    const proxima = motor.slice(inicio + 1).search(/\nexport (?:async )?(?:function|const) /);
    const funcao = motor.slice(inicio, proxima >= 0 ? inicio + 1 + proxima : undefined);

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
        // Baixar centenas de MB para ir mais rápido é o contrário de ir mais
        // rápido — e a cota deste jogo já recusou 2,07 GB uma vez, emudecendo
        // o Nilo.
        expect(funcao).toContain('reflexoJaCarregado()');
        expect(funcao).toContain('motorJaCarregado()');
        expect(funcao).toContain('vontadeJaCarregada()');
        expect(funcao).toContain('if (!dePe) return null;');
    });

    it('quem rascunha é ESCOLHA, não "quem estiver carregado"', () => {
        // ── O DEFEITO QUE A PERGUNTA DO DONO DO JOGO ACHOU ───────────────
        //
        // A primeira versão chamava o cérebro da vontade. Não era escolha: era
        // o modelo que por acaso estava de pé. E o acaso caiu no candidato que
        // não serve — o card do LFM2.5 declara `en, ar, zh, fr, de, ja, ko,
        // es`, sem português, e o Nilo fala português.
        expect(funcao).toContain('rascunhadorEscolhido()');
        expect(funcao).toContain("if (quem === 'nenhum') return null;");
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


describe('a lista de rascunhadores', () => {
    // Cada linha da nota saiu da metadata do repositório no Hugging Face, lida
    // no dia em que este arquivo foi escrito — não de memória. Estes testes
    // prendem as duas conclusões que MUDAM o código, para que uma reescrita
    // distraída não devolva o rascunho a um modelo que não fala a língua.
    it('o padrão é o único modelo DE PÉ durante a conversa', () => {
        // ── O PADRÃO ANTERIOR ERA UM NO-OP, E LEVOU UMA PERGUNTA PARA CAIR ──
        //
        // Eu tinha posto o motor (Qwen3-0.6B) como padrão chamando-o de "o que
        // já está no aparelho". É o contrário: `Floor10NpcChat` chama
        // `unloadFloor10MotorBrain()` ao ABRIR o chat, seguindo a tabela que o
        // dono do jogo escreveu — no chat ficam de pé a fala e a memória, a
        // vontade e o motor esperam. Durante uma conversa `motorJaCarregado()`
        // é `false` SEMPRE, e o caminho do rascunho nunca teria rodado.
        //
        // Os testes de fiação não pegavam isso: eles provam que a guarda
        // existe, não que ela alguma vez deixa passar.
        expect(RASCUNHADOR_PADRAO).toBe('reflexo');
    });

    it('e o padrão tem de ser alguém que a tabela de RAM deixa de pé no chat', () => {
        // A regra, escrita em `floor10Roteamento.quemDevoLigar`: no chat ficam
        // a FALA e a MEMÓRIA. A fala é o revisor — se ela rascunhar não há
        // atalho — e a memória é embedding, não escreve. Sobra o reflexo, que
        // é de outro motor (ONNX) e por isso não está naquela tabela.
        expect(quemDevoLigar(true)).toEqual(expect.arrayContaining(['fala', 'memoria']));
        expect(quemDevoLigar(true)).not.toContain('motor');
        expect(quemDevoLigar(true)).not.toContain('vontade');
    });

    it('o motor continua na lista, mas avisando que só serve fora do chat', () => {
        const motor = RASCUNHADORES.find((r) => r.id === 'motor');
        expect(motor?.nota).toContain('DESLIGADO durante a conversa');
    });

    it('e a lista registra que o LFM2.5 não declara português', () => {
        const vontade = RASCUNHADORES.find((r) => r.id === 'vontade');
        expect(vontade?.portugues).toContain('NÃO declara pt');
    });

    it('dá para desligar o rascunho inteiro e voltar ao 3B escrevendo', () => {
        // A régua contra a qual os outros são medidos precisa existir de
        // verdade, senão "ficou mais rápido" é uma frase sem denominador.
        expect(RASCUNHADORES.some((r) => r.id === 'nenhum')).toBe(true);
    });
});


describe('o candidato de terror que a busca achou', () => {
    const horror = SMALL_BRAIN_CATALOG.find((m) => m.id === 'llama32-horror');

    it('está no catálogo, alcançável sem recompilar', () => {
        // A porta é `?rascunhador=vontade&vontade=llama32-horror`: entrar pelo
        // catálogo da vontade evita um quarto motor wllama residente, que
        // custaria RAM no aparelho onde ela já falta.
        expect(horror).toBeTruthy();
    });

    it('é quantização, não fine-tune — e é isso que protege o português', () => {
        // Um fine-tune em terror INGLÊS poderia ter comido o português junto.
        // Uma imatrix não pode: os pesos continuam sendo os da Meta, muda só
        // quais deles a quantização preserva com mais fidelidade.
        expect(horror?.url).toContain('imat');
        expect(horror?.nota).toContain('imatrix');
    });

    it('e a nota avisa que ele NÃO foi medido na vontade', () => {
        // Ele entrou procurando rascunhador. Deixar isso implícito seria
        // convidar alguém a trocar a vontade por um modelo sem número nenhum
        // — e a vontade foi escolhida pelo dono do jogo, medindo.
        expect(horror?.nota).toContain('NÃO medido na vontade');
    });

    it('e não é Q4, porque este projeto mediu que Q4 despenca', () => {
        // 5/15 contra 14/15, medido aqui dentro, no Llama 3.2 1B.
        expect(horror?.url).toContain('Q6_K');
        expect(horror?.url).not.toContain('Q4');
    });
});
