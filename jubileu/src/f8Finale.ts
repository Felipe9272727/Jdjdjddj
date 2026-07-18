/**
 * Linha do tempo pura da entrega do Andar 8.
 *
 * A cena 3D e o overlay DOM leem o mesmo relógio: a porta lacrada segura o
 * primeiro plano, a câmera vira, o Arquivista se aproxima, agarra o casaco e
 * empurra o player para o Viveiro. Manter isso fora do React evita que câmera,
 * legenda e sprite discordem quando um frame demora no celular.
 */
export type F8FinaleBeat =
    | 'idle'
    | 'door'
    | 'turn'
    | 'reveal'
    | 'approach'
    | 'grip'
    | 'push'
    | 'black'
    | 'done';

export interface F8FinaleState {
    active: boolean;
    beat: F8FinaleBeat;
    t: number;
    beatT: number;
    version: number;
}

export const F8_FINALE_CUES: ReadonlyArray<readonly [F8FinaleBeat, number]> = [
    ['door', 0],
    ['turn', 2.35],
    ['reveal', 3.55],
    ['approach', 4.9],
    ['grip', 7.0],
    ['push', 8.25],
    ['black', 9.15],
    ['done', 10.45],
];

const FRESH = (): F8FinaleState => ({
    active: false,
    beat: 'idle',
    t: 0,
    beatT: 0,
    version: 0,
});

export const f8finale: F8FinaleState = FRESH();

const listeners = new Set<() => void>();
export function f8FinaleSubscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
function bump(): void {
    f8finale.version++;
    listeners.forEach((fn) => fn());
}

export function f8FinaleReset(): void {
    const version = f8finale.version;
    Object.assign(f8finale, FRESH());
    f8finale.version = version;
    bump();
}

export function f8FinaleStart(): void {
    f8finale.active = true;
    f8finale.beat = 'door';
    f8finale.t = 0;
    f8finale.beatT = 0;
    bump();
}

/** Avança a timeline; devolve o beat atual para o diretor de câmera. */
export function f8FinaleTick(dt: number): F8FinaleBeat {
    if (!f8finale.active || f8finale.beat === 'done') return f8finale.beat;
    f8finale.t += Math.max(0, Math.min(dt, 0.1));

    let next: F8FinaleBeat = 'door';
    let at = 0;
    for (const [beat, cue] of F8_FINALE_CUES) {
        if (f8finale.t + 1e-6 < cue) break;
        next = beat;
        at = cue;
    }
    f8finale.beatT = Math.max(0, f8finale.t - at);
    if (next !== f8finale.beat) {
        f8finale.beat = next;
        if (next === 'done') f8finale.active = false;
        bump();
    }
    return f8finale.beat;
}

export function f8FinaleBeatDuration(beat: F8FinaleBeat): number {
    const i = F8_FINALE_CUES.findIndex(([b]) => b === beat);
    if (i < 0 || i >= F8_FINALE_CUES.length - 1) return 0;
    return F8_FINALE_CUES[i + 1][1] - F8_FINALE_CUES[i][1];
}

export function f8FinaleProgress(beat: F8FinaleBeat): number {
    if (f8finale.beat !== beat) return 0;
    const duration = f8FinaleBeatDuration(beat);
    return duration > 0 ? Math.min(1, f8finale.beatT / duration) : 1;
}

/** Usado só pelo runner de screenshots; não é chamado pelo fluxo do jogo. */
export function f8FinaleSeek(t: number): void {
    if (!f8finale.active) f8FinaleStart();
    f8finale.t = Math.max(0, t);
    f8finale.beat = 'door';
    f8finale.beatT = 0;
    f8FinaleTick(0);
    bump();
}
