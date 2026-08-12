import { describe, it, expect } from 'vitest';
import { F3_GRAVITY, F3_JUMP, SPEED } from '../constants';
import { type F3Plat, platforms, reset, tick } from '../f3Parkour';
import {
    type Plataforma, ALTURA_DO_PULO, FOLGA_CONFORTAVEL, TEMPO_NO_AR, alcanceDoPulo,
    daParaPular, ondeElePisa, rotaDePulos, saltoConfortavel, tempoDeVoo, vaoEntre,
} from '../agente/agenteSalto';

/** A plataforma viva do jogo, no formato que o agente entende. */
const comoPlataforma = (p: F3Plat): Plataforma => ({
    id: p.id, x: p.bx, z: p.cz, hw: p.hw, hd: p.hd, topY: p.topY, amp: p.amp,
});

const curso = (seed = 0x9e3779b9): Plataforma[] => {
    reset(seed);
    tick(0, 0);
    return platforms.map(comoPlataforma);
};

describe('a física do pulo é a DO JOGO', () => {
    it('altura e tempo saem de F3_JUMP e F3_GRAVITY', () => {
        // Se alguém afinar o pulo no Player, estes números mudam junto — que é
        // o motivo de as constantes terem saído de dentro do `useFrame`.
        expect(ALTURA_DO_PULO).toBeCloseTo((F3_JUMP ** 2) / (2 * F3_GRAVITY), 9);
        expect(ALTURA_DO_PULO).toBeCloseTo(2.051, 3);
        expect(TEMPO_NO_AR).toBeCloseTo(0.8636, 4);
    });

    it('subir come tempo de voo; cair devolve', () => {
        const plano = tempoDeVoo(0)!;
        expect(tempoDeVoo(1.4)!).toBeLessThan(plano);
        expect(tempoDeVoo(-2)!).toBeGreaterThan(plano);
        // Acima do ápice não existe instante nenhum.
        expect(tempoDeVoo(ALTURA_DO_PULO + 0.01)).toBe(null);
    });

    it('o alcance no chão é a velocidade vezes o tempo de voo', () => {
        expect(alcanceDoPulo(0)).toBeCloseTo(SPEED * TEMPO_NO_AR, 6);
        expect(alcanceDoPulo(1.4)).toBeCloseTo(SPEED * tempoDeVoo(1.4)!, 6);
    });
});

describe('o vão é de borda a borda, não de centro a centro', () => {
    const p = (over: Partial<Plataforma>): Plataforma =>
        ({ id: 1, x: 0, z: 0, hw: 1, hd: 1, topY: 0, ...over });

    it('metade de cada plataforma é chão, não vão', () => {
        // Centros a 5 m, com 1 m de meia-profundidade cada: o vão real é 3 m.
        expect(vaoEntre(p({}), p({ id: 2, z: 5 }))).toBeCloseTo(3, 6);
    });

    it('plataformas encostadas têm vão zero, não negativo', () => {
        expect(vaoEntre(p({}), p({ id: 2, z: 1.5 }))).toBe(0);
    });

    it('a ponte que se move ENCURTA o vão — ela vem até você', () => {
        // ── O SINAL QUE EU TINHA TROCADO ─────────────────────────────────
        // Minha primeira versão subtraía `amp` da meia-largura, como se só
        // valesse a faixa coberta o tempo todo. Os números do gerador derrubam
        // isso: `amp` chega a 2,4 e `hw` no máximo a 1,4, então essa faixa é
        // NEGATIVA na maioria das pontes — o vão CRESCIA com a oscilação, o
        // contrário do propósito da ponte móvel.
        const fixa = vaoEntre(p({}), p({ id: 2, x: 5, hw: 1.4 }));
        const movel = vaoEntre(p({}), p({ id: 2, x: 5, hw: 1.4, amp: 0.8 }));
        expect(movel).toBeLessThan(fixa);
        expect(movel).toBeCloseTo(fixa - 0.8, 6);
    });
});

describe('a promessa do gerador do parkour, finalmente medida', () => {
    // ── O COMENTÁRIO QUE NUNCA TINHA SIDO CONFERIDO ───────────────────────
    //
    // `f3Parkour.ts` afirma, ao lado das faixas de geração:
    //
    //     "Generation ranges (kept conservative so every gap is jumpable)"
    //
    // É uma afirmação verificável sobre a física do jogo, e ninguém a tinha
    // verificado. Medida em 406 cursos (6090 degraus), ela é QUASE verdadeira:
    //
    //     12 degraus em 6090 (0,2%) ficam além do pulo, em 12 cursos de 406 (3%)
    //     o pior deles fica 6,4 cm curto — desnível 1,37 m, vão 2,78 m
    //
    // Não é o `cz += 0,6` do laço anti-sobreposição, como eu suspeitei: é o
    // canto ruim das próprias faixas. `GAP_MAX = 3,8` junto com `RISE_MAX =
    // 1,4` cai exatamente em cima do limite físico, e alguns sorteios passam
    // por centímetros. "Conservador" está errado por pouco — mas num parkour
    // um degrau impossível não é um degrau difícil: é o curso interrompido.
    const SEEDS = [0x9e3779b9, 1, 42, 1337, 2024, 77777];

    it('todo degrau do curso PADRÃO é fisicamente pulável', () => {
        const c = curso();
        expect(c.length).toBeGreaterThan(8);
        for (let i = 0; i < c.length - 1; i += 1) {
            const s = daParaPular(c[i], c[i + 1]);
            expect(
                s.da,
                `degrau ${i}: ${s.porque}, vão ${s.vao.toFixed(2)}m `
                + `desnível ${s.desnivel.toFixed(2)}m alcance ${s.alcance.toFixed(2)}m`,
            ).toBe(true);
        }
    });

    it('o degrau mais apertado do curso padrão sobra 13 cm — e isso é POUCO', () => {
        // É este número que a margem de 25 cm que eu tinha inventado reprovava.
        // O jogador atravessa; um agente que recusasse seria pior que o jogo.
        let pior = Infinity;
        const c = curso();
        for (let i = 0; i < c.length - 1; i += 1) {
            pior = Math.min(pior, daParaPular(c[i], c[i + 1]).folga);
        }
        expect(pior).toBeGreaterThan(0);
        expect(pior).toBeLessThan(FOLGA_CONFORTAVEL);
    });

    it('a taxa de degraus impossíveis está onde foi medida', () => {
        // Guarda de regressão sobre a GERAÇÃO, não sobre o agente: se alguém
        // afrouxar GAP_MAX/RISE_MAX ou apertar F3_JUMP, esta conta piora e o
        // teste conta a história. Se alguém CONSERTAR o canto ruim, ela vai a
        // zero e o teste também avisa.
        let impossiveis = 0;
        let degraus = 0;
        let pior = Infinity;
        for (const seed of SEEDS) {
            const c = curso(seed);
            for (let i = 0; i < c.length - 1; i += 1) {
                const s = daParaPular(c[i], c[i + 1]);
                degraus += 1;
                if (!s.da) impossiveis += 1;
                pior = Math.min(pior, s.folga);
            }
        }
        expect(degraus).toBeGreaterThan(80);
        expect(impossiveis / degraus).toBeLessThan(0.01);
        // Nenhum degrau falha por MUITO: o problema é o limite, não um vão
        // absurdo. Se um dia isto virar metros, a causa é outra.
        expect(pior).toBeGreaterThan(-0.5);
    });
});

describe('a regra não é vazia: existe pulo que ele NÃO dá', () => {
    // Uma regra que aprova tudo não é uma regra. Estes são os dois jeitos de
    // não alcançar, e cada um tem nome próprio no resultado — a diferença
    // importa para quem vai decidir o que fazer em vez de pular.
    const base: Plataforma = { id: 1, x: 0, z: 0, hw: 1, hd: 1, topY: 0 };

    it('alto demais: acima do ápice não há pulo', () => {
        const s = daParaPular(base, { ...base, id: 2, z: 2.5, topY: ALTURA_DO_PULO + 1 });
        expect(s.da).toBe(false);
        expect(s.porque).toBe('alto-demais');
    });

    it('longe demais: o ar acaba antes', () => {
        const s = daParaPular(base, { ...base, id: 2, z: 30 });
        expect(s.da).toBe(false);
        expect(s.porque).toBe('longe-demais');
    });

    it('"dá" e "dá com sobrando" são perguntas diferentes', () => {
        // O degrau que sobra 13 cm: possível, e não confortável. Misturar as
        // duas numa margem só era o que fazia o agente recusar pulos legais.
        const apertado = { ...base, id: 2, z: 1 + 1 + alcanceDoPulo(0) - 0.13 };
        const s = daParaPular(base, apertado);
        expect(s.da).toBe(true);
        expect(saltoConfortavel(s)).toBe(false);
        const folgado = { ...base, id: 3, z: 1 + 1 + alcanceDoPulo(0) - 1 };
        expect(saltoConfortavel(daParaPular(base, folgado))).toBe(true);
    });

    it('o limite é onde a física põe', () => {
        const alcanceLimpo = alcanceDoPulo(0);
        // Vão de borda a borda logo abaixo do limite: passa.
        const cabe = { ...base, id: 2, z: 1 + 1 + alcanceLimpo - 0.05 };
        // Logo acima: não passa.
        const naoCabe = { ...base, id: 3, z: 1 + 1 + alcanceLimpo + 0.05 };
        expect(daParaPular(base, cabe).da).toBe(true);
        expect(daParaPular(base, naoCabe).da).toBe(false);
    });
});

describe('a rota pelo ar', () => {
    it('sobe o curso inteiro, do começo ao topo da piscina', () => {
        const c = curso();
        const rota = rotaDePulos(c, c[0].id, c[c.length - 1].id);
        expect(rota.length).toBeGreaterThan(1);
        expect(rota[0].id).toBe(c[0].id);
        expect(rota[rota.length - 1].id).toBe(c[c.length - 1].id);
        // Cada passo da rota tem de ser um pulo real.
        for (let i = 0; i < rota.length - 1; i += 1) {
            expect(daParaPular(rota[i], rota[i + 1]).da).toBe(true);
        }
    });

    it('prefere menos pulos — cada pulo é uma chance de errar', () => {
        // Um atalho que existe tem de ser usado: três plataformas em linha,
        // com a primeira alcançando a terceira direto.
        const linha: Plataforma[] = [
            { id: 1, x: 0, z: 0, hw: 1, hd: 1, topY: 0 },
            { id: 2, x: 0, z: 3, hw: 1, hd: 1, topY: 0 },
            { id: 3, x: 0, z: 4.5, hw: 1, hd: 1, topY: 0 },
        ];
        expect(rotaDePulos(linha, 1, 3).map((p) => p.id)).toEqual([1, 3]);
    });

    it('rota que não fecha devolve lista vazia — é resposta, não falha', () => {
        const separadas: Plataforma[] = [
            { id: 1, x: 0, z: 0, hw: 1, hd: 1, topY: 0 },
            { id: 2, x: 0, z: 60, hw: 1, hd: 1, topY: 0 },
        ];
        expect(rotaDePulos(separadas, 1, 2)).toEqual([]);
    });

    it('id que não existe não estoura', () => {
        expect(rotaDePulos(curso(), 0, 99999)).toEqual([]);
    });
});

describe('onde ele pisa', () => {
    it('acha a plataforma sob os pés, a mais alta que serve', () => {
        const empilhadas: Plataforma[] = [
            { id: 1, x: 0, z: 0, hw: 2, hd: 2, topY: 0 },
            { id: 2, x: 0, z: 0, hw: 1, hd: 1, topY: 3 },
        ];
        // Em cima da alta: é a alta.
        expect(ondeElePisa(empilhadas, 0, 3, 0)?.id).toBe(2);
        // No chão: a alta está ACIMA dele, então é a baixa.
        expect(ondeElePisa(empilhadas, 0, 0, 0)?.id).toBe(1);
        // Fora da pegada das duas: nenhuma — é o vão, e cair é o que acontece.
        expect(ondeElePisa(empilhadas, 9, 0, 9)).toBe(null);
    });

    it('concorda com o curso real: o jogador nasce em cima da primeira', () => {
        const c = curso();
        expect(ondeElePisa(c, 0, 0, -5)?.id).toBe(c[0].id);
    });
});
