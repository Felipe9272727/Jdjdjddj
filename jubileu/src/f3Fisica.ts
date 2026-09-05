// ── A FÍSICA VERTICAL DO ANDAR 3, FORA DO `useFrame` ─────────────────────────
//
// Isto morava dentro do laço de quadro do `Player.tsx`, junto com o andar 0, o
// andar 2 submerso e o andar 9. Escondido lá, o parkour inteiro tinha um bug
// que ninguém conseguia ver lendo o arquivo:
//
// ── O ÍMÃ ────────────────────────────────────────────────────────────────────
//
// O pouso era `if (y <= chao && vy <= 0) y = chao`. Sem nenhuma condição de
// vir DE CIMA. O jogador andava para fora da borda, caía, e no instante em que
// o Z dele entrava na pegada da próxima plataforma era TELETRANSPORTADO para o
// topo dela — de baixo, de lado, de onde estivesse, subindo três metros de
// uma vez. Nenhum pulo era necessário no andar inteiro: bastava andar para a
// frente que a escadaria puxava. O botão PULAR existia de enfeite.
//
// A regra que faltava é uma linha: só pousa quem já estava ACIMA da superfície
// no quadro anterior. É por isso que `chaoSobOsPes` recebe `yAntes` — o chão
// não é "a plataforma mais alta debaixo de mim", é "a superfície mais alta que
// eu ainda alcanço vindo de onde eu estava".
//
// ── O QUE VEM JUNTO ──────────────────────────────────────────────────────────
//
// Consertar o ímã acende dois problemas que ele escondia, e os dois estão
// resolvidos aqui e no gerador:
//   • um vão impossível deixa de ser "difícil" e vira TRAVA (cai, renasce na
//     mesma plataforma, encara o mesmo vão) — o teto físico do `f3Parkour`
//     resolve;
//   • a ponte móvel escorregava por baixo dos pés em vez de carregar quem está
//     em cima — `arrastoDaPonte` resolve.
import type { F3Plat } from './f3Parkour';

/**
 * O piso da cabine do elevador (o `ElevatorInterior` global em z=-13). A piscina
 * de plataformas não cobre a cabine, então sem isto o jogador atravessa o chão
 * ao chegar. O fundo vai até z=-9.0 para encostar na borda de trás do patamar
 * de partida (z=-9.5) e não deixar uma fresta entre os dois.
 */
export const PISO_DO_ELEVADOR = Object.freeze({
    x0: -3.25, x1: 3.25, z0: -16.5, z1: -9.0, topY: 0,
});

/** Quanto o pé pode estar abaixo da superfície e ainda contar como apoiado. */
export const TOLERANCIA_DE_APOIO = 0.12;
/** Folga do teste "eu vinha de cima" — absorve o passo de gravidade do quadro. */
export const TOLERANCIA_DE_POUSO = 0.02;
/**
 * Teto do empurrão lateral que uma ponte dá por quadro. A oscilação real anda
 * no máximo `amp·MOVE_SPEED·dt` ≈ 0,11 m; um valor maior só aparece no primeiro
 * tick de uma ponte recém-gerada, que nasce lá na frente, longe do jogador.
 */
export const PASSO_MAXIMO_DA_PONTE = 0.5;

export interface ChaoDoAndar3 {
    /** Altura da superfície (nível do pé). */
    topY: number;
    /** A plataforma; `null` quando o chão é o piso da cabine do elevador. */
    plat: F3Plat | null;
}

/**
 * A superfície mais alta sob (x, z) em que dá para pousar vindo de `yAntes`.
 *
 * O filtro por `yAntes` É a regra do pouso: uma plataforma acima de onde o
 * jogador estava não é chão dele, é teto. Sem esse filtro, "a mais alta
 * debaixo de mim" puxava o jogador para cima de qualquer plataforma cuja
 * pegada ele cruzasse durante a queda.
 */
export function chaoSobOsPes(
    lista: readonly F3Plat[], x: number, z: number, yAntes: number,
): ChaoDoAndar3 | null {
    const teto = yAntes + TOLERANCIA_DE_POUSO;
    let achado: ChaoDoAndar3 | null = null;
    for (const p of lista) {
        if (x < p.x - p.hw || x > p.x + p.hw) continue;
        if (z < p.cz - p.hd || z > p.cz + p.hd) continue;
        if (p.topY > teto) continue;                         // está acima de mim: é teto, não chão
        if (!achado || p.topY > achado.topY) achado = { topY: p.topY, plat: p };
    }
    const e = PISO_DO_ELEVADOR;
    if (x >= e.x0 && x <= e.x1 && z >= e.z0 && z <= e.z1 && e.topY <= teto) {
        if (!achado || e.topY > achado.topY) achado = { topY: e.topY, plat: null };
    }
    return achado;
}

export interface PassoVertical {
    y: number;
    vy: number;
    /** Este quadro foi o do toque no chão (é aqui que o som de pouso toca). */
    pousou: boolean;
    /** Está apoiado agora (habilita o pulo e a cadência de passos). */
    noChao: boolean;
}

/**
 * Resolve o eixo Y de um quadro: `y`/`vy` já integrados pela gravidade, `yAntes`
 * é onde o pé estava antes da integração, `chao` é o que `chaoSobOsPes`
 * devolveu para esta posição.
 */
export function resolverQueda(
    yAntes: number, y: number, vy: number, chao: ChaoDoAndar3 | null,
): PassoVertical {
    if (chao && vy <= 0 && y <= chao.topY) {
        return { y: chao.topY, vy: 0, pousou: true, noChao: true };
    }
    const noChao = !!chao && Math.abs(y - chao.topY) < TOLERANCIA_DE_APOIO;
    return { y, vy, pousou: false, noChao };
}

/**
 * Quanto o jogador anda de lado junto com a ponte que ele está pisando. Zero
 * para plataforma fixa, para quem está no ar acima dela e para quem só passa
 * por cima — só quem tem o pé apoiado é carregado.
 */
export function arrastoDaPonte(chao: ChaoDoAndar3 | null, y: number): number {
    const p = chao?.plat;
    if (!p || !p.moving) return 0;
    if (Math.abs(y - chao!.topY) > TOLERANCIA_DE_APOIO) return 0;
    return Math.max(-PASSO_MAXIMO_DA_PONTE, Math.min(PASSO_MAXIMO_DA_PONTE, p.dx));
}
