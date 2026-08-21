import { describe, it, expect, vi } from 'vitest';
import {
    falarPeloPipeline, limparFrase, enumerarEmIngles, pipelineLigado,
    aplicarRemendo, primeiraFraseFechada,
    type PassoDoPipeline, type PecasDoPipeline,
} from '../npc/floor10Pipeline';

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
        expect(vistos).toEqual(['it gives the player advice.']);
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
        expect(pares).toEqual([
            'I am Nilo. :: motivo da um',
            'The door does not obey me. :: motivo da dois',
        ]);
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
        expect(vistos).toEqual(['']);
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
