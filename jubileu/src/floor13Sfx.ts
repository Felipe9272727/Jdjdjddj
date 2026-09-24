/**
 * floor13Sfx.ts — os sons de Vindhjem, sintetizados (sem arquivos).
 *
 * Vento de altitude contínuo, o motor tossindo e morrendo na queda, o baque
 * no feno, o sino do templo, um "blip" de fala por viking (cada um num tom),
 * o chiado da entidade e o ding da casa certa.
 */
let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;
let vento: { src: AudioBufferSourceNode; g: GainNode } | null = null;
let ruidoBuf: AudioBuffer | null = null;
/** Envio para a reverberação (sino, vozes, baques). */
let eco: ConvolverNode | null = null;

const saida = (): AudioNode | null => dest ?? ctx?.destination ?? null;

export function configureFloor13Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context; dest = destination ?? null;
    if (ctx) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4;
        comp.connect(dest ?? ctx.destination);
        dest = comp;
        // reverberação de céu aberto: um impulso sintetizado, longo e ralo
        const len = Math.floor(ctx.sampleRate * 2.6);
        const ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 800 ? i / 800 : 1);
        }
        const conv = ctx.createConvolver(); conv.buffer = ir;
        const volta = ctx.createGain(); volta.gain.value = .35;
        conv.connect(volta); volta.connect(comp);
        eco = conv;
    }
}
export function clearFloor13Sfx(): void { pararVento(); pararAmbiente(); ctx = null; dest = null; }

function ruido(): AudioBuffer | null {
    if (!ctx) return null;
    if (!ruidoBuf || ruidoBuf.sampleRate !== ctx.sampleRate) {
        ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = ruidoBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ruidoBuf;
}

function tom(tipo: OscillatorType, f0: number, f1: number, dur: number, vol: number, atraso = 0, reverb = 0): void {
    const c = ctx, d = saida(); if (!c || !d) return;
    const t = c.currentTime + atraso;
    const o = c.createOscillator(); o.type = tipo;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + dur + .05);
    if (reverb > 0 && eco) { const r = c.createGain(); r.gain.value = reverb; g.connect(r); r.connect(eco); }
}

function sopro(dur: number, vol: number, corte: number, atraso = 0, tipo: BiquadFilterType = 'lowpass'): void {
    const c = ctx, d = saida(), b = ruido(); if (!c || !d || !b) return;
    const t = c.currentTime + atraso;
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = tipo; f.frequency.value = corte;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(d); s.start(t, Math.random()); s.stop(t + dur + .05);
}

/** Vento de altitude: ruído filtrado com uma onda lenta no volume. */
export function tocarVento(): void {
    const c = ctx, d = saida(), b = ruido(); if (!c || !d || !b || vento) return;
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .6;
    const g = c.createGain(); g.gain.value = .0001;
    g.gain.exponentialRampToValueAtTime(.05, c.currentTime + 2);
    const lfo = c.createOscillator(); lfo.frequency.value = .13;
    const lg = c.createGain(); lg.gain.value = .025;
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(d); s.start(); lfo.start();
    vento = { src: s, g };
}
export function pararVento(): void {
    if (!vento || !ctx) { vento = null; return; }
    const { src, g } = vento; vento = null;
    g.gain.setValueAtTime(Math.max(.0001, g.gain.value), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .5);
    src.stop(ctx.currentTime + .6);
}

/** O motor tossindo: engasgos com silêncio entre eles. */
export function tocarMotorTossindo(): void {
    for (let i = 0; i < 5; i++) {
        tom('sawtooth', 110, 60, .18, .08, i * .38 + Math.random() * .1);
        sopro(.12, .12, 900, i * .38 + .05);
    }
}
export function tocarMotorMorrendo(): void { tom('sawtooth', 120, 30, 1.8, .1); sopro(1.5, .08, 500); }
export function tocarQueda(): void {
    // baque grave + estalo de madeira + o feno assentando
    tom('sine', 90, 28, 1.1, .55, 0, .6); tom('triangle', 60, 30, .6, .3);
    sopro(.12, .5, 5000, 0, 'highpass'); sopro(.25, .3, 2200, .03, 'bandpass');
    sopro(1.8, .12, 700, .25); sopro(1.2, .08, 3200, .4, 'bandpass');
}
export function tocarSino(): void {
    // sino de bronze: parciais inarmônicas com decaimento longo e muita sala
    for (const [f, v] of [[196, .12], [392, .2], [470, .06], [784, .08], [1175, .045], [1560, .02]] as const) tom('sine', f, f * .998, 4.5, v, 0, .9);
}
export function tocarDingDaCasa(): void { tom('triangle', 1318.5, 1318.5, .25, .09); tom('triangle', 1046.5, 1046.5, .7, .08, .14); }
export function tocarPegar(): void { tom('square', 660, 990, .1, .05); tom('square', 990, 1320, .12, .04, .08); }
export function tocarBalido(): void { tom('sawtooth', 520, 470, .45, .05); tom('sawtooth', 540, 480, .45, .03, .03); }

/** "Voz" de viking: um blip curto por fala, no tom de cada um. */
const TOM_DA_VOZ: Record<string, number> = {
    Ragnhild: 330, Ulfgar: 150, Eira: 560, Brokk: 120, Sigrun: 300, Torvald: 170, Astrid: 280, Halvard: 190,
};
export function tocarFala(quem: string): void {
    const c = ctx, d = saida(); if (!c || !d) return;
    const f0 = TOM_DA_VOZ[quem.replace(/[█ ]/g, '')] ?? 240;
    // um balbucio de 4-6 sílabas: dente-de-serra na altura da voz passando por
    // dois filtros de formante que trocam de vogal a cada sílaba
    const VOGAIS = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840]];
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
        const t = c.currentTime + i * .085, dur = .075;
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * (1 + (Math.random() - .5) * .12), t);
        const [f1, f2] = VOGAIS[Math.floor(Math.random() * VOGAIS.length)];
        const g = c.createGain();
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.05, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        for (const [ff, q] of [[f1, 8], [f2, 10]]) {
            const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q;
            o.connect(bp); bp.connect(g);
        }
        g.connect(d);
        if (eco) { const r = c.createGain(); r.gain.value = .25; g.connect(r); r.connect(eco); }
        o.start(t); o.stop(t + dur + .03);
    }
}

/** A entidade: chiado digital e um tom que quebra. */
export function tocarGlitch(): void {
    for (let i = 0; i < 6; i++) sopro(.05, .25, 3000 + Math.random() * 4000, i * .07, 'highpass');
    tom('square', 80, 1600, .4, .06); tom('square', 1600, 60, .5, .05, .35);
}
export function tocarDesconexao(): void { tom('sine', 1000, 1000, .9, .08); sopro(.4, .3, 6000, .9, 'highpass'); }

/**
 * O leito musical de Vindhjem: um bordão grave em quinta (como um tagelharpa
 * soprado pelo vento) com filtro respirando, e de tempos em tempos uma trompa
 * distante e o ranger das cordas das pontes.
 */
let leito: { oscs: OscillatorNode[]; g: GainNode; id: number } | null = null;
export function tocarAmbiente(): void {
    const c = ctx, d = saida(); if (!c || !d || leito) return;
    const g = c.createGain(); g.gain.value = .0001;
    g.gain.exponentialRampToValueAtTime(.035, c.currentTime + 4);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const lfo = c.createOscillator(); lfo.frequency.value = .07;
    const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency);
    const oscs = [73.4, 110, 146.8].map((fr, i) => {
        const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = fr;
        o.detune.value = (i - 1) * 6; o.connect(f); o.start(); return o;
    });
    f.connect(g); g.connect(d); lfo.start(); oscs.push(lfo);
    const id = window.setInterval(() => {
        if (Math.random() < .5) { tom('sawtooth', 146.8, 146.8, 2.4, .025); tom('sawtooth', 220, 220, 2.2, .015, .1); }
        else for (let i = 0; i < 3; i++) sopro(.25, .05, 700, i * .3, 'bandpass');
    }, 9000);
    leito = { oscs, g, id };
}
export function pararAmbiente(): void {
    if (!leito || !ctx) { leito = null; return; }
    const { oscs, g, id } = leito; leito = null;
    window.clearInterval(id);
    g.gain.setValueAtTime(Math.max(.0001, g.gain.value), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1);
    oscs.forEach((o) => o.stop(ctx!.currentTime + 1.1));
}

/** Passo: tábua oca na ponte, grama abafada na ilha. */
export function tocarPasso(madeira: boolean): void {
    if (madeira) { tom('sine', 180 + Math.random() * 30, 90, .09, .06); sopro(.05, .05, 2200); }
    else sopro(.08, .05, 600 + Math.random() * 300);
}
/** O corpo de Halvard batendo no chão. */
export function tocarCorpoCaindo(): void { tom('sine', 110, 40, .5, .35, 0, .5); sopro(.3, .2, 900); }
