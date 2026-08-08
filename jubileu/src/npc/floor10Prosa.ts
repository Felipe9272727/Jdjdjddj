// ── O TRADUTOR MUDA DE LADO ───────────────────────────────────────────────
//
// O desenho é do dono do jogo:
//
//   "o lfm fala, vou andar 5 passos a esquerda, e o motor traduz em movimento,
//    a vontade vai ficar jogando como se fosse um RPG de texto"
//
// A parte que eu tinha entendido errado é DE QUEM é o trabalho de traduzir.
// Até aqui a gramática GBNF obrigava o modelo a falar a língua da máquina —
// `approach`, `player`, `west-side` — como os PRIMEIROS tokens da resposta,
// antes de qualquer raciocínio. Medido na bancada, com os sete pensamentos
// reais dele, isso destrói três modelos de duas famílias:
//
//     sob gramática ... 1 a 2 alvos distintos de 12, sempre os mesmos
//     em prosa ....... 5 alvos distintos, e a leitura certa
//
// E o mesmo Qwen3-0.6B, solto, escreve isto:
//
//     "MOTION: walk | him | slow | 3   ACT: wave | him"
//
// para "I walk right up to him and wave". Leitura PERFEITA — em palavra
// natural (`walk`, `him`) em vez de palavra do enum (`approach`, `player`).
// O modelo fez a parte dele. Faltava o código fazer a sua.
//
// ── A REGRA QUE MANDA AQUI ────────────────────────────────────────────────
//
// Na dúvida, NADA. Duas corridas independentes na bancada deram 6 conclusões
// e 6 acertos: quando ele termina de pensar, ele acerta. O problema nunca foi
// erro, foi silêncio — 3 de 7 não concluíam dentro do orçamento de tokens.
//
// Silêncio é a falha segura num jogo: sem plano, o corpo mantém o que já
// fazia e ninguém vê nada errado. Já um alvo raspado do RASCUNHO do modelo
// ("Okay, let's tackle this. The user wants me to analyze...") é o Nilo
// andando para o lugar errado com convicção. Foi o que a bancada fez numa
// corrida, e virou dois PROIBIDOS que o modelo nunca decidiu.
//
// Por isso: sem conclusão reconhecível, devolve null.
import {
    FLOOR10_MOTOR_ACTS,
    FLOOR10_MOTOR_TARGETS,
    FLOOR10_MOTOR_VERBS,
    type Floor10MotorAct,
    type Floor10MotorPace,
    type Floor10MotorPlan,
    type Floor10MotorTarget,
    type Floor10MotorVerb,
} from './floor10MotorCortex';

/**
 * Prosa para alvo. A ordem importa: a primeira regra que casar ganha, e as
 * mais específicas vêm antes — "the north wall" tem de virar `north-side`
 * antes que "wall" sozinho signifique qualquer coisa.
 */
const ALVO_DA_PROSA: ReadonlyArray<readonly [RegExp, Floor10MotorTarget]> = [
    [/\bnorth[\s-]*(wall|side)\b|\bnorthern\b/i, 'north-side'],
    [/\bsouth[\s-]*(wall|side)\b|\bsouthern\b/i, 'south-side'],
    [/\beast[\s-]*(wall|side)\b|\beastern\b/i, 'east-side'],
    [/\bwest[\s-]*(wall|side)\b|\bwestern\b/i, 'west-side'],
    [/\belevator\b|\bthe doors?\b/i, 'elevator'],
    [/\b(center|middle) of the room\b|\broom[\s-]*cent(er|re)\b/i, 'room-center'],
    // `him`/`her`/`them` é como o modelo chama o jogador quando escreve solto.
    [/\bplayer\b|\bhim\b|\bher\b|\bthem\b|\bthe guy\b/i, 'player'],
    [/\b(stay|stand|remain)(s|ing)?\s+(still|put)\b|\bdo(es)?\s+not\s+move\b|\bdoesn't move\b|\bonly listen\b/i, 'self'],
    [/\b(to|on)\s+(his|my|the)\s+left\b|\bleftwards?\b|\bsteps?\s+.{0,12}left\b/i, 'to-my-left'],
    [/\b(to|on)\s+(his|my|the)\s+right\b|\brightwards?\b|\bsteps?\s+.{0,12}right\b/i, 'to-my-right'],
    [/\bforwards?\b|\bstraight ahead\b|\bahead\b/i, 'ahead'],
    [/\bbackwards?\b|\bbehind\b|\bretreats?\b/i, 'behind'],
];

/** Prosa para verbo. `walk`, `move`, `go` são todos aproximar-se de algo. */
const VERBO_DA_PROSA: ReadonlyArray<readonly [RegExp, Floor10MotorVerb]> = [
    // O modelo conjuga: escreve "backs away", "circles around", "stays still".
    // A primeira versão só casava o infinitivo e devolvia null para a saída
    // real — um verbo perdido é um plano perdido.
    [/\b(withdraws?|retreats?|backs?\s+away|steps?\s+back|moves?\s+away)\b/i, 'withdraw'],
    [/\b(circles?|orbits?|go(es)?\s+around|walks?\s+around)\b/i, 'orbit'],
    [/\b(explores?|wanders?|roams?|searches|search)\b/i, 'explore'],
    [/\b(stays?|stands?\s+still|remains?|holds?\s+still|do(es)?\s+not\s+move)\b/i, 'stay'],
    [/\b(holds?|waits?|pauses?)\b/i, 'hold'],
    // O mais genérico por último: quase todo movimento é "ir até".
    [/\b(approach|walk|move|go|head|step|turn|shift|take .{0,10}steps?)\b/i, 'approach'],
];

const RITMO_DA_PROSA: ReadonlyArray<readonly [RegExp, Floor10MotorPace]> = [
    [/\b(fast|quick|quickly|hurr(y|ied)|rush)\b/i, 'fast'],
    [/\b(slow|slowly|careful|cautious|quiet)\b/i, 'slow'],
    [/\b(normal|steady|even)\b/i, 'normal'],
];

/**
 * A palavra do enum, se ela já estiver ali; senão o mapa de prosa; senão null.
 *
 * `null` e não um palpite: é este `null` que vira "sem plano", que vira "o
 * corpo mantém o que fazia".
 */
export function alvoDaProsa(bruto: string | null | undefined): Floor10MotorTarget | null {
    if (!bruto) return null;
    const limpo = bruto.trim().toLowerCase();
    if ((FLOOR10_MOTOR_TARGETS as readonly string[]).includes(limpo)) {
        return limpo as Floor10MotorTarget;
    }
    for (const [regra, alvo] of ALVO_DA_PROSA) if (regra.test(limpo)) return alvo;
    return null;
}

export function verboDaProsa(bruto: string | null | undefined): Floor10MotorVerb | null {
    if (!bruto) return null;
    const limpo = bruto.trim().toLowerCase();
    if ((FLOOR10_MOTOR_VERBS as readonly string[]).includes(limpo)) {
        return limpo as Floor10MotorVerb;
    }
    for (const [regra, verbo] of VERBO_DA_PROSA) if (regra.test(limpo)) return verbo;
    return null;
}

function ritmoDaProsa(bruto: string): Floor10MotorPace {
    for (const [regra, ritmo] of RITMO_DA_PROSA) if (regra.test(bruto)) return ritmo;
    return 'normal';
}

function gestoDaProsa(bruto: string): { act?: Floor10MotorAct; actTarget?: Floor10MotorTarget } {
    const linha = /ACT:\s*([^\n]+)/i.exec(bruto)?.[1];
    if (!linha) return {};
    const palavra = FLOOR10_MOTOR_ACTS.find(
        (a) => a !== 'none' && new RegExp(`\\b${a}\\b`, 'i').test(linha),
    );
    if (!palavra) return {};
    const alvo = alvoDaProsa(linha.split('|')[1] ?? linha);
    return { act: palavra, ...(alvo ? { actTarget: alvo } : {}) };
}

/**
 * O PLANO A PARTIR DA PROSA.
 *
 * Só olha a linha `MOTION:` — a conclusão. O texto antes dela é rascunho, e
 * rascunho não vira movimento (ver o cabeçalho: raspar o rascunho produziu
 * dois movimentos que o modelo nunca decidiu).
 */
export function planoDaProsa(texto: string): Floor10MotorPlan | null {
    if (!texto) return null;
    // A ÚLTIMA linha `MOTION:` — se o modelo escreveu o molde no rascunho e
    // depois concluiu, a conclusão é a de baixo.
    const linhas = [...texto.matchAll(/MOTION:\s*([^\n]+)/gi)];
    const linha = linhas.at(-1)?.[1];
    if (!linha) return null;

    // `walk | him | slow | 3` ou `walk to him, slowly` — os dois têm de passar.
    const campos = linha.split('|').map((c) => c.trim()).filter(Boolean);
    const verbo = verboDaProsa(campos[0]) ?? verboDaProsa(linha);
    // O alvo pode estar no segundo campo OU embutido no primeiro
    // ("walk to him" veio numa resposta real, sem separador).
    const alvo = alvoDaProsa(campos[1]) ?? alvoDaProsa(linha);
    if (!verbo || !alvo) return null;

    const duracaoCrua = Number(/\b(3|6|9|12)\b/.exec(linha)?.[1] ?? 6);
    return {
        verb: verbo,
        target: alvo,
        pace: ritmoDaProsa(linha),
        duration: duracaoCrua as Floor10MotorPlan['duration'],
        ...gestoDaProsa(texto),
        raw: linha.trim().slice(0, 120),
    };
}
