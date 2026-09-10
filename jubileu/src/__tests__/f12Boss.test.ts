import { describe, it, expect, beforeEach } from 'vitest';
import {
    ARENA, meioY, dentroDaArena,
    BOCA, CICLO_DA_BOCA, bocaNoInstante, vulneravel,
    VIDA_MAXIMA, LIMIAR_DA_VIRADA, ferir, f12, f12Reset,
    ATAQUES, ataqueDaVez, fichaDoAtaque,
    LEQUE, nascerLeque,
    TELEGUIADO, nascerTeleguiado, guiarTeleguiado,
    NAVES, nascerNaves,
    MARE, nascerMare, frestaDaMare, mareAcerta,
    ELEVADORES, nascerElevadores, xDaFaixa,
    TIRO, nascerTiro, tiroNaBoca, BOCA_ALVO,
    NAVE, novaNave, passoDaNave, tomarToque,
    encostou, reiniciarIds, passoDoProjetil, saiuDeCena,
    ENQUADRAMENTO, larguraDoQuadro,
    type Projetil, type NomeDoAtaque,
} from '../f12Boss';

const passo = (p: Projetil, dt: number) => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.t += dt;
};

beforeEach(() => { f12Reset(); reiniciarIds(); });

describe('f12 — a arena', () => {
    it('prende a nave dentro das bordas, que é o que faz o desvio existir', () => {
        expect(dentroDaArena(999, 999)).toEqual({ x: ARENA.x, y: ARENA.yAlto });
        expect(dentroDaArena(-999, -999)).toEqual({ x: -ARENA.x, y: ARENA.yBaixo });
        expect(dentroDaArena(1.2, 3.4)).toEqual({ x: 1.2, y: 3.4 });
    });

    it('a cabeça está longe o bastante para os padrões terem tempo de abrir', () => {
        // O leque nasce colado e precisa de curso para virar vão. Se a cabeça
        // chegar perto, ele bate como parede e o ataque deixa de ser desviável.
        const curso = Math.abs(ARENA.zCabeca - ARENA.zNave);
        const tempo = curso / LEQUE.velocidadeZ;
        const aberturaFinal = LEQUE.largura0 + LEQUE.abrePorSegundo * tempo;
        expect(aberturaFinal).toBeGreaterThan(ARENA.x * 0.5);
    });
});

// ── O COMPASSO ───────────────────────────────────────────────────────────────
describe('f12 — a boca é o relógio da luta', () => {
    it('percorre os quatro estados na ordem e volta ao começo', () => {
        expect(bocaNoInstante(0).estado).toBe('fechada');
        expect(bocaNoInstante(BOCA.fechada + 0.01).estado).toBe('abrindo');
        expect(bocaNoInstante(BOCA.fechada + BOCA.abrindo + 0.01).estado).toBe('aberta');
        expect(bocaNoInstante(BOCA.fechada + BOCA.abrindo + BOCA.aberta + 0.01).estado).toBe('fechando');
        // e o ciclo fecha
        expect(bocaNoInstante(CICLO_DA_BOCA + 0.001).estado).toBe('fechada');
    });

    it('a abertura é contínua nas emendas — nada de salto na malha', () => {
        const e = 1e-4;
        const emendas = [
            BOCA.fechada,
            BOCA.fechada + BOCA.abrindo,
            BOCA.fechada + BOCA.abrindo + BOCA.aberta,
            CICLO_DA_BOCA,
        ];
        for (const t of emendas) {
            const antes = bocaNoInstante(t - e).abertura;
            const depois = bocaNoInstante(t + e).abertura;
            expect(Math.abs(depois - antes), `salto em t=${t}`).toBeLessThan(0.02);
        }
    });

    it('tempo negativo não quebra o ciclo (o relógio pode chegar assim)', () => {
        expect(bocaNoInstante(-0.5).abertura).toBeGreaterThanOrEqual(0);
        expect(bocaNoInstante(-0.5).abertura).toBeLessThanOrEqual(1);
        expect(bocaNoInstante(-CICLO_DA_BOCA * 3 - 0.1).estado).toBeTruthy();
    });

    // ── A JANELA DE DANO ─────────────────────────────────────────────────
    // O ponto fraco é a boca aberta. Se a janela for mais curta que o tempo de
    // reação humano, o chefe deixa de ser difícil e passa a ser injusto.
    it('só dá para ferir de boca aberta, e a janela cabe numa reação humana', () => {
        expect(vulneravel(bocaNoInstante(0))).toBe(false);
        expect(vulneravel(bocaNoInstante(BOCA.fechada + BOCA.abrindo + 0.5))).toBe(true);
        expect(BOCA.aberta).toBeGreaterThan(1.2);
    });

    it('a boca passa mais tempo fechada+abrindo do que aberta é largo demais', () => {
        // Não pode ser um chefe permanentemente vulnerável: o descanso do
        // jogador (fechada) tem de existir de verdade.
        expect(BOCA.fechada).toBeGreaterThan(0.6);
        expect(BOCA.aberta / CICLO_DA_BOCA).toBeLessThan(0.55);
    });
});

// ── O RODÍZIO ────────────────────────────────────────────────────────────────
describe('f12 — os cinco ataques e a ordem deles', () => {
    it('são cinco, com nomes únicos, e dois só entram depois da virada', () => {
        expect(ATAQUES).toHaveLength(5);
        expect(new Set(ATAQUES.map((a) => a.nome)).size).toBe(5);
        expect(ATAQUES.filter((a) => a.depoisDaVirada)).toHaveLength(2);
    });

    it('cada ataque tem grito e uma referência de lore — é o pedido do andar', () => {
        for (const a of ATAQUES) {
            expect(a.grito.length, a.nome).toBeGreaterThan(3);
            expect(a.lore.length, a.nome).toBeGreaterThan(20);
        }
    });

    // ── NADA DE SORTEIO ──────────────────────────────────────────────────
    // Um chefe sorteado é injusto de um jeito que o jogador sente e não
    // consegue nomear. O rodízio deixa a luta APRENDÍVEL.
    it('a ordem é determinística: a mesma partida dá a mesma sequência', () => {
        const a = Array.from({ length: 20 }, (_, i) => ataqueDaVez(i, false));
        const b = Array.from({ length: 20 }, (_, i) => ataqueDaVez(i, false));
        expect(a).toEqual(b);
    });

    it('antes da virada só rodam os três primeiros', () => {
        const vistos = new Set<NomeDoAtaque>();
        for (let i = 0; i < 30; i++) vistos.add(ataqueDaVez(i, false));
        expect(vistos).toEqual(new Set(['leque', 'teleguiado', 'naves']));
    });

    it('depois da virada os cinco entram, e os dois novos vêm logo', () => {
        const primeiros = Array.from({ length: 8 }, (_, i) => ataqueDaVez(i, true));
        expect(primeiros[0]).toBe('mare');                      // a virada é sentida no ato
        const vistos = new Set(Array.from({ length: 24 }, (_, i) => ataqueDaVez(i, true)));
        expect(vistos.size).toBe(5);
    });

    it('nenhum par de ataques NOVOS cai colado — chefe que ensina, não que pune', () => {
        const novos = new Set(ATAQUES.filter((a) => a.depoisDaVirada).map((a) => a.nome));
        for (let i = 0; i < 40; i++) {
            const a = ataqueDaVez(i, true), b = ataqueDaVez(i + 1, true);
            expect(novos.has(a) && novos.has(b), `${i}: ${a} → ${b}`).toBe(false);
        }
    });

    it('índice sujo não quebra o rodízio', () => {
        expect(() => ataqueDaVez(-3, false)).not.toThrow();
        expect(ATAQUES.map((a) => a.nome)).toContain(ataqueDaVez(-3, true));
        expect(fichaDoAtaque('mare').grito).toBe('A MARÉ DO 2º');
    });
});

// ── ATAQUE 1: O LEQUE ────────────────────────────────────────────────────────
describe('f12 — o leque: cinco grudados que vão abrindo', () => {
    it('nasce com cinco, praticamente encostados — o "_ _ _ _ _" do pedido', () => {
        const p = nascerLeque(0, meioY());
        expect(p).toHaveLength(5);
        const xs = p.map((q) => q.x).sort((a, b) => a - b);
        const vaoInicial = xs[1] - xs[0];
        // o vão inicial é MENOR que o diâmetro do projétil: é uma parede
        expect(vaoInicial).toBeLessThan(LEQUE.raio * 2);
    });

    it('abre de verdade: o vão cresce e vira desvio antes de chegar', () => {
        const p = nascerLeque(0, meioY());
        const vao = () => {
            const xs = p.map((q) => q.x).sort((a, b) => a - b);
            return Math.min(...xs.slice(1).map((x, i) => x - xs[i]));
        };
        const inicial = vao();
        const dt = 1 / 60;
        while (p[0].z < ARENA.zNave) for (const q of p) passo(q, dt);
        const final = vao();
        expect(final).toBeGreaterThan(inicial);
        // e o vão final tem de caber a nave, senão o ataque é indesviável
        expect(final).toBeGreaterThan(NAVE.raio * 2 + LEQUE.raio * 2);
    });

    // ── E NÃO PODE ABRIR DEMAIS ──────────────────────────────────────────
    // Um leque que passa das bordas da arena deixa de ameaçar: os de fora saem
    // do mapa e sobram três. A abertura tem de caber na arena inteira.
    it('os de fora continuam dentro da arena quando chegam', () => {
        const p = nascerLeque(0, meioY());
        const dt = 1 / 60;
        while (p[0].z < ARENA.zNave) for (const q of p) passo(q, dt);
        for (const q of p) expect(Math.abs(q.x), 'saiu da arena').toBeLessThan(ARENA.x);
    });

    it('abre simétrico: o do meio não sai do lugar em X', () => {
        const p = nascerLeque(0, meioY());
        const dt = 1 / 60;
        for (let i = 0; i < 60; i++) for (const q of p) passo(q, dt);
        const meio = p[(p.length - 1) / 2];
        expect(meio.x).toBeCloseTo(0, 6);
        const xs = p.map((q) => q.x);
        expect(xs[0]).toBeCloseTo(-xs[xs.length - 1], 6);
    });

    it('nasce na frente da cabeça e anda para o jogador', () => {
        const p = nascerLeque(2, 3);
        for (const q of p) {
            expect(q.z).toBeLessThan(ARENA.zNave);
            expect(q.vz).toBeGreaterThan(0);
        }
    });
});

// ── ATAQUE 2: O TELEGUIADO ───────────────────────────────────────────────────
describe('f12 — o teleguiado: persegue, mas dá para despistar', () => {
    it('vira na direção do alvo', () => {
        const m = nascerTeleguiado();
        m.vx = 0; m.vy = -1;                    // apontado para baixo
        for (let i = 0; i < 30; i++) guiarTeleguiado(m, 5, m.y + 5, 1 / 60);
        expect(m.vx).toBeGreaterThan(0);        // virou para a direita/cima
        expect(m.vy).toBeGreaterThan(-1);
    });

    // ── E NÃO PODE SER PERFEITO ──────────────────────────────────────────
    // Um teleguiado que corrige sem limite não é desafio, é sentença. O que o
    // torna despistável é o raio de curva.
    it('a curva é limitada: não gira mais que `curvaPorSegundo`', () => {
        const m = nascerTeleguiado();
        m.vx = 1; m.vy = 0;
        const antes = Math.atan2(m.vy, m.vx);
        guiarTeleguiado(m, m.x - 10, m.y, 1 / 60);     // alvo exatamente atrás
        const depois = Math.atan2(m.vy, m.vx);
        let d = Math.abs(depois - antes);
        if (d > Math.PI) d = Math.PI * 2 - d;
        expect(d).toBeLessThanOrEqual(TELEGUIADO.curvaPorSegundo / 60 + 1e-9);
    });

    it('um jogador que vira na hora certa faz ele passar batido', () => {
        const m = nascerTeleguiado();
        m.vx = 0; m.vy = 0;
        // O jogador corre para um lado até o míssil comprometer, e então
        // inverte — a manobra clássica de despiste.
        let px = 0, py = meioY();
        const dt = 1 / 60;
        let perto = Infinity;
        for (let i = 0; i < 60 * 4; i++) {
            const t = i * dt;
            px = t < 1.1 ? Math.min(ARENA.x, px + 9 * dt) : Math.max(-ARENA.x, px - 11 * dt);
            guiarTeleguiado(m, px, py, dt);
            passo(m, dt);
            if (m.z > ARENA.zNave - 1 && m.z < ARENA.zNave + 1) {
                perto = Math.min(perto, Math.hypot(m.x - px, m.y - py));
            }
        }
        expect(perto).toBeGreaterThan(NAVE.raio + TELEGUIADO.raio);
    });

    it('sem combustível ele desiste e segue reto — não orbita para sempre', () => {
        const m = nascerTeleguiado();
        m.vx = 3; m.vy = 0; m.t = TELEGUIADO.combustivel + 1;
        const vx = m.vx, vy = m.vy;
        guiarTeleguiado(m, m.x, m.y + 50, 1 / 60);
        expect(m.vx).toBe(vx); expect(m.vy).toBe(vy);
    });

    it('alvo em cima dele não gera NaN', () => {
        const m = nascerTeleguiado();
        guiarTeleguiado(m, m.x, m.y, 1 / 60);
        expect(Number.isFinite(m.vx)).toBe(true);
        expect(Number.isFinite(m.vy)).toBe(true);
    });
});

// ── ATAQUE 3: AS CAMAREIRAS ──────────────────────────────────────────────────
describe('f12 — as mini naves aliadas da cabeça', () => {
    it('nascem espalhadas, dentro da arena, e morrem de tiro', () => {
        const n = nascerNaves();
        expect(n).toHaveLength(NAVES.quantas);
        for (const q of n) {
            expect(Math.abs(q.x)).toBeLessThanOrEqual(ARENA.x);
            expect(q.hp).toBeGreaterThan(0);
        }
        expect(new Set(n.map((q) => q.x)).size).toBeGreaterThan(1);
    });

    it('é o único padrão que se resolve ATIRANDO — os outros são desvio', () => {
        const comVida = ['naves'];
        expect(nascerLeque(0, 3)[0].hp).toBeUndefined();
        expect(nascerTeleguiado().hp).toBeUndefined();
        expect(nascerNaves()[0].hp).toBeDefined();
        expect(comVida).toContain(nascerNaves()[0].tipo);
    });
});

// ── ATAQUE 4: A MARÉ ─────────────────────────────────────────────────────────
describe('f12 — a maré do 2º: uma parede com uma fresta', () => {
    it('acerta fora da fresta e poupa dentro dela', () => {
        const m = nascerMare(0);
        const f = frestaDaMare(m);
        expect(mareAcerta(m, f)).toBe(false);
        expect(mareAcerta(m, f + MARE.fresta * 0.5)).toBe(false);
        expect(mareAcerta(m, f + MARE.fresta * 2)).toBe(true);
    });

    it('a fresta cabe a nave com folga — senão não é desvio, é sorte', () => {
        expect(MARE.fresta).toBeGreaterThan(NAVE.raio * 2);
    });

    it('a fresta passeia, mas nunca sai da arena — ela tem de ser alcançável', () => {
        for (const fase of [0, 1, 2, 3, 4, 5]) {
            const m = nascerMare(fase);
            for (let i = 0; i < 200; i++) {
                m.t += 1 / 60;
                const f = frestaDaMare(m);
                expect(Math.abs(f) + MARE.fresta, `fase ${fase}`).toBeLessThanOrEqual(ARENA.x + 0.01);
            }
        }
    });

    it('a onda passeia devagar: dá para chegar na fresta antes de ela chegar', () => {
        // Velocidade máxima da fresta contra a da nave. Se a fresta corre mais
        // que a nave, o ataque é indesviável por construção.
        const vFresta = MARE.passeioAmp * MARE.passeioHz * Math.PI * 2;
        expect(vFresta).toBeLessThan(NAVE.velocidadeMaxima * 0.6);
    });
});

// ── ATAQUE 5: A ESPINHA ──────────────────────────────────────────────────────
describe('f12 — as cabines de elevador caindo', () => {
    it('deixa exatamente uma faixa vazia, e ela é a saída', () => {
        for (let v = 0; v < ELEVADORES.faixas; v++) {
            const p = nascerElevadores(v);
            expect(p).toHaveLength(ELEVADORES.faixas - 1);
            const faixas = p.map((q) => q.p);
            expect(faixas).not.toContain(v);
        }
    });

    it('as faixas cabem na arena e têm vão entre si', () => {
        for (let i = 0; i < ELEVADORES.faixas; i++) {
            expect(Math.abs(xDaFaixa(i))).toBeLessThanOrEqual(ARENA.x);
        }
        const vao = Math.abs(xDaFaixa(1) - xDaFaixa(0));
        expect(vao).toBeGreaterThan(ELEVADORES.raio * 2);
    });

    it('faixa vazia fora da conta não quebra (e continua deixando uma saída)', () => {
        for (const v of [-1, 99, 5]) {
            const p = nascerElevadores(v);
            expect(p).toHaveLength(ELEVADORES.faixas - 1);
        }
    });

    it('elas descem enquanto avançam — este é o padrão do eixo VERTICAL', () => {
        const p = nascerElevadores(2);
        for (const q of p) { expect(q.vy).toBeLessThan(0); expect(q.vz).toBeGreaterThan(0); }
    });
});

// ── O TIRO E O PONTO FRACO ───────────────────────────────────────────────────
describe('f12 — atirar na boca', () => {
    it('o tiro vai na direção da cabeça', () => {
        const t = nascerTiro(1, 3, 'jogador');
        expect(t.vz).toBeLessThan(0);
        expect(t.de).toBe('jogador');
    });

    it('só conta como acerto perto da cabeça e dentro do alvo da boca', () => {
        const t = nascerTiro(BOCA_ALVO.x, BOCA_ALVO.y, 'jogador');
        t.z = ARENA.zNave;
        expect(tiroNaBoca(t)).toBe(false);              // ainda longe
        t.z = ARENA.zCabeca + 1;
        expect(tiroNaBoca(t)).toBe(true);
        t.x = BOCA_ALVO.x + BOCA_ALVO.raio + 1;
        expect(tiroNaBoca(t)).toBe(false);              // fora da boca
    });

    it('projétil que não é tiro nunca fere a cabeça', () => {
        const q = nascerLeque(0, BOCA_ALVO.y)[0];
        q.z = ARENA.zCabeca + 1; q.x = BOCA_ALVO.x; q.y = BOCA_ALVO.y;
        expect(tiroNaBoca(q)).toBe(false);
    });

    it('o irmão é ALA, não protagonista: atira mais devagar e mais fraco', () => {
        expect(TIRO.cadenciaIrmao).toBeGreaterThan(TIRO.cadencia);
        expect(TIRO.danoIrmao).toBeLessThan(TIRO.dano);
    });

    it('a luta não dura nem rápido nem eterno demais', () => {
        // Só com o jogador atirando a janela inteira, em quantas aberturas ela cai?
        const porJanela = (BOCA.aberta / TIRO.cadencia) * TIRO.dano;
        const janelas = VIDA_MAXIMA / porJanela;
        expect(janelas).toBeGreaterThan(2.5);
        expect(janelas).toBeLessThan(12);
    });
});

// ── A VIDA E A VIRADA ────────────────────────────────────────────────────────
describe('f12 — a vida da cabeça e a virada da metade', () => {
    it('a virada dispara UMA vez, no golpe que cruza a metade', () => {
        expect(ferir(VIDA_MAXIMA * 0.2)).toBe(false);
        expect(f12.vida).toBeCloseTo(VIDA_MAXIMA * 0.8);
        expect(ferir(VIDA_MAXIMA * 0.31)).toBe(true);     // cruzou os 50
        expect(ferir(1)).toBe(false);                     // já cruzou; não repete
    });

    it('a vida não passa de zero e ferir um cadáver não dispara nada', () => {
        ferir(VIDA_MAXIMA * 10);
        expect(f12.vida).toBe(0);
        expect(ferir(5)).toBe(false);
        expect(f12.vida).toBe(0);
    });

    it('o limiar é mesmo a metade', () => {
        expect(LIMIAR_DA_VIRADA).toBe(VIDA_MAXIMA / 2);
    });

    it('o reset devolve tudo ao começo', () => {
        ferir(70); f12.fase = 'luta'; f12.projeteis.push(nascerTeleguiado());
        f12Reset();
        expect(f12.vida).toBe(VIDA_MAXIMA);
        expect(f12.fase).toBe('intro');
        expect(f12.projeteis).toHaveLength(0);
    });
});

// ── A NAVE ───────────────────────────────────────────────────────────────────
describe('f12 — a nave do jogador', () => {
    it('acelera, e o atrito a segura abaixo do teto', () => {
        const n = novaNave(0, meioY());
        for (let i = 0; i < 600; i++) passoDaNave(n, 1, 0, 1 / 60);
        expect(Math.hypot(n.vx, n.vy)).toBeLessThanOrEqual(NAVE.velocidadeMaxima + 1e-6);
    });

    it('inverter o comando FREIA — é o que faz o desvio ser preciso', () => {
        const n = novaNave(0, meioY());
        for (let i = 0; i < 30; i++) passoDaNave(n, 1, 0, 1 / 60);
        const correndo = n.vx;
        for (let i = 0; i < 10; i++) passoDaNave(n, -1, 0, 1 / 60);
        expect(n.vx).toBeLessThan(correndo);
    });

    it('nunca sai da arena, nem no comando máximo por muito tempo', () => {
        const n = novaNave(0, meioY());
        for (let i = 0; i < 1200; i++) {
            passoDaNave(n, i % 200 < 100 ? 1 : -1, i % 120 < 60 ? 1 : -1, 1 / 60);
            expect(Math.abs(n.x)).toBeLessThanOrEqual(ARENA.x + 1e-6);
            expect(n.y).toBeGreaterThanOrEqual(ARENA.yBaixo - 1e-6);
            expect(n.y).toBeLessThanOrEqual(ARENA.yAlto + 1e-6);
        }
    });

    it('a rolagem segue a velocidade e fica no limite', () => {
        const n = novaNave(0, meioY());
        for (let i = 0; i < 120; i++) passoDaNave(n, 1, 0, 1 / 60);
        expect(Math.abs(n.rolagem)).toBeLessThanOrEqual(NAVE.rolagemMaxima + 1e-6);
        expect(n.rolagem).toBeLessThan(0);       // indo para a direita, inclina
    });

    it('dt grande não teleporta a nave (a aba volta do segundo plano)', () => {
        const n = novaNave(0, meioY());
        passoDaNave(n, 1, 1, 5);
        expect(Math.abs(n.x)).toBeLessThanOrEqual(ARENA.x);
        expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    });

    // ── A PISCADA ────────────────────────────────────────────────────────
    // Sem invencibilidade depois do toque, uma parede de leque tira as quatro
    // vidas num quadro só e o jogador nem vê o que aconteceu.
    it('um toque tira uma vida e dá invencibilidade; o segundo colado não conta', () => {
        const n = novaNave(0, meioY());
        expect(tomarToque(n)).toBe(true);
        expect(n.vidas).toBe(4 - 1);
        expect(tomarToque(n)).toBe(false);
        expect(n.vidas).toBe(4 - 1);
        for (let i = 0; i < 60 * 2; i++) passoDaNave(n, 0, 0, 1 / 60);
        expect(tomarToque(n)).toBe(true);
        expect(n.vidas).toBe(4 - 2);
    });
});

// ── COLISÃO ──────────────────────────────────────────────────────────────────
describe('f12 — colisão', () => {
    it('só colide perto do plano das naves', () => {
        const q = nascerLeque(0, meioY())[2];
        q.x = 0; q.y = meioY(); q.z = ARENA.zCabeca;
        expect(encostou(q, 0, meioY(), NAVE.raio)).toBe(false);
        q.z = ARENA.zNave;
        expect(encostou(q, 0, meioY(), NAVE.raio)).toBe(true);
    });

    it('a maré usa a regra dela: pega quem está fora da fresta', () => {
        const m = nascerMare(0);
        m.z = ARENA.zNave;
        const f = frestaDaMare(m);
        expect(encostou(m, f, meioY(), NAVE.raio)).toBe(false);
        expect(encostou(m, f + MARE.fresta * 3, meioY(), NAVE.raio)).toBe(true);
    });

    it('passar raspando não conta, encostar conta', () => {
        const q = nascerLeque(0, meioY())[2];
        q.z = ARENA.zNave; q.x = 0; q.y = meioY();
        const limite = q.r + NAVE.raio;
        expect(encostou(q, limite + 0.05, meioY(), NAVE.raio)).toBe(false);
        expect(encostou(q, limite - 0.05, meioY(), NAVE.raio)).toBe(true);
    });
});

// ── QUEM MOVE OS PROJÉTEIS ───────────────────────────────────────────────────
//
// O bamboleio das camareiras já esteve no componente que DESENHA, com um
// comentário meu dizendo que "a colisão usa o x reto, é só visual". Era um
// defeito com justificativa: a nave que o jogador vê não seria a que o jogo
// testa, e o dano viria de noventa centímetros ao lado. Movimento tem um dono.
describe('f12 — o movimento mora no módulo, não no desenho', () => {
    it('a camareira bamboleia na POSIÇÃO, e a velocidade lateral acompanha', () => {
        const n = nascerNaves()[0];
        const base = n.base as number;
        expect(base).toBeDefined();
        let maisLonge = 0, vxMax = 0;
        for (let i = 0; i < 60 * 4; i++) {
            passoDoProjetil(n, 0, meioY(), 1 / 60);
            maisLonge = Math.max(maisLonge, Math.abs(n.x - base));
            vxMax = Math.max(vxMax, Math.abs(n.vx));
        }
        expect(maisLonge).toBeGreaterThan(NAVES.ondaAmp * 0.8);
        expect(maisLonge).toBeLessThanOrEqual(NAVES.ondaAmp + 1e-6);
        expect(vxMax, 'vx tem de acompanhar o bamboleio').toBeGreaterThan(0.5);
    });

    it('e a colisão vê o bamboleio — que é o ponto de ele estar aqui', () => {
        const n = nascerNaves()[0];
        const base = n.base as number;
        // Anda até o EXTREMO do bamboleio, onde o desvio passa da soma dos
        // raios — antes disso a nave ainda encosta na linha de repouso e o
        // teste não separaria as duas hipóteses.
        const precisa = n.r + NAVE.raio + 0.15;
        let achou = false;
        for (let i = 0; i < 60 * 6 && !achou; i++) {
            const z = n.z; passoDoProjetil(n, 0, meioY(), 1 / 60); n.z = z;
            achou = Math.abs(n.x - base) > precisa;
        }
        expect(achou, 'o bamboleio tem de afastar mais que os raios somados').toBe(true);
        n.z = ARENA.zNave;
        expect(encostou(n, base, n.y, NAVE.raio), 'colidiu na linha de repouso').toBe(false);
        expect(encostou(n, n.x, n.y, NAVE.raio), 'não colidiu onde ela está').toBe(true);
    });

    it('o resto anda em linha, e o teleguiado é guiado no mesmo passo', () => {
        const l = nascerLeque(0, meioY())[0];
        const vx = l.vx;
        passoDoProjetil(l, 0, meioY(), 1 / 60);
        expect(l.vx).toBe(vx);                       // o leque não muda de rumo

        const m = nascerTeleguiado();
        m.vx = 0; m.vy = -1;
        for (let i = 0; i < 30; i++) passoDoProjetil(m, 6, m.y + 6, 1 / 60);
        expect(m.vx).toBeGreaterThan(0);              // já virou para o alvo
    });

    it('dt grande não teleporta projétil (a aba volta do segundo plano)', () => {
        const l = nascerLeque(0, meioY())[4];
        const z0 = l.z;
        passoDoProjetil(l, 0, meioY(), 10);
        expect(l.z - z0).toBeLessThan(LEQUE.velocidadeZ * 0.06);
    });

    it('saiuDeCena recolhe o que passou, e não recolhe o que ainda ameaça', () => {
        const l = nascerLeque(0, meioY())[0];
        expect(saiuDeCena(l)).toBe(false);
        l.z = ARENA.zNave + 50;
        expect(saiuDeCena(l)).toBe(true);

        const t = nascerTiro(0, meioY(), 'jogador');
        expect(saiuDeCena(t)).toBe(false);
        t.z = ARENA.zCabeca - 10;
        expect(saiuDeCena(t)).toBe(true);            // o tiro sai pelo OUTRO lado

        const c = nascerElevadores(0)[0];
        c.y = ARENA.yBaixo - 20;
        expect(saiuDeCena(c), 'cabine que passou do chão').toBe(true);
    });
});

// ── O ENQUADRAMENTO ──────────────────────────────────────────────────────────
//
// A primeira versão deste andar tinha o avião MAIS LARGO QUE A TELA, e a caixa
// de colisão dele era cinco vezes menor que o desenho. Nenhuma das duas coisas
// aparece num teste de padrão; as duas aparecem numa conta de três linhas.
// `fov` no three é VERTICAL, e a tela do dono do jogo tem aspecto 0,45 — a
// abertura horizontal é menos da metade da vertical, e é ela que manda aqui.
describe('f12 — a arena cabe na tela em pé, e o desenho bate com a regra', () => {
    it('a arena inteira cabe na largura do quadro, com margem', () => {
        const quadro = larguraDoQuadro(ENQUADRAMENTO.recuo);
        expect(quadro, 'a arena não cabe na tela').toBeGreaterThan(ARENA.x * 2);
        // e não pode sobrar tanto a ponto de a arena virar uma tirinha no meio
        expect(quadro).toBeLessThan(ARENA.x * 2 * 1.6);
    });

    it('o avião desenhado é da ordem da caixa que colide', () => {
        // Num jogo de nave o desenho costuma ser um pouco maior que a hitbox
        // (é o que faz o jogo parecer generoso), mas "um pouco" tem limite:
        // cinco vezes é o jogador levando dano do vazio.
        const caixa = NAVE.raio * 2;
        expect(ENQUADRAMENTO.envergadura).toBeGreaterThan(caixa);
        expect(ENQUADRAMENTO.envergadura / caixa,
            'o desenho e a colisão discordam demais').toBeLessThan(3.2);
    });

    it('o avião ocupa uma fatia sensata da tela: dá para ver o piloto e dá para desviar', () => {
        const fracao = ENQUADRAMENTO.envergadura / larguraDoQuadro(ENQUADRAMENTO.recuo);
        expect(fracao, 'avião pequeno demais para ser terceira pessoa').toBeGreaterThan(0.12);
        expect(fracao, 'avião grande demais para desviar de coisa alguma').toBeLessThan(0.40);
    });

    it('a fresta da maré nunca sai da arena — ela tem de ser alcançável', () => {
        expect(MARE.passeioAmp + MARE.fresta).toBeLessThanOrEqual(ARENA.x);
    });

    it('o leque abre até a borda, mas não além dela', () => {
        const tempo = Math.abs(ARENA.zCabeca - ARENA.zNave) / LEQUE.velocidadeZ;
        const fora = LEQUE.largura0 + LEQUE.abrePorSegundo * tempo;
        expect(fora, 'o leque sai da arena e deixa de ameaçar').toBeLessThan(ARENA.x);
        expect(fora, 'o leque nem chega perto das bordas').toBeGreaterThan(ARENA.x * 0.7);
    });
});
