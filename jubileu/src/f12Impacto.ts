/**
 * f12Impacto.ts — o que acontece no instante em que uma coisa acerta outra.
 *
 * ── POR QUE ISTO É UM MÓDULO, E NÃO UM PUNHADO DE EFEITOS SOLTOS ─────────────
 *
 * O andar tinha exatamente dois retornos de acerto: um `flash` que clareava a
 * pele do chefe e um tremor que empurrava o ALVO da câmera com `Math.random()`.
 * Acertar — a coisa que o jogador faz o tempo todo e a única razão de existir da
 * arma — não era um acontecimento. Em jogo publicado, o impacto é onde mora
 * metade da sensação, e ele é feito de camadas que precisam CONCORDAR no tempo:
 * a parada do tempo, o tremor, a faísca e o som saem todos do mesmo instante e
 * decaem em ritmos diferentes.
 *
 * Elas moram juntas aqui porque a coordenação é a coisa fácil de quebrar. Três
 * efeitos espalhados por três componentes viram três relógios, e três relógios
 * viram um impacto borrado — que lê como atraso, não como peso.
 *
 * ── E POR QUE ELE NÃO IMPORTA THREE ──────────────────────────────────────────
 *
 * Pelo mesmo motivo de `f12Boss`: o que é regra tem de ser testável sem uma
 * tela. O tremor tem uma curva, o hitstop tem uma duração, a faísca tem uma
 * vida — e todas as três já são o tipo de coisa que se afina no olho e depois
 * ninguém sabe explicar por que ficou estranho.
 */

// ── O TEMPO PARA, E ESSE É O TRUQUE MAIS BARATO QUE EXISTE ───────────────────
//
// Congelar o jogo por 40-70 ms no instante do acerto é o que faz um golpe ter
// PESO. O ouvido e o olho leem a pausa como resistência: a coisa acertada
// empurrou de volta. Sem isso, o projétil atravessa e a vida desce — informação,
// não sensação.
//
// A regra é que o hitstop escala o relógio do JOGO e não o da APRESENTAÇÃO: o
// tremor, a faísca e o som continuam correndo no tempo real durante a pausa. Se
// eles congelassem junto, não haveria pausa nenhuma — haveria só um soluço.
const stop = { restante: 0, forca: 0 };

/**
 * Segura o tempo do jogo.
 *
 * `forca` é quanto do tempo sobra: 0,05 é quase parado, 0,4 é um arrasto. Um
 * pedido novo só vence o que está correndo se for mais forte — senão um tiro
 * fraco chegando no meio de uma explosão encurtaria a explosão.
 */
export function segurarOTempo(segundos: number, forca = 0.06): void {
    if (segundos <= stop.restante && forca >= stop.forca) return;
    stop.restante = Math.max(stop.restante, segundos);
    stop.forca = Math.min(stop.forca || 1, forca);
}

/** Quanto do tempo real o JOGO recebe neste quadro (0..1). */
export function escalaDoTempo(): number {
    return stop.restante > 0 ? stop.forca : 1;
}

// ── O TREMOR: TRAUMA AO QUADRADO ─────────────────────────────────────────────
//
// O tremor antigo era `alvo.x += (random - 0.5) * s`, com `s` caindo em linha
// reta. Dois defeitos, e os dois se sentem sem se ver:
//
// 1. RUÍDO BRANCO tem energia em toda frequência: a câmera vibra igual a uma
//    tela quebrada, não como uma coisa pesada sendo atingida. Um tremor de
//    verdade tem uma frequência dominante e some.
// 2. DECAIMENTO LINEAR faz o tremor terminar de repente, no meio da amplitude.
//    O olho pega esse corte.
//
// `trauma` acumula e cai em linha reta, mas o deslocamento é `trauma²`. A
// consequência é que o fim é suave por construção (a parábola encosta no zero
// com derivada zero) e o começo é violento — que é exatamente a forma de um
// impacto. O truque é velho e é o certo.
const tremorEstado = { trauma: 0, t: 0 };

/** Acrescenta trauma. Ele satura em 1: dez tiros juntos não vale dez tremores. */
export function tremer(quanto: number): void {
    tremorEstado.trauma = Math.min(1, tremorEstado.trauma + quanto);
}

export const TREMOR = Object.freeze({
    /** Quanto trauma some por segundo. */
    queda: 1.5,
    /** Deslocamento máximo, em unidades de mundo, com trauma cheio. */
    amplitude: 1.05,
    /** Rotação máxima, em radianos. É ela que dá o soco; a posição só apoia. */
    giro: 0.055,
    /** Frequências dos três eixos: primos entre si, para não baterem juntas. */
    hz: Object.freeze([27, 31, 23]),
});

/**
 * O deslocamento do tremor NESTE quadro.
 *
 * Ela só LÊ; quem adianta o relógio é `passoDoImpacto`. A primeira versão deste
 * arquivo adiantava o tempo aqui E lá, e o resultado teria sido um tremor
 * correndo ao dobro da velocidade — com a câmera e o módulo discordando sobre
 * que instante é agora. Um relógio, um dono.
 */
export function deslocamentoDoTremor(): { x: number; y: number; giro: number } {
    const k = tremorEstado.trauma * tremorEstado.trauma;
    if (k <= 0) return { x: 0, y: 0, giro: 0 };
    const t = tremorEstado.t;
    // Senos em vez de `Math.random()`: o ruído branco de antes vibrava em toda
    // frequência e lia como defeito de tela. Três senos incomensuráveis dão um
    // movimento que não repete e tem forma.
    return {
        x: Math.sin(t * TREMOR.hz[0]) * TREMOR.amplitude * k,
        y: Math.sin(t * TREMOR.hz[1] + 1.7) * TREMOR.amplitude * 0.78 * k,
        giro: Math.sin(t * TREMOR.hz[2] + 0.6) * TREMOR.giro * k,
    };
}

export const traumaAgora = (): number => tremorEstado.trauma;

// ── AS FAÍSCAS ───────────────────────────────────────────────────────────────
//
// O acerto acendia a CABEÇA INTEIRA. Isso diz "algo aconteceu" e não diz onde —
// e "onde" é a informação que ensina o jogador a mirar. Uma penca de faíscas
// nascendo no ponto exato do acerto diz as duas coisas de uma vez.
//
// Elas vivem num anel fixo: nada é alocado durante a luta. Um `new` por faísca,
// vezes doze faíscas por acerto, vezes um acerto a cada 0,28 s, é lixo suficiente
// para o coletor aparecer num celular como engasgo — e engasgo num jogo de
// desvio é dano injusto.
export const FAISCAS_MAX = 120;

export interface Faisca {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    vida: number; total: number;
    tamanho: number;
    /** 0 = tiro comum, 1 = carregado, 2 = dano no jogador. */
    tipo: number;
}

const faiscas: Faisca[] = Array.from({ length: FAISCAS_MAX }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, vida: 0, total: 1, tamanho: 1, tipo: 0,
}));
let proxima = 0;

export const todasAsFaiscas = (): ReadonlyArray<Faisca> => faiscas;

/**
 * Espalha faíscas a partir de um ponto.
 *
 * A direção é um cone em torno de +Z (de volta para a câmera) e não uma esfera:
 * o acerto vem de baixo e da frente, então o respingo vai para trás e para os
 * lados. Esfera lê como explosão; cone lê como ricochete.
 */
export function espalharFaiscas(
    x: number, y: number, z: number, quantas: number, forca: number, tipo = 0,
): void {
    for (let i = 0; i < quantas; i++) {
        const f = faiscas[proxima];
        proxima = (proxima + 1) % FAISCAS_MAX;
        const a = (i / quantas) * Math.PI * 2 + Math.random() * 0.6;
        const r = forca * (0.55 + Math.random() * 0.9);
        f.x = x; f.y = y; f.z = z;
        f.vx = Math.cos(a) * r;
        f.vy = Math.sin(a) * r + forca * 0.35;
        f.vz = forca * (0.5 + Math.random() * 1.1);
        f.total = f.vida = 0.28 + Math.random() * 0.34;
        f.tamanho = forca * (0.09 + Math.random() * 0.1);
        f.tipo = tipo;
    }
}

/** A gravidade das faíscas. Elas caem, senão viram confete parado. */
export const FAISCA_GRAVIDADE = 11;

export function passoDasFaiscas(dtReal: number): void {
    for (const f of faiscas) {
        if (f.vida <= 0) continue;
        f.vida -= dtReal;
        f.x += f.vx * dtReal;
        f.y += f.vy * dtReal;
        f.z += f.vz * dtReal;
        f.vy -= FAISCA_GRAVIDADE * dtReal;
    }
}

// ── O RELÓGIO DO HITSTOP ─────────────────────────────────────────────────────

/** Um passo do módulo inteiro, no tempo REAL. Chamar uma vez por quadro. */
export function passoDoImpacto(dtReal: number): void {
    if (stop.restante > 0) {
        stop.restante = Math.max(0, stop.restante - dtReal);
        if (stop.restante === 0) stop.forca = 0;
    }
    tremorEstado.t += dtReal;
    tremorEstado.trauma = Math.max(0, tremorEstado.trauma - TREMOR.queda * dtReal);
    passoDasFaiscas(dtReal);
}

/** Zera tudo. A entrada do andar e o reinício precisam disto. */
export function reiniciarImpacto(): void {
    stop.restante = 0; stop.forca = 0;
    tremorEstado.trauma = 0; tremorEstado.t = 0;
    for (const f of faiscas) f.vida = 0;
    proxima = 0;
}

// ── O ORÇAMENTO DE UM IMPACTO ────────────────────────────────────────────────
//
// Os três tipos de acerto do andar, com os números num lugar só. Eles são
// diferentes de propósito e a diferença é a informação: o jogador tem de SENTIR,
// sem ler o HUD, que o tiro carregado vale cinco tiros comuns.
//
// A regra que governa a tabela é o contraste. Se o tiro comum já sacode a tela,
// não sobra escala para a explosão — e um jogo em que tudo é grande é um jogo em
// que nada é. O tiro comum quase não sacode; ele entrega peso pelas faíscas e
// pela parada curtíssima.
export const IMPACTOS = Object.freeze({
    tiro: Object.freeze({ stop: 0.022, forcaStop: 0.35, trauma: 0.10, faiscas: 5, forca: 5.0 }),
    carregado: Object.freeze({ stop: 0.075, forcaStop: 0.05, trauma: 0.42, faiscas: 18, forca: 9.5 }),
    dano: Object.freeze({ stop: 0.085, forcaStop: 0.08, trauma: 0.60, faiscas: 14, forca: 7.0 }),
    morte: Object.freeze({ stop: 0.22, forcaStop: 0.05, trauma: 1.00, faiscas: 26, forca: 13.0 }),
});

export type TipoDeImpacto = keyof typeof IMPACTOS;

/** Dispara as quatro camadas de um impacto de uma vez, a partir de um ponto. */
export function impacto(tipo: TipoDeImpacto, x: number, y: number, z: number): void {
    const i = IMPACTOS[tipo];
    segurarOTempo(i.stop, i.forcaStop);
    tremer(i.trauma);
    espalharFaiscas(x, y, z, i.faiscas, i.forca, tipo === 'carregado' ? 1 : tipo === 'dano' ? 2 : 0);
}
