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
    | 'vitoria'
    | 'derrota'
    | 'despedida';   // o jogador escolheu o elevador

// ── A CABEÇA ─────────────────────────────────────────────────────────────────
export const VIDA_MAXIMA = 100;
/** Abaixo disto ela desbloqueia os dois ataques novos. */
export const LIMIAR_DA_VIRADA = VIDA_MAXIMA / 2;

export const VIDAS_DO_JOGADOR = 4;

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
    fechada: 1.15,
    abrindo: 0.55,
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
    abrePorSegundo: 2.5,
    velocidadeZ: 15.5,
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
    velocidade: 9.0,
    /** Radianos por segundo de correção. Este número É a dificuldade. */
    curvaPorSegundo: 2.15,
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
    velocidadeZ: 5.2,
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
    velocidadeZ: 7.5,
    /** Meia-largura da fresta. Cabe um avião com folga, e é isso mesmo. */
    fresta: 1.55,
    /**
     * A fresta passeia por X neste seno.
     *
     * O teto é `ARENA.x - fresta` (3,65 com os números de hoje): passar disso
     * põe a saída FORA da arena, e o ataque vira indesviável sem aviso nenhum —
     * a onda chegaria com a única passagem num lugar onde o avião não pode
     * estar. É por isso que o teste cobra esta relação e não o número solto.
     */
    passeioAmp: 3.1,
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
    faixas: 5,
    velocidadeZ: 6.4,
    /** Quanto cada cabine desce por segundo enquanto avança. */
    quedaPorSegundo: 2.4,
    raio: 0.85,
});

export const xDaFaixa = (i: number): number =>
    (-1 + (2 * i) / (ELEVADORES.faixas - 1)) * ARENA.x * 0.82;

export function nascerElevadores(faixaVazia: number): Projetil[] {
    const vazia = ((Math.floor(faixaVazia) % ELEVADORES.faixas) + ELEVADORES.faixas) % ELEVADORES.faixas;
    const fora: Projetil[] = [];
    for (let i = 0; i < ELEVADORES.faixas; i++) {
        if (i === vazia) continue;
        fora.push({
            id: novoId(), tipo: 'elevadores',
            x: xDaFaixa(i), y: ARENA.yAlto + 1.2, z: ARENA.zCabeca + 2,
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
    raio: 0.30,
    /** Segundos entre tiros. */
    cadencia: 0.14,
    dano: 1.6,
    /** O irmão atira mais devagar e mais fraco: ele é ala, não protagonista. */
    cadenciaIrmao: 0.34,
    danoIrmao: 1.0,
});

export function nascerTiro(x: number, y: number, de: 'jogador' | 'irmao'): Projetil {
    return {
        id: novoId(), tipo: 'tiro', x, y, z: ARENA.zNave - 0.6,
        vx: 0, vy: 0, vz: -TIRO.velocidade,
        r: TIRO.raio, t: 0, de,
    };
}

// ── A NAVE (a mesma física para o jogador e para o irmão) ─────────────────────
export interface Nave {
    x: number; y: number;
    vx: number; vy: number;
    /** Inclinação visual, em radianos: ela SEGUE a velocidade, não o comando. */
    rolagem: number;
    /** Segundos de invencibilidade depois de levar um toque. */
    piscando: number;
    vidas: number;
    /** Tempo até o próximo tiro sair. */
    recarga: number;
}

export const NAVE = Object.freeze({
    aceleracao: 46,
    /** Atrito seco: sem isso a nave patina e o desvio fica impreciso. */
    atrito: 7.2,
    velocidadeMaxima: 11.5,
    raio: 0.62,
    /** Depois de um toque, este tanto de segundos sem poder levar outro. */
    invencivel: 1.6,
    rolagemMaxima: 0.85,
});

export function novaNave(x: number, y: number, vidas = VIDAS_DO_JOGADOR): Nave {
    return { x, y, vx: 0, vy: 0, rolagem: 0, piscando: 0, vidas, recarga: 0 };
}

/**
 * Um passo da nave.
 *
 * `mx`/`my` são o comando, de -1 a 1. O atrito é aplicado de forma
 * INDEPENDENTE do comando, e não como "se não há comando, freia": assim
 * inverter a direção freia de verdade, que é o que faz uma nave de bullet-hell
 * parecer precisa em vez de escorregadia.
 */
export function passoDaNave(n: Nave, mx: number, my: number, dt: number): void {
    const d = Math.min(dt, 0.05);
    n.vx += mx * NAVE.aceleracao * d;
    n.vy += my * NAVE.aceleracao * d;
    const k = Math.max(0, 1 - NAVE.atrito * d);
    n.vx *= k; n.vy *= k;
    const v = Math.hypot(n.vx, n.vy);
    if (v > NAVE.velocidadeMaxima) {
        n.vx = (n.vx / v) * NAVE.velocidadeMaxima;
        n.vy = (n.vy / v) * NAVE.velocidadeMaxima;
    }
    n.x += n.vx * d; n.y += n.vy * d;
    const preso = dentroDaArena(n.x, n.y);
    if (preso.x !== n.x) n.vx = 0;
    if (preso.y !== n.y) n.vy = 0;
    n.x = preso.x; n.y = preso.y;
    // A rolagem segue a velocidade lateral, com atraso — é o que dá peso.
    const alvo = Math.max(-1, Math.min(1, -n.vx / NAVE.velocidadeMaxima)) * NAVE.rolagemMaxima;
    n.rolagem += (alvo - n.rolagem) * Math.min(1, d * 9);
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
 * O Y SAI DA CABEÇA, e não é um número solto: a boca fica 2,5 abaixo do centro
 * dela (o grupo da boca está em -1,25 local, com escala 2). Escrever o 5,1 na
 * mão era o jeito garantido de mover a cabeça um dia e deixar a hitbox para
 * trás — e uma hitbox que não está onde a boca está é a pior coisa que um chefe
 * pode ter, porque o jogador não tem como descobrir.
 */
export const BOCA_ALVO = Object.freeze({ x: 0, y: ALTURA_DA_CABECA - 2.5, raio: 3.0 });

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
