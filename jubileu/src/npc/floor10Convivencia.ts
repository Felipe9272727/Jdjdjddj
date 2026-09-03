// ── O QUE ELE VIVEU COM VOCÊ, E QUE HOJE SE PERDE NUM F5 ──────────────────
//
// Levantamento do que falta para o Nilo parecer um player, feito a pedido do
// dono do jogo. Dois dos cinco buracos eram este:
//
//   · a conversa NÃO sobrevive a uma recarga — `history: []` no estado inicial
//     e nenhum `setItem` em lugar nenhum. Dentro da sessão ela é preservada de
//     propósito (`npcSaiuDoAndar` não a apaga, e o comentário lá diz por quê),
//     mas um F5 zera;
//   · não existe modelo do jogador. Procurei: nada. O cânone diz que ele não
//     sabe seu nome "até que você conte" — e nada guarda o que você contou.
//
// O resultado é um personagem que APRENDE A SE COMPORTAR e esquece quem é
// você: a rede de reforço da vontade persiste no localStorage há tempos, a
// memória da convivência não.
//
// ── A REGRA DESTE ARQUIVO: SÓ O QUE DÁ PARA CONTAR ───────────────────────
//
// Nada aqui é inferido de texto livre. Extrair "o jogador disse que se chama X"
// de uma conversa exigiria um modelo, e modelo inventa — este projeto já gastou
// uma sessão inteira medindo fato inventado. O que entra são grandezas que o
// jogo OBSERVA:
//
//     quantas vezes vocês conversaram
//     quanto tempo ele passou sem aparecer
//     quantas vezes o Nilo se aproximou e foi ignorado
//
// São exatamente as três coisas que fazem um NPC soar como quem te conhece —
// "de novo você", "sumiu", "cansei de chamar" — e nenhuma delas precisa
// adivinhar nada.
import type { NpcMsg } from './npcStore';

const CHAVE = 'floor10-convivencia-v1';
const CHAVE_CONVERSA = 'floor10-conversa-v1';

export type Convivencia = {
    /** Sessões em que vocês trocaram pelo menos uma fala. */
    encontros: number;
    /** Quando foi a última fala, em ms de época. `null` = nunca conversaram. */
    ultimaFala: number | null;
    /** Falas do jogador somadas, de todas as sessões. */
    falasDoJogador: number;
    /**
     * Vezes em que ele se aproximou e o jogador não respondeu.
     *
     * Quem mede isto é `floor10Consequencia`, que já compara o mundo antes e
     * depois de cada meta. Aqui só se acumula o que ela apurou — inventar
     * "você me ignorou" a partir de silêncio seria adivinhação.
     */
    ignoradas: number;
};

export const CONVIVENCIA_ZERO: Readonly<Convivencia> = Object.freeze({
    encontros: 0,
    ultimaFala: null,
    falasDoJogador: 0,
    ignoradas: 0,
});

function armazem(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        // Safari em janela privada ATIRA ao só tocar em `localStorage`. Um
        // personagem que não lembra é um defeito; um jogo que não abre é outro.
        return null;
    }
}

/** Um número que veio do disco só vale se for número, e se fizer sentido. */
function inteiroNaoNegativo(valor: unknown): number {
    return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
        ? Math.floor(valor)
        : 0;
}

export function lerConvivencia(): Convivencia {
    const loja = armazem();
    if (!loja) return { ...CONVIVENCIA_ZERO };
    try {
        const cru = loja.getItem(CHAVE);
        if (!cru) return { ...CONVIVENCIA_ZERO };
        const d = JSON.parse(cru) as Partial<Convivencia>;
        return {
            encontros: inteiroNaoNegativo(d.encontros),
            ultimaFala: typeof d.ultimaFala === 'number' && Number.isFinite(d.ultimaFala)
                ? d.ultimaFala
                : null,
            falasDoJogador: inteiroNaoNegativo(d.falasDoJogador),
            ignoradas: inteiroNaoNegativo(d.ignoradas),
        };
    } catch {
        // JSON corrompido é o mesmo que não haver registro: começar do zero é
        // pior do que lembrar, e MUITO melhor do que quebrar o andar.
        return { ...CONVIVENCIA_ZERO };
    }
}

export function salvarConvivencia(c: Convivencia): void {
    const loja = armazem();
    if (!loja) return;
    try {
        loja.setItem(CHAVE, JSON.stringify(c));
    } catch {
        // Cota estourada. O jogo continua; ele só não vai lembrar desta vez.
    }
}

/**
 * A conversa, para sobreviver à recarga.
 *
 * Guarda o que `MAX_HISTORICO` já deixou passar — a poda mora no `npcSet`, que
 * é o funil, e repeti-la aqui seria uma segunda regra para divergir da
 * primeira.
 */
export function salvarConversa(history: readonly NpcMsg[]): void {
    const loja = armazem();
    if (!loja) return;
    try {
        loja.setItem(CHAVE_CONVERSA, JSON.stringify(history));
    } catch {
        // Idem: cota cheia não pode derrubar o andar.
    }
}

export function lerConversa(): NpcMsg[] {
    const loja = armazem();
    if (!loja) return [];
    try {
        const cru = loja.getItem(CHAVE_CONVERSA);
        if (!cru) return [];
        const d = JSON.parse(cru);
        if (!Array.isArray(d)) return [];
        // Cada mensagem é conferida: um `history` com item torto quebraria o
        // painel na primeira renderização, e o disco não é uma fonte confiável.
        return d.filter((m): m is NpcMsg =>
            !!m && typeof m === 'object'
            && (m.role === 'user' || m.role === 'assistant')
            && typeof m.content === 'string');
    } catch {
        return [];
    }
}

export function esquecerConvivencia(): void {
    const loja = armazem();
    if (!loja) return;
    try {
        loja.removeItem(CHAVE);
        loja.removeItem(CHAVE_CONVERSA);
    } catch { /* nada a fazer */ }
}

const HORA = 3_600_000;
const DIA = 24 * HORA;

/**
 * Quanto tempo ele passou sem te ver, em português corrente.
 *
 * Devolve string vazia quando é pouco: um NPC que diz "faz três minutos que
 * você não aparece" não soa atento, soa quebrado.
 */
export function tempoSemVer(desde: number | null, agora: number): string {
    if (desde === null || !Number.isFinite(desde)) return '';
    const passou = agora - desde;
    if (passou < HORA) return '';
    if (passou < DIA) {
        const horas = Math.floor(passou / HORA);
        return horas === 1 ? 'cerca de uma hora' : `cerca de ${horas} horas`;
    }
    const dias = Math.floor(passou / DIA);
    return dias === 1 ? 'cerca de um dia' : `cerca de ${dias} dias`;
}

/**
 * A linha que entra no prompt — ou nada.
 *
 * ── POR QUE ELA PODE SER VAZIA, E POR QUE ISSO IMPORTA ───────────────────
 *
 * No primeiro encontro não há o que lembrar, e escrever "esta é a primeira vez"
 * seria gastar tokens de prefill para dizer ao modelo o que ele já vai fazer
 * sozinho. Cada bloco deste prompt custa leitura em todo turno; este só aparece
 * quando tem conteúdo.
 *
 * E ela vai DEPOIS da persona, junto do resumo: os dois mudam devagar, então o
 * prefixo em cache sobrevive entre uma pergunta e outra. Ver a seção do cache
 * de prefixo em `bancada-navegador/JA-TENTADO.md`.
 */
export function blocoDaConvivencia(c: Convivencia, agora: number): string {
    if (c.encontros <= 0) return '';
    const partes: string[] = [];
    if (c.encontros === 1) partes.push('vocês já conversaram uma vez');
    else partes.push(`vocês já conversaram ${c.encontros} vezes`);

    const sumido = tempoSemVer(c.ultimaFala, agora);
    if (sumido) partes.push(`ele sumiu por ${sumido}`);

    // Só quando é padrão, não acidente: uma aproximação ignorada acontece com
    // qualquer um. Três é o jogador fazendo isso de propósito.
    if (c.ignoradas >= 3) {
        partes.push(`você já se aproximou ${c.ignoradas} vezes sem ele responder`);
    }
    return `\n\nO QUE VOCÊS JÁ VIVERAM (lembrança sua, não invente além disto): ${partes.join('; ')}.`;
}

/** Registra uma fala do jogador. Devolve o registro novo, sem gravar. */
export function comFalaDoJogador(c: Convivencia, agora: number): Convivencia {
    // ── O QUE CONTA COMO "ENCONTRO" ──────────────────────────────────────
    //
    // Não é abrir o painel: é FALAR. E não é cada fala: sessões separadas por
    // menos de uma hora são a mesma conversa, senão sair do andar e voltar
    // inflaria a conta e o Nilo diria "já conversamos 40 vezes" no mesmo dia.
    const mesmaConversa = c.ultimaFala !== null && agora - c.ultimaFala < HORA;
    return {
        encontros: mesmaConversa ? c.encontros : c.encontros + 1,
        ultimaFala: agora,
        falasDoJogador: c.falasDoJogador + 1,
        ignoradas: c.ignoradas,
    };
}

/** Registra uma aproximação que o jogador não respondeu. */
export function comAproximacaoIgnorada(c: Convivencia): Convivencia {
    return { ...c, ignoradas: c.ignoradas + 1 };
}

// ── O MONTADOR DO PROMPT NÃO PODE IR AO DISCO A CADA TURNO ───────────────
//
// `buildFloor10SystemPrompt` é síncrono, puro e roda em teste sem navegador. Um
// `getItem` lá dentro o tornaria dependente do ambiente e o faria pagar disco em
// toda fala. O padrão que este arquivo segue é o do `blocoDoResumo`, que já lê
// estado de módulo: o valor vive aqui, é carregado uma vez e reescrito por quem
// muda — e começa VAZIO, de forma que nenhum teste existente veja bloco novo
// sem pedir.
let atual: Convivencia | null = null;

export function convivenciaAtual(): Convivencia {
    if (atual === null) atual = lerConvivencia();
    return atual;
}

/** Uma fala do jogador acabou de chegar. Atualiza memória e disco. */
export function registrarFalaDoJogador(agora = Date.now()): Convivencia {
    atual = comFalaDoJogador(convivenciaAtual(), agora);
    salvarConvivencia(atual);
    return atual;
}

/** O Nilo se aproximou e o jogador não respondeu — quem apurou foi a consequência. */
export function registrarAproximacaoIgnorada(): Convivencia {
    atual = comAproximacaoIgnorada(convivenciaAtual());
    salvarConvivencia(atual);
    return atual;
}

/** Só para teste: devolve o módulo ao estado de quem nunca leu o disco. */
export function esquecerConvivenciaEmMemoria(): void {
    atual = null;
}
