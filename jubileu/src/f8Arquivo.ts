/**
 * f8Arquivo.ts — ANDAR 8: "O INTERROGATÓRIO" e a porta 21.
 *
 * O player desembarca numa sala de interrogatório. O ARQUIVISTA — a IA que
 * construiu os andares e LEMBRA o que o hotel apaga — mostra a FOTOGRAFIA DAS
 * VINTE PORTAS (que some do bolso do player) e o reconhece como "o escolhido".
 * Pra se provar, o player entra DENTRO de uma imagem: um corredor de vinte
 * portas, e a porta "21" — a MEMÓRIA PERDIDA DELE MESMO — abre num platformer
 * 2.5D de tricô.
 *
 * Módulo puro (sem imports de three/react): fases, flags, paredes e mais tarde
 * os textos. A cena (Floor8Room), o overlay 2.5D e o Player leem daqui — uma
 * única fonte de verdade, mesmo padrão de f6Escape/f4Lore/f5Race.
 *
 * M1 estabelece a arquitetura + a sala navegável; os atos (interrogatório,
 * mergulho, corredor, platformer) crescem nas fases seguintes.
 */

// ── Phase machine ─────────────────────────────────────────────────────────────
export type F8Phase =
    | 'arrive'            // desembarcou; ainda andando até a mesa
    | 'interrogatorio'    // o Arquivista conduz o interrogatório (falas fixas)
    | 'entregaImagem'     // ele estende a imagem sobre a mesa; o player a toma
    | 'mergulho'          // cutscene: o player se aproxima e ENTRA na imagem
    | 'corredor20'        // dentro da imagem: o corredor de vinte portas
    | 'porta21'           // achou a 21ª porta — a memória perdida do player
    | 'platformer'        // o platformer 2.5D de tricô (a memória tecida)
    | 'memoriaRecuperada' // venceu; a memória volta
    | 'leave';            // embarca de volta no elevador

export interface F8State {
    phase: F8Phase;
    /** o player chega carregando a FOTOGRAFIA DAS VINTE PORTAS (flag do Andar 6). */
    carriesPhoto: boolean;
    /** índice da fala atual do interrogatório (avança por interação). */
    line: number;
    /** segundos desde a chegada — usado por gatilhos por tempo/aproximação. */
    t: number;
    version: number;
}

/** Lê o flag persistido do Andar 6 (a arma contra o Proprietário). */
function readCarriesPhoto(): boolean {
    try {
        return typeof window !== 'undefined'
            && window.localStorage.getItem('tne_foto_20portas') === '1';
    } catch { return false; }
}

const FRESH = (): F8State => ({
    phase: 'arrive',
    carriesPhoto: readCarriesPhoto(),
    line: 0,
    t: 0,
    version: 0,
});

export const f8: F8State = FRESH();

// ── Subscription (mesma mecânica de f6Escape) ────────────────────────────────
const listeners = new Set<() => void>();
export function f8Subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
let legacy: (() => void) | null = null;
export function f8SetOnChange(fn: (() => void) | null): void {
    if (legacy) listeners.delete(legacy);
    legacy = fn;
    if (fn) listeners.add(fn);
}
export function f8Bump(): void { f8.version++; listeners.forEach((fn) => fn()); }

export function f8Reset(): void {
    const v = f8.version;
    Object.assign(f8, FRESH());
    f8.version = v;
    events.length = 0;
    f8Bump();
}

// ── One-shot events (a cena drena → sfx + animações) ─────────────────────────
export type F8Event =
    | 'arriveBeat' | 'photoReveal' | 'chosen' | 'handImage' | 'dive'
    | 'door21' | 'win' | 'boarding';
const events: F8Event[] = [];
function emit(e: F8Event): void { events.push(e); }
export function f8DrainEvents(): F8Event[] { return events.splice(0, events.length); }

// ── Layout da sala de interrogatório (world coords) ──────────────────────────
// Sala x∈[-4,4] z∈[-10,0]. Vão do elevador no sul (x∈[-1.3,1.3], z=-10, casa com
// ELEV_W/DOOR_SEAL). Mesa e Arquivista no fundo (norte, z≈-1). O player entra
// pelo sul e caminha até a mesa.
export const F8_CEIL = 3.0;

/** Paredes estáticas: casca da sala com o vão do elevador (constants.ts lê). */
export const F8_STATIC_WALLS: number[][] = [
    // sul (com o vão do elevador)
    [-4, -10, -1.3, -10], [1.3, -10, 4, -10],
    // norte / oeste / leste
    [-4, 0, 4, 0], [-4, -10, -4, 0], [4, -10, 4, 0],
];

/** Móveis [cx, cz, w, d] — Floor8Room renderiza, constants.ts vira colisor. */
export const F8_FURNITURE: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, -1.6, 1.9, 0.95],   // a mesa do interrogatório
];

/** Onde o Arquivista fica (atrás da mesa, encarando o sul/o player). */
export const F8_ARQUIVISTA_POS: readonly [number, number] = [0, -0.7];

// ── Director por frame: chegada → interrogatório por aproximação ─────────────
/** Chamado pelo useFrame da cena com o Z do player. Em M1 só destrava o
 *  interrogatório quando o player caminha até perto da mesa. */
export function f8Tick(dt: number, playerZ: number): void {
    const s = f8;
    s.t += dt;
    if (s.phase === 'arrive' && playerZ > -4.5) {
        s.phase = 'interrogatorio';
        s.line = 0;
        emit('arriveBeat');
        f8Bump();
    }
}

/** A linha-objetivo do HUD (cresce nas fases seguintes). */
export function f8Objective(): string | null {
    const s = f8;
    if (s.phase === 'arrive') return 'Alguém espera na mesa.';
    if (s.phase === 'interrogatorio') return 'Escute o Arquivista.';
    return null;
}
