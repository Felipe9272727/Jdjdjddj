// ── O RELÓGIO INTERNO DO NILO ─────────────────────────────────────────────
// Por que este arquivo existe: as vontades dele SÓ SUBIAM.
//
//   social     += 0.014/s   (sempre)
//   curiosity  += 0.007/s   (sempre)
//
// Partindo de 0.62, `social` chega ao teto 1.0 em meio minuto e FICA. Em dois
// minutos de jogo todos os desejos estão saturados, a tabela de utilidade passa
// a devolver sempre a mesma ordem, e o Nilo vira um homem de humor único. Era
// isso o "as vontades dele são fixas".
//
// Aqui elas ganham três coisas que gente tem:
//   1. HOMEOSTASE — cada desejo puxa de volta para uma linha de base em vez de
//      encostar no teto e morar lá.
//   2. HORA DO DIA — a linha de base muda ao longo do dia. De madrugada ele
//      está exausto e menos sociável; de tarde, inquieto. É a mesma pessoa em
//      horas diferentes, não pessoas diferentes.
//   3. DERIVA LENTA — um passeio aleatório de período longo, para que duas
//      terças-feiras às 15h não sejam idênticas.
//
// Módulo PURO: sem three, sem react, sem relógio implícito. A hora entra por
// parâmetro para o teste poder percorrer o dia inteiro em milissegundos.

import type { Floor10WillDrives } from './floor10Will';

export type Floor10DayPhase = 'madrugada' | 'manha' | 'tarde' | 'noite';

export type Floor10Clock = {
    /** 0..23.999 — hora local de quem está jogando. */
    hour: number;
    phase: Floor10DayPhase;
    /** Como o Nilo chamaria esta hora, para a bolha e para o prompt. */
    label: string;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function dayPhase(hour: number): Floor10DayPhase {
    const h = ((hour % 24) + 24) % 24;
    if (h < 5) return 'madrugada';
    if (h < 12) return 'manha';
    if (h < 18) return 'tarde';
    return 'noite';
}

const PHASE_LABEL: Record<Floor10DayPhase, string> = {
    madrugada: 'de madrugada',
    manha: 'de manhã',
    tarde: 'de tarde',
    noite: 'de noite',
};

export function readClock(now = new Date()): Floor10Clock {
    const hour = now.getHours() + now.getMinutes() / 60;
    const phase = dayPhase(hour);
    return { hour, phase, label: PHASE_LABEL[phase] };
}

/**
 * Para onde cada desejo tende NESTA hora.
 *
 * Não são degraus por faixa: um degrau faria o Nilo virar outra pessoa às 18h01.
 * São senoides com picos escolhidos, então a mudança é contínua — às 17h ele já
 * está ficando cansado, não cansa de uma vez.
 *
 * Picos: social 20h (a hora em que a falta de gente pesa), curiosity 10h,
 * restlessness 15h (a tarde não passa), fatigue 3h.
 */
export function circadianBaseline(hour: number): Floor10WillDrives {
    const onda = (pico: number, amplitude: number, base: number) =>
        clamp01(base + amplitude * Math.cos(((hour - pico) / 24) * 2 * Math.PI));
    return {
        social: onda(20, 0.3, 0.5),
        curiosity: onda(10, 0.26, 0.5),
        restlessness: onda(15, 0.28, 0.45),
        // A fadiga é a mais forte: de madrugada ele mal se sustenta.
        fatigue: onda(3, 0.34, 0.4),
    };
}

/** Velocidade com que um desejo caminha para o alvo do momento. */
const RETORNO = 0.05;

export type DriveContext = {
    hour: number;
    /** O jogador está à vista? Ver gente mexe com quem passou anos sozinho. */
    playerVisible: boolean;
    /** O elevador está à vista? */
    elevatorVisible: boolean;
    /** O corpo está andando agora? */
    moving: boolean;
    /** A meta atual — é ela que SACIA o desejo correspondente. */
    goal: string;
    /** Fase lenta da deriva de personalidade, em segundos acumulados. */
    driftSeconds: number;
};

/** Qual desejo cada meta alimenta. Servir a vontade é o que a esvazia. */
const SACIA: Record<string, keyof Floor10WillDrives> = {
    'talk-player': 'social',
    'approach-player': 'social',
    'observe-player': 'social',
    'seek-player': 'social',
    'inspect-elevator': 'curiosity',
    'wander': 'restlessness',
    'make-space': 'restlessness',
    'idle': 'fatigue',
    'sleep': 'fatigue',
};

/**
 * TUDO É ALVO, nada é soma.
 *
 * Minha primeira versão somava a pressão do que ele vê (+0,03/s) por cima da
 * homeostase. Só que perto do alvo a homeostase puxa fraco, então a soma
 * ganhava e o desejo encostava em 1,0 — exatamente o defeito que este arquivo
 * existe para consertar, reintroduzido por mim na mesma função. Medido no
 * teste: meia hora com o jogador à vista e social = 1,0.
 *
 * Agora ver o jogador MOVE O ALVO para cima; quem caminha é sempre a
 * homeostase. Assim nenhuma influência pode empurrar além do próprio alvo, e o
 * teto deixa de ser alcançável por acúmulo.
 */
function alvoAtual(ctx: DriveContext): Floor10WillDrives {
    const base = circadianBaseline(ctx.hour);
    // Deriva lenta: uma volta a cada ~40 min, defasada por desejo, para os
    // quatro nunca subirem juntos.
    const deriva = (fase: number) => 0.06 * Math.sin(ctx.driftSeconds / 380 + fase);
    const alvo: Floor10WillDrives = {
        social: base.social + deriva(0),
        curiosity: base.curiosity + deriva(1.6),
        restlessness: base.restlessness + deriva(3.1),
        fatigue: base.fatigue + deriva(4.7),
    };
    if (ctx.playerVisible) alvo.social += 0.25;
    if (ctx.elevatorVisible) alvo.curiosity += 0.15;
    // Andar cansa e acalma; ficar parado descansa e dá formigamento.
    alvo.fatigue += ctx.moving ? 0.2 : -0.15;
    alvo.restlessness += ctx.moving ? -0.25 : 0.2;
    // E a ação em curso puxa para baixo o desejo que ela serve.
    const saciado = SACIA[ctx.goal];
    if (saciado) alvo[saciado] -= 0.35;
    // Faixa VIVA, não 0..1. Um desejo cravado em zero é tão fixo quanto um
    // cravado em 1: ele nunca mais disputa nada e sai de cena. Deixando uma
    // borda dos dois lados, qualquer um deles pode voltar a ganhar quando a
    // hora virar — que é o ponto deste arquivo.
    const naFaixa = (v: number) => Math.max(0.05, Math.min(0.95, v));
    return {
        social: naFaixa(alvo.social),
        curiosity: naFaixa(alvo.curiosity),
        restlessness: naFaixa(alvo.restlessness),
        fatigue: naFaixa(alvo.fatigue),
    };
}

/**
 * Um passo do relógio interno. Devolve desejos NOVOS — nada é mutado aqui.
 */
export function stepDrives(
    atual: Floor10WillDrives,
    ctx: DriveContext,
    dt: number,
): Floor10WillDrives {
    const passo = Math.max(0, Math.min(0.25, dt));
    const alvo = alvoAtual(ctx);
    const mover = (de: number, para: number) =>
        clamp01(de + (para - de) * Math.min(1, RETORNO * passo));
    return {
        social: mover(atual.social, alvo.social),
        curiosity: mover(atual.curiosity, alvo.curiosity),
        restlessness: mover(atual.restlessness, alvo.restlessness),
        fatigue: mover(atual.fatigue, alvo.fatigue),
    };
}

/**
 * Como o Nilo descreveria o próprio estado agora. Vira uma linha do prompt do
 * cérebro pequeno: sem isto ele recebe números e nenhuma noção de que é 3 da
 * manhã — e a hora não influencia nada do que ele escolhe pensar.
 */
export function describeMood(drives: Floor10WillDrives, clock: Floor10Clock): string {
    const forte = (v: number) => v >= 0.66;
    const fraco = (v: number) => v <= 0.34;
    const partes: string[] = [];
    if (forte(drives.fatigue)) partes.push('worn out');
    else if (fraco(drives.fatigue)) partes.push('rested');
    if (forte(drives.social)) partes.push('starved for company');
    else if (fraco(drives.social)) partes.push('fine on your own');
    if (forte(drives.restlessness)) partes.push('unable to sit still');
    if (forte(drives.curiosity)) partes.push('itching to poke at something');
    const estado = partes.length ? partes.join(', ') : 'level';
    return `TIME: it is ${clock.hour < 10 ? '0' : ''}${Math.floor(clock.hour)}h `
        + `(${clock.phase}). You feel ${estado}.`;
}
