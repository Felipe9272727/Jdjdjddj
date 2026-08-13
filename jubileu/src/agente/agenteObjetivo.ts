// ── O AGENTE-JOGADOR: A PARTE QUE SABE O QUE QUER ─────────────────────────
//
// Andar não é jogar. O `agenteAndar` leva o corpo de um ponto a outro; aqui
// mora a pergunta que transforma isso em jogo: PARA ONDE, e por quê.
//
// ── O QUE EU ACHAVA, E O QUE O JOGO REALMENTE FAZ ────────────────────────
//
// A primeira versão deste arquivo dizia, com todas as letras: "`ELEV_W` entra
// na lista de paredes de todos os andares, então o elevador é o objetivo
// universal". Fui conferir em `constants.ts` e é falso em dois andares:
//
//   Andar 7 ... é um NAVIO. `_WALLS_FLOOR7` não tem `ELEV_W`; o convés é o
//               mundo inteiro, e o elevador só aparece depois que você embarca.
//   Andar 9 ... o Viveiro tem, no lugar do cab, `boxCollider(0,-13, 6.5, 6.0)`
//               — o elevador que te despejou ali, engolido pela floresta, e
//               SÓLIDO. Entrar nele não é difícil: é impossível, de propósito.
//
// E tem uma segunda correção, maior: mesmo onde o cab existe, entrar nele só
// TROCA DE ANDAR nos andares 0 a 3. `hasWalkInElevator` é explícito quanto a
// isso, e o comentário dela explica por quê — os andares mais novos são donos
// das próprias saídas (overlay, cutscene, interação), e vários deles têm chão
// legítimo em z <= -10, que a regra do cab confundiria com "embarcou".
//
// Um agente que não sabe disso anda até o meio do cab no Andar 8 e espera uma
// viagem que nunca começa. Parado, achando que fez a jogada certa. É o mesmo
// defeito do "Nilo não anda": não é burrice do modelo, é o mundo não responder
// ao que ele fez — e ninguém contar isso a ele.
//
// ── ENTÃO O OBJETIVO UNIVERSAL É OUTRO ───────────────────────────────────
//
//   se este andar responde ao cab e dá para chegar nele  → PEGAR O ELEVADOR
//   senão                                                → EXPLORAR
//
// "Explorar" = ir ao ponto mais distante que ele alcança a pé. Não é prêmio de
// consolação: é o que um humano faz numa sala que não conhece, sai só das
// paredes, e portanto vale em qualquer andar — inclusive nos que ainda não
// foram escritos, que é a exigência que manda neste código.
import {
    ELEV_W, ELEVATOR_ZONE_X, ELEVATOR_ZONE_Z, hasWalkInElevator, wallsForState,
} from '../constants';
import {
    type GradeDoAndar, type Ponto, alcancaveis, construirGrade, limitesDaVista,
    livreEm, maisLonge, paraCelula,
} from './agenteMapa';
import { type Tentativa, irAte } from './agenteAndar';
import { type Plataforma, ondeElePisa, rotaDePulos } from './agenteSalto';

/**
 * O centro da caixa do elevador, tirado das próprias paredes dela.
 *
 * `ELEV_W` são três segmentos: as duas laterais e o fundo. O centro em X é a
 * média dos extremos; em Z, o meio entre o fundo e a boca. Dá (0, -13) — o
 * mesmo ponto para onde o `App.tsx` TELEPORTA o jogador quando a viagem começa
 * (`playerPositionCmdRef.current = { x: 0, y: 0, z: -13 }`).
 *
 * Eu tinha escrito aqui "duas vezes", contando as duas que eu conhecia. Um
 * revisor foi conferir: são 13 ocorrências de `z: -13` no App, 10 delas com
 * essa forma exata. O número errado enfraquecia justamente o argumento que ele
 * sustenta — treze cópias do mesmo ponto espalhadas por um arquivo são um
 * motivo MAIOR para derivar a coordenada de `ELEV_W` do que duas seriam.
 */
function centroDoCab(): Ponto {
    const xs = ELEV_W.flatMap((w) => [w[0], w[2]]);
    const zs = ELEV_W.flatMap((w) => [w[1], w[3]]);
    return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
    };
}

export const DENTRO_DO_CAB: Ponto = centroDoCab();

/**
 * Ele está dentro do elevador — do jeito que O JOGO conta?
 *
 * Esta NÃO é a minha caixa em volta de `ELEV_W`: é a linha que o `Player.tsx`
 * roda todo quadro. As três condições são as três dele, e a primeira é a que
 * eu tinha esquecido:
 *
 *     hasWalkInElevator(level) && z <= ELEVATOR_ZONE_Z && |x| <= ELEVATOR_ZONE_X
 *
 * Sem o `hasWalkInElevator`, medindo os andares reais, o agente se declarava
 * embarcado na POPA DO NAVIO do Andar 7 (o convés vai até z = -12,2) e num
 * ponto qualquer do Andar 9. O comentário da constante já avisava disso —
 * "several maps legitimately extend through z <= -10" — e eu copiei metade da
 * regra assim mesmo. Meia regra que só falha em dois andares é pior que regra
 * nenhuma: passa em quase todo teste que se escreva.
 */
export function dentroDoCab(nivel: number, p: Ponto): boolean {
    return hasWalkInElevator(nivel)
        && p.z <= ELEVATOR_ZONE_Z && Math.abs(p.x) <= ELEVATOR_ZONE_X;
}

export type EstadoDoAndar = {
    nivel: number;
    paredes: number[][];
    grade: GradeDoAndar;
    /**
     * Entrar no cab troca de andar AQUI? (`hasWalkInElevator`) Nos andares em
     * que é `false`, o cab pode até existir e ser caminhável — só não leva a
     * lugar nenhum.
     */
    oCabResponde: boolean;
};

/**
 * O andar como o agente o enxerga DAQUI. Precisa do número e de onde ele está.
 *
 * `doorsClosed: false` porque um agente que quer PEGAR o elevador precisa da
 * porta aberta; com ela fechada o cab é uma caixa selada e a resposta correta
 * seria sempre "sem caminho".
 *
 * A grade é uma JANELA em volta dele (`limitesDaVista`), não o andar inteiro —
 * ver o comentário lá sobre os doze milhões de células do Andar 3. Por isso
 * este estado envelhece: andou muito, olhe de novo.
 */
export function olharOAndar(
    nivel: number,
    de: Ponto,
    houseDoorOpen = true,
): EstadoDoAndar {
    const paredes = wallsForState(nivel, false, houseDoorOpen);
    return {
        nivel,
        paredes,
        grade: construirGrade(paredes, limitesDaVista(paredes, de)),
        oCabResponde: hasWalkInElevator(nivel),
    };
}

export type TentativaDeAndar = Tentativa & {
    nivel: number;
    /** Já estava dentro do cab quando começou. */
    jaEstava: boolean;
    /** O corpo terminou dentro da zona que o jogo conta como elevador. */
    embarcou: boolean;
    /**
     * Embarcou E este andar responde a isso — ou seja, a viagem vai acontecer.
     * A diferença entre `embarcou` e `viaja` é a lição do Andar 8: dá para
     * estar dentro do cab e não ir a lugar nenhum.
     */
    viaja: boolean;
};

/**
 * A JOGADA: do ponto onde ele está até dentro do elevador.
 *
 * ── POR QUE `chegou` NÃO É O QUE O `irAte` DEVOLVEU ──────────────────────
 *
 * O A* aproxima o alvo para a célula livre mais próxima. No Andar 9 o centro
 * do cab está dentro de um bloco maciço, então o "alvo" vira uma célula
 * ENCOSTADA na ruína — e o `irAte` chega lá e responde `chegou: true`. Seria
 * um sucesso mentiroso: o corpo está do lado de fora de uma caixa lacrada.
 *
 * Quem manda é a régua do jogo. Se ele não terminou dentro da zona, não
 * embarcou, e o motivo é `sem-caminho`: não existe rota a pé para dentro
 * daquele cab. É informação boa — manda o agente procurar outra saída em vez
 * de ficar tentando a mesma porta.
 */
export function pegarOElevador(andar: EstadoDoAndar, de: Ponto): TentativaDeAndar {
    if (dentroDoCab(andar.nivel, de)) {
        return {
            nivel: andar.nivel, jaEstava: true, chegou: true, fim: { ...de },
            faltou: 0, passos: 0, plano: [], motivo: 'chegou',
            embarcou: true, viaja: andar.oCabResponde,
        };
    }
    const r = irAte(andar.grade, andar.paredes, de, DENTRO_DO_CAB);
    const embarcou = r.chegou && dentroDoCab(andar.nivel, r.fim);
    return {
        ...r,
        chegou: embarcou,
        motivo: r.chegou && !embarcou ? 'sem-caminho' : r.motivo,
        nivel: andar.nivel,
        jaEstava: false,
        embarcou,
        viaja: embarcou && andar.oCabResponde,
    };
}

export type Objetivo = {
    /**
     * `elevador` = a saída deste andar é embarcar.
     * `pular`    = o chão não é chão; o caminho é uma sequência de plataformas.
     * `explorar` = eu não sei a saída.
     */
    tipo: 'elevador' | 'pular' | 'explorar';
    alvo: Ponto;
    /** Em português, para caber na bolha do NPC e no relatório do teste. */
    porque: string;
    /** Só em `pular`: a sequência de plataformas até o alvo. */
    rota?: readonly Plataforma[];
};

/**
 * ── O OBJETIVO QUANDO O CAMINHO É PELO AR ────────────────────────────────
 *
 * Num parkour não existe "o ponto mais distante que eu alcance a pé": o chão é
 * vão. O que existe é a plataforma mais ALTA que uma sequência de pulos
 * alcança — subir É o objetivo, e é o que o jogador humano faz sem pensar.
 *
 * A rota vem do grafo de pulos (`rotaDePulos`), cujas arestas saem de
 * `F3_JUMP`/`F3_GRAVITY`. Se nem a plataforma de baixo dá para deixar, a rota
 * volta vazia e o alvo é onde ele já está — resposta honesta, e melhor que
 * mandar o corpo pular num vão que a física não fecha.
 */
export function oQueFazerNoAr(
    plataformas: readonly Plataforma[],
    de: Ponto,
    y = 0,
): Objetivo {
    const aqui = ondeElePisa(plataformas, de.x, y, de.z)
        ?? plataformas.reduce((a, b) => (
            Math.hypot(a.x - de.x, a.z - de.z) <= Math.hypot(b.x - de.x, b.z - de.z) ? a : b
        ));
    let melhor = aqui;
    let melhorRota: readonly Plataforma[] = [aqui];
    for (const p of plataformas) {
        if (p.topY <= melhor.topY) continue;
        const rota = rotaDePulos(plataformas, aqui.id, p.id);
        if (rota.length === 0) continue;
        melhor = p;
        melhorRota = rota;
    }
    if (melhor.id === aqui.id) {
        return {
            tipo: 'pular',
            alvo: { x: aqui.x, z: aqui.z },
            porque: 'daqui não sai pulo nenhum que suba',
            rota: [aqui],
        };
    }
    return {
        tipo: 'pular',
        alvo: { x: melhor.x, z: melhor.z },
        porque: `subir ${melhorRota.length - 1} pulo(s) até o mais alto que alcanço`,
        rota: melhorRota,
    };
}

/**
 * ── O QUE FAZER NESTE ANDAR ───────────────────────────────────────────────
 *
 * A decisão inteira, sem um único `if (nivel === …)`. Ela pergunta ao jogo
 * (`hasWalkInElevator`) e às paredes (`alcancaveis`), e as duas respondem para
 * qualquer andar, hoje e depois.
 *
 * O `explorar` não é desistência. Nos andares 4+ a saída é uma interação que
 * este agente ainda não sabe fazer — mas atravessar a sala é pré-requisito de
 * TODAS elas: não dá para puxar uma alavanca sem chegar perto dela. Andar até
 * o ponto mais longe é o passo honesto enquanto o passo seguinte não existe.
 */
export function oQueFazerAqui(
    andar: EstadoDoAndar,
    de: Ponto,
    /**
     * ── O CHÃO NEM SEMPRE É CHÃO ──────────────────────────────────────────
     *
     * Um revisor apontou que `agenteSalto` era uma ILHA: nenhum outro módulo do
     * pacote o importava, e por um motivo real — `wallsForState(3)` descreve o
     * corredor do parkour como área aberta, sem modelar plataforma nem vão. A
     * queda é decidida por `y < -8` no `Player.tsx`, que a grade XZ não enxerga.
     *
     * Ou seja: no ANDAR EXATO para o qual o módulo de pulo foi escrito, o agente
     * concluía "é tudo chão livre" e nunca perguntava se dava para pular. O
     * módulo tinha 18 testes e zero influência sobre qualquer decisão.
     *
     * A ligação NÃO pode ser `if (nivel === 3)` — a promessa é funcionar em
     * andares futuros. Então quem sabe que este andar tem plataformas é quem
     * chama: no Andar 3 é `f3Parkour.platforms`, num andar futuro será outra
     * coisa. Sem plataformas, tudo segue como antes; com elas, a pergunta muda
     * de "para onde ando" para "por onde subo".
     */
    plataformas: readonly Plataforma[] = [],
): Objetivo {
    if (plataformas.length > 0) return oQueFazerNoAr(plataformas, de);
    if (andar.oCabResponde) {
        if (dentroDoCab(andar.nivel, de)) {
            return { tipo: 'elevador', alvo: { ...de }, porque: 'já estou no elevador' };
        }
        // `alcanca` já implica pisável: ele testa `livreEm` na célula do alvo
        // ANTES de olhar a inundação. Eu tinha as duas aqui, e a primeira era
        // logicamente morta — dava para apagá-la sem nenhum teste reclamar.
        if (alcanca(andar, de, DENTRO_DO_CAB)) {
            return { tipo: 'elevador', alvo: DENTRO_DO_CAB, porque: 'o elevador leva daqui' };
        }
    }
    const longe = maisLonge(andar.grade, de);
    return {
        tipo: 'explorar',
        alvo: longe.p,
        porque: andar.oCabResponde
            ? 'não chego ao elevador daqui — vou ver o resto'
            : 'o elevador não leva neste andar — a saída é outra coisa',
    };
}

/**
 * Dá para ir de `de` até `ate` a pé, sem calcular o caminho inteiro?
 *
 * É a diferença entre "a porta está trancada" e "eu não sei o caminho" — e um
 * agente que não distingue as duas fica batendo na parede achando que progride.
 *
 * (Havia aqui um `quantoEleAlcanca`, que contava as células alcançáveis, e um
 * `pisavel`. O primeiro não tinha NENHUM chamador, nem em teste; o segundo só
 * era chamado num lugar onde `alcanca` já o implicava. Export sem chamador é
 * peso morto que os testes fingem cobrir — foi assim que o `planoDaProsa` viveu
 * 21 testes sem ninguém usá-lo.)
 */
export function alcanca(andar: EstadoDoAndar, de: Ponto, ate: Ponto): boolean {
    const marca = alcancaveis(andar.grade, de);
    const c = paraCelula(andar.grade, ate);
    return livreEm(andar.grade, c.i, c.j) && marca[c.j * andar.grade.largura + c.i] === 1;
}

