// ── O AGENTE-JOGADOR: A PARTE QUE DECIDE, E O CORPO OBEDECE ───────────────
//
// Quarto pedaço do "faça tudo": a vontade dirigindo. Até aqui o agente sabia
// andar (`agenteAndar`), sabia o que fazer (`agenteObjetivo`) e sabia encostar
// nas coisas (`agenteInteracao`) — mas quem escolhia era um alvo cravado no
// código. Aqui a escolha passa a ser do pensamento.
//
// ── A QUEIXA QUE ESTE ARQUIVO EXISTE PARA MATAR ──────────────────────────
//
//   "por mais que o vetor acerte, no campo, o Nilo não anda realmente, ele
//    simplesmente fica parado"
//
// O diagnóstico, depois de tudo o que foi medido: o vetor acertava a INTENÇÃO
// e o mundo não tinha como responder. Escolher "ir para o lado norte" não move
// ninguém se ninguém traduzir isso em um ponto pisável e um caminho até lá.
//
// A correção estrutural está na ordem das coisas:
//
//     PRIMEIRO o mundo diz o que é possível daqui.
//     DEPOIS a vontade escolhe entre o que é possível.
//
// Não o contrário. Um menu montado antes da percepção deixa o modelo escolher
// o impossível, e um modelo que escolhe o impossível vira um NPC parado — sem
// erro nenhum no log, porque, do ponto de vista do código, ele decidiu. É por
// isso que `opcoesDaqui` filtra por ALCANCE A PÉ antes de mostrar qualquer
// coisa: o que entra no menu, o corpo consegue cumprir.
//
// ── E SE O PENSAMENTO NÃO CASAR COM NADA ─────────────────────────────────
//
// Aí ele explora. Nunca "nada". Um agente que congela quando não entende a
// própria vontade é pior que um que anda para o lugar errado: o errado se
// corrige no próximo turno, o congelado não gera turno nenhum.
import { MemoriaDeBolhas } from '../npc/floor10Bolha';
import type { Ponto } from './agenteMapa';
import { type Tentativa, irAte } from './agenteAndar';
import {
    type EstadoDoAndar, DENTRO_DO_CAB, alcanca, dentroDoCab, oQueFazerAqui,
} from './agenteObjetivo';
import {
    type Interagivel, chegarPerto, interagiveisDoAndar,
} from './agenteInteracao';

export type TipoDeOpcao = 'elevador' | 'interagir' | 'explorar';

export type Opcao = {
    id: string;
    /** Em primeira pessoa: é este texto que a vontade lê e escolhe. */
    rotulo: string;
    tipo: TipoDeOpcao;
    alvo: Ponto;
    /** Só para `interagir`: o raio em que o jogo aceita. */
    alcance?: number;
};

/**
 * O menu do que dá para fazer DAQUI. Tudo o que entra aqui é executável: o
 * elevador só aparece se levar a algum lugar e houver caminho, e um aparelho
 * só aparece se ele conseguir chegar ao raio de acionamento.
 *
 * `explorar` está sempre no fim, e de propósito: é o que sobra quando não há
 * mais nada, e o que impede o menu de sair vazio.
 */
export function opcoesDaqui(
    andar: EstadoDoAndar,
    de: Ponto,
    extras: readonly Interagivel[] = [],
): Opcao[] {
    const menu: Opcao[] = [];

    if (andar.oCabResponde && !dentroDoCab(andar.nivel, de)
        && alcanca(andar, de, DENTRO_DO_CAB)) {
        menu.push({
            id: 'elevador',
            rotulo: 'entrar no elevador e ir para outro andar',
            tipo: 'elevador',
            alvo: DENTRO_DO_CAB,
        });
    }

    for (const alvo of interagiveisDoAndar(andar.nivel, extras)) {
        // A checagem é a mesma que o `chegarPerto` faz, e é cara. Vale: um item
        // de menu que o corpo não cumpre é exatamente o defeito que este
        // arquivo existe para não repetir.
        const tentativa = chegarPerto(andar, de, alvo);
        if (!tentativa.encostou) continue;
        menu.push({
            id: `interagir:${alvo.nome}`,
            rotulo: `chegar perto ${comArtigo(alvo.nome)}`,
            tipo: 'interagir',
            alvo: alvo.pos,
            alcance: alvo.alcance,
        });
    }

    // O `explorar` usa o alvo do objetivo geral, e quando o objetivo geral já é
    // o elevador esse alvo é o cab — que é a resposta certa: "ir ver o mais
    // longe" num andar cuja saída é a porta ali do lado é ir até a porta.
    menu.push({
        id: 'explorar',
        rotulo: 'ir ver a parte mais distante deste andar',
        tipo: 'explorar',
        alvo: oQueFazerAqui(andar, de).alvo,
    });
    return menu;
}

/** "da recepção", "do elevador" — o rótulo é lido por um modelo, então soa. */
function comArtigo(nome: string): string {
    return /^(a |placa|alavanca|cama|porta|recep)/i.test(nome) ? `da ${nome}` : `do ${nome}`;
}

/**
 * Como o pensamento vira nota para cada opção. Injetável de propósito.
 *
 * No jogo quem ranqueia é o vetor (EmbeddingGemma + `floor10Classificador`),
 * que já está medido e já está baixado. Aqui ele NÃO entra por importação: um
 * módulo que carrega 333 MB não é testável, e a decisão deixaria de ser
 * mensurável sem rede. Entra por parâmetro; o padrão abaixo é o piso.
 */
export type Ranqueador = (pensamento: string, rotulos: readonly string[]) => readonly number[];

/**
 * O ranqueador de reserva: sobreposição de palavras com peso.
 *
 * Reusa a normalização da `MemoriaDeBolhas` (sem acento, sem pontuação) e a
 * mesma ideia de "palavra com peso" — as curtas não contam, senão qualquer par
 * de frases em português se pareceria. Não é o vetor e não tenta ser: é o que
 * garante que o agente continue decidindo quando o modelo não carregou.
 */
export const ranqueadorDePalavras: Ranqueador = (pensamento, rotulos) => {
    const pesadas = (s: string) => new Set(
        MemoriaDeBolhas.chave(s).split(' ').filter((p) => p.length > 3),
    );
    const pp = pesadas(pensamento);
    return rotulos.map((r) => {
        const pr = pesadas(r);
        if (pp.size === 0 || pr.size === 0) return 0;
        let comuns = 0;
        for (const p of pr) if (pp.has(p)) comuns += 1;
        return comuns / pr.size;
    });
};

/** Abaixo disto o pensamento não se parece com nada do menu. */
export const PISO_DA_VONTADE = 0.2;

export type Escolha = {
    opcao: Opcao;
    nota: number;
    /** Distância para a segunda colocada. Baixa = ele estava em dúvida. */
    margem: number;
    /** Nada no menu se pareceu com o pensamento; caiu no explorar. */
    porPadrao: boolean;
};

/**
 * A vontade escolhe. Nunca devolve "nada" — ver o cabeçalho.
 */
export function escolher(
    opcoes: readonly Opcao[],
    pensamento: string,
    ranquear: Ranqueador = ranqueadorDePalavras,
): Escolha {
    // `opcoesDaqui` nunca devolve vazio, mas isto é exportado e a alternativa
    // seria estourar num `undefined` dentro do turno — longe da causa.
    if (opcoes.length === 0) {
        throw new Error('escolher: menu vazio — opcoesDaqui sempre inclui "explorar"');
    }
    const notas = ranquear(pensamento, opcoes.map((o) => o.rotulo));
    let melhor = 0;
    let segunda = -Infinity;
    for (let i = 1; i < opcoes.length; i += 1) {
        if ((notas[i] ?? 0) > (notas[melhor] ?? 0)) melhor = i;
    }
    for (let i = 0; i < opcoes.length; i += 1) {
        if (i !== melhor) segunda = Math.max(segunda, notas[i] ?? 0);
    }
    const nota = notas[melhor] ?? 0;
    if (nota < PISO_DA_VONTADE) {
        const explorar = opcoes.find((o) => o.tipo === 'explorar') ?? opcoes[opcoes.length - 1];
        return { opcao: explorar, nota, margem: 0, porPadrao: true };
    }
    return {
        opcao: opcoes[melhor],
        nota,
        margem: nota - (segunda === -Infinity ? 0 : segunda),
        porPadrao: false,
    };
}

export type Turno = {
    escolha: Escolha;
    /** O que o CORPO fez. `passos > 0` é a prova de que ele andou. */
    andou: Tentativa;
    /** Onde ele ficou. É a entrada do próximo turno. */
    fim: Ponto;
    /** Cumpriu o que escolheu? */
    cumpriu: boolean;
};

/**
 * ── UM TURNO INTEIRO: PENSAMENTO ENTRA, CORPO SE MEXE ────────────────────
 *
 * A função que fecha o circuito. Se ela devolver `andou.passos === 0` num
 * ponto onde havia para onde ir, é a queixa do dono do jogo voltando — e agora
 * há um número para apontar, em vez de "ele fica parado".
 */
export function jogarUmTurno(
    andar: EstadoDoAndar,
    de: Ponto,
    pensamento: string,
    opcoes: {
        extras?: readonly Interagivel[];
        ranquear?: Ranqueador;
    } = {},
): Turno {
    const menu = opcoesDaqui(andar, de, opcoes.extras);
    const escolha = escolher(menu, pensamento, opcoes.ranquear);
    const { opcao } = escolha;

    if (opcao.tipo === 'interagir' && opcao.alcance !== undefined) {
        const r = chegarPerto(andar, de, {
            nome: opcao.id, pos: opcao.alvo, alcance: opcao.alcance,
        });
        return { escolha, andou: r, fim: r.fim, cumpriu: r.encostou };
    }

    const r = irAte(andar.grade, andar.paredes, de, opcao.alvo);
    const cumpriu = opcao.tipo === 'elevador'
        ? r.chegou && dentroDoCab(andar.nivel, r.fim)
        : r.chegou;
    return { escolha, andou: r, fim: r.fim, cumpriu };
}
