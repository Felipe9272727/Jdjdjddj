// ── O GESTO SAI DO PAPEL ──────────────────────────────────────────────────
//
// O motor decide `ACT: knock | elevator` desde que a gramática ganhou a linha
// do gesto. Até aqui isso aparecia em UM lugar: o texto do `?campo`. No jogo,
// o Nilo decidia bater na porta e continuava andando de braço solto.
//
// Um gesto que só existe em log não é um gesto — é um comentário.
//
// ── POR QUE ISTO É UM MÓDULO PURO ────────────────────────────────────────
//
// A animação do corpo mora dentro de um `useFrame`, que roda 60 vezes por
// segundo e não dá para testar sem montar a cena inteira. Então a decisão de
// POSE sai dali: aqui entra "qual gesto, há quanto tempo" e sai um punhado de
// ângulos. O `Floor10Npc` só soma esses ângulos por cima da caminhada.
//
// A soma importa: o gesto NÃO substitui a animação de andar. Ele acena
// enquanto caminha, agacha enquanto observa. Substituir faria o corpo
// congelar no meio do passo — que é pior que não ter gesto nenhum.
import type { Floor10MotorAct } from './floor10MotorCortex';

/**
 * Quanto tempo cada gesto dura, em segundos.
 *
 * `listen`, `crouch` e `look-around` são POSTURAS: duram enquanto o plano
 * durar, e o número aqui é só o teto para não travar o corpo se algo se
 * perder. `wave`, `knock` e `jump` são AÇÕES: têm começo, meio e fim.
 */
export const DURACAO_DO_GESTO: Record<Floor10MotorAct, number> = {
    none: 0,
    listen: 3.2,
    touch: 2.0,
    knock: 1.9,
    crouch: 3.0,
    jump: 0.85,
    'look-around': 3.6,
    // Uma volta inteira, sem pressa. É POSTURA: dura o que a ordem durar, então
    // "gire enquanto procura" gira o tempo todo em vez de dar uma volta só.
    spin: 4.0,
    wave: 2.4,
};

/**
 * Quais gestos são POSTURA, e não ação com começo-meio-fim.
 *
 * A distinção estava escrita no comentário acima desde o primeiro dia — e não
 * existia no código. `poseDoGesto` e o `Floor10Npc` liam só a tabela, então o
 * "teto de segurança" era o único prazo que valia: 3,0 s para `crouch` num
 * plano travado por 9 s.
 *
 * De fora, isso é o Nilo agachando para examinar um aparelho e se levantando
 * sozinho no meio, com o corpo ainda preso no lugar por vários segundos. Parece
 * que ele desistiu; na verdade a pose acabou e a ordem não.
 */
export const POSTURAS: ReadonlySet<Floor10MotorAct> = new Set<Floor10MotorAct>([
    'listen', 'crouch', 'look-around', 'spin',
]);

/**
 * O teto de VERDADE de uma postura. Existe para o corpo não ficar preso numa
 * pose se um plano se perder, e por isso precisa ser maior que a ordem mais
 * longa que o motor consegue emitir (`duration` vai a 12 s).
 */
export const TETO_DA_POSTURA = 15;

/**
 * Quanto este gesto deve durar, dado o plano que o pediu.
 *
 * Ação: o tempo da tabela — bater na porta leva o que leva.
 * Postura: o tempo do PLANO, limitado pelo teto de segurança.
 */
export function duracaoDoGesto(
    act: Floor10MotorAct | undefined,
    duracaoDoPlano = 0,
): number {
    if (!act || act === 'none') return 0;
    if (!POSTURAS.has(act)) return DURACAO_DO_GESTO[act];
    // Um plano sem duração declarada cai na tabela: melhor a pose curta que
    // uma postura de duração zero, que seria gesto nenhum.
    if (!(duracaoDoPlano > 0)) return DURACAO_DO_GESTO[act];
    return Math.min(duracaoDoPlano, TETO_DA_POSTURA);
}

/**
 * Os ângulos que o corpo soma à animação de caminhar. Tudo em radianos,
 * tudo como DIFERENÇA — zero significa "não mexe nisso".
 */
export type PoseDoGesto = {
    /** Ombro esquerdo, para frente/trás. */
    bracoEsqX: number;
    /** Ombro direito, para frente/trás. */
    bracoDirX: number;
    /** Ombro direito, para o lado — é o que levanta a mão do aceno. */
    bracoDirZ: number;
    /** Cabeça: inclinar para baixo/cima. */
    cabecaX: number;
    /** Cabeça: virar para os lados (a varredura do `look-around`). */
    cabecaY: number;
    /** Cabeça: tombar para o ombro — o gesto de quem escuta. */
    cabecaZ: number;
    /** Altura do corpo inteiro: negativa agacha, positiva sai do chão. */
    altura: number;
    /** Quanto o tronco se inclina para frente. */
    troncoX: number;
};

export const POSE_PARADA: PoseDoGesto = {
    bracoEsqX: 0, bracoDirX: 0, bracoDirZ: 0,
    cabecaX: 0, cabecaY: 0, cabecaZ: 0,
    altura: 0, troncoX: 0,
};

/** Sobe de 0 a 1 e volta a 0: nenhum gesto começa nem termina com um tranco. */
function envelope(fracao: number): number {
    if (fracao <= 0 || fracao >= 1) return 0;
    // Um quarto para entrar, um quarto para sair, metade em cheio.
    if (fracao < 0.25) return fracao / 0.25;
    if (fracao > 0.75) return (1 - fracao) / 0.25;
    return 1;
}

/**
 * A pose do gesto neste instante.
 *
 * `decorrido` é quanto tempo passou desde que o gesto começou. Fora da janela
 * do gesto devolve `POSE_PARADA` — e é assim que o corpo volta ao normal
 * sozinho, sem ninguém precisar "desligar" nada.
 */
export function poseDoGesto(
    act: Floor10MotorAct | undefined,
    decorrido: number,
    /**
     * Quanto o plano que pediu o gesto vai durar, em segundos. Só muda alguma
     * coisa para POSTURAS — uma ação dura o que a tabela diz, independente da
     * ordem. Omitir mantém o comportamento antigo, que é o certo para quem
     * chama sem plano na mão (os testes de pose, o `?campo`).
     *
     * Passar aqui a duração JÁ RESOLVIDA por `duracaoDoGesto` dá no mesmo: para
     * postura, `min(min(d, TETO), TETO) === min(d, TETO)`; para ação o valor é
     * ignorado. O `Floor10Npc` faz exatamente isso, porque guarda a duração
     * resolvida no gesto e não quer resolvê-la duas vezes por quadro.
     */
    duracaoDoPlano = 0,
): PoseDoGesto {
    if (!act || act === 'none') return POSE_PARADA;
    const total = duracaoDoGesto(act, duracaoDoPlano);
    if (!(total > 0) || decorrido < 0 || decorrido >= total) return POSE_PARADA;
    const fracao = decorrido / total;
    const forca = envelope(fracao);
    if (forca <= 0) return POSE_PARADA;

    switch (act) {
        case 'wave': {
            // Braço direito para cima e para o lado, mão indo e voltando.
            const balanco = Math.sin(decorrido * 9.5);
            return {
                ...POSE_PARADA,
                bracoDirZ: forca * (-1.55 + balanco * 0.42),
                bracoDirX: forca * -0.25,
                cabecaX: forca * -0.05,
            };
        }
        case 'knock': {
            // Três batidas: o braço vai à frente e recua, rápido.
            const batida = Math.max(0, Math.sin(decorrido * 11));
            return {
                ...POSE_PARADA,
                bracoDirX: forca * (-1.15 - batida * 0.45),
                troncoX: forca * 0.06,
                cabecaX: forca * 0.04,
            };
        }
        case 'touch': {
            // Uma mão que chega e FICA. Sem oscilação: tocar não é bater.
            return {
                ...POSE_PARADA,
                bracoDirX: forca * -1.35,
                troncoX: forca * 0.1,
                cabecaX: forca * 0.12,
            };
        }
        case 'spin': {
            // O giro do CORPO não mora aqui: `PoseDoGesto` são ângulos somados
            // à animação, e o yaw é do corpo, resolvido em `floor10Passo` e no
            // `Floor10Npc`. O que fica nesta pose é o resto do gesto — a cabeça
            // acompanhando a volta e o tronco levemente inclinado, que é o que
            // separa "girar olhando" de "girar como um poste".
            return {
                ...POSE_PARADA,
                cabecaY: forca * Math.sin(decorrido * 2.2) * 0.35,
                troncoX: forca * 0.03,
                bracoEsqX: forca * -0.1,
                bracoDirX: forca * -0.1,
            };
        }
        case 'listen': {
            // A cabeça tomba e o corpo quase para. O gesto do homem preso.
            return {
                ...POSE_PARADA,
                cabecaZ: forca * 0.3,
                cabecaX: forca * -0.06,
                troncoX: forca * 0.05,
                bracoEsqX: forca * -0.12,
            };
        }
        case 'crouch': {
            // Abaixa o corpo inteiro e inclina o tronco: sem dobrar joelho de
            // verdade, mas com a silhueta certa.
            return {
                ...POSE_PARADA,
                altura: forca * -0.34,
                troncoX: forca * 0.22,
                bracoEsqX: forca * -0.3,
                bracoDirX: forca * -0.3,
                cabecaX: forca * 0.1,
            };
        }
        case 'jump': {
            // Uma parábola curta: agacha, sai do chão, cai. Aqui o envelope
            // atrapalharia (o ápice é no meio, não o "cheio" de um platô), então
            // este caso usa a fração direto.
            const subida = Math.sin(fracao * Math.PI);
            const agacho = fracao < 0.18 ? -(0.18 - fracao) * 1.4 : 0;
            return {
                ...POSE_PARADA,
                altura: subida * 0.42 + agacho,
                bracoEsqX: -subida * 0.8,
                bracoDirX: -subida * 0.8,
            };
        }
        case 'look-around': {
            // Varre a cabeça de um lado ao outro, uma vez e meia.
            return {
                ...POSE_PARADA,
                cabecaY: forca * Math.sin(decorrido * 2.1) * 0.85,
                cabecaX: forca * -0.04,
            };
        }
        default:
            return POSE_PARADA;
    }
}

/**
 * O gesto pede que o corpo pare de andar?
 *
 * `knock`, `touch` e `crouch` acontecem CONTRA alguma coisa: continuar andando
 * durante um deles arrasta a mão pela sala. `wave`, `listen` e `look-around`
 * combinam com o passo, e `jump` é o passo.
 */
export function gestoPrendeOsPes(act: Floor10MotorAct | undefined): boolean {
    return act === 'knock' || act === 'touch' || act === 'crouch';
}
