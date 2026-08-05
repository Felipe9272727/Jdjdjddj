// ── O NÚMERO QUE MATA A ABA, MEDIDO NO APARELHO DE QUEM JOGA ───────────────
//
// A caixa-preta já registra ENGASGO — quanto tempo o quadro ficou parado e em
// que fase. É metade da história. A outra metade é a que derruba de vez:
//
//     "meu celular até desligou sozinho"
//
// Desligar de repente é assinatura de MEMÓRIA, não de calor: calor degrada
// progressivamente, o OOM killer do Android mata o renderer sem aviso. E o
// relatório copiável não trazia um único byte sobre memória — então toda
// conclusão minha sobre RAM veio de um celular EMULADO, numa caixa x86, com um
// modelo de reta em vez do aparelho dele.
//
// Este módulo fecha esse buraco. `performance.measureUserAgentSpecificMemory()`
// existe exatamente para isto, e o Andar 10 já cumpre o pré-requisito dela:
// COOP/COEP estão ligados por causa do SharedArrayBuffer do wllama, ou seja, a
// página é cross-origin isolated. O que era exigência virou vantagem.
//
// ── AS REGRAS, PORQUE ESTA API É CARA ─────────────────────────────────────
// A medição acontece durante uma coleta de lixo, então a promessa pode demorar
// segundos para resolver e o navegador limita a frequência. Logo:
//
//   - NUNCA no caminho de uma geração. Ela é uma pergunta de fundo.
//   - intervalo largo, e uma medição por vez;
//   - nunca lança e nunca bloqueia: sem a API, o relatório segue como antes.
//
// O que fica guardado é o PICO com a fase em que aconteceu — pico é o que
// decide se a aba morre, e a fase é o que diz de quem foi a culpa.
import { anotar } from './floor10CaixaPreta';

/** Uma leitura: quantos bytes o navegador atribuiu a esta aba, e quando. */
export type AmostraDeMemoria = {
    bytes: number;
    /** Fase do NPC no instante da leitura — 'ready', 'thinking', 'loading'… */
    fase: string;
    /** ms desde o início da página. */
    em: number;
};

type MedidorNativo = () => Promise<{
    bytes?: number;
    breakdown?: Array<{ bytes?: number; types?: string[] }>;
}>;

/**
 * De quanto em quanto tempo perguntar. 45 s é largo o bastante para não pesar e
 * curto o bastante para pegar o pico de uma carga de modelo, que leva dezenas
 * de segundos.
 */
export const MEMORIA_INTERVALO_MS = 45_000;

/**
 * O TETO DE CADA RUNTIME, LIDO DO BINÁRIO — não é estimativa.
 *
 * A memória do wllama.wasm é importada assim:
 *
 *     env.memory: shared=true, temMax=true, min=2048p, max=65536p
 *
 * 65536 páginas × 64 KiB = 4,00 GB. É o teto do wasm32, e é rígido: um cérebro
 * que passe disso aborta DENTRO do worker, sem o OOM killer do sistema entrar
 * na história. Fica aqui para o relatório poder dizer quanta folga sobra.
 */
export const TETO_WASM_BYTES = 65_536 * 65_536;

let pico: AmostraDeMemoria | null = null;
let ultima: AmostraDeMemoria | null = null;
let relogio: ReturnType<typeof setInterval> | null = null;
let medindo = false;

function medidor(): MedidorNativo | null {
    const p = globalThis.performance as (Performance & {
        measureUserAgentSpecificMemory?: MedidorNativo;
    }) | undefined;
    const fn = p?.measureUserAgentSpecificMemory;
    return typeof fn === 'function' ? fn.bind(p) : null;
}

/** A API existe E a página está isolada? As duas coisas, ou não há medição. */
export function memoriaMedivel(): boolean {
    if (!medidor()) return false;
    // `crossOriginIsolated` é o pré-requisito documentado. Sem ele a chamada
    // rejeita com SecurityError, e um erro por chamada a cada 45 s é ruído.
    const isolado = (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    return isolado !== false;
}

/**
 * Uma leitura, agora. Devolve `null` quando não dá — sem API, sem isolamento,
 * ou porque já existe uma medição em curso (a API não gosta de concorrência).
 */
export async function medirAgora(fase: string): Promise<AmostraDeMemoria | null> {
    const fn = medidor();
    if (!fn || medindo || !memoriaMedivel()) return null;
    medindo = true;
    try {
        const r = await fn();
        const bytes = typeof r?.bytes === 'number'
            ? r.bytes
            : (r?.breakdown ?? []).reduce((s, b) => s + (b.bytes ?? 0), 0);
        if (!(bytes > 0)) return null;
        const amostra: AmostraDeMemoria = {
            bytes,
            fase,
            em: Math.round(globalThis.performance?.now?.() ?? 0),
        };
        ultima = amostra;
        if (!pico || bytes > pico.bytes) {
            pico = amostra;
            // Só o pico vai para a caixa-preta. Uma anotação a cada leitura
            // encheria o buffer de 50 eventos com ruído e empurraria para fora
            // exatamente os eventos que explicam a travada.
            anotar('memoria:pico', { mb: Math.round(bytes / 1e6), fase });
        }
        return amostra;
    } catch {
        return null;
    } finally {
        medindo = false;
    }
}

/**
 * Liga a amostragem de fundo. Seguro chamar várias vezes; a segunda não faz
 * nada. `faseAtual` entra por parâmetro pelo mesmo motivo do medidor de
 * engasgo: este módulo não precisa conhecer o npcStore.
 */
export function vigiarMemoria(faseAtual: () => string): void {
    if (relogio !== null || !memoriaMedivel()) return;
    relogio = globalThis.setInterval(() => { void medirAgora(faseAtual()); }, MEMORIA_INTERVALO_MS);
    // Uma leitura logo de cara serve de linha de base: sem ela, o primeiro
    // número do relatório já seria o pico de uma carga, e "pico" sem base não
    // diz se o cérebro custou 300 MB ou 3 GB.
    void medirAgora(faseAtual());
}

export function pararDeVigiarMemoria(): void {
    if (relogio !== null) globalThis.clearInterval(relogio);
    relogio = null;
}

export function picoDeMemoria(): AmostraDeMemoria | null { return pico; }
export function ultimaMemoria(): AmostraDeMemoria | null { return ultima; }

const GB = (b: number): string => (b / 2 ** 30).toFixed(2);

/**
 * A linha do relatório copiável. Uma linha, com a conclusão — quem lê precisa
 * saber se o pico chegou perto de derrubar a aba, não de uma série temporal.
 */
export function resumoDeMemoria(): string {
    if (!memoriaMedivel()) {
        return 'memória: o navegador não expõe a medição (precisa de isolamento cross-origin)';
    }
    if (!pico) return 'memória: ainda sem leitura';
    const partes = [
        `memória: pico ${GB(pico.bytes)} GB na fase "${pico.fase}"`,
        `agora ${GB(ultima?.bytes ?? pico.bytes)} GB`,
        // A folga é contra o teto de UM runtime do wllama. Não é o limite do
        // aparelho — o Android derruba muito antes — mas é o único teto que dá
        // para afirmar com número, porque está escrito no binário.
        `folga até o teto de 4,00 GB do wasm: ${GB(TETO_WASM_BYTES - pico.bytes)} GB`,
    ];
    return partes.join(' · ');
}

/** Só para os testes. */
export function resetMemoriametroForTests(): void {
    pararDeVigiarMemoria();
    pico = null;
    ultima = null;
    medindo = false;
}
