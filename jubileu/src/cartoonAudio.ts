/**
 * cartoonAudio.ts — file-based (NON-procedural) audio for the Floor 3 cartoon
 * intro. The music is real CC0 ragtime (Scott Joplin, "Maple Leaf Rag", from
 * FreePD), and the SFX are short pre-rendered cartoon hits — so nothing here is
 * synthesised in real time (which the procedural beds were, and which sounded
 * repetitive). Everything is fetched + decoded once and cached.
 *
 * Assets live in /public and are served from the app origin (no CORS, works
 * offline) exactly like barney-theme.mp3.
 */

const URLS = {
    music:     `${import.meta.env.BASE_URL}cartoon-ragtime.mp3`,
    puck:      `${import.meta.env.BASE_URL}sfx-puck.wav`,
    boing:     `${import.meta.env.BASE_URL}sfx-boing.wav`,
    transform: `${import.meta.env.BASE_URL}sfx-transform.wav`,
    tada:      `${import.meta.env.BASE_URL}sfx-tada.wav`,
} as const;
export type CartoonSfx = keyof typeof URLS;

const buffers: Partial<Record<CartoonSfx, AudioBuffer>> = {};
let loadingPromise: Promise<void> | null = null;

/** Fetch + decode every clip once. Safe to call repeatedly. */
export function preloadCartoonAudio(ctx: AudioContext): Promise<void> {
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
        await Promise.all((Object.keys(URLS) as CartoonSfx[]).map(async (key) => {
            try {
                const res = await fetch(URLS[key]);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                buffers[key] = await ctx.decodeAudioData(await res.arrayBuffer());
            } catch (e) {
                console.warn(`[cartoonAudio] load failed for ${key}:`, (e as Error).message);
            }
        }));
    })();
    return loadingPromise;
}

/** One-shot SFX. `rate` pitches it; `gain` scales volume. */
export function playCartoonSfx(
    ctx: AudioContext,
    name: CartoonSfx,
    { gain = 1, rate = 1, when = 0 }: { gain?: number; rate?: number; when?: number } = {},
): void {
    const buf = buffers[name];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(ctx.destination);
    src.start(ctx.currentTime + when);
}

let musicSource: AudioBufferSourceNode | null = null;
let musicGain: GainNode | null = null;

/** Start the ragtime bed (looping). Fades in; returns a stop fn. */
export function startCartoonMusic(
    ctx: AudioContext,
    { gain = 0.5, loop = true, fadeIn = 0.4 }: { gain?: number; loop?: boolean; fadeIn?: number } = {},
): () => void {
    stopCartoonMusic(0);
    const buf = buffers.music;
    if (!buf) return () => {};
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + fadeIn);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    musicSource = src;
    musicGain = g;
    return () => stopCartoonMusic(0.5);
}

/** Fade out + stop the ragtime bed. */
export function stopCartoonMusic(fadeOut = 0.5): void {
    const src = musicSource;
    const g = musicGain;
    musicSource = null;
    musicGain = null;
    if (!src || !g) return;
    try {
        const now = (g.context as AudioContext).currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + fadeOut);
        src.stop(now + fadeOut + 0.05);
    } catch { /* already stopped */ }
}
