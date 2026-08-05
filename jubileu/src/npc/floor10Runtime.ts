// ── QUAL DOS DOIS BINÁRIOS DO wllama ESTE APARELHO VAI RODAR ──────────────
//
// Eu passei esta sessão inteira medindo o Andar 10 num Chromium de bancada e
// concluindo coisas sobre o celular dele. Lendo o runtime, descobri que essa
// ponte pode simplesmente não existir: o wllama tem DOIS binários, e quem
// escolhe é o navegador.
//
//     needCompat() = !isSupportJSPI() || !isSupportMem64()
//
// O binário padrão exige as duas coisas. Conferido no próprio arquivo, lendo a
// seção de importações do `wllama.wasm`:
//
//     env.memory: flags=0x7 → temMax=true, shared=true, MEMORY64=true
//
// Ou seja: memória de 64 bits, compartilhada, teto de 4,00 GB. Um navegador sem
// memory64 OU sem JSPI não carrega esse arquivo — o wllama troca para o pacote
// `@wllama/wllama-compat`, BAIXADO DO CDN em tempo de execução, que é outro
// binário, com outro desempenho.
//
// O Chrome ganhou memory64 na 133 e JSPI na 137. Um Android com Chrome mais
// velho que isso roda o caminho compat — e nenhuma das minhas dez execuções
// mediu esse caminho.
//
// Este módulo não conserta nada. Ele faz a pergunta que faltava e põe a
// resposta no relatório que ele copia, para a próxima investigação começar
// sabendo QUAL runtime estava rodando.

export type CapacidadesDoRuntime = {
    /** `WebAssembly.Suspending` existe? É exatamente o teste do wllama. */
    jspi: boolean;
    /** Dá para construir uma memória de 64 bits? Idem. */
    mem64: boolean;
    /** SharedArrayBuffer utilizável — sem isto o wllama cai para 1 thread. */
    isolado: boolean;
    /**
     * `true` = este aparelho vai buscar o binário compat no CDN.
     * A fórmula é a do wllama, copiada, não uma aproximação.
     */
    precisaCompat: boolean;
};

function temJspi(): boolean {
    try {
        return !!(WebAssembly as { Suspending?: unknown }).Suspending;
    } catch { return false; }
}

function temMem64(): boolean {
    try {
        // O mesmo teste do wllama: construir 1 página endereçada por i64.
        new WebAssembly.Memory(
            { address: 'i64', initial: BigInt(1) } as unknown as WebAssembly.MemoryDescriptor,
        );
        return true;
    } catch { return false; }
}

export function capacidadesDoRuntime(): CapacidadesDoRuntime {
    const jspi = temJspi();
    const mem64 = temMem64();
    return {
        jspi,
        mem64,
        isolado: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true,
        precisaCompat: !jspi || !mem64,
    };
}

/**
 * A linha do relatório copiável. Diz o veredito primeiro — "compat" ou
 * "padrão" — porque é essa palavra que muda a leitura de todo o resto.
 */
export function resumoDoRuntime(): string {
    const c = capacidadesDoRuntime();
    const qual = c.precisaCompat
        ? 'COMPAT (binário do CDN, outro desempenho)'
        : 'padrão';
    const faltando = [
        c.jspi ? null : 'sem JSPI',
        c.mem64 ? null : 'sem memory64',
        c.isolado ? null : 'SEM ISOLAMENTO (wllama cai para 1 thread)',
    ].filter(Boolean).join(', ');
    return `runtime wllama: ${qual}${faltando ? ` · ${faltando}` : ''}`;
}
