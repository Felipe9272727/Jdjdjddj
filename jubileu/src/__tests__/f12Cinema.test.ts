import { describe, expect, it } from 'vitest';
import { F12_CINEMA, CENA_DA_DERROTA, cinemaEase, victoryBeat, defeatBeat } from '../f12Cinema';
import { f12ChaseDistance, f12ChaseFov, f12FrameHeight } from '../f12Presentation';
import { f12IntroCamera } from '../f12Presentation';

describe('cinematic lifecycle', () => {
  it('keeps the reactor rupture, fall and escort in order', () => {
    expect(victoryBeat(0)).toMatchObject({ rupture: 0, fall: 0, escape: 0, finished: false });
    expect(victoryBeat(F12_CINEMA.rupture).fall).toBe(0);
    expect(victoryBeat(4).rupture).toBe(1);
    expect(victoryBeat(7).escape).toBe(0);
    expect(victoryBeat(F12_CINEMA.victory)).toMatchObject({ rupture: 1, fall: 1, escape: 1, finished: true });
  });
  it('finishes at the terminal frame and stays finished', () => {
    expect(victoryBeat(F12_CINEMA.victory - .001).finished).toBe(false);
    expect(victoryBeat(F12_CINEMA.victory + 30).finished).toBe(true);
    expect(victoryBeat(-2)).toEqual(victoryBeat(0));
  });
  it('keeps every motion channel bounded across the complete sequence', () => {
    for (let t = -1; t < 15; t += .017) {
      const { finished: _, ...channels } = victoryBeat(t);
      for (const value of Object.values(channels)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(cinemaEase(-10)).toBe(0); expect(cinemaEase(10)).toBe(1);
  });
  it('holds the camera inside the cabin until the doors reveal the sky', () => {
    expect(f12IntroCamera(0)).toEqual(f12IntroCamera(.2));
    expect(f12IntroCamera(0)).toMatchObject({ x: 0, y: .35, z: .55 });
  });
  it('has continuous finite camera marks through each shot transition', () => {
    for (const p of [.22, .48, .69, .91]) {
      const before = f12IntroCamera(p - .00001), after = f12IntroCamera(p + .00001);
      for (const key of Object.keys(before) as (keyof typeof before)[]) {
        expect(Number.isFinite(after[key])).toBe(true);
        expect(Math.abs(after[key] - before[key])).toBeLessThan(.01);
      }
    }
  });
});

describe('a derrota é uma cena, e não um desligar', () => {
    // Perder ia direto para `fase = 'derrota'`: balão de fala e botão REPETIR,
    // sem um quadro de consequência, ao lado dos 10,5 s coreografados da
    // vitória. É o desfecho que o jogador ruim vê mais vezes.
    it('as batidas acontecem em ordem, e nenhuma começa antes da anterior', () => {
        const meio = defeatBeat(CENA_DA_DERROTA.total / 2);
        expect(meio.atingido).toBe(1);          // o baque já passou
        expect(meio.rodopio).toBeGreaterThan(0.5);
        expect(meio.preto).toBe(0);             // ainda não fechou
    });

    it('a cabeça só avança depois de o avião já estar caindo', () => {
        const b = defeatBeat(CENA_DA_DERROTA.engolir);
        expect(b.engolir).toBe(0);
        expect(b.rodopio).toBeGreaterThan(0.8);
        expect(defeatBeat(CENA_DA_DERROTA.engolir + 1.2).engolir).toBeGreaterThan(0.2);
    });

    it('termina fechada: no fim, tudo está em 1', () => {
        const fim = defeatBeat(CENA_DA_DERROTA.total);
        expect(fim.finished).toBe(true);
        expect(fim.engolir).toBe(1);
        expect(fim.preto).toBe(1);
    });

    it('é mais curta que a vitória — prêmio se assiste, consequência não', () => {
        expect(CENA_DA_DERROTA.total).toBeLessThan(F12_CINEMA.victory);
    });

    it('nunca sai da faixa 0..1, em nenhum instante', () => {
        for (let t = -1; t < 12; t += 0.05) {
            for (const v of Object.values(defeatBeat(t))) {
                if (typeof v === 'number') { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
            }
        }
    });
});

describe('o preto tem de fechar ANTES do corte, e não junto com ele', () => {
    // O defeito que este teste tranca não estava na conta, estava no tempo: o
    // preto só chegava a 1 no último instante da cena, e a fase trocava ali
    // mesmo. Fotografado, o card de derrota entrava com o céu ACESO — o preto
    // existia e morria antes de cobrir o corte que devia cobrir.
    it('está cheio com folga antes do fim da cena', () => {
        expect(defeatBeat(CENA_DA_DERROTA.total - 0.35).preto).toBe(1);
    });

    it('e não começa antes da cabeça ter avançado', () => {
        // Escurecer antes do "engolir" esconderia justamente o plano que a
        // cena inteira existe para entregar.
        const inicioDoPreto = 4.8;
        expect(defeatBeat(inicioDoPreto).engolir).toBeGreaterThan(0.5);
    });
});

describe('a paisagem não pode encolher o chefe', () => {
    // `fov` no three é VERTICAL, então virar o aparelho não corta o quadro: ele
    // ALARGA por `tan(fov/2) * aspecto`. Com a lente de retrato, a 844x390 a
    // arena ocupava menos de um terço da largura e a cabeça virava um quinto
    // dela — o chefe deixava de ser colossal porque o jogador deitou o telefone.
    const RETRATO = 390 / 844, PAISAGEM = 844 / 390;
    const ARENA_LARGURA = 4.9 * 2, ARENA_ALTURA = 7.6 - 0.4;

    const quadro = (aspecto: number) => {
        const d = f12ChaseDistance(aspecto);
        const alt = f12FrameHeight(d, f12ChaseFov(aspecto));
        return { alt, larg: alt * aspecto };
    };

    it('em retrato a lente continua exatamente a de sempre', () => {
        expect(f12ChaseFov(RETRATO)).toBe(62);
    });

    it('a arena cabe em pé nas duas orientações', () => {
        for (const a of [RETRATO, PAISAGEM]) {
            expect(quadro(a).alt, `altura em ${a.toFixed(2)}`).toBeGreaterThan(ARENA_ALTURA);
        }
    });

    // ── A PRIMEIRA VERSÃO DESTE TESTE PEDIA O IMPOSSÍVEL ─────────────────
    //
    // Ela exigia que a paisagem ocupasse 62% da fração de largura do retrato, e
    // reprovou. Fui fazer a conta em vez de afrouxar o número, e a exigência é
    // que estava errada: a largura do quadro é SEMPRE `altura * aspecto`, e a
    // altura não pode ser menor que a arena mais uma folga. Então existe um
    // TETO que nenhuma lente alcança:
    //
    //     teto = largura da arena / ((altura da arena + folga) * aspecto)
    //
    // Em paisagem esse teto é 0,55 — abaixo dos 0,58 que o teste pedia. Nenhum
    // `fov` do mundo passaria, porque o que limita não é a lente, é o formato
    // da tela contra o formato da arena.
    //
    // A régua honesta é outra: quão perto do próprio teto a lente chega. Se ela
    // chegar perto, a largura não está sendo desperdiçada — está sendo gasta na
    // altura, que é obrigatória.
    it('a paisagem gasta a largura quase até o teto geométrico', () => {
        const FOLGA = 1.0;   // o avião precisa de céu acima e abaixo da arena
        const teto = ARENA_LARGURA / ((ARENA_ALTURA + FOLGA) * PAISAGEM);
        const real = ARENA_LARGURA / quadro(PAISAGEM).larg;
        expect(real).toBeGreaterThan(teto * 0.95);
    });

    it('e a lente de paisagem é de fato mais fechada que a de retrato', () => {
        expect(f12ChaseFov(PAISAGEM)).toBeLessThan(f12ChaseFov(RETRATO) - 20);
    });
});
