/**
 * f4Lore.ts — shared mutable state + rules for the Floor 4 lore/puzzle layer
 * (pattern mirrors f3Hazards.ts: a pure module the React layers read/write).
 *
 * THE ARC (one chain, each beat hands you the next — never "creator-only"):
 *   arrive in the DARK → first steps: the Zelador runs past, PADLOCKS the exit
 *   and dives into the floor hole → follow him DOWN → the basement GENERATOR
 *   (3 down, 1 up — the dying light's rhythm) → power returns, the lobby wakes
 *   → the reception BELL + the 4 tally marks (finish the 5th ring) → the guest
 *   of room 404 RISES, holding his reservation slip ("QUARTO 404 — NÃO
 *   ENCONTRADO") → the safe behind the crooked picture (code 404) yields the
 *   MASTER KEY → unlock the exit → walk into the BREU and find the FIRST
 *   RECEPTIONIST — hurt, one-eyed, full dialogue with questions → he hands
 *   page 5 → "VOCÊ LEMBROU DO ANDAR 4".
 *
 * Three ROOMS: 'lobby' (the wrecked saguão), 'basement' (generator), 'beyond'
 * (pitch black, the keeper's fire). Transitions via interaction points.
 *
 * Pure TS (no three/DOM) → unit-tested in __tests__/f4Lore.test.ts.
 */

// ── Generator pattern: the dying fluorescent isn't broken — it's insisting.
// 0 = short blink (lever DOWN), 1 = long blink (lever UP). Startup rhythm.
export const F4_LIGHT_PATTERN: ReadonlyArray<0 | 1> = [0, 0, 0, 1];

export const F4_SAFE_CODE = '404';          // the room that doesn't exist
export const F4_BELL_RINGS = 5;             // finish the guest's 5th tally
const BELL_MAX_GAP_MS = 1500;               // rings must be consecutive

export type F4Room = 'lobby' | 'basement' | 'beyond';

export interface F4State {
    version: number;                          // bumped on every change (UI re-render)
    room: F4Room;
    spawnX: number;                           // where the player lands after a room change
    spawnToken: number;                       // bumped per transition (player consumes it)
    runnerActive: boolean;                    // the Zelador cinematic is playing
    runnerSeen: boolean;                      // ...and has finished
    powerOn: boolean;                         // generator solved → the lobby wakes
    bellSolved: boolean;                      // 5 rings → the guest rises
    skeletonRisen: boolean;                   // rise animation finished
    codeTaken: boolean;                       // took the reservation slip (knows 404)
    safeSolved: boolean;                      // safe open → MASTER KEY (+ photo + page 4)
    doorUnlocked: boolean;                    // used the key on the exit
    metKeeper: boolean;                       // reached the first receptionist
    asked: Record<string, boolean>;           // keeper questions already asked
    autoTalk: boolean;                        // creator jump: open the dialogue on arrival
    pages: boolean[];                         // 5 diary pages collected
    finished: boolean;                        // read page 5 → "VOCÊ LEMBROU DO ANDAR 4"
    levers: (0 | 1)[];                        // generator levers (1 = up)
    bellCount: number;                        // consecutive rings so far
    lastRingAt: number;                       // ms timestamp of the last ring
}

export const f4: F4State = {
    version: 0,
    room: 'lobby',
    spawnX: -8,
    spawnToken: 0,
    runnerActive: false,
    runnerSeen: false,
    powerOn: false,
    bellSolved: false,
    skeletonRisen: false,
    codeTaken: false,
    safeSolved: false,
    doorUnlocked: false,
    metKeeper: false,
    asked: {},
    autoTalk: false,
    pages: [false, false, false, false, false],
    finished: false,
    levers: [1, 0, 1, 0],                     // scrambled start (≠ pattern)
    bellCount: 0,
    lastRingAt: 0,
};

/** Camera override channel (the runner cinematic steers the camera). Not part
 *  of versioned state — written per-frame by the scene, read by the player. */
export const f4Cam = { override: null as number | null };

let onChange: (() => void) | null = null;
/** UI subscribes to be re-rendered on state changes (one listener is enough). */
export function f4SetOnChange(cb: (() => void) | null): void { onChange = cb; }
function bump(): void { f4.version++; onChange?.(); }

export function f4Reset(): void {
    f4.room = 'lobby'; f4.spawnX = -8; f4.spawnToken = 0;
    f4.runnerActive = false; f4.runnerSeen = false;
    f4.powerOn = false; f4.bellSolved = false;
    f4.skeletonRisen = false; f4.codeTaken = false;
    f4.safeSolved = false; f4.doorUnlocked = false;
    f4.metKeeper = false; f4.asked = {};
    f4.autoTalk = false;
    f4.pages = [false, false, false, false, false];
    f4.finished = false;
    f4.levers = [1, 0, 1, 0];
    f4.bellCount = 0; f4.lastRingAt = 0;
    f4Cam.override = null;
    bump();
}

export const f4PagesCollected = (): number => f4.pages.filter(Boolean).length;

// ── Rooms ─────────────────────────────────────────────────────────────────────
export interface F4Bounds { left: number; right: number }
const BOUNDS: Record<F4Room, F4Bounds> = {
    lobby: { left: -13, right: 15.2 },
    basement: { left: -8.5, right: 10.0 },
    beyond: { left: -1.0, right: 11.0 },
};
export function f4Bounds(): F4Bounds { return BOUNDS[f4.room]; }

export function f4GoRoom(room: F4Room, spawnX: number): void {
    f4.room = room;
    f4.spawnX = spawnX;
    f4.spawnToken++;
    bump();
}

// ── The Zelador (scripted runner) ─────────────────────────────────────────────
/** First steps out of the elevator trigger the cinematic (once). */
export function f4TriggerRunner(): boolean {
    if (f4.runnerSeen || f4.runnerActive || f4.room !== 'lobby') return false;
    f4.runnerActive = true;
    bump();
    return true;
}
/** Scene calls this when the cinematic ends (he dove into the hole). */
export function f4RunnerDone(): void {
    if (!f4.runnerActive) return;
    f4.runnerActive = false;
    f4.runnerSeen = true;
    f4Cam.override = null;
    bump();
}

// ── Pages ─────────────────────────────────────────────────────────────────────
export function f4CollectPage(i: number): boolean {
    if (i < 0 || i > 4 || f4.pages[i]) return false;
    f4.pages[i] = true;
    bump();
    return true;
}
/** Reading page 5 closes the arc. */
export function f4FinishIfLastPage(i: number): boolean {
    if (i === 4 && !f4.finished) { f4.finished = true; bump(); return true; }
    return false;
}

// ── P1: the generator (basement) ──────────────────────────────────────────────
export function f4SetLever(i: number, up: 0 | 1): 'flip' | 'solved' | 'noop' {
    if (f4.powerOn || i < 0 || i >= f4.levers.length) return 'noop';
    f4.levers[i] = up;
    if (F4_LIGHT_PATTERN.every((p, k) => f4.levers[k] === p)) {
        f4.powerOn = true;
        bump();
        return 'solved';
    }
    bump();
    return 'flip';
}

// ── P2: the bell (the guest's 5th tally) ──────────────────────────────────────
export function f4RingBell(nowMs: number): 'ring' | 'solved' | 'dead' {
    if (f4.bellSolved) return 'dead';                  // still dings, no event
    f4.bellCount = nowMs - f4.lastRingAt <= BELL_MAX_GAP_MS ? f4.bellCount + 1 : 1;
    f4.lastRingAt = nowMs;
    if (f4.bellCount >= F4_BELL_RINGS) {
        f4.bellSolved = true;
        bump();
        return 'solved';
    }
    bump();
    return 'ring';
}
/** Scene calls this when the rise animation finishes (the slip is offered). */
export function f4SkeletonRisen(): void {
    if (f4.skeletonRisen || !f4.bellSolved) return;
    f4.skeletonRisen = true;
    bump();
}
export function f4TakeCode(): boolean {
    if (!f4.skeletonRisen || f4.codeTaken) return false;
    f4.codeTaken = true;
    bump();
    return true;
}

// ── P3: the safe (master key) ─────────────────────────────────────────────────
export function f4TrySafe(code: string): boolean {
    if (f4.safeSolved) return true;
    if (code === F4_SAFE_CODE) { f4.safeSolved = true; bump(); return true; }
    return false;
}

// ── The exit door ─────────────────────────────────────────────────────────────
export function f4UseDoor(): 'locked' | 'unlock' | 'enter' {
    if (f4.doorUnlocked) return 'enter';
    if (f4.safeSolved) { f4.doorUnlocked = true; bump(); return 'unlock'; }
    return 'locked';
}

// ── The first receptionist (the keeper in the breu) ───────────────────────────
export interface F4Dialog { id: string; q: string; a: string; final?: boolean }
// O tom dele é o OPOSTO do Zelador: calmo, gentil, cansado. Falas CURTAS —
// duas, três frases — cada uma com um espinho dentro.
export const F4_KEEPER_DIALOG: ReadonlyArray<F4Dialog> = [
    {
        id: 'who', q: 'Quem é você?',
        a: 'Fui o primeiro recepcionista deste hotel. Quando decidiram esquecer este andar, alguém precisava ficar pra lembrar dele por dentro. Eu fiquei.',
    },
    {
        id: 'eye', q: 'O que aconteceu com o seu olho?',
        a: 'O teto, na noite em que levaram o chão. Não doeu como você imagina — o que dói é o olho que ficou: ele enxerga tudo o que falta.',
    },
    {
        id: 'floor', q: 'O que aconteceu com este andar?',
        a: 'O prédio vive de memória. Tiraram o 4 dos botões, dos mapas, das conversas… e o que ninguém lembra se desmonta sozinho. Eu vi acontecer devagar. É pior devagar.',
    },
    {
        id: 'runner', q: 'Quem trancou a porta?',
        a: 'O Zelador. Ele prega, tranca, apaga — faz a manutenção do esquecimento. Um dia ele foi alguém daqui, como eu. O sorriso é só o que sobrou do rosto dele.',
    },
    {
        id: 'guest', q: 'Tinha um esqueleto na recepção…',
        a: 'O hóspede do 404. Esperou anos pelo atendimento, riscando o balcão. Hoje você completou o quinto risco — fez por ele o que eu nunca tive coragem. Obrigado.',
    },
    {
        id: 'elevator', q: 'Por que o elevador ainda funciona?',
        a: 'Máquina não esquece — guarda o caminho no ferro, não na cabeça. Repara: é a única coisa intacta do andar. Aqui, ser lembrado é ser cuidado.',
    },
    {
        id: 'leave', q: 'Como eu saio daqui?', final: true,
        a: 'Pela porta você só volta. Quem desce é o elevador. Antes… leva a última página do meu diário. E não deixa este andar virar silêncio de novo.',
    },
];

/** Talk to the keeper (marks the meeting); ask marks a question. The final
 *  question hands over page 5 (collect handled by the UI's read panel). */
export function f4MeetKeeper(): void {
    if (!f4.metKeeper) { f4.metKeeper = true; bump(); }
}
export function f4AskKeeper(id: string): F4Dialog | null {
    const d = F4_KEEPER_DIALOG.find((x) => x.id === id) ?? null;
    if (!d) return null;
    if (!f4.asked[id]) { f4.asked[id] = true; bump(); }
    return d;
}

// ── Diary (the first receptionist's own hand — each page TEACHES its puzzle) ──
export const F4_DIARY: ReadonlyArray<{ title: string; text: string }> = [
    {
        title: 'PÁGINA 1 — DIÁRIO DO RECEPCIONISTA',
        text: 'Dia 1. O elevador parou de atender o quarto andar. O supervisor novo sorriu e disse pra eu não me preocupar. Todos os supervisores sorriem igual. Eu era o primeiro recepcionista deste hotel. Alguém tinha que ficar.',
    },
    {
        title: 'PÁGINA 2 — DIÁRIO DO RECEPCIONISTA',
        text: 'Dia 9. Cortaram a força do andar inteiro, mas o GERADOR do subsolo ainda vira. Eu testei de madrugada. A partida é um ritmo: três curtas e uma LONGA. Liguei a lâmpada de emergência na bateria pra piscar isso até hoje. Ela lembra por mim.',
    },
    {
        title: 'PÁGINA 3 — DIÁRIO DO RECEPCIONISTA',
        text: 'Dia 23. O hóspede do 404 ainda espera na recepção. Toca o sino e risca o balcão a cada tentativa. Quatro riscos. O quinto ele nunca termina — interrompem sempre. Se alguém completar a chamada dele, talvez ele descanse.',
    },
    {
        title: 'PÁGINA 4 — DIÁRIO DO RECEPCIONISTA',
        text: 'Dia 40. Guardei a CHAVE-MESTRA no cofre atrás do quadro torto. A senha é o número que o prédio jura que não existe. Se o Zelador trancar a saída de novo, é ela que abre.',
    },
    {
        title: 'PÁGINA 5 — DIÁRIO DO RECEPCIONISTA',
        text: 'Dia ???. Os riscos na parede não batem com as minhas memórias. Se você está lendo: LEMBRE deste andar. É só disso que ele precisa. O elevador ainda sobe. Ele lembra.',
    },
];

// ── Interaction points (positions live HERE so scene + UI agree) ──────────────
export type F4PointKind =
    | 'examine' | 'page' | 'bell' | 'generator' | 'safe'
    | 'door' | 'descend' | 'climb' | 'paper' | 'keeper' | 'leave';

export interface F4Point {
    id: string;
    room: F4Room;
    x: number;
    radius: number;
    kind: F4PointKind;
    /** Touch/[E] button label. */
    label: string;
    /** Examine text (kind 'examine'). */
    text?: string;
    /** Diary page index for kind 'page'. */
    page?: number;
    /** Only offered when this returns true. */
    when?: () => boolean;
}

// NOTE (lobby): everything left of the elevator (x < −7.5) is unreachable —
// walking left at the elevator exits the floor. All points sit at x ≥ −7.4.
export const F4_POINTS: F4Point[] = [
    // ════ LOBBY ════
    // pages: 1 free near the elevator, 3 wakes with the power, 4 in the safe
    { id: 'page1', room: 'lobby', x: -6.0, radius: 0.9, kind: 'page', page: 0, label: 'LER', when: () => !f4.pages[0] },
    { id: 'page3', room: 'lobby', x: 7.6, radius: 0.9, kind: 'page', page: 2, label: 'LER', when: () => f4.powerOn && !f4.pages[2] },
    { id: 'page4', room: 'lobby', x: 13.2, radius: 0.9, kind: 'page', page: 3, label: 'LER', when: () => f4.safeSolved && !f4.pages[3] },
    // the chain
    { id: 'hole', room: 'lobby', x: 6.2, radius: 1.0, kind: 'descend', label: 'DESCER', when: () => f4.runnerSeen },
    { id: 'bell', room: 'lobby', x: 2.3, radius: 0.9, kind: 'bell', label: 'TOCAR', when: () => f4.powerOn },
    { id: 'paper', room: 'lobby', x: 5.0, radius: 0.9, kind: 'paper', label: 'PEGAR', when: () => f4.skeletonRisen && !f4.codeTaken },
    { id: 'safe', room: 'lobby', x: 13.2, radius: 0.9, kind: 'safe', label: 'ABRIR', when: () => f4.codeTaken && !f4.safeSolved },
    { id: 'picture', room: 'lobby', x: 13.2, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'O quadro está torto de propósito. Tem algo atrás — com teclado.', when: () => f4.powerOn && !f4.codeTaken },
    { id: 'door', room: 'lobby', x: 11.5, radius: 1.1, kind: 'door', label: 'EMPURRAR', when: () => f4.runnerSeen && !f4.safeSolved },
    { id: 'door_unlock', room: 'lobby', x: 11.5, radius: 1.1, kind: 'door', label: 'DESTRANCAR', when: () => f4.safeSolved && !f4.doorUnlocked },
    { id: 'door_enter', room: 'lobby', x: 11.5, radius: 1.1, kind: 'door', label: 'ENTRAR', when: () => f4.doorUnlocked },
    // examines (one-liners; several POINT to the next move)
    { id: 'sign', room: 'lobby', x: -5.4, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'Embaixo da tinta tem outro nome: SAGUÃO 04.' },
    { id: 'deadpanel', room: 'lobby', x: -4.4, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'O quadro de força está morto. A etiqueta amarela diz: GERADOR — SUBSOLO.' },
    { id: 'plant', room: 'lobby', x: -3.5, radius: 0.8, kind: 'examine', label: 'OLHAR', text: 'Alguém regou ela até o fim.' },
    { id: 'light', room: 'lobby', x: 0.4, radius: 1.0, kind: 'examine', label: 'OLHAR', text: 'Ela não está quebrada. Está insistindo: curta, curta, curta… LONGA.' },
    { id: 'tally', room: 'lobby', x: 3.0, radius: 0.7, kind: 'examine', label: 'OLHAR', text: 'Quatro riscos na madeira do balcão. O quinto foi interrompido.', when: () => f4.powerOn },
    { id: 'desk', room: 'lobby', x: 3.8, radius: 0.7, kind: 'examine', label: 'OLHAR', text: 'O livro de hóspedes está aberto. Todos os nomes estão borrados — menos um: QUARTO 404.', when: () => f4.powerOn },
    { id: 'drag', room: 'lobby', x: 4.6, radius: 0.7, kind: 'examine', label: 'OLHAR', text: 'Foi arrastado na direção do buraco. E não foi sozinho.', when: () => !f4.skeletonRisen },
    { id: 'bones', room: 'lobby', x: 5.0, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'Ele esperou. Você atendeu.', when: () => f4.codeTaken },
    { id: 'mural', room: 'lobby', x: 14.4, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'O prédio inteiro, desenhado. O quarto andar riscado de vermelho. E uma seta apontando pra BAIXO.', when: () => f4.powerOn },
    // leaving is now an EXPLICIT choice (no more accidental walk-out exits)
    { id: 'leave', room: 'lobby', x: -7.4, radius: 0.9, kind: 'leave', label: 'ELEVADOR' },
    { id: 'elevator', room: 'lobby', x: -6.2, radius: 0.6, kind: 'examine', label: 'OLHAR', text: 'Nem um arranhão. Aqui, só ele é lembrado.' },

    // ════ BASEMENT ════
    { id: 'climb', room: 'basement', x: -3.2, radius: 1.0, kind: 'climb', label: 'SUBIR' },
    { id: 'page2', room: 'basement', x: 1.0, radius: 0.9, kind: 'page', page: 1, label: 'LER', when: () => !f4.pages[1] },
    { id: 'pipes', room: 'basement', x: -0.8, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'Os canos descem. Tudo neste prédio desce.' },
    { id: 'lamp', room: 'basement', x: 3.4, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'Uma lâmpada de emergência, ligada numa bateria. Pisca um ritmo, sempre o mesmo. Três curtas. Uma LONGA.', when: () => !f4.powerOn },
    { id: 'generator', room: 'basement', x: 5.2, radius: 1.0, kind: 'generator', label: 'LIGAR', when: () => !f4.powerOn },
    { id: 'genhum', room: 'basement', x: 5.2, radius: 1.0, kind: 'examine', label: 'OLHAR', text: 'O gerador ronrona. O prédio lembrou o ritmo.', when: () => f4.powerOn },
    { id: 'dark', room: 'basement', x: 7.4, radius: 0.8, kind: 'examine', label: 'OLHAR', text: 'O corredor segue, mas aqui o escuro é dono.' },

    // ════ BEYOND ════
    { id: 'back', room: 'beyond', x: -0.4, radius: 0.9, kind: 'climb', label: 'VOLTAR' },
    { id: 'floorless', room: 'beyond', x: 2.4, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'O chão aqui desistiu de ser chão.' },
    { id: 'keeper', room: 'beyond', x: 8.7, radius: 1.4, kind: 'keeper', label: 'FALAR' },
];

// ── Guidance (the floor must NOT feel like only the creator knows the way) ───

/** The current objective line for the HUD — always tells the player the next move. */
export function f4Objective(): string | null {
    if (f4.finished) {
        return f4.room === 'lobby' ? 'Volte ao elevador. Ele lembra o caminho.' : 'Volte. O elevador ainda lembra o caminho.';
    }
    if (f4.room === 'basement') {
        return f4.powerOn
            ? 'Energia ligada! SUBA e veja o saguão acordar.'
            : 'Ache o GERADOR no escuro. A lâmpada de emergência pisca o ritmo da partida.';
    }
    if (f4.room === 'beyond') {
        return f4.metKeeper ? 'Pergunte. Ele esperou muito tempo por isso.' : 'Há uma luz fraca adiante. Vá até ela.';
    }
    // lobby
    if (f4.runnerActive) return null;                                    // cinematic — no HUD noise
    if (!f4.runnerSeen) return 'Saia do elevador.';
    if (!f4.powerOn) return 'Ele trancou a SAÍDA e mergulhou no buraco. DESÇA atrás — o saguão precisa de energia.';
    if (!f4.bellSolved) return 'A luz voltou. O sino da recepção espera: complete os 5 riscos.';
    if (!f4.skeletonRisen) return 'Algo se mexe na recepção…';
    if (!f4.codeTaken) return 'Ele se levantou segurando um papel. PEGUE.';
    if (!f4.safeSolved) return 'O papel diz: QUARTO 404. O quadro torto esconde um cofre.';
    if (!f4.doorUnlocked) return 'A CHAVE-MESTRA é sua. Destranque a SAÍDA.';
    return 'A porta está aberta. ENTRE no breu.';
}

/** Progressive hints for the puzzle panels (DICA button cycles them). */
export const F4_HINTS: Record<'generator' | 'safe', string[]> = {
    generator: [
        'A lâmpada de emergência aqui embaixo repete a luz do saguão. Olhe o RITMO.',
        'Três piscadas CURTAS e uma LONGA. Curta = alavanca pra BAIXO, longa = pra CIMA.',
        'Baixo, baixo, baixo… CIMA.',
    ],
    safe: [
        'O papel do hóspede diz o número do quarto dele.',
        'QUARTO 404 — NÃO ENCONTRADO. O quarto que o prédio jura que não existe.',
        '4 · 0 · 4.',
    ],
};

/** Nearest available point within reach of player x in the CURRENT room. */
export function f4NearestPoint(playerX: number): F4Point | null {
    let best: F4Point | null = null;
    let bestD = Infinity;
    for (const p of F4_POINTS) {
        if (p.room !== f4.room) continue;
        if (p.when && !p.when()) continue;
        const d = Math.abs(playerX - p.x);
        if (d <= p.radius && d < bestD) { best = p; bestD = d; }
    }
    return best;
}
