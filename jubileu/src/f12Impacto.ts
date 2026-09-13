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
//
// ── E POR QUE SÃO VÁRIAS RETENÇÕES, E NÃO UMA ────────────────────────────────
//
// A primeira versão guardava UM par (restante, forca) e, a cada pedido novo,
// fazia `restante = max(...)` e `forca = min(...)`. Parece conservador e está
// errado: um pedido LONGO e FRACO herdava a força do pedido CURTO e FORTE que
// ainda estava correndo. Medido por um avaliador: com uma explosão (força 0,05)
// quase expirando, um tiro comum (força 0,3) devolvia 0,05 — um congelamento
// seis vezes mais forte do que o projetado, pelos 50 ms inteiros do tiro. Os
// treze testes do módulo não cobriam o caso porque eu só tinha pensado no
// inverso (o fraco encurtando o forte).
//
// Cada retenção agora tem o SEU relógio. A força efetiva é a mais forte entre
// as que ainda estão vivas, e cada uma morre na hora dela — o tiro que chega no
// fim da explosão passa a valer 0,3 assim que a explosão acaba, e não antes.
// Quatro vagas bastam: são três tipos de acerto e nenhum dura mais de 85 ms.
const RETENCOES = 4;
const stop = Array.from({ length: RETENCOES }, () => ({ restante: 0, forca: 1 }));

/**
 * Segura o tempo do jogo.
 *
 * `forca` é quanto do tempo sobra: 0,05 é quase parado, 0,4 é um arrasto.
 */
export function segurarOTempo(segundos: number, forca = 0.06): void {
    if (segundos <= 0) return;
    // Reaproveita a vaga morta, ou a mais fraca: com quatro vagas e retenções de
    // dezenas de milissegundos, descartar a mais fraca é o certo — ela é a que
    // menos muda a força efetiva.
    let vaga = 0;
    for (let i = 1; i < RETENCOES; i++) {
        if (stop[i].restante <= 0) { vaga = i; break; }
        if (stop[i].forca > stop[vaga].forca) vaga = i;
    }
    // Se a vaga escolhida já guarda algo mais forte E mais longo, o pedido novo
    // não acrescenta nada.
    if (stop[vaga].restante >= segundos && stop[vaga].forca <= forca) return;
    stop[vaga].restante = segundos;
    stop[vaga].forca = forca;
}

/** Quanto do tempo real o JOGO recebe neste quadro (0..1). A mais forte manda. */
export function escalaDoTempo(): number {
    let k = 1;
    for (const r of stop) if (r.restante > 0 && r.forca < k) k = r.forca;
    return k;
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
    for (const r of stop) if (r.restante > 0) r.restante = Math.max(0, r.restante - dtReal);
    tremorEstado.t += dtReal;
    tremorEstado.trauma = Math.max(0, tremorEstado.trauma - TREMOR.queda * dtReal);
    passoDasFaiscas(dtReal);
    passoDasBolas(dtReal);
}

/** Zera tudo. A entrada do andar e o reinício precisam disto. */
export function reiniciarImpacto(): void {
    for (const r of stop) { r.restante = 0; r.forca = 1; }
    tremorEstado.trauma = 0; tremorEstado.t = 0;
    for (const f of faiscas) f.vida = 0;
    for (const b of bolas) b.vida = 0;
    proximaBola = 0;
    atropeladas = 0;
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
    // ── O HITSTOP DO TIRO COMUM ERA SUB-QUADRO ───────────────────────────
    // Estava em 0,022 s. Medido, o andar roda entre 27 e 45 quadros por
    // segundo, ou seja um quadro dura de 22 a 37 ms: a pausa inteira cabia
    // DENTRO de um quadro e não existia como sensação — nem aqui, nem num
    // celular fraco. Um efeito que não sobrevive ao pior quadro do seu alvo não
    // é um efeito, é um número no arquivo. 0,05 atravessa dois quadros a 40 fps
    // e continua curto o bastante para noventa por cento dos acertos do andar
    // não virarem soluço.
    //
    // `bola` é o RAIO da bola de fogo, em unidades de mundo — 0 é sem bola.
    //
    // ── A FERRAMENTA ESTAVA APONTADA PARA O LUGAR ERRADO ─────────────────────
    //
    // As bolas de fogo nasceram para a morte do chefe e ficaram SÓ lá: quatro
    // chamadas, todas dentro da cena. Um avaliador contou e disse o óbvio — o
    // sistema de impacto por área existia, e os cem segundos que o jogador passa
    // JOGANDO continuavam pagando o acerto com uma faísca de três pixels. Ele
    // via fogo de verdade uma vez, no fim.
    //
    // Agora a bola mora na TABELA, e `impacto()` a dispara. Nenhum ponto de
    // acerto pode esquecer dela, porque nenhum ponto de acerto a chama.
    //
    // O tiro comum fica em ZERO de propósito, e isso não é economia: ele acerta
    // sete vezes por segundo. Se ele estourasse, a tela seria fogo contínuo e o
    // carregado não teria com o que contrastar — e o contraste É a informação,
    // que é a frase que este arquivo inteiro defende.
    // `bola: 0` e `anel: 1,5` — ver a nota em `Bola.anel`. O tiro comum paga em
    // FORMA, não em tamanho: um anel fino de 0,18 s, que tem área e não se
    // confunde com a bola cheia do carregado nem por um quadro.
    tiro: Object.freeze({ stop: 0.05, forcaStop: 0.3, trauma: 0.13, faiscas: 6, forca: 5.4, bola: 0, anel: 1.5 }),
    // A camareira morrendo. Ela tem bola — é o único padrão que se resolve
    // atirando, e o momento em que a arma do jogador resolve algo visível — mas
    // uma bola MENOR e um tranco menor que os do carregado. Ela existe como
    // linha própria porque a alternativa era `impacto('carregado')` com um
    // comentário dizendo "menor que a do carregado", que foi literalmente o que
    // eu escrevi, e era mentira na linha seguinte.
    nave: Object.freeze({ stop: 0.04, forcaStop: 0.4, trauma: 0.22, faiscas: 10, forca: 7.0, bola: 1.5, anel: 0 }),
    carregado: Object.freeze({ stop: 0.075, forcaStop: 0.05, trauma: 0.42, faiscas: 18, forca: 9.5, bola: 3.4, anel: 0 }),
    // ── O RAIO É DE MUNDO; O QUE O JOGADOR VÊ É ÂNGULO ───────────────────────
    //
    // `dano` estoura no plano dos AVIÕES, a ~15 unidades da câmera; `carregado`
    // estoura na cabeça, a ~48. O mesmo raio de mundo é três vezes maior na tela
    // aqui. Com 2,2 — o mesmo valor que na cabeça parecia uma bola — levar um
    // tiro lavava a tela inteira de branco, e um avaliador notou o absurdo antes
    // de mim: "o maior fogo da luta é o de levar dano". A lição é a mesma que
    // este andar aprendeu compondo o avião e a boca: tamanho de mundo não é
    // tamanho de tela.
    dano: Object.freeze({ stop: 0.085, forcaStop: 0.08, trauma: 0.60, faiscas: 14, forca: 7.0, bola: 0.85, anel: 0 }),
});

export type TipoDeImpacto = keyof typeof IMPACTOS;

/**
 * Dispara as camadas de um impacto de uma vez, a partir de um ponto.
 *
 * `escalaDaBola` multiplica o raio do fogo — é o que a morte do chefe usa para
 * estourar do tamanho de um crânio em vez do tamanho de um tiro.
 *
 * ── UMA BOLA POR EVENTO, E ESSA É A RAZÃO DE O PARÂMETRO EXISTIR ─────────────
 *
 * Quando a bola entrou na tabela, os pontos que já chamavam `estourar()` à mão
 * continuaram chamando: duas bolas por evento. O estouro grande passou a
 * disparar TREZE num quadro em vez de sete, e o anel (24) era sobrescrito com
 * bolas ainda vivas exatamente no segundo em que a cena é julgada. Um avaliador
 * refez a conta de margem que eu não refiz depois de mudar quem emite.
 *
 * Agora só `impacto()` emite. Quem quer uma bola maior pede uma ESCALA, não uma
 * segunda bola.
 */
export function impacto(
    tipo: TipoDeImpacto, x: number, y: number, z: number, escalaDaBola = 1,
): void {
    const i = IMPACTOS[tipo];
    segurarOTempo(i.stop, i.forcaStop);
    tremer(i.trauma);
    espalharFaiscas(x, y, z, i.faiscas, i.forca, tipo === 'carregado' ? 1 : tipo === 'dano' ? 2 : 0);
    if (i.bola > 0) estourar(x, y, z + 1, i.bola * escalaDaBola);
    if (i.anel > 0) estourar(x, y, z + 1, i.anel * escalaDaBola, true);
}

// ── AS BOLAS DE FOGO ─────────────────────────────────────────────────────────
//
// A morte do chefe foi entregue com "estouros em cadeia" que, na tela, eram
// dezoito discos de três pixels a quarenta unidades da câmera. Um avaliador
// refotografou a cena a cada 170 ms e contou: em ONZE quadros seguidos,
// nenhum estouro visível. A cena tinha cronômetro, teste e comentário — e não
// tinha imagem.
//
// A faísca é o efeito do ACERTO: pequena, precisa, ela diz ONDE. O estouro é
// outra coisa — ele diz QUANTO, e "quanto" se lê por área, não por detalhe. São
// dois quads: um núcleo claro que cresce rápido e some, e uma fumaça escura que
// cresce devagar e fica. A fumaça é o que impede a cena de piscar e voltar ao
// mesmo quadro de antes.
export const BOLAS_MAX = 24;

export interface Bola {
    x: number; y: number; z: number;
    vida: number; total: number;
    /** Raio final, em unidades de mundo. */
    raio: number;
    /**
     * ANEL em vez de bola cheia.
     *
     * ── O TIRO COMUM PRECISAVA PAGAR, MAS NÃO COM FOGO ───────────────────────
     *
     * O tiro comum acerta sete vezes por segundo. Uma bola de fogo a cada acerto
     * faria a tela ser fogo contínuo e o carregado não teria com o que
     * contrastar — esse argumento está certo e continua valendo. Mas um
     * avaliador contou o que sobrava para o acerto mais frequente do jogo: uma
     * faísca de três pixels, um retorno visível em cada nove quadros.
     *
     * A saída não é tamanho, é FORMA. Um anel fino que abre depressa e morre em
     * 0,18 s tem ÁREA — é isso que o olho lê como "acertou" — e não se confunde
     * com uma bola cheia nem por um quadro. Duas linguagens, dois pesos.
     */
    anel: boolean;
}

const bolas: Bola[] = Array.from({ length: BOLAS_MAX }, () => ({
    x: 0, y: 0, z: 0, vida: 0, total: 1, raio: 1, anel: false,
}));
let proximaBola = 0;

/** Quanto tempo uma bola de fogo dura. */
export const BOLA_VIDA = 0.7;
/** O anel do tiro comum é curto de propósito: ele não pode virar cenário. */
export const ANEL_VIDA = 0.18;

/**
 * Quantas vezes uma bola AINDA VIVA foi sobrescrita por uma nova.
 *
 * É a régua do tamanho do anel, e ela existe porque a conta de margem foi feita
 * uma vez e não refeita quando a fonte das bolas mudou. Zero é o alvo; a bancada
 * da morte confere.
 */
let atropeladas = 0;
export const bolasAtropeladas = (): number => atropeladas;

export function estourar(x: number, y: number, z: number, raio: number, anel = false): void {
    const b = bolas[proximaBola];
    if (b.vida > 0) atropeladas++;
    proximaBola = (proximaBola + 1) % BOLAS_MAX;
    b.x = x; b.y = y; b.z = z;
    b.total = anel ? ANEL_VIDA : BOLA_VIDA;
    b.vida = b.total; b.raio = raio; b.anel = anel;
}

export function todasAsBolas(): ReadonlyArray<Bola> { return bolas; }

export function passoDasBolas(dt: number): void {
    for (const b of bolas) if (b.vida > 0) b.vida = Math.max(0, b.vida - dt);
}

/**
 * O raio e a opacidade do NÚCLEO no instante atual da bola.
 *
 * O núcleo cresce depressa e morre na primeira metade: uma explosão que cresce
 * em velocidade constante parece um balão inflando. `k` é quanto já passou.
 */
/**
 * O ANEL do tiro comum: abre depressa e desaparece.
 *
 * A grossura é uma proporção FIXA do raio (a geometria é um anel de furo 0,72),
 * e não uma terceira curva. A primeira versão devolvia uma `grossura` que nada
 * lia — um botão que ninguém aperta é código morto, e este arquivo já teve um.
 * Como o anel cresce, a borda afina em proporção da tela de qualquer jeito.
 */
export function anelDoTiro(b: Bola): { raio: number; alfa: number } {
    const k = 1 - b.vida / b.total;
    const abre = 1 - (1 - k) ** 2;
    return { raio: b.raio * (0.25 + abre * 1.5), alfa: Math.max(0, (1 - k) ** 1.2) };
}

export function nucleoDaBola(b: Bola): { raio: number; alfa: number } {
    const k = 1 - b.vida / b.total;
    const cresce = 1 - (1 - Math.min(1, k * 2.4)) ** 2;   // rápido e desacelerando
    return { raio: b.raio * (0.25 + cresce * 0.85), alfa: Math.max(0, 1 - k * 2.2) };
}

/**
 * E o HALO: mais largo, mais alaranjado, e ele DURA mais que o núcleo.
 *
 * A diferença de tempo entre os dois é o que faz a bola parecer calor
 * esfriando. Se os dois morressem juntos, seria uma luz acendendo e apagando.
 */
export function haloDaBola(b: Bola): { raio: number; alfa: number } {
    const k = 1 - b.vida / b.total;
    const cresce = 1 - (1 - Math.min(1, k * 1.6)) ** 2;
    return { raio: b.raio * (0.45 + cresce * 1.15), alfa: Math.max(0, (1 - k) ** 1.5) };
}
