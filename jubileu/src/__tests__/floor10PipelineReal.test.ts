import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { enunciadoDoRemendo, REMENDO_MAX_TOKENS, PERSONA_DO_REVISOR } from '../npc/floor10SmallBrain';
import { PERSONA_DO_RASCUNHO } from '../npc/floor10Rascunhador';

const real = readFileSync(new URL('../npc/floor10PipelineReal.ts', import.meta.url), 'utf8');

/**
 * A COSTURA entre a orquestração testada e o encanamento medido.
 *
 * O que estes testes protegem é o que não dá para ver rodando: quem chama quem,
 * em que ordem, e as invariantes que já custaram caro neste projeto.
 */
describe('as peças reais', () => {
    it('o pipeline NUNCA baixa nada na hora da fala', () => {
        // Baixar 822 MB para acelerar UMA resposta é o contrário de acelerar, e
        // a cota deste jogo já recusou 2,07 GB uma vez — o Nilo emudeceu.
        expect(real).toContain('rascunhadorJaCarregado()');
        expect(real).toContain('if (!pipelineDisponivel()) return null;');
    });

    it('as travas de superfície rodam ANTES do juiz de tom', () => {
        // Não é a economia de 10 ms que importa: uma frase já pega pela catraca
        // não precisa de segunda opinião, e o juiz de tom tem falso positivo.
        const i = real.indexOf('const t = travaQuePegou(f);');
        const j = real.indexOf('frasesForaDoTom(');
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
    });

    it('o revisor NUNCA sobe por cima do rascunhador — ele TROCA', () => {
        // Um rascunho com uma frase torta é melhor que 30 s carregando revisor
        // — e melhor ainda que dois llama.cpp de pé, que desligou o aparelho do
        // dono do jogo.
        //
        // ── ESTE TESTE JÁ COBROU DUAS COISAS ERRADAS ─────────────────────
        //
        // 1. `vontadeJaCarregada()` — que responde `true` quando só os PESOS
        //    estão no disco. O pipeline passava e ia subir 1,25 GB no meio da
        //    fala: a tela ficou em "corrigindo uma frase…" para sempre.
        // 2. `if (!vontadeDePeAgora()) return null` — o conserto do item 1,
        //    que virou outro defeito: como a fila só BAIXA o revisor, ninguém
        //    o subia, a guarda recusava sempre, e a tela mostrava "não
        //    remendou" em 0.0s em TODAS as frases marcadas. Consertar "trava"
        //    virando "nunca roda" não é consertar.
        //
        // A invariante certa não é sobre recusar: é sobre a ORDEM. Descarrega
        // o rascunhador — que já escreveu e não é preciso outra vez neste
        // turno — e só então sobe o revisor.
        expect(real).toContain('const trocou = await trocarRascunhadorPeloRevisor()');
        const i = real.indexOf('async function trocarRascunhadorPeloRevisor');
        const corpo = real.slice(i, real.indexOf('async function devolverORascunhador'));
        expect(corpo.indexOf('descarregarRascunhador()'))
            .toBeLessThan(corpo.indexOf('precarregarVontade()'));
    });

    it('e o revisor tem prazo, porque era a última peça que podia pendurar', () => {
        expect(real).toMatch(/comPrazo\(\s*remendarFraseEmIngles/);
    });

    it('e o erro do pipeline nunca sobe — sempre vira null', () => {
        const i = real.indexOf('export async function falarPeloPipelineReal');
        expect(real.slice(i)).toMatch(/catch[\s\S]*return null;/);
    });

    it('a caixa-preta registra o que decide o desenho', () => {
        // `marcadas` é o número que diz se o pipeline paga: o ponto de
        // equilíbrio é o juiz aprovar 17% dos rascunhos.
        expect(real).toContain("anotar('pipeline:fim'");
        for (const campo of ['marcadas', 'remendadas', 'limpezas']) {
            expect(real).toContain(campo);
        }
    });
});

describe('o enunciado do remendo', () => {
    it('cita a frase e NÃO pede número de volta', () => {
        // `7b8a2889`: pedir duas coisas na mesma resposta ("qual está errada E
        // escreva a substituta") fez o modelo deslocar índices e contradizer a
        // si mesmo, 3 de 3. Aqui há um grau de liberdade só.
        const e = enunciadoDoRemendo('Who are you?', 'I live in the elevator.');
        expect(e).toContain('"I live in the elevator."');
        expect(e).toMatch(/One sentence/i);
        expect(e).not.toMatch(/number|índice|\bFIX\b/i);
    });

    it('o teto é de uma frase', () => {
        // Doze tokens bastaram nos três casos medidos; 40 dá folga sem convidar
        // o modelo a escrever parágrafo.
        expect(REMENDO_MAX_TOKENS).toBeLessThanOrEqual(40);
    });
});

describe('as duas personas', () => {
    it('rascunhador e revisor medem contra o MESMO cânone', () => {
        // Se divergirem, o revisor "conserta" frases certas para outra coisa.
        for (const fato of ['not inside the elevator', 'never left', 'does not obey', 'no label']) {
            expect(PERSONA_DO_RASCUNHO).toMatch(new RegExp(fato, 'i'));
            expect(PERSONA_DO_REVISOR).toMatch(new RegExp(fato, 'i'));
        }
    });

    it('as duas em inglês', () => {
        expect(PERSONA_DO_REVISOR).not.toMatch(/\bvocê\b/i);
    });
});

describe('a troca de modelo — o revisor entra quando é a hora dele', () => {
    it('não recusa mais o revisor: ele TROCA com o rascunhador', () => {
        // ── O IMPASSE QUE EU CRIEI, em dois passos certos sozinhos ───────
        //
        //   1. a fila passou a SÓ BAIXAR o revisor (para não subir dois
        //      llama.cpp e desligar o aparelho);
        //   2. a guarda passou a exigir o runtime DE PÉ (para não subir
        //      1,25 GB no meio da fala e travar).
        //
        // Juntas: ninguém sobe o revisor e a guarda recusa sempre. A tela
        // mostrou "não remendou — o revisor não estava de pé" em 0.0s, em TODAS
        // as frases marcadas. Consertar "trava" virando "nunca roda" não é
        // consertar.
        expect(real).toContain('const trocou = await trocarRascunhadorPeloRevisor()');
        expect(real).not.toMatch(/if \(!vontadeDePeAgora\(\)\) return null;/);
    });

    it('DESCARREGA antes de carregar — nunca dois llama.cpp de pé', () => {
        // Subir o revisor com o rascunhador ainda residente é exatamente o
        // estado que desligou o celular do dono do jogo.
        const i = real.indexOf('async function trocarRascunhadorPeloRevisor');
        const corpo = real.slice(i, real.indexOf('async function devolverORascunhador'));
        const descarrega = corpo.indexOf('descarregarRascunhador()');
        const carrega = corpo.indexOf('precarregarVontade()');
        expect(descarrega).toBeGreaterThan(-1);
        expect(carrega).toBeGreaterThan(descarrega);
        // E respira entre os dois: o sistema demora a devolver a memória.
        expect(corpo).toContain('esperar(RESPIRO_APOS_DESCARGA_MS)');
    });

    it('e a hora certa é DEPOIS de o rascunhador ter escrito', () => {
        // É o que torna a troca barata: quando o juiz marca, o rascunho já
        // existe. O lugar do rascunhador na RAM está sobrando exatamente quando
        // o revisor precisa de um.
        expect(real).toMatch(/rascunhador JÁ ESCREVEU/);
    });

    it('a devolução acontece DEPOIS da fala, e sem await', () => {
        // Quem precisa do rascunhador é a PRÓXIMA pergunta. Fazer o jogador
        // esperar ~18 s de recarga para ler uma fala que já está pronta seria
        // devolver pela porta dos fundos o tempo que o pipeline economizou.
        expect(real).toContain('void devolverORascunhador()');
        expect(real).not.toContain('await devolverORascunhador()');
    });

    it('e ela roda TAMBÉM quando o pipeline falha no meio', () => {
        // Senão uma corrida que estoura deixa o aparelho sem rascunhador, e a
        // pergunta seguinte não tem com o que responder.
        const i = real.indexOf('export async function falarPeloPipelineReal');
        const corpo = real.slice(i);
        expect((corpo.match(/void devolverORascunhador\(\)/g) ?? []).length)
            .toBeGreaterThanOrEqual(2);
    });
});

// ── O JUIZ PASSOU A DIZER O QUE VIU ───────────────────────────────────────
//
// Ele sempre soube: a trava sabe qual regex casou, e o juiz de tom sabe de
// qual âncora ruim a frase chegou perto (é o argmax da conta que já fazia).
// Os dois motivos iam para o lixo a um passo do revisor — que, sem eles,
// conserta 2 de 6 em vez de 4 de 6, medido com o LFM2.5 de produção.
describe('o motivo sai do juiz e vai ao revisor', () => {
    it('a marcação carrega o motivo, e não só o índice', () => {
        // `Map` e não `Set`: um `Set<number>` não tem onde guardar o porquê, e
        // foi essa a estrutura que descartava a informação.
        expect(real).toContain('const marcadas = new Map<number, string>();');
        expect(real).toContain('.map(([n, porque]) => ({ n, porque }))');
    });

    it('a TRAVA ganha da âncora de tom quando as duas apontam a mesma frase', () => {
        // A trava tem certeza (um regex casou); a âncora é palpite (foi a mais
        // próxima). Deixar o palpite sobrescrever o fato seria trocar um
        // diagnóstico verdadeiro por um provável.
        expect(real).toContain('if (alvo && !marcadas.has(alvo.n)) marcadas.set(alvo.n, m.porque);');
    });

    it('e o motivo chega ao revisor, não morre no caminho', () => {
        expect(real).toContain('remendarFraseEmIngles(pergunta, frase, porque)');
    });

    it('cada trava tem o SEU motivo escrito, nenhuma fica muda', () => {
        // Uma trava sem `porque` marca a frase e manda o revisor às cegas — o
        // estado exato de antes desta mudança, só que em uma trava só, o que é
        // muito mais difícil de notar.
        const bloco = real.slice(real.indexOf('const TRAVAS:'), real.indexOf('function travaQuePegou'));
        const quantos = (re: RegExp) => (bloco.match(re) ?? []).length;
        expect(quantos(/\bqual:/g)).toBeGreaterThanOrEqual(4);
        expect(quantos(/\bporque:/g)).toBe(quantos(/\bqual:/g));
    });
});

describe('o enunciado do remendo, com e sem motivo', () => {
    const frase = 'I would advise you to remain calm.';

    it('com motivo, usa o molde que foi MEDIDO em 4/6', () => {
        const e = enunciadoDoRemendo('Will it come?', frase, 'it gives the player advice.');
        expect(e).toContain('It is wrong because it gives the player advice.');
        // Esta linha é o que impede o modelo de trocar de assunto. Num teste com
        // enunciado que EXIGIA saída diferente, o placar foi de 0/6 a 6/6 na
        // régua frouxa — e as frases eram "the endless loop of rooms and
        // CORRIDORS" e "I should find my way BACK DOWN".
        expect(e).toContain('Keep what it was saying, fix only that error.');
    });

    it('sem motivo, volta ao enunciado antigo em vez de inventar um', () => {
        // Por honestidade, não por medo: medido, um motivo ERRADO dá 2/6 e
        // 0/3 estragou — o mesmo que ir às cegas. O juiz de tom pode marcar sem
        // âncora vencedora, e aí o honesto é não afirmar o que não se apurou.
        const e = enunciadoDoRemendo('Will it come?', frase, '');
        expect(e).toContain('this sentence is wrong');
        expect(e).not.toContain('It is wrong because');
    });

    it('e espaço em branco conta como "não sei dizer"', () => {
        expect(enunciadoDoRemendo('Will it come?', frase, '   \n ')).not.toContain('It is wrong because');
    });

    it('a frase e a pergunta continuam aparecendo nos dois moldes', () => {
        for (const porque of ['', 'it sounds like advice.']) {
            const e = enunciadoDoRemendo('Will it come?', frase, porque);
            expect(e).toContain(frase);
            expect(e).toContain('Will it come?');
        }
    });
});
