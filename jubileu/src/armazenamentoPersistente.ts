// ── "GUARDADO" NÃO É "SEGURO" ─────────────────────────────────────────────
//
// Por padrão tudo o que o navegador guarda de um site é *best-effort*: quando o
// aparelho aperta de espaço, o Chrome escolhe uma origem e apaga tudo dela sem
// avisar. Com 4,2 GB de cérebros no OPFS, este site é o candidato mais gordo da
// lista — é o primeiro a ser despejado.
//
// `navigator.storage.persist()` troca esse status por PERSISTENT: o navegador
// deixa de despejar por conta própria; só sai se o próprio jogador limpar os
// dados. É uma chamada e resolve a metade do problema que não tem a ver com
// origem.
//
// QUANDO O CHROME CONCEDE (Android, medido pelo comportamento documentado):
// ele não pergunta nada; decide sozinho por sinais de engajamento — e o mais
// forte deles é o site estar INSTALADO na tela inicial. É por isso que o
// manifest.webmanifest entrou junto: "Adicionar à tela inicial" não é enfeite,
// é o que faz este pedido ser aceito.
//
// O pedido é repetido a cada abertura de propósito: uma recusa hoje (site
// recém-aberto, sem engajamento) vira concessão depois que o jogo é instalado,
// e não haveria outro momento para perguntar de novo.

export type EstadoArmazenamento = {
    /** O navegador prometeu não despejar sozinho. */
    persistido: boolean;
    /** Bytes já ocupados por este site (modelos + jogo + saves). */
    uso: number;
    /** Teto que o navegador oferece; null quando ele não informa. */
    cota: number | null;
    /** Por que não deu para pedir, quando não deu. */
    motivo: string;
};

const DESCONHECIDO: EstadoArmazenamento = Object.freeze({
    persistido: false,
    uso: 0,
    cota: null,
    motivo: 'navegador sem StorageManager',
});

type StorageManagerLike = {
    persist?: () => Promise<boolean>;
    persisted?: () => Promise<boolean>;
    estimate?: () => Promise<{ usage?: number; quota?: number }>;
};

function gerente(): StorageManagerLike | undefined {
    return (globalThis.navigator as unknown as { storage?: StorageManagerLike } | undefined)?.storage;
}

export async function lerArmazenamento(): Promise<EstadoArmazenamento> {
    const storage = gerente();
    if (!storage) return DESCONHECIDO;
    let persistido = false;
    let uso = 0;
    let cota: number | null = null;
    try { persistido = (await storage.persisted?.()) ?? false; } catch { /* sem suporte */ }
    try {
        const est = await storage.estimate?.();
        uso = typeof est?.usage === 'number' ? est.usage : 0;
        cota = typeof est?.quota === 'number' ? est.quota : null;
    } catch { /* sem suporte */ }
    return { persistido, uso, cota, motivo: '' };
}

/**
 * Pede armazenamento persistente. Idempotente e silencioso: se já estiver
 * concedido não pede de novo, e uma recusa nunca atrapalha o jogo — só
 * significa que o despejo continua possível até o jogo ser instalado.
 */
export async function pedirPersistencia(): Promise<EstadoArmazenamento> {
    const storage = gerente();
    if (!storage?.persist) return DESCONHECIDO;
    try {
        const jaTinha = (await storage.persisted?.()) ?? false;
        const concedido = jaTinha || await storage.persist();
        const estado = await lerArmazenamento();
        return { ...estado, persistido: concedido || estado.persistido };
    } catch (erro) {
        return { ...DESCONHECIDO, motivo: erro instanceof Error ? erro.message : String(erro) };
    }
}

/**
 * Chamado no boot. Deixa o resultado em `window.__armazenamento` porque o
 * aparelho onde isto importa é um celular, onde não há DevTools à mão — e
 * "está persistido?" é a primeira pergunta quando algo baixar de novo.
 */
export function iniciarPersistencia(): void {
    void pedirPersistencia().then((estado) => {
        (globalThis as { __armazenamento?: EstadoArmazenamento }).__armazenamento = estado;
    });
}
