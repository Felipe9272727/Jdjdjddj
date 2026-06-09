/**
 * f4Lore.ts — shared mutable state + rules for the Floor 4 lore/puzzle layer
 * (pattern mirrors f3Hazards.ts: a pure module the React layers read/write).
 *
 * The floor tells its story in four layers (FLOOR4_LORE.md): ambient art →
 * one-line EXAMINES → the Forgotten One's 5 DIARY PAGES → 3 PUZZLES (breaker /
 * bell / safe), each tearing one board off the back door. All three solved →
 * the door creaks ("ainda não.") and page 5 appears inside the elevator cab.
 *
 * Pure TS (no three/DOM) → unit-tested in __tests__/f4Lore.test.ts.
 */

// ── Light pattern (P1): the dying fluorescent isn't broken — it's insisting.
// 0 = short blink (lever DOWN), 1 = long blink (lever UP).
export const F4_LIGHT_PATTERN: ReadonlyArray<0 | 1> = [0, 0, 0, 1];

export const F4_SAFE_CODE = '404';          // the floor that doesn't exist
export const F4_BELL_RINGS = 5;             // finish the Forgotten One's 5th tally
const BELL_MAX_GAP_MS = 1500;               // rings must be consecutive

export interface F4State {
    version: number;                          // bumped on every change (UI re-render)
    pages: boolean[];                         // 5 diary pages collected
    breakerSolved: boolean;                   // P1 → board 0 + lights right side
    bellSolved: boolean;                      // P2 → board 1 + knocks from below
    safeSolved: boolean;                      // P3 → board 2 + the photo
    levers: (0 | 1)[];                        // current breaker levers (1 = up)
    doorTried: boolean;                       // pushed the unboarded door ("ainda não.")
    finished: boolean;                        // read page 5 → "VOCÊ LEMBROU DO ANDAR 4"
    bellCount: number;                        // consecutive rings so far
    lastRingAt: number;                       // ms timestamp of the last ring
}

export const f4: F4State = {
    version: 0,
    pages: [false, false, false, false, false],
    breakerSolved: false,
    bellSolved: false,
    safeSolved: false,
    levers: [1, 0, 1, 0],                     // scrambled start (≠ pattern)
    doorTried: false,
    finished: false,
    bellCount: 0,
    lastRingAt: 0,
};

let onChange: (() => void) | null = null;
/** UI subscribes to be re-rendered on state changes (one listener is enough). */
export function f4SetOnChange(cb: (() => void) | null): void { onChange = cb; }
function bump(): void { f4.version++; onChange?.(); }

export function f4Reset(): void {
    f4.pages = [false, false, false, false, false];
    f4.breakerSolved = false; f4.bellSolved = false; f4.safeSolved = false;
    f4.levers = [1, 0, 1, 0];
    f4.doorTried = false; f4.finished = false;
    f4.bellCount = 0; f4.lastRingAt = 0;
    bump();
}

export const f4BoardsGone = (): number =>
    (f4.breakerSolved ? 1 : 0) + (f4.bellSolved ? 1 : 0) + (f4.safeSolved ? 1 : 0);

export const f4PagesCollected = (): number => f4.pages.filter(Boolean).length;

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

// ── P1: breaker ───────────────────────────────────────────────────────────────
export function f4SetLever(i: number, up: 0 | 1): 'flip' | 'solved' | 'noop' {
    if (f4.breakerSolved || i < 0 || i >= f4.levers.length) return 'noop';
    f4.levers[i] = up;
    if (F4_LIGHT_PATTERN.every((p, k) => f4.levers[k] === p)) {
        f4.breakerSolved = true;
        bump();
        return 'solved';
    }
    bump();
    return 'flip';
}

// ── P2: bell ──────────────────────────────────────────────────────────────────
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

// ── P3: safe ──────────────────────────────────────────────────────────────────
export function f4TrySafe(code: string): boolean {
    if (f4.safeSolved) return true;
    if (code === F4_SAFE_CODE) { f4.safeSolved = true; bump(); return true; }
    return false;
}

// ── The back door ─────────────────────────────────────────────────────────────
export function f4TryDoor(): 'boarded' | 'notyet' | 'silent' {
    if (f4BoardsGone() < 3) return 'boarded';
    if (!f4.doorTried) { f4.doorTried = true; bump(); return 'notyet'; }
    return 'silent';
}

// ── Interaction points (positions live HERE so scene + UI agree) ──────────────
export type F4PointKind = 'examine' | 'page' | 'bell' | 'breaker' | 'safe' | 'door';
export interface F4Point {
    id: string;
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

export const F4_DIARY: ReadonlyArray<{ title: string; text: string }> = [
    { title: 'PÁGINA 1 — DIÁRIO', text: 'Dia 1. O elevador parou de atender o quarto andar. O supervisor novo sorriu e disse pra eu não me preocupar. Todos os supervisores sorriem igual.' },
    { title: 'PÁGINA 2 — DIÁRIO', text: 'Dia 9. Levaram o chão do corredor leste de madrugada. Tijolo por tijolo. Perguntei pra onde. "As partes que sobram também são bem tratadas." Parem de sorrir.' },
    { title: 'PÁGINA 3 — DIÁRIO', text: 'Dia 23. Tem gente no andar de baixo. Ouço eles arrumando as NOSSAS coisas nas paredes novas. Bati no chão a noite toda. Hoje bateram de volta.' },
    { title: 'PÁGINA 4 — DIÁRIO', text: 'Dia 40. Achei a foto. Esse era o MEU saguão. Eles não construíram um novo — eles esqueceram o velho. A gente não foi despejado. A gente foi des-lembrado.' },
    { title: 'PÁGINA 5 — DIÁRIO', text: 'Dia ???. Os riscos na parede não batem com as minhas memórias. Se você está lendo: LEMBRE deste andar. É só disso que ele precisa. O elevador ainda sobe. Ele lembra.' },
];

// NOTE: everything left of the elevator (x < −7.5) is unreachable — walking
// left at the elevator exits the floor. All points sit at x ≥ −7.4.
export const F4_POINTS: F4Point[] = [
    // pages on the ground (1 free, 2–4 from puzzles, 5 in the cab at the end)
    { id: 'page1', x: -6.0, radius: 0.9, kind: 'page', page: 0, label: 'LER', when: () => !f4.pages[0] },
    { id: 'page2', x: -4.4, radius: 0.9, kind: 'page', page: 1, label: 'LER', when: () => f4.breakerSolved && !f4.pages[1] },
    { id: 'page3', x: 6.2, radius: 0.9, kind: 'page', page: 2, label: 'LER', when: () => f4.bellSolved && !f4.pages[2] },
    { id: 'page4', x: 13.2, radius: 0.9, kind: 'page', page: 3, label: 'LER', when: () => f4.safeSolved && !f4.pages[3] },
    { id: 'page5', x: -7.0, radius: 1.4, kind: 'page', page: 4, label: 'LER', when: () => f4.doorTried && !f4.pages[4] },
    // puzzles
    { id: 'breaker', x: -4.4, radius: 0.9, kind: 'breaker', label: 'ABRIR', when: () => !f4.breakerSolved },
    { id: 'bell', x: 2.3, radius: 0.9, kind: 'bell', label: 'TOCAR' },
    { id: 'safe', x: 13.2, radius: 0.9, kind: 'safe', label: 'ABRIR', when: () => !f4.safeSolved },
    { id: 'door', x: 11.5, radius: 1.1, kind: 'door', label: 'EMPURRAR' },
    // examines (one-liners)
    { id: 'plant', x: -3.5, radius: 0.8, kind: 'examine', label: 'OLHAR', text: 'Alguém regou ela até o fim.' },
    { id: 'light', x: 0.4, radius: 1.0, kind: 'examine', label: 'OLHAR', text: 'Ela não está quebrada. Está insistindo.' },
    { id: 'desk', x: 3.6, radius: 0.8, kind: 'examine', label: 'OLHAR', text: 'O livro de hóspedes está aberto. Todos os nomes estão borrados.' },
    { id: 'drag', x: 4.8, radius: 0.8, kind: 'examine', label: 'OLHAR', text: 'Foi na direção do buraco. E não foi sozinho.' },
    { id: 'hole', x: 6.4, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'Lá embaixo tem luz. E a luz se mexe.', when: () => !(f4.bellSolved && !f4.pages[2]) },
    { id: 'sign', x: -5.4, radius: 0.9, kind: 'examine', label: 'OLHAR', text: 'Embaixo da tinta tem outro nome: SAGUÃO 04.' },
    { id: 'tally', x: 10.2, radius: 0.8, kind: 'examine', label: 'OLHAR', text: 'Quatro riscos. O quinto foi interrompido.' },
    { id: 'elevator', x: -7.0, radius: 1.0, kind: 'examine', label: 'OLHAR', text: 'Nem um arranhão. Aqui, só ele é lembrado.', when: () => !(f4.doorTried && !f4.pages[4]) },
];

/** Nearest available point within reach of player x (or null). */
export function f4NearestPoint(playerX: number): F4Point | null {
    let best: F4Point | null = null;
    let bestD = Infinity;
    for (const p of F4_POINTS) {
        if (p.when && !p.when()) continue;
        const d = Math.abs(playerX - p.x);
        if (d <= p.radius && d < bestD) { best = p; bestD = d; }
    }
    return best;
}
