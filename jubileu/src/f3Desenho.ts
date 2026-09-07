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
 *   1 roubado  — as SETAS desbotam. Ele parou de indicar o caminho; está com
 *                coisa mais urgente para fazer com os dois pincéis que sobraram.
 *   2 roubados — as setas somem de vez e o TABUADO rareia. O que resta é
 *                esboço: as peças continuam lá, mas o acabamento não.
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

const ETAPAS: readonly Acabamento[] = Object.freeze([
    { seta: 1.00, tabuado: 1.00 },   // 0 roubados — o andar dele, inteiro
    { seta: 0.34, tabuado: 0.78 },   // 1 — as setas desbotam
    { seta: 0.00, tabuado: 0.34 },   // 2 — sem setas, e o tabuado vira esboço
    { seta: 0.00, tabuado: 0.20 },   // 3 — ele já era; fica o osso do desenho
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
