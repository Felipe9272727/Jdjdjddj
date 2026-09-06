// ── O GRADE DO ANDAR 3, NUM LUGAR SÓ ─────────────────────────────────────────
//
// Os números do visual de película do andar. Moram fora do JSX por dois
// motivos, e o segundo é o que dói:
//
//   · são a coisa que mais pede ajuste de GOSTO, e caçá-los espalhados dentro
//     do `<EffectComposer>` do App é o caminho mais curto para ninguém mexer;
//   · o `Floor3Preview` — a tela que eu uso para OLHAR o andar enquanto mexo —
//     tinha uma cópia própria destes valores. Isso significa que a bancada me
//     mostrava um andar que não era o do jogo, e eu decidia visual olhando a
//     coisa errada. Uma bancada que mente é pior que bancada nenhuma.
//
// ── DE ONDE VÊM OS NÚMEROS ───────────────────────────────────────────────────
//
// De olhar as fotos, não de teoria. Com o grade antigo (contraste 0,18, brilho
// +0,02, sépia 0,62) a cena saía ESTOURADA: o andar inteiro é desenhado com
// contorno preto, e num grade lavado o preto vira cinza e a direção de arte
// inteira se perde. E faltava o grão — é ele que separa "película" de "foto
// velha", e é o efeito mais barato da pilha inteira.
export const GRADE_F3 = Object.freeze({
    /** Quase preto e branco, sem chegar a zero. */
    saturacao: -0.62,
    /** Era 0,62 e lavava o creme; a tinta precisa sobrar. */
    sepia: 0.5,
    /** Era +0,02: a cena saía estourada. */
    brilho: -0.06,
    /**
     * Era 0,18 e a tinta virava cinza; 0,42 fez a tinta voltar E colou céu,
     * tabuado e nuvem no mesmo branco. O conserto do meio-tom foi na PALETA da
     * cena (o céu desceu para cinza médio, em Floor3.tsx), não aqui — grade
     * nenhum inventa um valor que a cena não tem.
     */
    contraste: 0.36,
    /** A película. Sem ele é foto velha, não filme. */
    grao: 0.055,
    vinheta: 0.42,
    vinhetaInicio: 0.28,
});
