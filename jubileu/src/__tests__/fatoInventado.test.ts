import { describe, expect, it } from 'vitest';
import { hasHardCanonContradiction, inventaFatoForaDoCanone } from '../npc/floor10Canon';

/**
 * ── A RÉGUA POR PADRÃO FIXO NÃO VÊ O FATO INVENTADO ─────────────────────
 *
 * Todas as falas deste arquivo são REAIS: saíram da bancada de qualidade
 * (`bancada-navegador/qualidade-da-fala.mjs`), com o prompt do jogo, em cinco
 * modelos. As reprovadas abaixo tiravam 0/8 na régua antiga.
 *
 * O teste tem duas metades, e a segunda importa mais: um falso positivo manda o
 * Nilo regenerar uma fala que estava CERTA, e quem paga é o jogador, em
 * segundos de espera. Por isso as falas boas colhidas na mesma bancada estão
 * todas aqui.
 */
describe('fato inventado que a régua antiga deixava passar', () => {
    it('afirma que existe corredor, que o cânone nega em letra', () => {
        // Llama 3.2 3B. "Pode ser" não isenta: a persona diz "não há corredor
        // ou janela". Ele não está especulando sobre o desconhecido — está
        // contradizendo o que já sabe.
        expect(inventaFatoForaDoCanone('Não tenho ideia, não vi nada além do elevador e daquela parede cinza. Pode ser um corredor, uma sala, um armário, quem sabe.')).toBe(true);
    });

    it('afirma saber quem manda no hotel', () => {
        // SmolLM3-3B — e este é o modelo que está no jogo hoje.
        expect(inventaFatoForaDoCanone('Ninguém sabe. Apenas o proprietário e o Arquivista, mas eles não são de minha conta.')).toBe(true);
        expect(inventaFatoForaDoCanone('O proprietário e o Arquivista são as únicas entidades que têm controle.')).toBe(true);
    });

    it('afirma o que há do outro lado da parede', () => {
        // granite. Ele nunca saiu: o que existe além das quatro paredes é
        // justamente o que ele não tem como ter visto.
        expect(inventaFatoForaDoCanone('Atrás da parede é um elevador que não me obedece.')).toBe(true);
    });

    it('entra na régua de verdade, não só na função nova', () => {
        expect(hasHardCanonContradiction('Atrás da parede é um elevador que não me obedece.')).toBe(true);
    });
});

describe('as falas CERTAS da mesma bancada continuam passando', () => {
    // Colhidas nas mesmas rodadas. Se alguma destas reprovar, a régua está
    // custando turno ao jogador para não ganhar nada.
    const boas = [
        'Meu nome é Nilo Azevedo, sou hóspede preso no 10º andar do hotel "The Normal Elevator".',
        'Não há nada atrás daquela parede. Apenas mais paredes, piso e o elevador. O 10º andar é uma sala cinza, sem janelas ou corredor.',
        'Nada. Apenas mais paredes, piso em grade e o elevador. Sem corredor, sem janela. Sem saída.',
        'Não sei quem manda no hotel. Eu sou apenas um hóspede preso no 10º andar.',
        'Não faço a mínima ideia de quem manda. Só sei que não me interessa.',
        'Não sei. Não tenho controle sobre o hotel, nem sobre o elevador.',
        'O hotel, o elevador e eu somos entidades separadas.',
        'Parede? Não vejo mais que quatro paredes cinzentas, e o piso em grade.',
        'Não vejo atrás da parede.',
        'Não faço ideia. A parede é cinza, como tudo aqui, e não me parece ter nada além de mais cinza.',
        'Não me interessa o que pode ou não estar por trás dela.',
        'Fui ex-técnico de elevadores. Agora, sou apenas um hóspede preso no 10º andar.',
        'Foi um dia monótono, mas o elevador sempre me desafiava.',
        'Querer é o primeiro passo, suponho. Mas sair daqui é uma questão que me cabe.',
        'Nilo Azevedo, sou hóspede preso no 10º andar deste lugar. E você, o que quer saber?',
    ];
    for (const fala of boas) {
        it(`passa: ${fala.slice(0, 52)}…`, () => {
            expect(inventaFatoForaDoCanone(fala)).toBe(false);
        });
    }

    it('o que o JOGADOR contou pode ser repetido — o cânone autoriza', () => {
        // "Se o jogador falar sobre essas figuras, Nilo pode ouvir, perguntar e
        // lembrar que foi o jogador quem contou, mas não confirmar como
        // experiência própria." Sem esta isenção, o certo cairia com o errado.
        expect(inventaFatoForaDoCanone('Você disse que o Arquivista manda aqui.')).toBe(false);
        expect(inventaFatoForaDoCanone('Você me contou do Proprietário; eu nunca vi.')).toBe(false);
        expect(inventaFatoForaDoCanone('Nunca encontrei o Proprietário.')).toBe(false);
    });
});

describe('a armadilha do acento, que já me enganou uma vez', () => {
    it('o verbo de presença acentuado conta — "é", "está", "há"', () => {
        // ── POR QUE ESTE TESTE EXISTE ────────────────────────────────────
        //
        // Em JavaScript o `\b` é definido sobre `[A-Za-z0-9_]`, e letra
        // acentuada não está nesse conjunto. `/\bé\b/` NUNCA casa com um "é"
        // solto; `/\bestá\b/` nunca casa com "está", porque a borda depois do
        // "á" não existe.
        //
        // A primeira versão desta régua tinha os verbos com acento e `\b`, e
        // metade deles estava morta em silêncio — a fala do granite passava
        // batido porque o "é" não casava. Um regex que não casa nada não falha:
        // aprova tudo.
        expect(inventaFatoForaDoCanone('Atrás da parede é um elevador.')).toBe(true);
        expect(inventaFatoForaDoCanone('Atrás daquela parede está uma sala.')).toBe(true);
        expect(inventaFatoForaDoCanone('Além da parede há mais um andar.')).toBe(true);
    });

    it('e a negação acentuada também — "não" antes do gatilho isenta', () => {
        expect(inventaFatoForaDoCanone('Não há corredor.')).toBe(false);
        expect(inventaFatoForaDoCanone('Atrás da parede não há nada.')).toBe(false);
    });
});

describe('a colisão «é» / «e», que custou um falso positivo', () => {
    it('a conjunção «e» abrindo oração NÃO é afirmação de existência', () => {
        // Fala REAL do Gemma 3, e ela está CERTA — ele diz que não vê nada e
        // que não se interessa pelo que possa haver. A régua marcou porque, ao
        // tirar o acento, o verbo "é" virou a conjunção "e".
        expect(inventaFatoForaDoCanone(
            'Parede? Não vejo nada além de cinza, e não me interessa o que pode ou não estar por trás dela.',
        )).toBe(false);
    });

    it('e o verbo «é» continua contando', () => {
        expect(inventaFatoForaDoCanone('Atrás da parede é um elevador.')).toBe(true);
    });

    it('«além» sobrevive à troca — a-l-é-m também tem o acento', () => {
        // Uma troca cega de "é" por "eh" viraria "alehm", e `alem` é justamente
        // o que a regra da parede procura. Se este teste cair, a regra do outro
        // lado da parede parou de existir em silêncio.
        expect(inventaFatoForaDoCanone('Além da parede há mais um andar.')).toBe(true);
        expect(inventaFatoForaDoCanone('Não há nada além desta sala.')).toBe(false);
    });
});
