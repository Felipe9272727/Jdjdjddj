/**
 * f3Decupagem.ts — a DECUPAGEM da cutscene da queda do Diabrete: o palco onde
 * ela é encenada e a lista de planos de câmera, plano a plano, fala a fala.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * A cena tinha UM plano. `topDownBeg` era chamado do começo ao fim da fase de
 * súplica — e essa fase segura as oito falas do Diabrete e depois espera o
 * jogador escolher. Medido na bancada: a câmera saiu de [0.32, 2.46, 1.19] e
 * chegou, vinte e quatro segundos depois, em [0.32, 2.36, 1.30]. Onze centésimos
 * de metro. O Diabrete ANIMAVA (tremor, escorregões, pernas pedalando — isso
 * estava lá e funcionava), mas ninguém filmava: era um tripé parafusado no chão
 * com uma caixa de diálogo por cima.
 *
 * Um desenho de 1930 não faz isso. Ele CORTA — duro, sem transição — e cada
 * corte tem um motivo: o plano alto diz "eu tenho você", o contra-plongée do
 * abismo diz "e não há nada embaixo", o primeiríssimo plano diz "olhe nos olhos
 * dele". Aqui cada fala ganha o seu plano, e a troca de fala É o corte.
 *
 * ── POR QUE EM MÓDULO SEPARADO ───────────────────────────────────────────────
 *
 * Porque assim dá para TESTAR o que uma foto não mostra: que nenhum plano enfia
 * a câmera dentro de uma laje (foi o que produziu um quadro inteiramente preto
 * no meio da cutscene), que cada fala tem um plano, que trocar de fala mexe a
 * câmera de verdade, e que o Diabrete nunca sai do enquadramento.
 */

import { type F3Plat } from './f3Parkour';

// ── O PALCO ──────────────────────────────────────────────────────────────────
// A cutscene não acontece na escadaria viva: ela monta o próprio pedacinho de
// mapa, com as MESMAS regras do gerador (vãos ~3,0–3,8, degrau 0,4–1,4, desvio
// lateral ±1,9, pegadas de {1,0 1,2 1,4}), só que DESCENDO — a escalada
// desabando para dentro do abismo em que ele está pendurado. A primeira laje é
// a grandona em que ele se agarra.
export function construirLajesDaCutscene(): F3Plat[] {
    let seed = 0x1a2b3c4d | 0;
    const rng = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rand = (a: number, b: number) => a + (b - a) * rng();
    const HALF = [1.0, 1.2, 1.4], X_LIMIT = 11;
    const mk = (id: number, bx: number, cz: number, topY: number, half: number, palette: number): F3Plat =>
        ({ id, bx, cz, hw: half, hd: half, h: 0.6, topY, moving: false, amp: 0, phase: 0,
          tipo: id === 0 ? 'descanso' : 'passo', x: bx, dx: 0, palette });

    const lajes: F3Plat[] = [mk(0, 0, -2.4, 0, 2.4, 0)];
    let bx = 0, cz = -2.4, topY = 0;
    for (let i = 1; i < 11; i++) {
        const half = HALF[Math.floor(rng() * HALF.length)];
        cz += rand(3.0, 3.8) + half;
        topY -= rand(0.4, 1.4);
        bx += i === 1 ? -2.6 : rand(-1.9, 1.9);
        bx = Math.max(-X_LIMIT + half, Math.min(X_LIMIT - half, bx));
        lajes.push(mk(i, bx, cz, topY, half, i % 6));
    }
    return lajes;
}

export const LAJES_DA_CUTSCENE: readonly F3Plat[] = Object.freeze(construirLajesDaCutscene());

/** A caixa que uma laje ocupa no espaço do palco (coordenadas do `ledgeRef`).
 *  Inclui a BORDA DE TINTA, que é geometria de verdade e mais larga que o
 *  tampo — a câmera entrar nela é tão preto quanto entrar na laje. */
export function caixaDaLaje(p: F3Plat): {
    x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
} {
    const borda = (p.palette < 0 ? 0.5 : 0.42) / 2;   // metade do alargamento (PlatformView.rim)
    const fundo = p.topY - 0.05 - p.h * 1.15;         // base do bloco de tinta
    return {
        x0: p.bx - p.hw - borda, x1: p.bx + p.hw + borda,
        y0: fundo, y1: p.topY,
        z0: p.cz - p.hd - borda, z1: p.cz + p.hd + borda,
    };
}

/** A câmera está DENTRO de alguma laje? (É isto que pinta o quadro de preto.) */
export function dentroDeAlgumaLaje(
    x: number, y: number, z: number, lajes: readonly F3Plat[] = LAJES_DA_CUTSCENE,
): boolean {
    for (const p of lajes) {
        const c = caixaDaLaje(p);
        if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && z >= c.z0 && z <= c.z1) return true;
    }
    return false;
}

// ── OS PLANOS ────────────────────────────────────────────────────────────────

/** Onde a cena está montada, em coordenadas de mundo. */
export interface Palco {
    gx: number;        // X da borda em que ele se agarra
    gripY: number;     // Y do tampo (a beirada)
    edgeZ: number;     // Z em que ele pendura (lado do abismo)
    hangY: number;     // Y do corpo pendurado
}

export interface Plano {
    x: number; y: number; z: number;      // posição da câmera
    lx: number; ly: number; lz: number;   // para onde ela olha
    fov: number;
}

/** A cabeça dele: é o que um primeiro plano precisa enquadrar, e ela fica logo
 *  abaixo da beirada (ele pendura pelos braços, com a cara na altura do tampo). */
export const alturaDaCabeca = (p: Palco) => p.gripY - 0.35;

export type NomeDoPlano = 'alto' | 'raso' | 'close' | 'perfil';

// ── DE ONDE DÁ PARA FILMAR ESTE PALCO ────────────────────────────────────────
//
// A primeira lista de planos tinha um contra-plongée lindo — de baixo, olhando
// para cima, com o abismo em volta. Ele saiu PRETO. E o close também, e o
// perfil: três dos catorze quadros da bancada eram tela preta.
//
// O motivo não é de câmera, é de encenação. O Diabrete pendura com a cabeça na
// altura da BORDA DE TINTA da laje — um bloco preto de 70 cm que emoldura a
// peça por baixo. Personagem de tinta contra parede de tinta, de qualquer
// ângulo horizontal. A única direção que separa os dois é DE CIMA PARA BAIXO:
// aí o que fica atrás da cabeça dele é o vazio, e o vazio é creme.
//
// Isso não é uma limitação chata — é a mesma coisa que a cena quer dizer. Ele
// está ABAIXO de você, e quem decide é você. Todo plano olha para baixo, e o
// teste cobra isso.
export const FUNDO_DA_BORDA = 0.74;   // o bloco de tinta desce isto abaixo do tampo

/**
 * `deriva` é o único movimento dentro de um plano: um empurrãozinho lento, para
 * o plano não ser uma fotografia. Quem conta a história é o CORTE.
 */
export function plano(nome: NomeDoPlano, p: Palco, deriva = 0): Plano {
    const d = Math.max(0, Math.min(1, deriva));
    const cabeca = alturaDaCabeca(p);
    switch (nome) {
        // O PLANO DE CIMA — o ponto de vista do jogador debruçado na beirada.
        // Diz "eu tenho você" e mostra a mãozinha agarrada, que é o que a
        // escolha PISAR vai esmagar. Abre e fecha a cena.
        case 'alto': return {
            x: p.gx + 0.7, y: p.gripY + 2.7 - d * 0.45, z: p.edgeZ - 1.7 + d * 0.35,
            lx: p.gx, ly: p.gripY - 0.45, lz: p.edgeZ, fov: 48,
        };
        // O PLANO DE DEUS — lá de cima, quase a prumo. Ele vira um pontinho
        // agarrado numa laje branca e embaixo aparece a escadaria inteira
        // desabando. É o plano das falas secas do jogador: a resposta à súplica
        // é a altura.
        case 'raso': return {
            x: p.gx + 1.5, y: p.gripY + 6.4 - d * 0.7, z: p.edgeZ + 0.8 + d * 0.2,
            lx: p.gx, ly: p.gripY - 0.6, lz: p.edgeZ, fov: 52,
        };
        // PRIMEIRÍSSIMO PLANO — o jogador ajoelhado na beirada, a cara dele
        // enchendo o quadro. Vem de CIMA da borda, olhando para baixo, que é o
        // único jeito de a cabeça de tinta não cair em cima da borda de tinta.
        // A PRIMEIRA VERSÃO DESTE CLOSE TAMBÉM SAIU PRETA. Ela vinha de FORA da
        // beirada (z = edgeZ + 1,05) e olhava para TRÁS — e atrás dele está a
        // face de tinta da laje. Não bastava "olhar de cima": tem de olhar de
        // cima e PARA FORA, com o vazio atrás da cabeça. É o mesmo eixo do
        // plano `alto`, que a bancada já provou que lê, só que empurrado e com
        // lente mais longa. Agora quem cobra isso é `fundoLimpoAtrasDaCabeca`.
        case 'close': return {
            x: p.gx + 0.45, y: p.gripY + 1.75 - d * 0.22, z: p.edgeZ - 0.85 + d * 0.18,
            lx: p.gx, ly: cabeca - 0.15, lz: p.edgeZ, fov: 31,
        };
        // TRÊS QUARTOS ABERTO — de lado e bem de cima, com todo o ar embaixo
        // dele. É onde as piadas do jogador caem melhor: a piada precisa do
        // vazio.
        //
        // Ele nasceu como um perfil BAIXO, e a conta explica por que não podia
        // ser: ele pendura a 35 cm da face da laje, e a face tem 39 cm abaixo da
        // cabeça dele. Para o raio que passa pela cabeça escapar do paredão
        // dentro dessa folga, ele precisa cair mais de 2,8 por unidade de Z: a
        // borda de tinta ainda se projeta 21 cm para fora do tampo, então a
        // cabeça dele está a 14 cm da face e 39 cm acima do fundo dela. Um
        // perfil raso é geometricamente impossível neste palco — o conserto de
        // verdade é pendurá-lo MAIS BAIXO, com braços de borracha, e aí toda a
        // gramática de ângulos baixos se abre. Fica para a próxima volta.
        // A DERIVA TEM DE SUBIR, NÃO AFASTAR. Com ela empurrando +Z a inclinação
        // caía para 2,78 no fim do plano — um fio de cabelo abaixo dos 2,79 que
        // este palco exige — e o último terço da fala voltava a ter paredão
        // atrás dele. Sobe e aproxima; a inclinação só melhora.
        default: return {
            x: p.gx + 4.2 + d * 0.5, y: p.gripY + 6.0 + d * 0.35, z: p.edgeZ + 2.0 - d * 0.12,
            lx: p.gx + 0.1, ly: cabeca - 0.9, lz: p.edgeZ, fov: 50,
        };
    }
}

/**
 * A DECUPAGEM: que plano acompanha cada fala.
 *
 * Oito falas, cinco trocas de plano. A regra que eu segui:
 *   • fala do DIABRETE suplicando   → `close` (a atuação é o assunto)
 *   • fala seca do JOGADOR          → `alto` ou `perfil` (distância, desdém)
 *   • a primeira e a última         → `alto`, porque abrem e fecham na mesma
 *                                     geometria: a mão dele ao alcance do pé.
 */
export const DECUPAGEM_DA_SUPLICA: readonly NomeDoPlano[] = Object.freeze([
    'alto',     // 0 — "E-EI! Não vai embora não!"        (estabelece)
    'raso',     // 1 — "…por que eu ajudaria?"            (a altura É a resposta)
    'close',    // 2 — "A gente tava só BRINCANDO"        (a lábia)
    'perfil',   // 3 — "Você jogou espinhos em mim."      (a piada precisa do vazio)
    'close',    // 4 — "eu tenho família!"                (a mentira maior)
    'raso',     // 5 — "Você apareceu faz cinco minutos." (o desmentido, de cima)
    'close',    // 6 — "T-tá, menti. MAS…"                (a confissão)
    'alto',     // 7 — "Me salva… ou pisa?"               (a escolha, na mão dele)
]);

/** O plano da fala `linha`. Fora da lista, volta ao plano de cima — que é o
 *  único que sempre funciona, porque é o ponto de vista de quem está jogando. */
export function planoDaSuplica(linha: number, p: Palco, deriva = 0): Plano {
    const nome = DECUPAGEM_DA_SUPLICA[linha] ?? 'alto';
    return plano(nome, p, deriva);
}


// ── O QUE ESTÁ ATRÁS DA CABEÇA DELE ──────────────────────────────────────────
//
// A regra "filme de cima" não bastou: o close vinha de fora da beirada e olhava
// para TRÁS, contra a face de tinta da laje — preto sobre preto de novo, e a
// bancada devolveu mais dois quadros pretos.
//
// A pergunta certa não é de onde a câmera está, é o que ela vê DEPOIS dele.
// Isto traça o raio que sai da câmera, passa pela cabeça do Diabrete e segue: se
// ele bate na laje da beirada antes de `alcance` metros, o fundo do plano é um
// paredão. Se não bate, o fundo é céu.
export function fundoLimpoAtrasDaCabeca(p: Palco, c: Plano, alcance = 8): boolean {
    const hx = p.gx, hy = alturaDaCabeca(p), hz = p.edgeZ;
    let dx = hx - c.x, dy = hy - c.y, dz = hz - c.z;
    const n = Math.hypot(dx, dy, dz) || 1;
    dx /= n; dy /= n; dz /= n;

    // A laje da beirada, em coordenadas de MUNDO. O grupo das lajes fica em
    // (gx, gripY, edgeZ − EDGE_Z), e EDGE_Z é 0,35 (Floor3FallCutscene).
    const laje = LAJES_DA_CUTSCENE[0];
    const b = caixaDaLaje(laje);
    const ox = p.gx, oy = p.gripY, oz = p.edgeZ - 0.35;
    const cx0 = b.x0 + ox, cx1 = b.x1 + ox;
    const cy0 = b.y0 + oy, cy1 = b.y1 + oy;
    const cz0 = b.z0 + oz, cz1 = b.z1 + oz;

    // Slab method, começando UM POUCO depois da cabeça (o que interessa é o
    // fundo, não o corpo dele).
    let t0 = 0.25, t1 = alcance;
    const eixo = (o: number, dd: number, lo: number, hi: number) => {
        if (Math.abs(dd) < 1e-9) return o >= lo && o <= hi;
        let a = (lo - o) / dd, bq = (hi - o) / dd;
        if (a > bq) { const t = a; a = bq; bq = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, bq);
        return t0 <= t1;
    };
    const bx = hx, by = hy, bz = hz;   // o raio parte da cabeça
    if (!eixo(bx, dx, cx0, cx1)) return true;
    if (!eixo(by, dy, cy0, cy1)) return true;
    if (!eixo(bz, dz, cz0, cz1)) return true;
    return t0 > t1;
}
