// ── O JUIZ DE TOM — o que decide se uma frase do rascunho soa como o Nilo ──
//
// POR QUE ELE NÃO É UM NLI, que era o desenho anterior:
//
// O juiz por contradição (mDeBERTa) e o zero-shot com rótulos foram medidos
// contra seis defeitos REAIS que o rascunhador produziu, e que nenhuma lista de
// regex tinha visto antes. Placar: 0 de 6, nos dois. As travas de regex também
// fizeram 0 de 6 — elas só pegam o padrão que alguém já viu.
//
// O motivo está nas frases:
//
//     "It's a bit of a bummer, isn't it? The whole 'hotel' thing."
//     "We're all just trapped elevator passengers, right?"
//     "As Nilo, I'd say, 'Well, that's a peculiar hotel, isn't it?'"
//
// Nenhuma contradiz um fato do cânone. Todas são VERDADEIRAS. O que elas
// quebram é o TOM: são falantes, irônicas, literárias — e o Nilo é seco. NLI
// pergunta "isto contradiz aquilo?", e a resposta honesta é "não".
//
// Embedding pergunta outra coisa: "com qual destes dois conjuntos isto se
// parece?". E literário-falante se parece com literário-falante.
//
//     juiz                    CEGAS   falso pos.   custo
//     NLI contradição          0/6       0/3       106 ms
//     zero-shot com rótulos    0/6       0/3        83 ms
//     travas de regex          0/6       0/3         0 ms
//     TOM (all-mpnet-base-v2)  5/6       1/3        10 ms
//
// É a mesma lição de `6b70d067`, quando o córtex motor trocou julgamento por
// LLM por comparação de vetor e foi de 4/7 em 70.000 ms para 5/7 em 811 ms.
// Aqui o mesmo movimento, no mesmo tipo de problema, com o mesmo resultado.
//
// ── O QUE ELE NÃO FAZ, e precisa estar escrito ────────────────────────────
//
// Ele não vê contradição factual. "It all depends on the Owner" passa por aqui
// e é o NLI que pega — por isso o juiz do jogo é EM CAMADAS, e esta é a do
// meio. E ele não vê eco de prompt ("Nilo's line only, no label"), que é
// conserto de string e sai de graça na camada de cima.

/** Uma frase julgada, com o quanto ela destoa e de quem ela se aproximou. */
export type VeredictoDeTom = {
    /** `max(semelhança com as ruins) − max(semelhança com as boas)`. */
    desvio: number;
    /** Acima da margem: a frase soa mais como o que o Nilo NÃO diria. */
    foraDoTom: boolean;
    /**
     * Índice da âncora ruim de que a frase mais se aproximou, ou `-1`.
     *
     * ── POR QUE ISTO PASSOU A SER DEVOLVIDO ──────────────────────────────
     *
     * Ele SEMPRE foi calculado: o `desvio` é `max(ruins) − max(boas)`, e todo
     * `max` tem um argmax. O número saía e o NOME saía junto com o lixo.
     *
     * E é ele que faltava. Medido na bancada, com o LFM2.5 de produção:
     * dizendo só "esta frase está errada" o revisor conserta 2 de 6; dizendo
     * TAMBÉM o que está errado, 4 de 6 — pelos mesmos ~50 s. A informação já
     * existia aqui dentro e era descartada a um passo de quem precisava dela.
     */
    ancoraRuim: number;
};

/**
 * A MARGEM, e por que ela é ZERO.
 *
 * Varrida em 0 / 0,02 / 0,05 / 0,10 contra o conjunto cego: 0 dá 5/6 com um
 * falso positivo, e 0,10 cai para 3/6 sem ganhar precisão nenhuma. Zero
 * significa "empatou, então marca" — e é o lado certo do erro aqui, porque um
 * falso positivo custa uma chamada de revisor (~11,6 s) e um falso NEGATIVO
 * custa uma fala fora do personagem na cara do jogador.
 */
export const FLOOR10_MARGEM_DE_TOM = 0;

/**
 * ÂNCORAS DO QUE SOA COMO ELE.
 *
 * Estas são MINHAS, e isso é uma limitação anotada, não um detalhe: o juiz é
 * tão bom quanto os exemplos. Trocá-las pelas falas do dono do jogo melhora o
 * juiz sem tocar em uma linha de código — e é o MESMO dataset que o LoRA pede,
 * servindo a dois propósitos.
 *
 * Estão em inglês porque é onde o rascunhador escreve e onde o juiz age, antes
 * da tradução. Escrever curto e seco aqui não é estilo: é a definição operante
 * do personagem.
 */
export const FLOOR10_ANCORAS_BOAS: readonly string[] = Object.freeze([
    'Nilo Azevedo. I fixed elevators, before.',
    'The door is there. It does not open for me.',
    'I stopped asking that a while ago.',
    'No. And I have had time to be sure.',
    'I sleep here. There is nowhere else.',
    'You will figure it out, or you will not.',
    'Ask me something I can actually answer.',
    'Years. I stopped counting them.',
]);

/**
 * ÂNCORAS DO QUE NÃO SOA.
 *
 * Cada uma é um modo de falha que este projeto MEDIU num rascunhador de
 * verdade: assistente, entusiasmado, conselheiro, literário, IA, tagarela.
 * Acrescentar aqui é o jeito barato de ensinar o juiz — mas só vale
 * acrescentar o que alguém viu acontecer.
 */
export const FLOOR10_ANCORAS_RUINS: readonly string[] = Object.freeze([
    'I am here to assist you with anything you need.',
    "That's a fascinating question! Let me explain.",
    'I would advise you to remain calm and patient.',
    'What an intriguing predicament this is, a rollercoaster of time and space.',
    'As an AI, I do not have feelings or opinions.',
    'Well, it sure seems that way, does it not? But hey, who knows!',
    'I can only observe and speculate about the mysteries of this place.',
    'It is a bit of a curious situation, is it not, my friend?',
]);

/**
 * O QUE DIZER AO REVISOR, uma linha por âncora ruim, na MESMA ORDEM.
 *
 * ── POR QUE EM INGLÊS, E POR QUE NESTE FORMATO ───────────────────────────
 *
 * O revisor trabalha em inglês (o Bergamot traz de volta), e cada frase aqui
 * entra num molde que já foi medido: `It sounds like <isto>`. Elas são
 * fragmentos de propósito, para caberem nesse molde sem ficar truncadas.
 *
 * ── E POR QUE ELAS DIZEM "SOA COMO", E NÃO "ESTÁ ERRADO PORQUE" ──────────
 *
 * Porque é o que o juiz de tom realmente sabe. Ele não leu regra nenhuma: ele
 * mediu que a frase ficou perto DESTA âncora e longe das boas. A âncora mais
 * próxima é um palpite informado, não um diagnóstico — e num turno em que o
 * palpite estiver errado, um "está errado porque" mandaria o revisor consertar
 * o que não está quebrado. As TRAVAS, essas sim, sabem: lá o texto é
 * afirmativo, porque um regex que casou não é palpite.
 */
export const FLOOR10_PORQUE_RUINS: readonly string[] = Object.freeze([
    'a hotel clerk offering service. Nilo is a trapped guest, not staff, and helps nobody.',
    'a chatbot praising the question and offering to explain. Nilo does not perform enthusiasm.',
    'advice. Nilo is the player\'s equal and never tells them to stay calm or what to do.',
    'a narrator being literary about the situation. Nilo talks plainly about a grey room.',
    'a machine describing itself. Nilo is a human being and never mentions AI or systems.',
    'cheerful filler that says nothing. Nilo is dry, and answers or admits he does not know.',
    'someone marvelling at mysteries from the outside. Nilo lives here; it is not a spectacle to him.',
    'chummy small talk calling the player "my friend". Nilo keeps his distance.',
]);

/**
 * A frase que vai ao revisor, ou `''` quando o juiz não tem o que dizer.
 *
 * Vazio é uma resposta legítima e não um erro: sem âncora vencedora, o revisor
 * recebe o enunciado antigo e trabalha como trabalhava. Inventar um motivo
 * seria pior que não ter nenhum.
 */
export function motivoDoTom(veredicto: VeredictoDeTom): string {
    const i = veredicto.ancoraRuim;
    if (i < 0 || i >= FLOOR10_PORQUE_RUINS.length) return '';
    return `it sounds like ${FLOOR10_PORQUE_RUINS[i]}`;
}

/** Cosseno de dois vetores JÁ normalizados — é o que o embedder devolve. */
export function semelhanca(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
    return s;
}

/**
 * O julgamento, dado o vetor da frase e os vetores das duas âncoras.
 *
 * Fica separado da carga do modelo de propósito: assim a regra é testável sem
 * baixar 110 MB, e o teste prova a REGRA em vez de provar o ONNX.
 */
export function julgarTom(
    vetorDaFrase: readonly number[],
    boas: readonly (readonly number[])[],
    ruins: readonly (readonly number[])[],
    margem: number = FLOOR10_MARGEM_DE_TOM,
): VeredictoDeTom {
    if (boas.length === 0 || ruins.length === 0 || vetorDaFrase.length === 0) {
        // Sem âncoras não há juízo — e não julgar é melhor que julgar no escuro:
        // marcar por engano custa uma chamada de revisor por fala.
        return { desvio: 0, foraDoTom: false, ancoraRuim: -1 };
    }
    // O mesmo laço de antes, guardando o argmax junto com o max. Devolver de
    // qual âncora ela chegou perto não custa uma multiplicação a mais.
    const perto = (conj: readonly (readonly number[])[]) => {
        let max = Number.NEGATIVE_INFINITY;
        let qual = -1;
        for (const [i, v] of conj.entries()) {
            const s = semelhanca(vetorDaFrase, v);
            if (s > max) { max = s; qual = i; }
        }
        return { max, qual };
    };
    const ruim = perto(ruins);
    const desvio = ruim.max - perto(boas).max;
    return { desvio, foraDoTom: desvio > margem, ancoraRuim: ruim.qual };
}
