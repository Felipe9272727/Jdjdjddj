// ── A FILA DE DOWNLOAD ─────────────────────────────────────────────────────
// UMA barra para todos os cérebros, um depois do outro.
//
// POR QUE MUDOU
// Cada modelo tinha a sua própria barra, e isso parecia certo enquanto eu
// escrevia. Jogando, não é: eles não baixam juntos. A fala desce primeiro, a
// vontade só começa quando a fala acaba, o motor só depois da vontade. O que o
// jogador via era uma barra aparecendo, sumindo, e outra nascendo do zero
// minutos depois — sem nunca dizer QUANTO FALTA NO TOTAL, que é a única coisa
// que ele quer saber.
//
// Aqui a pergunta passa a ser respondida de uma vez: "faltam 2,1 GB de 3,9 GB,
// baixando o 2º de 3". As barras por modelo continuam existindo no ?mente e na
// bancada, onde a granularidade é o ponto; no jogo, uma só.
//
// Este módulo é PURO: sem three, sem react, sem wllama. Ele só recebe o
// progresso de quem está baixando e responde o estado da fila inteira.
import { DOWNLOAD_ZERO, type DownloadSample } from './floor10Download';

/** Um cérebro na fila, na ordem em que o jogo precisa dele. */
export type FilaItem = {
    id: string;
    /** Nome curto, do jeito que aparece na tela. */
    label: string;
    bytes: number;
};

export type FilaEstado = {
    /** Quem está baixando agora; null quando a fila está parada. */
    atual: FilaItem | null;
    /** Posição dele na fila, começando em 1. */
    posicao: number;
    total: number;
    /** 0..1 sobre o TOTAL de bytes da fila, não sobre o arquivo atual. */
    fracao: number;
    bytesBaixados: number;
    bytesTotais: number;
    /** A amostra do arquivo em curso — velocidade e "parado há Ns" são dele. */
    amostra: DownloadSample;
    /** Ids já concluídos, para não recontar. */
    prontos: readonly string[];
    /** Quem não desceu, e por quê. Os bytes destes NÃO entram na fração. */
    falhados: readonly { id: string; motivo: string }[];
};

export const FILA_VAZIA: FilaEstado = Object.freeze({
    atual: null,
    posicao: 0,
    total: 0,
    fracao: 0,
    bytesBaixados: 0,
    bytesTotais: 0,
    amostra: DOWNLOAD_ZERO,
    prontos: Object.freeze([]),
    falhados: Object.freeze([]),
});

/**
 * A fila. Guarda quem já veio, quem está vindo e quanto falta no total.
 *
 * Ela NÃO baixa nada e NÃO decide a ordem: quem faz isso continua sendo cada
 * cérebro, no seu tempo, como já era. Ela só olha e conta — por isso trocar a
 * ordem, ou acrescentar um quarto modelo, não exige tocar em nada aqui além da
 * lista.
 */
export class Floor10Fila {
    private itens: FilaItem[] = [];
    private prontos = new Set<string>();
    private falhados = new Map<string, string>();
    private atualId: string | null = null;
    private amostra: DownloadSample = DOWNLOAD_ZERO;

    constructor(itens: readonly FilaItem[] = []) {
        this.itens = [...itens];
    }

    /** Redefine quem está na fila. Ids já prontos continuam prontos. */
    /**
     * A ORDEM, para quem precisa conferi-la.
     *
     * Existe porque a ordem desta fila é uma decisão de produto, não um
     * detalhe: ela decide quantos gigabytes o jogador espera antes de o Nilo
     * conseguir andar. Já ficou errada uma vez (a memória virou o motor e
     * continuou em quarto lugar, atrás de 639 MB de reserva), e sem um jeito de
     * lê-la o teste não tinha como prender isso.
     */
    ordem(): readonly string[] {
        return this.itens.map((i) => i.id);
    }

    definir(itens: readonly FilaItem[]): void {
        this.itens = [...itens];
    }

    /** Um cérebro reportou progresso. */
    progresso(id: string, amostra: DownloadSample): FilaEstado {
        this.atualId = id;
        this.amostra = amostra;
        // Chegou ao fim? Marca pronto e libera a vez. O `>= 1` é sobre a
        // fração porque nem todo servidor informa o total exato.
        if (amostra.totalBytes > 0 && amostra.bytes >= amostra.totalBytes) {
            this.prontos.add(id);
        }
        return this.estado();
    }

    /** Este cérebro terminou (carregou, veio do cache, ou já estava pronto). */
    concluir(id: string): FilaEstado {
        this.prontos.add(id);
        if (this.atualId === id) {
            this.atualId = null;
            this.amostra = DOWNLOAD_ZERO;
        }
        return this.estado();
    }

    /**
     * Este cérebro NÃO desceu. Diferente de `concluir`: os bytes dele não
     * entram na conta, e a fila guarda o motivo para a tela poder dizer.
     *
     * A distinção nasceu de um defeito real: a pré-carga marcava como
     * CONCLUÍDO o modelo que tinha falhado, então a barra pulava 1,32 GB que
     * nunca chegaram e seguia para o próximo como se tudo estivesse bem. Quem
     * joga percebeu antes de mim — "pulou direto pra baixar o motor".
     */
    falhar(id: string, motivo: string): FilaEstado {
        this.falhados.set(id, motivo);
        this.prontos.delete(id);
        if (this.atualId === id) {
            this.atualId = null;
            this.amostra = DOWNLOAD_ZERO;
        }
        return this.estado();
    }

    /** Ninguém está baixando agora. */
    ocioso(): FilaEstado {
        this.atualId = null;
        this.amostra = DOWNLOAD_ZERO;
        return this.estado();
    }

    estado(): FilaEstado {
        const bytesTotais = this.itens.reduce((s, i) => s + i.bytes, 0);
        const atual = this.itens.find((i) => i.id === this.atualId) ?? null;
        // Bytes já garantidos: tudo que está pronto, mais o que veio do arquivo
        // em curso. Um item pronto conta INTEIRO mesmo que a amostra dele tenha
        // sido descartada — senão a barra andaria para trás entre um e outro.
        let bytesBaixados = 0;
        for (const i of this.itens) {
            if (this.prontos.has(i.id)) bytesBaixados += i.bytes;
        }
        if (atual && !this.prontos.has(atual.id)) {
            bytesBaixados += Math.min(this.amostra.bytes, atual.bytes);
        }
        // A posição é contada sobre a fila REAL, para "2 de 3" bater com o que
        // o jogador vê acontecer.
        const posicao = atual
            ? this.itens.findIndex((i) => i.id === atual.id) + 1
            : this.prontos.size;
        return {
            atual,
            posicao,
            total: this.itens.length,
            fracao: bytesTotais > 0
                ? Math.max(0, Math.min(1, bytesBaixados / bytesTotais))
                : 0,
            bytesBaixados,
            bytesTotais,
            amostra: this.amostra,
            prontos: [...this.prontos],
            falhados: [...this.falhados.entries()].map(([id, motivo]) => ({ id, motivo })),
        };
    }

    /** Tudo que a fila precisava já está no aparelho? */
    completa(): boolean {
        return this.itens.length > 0
            && this.itens.every((i) => this.prontos.has(i.id));
    }

    reset(): void {
        this.prontos.clear();
        this.falhados.clear();
        this.atualId = null;
        this.amostra = DOWNLOAD_ZERO;
    }
}

/** A fila viva do Andar 10. */
export const floor10Fila = new Floor10Fila();

/** Ids fixos: quem reporta progresso usa estes, e a ordem é a da fila. */
export const FILA_FALA = 'fala';
export const FILA_VONTADE = 'vontade';
export const FILA_MOTOR = 'motor';
export const FILA_MEMORIA = 'memoria';
/** O reflexo (ONNX). Último da fila: é o único que o jogo não precisa para falar. */
export const FILA_REFLEXO = 'reflexo';

/**
 * A ORDEM É A DO JOGO, não a do meu gosto.
 *
 * A fala vem primeiro porque é ela que o jogador está esperando quando abre a
 * conversa. A vontade só começa quando a fala solta a CPU. O motor é o último
 * porque só serve depois que existe um pensamento para traduzir.
 *
 * Os tamanhos entram por parâmetro para este módulo não importar nenhum dos
 * motores — importar fecharia um ciclo, já que os três reportam progresso aqui.
 */
export function definirFilaDoAndar10(bytes: {
    fala: number; vontade: number; motor: number; memoria: number; reflexo?: number;
}): void {
    floor10Fila.definir([
        { id: FILA_FALA, label: 'conversa', bytes: bytes.fala },
        { id: FILA_VONTADE, label: 'vontade', bytes: bytes.vontade },
        // ── A MEMÓRIA SUBIU, E O MOTOR DESCEU ────────────────────────────
        //
        // A ordem aqui virou de cabeça para baixo quando o embeddinggemma
        // passou a SER o motor (ver floor10Rotulos / floor10MotorVetor). Ela
        // ficou assim, e eu não percebi na hora de trocar:
        //
        //     fala 1,9 GB · vontade 1,25 GB · MOTOR 639 MB · memória 333 MB
        //
        // Ou seja: o modelo de que o Nilo precisa para ANDAR era o quarto da
        // fila, atrás de 639 MB que ele quase não usa mais. No celular isso são
        // 4,1 GB antes de o corpo dar o primeiro passo.
        //
        // O comentário antigo dizia "a memória é a última de propósito, sem ela
        // o Nilo continua falando". Continua verdade para a FALA — e virou
        // mentira para o MOVIMENTO no dia em que ela virou o motor.
        { id: FILA_MEMORIA, label: 'memória e movimento', bytes: bytes.memoria },
        // O REFLEXO É O ÚLTIMO, e por um motivo: ele é o único cujo trabalho o
        // jogo já sabe fazer sem ele (esperar). Descer antes de qualquer um dos
        // outros seria atrasar algo de que a conversa depende para adiantar um
        // conforto. Opcional também na fila: sem tamanho, nem aparece.
        ...(bytes.reflexo ? [{ id: FILA_REFLEXO, label: 'reflexo', bytes: bytes.reflexo }] : []),
        // O MOTOR QWEN3 É O ÚLTIMO PORQUE VIROU RESERVA. Ele só entra em ação
        // no aparelho onde o embedding não subiu — e reserva que desce ANTES do
        // titular é reserva que se justifica sozinha: enquanto ela ocupava o
        // terceiro lugar, a janela em que ela era "necessária" era criada pela
        // própria posição dela na fila.
        { id: FILA_MOTOR, label: 'movimento (reserva)', bytes: bytes.motor },
    ]);
}

/**
 * A linha que o jogador lê: onde a fila está, sem ele precisar abrir nada.
 * Fica DELIBERADAMENTE curta — quem quiser o detalhe por modelo tem o ?mente.
 */
export function filaLinha(estado: FilaEstado): string {
    // A falha vem PRIMEIRO na linha: um cérebro que não desceu é a informação
    // mais importante da tela, não uma nota de rodapé.
    if (estado.falhados.length > 0 && !estado.atual) {
        return `${estado.falhados.length} de ${estado.total} não baixou`;
    }
    if (!estado.atual) {
        return estado.total > 0 && estado.prontos.length >= estado.total
            ? 'tudo pronto'
            : 'preparando…';
    }
    return `${estado.posicao} de ${estado.total} · ${estado.atual.label}`;
}
