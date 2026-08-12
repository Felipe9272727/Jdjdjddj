import { describe, it, expect } from 'vitest';
import { CASHIER_POS } from '../constants';
import { olharOAndar } from '../agente/agenteObjetivo';
import type { Interagivel } from '../agente/agenteInteracao';
import {
    type Opcao, type Ranqueador, PISO_DA_VONTADE, escolher, jogarUmTurno, opcoesDaqui,
    ranqueadorDePalavras,
} from '../agente/agenteVontade';

const NO_SAGUAO = { x: 0, z: 0 };

describe('o menu só oferece o que o corpo cumpre', () => {
    // ── A QUEIXA QUE ISTO MATA ────────────────────────────────────────────
    //   "por mais que o vetor acerte, no campo, o Nilo não anda realmente"
    // A ordem é o conserto: o mundo diz o que é possível, e só então a vontade
    // escolhe. Um menu montado antes da percepção deixa o modelo escolher o
    // impossível — e um modelo que escolhe o impossível vira um NPC parado,
    // sem erro nenhum no log, porque do ponto de vista do código ele decidiu.
    it('saguão: oferece elevador, recepção e explorar', () => {
        const menu = opcoesDaqui(olharOAndar(0, NO_SAGUAO), NO_SAGUAO);
        expect(menu.map((o) => o.id).sort())
            .toEqual(['elevador', 'explorar', 'interagir:recepção']);
    });

    it('num andar em que o cab não leva, o elevador NÃO entra no menu', () => {
        // Oferecer "ir para outro andar" no Andar 8 seria convidar o agente a
        // andar até o cab e esperar uma viagem que nunca começa.
        for (const nivel of [5, 6, 7, 8, 9, 10]) {
            const menu = opcoesDaqui(olharOAndar(nivel, NO_SAGUAO), NO_SAGUAO);
            expect(menu.some((o) => o.tipo === 'elevador'), `andar ${nivel}`).toBe(false);
        }
    });

    it('o inalcançável não entra no menu', () => {
        const fantasma: Interagivel = { nome: 'lua', pos: { x: 900, z: 900 }, alcance: 1 };
        const menu = opcoesDaqui(olharOAndar(0, NO_SAGUAO), NO_SAGUAO, [fantasma]);
        expect(menu.some((o) => o.id.includes('lua'))).toBe(false);
    });

    it('o menu nunca sai vazio', () => {
        // Menu vazio = agente congelado. `explorar` é o piso, em todo andar.
        for (const nivel of [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11]) {
            const menu = opcoesDaqui(olharOAndar(nivel, NO_SAGUAO), NO_SAGUAO);
            expect(menu.length, `andar ${nivel}`).toBeGreaterThan(0);
            expect(menu[menu.length - 1].tipo).toBe('explorar');
        }
    });

    it('todo item do menu é executável de verdade', () => {
        // A promessa inteira do arquivo em uma asserção: pegue qualquer opção,
        // mande o corpo, e ele cumpre.
        const de = NO_SAGUAO;
        const andar = olharOAndar(0, de);
        for (const opcao of opcoesDaqui(andar, de)) {
            const t = jogarUmTurno(andar, de, opcao.rotulo);
            expect(t.escolha.opcao.id, `escolheu ${t.escolha.opcao.id} para "${opcao.rotulo}"`)
                .toBe(opcao.id);
            expect(t.cumpriu, `${opcao.id}: ${t.andou.motivo}`).toBe(true);
        }
    });
});

describe('a vontade escolhe, e nunca devolve "nada"', () => {
    const menu = (): Opcao[] => [
        { id: 'a', rotulo: 'entrar no elevador e ir para outro andar', tipo: 'elevador', alvo: { x: 0, z: -13 } },
        { id: 'b', rotulo: 'chegar perto da recepção', tipo: 'interagir', alvo: { x: 1, z: 1 }, alcance: 2 },
        { id: 'c', rotulo: 'ir ver a parte mais distante deste andar', tipo: 'explorar', alvo: { x: 5, z: 5 } },
    ];

    it('pensamento sobre o elevador escolhe o elevador', () => {
        expect(escolher(menu(), 'preciso entrar no elevador').opcao.id).toBe('a');
    });

    it('pensamento sobre a recepção escolhe a recepção', () => {
        expect(escolher(menu(), 'quero falar com a recepção').opcao.id).toBe('b');
    });

    it('pensamento que não casa com nada cai no explorar, não no vazio', () => {
        // ── POR QUE ISTO É O CONTRÁRIO DE UM ERRO ────────────────────────
        // Um agente que congela quando não entende a própria vontade é pior
        // que um que anda para o lugar errado: o errado se corrige no turno
        // seguinte, o congelado não gera turno nenhum.
        const e = escolher(menu(), 'banana tartaruga guarda-chuva');
        expect(e.opcao.tipo).toBe('explorar');
        expect(e.porPadrao).toBe(true);
        expect(e.nota).toBeLessThan(PISO_DA_VONTADE);
    });

    it('pensamento vazio também anda', () => {
        expect(escolher(menu(), '').opcao.tipo).toBe('explorar');
    });

    it('a margem denuncia a dúvida', () => {
        const certo = escolher(menu(), 'entrar no elevador para outro andar');
        expect(certo.margem).toBeGreaterThan(0);
        expect(certo.porPadrao).toBe(false);
    });

    it('menu vazio é erro de programação, e diz isso', () => {
        expect(() => escolher([], 'qualquer coisa')).toThrow(/menu vazio/);
    });
});

describe('o ranqueador é injetável — o vetor entra sem este módulo saber dele', () => {
    it('um ranqueador de fora manda na escolha', () => {
        // No jogo quem ranqueia é o EmbeddingGemma. Ele não é importado aqui de
        // propósito: um módulo que carrega 333 MB não é mensurável sem rede, e
        // a decisão precisa ser mensurável.
        const soAUltima: Ranqueador = (_p, rotulos) => rotulos.map((_r, i) =>
            (i === rotulos.length - 1 ? 1 : 0));
        const menu: Opcao[] = [
            { id: 'a', rotulo: 'entrar no elevador', tipo: 'elevador', alvo: { x: 0, z: -13 } },
            { id: 'z', rotulo: 'ir ver o mais distante', tipo: 'explorar', alvo: { x: 5, z: 5 } },
        ];
        expect(escolher(menu, 'entrar no elevador', soAUltima).opcao.id).toBe('z');
    });

    it('o ranqueador de reserva pontua sobreposição de palavras com peso', () => {
        const notas = ranqueadorDePalavras('quero entrar no elevador', [
            'entrar no elevador e ir para outro andar',
            'chegar perto da cama',
        ]);
        expect(notas[0]).toBeGreaterThan(notas[1]);
        // Palavras curtas ("no", "e", "de") não podem carregar a nota — senão
        // qualquer par de frases em português se pareceria.
        expect(ranqueadorDePalavras('no e de a', ['no e de a cama'])[0]).toBe(0);
    });
});

describe('o circuito fecha: pensamento entra, o CORPO se mexe', () => {
    it('"vou até a recepção" faz o corpo andar até o raio da recepção', () => {
        const de = NO_SAGUAO;
        const andar = olharOAndar(0, de);
        const t = jogarUmTurno(andar, de, 'vou chegar perto da recepção');
        expect(t.escolha.opcao.id).toBe('interagir:recepção');
        // ── A ASSERÇÃO QUE É A QUEIXA DO DONO DO JOGO, INVERTIDA ─────────
        // `passos > 0` é a prova de que ele andou. Se um dia isto voltar a
        // ser zero, existe um número para apontar em vez de "ele fica parado".
        expect(t.andou.passos).toBeGreaterThan(0);
        expect(t.cumpriu).toBe(true);
        expect(Math.hypot(t.fim.x - CASHIER_POS.x, t.fim.z - CASHIER_POS.z))
            .toBeLessThanOrEqual(2.5);
    });

    it('"quero sair deste andar" leva o corpo para dentro do cab', () => {
        const de = NO_SAGUAO;
        const andar = olharOAndar(0, de);
        const t = jogarUmTurno(andar, de, 'entrar no elevador e ir para outro andar');
        expect(t.escolha.opcao.tipo).toBe('elevador');
        expect(t.cumpriu).toBe(true);
        expect(t.fim.z).toBeLessThanOrEqual(-10);
    });

    it('em TODO andar, um pensamento sem sentido ainda move o corpo', () => {
        // O caso que importa para "funciona em andares futuros": mesmo sem
        // entender nada, o agente não pode congelar em nenhum andar.
        for (const nivel of [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11]) {
            const de = NO_SAGUAO;
            const andar = olharOAndar(nivel, de);
            const t = jogarUmTurno(andar, de, 'zzz qqq xxx');
            expect(t.escolha.porPadrao, `andar ${nivel}`).toBe(true);
            expect(t.andou.passos, `andar ${nivel} não andou`).toBeGreaterThan(0);
        }
    });

    it('turno após turno, ele sai do lugar — a posição final alimenta o próximo', () => {
        const andar = olharOAndar(0, NO_SAGUAO);
        let onde = NO_SAGUAO;
        const visitados = [onde];
        for (const pensamento of ['quero falar com a recepção', 'entrar no elevador para outro andar']) {
            const t = jogarUmTurno(andar, onde, pensamento);
            expect(t.cumpriu, `"${pensamento}": ${t.andou.motivo}`).toBe(true);
            onde = t.fim;
            visitados.push(onde);
        }
        // Três posições distintas: ele foi à recepção e voltou ao elevador.
        expect(Math.hypot(visitados[1].x - visitados[0].x, visitados[1].z - visitados[0].z))
            .toBeGreaterThan(3);
        expect(Math.hypot(visitados[2].x - visitados[1].x, visitados[2].z - visitados[1].z))
            .toBeGreaterThan(3);
    });
});
