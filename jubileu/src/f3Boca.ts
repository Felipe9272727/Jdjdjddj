/**
 * f3Boca.ts — A BOCA DO DIABRETE.
 *
 * ── DE ONDE ISTO VEM ─────────────────────────────────────────────────────────
 *
 * O Felipe mandou uma ficha de personagem: "DIABRETE — pequeno diabo, grandes
 * problemas", com personalidade escrita (Irônico, Travesso, Tagarela,
 * Imprevisível) e um vocabulário de DEZOITO bocas, cada uma com nome. Junto veio
 * o pedido: "talvez vc pudesse fazer uma boca pro diabrete no blender e animar
 * ela".
 *
 * ── POR QUE NÃO É NO BLENDER ─────────────────────────────────────────────────
 *
 * O modelo dele não tem esqueleto nem blend shape — o rig de `diabreteRig.ts` é
 * sintetizado à mão a partir da nuvem de vértices. Pôr boca ali significaria um
 * GLB novo, com malha e texturas novas, num andar de onde acabaram de sair 4,3 MB
 * de download justamente porque a regra do dono é velocidade no celular dele.
 *
 * E a ficha dele já aponta o caminho certo, no próprio título do quadro: "ASSETS
 * DE BOCA (PNG com fundo transparente)". A boca de um desenho de 1930 não é
 * geometria — é um DESENHO chapado na cara, que troca de forma quadro a quadro.
 * Então ela é desenhada aqui, do mesmo jeito que os espinhos, as nuvens e os
 * balões deste andar já são: procedural, zero byte de download, e — o que
 * importa para quem entrega no escuro — TESTÁVEL.
 *
 * ── O QUE É TESTÁVEL AQUI ────────────────────────────────────────────────────
 *
 * Que as dezoito formas da ficha existem e são distintas; que a boca de fala
 * alterna em vez de piscar sempre igual; que a expressão segue o ARCO do andar
 * (`roubados` 0→3, o mesmo que a voz e a trilha já seguem); e que o repouso dele
 * NÃO é neutro — a ficha diz Irônico e Travesso, então parado ele está de sorriso
 * torto, que é metade da personagem.
 */

import { BOIL_HZ } from './f3Tinta';
import type { Voz } from './f3Voz';

export type NomeDaBoca =
    // O ciclo de fala da segunda ficha, F1 a F12, com os nomes dele
    | 'fechadoSarcastico' | 'sorriso' | 'falando1' | 'sorrisoIronico'
    | 'falando2' | 'dentesDebochados' | 'falando3' | 'falando4'
    | 'risadaIronica' | 'falando5' | 'falando6' | 'fechadoSatisfeito'
    // os extras da primeira folha
    | 'neutra' | 'grinhoLateral' | 'deboche' | 'provocando' | 'pensativo'
    // e o arco do andar, que não é de fala
    | 'feliz' | 'empolgado' | 'bravo' | 'irritado' | 'surpreso' | 'assustado'
    | 'triste' | 'desanimado' | 'confuso' | 'zangado';

export interface Ponto { x: number; y: number }

export interface Forma {
    /** Contorno fechado, normalizado em x,y ∈ [-1,1]. Vazio quando é só traço. */
    caminho: Ponto[];
    /** Traço aberto — as bocas que são uma linha só (neutra, sorriso, triste…). */
    traco: Ponto[];
    /** Boca ABERTA se preenche de tinta; fechada se é só linha. */
    cheia: boolean;
    /** Quantos dentes. 0 = sem dentes. */
    dentes: number;
    /** Dentes pontudos (zigue-zague de vilão) em vez de retos. */
    presas: boolean;
    /**
     * Onde a fileira de dentes começa e acaba, em fração da largura.
     *
     * Da segunda ficha: os dentes dele quase nunca atravessam a boca inteira —
     * eles ocupam um PEDAÇO, quase sempre o do lado que sobe (F4, F7, F10, F11).
     * Dente de ponta a ponta lê como dentadura; dente num pedaço só lê como
     * canto da boca levantado.
     */
    dentesDe: number;
    dentesAte: number;
    /**
     * A GOELA: a mancha creme no fundo da boca aberta, entre 0 e 1.
     *
     * É o detalhe que mais aparece nas duas fichas novas (F5, F8, F9, 1D, 2C,
     * 2F) e o que eu não tinha: uma boca aberta dele não é um buraco preto
     * chapado, é um buraco preto com o fundo claro aparecendo embaixo. Sem isso
     * as bocas grandes viravam manchas.
     */
    goela: number;
    /** Língua PARA FORA — a "3F / língua de fora" da ficha. */
    lingua: boolean;
    /**
     * O BICO: -1 afina a ponta esquerda até virar um espeto, +1 a direita.
     *
     * As bocas da ficha nova não são lentes simétricas — quase toda uma delas é
     * uma CUNHA, fina de um lado e cheia do outro (F3, F5, F7, F10). Era isso
     * que fazia as minhas parecerem bocas de boneco: simetria.
     */
    bico: number;
    /** Inclinação em graus. O irônico é TORTO, e é o torto que faz o personagem. */
    inclinacao: number;
}

// ── Ajudantes de traçado ─────────────────────────────────────────────────────
/**
 * O SORRISO TORTO NÃO É UMA DAS BOCAS — É TODAS ELAS.
 *
 * O dono do jogo jogou e disse: "ele tinha que sempre sorrir ironicamente".
 * A primeira leitura seria trocar a tabela de expressões para devolver
 * `sorrisoIronico` em todo canto — e seria errada, porque ele tinha acabado de
 * pedir MAIS expressões, não menos.
 *
 * A leitura certa é que a ironia não é uma expressão, é o TRAÇO. Um sorriso
 * torto não é um sorriso girado: girar mantém a boca simétrica, só inclinada. O
 * que faz o canto da boca subir de um lado só é CISALHAR — somar uma rampa
 * linear ao arco. É o que este `torto` faz, e por isso ele entra em todas as
 * dezoito formas, inclusive na `neutra`: uma reta cisalhada já é um sorrisinho
 * de canto de boca.
 *
 * Assim ele sorri irônico o tempo todo E continua tendo dezoito caras.
 */
// 0,13, e não 0,10: a folha de modelagem dele repete "sorriso torto" como a
// característica da boca, e no close da referência a diferença entre um canto e
// o outro é bem maior do que eu tinha posto. Como o TORTO entra em TODAS as
// bocas, subir aqui deixa o personagem irônico o tempo todo sem precisar de
// forma nova nenhuma.
export const TORTO = 0.13;

/**
 * Arco de parábola de `-1..1`, com flecha `f` (positiva sobe nas pontas) e
 * `torto` erguendo a ponta direita (o canto da boca do sorriso irônico).
 */
function curva(f: number, n = 9, largura = 1, torto = TORTO, bico = 0): Ponto[] {
    const p: Ponto[] = [];
    for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n;
        // O BICO afina uma das pontas: com bico=-1 a esquerda vira espeto e a
        // direita fica cheia, que é o desenho da ficha nova.
        const afina = bico < 0 ? 1 + bico * (1 - u) / 2 : 1 - bico * (1 + u) / 2;
        p.push({ x: u * largura, y: f * (1 - u * u) * afina + torto * u });
    }
    return p;
}
/**
 * ── A BOCA DELE É UM CRESCENTE, NÃO UMA LENTE ────────────────────────────────
 *
 * E isto não é gosto meu — é geometria da cara dele, medida.
 *
 * O dono do jogo disse "a bola preta inteira é o nariz", e com a régua da cara
 * (`bancada-navegador/medir-a-cara.mjs`) a conta fica cruel: o nariz ocupa de
 * 0,083 a 0,244 da altura do rosto, os olhos descem até 0,30, e o queixo está em
 * 0,02. Sobram DEZ PIXELS de cara livre abaixo do nariz, numa cara de 168. Uma
 * boca que não encoste no nariz não cabe ali.
 *
 * Mas cabe do jeito que ele mesmo desenhou na ficha: o sorriso passa POR BAIXO
 * do nariz no meio e SOBE pelos lados, e a bola fica aninhada no berço dele. Nos
 * lados sobra cara de sobra — 155 px de creme na altura do nariz, contra 36 do
 * nariz.
 *
 * Para isso as duas bordas da boca têm que seguir a mesma linha de sorriso —
 * um crescente, tipo banana — e não fazer uma lente simétrica, gorda no meio.
 * É o que `arco` faz: afunda as DUAS bordas no meio. A espessura (`alto` e
 * `baixo`) continua abrindo a boca; o arco decide por onde ela passa.
 */
function lente(largura: number, alto: number, baixo: number, bico = 0, arco = 0, n = 14, torto = TORTO): Ponto[] {
    const cima: Ponto[] = [];
    const baixoP: Ponto[] = [];
    for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n;
        const afina = bico < 0 ? 1 + bico * (1 - u) / 2 : 1 - bico * (1 + u) / 2;
        const berco = -arco * (1 - u * u);          // por onde a boca passa
        const grossa = (1 - u * u) * afina;         // quanto ela abre
        cima.push({ x: u * largura, y: berco + alto * grossa + torto * u });
        baixoP.push({ x: u * largura, y: berco - baixo * grossa + torto * u });
    }
    return [...cima, ...baixoP.reverse()];
}

/**
 * Um construtor por campo nomeado. Com nove parâmetros posicionais a tabela
 * virava uma parede de `true, false, 0, 0` e ninguém lia mais o desenho nela.
 */
const F = (o: Partial<Forma> & Pick<Forma, 'cheia'>): Forma => ({
    caminho: [], traco: [], dentes: 0, presas: false,
    dentesDe: 0, dentesAte: 1, goela: 0, lingua: false, bico: 0, inclinacao: 0, ...o,
});

/**
 * ── AS BOCAS, DA SEGUNDA FICHA DO FELIPE ─────────────────────────────────────
 *
 * Ele mandou duas folhas novas: "Bocas Irônicas — animação de fala, 12 frames
 * (ciclo de fala)", com F1 a F12 nomeados um a um, e uma folha de ciclos
 * (fala irônica sutil de 5, sarcástica de 6, risada maliciosa de 6) mais uma
 * fileira de extras.
 *
 * Três coisas nelas eu não tinha, e são as três que faziam as minhas parecerem
 * bocas de boneco em vez de bocas dele:
 *   1. TODA boca sobe para a direita — o que eu já tinha acabado de acertar por
 *      medição (`TORTO`), e as duas folhas confirmam em vinte e tantos desenhos;
 *   2. quase nenhuma é simétrica: são CUNHAS, espeto de um lado (`bico`);
 *   3. boca aberta tem GOELA — o fundo claro aparecendo por baixo do preto — e
 *      os dentes ocupam um PEDAÇO da largura, não a largura toda.
 *
 * Os nomes de F1..F12 são os dele. Os do arco do andar (`feliz`, `assustado`,
 * `triste`…) continuam, porque são eles que `expressaoDoDiabrete` usa para
 * contar a história dos três pincéis — as folhas novas são de FALA, não de arco.
 */
export const BOCAS: Readonly<Record<NomeDaBoca, Forma>> = Object.freeze({
    // ── O CICLO DE FALA, F1 a F12, na ordem em que ele desenhou ──────────────
    // F1 — fechado (sarcástico)
    fechadoSarcastico: F({ cheia: false, traco: curva(-0.20, 11, 0.60) }),
    // F2 — sorriso de lado
    sorriso:           F({ cheia: false, traco: curva(-0.26, 11, 0.60), inclinacao: -2 }),
    // F3 — falando 1: cunha de espeto à esquerda, cheia à direita
    falando1:          F({ cheia: true, caminho: lente(0.42, 0.10, 0.26, -0.85, 0.187), goela: 0.30 }),
    // F4 — sorriso irônico: fresta longa com fileira de dentes, subindo à direita.
    //
    // ── E ELA ABRIU ──────────────────────────────────────────────────────────
    // Esta é a boca de REPOUSO dele — a que aparece na apresentação e entre as
    // falas, ou seja a que o jogador mais vê. Na lista de defeitos que ele
    // mandou é o nº 8: "a boca não tem o sorriso torto e expressivo
    // característico". Com 0,05 acima e 0,13 abaixo ela lia como um risco fino;
    // no close da referência é um sorriso claramente ABERTO, com a fileira de
    // dentes de um lado só. 0,09 e 0,22, e um pouco mais larga.
    sorrisoIronico:    F({ cheia: true, caminho: lente(0.60, 0.09, 0.22, -0.55, 0.165),
        dentes: 6, dentesDe: 0.34, dentesAte: 0.98 }),
    // F5 — falando 2: boca grande com goela
    falando2:          F({ cheia: true, caminho: lente(0.50, 0.16, 0.34, 0.35, 0.22), goela: 0.52 }),
    // F6 — dentes debochados: sorrisão de dentes quadrados
    dentesDebochados:  F({ cheia: true, caminho: lente(0.62, 0.06, 0.26, -0.35, 0.165),
        dentes: 8, dentesDe: 0.12, dentesAte: 0.96 }),
    // F7 — falando 3: fresta pontuda, dentes só na ponta que sobe
    falando3:          F({ cheia: true, caminho: lente(0.44, 0.14, 0.18, 0.70, 0.187),
        dentes: 3, dentesDe: 0.05, dentesAte: 0.45 }),
    // F8 — falando 4: o oval preto de goela funda
    falando4:          F({ cheia: true, caminho: lente(0.26, 0.30, 0.34, 0, 0.242), goela: 0.46 }),
    // F9 — risada irônica: presas e goela, a boca mais aberta do ciclo
    risadaIronica:     F({ cheia: true, caminho: lente(0.62, 0.10, 0.44, -0.25, 0.22),
        dentes: 7, presas: true, dentesDe: 0.08, dentesAte: 0.94, goela: 0.42 }),
    // F10 — falando 5: triângulo com dentes na metade direita
    falando5:          F({ cheia: true, caminho: lente(0.46, 0.08, 0.22, -0.80, 0.176),
        dentes: 4, dentesDe: 0.40, dentesAte: 0.96 }),
    // F11 — falando 6: aberta média, dentes no canto de cima
    falando6:          F({ cheia: true, caminho: lente(0.44, 0.12, 0.28, -0.30, 0.198),
        dentes: 3, dentesDe: 0.50, dentesAte: 0.98, goela: 0.24 }),
    // F12 — fechado (satisfeito)
    fechadoSatisfeito: F({ cheia: false, traco: curva(-0.24, 11, 0.58), dentes: 3,
        dentesDe: 0.45, dentesAte: 0.95 }),

    // ── OS EXTRAS DA PRIMEIRA FOLHA ──────────────────────────────────────────
    neutra:        F({ cheia: false, traco: curva(0.00, 5, 0.50) }),
    grinhoLateral: F({ cheia: true, caminho: lente(0.50, 0.04, 0.14, -0.60, 0.154),
        dentes: 5, dentesDe: 0.35, dentesAte: 0.98 }),
    deboche:       F({ cheia: true, caminho: lente(0.56, 0.08, 0.26, -0.45, 0.187),
        dentes: 5, dentesDe: 0.20, dentesAte: 0.95, goela: 0.20, inclinacao: -4 }),
    provocando:    F({ cheia: true, caminho: lente(0.46, 0.10, 0.26, -0.30, 0.198),
        lingua: true, goela: 0.18, inclinacao: -3 }),
    pensativo:     F({ cheia: false, traco: curva(-0.06, 5, 0.32), inclinacao: 7 }),

    // ── O ARCO DO ANDAR: as caras que contam a história dos três pincéis ─────
    // Estas não estão nas folhas de FALA porque não são de fala. Ganharam bico e
    // goela junto, para não destoarem do resto.
    feliz:      F({ cheia: true, caminho: lente(0.60, 0.05, 0.36, -0.35, 0.187),
        dentes: 6, dentesDe: 0.10, dentesAte: 0.95, goela: 0.30 }),
    empolgado:  F({ cheia: true, caminho: lente(0.64, 0.07, 0.40, -0.30, 0.209),
        dentes: 7, presas: true, dentesDe: 0.06, dentesAte: 0.96, goela: 0.34 }),
    bravo:      F({ cheia: true, caminho: lente(0.54, 0.24, 0.08, 0.30, 0.143),
        dentes: 5, dentesDe: 0.10, dentesAte: 0.90 }),
    irritado:   F({ cheia: true, caminho: lente(0.48, 0.26, 0.05, 0.45, 0.132),
        dentes: 4, presas: true, dentesDe: 0.10, dentesAte: 0.90, inclinacao: 4 }),
    surpreso:   F({ cheia: true, caminho: lente(0.26, 0.30, 0.30, 0, 0.242), goela: 0.40 }),
    assustado:  F({ cheia: true, caminho: lente(0.30, 0.40, 0.20, 0.20, 0.231),
        dentes: 3, presas: true, dentesDe: 0.15, dentesAte: 0.85, goela: 0.26 }),
    triste:     F({ cheia: false, traco: curva(0.20, 9, 0.48) }),
    desanimado: F({ cheia: false, traco: curva(0.16, 9, 0.50), dentes: 2,
        dentesDe: 0.4, dentesAte: 0.9, inclinacao: -2 }),
    confuso:    F({ cheia: false, traco: curva(0.10, 7, 0.34), inclinacao: -6 }),
    zangado:    F({ cheia: true, caminho: lente(0.56, 0.12, 0.12, -0.20, 0.154),
        dentes: 8, dentesDe: 0.06, dentesAte: 0.96 }),
});

export const NOMES_DAS_BOCAS = Object.keys(BOCAS) as NomeDaBoca[];

/**
 * Quanto a boca ABRE, em altura normalizada. Boca fechada (traço) dá 0.
 *
 * Existe para o teste poder cobrar INTENÇÃO — "a palavra gritada abre mais que
 * as outras" — em vez de fixar o nome da forma. Teste de nome literal já quebrou
 * duas vezes neste arquivo por motivo nenhum: bastou o vocabulário melhorar.
 */
export function aberturaDaBoca(nome: NomeDaBoca): number {
    const f = BOCAS[nome];
    if (!f.cheia || !f.caminho.length) return 0;
    let lo = Infinity, hi = -Infinity;
    for (const p of f.caminho) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
    return hi - lo;
}

// ── O REPOUSO ────────────────────────────────────────────────────────────────
/**
 * A ficha do Felipe diz, em letra grande, Irônico e Travesso. Um personagem
 * assim NÃO fica de boca neutra esperando a vez: ele fica de sorriso torto. Este
 * é o valor mais importante deste arquivo, porque é o que se vê 90% do tempo.
 */
export const BOCA_EM_REPOUSO: NomeDaBoca = 'sorrisoIronico';

// ── A FALA ───────────────────────────────────────────────────────────────────
/**
 * ── A BOCA SE MEXIA MUITO POUCO ──────────────────────────────────────────────
 *
 * O dono do jogo jogou e disse: "percebi que a boca dele se mexe muito pouco".
 * Dava para ver por quê na partitura: a boca trocava UMA VEZ POR NOTA, e uma
 * fala curta tem duas notas (`PISO_DE_BLATS` em `f3Voz`). Ou seja, a fala
 * inteira dele acontecia com dois desenhos de boca. Isso não é boca falando,
 * é boca abrindo e fechando.
 *
 * Desenho animado não faz assim. A boca de um tagarela de 1930 troca a cada
 * QUADRO desenhado, e o quadro deste andar é 8 Hz (`BOCA_HZ`, o mesmo fervilhar
 * dos espinhos e dos balões). Então a nota não escolhe mais A boca: ela escolhe
 * o CICLO, e o quadro dentro da nota escolhe onde no ciclo ela está.
 *
 * O que a nota ainda manda é o TAMANHO — o `acento` (palavra em CAIXA ALTA na
 * fala) troca para o ciclo grande, então ele continua escancarando a boca
 * exatamente onde grita, sem uma segunda fonte de verdade.
 *
 * Os ciclos têm QUATRO passos e nenhum passo repete o vizinho: cada 1/8 de
 * segundo o desenho muda de verdade.
 */
// ── OS CICLOS SÃO DELE, NÃO MEUS ─────────────────────────────────────────────
//
// A segunda ficha não manda só as formas: manda a ORDEM. Ela se chama "animação
// de fala — 12 frames (ciclo de fala)" e numera F1 a F12. A primeira folha traz
// mais três ciclos, com nome e contagem: fala irônica sutil (5), fala sarcástica
// / deboche (6), risada maliciosa / provocação (6).
//
// Eu tinha inventado um ciclo de quatro. O dele tem doze, e é por isso que
// funciona melhor: um ciclo de quatro a 8 Hz se repete duas vezes por segundo e
// o olho pega o padrão; um de doze leva um segundo e meio para voltar, e nesse
// tempo já mudou de palavra.
export const CICLO_FALA: readonly NomeDaBoca[] = Object.freeze([
    'fechadoSarcastico', 'sorriso', 'falando1', 'sorrisoIronico',
    'falando2', 'dentesDebochados', 'falando3', 'falando4',
    'risadaIronica', 'falando5', 'falando6', 'fechadoSatisfeito',
]);

/** Folha 1, quadro 1: "fala irônica (sutil)", 5 frames. O registro de conversa. */
export const CICLO_SUTIL: readonly NomeDaBoca[] = Object.freeze([
    'fechadoSarcastico', 'falando1', 'falando3', 'falando4', 'falando6',
]);

/** Folha 1, quadro 2: "fala sarcástica / deboche", 6 frames. O acento da fala. */
export const CICLO_DEBOCHE: readonly NomeDaBoca[] = Object.freeze([
    'grinhoLateral', 'dentesDebochados', 'risadaIronica',
    'sorrisoIronico', 'falando5', 'falando4',
]);

/** Folha 1, quadro 3: "risada maliciosa / provocação", 6 frames. */
export const CICLO_RISADA: readonly NomeDaBoca[] = Object.freeze([
    'sorriso', 'dentesDebochados', 'risadaIronica',
    'empolgado', 'falando2', 'provocando',
]);

// ── OS VISEMAS: A BOCA ACOMPANHA O QUE ELE DIZ ───────────────────────────────
//
// O ciclo de doze quadros da ficha resolveu "a boca se mexe muito pouco", mas
// ele é CEGO: roda igual dizendo "OLHA O TRAÇO" ou "perna-curta". Desenho
// animado de verdade não faz isso — desde os anos 30 a boca é montada por
// VISEMA, uma forma por som, e é isso que faz parecer que o personagem está
// dizendo aquilo e não mexendo a boca.
//
// A segunda ficha do Felipe já traz as formas com nome de som ("CH", "SH",
// "TH", "LÍNGUA 1", "FECHADA"), então a tabela abaixo é a ficha dele lida como
// alfabeto. As vogais mandam (é o que abre a boca); as consoantes de lábio
// fechado (M, B, P) são as que dão o ESTALO, porque fechar a boca no meio de
// uma frase é o que o olho lê como consoante.
//
// Não há fonética séria aqui e nem precisa haver: a voz dele é um trombone, não
// fala português. O que precisa bater é o RITMO — boca fechando onde a palavra
// fecha.
const VISEMA: Readonly<Record<string, NomeDaBoca>> = Object.freeze({
    a: 'falando2',          // aberta e larga
    á: 'falando2', à: 'falando2', â: 'falando2', ã: 'falando2',
    e: 'dentesDebochados',  // larga, menos aberta — a fileira de dentes aparece
    é: 'dentesDebochados', ê: 'dentesDebochados',
    i: 'sorrisoIronico',    // fresta larga
    í: 'sorrisoIronico',
    o: 'falando4',          // redonda
    ó: 'falando4', ô: 'falando4', õ: 'falando4',
    u: 'falando3',          // redonda e pequena
    ú: 'falando3',
    m: 'fechadoSarcastico', b: 'fechadoSarcastico', p: 'fechadoSarcastico',
    f: 'grinhoLateral', v: 'grinhoLateral',        // dente no lábio
    s: 'falando5', z: 'falando5', c: 'falando5', ç: 'falando5',
    x: 'falando6', j: 'falando6', g: 'falando6',   // o "CH/SH" da ficha
    l: 'provocando', n: 'provocando',              // a "LÍNGUA" da ficha
    r: 'falando1', t: 'falando1', d: 'falando1', h: 'falando1',
    k: 'falando6', q: 'falando6', w: 'falando2', y: 'sorrisoIronico',
});

/** A boca de uma letra. Devolve `null` para o que não é letra (pontuação). */
export function bocaDaLetra(letra: string): NomeDaBoca | null {
    return VISEMA[letra.toLowerCase()] ?? null;
}

/**
 * A sequência de bocas de uma palavra, uma por letra que vale desenho.
 *
 * Letras iguais seguidas viram UMA (ninguém desenha o mesmo quadro duas vezes),
 * e palavra sem letra nenhuma cai no ciclo cego, que continua ali de reserva.
 */
export function visemasDaPalavra(palavra: string): NomeDaBoca[] {
    const fora: NomeDaBoca[] = [];
    for (const ch of palavra) {
        const v = bocaDaLetra(ch);
        if (v && v !== fora[fora.length - 1]) fora.push(v);
    }
    return fora;
}

/**
 * Os visemas da FALA INTEIRA, em fila.
 *
 * A primeira tentativa foi por palavra, e não podia funcionar: as notas do
 * trombone são de 0,1 s e caem a cada 0,075 s, enquanto um quadro desenhado dura
 * 0,125 s — há MENOS quadros do que palavras. Cada palavra ganhava um quadro e
 * as letras dela nunca tocavam em ordem.
 *
 * Quem tem tempo é o BALÃO: três segundos, vinte e quatro quadros. Então a boca
 * soletra a frase inteira ao longo dele, que é o que desenho animado faz — e o
 * que faz parecer que ele está dizendo aquilo, e não mexendo a boca.
 */
export function visemasDaFala(voz: Voz): NomeDaBoca[] {
    const fora: NomeDaBoca[] = [];
    for (const b of voz.blats) {
        for (const v of visemasDaPalavra(b.palavra)) {
            if (v !== fora[fora.length - 1]) fora.push(v);
        }
    }
    return fora;
}

/**
 * Qual boca no quadro `quadroNaNota` da nota `indiceDaNota`.
 *
 * A NOTA escolhe o ciclo — o acento (palavra em CAIXA ALTA na fala) troca o
 * sutil pelo sarcástico, então ele continua escancarando exatamente onde grita.
 * O QUADRO escolhe onde no ciclo. O índice da nota entra como fase, para duas
 * palavras seguidas não começarem no mesmo desenho.
 */
export function bocaDaNota(
    indiceDaNota: number, acento: boolean, quadroNaNota = 0, fila: readonly NomeDaBoca[] = [],
): NomeDaBoca {
    const q = Math.max(0, Math.floor(quadroNaNota));
    // A FALA MANDA, quando há letras: o desenho soletra o que ele diz.
    if (fila.length) {
        const v = fila[q % fila.length];
        // O acento continua ABRINDO: a letra escolhe a forma, o grito escolhe o
        // tamanho. Se a letra caiu numa boca fechada e ele está gritando, a boca
        // abre — ninguém grita de boca fechada.
        if (acento && !BOCAS[v].cheia) return CICLO_DEBOCHE[q % CICLO_DEBOCHE.length];
        return v;
    }
    const ciclo = acento ? CICLO_DEBOCHE : CICLO_FALA;
    const i = Math.floor(indiceDaNota) + q;
    return ciclo[((i % ciclo.length) + ciclo.length) % ciclo.length];
}


/**
 * O vocabulário INTEIRO da ficha, e não um canto dele.
 *
 * O dono do jogo jogou e disse "tem poucas expressões". Estava certo: as
 * dezoito formas existiam e o jogo usava seis. Forma desenhada e nunca usada é
 * conteúdo morto — e este andar tem varredura para essa classe de defeito.
 *
 * Estes são os momentos que faltavam ter cara própria.
 */
export type MomentoExtra =
    | 'ocioso' | 'quaseLaEmCima' | 'perdeuOPrimeiro' | 'perdeuOUltimo'
    | 'tonto' | 'pensando' | 'confuso' | 'vitorioso' | 'derrotado';

// ── A EXPRESSÃO ──────────────────────────────────────────────────────────────
export type MomentoDoDiabrete =
    | 'apresentacao' | 'desenhou' | 'espetou' | 'roubou' | 'provoca' | 'caiu' | 'suplica';

/**
 * TODOS os momentos, numa lista só — os sete do arco e os nove extras.
 *
 * Existe porque a bancada precisava deles para montar a folha de contato das
 * dezesseis caras, e a alternativa era COPIAR a lista lá. Tabela copiada
 * envelhece calada, e neste rosto isso já cobriu caro duas vezes: a folha do
 * rosto montado ficou desenhando um canvas velho, e a trava de URL continuou de
 * pé sem fazer nada depois que a cara mudou de tecnologia.
 */
export const MOMENTOS_DA_CARA: ReadonlyArray<MomentoDoDiabrete | MomentoExtra> = Object.freeze([
    'apresentacao', 'provoca', 'desenhou', 'espetou', 'roubou', 'caiu', 'suplica',
    'ocioso', 'quaseLaEmCima', 'perdeuOPrimeiro', 'perdeuOUltimo',
    'tonto', 'pensando', 'confuso', 'vitorioso', 'derrotado',
]);

/**
 * A cara dele conforme o andar anda. Usa o MESMO `roubados` que o chão
 * (`f3Desenho`), a voz (`f3Voz`) e a trilha (`f3Trilha`) — um número, um dono.
 *
 * O arco é o mesmo dos outros três: dono do lugar → irritado → nervoso →
 * acabado. A ficha dá os nomes; a mecânica dá a hora.
 */
export function expressaoDoDiabrete(
    momento: MomentoDoDiabrete | MomentoExtra, roubados = 0,
): NomeDaBoca {
    const r = Math.max(0, Math.min(3, Math.floor(roubados) || 0));
    switch (momento) {
        // Espetar o jogador é gozação: ele fica FELIZ, e só azeda quando já
        // perdeu ferramenta demais para achar graça.
        case 'espetou': return r === 0 ? 'feliz' : r === 1 ? 'empolgado' : 'irritado';
        case 'caiu':    return r >= 2 ? 'bravo' : 'empolgado';
        case 'desenhou': return r === 0 ? 'deboche' : r === 1 ? 'bravo' : 'irritado';
        case 'provoca':  return r === 0 ? 'sorrisoIronico' : r === 1 ? 'deboche' : 'irritado';
        // Roubar é a perda DELE, e é onde a cara despenca. O primeiro pincel o
        // pega DE SURPRESA — ele não achava que dava para tirar dele.
        case 'roubou':   return r <= 1 ? 'surpreso' : r === 2 ? 'bravo' : 'assustado';
        // Pendurado no abismo, com os três pincéis fora da mão.
        case 'suplica':  return 'assustado';
        case 'apresentacao': return 'sorrisoIronico';

        // ── OS QUE FALTAVAM TER CARA ─────────────────────────────────────
        case 'ocioso':          return 'provocando';    // língua de fora, sem ninguém por perto
        // "ELE TINHA QUE SEMPRE SORRIR IRONICAMENTE", disse o dono do jogo. Os
        // dois momentos em que a cara dele era MORNA — a vantagem confortável
        // (sorriso comum) e o fim de linha (boca neutra) — viraram o sorriso
        // torto. É o que o personagem faria: com vantagem ele debocha, e
        // derrotado ele debocha do próprio fim. As duas formas que saíram daqui
        // continuam desenhadas e continuam aparecendo — vêm pelo RESPIRO
        // (`TEMPERO`), que é onde toda boca tem uma vizinha.
        case 'quaseLaEmCima':   return 'sorrisoIronico';
        case 'perdeuOPrimeiro': return 'zangado';       // dentes trincados
        case 'perdeuOUltimo':   return 'triste';
        case 'tonto':           return 'confuso';
        case 'pensando':        return 'pensativo';
        case 'confuso':         return 'desanimado';
        case 'vitorioso':       return 'empolgado';
        case 'derrotado':       return 'sorrisoIronico'; // sorri até no fim
    }
}

// ── O FERVILHAR ──────────────────────────────────────────────────────────────
/**
 * A boca troca em QUADROS DESENHADOS, não em interpolação. É o mesmo 8 Hz dos
 * espinhos, dos balões e da corrida dele: boca que desliza é interpolação, boca
 * que salta é tinta.
 */
export const BOCA_HZ = BOIL_HZ;
export const quadroDaBoca = (t: number) => Math.floor(t * BOCA_HZ);

// ── O RESPIRO: A BOCA PARADA NÃO FICA PARADA ─────────────────────────────────
/**
 * O dono do jogo disse duas vezes "a boca dele se mexe muito pouco". A primeira
 * causa era o relógio da FALA (ver `bocaNoInstante`: o som dura 0,55 s e o balão
 * três). A segunda é maior e estava escondida atrás dela: **a boca só se mexia
 * enquanto havia balão no ar.** Fora isso — que é quase todo o tempo em que ele
 * aparece — era um desenho congelado na cara.
 *
 * Boca parada em desenho de 1930 não existe. O personagem respira: de tempos em
 * tempos a boca dá um pulinho para a vizinha dela e volta. Dois quadros, um
 * quarto de segundo, e o rosto deixa de ser um adesivo.
 *
 * E o pulo SEMPRE VOLTA para o repouso, que é o sorriso torto — que é a outra
 * coisa que ele pediu, "ele tinha que sempre sorrir ironicamente". O respiro não
 * troca a cara dele, ele reafirma: sorri torto, dá uma risadinha, sorri torto.
 */
export const RESPIRO_S = 1.45;
export const QUADROS_DE_TEMPERO = 2;

/**
 * A vizinha de cada boca — a que o respiro mostra por dois quadros.
 *
 * Não é sorteio: é a forma do MESMO registro. Quem está de sorriso torto dá uma
 * risadinha (`deboche`); quem está de boca aberta fecha um instante; quem está
 * assustado passa por `surpreso`. Assim o respiro nunca contradiz a cena —
 * ninguém sorri no meio de estar pendurado no abismo.
 */
const TEMPERO: Readonly<Record<NomeDaBoca, NomeDaBoca>> = Object.freeze({
    // o ciclo de fala
    fechadoSarcastico: 'sorriso',      sorriso: 'sorrisoIronico',
    falando1: 'falando2',              sorrisoIronico: 'dentesDebochados',
    falando2: 'falando1',              dentesDebochados: 'sorrisoIronico',
    falando3: 'falando6',              falando4: 'falando2',
    risadaIronica: 'dentesDebochados', falando5: 'falando3',
    falando6: 'falando5',              fechadoSatisfeito: 'grinhoLateral',
    // os extras
    neutra: 'fechadoSarcastico',       grinhoLateral: 'fechadoSatisfeito',
    deboche: 'sorrisoIronico',         provocando: 'sorrisoIronico',
    pensativo: 'confuso',
    // o arco do andar
    feliz: 'grinhoLateral',            empolgado: 'risadaIronica',
    bravo: 'irritado',                 irritado: 'zangado',
    surpreso: 'falando4',              assustado: 'surpreso',
    triste: 'neutra',                  desanimado: 'triste',
    confuso: 'pensativo',              zangado: 'bravo',
});

/**
 * A boca no instante `t` quando ele NÃO está falando.
 *
 * `fase` desencontra personagens (ou cenas) que estejam na tela juntos: sem ela,
 * dois Diabretes respirariam no mesmo quadro e o truque apareceria.
 */
export function bocaOciosa(repouso: NomeDaBoca, t: number, fase = 0): NomeDaBoca {
    if (!(t >= 0)) return repouso;
    const dentroDoCiclo = (t + fase * RESPIRO_S) % RESPIRO_S;
    const sobra = RESPIRO_S - dentroDoCiclo;
    return sobra <= QUADROS_DE_TEMPERO / BOCA_HZ ? TEMPERO[repouso] : repouso;
}

// ── A BOCA SEGUE A VOZ ───────────────────────────────────────────────────────
/**
 * Qual boca no instante `t` (segundos desde o começo da fala).
 *
 * Nada aqui inventa ritmo: a partitura de `f3Voz` já decidiu quantas notas a
 * frase tem, quando cada uma cai e quais são acento. A boca só lê a mesma
 * partitura que o trombone — é isso que faz o desenho bater com o som em vez de
 * andar do lado dele.
 *
 * Antes da primeira nota e depois da última, ele volta ao `repouso`, que é a
 * expressão do momento (ver `expressaoDoDiabrete`).
 */
/**
 * Quanto do tempo do balão ele passa de boca mexendo. O resto é o silêncio
 * depois da piada — e é ali que o sorriso torto aparece sozinho, que é a metade
 * da graça do personagem.
 */
export const PARTE_FALANDO = 0.82;

/**
 * Ele está no acento da frase neste instante?
 *
 * Existe para o OLHO poder ler a mesma partitura que a boca (ver `olhoNoGrito`
 * em `f3Olhos`). Sem isto o olho precisaria da própria noção de "grito", e mais
 * cedo ou mais tarde as duas metades do rosto discordariam — que é exatamente o
 * que já acontece com qualquer número que ganha um segundo dono neste andar.
 */
export function gritandoNoInstante(voz: Voz, t: number): boolean {
    for (let k = voz.blats.length - 1; k >= 0; k--) {
        const b = voz.blats[k];
        if (t >= b.t) return t < b.t + b.dur && b.acento;
    }
    return false;
}

export function bocaNoInstante(
    voz: Voz, t: number, repouso: NomeDaBoca, duraNaTela = 0,
): NomeDaBoca {
    const blats = voz.blats;
    if (!blats.length || t < 0 || t < blats[0].t) return repouso;
    const ultimo = blats[blats.length - 1];

    // ── O SOM ACABA MUITO ANTES DO BALÃO ─────────────────────────────────────
    // Aqui estava o defeito de verdade, e ele só apareceu quando o teste
    // imprimiu a partitura: a fala do trombone inteira dura 0,55 s (sete notas
    // de 0,1 s, coladas), e o balão dela fica 3 s no ar. Ou seja, ele mexia a
    // boca por meio segundo e passava os outros dois e meio de cara parada —
    // exatamente o "a boca dele se mexe muito pouco" que o dono do jogo relatou.
    //
    // A voz não pode esticar: o trombone é curto de propósito, é o jeito de
    // 1930 e é ele que faz graça. Quem estica é a BOCA. Ela continua articulando
    // enquanto o balão está no ar (`duraNaTela`), com o mesmo ciclo, só sem
    // escancarar — o acento pertence às notas que existem de fato.
    const fimDoSom = ultimo.t + ultimo.dur;
    const fimDaBoca = Math.max(fimDoSom, duraNaTela * PARTE_FALANDO);
    if (t >= fimDaBoca) return repouso;

    // Qual nota está soando (ou acabou de soar).
    let i = 0;
    for (let k = blats.length - 1; k >= 0; k--) { if (t >= blats[k].t) { i = k; break; } }
    const b = blats[i];

    // ── O RELÓGIO É O DO ANDAR, NÃO O DA NOTA ────────────────────────────────
    // A primeira tentativa contou o quadro DENTRO da nota, e não adiantou nada:
    // as notas do trombone duram menos de 1/8 de segundo, então "o quadro
    // dentro da nota" era sempre zero e a boca continuava trocando uma vez por
    // palavra — o defeito que ele apontou, intacto. (Descoberto pelo teste, que
    // deu conjunto vazio; não por olhar foto.)
    //
    // Quem manda é o fervilhar de 8 Hz do andar inteiro: enquanto ele fala, a
    // boca troca oito vezes por segundo, tenha nota soando ou não. Nos vãos
    // entre palavras ela usa o ciclo normal — só escancara onde de fato grita.
    const gritando = t < b.t + b.dur && b.acento;
    return bocaDaNota(i, gritando, quadroDaBoca(t), visemasDaFala(voz));
}
