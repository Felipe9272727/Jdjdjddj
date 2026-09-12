import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    ARENA, meioY, dentroDaArena,
    BOCA, CICLO_DA_BOCA, bocaNoInstante, vulneravel,
    VIDA_MAXIMA, LIMIAR_DA_VIRADA, ferir, f12, f12Reset,
    ATAQUES, ataqueDaVez, segundoAtaqueDaVez, ATRASO_DO_SEGUNDO, fichaDoAtaque, ENSINO_TAMANHO,
    LEQUE, nascerLeque,
    TELEGUIADO, nascerTeleguiado, guiarTeleguiado,
    NAVES, nascerNaves,
    MARE, nascerMare, frestaDaMare, mareAcerta,
    ELEVADORES, nascerElevadores, xDaFaixa,
    TIRO, nascerTiro, tiroNaBoca, BOCA_ALVO, BOCA_SAIDA, ALTURA_DA_CABECA, BOCA_ABAIXO_DO_CENTRO, PONTA_DA_ASA,
    NAVE, novaNave, passoDaNave, conduzirNave, arrastarNave, tomarToque, tentarAtirar,
    encostou, reiniciarIds, passoDoProjetil, saiuDeCena,
    ENQUADRAMENTO, larguraDoQuadro, alturaDoQuadro, composicaoNaTela, ajustarAoAspecto,
    reporArena, ARENA_X_MAXIMA, ALVOS_DE_TELA,
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

    it('a boca passa tempo suficiente ABERTA para a luta não virar espera', () => {
        // Não pode ser um chefe permanentemente vulnerável: o descanso do
        // jogador (fechada) tem de existir de verdade.
        expect(BOCA.fechada).toBeGreaterThan(0.6);
        expect(BOCA.aberta / CICLO_DA_BOCA).toBeLessThan(0.55);
    });
});

// ── O RODÍZIO ────────────────────────────────────────────────────────────────
describe('f12 — os cinco ataques e a ordem deles', () => {
    // ── ESTE BLOCO COBRAVA O DESENHO ERRADO ──────────────────────────────
    //
    // Ele exigia "antes da virada só rodam os três primeiros" e "depois da
    // virada os dois novos entram". Passava, e o que ele garantia era que
    // METADE DO CONTEÚDO DO ANDAR FICASSE INVISÍVEL: medido jogando, numa
    // sessão de 100 s apareciam três dos cinco padrões, e a maré e a espinha
    // moravam atrás de 50% da vida do chefe — atrás de dois minutos e meio de
    // jogo perfeito. O dono do jogo nunca os viu.
    //
    // O contrato novo é o contrário: os cinco ENSINAM cedo, e depois a ordem
    // deixa de ser adivinhável.
    it('os cinco padrões aparecem nos cinco primeiros ciclos', () => {
        const vistos = new Set<NomeDoAtaque>();
        for (let i = 0; i < 5; i++) vistos.add(ataqueDaVez(i));
        expect(vistos.size, 'algum padrão ficou de fora do ensino').toBe(5);
    });

    it('e isso põe os cinco na tela em menos de um minuto', () => {
        // cinco ciclos de boca, e o jogador já viu o catálogo inteiro
        expect(5 * CICLO_DA_BOCA, 'o ensino demora demais').toBeLessThan(60);
    });

    it('a ordem não é mais adivinhável por `i % k`', () => {
        // A antiga era `ATAQUES[i % 3]`: em três ciclos o jogador parava de ler
        // o chefe e passava a contar. Nenhum período curto pode explicar a
        // sequência nova.
        const seq: NomeDoAtaque[] = [];
        for (let i = 0; i < 60; i++) seq.push(ataqueDaVez(i));
        for (const k of [3, 4, 5, 6, 8]) {
            let periodico = true;
            for (let i = ENSINO_TAMANHO; i + k < seq.length; i++) {
                if (seq[i] !== seq[i + k]) { periodico = false; break; }
            }
            expect(periodico, `a sequência se repete a cada ${k}`).toBe(false);
        }
    });

    it('nenhum padrão emenda consigo mesmo', () => {
        for (const virada of [false, true]) {
            for (let i = 0; i < 200; i++) {
                expect(ataqueDaVez(i), `i=${i} virada=${virada}`)
                    .not.toBe(ataqueDaVez(i + 1));
            }
        }
    });

    it('e nenhum padrão some por muito tempo', () => {
        // Um sorteio sem saco deixaria um padrão sumir vinte ciclos. O saco
        // garante que cada bloco de cinco contenha os cinco.
        const ultimoVisto: Record<string, number> = {};
        for (let i = 0; i < 200; i++) ultimoVisto[ataqueDaVez(i)] = i;
        for (let i = 0; i < 200; i++) {
            const q = ataqueDaVez(i);
            ultimoVisto[q] = i;
            if (i > 20) {
                for (const nome of ATAQUES.map((a) => a.nome)) {
                    expect(i - (ultimoVisto[nome] ?? -1), `${nome} sumiu`).toBeLessThan(14);
                }
            }
        }
    });

    it('a sequência é determinística — a simulação e o teste precisam repeti-la', () => {
        const a = Array.from({ length: 40 }, (_, i) => ataqueDaVez(i));
        const b = Array.from({ length: 40 }, (_, i) => ataqueDaVez(i));
        expect(a).toEqual(b);
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
    it('nascem JUNTAS na boca, abrem para as faixas, e morrem de tiro', () => {
        const n = nascerNaves();
        expect(n).toHaveLength(NAVES.quantas);
        // Saem todas do mesmo ponto: a cavidade. Antes elas nasciam já
        // espalhadas na altura do voo, o que na tela lê como quatro naves que
        // sempre estiveram ali em vez de quatro naves que ela acabou de cuspir.
        for (const q of n) {
            expect(q.x).toBeCloseTo(BOCA_SAIDA.x, 6);
            expect(q.y).toBeCloseTo(BOCA_SAIDA.y, 6);
            expect(q.hp).toBeGreaterThan(0);
        }
        // e ABREM: depois do tempo de abertura elas estão em faixas distintas,
        // todas dentro da arena.
        //
        // Aqui tem de ser `passoDoProjetil`, e não o `passo` cru desta folha: a
        // abertura e o bamboleio moram no movimento de verdade, e um integrador
        // que só soma `vx` deixaria as quatro paradas em cima da boca — que foi
        // exatamente como este teste falhou da primeira vez.
        const t = n[0].abre as number;
        for (const q of n) { for (let i = 0; i < Math.ceil(t * 120) + 4; i++) passoDoProjetil(q, 0, meioY(), 1 / 120); }
        expect(new Set(n.map((q) => Math.round(q.x * 10))).size).toBeGreaterThan(1);
        for (const q of n) expect(Math.abs(q.x)).toBeLessThanOrEqual(ARENA.x);
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
        expect(vFresta).toBeLessThan(NAVE.velocidadeDoAlvo * 0.6);
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

    // ── ESTE TESTE FOI REBAIXADO, E DE PROPÓSITO ─────────────────────────
    //
    // Ele estimava a duração da luta supondo que o jogador atira a janela
    // INTEIRA, sempre mirado, sem nunca desviar de nada. Isso não é um jogador,
    // é um teto teórico — e afinar a dificuldade por ele foi parte do que fez o
    // andar sair ruim. Quem mede a duração de verdade é a bancada do navegador,
    // que joga a luta inteira com um piloto que desvia, erra e apanha.
    //
    // O que sobra aqui é uma guarda de sanidade: o chefe não pode ser
    // matável em duas janelas nem ser praticamente imortal.
    it('o chefe não é matável num piscar nem é imortal (guarda grosseira)', () => {
        const porJanela = (BOCA.aberta / TIRO.cadencia) * TIRO.dano;
        const janelas = VIDA_MAXIMA / porJanela;
        expect(janelas).toBeGreaterThan(4);
        expect(janelas).toBeLessThan(45);
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
        // (Havia aqui um `expect(LIMIAR_DA_VIRADA).toBe(VIDA_MAXIMA / 2)` contra
        // um `export const LIMIAR_DA_VIRADA = VIDA_MAXIMA / 2`. Ele não podia
        // falhar. Teste que não pode falhar é pior que teste ausente: ele ocupa
        // a linha onde deveria estar um que cobra alguma coisa.)
        expect(LIMIAR_DA_VIRADA, 'a virada tem de cair no meio da luta, não no fim')
            .toBeGreaterThan(VIDA_MAXIMA * 0.35);
        expect(LIMIAR_DA_VIRADA).toBeLessThan(VIDA_MAXIMA * 0.65);
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
    // ── O DEFEITO QUE MOTIVOU A REESCRITA ────────────────────────────────
    // O modelo antigo era aceleração + atrito, e a velocidade terminal de um
    // modelo assim é `a / atrito` — 46 / 7,2 = 6,39, contra um teto declarado
    // de 11,5 que nunca era alcançado. Pior: a 6,39 a travessia da arena levava
    // 1,53 s e o leque atravessava em 1,6 s. O jogo pedia um desvio que ele
    // mesmo tornava impossível. Este teste é a régua disso.
    it('atravessa a arena MUITO mais rápido do que o ataque atravessa a tela', () => {
        const n = novaNave(-ARENA.x, meioY());
        let t = 0;
        const dt = 1 / 60;
        while (n.x < ARENA.x - 0.1 && t < 5) {
            conduzirNave(n, 1, 0, dt); passoDaNave(n, dt); t += dt;
        }
        const doAtaque = Math.abs(ARENA.zCabeca - ARENA.zNave) / LEQUE.velocidadeZ;
        expect(t, 'travessia lenta demais para desviar').toBeLessThan(doAtaque * 0.6);
    });

    it('o dedo e a nave são a mesma coisa: ela alcança o alvo depressa', () => {
        const n = novaNave(0, meioY());
        arrastarNave(n, 3, 0);
        for (let i = 0; i < 12; i++) passoDaNave(n, 1 / 60);   // 200 ms
        expect(Math.abs(n.x - n.alvoX), 'a nave ficou para trás do dedo').toBeLessThan(0.25);
    });

    it('soltar o comando PARA a nave, em vez de deixá-la deslizando', () => {
        const n = novaNave(0, meioY());
        for (let i = 0; i < 30; i++) { conduzirNave(n, 1, 0, 1 / 60); passoDaNave(n, 1 / 60); }
        const onde = n.x;
        for (let i = 0; i < 20; i++) { conduzirNave(n, 0, 0, 1 / 60); passoDaNave(n, 1 / 60); }
        expect(Math.abs(n.x - onde), 'continuou patinando depois de soltar').toBeLessThan(0.2);
    });

    it('nunca sai da arena, nem no comando máximo por muito tempo', () => {
        const n = novaNave(0, meioY());
        for (let i = 0; i < 1200; i++) {
            conduzirNave(n, i % 200 < 100 ? 1 : -1, i % 120 < 60 ? 1 : -1, 1 / 60);
            passoDaNave(n, 1 / 60);
            expect(Math.abs(n.x)).toBeLessThanOrEqual(ARENA.x + 1e-6);
            expect(n.y).toBeGreaterThanOrEqual(ARENA.yBaixo - 1e-6);
            expect(n.y).toBeLessThanOrEqual(ARENA.yAlto + 1e-6);
        }
    });

    it('o arrasto do dedo também respeita as bordas', () => {
        const n = novaNave(0, meioY());
        arrastarNave(n, 999, 999);
        expect(n.alvoX).toBe(ARENA.x);
        expect(n.alvoY).toBe(ARENA.yAlto);
    });

    it('a rolagem segue a velocidade e fica no limite', () => {
        const n = novaNave(0, meioY());
        for (let i = 0; i < 120; i++) { conduzirNave(n, 1, 0, 1 / 60); passoDaNave(n, 1 / 60); }
        expect(Math.abs(n.rolagem)).toBeLessThanOrEqual(NAVE.rolagemMaxima + 1e-6);
        expect(n.rolagem).toBeLessThan(0);       // indo para a direita, inclina
    });

    it('dt grande não teleporta a nave (a aba volta do segundo plano)', () => {
        const n = novaNave(0, meioY());
        conduzirNave(n, 1, 1, 5); passoDaNave(n, 5);
        expect(Math.abs(n.x)).toBeLessThanOrEqual(ARENA.x);
        expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    });

    // ── A PISCADA ────────────────────────────────────────────────────────
    // Sem invencibilidade depois do toque, uma parede de leque tira as vidas
    // todas num quadro só e o jogador nem vê o que aconteceu.
    it('um toque tira uma vida e dá invencibilidade; o segundo colado não conta', () => {
        const n = novaNave(0, meioY());
        const v0 = n.vidas;
        expect(tomarToque(n)).toBe(true);
        expect(n.vidas).toBe(v0 - 1);
        expect(tomarToque(n)).toBe(false);
        expect(n.vidas).toBe(v0 - 1);
        for (let i = 0; i < 60 * 3; i++) passoDaNave(n, 1 / 60);
        expect(tomarToque(n)).toBe(true);
        expect(n.vidas).toBe(v0 - 2);
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
    it('a camareira bamboleia na POSIÇÃO (depois de abrir), e a velocidade lateral acompanha', () => {
        const n = nascerNaves()[0];
        const base = n.base as number;
        expect(base).toBeDefined();
        // A ABERTURA primeiro: enquanto ela sai da boca para a faixa, a linha de
        // repouso ainda está caminhando, e medir o bamboleio contra `base` nesse
        // trecho mediria a abertura somada ao bamboleio.
        const abre = n.abre as number;
        expect(abre).toBeGreaterThan(0);
        for (let i = 0; i < Math.ceil(abre * 60) + 2; i++) passoDoProjetil(n, 0, meioY(), 1 / 60);
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

    it('a caixa de colisão é bem MENOR que o desenho — e isso é o certo', () => {
        // Este teste já teve a premissa invertida. Ele exigia que o desenho e a
        // caixa fossem parecidos, "senão o jogador leva dano do vazio". Num
        // shmup é o contrário: a caixa tem de ser um ponto no meio da nave, e as
        // pontas das asas NÃO machucam — é isso que faz passar raspando ser
        // emocionante em vez de injusto. O que não pode é a caixa ser MAIOR que
        // o desenho, aí sim o dano vem do nada.
        const caixa = NAVE.raio * 2;
        expect(caixa).toBeLessThan(ENQUADRAMENTO.envergadura);
        const razao = ENQUADRAMENTO.envergadura / caixa;
        expect(razao, 'a caixa é grande demais para um shmup').toBeGreaterThan(3);
        expect(razao, 'a caixa sumiu: nada mais acerta o jogador').toBeLessThan(7);
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

// ── A MIRA TEM DE ESTAR ONDE A BOCA ESTÁ ─────────────────────────────────────
//
// O anel de mira nasceu 1,4 acima da cavidade e ficou em cima do NARIZ. O
// jogador seria ensinado a mirar onde a boca não está — e não teria como
// descobrir sozinho, porque a regra "só de boca aberta" é invisível.
describe('f12 — a hitbox da boca coincide com a boca', () => {
    it('o alvo sai da altura da cabeça pelo mesmo deslocamento que a malha usa', () => {
        expect(BOCA_ALVO.y).toBeCloseTo(ALTURA_DA_CABECA - BOCA_ABAIXO_DO_CENTRO, 6);
    });

    // ── ESTE TESTE ESTAVA INVERTIDO, E FOI ELE QUE SEGUROU O DEFEITO ──────
    //
    // Ele exigia `ARENA.yBaixo < BOCA_ALVO.y < ARENA.yAlto`: a boca DENTRO da
    // caixa de voo. Passava, e a coisa que ele garantia era o avião do jogador
    // ser desenhado dentro da boca do chefe — 2,2% de tela entre os dois, a
    // arena 19,7% por cima da cara dela. Duas revisões seguidas mexeram nas
    // alturas para consertar o enquadramento e as duas foram puxadas de volta
    // para cá, porque um teste verde parece uma amarra e não um erro.
    //
    // Ele não era irracional: com o tiro voando reto, a única forma de acertar
    // a boca era estar na altura dela. O erro estava no tiro. Hoje a bala sobe
    // (`subidaDoTiro`) e o que este teste cobra é o contrário — a SEPARAÇÃO.
    it('a boca fica bem ACIMA da arena: o jogador não voa dentro da cara dela', () => {
        expect(BOCA_ALVO.y, 'a boca voltou para dentro da caixa de voo')
            .toBeGreaterThan(ARENA.yAlto);
        // e a separação tem de ser grande o bastante para o ataque ser visto
        // vindo — não basta não encostar.
        const vao = BOCA_ALVO.y - ARENA.yAlto;
        expect(vao, 'a boca está encostada no teto do voo').toBeGreaterThan(ARENA.yAlto - ARENA.yBaixo);
    });

    it('e o tiro do jogador alcança a boca de qualquer altura da arena', () => {
        // Se a bala não subisse o bastante saindo do CHÃO da arena, o andar
        // teria um lugar de onde é impossível machucar o chefe — e o jogador
        // não teria como descobrir por quê.
        for (const y of [ARENA.yBaixo, meioY(), ARENA.yAlto]) {
            const t = nascerTiro(BOCA_ALVO.x, y, 'jogador');
            let g = 0;
            while (t.z > ARENA.zCabeca && g++ < 4000) passo(t, 1 / 240);
            expect(Math.abs(t.y - BOCA_ALVO.y), `saindo de y=${y}`).toBeLessThan(0.3);
            expect(tiroNaBoca(t), `saindo de y=${y}`).toBe(true);
        }
    });

    it('e o alvo não é tão grande que qualquer tiro conte', () => {
        // Um alvo do tamanho da arena tira a mira do jogo.
        expect(BOCA_ALVO.raio * 2).toBeLessThan(ARENA.x * 1.4);
    });
});

// ── A COMPOSIÇÃO, EM NÚMERO ──────────────────────────────────────────────────
//
// O defeito que o dono do jogo chamou de "péssimo" era este, e ele sobreviveu a
// duas correções porque nenhuma delas tinha régua: o avião era desenhado DENTRO
// da boca do chefe, com 2,2% de tela entre os dois, e a caixa de voo cobria a
// cara dele em 19,7% da tela. Cada revisão mexeu nas alturas no olho e escreveu
// no comentário que estava resolvido.
//
// Estes testes são a régua. Eles não julgam se está bonito — julgam se o
// jogador e o ponto fraco do chefe estão em lugares diferentes da tela, e se
// existe distância entre os dois para um ataque ser visto vindo.
describe('f12 — a composição da tela', () => {
    it('o avião fica no terço de baixo, e a boca no alto', () => {
        const c = composicaoNaTela();
        expect(c.nave, 'o avião subiu para o meio da tela').toBeLessThan(0.36);
        expect(c.nave, 'o avião saiu pela base da tela').toBeGreaterThan(0.12);
        expect(c.boca, 'a boca desceu para o meio da tela').toBeGreaterThan(0.60);
        expect(c.boca, 'a boca saiu pelo topo da tela').toBeLessThan(0.92);
    });

    it('e existe TELA entre os dois — é por onde o ataque vem', () => {
        // 2,2% era o número do defeito. Menos de um terço de tela entre a boca e
        // o avião quer dizer um ataque que nasce praticamente em cima do
        // jogador, e nenhuma velocidade de nave conserta isso.
        const c = composicaoNaTela();
        expect(c.vaoBocaNave, 'a boca voltou a ficar em cima do avião').toBeGreaterThan(0.33);
    });

    it('a caixa de voo inteira cabe na tela, com margem em cima e embaixo', () => {
        const c = composicaoNaTela();
        expect(c.arenaBaixo, 'o chão do voo saiu pela base').toBeGreaterThan(0.02);
        expect(c.arenaAlto, 'o teto do voo invadiu a metade de cima').toBeLessThan(0.56);
        expect(c.arenaAlto).toBeGreaterThan(c.arenaBaixo);
    });

    // EM TODA TELA, e não só na composta: a altura da caixa é limitada pelo que
    // a tela comporta, então a tela mais baixa é a que chega mais perto da boca
    // — e é justamente a que o teste antigo não olhava.
    it('e a arena inteira fica ABAIXO da boca, sem encostar nela, em qualquer tela', () => {
        for (const a of [412 / 915, 915 / 412, 16 / 9, 1, 820 / 1180]) {
            ajustarAoAspecto(a);
            const c = composicaoNaTela();
            expect(c.arenaAlto, `aspecto ${a.toFixed(2)}: o teto do voo alcança a boca`)
                .toBeLessThan(c.boca - 0.12);
        }
        reporArena();
    });

    // ── A COMPOSIÇÃO SE RESOLVE, E O RESULTADO É O MESMO EM TODA TELA ────
    //
    // Este teste já cobrou o contrário: que os números fossem IDÊNTICOS entre
    // aspectos, o que era verdade quando só a largura da arena mudava. Era uma
    // igualdade vazia — o avião ficava com metade do tamanho no celular
    // deitado e o teste passava, porque fração vertical não depende de aspecto.
    // O que importa é a composição CHEGAR NO ALVO em toda tela, e é isso que a
    // suíte 'o andar vale em qualquer tela' cobra agora.
    it('a composição de referência é a do celular em pé, e ela bate no alvo', () => {
        reporArena();
        const c = composicaoNaTela();
        expect(c.nave).toBeCloseTo(ALVOS_DE_TELA.naveNaTela, 2);
        expect(c.boca).toBeCloseTo(ALVOS_DE_TELA.bocaNaTela, 2);
    });

    // ── ESTE TESTE COBRAVA O CONTRÁRIO, E O CONTRÁRIO ERA O DEFEITO ──────
    //
    // Ele exigia que a arena ALARGASSE em tela larga ("em vez de virar uma
    // tirinha no meio"). Passava — e o que ele garantia era que o jogo fosse
    // OUTRO em cada aparelho: medido com o mesmo bot, a luta durava 100 s em
    // retrato e 153 s em 1280x720, 53% de diferença. O avião é fixado em fração
    // da largura e afina em tela larga; a arena não afinava junto, então sobrava
    // espaço relativo para desviar e o alvo da boca (absoluto) cobria metade do
    // mundo numa tela e um terço na outra.
    //
    // O certo é a arena ter o MESMO tamanho em unidades de mundo em toda tela.
    // Numa tela larga sobra céu dos lados, e é isso que tem de sobrar.
    it('a caixa de voo tem o mesmo tamanho de mundo em qualquer tela', () => {
        const larguras: number[] = [];
        const alturas: number[] = [];
        for (const a of [412 / 915, 915 / 412, 16 / 9, 1, 820 / 1180]) {
            ajustarAoAspecto(a);
            larguras.push(ARENA.x);
            alturas.push(ARENA.yAlto - ARENA.yBaixo);
        }
        reporArena();
        const rel = (v: number[]) => Math.max(...v) / Math.min(...v);
        expect(rel(larguras), 'a arena muda de largura conforme a tela').toBeLessThan(1.02);
        // A altura não pode ser exatamente igual: uma tela deitada TEM menos
        // altura, e uma arena alta ali subiria até a boca do chefe. O que ela
        // não pode é variar como variava (2,4 vezes).
        expect(rel(alturas), 'a arena muda demais de altura conforme a tela').toBeLessThan(1.35);
    });

    it('e ela nunca passa do teto que a nave consegue atravessar', () => {
        for (const a of [412 / 915, 16 / 9, 1]) {
            ajustarAoAspecto(a);
            expect(ARENA.x).toBeLessThanOrEqual(ARENA_X_MAXIMA);
        }
        reporArena();
    });

});

// ── O TIRO SAI DE ONDE A ASA ESTÁ ────────────────────────────────────────────
//
// `PONTA_DA_ASA` era 1,35 num avião de 1,175 de meia-envergadura: a bala nascia
// no ar, fora da asa. É a mesma classe de defeito que já pôs a hitbox da boca em
// cima do NARIZ do chefe — o desenho e a regra saindo de dois números soltos que
// ninguém prometeu manter iguais. Agora um sai do outro, e isto cobra.
describe('f12 — a arma está onde a asa está', () => {
    it('a bala nasce em cima da asa, nunca fora dela', () => {
        const meiaAsa = ENQUADRAMENTO.envergadura / 2;
        expect(PONTA_DA_ASA, 'a bala nasce fora da asa').toBeLessThan(meiaAsa);
        expect(PONTA_DA_ASA, 'as duas balas saem quase do mesmo ponto: some o par de rastros')
            .toBeGreaterThan(meiaAsa * 0.6);
    });

    it('e as duas saem de lados opostos, para virarem dois rastros', () => {
        const e = nascerTiro(0, meioY(), 'jogador', -1);
        const d = nascerTiro(0, meioY(), 'jogador', 1);
        expect(e.x).toBeLessThan(0);
        expect(d.x).toBeGreaterThan(0);
        expect(Math.abs(e.x)).toBeCloseTo(Math.abs(d.x), 10);
    });
});

// ── O DEDO E A TECLA NÃO PODEM BRIGAR PELO MESMO CAMPO ───────────────────────
//
// O andar foi entregue INJOGÁVEL: "mesmo eu tocando, eu não consigo mexer o
// avião". Os dois controles escreviam em `alvoX`/`alvoY` e a cena chamava o do
// teclado TODO QUADRO, com ou sem tecla — e o ramo "sem comando" dele assenta o
// alvo em cima da nave. O alvo que o dedo punha era apagado a 60 Hz, antes de a
// nave andar um centímetro.
//
// Cada função, sozinha, estava certa; o defeito morava na ORDEM em que a cena as
// chamava, e a cena não era testada. Estes testes são a ordem.
describe('f12 — quem está no comando da nave', () => {
    it('o teclado ocioso NÃO apaga o alvo que o dedo acabou de pôr', () => {
        const n = novaNave(0, meioY());
        arrastarNave(n, 2.0, 1.0);
        const alvoX = n.alvoX, alvoY = n.alvoY;
        // é isto que a cena faz todo quadro quando ninguém aperta tecla
        for (let i = 0; i < 30; i++) conduzirNave(n, 0, 0, 1 / 60);
        expect(n.alvoX, 'o teclado ocioso apagou o alvo do dedo').toBeCloseTo(alvoX, 10);
        expect(n.alvoY, 'o teclado ocioso apagou o alvo do dedo').toBeCloseTo(alvoY, 10);
    });

    it('e a nave de fato CHEGA lá, com a cena chamando os dois todo quadro', () => {
        const n = novaNave(0, meioY());
        arrastarNave(n, 2.0, 1.0);
        for (let i = 0; i < 120; i++) { conduzirNave(n, 0, 0, 1 / 60); passoDaNave(n, 1 / 60); }
        expect(Math.hypot(n.x - n.alvoX, n.y - n.alvoY), 'a nave não alcançou o alvo').toBeLessThan(0.05);
        expect(n.x, 'a nave não saiu do lugar').toBeGreaterThan(1.5);
    });

    it('mas a tecla RETOMA o comando quando alguém aperta', () => {
        const n = novaNave(0, meioY());
        arrastarNave(n, 2.0, 0);
        expect(n.dono).toBe('dedo');
        conduzirNave(n, -1, 0, 1 / 60);
        expect(n.dono).toBe('tecla');
        // e a partir daí o ramo de assentar volta a valer
        for (let i = 0; i < 5; i++) { passoDaNave(n, 1 / 60); conduzirNave(n, 0, 0, 1 / 60); }
        expect(n.alvoX).toBeCloseTo(n.x, 10);
    });

    it('o arrasto continua preso à arena', () => {
        const n = novaNave(0, meioY());
        arrastarNave(n, 999, 999);
        expect(n.alvoX).toBe(ARENA.x);
        expect(n.alvoY).toBe(ARENA.yAlto);
    });
});

// ── AS REGRAS TÊM DE VALER EM TODA TELA ──────────────────────────────────────
//
// O andar foi composto para UMA tela — o celular em pé — e entregue assim, com
// uma nota minha dizendo que telas largas ficariam "aceitáveis". O dono do jogo
// abriu no celular DEITADO: os aviões saíram com metade do tamanho e a caixa de
// voo virou uma tirinha. Pior do que feio, calado: com a arena resolvida por
// tela, um leque de abertura FIXA passa a cobrir 46% de uma arena larga, e o
// ataque deixa de ameaçar sem nada dizer por quê.
//
// Toda regra deste andar é escrita em função de `ARENA.x`. Isto cobra que seja
// verdade — em pé, deitado, tablet e monitor.
describe('f12 — o andar vale em qualquer tela', () => {
    const TELAS: [string, number][] = [
        ['celular em pé', 412 / 915],
        ['celular deitado', 915 / 412],
        ['tablet', 820 / 1180],
        ['monitor 16:9', 16 / 9],
        ['tela quadrada', 1],
    ];
    afterEach(() => reporArena());

    it('a composição medida é a MESMA em todas elas', () => {
        for (const [nome, a] of TELAS) {
            ajustarAoAspecto(a);
            const c = composicaoNaTela();
            expect(c.nave, `${nome}: o avião saiu do terço de baixo`).toBeCloseTo(ALVOS_DE_TELA.naveNaTela, 2);
            expect(c.boca, `${nome}: a boca saiu do alto`).toBeCloseTo(ALVOS_DE_TELA.bocaNaTela, 2);
        }
    });

    it('e o avião nunca fica pequeno demais NA LARGURA, que é onde ele é largo', () => {
        // A primeira medida foi contra a MENOR dimensão, e passava: "25% da
        // altura" no celular deitado é 11% da largura, e o avião continuava
        // parecendo pequeno — que era a reclamação. Um avião visto de trás é um
        // objeto largo; medir a envergadura contra a altura mede outra coisa.
        for (const [nome, a] of TELAS) {
            ajustarAoAspecto(a);
            const larg = larguraDoQuadro(ENQUADRAMENTO.recuo, a);
            const fatia = ENQUADRAMENTO.envergadura / larg;
            expect(fatia, `${nome}: o avião ficou de outro tamanho`)
                .toBeCloseTo(ALVOS_DE_TELA.naveNaLargura(a), 3);
            expect(fatia, `${nome}: o avião virou um borrão`).toBeGreaterThanOrEqual(0.17 - 1e-9);
            expect(fatia, `${nome}: o avião não deixa espaço para desviar`).toBeLessThanOrEqual(0.30 + 1e-9);
        }
    });

    it('o leque continua desviável POR DENTRO e ameaçador ATÉ A BORDA', () => {
        for (const [nome, a] of TELAS) {
            ajustarAoAspecto(a);
            const tempo = Math.abs(ARENA.zNave - (ARENA.zCabeca + 2.2)) / LEQUE.velocidadeZ;
            const fora = LEQUE.largura0 + LEQUE.abrePorSegundo * tempo;
            const vao = fora / 2;                       // ver a nota em LEQUE
            const preciso = 2 * (NAVE.raio + LEQUE.raio);
            expect(vao, `${nome}: leque indesviável por dentro`).toBeGreaterThan(preciso);
            expect(fora, `${nome}: dá para contornar o leque por fora`).toBeGreaterThan(ARENA.x * 0.75);
            expect(fora, `${nome}: o leque sai da arena`).toBeLessThanOrEqual(ARENA.x);
        }
    });

    it('a fresta da maré é alcançável e nunca sai da arena', () => {
        for (const [nome, a] of TELAS) {
            ajustarAoAspecto(a);
            expect(MARE.passeioAmp + MARE.fresta, `${nome}`).toBeLessThanOrEqual(ARENA.x + 1e-9);
            expect(MARE.fresta, `${nome}: a fresta não cabe o avião`).toBeGreaterThan(NAVE.raio * 2);
            const m = nascerMare(0.7);
            for (let i = 0; i < 600; i++) {
                m.t += 1 / 60;
                expect(Math.abs(frestaDaMare(m)), `${nome}: a fresta passeou para fora`)
                    .toBeLessThanOrEqual(ARENA.x - MARE.fresta + 1e-6);
            }
        }
    });

    it('as faixas da espinha cabem, com vão para a nave passar', () => {
        for (const [nome, a] of TELAS) {
            ajustarAoAspecto(a);
            const vao = Math.abs(xDaFaixa(1) - xDaFaixa(0));
            expect(vao, `${nome}: espinha indesviável por dentro`)
                .toBeGreaterThan(2 * (NAVE.raio + ELEVADORES.raio));
            for (let i = 0; i < ELEVADORES.faixas; i++) {
                expect(Math.abs(xDaFaixa(i)), `${nome}`).toBeLessThanOrEqual(ARENA.x);
            }
        }
    });

    it('e a boca continua acima da caixa de voo em todas elas', () => {
        for (const [nome, a] of TELAS) {
            ajustarAoAspecto(a);
            expect(BOCA_ALVO.y, `${nome}: a boca voltou para dentro do voo`).toBeGreaterThan(ARENA.yAlto);
        }
    });
});

// ── A ARMA TEM RITMO, E O RITMO MORA NO MÓDULO ───────────────────────────────
//
// O dono do jogo pediu "um intervalo entre tiros, para a cabeça não morrer tão
// rápido". Parte disso era culpa do arrasto quebrado (o avião ficava parado no
// meio, alinhado com a boca, acertando tudo); a outra parte é que um jato
// contínuo não tem forma.
//
// O ritmo mora em `tentarAtirar` e não na cena porque a simulação que mede a
// dificuldade dispara pela MESMA função. Ela já teve uma cópia do ritmo escrita
// à mão dentro dela, e no dia em que a arma virasse rajada a régua continuaria
// medindo o jato contínuo — dizendo que a luta é mais curta do que é.
describe('f12 — a arma atira em rajada, com pausa', () => {
    it('saem exatamente `rajada` tiros e depois vem a pausa', () => {
        const n = novaNave(0, meioY());
        const intervalos: number[] = [];
        let t = 0, ultimo = -1;
        for (let i = 0; i < 4000; i++) {
            if (tentarAtirar(n)) { if (ultimo >= 0) intervalos.push(t - ultimo); ultimo = t; }
            n.recarga = Math.max(0, n.recarga - 1 / 240); t += 1 / 240;
        }
        // O PADRÃO, e não a contagem: contar curtos e longos numa janela que
        // corta no meio de uma rajada dá uma razão que não fecha, e o teste
        // reprovaria um ritmo perfeitamente certo. Aqui a forma é conferida
        // ciclo a ciclo — `rajada - 1` intervalos de cadência e um de pausa.
        expect(intervalos.length).toBeGreaterThan(TIRO.rajada * 4);
        const ciclos = Math.floor(intervalos.length / TIRO.rajada);
        for (let c = 0; c < ciclos; c++) {
            for (let i = 0; i < TIRO.rajada - 1; i++) {
                expect(intervalos[c * TIRO.rajada + i], `rajada ${c}, tiro ${i}`)
                    .toBeLessThan(TIRO.cadencia * 1.2);
            }
            expect(intervalos[c * TIRO.rajada + TIRO.rajada - 1], `pausa ${c}`)
                .toBeGreaterThan(TIRO.pausa * 0.9);
        }
    });

    it('a pausa é mesmo mais longa que a cadência — senão não é pausa', () => {
        expect(TIRO.pausa).toBeGreaterThan(TIRO.cadencia * 2);
        expect(TIRO.pausaIrmao).toBeGreaterThan(TIRO.cadenciaIrmao);
    });

    it('e o irmão continua atirando menos que o jogador: ele é ala', () => {
        const porSegundo = (rajada: number, cad: number, pausa: number) =>
            rajada / ((rajada - 1) * cad + pausa);
        const jogador = porSegundo(TIRO.rajada, TIRO.cadencia, TIRO.pausa) * TIRO.dano;
        const irmao = porSegundo(TIRO.rajadaIrmao, TIRO.cadenciaIrmao, TIRO.pausaIrmao) * TIRO.danoIrmao;
        expect(irmao, 'o ala virou o protagonista').toBeLessThan(jogador * 0.5);
    });
});

// ── A VIRADA TEM DE FAZER ALGUMA COISA ───────────────────────────────────────
//
// Ela não fazia NADA. `passouDaVirada` era lido em três lugares: dois passavam
// para `ataqueDaVez`, que tinha `void depoisDaVirada;` e ignorava o parâmetro, e
// o terceiro pintava a barra de vida de vermelho. Metade da luta era um replay
// literal da primeira metade — e o código afirmava o contrário em três lugares
// diferentes, incluindo uma fala do TROCO-63 gritando "dois padrões novos" na
// cara de quem já tinha visto os cinco.
//
// Não havia UM teste sobre a virada. Não é coincidência que ela não fizesse
// nada: o que ninguém cobra, ninguém entrega. Estes cobram.
describe('f12 — a virada aperta a luta', () => {
    it('o segundo cuspe existe e é sempre DIFERENTE do primeiro', () => {
        for (let i = 0; i < 200; i++) {
            expect(segundoAtaqueDaVez(i), `ciclo ${i}`).not.toBe(ataqueDaVez(i));
        }
    });

    it('e ele cabe dentro da janela em que a boca está aberta', () => {
        // Se ele saísse depois de a boca fechar, o ataque nasceria de uma cara
        // fechada — e a premissa do andar é que ela cospe quando abre.
        expect(ATRASO_DO_SEGUNDO).toBeGreaterThan(0);
        expect(ATRASO_DO_SEGUNDO, 'o segundo cuspe sai de boca fechada').toBeLessThan(BOCA.aberta);
    });

    it('o segundo cuspe é determinístico, como o primeiro', () => {
        const a = Array.from({ length: 40 }, (_, i) => segundoAtaqueDaVez(i));
        const b = Array.from({ length: 40 }, (_, i) => segundoAtaqueDaVez(i));
        expect(a).toEqual(b);
    });

    it('os dois juntos cobrem os cinco padrões', () => {
        const vistos = new Set<NomeDoAtaque>();
        for (let i = 0; i < 40; i++) { vistos.add(ataqueDaVez(i)); vistos.add(segundoAtaqueDaVez(i)); }
        expect(vistos.size).toBe(5);
    });

    // NÃO existe aqui um teste do tipo `expect(2/1).toBe(2)` com os dois números
    // escritos à mão. Eu escrevi um, no mesmo commit em que apagava outro igual,
    // e ele não cobre nada: o "dobrar" mora no diretor da cena, que este módulo
    // não enxerga. Quem cobra isso é a bancada que JOGA, contando ataques por
    // minuto antes e depois da virada — e o número está no commit.
});
