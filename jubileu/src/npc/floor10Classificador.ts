// ── O VETOR ESCOLHE OS CANDIDATOS, O QWEN DESEMPATA ───────────────────────
//
// A decisão é do dono do jogo, sobre três caminhos que eu pus na bancada:
//
//   A) vetor sozinho
//   B) vetor, e o Qwen só quando a margem é apertada
//   C) o vetor entrega os 3 mais próximos e o Qwen escolhe entre eles
//
// Ele escolheu o C, por recomendação minha. A MEDIÇÃO DERRUBOU A MINHA
// RECOMENDAÇÃO e devolveu a razão para a ideia original dele:
//
//     A) vetor sozinho .............. 5/7 ·   838 ms
//     B) vetor + qwen se apertado ... 6/7 ·  4761 ms · chamou o qwen 3x
//     C) qwen entre os 3 ............ 4/7 ·  9763 ms   <- o pior
//
// POR QUE O C PERDE. O Qwen não só conserta: ele também ESTRAGA. Duas vezes o
// vetor deu a resposta certa com folga — `self` com margem 0,224, `player`
// com 0,140 — e o Qwen, obrigado a opinar, trocou por `north-side` e `self`.
// Ganhou um caso e perdeu dois.
//
// O B ganha porque PROTEGE a resposta confiante. Só chama o desempate quando o
// vetor está em dúvida, que é exatamente onde o vetor erra (os dois erros
// tiveram margem 0,014 e 0,040). O mecanismo é esse, não o limiar: gastar o
// segundo modelo só onde o primeiro admite não saber.
//
// Fica registrado que eu argumentei pelo C dizendo que ele "ataca a causa". A
// causa que eu descrevi era real — a mania do modelo vencendo a frase — mas
// eu não previ que ela também atropelaria os acertos do vetor. O argumento
// era bom e a conclusão era errada; sete casos de medição valeram mais.
//
// ── ESTE MÓDULO É PURO ────────────────────────────────────────────────────
//
// Aqui não se carrega modelo nem se chama rede. Entra um vetor de pensamento
// e os vetores dos rótulos, sai um ranking. Assim o teste mede a decisão sem
// baixar 333 MB, e o mesmo código serve à bancada e ao jogo.
import type { Floor10MotorTarget } from './floor10MotorCortex';

export type VetorDoRotulo = {
    alvo: Floor10MotorTarget;
    /** Já normalizado: o cosseno vira produto escalar. */
    v: readonly number[];
};

export type CandidatoDoMotor = {
    alvo: Floor10MotorTarget;
    /** Cosseno com a melhor redação deste alvo. */
    nota: number;
};

/** Quantos candidatos vão para o desempate. Três: o suficiente para o certo
 *  estar entre eles, poucos o bastante para a resposta ser curta. */
export const CANDIDATOS_DO_MOTOR = 3;

/** Abaixo disto ninguém se parece com nada — devolve lista vazia. */
export const PISO_DO_MOTOR = 0.30;

export function normalizar(v: readonly number[]): number[] {
    let soma = 0;
    for (const x of v) soma += x * x;
    const n = Math.sqrt(soma) || 1;
    return v.map((x) => x / n);
}

export function cosseno(a: readonly number[], b: readonly number[]): number {
    const n = Math.min(a.length, b.length);
    let s = 0;
    for (let i = 0; i < n; i += 1) s += (a[i] ?? 0) * (b[i] ?? 0);
    return s;
}

/**
 * O RANKING. Cada alvo vale a nota da sua MELHOR redação — as redações são
 * jeitos diferentes de dizer a mesma coisa, então a pior não deve puxar o
 * alvo para baixo.
 */
export function ranquearAlvos(
    pensamento: readonly number[],
    rotulos: readonly VetorDoRotulo[],
): CandidatoDoMotor[] {
    const melhor = new Map<Floor10MotorTarget, number>();
    for (const r of rotulos) {
        const nota = cosseno(pensamento, r.v);
        const atual = melhor.get(r.alvo);
        if (atual === undefined || nota > atual) melhor.set(r.alvo, nota);
    }
    return [...melhor.entries()]
        .map(([alvo, nota]) => ({ alvo, nota }))
        .sort((a, b) => b.nota - a.nota);
}

/**
 * Os candidatos que vão ao desempate.
 *
 * Lista VAZIA quando nem o primeiro passa do piso: aí não há o que desempatar
 * e o motor não produz plano. Sem plano o corpo mantém o que fazia — que é a
 * falha segura, e a que a bancada mostrou ser a única aceitável (raspar um
 * alvo de um texto duvidoso põe o Nilo andando para o lugar errado com
 * convicção).
 */
export function candidatosDoMotor(
    pensamento: readonly number[],
    rotulos: readonly VetorDoRotulo[],
    quantos = CANDIDATOS_DO_MOTOR,
): Floor10MotorTarget[] {
    const placar = ranquearAlvos(pensamento, rotulos);
    if (placar.length === 0 || (placar[0]?.nota ?? 0) < PISO_DO_MOTOR) return [];
    return placar.slice(0, Math.max(1, quantos)).map((c) => c.alvo);
}

/**
 * A margem entre o primeiro e o segundo. Não decide nada aqui — vai para a
 * caixa-preta, porque é o número que diz se o vetor estava seguro ou no chute,
 * e é ele que eu vou querer olhar quando algo sair errado no aparelho dele.
 *
 * (Nos sete casos medidos os dois ERROS tiveram margem 0,014 e 0,040; mas um
 * ACERTO teve 0,001. Sete amostras não bastam para virar limiar, então este
 * número é diagnóstico, não regra.)
 */
export function margemDoMotor(placar: readonly CandidatoDoMotor[]): number {
    if (placar.length < 2) return 1;
    return (placar[0]?.nota ?? 0) - (placar[1]?.nota ?? 0);
}

// ── int8 COM ESCALA ───────────────────────────────────────────────────────
// Mesmo formato do cânone (`floor10MemoriaVetores`): 768 bytes por vetor em
// vez de 3 KB, e a diferença no cosseno fica na quarta casa.

export function desempacotar(base64: string, escala: number): number[] {
    const bruto = globalThis.atob(base64);
    const saida = new Array<number>(bruto.length);
    for (let i = 0; i < bruto.length; i += 1) {
        // charCodeAt dá 0..255; int8 com sinal precisa da volta em 128.
        const b = bruto.charCodeAt(i);
        saida[i] = ((b > 127 ? b - 256 : b)) * escala;
    }
    return saida;
}
