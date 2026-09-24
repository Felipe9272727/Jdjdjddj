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

const saida = (): AudioNode | null => dest ?? ctx?.destination ?? null;

export function configureFloor13Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context; dest = destination ?? null;
    if (ctx) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4;
        comp.connect(dest ?? ctx.destination);
        dest = comp;
    }
}
export function clearFloor13Sfx(): void { pararVento(); ctx = null; dest = null; }

function ruido(): AudioBuffer | null {
    if (!ctx) return null;
    if (!ruidoBuf || ruidoBuf.sampleRate !== ctx.sampleRate) {
        ruidoBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = ruidoBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ruidoBuf;
}

function tom(tipo: OscillatorType, f0: number, f1: number, dur: number, vol: number, atraso = 0): void {
    const c = ctx, d = saida(); if (!c || !d) return;
    const t = c.currentTime + atraso;
    const o = c.createOscillator(); o.type = tipo;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + dur + .05);
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
export function tocarQueda(): void { tom('sine', 90, 30, .9, .5); sopro(.9, .4, 1400); sopro(1.6, .15, 400, .2); }
export function tocarSino(): void {
    for (const [f, v] of [[392, .22], [784, .09], [1175, .05], [196, .12]] as const) tom('triangle', f, f * .998, 3.5, v);
}
export function tocarDingDaCasa(): void { tom('triangle', 1318.5, 1318.5, .25, .09); tom('triangle', 1046.5, 1046.5, .7, .08, .14); }
export function tocarPegar(): void { tom('square', 660, 990, .1, .05); tom('square', 990, 1320, .12, .04, .08); }
export function tocarBalido(): void { tom('sawtooth', 520, 470, .45, .05); tom('sawtooth', 540, 480, .45, .03, .03); }

/** "Voz" de viking: um blip curto por fala, no tom de cada um. */
const TOM_DA_VOZ: Record<string, number> = {
    Ragnhild: 330, Ulfgar: 150, Eira: 560, Brokk: 120, Sigrun: 300, Torvald: 170, Astrid: 280, Halvard: 190,
};
export function tocarFala(quem: string): void {
    const f = TOM_DA_VOZ[quem] ?? 240;
    tom('square', f, f * 1.12, .07, .035); tom('square', f * 1.2, f, .08, .03, .09);
}

/** A entidade: chiado digital e um tom que quebra. */
export function tocarGlitch(): void {
    for (let i = 0; i < 6; i++) sopro(.05, .25, 3000 + Math.random() * 4000, i * .07, 'highpass');
    tom('square', 80, 1600, .4, .06); tom('square', 1600, 60, .5, .05, .35);
}
export function tocarDesconexao(): void { tom('sine', 1000, 1000, .9, .08); sopro(.4, .3, 6000, .9, 'highpass'); }
