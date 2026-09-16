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
 *
 * ── O QUE MUDOU, E POR QUÊ ───────────────────────────────────────────────────
 *
 * O andar tinha todos os sons no mesmo volume. Sete tiros por segundo no mesmo
 * peso de uma explosão não formam uma luta: formam uma parede plana em que
 * nada é notícia. Agora há MISTURA — barramentos com pesos diferentes, um
 * compressor que cola tudo e um abaixamento da trilha quando acontece algo
 * grande. O tiro comum é a coisa mais baixa do andar de propósito; ele é o
 * chão, não o evento.
 */
import { RASPAO } from './f12Boss';

let ctx: AudioContext | null = null;
let dest: AudioNode | null = null;

// ── A MESA DE SOM ────────────────────────────────────────────────────────────
//
// Cinco barramentos, e o peso de cada um é a hierarquia da luta escrita em
// número. Sem isto, o tiro comum (que toca 7x por segundo) empata em volume com
// o estouro da cabeça (que toca uma vez na vida) e o jogador não tem como saber,
// de ouvido, o que foi importante.
//
//   arma     0.40   o tiro comum e o raspão: o chão do andar, o mais baixo
//   motor    0.62   contínuo, tem que caber embaixo de tudo sem sumir
//   musica   0.90   a base; abaixa sozinha quando algo grande estoura
//   voz      0.85   falas, dings e os TELEGRAFOS — precisa passar por cima
//   eventos  1.00   dano, carga, explosão: o topo, e só ele chega aqui
const PESO = Object.freeze({ arma: 0.40, motor: 0.62, musica: 0.90, voz: 0.85, eventos: 1.0 });
type Barra = keyof typeof PESO;

let mesa: { de: AudioNode; mestre: GainNode; barras: Record<Barra, GainNode> } | null = null;

export function configureFloor12Sfx(context: AudioContext | null, destination?: AudioNode | null): void {
    ctx = context;
    dest = destination ?? null;
    mesa = null;              // a mesa é refeita no próximo som, já no destino novo
    ruidoCache = null;
}
export function clearFloor12Sfx(): void {
    pararMotor(); pararTrilha();
    ctx = null; dest = null; mesa = null; ruidoCache = null;
    cargaRaspoes = 0; vozes.fill(0);
}

function raiz(): AudioNode | null { return dest ?? ctx?.destination ?? null; }

/**
 * O barramento pedido, montando a mesa na primeira vez.
 *
 * O compressor no mestre não é para "ficar mais alto": é para o tiro comum não
 * desaparecer quando a trilha, o motor e uma explosão tocam juntos, e para a
 * explosão ainda assim empurrar o resto para baixo por um instante. É o que faz
 * a luta respirar em vez de saturar.
 */
function barra(qual: Barra): GainNode | null {
    const c = ctx, r = raiz();
    if (!c || !r) return null;
    if (!mesa || mesa.de !== r) {
        const mestre = c.createGain(); mestre.gain.value = 1;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
        comp.attack.value = 0.004; comp.release.value = 0.2;
        mestre.connect(comp); comp.connect(r);
        const barras = {} as Record<Barra, GainNode>;
        (Object.keys(PESO) as Barra[]).forEach((k) => {
            const g = c.createGain(); g.gain.value = PESO[k]; g.connect(mestre); barras[k] = g;
        });
        mesa = { de: r, mestre, barras };
    }
    return mesa.barras[qual];
}

/**
 * ABAIXAR a trilha e a arma por um instante.
 *
 * É o truque que dá PESO a um evento sem precisar aumentar o volume dele: uma
 * explosão que faz a música sumir por meio segundo soa maior que uma explosão
 * mais alta tocando por cima da música. `quanto` é quanto sobra (0.35 = some
 * dois terços).
 */
function abaixar(quanto: number, dur: number): void {
    const c = ctx;
    if (!c || !mesa) return;
    const t = c.currentTime;
    for (const k of ['musica', 'arma'] as Barra[]) {
        // só a música muda de peso na virada; a arma sempre volta ao peso de fábrica
        const cheio = PESO[k] * (k === 'musica' ? trilhaGanho() : 1);
        const g = mesa.barras[k].gain;
        try {
            g.cancelScheduledValues(t);
            g.setValueAtTime(Math.min(g.value, cheio), t);
            g.linearRampToValueAtTime(cheio * quanto, t + 0.02);
            g.linearRampToValueAtTime(cheio, t + dur);
        } catch { /* param ocupado; o volume volta no próximo evento */ }
    }
}
/** Depois da virada a trilha volta MAIS ALTA do que antes. Ver `intensificarTrilha`. */
function trilhaGanho(): number { return trilha.intenso ? 1.22 : 1; }

// ── CONTAGEM DE VOZES ────────────────────────────────────────────────────────
// Um anel de instantes de término. Serve para o tiro comum se recusar a nascer
// quando já há coisa demais no ar: numa maré + leque + dois aviões atirando, o
// que soma não é emoção, é lama. O teto derruba só o som mais barato do andar.
const vozes = new Float64Array(64);
let vozIdx = 0;
function nasceVoz(fim: number): void { vozes[vozIdx] = fim; vozIdx = (vozIdx + 1) % vozes.length; }
function vozesVivas(agora: number): number {
    let n = 0;
    for (let i = 0; i < vozes.length; i++) if (vozes[i] > agora) n++;
    return n;
}
const TETO_DE_VOZES = 26;

// ── AS PEÇAS ─────────────────────────────────────────────────────────────────

/**
 * Um bipe. `tipo`, frequência inicial, frequência final, duração e volume.
 *
 * O envelope tem ATAQUE, e não começa em 1: sem os 8 ms de subida cada nota
 * estala no alto-falante, e com trinta tiros por segundo o estalo vira chiado.
 */
function bipe(
    tipo: OscillatorType, f0: number, f1: number, dur: number, vol: number, atraso = 0,
    onde: Barra = 'eventos', ataque = 0.008,
): void {
    const c = ctx, d = barra(onde);
    if (!c || !d) return;
    const t = c.currentTime + atraso;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(d);
    osc.start(t); osc.stop(t + dur + 0.02);
    nasceVoz(t + dur);
}

/**
 * Um segundo de ruído branco, UMA vez por contexto.
 *
 * Antes cada explosão preenchia um `AudioBuffer` novo no laço — meio segundo a
 * 48 kHz é vinte e quatro mil multiplicações e um descarte, no meio do combate,
 * no celular. O mesmo buffer serve todos: quem molda a cauda é o ganho, e quem
 * muda a cor é o filtro e a velocidade de leitura.
 */
let ruidoCache: AudioBuffer | null = null;
function bufferDeRuido(c: AudioContext): AudioBuffer {
    if (ruidoCache && ruidoCache.sampleRate === c.sampleRate) return ruidoCache;
    const n = Math.max(1, Math.floor(c.sampleRate));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dados[i] = Math.random() * 2 - 1;
    ruidoCache = buf;
    return buf;
}

/** Ruído curto, para impacto e explosão. */
function ruido(
    dur: number, vol: number, corte = 1400, atraso = 0, onde: Barra = 'eventos', taxa = 1,
): void {
    const c = ctx, d = barra(onde);
    if (!c || !d) return;
    const t = c.currentTime + atraso;
    const src = c.createBufferSource();
    src.buffer = bufferDeRuido(c);
    src.playbackRate.value = taxa;
    const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = corte;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filtro); filtro.connect(g); g.connect(d);
    src.start(t); src.stop(t + dur + 0.02);
    nasceVoz(t + dur);
}

/** Ruído com passa-alta: o "ss" de um chimbal, sem o peso de uma explosão. */
function chiado(dur: number, vol: number, corte: number, atraso: number, onde: Barra): void {
    const c = ctx, d = barra(onde);
    if (!c || !d) return;
    const t = c.currentTime + atraso;
    const src = c.createBufferSource(); src.buffer = bufferDeRuido(c);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = corte;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(d);
    src.start(t); src.stop(t + dur + 0.02);
    nasceVoz(t + dur);
}

// ── O MOTOR ──────────────────────────────────────────────────────────────────
//
// É o único som contínuo do andar, e ele existe porque sem motor um avião
// parado no céu não tem peso nenhum. Mas um drone fixo some do ouvido em vinte
// segundos — o cérebro aprende a ignorar o que nunca muda. Então o motor
// RESPONDE:
//
//   • cada tiro dá uma solavancada no filtro (a arma puxa energia do motor);
//   • o dano faz o motor FALHAR — a rotação cai e volta em quase um segundo;
//   • depois da virada ele fica mais agudo e mais aberto, o avião forçado.
//
// Nada disso precisa de quadro do jogo: é tudo agendado no `currentTime` a
// partir de sons que já são chamados de lá.
const MOTOR = Object.freeze({ base: 74, corteBase: 330, corteAberto: 900, volume: 0.075 });

let motor: {
    a: OscillatorNode; b: OscillatorNode; sub: OscillatorNode;
    lfo: OscillatorNode; lfoG: GainNode; filtro: BiquadFilterNode; g: GainNode;
} | null = null;
/** Quantas vezes o motor já ligou. A primeira subida é lenta (o elevador virando
 *  avião); as outras são rápidas, para uma troca de fase não soar como reboot. */
let motorLigou = 0;

export function tocarMotor(): void {
    const c = ctx, d = barra('motor');
    if (!c || !d || motor) return;
    const t = c.currentTime;
    const f = MOTOR.base * (trilha.intenso ? 1.09 : 1);

    // DUAS serras desafinadas entre si + um sub uma oitava abaixo. Uma serra só
    // é um zumbido de geladeira; duas batendo uma na outra é uma hélice.
    const a = c.createOscillator(); a.type = 'sawtooth'; a.frequency.value = f; a.detune.value = -7;
    const b = c.createOscillator(); b.type = 'sawtooth'; b.frequency.value = f * 1.004; b.detune.value = 9;
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = f * 0.5;
    const subG = c.createGain(); subG.gain.value = 0.5;

    const filtro = c.createBiquadFilter();
    filtro.type = 'lowpass'; filtro.frequency.value = MOTOR.corteBase; filtro.Q.value = 3;

    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(MOTOR.volume, t + (motorLigou === 0 ? 1.2 : 0.28));
    motorLigou += 1;

    // LFO na altura: hélice, não gerador.
    const lfo = c.createOscillator(); lfo.frequency.value = 6.5;
    const lfoG = c.createGain(); lfoG.gain.value = 5;
    lfo.connect(lfoG); lfoG.connect(a.frequency); lfoG.connect(b.frequency);

    a.connect(filtro); b.connect(filtro); sub.connect(subG); subG.connect(filtro);
    filtro.connect(g); g.connect(d);
    a.start(t); b.start(t); sub.start(t); lfo.start(t);
    motor = { a, b, sub, lfo, lfoG, filtro, g };
}

/** O motor "puxa" por um instante: usado a cada tiro, de leve. */
function motorEsforco(quanto: number): void {
    const c = ctx, m = motor;
    if (!c || !m) return;
    const t = c.currentTime;
    const alvo = MOTOR.corteBase + (MOTOR.corteAberto - MOTOR.corteBase) * quanto * (trilha.intenso ? 1.25 : 1);
    try {
        m.filtro.frequency.setTargetAtTime(alvo, t, 0.03);
        m.filtro.frequency.setTargetAtTime(MOTOR.corteBase * (trilha.intenso ? 1.25 : 1), t + 0.09, 0.22);
    } catch { /* param ocupado neste quadro; o próximo tiro corrige */ }
}

/** O motor ENGASGA: a rotação despenca e volta. É o som de levar um tiro. */
function motorFalha(): void {
    const c = ctx, m = motor;
    if (!c || !m) return;
    const t = c.currentTime;
    const f = MOTOR.base * (trilha.intenso ? 1.09 : 1);
    try {
        for (const o of [m.a, m.b]) {
            o.frequency.cancelScheduledValues(t);
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.18);
            o.frequency.exponentialRampToValueAtTime(f, t + 0.95);
        }
        m.g.gain.cancelScheduledValues(t);
        m.g.gain.setValueAtTime(Math.max(0.0002, m.g.gain.value), t);
        m.g.gain.exponentialRampToValueAtTime(MOTOR.volume * 0.35, t + 0.12);
        m.g.gain.exponentialRampToValueAtTime(MOTOR.volume, t + 0.9);
    } catch { /* já parando */ }
}

/** Depois da virada o avião é forçado: mais agudo, mais aberto, mais presente. */
function motorTenso(sim: boolean): void {
    const c = ctx, m = motor;
    if (!c || !m) return;
    const t = c.currentTime;
    const k = sim ? 1.09 : 1;
    try {
        m.a.frequency.setTargetAtTime(MOTOR.base * k, t, 1.2);
        m.b.frequency.setTargetAtTime(MOTOR.base * k * 1.004, t, 1.2);
        m.sub.frequency.setTargetAtTime(MOTOR.base * k * 0.5, t, 1.2);
        m.filtro.frequency.setTargetAtTime(MOTOR.corteBase * (sim ? 1.25 : 1), t, 1.2);
        m.lfoG.gain.setTargetAtTime(sim ? 9 : 5, t, 1.2);
    } catch { /* já parando */ }
}

/**
 * Hook opcional para o motor seguir a nave de verdade (velocidade e inclinação).
 * NÃO é chamado por `Floor12.tsx` hoje — precisa de uma linha lá para viver.
 * `acelerador` e `curva` são 0..1.
 */
export function atualizarMotor(acelerador: number, curva = 0): void {
    const c = ctx, m = motor;
    if (!c || !m) return;
    const t = c.currentTime;
    const a = Math.max(0, Math.min(1, acelerador));
    const f = MOTOR.base * (trilha.intenso ? 1.09 : 1) * (0.92 + a * 0.24);
    try {
        m.a.frequency.setTargetAtTime(f, t, 0.12);
        m.b.frequency.setTargetAtTime(f * 1.004, t, 0.12);
        m.sub.frequency.setTargetAtTime(f * 0.5, t, 0.12);
        m.filtro.frequency.setTargetAtTime(
            MOTOR.corteBase + (MOTOR.corteAberto - MOTOR.corteBase) * (a * 0.6 + Math.abs(curva) * 0.4), t, 0.1);
    } catch { /* param ocupado */ }
}

export function pararMotor(): void {
    if (!motor || !ctx) { motor = null; return; }
    const m = motor;
    motor = null;
    try {
        const t = ctx.currentTime;
        m.g.gain.cancelScheduledValues(t);
        m.g.gain.setValueAtTime(Math.max(0.0001, m.g.gain.value), t);
        m.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        for (const o of [m.a, m.b, m.sub, m.lfo]) o.stop(t + 0.4);
    } catch { /* já parado */ }
}

// ── OS EVENTOS ───────────────────────────────────────────────────────────────
//
// O TIRO COMUM é a coisa mais baixa e mais curta do andar, e é assim de
// propósito: ele toca 7 vezes por segundo em cada um dos dois aviões. A altura
// varia um pouquinho a cada disparo porque quatorze cópias idênticas por
// segundo batem em fase e viram uma serra contínua — o ouvido ouve "chiado",
// não "metralhadora".
let giroDoTiro = 0;
export function tocarTiro(): void {
    const c = ctx;
    if (!c) return;
    if (vozesVivas(c.currentTime) > TETO_DE_VOZES) return;   // ver `TETO_DE_VOZES`
    giroDoTiro = (giroDoTiro + 1) % 4;
    const k = 1 + (giroDoTiro - 1.5) * 0.035;
    bipe('square', 980 * k, 360 * k, 0.055, 0.032, 0, 'arma', 0.003);
    motorEsforco(0.35);
}
/** O ala. Mesma arma, um degrau abaixo e mais escura: dá para saber quem atirou. */
export function tocarTiroIrmao(): void {
    const c = ctx;
    if (!c) return;
    if (vozesVivas(c.currentTime) > TETO_DE_VOZES) return;
    bipe('triangle', 640, 250, 0.06, 0.024, 0, 'arma', 0.003);
}
/** Acerto na cabeça: seco e curtíssimo. É confirmação, não é notícia. */
export function tocarAcerto(): void {
    bipe('square', 1700, 1050, 0.035, 0.05, 0, 'voz', 0.002);
    chiado(0.03, 0.03, 3000, 0, 'voz');
}

/**
 * A BOCA ABRINDO: o telegrafo sonoro do ataque.
 *
 * É sempre O MESMO gesto — dobradiça grave subindo + um sopro de ar entrando —
 * porque ele é a sílaba que o jogador tem que aprender primeiro: "vem coisa".
 * O que muda de um ataque para o outro é o cuspe, em `tocarAtaque`.
 */
export function tocarBocaAbrindo(): void {
    bipe('sawtooth', 84, 300, 0.5, 0.075, 0, 'voz', 0.03);
    bipe('square', 42, 150, 0.5, 0.03, 0, 'voz', 0.05);
    ruido(0.42, 0.045, 1100, 0.06, 'voz', 0.6);      // o ar entrando
    abaixar(0.72, 0.5);                              // a trilha dá espaço ao aviso
}

/**
 * A boca cuspindo. Cada ataque tem o SEU, e eles foram feitos para não se
 * parecerem: quem reage ao som chega antes de quem espera ver o projétil.
 *
 *   leque       cinco bipes em LEQUE, subindo — cinco balas abrindo
 *   teleguiado  sirene que oscila e não decide: é o míssil te PROCURANDO
 *   naves       quatro motorzinhos descendo, com chiado: coisa que voa
 *   mare        rugido grave que SOBE e não tem nota: a parede de água
 *   elevadores  o DING de elevador e três batidas graves: metal caindo
 *   giratoria   um tom que roda em tremolo, sem parar: a porta girando
 */
export function tocarAtaque(nome: string): void {
    abaixar(0.78, 0.45);
    switch (nome) {
        case 'leque':
            // sobe em leque; o intervalo entre as balas é o mesmo do desenho
            for (let i = 0; i < 5; i++) bipe('square', 480 + i * 130, 330 + i * 110, 0.085, 0.055, i * 0.035, 'voz');
            break;
        case 'teleguiado': {
            // a sirene indecisa: dois tons próximos batendo, um subindo e outro descendo
            bipe('sine', 1250, 520, 0.6, 0.07, 0, 'voz', 0.02);
            bipe('sine', 1180, 1500, 0.6, 0.05, 0, 'voz', 0.02);
            bipe('triangle', 2500, 2500, 0.12, 0.02, 0.5, 'voz');
            break;
        }
        case 'naves':
            // quatro motorzinhos DESCENDO: o contrário do leque, de propósito
            for (let i = 0; i < 4; i++) {
                bipe('triangle', 820 - i * 110, 300, 0.14, 0.05, i * 0.07, 'voz');
                chiado(0.06, 0.018, 2400, i * 0.07, 'voz');
            }
            break;
        case 'mare':
            // sem nota nenhuma: é ruído SUBINDO, a única coisa do andar que faz isso
            ruido(0.85, 0.11, 620, 0, 'voz', 0.45);
            bipe('sine', 70, 190, 0.8, 0.075, 0, 'voz', 0.12);
            bipe('sawtooth', 35, 95, 0.8, 0.035, 0, 'voz', 0.15);
            break;
        case 'elevadores':
            // a única citação do hotel na luta: o ding, e depois o metal caindo
            bipe('sine', 1568, 1568, 0.18, 0.06, 0, 'voz', 0.004);
            bipe('sine', 1175, 1175, 0.3, 0.045, 0.06, 'voz', 0.004);
            for (let i = 0; i < 3; i++) {
                bipe('square', 190 - i * 28, 120 - i * 20, 0.16, 0.05, 0.16 + i * 0.11, 'voz');
                ruido(0.1, 0.05, 900, 0.16 + i * 0.11, 'voz', 0.8);
            }
            break;
        case 'giratoria':
            // RODANDO: um tom fixo picado em seis por um tremolo, dando a volta
            for (let i = 0; i < 7; i++) {
                const v = 0.055 * (0.55 + 0.45 * Math.sin((i / 7) * Math.PI * 2));
                bipe('square', 430, 430, 0.07, Math.max(0.006, v), i * 0.075, 'voz');
            }
            bipe('sawtooth', 215, 215, 0.55, 0.03, 0, 'voz', 0.04);
            break;
        default:
            bipe('square', 400, 200, 0.2, 0.05, 0, 'voz');
    }
}

/**
 * LEVAR DANO. O evento mais alto da luta junto com a explosão, e o único que
 * faz o motor engasgar — a informação "você foi atingido" não pode depender do
 * jogador estar olhando a barra de vidas.
 */
export function tocarDano(): void {
    ruido(0.34, 0.26, 850, 0, 'eventos', 0.7);
    bipe('sawtooth', 250, 62, 0.36, 0.13, 0, 'eventos', 0.002);
    bipe('square', 125, 40, 0.3, 0.06, 0.01, 'eventos', 0.002);
    abaixar(0.32, 0.55);
    motorFalha();
}

export function tocarExplosao(): void {
    ruido(0.65, 0.3, 1200, 0, 'eventos', 0.55);
    bipe('sawtooth', 185, 40, 0.6, 0.14, 0, 'eventos', 0.002);
    chiado(0.09, 0.06, 2600, 0, 'eventos');
    abaixar(0.4, 0.6);
}
export function tocarFalaDoIrmao(): void { bipe('square', 300, 380, 0.05, 0.04, 0, 'voz'); }

/**
 * Um estouro da MORTE do chefe — e nunca duas vezes igual.
 *
 * `tocarExplosao` era chamado até dez vezes seguidas na cena, com o mesmo
 * ruído e a mesma nota. Dez cópias idênticas do mesmo som não soam como uma
 * coisa se despedaçando: soam como um botão apertado dez vezes. Aqui cada
 * chamada sorteia a altura e o corte do filtro; `peso` engrossa o grande.
 */
export function tocarEstouro(peso = 1): void {
    const v = 0.82 + Math.random() * 0.42;
    ruido(0.6 * peso, 0.26 * peso + 0.08, 1200 * v, 0, 'eventos', 0.5 / v);
    bipe('sawtooth', 190 * v, 38 * v, 0.55 * peso + 0.15, 0.12 * peso, 0, 'eventos', 0.002);
    if (peso >= 1) bipe('square', 95 * v, 25, 0.7 * peso, 0.05 * peso, 0.02, 'eventos', 0.004);
    abaixar(Math.max(0.2, 0.55 - peso * 0.2), 0.35 + peso * 0.3);
}

/**
 * A QUEDA: um tom que desaba enquanto a cabeça cai.
 *
 * A trilha parava no estouro grande e os últimos dois segundos do clímax eram
 * SILÊNCIO — um avaliador cronometrou. Silêncio é uma escolha legítima quando é
 * escolhido; ali era um `pararTrilha()` mal colocado. Este tom cobre a queda e
 * termina junto com ela.
 */
export function tocarQueda(segundos: number): void {
    bipe('sawtooth', 220, 34, segundos, 0.09, 0, 'eventos', 0.05);
    bipe('square', 110, 21, segundos, 0.055, 0.05, 'eventos', 0.05);
    ruido(segundos, 0.055, 700, 0.4, 'eventos', 0.4);
}

/** O elevador virando avião: metal se desdobrando. */
export function tocarDesdobrar(): void {
    for (let i = 0; i < 6; i++) bipe('square', 160 + i * 55, 90 + i * 30, 0.12, 0.055, i * 0.12, 'voz');
    ruido(0.5, 0.15, 2200, 0.5, 'voz', 1.4);
}
export function tocarDing(): void {
    bipe('sine', 1320, 1320, 0.16, 0.09, 0, 'voz', 0.004);
    bipe('sine', 990, 990, 0.36, 0.07, 0.1, 'voz', 0.004);
}

export function tocarVitoria(): void {
    [523, 659, 784, 1047].forEach((f, i) => bipe('square', f, f, 0.22, 0.075, i * 0.13, 'eventos'));
    bipe('triangle', 261, 261, 0.9, 0.05, 0.39, 'eventos');
}
export function tocarDerrota(): void {
    [392, 330, 262, 196].forEach((f, i) => bipe('sawtooth', f, f * 0.94, 0.3, 0.07, i * 0.17, 'eventos'));
}

// ── O RASPÃO E A CARGA ───────────────────────────────────────────────────────
//
// O raspão é a mecânica que faz desviar valer dano, e ela é invisível: o
// jogador não tem como descobrir sozinho que passar perto de um projétil está
// carregando alguma coisa. O brilho na nave diz isso com os olhos; estes dois
// sons dizem com o ouvido, que é o canal que sobra quando os olhos estão
// ocupados desviando.
//
// E o raspão SOBE: cada degrau da carga toca mais agudo e um pouco mais cheio
// que o anterior, e o último — o que enche — traz um harmônico por cima e um
// brilho curto. "Está enchendo" e "encheu" são informações diferentes, e o
// jogador aprende as duas em três raspões.
//
// A contagem é local porque `tocarRaspao()` não recebe a nave. Ela usa
// `RASPAO.cheia` para não sair do passo da regra, e zera em `tocarCarregado`,
// que é exatamente quando a carga é gasta.
let cargaRaspoes = 0;

export function tocarRaspao(): void {
    const cheia = Math.max(1, RASPAO.cheia);
    cargaRaspoes = Math.min(cheia, cargaRaspoes + 1);
    const p = cargaRaspoes / cheia;                   // 0..1, quanto da carga já foi
    const f = 1750 + 700 * p;
    bipe('sine', f, f * 1.22, 0.05, 0.03 + 0.022 * p, 0, 'voz', 0.002);
    if (cargaRaspoes >= cheia) {
        // CHEIA: o aviso de que a próxima coisa que sair da nave é grande.
        bipe('square', f * 1.5, f * 2, 0.07, 0.03, 0.02, 'voz', 0.002);
        bipe('sine', f * 2, f * 2.4, 0.1, 0.018, 0.04, 'voz', 0.004);
    } else if (cargaRaspoes === cheia - 1) {
        bipe('sine', f * 1.5, f * 1.5, 0.04, 0.014, 0.03, 'voz', 0.002);
    }
}

/**
 * O TIRO CARREGADO. Tem que soar como uma ARMA MAIOR, não como o tiro comum
 * mais alto: por isso ele tem coisas que o tiro comum não tem — um sub que
 * desce, uma varredura que sobe contra ele, um estalo de ruído na frente e uma
 * cauda. E ele abaixa a trilha, que é o que faz um som parecer grande.
 */
export function tocarCarregado(): void {
    cargaRaspoes = 0;
    chiado(0.05, 0.09, 1800, 0, 'eventos');                    // o estalo da largada
    bipe('sawtooth', 240, 1500, 0.24, 0.12, 0, 'eventos', 0.004);
    bipe('square', 480, 2400, 0.2, 0.06, 0.01, 'eventos', 0.004);
    bipe('sine', 180, 46, 0.45, 0.13, 0, 'eventos', 0.004);    // o sub que desce
    bipe('triangle', 90, 30, 0.5, 0.05, 0.03, 'eventos', 0.01);
    ruido(0.3, 0.09, 700, 0.02, 'eventos', 0.5);               // a cauda
    abaixar(0.42, 0.45);
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
// já carrega 82 MB. São camadas construídas com osciladores e um relógio
// próprio, e o que muda na virada é QUANTAS tocam e QUÃO RÁPIDO, não a melodia —
// trocar de música no meio corta a tensão que a luta levou um minuto para montar.
//
//   baixo       sempre       a pulsação; é ele que faz a luta ter andamento
//   arpejo      sempre       o movimento; sobe e desce num modo menor
//   bumbo       virada +0s   marca o tempo forte e dobra a sensação de pressa
//   chimbal     virada +0s   as semicolcheias: o que faz "rápido" ser audível
//   tensão      virada +0s   uma quinta suja por cima, a cada dois compassos
//   ostinato    virada +~4s  baixo em colcheias; a última camada a entrar
//
// ── A VIRADA NÃO É UM INTERRUPTOR ────────────────────────────────────────────
//
// `intensificarTrilha(true)` chegava e três camadas apareciam no mesmo passo:
// um clique, não uma escalada. Agora ela dispara uma SUBIDA (um tom que varre
// para cima com prato no fim), o andamento SOBE de 132 para 152 ao longo de
// seis segundos, o barramento da música ganha volume, e o ostinato do baixo só
// entra quatro segundos depois — a música continua apertando depois do susto.
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
    /** O andamento depois da virada, alcançado em `rampaDoBpm` segundos. */
    bpmIntenso: 152,
    rampaDoBpm: 6,
    /** Segundos entre a virada e a entrada do ostinato do baixo. */
    atrasoDoOstinato: 4,
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
    /** `currentTime` da virada. É daqui que saem a rampa de andamento e o ostinato. */
    viradaEm: 0,
};

/** O andamento AGORA: sobe suave depois da virada em vez de saltar. */
function bpmEm(quando: number): number {
    if (!trilha.intenso) return TRILHA.bpm;
    const k = Math.max(0, Math.min(1, (quando - trilha.viradaEm) / TRILHA.rampaDoBpm));
    return TRILHA.bpm + (TRILHA.bpmIntenso - TRILHA.bpm) * k;
}

function voz(f: number, dur: number, vol: number, tipo: OscillatorType, quando: number, corte = 2600): void {
    const c = ctx, d = barra('musica');
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
    nasceVoz(quando + dur);
}

function bumbo(quando: number, vol: number): void {
    const c = ctx, d = barra('musica');
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
    nasceVoz(quando + 0.18);
}

/** Chimbal: ruído passa-alta bem curto. Ele reusa o buffer único do andar. */
function chimbal(quando: number, vol: number): void {
    const c = ctx, d = barra('musica');
    if (!c || !d) return;
    const src = c.createBufferSource(); src.buffer = bufferDeRuido(c);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, quando);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.035);
    src.connect(hp); hp.connect(g); g.connect(d);
    src.start(quando); src.stop(quando + 0.05);
    nasceVoz(quando + 0.05);
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
    // CHIMBAL nas colcheias, e o acento nas quartas. Sem ele o andamento sobe e
    // ninguém percebe: o bumbo marca o tempo, o chimbal marca a PRESSA.
    if (n % 2 === 0) chimbal(quando, v * (n % 4 === 0 ? 0.5 : 0.26));
    // TENSÃO: uma quinta suja por cima, a cada dois compassos
    if (n % 32 === 24) voz(nota(1, 1) * 1.5, 0.9, v * 0.5, 'sawtooth', quando, 1500);
    // OSTINATO: o baixo para de esperar e passa a martelar em colcheias. É a
    // última camada, e ela entra alguns segundos DEPOIS da virada, de propósito:
    // a música continua subindo quando o susto do momento já passou.
    if (quando - trilha.viradaEm > TRILHA.atrasoDoOstinato && n % 4 === 2) {
        voz(nota(0, -1), 0.1, v * 0.8, 'square', quando, 500);
    }
}

function agendar(): void {
    const c = ctx;
    if (!c || !trilha.tocando) return;
    if (trilha.proxima < c.currentTime) trilha.proxima = c.currentTime + 0.06;
    while (trilha.proxima < c.currentTime + TRILHA.espreita) {
        passoDaTrilha(trilha.passo, trilha.proxima);
        trilha.passo = (trilha.passo + 1) % 1024;
        // o andamento é lido A CADA NOTA: é assim que a rampa da virada acelera
        // a música de verdade, em vez de mudar de música no meio.
        trilha.proxima += 60 / bpmEm(trilha.proxima) / 4;
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

/**
 * A VIRADA. Entram bumbo, chimbal e tensão, o andamento começa a subir, a
 * música sobe de volume e o motor se aperta — e uma SUBIDA marca o instante,
 * para a escalada ser um acontecimento e não um parâmetro que mudou.
 * A base melódica NÃO muda.
 */
export function intensificarTrilha(sim: boolean): void {
    const jaEstava = trilha.intenso;
    trilha.intenso = sim;
    const c = ctx;
    if (c) trilha.viradaEm = c.currentTime;
    if (mesa) {
        const g = mesa.barras.musica.gain;
        try {
            g.cancelScheduledValues(c ? c.currentTime : 0);
            g.setTargetAtTime(PESO.musica * trilhaGanho(), c ? c.currentTime : 0, 0.8);
        } catch { /* param ocupado */ }
    }
    motorTenso(sim);
    if (sim && !jaEstava) {
        // A SUBIDA: varredura de 2,2 s para cima + prato no alto. Ela é o único
        // som do andar que sobe por tanto tempo, então não se confunde com nada.
        bipe('sawtooth', 120, 1500, 2.2, 0.06, 0, 'eventos', 1.4);
        ruido(2.2, 0.05, 6000, 0, 'eventos', 1.6);
        chiado(1.2, 0.1, 3500, 2.1, 'eventos');
        bipe('sine', 60, 42, 1.4, 0.1, 2.15, 'eventos', 0.01);
    }
}

export function pararTrilha(): void {
    if (!trilha.tocando) return;
    trilha.tocando = false;
    trilha.intenso = false;
    clearInterval(trilha.timer);
    if (mesa && ctx) {
        // devolve o barramento ao peso de fábrica: sem isto uma luta seguinte
        // começaria com a música no volume da segunda metade.
        try { mesa.barras.musica.gain.setTargetAtTime(PESO.musica, ctx.currentTime, 0.2); } catch { /* ocupado */ }
    }
}
