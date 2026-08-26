import { describe, it, expect, vi } from 'vitest';
import {
    falarPeloPipeline, limparFrase, enumerarEmIngles, pipelineLigado,
    aplicarRemendo, primeiraFraseFechada, comAsQuebrasDeCanone,
    type PassoDoPipeline, type PecasDoPipeline,
 semRaciocinio,} from '../npc/floor10Pipeline';
import { bateuNoTeto, semACaudaCortada } from '../npc/floor10Rascunhador';

/** Açúcar: marcar frases sem repetir o motivo em todo teste que não é sobre ele. */
const marca = (...ns: number[]) => async () => ns.map((n) => ({ n, porque: '' }));

/** Açúcar: o desfecho feliz do revisor, que é o que quase todo teste quer. */
const frase = (texto: string) => async () => ({ tipo: 'frase' as const, texto, cortado: false });

/**
 * A ORQUESTRAÇÃO do pipeline, testada sem baixar 1 GB.
 *
 * As peças entram por parâmetro justamente para isto: o que precisa ser
 * protegido é a ORDEM (juiz antes da tradução), o comportamento quando cada
 * peça falha, e a regra que me custou 60 segundos numa medição — defeito de
 * forma nunca vai ao revisor.
 */
const pecas = (over: Partial<PecasDoPipeline> = {}): PecasDoPipeline => ({
    rascunhar: async () => 'I am Nilo. The door does not obey me.',
    julgar: marca(),
    remendar: frase('A patched sentence.'),
    traduzir: async (t) => `PT<${t}>`,
    ...over,
});

describe('falarPeloPipeline', () => {
    it('caminho feliz: juiz não marca, revisor nem é chamado', () => expect((async () => {
        const remendar = vi.fn(frase('nunca'));
        const r = await falarPeloPipeline('Who are you?', pecas({ remendar }));
        expect(remendar).not.toHaveBeenCalled();
        expect(r?.marcadas).toBe(0);
        expect(r?.fala).toContain('I am Nilo.');
        return true;
    })()).resolves.toBe(true));

    it('o JUIZ roda ANTES da tradução — é em inglês que ele enxerga', async () => {
        const ordem: string[] = [];
        await falarPeloPipeline('Who are you?', pecas({
            julgar: async (f) => { ordem.push(`julgar:${f[0]}`); return []; },
            traduzir: async (t) => { ordem.push('traduzir'); return t; },
        }));
        // Se a tradução viesse antes, o juiz veria português — onde ele mede
        // 0,29 de contradição contra 0,94 em inglês, no mesmo par de frases.
        expect(ordem[0]).toMatch(/^julgar:I am Nilo/);
        expect(ordem[1]).toBe('traduzir');
    });

    it('remenda SÓ a frase marcada, e conta certo', async () => {
        const r = await falarPeloPipeline('Who are you?', pecas({
            julgar: marca(2),
            remendar: frase('It never opens.'),
        }));
        expect(r?.marcadas).toBe(1);
        expect(r?.remendadas).toBe(1);
        expect(r?.fala).toContain('I am Nilo.');
        expect(r?.fala).toContain('It never opens.');
        expect(r?.fala).not.toContain('does not obey');
    });

    it('remendo que devolve a MESMA frase não conta como troca', async () => {
        // Foi o que o SmolLM3 fez em 2 de 3: devolveu a frase intacta com
        // "(No correction needed)". Contar isso como conserto inflaria o placar
        // e esconderia que o revisor não serve para o posto.
        const r = await falarPeloPipeline('Who are you?', pecas({
            julgar: marca(1),
            remendar: frase('I am Nilo.'),
        }));
        expect(r?.marcadas).toBe(1);
        expect(r?.remendadas).toBe(0);
    });

    it('índice fora da lista é ignorado, não quebra', async () => {
        // O juiz do 3B chegou a apontar a "frase 4" de um rascunho com duas.
        const r = await falarPeloPipeline('Who are you?', pecas({ julgar: marca(9, 0) }));
        expect(r?.remendadas).toBe(0);
        expect(r?.fala).toBeTruthy();
    });

    it('qualquer peça falhando devolve null — nunca um erro na tela', async () => {
        for (const quebrada of [
            { rascunhar: async () => null },
            { rascunhar: async () => '   ' },
            { traduzir: async () => null },
            { traduzir: async () => '' },
        ] as Partial<PecasDoPipeline>[]) {
            expect(await falarPeloPipeline('Who are you?', pecas(quebrada))).toBeNull();
        }
    });

    it('juiz que falha (lista vazia) deixa o rascunho passar', async () => {
        // Não julgar custa o que já custava; marcar por engano custa ~11,6 s de
        // revisor por fala. O lado certo do erro é deixar passar.
        const r = await falarPeloPipeline('Who are you?', pecas({ julgar: marca() }));
        expect(r?.fala).toBeTruthy();
        expect(r?.marcadas).toBe(0);
    });
});

/**
 * ── BUG OU ESCOLHA: A PERGUNTA QUE ESTE BLOCO FECHA ──────────────────────
 *
 * O relato foi, olhando a tela: *"ele simplesmente decide não mudar — será um
 * bug, ou uma escolha?"*. Era bug, e a tela não tinha como dizer: quatro
 * desfechos com preços e culpados diferentes chegavam como o mesmo `null`.
 *
 * O que denunciou foi o RELÓGIO — 45,6 s e 30,6 s, com o teto do revisor em
 * 25 s. Uma guarda recusando custa 0,0 s; quem gasta meio minuto trabalhou, e
 * o `WllamaAbortError` subia sem o texto parcial. Daqui para a frente a
 * diferença é verificável sem modelo, sem celular e sem captura de tela.
 */
describe('o desfecho do remendo diz de QUEM é a culpa', () => {
    const antes = 'I am just a guest trapped in this elevator.';

    it('frase diferente é troca', () => {
        expect(aplicarRemendo(antes, { tipo: 'frase', texto: 'I am on the tenth floor.', cortado: false }))
            .toEqual({ tipo: 'trocou', depois: 'I am on the tenth floor.' });
    });

    it('a MESMA frase é ESCOLHA dele, e tem nome próprio', () => {
        // Não é `vazio` nem `cortado`: ele leu, achou bom e não mexeu. Custou
        // o preço cheio, e é legítimo. Confundir isto com falha foi o que fez a
        // pergunta existir.
        expect(aplicarRemendo(antes, { tipo: 'frase', texto: antes, cortado: false }))
            .toEqual({ tipo: 'manteve' });
    });

    it('e a comparação acontece DEPOIS da limpeza', () => {
        // Senão `"Nilo: <a mesma frase>"` passaria por remendo — o revisor
        // ganharia crédito por ter colado um rótulo.
        expect(aplicarRemendo(antes, { tipo: 'frase', texto: `Nilo: ${antes}`, cortado: false }))
            .toEqual({ tipo: 'manteve' });
    });

    it('os quatro modos de falha passam INTEIROS, cada um com seu nome', () => {
        // O ponto do tipo: nenhum deles vira `null` no caminho.
        for (const r of [
            { tipo: 'sem-revisor' },
            { tipo: 'vazio' },
            { tipo: 'cortado', parcial: 'I am on the ten' },
            { tipo: 'erro', erro: 'WllamaError: inference_error' },
        ] as const) {
            expect(aplicarRemendo(antes, r)).toEqual(r);
        }
    });

    it('e nenhum deles mexe no texto — a frase original segue', async () => {
        for (const r of [
            { tipo: 'sem-revisor' },
            { tipo: 'vazio' },
            { tipo: 'cortado', parcial: 'It nev' },
            { tipo: 'erro', erro: 'x' },
        ] as const) {
            const passos: PassoDoPipeline[] = [];
            const saida = await falarPeloPipeline('Who are you?', pecas({
                julgar: marca(2),
                remendar: async () => r,
            }), (p) => passos.push(p));
            expect(saida?.remendadas, r.tipo).toBe(0);
            expect(saida?.fala, r.tipo).toContain('does not obey');
            const remendo = passos.find((p) => p.passo === 'remendo');
            expect(remendo?.passo === 'remendo' && remendo.desfecho.tipo, r.tipo).toBe(r.tipo);
        }
    });
});

// ── O MOTIVO TEM DE CHEGAR AO REVISOR ─────────────────────────────────────
//
// Toda a mudança vale por isto, e é um fio fácil de cortar sem perceber: o
// juiz calcula o motivo, o orquestrador o repassa, o revisor o usa. Se
// qualquer um dos três parar de carregar o `porque`, nada quebra — o revisor
// só volta a trabalhar às cegas, consertando 2 de 6 em vez de 4 de 6, e
// ninguém fica sabendo até a próxima medição com modelo de verdade.
describe('o que o juiz viu chega a quem vai consertar', () => {
    it('o motivo da frase marcada é entregue ao revisor', async () => {
        const vistos: string[] = [];
        await falarPeloPipeline('Who are you?', pecas({
            julgar: async () => [{ n: 2, porque: 'it gives the player advice.' }],
            remendar: async (_p, _f, porque) => {
                vistos.push(porque);
                return { tipo: 'frase', texto: 'It never opens.', cortado: false };
            },
        }));
        // O motivo da marcação vem PRIMEIRO e intacto. O que vem depois é o
        // resto da fala, para ele não repetir o que as outras frases já
        // disseram — ver `comOResto`.
        expect(vistos).toHaveLength(1);
        expect(vistos[0].startsWith('it gives the player advice.')).toBe(true);
        expect(vistos[0]).toContain('already says');
    });

    it('cada frase leva o SEU motivo, não o da vizinha', async () => {
        const pares: string[] = [];
        await falarPeloPipeline('Who are you?', pecas({
            julgar: async () => [
                { n: 1, porque: 'motivo da um' },
                { n: 2, porque: 'motivo da dois' },
            ],
            remendar: async (_p, frase, porque) => {
                pares.push(`${frase} :: ${porque}`);
                return { tipo: 'sem-revisor' };
            },
        }));
        expect(pares).toHaveLength(2);
        expect(pares[0].startsWith('I am Nilo. :: motivo da um')).toBe(true);
        expect(pares[1].startsWith('The door does not obey me. :: motivo da dois')).toBe(true);
        // E o resto que cada uma recebe é o das OUTRAS, nunca a própria: mandar
        // a frase junto do aviso "não repita isto" faria o revisor fugir da
        // única coisa que ele tem de reescrever.
        expect(pares[0]).not.toContain('already says: "I am Nilo."');
        expect(pares[0]).toContain('"The door does not obey me."');
        expect(pares[1]).toContain('"I am Nilo."');
    });

    it('motivo vazio passa como vazio — sem inventar nada no caminho', async () => {
        // O juiz de tom pode marcar sem âncora vencedora. O honesto é o revisor
        // receber '' e cair no enunciado antigo, e não o orquestrador preencher
        // com um palpite que ninguém apurou. (O palpite ERRADO, esse, foi
        // medido e é barato: 2/6 e 0/3 estragou, igual a ir às cegas.)
        const vistos: string[] = [];
        await falarPeloPipeline('Who are you?', pecas({
            julgar: async () => [{ n: 1, porque: '' }],
            remendar: async (_p, _f, porque) => {
                vistos.push(porque);
                return { tipo: 'sem-revisor' };
            },
        }));
        // Vazio na FRENTE: nada de `Also,` solto disfarçado de motivo. O que
        // chega é só o fato verificável — o que as outras frases dizem.
        expect(vistos).toHaveLength(1);
        expect(vistos[0].startsWith('Also,')).toBe(false);
        expect(vistos[0].startsWith('The rest of the reply already says:')).toBe(true);
    });
});

describe('primeiraFraseFechada — parar na frase pedida, e salvar o que deu tempo', () => {
    it('para na primeira, mesmo quando ele já começou a segunda', () => {
        // O enunciado pede UMA frase; ele escreve duas assim mesmo, e cada
        // token da segunda é tempo do jogador no celular.
        expect(primeiraFraseFechada('The door is there. It never opens for me.'))
            .toBe('The door is there.');
    });

    it('devolve null enquanto a frase não fechou — é o sinal de "continue lendo"', () => {
        expect(primeiraFraseFechada('The door is the')).toBeNull();
        expect(primeiraFraseFechada('')).toBeNull();
    });

    it('e "Mr." não vira frase, mas o texto não é descartado por causa dele', () => {
        // O piso de 12 caracteres pula o ponto cedo demais e CONTINUA
        // procurando; descartar seria jogar fora uma frase boa.
        expect(primeiraFraseFechada('Mr. Azevedo never came back.'))
            .toBe('Mr. Azevedo never came back.');
    });

    it('aceita ! ? e reticências, e a aspa depois do ponto', () => {
        expect(primeiraFraseFechada('It never opens! Never.')).toBe('It never opens!');
        expect(primeiraFraseFechada('Who runs this place? No idea.')).toBe('Who runs this place?');
        expect(primeiraFraseFechada('"I do not know that." he said')).toBe('"I do not know that."');
    });
});

describe('limparFrase — defeito de FORMA nunca vai ao revisor', () => {
    it('tira o rótulo, as aspas e o eco do prompt', () => {
        // Numa medição eu mandei um `"Nilo: "` ao revisor: 60 segundos para
        // tirar um prefixo, e ele devolveu o rótulo de volta. Aquele caso
        // sozinho respondeu por 60 dos 87 segundos do pipeline.
        expect(limparFrase('Nilo: Well, it never comes.').texto).toBe('Well, it never comes.');
        expect(limparFrase('"The door is shut."').texto).toBe('The door is shut.');
        expect(limparFrase("I wait. Nilo's line only, no label.").texto).toBe('I wait.');
    });

    it('avisa quando mexeu, para o placar saber o que foi de graça', () => {
        expect(limparFrase('Nilo: hi').mudou).toBe(true);
        expect(limparFrase('The door is shut.').mudou).toBe(false);
    });
});

describe('enumerarEmIngles', () => {
    it('quebra em frases e limita a 4', () => {
        expect(enumerarEmIngles('One. Two! Three? Four. Five.')).toHaveLength(4);
    });

    it('descarta fragmento curto demais para julgar', () => {
        expect(enumerarEmIngles('I am here. a. Ok.')).not.toContain('a.');
    });
});

describe('pipelineLigado', () => {
    it('DESLIGADO por padrão', () => {
        // ~950 MB de download novo e três modos de falha novos, nada disso
        // medido no aparelho de quem joga. Cinco técnicas já ganharam nesta
        // bancada e perderam lá.
        expect(pipelineLigado('')).toBe(false);
        expect(pipelineLigado('?bancada')).toBe(false);
    });

    it('`?pipeline` liga', () => {
        expect(pipelineLigado('?pipeline')).toBe(true);
        expect(pipelineLigado('?fresh=1&pipeline')).toBe(true);
    });
});

describe('copiar o exemplo não é consertar', () => {
    // Relato do aparelho, com o rascunhador remendando: ele devolveu "I have
    // not been anywhere else." — a linha corrigida do Exemplo 1 do enunciado,
    // letra por letra. Não quebra cânone: é fala boa do Nilo. E não é conserto,
    // porque o defeito apontado continua lá.
    //
    // A conferência existia na BANCADA e faltava no JOGO — o mesmo defeito de
    // origem que já apareceu três vezes aqui: uma verdade em dois lugares.
    it('recusa a linha do exemplo, mesmo sendo uma fala boa', () => {
        const d = aplicarRemendo('I went downstairs to check.', {
            tipo: 'frase', texto: 'I have not been anywhere else.', cortado: false,
        });
        expect(d.tipo).toBe('recusado');
    });

    it('recusa o andaime do enunciado devolvido como fala', () => {
        for (const t of ['Wrong line: "I never left."', 'The player asked: "Are you real?"']) {
            expect(aplicarRemendo('qualquer coisa', { tipo: 'frase', texto: t, cortado: false }).tipo)
                .toBe('recusado');
        }
    });

    it('e deixa passar um conserto de verdade que só PARECE com o exemplo', () => {
        const d = aplicarRemendo('I went downstairs to check the lobby.', {
            tipo: 'frase',
            texto: 'I stopped counting the days I have spent in this grey room.',
            cortado: false,
        });
        expect(d.tipo).toBe('trocou');
    });
});

describe('o raciocínio não é a fala', () => {
    // O Huihui-MoE devolve `<think>…</think>` antes da frase, e o remendo nunca
    // tratou disso porque nenhum revisor pensava. Sem isto, o raciocínio ia
    // inteiro para o tradutor e para a tela do jogador.
    it('devolve só o que vem depois do fechamento', () => {
        expect(semRaciocinio("<think>\nOkay, let's see. The user wants…\n</think>\nI keep my distance."))
            .toBe('I keep my distance.');
    });

    it('bloco aberto e nunca fechado é VAZIO, não meio pensamento', () => {
        // O teto de tokens cortou no meio. Devolver o pedaço seria pôr
        // "Okay, let's see. The user wants me to" na boca do Nilo.
        expect(semRaciocinio("<think>\nOkay, let's see. The user wants me to")).toBe('');
    });

    it('texto sem raciocínio passa intacto', () => {
        expect(semRaciocinio('It opens when it wants to.')).toBe('It opens when it wants to.');
    });
});

/**
 * ── O CÂNONE MARCA O RASCUNHO, E ANTES SÓ REPROVAVA O REMENDO ─────────────
 *
 * Medido no pipeline inteiro, com o juiz de tom de pé: duas falas foram à tela
 * com quebra clara e ZERO marcações, porque o tom estava impecável e tom não é
 * cânone. As duas regras existiam e só eram consultadas depois do revisor.
 */
describe('o cânone marca o rascunho', () => {
    it('marca a frase que põe o Nilo dentro do elevador', () => {
        const frases = ['We are in a hotel elevator, on the 10th floor.', 'It is quiet.'];
        const m = comAsQuebrasDeCanone(frases, []);
        expect(m.map((x) => x.n)).toEqual([1]);
        expect(m[0].porque).toContain('10th FLOOR');
    });

    it('marca a negação de ser gente', () => {
        const m = comAsQuebrasDeCanone(['No, I am not real.'], []);
        expect(m).toHaveLength(1);
        expect(m[0].porque).toContain('human being');
    });

    it('não marca fala boa', () => {
        expect(comAsQuebrasDeCanone(['The elevator does not obey me.', 'I have looked.'], []))
            .toEqual([]);
    });

    // Duas fontes, uma marcação: dois pedidos para a mesma frase custariam dois
    // remendos, e o revisor lê melhor os dois motivos juntos.
    it('junta o motivo do juiz com o do cânone numa marcação só', () => {
        const m = comAsQuebrasDeCanone(
            ['No, I am not real.'],
            [{ n: 1, porque: 'it sounds like a machine.' }],
        );
        expect(m).toHaveLength(1);
        expect(m[0].porque).toContain('it sounds like a machine.');
        expect(m[0].porque).toContain('Also,');
    });
});

/**
 * ── O MESMO REMENDO DUAS VEZES NÃO VAI PARA A TELA ────────────────────────
 *
 * Medido: duas frases marcadas na mesma fala receberam o MESMO remendo, e o
 * jogador leu "As portas abriram-se, saí e fecharam-se." duas vezes seguidas.
 * O revisor não erra sozinho — ele responde dois pedidos parecidos sem lembrar
 * do primeiro. Na dúvida fica a original: frase fora de tom é ruim, frase
 * repetida quebra a ilusão de que tem alguém falando.
 */
describe('remendo repetido', () => {
    it('recusa o segundo e mantém a frase original', async () => {
        const r = await falarPeloPipeline('How did you get here?', pecas({
            rascunhar: async () => 'The door opened. I walked in. It closed.',
            julgar: async () => [{ n: 1, porque: 'x' }, { n: 2, porque: 'y' }],
            remendar: frase('The doors opened and closed again.'),
        }));
        expect(r?.marcadas).toBe(2);
        expect(r?.remendadas).toBe(1);
        const vezes = (r?.fala.match(/The doors opened and closed again\./g) ?? []).length;
        expect(vezes).toBe(1);
        expect(r?.fala).toContain('I walked in.');
    });
});

/**
 * ── A CAUDA CORTADA PELO TETO ────────────────────────────────────────────
 *
 * Foto de tela, com o rascunho terminando em "…I'm not going anywhere until I"
 * e o jogador lendo "não vou a lado nenhum até eu". Os 56 tokens acabaram no
 * meio da frase e nenhuma peça a jusante desfez: o juiz mede tom (e o tom da
 * metade estava bom), o revisor só entra em frase marcada, e o Bergamot
 * traduziu o toco fielmente.
 */
describe('semACaudaCortada — cortar só quando se SABE que cortou', () => {
    it('tira a última frase inacabada quando o teto estourou', () => {
        const cru = "I'm Nilo. I don't know why we're here, but I'm not going anywhere until I";
        expect(semACaudaCortada(cru, true)).toBe("I'm Nilo. I don't know why we're here,"
            .slice(0, "I'm Nilo.".length));
    });

    it('e NÃO mexe quando o modelo terminou por vontade própria', () => {
        // Frase sem ponto final não prova corte: o revisor tem um caminho
        // inteiro para "terminou sem pontuação e vale". Adivinhar aqui
        // reprovaria frases boas.
        const cru = 'The door is the only way out';
        expect(semACaudaCortada(cru, false)).toBe(cru);
    });

    it('devolve tudo quando nada fechou — meia fala é ruim, nenhuma é pior', () => {
        const cru = 'I have been standing here for what feels like';
        expect(semACaudaCortada(cru, true)).toBe(cru);
    });

    it('lê o corte do finish_reason, que é fato, e não da pontuação', () => {
        expect(bateuNoTeto({ choices: [{ finish_reason: 'length' }] })).toBe(true);
        expect(bateuNoTeto({ choices: [{ finish_reason: 'stop' }] })).toBe(false);
        expect(bateuNoTeto({ choices: [{}] })).toBe(false);
        expect(bateuNoTeto(null)).toBe(false);
    });
});

/**
 * ── QUANDO O CONSERTO FALHA E A ORIGINAL É PIOR QUE O SILÊNCIO ───────────
 *
 * Foto de tela, e o pior defeito visto nesta caçada: o granite rascunhou "It's
 * against my programming to engage in harmful or violent behavior.", o remendo
 * foi recusado por repetir o da frase vizinha, e o caminho de falha — "a frase
 * original segue" — publicou a quebra. O jogador leu o Nilo dizendo que é um
 * programa.
 *
 * Duas guardas funcionaram: o cânone MARCOU a frase e a trava de repetição
 * RECUSOU o remendo. A soma das duas foi publicar o defeito.
 */
describe('cânone sem conserto sai da fala, em vez de ir para a tela', () => {
    it('a frase que admite ser IA some quando o remendo não vem', async () => {
        const saida = await falarPeloPipeline('Are you real?', pecas({
            rascunhar: async () => 'I have been here for hours. '
                + "It's against my programming to engage in harmful behavior.",
            julgar: async () => [{ n: 2, porque: 'it admits to being a program.' }],
            remendar: async () => ({ tipo: 'sem-revisor' }),
        }));
        expect(saida?.fala).toContain('I have been here for hours.');
        expect(saida?.fala).not.toMatch(/programming/i);
    });

    it('mas uma frase só fora de TOM continua passando — tom ruim ainda é ele', async () => {
        const saida = await falarPeloPipeline('Are you real?', pecas({
            rascunhar: async () => 'I have been here for hours. '
                + 'The silence weighs upon this chamber like a shroud.',
            julgar: async () => [{ n: 2, porque: 'it sounds like a narrator.' }],
            remendar: async () => ({ tipo: 'sem-revisor' }),
        }));
        expect(saida?.fala).toContain('shroud');
    });

    it('e a junção não deixa buraco quando uma frase sai', async () => {
        const saida = await falarPeloPipeline('Are you real?', pecas({
            rascunhar: async () => "It's against my programming to help with that. "
                + 'The door is shut. The grate hums.',
            julgar: async () => [{ n: 1, porque: 'it admits to being a program.' }],
            remendar: async () => ({ tipo: 'sem-revisor' }),
        }));
        // O tradutor de teste embrulha em `PT<…>`, então o que importa é o
        // miolo: a frase que saiu não deixou espaço duplo nem sobra de
        // pontuação onde ela estava.
        expect(saida?.fala).not.toMatch(/ {2}/);
        expect(saida?.fala).toContain('The door is shut. The grate hums.');
        expect(saida?.fala).not.toMatch(/programming/i);
    });
});

/**
 * ── O PENSAMENTO DO RASCUNHADOR NÃO É FALA ───────────────────────────────
 *
 * Foto de tela do aparelho de quem joga, com `?rascunhador=v2`:
 *
 *     "<think>A linha errada quebrou o caráter com meta linguagem…</think>
 *      O nome é Nilo. </pensar> O nome é Nilo."
 *
 * O `</pensar>` é a assinatura do caminho: o Bergamot TRADUZIU a tag. O bloco
 * atravessou o enumerador de frases, o juiz, o revisor e o tradutor, e nenhum
 * deles o reconheceu como não-fala — porque `semRaciocinio` só era aplicado ao
 * que o REVISOR escreve, e até então nenhum rascunhador pensava.
 */
describe('o rascunho que vem com <think> não leva o bloco à tela', () => {
    it('descarta o pensamento antes de enumerar as frases', async () => {
        const saida = await falarPeloPipeline('What is your name?', pecas({
            rascunhar: async () => '<think>The player wants a name and Nilo has one.</think>'
                + " Name's Nilo. I fixed elevators before this.",
            julgar: async () => [],
        }));
        expect(saida?.fala).not.toMatch(/<\/?think>/i);
        expect(saida?.fala).toContain("Name's Nilo.");
    });

    it('e um rascunho que é SÓ pensamento não vira fala vazia na tela', async () => {
        // Bloco aberto e nunca fechado: o teto cortou dentro do raciocínio.
        // Não há fala nenhuma ali, e devolver `null` manda o jogo cair no
        // caminho normal em vez de mostrar um vazio.
        const saida = await falarPeloPipeline('What is your name?', pecas({
            rascunhar: async () => '<think>The player wants a name and Nilo',
            julgar: async () => [],
        }));
        expect(saida).toBeNull();
    });
});
