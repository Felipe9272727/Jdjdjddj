// ── A ESCADARIA, ATRAVESSADA DE VERDADE ──────────────────────────────────────
//
// Este arquivo não consulta fórmula nenhuma: ele INTEGRA a física do Andar 3,
// quadro a quadro, com os mesmos números e a mesma ordem de operações do
// `useFrame` do Player.tsx, sobre o curso que o gerador realmente produz.
//
// É o teste que faltava para as duas afirmações que o andar fazia sem provar:
//   • "todo vão é pulável" — agora todo degrau é atravessado por um pulo real;
//   • "o pulo é necessário" — andar para a frente sem pular NÃO sobe degrau.
//
// O segundo era falso até hoje. O `demonstraOImaAntigo` no fim mede o bug que
// foi removido, com a regra antiga escrita à mão, para o número ficar no
// repositório em vez de na memória de alguém.
import { describe, it, expect } from 'vitest';
import { F3_GRAVITY, F3_JUMP, SPEED } from '../constants';
import { platforms, reset, tick, type F3Plat } from '../f3Parkour';
import { chaoSobOsPes, resolverQueda, arrastoDaPonte } from '../f3Fisica';

const DT = 1 / 60;

/** A ponte parada no centro da oscilação — o caso conservador para o gerador. */
const noCentro = (p: F3Plat): F3Plat => ({ ...p, x: p.bx, dx: 0 });

type Fim = 'alvo' | 'origem' | 'vazio';

/**
 * Um salto, integrado igual ao jogo: sai da borda da frente de `de` segurando
 * para a frente na direção de `para`. `pular` falso é o mesmo jogador andando
 * para fora da borda sem tocar no botão.
 */
function atravessar(de: F3Plat, para: F3Plat, pular: boolean): Fim {
    const lista = [noCentro(de), noCentro(para)];
    // Alinha em X dentro da própria plataforma, e vai até a borda da frente.
    let x = Math.max(de.bx - de.hw + 0.05, Math.min(de.bx + de.hw - 0.05, para.bx));
    let z = de.cz + de.hd - 0.02;
    let y = de.topY;
    let vy = pular ? F3_JUMP : 0;
    // "Segurar para a frente": direção fixa, como um jogador faz.
    const dirX = para.bx - x, dirZ = para.cz - z;
    const norma = Math.hypot(dirX, dirZ) || 1;
    const ux = dirX / norma, uz = dirZ / norma;

    for (let i = 0; i < 600; i++) {
        x += ux * SPEED * DT;
        z += uz * SPEED * DT;
        const yAntes = y;
        vy -= F3_GRAVITY * DT;
        y += vy * DT;
        const chao = chaoSobOsPes(lista, x, z, yAntes);
        x += arrastoDaPonte(chao, y);
        const passo = resolverQueda(yAntes, y, vy, chao);
        y = passo.y; vy = passo.vy;
        if (passo.pousou) return chao!.plat!.id === para.id ? 'alvo' : 'origem';
        if (y < Math.min(de.topY, para.topY) - 25) return 'vazio';
    }
    return 'vazio';
}

/** A regra ANTIGA: pousa em qualquer plataforma sob os pés, viesse de onde viesse. */
function demonstraOImaAntigo(de: F3Plat, para: F3Plat): boolean {
    const lista = [noCentro(de), noCentro(para)];
    let x = Math.max(de.bx - de.hw + 0.05, Math.min(de.bx + de.hw - 0.05, para.bx));
    let z = de.cz + de.hd - 0.02, y = de.topY, vy = 0;
    const dirX = para.bx - x, dirZ = para.cz - z;
    const norma = Math.hypot(dirX, dirZ) || 1;
    for (let i = 0; i < 600; i++) {
        x += (dirX / norma) * SPEED * DT;
        z += (dirZ / norma) * SPEED * DT;
        vy -= F3_GRAVITY * DT;
        y += vy * DT;
        let chao = -Infinity;                       // "a mais alta debaixo de mim"
        for (const p of lista) {
            if (x < p.x - p.hw || x > p.x + p.hw) continue;
            if (z < p.cz - p.hd || z > p.cz + p.hd) continue;
            if (p.topY > chao) chao = p.topY;
        }
        if (chao > -Infinity && y <= chao && vy <= 0) { y = chao; vy = 0; return y === para.topY; }
        if (y < Math.min(de.topY, para.topY) - 25) return false;
    }
    return false;
}

const SEMENTES = [0x9e3779b9, 1, 7, 42, 1337, 2024, 77777, 31337];
const curso = (seed: number): F3Plat[] => { reset(seed); tick(0, 0); return platforms.map((p) => ({ ...p })); };

describe('o pulo atravessa todo degrau que o gerador cria', () => {
    it('nenhum degrau é uma trava, em 8 cursos', () => {
        let degraus = 0;
        for (const seed of SEMENTES) {
            const c = curso(seed);
            for (let i = 0; i < c.length - 1; i++) {
                degraus += 1;
                expect(
                    atravessar(c[i], c[i + 1], true),
                    `semente ${seed}, degrau ${i}: desnível ${(c[i + 1].topY - c[i].topY).toFixed(2)}m`,
                ).toBe('alvo');
            }
        }
        expect(degraus).toBeGreaterThan(100);
    });
});

describe('sem pular não se sobe — o ímã acabou', () => {
    it('todo degrau que SOBE é intransponível a pé', () => {
        let subidas = 0;
        for (const seed of SEMENTES) {
            const c = curso(seed);
            for (let i = 0; i < c.length - 1; i++) {
                if (c[i + 1].topY <= c[i].topY + 0.05) continue;   // degrau plano ou de descida
                subidas += 1;
                expect(
                    atravessar(c[i], c[i + 1], false),
                    `semente ${seed}, degrau ${i}`,
                ).not.toBe('alvo');
            }
        }
        expect(subidas).toBeGreaterThan(60);      // a regra não está vazia
    });

    it('a REGRA ANTIGA subia essas mesmas subidas andando — era esse o bug', () => {
        // Se este teste um dia falhar, é porque alguém mexeu no gerador a ponto
        // de o ímã não ter mais o que puxar. O que ele guarda é a MEDIDA do que
        // foi consertado: a maioria esmagadora dos degraus subia sozinha.
        let subidas = 0, puxadas = 0;
        for (const seed of SEMENTES) {
            const c = curso(seed);
            for (let i = 0; i < c.length - 1; i++) {
                if (c[i + 1].topY <= c[i].topY + 0.05) continue;
                subidas += 1;
                if (demonstraOImaAntigo(c[i], c[i + 1])) puxadas += 1;
            }
        }
        expect(subidas).toBeGreaterThan(60);
        expect(puxadas / subidas).toBeGreaterThan(0.9);
    });
});
