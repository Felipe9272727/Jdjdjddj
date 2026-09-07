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

/**
 * One-shot SFX. `rate` pitches it; `gain` scales volume.
 *
 * `destination` routes the clip into the shared master bus (the AudioEngine's
 * muteable / volume-controlled input) so the cartoon SFX obey the mute toggle
 * and the master-volume slider exactly like every other sound. Falls back to
 * the raw `ctx.destination` only if no bus is wired up yet.
 */
export function playCartoonSfx(
    ctx: AudioContext,
    name: CartoonSfx,
    { gain = 1, rate = 1, when = 0, destination }:
        { gain?: number; rate?: number; when?: number; destination?: AudioNode } = {},
): void {
    const buf = buffers[name];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(destination ?? ctx.destination);
    src.start(ctx.currentTime + when);
}

let musicSource: AudioBufferSourceNode | null = null;
let musicGain: GainNode | null = null;
// ── A VITROLA DO ANDAR 3 ─────────────────────────────────────────────────────
// A trilha deixou de ser um tapete fixo: ela perde corda junto com o Diabrete
// (ver `f3Trilha.ts`, que decide a curva, e `Floor3.tsx`, que dispara). Estes
// três nós são o que torna isso possível num arquivo só — não dá para tirar
// instrumentos de uma gravação pronta, mas dá para o disco ir morrendo.
let musicFiltro: BiquadFilterNode | null = null;   // o brilho fechando
let musicChoro: OscillatorNode | null = null;      // o "wow" de disco empenado
let musicChoroG: GainNode | null = null;           // e a profundidade dele

/**
 * Start the ragtime bed (looping). Fades in; returns a stop fn.
 *
 * Like the SFX, this routes through `destination` (the shared master bus) when
 * provided so the ragtime is muted/attenuated with everything else and never
 * plays "outside" the mix. If the same music is already playing it's left
 * running (no restart click) and only its destination/gain are refreshed.
 */
export function startCartoonMusic(
    ctx: AudioContext,
    { gain = 0.5, loop = true, fadeIn = 0.4, destination }:
        { gain?: number; loop?: boolean; fadeIn?: number; destination?: AudioNode } = {},
): () => void {
    // Already looping → don't restart (avoids the audible re-trigger when the
    // arrival effect re-runs on a mute toggle / prop change).
    if (musicSource && musicGain) return () => stopCartoonMusic(0.5);
    const buf = buffers.music;
    if (!buf) return () => {};
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + fadeIn);

    // O passa-baixa entra ABERTO (20 kHz é acima do que se escuta, então não
    // colore nada) e só fecha se `ajustarTrilha` mandar. Assim quem nunca rouba
    // um pincel ouve exatamente o mesmo disco de antes desta volta.
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.setValueAtTime(20000, now);
    filtro.Q.value = 0.7;

    // E o choro de rotação, com profundidade ZERO até alguém pedir. Um
    // oscilador parado em silêncio custa nada e evita ter de reconstruir o
    // grafo no meio da música quando o primeiro pincel some.
    const choro = ctx.createOscillator();
    choro.type = 'sine';
    choro.frequency.value = 0.7;
    const choroG = ctx.createGain();
    choroG.gain.setValueAtTime(0, now);
    choro.connect(choroG).connect(src.playbackRate);
    choro.start(now);

    src.connect(filtro).connect(g);
    g.connect(destination ?? ctx.destination);
    src.start(now);
    musicSource = src;
    musicGain = g;
    musicFiltro = filtro;
    musicChoro = choro;
    musicChoroG = choroG;
    return () => stopCartoonMusic(0.5);
}

/**
 * Como a trilha está agora. `f3Trilha` decide a curva; isto só a aplica, e
 * sempre DESLIZANDO — um corte seco em rotação e brilho soaria como defeito de
 * reprodução, e o que se quer é a vitrola perdendo corda, não travando.
 *
 * Silencioso e sem efeito quando não há música tocando: quem chama é o Andar 3
 * por quadro, e não é trabalho dele saber se a trilha já começou.
 */
export function ajustarTrilha(
    { rotacao, brilho, ganho, choro }: { rotacao: number; brilho: number; ganho: number; choro: number },
    deslize = 1.2,
): void {
    const src = musicSource;
    if (!src || !musicGain || !musicFiltro || !musicChoroG) return;
    const ctx = musicGain.context as AudioContext;
    const t = ctx.currentTime;
    const ate = t + Math.max(0.01, deslize);
    try {
        src.playbackRate.cancelScheduledValues(t);
        src.playbackRate.setValueAtTime(src.playbackRate.value, t);
        src.playbackRate.linearRampToValueAtTime(rotacao, ate);

        musicFiltro.frequency.cancelScheduledValues(t);
        musicFiltro.frequency.setValueAtTime(musicFiltro.frequency.value, t);
        musicFiltro.frequency.exponentialRampToValueAtTime(Math.max(80, brilho), ate);

        musicGain.gain.cancelScheduledValues(t);
        musicGain.gain.setValueAtTime(Math.max(0.0002, musicGain.gain.value), t);
        musicGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, ganho), ate);

        // A profundidade do choro é fração da rotação: 0,016 num disco a 0,9
        // oscila ±0,0144, que é wow de vitrola velha e não vibrato de sintetizador.
        musicChoroG.gain.cancelScheduledValues(t);
        musicChoroG.gain.setValueAtTime(musicChoroG.gain.value, t);
        musicChoroG.gain.linearRampToValueAtTime(choro * rotacao, ate);
    } catch { /* nó já solto — a música parou no meio do deslize */ }
}

/** Fade out + stop the ragtime bed. */
export function stopCartoonMusic(fadeOut = 0.5): void {
    const src = musicSource;
    const g = musicGain;
    const choro = musicChoro;
    musicSource = null;
    musicGain = null;
    musicFiltro = null;
    musicChoro = null;
    musicChoroG = null;
    if (choro) { try { choro.stop((choro.context as AudioContext).currentTime + fadeOut + 0.05); } catch { /* já parou */ } }
    if (!src || !g) return;
    try {
        const now = (g.context as AudioContext).currentTime;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + fadeOut);
        src.stop(now + fadeOut + 0.05);
    } catch { /* already stopped */ }
}
