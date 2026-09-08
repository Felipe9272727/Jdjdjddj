/**
 * f3Desenho.ts — QUANTO DO ANDAR AINDA ESTÁ DESENHADO.
 *
 * ── A PREMISSA, FINALMENTE COM CONSEQUÊNCIA ──────────────────────────────────
 *
 * O Diabrete abre o andar dizendo o que ele é: "Essa escadaria maluca é MINHA.
 * Cada plataforma eu que rabisco, no traço!" — e completa com a regra do jogo:
 * "sem os meus PINCÉIS eu não rabisco nada."
 *
 * Isso estava dito e nunca acontecia. Roubar os pincéis mexia num contador, ele
 * ficava tonto três segundos, e o andar seguia exatamente igual — o mesmo
 * tabuado, as mesmas setas, o mesmo acabamento. A frase mais forte do andar não
 * tinha nenhuma consequência no chão em que se pisa.
 *
 * Agora tem. Cada pincel roubado é uma ferramenta a menos na mão de quem mantém
 * o lugar, e o lugar MOSTRA isso:
 *
 *   0 roubados — ele está inteiro no controle. Andar acabado.
 *   1 roubado  — as SETAS desbotam. Ele parou de caprichar no caminho; está com
 *                coisa mais urgente para fazer com os dois pincéis que sobraram.
 *   2 roubados — a seta fica quase só no contorno e o TABUADO rareia. O que
 *                resta é esboço: as peças continuam lá, o acabamento não.
 *   3 roubados — ele cai. Não há mais quem desenhe.
 *
 * ── O QUE ISTO NÃO PODE FAZER ────────────────────────────────────────────────
 *
 * Não pode tirar o CHÃO. A seta é ajuda de leitura, não é a plataforma; o
 * tabuado é acabamento, não é a laje. O curso é sempre para a frente e as peças
 * continuam com a borda de tinta que as recorta contra o céu, então perder seta
 * e tabuado deixa o andar mais cru — que é o ponto — sem deixar ninguém sem
 * saber onde pisar. O teste cobra exatamente isso.
 */

export interface Acabamento {
    /** Opacidade das setas do convés (1 = como sempre foi). */
    seta: number;
    /** Multiplicador da força da linha do tabuado (1 = como sempre foi). */
    tabuado: number;
}

export const PINCEIS_DO_DIABRETE = 3;

// ── A SETA DESBOTA, MAS NUNCA SOME ───────────────────────────────────────────
//
// A tabela levava a seta a 0,00 com dois pincéis, e o Felipe jogou no celular e
// reportou como BUG: "durante a perseguição, quando o player avança de mais, as
// setas começam a sumir". Ele nem ligou o sumiço aos pincéis — para quem joga,
// a indicação de caminho simplesmente parou de funcionar.
//
// E ele está certo dos dois jeitos. Primeiro porque o texto aqui em cima já
// dizia, com todas as letras, que isto não pode "deixar ninguém sem saber onde
// pisar" — e levar a seta a zero é exatamente isso; eu me contradisse na mesma
// página. Segundo porque história que o jogador lê como defeito não é história,
// é defeito.
//
// Então a seta agora só DESBOTA. O andar continua se desmanchando (é o TABUADO
// que rareia de verdade, e ele é acabamento, não é navegação), e a seta fica
// pálida e trêmula — desenho por acabar, não desenho apagado. Quem conta a
// perda é o material; quem garante que dá para jogar é este piso.
const PISO_DA_SETA = 0.38;

// ── E O TABUADO TINHA O MESMO PROBLEMA DA SETA ───────────────────────────────
//
// A seta ganhou piso quando o Felipe reportou o sumiço como bug. O TABUADO
// continuou caindo até 0,20 — e a folha de estados da volta 32 (o andar
// fotografado nos quatro estágios, no tamanho do celular) mostrou o custo: com
// dois pincéis roubados o chão vira uma extensão de papel quase liso, e a seta,
// que é creme sobre branco, some junto no contraste.
//
// Ou seja, os dois defeitos se somam exatamente no ponto em que o jogo fica mais
// difícil: menos pista de profundidade justamente quando é preciso julgar onde a
// laje acaba. A silhueta de tinta continua lá e ninguém cai por isso — mas
// julgar distância num plano branco é pior do que precisa ser.
//
// Então o tabuado também ganha piso. A queda de 1,00 para 0,44 continua sendo
// uma perda enorme e visível (é mais da metade do acabamento indo embora); o que
// ela deixa de ser é a diferença entre um chão cru e um chão que não existe.
const PISO_DO_TABUADO = 0.44;

const ETAPAS: readonly Acabamento[] = Object.freeze([
    { seta: 1.00, tabuado: 1.00 },   // 0 roubados — o andar dele, inteiro
    { seta: 0.62, tabuado: 0.72 },   // 1 — a seta perde tinta
    { seta: 0.45, tabuado: 0.55 },   // 2 — quase só o contorno; o tabuado rareia
    { seta: PISO_DA_SETA, tabuado: PISO_DO_TABUADO },   // 3 — o osso do desenho
]);

/** O acabamento do andar com `roubados` pincéis fora das mãos dele. */
export function acabamentoDoAndar(roubados: number): Acabamento {
    const i = Math.max(0, Math.min(ETAPAS.length - 1, Math.floor(roubados) || 0));
    return ETAPAS[i];
}

/** Mudou o bastante para valer mexer nos materiais? (Evita trabalho por quadro.) */
export function mudouOAcabamento(a: Acabamento, b: Acabamento): boolean {
    return Math.abs(a.seta - b.seta) > 1e-4 || Math.abs(a.tabuado - b.tabuado) > 1e-4;
}

/** Abaixo disto a seta deixa de ser ajuda e vira defeito. Ver o comentário. */
export const SETA_MINIMA = PISO_DA_SETA;
/** E abaixo disto o chão deixa de dar pista de profundidade. */
export const TABUADO_MINIMO = PISO_DO_TABUADO;
