import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    abrasileirar, desabreviar, registroDoTradutor, FLOOR10_TRADUTOR_BYTES,
} from '../npc/floor10Tradutor';

/**
 * O PASSE pt-PT → pt-BR e o registro do Bergamot.
 *
 * A tradução em si não é testada aqui (depende de 26 MB de WASM); ela está
 * medida em `bancada-navegador/VELOCIDADE.md`: 83 ms por frase contra 2.200 ms
 * do m2m100, e "predicament" virando "situação intrigante" em vez de
 * "predicação". O que estes testes protegem são as regras e a fiação.
 */
describe('abrasileirar', () => {
    it('desfaz o gerúndio composto de Portugal', () => {
        // O defeito mais audível: "está a responder" no meio de uma fala de um
        // NPC brasileiro é outra pessoa falando.
        expect(abrasileirar('O elevador não está a responder.'))
            .toBe('O elevador não está respondendo.');
        expect(abrasileirar('Continuo a esperar aqui.'))
            .toBe('Continuo esperando aqui.');
    });

    it('troca o tu por você', () => {
        expect(abrasileirar('mas não estás sozinho aqui')).toBe('mas você não está sozinho aqui');
        expect(abrasileirar('Tu sabes o que fazer? Podes tentar.'))
            .toContain('você sabe');
    });

    it('conserta o léxico do hotel, que é o que mais importa', () => {
        // "guest" vira "convidado" no Bergamot, e num hotel é hóspede. O Nilo
        // se descrever como convidado muda o que ele É.
        expect(abrasileirar('Sou apenas um convidado preso aqui.'))
            .toBe('Sou apenas um hóspede preso aqui.');
        expect(abrasileirar('um antigo técnico de elevador')).toContain('ex-técnico');
        expect(abrasileirar('Não estou no controlo.')).toContain('controle');
    });

    it('não estraga texto que já está em pt-BR', () => {
        const bom = 'O elevador não me obedece. A porta está ali.';
        expect(abrasileirar(bom)).toBe(bom);
    });

    it('NENHUMA regra usa lookbehind', () => {
        // Um `(?<=…)` aqui não quebra esta função — quebra o BUNDLE INTEIRO no
        // Safari antigo, na hora do parse. Já aconteceu neste projeto, e o
        // sintoma é o jogo não abrir, sem erro que aponte para cá.
        const fonte = abrasileirar.toString();
        expect(fonte).not.toContain('(?<');
    });
});

describe('desabreviar — o passe que a medição exigiu', () => {
    // Medido em `bancada-navegador/tradutor-ida-e-volta.mjs`, com o Bergamot de
    // verdade. As três entradas abaixo são as que ele deixou passar INTACTAS,
    // porque `vc`, `pq`, `n` e `ta` não estão no vocabulário dele — atravessam
    // como se fossem nomes próprios e chegam assim ao rascunhador.
    it('conserta as três que o tradutor deixava passar cruas', () => {
        //   sem passe: "vc is stuck here has been how long bro"
        //   com passe: "you've been stuck here for how long bro"
        expect(desabreviar('vc ta preso aqui faz quanto tempo mano'))
            .toBe('você está preso aqui faz quanto tempo mano');
        //   sem passe: "pq vc n get out of that fucking?"
        expect(desabreviar('pq vc n sai dessa porra?'))
            .toBe('por que você não sai dessa porra?');
        //   sem passe: "Ta in fear?"
        expect(desabreviar('ta com medo?')).toBe('está com medo?');
    });

    it('cobre o vocabulário do dono do jogo, colhido das conversas deste projeto', () => {
        expect(desabreviar('mn, tbm quero saber oq tem dps')).toContain('também');
        expect(desabreviar('mn, tbm quero saber oq tem dps')).toContain('o que');
        expect(desabreviar('mn, tbm quero saber oq tem dps')).toContain('depois');
        expect(desabreviar('agr vc pode fzr isso?')).toBe('agora você pode fazer isso?');
    });

    it('não estraga português inteiro — que é a maioria das perguntas', () => {
        const bom = 'Esse hotel vai acabar algum dia?';
        expect(desabreviar(bom)).toBe(bom);
        // "Se eu chamar o elevador, ele vem?" atravessa sem tocar em nada.
        expect(desabreviar('Se eu chamar o elevador, ele vem?'))
            .toBe('Se eu chamar o elevador, ele vem?');
    });

    it('NÃO corta palavra acentuada ao meio — o defeito que a tabela regex tinha', () => {
        // ── O QUE ACONTECEU, e é do JavaScript, não descuido ─────────────
        //
        // `\b` é definido sobre [A-Za-z0-9_], SEM acento. Então entre o `n` e o
        // `ã` de "não" existe fronteira de palavra, e a regra `\bn\b` disparava
        // DENTRO da palavra:
        //
        //     "vc não tem medo?"       → "você nãoão tem medo?"
        //     "um número gravado"      → "um nãoúmero gravado"  → "a non-humerer"
        //
        // "não" é a palavra mais comum de uma pergunta negativa, e os testes de
        // unidade não pegaram porque nenhum tinha acento DEPOIS de uma
        // abreviação. Quem pegou foi o caso-armadilha da bancada. Este teste
        // existe para o defeito não voltar por outra porta.
        expect(desabreviar('vc não tem medo?')).toBe('você não tem medo?');
        expect(desabreviar('a porta tem um número gravado nela'))
            .toBe('a porta tem um número gravado nela');
        for (const inteira of ['não', 'número', 'você', 'ninguém', 'está', 'também', 'até', 'só']) {
            expect(desabreviar(`o elevador ${inteira} responde`))
                .toBe(`o elevador ${inteira} responde`);
        }
    });

    it('as três armadilhas continuam de fora', () => {
        // Cada uma consertaria uma frase torta e estragaria uma boa. Estão em
        // `desabreviar-tabela.mjs` como casos-armadilha: quem as acrescentar vê
        // PIOROU na bancada, com a frase que quebrou.
        expect(desabreviar('você dormiu num quarto desse hotel?'))
            .toContain('num quarto');            // "num" ≠ "não"
        expect(desabreviar('por que esse andar é tão escuro?'))
            .toContain('tão escuro');            // "tão" ≠ "estão"
        expect(desabreviar('a nota c está no papel')).toContain(' c ');  // "c" ≠ "você"
    });

    it('a risada vira "haha" em vez de atravessar crua', () => {
        // Sem isto o Bergamot copia "kkkkk" inteiro para o inglês, e o
        // rascunhador recebe no meio da pergunta uma palavra que não existe.
        expect(desabreviar('esse lugar é doido kkkk')).toBe('esse lugar é doido haha');
        expect(desabreviar('rsrs que medo')).toBe('haha que medo');
    });

    it('as formas com barra também, e por lookAHEAD (que é permitido)', () => {
        expect(desabreviar('olha p/ a grade do chão')).toBe('olha para a grade do chão');
        expect(desabreviar('vem c/ o elevador')).toBe('vem com o elevador');
        expect(desabreviar('fica s/ medo')).toBe('fica sem medo');
    });

    it('nenhuma expansão produz OUTRA abreviação', () => {
        // Se produzisse, a ordem das linhas passaria a importar — e o
        // dicionário troca cada palavra uma vez só, então a segunda abreviação
        // sobreviveria até o tradutor. `tlgd` vira "sabe", nunca "tá ligado".
        for (const frase of ['tlg', 'vlw', 'blz', 'flw', 'sla', 'pdc', 'kd', 'sqn']) {
            const expandido = desabreviar(frase);
            expect(desabreviar(expandido), `"${frase}" → "${expandido}" ainda tem abreviação`)
                .toBe(expandido);
        }
    });

    it('NENHUMA regra usa lookbehind', () => {
        // Mesmo motivo do `abrasileirar`: um `(?<=…)` aqui não quebra esta
        // função, quebra o BUNDLE INTEIRO no Safari antigo, na hora do parse.
        expect(desabreviar.toString()).not.toContain('(?<');
    });

    it('roda na PERGUNTA, e a fala do Nilo nunca passa por ele', () => {
        // A fala sai do rascunhador em inglês e volta pelo `en → pt`. Rodar o
        // desabreviador nela seria procurar abreviação onde não há, e "to" e
        // "n" são palavras comuns em inglês.
        const fonte = readFileSync(new URL('../npc/floor10Tradutor.ts', import.meta.url), 'utf8');
        const i = fonte.indexOf('export async function traduzirParaPtBr');
        expect(fonte.slice(i)).not.toContain('desabreviar(');
        const j = fonte.indexOf('export async function traduzirPerguntaParaIngles');
        expect(fonte.slice(j, i > j ? i : undefined)).toContain('desabreviar(pergunta)');
    });
});

describe('registroDoTradutor', () => {
    it('os caminhos são ABSOLUTOS, e isso não é estilo', () => {
        // O `translator.js` resolve `file.name` contra a PÁGINA, não contra o
        // registry. Caminho relativo dá 404, e o erro que aparece é
        // "SentencePiece vocabulary error" — que não aponta para nada.
        const r = JSON.parse(registroDoTradutor('https://exemplo'));
        for (const par of ['enpt', 'pten']) {
            for (const parte of ['model', 'lex', 'vocab']) {
                expect(r[par][parte].name).toMatch(/^https:\/\//);
            }
        }
    });

    it('são DOIS pares, porque o jogador pergunta em português', () => {
        // O `en → pt` é o óbvio: o rascunho sai em inglês e a tela é em
        // português. O `pt → en` só apareceu na hora de ligar no jogo — na
        // bancada eu sempre dei a pergunta JÁ em inglês, e o buraco não
        // aparecia. Sem ele, o rascunhador e o juiz — ambos em inglês —
        // recebem uma pergunta em português, que é o único trecho da cadeia
        // que nunca foi medido.
        expect(Object.keys(JSON.parse(registroDoTradutor())).sort()).toEqual(['enpt', 'pten']);
    });

    it('os três arquivos de cada par estão lá, e o peso bate com eles', () => {
        const r = JSON.parse(registroDoTradutor());
        for (const par of ['enpt', 'pten']) {
            expect(Object.keys(r[par]).sort()).toEqual(['lex', 'model', 'vocab']);
        }
        // Conferidos por HEAD no espelho do HF, um a um:
        //   en-pt ... 23.340.019 + 2.117.608 + 408.686 = 25.866.313
        //   pt-en ... 22.700.409 + 2.487.847 + 408.686 = 25.596.942
        // Somados, 51 MB — ainda 12× menos que o m2m100 sozinho (602 MB), que
        // fazia UM lado só e custava 2.200 ms por frase.
        expect(FLOOR10_TRADUTOR_BYTES).toBe(51_463_255);
    });

    it('aponta para o espelho do HF, e o motivo está no módulo', () => {
        // O bucket da Mozilla não manda `access-control-allow-origin`, então o
        // navegador recusa. O espelho do HF tem os mesmos bytes e CORS `*`.
        expect(registroDoTradutor()).toContain('huggingface.co');
    });
});
