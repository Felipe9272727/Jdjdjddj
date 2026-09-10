/**
 * f12Boss.ts — ANDAR 12: "A CABEÇA", a luta aérea contra a cabeça gigante.
 *
 * O elevador vira avião, o jogador sai em terceira pessoa, e o irmão mais velho
 * do TROCO-64 voa de ala. A cabeça abre a boca, cospe um ataque, e fica ABERTA
 * um instante — é essa a janela em que ela pode ser ferida. Fechada, ela é
 * invulnerável. Toda a luta é esse compasso: desvia do que saiu da boca, e
 * enfia tiro na boca antes que ela feche.
 *
 * ── POR QUE ESTE MÓDULO É PURO ───────────────────────────────────────────────
 *
 * Sem `three`, sem `react`. É a mesma escolha do `f5Race` do andar 5, e pelo
 * mesmo motivo prático: um chefe de bullet-hell é uma máquina de padrões, e
 * padrão é a coisa mais fácil de quebrar sem perceber e a mais cara de conferir
 * a olho. Um leque que abre para o lado errado, um teleguiado que nunca perde o
 * alvo, uma vaga que fecha antes de o jogador caber nela — nada disso aparece
 * numa foto, e tudo isso aparece num teste.
 *
 * A cena (`Floor12.tsx` e companhia) só LÊ daqui e desenha.
 */

// ── A ARENA ──────────────────────────────────────────────────────────────────
//
// O combate acontece num plano vertical: o avião anda em X (esquerda/direita) e
// em Y (sobe/desce), e a cabeça está adiante, em -Z. É a caixa de um jogo de
// avião de rolagem, não um espaço livre — e ela é pequena de propósito, porque
// desvio só é desvio quando as bordas existem.
/**
 * A altura em que a cabeça flutua.
 *
 * ── ELA SUBIU DE VEZ, E O MOTIVO FOI MEDIDO ──────────────────────────────────
 *
 * Duas montagens seguidas puseram o avião DENTRO da boca dela, e as duas
 * tinham um comentário explicando que o problema estava resolvido. Projetadas
 * com a câmera de verdade, as contas da montagem anterior diziam:
 *
 *     nave em repouso ....... 48,5% da altura da tela
 *     BOCA .................. 50,7%
 *     vão entre as duas .....  2,2%
 *     arena sobre a cara .... 19,7% da tela
 *
 * Dois por cento de tela entre o jogador e o ponto fraco do chefe. Não havia
 * de onde os ataques virem, não havia distância para lê-los, e o aviãozinho
 * era desenhado por cima do queixo dela. Não era um enquadramento ruim: era o
 * jogo inteiro acontecendo dentro de uma caixa do tamanho de uma boca.
 *
 * A CAUSA ESTAVA NUM TESTE, e é por isso que ela sobreviveu a duas correções:
 * `'a boca fica dentro da arena, para o jogador poder chegar nela'` EXIGIA a
 * sobreposição. E exigia com razão, dado o resto: o tiro saía com `vy = 0`, ou
 * seja voava reto pelo eixo da câmera, então a única forma de acertar a boca
 * era o avião estar na altura dela. A regra do tiro obrigava a composição.
 *
 * Agora o tiro SOBE (ver `nascerTiro`), a boca ficou no alto do quadro e a
 * arena no terço de baixo. O teste que cobrava a sobreposição foi invertido:
 * hoje ele cobra a SEPARAÇÃO.
 */
export const ALTURA_DA_CABECA = 29;

/**
 * A arena.
 *
 * `x` NÃO é congelado, e é o único número deste arquivo que não é: numa tela
 * larga o mesmo enquadramento sobra muita largura, e uma arena fixa viraria
 * uma tirinha no meio do monitor. `ajustarAoAspecto` a alarga uma vez, na
 * entrada do andar. Tudo o mais é escrito EM FUNÇÃO de `ARENA.x` — os leques,
 * as faixas dos elevadores, o passeio da maré — então alargar aqui alarga o
 * andar inteiro junto, e é por isso que alargar aqui é seguro.
 */
export const ARENA = {
    x: 3.7,          // meia-largura (ver `ajustarAoAspecto`)
    yBaixo: 1.4,     // o chão do voo
    yAlto: 9.0,      // o teto do voo — bem ABAIXO do queixo dela
    zNave: 0,        // o plano em que os aviões voam
    zCabeca: -33,    // onde a cabeça flutua
};

/** A meia-largura composta, antes de qualquer alargamento por aspecto. */
export const ARENA_X_COMPOSTA = ARENA.x;

/**
 * ── O ENQUADRAMENTO É UMA COMPOSIÇÃO, NÃO UM PUNHADO DE GOSTOS ───────────────
 *
 * O jogo é jogado num celular EM PÉ: 412 x 915, aspecto 0,45. E `fov`, no
 * three, é VERTICAL — a abertura horizontal sai de `tan(fov/2) * aspecto`, ou
 * seja numa tela em pé ela é menos da metade.
 *
 * Estes números não foram escolhidos no olho. Eles saíram de uma busca contra
 * a câmera de verdade do three, projetando os pontos que importam e cobrando
 * a FRAÇÃO DE TELA de cada um. O que a composição entrega, medido:
 *
 *     nave em repouso ......... 27,6% da altura da tela (terço de baixo)
 *     envergadura da nave ..... 28,6% da largura  (dá para ver o piloto)
 *     arena ................... de 5,9% a 48,3% da altura, 89,9% da largura
 *     BOCA .................... 70,2% da altura   (no alto, longe)
 *     cabeça .................. de 65,2% a 90,3%, 57,5% da largura
 *     vão de tela boca<->nave . 42,6%             (era 2,2%)
 *     sobreposição arena/cara .  0,0%             (era 19,7%)
 *
 * Quarenta e dois por cento de tela entre a boca e o avião é o andar: é a
 * distância que um ataque percorre à vista antes de chegar, e é o que separa
 * "desviei" de "fui atingido por uma coisa que nasceu em cima de mim".
 *
 * ── O VERTICAL NÃO DEPENDE DO ASPECTO ────────────────────────────────────────
 *
 * Vale registrar porque não é óbvio e porque é o que torna este andar portátil:
 * a fração VERTICAL de tela de um ponto depende só do `fov` vertical, de onde a
 * câmera está e para onde ela olha — o aspecto não entra na conta. Então a
 * composição acima é idêntica no celular em pé e num monitor deitado. O que
 * muda com o aspecto é só a largura, e é só ela que `ajustarAoAspecto` mexe.
 */
export const ENQUADRAMENTO = Object.freeze({
    /** O aspecto em que este andar foi composto — a tela do dono do jogo. */
    aspecto: 412 / 915,
    /** `fov` VERTICAL da câmera. */
    fov: 62,
    /** Distância da câmera até o plano dos aviões. */
    recuo: 15.5,
    /** Altura da câmera. Ela fica ACIMA do avião e olha para CIMA, na cabeça. */
    camY: 8.0,
    /** Para onde ela olha (o Z é adiante, entre o avião e o chefe). */
    miraY: 10.5,
    miraZ: -14,
    /**
     * Envergadura DESENHADA do avião do jogador, depois da escala.
     *
     * A primeira conta pôs isto em 2,9 e o piloto virava um borrão; a segunda
     * pôs 3,6, e aí o avião ocupava 35% da largura numa arena de 9,8 — cabiam
     * duas naves e meia na tela inteira, ou seja não havia para onde desviar.
     * 2,35 dá 28,6% da largura: o boneco do andar 5 continua legível na cabine
     * e cabem três naves e meia de folga na arena.
     */
    envergadura: 2.35,
});

/**
 * Alarga a arena quando a tela é mais larga que a que compôs o andar.
 *
 * Chamado uma vez, na entrada do andar. Sem isto, num monitor 16:9 a arena
 * ocupa 22,8% da largura: o jogo inteiro vira uma tirinha vertical no meio de
 * um mar de céu. Com isto ela volta a ocupar a mesma fatia de sempre.
 *
 * O TETO existe porque tudo neste andar é escrito em função de `ARENA.x` — um
 * leque que abre até a borda de uma arena de 15 unidades é um leque que o
 * jogador não atravessa nunca, porque a nave não anda tão depressa assim.
 */
export const ARENA_X_MAXIMA = 6.4;

export function ajustarAoAspecto(aspecto: number): void {
    const quadro = larguraDoQuadro(ENQUADRAMENTO.recuo, aspecto);
    const querida = (quadro * 0.90) / 2;
    ARENA.x = Math.max(ARENA_X_COMPOSTA, Math.min(ARENA_X_MAXIMA, querida));
}

/** Volta a arena à largura composta. Serve ao teste e ao reinício. */
export function reporArena(): void { ARENA.x = ARENA_X_COMPOSTA; }

/** Quantas unidades de mundo cabem na LARGURA da tela, à distância `d`. */
export function larguraDoQuadro(d: number, aspecto = ENQUADRAMENTO.aspecto): number {
    const meiaV = Math.tan((ENQUADRAMENTO.fov * Math.PI) / 180 / 2);
    return 2 * d * meiaV * aspecto;
}

/** Quantas unidades de mundo cabem na ALTURA da tela, à distância `d`. */
export function alturaDoQuadro(d: number): number {
    return 2 * d * Math.tan((ENQUADRAMENTO.fov * Math.PI) / 180 / 2);
}

/**
 * ── A SONDA DE COMPOSIÇÃO ────────────────────────────────────────────────────
 *
 * Onde um ponto do mundo cai na tela, em fração de altura (0 = base, 1 = topo),
 * com a câmera da luta. É a régua com que este andar foi composto, e ela mora
 * aqui — junto dos números — em vez de num script de bancada, por um motivo
 * medido: as duas revisões anteriores mexeram nas alturas "no olho", cada uma
 * escreveu no comentário que o enquadramento estava resolvido, e as duas
 * puseram o avião dentro da boca do chefe. Enquadramento sem régua é opinião.
 *
 * A conta é a projeção de perspectiva na mão: nada de three aqui, porque este
 * módulo não importa three de propósito — é o que permite testá-lo.
 *
 * Note que o ASPECTO NÃO ENTRA. A fração vertical depende só do `fov` vertical,
 * de onde a câmera está e para onde ela olha. É por isso que a composição deste
 * andar é a mesma no celular em pé e no monitor deitado, e é por isso que
 * `ajustarAoAspecto` só precisa mexer na largura.
 */
export function fracaoNaTela(x: number, y: number, z: number): number {
    const E = ENQUADRAMENTO;
    // A câmera está em (0, camY, recuo) e olha para (0, miraY, miraZ). Como os
    // dois estão no plano x = 0, a base da câmera não tem rolagem e o problema
    // cai para duas dimensões: Y e Z.
    const fy = E.miraY - E.camY, fz = E.miraZ - E.recuo;
    const fn = Math.hypot(fy, fz);
    const frenteY = fy / fn, frenteZ = fz / fn;
    // "cima" da câmera é a frente girada 90 graus no plano YZ.
    const cimaY = -frenteZ, cimaZ = frenteY;

    const vy = y - E.camY, vz = z - E.recuo;
    const profundidade = vy * frenteY + vz * frenteZ;   // ao longo da mira
    if (profundidade <= 1e-6) return Number.NaN;        // atrás da câmera
    const altura = vy * cimaY + vz * cimaZ;             // acima do eixo
    const meiaTela = Math.tan((E.fov * Math.PI) / 180 / 2) * profundidade;
    // `x` não muda a fração VERTICAL — ele só afasta o ponto do eixo, e num
    // frustum de perspectiva isso não mexe na altura projetada.
    return 0.5 + altura / (2 * meiaTela);
}

/** Onde as coisas que importam caem na tela. A composição, em números. */
export function composicaoNaTela(): {
    nave: number; arenaBaixo: number; arenaAlto: number;
    boca: number; vaoBocaNave: number;
} {
    const nave = fracaoNaTela(0, meioY(), ARENA.zNave);
    const boca = fracaoNaTela(BOCA_ALVO.x, BOCA_ALVO.y, ARENA.zCabeca);
    return {
        nave,
        arenaBaixo: fracaoNaTela(0, ARENA.yBaixo, ARENA.zNave),
        arenaAlto: fracaoNaTela(0, ARENA.yAlto, ARENA.zNave),
        boca,
        vaoBocaNave: boca - nave,
    };
}

export const meioY = (): number => (ARENA.yBaixo + ARENA.yAlto) / 2;

/** Prende um ponto dentro da arena. */
export function dentroDaArena(x: number, y: number): { x: number; y: number } {
    return {
        x: Math.max(-ARENA.x, Math.min(ARENA.x, x)),
        y: Math.max(ARENA.yBaixo, Math.min(ARENA.yAlto, y)),
    };
}

// ── AS FASES ─────────────────────────────────────────────────────────────────
export type F12Fase =
    | 'intro'        // primeira pessoa no elevador; as portas abrem para o céu
    | 'virando'      // o elevador se desdobra em avião e a câmera sai para trás
    | 'encontro'     // o irmão chega de ala e fala (balões)
    | 'luta'         // a luta, primeira metade
    | 'virada'       // metade da vida: a cabeça se abre e libera mais dois ataques
    | 'vitoria'
    | 'derrota'
    | 'despedida';   // o jogador escolheu o elevador

// ── A CABEÇA ─────────────────────────────────────────────────────────────────
/**
 * A vida da cabeça — e este número saiu de uma SIMULAÇÃO, não do dedo.
 *
 * Com 100 a luta durava 24 segundos e a boca abria cinco vezes: dois dos cinco
 * ataques nunca chegavam a aparecer, porque a virada acontecia antes. Não era
 * um chefe, era uma cutscene com botão. Com 240 ela dura uns 95 s e a boca abre
 * umas vinte vezes — cada padrão aparece quatro ou cinco vezes, que é o mínimo
 * para o jogador APRENDER a luta em vez de só sobreviver a ela.
 *
 * Quem mede isso é `f12Simulacao`, e o teste cobra a faixa.
 */
export const VIDA_MAXIMA = 240;
/** Abaixo disto ela desbloqueia os dois ataques novos. */
export const LIMIAR_DA_VIRADA = VIDA_MAXIMA / 2;

export const VIDAS_DO_JOGADOR = 5;

/**
 * O COMPASSO DA BOCA, em segundos. É o relógio da luta inteira.
 *
 *   fechada  — invulnerável, e é o descanso do jogador
 *   abrindo  — o TELEGRAFO: dá para ver o que vem antes de vir
 *   aberta   — cospe o ataque no início, e fica aberta: é a janela de dano
 *   fechando — a janela se fecha
 *
 * `aberta` é generosa de propósito. Um chefe cuja janela de dano é mais curta
 * que o tempo de reação não é difícil, é injusto — e este andar é o primeiro
 * jogo de nave do hotel, não o último.
 */
export const BOCA = Object.freeze({
    fechada: 1.95,
    abrindo: 0.70,
    aberta: 2.10,
    fechando: 0.45,
});
export const CICLO_DA_BOCA = BOCA.fechada + BOCA.abrindo + BOCA.aberta + BOCA.fechando;

export type EstadoDaBoca = 'fechada' | 'abrindo' | 'aberta' | 'fechando';

export interface BocaAgora {
    estado: EstadoDaBoca;
    /** 0 = fechada, 1 = escancarada. É o que a malha usa. */
    abertura: number;
    /** Segundos dentro do estado atual. */
    t: number;
}

const suave = (k: number) => k * k * (3 - 2 * k);

/** Onde a boca está no instante `t` do ciclo. */
export function bocaNoInstante(t: number): BocaAgora {
    const c = ((t % CICLO_DA_BOCA) + CICLO_DA_BOCA) % CICLO_DA_BOCA;
    if (c < BOCA.fechada) return { estado: 'fechada', abertura: 0, t: c };
    const a = c - BOCA.fechada;
    if (a < BOCA.abrindo) return { estado: 'abrindo', abertura: suave(a / BOCA.abrindo), t: a };
    const b = a - BOCA.abrindo;
    if (b < BOCA.aberta) return { estado: 'aberta', abertura: 1, t: b };
    const f = b - BOCA.aberta;
    return { estado: 'fechando', abertura: 1 - suave(f / BOCA.fechando), t: f };
}

/** A cabeça só pode ser ferida com a boca aberta — é o ponto fraco. */
export const vulneravel = (b: BocaAgora): boolean => b.estado === 'aberta';

// ── OS CINCO ATAQUES ─────────────────────────────────────────────────────────
//
// Cada um é uma referência à lore de um andar, porque é o hotel inteiro que
// está cuspindo pela boca dela.
export type NomeDoAtaque = 'leque' | 'teleguiado' | 'naves' | 'mare' | 'elevadores';

export interface FichaDoAtaque {
    nome: NomeDoAtaque;
    /** O que o HUD anuncia quando a boca abre. */
    grito: string;
    /** De onde a referência vem, para o diálogo do irmão. */
    lore: string;
    /** Só entra depois da virada? */
    depoisDaVirada: boolean;
}

export const ATAQUES: ReadonlyArray<FichaDoAtaque> = Object.freeze([
    {
        nome: 'leque',
        grito: 'OS CINCO ANDARES',
        lore: 'Cinco de uma vez, e vão se abrindo. É assim que o hotel entrega um andar de cada vez.',
        depoisDaVirada: false,
    },
    {
        nome: 'teleguiado',
        grito: 'O FIO VERMELHO',
        lore: 'O fio que arrasta para o 9º o que o Proprietário esquece. Ele não erra — mas cansa.',
        depoisDaVirada: false,
    },
    {
        nome: 'naves',
        grito: 'AS CAMAREIRAS',
        lore: 'Elas ainda arrumam quartos que não existem. Atire, ou elas arrumam você.',
        depoisDaVirada: false,
    },
    {
        nome: 'mare',
        grito: 'A MARÉ DO 2º',
        lore: 'A caverna alagada subiu até aqui. Tem uma fresta na onda — sempre tem.',
        depoisDaVirada: true,
    },
    {
        nome: 'elevadores',
        grito: 'A ESPINHA',
        lore: 'Cabines vazias caindo. O hotel inteiro é um poço, e a gente está dentro dele.',
        depoisDaVirada: true,
    },
]);

export const fichaDoAtaque = (n: NomeDoAtaque): FichaDoAtaque =>
    ATAQUES.find((a) => a.nome === n) ?? ATAQUES[0];

/**
 * Qual ataque cai na `n`-ésima abertura de boca.
 *
 * NÃO é sorteio. Um chefe sorteado é injusto de um jeito que o jogador sente e
 * não consegue nomear: às vezes o mesmo padrão três vezes seguidas, às vezes o
 * combo impossível. Isto é um RODÍZIO — a mesma partida dá a mesma ordem, e o
 * jogador pode aprender a luta, que é a única coisa que torna um chefe justo.
 *
 * Antes da virada rodam os três primeiros. Depois, os cinco — e os dois novos
 * entram logo na virada, para a mudança ser sentida no ato.
 */
export function ataqueDaVez(n: number, depoisDaVirada: boolean): NomeDoAtaque {
    const i = Math.max(0, Math.floor(n));
    if (!depoisDaVirada) return ATAQUES[i % 3].nome;
    // A ordem depois da virada intercala os novos com os velhos, para nenhum
    // par de ataques novos cair colado (dois padrões desconhecidos seguidos é
    // onde um chefe deixa de ensinar e passa a punir).
    const ordem: NomeDoAtaque[] = ['mare', 'leque', 'elevadores', 'teleguiado', 'mare', 'naves', 'elevadores', 'leque'];
    return ordem[i % ordem.length];
}

// ── OS PROJÉTEIS ─────────────────────────────────────────────────────────────
export interface Projetil {
    id: number;
    tipo: NomeDoAtaque | 'tiro';
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    /** Raio de colisão. */
    r: number;
    /** Segundos de vida já corridos. */
    t: number;
    /** De quem é (só para o tiro). */
    de?: 'jogador' | 'irmao';
    /** Vida, para os que morrem de tiro (as naves). */
    hp?: number;
    /** Parâmetro livre por ataque (fase da onda, faixa do elevador, etc). */
    p?: number;
    /** X de repouso, para os que bamboleiam em volta de uma linha. */
    base?: number;
    /**
     * Segundos que o projétil leva para ABRIR da boca até a sua faixa.
     *
     * Só as camareiras usam. Elas saem todas do mesmo ponto — a cavidade — e se
     * espalham enquanto vêm; sem isto elas apareceriam já espalhadas, o que na
     * tela lê como quatro naves que estavam ali o tempo todo em vez de quatro
     * naves que ela acabou de cuspir.
     */
    abre?: number;
}

let proximoId = 1;
export const novoId = (): number => proximoId++;
/** Só para o teste: torna os ids determinísticos. */
export function reiniciarIds(): void { proximoId = 1; }

// ── AS VELOCIDADES FORAM REESCALADAS JUNTO COM A DISTÂNCIA ───────────────────
//
// A cabeça foi de 26 para 33 unidades de distância, e o ponto de saída de
// `zCabeca + 1.2` para `zCabeca + 2.2`: a travessia passou de 24,8 para 30,8
// unidades, 24% mais longa. Mantidas as velocidades antigas, cada ataque
// ganharia 24% a mais de tempo de reação — a luta inteira ficaria mais fácil
// por efeito colateral de uma decisão de ENQUADRAMENTO, o que é a pior forma de
// uma dificuldade mudar, porque ninguém a escolheu.
//
// Então elas foram multiplicadas para preservar o TEMPO DE VOO, que é o número
// que o jogador sente:
//
//     leque        12,0 -> 14,9   (2,07 s, como antes)
//     camareiras    4,3 ->  5,5   (5,60 s)
//     maré          5,8 ->  7,2   (4,28 s)
//     elevadores    5,2 ->  6,46  (4,77 s)
//
// O teleguiado ficou em 8,0: ele não tem tempo de voo fixo — persegue — e o
// combustível dele (7,5 s) é que manda.
//
// ── DE ONDE OS ATAQUES SAEM ──────────────────────────────────────────────────
//
// Da BOCA. Escrito assim parece óbvio, e não era: até esta revisão TODOS os
// cinco padrões nasciam na altura da ARENA — `meioY()`, ou o `y` do jogador —
// e só o Z vinha da cabeça. Com a arena colada na cara dela isso não aparecia
// na foto; com a boca a 42% de tela de distância apareceria na hora, porque os
// projéteis se materializariam no ar, no meio do quadro, sem sair de lugar
// nenhum. A premissa do andar inteiro — "quando ela abre a boca, ela cospe" —
// era encenação e não geometria.
//
// Agora eles saem da cavidade e DESCEM enquanto avançam, e a descida é uma
// conta: `descidaAte` devolve o `vy` que põe o projétil na altura pedida
// exatamente quando ele cruza o plano dos aviões. É o mesmo raciocínio da
// elevação do tiro do jogador, do outro lado da luta.
export const BOCA_SAIDA = Object.freeze({
    x: 0,
    get y() { return BOCA_ALVO.y; },
    /** Um pouco à frente da cara, para o projétil não nascer dentro dela. */
    get z() { return ARENA.zCabeca + 2.2; },
});

/** Segundos que um projétil a `velocidadeZ` leva da boca até o plano dos aviões. */
export function tempoDeVoo(velocidadeZ: number): number {
    return Math.abs(ARENA.zNave - BOCA_SAIDA.z) / velocidadeZ;
}

/** O `vy` que leva de `BOCA_SAIDA.y` até `yAlvo` no tempo de voo. */
export function descidaAte(yAlvo: number, velocidadeZ: number): number {
    return (yAlvo - BOCA_SAIDA.y) / tempoDeVoo(velocidadeZ);
}

// ── ATAQUE 1: O LEQUE ────────────────────────────────────────────────────────
//
// Cinco projéteis que nascem GRUDADOS, como o Felipe desenhou:
//
//     _ _ _ _ _
//
// e vão se abrindo enquanto vêm. A abertura é o que dá o desvio: no começo é
// uma parede, no fim são cinco colunas com vão entre elas. O jogador não foge
// da parede — ele espera ela virar vão.
export const LEQUE = Object.freeze({
    quantos: 5,
    /** Meia-largura no nascimento: bem juntinhos. */
    largura0: 0.55,
    /**
     * Quanto cada unidade se afasta por segundo (a de fora anda mais).
     *
     * ESTE NÚMERO É O ATAQUE, e ele tem uma amarra que não é nada óbvia. As
     * cinco unidades ficam em `lado * fora` com `lado` em -1, -0,5, 0, +0,5, +1,
     * então o VÃO ENTRE VIZINHAS é exatamente metade do que a de fora andou.
     * Ou seja "abrir o suficiente para a nave passar" e "não sair da arena" são
     * a MESMA conta, e ela é apertada:
     *
     *     vão preciso = 2 * (NAVE.raio + LEQUE.raio) = 2 * (0,42 + 0,36) = 1,56
     *     logo o de fora precisa de >= 3,12
     *     e a arena (3,7) é o teto, senão dá para contornar por fora
     *
     * Com o tempo de voo de hoje (30,8 unidades a 14,9/s = 2,07 s) isto põe o
     * de fora em 3,30 e o vão em 1,65 — 15% de folga sobre o mínimo, e
     * encostando na borda da arena (89% dela). Foi um teste que pegou a
     * versão indesviável da primeira montagem; a foto de um leque aberto
     * pareceria certa.
     */
    abrePorSegundo: 1.33,
    velocidadeZ: 14.9,
    raio: 0.36,
});

/**
 * Nasce na BOCA, grudado, e vai se abrindo enquanto desce até o jogador.
 *
 * `alvoX`/`alvoY` é onde o jogador estava quando ela cuspiu: o leque é mirado,
 * então ficar parado não salva. O que salva é ler qual vão vai passar por você.
 */
export function nascerLeque(alvoX: number, alvoY: number): Projetil[] {
    const fora: Projetil[] = [];
    const meio = (LEQUE.quantos - 1) / 2;
    const t = tempoDeVoo(LEQUE.velocidadeZ);
    const derivaX = (alvoX - BOCA_SAIDA.x) / t;
    const vy = descidaAte(alvoY, LEQUE.velocidadeZ);
    for (let i = 0; i < LEQUE.quantos; i++) {
        const lado = (i - meio) / meio;               // -1 .. +1
        fora.push({
            id: novoId(), tipo: 'leque',
            x: BOCA_SAIDA.x + lado * LEQUE.largura0, y: BOCA_SAIDA.y, z: BOCA_SAIDA.z,
            vx: lado * LEQUE.abrePorSegundo + derivaX, vy, vz: LEQUE.velocidadeZ,
            r: LEQUE.raio, t: 0, p: lado,
        });
    }
    return fora;
}

// ── ATAQUE 2: O TELEGUIADO (o fio vermelho) ──────────────────────────────────
//
// Um míssil só, que persegue. Ele NÃO pode ser perfeito: um teleguiado que
// corrige sem limite não é um desafio, é uma sentença. O que o torna
// despistável é o raio de curva — ele vira devagar, então quem passa perto e
// vira na hora certa faz ele desperdiçar a curva e sair longo.
export const TELEGUIADO = Object.freeze({
    velocidade: 8.0,
    /** Radianos por segundo de correção. Este número É a dificuldade. */
    curvaPorSegundo: 1.45,
    raio: 0.42,
    /** Depois disto ele desiste e segue reto (senão ele orbita para sempre). */
    combustivel: 7.5,
});

/**
 * Ele sai da BOCA já mergulhando.
 *
 * O `vy` inicial não é enfeite: `guiarTeleguiado` gira a velocidade LATERAL
 * existente, e um míssil nascido com `vx = vy = 0` não tem direção lateral
 * nenhuma para girar — `atan2(0, 0)` é zero, ou seja ele começaria apontado
 * para a DIREITA por acidente de aritmética e só depois se corrigiria. Nascendo
 * com a proa para baixo, ele sai da cara dela em direção ao jogador desde o
 * primeiro quadro, que é o que o ataque tem de mostrar.
 */
export function nascerTeleguiado(): Projetil {
    return {
        id: novoId(), tipo: 'teleguiado',
        x: BOCA_SAIDA.x, y: BOCA_SAIDA.y, z: BOCA_SAIDA.z,
        vx: 0, vy: -TELEGUIADO.velocidade * 0.55, vz: TELEGUIADO.velocidade,
        r: TELEGUIADO.raio, t: 0,
    };
}

/**
 * Vira o míssil na direção do alvo, no máximo `curvaPorSegundo`.
 *
 * O ângulo é medido no plano X/Y visto de frente — que é o plano em que o avião
 * anda. O Z dele é sempre para a frente: ele não recua, então ou acerta ou passa
 * batido, e passar batido é o que "despistar" quer dizer.
 */
export function guiarTeleguiado(m: Projetil, alvoX: number, alvoY: number, dt: number): void {
    if (m.t >= TELEGUIADO.combustivel) return;            // sem combustível, segue reto
    const dx = alvoX - m.x, dy = alvoY - m.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return;
    const desejado = Math.atan2(dy, dx);
    const atual = Math.atan2(m.vy, m.vx);
    // diferença no intervalo (-π, π]
    let d = desejado - atual;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const maxima = TELEGUIADO.curvaPorSegundo * dt;
    const giro = Math.max(-maxima, Math.min(maxima, d));
    const novo = atual + giro;
    // A velocidade LATERAL é o que gira; o avanço em Z é constante.
    const lateral = Math.hypot(m.vx, m.vy) || TELEGUIADO.velocidade * 0.55;
    m.vx = Math.cos(novo) * lateral;
    m.vy = Math.sin(novo) * lateral;
}

// ── ATAQUE 3: AS CAMAREIRAS (mini naves) ─────────────────────────────────────
//
// Aliadas da cabeça. Diferente dos outros ataques: elas MORREM DE TIRO, então
// este é o único padrão em que o jogador resolve atirando em vez de desviando —
// e é onde o irmão de ala mais serve, porque duas armas limpam a tela.
export const NAVES = Object.freeze({
    quantas: 4,
    /**
     * Subiu de 4,3 porque a cabeça ficou 9 unidades mais longe: no valor antigo
     * a travessia levava 8,2 s e as camareiras viravam decoração parada no
     * meio da tela. A 5,5 ela leva 6,4 s, que é o mesmo tempo de antes.
     */
    velocidadeZ: 5.5,
    /** Bamboleio lateral, para elas não virem em linha reta. */
    ondaAmp: 1.6,
    ondaHz: 0.55,
    raio: 0.55,
    hp: 2,
});

/**
 * Elas saem da boca em leque e DESCEM até a altura do voo, cada uma para a sua
 * faixa. O `base` (a linha em torno da qual a camareira bamboleia) continua
 * sendo o dono do X — ver a nota em `passoDoProjetil`.
 */
export function nascerNaves(): Projetil[] {
    const fora: Projetil[] = [];
    const t = tempoDeVoo(NAVES.velocidadeZ);
    for (let i = 0; i < NAVES.quantas; i++) {
        const lado = (i / (NAVES.quantas - 1)) * 2 - 1;      // -1 .. +1
        const base = lado * ARENA.x * 0.7;
        const chegada = meioY() + (i % 2 ? 1.6 : -1.6);
        fora.push({
            id: novoId(), tipo: 'naves', base,
            // Elas nascem juntas na boca e ABREM para as faixas enquanto vêm: o
            // `base` interpola de 0 até a faixa no próprio `passoDoProjetil`,
            // então aqui só o ponto de partida é a boca.
            x: BOCA_SAIDA.x,
            y: BOCA_SAIDA.y,
            z: BOCA_SAIDA.z,
            vx: 0, vy: descidaAte(chegada, NAVES.velocidadeZ), vz: NAVES.velocidadeZ,
            r: NAVES.raio, t: 0, hp: NAVES.hp, p: i * 0.7,
            abre: t,
        });
    }
    return fora;
}

// ── ATAQUE 4: A MARÉ DO 2º ───────────────────────────────────────────────────
//
// Uma onda que atravessa a arena com UMA FRESTA. Ela não é um projétil: é uma
// parede que anda, e o jogador tem de estar na fresta quando ela chegar. A
// fresta se move num seno lento, então o desvio é de posicionamento e não de
// reflexo — que é o contraste com o leque e o teleguiado.
export const MARE = Object.freeze({
    velocidadeZ: 7.2,
    /** Meia-largura da fresta. Cabe um avião com folga, e é isso mesmo. */
    fresta: 1.85,
    /**
     * A fresta passeia por X neste seno.
     *
     * O teto é `ARENA.x - fresta` (1,85 com os números de hoje): passar disso
     * põe a saída FORA da arena, e o ataque vira indesviável sem aviso nenhum —
     * a onda chegaria com a única passagem num lugar onde o avião não pode
     * estar. É por isso que o teste cobra esta relação e não o número solto.
     *
     * Este par já estourou uma vez, na revisão que estreitou a arena de 4,9
     * para 3,7: 2,75 + 2,05 dava 4,80 numa arena de 3,7, ou seja a fresta
     * passeava quase uma unidade e meia para fora do mundo jogável. O teste
     * pegou; a foto de uma onda com uma fresta pareceria certa.
     */
    passeioAmp: 1.7,
    passeioHz: 0.24,
    raio: 0.9,          // espessura da onda, para a colisão em Z
});

/**
 * A parede desce da boca até a altura do voo.
 *
 * O `y` dela não entra em `mareAcerta` — uma onda que atravessa a arena inteira
 * pega quem não está na fresta, seja qual for a altura. Ele existe para o
 * DESENHO: sem descer, a onda apareceria de repente na frente do jogador em vez
 * de ser vista saindo da boca dela, que é o aviso do ataque.
 */
export function nascerMare(faseDoPasseio: number): Projetil {
    return {
        id: novoId(), tipo: 'mare',
        x: 0, y: BOCA_SAIDA.y, z: BOCA_SAIDA.z,
        vx: 0, vy: descidaAte(meioY(), MARE.velocidadeZ), vz: MARE.velocidadeZ,
        r: MARE.raio, t: 0, p: faseDoPasseio,
    };
}

/** Onde o centro da fresta está, para esta onda, neste instante. */
export function frestaDaMare(m: Projetil): number {
    return Math.sin((m.p ?? 0) + m.t * MARE.passeioHz * Math.PI * 2) * MARE.passeioAmp;
}

/** A onda pegou quem está em `x`? (fora da fresta = pegou) */
export function mareAcerta(m: Projetil, x: number): boolean {
    return Math.abs(x - frestaDaMare(m)) > MARE.fresta;
}

// ── ATAQUE 5: A ESPINHA (cabines de elevador caindo) ─────────────────────────
//
// Colunas que descem em faixas fixas de X, com uma faixa VAZIA. É o inverso da
// maré: lá o jogador procura uma fresta que passeia, aqui ele procura a coluna
// que não veio. E é vertical, então mexe o eixo que os outros quatro quase não
// pedem.
export const ELEVADORES = Object.freeze({
    /**
     * QUATRO, e não cinco.
     *
     * Com a arena em 3,7 as cinco faixas ficavam a 1,52 uma da outra, e a nave
     * mais a cabine pedem 2 * (0,36 + 0,62) = 1,96 para passar entre duas. Ou
     * seja: a espinha ficaria indesviável POR DENTRO, e a única saída seria a
     * faixa vazia estar bem onde o jogador já está. Com quatro faixas o vão dá
     * 2,34 — 19% de folga — e o ataque continua sendo "ache a coluna que não
     * veio", que é o desenho dele.
     */
    faixas: 4,
    velocidadeZ: 6.46,
    /**
     * Quanto cada cabine desce por segundo enquanto avança.
     *
     * Sai de uma conta, não do olho: elas nascem na altura da BOCA e têm de
     * chegar ao meio da arena quando cruzam o plano dos aviões. A cabeça subiu
     * 21 unidades nesta revisão, então o 2,4 de antes as faria chegar bem acima
     * do jogador — cairiam a fase inteira sem nunca ameaçar ninguém.
     */
    get quedaPorSegundo() { return -descidaAte(meioY(), ELEVADORES.velocidadeZ); },
    raio: 0.62,
});

export const xDaFaixa = (i: number): number =>
    (-1 + (2 * i) / (ELEVADORES.faixas - 1)) * ARENA.x * 0.95;

export function nascerElevadores(faixaVazia: number): Projetil[] {
    const vazia = ((Math.floor(faixaVazia) % ELEVADORES.faixas) + ELEVADORES.faixas) % ELEVADORES.faixas;
    const fora: Projetil[] = [];
    for (let i = 0; i < ELEVADORES.faixas; i++) {
        if (i === vazia) continue;
        fora.push({
            id: novoId(), tipo: 'elevadores',
            x: xDaFaixa(i), y: BOCA_SAIDA.y, z: BOCA_SAIDA.z,
            vx: 0, vy: -ELEVADORES.quedaPorSegundo, vz: ELEVADORES.velocidadeZ,
            r: ELEVADORES.raio, t: 0, p: i,
        });
    }
    return fora;
}

// ── QUEM MOVE OS PROJÉTEIS ───────────────────────────────────────────────────
//
// TODO movimento mora aqui, e não na cena. A primeira versão deixou o bamboleio
// das camareiras no componente que desenha — e eu escrevi um comentário
// explicando que "a colisão usa o x reto, é só visual". Isso é um defeito com
// justificativa: a nave que o jogador VÊ não seria a que o jogo TESTA, e o
// jogador levaria dano de uma coisa que estava noventa centímetros ao lado.
// Um dono do movimento, e o desenho só lê.
export function passoDoProjetil(
    p: Projetil, alvoX: number, alvoY: number, dt: number,
): void {
    const d = Math.min(dt, 0.05);
    if (p.tipo === 'teleguiado') guiarTeleguiado(p, alvoX, alvoY, d);
    p.t += d;
    p.z += p.vz * d;
    p.y += p.vy * d;
    if (p.base !== undefined) {
        // O bamboleio É a posição, não um enfeite por cima dela. E `vx` sai da
        // diferença, para quem desenha poder inclinar a nave pela velocidade
        // REAL em vez de recalcular um seno paralelo que discordaria dela.
        //
        // `abre` faz a linha de repouso sair da BOCA e caminhar até a faixa: as
        // quatro camareiras nascem no mesmo ponto e se espalham enquanto vêm.
        // A conta mora AQUI, junto do resto do movimento, e não no componente
        // que desenha — este arquivo já pagou uma vez por um bamboleio que
        // morava no desenho, e o dano vinha noventa centímetros ao lado do que
        // o jogador via.
        const antes = p.x;
        const linha = p.abre && p.abre > 0
            ? BOCA_SAIDA.x + (p.base - BOCA_SAIDA.x) * Math.min(1, p.t / p.abre)
            : p.base;
        const espalhou = p.abre && p.abre > 0 ? Math.min(1, p.t / p.abre) : 1;
        p.x = linha + Math.sin(p.t * NAVES.ondaHz * Math.PI * 2 + (p.p ?? 0)) * NAVES.ondaAmp * espalhou;
        p.vx = d > 0 ? (p.x - antes) / d : 0;
    } else {
        p.x += p.vx * d;
    }
}

/**
 * O projétil já passou do jogador e pode ser recolhido?
 *
 * ── O TETO ERA A ARENA, E OS ATAQUES PASSARAM A NASCER ACIMA DELE ───────────
 *
 * O limite de cima era `ARENA.yAlto + 14` — 23 com os números antigos, uma
 * folga generosa quando tudo nascia na altura do voo. Com os ataques saindo da
 * BOCA, a 24,2, todos eles passaram a nascer JÁ FORA DE CENA: eram criados e
 * recolhidos no mesmo quadro. A luta ficou literalmente sem ataque nenhum, e o
 * jeito como isso apareceu foi o bot da simulação vencer sem desviar de nada e
 * sem levar um toque sequer — que é exatamente para isso que a simulação existe.
 *
 * O teto agora é a BOCA, que é de onde as coisas saem, e não a arena, que é
 * onde elas chegam.
 */
export function saiuDeCena(p: Projetil): boolean {
    if (p.tipo === 'tiro') return p.z < ARENA.zCabeca - 3;
    if (p.z > ARENA.zNave + 14) return true;
    if (p.y < ARENA.yBaixo - 8 || p.y > BOCA_SAIDA.y + 6) return true;
    return Math.abs(p.x) > ARENA.x + 16;
}

// ── O TIRO DO JOGADOR ────────────────────────────────────────────────────────
export const TIRO = Object.freeze({
    velocidade: 34,
    raio: 0.36,
    /** Segundos entre tiros. */
    cadencia: 0.16,
    dano: 1.0,
    /** O irmão atira mais devagar e mais fraco: ele é ala, não protagonista. */
    cadenciaIrmao: 0.34,
    danoIrmao: 0.6,
});

/**
 * ── O TIRO SAI DA PONTA DA ASA, E ISSO NÃO É ENFEITE ─────────────────────────
 *
 * A primeira versão nascia no CENTRO da nave e voava reto pelo eixo da câmera.
 * Contadas na página, as balas existiam — quatro em voo — e mesmo assim não
 * apareciam em foto nenhuma: de trás, uma bala que sai do meio do avião e se
 * afasta pelo eixo fica ESCONDIDA ATRÁS DO PRÓPRIO AVIÃO e depois vira um ponto
 * no ponto de fuga. Saindo das pontas, as balas formam dois rastros paralelos
 * de cada lado da fuselagem — é por isso que todo jogo de nave em terceira
 * pessoa atira das asas: leitura, não realismo.
 *
 * ── E AGORA ELE SOBE, QUE É O QUE DESTRAVOU O ANDAR ──────────────────────────
 *
 * O tiro saía com `vy = 0`. Parece um detalhe e era a amarra que segurava a
 * composição inteira: uma bala que voa reto pelo eixo só acerta a boca se o
 * AVIÃO estiver na altura da boca. Ou seja, a regra do tiro obrigava o jogador
 * a voar dentro da cara do chefe, e foi por isso que duas montagens seguidas
 * puseram a arena em cima do queixo dela — havia até um teste EXIGINDO isso.
 *
 * A elevação resolve pelo lado certo. As armas do avião apontam para o alto: a
 * bala nasce na ponta da asa e sobe o quanto for preciso para cruzar o plano da
 * cabeça na altura da boca. O jogador não mira mais em Y.
 *
 * O QUE ELE MIRA É X, e isso é de propósito. `vx` é ZERO: a bala guarda o X de
 * onde saiu. Para machucar, o avião tem de estar alinhado com a boca — que fica
 * no meio da arena, que é justamente o lugar mais perigoso para ficar parado.
 * A luta passa a ser "volto ao meio para atirar, saio do meio para desviar", e
 * essa troca é o andar. Se a bala também se corrigisse em X, todo tiro acertaria
 * e a mira sairia do jogo.
 */
/**
 * Onde, na largura do avião, a bala nasce.
 *
 * SAI DA ENVERGADURA, e não de um número solto. Estava em 1,35 num avião cuja
 * meia-envergadura desenhada é 1,175: as balas nasciam FORA das asas, no ar, a
 * 17 centímetros da ponta. É a mesma classe de defeito que pôs o anel de mira
 * em cima do nariz do chefe — desenho e regra saindo de dois números que
 * ninguém prometeu manter iguais. 0,90 da meia-envergadura põe a bala em cima
 * da luz de navegação da ponta, que é onde o desenho diz que a arma está.
 */
export const PONTA_DA_ASA = (ENQUADRAMENTO.envergadura / 2) * 0.90;

/** Onde a bala nasce em Z, à frente da nave. */
export const TIRO_Z0 = ARENA.zNave - 0.6;

/**
 * Quanto a bala sobe por segundo para cruzar o plano da cabeça na altura da
 * boca, saindo de `y`. É a elevação da arma, e ela é uma conta — não um número
 * escolhido —, senão a bala e o alvo discordam e o jogador não descobre por quê.
 */
export function subidaDoTiro(y: number): number {
    const tempo = Math.abs(ARENA.zCabeca - TIRO_Z0) / TIRO.velocidade;
    return (BOCA_ALVO.y - y) / tempo;
}

export function nascerTiro(
    x: number, y: number, de: 'jogador' | 'irmao', lado: -1 | 1 = 1,
): Projetil {
    const y0 = y - 0.12;
    return {
        id: novoId(), tipo: 'tiro',
        x: x + lado * PONTA_DA_ASA * (de === 'irmao' ? 0.7 : 1), y: y0,
        z: TIRO_Z0,
        vx: 0, vy: subidaDoTiro(y0), vz: -TIRO.velocidade,
        r: TIRO.raio, t: 0, de, p: lado,
    };
}

// ── A NAVE ───────────────────────────────────────────────────────────────────
//
// ── POR QUE ELA DEIXOU DE TER ACELERAÇÃO ─────────────────────────────────────
//
// A primeira versão era aceleração + atrito, como um carro. Estava errada de
// duas maneiras, e as duas se provam com uma conta:
//
//   1. A velocidade terminal de um modelo assim é `aceleracao / atrito` — aqui,
//      46 / 7,2 = 6,39. O teto declarado era 11,5. Ou seja: o teto NUNCA era
//      alcançado, e metade do número existia só para enganar quem lesse.
//   2. A 6,39 u/s, atravessar a arena (9,8 de largura) leva 1,53 s. O leque
//      atravessa a arena em ~1,6 s. Não dava tempo de sair da frente: o jogo
//      pedia um desvio que ele mesmo tornava impossível.
//
// Agora a nave PERSEGUE UM ALVO. O jogador não empurra a nave — ele diz onde
// ela deve estar, e ela chega lá depressa. É como todo shmup de toque funciona,
// e é o que faz o dedo e a nave parecerem a mesma coisa:
//
//   • no toque, o alvo anda junto com o dedo, 1 para 1;
//   • no teclado, o alvo corre a `velocidadeDoAlvo` na direção apertada.
//
// Um caminho só para os dois, então o jogo tem o MESMO tato no celular e no
// computador — e é esse caminho que o teste mede.
export interface Nave {
    x: number; y: number;
    /** Onde o jogador MANDOU a nave estar. Ela persegue isto. */
    alvoX: number; alvoY: number;
    /** Velocidade observada. Serve para o visual (rolagem) e para o teste. */
    vx: number; vy: number;
    /** Inclinação visual, em radianos. */
    rolagem: number;
    /** Segundos de invencibilidade depois de levar um toque. */
    piscando: number;
    vidas: number;
    /** Tempo até o próximo tiro sair. */
    recarga: number;
}

export const NAVE = Object.freeze({
    /**
     * Quão depressa a nave alcança o alvo, em "por segundo" de um exponencial.
     * 22 quer dizer que ela cobre 63% da distância que falta a cada 45 ms — o
     * dedo e a nave parecem a mesma coisa, mas ainda há peso.
     */
    resposta: 22,
    /** Velocidade do alvo quando o comando vem de TECLA (o dedo dita a sua). */
    velocidadeDoAlvo: 13.5,
    /**
     * ── A CAIXA DE COLISÃO É PEQUENA DE PROPÓSITO ────────────────────────
     * Ela era 0,62 num avião de 3,6 de envergadura: um terço do desenho. Todo
     * shmup que se joga com o polegar usa uma caixa MUITO menor que a nave —
     * é o que faz passar raspando ser emocionante em vez de injusto. Com a
     * envergadura composta em 2,35, 0,36 deixa a caixa em 31% do desenho: o
     * bico e as pontas das asas não machucam, e a razão desenho/caixa fica em
     * 3,3 — dentro da faixa que o teste cobra.
     */
    raio: 0.36,
    /** Depois de um toque, este tanto de segundos sem poder levar outro. */
    invencivel: 2.0,
    rolagemMaxima: 0.85,
});

export function novaNave(x: number, y: number, vidas = VIDAS_DO_JOGADOR): Nave {
    return { x, y, alvoX: x, alvoY: y, vx: 0, vy: 0, rolagem: 0, piscando: 0, vidas, recarga: 0 };
}

/** O dedo arrastou: mexe o ALVO por um delta de mundo, preso na arena. */
export function arrastarNave(n: Nave, dx: number, dy: number): void {
    const p = dentroDaArena(n.alvoX + dx, n.alvoY + dy);
    n.alvoX = p.x; n.alvoY = p.y;
}

/** Comando de TECLA: o alvo corre na direção apertada. */
export function conduzirNave(n: Nave, mx: number, my: number, dt: number): void {
    const d = Math.min(dt, 0.05);
    const m = Math.hypot(mx, my);
    if (m > 1e-4) {
        const k = (NAVE.velocidadeDoAlvo * d) / Math.max(1, m);
        arrastarNave(n, mx * k, my * k);
    } else {
        // Sem comando, o alvo assenta onde a nave está — senão ela continuaria
        // andando sozinha rumo a um alvo velho depois de soltar a tecla.
        n.alvoX = n.x; n.alvoY = n.y;
    }
}

/** Um passo da nave: ela persegue o alvo. */
export function passoDaNave(n: Nave, dt: number): void {
    const d = Math.min(dt, 0.05);
    const k = 1 - Math.exp(-NAVE.resposta * d);
    const antesX = n.x, antesY = n.y;
    n.x += (n.alvoX - n.x) * k;
    n.y += (n.alvoY - n.y) * k;
    const preso = dentroDaArena(n.x, n.y);
    n.x = preso.x; n.y = preso.y;
    n.vx = d > 0 ? (n.x - antesX) / d : 0;
    n.vy = d > 0 ? (n.y - antesY) / d : 0;
    // A rolagem segue a velocidade lateral, com atraso — é o que dá peso.
    const alvo = Math.max(-1, Math.min(1, -n.vx / NAVE.velocidadeDoAlvo)) * NAVE.rolagemMaxima;
    n.rolagem += (alvo - n.rolagem) * Math.min(1, d * 12);
    if (n.piscando > 0) n.piscando = Math.max(0, n.piscando - d);
    if (n.recarga > 0) n.recarga = Math.max(0, n.recarga - d);
}

/** A nave levou um toque? Devolve `true` se a vida foi de fato descontada. */
export function tomarToque(n: Nave): boolean {
    if (n.piscando > 0) return false;
    n.vidas -= 1;
    n.piscando = NAVE.invencivel;
    return true;
}

// ── COLISÃO ──────────────────────────────────────────────────────────────────
//
// Tudo acontece perto do plano Z das naves, então a colisão é um círculo em
// X/Y com uma janela em Z. A maré é a exceção e tem a regra dela.
export function encostou(p: Projetil, x: number, y: number, raio: number): boolean {
    if (Math.abs(p.z - ARENA.zNave) > (p.r + 0.9)) return false;
    if (p.tipo === 'mare') return mareAcerta(p, x);
    return Math.hypot(p.x - x, p.y - y) < p.r + raio;
}

/**
 * Um tiro acertou a boca aberta? A boca é um alvo generoso.
 *
 * O Y SAI DA CABEÇA, e o DESLOCAMENTO é o mesmo que a malha usa.
 *
 * A primeira versão pôs 2,5, que é onde está o GRUPO da boca — mas a cavidade
 * de verdade está mais 1,4 abaixo, dentro dele. Fotografado, o anel de mira
 * ficava em cima do NARIZ, e o jogador seria ensinado a mirar num lugar onde a
 * boca não está. Uma hitbox que não coincide com o que se vê é a pior coisa que
 * um chefe pode ter, porque não há como o jogador descobrir sozinho.
 *
 * `Floor12Cabeca` posiciona a cavidade a partir DESTE número, então as duas não
 * podem mais discordar — e o teste confere.
 */
export const BOCA_ABAIXO_DO_CENTRO = 4.8;
/**
 * O alvo encolheu de 3,0 para 2,0, e o motivo é que ele passou a ser A MIRA.
 *
 * Enquanto o tiro voava reto, acertar a boca queria dizer estar na ALTURA dela
 * — o Y era o desafio e o raio generoso compensava um alvo difícil. Agora a
 * bala sobe sozinha e quem decide é o X, então este raio é literalmente a
 * largura da mira. A 3,0 numa arena de 3,7 ele cobria 81% do mundo jogável:
 * qualquer tiro contaria, de qualquer lugar, e a mira sairia do jogo. A 2,0 o
 * jogador tem de voltar ao meio da arena para machucar — que é o lugar mais
 * perigoso para ficar parado, e é essa troca que faz a luta.
 */
export const BOCA_ALVO = Object.freeze({ x: 0, y: ALTURA_DA_CABECA - BOCA_ABAIXO_DO_CENTRO, raio: 2.0 });

export function tiroNaBoca(p: Projetil): boolean {
    if (p.tipo !== 'tiro') return false;
    if (p.z > ARENA.zCabeca + 1.6) return false;
    // O Y continua sendo conferido, e não é redundante: a elevação leva a bala
    // à altura da boca, mas o irmão atira de qualquer lugar e um tiro nascido
    // rente ao chão da arena ainda pode chegar curto. O que decide na prática é
    // o X, que é o que o jogador controla.
    return Math.hypot(p.x - BOCA_ALVO.x, p.y - BOCA_ALVO.y) < BOCA_ALVO.raio;
}

// ── O ESTADO VIVO ────────────────────────────────────────────────────────────
export interface F12State {
    fase: F12Fase;
    /** Relógio da luta, desde que ela começou. */
    relogio: number;
    /** Relógio da boca — separado, porque a virada o reinicia. */
    bocaT: number;
    vida: number;
    /** Quantas vezes a boca já abriu (é o cursor do rodízio). */
    aberturas: number;
    /** O ataque que a boca cuspiu na abertura atual (null = ainda não cuspiu). */
    ataqueNoAr: NomeDoAtaque | null;
    passouDaVirada: boolean;
    projeteis: Projetil[];
    linhaDoDialogo: number;
    versao: number;
}

export const f12: F12State = criarEstado();

function criarEstado(): F12State {
    return {
        fase: 'intro', relogio: 0, bocaT: 0, vida: VIDA_MAXIMA, aberturas: 0,
        ataqueNoAr: null, passouDaVirada: false, projeteis: [],
        linhaDoDialogo: 0, versao: 0,
    };
}

let aoMudar: (() => void) | null = null;
export function f12AoMudar(fn: (() => void) | null): void { aoMudar = fn; }
export function f12Bump(): void { f12.versao++; aoMudar?.(); }

export function f12Reset(): void {
    Object.assign(f12, criarEstado());
    reiniciarIds();
    f12Bump();
}

/**
 * Fere a cabeça. Devolve `true` se este golpe cruzou a metade da vida — quem
 * chama usa isso para disparar a virada, em vez de ficar comparando a vida a
 * cada quadro e disparando duas vezes.
 */
export function ferir(dano: number): boolean {
    if (f12.vida <= 0) return false;
    const antes = f12.vida;
    f12.vida = Math.max(0, f12.vida - dano);
    return antes > LIMIAR_DA_VIRADA && f12.vida <= LIMIAR_DA_VIRADA;
}

// ── O ROTEIRO ────────────────────────────────────────────────────────────────
export interface F12Linha { quem: 'irmao' | 'jogador'; texto: string; }

/** O irmão chega de ala. Ele é o TROCO-63 — modelo mais VELHO que o 64, e
 *  ressentido exatamente por isso. */
export const F12_ENCONTRO: ReadonlyArray<F12Linha> = Object.freeze([
    { quem: 'irmao', texto: 'BIP. Então o elevador virou avião de novo. Ótimo. Adoro quando a física do prédio tira férias.' },
    { quem: 'jogador', texto: '...você é o TROCO-64?' },
    { quem: 'irmao', texto: 'TROCO-63. SESSENTA E TRÊS. O 64 é o meu irmão CAÇULA, o que ganhou o andar da corrida, as luzinhas e os aplausos. Eu ganhei ISTO.' },
    { quem: 'irmao', texto: 'ISTO sendo aquilo ali na frente. Não pergunte de quem é a cabeça. Pergunte por que ela ainda está falando.' },
    { quem: 'irmao', texto: 'Regra única: ela só machuca de boca ABERTA — e só é machucada de boca aberta. Cospe primeiro, fica aberta depois. Enfie tiro lá dentro.' },
    { quem: 'irmao', texto: 'Eu voo de ala. Não porque eu goste de você. Porque eu tenho uma arma e um rancor de 412 dias. BIP.' },
]);

export const F12_VIRADA: ReadonlyArray<F12Linha> = Object.freeze([
    { quem: 'irmao', texto: 'BIP-ALERTA. Metade da vida dela. E ela está ABRINDO MAIS. Isso não estava no meu manual — mas nada aqui estava.' },
    { quem: 'irmao', texto: 'Dois padrões novos. Um vem do 2º andar, o outro é o próprio poço do elevador. O hotel está usando ELE MESMO como munição.' },
]);

export const F12_VITORIA: ReadonlyArray<F12Linha> = Object.freeze([
    { quem: 'irmao', texto: 'A boca fechou. E dessa vez ficou fechada. BIP... eu esperei 412 dias por esse silêncio.' },
    { quem: 'irmao', texto: 'Diz para o 64 que o irmão feio mandou lembranças. E que eu venci uma coisa maior do que uma corrida.' },
]);

export const F12_DERROTA: ReadonlyArray<F12Linha> = Object.freeze([
    { quem: 'irmao', texto: 'BIP. Seu avião era o elevador, hóspede. E o elevador sempre volta ao térreo. Respire. A gente tenta de novo.' },
]);

export const F12_DESPEDIDA: ReadonlyArray<F12Linha> = Object.freeze([
    { quem: 'irmao', texto: 'Vai subindo. Eu fico. Alguém tem de ficar olhando para o lugar onde ela estava, caso ela resolva voltar a abrir.' },
    { quem: 'jogador', texto: 'Obrigado, 63.' },
    { quem: 'irmao', texto: '...BIP. Ninguém nunca me chamou pelo número antes. Suba logo, antes que eu enferruje na frente de um hóspede.' },
]);
