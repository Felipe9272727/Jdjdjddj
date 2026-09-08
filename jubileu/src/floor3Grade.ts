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
const PADRAO = Object.freeze({
    /**
     * Quase preto e branco, sem chegar a zero. Era -0,62 e, somado ao sépia e ao
     * contraste, matava o meio-tom: a foto do celular dele não tinha CENA, tinha
     * estêncil. -0,42 mantém o filme velho e deixa o cinza existir.
     */
    saturacao: -0.42,
    /** Era 0,62, depois 0,5 — e continuava lavando o creme. */
    sepia: 0.32,
    /** Era +0,02 e a cena saía estourada; -0,06 escurecia demais com o resto. */
    brilho: -0.04,
    /**
     * ── O NÚMERO QUE APAGAVA O ANDAR ────────────────────────────────────────
     *
     * Era 0,18, virou 0,42, depois 0,36 — e o comentário que ficou aqui dizia
     * que o conserto do meio-tom tinha sido feito na PALETA da cena. Não tinha:
     * ele continuava esmagando o meio-tom aqui, e o dono do jogo mandou a foto
     * do celular com "as texturas estão extremamente bugadas". Não eram as
     * texturas.
     *
     * Medido varrendo `?contraste=` e lendo o histograma da imagem inteira
     * (quanto dela cai entre 60 e 200, que é onde céu, nuvem e tabuado moram):
     *
     *     sem película nenhuma ... 58,8% de meio-tom
     *     contraste 0,36 ......... 17,5%   ← e 60% da tela em branco puro
     *     contraste 0,20 ......... 37,1%
     *     contraste 0,10 ......... 50,0%
     *     0,10 + sépia 0,32 + sat -0,42 ... 57,0%
     *
     * Na cutscene do celular dele, com a câmera perto, o mesmo grade dava 1,2%.
     * O andar inteiro era preto e creme, e o Diabrete uma silhueta sem cara —
     * depois de um dia inteiro desenhando a cara dele.
     */
    contraste: 0.10,
    /** A película. Sem ele é foto velha, não filme. */
    grao: 0.055,
    vinheta: 0.42,
    vinhetaInicio: 0.28,
});

/**
 * ── A PELÍCULA ESTAVA APAGANDO O ANDAR ───────────────────────────────────────
 *
 * O dono do jogo mandou foto do celular: "as texturas estão extremamente
 * bugadas". Não eram as texturas — era isto aqui por cima delas.
 *
 * Medido, com `?semgrade` para ver a mesma cena com e sem, e o histograma da
 * imagem inteira como régua (a régua é a imagem toda porque a câmera anda entre
 * execuções e comparar pixel com pixel mente):
 *
 *     SEM película: 42,5% da imagem nos meios-tons (60..200)
 *     COM película:  1,2%      — 48% preto puro, 47% branco puro
 *
 * Ou seja: o andar virava um ESTÊNCIL de duas cores. Céu, nuvem, tabuado e
 * plataforma iam todos para o mesmo creme, e o Diabrete virava uma silhueta
 * preta sem cara — depois de eu passar o dia inteiro desenhando a cara dele.
 *
 * O comentário do `contraste` aqui em cima já dizia que 0,36 "colou céu,
 * tabuado e nuvem no mesmo branco" e dava o conserto por feito na paleta da
 * cena. Não estava: os meios-tons continuavam sendo esmagados aqui.
 *
 * ── POR QUE ISTO TEM URL ─────────────────────────────────────────────────────
 *
 * Porque é a coisa mais de GOSTO do andar inteiro, e porque cada tentativa
 * custava cinco minutos de bancada. Com `?contraste=0.1&sepia=0.3` dá para
 * varrer os valores numa rodada e escolher pelo histograma, não pela memória de
 * como a foto anterior era.
 */
function daUrl(chave: string, padrao: number): number {
    try {
        const v = new URLSearchParams(globalThis.location?.search ?? '').get(chave);
        const n = v === null ? NaN : parseFloat(v);
        return Number.isFinite(n) ? n : padrao;
    } catch { return padrao; }
}

export const GRADE_F3 = Object.freeze({
    saturacao: daUrl('saturacao', PADRAO.saturacao),
    sepia: daUrl('sepia', PADRAO.sepia),
    brilho: daUrl('brilho', PADRAO.brilho),
    contraste: daUrl('contraste', PADRAO.contraste),
    grao: daUrl('grao', PADRAO.grao),
    vinheta: daUrl('vinheta', PADRAO.vinheta),
    vinhetaInicio: daUrl('vinhetaInicio', PADRAO.vinhetaInicio),
});
