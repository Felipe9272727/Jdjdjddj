import { describe, it, expect, beforeEach } from 'vitest';
import {
    segurarOTempo, escalaDoTempo, tremer, deslocamentoDoTremor, TREMOR,
    espalharFaiscas, todasAsFaiscas, passoDoImpacto, passoDasFaiscas,
    reiniciarImpacto, impacto, IMPACTOS, FAISCAS_MAX, FAISCA_GRAVIDADE,
} from '../f12Impacto';

/**
 * ── ESTE ARQUIVO NASCEU DE UMA VERGONHA ──────────────────────────────────────
 *
 * `f12Impacto.ts` abre dizendo, no cabeçalho, que não importa three "pelo mesmo
 * motivo de `f12Boss`: o que é regra tem de ser testável sem uma tela". Eu
 * escrevi a justificativa e não escrevi o teste. Um avaliador independente
 * apontou: um módulo criado PARA ser testável, com zero testes.
 *
 * E o motivo alegado não era decorativo — o tremor tem uma curva, o hitstop tem
 * uma duração, a faísca tem uma vida, e as três são exatamente o tipo de coisa
 * que se afina no olho e depois ninguém sabe explicar por que ficou estranho.
 */
beforeEach(() => reiniciarImpacto());

describe('f12 — o hitstop', () => {
    it('segura o tempo e devolve sozinho', () => {
        expect(escalaDoTempo()).toBe(1);
        segurarOTempo(0.05, 0.1);
        expect(escalaDoTempo()).toBeCloseTo(0.1, 6);
        passoDoImpacto(0.03);
        expect(escalaDoTempo(), 'soltou cedo demais').toBeCloseTo(0.1, 6);
        passoDoImpacto(0.03);
        expect(escalaDoTempo(), 'não soltou').toBe(1);
    });

    it('um pedido fraco não encurta uma pausa grande que já está correndo', () => {
        // Um tiro comum chegando no meio de uma explosão não pode cortar a
        // explosão pela metade: o golpe grande perderia o peso justamente
        // quando o jogador está acertando mais.
        segurarOTempo(0.2, 0.05);
        segurarOTempo(0.02, 0.5);
        expect(escalaDoTempo(), 'o tiro fraco roubou a pausa da explosão').toBeCloseTo(0.05, 6);
        passoDoImpacto(0.1);
        expect(escalaDoTempo()).toBeCloseTo(0.05, 6);
    });

    it('e a pausa do tiro comum sobrevive a um quadro ruim', () => {
        // Ela já esteve em 0,022 s. O andar roda entre 27 e 45 fps, ou seja um
        // quadro dura de 22 a 37 ms: a pausa inteira cabia DENTRO de um quadro e
        // não existia como sensação. Um efeito que não sobrevive ao pior quadro
        // do seu alvo não é um efeito.
        const quadroRuim = 1 / 30;
        expect(IMPACTOS.tiro.stop, 'o hitstop do tiro voltou a ser sub-quadro')
            .toBeGreaterThan(quadroRuim);
    });
});

describe('f12 — o tremor', () => {
    it('satura: dez acertos juntos não valem dez tremores', () => {
        for (let i = 0; i < 10; i++) tremer(0.5);
        const a = deslocamentoDoTremor();
        expect(Math.abs(a.x)).toBeLessThanOrEqual(TREMOR.amplitude + 1e-9);
        expect(Math.abs(a.giro)).toBeLessThanOrEqual(TREMOR.giro + 1e-9);
    });

    it('termina em ZERO e sem degrau — é o trauma ao quadrado que garante isso', () => {
        // O tremor antigo caía em linha reta e acabava no meio da amplitude; o
        // olho pega esse corte. Com o deslocamento em trauma², a derivada no fim
        // também é zero, então ele se apaga em vez de ser cortado.
        tremer(1);
        const amostras: number[] = [];
        for (let i = 0; i < 60; i++) {
            passoDoImpacto(1 / 60);
            amostras.push(Math.abs(deslocamentoDoTremor().x));
        }
        expect(amostras[amostras.length - 1], 'sobrou tremor').toBe(0);
        // os últimos quadros antes do zero têm de ser pequenos: se o último
        // valor não nulo fosse grande, houve corte.
        const ultimoNaoNulo = [...amostras].reverse().find((v) => v > 0) ?? 0;
        expect(ultimoNaoNulo, 'o tremor foi cortado no meio da amplitude')
            .toBeLessThan(TREMOR.amplitude * 0.2);
    });

    it('não é ruído branco: o deslocamento é contínuo entre quadros', () => {
        // `Math.random()` por quadro dá saltos da amplitude inteira e vibra como
        // tela quebrada. Senos dão um caminho. Aqui: nenhum salto entre quadros
        // vizinhos pode ser da ordem da amplitude.
        tremer(1);
        let anterior = deslocamentoDoTremor().x;
        let maiorSalto = 0;
        for (let i = 0; i < 30; i++) {
            passoDoImpacto(1 / 120);
            const agora = deslocamentoDoTremor().x;
            maiorSalto = Math.max(maiorSalto, Math.abs(agora - anterior));
            anterior = agora;
        }
        expect(maiorSalto, 'o tremor voltou a ser ruído branco')
            .toBeLessThan(TREMOR.amplitude * 0.9);
    });

    it('o relógio tem UM dono: ler não adianta o tempo', () => {
        // A primeira versão adiantava o relógio dentro da função que a câmera
        // chama para LER o deslocamento. A câmera lia uma vez por quadro e o
        // módulo dava outro passo: o tremor correria ao dobro da velocidade.
        tremer(1);
        passoDoImpacto(1 / 60);
        const a = deslocamentoDoTremor();
        const b = deslocamentoDoTremor();
        expect(b).toEqual(a);
    });
});

describe('f12 — as faíscas', () => {
    it('nascem no ponto pedido e morrem sozinhas', () => {
        espalharFaiscas(3, 4, -5, 8, 6);
        const vivas = todasAsFaiscas().filter((f) => f.vida > 0);
        expect(vivas).toHaveLength(8);
        for (const f of vivas) {
            expect(Math.hypot(f.x - 3, f.y - 4, f.z + 5), 'nasceu longe do acerto').toBeLessThan(1e-9);
        }
        for (let i = 0; i < 120; i++) passoDasFaiscas(1 / 60);
        expect(todasAsFaiscas().filter((f) => f.vida > 0), 'faísca imortal').toHaveLength(0);
    });

    it('o anel não estoura nem aloca: mais faíscas reaproveitam as velhas', () => {
        // Um `new` por faísca, vezes doze por acerto, vezes um acerto a cada
        // 0,28 s, é lixo suficiente para o coletor aparecer num celular como
        // engasgo — e engasgo num jogo de desvio é dano injusto.
        const antes = todasAsFaiscas();
        for (let i = 0; i < 40; i++) espalharFaiscas(0, 0, 0, 20, 5);
        expect(todasAsFaiscas(), 'o anel foi realocado').toBe(antes);
        expect(todasAsFaiscas().filter((f) => f.vida > 0).length)
            .toBeLessThanOrEqual(FAISCAS_MAX);
    });

    it('elas caem', () => {
        espalharFaiscas(0, 10, 0, 1, 0.0001);
        const f = todasAsFaiscas().find((q) => q.vida > 0)!;
        const vyInicial = f.vy;
        passoDasFaiscas(0.1);
        expect(f.vy).toBeCloseTo(vyInicial - FAISCA_GRAVIDADE * 0.1, 6);
    });
});

describe('f12 — o orçamento de um impacto', () => {
    it('os três acertos são escalonados: o contraste É a informação', () => {
        // Se o tiro comum já sacode a tela, não sobra escala para o golpe
        // grande — e um jogo em que tudo é grande é um jogo em que nada é.
        expect(IMPACTOS.tiro.trauma).toBeLessThan(IMPACTOS.carregado.trauma);
        expect(IMPACTOS.carregado.trauma).toBeLessThanOrEqual(IMPACTOS.dano.trauma);
        expect(IMPACTOS.tiro.faiscas).toBeLessThan(IMPACTOS.carregado.faiscas);
        expect(IMPACTOS.tiro.stop).toBeLessThan(IMPACTOS.carregado.stop);
    });

    it('`impacto()` dispara as três camadas de uma vez', () => {
        impacto('carregado', 1, 2, -3);
        expect(escalaDoTempo(), 'não segurou o tempo').toBeLessThan(1);
        // O MÓDULO do deslocamento, e não o `x`: as três componentes são senos
        // de fases diferentes, e a de `x` começa em zero por definição
        // (`sin(0)`). Testar um eixo só reprovaria um tremor perfeitamente vivo.
        const d = deslocamentoDoTremor();
        expect(Math.hypot(d.x, d.y, d.giro), 'não tremeu').toBeGreaterThan(0);
        expect(todasAsFaiscas().filter((f) => f.vida > 0).length, 'não faiscou')
            .toBe(IMPACTOS.carregado.faiscas);
    });

    it('e a tabela não tem entrada que ninguém usa', () => {
        // Ela nasceu com um `morte` que nunca foi chamado — código morto no
        // arquivo que veio junto de um commit sobre matar código morto.
        expect(Object.keys(IMPACTOS).sort()).toEqual(['carregado', 'dano', 'tiro']);
    });
});

// ── O CASO QUE OS TREZE PRIMEIROS TESTES NÃO COBRIAM ─────────────────────────
//
// Eu tinha pensado só no inverso — um pedido fraco encurtando uma pausa forte —
// e escrevi o teste dele. O defeito real era o outro lado: um pedido LONGO e
// FRACO herdava a FORÇA de um pedido curto e forte que ainda corria. Um
// avaliador independente mediu: com uma explosão quase expirando, um tiro comum
// devolvia 0,05 em vez de 0,3, por 50 ms inteiros — seis vezes mais forte do que
// o projetado. Um teste que só olha uma direção da mesma regra é meio teste.
describe('f12 — o hitstop não herda força de quem já está acabando', () => {
    it('um tiro comum no fim de uma explosão vale a força DELE', () => {
        segurarOTempo(0.08, 0.05);          // a explosão
        passoDoImpacto(0.075);              // ela quase acabou
        segurarOTempo(0.05, 0.3);           // o tiro comum chega
        expect(escalaDoTempo(), 'ainda manda a explosão, e está certo').toBeCloseTo(0.05, 6);
        passoDoImpacto(0.01);               // a explosão morre
        expect(escalaDoTempo(), 'o tiro herdou a força da explosão').toBeCloseTo(0.3, 6);
    });

    it('e o forte continua mandando enquanto ele estiver vivo', () => {
        segurarOTempo(0.05, 0.3);
        segurarOTempo(0.08, 0.05);
        expect(escalaDoTempo()).toBeCloseTo(0.05, 6);
        passoDoImpacto(0.06);
        expect(escalaDoTempo(), 'o forte morreu cedo').toBeCloseTo(0.05, 6);
        passoDoImpacto(0.03);
        expect(escalaDoTempo(), 'sobrou retenção').toBe(1);
    });

    it('muitas retenções seguidas não travam o jogo para sempre', () => {
        for (let i = 0; i < 40; i++) segurarOTempo(0.05, 0.05);
        passoDoImpacto(0.06);
        expect(escalaDoTempo(), 'o tempo não voltou').toBe(1);
    });
});
