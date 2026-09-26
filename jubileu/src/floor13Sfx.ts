/**
 * floor13Sfx.ts — os sons de Vindhjem.
 *
 * Gravações CC0 onde o ouvido nota a diferença: passos (Kenney, Impact
 * Sounds), sino, baques e porta (Kenney, Impact Sounds / RPG Audio), o vento
 * com pássaros e a música "Vikings at Shore" (OpenGameArt, CC0). O resto
 * continua sintetizado, e cada som gravado cai de volta na síntese enquanto
 * o arquivo não carregou.
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

// ── AMOSTRAS GRAVADAS ────────────────────────────────────────────────────────
const ARQUIVOS = import.meta.glob('./assets/f13/som/*.mp3', { eager: true, import: 'default' }) as Record<string, string>;
const amostras = new Map<string, AudioBuffer>();
function carregarAmostras(c: AudioContext): void {
    for (const [caminho, url] of Object.entries(ARQUIVOS)) {
        const nome = caminho.split('/').pop()!.replace('.mp3', '');
        if (amostras.has(nome)) continue;
        fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b))
            .then((buf) => { amostras.set(nome, buf); }).catch(() => { /* fica na síntese */ });
    }
}
/** Toca uma amostra (ou uma das variantes `nome_0..n`). Devolve false se não houver. */
function toca(nome: string, vol: number, { taxa = 1, reverb = 0, atraso = 0 } = {}): boolean {
    const c = ctx, d = saida(); if (!c || !d) return false;
    const variantes = [...amostras.keys()].filter((k) => k === nome || k.startsWith(nome + '_'));
    if (!variantes.length) return false;
    const buf = amostras.get(variantes[Math.floor(Math.random() * variantes.length)])!;
    const t = c.currentTime + atraso;
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = taxa * (.94 + Math.random() * .12);
    const g = c.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(d);
    if (reverb > 0 && eco) { const e = c.createGain(); e.gain.value = reverb; g.connect(e); e.connect(eco); }
    src.start(t);
    return true;
}

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
        carregarAmostras(ctx);
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
export function tocarMotorMorrendo(): void {
    // o motor engasga (falhas em rajada) e a rotação despenca
    const c = ctx, d = saida(); if (!c || !d) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(28, t + 2);
    const ws = c.createWaveShaper(); const k = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 4); } ws.curve = k;
    const g = c.createGain(); g.gain.setValueAtTime(.12, t);
    for (let i = 0; i < 8; i++) { g.gain.setValueAtTime(i % 2 ? .02 : .12, t + i * .18 + Math.random() * .05); }
    g.gain.exponentialRampToValueAtTime(.0001, t + 2.1);
    o.connect(ws); ws.connect(g); g.connect(d); o.start(t); o.stop(t + 2.2);
    sopro(1.5, .08, 500);
}
export function tocarQueda(): void {
    // baque grave + estalo de madeira + o feno assentando; por cima, a
    // madeira e o metal de verdade do avião se partindo
    toca('queda_madeira', .9, { taxa: .8, reverb: .4 }); toca('queda_metal', .6, { taxa: .75, atraso: .05, reverb: .4 });
    tom('sine', 90, 28, 1.1, .55, 0, .6); tom('triangle', 60, 30, .6, .3);
    sopro(.12, .5, 5000, 0, 'highpass'); sopro(.25, .3, 2200, .03, 'bandpass');
    sopro(1.8, .12, 700, .25); sopro(1.2, .08, 3200, .4, 'bandpass');
}
export function tocarSino(): void {
    // sino de bronze gravado, meio tom abaixo, com muita sala; se não
    // carregou, parciais inarmônicas com decaimento longo
    if (toca('sino', .9, { taxa: .7, reverb: .9 })) { tom('sine', 196, 195.6, 4.5, .08, 0, .9); return; }
    for (const [f, v] of [[196, .12], [392, .2], [470, .06], [784, .08], [1175, .045], [1560, .02]] as const) tom('sine', f, f * .998, 4.5, v, 0, .9);
}
export function tocarPortaAbrindo(): void { toca('porta_abre', .8, { taxa: .85, reverb: .3 }); }
export function tocarDingDaCasa(): void { tocarPortaAbrindo(); tom('triangle', 1318.5, 1318.5, .25, .09); tom('triangle', 1046.5, 1046.5, .7, .08, .14); }
export function tocarPegar(): void {
    // tinido de ferro e madeira: ruído em ressonâncias estreitas, não chiptune
    if (toca('pegar_metal', .7, { reverb: .2 })) return;
    for (const [f, v, a] of [[880, .2, 0], [1760, .12, .01], [2640, .06, .02]] as const) {
        const c = ctx, d = saida(), b = ruido(); if (!c || !d || !b) return;
        const t = c.currentTime + a;
        const s = c.createBufferSource(); s.buffer = b;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 40;
        const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .6);
        s.connect(bp); bp.connect(g); g.connect(d); s.start(t, Math.random()); s.stop(t + .7);
    }
    tom('sine', 180, 120, .12, .12, 0, .3);
}
/** A martelada do Brokk na bigorna: ferro batendo, agudo e curto, com sala. `vol` 0..1 pela distância. */
export function tocarBigorna(vol: number): void {
    if (vol <= .01) return;
    for (const [f, v, d] of [[1244, .07, .5], [2010, .045, .35], [2890, .025, .25], [3950, .012, .18]] as const) tom('sine', f, f * .997, d, v * vol, 0, .35);
    tom('triangle', 220, 150, .06, .05 * vol, 0, .2);
}
export function tocarBalido(): void { tom('sawtooth', 520, 470, .45, .05); tom('sawtooth', 540, 480, .45, .03, .03); }

/** "Voz" de viking: um blip curto por fala, no tom de cada um. */
const TOM_DA_VOZ: Record<string, number> = {
    Ragnhild: 330, Ulfgar: 150, Eira: 560, Brokk: 120, Sigrun: 300, Torvald: 170, Astrid: 280, Halvard: 190,
};
export function tocarFala(quem: string): void {
    const c = ctx, d = saida(); if (!c || !d) return;
    const f0 = TOM_DA_VOZ[quem.replace(/[█▚▞ ]/g, '')] ?? 240;
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
 * A simulação desligando Vindhjem: um varrido digital que desce, chiado alto e
 * uma chuva de bips curtos (as runas caindo); e o contrário, subindo, quando a
 * cabine do elevador se materializa.
 */
export function tocarDesmaterializar(): void {
    tom('sawtooth', 880, 55, 2.8, .04, 0, .4);
    tom('square', 1760, 110, 2.3, .018, .35);
    for (let i = 0; i < 16; i++) tom('square', 500 + Math.random() * 2600, 200 + Math.random() * 900, .06, .025, .15 + i * .17);
    sopro(3, .1, 5200, 0, 'highpass');
}
export function tocarMaterializar(): void {
    tom('sine', 110, 880, 1.4, .05, 0, .5);
    tom('triangle', 220, 1320, 1.25, .022, .1, .4);
    for (let i = 0; i < 9; i++) tom('square', 300 + Math.random() * 1800, 700 + Math.random() * 1600, .05, .02, i * .13);
}
/** O ding do elevador do hotel (dois tons longos, como no saguão). */
export function tocarDingDoHotel(): void { tom('sine', 1318.5, 1318.5, 1.3, .08, 0, .5); tom('sine', 1046.5, 1046.5, 1.7, .07, .24, .5); }

/**
 * O leito musical de Vindhjem: um bordão grave em quinta (como um tagelharpa
 * soprado pelo vento) com filtro respirando, e de tempos em tempos uma trompa
 * distante e o ranger das cordas das pontes.
 */
let leito: { oscs: OscillatorNode[]; g: GainNode; id: number; laços?: AudioBufferSourceNode[] } | null = null;
function laco(nome: string, vol: number, g: GainNode): AudioBufferSourceNode | null {
    const c = ctx, buf = amostras.get(nome); if (!c || !buf) return null;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const v = c.createGain(); v.gain.value = vol; src.connect(v); v.connect(g); src.start();
    return src;
}
export function tocarAmbiente(): void {
    const c = ctx, d = saida(); if (!c || !d || leito) return;
    // com as gravações carregadas: a música dos vikings baixinha e o vento
    // com pássaros; o bordão sintetizado só se elas ainda não chegaram
    if (amostras.has('musica') && amostras.has('vento_passaros')) {
        const g = c.createGain(); g.gain.value = .0001;
        g.gain.exponentialRampToValueAtTime(1, c.currentTime + 4);
        g.connect(d);
        const laços = [laco('musica', .22, g), laco('vento_passaros', .35, g)].filter(Boolean) as AudioBufferSourceNode[];
        const id = window.setInterval(() => { if (Math.random() < .5) toca('rangido', .12, { taxa: .8 + Math.random() * .3, reverb: .5 }); }, 11000);
        leito = { oscs: [], g, id, laços };
        return;
    }
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
    const { oscs, g, id, laços } = leito; leito = null;
    window.clearInterval(id);
    laços?.forEach((l) => l.stop(ctx!.currentTime + 1.1));
    g.gain.setValueAtTime(Math.max(.0001, g.gain.value), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + 1);
    oscs.forEach((o) => o.stop(ctx!.currentTime + 1.1));
}

/** Passo: tábua oca na ponte, grama abafada na ilha. */
export function tocarPasso(madeira: boolean): void {
    if (toca(madeira ? 'passo_madeira' : 'passo_grama', madeira ? .35 : .3)) return;
    if (madeira) { tom('sine', 180 + Math.random() * 30, 90, .09, .06); sopro(.05, .05, 2200); }
    else sopro(.08, .05, 600 + Math.random() * 300);
}
/** O corpo de Halvard batendo no chão. */
export function tocarCorpoCaindo(): void {
    toca('corpo', 1, { taxa: .8, reverb: .3 });
    tom('sine', 110, 40, .5, .35, 0, .5); sopro(.3, .2, 900);
}
