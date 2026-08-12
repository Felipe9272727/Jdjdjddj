// ── O AGENTE-JOGADOR: A PARTE QUE SABE ANDAR ──────────────────────────────
//
// Pedido do dono do jogo: "vamos fazer um agente jogador, onde ele consiga
// jogar de verdade, eu quero que ele vá pra outros andares com ele".
//
// ── POR QUE ISTO NÃO É O CÉREBRO DO NILO ─────────────────────────────────
//
// O Nilo tem `perceiveFloor10`, e o nome não mente: bounds 22, elevador em
// (0,-10), zonas do Andar 10. Ele é CEGO em qualquer outro andar. Um agente que
// vai do 0 ao 10 não pode herdar isso — precisa de olhos que funcionem em
// qualquer sala, e a única coisa que descreve TODAS as salas do jogo é
// `wallsForState(level, ...)`.
//
// ── POR QUE UMA GRADE, E NÃO "ANDAR NA DIREÇÃO DO ALVO" ──────────────────
//
// `resolveCollision` empurra o corpo para fora da parede, o que faz ele
// DESLIZAR. Isso basta para raspar num canto, e é o que o jogo faz com o
// jogador humano — que tem olhos e desvia sozinho.
//
// Um agente que só anda na direção do alvo fica preso em qualquer concavidade:
// a parede empurra para um lado, o alvo puxa para o outro, e ele vibra no
// mesmo ponto para sempre. É o modo mais comum de um bot parecer burro, e não
// tem nada a ver com inteligência — é falta de plano.
//
// Então aqui existe um plano: uma grade de ocupação tirada das paredes reais e
// um A* em cima dela. O caminho sai antes do primeiro passo, e o corpo só
// executa. A física continua sendo a do jogo — a grade decide PARA ONDE ir, o
// `resolveCollision` decide o que acontece quando ele vai.
import { PR } from '../constants';
import { resolveCollision } from '../physics';

/** Lado da célula, em metros. */
export const CELULA = 0.5;

/**
 * Meia-largura do agente ao testar uma célula. Um pouco MAIOR que o raio real
 * do jogador: um caminho que passa raspando existe na grade e não existe na
 * física, e aí o agente encosta, desliza e perde o caminho. Folga aqui custa
 * alguns caminhos apertados; a falta dela custa o agente travado.
 */
export const FOLGA = PR + 0.1;

export type Ponto = { x: number; z: number };

export type GradeDoAndar = {
    minX: number;
    minZ: number;
    largura: number;
    altura: number;
    /** `true` = dá para ficar de pé aqui. */
    livre: Uint8Array;
};

/**
 * A célula é livre se o corpo, posto no centro dela, não é empurrado por
 * parede nenhuma. Reusar `resolveCollision` em vez de reimplementar a
 * geometria é o que garante que a grade e o jogo concordem: se a física mudar,
 * a grade muda junto, sem ninguém lembrar de atualizar as duas.
 */
function celulaLivre(x: number, z: number, paredes: number[][]): boolean {
    const [nx, nz] = resolveCollision(x, z, FOLGA, paredes);
    return Math.abs(nx - x) < 1e-3 && Math.abs(nz - z) < 1e-3;
}

export function construirGrade(
    paredes: number[][],
    limites: { minX: number; maxX: number; minZ: number; maxZ: number },
): GradeDoAndar {
    const largura = Math.max(1, Math.ceil((limites.maxX - limites.minX) / CELULA));
    const altura = Math.max(1, Math.ceil((limites.maxZ - limites.minZ) / CELULA));
    const livre = new Uint8Array(largura * altura);
    for (let j = 0; j < altura; j += 1) {
        for (let i = 0; i < largura; i += 1) {
            const x = limites.minX + (i + 0.5) * CELULA;
            const z = limites.minZ + (j + 0.5) * CELULA;
            livre[j * largura + i] = celulaLivre(x, z, paredes) ? 1 : 0;
        }
    }
    return { minX: limites.minX, minZ: limites.minZ, largura, altura, livre };
}

/**
 * Até onde o agente monta grade em volta de si, em metros. Uma sala inteira do
 * jogo cabe nisto com sobra, e o teto de 120×120 células mantém o A* barato.
 */
export const RAIO_DA_VISTA = 30;

/**
 * ── O TAMANHO DA GRADE, E O NÚMERO QUE ME ENSINOU A NÃO CHUTAR ───────────
 *
 * Eu tinha escrito `LIMITES_DO_MUNDO = ±30`, um número escolhido por ser
 * "grande o bastante" — e ele quebra calado no dia em que alguém fizer um
 * andar maior. Troquei por "derivar das paredes", que parecia obviamente
 * certo, e medi:
 *
 *     andar 3 → grade de 61 × 200037 células. Doze MILHÕES.
 *
 * O Andar 3 é o corredor de parkour, e `F3_CORRIDOR_FAR_Z = 100000` está lá
 * de propósito: "effectively infinite — the climb never ends". Um único
 * segmento honesto do jogo destrói qualquer plano de "mapear o andar todo".
 *
 * A lição é que a pergunta estava errada. O agente não precisa do andar
 * inteiro — precisa do que dá para enxergar daqui, que é o que um jogador
 * também tem. Então a grade é a interseção de duas coisas:
 *
 *     o que as paredes delimitam   ∩   uma janela de RAIO_DA_VISTA em volta dele
 *
 * Andar pequeno continua com grade pequena (o convés do 7 não vira 120×120);
 * andar infinito vira uma janela finita; andar futuro de qualquer tamanho
 * funciona sem ninguém mexer aqui. O preço é que um alvo a mais de 30 m não
 * entra no plano — e o preço é justo, porque andando ele reposiciona a janela.
 */
export function limitesDaVista(
    paredes: number[][],
    de: Ponto,
    raio = RAIO_DA_VISTA,
    folga = FOLGA * 2,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const janela = {
        minX: de.x - raio, maxX: de.x + raio, minZ: de.z - raio, maxZ: de.z + raio,
    };
    if (paredes.length === 0) return janela;
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const [ax, az, bx, bz] of paredes) {
        minX = Math.min(minX, ax, bx);
        maxX = Math.max(maxX, ax, bx);
        minZ = Math.min(minZ, az, bz);
        maxZ = Math.max(maxZ, az, bz);
    }
    return {
        minX: Math.max(minX - folga, janela.minX),
        maxX: Math.min(maxX + folga, janela.maxX),
        minZ: Math.max(minZ - folga, janela.minZ),
        maxZ: Math.min(maxZ + folga, janela.maxZ),
    };
}

export function paraCelula(g: GradeDoAndar, p: Ponto): { i: number; j: number } {
    return {
        i: Math.floor((p.x - g.minX) / CELULA),
        j: Math.floor((p.z - g.minZ) / CELULA),
    };
}

export function paraMundo(g: GradeDoAndar, i: number, j: number): Ponto {
    return { x: g.minX + (i + 0.5) * CELULA, z: g.minZ + (j + 0.5) * CELULA };
}

function dentro(g: GradeDoAndar, i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < g.largura && j < g.altura;
}

export function livreEm(g: GradeDoAndar, i: number, j: number): boolean {
    return dentro(g, i, j) && g.livre[j * g.largura + i] === 1;
}

/**
 * A célula livre mais próxima. Existe porque o ponto de partida REAL do
 * jogador pode cair numa célula marcada como ocupada — ele nasce encostado
 * numa parede, ou a folga da grade é maior que a do corpo. Sem isto o A*
 * responderia "não há caminho" no primeiro quadro, e o agente ficaria parado
 * achando que o mundo é sólido.
 */
export function celulaLivreMaisProxima(
    g: GradeDoAndar,
    p: Ponto,
    raioMax = 12,
): { i: number; j: number } | null {
    const alvo = paraCelula(g, p);
    if (livreEm(g, alvo.i, alvo.j)) return alvo;
    for (let r = 1; r <= raioMax; r += 1) {
        for (let dj = -r; dj <= r; dj += 1) {
            for (let di = -r; di <= r; di += 1) {
                if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
                const i = alvo.i + di;
                const j = alvo.j + dj;
                if (livreEm(g, i, j)) return { i, j };
            }
        }
    }
    return null;
}

/**
 * ── O QUE ELE ALCANÇA DAQUI ───────────────────────────────────────────────
 *
 * Uma inundação a partir de um ponto: devolve a máscara das células que o
 * agente consegue atingir. Uma passada, não um A* por célula — a diferença
 * entre 50 segundos e 50 milissegundos quando se quer saber o alcance inteiro.
 *
 * Isto não é só otimização de teste: é uma primitiva de PERCEPÇÃO. "Até onde
 * eu chego a pé daqui" é a pergunta que separa "a porta está trancada" de "eu
 * não sei o caminho", e um agente que não sabe distinguir as duas fica batendo
 * na parede achando que está resolvendo.
 */
export function alcancaveis(g: GradeDoAndar, de: Ponto): Uint8Array {
    const marca = new Uint8Array(g.largura * g.altura);
    const inicio = celulaLivreMaisProxima(g, de);
    if (!inicio) return marca;
    const fila: number[] = [inicio.j * g.largura + inicio.i];
    marca[fila[0]] = 1;
    for (let cabeca = 0; cabeca < fila.length; cabeca += 1) {
        const atual = fila[cabeca];
        const ai = atual % g.largura;
        const aj = Math.floor(atual / g.largura);
        for (const [di, dj] of VIZINHOS) {
            const i = ai + di;
            const j = aj + dj;
            if (!livreEm(g, i, j)) continue;
            if (di !== 0 && dj !== 0 && (!livreEm(g, ai + di, aj) || !livreEm(g, ai, aj + dj))) {
                continue;
            }
            const id = j * g.largura + i;
            if (marca[id]) continue;
            marca[id] = 1;
            fila.push(id);
        }
    }
    return marca;
}

/**
 * O ponto alcançável mais distante de onde ele está — a FRONTEIRA.
 *
 * É a resposta honesta para "e agora?" num andar cuja saída o agente não
 * conhece: vá para o lugar mais longe que dá para andar daqui. É o que um
 * jogador humano faz numa sala nova, e não depende de saber nada sobre a sala.
 *
 * Estava escrito dentro do teste. Uma primitiva de percepção morando no teste
 * é uma que o jogo não pode usar — então mudou de lugar.
 */
export function maisLonge(g: GradeDoAndar, de: Ponto): { p: Ponto; d: number } {
    const alcance = alcancaveis(g, de);
    let melhor = { p: { ...de }, d: 0 };
    for (let j = 0; j < g.altura; j += 1) {
        for (let i = 0; i < g.largura; i += 1) {
            if (!alcance[j * g.largura + i]) continue;
            const p = paraMundo(g, i, j);
            const d = Math.hypot(p.x - de.x, p.z - de.z);
            if (d > melhor.d) melhor = { p, d };
        }
    }
    return melhor;
}

const VIZINHOS: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    // Diagonais custam √2. Sem elas o caminho vira escada e o corpo anda em
    // ziguezague — feio de ver e mais longo do que precisa.
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* da posição atual até o alvo. Devolve os pontos do MUNDO, já em metros.
 *
 * Lista vazia = não há caminho. É informação útil, não falha: num andar onde a
 * porta ainda está trancada, "não há caminho" é a resposta certa e o agente
 * precisa saber disso para tentar outra coisa em vez de bater na parede.
 */
export function caminho(g: GradeDoAndar, de: Ponto, ate: Ponto): Ponto[] {
    const inicio = celulaLivreMaisProxima(g, de);
    const fim = celulaLivreMaisProxima(g, ate);
    if (!inicio || !fim) return [];

    const n = g.largura * g.altura;
    const idx = (i: number, j: number) => j * g.largura + i;
    const custo = new Float64Array(n).fill(Infinity);
    const veioDe = new Int32Array(n).fill(-1);
    const fechado = new Uint8Array(n);
    const h = (i: number, j: number) => Math.hypot(i - fim.i, j - fim.j);

    const inicioId = idx(inicio.i, inicio.j);
    custo[inicioId] = 0;
    // Fila simples: o andar inteiro cabe em poucos milhares de células, então
    // varrer o aberto custa menos que manter um heap — e é código que se lê.
    const aberto: number[] = [inicioId];

    while (aberto.length > 0) {
        let melhor = 0;
        for (let k = 1; k < aberto.length; k += 1) {
            const a = aberto[k];
            const b = aberto[melhor];
            if (custo[a] + h(a % g.largura, Math.floor(a / g.largura))
                < custo[b] + h(b % g.largura, Math.floor(b / g.largura))) melhor = k;
        }
        const atual = aberto.splice(melhor, 1)[0];
        if (fechado[atual]) continue;
        fechado[atual] = 1;

        const ai = atual % g.largura;
        const aj = Math.floor(atual / g.largura);
        if (ai === fim.i && aj === fim.j) break;

        for (const [di, dj, peso] of VIZINHOS) {
            const i = ai + di;
            const j = aj + dj;
            if (!livreEm(g, i, j)) continue;
            // Diagonal só passa se os DOIS lados também estiverem livres —
            // senão o caminho corta a quina de uma parede, que a física do jogo
            // não deixa acontecer.
            if (di !== 0 && dj !== 0 && (!livreEm(g, ai + di, aj) || !livreEm(g, ai, aj + dj))) {
                continue;
            }
            const id = idx(i, j);
            const novo = custo[atual] + peso;
            if (novo < custo[id]) {
                custo[id] = novo;
                veioDe[id] = atual;
                aberto.push(id);
            }
        }
    }

    const fimId = idx(fim.i, fim.j);
    if (custo[fimId] === Infinity) return [];
    const pontos: Ponto[] = [];
    for (let id: number = fimId; id !== -1; id = veioDe[id]) {
        pontos.push(paraMundo(g, id % g.largura, Math.floor(id / g.largura)));
        if (id === inicioId) break;
    }
    return pontos.reverse();
}
