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
    | 'neutra' | 'sorriso' | 'sorrisoIronico' | 'deboche' | 'falando1' | 'falando2'
    | 'feliz' | 'empolgado' | 'bravo' | 'irritado' | 'surpreso' | 'assustado'
    | 'triste' | 'desanimado' | 'confuso' | 'pensativo' | 'zangado' | 'provocando';

export interface Ponto { x: number; y: number }

export interface Forma {
    /** Contorno fechado, normalizado em x,y ∈ [-1,1]. Vazio quando é só traço. */
    caminho: Ponto[];
    /** Traço aberto — as bocas que são uma linha só (neutra, sorriso, triste…). */
    traco: Ponto[];
    /** Boca ABERTA se preenche de tinta; fechada se é só linha. */
    cheia: boolean;
    /** Quantos dentes, distribuídos na largura. 0 = sem dentes. */
    dentes: number;
    /** Dentes pontudos (zigue-zague de vilão) em vez de retos. */
    presas: boolean;
    /** Língua de fora — a boca "provocando" da ficha. */
    lingua: boolean;
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
export const TORTO = 0.16;

/**
 * Arco de parábola de `-1..1`, com flecha `f` (positiva sobe nas pontas) e
 * `torto` erguendo a ponta direita (o canto da boca do sorriso irônico).
 */
function curva(f: number, n = 9, largura = 1, torto = TORTO): Ponto[] {
    const p: Ponto[] = [];
    for (let i = 0; i <= n; i++) {
        const u = -1 + (2 * i) / n;
        p.push({ x: u * largura, y: f * (1 - u * u) + torto * u });
    }
    return p;
}
/** Lente: dois arcos costurados. É a forma de toda boca aberta desta ficha. */
function lente(largura: number, alto: number, baixo: number, n = 10, torto = TORTO): Ponto[] {
    const cima = curva(alto, n, largura, torto);
    const baixoP = curva(-baixo, n, largura, torto).reverse();
    return [...cima, ...baixoP];
}

const F = (
    caminho: Ponto[], traco: Ponto[], cheia: boolean,
    dentes = 0, presas = false, lingua = false, inclinacao = 0,
): Forma => ({ caminho, traco, cheia, dentes, presas, lingua, inclinacao });

/**
 * As dezoito bocas da ficha, na ordem em que ele as desenhou.
 *
 * Os números saíram de LER o desenho dele, não de inventar: as bocas de cima são
 * traços finos e fechados, a fileira do meio é aberta e cheia de dente, e a de
 * baixo volta a ser traço, salvo o "zangado" e o "provocando".
 */
// ── A INCLINAÇÃO ENCOLHEU PELA METADE ────────────────────────────────────────
// Antes do `torto`, quem fazia o sorriso parecer irônico era GIRAR a forma
// inteira. Agora são os dois juntos, e juntos eles brigavam: o `sorrisoIronico`
// (o desenho que mais aparece, porque é o repouso) somava 0,16 de cisalhamento a
// 9° de giro sobre 1,56 de largura e saía uma RISCA ATRAVESSADA na cara — na
// foto parecia cicatriz, ou cigarro. O cisalhamento é o que faz o canto subir;
// o giro virou tempero.
export const BOCAS: Readonly<Record<NomeDaBoca, Forma>> = Object.freeze({
    // ── fileira 1 da ficha: o registro do dia a dia ──────────────────────────
    neutra:         F([], curva(0.00, 5, 0.52), false, 0, false, false, 0),
    sorriso:        F([], curva(-0.22, 9, 0.58), false, 0, false, false, 0),
    // O repouso é o desenho mais visto do personagem: estreito, boca pequena, o
    // canto direito erguido pelo `torto` e mais nada por cima.
    sorrisoIronico: F([], curva(-0.24, 9, 0.56), false, 3, false, false, -3),
    deboche:        F(lente(0.66, 0.10, 0.30), [], true, 5, false, false, -6),
    falando1:       F(lente(0.34, 0.16, 0.16), [], true, 0, false, false, -2),
    falando2:       F(lente(0.50, 0.30, 0.26), [], true, 0, false, false, -1),

    // ── fileira 2: as emoções grandes ────────────────────────────────────────
    feliz:          F(lente(0.76, 0.06, 0.46), [], true, 6, false, false, 0),
    empolgado:      F(lente(0.80, 0.08, 0.50), [], true, 7, true, false, 0),
    bravo:          F(lente(0.66, 0.26, 0.10), [], true, 5, false, false, 0),
    irritado:       F(lente(0.58, 0.30, 0.06), [], true, 4, true, false, 5),
    surpreso:       F(lente(0.30, 0.36, 0.36), [], true, 0, false, false, 0),
    assustado:      F(lente(0.34, 0.48, 0.22), [], true, 3, true, false, 0),

    // ── fileira 3: o registro baixo ──────────────────────────────────────────
    triste:         F([], curva(0.20, 9, 0.54), false, 0, false, false, 0),
    desanimado:     F([], curva(0.16, 9, 0.56), false, 2, false, false, -3),
    confuso:        F([], curva(0.10, 7, 0.38), false, 0, false, false, -7),
    pensativo:      F([], curva(-0.06, 5, 0.34), false, 0, false, false, 8),
    zangado:        F(lente(0.70, 0.14, 0.14), [], true, 8, false, false, 0),
    provocando:     F(lente(0.50, 0.14, 0.28), [], true, 0, false, true, -4),
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
// Nenhum passo repete o vizinho, INCLUSIVE na volta do ciclo — senão, uma vez a
// cada quatro quadros, o desenho ficava parado por 1/4 de segundo e voltava o
// defeito em miniatura.
// O `sorrisoIronico` no meio do ciclo normal não é enfeite: é o quadro FECHADO
// que faz leitura de consoante em desenho animado, e de quebra é o sorriso
// torto dele piscando no meio da própria fala.
const FALA_NORMAL: readonly NomeDaBoca[] = ['falando1', 'falando2', 'sorrisoIronico', 'deboche'];
const FALA_ACENTO: readonly NomeDaBoca[] = ['deboche', 'empolgado', 'falando2', 'surpreso'];

export function bocaDaNota(indiceDaNota: number, acento: boolean, quadroNaNota = 0): NomeDaBoca {
    const ciclo = acento ? FALA_ACENTO : FALA_NORMAL;
    // A nota entra como FASE: notas seguidas não começam na mesma boca, senão o
    // ciclo vira um piscar regular — o defeito que ele apontou, só que mais
    // rápido.
    const i = Math.floor(indiceDaNota) + Math.max(0, Math.floor(quadroNaNota));
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
        case 'quaseLaEmCima':   return 'sorriso';       // vantagem confortável
        case 'perdeuOPrimeiro': return 'zangado';       // dentes trincados
        case 'perdeuOUltimo':   return 'triste';
        case 'tonto':           return 'confuso';
        case 'pensando':        return 'pensativo';
        case 'confuso':         return 'desanimado';
        case 'vitorioso':       return 'empolgado';
        case 'derrotado':       return 'neutra';        // a cara de quem já era
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
    return bocaDaNota(i, gritando, quadroDaBoca(t));
}
