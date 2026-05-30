/**
 * musicDirector.ts — a single, central arbiter that makes it STRUCTURALLY
 * impossible for two pieces of music to play over each other.
 *
 * Think of it like the layer stack in an image editor: every music track is a
 * "layer" with a priority, and only the TOP active layer is ever audible. A
 * lower-priority layer can never paint over a higher one — and, crucially, two
 * layers can never sound at the same time, because the director routes each
 * group of tracks through its own bus gain and forces every losing bus to 0.
 *
 * Groups (not individual tracks) are gated, so a subsystem that legitimately
 * crossfades WITHIN itself (the AudioEngine's lobby↔elevator↔barney) keeps
 * doing that below its own bus; the director only enforces exclusivity BETWEEN
 * groups (lobby-engine vs Floor-2 bed vs chase vs Floor-3 ragtime).
 *
 *   engine (lobby/elevator/barney) … priority 10
 *   floor2 (submerged bed) ………… priority 60
 *   ragtime (Floor 3) …………………… priority 70
 *   chase (Barney / shark peak) …… priority 100
 *
 * Every group bus feeds the shared master bus (the AudioEngine's mute/volume
 * node), so all music also obeys mute + the volume slider for free.
 */

interface Group {
    id: string;
    priority: number;
    active: boolean;
    bus: GainNode;
}

let ctxRef: AudioContext | null = null;
let masterDest: AudioNode | null = null;
const groups = new Map<string, Group>();

/** Wire the director to the live AudioContext + master bus. Called once by the
 *  AudioEngine when the graph is built. Reconnects any buses created early. */
export function attachMusicBus(ctx: AudioContext, dest: AudioNode): void {
    ctxRef = ctx;
    masterDest = dest;
    for (const g of groups.values()) {
        try { g.bus.disconnect(); } catch { /* not connected */ }
        g.bus.connect(dest);
    }
    reconcile();
}

/** Tear down (AudioContext gone). Drop every bus — they belong to the old ctx. */
export function detachMusicBus(): void {
    for (const g of groups.values()) { try { g.bus.disconnect(); } catch { /* ignore */ } }
    groups.clear();
    ctxRef = null;
    masterDest = null;
}

/**
 * Get (lazily creating) the bus a group's audio should connect to. Returns
 * `null` only if there's no AudioContext yet (caller should then fall back to
 * `ctx.destination`, but in practice the engine attaches before any track
 * starts). The bus starts muted; `reconcile()` decides who is audible.
 */
export function getMusicBus(id: string, priority: number): GainNode | null {
    if (!ctxRef) return null;
    let g = groups.get(id);
    if (!g) {
        const bus = ctxRef.createGain();
        bus.gain.value = 0;
        if (masterDest) bus.connect(masterDest);
        g = { id, priority, active: false, bus };
        groups.set(id, g);
    } else {
        g.priority = priority; // keep priority current if re-requested
    }
    return g.bus;
}

/** Declare whether a group currently wants to play. The director re-picks the
 *  single winning (highest-priority active) group and mutes all the others. */
export function setMusicActive(id: string, active: boolean): void {
    const g = groups.get(id);
    if (!g || g.active === active) return;
    g.active = active;
    reconcile();
}

function reconcile(): void {
    if (!ctxRef) return;
    let winner: Group | null = null;
    for (const g of groups.values()) {
        if (g.active && (!winner || g.priority > winner.priority)) winner = g;
    }
    const now = ctxRef.currentTime;
    for (const g of groups.values()) {
        // Short, click-free handoff — only ONE bus ever lands on full gain.
        g.bus.gain.setTargetAtTime(g === winner ? 1 : 0, now, 0.08);
    }
    // Observability: expose the layer stack so "is anything overlapping?" can be
    // answered at a glance (devtools: __musicLayers). winner is the audible one;
    // everyone else is being held at 0.
    if (typeof window !== 'undefined') {
        (window as any).__musicLayers = {
            winner: winner?.id ?? null,
            layers: [...groups.values()]
                .sort((a, b) => b.priority - a.priority)
                .map((g) => ({ id: g.id, priority: g.priority, active: g.active })),
        };
    }
}
