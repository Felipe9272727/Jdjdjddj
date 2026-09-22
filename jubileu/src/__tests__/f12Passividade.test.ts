import { describe, it, expect } from 'vitest';
import {
    ARENA, CICLO_DA_BOCA, bocaNoInstante, novaNave, passoDaNave,
    nascerLeque, nascerTeleguiado, nascerNaves, nascerMare, nascerElevadores,
    passoDoProjetil, saiuDeCena, encostou, tomarToque, NAVE, ataqueDaVez,
    reiniciarIds, type Projetil,
} from '../f12Boss';

/**
 * ── A LUTA PRECISA PODER SER PERDIDA ─────────────────────────────────────────
 *
 * Uma revisão independente afirmou que o andar NÃO PODE SER PERDIDO: que um
 * jogador parado sobrevivia mais de cinco minutos com as cinco vidas. Se fosse
 * verdade seria o defeito mais grave possível, porque tornaria decorativo todo
 * o resto — as vidas, o aviso de dano, e os 6,4 s de cena de derrota.
 *
 * Medido no navegador, é falso: um jogador que nunca toca na tela perde as
 * cinco vidas em 63 s e cai em `abatido`. Medido aqui, também: de qualquer
 * ponto da arena.
 *
 * O `f12Simulacao` existente não cobria isto porque o bot dele SEMPRE volta
 * para debaixo da boca entre ameaças — ele nunca fica parado onde está. Este
 * arquivo testa a coisa que faltava: ficar parado é morrer.
 */
function jogadorParado(px: number, py: number, limite = 150) {
    reiniciarIds();
    const dt = 1 / 60;
    const n = novaNave(px, py, 5);
    n.alvoX = px; n.alvoY = py;
    let ps: Projetil[] = [];
    let t = 0, bocaT = 0, cuspiu = -1, faixa = 0, faseMare = 0, toques = 0;

    while (t < limite && n.vidas > 0) {
        t += dt; bocaT += dt;
        const b = bocaNoInstante(bocaT);
        const ciclo = Math.floor(bocaT / CICLO_DA_BOCA);
        if (b.estado === 'aberta' && cuspiu !== ciclo) {
            cuspiu = ciclo;
            const q = ataqueDaVez(ciclo, 7);
            if (q === 'leque') ps.push(...nascerLeque(n.x * 0.4, n.y));
            else if (q === 'teleguiado') ps.push(nascerTeleguiado());
            else if (q === 'naves') ps.push(...nascerNaves());
            else if (q === 'mare') { faseMare += 1.7; ps.push(nascerMare(faseMare)); }
            else { faixa = (faixa + 2) % 5; ps.push(...nascerElevadores(faixa)); }
        }
        // Ele NÃO é conduzido: fica exatamente onde o jogador o deixou.
        passoDaNave(n, dt);
        for (const p of ps) passoDoProjetil(p, n.x, n.y, dt);
        const mortos = new Set<number>();
        for (const p of ps) {
            if (encostou(p, n.x, n.y, NAVE.raio) && tomarToque(n)) {
                toques++;
                if (p.tipo !== 'mare') mortos.add(p.id);
            }
        }
        ps = ps.filter((p) => !mortos.has(p.id) && !saiuDeCena(p));
    }
    return { segundos: t, vidas: n.vidas, toques };
}

describe('ficar parado é morrer — não existe ponto seguro na arena', () => {
    // Nove colunas por cinco alturas cobrem a arena inteira. Se UM ponto
    // sobrevivesse, o andar teria um esconderijo, e um chefe com esconderijo
    // não tem dificuldade nenhuma.
    const colunas = [-1, -.75, -.5, -.25, 0, .25, .5, .75, 1];
    const alturas = [0, .25, .5, .75, 1];

    it.each(colunas)('a coluna x=%s não tem altura segura', (fx) => {
        for (const fy of alturas) {
            const x = fx * ARENA.x;
            const y = ARENA.yBaixo + fy * (ARENA.yAlto - ARENA.yBaixo);
            const r = jogadorParado(x, y);
            expect(r.vidas, `parado em (${x.toFixed(1)}, ${y.toFixed(1)}) sobreviveu 150 s`).toBe(0);
        }
    });

    it('e morrer parado leva algumas dezenas de segundos, não instantes', () => {
        // Rápido demais seria injusto; lento demais e o jogador nunca aprende
        // que precisa desviar. A medição no navegador deu 63 s.
        const r = jogadorParado(0, ARENA.yBaixo + (ARENA.yAlto - ARENA.yBaixo) / 2);
        expect(r.segundos).toBeGreaterThan(12);
        expect(r.segundos).toBeLessThan(90);
    });
});
