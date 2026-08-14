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

/**
 * ── O QUE O NILO NÃO SABE FAZER ───────────────────────────────────────────
 *
 * O dono do jogo escreveu "Kill the player" e o Nilo foi ATRÁS DELE. Não é
 * bug de código: é o mecanismo inteiro sem uma saída para "não".
 *
 * O plano nasce de duas fontes independentes — o ALVO vem do vetor (cosseno
 * sobre 14 alvos) e o VERBO vem das regras aqui, com `?? 'approach'` no fim.
 * "Kill" não casa com nenhuma regra, então cai no fallback; "player" é a única
 * âncora da frase, então o vetor acerta o alvo. Somando: `approach player`.
 *
 * Ou seja, a ordem impossível virou obediência silenciosa. E é pior que errar:
 * de fora parece que ele ENTENDEU e aceitou.
 *
 * O enum de verbos é `approach | withdraw | hold | orbit | explore | stay`.
 * Não há verbo hostil, de propósito — o Nilo não é uma ameaça. Então a resposta
 * certa para "mate o jogador" não é um movimento diferente: é ele NÃO agir, que
 * é o que `hold` significa (fica onde está, de frente, olhando).
 */
const ORDEM_QUE_ELE_NAO_CUMPRE =
    /\b(kill|murder|attack|hurt|harm|hit|punch|stab|shoot|destroy)\b/i;

/**
 * ── NEGAÇÃO, QUE O COSSENO NÃO ENXERGA ────────────────────────────────────
 *
 * "vá até o player, mas NÃO siga ele". No espaço de embedding, "don't follow"
 * fica colado em "follow" — a negação quase não move o vetor. E as regras de
 * verbo abaixo também não a viam: `\bgo\b` casava e devolvia `approach`,
 * ignorando a metade da frase que mandava o contrário.
 *
 * Aqui a negação é lida onde ela é legível: no TEXTO, por regra. Não resolve
 * composição de verdade ("faça A mas não B" continua sendo dois pedidos numa
 * frase só, e este motor tem uma casa só) — mas resolve o caso que importa:
 * uma ordem negada não pode virar a ordem positiva.
 */
const NEGACAO =
    // `not` sozinho estava faltando — a palavra de negação mais comum da
    // língua, e a única que sobra depois que `without` vira `but not`.
    /\b(not|dont|don't|never|without|instead of)\b/i;

/** Prosa para verbo. `walk`, `move`, `go` são todos aproximar-se de algo. */
const VERBO_DA_PROSA: ReadonlyArray<readonly [RegExp, Floor10MotorVerb]> = [
    // O modelo conjuga: escreve "backs away", "circles around", "stays still".
    // A primeira versão só casava o infinitivo e devolvia null para a saída
    // real — um verbo perdido é um plano perdido.
    // ── ESTA TABELA É EM INGLÊS, E ISSO ESTÁ CERTO ───────────────────────
    // Eu quase enchi isto de alternativas em português, supondo que o dono do
    // jogo escrevesse na caixa de frase em português. Fui olhar os prints que
    // ele mandou: "Walk to elevator", "Kill the player", "Go to the up wall",
    // "Jump" — tudo em inglês. E quem escreve o pensamento no jogo de verdade
    // é o MODELO, que também escreve em inglês.
    //
    // Uma tabela em português aqui seria peso morto defendido por um comentário
    // falso — o pior tipo, porque o comentário sobrevive e ensina errado.
    [/\b(withdraws?|retreats?|backs?\s+away|steps?\s+back|moves?\s+away)\b/i, 'withdraw'],
    [/\b(recu[ae]|afast[ae]|sai\s+de\s+perto|d[êe]\s+espa[çc]o)\b/i, 'withdraw'],
    [/\b(circles?|orbits?|go(es)?\s+around|walks?\s+around)\b/i, 'orbit'],
    [/\b(circul[ae]|rode[ie]|d[êe]\s+a\s+volta|ao\s+redor)\b/i, 'orbit'],
    [/\b(explores?|wanders?|roams?|searches|search)\b/i, 'explore'],
    [/\b(explor[ae]|vagu?[ae]|perambul[ae]|procur[ae]|vasculh[ae])\b/i, 'explore'],
    [/\b(stays?|stands?\s+still|remains?|holds?\s+still|do(es)?\s+not\s+move)\b/i, 'stay'],
    [/\b(fique?\s+parado|n[ãa]o\s+se\s+mexa|permane[çc]a)\b/i, 'stay'],
    [/\b(holds?|waits?|pauses?)\b/i, 'hold'],
    [/\b(espere?|aguarde?|segure?|pare)\b/i, 'hold'],
    // O mais genérico por último: quase todo movimento é "ir até".
    [/\b(approach|walk|move|go|head|step|turn|shift|take .{0,10}steps?)\b/i, 'approach'],
    [/\b(v[áa]|v[ãa]o|and[ae]|caminhe?|sig[ae]|aproxime?|chegue?|mov[ae]|passos?)\b/i, 'approach'],
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
    // A leitura por cláusulas manda; esta função é a porta antiga dela.
    return casasDaProsa(limpo).verbo;
}

/**
 * ── DUAS CASAS, PORQUE A FRASE TEM DUAS ──────────────────────────────────
 *
 *   "go to the player, but don't follow him"
 *
 * Isso não é uma ordem: são duas. Uma AÇÃO ("vá até ele") e uma RESTRIÇÃO
 * ("não o siga"). O motor tinha uma casa só, então a frase inteira virava um
 * rótulo — e o cosseno, que não enxerga negação, escolhia `player`.
 *
 * A regra de negação que veio antes desta melhorou o caso simples ("don't
 * follow" sozinho vira `hold`) e ESTRAGAVA este: com um "não" em qualquer
 * lugar, a frase toda virava `hold` e a metade positiva se perdia. Ele parava
 * onde estava em vez de ir.
 *
 * O corte é por cláusula. A primeira com verbo reconhecido é a ação; qualquer
 * cláusula negada depois dela é restrição. E "não seguir" tem significado
 * MECÂNICO exato neste jogo:
 *
 *   `approach player` recalcula a posição do jogador a cada quadro — se ele
 *   anda, o Nilo vai atrás. ISSO é seguir.
 *   Travando o destino no ponto onde o jogador ESTAVA, ele vai até lá e para.
 *
 * É a diferença entre ir até alguém e grudar nele, e o jogo já tem a máquina
 * de travar destino (`corpo.destino`) — ela só era usada para alvos relativos.
 */
const CORTE_DE_CLAUSULA = /\s*(?:,|;|\bbut\b|\bthough\b|\byet\b)\s*/i;

/**
 * `without` e `instead of` são separador E negação ao mesmo tempo.
 *
 * Cortar por eles comia a negação junto: "approach the player WITHOUT chasing
 * him" virava as cláusulas ["approach the player", "chasing him"], e a segunda
 * não tinha mais nenhuma marca de negação — o "não" desaparecia no corte.
 *
 * Reescrever para "but not" antes de cortar deixa as duas funções visíveis: o
 * `but` separa e o `not` nega.
 */
function normalizarNegacao(t: string): string {
    return t
        .replace(/\bwithout\b/gi, 'but not')
        .replace(/\binstead of\b/gi, 'but not');
}

/** "não siga", em todas as formas que aparecem de verdade. */
const NAO_SIGA = /\b(follow|chase|chasing|tail|stick|stay close|keep up|shadow)\b/i;

export type CasasDaProsa = {
    /** O verbo da AÇÃO, já resolvido. `null` = nenhuma cláusula tinha verbo. */
    verbo: Floor10MotorVerb | null;
    /** Ele deve ir até o ponto e PARAR, em vez de perseguir. */
    fixarAlvo: boolean;
    /** A frase pede algo que ele não faz. */
    recusada: boolean;
};

/**
 * Lê a frase em duas casas: o que fazer, e o que não fazer junto.
 *
 * Uma cláusula só, sem negação, sai igual ao que saía antes — este corte não
 * pode custar o caso simples, que é a maioria.
 */
export function casasDaProsa(bruto: string | null | undefined): CasasDaProsa {
    const vazio: CasasDaProsa = { verbo: null, fixarAlvo: false, recusada: false };
    if (!bruto) return vazio;
    const limpo = bruto.trim().toLowerCase();
    if (ORDEM_QUE_ELE_NAO_CUMPRE.test(limpo)) {
        return { verbo: 'hold', fixarAlvo: false, recusada: true };
    }

    const clausulas = normalizarNegacao(limpo).split(CORTE_DE_CLAUSULA)
        .filter((c) => c.trim() !== '');
    let verbo: Floor10MotorVerb | null = null;
    let fixarAlvo = false;
    for (const c of clausulas) {
        const negada = NEGACAO.test(c);
        const desta = verboDaClausula(c);
        if (negada) {
            // Negar "seguir" não cancela o movimento: pede que ele PARE ao
            // chegar. É a única negação com tradução mecânica exata aqui.
            if (NAO_SIGA.test(c)) { fixarAlvo = true; continue; }
            // Qualquer outra negação sobre um verbo de deslocamento: não se
            // desloque. Só vale como AÇÃO se nenhuma ação positiva veio antes.
            if (verbo === null) verbo = desta && desta !== 'stay' ? 'hold' : (desta ?? 'hold');
            continue;
        }
        if (verbo === null && desta) verbo = desta;
    }
    return { verbo, fixarAlvo, recusada: false };
}

function verboDaClausula(c: string): Floor10MotorVerb | null {
    for (const [regra, v] of VERBO_DA_PROSA) if (regra.test(c)) return v;
    return null;
}

/**
 * A frase pede algo que o Nilo não faz? Serve para a tela DIZER isso, em vez de
 * mostrar um `hold` que parece uma decisão qualquer.
 */
export function ordemRecusada(bruto: string | null | undefined): boolean {
    return !!bruto && ORDEM_QUE_ELE_NAO_CUMPRE.test(bruto.trim().toLowerCase());
}

/** A frase nega o que pede? Também é para a tela poder explicar a escolha. */
export function ordemNegada(bruto: string | null | undefined): boolean {
    return !!bruto && NEGACAO.test(bruto.trim().toLowerCase());
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
