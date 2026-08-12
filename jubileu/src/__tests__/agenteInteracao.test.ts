import { describe, it, expect } from 'vitest';
import {
    BED_INTERACT_DIST, BED_POS, CASHIER_INTERACT_DIST, CASHIER_POS, DOOR_INTERACT_DIST,
} from '../constants';
import { PRISON_DEVICES, PRISON_REACH } from '../npc/f10Prison';
import { olharOAndar } from '../agente/agenteObjetivo';
import {
    type Interagivel, chegarPerto, interagiveisDoAndar, oQueDaParaAlcancar,
} from '../agente/agenteInteracao';

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);

describe('o catálogo de interagíveis é o do JOGO', () => {
    // ── POR QUE ESTE BLOCO EXISTE ─────────────────────────────────────────
    // Um raio copiado à mão é um bug silencioso: o agente para a 3 m de um
    // balcão que só aceita a 2,5 e conclui que o jogo está quebrado. Aqui cada
    // número é conferido contra a constante que o `Player.tsx`/`App.tsx` usa.
    it('a recepção usa o raio da recepção', () => {
        const recepcao = interagiveisDoAndar(0).find((i) => i.nome === 'recepção');
        expect(recepcao?.alcance).toBe(CASHIER_INTERACT_DIST);
        expect(recepcao?.pos).toEqual({ x: CASHIER_POS.x, z: CASHIER_POS.z });
    });

    it('a cama usa a posição que o App lê — não uma cópia', () => {
        const cama = interagiveisDoAndar(1).find((i) => i.nome === 'cama');
        expect(cama?.pos).toEqual({ x: BED_POS.x, z: BED_POS.z });
        expect(cama?.alcance).toBe(BED_INTERACT_DIST);
    });

    it('a porta da casa usa o raio da porta', () => {
        expect(interagiveisDoAndar(1).find((i) => i.nome === 'porta da casa')?.alcance)
            .toBe(DOOR_INTERACT_DIST);
    });

    it('os aparelhos do Andar 10 são os da prisão, com o alcance da prisão', () => {
        const dez = interagiveisDoAndar(10);
        expect(dez.map((i) => i.nome).sort()).toEqual(PRISON_DEVICES.map((d) => d.id).sort());
        for (const i of dez) expect(i.alcance).toBe(PRISON_REACH);
    });

    it('andar sem catálogo devolve lista vazia — não explode', () => {
        // A promessa "funciona em andares futuros": um andar que ninguém
        // cadastrou é um caso NORMAL, e a lista vazia é uma resposta que o
        // agente trata (ele explora). Uma escada de `if` devolveria undefined.
        for (const nivel of [2, 3, 5, 6, 7, 8, 9, 11, 99]) {
            expect(interagiveisDoAndar(nivel)).toEqual([]);
        }
    });

    it('os interagíveis móveis entram por fora', () => {
        // O NPC do saguão anda; a posição dele não é constante e não pode
        // morar numa tabela.
        const nilo: Interagivel = { nome: 'Nilo', pos: { x: 2, z: 2 }, alcance: 4 };
        expect(interagiveisDoAndar(0, [nilo]).map((i) => i.nome)).toContain('Nilo');
    });
});

describe('ele chega perto o bastante para o jogo aceitar', () => {
    it('saguão: anda até a recepção e entra no raio', () => {
        const de = { x: 0, z: 0 };
        const andar = olharOAndar(0, de);
        const recepcao = interagiveisDoAndar(0)[0];
        const r = chegarPerto(andar, de, recepcao);
        expect(r.motivo, `parou por ${r.motivo}`).toBe('chegou');
        expect(r.encostou, `parou a ${r.distancia.toFixed(2)}m, precisa de ${recepcao.alcance}`)
            .toBe(true);
        expect(r.distancia).toBeLessThanOrEqual(recepcao.alcance);
        expect(r.passos).toBeGreaterThan(0);
    });

    it('casa: alcança a porta e a cama', () => {
        const de = { x: 0, z: 0 };
        const andar = olharOAndar(1, de);
        for (const alvo of interagiveisDoAndar(1)) {
            const r = chegarPerto(andar, de, alvo);
            expect(r.encostou, `${alvo.nome}: ${r.motivo}, ${r.distancia.toFixed(2)}m`).toBe(true);
        }
    });

    it('Andar 10: alcança os quatro aparelhos da prisão', () => {
        const de = { x: 0, z: 0 };
        const andar = olharOAndar(10, de);
        for (const alvo of interagiveisDoAndar(10)) {
            const r = chegarPerto(andar, de, alvo);
            expect(r.encostou, `${alvo.nome}: ${r.motivo}, ${r.distancia.toFixed(2)}m`).toBe(true);
            // O raio da prisão é 0,9 m — apertado o bastante para que a folga
            // padrão do andador (0,45 m) fosse metade dele. É este caso que
            // justifica a tolerância de chegada ter virado parâmetro.
            expect(r.distancia).toBeLessThanOrEqual(PRISON_REACH);
        }
    });

    it('já estando perto, não dá um passo', () => {
        const perto = { x: CASHIER_POS.x - 1, z: CASHIER_POS.z };
        const andar = olharOAndar(0, perto);
        const r = chegarPerto(andar, perto, interagiveisDoAndar(0)[0]);
        expect(r.jaEstava).toBe(true);
        expect(r.passos).toBe(0);
        expect(r.encostou).toBe(true);
    });
});

describe('ele sabe quando NÃO alcança', () => {
    it('objeto fora do mundo: "sem-caminho", não um agente batendo na parede', () => {
        const de = { x: 0, z: 0 };
        const andar = olharOAndar(0, de);
        const fantasma: Interagivel = { nome: 'nada', pos: { x: 500, z: 500 }, alcance: 1 };
        const r = chegarPerto(andar, de, fantasma);
        expect(r.motivo).toBe('sem-caminho');
        expect(r.encostou).toBe(false);
        expect(r.passos).toBe(0);
    });

    it('com a porta FECHADA, o lado de fora não é alcançável — e com ela aberta, é', () => {
        // ── O TESTE QUE EU TINHA ESCRITO ERRADO ──────────────────────────
        // A primeira versão dizia "a recepção fica do outro lado de uma parede
        // no Andar 1". Falso, e o teste me corrigiu: `CASHIER_POS` cai no
        // GRAMADO do Andar 1, chão aberto, e o agente chega lá andando. A
        // barreira que eu queria testar tinha de ser uma barreira de verdade.
        //
        // Esta é: de dentro da casa, com a porta selada, o lado de fora não
        // existe a pé. Abrir a porta muda a resposta — é o mesmo agente, o
        // mesmo alvo, e só a parede mudou. É isso que separa "a porta está
        // trancada" de "eu não sei o caminho".
        //
        // (O ponto de partida também foi medido: em (-2, 12) o agente alcança
        // DUAS células — está entalado entre a cama e a parede, um bolso em que
        // o jogador também não caberia. Vale para lembrar que "não alcança"
        // pode ser sobre onde ele começou, não sobre o destino.)
        const noQuarto = { x: -2, z: 8 };
        const laFora = {
            nome: 'recepção', pos: { ...CASHIER_POS }, alcance: CASHIER_INTERACT_DIST,
        };
        const fechada = chegarPerto(olharOAndar(1, noQuarto, false), noQuarto, laFora);
        expect(fechada.encostou).toBe(false);
        expect(fechada.motivo).toBe('sem-caminho');

        const aberta = chegarPerto(olharOAndar(1, noQuarto, true), noQuarto, laFora);
        expect(aberta.encostou).toBe(true);
    });

    it('escolhe o alcançável mais perto, e null quando não há nenhum', () => {
        const de = { x: 0, z: 0 };
        expect(oQueDaParaAlcancar(olharOAndar(0, de), de)?.nome).toBe('recepção');
        // Andar 2 não tem catálogo: nada com que interagir é uma resposta.
        expect(oQueDaParaAlcancar(olharOAndar(2, de), de)).toBe(null);
    });

    it('entre dois aparelhos, vai no mais perto', () => {
        const de = { x: 6, z: -6 };
        const andar = olharOAndar(10, de);
        const escolhido = oQueDaParaAlcancar(andar, de);
        const outros = interagiveisDoAndar(10)
            .filter((i) => i.nome !== escolhido?.nome);
        for (const o of outros) {
            expect(dist(de, escolhido!.pos)).toBeLessThanOrEqual(dist(de, o.pos));
        }
    });
});
