// ── OS DOZE DESTINOS, ESCRITOS COMO ALGUÉM OS DIRIA ───────────────────────
//
// O motor deixou de perguntar ao modelo "escreva `west-side`". Agora ele
// COMPARA o pensamento do Nilo com estas frases e fica com a mais parecida.
//
// POR QUE ISSO EXISTE, em uma linha: sob a gramática GBNF, seis modelos de
// cinco famílias colapsaram num alvo só — o melhor <=1B que há (MiniCPM5-1B)
// respondeu `west-side` nos sete pensamentos reais do dono do jogo. Não é
// falta de inteligência: a gramática obriga o alvo a sair no PRIMEIRO token,
// antes de qualquer leitura, e aí vence a mania do modelo, não a frase.
//
// Comparar vetores não tem primeiro token. O ranking é sobre a frase inteira,
// então depende dela por construção. Medido: 5/7 contra 4/7, e 811 ms contra
// 70.000 ms.
//
// ── A REGRA PARA EDITAR ESTE ARQUIVO ─────────────────────────────────────
//
// `west-side` não quer dizer nada para um modelo de linguagem; a FRASE que
// alguém escreveria querendo aquilo, sim. Então cada rótulo é um punhado de
// redações em primeira pessoa, do jeito que o Nilo escreve — porque é com o
// texto dele que elas vão ser comparadas.
//
// Mexeu aqui? Rode `node tools/f10-motor-vetores.mjs`. Se esquecer, o jogo
// percebe pelo hash e recalcula sozinho — mais lento, mas nunca errado.
import type { Floor10MotorTarget } from './floor10MotorCortex';

export type RotuloDoMotor = {
    alvo: Floor10MotorTarget;
    /** As redações. A mais parecida com o pensamento é a que vale. */
    frases: readonly string[];
};

export const FLOOR10_ROTULOS: readonly RotuloDoMotor[] = [
    {
        alvo: 'player',
        frases: [
            'I walk up to the other person and get close to him.',
            'I approach the player standing in the room.',
            'I go right up to him.',
        ],
    },
    {
        alvo: 'elevator',
        frases: [
            'I move toward the elevator doors.',
            'I go look at the elevator at the end of the floor.',
            'I walk to the lift and put my hand on it.',
        ],
    },
    // ── OS DOIS ALVOS DA SALA TRANCADA ───────────────────────────────────
    // Só existem quando há prisão (`availableMotorTargets` os inclui apenas
    // com `prison`), mas os vetores vão sempre — filtrar é trabalho de quem
    // ranqueia, e um rótulo faltando é um alvo que o Nilo nunca alcança.
    // Foi um teste que pegou os dois: eu não sabia que existiam.
    {
        alvo: 'nearest-device',
        frases: [
            'I go to the nearest plate or lever and put my weight on it.',
            'I walk over to the closest device on the floor.',
            'I move to the pressure plate near me and hold it down.',
        ],
    },
    {
        alvo: 'active-device',
        frases: [
            'I go to the lever that is already glowing and hold it.',
            'I move to the device that is currently active.',
            'I walk to the one that is lit up and press it with him.',
        ],
    },
    {
        alvo: 'room-center',
        frases: [
            'I walk to the middle of the room.',
            'I move to the centre of the floor.',
        ],
    },
    {
        alvo: 'north-side',
        frases: [
            'I move toward the north wall of the room.',
            'I head to the north side of the floor.',
        ],
    },
    {
        alvo: 'south-side',
        frases: [
            'I move toward the south wall of the room.',
            'I head to the south side of the floor.',
        ],
    },
    {
        alvo: 'east-side',
        frases: [
            'I move toward the east wall of the room.',
            'I head to the east side of the floor.',
        ],
    },
    {
        alvo: 'west-side',
        frases: [
            'I move toward the west wall of the room.',
            'I head to the west side of the floor.',
        ],
    },
    {
        alvo: 'self',
        frases: [
            'I stay where I am and do not move at all.',
            'I stand still and only listen to the room.',
            'I do not move; I just watch.',
        ],
    },
    {
        alvo: 'ahead',
        frases: [
            'I walk straight forward, ahead of where I am facing.',
            'I move forward a few steps.',
        ],
    },
    {
        alvo: 'behind',
        frases: [
            'I step backwards, away from what is in front of me.',
            'I back off behind me.',
        ],
    },
    {
        alvo: 'to-my-left',
        frases: [
            'I take steps to my left side.',
            'I move sideways to the left.',
            'I take five steps to my left.',
        ],
    },
    {
        alvo: 'to-my-right',
        frases: [
            'I take steps to my right side.',
            'I move sideways to the right.',
            'I take five steps to my right.',
        ],
    },
];

/**
 * O texto que vai para o embedding, no formato que o embeddinggemma espera.
 *
 * O prefixo não é enfeite: medido no `floor10Memoria`, ele levou o acerto do
 * cânone de 9/12 para 11/12. Mesmo modelo, mesmo texto, só o prefixo.
 */
export function textoDoRotulo(frase: string): string {
    return `title: movement | text: ${frase}`;
}

/** O pensamento do Nilo, do outro lado da comparação. */
export function textoDoPensamento(pensamento: string): string {
    return `task: search result | query: ${pensamento.slice(0, 600)}`;
}

/** FNV-1a — detecta rótulo editado sem a ferramenta ter rodado. */
export function hashDoRotulo(frase: string): number {
    let h = 0x811c9dc5;
    const texto = textoDoRotulo(frase);
    for (let i = 0; i < texto.length; i += 1) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}
