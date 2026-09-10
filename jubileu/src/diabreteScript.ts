/**
 * diabreteScript.ts — the lines the Diabrete throws at the player the moment the
 * Floor 3 elevator doors open, before he dashes off to sabotage the climb.
 *
 * Shared by the 3D performer (Floor3Cutscene.tsx — reads `gesture` to animate
 * the bones) and the DOM bubbles (Floor3CutsceneUI.tsx — reads `text`), so the
 * mouth and the words stay in lock-step. Each line carries its own duration so
 * punchy taunts snap by and the big threats linger.
 */

export type Gesture = 'idle' | 'point' | 'laugh' | 'lean' | 'throw' | 'taunt' | 'dash';

export interface Line {
    speaker: 'diabrete' | 'player';
    text: string;
    dur: number;       // seconds on screen
    gesture: Gesture;  // how the 3D performer acts this beat
}

export const DIABRETE_SCRIPT: Line[] = [
    { speaker: 'diabrete', text: 'Olha só o que o elevador cuspiu! Carne fresca pra minha pista de obstáculos!', dur: 3.6, gesture: 'taunt' },
    { speaker: 'player',   text: 'Que… que diabo é você?',                                  dur: 2.2, gesture: 'idle' },
    { speaker: 'diabrete', text: 'DIABO é meu sobrenome, gracinha! Pode chamar de DIABRETE!', dur: 3.4, gesture: 'point' },
    { speaker: 'diabrete', text: 'Essa escadaria maluca é MINHA. Cada plataforma eu que rabisco, no traço!', dur: 3.8, gesture: 'lean' },
    { speaker: 'diabrete', text: 'E adivinha? Vou desenhar o teu fracasso, degrau por degrau!', dur: 3.6, gesture: 'throw' },
    { speaker: 'diabrete', text: 'Bora apostar corrida? Eu na frente, tu comendo a minha poeira!', dur: 3.6, gesture: 'taunt' },
    { speaker: 'diabrete', text: 'HÁ! Me alcança, perna-curta… SE FOR CAPAZ! HAHAHA!',       dur: 3.2, gesture: 'laugh' },
    { speaker: 'diabrete', text: 'Só num CONTA: sem os meus PINCÉIS eu não rabisco nada. Rouba os TRÊS e a brincadeira ACABA… mas tu nem é rápido o bastante, né?', dur: 4.4, gesture: 'point' },
    { speaker: 'diabrete', text: 'Até já… ou nunca! WHOOSH!',                                 dur: 1.8, gesture: 'dash' },
];

export const SCRIPT_TOTAL = DIABRETE_SCRIPT.reduce((s, l) => s + l.dur, 0);

/** The line index active at elapsed time `t` (seconds). -1 before the start. */
export function lineAt(t: number): number {
    let acc = 0;
    for (let i = 0; i < DIABRETE_SCRIPT.length; i++) {
        acc += DIABRETE_SCRIPT[i].dur;
        if (t < acc) return i;
    }
    return DIABRETE_SCRIPT.length - 1;
}

/**
 * Onde a fala `i` começa, em segundos desde o início da cena.
 *
 * Existe para a BANCADA poder parar a cutscene numa fala e fotografá-la. A
 * apresentação se dirige por relógio interno (ao contrário da queda, que recebe
 * a fala como prop), então sem isto o único jeito de ver a fala 7 era esperar a
 * cena inteira chegar lá — num navegador de bancada a ~2 fps, o que na prática
 * significa nunca ver. Ver `?f3preview&fala=N`.
 */
export function inicioDaFala(i: number): number {
    let acc = 0;
    for (let k = 0; k < Math.min(i, DIABRETE_SCRIPT.length); k++) acc += DIABRETE_SCRIPT[k].dur;
    return acc;
}

/** Seconds into the current line (for per-line ease-in animation). */
export function timeInLine(t: number): number {
    let acc = 0;
    for (const l of DIABRETE_SCRIPT) {
        if (t < acc + l.dur) return t - acc;
        acc += l.dur;
    }
    return 0;
}
