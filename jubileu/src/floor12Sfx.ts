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
    // Um compressor na saída do andar: ruídos empilhados (dano + explosão +
    // música) estouravam o alto-falante do celular. Ele segura o pico.
    if (ctx) {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 6;
        comp.attack.value = 0.004; comp.release.value = 0.18;
        comp.connect(dest ?? ctx.destination);
        dest = comp;
    }
}
export function clearFloor12Sfx(): void { pararMotor(); pararMusica(0.2); ctx = null; dest = null; }

/**
 * O toque também sente: dano, aviso de ataque e tiro carregado vibram o
 * aparelho (Android; o iOS ignora `vibrate`, e tudo segue igual). Sem contexto
 * de áudio o andar está fora de cena, então não vibra.
 */
function vibrar(padrao: number | number[]): void {
    if (!ctx || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(padrao); } catch { /* alguns navegadores recusam sem gesto */ }
}

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
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 110;
    // Alto-falante de celular não toca abaixo de ~300 Hz: a 74 Hz com corte em
    // 320 o motor simplesmente não existia no aparelho. 110 Hz e corte em 950
    // deixam os harmônicos passarem, e ele volta a ser ouvido.
    const filtro = c.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 950;
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
// Tiro: altura sorteada ±6% a cada disparo e uma cauda grave curta — o mesmo
// bipe idêntico trinta vezes por segundo cansava o ouvido em um minuto.
// No máximo ~12 sons de tiro por segundo: a rajada dispara ~30 balas/s, e três
// fontes por bala eram vozes demais para um Android médio (estalava).
let ultimoTiro = -1;
export function tocarTiro(): void {
    const agora = ctx?.currentTime ?? 0;
    if (agora - ultimoTiro < 0.08) return;
    ultimoTiro = agora;
    // Estalo de ruído + baque grave, e só um fio do bipe quadrado por cima: o
    // quadrado puro, trinta vezes por segundo, virava agulha no alto-falante
    // e tapava os avisos.
    const v = 1 + (Math.random() - .5) * .12;
    ruido(0.03, 0.09, 3200 * v);
    bipe('triangle', 240 * v, 110, 0.07, 0.05);
    bipe('square', 900 * v, 380 * v, 0.05, 0.025);
}
export function tocarTiroIrmao(): void { bipe('square', 620, 240, 0.085, 0.04); }
/**
 * O ACERTO tem de soar diferente do TIRO: os dois eram bipes quadrados e o
 * jogador não ouvia a diferença entre errar e acertar. Agora é metal —
 * um "clanc" de ruído filtrado alto, duas parciais inarmônicas e um baque grave.
 */
// Sequência: acertos seguidos (menos de 0,6 s entre eles) sobem meio tom cada,
// até uma oitava. A sequência se ouve crescer — e zera quando o jogador erra o ritmo.
let ultimoAcerto = -1, sequencia = 0;
export function tocarAcerto(): void {
    const agora = ctx?.currentTime ?? 0;
    sequencia = agora - ultimoAcerto < 0.6 ? Math.min(12, sequencia + 1) : 0;
    ultimoAcerto = agora;
    const sobe = Math.pow(2, sequencia / 12);
    ruido(0.09, 0.2, 5200);
    bipe('triangle', 1760 * sobe, 1650 * sobe, 0.22, 0.09); bipe('triangle', 2490 * sobe, 2300 * sobe, 0.16, 0.06);
    bipe('sine', 130, 60, 0.16, 0.16);
}

/**
 * A boca abrindo: o telegrafo sonoro do ataque. É a CAMPAINHA DO BALCÃO,
 * duas notas (a mesma do "ding" da abertura) — o concierge chamando o próximo
 * hóspede. Alto, e a música abaixa por baixo para ele passar.
 */
// Quantas batidas de campainha cada ataque tem: dá para saber o que vem pelo
// ouvido, antes de ver. Leque 1, teleguiado 2, naves 3, maré 1 grave, elevadores 4.
const BATIDAS: Record<string, number> = { leque: 1, teleguiado: 2, naves: 3, mare: 1, elevadores: 4 };
export function tocarBocaAbrindo(ataque = ''): void {
    vibrar([18, 50, 18]);
    // Além da contagem, cada ataque tem a SUA altura: contar 3 contra 4 batidas
    // sob fogo não dá; a nota diz qual é antes de a contagem terminar.
    const ALTURA: Record<string, number> = { leque: 1, teleguiado: 1.26, naves: .84, mare: .5, elevadores: 1.5 };
    const n = BATIDAS[ataque] ?? 1, grave = ALTURA[ataque] ?? 1;
    for (let i = 1; i < n; i++) bipe('sine', 1320 * grave, 1320 * grave, 0.12, 0.13, 0.42 + (i - 1) * 0.1);
    abaixarMusica(0.5 + (BATIDAS[ataque] ?? 1) * 0.12);   // o abaixar dura o tanto que as batidas duram
    // o servo da mandíbula: um zumbido que sobe, embaixo da campainha
    bipe('sawtooth', 70, 140, 0.55, 0.05); ruido(0.5, 0.05, 900);
    bipe('sine', 1320 * grave, 1320 * grave, 0.28, 0.2); bipe('triangle', 2640 * grave, 2640 * grave, 0.12, 0.05);
    bipe('sine', 990 * grave, 990 * grave, 0.42, 0.18, 0.16);
    bipe('sawtooth', 90, 260, 0.5, 0.07);
}
/** A boca cuspindo. Cada ataque tem o seu, para dar para reconhecer de ouvido. */
export function tocarAtaque(nome: string): void {
    switch (nome) {
        // leque: cartas de baralho jogadas — cinco estalos de ruído agudo em leque
        case 'leque':      for (let i = 0; i < 5; i++) { ruido(0.05, 0.12, 6000, i * 0.04); bipe('square', 620 + i * 60, 300, 0.07, 0.03, i * 0.04); } break;
        // teleguiado: um assobio que desce, como míssil de desenho
        case 'teleguiado': bipe('sine', 1800, 500, 0.7, 0.09); bipe('sine', 1830, 510, 0.7, 0.05); break;
        case 'naves':      for (let i = 0; i < 4; i++) bipe('triangle', 700 + i * 90, 400, 0.13, 0.045, i * 0.07); break;
        // maré: onda — ruído largo que cresce e rebenta
        case 'mare':       ruido(1.0, 0.18, 500); ruido(0.5, 0.1, 3000, 0.4); bipe('sine', 150, 60, 0.9, 0.08); break;
        // elevadores: catraca de engrenagem e o 'ding' grave de chegada
        case 'elevadores': for (let i = 0; i < 6; i++) ruido(0.03, 0.14, 2200, i * 0.06); bipe('sine', 660, 660, 0.4, 0.09, 0.38); break;
        default:           bipe('square', 400, 200, 0.2, 0.05);
    }
}

export function tocarDano(): void { vibrar(45); abaixarMusica(0.8); ruido(0.08, 0.2, 6000); bipe('triangle', 1900, 1500, 0.2, 0.05); ruido(0.32, 0.22, 900); bipe('sawtooth', 240, 70, 0.34, 0.10); }
// Explosão em camadas: estalo, corpo grave, destroços e um eco atrasado.
export function tocarExplosao(): void {
    ruido(0.05, 0.25, 7000);
    bipe('sine', 110, 34, 0.55, 0.22);
    ruido(0.6, 0.26, 1200); bipe('sawtooth', 180, 40, 0.6, 0.1);
    ruido(0.35, 0.08, 3000, 0.12);                      // chapa raspando
    ruido(0.4, 0.07, 900, 0.28);                        // o eco
}
export function tocarFalaDoIrmao(): void { bipe('square', 300, 380, 0.05, 0.035); }

/** O elevador virando avião: metal se desdobrando. */
export function tocarDesdobrar(): void {
    for (let i = 0; i < 6; i++) bipe('square', 160 + i * 55, 90 + i * 30, 0.12, 0.05, i * 0.12);
    ruido(0.5, 0.14, 2200, 0.5);
}
// O ding do elevador fica em OUTRA altura (mi–dó): 1320/990 é do aviso de ataque,
// e tocar o aviso na chegada ensinava "perigo" onde não havia nenhum.
export function tocarDing(): void { bipe('triangle', 1318.5, 1318.5, 0.2, 0.08); bipe('triangle', 1046.5, 1046.5, 0.5, 0.07, 0.12); }

export function tocarVitoria(): void {
    [523, 659, 784, 1047].forEach((f, i) => bipe('square', f, f, 0.22, 0.07, i * 0.13));
}
export function tocarDerrota(): void {
    [392, 330, 262, 196].forEach((f, i) => bipe('sawtooth', f, f * 0.94, 0.3, 0.07, i * 0.17));
}

// ── A MÚSICA DA LUTA ─────────────────────────────────────────────────────────
// Sintetizada também, pelo mesmo motivo dos tiros: nada de baixar arquivo no
// celular. Uma marcha em ré menor a 144 bpm — bumbo, caixa, baixo pulsando em
// colcheias e um arpejo por cima. Passada a virada ela ENDURECE: entra o chimbal
// em semicolcheias e o arpejo sobe uma oitava. O relógio é o do AudioContext,
// agendado com folga (o padrão "lookahead"), então um quadro lento no celular
// não atrasa nota nenhuma.
const BPM = 144, SEMI = 60 / BPM / 4;
// Progressão Dm – Bb – C – A, uma por compasso; graus em Hz da fundamental.
const FUNDAMENTAIS = [73.42, 58.27, 65.41, 55.0];
const ARPEJO = [0, 3, 7, 12, 7, 3, 0, 7];        // semitons: menor com oitava
let musica: { id: number; passo: number; proxima: number; bus: GainNode; duck: GainNode; duckAte: number; forte: boolean; pedidoForte: boolean; pausa: number; rampa: number } | null = null;

function nota(tipo: OscillatorType, f: number, t: number, dur: number, vol: number, corte: number, d: AudioNode): void {
    const c = ctx!;
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = tipo; o.frequency.setValueAtTime(f, t);
    fl.type = 'lowpass'; fl.frequency.value = corte;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(d);
    o.start(t); o.stop(t + dur + 0.03);
}
function bumbo(t: number, d: AudioNode): void {
    const c = ctx!, o = c.createOscillator(), g = c.createGain();
    // 120→70 Hz e um estalo por cima: a 140→40 Hz o bumbo sumia no alto-falante do celular.
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    chiado(t, 0.012, 0.18, 2500, 'bandpass', d);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.25);
}
// Um buffer de ruído só, reaproveitado: criar um por chimbal gerava lixo para o
// coletor a cada semicolcheia, em plena luta.
let ruidoBase: AudioBuffer | null = null;
function chiado(t: number, dur: number, vol: number, corte: number, tipo: BiquadFilterType, d: AudioNode): void {
    const c = ctx!;
    if (!ruidoBase || ruidoBase.sampleRate !== c.sampleRate) {
        const n = Math.floor(c.sampleRate * 0.5);
        ruidoBase = c.createBuffer(1, n, c.sampleRate);
        const x = ruidoBase.getChannelData(0);
        for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = ruidoBase; f.type = tipo; f.frequency.value = corte;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(d); s.start(t); s.stop(t + dur + 0.02);
}
function agendar(): void {
    const m = musica, c = ctx;
    if (!m || !c) return;
    // 0,3 s de folga: um quadro travado de até 300 ms no celular não engasga a música.
    while (m.proxima < c.currentTime + 0.3) {
        const t = m.proxima;
        if (m.pausa > 0) { m.pausa--; m.proxima += SEMI; if (m.pausa === 0) { m.passo = 0; m.forte = m.pedidoForte; acordeDeOrgao(m.proxima, m.bus); } continue; }
        const p = m.passo % 64, compasso = Math.floor(p / 16), s = p % 16;
        // Depois da virada tudo sobe uma terça menor: a mesma marcha, mais aflita.
        const raiz = FUNDAMENTAIS[compasso] * (m.forte ? Math.pow(2, 3 / 12) : 1);
        // O TEMA DO CHEFE: a campainha do balcão (ré–lá–fá–ré) nos compassos
        // 1 e 3, em sino. É a assinatura — o mesmo desenho do telégrafo.
        if (compasso % 2 === 0 && s % 2 === 0 && s < 8) {
            const graus = [0, 7, 3, 0];
            // Em triângulo e uma oitava abaixo do sino do aviso: parente, não gêmeo —
            // o jogador aprende "sino agudo = ataque" sem a música confundir.
            nota('triangle', raiz * 4 * Math.pow(2, graus[s / 2] / 12), t, SEMI * 2.6, 0.08, 2200, m.bus);
        }
        // O ÓRGÃO DO SAGUÃO: acorde sustentado a cada compasso (fundamental,
        // terça, quinta), baixinho — é o "hotel grande" por trás da marcha.
        if (s === 0) for (const semi of [0, compasso === 3 ? 4 : 3, 7])
            nota('sawtooth', raiz * 2 * Math.pow(2, semi / 12), t, SEMI * 15.5, 0.06, 900, m.bus);
        // Na segunda forma entra um contracanto nos compassos 2 e 4.
        if (m.forte && compasso % 2 === 1 && s % 4 === 0) {
            const graus = [12, 10, 7, 5];
            nota('square', raiz * 4 * Math.pow(2, graus[s / 4] / 12), t, SEMI * 3.5, 0.065, 1800, m.bus);   // alto o bastante para o celular ouvir a virada
        }
        if (s % 4 === 0) bumbo(t, m.bus);
        if (s === 4 || s === 12) chiado(t, 0.14, 0.22, 1800, 'bandpass', m.bus);
        if (s % 2 === 0) nota('sawtooth', raiz * (s % 4 === 2 ? 2 : 1), t, SEMI * 1.8, 0.16, 420, m.bus);
        if (s % 2 === 1 || m.forte) {
            const semi = ARPEJO[(s >> (m.forte ? 0 : 1)) % ARPEJO.length];
            nota('square', raiz * 4 * (m.forte ? 2 : 1) * Math.pow(2, semi / 12), t, SEMI * 0.9, m.forte ? 0.035 : 0.045, 2600, m.bus);
        }
        if (m.forte) chiado(t, 0.035, s % 4 === 2 ? 0.14 : 0.08, 7000, 'highpass', m.bus);
        // Depois da virada a marcha acelera (144 → 154 bpm, em rampa de um compasso).
        m.passo++; m.rampa = m.forte ? Math.min(1, m.rampa + 1 / 16) : 0;
        m.proxima += SEMI * (1 - m.rampa * (1 - 144 / 154));
    }
}
export function iniciarMusica(): void {
    const c = ctx, d = saida();
    if (!c || !d || musica) return;
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.exponentialRampToValueAtTime(0.36, c.currentTime + 1.2);   // abaixo dos tiros: o jogo fala primeiro
    // O abaixar vive num nó próprio: o volume da música e o "sai da frente"
    // dos avisos não brigam pelo mesmo parâmetro.
    const duck = c.createGain(); duck.gain.value = 1;
    bus.connect(duck); duck.connect(d);
    // O SAGUÃO: um reverb curto (resposta de ruído decaindo, gerada aqui)
    // em paralelo, baixo. Tira a marcha da caixinha e põe num salão.
    const sala = c.createConvolver(), n = Math.floor(c.sampleRate * 1.6);
    const ir = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    sala.buffer = ir;
    const molhado = c.createGain(); molhado.gain.value = .22;
    bus.connect(sala); sala.connect(molhado); molhado.connect(duck);
    musica = { id: 0, passo: 0, proxima: c.currentTime + 0.1, bus, duck, duckAte: 0, forte: false, pedidoForte: false, pausa: 0, rampa: 0 };
    musica.id = window.setInterval(agendar, 40);
    agendar();
}
/**
 * A virada não troca a música no meio do compasso (soava como defeito): ela
 * fica pedida e entra no próximo tempo forte do ciclo, depois de um compasso
 * de silêncio para o rugido respirar.
 */
export function musicaDaVirada(forte: boolean): void {
    if (!musica) return;
    if (!forte) { musica.forte = musica.pedidoForte = false; return; }
    if (!musica.forte && !musica.pedidoForte) { musica.pedidoForte = true; musica.pausa = 16; }
}
/** Abaixa a música 6 dB por `dur` segundos (no máximo 1,5 s seguidos), para um aviso ou um dano passar. */
export function abaixarMusica(dur: number): void {
    const m = musica, c = ctx;
    if (!m || !c) return;
    // Pedidos sobrepostos ESTENDEM o abaixar em vez de cortar o anterior.
    const t = c.currentTime;
    // Teto de 1,5 s: numa sequência de danos a música não pode sumir de vez.
    const ate = Math.min(t + 1.5, Math.max(m.duckAte, t + dur));
    m.duckAte = ate;
    const g = m.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    // -3 dB: com cinco ataques em ciclo, -6 dB deixava a marcha sempre caindo.
    g.linearRampToValueAtTime(0.7, t + 0.15);
    g.setValueAtTime(0.7, ate);
    g.setTargetAtTime(1, ate, 0.13);                       // volta exponencial ~400 ms
}
export function pararMusica(fade = 0.8): void {
    const m = musica, c = ctx;
    musica = null;
    if (!m) return;
    window.clearInterval(m.id);
    if (!c) return;
    m.bus.gain.cancelScheduledValues(c.currentTime);
    m.bus.gain.setValueAtTime(m.bus.gain.value, c.currentTime);
    m.bus.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + fade);
    window.setTimeout(() => { m.bus.disconnect(); m.duck.disconnect(); }, fade * 1000 + 100);
}
/** O rugido da virada: ruído grave subindo e um serrote descendo, juntos. */
export function tocarRugido(): void {
    ruido(1.4, 0.35, 500); ruido(0.9, 0.2, 2400, 0.2);
    bipe('sawtooth', 110, 38, 1.3, 0.16); bipe('sawtooth', 164, 55, 1.1, 0.1, 0.12);
}

/** O acorde que abre a segunda forma: órgão de saguão, grave e cheio. */
function acordeDeOrgao(t: number, d: AudioNode): void {
    const raiz = FUNDAMENTAIS[0] * Math.pow(2, 3 / 12);
    for (const [semi, v] of [[-12, .12], [0, .1], [3, .08], [7, .08], [12, .05]] as const)
        nota('sawtooth', raiz * 2 * Math.pow(2, semi / 12), t, 2.4, v, 1400, d);
}
/**
 * A cabeça morrendo. Era o mesmo estouro de uma camareira abatida — o chefe
 * merece peso: um mergulho sub-grave, ruído longo que abre e fecha e, por
 * cima, a campainha do balcão desafinando até parar. O hotel fechou.
 */
export function tocarMorteDoChefe(): void {
    ruido(2.4, 0.35, 700); ruido(1.2, 0.2, 3500, 0.25);
    bipe('sine', 90, 24, 2.2, 0.3); bipe('sawtooth', 120, 30, 1.8, 0.1, 0.1);
    bipe('sine', 1320, 700, 1.6, 0.08, 0.5); bipe('sine', 990, 480, 1.9, 0.06, 0.8);
}

/** O tiro carregado acertando: campainha grave + baque — a recompensa soa diferente. */
export function tocarAcertoCarregado(): void {
    vibrar(25);
    bipe('sine', 660, 660, 0.6, 0.14); bipe('triangle', 1320, 1250, 0.4, 0.07);
    bipe('sine', 110, 40, 0.5, 0.22); ruido(0.25, 0.18, 2500);
}
/** O irmão tomando um tiro: clanc curto e um bipe de robô, mais baixo, sem abaixar a música. */
export function tocarDanoIrmao(): void {
    ruido(0.06, 0.08, 4000); bipe('square', 480, 380, 0.12, 0.035, 0.05);
}

/** A rajada acabou de encher: um tique curto de latão e um toque na mão. */
export function tocarRajadaPronta(): void {
    vibrar(12);
    bipe('triangle', 1760, 1760, 0.09, 0.06); bipe('triangle', 2637, 2637, 0.12, 0.05, 0.07);
}
