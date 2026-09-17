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
 * ── ELA SUBIU, E O MOTIVO É DE COMPOSIÇÃO ────────────────────────────────────
 *
 * Na primeira montagem a cabeça estava em 4,4 e a arena ia de 0,6 a 9,4 — ou
 * seja, o avião voava BEM NO MEIO DA CARA DELA. Na foto o jogador simplesmente
 * sumia: um aviãozinho creme sobre um crânio lilás do mesmo valor de cinza, no
 * mesmo ponto da tela. Um jogo de nave em que não dá para achar a própria nave.
 *
 * Levantando a cabeça e baixando a arena, a luta acontece contra o CÉU, e o
 * jogador sobe até a boca só quando quer atirar nela — que é justamente o
 * movimento que a luta pede.
 */
export const ALTURA_DA_CABECA = 7.6;

export const ARENA = Object.freeze({
    x: 4.9,          // meia-largura
    yBaixo: 0.4,     // teto de nuvem baixa
    yAlto: 7.6,      // teto de cima
    zNave: 0,        // o plano em que os aviões voam
    zCabeca: -26,    // onde a cabeça flutua
});

/**
 * ── A ARENA É ESTREITA PORQUE A TELA DELE É ESTREITA ─────────────────────────
 *
 * O jogo é jogado num celular EM PÉ: 412 x 915, aspecto 0,45. E `fov`, no three,
 * é VERTICAL — a abertura horizontal sai de `tan(fov/2) * aspecto`, ou seja
 * numa tela em pé ela é menos da metade. A primeira versão deste andar não
 * respeitou isso e a sonda mediu o estrago: a largura do quadro no plano do
 * avião dava 4,00 unidades e o avião tinha 5,30 de envergadura. Ele era MAIS
 * LARGO QUE A TELA.
 *
 * Pior do que feio: o desenho e a colisão discordavam por cinco vezes (a caixa
 * de colisão é `NAVE.raio`, 1,04 de diâmetro). O jogador levaria dano de coisas
 * que visivelmente passaram longe.
 *
 * Estes três números andam juntos e por isso estão no mesmo lugar. Mexer em um
 * sem os outros é o que desalinha o desenho da regra outra vez.
 */
export const ENQUADRAMENTO = Object.freeze({
    /** O aspecto em que este andar foi composto — a tela do dono do jogo. */
    aspecto: 412 / 915,
    /** `fov` VERTICAL da câmera. */
    fov: 62,
    /** Distância da câmera até o plano dos aviões. */
    recuo: 19.0,
    /**
     * Envergadura DESENHADA do avião do jogador, depois da escala.
     *
     * A primeira conta pôs isto em 2,9 — cabia na tela, e o piloto virava um
     * borrão de vinte pixels. O pedido do andar é terceira pessoa COM o avatar
     * do andar 5 na cabine; se não dá para ver quem está pilotando, o
     * reaproveitamento do modelo não serviu para nada. A 3,6 ele ocupa 35% da
     * largura do quadro e o boneco lê.
     *
     * O preço é que a arena teve de encolher junto (4,9 de meia-largura) e a
     * caixa de colisão teve de crescer (0,62): a folga entre o desenho e a
     * regra tem teto, e o teste cobra os três de uma vez.
     */
    envergadura: 3.6,
});

/** Quantas unidades de mundo cabem na LARGURA da tela, à distância `d`. */
export function larguraDoQuadro(d: number): number {
    const meiaV = Math.tan((ENQUADRAMENTO.fov * Math.PI) / 180 / 2);
    return 2 * d * meiaV * ENQUADRAMENTO.aspecto;
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
    | 'queda'        // reactor rupture, fall and wingman escort
    | 'vitoria'
    | 'abatido'      // o avião do jogador rodopia, e a cabeça desce para engolir
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
 * ── A ESCALADA: O CHEFE COMEÇA COM UM ATAQUE SÓ ─────────────────────────────
 *
 * Antes, três padrões rodavam desde a PRIMEIRA abertura e os outros dois moravam
 * atrás dos 50% de vida. As duas metades disso eram defeito:
 *
 *  - três coisas novas nos primeiros quinze segundos não são um ensino, são um
 *    despejo. O jogador não tem tempo de aprender a regra de nenhuma antes de a
 *    próxima chegar;
 *  - e medido jogando, a luta inteira leva minutos. Os dois padrões trancados
 *    atrás da metade da vida eram, na prática, conteúdo que quase ninguém via —
 *    exatamente o oposto de "guardar o melhor para depois".
 *
 * Agora cada padrão tem uma ABERTURA DE ENTRADA. A boca abre duas vezes com o
 * mesmo ataque — o leque, o mais legível — e só então existe uma segunda regra.
 * Daí em diante entra um padrão novo a cada duas aberturas, e os já conhecidos
 * continuam voltando no meio: um truque novo é interessante na primeira vez e só
 * vira VOCABULÁRIO na terceira.
 *
 * ── E DOIS DELES ENTRAM PELA VIRADA, PORQUE A FALA PROMETE ISSO ─────────────
 *
 * O TROCO-63 diz, na virada: "Dois padrões novos. Um vem do 2º andar, o outro é
 * o próprio poço do elevador." Enquanto as estreias eram por número de abertura
 * (`mare` na 6ª, `elevadores` na 8ª) e a virada caía lá pela 7ª, a MARÉ já tinha
 * batido no jogador antes de ser anunciada como nova. A fala mentia — e uma
 * promessa quebrada num chefe é pior do que não prometer nada.
 *
 * `ATAQUES` já marcava os dois com `depoisDaVirada: true`. O dado estava certo
 * desde sempre; `ataqueDaVez` é que fazia `void depoisDaVirada` e ignorava. Isto
 * é a mesma classe de defeito do cursor que não estava ligado.
 *
 * Agora eles estreiam RELATIVO À VIRADA, e não a um número fixo: o primeiro na
 * abertura em que ela acontece, o segundo duas depois. O rodízio continua
 * determinístico — a mesma partida dá a mesma ordem — e a virada volta a ser o
 * que a fala diz que é, sem deixar de ser também mais apertada.
 */
interface EntradaDoPadrao {
    nome: NomeDoAtaque;
    /** Abertura fixa de estreia, para os que existem desde o começo. */
    entra?: number;
    /** Aberturas DEPOIS da virada, para os que ela destranca. */
    aposAVirada?: number;
}

const ESCALADA: ReadonlyArray<EntradaDoPadrao> = Object.freeze([
    { nome: 'leque', entra: 0 },          // o ATAQUE PRIMÁRIO, e o mais legível
    { nome: 'teleguiado', entra: 2 },     // manobra, e não posição
    { nome: 'naves', entra: 4 },          // o único que se resolve ATIRANDO
    { nome: 'mare', aposAVirada: 0 },     // "um vem do 2º andar"
    { nome: 'elevadores', aposAVirada: 2 }, // "o outro é o próprio poço"
]);

/**
 * Em que abertura o padrão estreia, dado o instante da virada.
 *
 * `viradaEm` é a abertura em que a vida cruzou a metade, ou -1 se ainda não
 * cruzou. Enquanto ela não aconteceu, os dois trancados não têm estreia: é
 * `Infinity`, e não um número grande escolhido a dedo, porque "grande o
 * bastante" é exatamente o tipo de suposição que quebra quando a luta muda de
 * duração.
 */
function estreiaDe(e: EntradaDoPadrao, viradaEm: number): number {
    if (e.entra !== undefined) return e.entra;
    return viradaEm < 0 ? Infinity : viradaEm + (e.aposAVirada ?? 0);
}

/** Quais padrões já entraram na luta, na abertura `n`. */
export function padroesAtivos(n: number, viradaEm = -1): NomeDoAtaque[] {
    return ESCALADA.filter((e) => n >= estreiaDe(e, viradaEm)).map((e) => e.nome);
}

/** Quantas aberturas depois da virada o moveset dos cinco fica completo. */
export const ABERTURA_DO_MOVESET_COMPLETO =
    ESCALADA.reduce((m, e) => Math.max(m, e.aposAVirada ?? 0), 0);

/**
 * Qual ataque cai na `n`-ésima abertura de boca.
 *
 * NÃO é sorteio. Um chefe sorteado é injusto de um jeito que o jogador sente e
 * não consegue nomear: às vezes o mesmo padrão três vezes seguidas, às vezes o
 * combo impossível. Isto é um RODÍZIO — a mesma partida dá a mesma ordem, e o
 * jogador pode aprender a luta, que é a única coisa que torna um chefe justo.
 *
 * Na abertura em que um padrão ENTRA, é ele que sai: sem isso o rodízio podia
 * adiar a estreia e a coisa nova chegaria no meio de outras, que é a diferença
 * entre apresentar e despejar.
 *
 * Fora das estreias sai o padrão ATIVO HÁ MAIS TEMPO SEM APARECER. Rotaciona
 * sozinho, faz a novidade voltar logo, e continua determinístico.
 */
export function ataqueDaVez(n: number, viradaEm = -1): NomeDoAtaque {
    const ate = Math.max(0, Math.floor(n));
    const usados = new Map<NomeDoAtaque, number>();
    let ultimo: NomeDoAtaque | null = null;
    for (let i = 0; i <= ate; i++) {
        const estreia = ESCALADA.find((e) => estreiaDe(e, viradaEm) === i);
        let q: NomeDoAtaque;
        if (estreia) {
            q = estreia.nome;
        } else {
            const ativos = padroesAtivos(i, viradaEm);
            let melhor = ativos[0], visto = usados.get(ativos[0]) ?? -1;
            for (const a of ativos) {
                const v = usados.get(a) ?? -1;
                if (v < visto) { melhor = a; visto = v; }
            }
            // e nem assim pode emendar consigo mesmo — salvo na repetição de
            // estreia do primário, que é de propósito
            if (melhor === ultimo && ativos.length > 1) {
                const outro = ativos.find((a) => a !== ultimo);
                if (outro) melhor = outro;
            }
            q = melhor;
        }
        usados.set(q, i);
        ultimo = q;
        if (i === ate) return q;
    }
    return ESCALADA[0].nome;
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
    /** Fully charged player rocket, drawn and damaged independently of ordinary rounds. */
    carregado?: boolean;
    /** Vida, para os que morrem de tiro (as naves). */
    hp?: number;
    /** Parâmetro livre por ataque (fase da onda, faixa do elevador, etc). */
    p?: number;
    /** X de repouso, para os que bamboleiam em volta de uma linha. */
    base?: number;
    /**
     * Meio-comprimento do EIXO VERTICAL da colisão, quando ela não é um círculo.
     *
     * Quase tudo que a cabeça cospe é redondo, e um raio basta. A cabine do
     * elevador não é: ela é 1,9 de caixa mais teto mais trilhos, ou seja alta e
     * estreita. Com um círculo só, um raio que acerte a largura erra a altura
     * por quase meia unidade — e é justamente o ataque cujo assunto É o eixo
     * vertical. Com `ry`, a colisão vira uma cápsula em pé: o raio cuida da
     * largura e o segmento cuida da altura.
     */
    ry?: number;
}

let proximoId = 1;
export const novoId = (): number => proximoId++;
/** Só para o teste: torna os ids determinísticos. */
export function reiniciarIds(): void { proximoId = 1; }

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
     * ESTE NÚMERO É O ATAQUE. A 1,85 o vão final dava 1,77 — e a nave com o
     * projétil pede 2,04 para passar. Ou seja: o leque estava INDESVIÁVEL pelos
     * vãos, e a única saída era contornar por fora, que não é o desenho do
     * ataque. Foi o teste que pegou; a foto de um leque aberto pareceria certa.
     * O leque tem uma amarra que não é óbvia: o de FORA anda exatamente o dobro
     * do vão entre vizinhos. Então "abrir o suficiente para a nave passar" e
     * "não sair da arena" são a MESMA conta, e ela é apertada — o vão precisa
     * de pelo menos 2,16 (nave 0,62 + projétil 0,46, vezes dois), o que põe o
     * de fora em 4,32 no mínimo, contra uma arena de 4,9.
     *
     * A 2,5 o vão final dá 2,37 e o de fora 4,74: passa a nave com folga e
     * ainda encosta na borda, que é o que impede o jogador de simplesmente
     * contornar o ataque por fora em vez de usar um vão.
     */
    abrePorSegundo: 2.0,
    velocidadeZ: 12.0,
    raio: 0.46,
});

export function nascerLeque(alvoX: number, alvoY: number): Projetil[] {
    const fora: Projetil[] = [];
    const meio = (LEQUE.quantos - 1) / 2;
    for (let i = 0; i < LEQUE.quantos; i++) {
        const lado = (i - meio) / meio;               // -1 .. +1
        fora.push({
            id: novoId(), tipo: 'leque',
            x: alvoX + lado * LEQUE.largura0, y: alvoY, z: ARENA.zCabeca + 1.2,
            vx: lado * LEQUE.abrePorSegundo, vy: 0, vz: LEQUE.velocidadeZ,
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

export function nascerTeleguiado(): Projetil {
    return {
        id: novoId(), tipo: 'teleguiado',
        x: 0, y: meioY(), z: ARENA.zCabeca + 1.2,
        vx: 0, vy: 0, vz: TELEGUIADO.velocidade,
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
    if (m.t >= TELEGUIADO.combustivel || m.z > ARENA.zNave + 1.4) return;
    const dx = alvoX - m.x, dy = alvoY - m.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) { m.vx = 0; m.vy = 0; return; }
    const desejado = Math.atan2(dy, dx);
    const atual = Math.hypot(m.vx, m.vy) > 1e-4 ? Math.atan2(m.vy, m.vx) : desejado;
    // diferença no intervalo (-π, π]
    let d = desejado - atual;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const maxima = TELEGUIADO.curvaPorSegundo * dt;
    const giro = Math.max(-maxima, Math.min(maxima, d));
    const novo = atual + giro;
    // A velocidade LATERAL é o que gira; o avanço em Z é constante.
    // Intercept at the flight plane instead of orbiting the target in XY.
    const chegada = Math.max(.22, (ARENA.zNave - m.z) / Math.max(.1, m.vz));
    const lateral = Math.min(Math.hypot(m.vx, m.vy) || TELEGUIADO.velocidade * .55,
        TELEGUIADO.velocidade * .55, dist / chegada);
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
    velocidadeZ: 4.3,
    /** Bamboleio lateral, para elas não virem em linha reta. */
    ondaAmp: 1.6,
    ondaHz: 0.55,
    raio: 0.55,
    hp: 2,
});

export function nascerNaves(): Projetil[] {
    const fora: Projetil[] = [];
    for (let i = 0; i < NAVES.quantas; i++) {
        const lado = (i / (NAVES.quantas - 1)) * 2 - 1;      // -1 .. +1
        const base = lado * ARENA.x * 0.7;
        fora.push({
            id: novoId(), tipo: 'naves', base,
            x: base,
            y: meioY() + (i % 2 ? 1.6 : -1.6),
            z: ARENA.zCabeca + 2,
            vx: 0, vy: 0, vz: NAVES.velocidadeZ,
            r: NAVES.raio, t: 0, hp: NAVES.hp, p: i * 0.7,
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
    velocidadeZ: 5.8,
    /**
     * Meia-largura da fresta. Cabe um avião com folga, e é isso mesmo.
     *
     * 2,05 -> 2,46: cresceu exatamente `NAVE.raio` quando a colisão passou a
     * contar a largura do avião (ver `mareAcerta`). Sem isso o corredor jogável
     * encolheria de repente e a maré viraria o ataque mais difícil do andar por
     * acidente de conserto, e não por decisão de projeto. O que se atravessa
     * continua o mesmo; a diferença é que agora é o corredor DESENHADO.
     */
    get fresta(): number { return 2.05 + NAVE.raio; },
    /**
     * A fresta passeia por X neste seno.
     *
     * O teto é `ARENA.x - fresta` (3,65 com os números de hoje): passar disso
     * põe a saída FORA da arena, e o ataque vira indesviável sem aviso nenhum —
     * a onda chegaria com a única passagem num lugar onde o avião não pode
     * estar. É por isso que o teste cobra esta relação e não o número solto.
     */
    get passeioAmp(): number {
        // DERIVADO do invariante, e não escrito à mão.
        //
        // A regra é `passeioAmp + fresta <= ARENA.x`: passar disso põe a saída
        // FORA da arena e o ataque vira indesviável sem aviso. Quando a fresta
        // cresceu (ela passou a contar a largura do avião), este número continuou
        // em 2,75 e o invariante quebrou na hora — dois testes reprovaram, que é
        // o sistema funcionando. Derivando, ele não pode mais escorregar: quem
        // mexer na fresta não precisa lembrar de mexer aqui.
        return ARENA.x - MARE.fresta;
    },
    passeioHz: 0.24,
    raio: 0.9,          // espessura da onda, para a colisão em Z
});

export function nascerMare(faseDoPasseio: number): Projetil {
    return {
        id: novoId(), tipo: 'mare',
        x: 0, y: meioY(), z: ARENA.zCabeca + 1.0,
        vx: 0, vy: 0, vz: MARE.velocidadeZ,
        r: MARE.raio, t: 0, p: faseDoPasseio,
    };
}

/** Onde o centro da fresta está, para esta onda, neste instante. */
export function frestaDaMare(m: Projetil): number {
    return Math.sin((m.p ?? 0) + m.t * MARE.passeioHz * Math.PI * 2) * MARE.passeioAmp;
}

/** A onda pegou quem está em `x`? (fora da fresta = pegou) */
/**
 * A onda pegou quem está em `x`?
 *
 * ── O AVIÃO TEM LARGURA, E ESTA CONTA ERA A ÚNICA QUE NÃO SABIA DISSO ────────
 *
 * `encostou` soma o raio de quem passa em TODOS os outros ataques. A maré era a
 * exceção: comparava só o CENTRO do avião contra a borda da fresta. E a parede é
 * desenhada terminando exatamente em `fresta ± MARE.fresta`, então o desenho e o
 * dano concordavam no papel e discordavam na tela — com o centro na borda, meia
 * envergadura ficava DENTRO da parede desenhada e não acontecia nada.
 *
 * Medido por um avaliador: até 0,41 de unidade de sobreposição visível, uns 17
 * px em tela de celular. É o "o ataque passou por dentro de mim" ao pé da letra,
 * e é o defeito que o dono do jogo relatou primeiro.
 *
 * A fresta foi alargada no mesmo tanto (ver `MARE.fresta`), então o corredor que
 * dá para atravessar continua o mesmo; o que mudou é que agora ele é o corredor
 * que se VÊ.
 */
export function mareAcerta(m: Projetil, x: number, raio = 0): boolean {
    return Math.abs(x - frestaDaMare(m)) + raio > MARE.fresta;
}

// ── ATAQUE 5: A ESPINHA (cabines de elevador caindo) ─────────────────────────
//
// Colunas que descem em faixas fixas de X, com uma faixa VAZIA. É o inverso da
// maré: lá o jogador procura uma fresta que passeia, aqui ele procura a coluna
// que não veio. E é vertical, então mexe o eixo que os outros quatro quase não
// pedem.
export const ELEVADORES = Object.freeze({
    faixas: 5,
    velocidadeZ: 5.2,
    /** Velocidade máxima da descida; o trajeto cruza a altura visada. */
    quedaPorSegundo: 2.4,
    /**
     * 0,85 -> 0,52.
     *
     * A parte mais larga da cabine desenhada são os trilhos, em ±0,89 com 0,10
     * de espessura — ou seja a silhueta acaba em 0,94. Com o raio em 0,85 e o
     * avião em 0,42, o dano ia até 1,27 do centro: um terço de unidade (uns 13
     * px em celular) de dano vindo de FORA da cabine que o jogador vê. É o
     * mesmo defeito da maré com o sinal trocado, e o jogador não tem como
     * descobrir nenhum dos dois jogando.
     *
     * 0,52 + 0,42 do avião = 0,94, que é exatamente onde a cabine acaba.
     */
    raio: 0.52,
    /**
     * Meia-altura DESENHADA da cabine: a caixa tem 1,9, o teto está em 1,0 e os
     * trilhos têm 2,7 de altura — o topo do que se vê fica em 1,35.
     *
     * O raio acima acerta a LARGURA e só ela. Na vertical, 0,52 + 0,42 do avião
     * dava 0,94 contra 1,35 de cabine: o jogador atravessava o telhado e o piso
     * da cabine, sem dano, por 0,41 — uns 16 px em celular. É o mesmo defeito da
     * maré, no outro eixo, no ÚNICO ataque cujo assunto é justamente a altura.
     */
    meiaAlturaDesenhada: 1.35,
    /** DERIVADO: o segmento que, somado ao raio e ao avião, dá a meia-altura. */
    get meioSegmento(): number {
        return this.meiaAlturaDesenhada - this.raio - NAVE.raio;
    },
});

export const xDaFaixa = (i: number): number =>
    (-1 + (2 * i) / (ELEVADORES.faixas - 1)) * ARENA.x * 0.82;

export function nascerElevadores(faixaVazia: number, alvoY = meioY()): Projetil[] {
    const vazia = ((Math.floor(faixaVazia) % ELEVADORES.faixas) + ELEVADORES.faixas) % ELEVADORES.faixas;
    const fora: Projetil[] = [];
    const inicioY = ARENA.yAlto + 1.2, inicioZ = ARENA.zCabeca + 2;
    const chegada = (ARENA.zNave - inicioZ) / ELEVADORES.velocidadeZ;
    const altura = Math.max(ARENA.yBaixo, Math.min(ARENA.yAlto, alvoY));
    const queda = Math.min(ELEVADORES.quedaPorSegundo, (inicioY - altura) / chegada);
    for (let i = 0; i < ELEVADORES.faixas; i++) {
        if (i === vazia) continue;
        fora.push({
            id: novoId(), tipo: 'elevadores',
            x: xDaFaixa(i), y: inicioY, z: inicioZ,
            vx: 0, vy: -queda, vz: ELEVADORES.velocidadeZ,
            r: ELEVADORES.raio, ry: ELEVADORES.meioSegmento, t: 0, p: i,
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
        const antes = p.x;
        p.x = p.base + Math.sin(p.t * NAVES.ondaHz * Math.PI * 2 + (p.p ?? 0)) * NAVES.ondaAmp;
        p.vx = d > 0 ? (p.x - antes) / d : 0;
    } else {
        p.x += p.vx * d;
    }
}

/** O projétil já passou do jogador e pode ser recolhido? */
export function saiuDeCena(p: Projetil): boolean {
    if (p.tipo === 'tiro') return p.z < ARENA.zCabeca - 3;
    if (p.z > ARENA.zNave + 14) return true;
    if (p.y < ARENA.yBaixo - 8 || p.y > ARENA.yAlto + 14) return true;
    return Math.abs(p.x) > ARENA.x + 16;
}

// ── O TIRO DO JOGADOR ────────────────────────────────────────────────────────
export const TIRO = Object.freeze({
    velocidade: 34,
    raio: 0.36,
    /** Segundos entre tiros. */
    cadencia: 0.16,
    /**
     * 1,0 -> 1,8.
     *
     * Medido no navegador, com um bot jogando o ciclo de carga certo: 100
     * acertos em 95 s, 1,09 de dano por acerto, 1,15 de dano por segundo. A 240
     * de vida isso projeta uma luta de 210 SEGUNDOS — três minutos e meio de
     * chefe, com o mesmo punhado de padrões se repetindo. Um chefe longo não é
     * um chefe difícil, é um chefe cansativo.
     */
    dano: 1.2,
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
 * no ponto de fuga. O dono do jogo disse que o tiro estava ruim; parte disso era
 * literalmente não dar para ver o tiro.
 *
 * Saindo das pontas (`lado` = -1 ou +1), as balas formam dois rastros paralelos
 * de cada lado da fuselagem. É por isso que todo jogo de nave em terceira pessoa
 * atira das asas — não por realismo, por leitura.
 *
 * O desvio é pequeno perto do raio do alvo da boca (3,0), então a mira continua
 * sendo "alinhar o avião com a boca": nada muda na regra, só na visão.
 */
export const PONTA_DA_ASA = 1.35;

export function nascerTiro(
    x: number, y: number, de: 'jogador' | 'irmao', lado: -1 | 1 = 1,
): Projetil {
    return {
        id: novoId(), tipo: 'tiro',
        x: x + lado * PONTA_DA_ASA * (de === 'irmao' ? 0.7 : 1), y: y - 0.12,
        z: ARENA.zNave - 0.6,
        vx: 0, vy: 0, vz: -TIRO.velocidade,
        r: TIRO.raio, t: 0, de, p: lado,
    };
}

/**
 * O prêmio dos 100% de carga.
 *
 * 8 -> 14 de dano, contra 1,8 do tiro comum: quase OITO TIROS numa coisa só. O
 * número subiu junto com a carga ficar alcançável (ver `FLIGHT_WEAPON`) — antes
 * ele era generoso no papel e nunca era cobrado, porque o míssil não saía.
 *
 * Ele precisa ser desproporcional de propósito: quem fica parado no meio de uma
 * luta de desvio está pagando com risco, e o pagamento tem de se ver na barra de
 * vida do chefe, num salto que o jogador consiga apontar com o dedo.
 */
/** Quantas vezes o míssil vale um tiro comum. É o prêmio, e é o contrato. */
export const MULTIPLICADOR_DO_MISSEL = 10;

export const MISSEL_CARREGADO = Object.freeze({
    /**
     * DERIVADO de `TIRO.dano`, e não escrito à mão.
     *
     * Ele era 8 contra um tiro de 1,0. Quando o tiro mudou de valor, a razão
     * mudou junto sem ninguém decidir — e havia um teste cravando "oito vezes"
     * que passou a reprovar por causa da aritmética, não do projeto. Derivando,
     * a razão é a coisa fixa, que é o que o projeto realmente quer dizer.
     */
    dano: +(TIRO.dano * MULTIPLICADOR_DO_MISSEL).toFixed(3),
    velocidade: 28,
    raio: .48,
});

export function nascerMissilCarregado(x: number, y: number): Projetil {
    return { ...nascerTiro(x, y, 'jogador'), x, y: y - .08, z: ARENA.zNave - 1.2,
        vz: -MISSEL_CARREGADO.velocidade, r: MISSEL_CARREGADO.raio, carregado: true };
}

export function danoDoTiro(p: Projetil): number {
    return p.carregado ? MISSEL_CARREGADO.dano : p.de === 'irmao' ? TIRO.danoIrmao : TIRO.dano;
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
     * é o que faz passar raspando ser emocionante em vez de injusto. 0,42 é
     * 23% da envergadura: o bico e as pontas das asas não machucam.
     */
    raio: 0.42,
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
    // o raio de quem passa ENTRA na conta da onda, como entra em todo o resto
    if (p.tipo === 'mare') return mareAcerta(p, x, raio);
    // `ry` aproxima o corpo do projétil de um segmento VERTICAL em vez de um
    // ponto: grudando o y do alvo ao segmento, o teste vira o mesmo círculo de
    // sempre, só que contra a parte mais próxima da cabine.
    const dy = p.ry ? y - Math.max(p.y - p.ry, Math.min(p.y + p.ry, y)) : p.y - y;
    return Math.hypot(p.x - x, dy) < p.r + raio;
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
export const BOCA_ABAIXO_DO_CENTRO = 3.9;
export const BOCA_ALVO = Object.freeze({ x: 0, y: ALTURA_DA_CABECA - BOCA_ABAIXO_DO_CENTRO, raio: 3.0 });

export function tiroNaBoca(p: Projetil): boolean {
    if (p.tipo !== 'tiro') return false;
    if (p.z > ARENA.zCabeca + 1.6) return false;
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
    /**
     * A abertura em que a vida cruzou a metade; -1 enquanto não cruzou.
     *
     * É o que faz as estreias de `mare` e `elevadores` serem RELATIVAS à virada
     * em vez de números fixos — e portanto o que faz a fala do TROCO-63 ("dois
     * padrões novos") ser verdade em qualquer luta, curta ou longa.
     */
    aberturaDaVirada: number;
    projeteis: Projetil[];
    linhaDoDialogo: number;
    versao: number;
}

/**
 * Marca uma abertura nova e devolve o ÍNDICE dela na escalada.
 *
 * As duas coisas que `bocaT` fazia ao mesmo tempo moram aqui separadas: quem
 * chama passa o ciclo da ANIMAÇÃO (que a virada zera de propósito) e recebe de
 * volta o índice do RODÍZIO (que só sobe). Enquanto o rodízio saía do ciclo da
 * animação, a virada devolvia a luta para a abertura 0 e `elevadores` nunca
 * chegava a sair.
 *
 * `visto` é o último ciclo que o chamador já contou; -1 quer dizer "nenhum".
 */
export function marcarAbertura(visto: number, ciclo: number, st: F12State = f12): number {
    if (visto === ciclo) return st.aberturas - 1;
    return st.aberturas++;
}

export const f12: F12State = criarEstado();

function criarEstado(): F12State {
    return {
        fase: 'intro', relogio: 0, bocaT: 0, vida: VIDA_MAXIMA, aberturas: 0,
        ataqueNoAr: null, passouDaVirada: false, aberturaDaVirada: -1, projeteis: [],
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
    { quem: 'irmao', texto: 'Ei! Asa pra ESQUERDA! ...Tá. Você ainda está inteiro. Já é mais do que eu esperava. BIP.' },
    { quem: 'jogador', texto: '...TROCO-64?' },
    { quem: 'irmao', texto: 'Sessenta e TRÊS. O 64 é meu irmão caçula. Ele ganhou uma pista de corrida. Eu, um expediente que não acaba.' },
    { quem: 'irmao', texto: 'Vê aquela cara? Não pergunta de quem é. A boca abre, ela cospe. Desvia e devolve o favor enquanto estiver aberta.' },
    { quem: 'irmao', texto: 'Encosta e arrasta pra voar e atirar. Soltou o dedo, cessou fogo. Ficar parado guarda carga; voltou a se mexer, sai uma rajada.' },
    { quem: 'irmao', texto: 'Eu cubro sua ala. Tenho uma arma, 412 dias de rancor e nenhuma vontade de preencher seu atestado. Bora. BIP.' },
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
