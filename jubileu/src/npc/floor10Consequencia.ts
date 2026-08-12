// ── O QUE ACONTECEU DEPOIS ────────────────────────────────────────────────
//
// Pedido do dono do jogo:
//
//   "eu queria que vc desse memória pra ele não ficar repetindo sempre a mesma
//    coisa, e tipo, vamos supor, ele se aproximou do player, e o player
//    ignorou (não abriu o chat ou sla) ele vai saber disso entendeu?"
//
// O prompt já mandava o histórico — e mandava só metade dele:
//
//     RECENT ACTIONS: approach-player -> approach-player -> approach-player
//
// Isso é o que ele FEZ. Não há uma palavra sobre o que DEU. Um modelo que lê
// três aproximações seguidas e nenhum resultado não tem como concluir "não
// está funcionando"; do ponto de vista dele, cada rodada é a primeira. A
// repetição que o dono do jogo vê não é teimosia do modelo — é amnésia que nós
// causamos.
//
// COMO SE MEDE "IGNORADO" SEM INVENTAR
// Não dá para perguntar ao jogador se ele ignorou. Dá para olhar o mundo antes
// e depois e responder por evidência:
//
//   aproximar   -> ele abriu a conversa? falou? veio na minha direção?
//   dar espaço  -> ele recuou, ou continuou colado?
//   elevador    -> eu cheguei lá?
//
// Cada meta tem UMA pergunta objetiva. Quando não há pergunta objetiva (vagar,
// ficar quieto), o resultado é `indefinido` — e `indefinido` NUNCA vira texto no
// prompt. Inventar "você ficou quieto e nada aconteceu" seria encher o contexto
// de ruído e ensinar o modelo a desconfiar do que lê.
//
// O QUE ISTO NÃO É: reforço. Não há peso, não há aprendizado, não há número
// escondido. É memória declarada, em inglês, do mesmo jeito que o resto do
// prompt — legível por quem depura e alterável por quem escreve o personagem.
import type { DeliberationGoal } from './floor10Deliberation';

/** O mundo no instante da decisão e no instante da conferência. */
export type MundoObservado = {
    /** Distância do jogador em metros; `null` quando ele não está visível. */
    distanciaDoJogador: number | null;
    /** Distância do Nilo até a porta do elevador. */
    distanciaDoElevador: number;
    /** O painel de conversa está aberto? */
    conversaAberta: boolean;
    /** Quantas mensagens o jogador já mandou nesta sessão. */
    mensagensDoJogador: number;
};

export type Consequencia = 'atendido' | 'ignorado' | 'indefinido';

export type RegistroDeConsequencia = {
    meta: DeliberationGoal;
    resultado: Consequencia;
    /** Segundos desde o início da sessão, só para ordenar e envelhecer. */
    em: number;
};

/**
 * Quanto o jogador precisa se aproximar para contar como "veio até mim". Meio
 * metro é ruído de caminhada; 1,5 m é intenção.
 */
const APROXIMOU = 1.5;
/** Idem para o recuo, ao pedir espaço. */
const RECUOU = 1.5;
/** A que distância da porta conta como "cheguei ao elevador". */
const CHEGOU_NO_ELEVADOR = 2.5;

/**
 * O veredito de uma meta, dado o mundo antes e depois. Puro: é a regra inteira,
 * e ela precisa ser lida sem subir modelo nenhum.
 */
export function avaliarConsequencia(
    meta: DeliberationGoal,
    antes: MundoObservado,
    depois: MundoObservado,
): Consequencia {
    const falou = depois.mensagensDoJogador > antes.mensagensDoJogador;
    const abriu = depois.conversaAberta && !antes.conversaAberta;

    switch (meta) {
        case 'approach-player':
        case 'talk-player':
        case 'seek-player': {
            // Qualquer sinal de que o gesto foi recebido conta. A conversa é o
            // sinal mais forte, e é literalmente o que ele descreveu ("não abriu
            // o chat").
            if (abriu || falou) return 'atendido';
            if (antes.distanciaDoJogador === null || depois.distanciaDoJogador === null) {
                // Ele sumiu de vista no meio: não dá para dizer que ignorou.
                return 'indefinido';
            }
            if (depois.distanciaDoJogador <= antes.distanciaDoJogador - APROXIMOU) {
                return 'atendido';
            }
            return 'ignorado';
        }
        case 'make-space': {
            if (antes.distanciaDoJogador === null || depois.distanciaDoJogador === null) {
                return 'indefinido';
            }
            return depois.distanciaDoJogador >= antes.distanciaDoJogador + RECUOU
                ? 'atendido'
                : 'ignorado';
        }
        case 'inspect-elevator':
            // Aqui quem responde é o próprio corpo dele, não o jogador.
            return depois.distanciaDoElevador <= CHEGOU_NO_ELEVADOR ? 'atendido' : 'ignorado';
        case 'observe-player':
        case 'wander':
        case 'idle':
        default:
            // Sem pergunta objetiva. Ver o cabeçalho: `indefinido` não vira
            // texto, e é isso que impede o prompt de virar ruído.
            return 'indefinido';
    }
}

/** Quantos resultados o prompt carrega. Mais que isso vira parede de texto. */
export const CONSEQUENCIAS_NO_PROMPT = 4;

/**
 * As linhas que entram no prompt, das mais recentes para as mais antigas.
 * Vazio quando não há nada dizível — e nesse caso quem chama não escreve
 * cabeçalho nenhum, em vez de escrever "HISTÓRICO: (vazio)".
 */
export function linhasDeConsequencia(
    historico: readonly RegistroDeConsequencia[],
): string[] {
    return historico
        .filter((r) => r.resultado !== 'indefinido')
        .slice(-CONSEQUENCIAS_NO_PROMPT)
        .reverse()
        .map((r) => (r.resultado === 'ignorado'
            ? `you tried "${r.meta}" and it did not work — he did not respond`
            : `you tried "${r.meta}" and it worked`));
}

/**
 * ── A PERGUNTA QUE O DONO DO JOGO FEZ DE VERDADE ──────────────────────────
 * "pra ele não ficar repetindo sempre a mesma coisa".
 *
 * Saber que falhou não basta: o modelo precisa de uma instrução do que fazer
 * com essa informação, senão ele lê "não funcionou" e tenta de novo — que é o
 * comportamento mais provável de um modelo pequeno diante de um histórico sem
 * conclusão.
 *
 * A linha só aparece quando a MESMA meta falhou duas vezes seguidas. Uma falha
 * é acaso; duas é padrão, e é aí que insistir vira teimosia visível para quem
 * está jogando.
 */
export function avisoDeInsistencia(
    historico: readonly RegistroDeConsequencia[],
): string | null {
    const falhas = historico.filter((r) => r.resultado !== 'indefinido');
    const ultimas = falhas.slice(-2);
    if (ultimas.length < 2) return null;
    if (ultimas[0].meta !== ultimas[1].meta) return null;
    if (ultimas.some((r) => r.resultado !== 'ignorado')) return null;
    return `"${ultimas[0].meta}" has failed twice in a row. Choose something else this time.`;
}

/** A partir de quantas repetições seguidas ele se cansa. */
export const REPETICOES_ATE_ENJOAR = 3;

/**
 * ── O TÉDIO NÃO PRECISA DE FRACASSO ───────────────────────────────────────
 *
 * `avisoDeInsistencia` só fala quando a mesma meta FALHOU duas vezes seguidas:
 *
 *     if (ultimas.some((r) => r.resultado !== 'ignorado')) return null;
 *
 * Só que o defeito que o dono do jogo relatou desde o começo — "ele só fica
 * rondando de um lado pro outro" — acontece com a meta DANDO CERTO. Ele se
 * aproxima do jogador, o jogador reage, e ele se aproxima de novo. Nada nesse
 * histórico é uma falha, e por isso nada avisava.
 *
 * Uma pessoa não repete a mesma coisa cinco vezes porque funcionou; ela enjoa.
 * Este aviso é o enjoo, e ele não olha resultado nenhum: só quantas vezes
 * seguidas a mesma intenção apareceu.
 *
 * Não é proibição. O prompt continua livre — se ele tiver um motivo forte para
 * insistir, insiste. É a diferença entre um NPC teimoso e um NPC travado.
 */
export function avisoDeSaciedade(
    historico: readonly RegistroDeConsequencia[],
    quantas = REPETICOES_ATE_ENJOAR,
): string | null {
    if (historico.length < quantas) return null;
    const ultimas = historico.slice(-quantas);
    const meta = ultimas[0]?.meta;
    if (!meta || ultimas.some((r) => r.meta !== meta)) return null;
    return `You have done "${meta}" ${quantas} times in a row. `
        + 'You are sick of it — do something different this time, even something small.';
}

/**
 * O aviso que vai ao prompt: o enjoo manda quando os dois valem, porque
 * repetir POR TÉDIO é o caso comum e o texto dele já cobre o outro.
 */
export function avisoDoHistorico(
    historico: readonly RegistroDeConsequencia[],
): string | null {
    return avisoDeSaciedade(historico) ?? avisoDeInsistencia(historico);
}

/**
 * Guarda os resultados. Fica fora do módulo de deliberação de propósito: quem
 * OBSERVA o mundo é a tela do andar, e quem decide é o cérebro — misturar os
 * dois foi o que fez a fila perguntar a si mesma, uma vez, e não perguntar nada.
 */
export class MemoriaDeConsequencia {
    private readonly registros: RegistroDeConsequencia[] = [];

    /** Máximo guardado; o prompt usa só os últimos, mas a sala da mente lê tudo. */
    static readonly TETO = 24;

    anotar(meta: DeliberationGoal, resultado: Consequencia, em: number): void {
        this.registros.push({ meta, resultado, em });
        if (this.registros.length > MemoriaDeConsequencia.TETO) this.registros.shift();
    }

    /** Avalia e guarda de uma vez. Devolve o veredito para quem quiser mostrar. */
    conferir(
        meta: DeliberationGoal,
        antes: MundoObservado,
        depois: MundoObservado,
        em: number,
    ): Consequencia {
        const resultado = avaliarConsequencia(meta, antes, depois);
        this.anotar(meta, resultado, em);
        return resultado;
    }

    lista(): readonly RegistroDeConsequencia[] { return this.registros; }

    linhas(): string[] { return linhasDeConsequencia(this.registros); }

    aviso(): string | null { return avisoDoHistorico(this.registros); }

    limpar(): void { this.registros.length = 0; }
}
