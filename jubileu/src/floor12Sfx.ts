/**
 * floor12Sfx.ts — o som do ANDAR 12.
 *
 * Tudo SINTETIZADO, sem sample nenhum. Não é preciosismo: um andar de nave
 * dispara tiro a cada 0,14 s, e um `fetch`+`decodeAudioData` por tiro é o
 * caminho mais curto para engasgar o celular do dono do jogo, que é a regra
 * número um deste repositório. Osciladores curtos custam quase nada e ainda
 * caem no timbre certo — o irmão do TROCO-64 é da mesma família de bipes.
 *
 * O contexto vem de fora (`configureFloor12Sfx`), igual ao andar 5, para o som
 * do andar entrar no barramento mestre do jogo e respeitar o volume geral.
 */

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

export function configureFloor12Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context;
    dest = destination ?? null;
}
export function clearFloor12Sfx(): void { pararMotor(); pararTrilha(); ctx = null; dest = null; }

function saida(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

/**
 * Um bipe. `tipo`, frequência inicial, frequência final, duração e volume.
 *
 * O envelope tem ATAQUE, e não começa em 1: sem os 8 ms de subida cada nota
 * estala no alto-falante, e com trinta tiros por segundo o estalo vira chiado.
 */
function bipe(
    tipo: OscillatorType, f0: number, f1: number, dur: number, vol: number, atraso = 0,
): void {
    const c = ctx, d = saida();
    if (!c || !d) return;
    const t = c.currentTime + atraso;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(d);
    osc.start(t); osc.stop(t + dur + 0.02);
}

/** Ruído curto, para impacto e explosão. */
function ruido(dur: number, vol: number, corte = 1400, atraso = 0): void {
    const c = ctx, d = saida();
    if (!c || !d) return;
    const t = c.currentTime + atraso;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = corte;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filtro); filtro.connect(g); g.connect(d);
    src.start(t); src.stop(t + dur + 0.02);
}

// ── O MOTOR ──────────────────────────────────────────────────────────────────
// Um zumbido contínuo enquanto o avião voa. É o único som persistente do andar,
// e ele existe porque sem motor um avião parado no céu não tem peso nenhum.
let motor: { osc: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null = null;

export function tocarMotor(): void {
    const c = ctx, d = saida();
    if (!c || !d || motor) return;
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 74;
    const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 1.2);
    // um LFO leve na altura: hélice, não gerador
    const lfo = c.createOscillator(); lfo.frequency.value = 6.5;
    const lfoG = c.createGain(); lfoG.gain.value = 5;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    osc.connect(filtro); filtro.connect(g); g.connect(d);
    osc.start(); lfo.start();
    motor = { osc, g, lfo };
}

export function pararMotor(): void {
    if (!motor || !ctx) { motor = null; return; }
    const { osc, g, lfo } = motor;
    motor = null;
    try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        osc.stop(ctx.currentTime + 0.4); lfo.stop(ctx.currentTime + 0.4);
    } catch { /* já parado */ }
}

// ── OS EVENTOS ───────────────────────────────────────────────────────────────
export function tocarTiro(): void { bipe('square', 900, 320, 0.075, 0.055); }
export function tocarTiroIrmao(): void { bipe('square', 620, 240, 0.085, 0.04); }
export function tocarAcerto(): void { bipe('square', 1500, 900, 0.05, 0.05); }

/** A boca abrindo: o telegrafo sonoro do ataque. */
export function tocarBocaAbrindo(): void {
    bipe('sawtooth', 90, 260, 0.5, 0.09);
}
/** A boca cuspindo. Cada ataque tem o seu, para dar para reconhecer de ouvido. */
export function tocarAtaque(nome: string): void {
    switch (nome) {
        case 'leque':      for (let i = 0; i < 5; i++) bipe('square', 520, 300, 0.09, 0.05, i * 0.035); break;
        case 'teleguiado': bipe('sine', 1200, 300, 0.55, 0.07); break;
        case 'naves':      for (let i = 0; i < 4; i++) bipe('triangle', 700 + i * 90, 400, 0.13, 0.045, i * 0.07); break;
        case 'mare':       ruido(0.75, 0.10, 700); bipe('sine', 150, 60, 0.7, 0.06); break;
        case 'elevadores': for (let i = 0; i < 4; i++) bipe('square', 200, 130, 0.16, 0.05, i * 0.09); break;
        default:           bipe('square', 400, 200, 0.2, 0.05);
    }
}

export function tocarDano(): void { ruido(0.32, 0.22, 900); bipe('sawtooth', 240, 70, 0.34, 0.10); }
export function tocarExplosao(): void { ruido(0.6, 0.28, 1200); bipe('sawtooth', 180, 40, 0.6, 0.12); }
export function tocarFalaDoIrmao(): void { bipe('square', 300, 380, 0.05, 0.035); }

/** O elevador virando avião: metal se desdobrando. */
export function tocarDesdobrar(): void {
    for (let i = 0; i < 6; i++) bipe('square', 160 + i * 55, 90 + i * 30, 0.12, 0.05, i * 0.12);
    ruido(0.5, 0.14, 2200, 0.5);
}
export function tocarDing(): void { bipe('sine', 1320, 1320, 0.16, 0.09); bipe('sine', 990, 990, 0.36, 0.07, 0.1); }

export function tocarVitoria(): void {
    [523, 659, 784, 1047].forEach((f, i) => bipe('square', f, f, 0.22, 0.07, i * 0.13));
}
export function tocarDerrota(): void {
    [392, 330, 262, 196].forEach((f, i) => bipe('sawtooth', f, f * 0.94, 0.3, 0.07, i * 0.17));
}

// ── O RASPÃO E A CARGA ───────────────────────────────────────────────────────
//
// O raspão é a mecânica que faz desviar valer dano, e ela é invisível: o
// jogador não tem como descobrir sozinho que passar perto de um projétil está
// carregando alguma coisa. O brilho na nave diz isso com os olhos; estes dois
// sons dizem com o ouvido, que é o canal que sobra quando os olhos estão
// ocupados desviando.
//
// Agudo e curtíssimo no raspão (ele acontece muitas vezes seguidas e não pode
// virar barulho), e um acorde descendente e cheio quando a carga sai — este
// pode ser grande, porque é a recompensa.
export function tocarRaspao(): void { bipe('sine', 2100, 2600, 0.045, 0.035); }

export function tocarCarregado(): void {
    bipe('sawtooth', 260, 1400, 0.22, 0.09);
    bipe('square', 520, 2100, 0.18, 0.05);
}

// ═══ A TRILHA ════════════════════════════════════════════════════════════════
//
// ── NÃO HAVIA MÚSICA ─────────────────────────────────────────────────────────
//
// Um chefe de dois minutos com um drone de motor e bipes. Um avaliador
// independente apontou isso como a principal razão de o andar não ter clímax, e
// ele está certo: sem uma base que ande, não existe "a luta apertou" — existe só
// um número de vida descendo.
//
// Ela é PROCEDURAL, como todo o áudio deste jogo: zero bytes de asset, e o andar
// já carrega 82 MB. São quatro camadas construídas com osciladores e um relógio
// próprio, e o que muda na virada é QUANTAS tocam, não a melodia — trocar de
// música no meio corta a tensão que a luta levou um minuto para montar.
//
//   baixo      sempre       a pulsação; é ele que faz a luta ter andamento
//   arpejo     sempre       o movimento; sobe e desce num modo menor
//   tensão     na virada    uma quinta suja por cima, a cada dois compassos
//   bumbo      na virada    marca o tempo forte e dobra a sensação de pressa
//
// ── POR QUE UM AGENDADOR E NÃO UM `setInterval` ──────────────────────────────
//
// `setInterval` no relógio do navegador derrapa: ele é a fila de tarefas, não o
// relógio de áudio, e um engasgo de render vira uma nota atrasada que o ouvido
// pega na hora. O agendador olha à frente (`ESPREITA`) e marca as notas no
// `currentTime` do `AudioContext`, que é uma base de tempo de verdade. O timer
// só precisa acordar a tempo — se ele atrasar 50 ms, as notas continuam caindo
// no lugar certo.
const TRILHA = Object.freeze({
    bpm: 132,
    /** Quanto à frente o agendador marca notas, em segundos. */
    espreita: 0.32,
    /** De quanto em quanto ele acorda. Bem menor que a espreita, de propósito. */
    acorda: 90,
    volume: 0.055,
});

/** Lá menor natural: a escala do andar. Semitons a partir de A2 (110 Hz). */
const ESCALA = [0, 2, 3, 5, 7, 8, 10];
const nota = (grau: number, oitava = 0): number =>
    110 * Math.pow(2, (ESCALA[((grau % 7) + 7) % 7] + 12 * (oitava + Math.floor(grau / 7))) / 12);

const trilha = {
    tocando: false,
    proxima: 0,
    passo: 0,
    timer: 0 as unknown as ReturnType<typeof setInterval>,
    intenso: false,
};

function voz(f: number, dur: number, vol: number, tipo: OscillatorType, quando: number, corte = 2600): void {
    const c = ctx, d = saida();
    if (!c || !d) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = corte;
    osc.type = tipo;
    osc.frequency.setValueAtTime(f, quando);
    g.gain.setValueAtTime(0, quando);
    g.gain.linearRampToValueAtTime(vol, quando + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
    osc.connect(lp); lp.connect(g); g.connect(d);
    osc.start(quando); osc.stop(quando + dur + 0.02);
}

function bumbo(quando: number, vol: number): void {
    const c = ctx, d = saida();
    if (!c || !d) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, quando);
    osc.frequency.exponentialRampToValueAtTime(42, quando + 0.11);
    g.gain.setValueAtTime(vol, quando);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.16);
    osc.connect(g); g.connect(d);
    osc.start(quando); osc.stop(quando + 0.18);
}

/** Marca um passo de semicolcheia no instante `quando`. */
function passoDaTrilha(n: number, quando: number): void {
    const v = TRILHA.volume;
    const compasso = Math.floor(n / 16);

    // BAIXO: tônica no 1, quinta no 9 — a pulsação
    if (n % 16 === 0) voz(nota(0, -1), 0.42, v * 1.5, 'triangle', quando, 700);
    if (n % 16 === 8) voz(nota(4, -1), 0.34, v * 1.2, 'triangle', quando, 700);

    // ARPEJO: sobe e desce, com o compasso escolhendo o grau de partida
    if (n % 2 === 0) {
        const desenho = [0, 2, 4, 6, 4, 2, 0, 2];
        const base = compasso % 4 === 3 ? 3 : compasso % 2 === 1 ? 5 : 0;
        voz(nota(base + desenho[(n / 2) % 8], 1), 0.16, v * 0.62, 'square', quando, 2200);
    }

    if (!trilha.intenso) return;

    // ── SÓ DEPOIS DA VIRADA ──
    // BUMBO no tempo forte e no contratempo: é o que dobra a sensação de pressa
    // sem mudar uma nota da base.
    if (n % 8 === 0 || n % 16 === 6) bumbo(quando, v * 4.2);
    // TENSÃO: uma quinta suja por cima, a cada dois compassos
    if (n % 32 === 24) voz(nota(1, 1) * 1.5, 0.9, v * 0.5, 'sawtooth', quando, 1500);
}

function agendar(): void {
    const c = ctx;
    if (!c || !trilha.tocando) return;
    const passoSeg = 60 / TRILHA.bpm / 4;          // semicolcheia
    if (trilha.proxima < c.currentTime) trilha.proxima = c.currentTime + 0.06;
    while (trilha.proxima < c.currentTime + TRILHA.espreita) {
        passoDaTrilha(trilha.passo, trilha.proxima);
        trilha.passo = (trilha.passo + 1) % 1024;
        trilha.proxima += passoSeg;
    }
}

export function tocarTrilha(): void {
    if (trilha.tocando || !ctx) return;
    trilha.tocando = true;
    trilha.passo = 0;
    trilha.proxima = ctx.currentTime + 0.08;
    trilha.timer = setInterval(agendar, TRILHA.acorda);
    agendar();
}

/** A virada: entram o bumbo e a tensão. A base NÃO muda. */
export function intensificarTrilha(sim: boolean): void { trilha.intenso = sim; }

export function pararTrilha(): void {
    if (!trilha.tocando) return;
    trilha.tocando = false;
    trilha.intenso = false;
    clearInterval(trilha.timer);
}
