import { describe, it, expect, beforeEach } from 'vitest';
import { F3_GRAVITY, F3_JUMP, SPEED } from '../constants';
import {
    platforms, reset, tick, alturaDoVazio, QUEDA_ATE_O_VAZIO, respawnPoint, type F3Plat,
} from '../f3Parkour';
import {
    chaoSobOsPes, resolverQueda, arrastoDaPonte, PISO_DO_ELEVADOR,
    PASSO_MAXIMO_DA_PONTE, TOLERANCIA_DE_APOIO,
} from '../f3Fisica';

const plat = (over: Partial<F3Plat> = {}): F3Plat => ({
    id: 1, bx: 0, cz: 0, hw: 1.2, hd: 1.2, h: 0.5, topY: 0,
    moving: false, amp: 0, phase: 0, x: 0, dx: 0, palette: 0, ...over,
});

describe('o ímã do Andar 3 — pousar não é ser puxado', () => {
    // ── O BUG ────────────────────────────────────────────────────────────────
    // `if (y <= chao && vy <= 0) y = chao`, sem condição de vir de cima. Quem
    // caía no vão era teletransportado para o topo da próxima plataforma no
    // instante em que o Z entrava na pegada dela. Andar para a frente subia a
    // escadaria inteira: o botão PULAR era decorativo.
    const alvo = plat({ topY: 3 });

    it('quem vem DE BAIXO não pousa — a plataforma acima é teto', () => {
        // Caindo a 1 m de altura, com a plataforma a 3 m: o quadro anterior
        // estava em 1,1, muito abaixo do topo.
        const chao = chaoSobOsPes([alvo], 0, 0, 1.1);
        expect(chao).toBe(null);
        const passo = resolverQueda(1.1, 1.0, -6, chao);
        expect(passo.pousou).toBe(false);
        expect(passo.y).toBe(1.0);          // continua caindo
        expect(passo.vy).toBe(-6);
    });

    it('quem vem DE CIMA pousa, mesmo atravessando a laje num quadro só', () => {
        // Queda rápida: 3,4 → 2,6 num quadro, cruzando o topo em 3,0.
        const chao = chaoSobOsPes([alvo], 0, 0, 3.4);
        expect(chao?.topY).toBe(3);
        const passo = resolverQueda(3.4, 2.6, -20, chao);
        expect(passo.pousou).toBe(true);
        expect(passo.y).toBe(3);
        expect(passo.vy).toBe(0);
        expect(passo.noChao).toBe(true);
    });

    it('andar no plano não escorrega nem re-pousa a cada quadro', () => {
        const p = plat({ topY: 2 });
        let y = 2, vy = 0;
        for (let i = 0; i < 600; i++) {
            const yAntes = y;
            vy -= F3_GRAVITY * (1 / 60);
            y += vy * (1 / 60);
            const passo = resolverQueda(yAntes, y, vy, chaoSobOsPes([p], 0, 0, yAntes));
            y = passo.y; vy = passo.vy;
            expect(passo.noChao).toBe(true);
        }
        expect(y).toBe(2);
    });

    it('subir se faz pulando: a subida mínima do gerador não se anda', () => {
        // RISE_MIN é 0,4 — pequeno, e ainda assim um degrau de verdade agora.
        const acima = plat({ topY: 0.4 });
        expect(chaoSobOsPes([acima], 0, 0, 0)).toBe(null);
        // Com o pé já em cima, ela volta a ser chão.
        expect(chaoSobOsPes([acima], 0, 0, 0.4)?.topY).toBe(0.4);
    });

    it('entre duas plataformas empilhadas, o chão é a de BAIXO', () => {
        // Guarda contra a versão antiga, que pegava sempre a mais alta.
        const baixa = plat({ id: 1, topY: 0 });
        const alta  = plat({ id: 2, topY: 4 });
        expect(chaoSobOsPes([baixa, alta], 0, 0, 0.2)?.topY).toBe(0);
        expect(chaoSobOsPes([baixa, alta], 0, 0, 4.2)?.topY).toBe(4);
    });
});

describe('o piso da cabine do elevador', () => {
    it('segura o jogador que chega em z=-13, onde não há plataforma', () => {
        reset();
        const chao = chaoSobOsPes(platforms, 0, -13, 0);
        expect(chao?.topY).toBe(0);
        expect(chao?.plat).toBe(null);      // é a cabine, não uma plataforma
    });

    it('encosta no patamar de partida — não há fresta entre os dois', () => {
        reset();
        const patamar = platforms[0];
        const bordaDeTras = patamar.cz - patamar.hd;
        expect(PISO_DO_ELEVADOR.z1).toBeGreaterThanOrEqual(bordaDeTras);
        // Da cabine até a borda da FRENTE do patamar não pode haver um só
        // ponto sem chão — depois dela começa o primeiro vão de verdade.
        for (let z = -16; z <= patamar.cz + patamar.hd - 0.01; z += 0.25) {
            expect(chaoSobOsPes(platforms, 0, z, 0), `z=${z}`).not.toBe(null);
        }
        expect(chaoSobOsPes(platforms, 0, patamar.cz + patamar.hd + 0.5, 0)).toBe(null);
    });
});

describe('a ponte carrega quem está em cima', () => {
    it('quem tem o pé apoiado anda junto', () => {
        const ponte = plat({ moving: true, amp: 2, dx: 0.08, topY: 1 });
        const chao = chaoSobOsPes([ponte], 0, 0, 1);
        expect(arrastoDaPonte(chao, 1)).toBeCloseTo(0.08, 9);
    });

    it('quem está no ar acima dela não é arrastado', () => {
        const ponte = plat({ moving: true, amp: 2, dx: 0.08, topY: 1 });
        const chao = chaoSobOsPes([ponte], 0, 0, 3);
        expect(arrastoDaPonte(chao, 3)).toBe(0);
        // ...e a fronteira é a mesma tolerância que decide "está no chão".
        expect(arrastoDaPonte(chao, 1 + TOLERANCIA_DE_APOIO / 2)).toBeCloseTo(0.08, 9);
    });

    it('plataforma fixa não arrasta ninguém', () => {
        const fixa = plat({ dx: 0.5, topY: 1 });      // dx alto de propósito
        expect(arrastoDaPonte(chaoSobOsPes([fixa], 0, 0, 1), 1)).toBe(0);
    });

    it('um dx absurdo vira empurrão limitado, não teletransporte', () => {
        const ponte = plat({ moving: true, amp: 2, dx: 40, topY: 1 });
        expect(arrastoDaPonte(chaoSobOsPes([ponte], 0, 0, 1), 1)).toBe(PASSO_MAXIMO_DA_PONTE);
    });

    it('o dx que o tick escreve é o deslocamento real do quadro', () => {
        reset();
        tick(0, 0);
        const ponte = platforms.find((p) => p.moving);
        if (!ponte) return;                       // curso sem ponte: nada a medir
        const antes = ponte.x;
        tick(1 / 60, 0);
        expect(ponte.dx).toBeCloseTo(ponte.x - antes, 9);
        expect(Math.abs(ponte.dx)).toBeLessThan(PASSO_MAXIMO_DA_PONTE);
    });
});

describe('o vazio acompanha a escadaria', () => {
    beforeEach(() => { reset(); tick(0, 0); });

    it('a linha fica sempre a mesma queda abaixo do renascimento', () => {
        for (const z of [-5, 0, 10, 25, 40]) {
            expect(alturaDoVazio(z)).toBeCloseTo(respawnPoint(z).y - QUEDA_ATE_O_VAZIO, 9);
        }
    });

    it('sobe junto com o curso — não é mais um -8 fixo', () => {
        // Rola a piscina bem para a frente e confere que a linha subiu com ela.
        for (let i = 0; i < 400; i++) tick(i * 0.05 + 0.01, i * 0.6);
        const alto = platforms[platforms.length - 1];
        expect(alto.topY).toBeGreaterThan(20);          // já estamos bem alto
        const linha = alturaDoVazio(alto.cz);
        expect(linha).toBeGreaterThan(alto.topY - 20);  // perto do piso, não em -8
        expect(linha).toBeGreaterThan(0);
    });

    it('a queda dura o mesmo tempo em qualquer altura', () => {
        const duracao = Math.sqrt((2 * QUEDA_ATE_O_VAZIO) / F3_GRAVITY);
        expect(duracao).toBeGreaterThan(0.7);
        expect(duracao).toBeLessThan(1.1);
        expect(SPEED).toBeGreaterThan(0);
        expect(F3_JUMP).toBeGreaterThan(0);
    });
});
