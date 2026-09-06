// ── O CONTROLADOR DE PERSONAGEM DO ANDAR 3 ───────────────────────────────────
//
// Este arquivo já foi só "a regra do pouso". Virou o controlador inteiro porque
// a regra do pouso, sozinha, estava errada de três jeitos — e os três só
// apareceram DEPOIS que o ímã foi embora, porque era ele que os escondia.
//
// ── OS TRÊS BURACOS ──────────────────────────────────────────────────────────
//
// 1. O JOGADOR ERA UM PONTO. `chaoSobOsPes(x, z)` testava uma coordenada. O
//    jogador tem raio (`PR = 0,5`), então ele despencava no instante em que o
//    CENTRO passava da quina, ainda com meio corpo visivelmente em cima da
//    plataforma. Isso não se lê como dificuldade, se lê como defeito.
//
// 2. NÃO EXISTIA COLISÃO LATERAL. Nenhuma. Enquanto o ímã puxava para cima,
//    ninguém percebia: bater na cara de uma plataforma virava "subiu nela".
//    Sem o ímã, bater na cara virava ATRAVESSAR o bloco — o jogador entrava
//    dentro da laje preta e branca e caía por dentro dela. Era o pior dos dois
//    mundos, e é o que o dono do jogo viu.
//
// 3. NÃO HAVIA PERDÃO NENHUM. Sair da borda derrubava no mesmo quadro, e um
//    pulo pedido meio quadro antes de encostar no chão sumia. Um parkour sem
//    coyote time e sem buffer de pulo não é mais difícil: é mais impreciso, e
//    a diferença entre as duas coisas é o jogador saber de quem foi a culpa.
//
// ── A FORMA DO MUNDO ─────────────────────────────────────────────────────────
//
// O jogador é uma CÁPSULA VERTICAL: pé em `y`, cabeça em `y + ALTURA_DO_CORPO`,
// raio `RAIO_DO_CORPO`. Cada plataforma é uma CAIXA: a pegada em XZ mais uma
// faixa em Y que vai de `topY - ESPESSURA` até `topY` — a laje branca (0,5) mais
// a borda de tinta (0,575, com o topo 0,05 abaixo da superfície), que é
// exatamente o que se enxerga em `PlatformView`.
//
// A ordem da resolução é a clássica e não é arbitrária: primeiro empurra em XZ
// (só contra as caixas cuja faixa de Y o corpo realmente cruza), depois integra
// e resolve o Y. Fazer o contrário deixaria o jogador subir paredes.
import type { F3Plat } from './f3Parkour';

/** Raio do corpo. É o mesmo `PR` das paredes — o corpo é um só. */
export const RAIO_DO_CORPO = 0.5;
/** Do pé ao topo da cabeça. O olho fica em 1,6 (`HH` do Player). */
export const ALTURA_DO_CORPO = 1.7;
/**
 * Quanto da laje é sólido, medido para baixo a partir da superfície. A laje
 * branca tem 0,5 e a borda de tinta desce até 0,625; 0,65 cobre as duas com
 * uma folga que não chega a virar parede no ar.
 */
export const ESPESSURA_DA_LAJE = 0.65;
/**
 * Folga acima do pé onde a colisão lateral NÃO vale. Sem ela, quem está em pé
 * numa plataforma seria empurrado para fora dela por ela mesma: o corpo começa
 * exatamente no topo da laje, e "exatamente" é onde erros de ponto flutuante
 * moram.
 */
export const FOLGA_DO_PE = 0.08;

/**
 * ── A BORDA PERDOA, E ISSO É DE PROPÓSITO ────────────────────────────────
 *
 * O apoio usa um raio MENOR que a colisão. O jogador continua de pé com o
 * centro até `RAIO_DE_APOIO` além da quina — meio corpo no ar, como no Mario.
 * Com o raio cheio (0,5) numa plataforma de meia-largura 1,0 dava para ficar
 * pendurado em metade dela, o que passa de generoso a errado.
 */
export const RAIO_DE_APOIO = 0.32;

/** Quanto o pé pode estar abaixo da superfície e ainda contar como apoiado. */
export const TOLERANCIA_DE_APOIO = 0.12;
/** Folga do teste "eu vinha de cima" — absorve o passo de gravidade do quadro. */
export const TOLERANCIA_DE_POUSO = 0.02;
/**
 * Teto do empurrão lateral que uma ponte dá por quadro. A oscilação real anda
 * no máximo `amp·MOVE_SPEED·dt` ≈ 0,11 m; um valor maior só aparece no primeiro
 * tick de uma ponte recém-gerada, que nasce longe do jogador.
 */
export const PASSO_MAXIMO_DA_PONTE = 0.5;

/**
 * ── COYOTE TIME E BUFFER DE PULO ─────────────────────────────────────────
 *
 * Os dois existem porque o jogador e o jogo não concordam sobre quando o pé
 * saiu do chão. O coyote aceita o pulo por um instante depois da borda; o
 * buffer guarda o pulo pedido um instante antes de encostar. Nenhum dos dois
 * deixa pular no ar: os dois só cobrem a fronteira, que é onde a mão erra.
 */
export const COYOTE_S = 0.12;
export const BUFFER_DE_PULO_S = 0.15;

/**
 * O piso da cabine do elevador (o `ElevatorInterior` global em z=-13). A piscina
 * de plataformas não cobre a cabine, então sem isto o jogador atravessa o chão
 * ao chegar. O fundo vai até z=-9.0 para encostar na borda de trás do patamar
 * de partida (z=-9.5) e não deixar uma fresta entre os dois.
 *
 * Ele é APOIO, não caixa: as paredes da cabine já são resolvidas pelo sistema de
 * paredes do Player, e dar lados a ele criaria uma quina invisível na porta.
 */
export const PISO_DO_ELEVADOR = Object.freeze({
    x0: -3.25, x1: 3.25, z0: -16.5, z1: -9.0, topY: 0,
});

export interface ChaoDoAndar3 {
    /** Altura da superfície (nível do pé). */
    topY: number;
    /** A plataforma; `null` quando o chão é o piso da cabine do elevador. */
    plat: F3Plat | null;
}

/** Distância de um ponto ao retângulo, no plano. Zero se estiver dentro. */
function distanciaAoRetangulo(
    x: number, z: number, cx: number, hx: number, cz: number, hz: number,
): number {
    const dx = Math.max(0, Math.abs(x - cx) - hx);
    const dz = Math.max(0, Math.abs(z - cz) - hz);
    return Math.hypot(dx, dz);
}

/**
 * A superfície mais alta sob o jogador em que dá para pousar vindo de `yAntes`.
 *
 * Duas regras moram aqui, e as duas são o conserto de um defeito:
 *
 *   · o filtro por `yAntes` é A REGRA DO POUSO — uma plataforma acima de onde o
 *     jogador estava não é chão dele, é teto. Sem ela, "a mais alta debaixo de
 *     mim" puxava o jogador para cima de qualquer plataforma que ele cruzasse
 *     durante a queda, e o andar inteiro se atravessava andando;
 *   · o `RAIO_DE_APOIO` é O CORPO — quem tem meio pé na quina continua de pé.
 */
export function chaoSobOsPes(
    lista: readonly F3Plat[], x: number, z: number, yAntes: number,
): ChaoDoAndar3 | null {
    const teto = yAntes + TOLERANCIA_DE_POUSO;
    let achado: ChaoDoAndar3 | null = null;
    for (const p of lista) {
        if (p.topY > teto) continue;                      // está acima de mim: é teto, não chão
        if (achado && p.topY <= achado.topY) continue;     // já tenho uma mais alta
        if (distanciaAoRetangulo(x, z, p.x, p.hw, p.cz, p.hd) > RAIO_DE_APOIO) continue;
        achado = { topY: p.topY, plat: p };
    }
    const e = PISO_DO_ELEVADOR;
    if (e.topY <= teto && (!achado || e.topY > achado.topY)) {
        const cx = (e.x0 + e.x1) / 2, hx = (e.x1 - e.x0) / 2;
        const cz = (e.z0 + e.z1) / 2, hz = (e.z1 - e.z0) / 2;
        if (distanciaAoRetangulo(x, z, cx, hx, cz, hz) <= RAIO_DE_APOIO) {
            achado = { topY: e.topY, plat: null };
        }
    }
    return achado;
}

/**
 * Empurra o corpo para FORA das laterais das plataformas que ele está
 * atravessando.
 *
 * Só entram as caixas cuja faixa de Y o corpo realmente cruza — e a faixa do
 * corpo começa em `y + FOLGA_DO_PE`, o que faz a plataforma em que ele está
 * PISANDO ficar de fora por construção. É isso que separa "estou em cima dela"
 * de "estou dentro dela".
 *
 * A saída é pelo eixo de MENOR penetração: é o empurrão mais curto que resolve,
 * e é o que faz raspar numa quina deslizar em vez de agarrar.
 */
export function empurrarDasLaterais(
    lista: readonly F3Plat[], x: number, y: number, z: number,
): { x: number; z: number; bateu: boolean } {
    let nx = x, nz = z;
    let bateu = false;
    const peDoCorpo = y + FOLGA_DO_PE;
    const cabeca = y + ALTURA_DO_CORPO;
    for (const p of lista) {
        const topo = p.topY;
        const fundo = p.topY - ESPESSURA_DA_LAJE;
        if (cabeca <= fundo || peDoCorpo >= topo) continue;   // o corpo não cruza a laje
        const dx = nx - p.x, dz = nz - p.cz;
        const penX = p.hw + RAIO_DO_CORPO - Math.abs(dx);
        const penZ = p.hd + RAIO_DO_CORPO - Math.abs(dz);
        if (penX <= 0 || penZ <= 0) continue;                 // não há sobreposição
        bateu = true;
        if (penX < penZ) nx += dx >= 0 ? penX : -penX;
        else             nz += dz >= 0 ? penZ : -penZ;
    }
    return { x: nx, z: nz, bateu };
}

export interface PassoVertical {
    y: number;
    vy: number;
    /** Este quadro foi o do toque no chão (é aqui que o som de pouso toca). */
    pousou: boolean;
    /** Está apoiado agora (habilita o pulo e a cadência de passos). */
    noChao: boolean;
    /** Velocidade da queda no instante do toque, para a câmera e o agacho. */
    impacto: number;
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
        return { y: chao.topY, vy: 0, pousou: true, noChao: true, impacto: -vy };
    }
    const noChao = !!chao && Math.abs(y - chao.topY) < TOLERANCIA_DE_APOIO;
    return { y, vy, pousou: false, noChao, impacto: 0 };
}

/**
 * A cabeça bate na laje de cima. Sem isto o jogador sobe POR DENTRO de uma
 * plataforma quando pula colado nela — e reaparece em cima, que é o ímã de
 * novo, entrando por outra porta.
 */
export function baterACabeca(
    lista: readonly F3Plat[], x: number, y: number, z: number, vy: number,
): { y: number; vy: number; bateu: boolean } {
    if (vy <= 0) return { y, vy, bateu: false };
    const cabeca = y + ALTURA_DO_CORPO;
    for (const p of lista) {
        const fundo = p.topY - ESPESSURA_DA_LAJE;
        if (cabeca <= fundo || y >= p.topY) continue;
        if (distanciaAoRetangulo(x, z, p.x, p.hw, p.cz, p.hd) >= RAIO_DO_CORPO) continue;
        return { y: fundo - ALTURA_DO_CORPO, vy: 0, bateu: true };
    }
    return { y, vy, bateu: false };
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

// ── A FRONTEIRA DO PULO ──────────────────────────────────────────────────────

export interface RelogiosDoPulo {
    /** Segundos desde que o pé saiu do chão. */
    foraDoChao: number;
    /** Segundos desde que o jogador pediu para pular; Infinity = não pediu. */
    pedidoDePulo: number;
}

export const RELOGIOS_ZERADOS: RelogiosDoPulo = Object.freeze({
    foraDoChao: Infinity, pedidoDePulo: Infinity,
}) as RelogiosDoPulo;

/** Avança os dois relógios um quadro. `pediu` é o botão NESTE quadro. */
export function girarRelogios(
    r: RelogiosDoPulo, dt: number, noChao: boolean, pediu: boolean,
): RelogiosDoPulo {
    return {
        foraDoChao: noChao ? 0 : r.foraDoChao + dt,
        pedidoDePulo: pediu ? 0 : r.pedidoDePulo + dt,
    };
}

/**
 * Pode pular agora? Sim quando existe um pedido recente E um chão recente. O
 * pedido pode ter vindo antes de encostar (buffer) e o chão pode ter ficado
 * para trás há um instante (coyote) — o que não existe é pular sem os dois.
 */
export function podePular(r: RelogiosDoPulo): boolean {
    return r.pedidoDePulo <= BUFFER_DE_PULO_S && r.foraDoChao <= COYOTE_S;
}

/** Consome os dois relógios, para um pedido nunca virar dois pulos. */
export function gastarOPulo(): RelogiosDoPulo {
    return { foraDoChao: Infinity, pedidoDePulo: Infinity };
}

// ── O TRANCO DO POUSO ────────────────────────────────────────────────────────
//
// A câmera e as mãos precisam da MESMA reação ao pouso, com amplitudes
// diferentes. Escrever a mola duas vezes seria garantir que as duas
// divergissem na primeira afinação — e as duas juntas são o que faz uma queda
// parecer uma queda.
//
// A entrada é a velocidade no instante do toque, e ela chega zerada em todo
// quadro que não é o do pouso: isto é um IMPULSO seguido de uma mola, não um
// estado contínuo.

/** Abaixo disto é degrau, não queda. Tremer a tela aqui só cansaria. */
export const PISO_DO_TRANCO = 4;
/** Acima disto o tombo já é "o máximo"; sem teto, a queda no vazio viraria soco. */
export const TETO_DO_TRANCO = 22;

export interface Tranco {
    /** Deslocamento atual. Negativo = afundou. */
    valor: number;
    vel: number;
}

export const TRANCO_PARADO: Tranco = Object.freeze({ valor: 0, vel: 0 }) as Tranco;

export interface AfinacaoDoTranco {
    /** Quanto de velocidade vira impulso. */
    ganho: number;
    /** Rigidez e amortecimento da mola de volta. */
    k: number;
    d: number;
    /** O quanto ele pode afundar, em unidades de mundo. */
    limite: number;
}

export function molaDoTranco(
    t: Tranco, impacto: number, dt: number, a: AfinacaoDoTranco,
): Tranco {
    // Quadro longo não pode virar explosão: a mola é integrada em Euler, e
    // Euler com passo grande e mola dura diverge.
    const passo = Math.min(Math.max(dt, 0), 0.05);
    let vel = t.vel;
    if (impacto > 0) {
        vel -= Math.max(0, Math.min(impacto, TETO_DO_TRANCO) - PISO_DO_TRANCO) * a.ganho;
    }
    vel += (-a.k * t.valor - a.d * vel) * passo;
    const valor = Math.max(-a.limite, Math.min(a.limite, t.valor + vel * passo));
    return { valor, vel };
}

/** Afinações usadas no jogo. Ficam aqui para câmera e mãos não divergirem. */
export const TRANCO_DA_CAMERA: AfinacaoDoTranco = Object.freeze({
    ganho: 0.055, k: 120, d: 17, limite: 0.34,
});
export const TRANCO_DAS_MAOS: AfinacaoDoTranco = Object.freeze({
    ganho: 0.075, k: 110, d: 16, limite: 0.30,
});
