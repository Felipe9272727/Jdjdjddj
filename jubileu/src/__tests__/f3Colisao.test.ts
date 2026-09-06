// ── A COLISÃO QUE O DONO DO JOGO CHAMOU DE BUGADA ────────────────────────────
//
// Ele jogou e disse "a colisão está meio bugada". Estava, e a culpa é do
// conserto anterior: eu tirei o ímã do pouso (que puxava o jogador para cima de
// qualquer plataforma que ele cruzasse) sem pôr NADA no lugar para as laterais.
// Enquanto o ímã existia, bater na cara de uma plataforma virava "subiu nela";
// sem ele, virou ATRAVESSAR a laje e cair por dentro.
//
// Este arquivo prova as três coisas que faltavam: o corpo tem raio, as laterais
// empurram, e a fronteira do pulo perdoa.
import { describe, it, expect } from 'vitest';
import {
    ALTURA_DO_CORPO, BUFFER_DE_PULO_S, COYOTE_S, ESPESSURA_DA_LAJE, RAIO_DE_APOIO,
    RAIO_DO_CORPO, RELOGIOS_ZERADOS,
    baterACabeca, chaoSobOsPes, empurrarDasLaterais, gastarOPulo, girarRelogios,
    podePular, resolverQueda,
    molaDoTranco, PISO_DO_TRANCO, TETO_DO_TRANCO, TRANCO_PARADO,
    TRANCO_DA_CAMERA, TRANCO_DAS_MAOS,
    type AfinacaoDoTranco, type Tranco,
} from '../f3Fisica';
import type { F3Plat } from '../f3Parkour';

const plat = (over: Partial<F3Plat> = {}): F3Plat => ({
    id: 1, bx: 0, cz: 0, hw: 1.2, hd: 1.2, h: 0.5, topY: 0,
    moving: false, amp: 0, phase: 0, x: 0, dx: 0, palette: 0, ...over,
});

describe('o jogador é um corpo, não um ponto', () => {
    const p = plat({ topY: 2 });

    it('meio pé na quina ainda é estar de pé', () => {
        // Centro exatamente na borda: metade do corpo no ar, e ele fica.
        expect(chaoSobOsPes([p], p.hw, 0, 2)?.topY).toBe(2);
        // E um pouco além dela também, até o raio de apoio.
        expect(chaoSobOsPes([p], p.hw + RAIO_DE_APOIO * 0.8, 0, 2)?.topY).toBe(2);
    });

    it('passou do perdão, caiu', () => {
        expect(chaoSobOsPes([p], p.hw + RAIO_DE_APOIO + 0.05, 0, 2)).toBe(null);
    });

    it('o perdão é um raio, não um quadrado — vale na diagonal também', () => {
        // Na quina, o alcance diagonal é o mesmo raio, não a soma dos dois eixos.
        const meio = RAIO_DE_APOIO / Math.SQRT2;
        expect(chaoSobOsPes([p], p.hw + meio * 0.9, p.hd + meio * 0.9, 2)?.topY).toBe(2);
        expect(chaoSobOsPes([p], p.hw + RAIO_DE_APOIO, p.hd + RAIO_DE_APOIO, 2)).toBe(null);
    });
});

describe('atravessar a laje acabou', () => {
    // O BUG, em uma frase: o jogador pulava curto, encostava na cara da
    // plataforma abaixo do topo dela, e entrava no bloco em vez de bater nele.
    const p = plat({ topY: 3, hw: 1.2, hd: 1.2 });
    const dentroDaFaixa = p.topY - ESPESSURA_DA_LAJE / 2 - ALTURA_DO_CORPO / 2;

    it('quem invade a laje é expulso, e sai por fora dela', () => {
        const r = empurrarDasLaterais([p], 0.5, dentroDaFaixa, p.cz - p.hd + 0.1);
        expect(r.bateu).toBe(true);
        const foraEmX = Math.abs(r.x - p.x) >= p.hw + RAIO_DO_CORPO - 1e-6;
        const foraEmZ = Math.abs(r.z - p.cz) >= p.hd + RAIO_DO_CORPO - 1e-6;
        expect(foraEmX || foraEmZ).toBe(true);
    });

    it('sai pelo lado mais curto — raspar numa quina desliza, não agarra', () => {
        // Fundo na frente da plataforma, quase no centro em X: o caminho curto
        // é para trás em Z, não para o lado.
        const r = empurrarDasLaterais([p], 0.05, dentroDaFaixa, p.cz - p.hd + 0.05);
        expect(Math.abs(r.x - 0.05)).toBeLessThan(1e-9);
        expect(r.z).toBeLessThan(p.cz - p.hd);
    });

    it('quem está EM CIMA não é empurrado pela própria plataforma', () => {
        // A regressão mais fácil de escrever sem querer: o corpo começa no topo
        // da laje, e "no topo" é onde o ponto flutuante mora.
        const r = empurrarDasLaterais([p], 0, p.topY, 0);
        expect(r.bateu).toBe(false);
        expect(r.x).toBe(0);
        expect(r.z).toBe(0);
    });

    it('quem passa bem por baixo não é empurrado', () => {
        const r = empurrarDasLaterais([p], 0, p.topY - ESPESSURA_DA_LAJE - ALTURA_DO_CORPO - 0.2, 0);
        expect(r.bateu).toBe(false);
    });

    it('andar contra a lateral não põe ninguém dentro do bloco', () => {
        // Integração curta: empurra o corpo contra a cara da plataforma quadro a
        // quadro, como o passo de andar faz, e confere que ele nunca fica dentro.
        let x = 0, z = p.cz - p.hd - RAIO_DO_CORPO - 0.5;
        const y = dentroDaFaixa;
        for (let i = 0; i < 120; i++) {
            z += 4.0 / 60;                                   // SPEED andando para +Z
            const r = empurrarDasLaterais([p], x, y, z);
            x = r.x; z = r.z;
            const dentroX = Math.abs(x - p.x) < p.hw + RAIO_DO_CORPO - 1e-6;
            const dentroZ = Math.abs(z - p.cz) < p.hd + RAIO_DO_CORPO - 1e-6;
            expect(dentroX && dentroZ, `quadro ${i}: entrou no bloco`).toBe(false);
        }
    });
});

describe('a cabeça bate na laje de cima', () => {
    const p = plat({ topY: 3 });

    it('subir colado numa plataforma para em vez de atravessar', () => {
        const fundo = p.topY - ESPESSURA_DA_LAJE;
        const r = baterACabeca([p], 0, fundo - ALTURA_DO_CORPO + 0.15, 0, 6);
        expect(r.bateu).toBe(true);
        expect(r.vy).toBe(0);
        expect(r.y + ALTURA_DO_CORPO).toBeCloseTo(fundo, 9);
    });

    it('caindo nunca bate a cabeça', () => {
        const fundo = p.topY - ESPESSURA_DA_LAJE;
        const r = baterACabeca([p], 0, fundo - ALTURA_DO_CORPO + 0.15, 0, -6);
        expect(r.bateu).toBe(false);
    });

    it('longe em XZ não bate', () => {
        const fundo = p.topY - ESPESSURA_DA_LAJE;
        const r = baterACabeca([p], p.hw + RAIO_DO_CORPO + 0.2, fundo - ALTURA_DO_CORPO + 0.15, 0, 6);
        expect(r.bateu).toBe(false);
    });
});

describe('a fronteira do pulo perdoa, mas não inventa', () => {
    const DT = 1 / 60;

    it('coyote: sair da borda e pular logo depois ainda vale', () => {
        let r = girarRelogios(RELOGIOS_ZERADOS, DT, true, false);   // no chão
        r = girarRelogios(r, COYOTE_S * 0.5, false, false);          // saiu da borda
        r = girarRelogios(r, 0, false, true);                        // aperta agora
        expect(podePular(r)).toBe(true);
    });

    it('coyote não é pulo duplo: passou do prazo, não vale', () => {
        let r = girarRelogios(RELOGIOS_ZERADOS, DT, true, false);
        r = girarRelogios(r, COYOTE_S + 0.05, false, false);
        r = girarRelogios(r, 0, false, true);
        expect(podePular(r)).toBe(false);
    });

    it('buffer: pedir antes de encostar vale quando encosta', () => {
        let r = girarRelogios(RELOGIOS_ZERADOS, DT, false, true);    // pediu no ar
        r = girarRelogios(r, BUFFER_DE_PULO_S * 0.5, false, false);  // ainda caindo
        expect(podePular(r)).toBe(false);
        r = girarRelogios(r, DT, true, false);                       // encostou
        expect(podePular(r)).toBe(true);
    });

    it('buffer velho não ressuscita: pedido antigo não pula sozinho', () => {
        let r = girarRelogios(RELOGIOS_ZERADOS, DT, false, true);
        r = girarRelogios(r, BUFFER_DE_PULO_S + 0.05, false, false);
        r = girarRelogios(r, DT, true, false);
        expect(podePular(r)).toBe(false);
    });

    it('um pedido não vira dois pulos', () => {
        let r = girarRelogios(RELOGIOS_ZERADOS, DT, true, true);
        expect(podePular(r)).toBe(true);
        r = gastarOPulo();
        expect(podePular(r)).toBe(false);
        // e o quadro seguinte, ainda no chão e sem apertar nada, continua sem pular
        r = girarRelogios(r, DT, true, false);
        expect(podePular(r)).toBe(false);
    });

    it('no ar, sem chão recente e sem pedido, nunca', () => {
        const r = girarRelogios(RELOGIOS_ZERADOS, DT, false, false);
        expect(podePular(r)).toBe(false);
    });
});

describe('o que o conserto anterior ganhou continua ganho', () => {
    it('vir de baixo ainda não pousa — o ímã segue morto', () => {
        const alvo = plat({ topY: 3 });
        expect(chaoSobOsPes([alvo], 0, 0, 1.1)).toBe(null);
        const passo = resolverQueda(1.1, 1.0, -6, null);
        expect(passo.pousou).toBe(false);
        expect(passo.y).toBe(1.0);
    });

    it('o pouso agora entrega a força do tombo', () => {
        const p = plat({ topY: 0 });
        const leve = resolverQueda(0.3, -0.1, -2, { topY: 0, plat: p });
        const forte = resolverQueda(9.0, -0.1, -18, { topY: 0, plat: p });
        expect(leve.pousou).toBe(true);
        expect(forte.impacto).toBeGreaterThan(leve.impacto * 3);
    });
});

describe('o tranco do pouso: a mesma mola para a câmera e para as mãos', () => {
    // Escrever a mola duas vezes seria garantir que as duas divergissem na
    // primeira afinação — e as duas juntas são o que faz uma queda parecer uma
    // queda. Estes testes seguram a mola, não a amplitude de cada uma.
    const correr = (impacto: number, af: AfinacaoDoTranco, quadros = 240): {
        fundo: number; fim: Tranco; picoPositivo: number;
    } => {
        let t = TRANCO_PARADO;
        let fundo = 0, picoPositivo = 0;
        for (let i = 0; i < quadros; i++) {
            t = molaDoTranco(t, i === 0 ? impacto : 0, 1 / 60, af);
            fundo = Math.min(fundo, t.valor);
            picoPositivo = Math.max(picoPositivo, t.valor);
        }
        return { fundo, fim: t, picoPositivo };
    };

    it('degrau não treme a tela: abaixo do piso, nada acontece', () => {
        const r = correr(PISO_DO_TRANCO - 0.5, TRANCO_DA_CAMERA);
        expect(r.fundo).toBe(0);
        expect(r.fim.valor).toBe(0);
    });

    it('quanto maior o tombo, mais fundo — até o teto', () => {
        const leve = correr(PISO_DO_TRANCO + 3, TRANCO_DA_CAMERA).fundo;
        const forte = correr(PISO_DO_TRANCO + 12, TRANCO_DA_CAMERA).fundo;
        expect(forte).toBeLessThan(leve);
        // E o teto existe: cair de 200 m/s não pode dar um soco maior que 22.
        const absurdo = correr(200, TRANCO_DA_CAMERA).fundo;
        const noTeto = correr(TETO_DO_TRANCO, TRANCO_DA_CAMERA).fundo;
        expect(absurdo).toBeCloseTo(noTeto, 9);
    });

    it('volta ao repouso e não fica repicando', () => {
        for (const af of [TRANCO_DA_CAMERA, TRANCO_DAS_MAOS]) {
            const r = correr(TETO_DO_TRANCO, af);
            expect(Math.abs(r.fim.valor)).toBeLessThan(0.005);
            // Quase crítica: pode passar um triz do zero na volta, não saltar.
            expect(r.picoPositivo).toBeLessThan(af.limite * 0.25);
        }
    });

    it('nunca passa do limite, nem com quadros longos', () => {
        for (const af of [TRANCO_DA_CAMERA, TRANCO_DAS_MAOS]) {
            let t = TRANCO_PARADO;
            for (let i = 0; i < 400; i++) {
                // Quadro gigante de propósito: Euler com mola dura e passo
                // grande diverge, e o `Math.min(dt, 0.05)` é o que impede.
                t = molaDoTranco(t, i % 40 === 0 ? TETO_DO_TRANCO : 0, 0.9, af);
                expect(Number.isFinite(t.valor), `quadro ${i}`).toBe(true);
                expect(Math.abs(t.valor)).toBeLessThanOrEqual(af.limite + 1e-9);
            }
        }
    });

    it('dt negativo ou zero não quebra', () => {
        let t = molaDoTranco(TRANCO_PARADO, 20, 0, TRANCO_DA_CAMERA);
        expect(Number.isFinite(t.valor)).toBe(true);
        t = molaDoTranco(t, 0, -1, TRANCO_DA_CAMERA);
        expect(Number.isFinite(t.valor)).toBe(true);
    });
});
