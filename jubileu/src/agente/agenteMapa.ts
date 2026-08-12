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
