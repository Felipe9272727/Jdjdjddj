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
    private atualId: string | null = null;
    private amostra: DownloadSample = DOWNLOAD_ZERO;

    constructor(itens: readonly FilaItem[] = []) {
        this.itens = [...itens];
    }

    /** Redefine quem está na fila. Ids já prontos continuam prontos. */
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
        };
    }

    /** Tudo que a fila precisava já está no aparelho? */
    completa(): boolean {
        return this.itens.length > 0
            && this.itens.every((i) => this.prontos.has(i.id));
    }

    reset(): void {
        this.prontos.clear();
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
    fala: number; vontade: number; motor: number;
}): void {
    floor10Fila.definir([
        { id: FILA_FALA, label: 'conversa', bytes: bytes.fala },
        { id: FILA_VONTADE, label: 'vontade', bytes: bytes.vontade },
        { id: FILA_MOTOR, label: 'movimento', bytes: bytes.motor },
    ]);
}

/**
 * A linha que o jogador lê: onde a fila está, sem ele precisar abrir nada.
 * Fica DELIBERADAMENTE curta — quem quiser o detalhe por modelo tem o ?mente.
 */
export function filaLinha(estado: FilaEstado): string {
    if (!estado.atual) {
        return estado.total > 0 && estado.prontos.length >= estado.total
            ? 'tudo pronto'
            : 'preparando…';
    }
    return `${estado.posicao} de ${estado.total} · ${estado.atual.label}`;
}
