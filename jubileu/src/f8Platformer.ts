/**
 * Floor 8 — a memória costurada.
 *
 * Motor puro da sequência 2.5D. A agulha não é uma espada: ela fisga,
 * tensiona, desfaz nós hostis e refaz rasgos. As quatro memórias ensinam essa
 * gramática antes da quinta etapa, YOURSELF, um duelo de padrões — não de HP.
 */
import { f8WinMemory } from './f8Arquivo';

export interface Vec2 { x: number; y: number }
export interface Ledge { x0: number; x1: number; y: number }
export interface StoryBeat { x: number; text: string }

export interface Palette {
    bgHi: string; bgLo: string;
    wool: string; woolHi: string; woolLo: string;
    anchor: string; thread: string; hazard: string; fog: string;
    ambient: string; light: string;
}

export type EnemyKind = 'knotling' | 'intrusive' | 'echo';
export interface EnemyDef {
    kind?: EnemyKind;
    x0: number; x1: number; y: number; speed: number;
    amplitude?: number;
    seams?: number;
}
export interface EnemyState {
    x: number; y: number; dir: number;
    dead: boolean; deadT: number;
    seams: number; maxSeams: number;
    stunned: number; tethered: boolean;
    aiT: number; attackT: number;
}

export interface SeamGate { x: number; y: number; needed: number; label: string }
export interface BossDef { x: number; arenaX: number }
export type BossPhase = 'dormant' | 'mirror' | 'attack' | 'exposed' | 'bound' | 'resolved';
/** O ataque ATIVO do boss — um por costura/problema mental, cada um com
 *  telegraph próprio e resposta própria do player:
 *  slam (VERGONHA: anel vermelho no seu chão → esquive), sweep (CONTROLE:
 *  varredura baixa=pule / alta=abaixe), throw (RUMINAÇÃO: novelos brancos
 *  aparáveis com o FIO), cocoon (ISOLAMENTO: escudo + voadores — mate-os),
 *  e no MEDO ele alterna slam rápido e arremesso duplo. */
export type BossAttack = 'slam' | 'sweep' | 'throw' | 'cocoon' | null;
export interface Projectile { x: number; y: number; vx: number; vy: number; parryable: boolean; reflected: boolean; dead: boolean; t: number }
export interface Pickup { x: number; y: number; vy: number; t: number }
export interface BossState {
    x: number; y: number; phase: BossPhase; timer: number;
    seams: number; pattern: number; tethered: boolean;
    hurtT: number; introSeen: boolean;
    attack: BossAttack; atkT: number;            // telegraph/execução do ataque
    slamX: number; slamN: number; slamAir: number; // alvo do slam, contagem, arco do salto
    sweepX: number; sweepY: number; sweepDir: number; sweepN: number;
    throwN: number; shield: boolean;
    projectiles: Projectile[];
}

export interface Memory {
    key: string; title: string; caption: string; mechanic: string;
    beats: StoryBeat[];
    ledges: Ledge[]; anchors: Vec2[]; hazards: Vec2[];
    enemies: EnemyDef[]; gates: SeamGate[]; spools: Vec2[];
    startX: number; startY: number; goalX: number; endX: number;
    pal: Palette; boss?: BossDef;
}

export const P8 = {
    RUN: 7.2, ACCEL: 31, AIR_CTRL: 0.63, GRAV: -32, JUMP_V: 11.4,
    COYOTE: 0.13, JUMP_BUF: 0.13,
    GRAB_RANGE: 8.7, ENEMY_GRAB_RANGE: 5.2, MAX_ROPE: 8.7, MIN_ROPE: 2.2,
    GRAB_TIGHTEN: 0.81, AUTO_REEL: 1.12, SWING_ACCEL: 26, REEL: 3.2,
    RELEASE_BOOST: 3.6, RELEASE_CARRY: 1.12,
    STITCH_REACH: 2.25, STITCH_COOLDOWN: 0.34,
    DASH_V: 17, DASH_T: 0.22, DASH_CD: 1.3,      // INVESTIDA DA AGULHA (AGULHA no ar + direção)
    PARRY_R: 1.8,                                 // raio do CONTRA-PONTO nos novelos brancos
    VOID_DY: -6,
} as const;

const PAL_QUINTAL: Palette = {
    bgHi: '#ffd39a', bgLo: '#d8774e', wool: '#9d603c', woolHi: '#e3a866', woolLo: '#633c2b',
    anchor: '#70a889', thread: '#d84e66', hazard: '#4b2c28', fog: '#dca07a', ambient: '#ffd1aa', light: '#fff0d2',
};
const PAL_ESCOLA: Palette = {
    bgHi: '#93c1da', bgLo: '#496b87', wool: '#8b684d', woolHi: '#c59b6d', woolLo: '#4b3a35',
    anchor: '#df705c', thread: '#ec9f35', hazard: '#283747', fog: '#769db7', ambient: '#b8d4e4', light: '#f2f7fa',
};
const PAL_TEMPESTADE: Palette = {
    bgHi: '#52667d', bgLo: '#202b3b', wool: '#515b70', woolHi: '#8795a9', woolLo: '#2c3445',
    anchor: '#e0c57b', thread: '#f0d792', hazard: '#121520', fog: '#38495d', ambient: '#64778c', light: '#d1dded',
};
const PAL_HOTEL: Palette = {
    bgHi: '#34304d', bgLo: '#151225', wool: '#433957', woolHi: '#716585', woolLo: '#241d34',
    anchor: '#d6a747', thread: '#f1bc57', hazard: '#090711', fog: '#29233a', ambient: '#4a405f', light: '#bcb0d0',
};
const PAL_YOURSELF: Palette = {
    bgHi: '#462936', bgLo: '#100c19', wool: '#49323f', woolHi: '#9b5965', woolLo: '#211521',
    anchor: '#d7aa62', thread: '#f05a72', hazard: '#08060d', fog: '#251824', ambient: '#5d3444', light: '#f1c6ae',
};

/** Cinco etapas, cada uma adicionando uma operação real de crochê ao jogo. */
export const MEMORIES: Memory[] = [
    {
        key: 'quintal', title: 'I. O QUINTAL', mechanic: 'FISGUE · BALANCE · REFAÇA O RASGO',
        caption: 'Verão. A casa amarela. Antes de aprender a esconder as pontas soltas.',
        beats: [
            { x: 5, text: 'A grama ainda guarda o calor da tarde.' },
            { x: 17, text: 'A pipa ficou presa. O fio, porém, sempre soube o caminho de volta.' },
            { x: 29, text: 'Isto não é uma parede. É um rasgo: chegue perto e use a AGULHA.' },
            { x: 44, text: 'Alguém chama um nome que já não parece seu.' },
        ],
        pal: PAL_QUINTAL, startX: 0, startY: 0, goalX: 52, endX: 57,
        ledges: [{ x0: -3, x1: 8, y: 0 }, { x0: 15, x1: 25, y: 0.6 }, { x0: 32, x1: 57, y: 0 }],
        anchors: [{ x: 11, y: 6.2 }, { x: 21, y: 7.1 }, { x: 28.5, y: 6.5 }],
        hazards: [], enemies: [],
        gates: [{ x: 38, y: 0, needed: 2, label: 'A PORTA QUE NÃO SE DESPEDIU' }],
        spools: [{ x: 11, y: 3.2 }, { x: 23, y: 3.8 }, { x: 48, y: 1.5 }],
    },
    {
        key: 'escola', title: 'II. A ESCOLA', mechanic: 'ATORDOE · FISGUE · DESFAÇA O NÓ',
        caption: 'O sinal tocou. As palavras que jogaram em você aprenderam a andar sozinhas.',
        beats: [
            { x: 5, text: 'O corredor cheira a giz molhado e expectativa.' },
            { x: 16, text: 'Pular só abre o nó. Fisgue-o e use a AGULHA para desfazê-lo.' },
            { x: 34, text: 'Acima de você, pensamentos que não são seus começaram a criar asas.' },
            { x: 55, text: 'Você não venceu batendo mais forte. Venceu recusando o padrão.' },
        ],
        pal: PAL_ESCOLA, startX: 0, startY: 0, goalX: 64, endX: 69,
        ledges: [{ x0: -3, x1: 7, y: 0 }, { x0: 14, x1: 22, y: 1.2 }, { x0: 29, x1: 37, y: 0.3 }, { x0: 45, x1: 69, y: 0 }],
        anchors: [{ x: 10.5, y: 6.7 }, { x: 19, y: 7.5 }, { x: 26, y: 6.8 }, { x: 41, y: 7.0 }],
        hazards: [],
        enemies: [
            { kind: 'knotling', x0: 15, x1: 21, y: 1.2, speed: 1.35, seams: 2 },
            { kind: 'intrusive', x0: 31, x1: 42, y: 4.2, speed: 1.6, amplitude: 1.0, seams: 1 },
            { kind: 'knotling', x0: 49, x1: 57, y: 0, speed: 1.8, seams: 2 },
        ],
        gates: [{ x: 60, y: 0, needed: 3, label: 'EU NÃO SOU O QUE DISSERAM' }],
        spools: [{ x: 18, y: 4.3 }, { x: 35, y: 5.7 }, { x: 54, y: 1.6 }],
    },
    {
        key: 'tempestade', title: 'III. A TEMPESTADE', mechanic: 'PARE O MERGULHO · COSTURE NO AR',
        caption: 'A casa ficou cinza. As frases inacabadas deram voltas no teto por anos.',
        beats: [
            { x: 5, text: 'A luz da varanda não apagou: alguém a cobriu.' },
            { x: 20, text: 'As criaturas voadoras mergulham quando você foge. Fisgue o núcleo luminoso.' },
            { x: 39, text: 'Sem alvo, AGULHA no ar cria por instantes um ponto onde apoiar os pés.' },
            { x: 62, text: 'Choveu por meses dentro de você. Ainda assim, você aprendeu a costurar no escuro.' },
        ],
        pal: PAL_TEMPESTADE, startX: 0, startY: 0, goalX: 72, endX: 77,
        ledges: [{ x0: -3, x1: 6, y: 0 }, { x0: 13, x1: 18, y: 1 }, { x0: 27, x1: 31, y: 2 }, { x0: 41, x1: 45, y: 0.8 }, { x0: 55, x1: 77, y: 0 }],
        anchors: [{ x: 9, y: 7.1 }, { x: 22, y: 7.8 }, { x: 35.5, y: 8 }, { x: 50, y: 7 }],
        hazards: [{ x: 16, y: 1 }, { x: 29, y: 2 }, { x: 43, y: 0.8 }, { x: 63, y: 0 }],
        enemies: [
            { kind: 'intrusive', x0: 16, x1: 28, y: 4.7, speed: 1.9, amplitude: 1.2, seams: 1 },
            { kind: 'intrusive', x0: 34, x1: 49, y: 5.2, speed: 2.2, amplitude: 1.5, seams: 1 },
            { kind: 'knotling', x0: 59, x1: 68, y: 0, speed: 1.65, seams: 3 },
        ],
        gates: [{ x: 69, y: 0, needed: 3, label: 'A AUSÊNCIA NÃO FOI CULPA SUA' }],
        spools: [{ x: 22, y: 5 }, { x: 39, y: 4.6 }, { x: 64, y: 1.6 }],
    },
    {
        key: 'hotel', title: 'IV. O HOTEL', mechanic: 'O ECO IMITA · QUEBRE O RITMO',
        caption: 'A noite em que o hotel escreveu por cima de você — e chamou isso de registro.',
        beats: [
            { x: 5, text: 'Você esteve aqui antes. Esta não é a primeira entrada.' },
            { x: 22, text: 'Os ecos repetem seu movimento ao contrário. Pare de obedecer ao reflexo.' },
            { x: 44, text: 'Vinte janelas acesas. Uma delas piscou no ritmo do seu coração.' },
            { x: 66, text: 'O Proprietário não apagou a memória. Ele amarrou suas pontas.' },
            { x: 84, text: 'Atrás da porta 21, alguém segura a outra extremidade do fio.' },
        ],
        pal: PAL_HOTEL, startX: 0, startY: 0, goalX: 94, endX: 99,
        ledges: [{ x0: -3, x1: 6, y: 0 }, { x0: 13, x1: 18, y: 1.2 }, { x0: 25, x1: 31, y: 0.4 }, { x0: 39, x1: 46, y: 1.5 }, { x0: 55, x1: 62, y: 0.5 }, { x0: 71, x1: 99, y: 0 }],
        anchors: [{ x: 9.5, y: 7.2 }, { x: 21.5, y: 7.5 }, { x: 35, y: 7.9 }, { x: 50.5, y: 7.3 }, { x: 66.5, y: 7.8 }],
        hazards: [{ x: 16, y: 1.2 }, { x: 29, y: 0.4 }, { x: 44, y: 1.5 }, { x: 60, y: 0.5 }, { x: 81, y: 0 }],
        enemies: [
            { kind: 'echo', x0: 27, x1: 37, y: 0.4, speed: 1.2, seams: 2 },
            { kind: 'intrusive', x0: 48, x1: 63, y: 4.4, speed: 2, amplitude: 1.1, seams: 1 },
            { kind: 'echo', x0: 73, x1: 88, y: 0, speed: 1.55, seams: 3 },
        ],
        gates: [{ x: 90, y: 0, needed: 4, label: 'MEU NOME NÃO É UM NÚMERO DE QUARTO' }],
        spools: [{ x: 21, y: 5.2 }, { x: 43, y: 5.2 }, { x: 59, y: 4.1 }, { x: 84, y: 1.6 }],
    },
    {
        key: 'yourself', title: 'V. YOURSELF', mechanic: 'LEIA O PADRÃO · SEGURE O FIO · REFAÇA-SE',
        caption: 'Não era uma coisa esperando no fim. Era você, esperando desde o começo.',
        beats: [
            { x: 6, text: 'Ele segura a agulha como você. Até a tremedeira é a mesma.' },
            { x: 19, text: 'Não ataque o corpo. Espere o padrão abrir, fisgue e mantenha o fio tenso.' },
        ],
        pal: PAL_YOURSELF, startX: 0, startY: 0, goalX: 50, endX: 54,
        ledges: [{ x0: -3, x1: 54, y: 0 }],
        anchors: [{ x: 8, y: 7 }, { x: 18, y: 8 }, { x: 29, y: 7.2 }, { x: 41, y: 8 }],
        hazards: [],
        // Dormem fora da cena e só acordam dentro do ataque ISOLAMENTO. Sem
        // estas duas definições o casulo v2 encerrava no mesmo frame em que
        // começava, pois `some(!dead)` nunca encontrava um pensamento vivo.
        enemies: [
            { kind: 'intrusive', x0: 22, x1: 34, y: 4.6, speed: 2.0, amplitude: 1.0, seams: 1 },
            { kind: 'intrusive', x0: 31, x1: 43, y: 5.4, speed: 2.25, amplitude: 1.2, seams: 1 },
        ],
        gates: [], spools: [{ x: 11, y: 2.5 }, { x: 24, y: 3.5 }, { x: 39, y: 2.8 }],
        boss: { x: 43, arenaX: 15 },
    },
];

const HAZARD_HALF = 0.5;
const HAZARD_H = 1.4;
const SPOOL_R = 0.8;
const BOSS_SEAM_LINES = [
    'VERGONHA — uma voz emprestada, repetida até parecer sua.',
    'CONTROLE — apertar o fio não impede que alguém vá embora.',
    'RUMINAÇÃO — voltar ao mesmo ponto não muda o desenho.',
    'ISOLAMENTO — proteção que, com o tempo, virou parede.',
    'MEDO — não desaparece; aprende a caminhar ao seu lado.',
] as const;

export interface PatchState { x: number; y: number; t: number }
export interface P8State {
    memIdx: number; x: number; y: number; vx: number; vy: number;
    onGround: boolean; coyote: number; jumpBuf: number; stun: number; invuln: number;
    integrity: number; facing: number; runPhase: number;
    anchor: number | null; ropeLen: number; grabCd: number;
    tetherEnemy: number | null; bossTether: boolean; tension: number;
    stitchT: number; stitchCd: number; stitchHeld: boolean; grappleHeld: boolean; combo: number;
    dashT: number; dashCd: number;                // a INVESTIDA em curso / recarga
    pickups: Pickup[];                            // novelos-coração (cura)
    deaths: number;                               // mortes na luta (a batalha reinicia)
    patch: PatchState | null;
    lastGroundX: number; lastGroundY: number;
    gotSpools: boolean[]; spools: number; threadCharge: number;
    enemies: EnemyState[]; gateProgress: number[]; boss: BossState | null;
    beatIdx: number; beatText: string | null; beatT: number;
    hurtFlash: number; transition: number; won: boolean; t: number; version: number;
}

export interface P8Input { move: number; vert: number; jump: boolean; grapple: boolean; stitch?: boolean }
export interface P8Events {
    jumped: boolean; landed: boolean; hurt: boolean; respawned: boolean;
    collected: number; grabbed: boolean; released: boolean; advanced: boolean; won: boolean;
    stomped: boolean; beat: boolean; stitched: boolean; unravelled: boolean;
    parried: boolean; gateRepaired: boolean; bossSeam: boolean; bossWon: boolean;
    died: boolean; healed: boolean; dashed: boolean; popped: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export function curMem(): Memory { return MEMORIES[Math.min(p8.memIdx, MEMORIES.length - 1)]; }

export function groundAt(x: number, feetY: number): number | null {
    let best: number | null = null;
    for (const l of curMem().ledges) {
        if (x < l.x0 || x > l.x1) continue;
        if (l.y <= feetY + 0.28 && (best === null || l.y > best)) best = l.y;
    }
    const patch = p8?.patch;
    if (patch && patch.t > 0 && Math.abs(x - patch.x) < 1.45 && patch.y <= feetY + 0.3 && (best === null || patch.y > best)) best = patch.y;
    return best;
}

function freshFor(memIdx: number): Partial<P8State> {
    const m = MEMORIES[memIdx];
    return {
        memIdx, x: m.startX, y: m.startY, vx: 0, vy: 0, onGround: true,
        coyote: 0, jumpBuf: 0, stun: 0, invuln: 0, integrity: 3, facing: 1, runPhase: 0,
        anchor: null, ropeLen: 0, grabCd: 0, tetherEnemy: null, bossTether: false, tension: 0,
        stitchT: 0, stitchCd: 0, stitchHeld: false, grappleHeld: false, combo: 0, patch: null,
        dashT: 0, dashCd: 0, pickups: [], deaths: 0,
        lastGroundX: m.startX, lastGroundY: m.startY,
        gotSpools: m.spools.map(() => false), threadCharge: 0.45,
        enemies: m.enemies.map((e, i) => ({
            x: (e.x0 + e.x1) / 2, y: e.y, dir: i % 2 ? -1 : 1,
            // Os intrusivos do YOURSELF pertencem ao casulo e não devem
            // patrulhar a arena antes de serem convocados.
            dead: !!m.boss, deadT: m.boss ? 1 : 0, seams: e.seams ?? 2, maxSeams: e.seams ?? 2,
            stunned: 0, tethered: false, aiT: i * 1.73, attackT: 1.4 + i * 0.35,
        })),
        gateProgress: m.gates.map(() => 0),
        boss: m.boss ? {
            x: m.boss.x, y: 0, phase: 'dormant', timer: 1.8, seams: 5, pattern: 0, tethered: false, hurtT: 0, introSeen: false,
            attack: null, atkT: 0, slamX: 0, slamN: 0, slamAir: 0,
            sweepX: 0, sweepY: 0.55, sweepDir: 1, sweepN: 0, throwN: 0, shield: false, projectiles: [],
        } : null,
        beatIdx: 0, beatText: null, beatT: 0, hurtFlash: 0, transition: 1.0,
    };
}

const FRESH = (): P8State => ({ ...(freshFor(0) as P8State), spools: 0, won: false, t: 0, version: 0 });
export const p8: P8State = FRESH();
const listeners = new Set<() => void>();
export function p8Subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function p8Bump(): void { p8.version++; listeners.forEach((fn) => fn()); }
export function p8Reset(): void { const v = p8.version; Object.assign(p8, FRESH()); p8.version = v; p8Bump(); }
export function p8JumpToMemory(i: number): void {
    Object.assign(p8, freshFor(clamp(i, 0, MEMORIES.length - 1)));
    p8Bump();
}

function emptyEvents(): P8Events {
    return {
        jumped: false, landed: false, hurt: false, respawned: false, collected: 0,
        grabbed: false, released: false, advanced: false, won: false, stomped: false,
        beat: false, stitched: false, unravelled: false, parried: false,
        gateRepaired: false, bossSeam: false, bossWon: false,
        died: false, healed: false, dashed: false, popped: false,
    };
}

/** A batalha do YOURSELF reinicia DO ZERO: você morreu — ele te desfez. */
function battleReset(p: P8State, ev: P8Events): void {
    const m = curMem(), def = m.boss!;
    p.deaths++;
    p.x = def.arenaX - 3; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = true;
    p.integrity = 3; p.invuln = 1.6; p.stun = 0.8; p.hurtFlash = 1;
    p.anchor = null; p.tetherEnemy = null; p.bossTether = false; p.tension = 0;
    p.dashT = 0; p.dashCd = 0; p.pickups = []; p.patch = null; p.threadCharge = 0.45;
    p.lastGroundX = def.arenaX - 3; p.lastGroundY = 0;
    // os voadores do casulo voltam ao ninho (mortos até serem invocados de novo)
    p.enemies.forEach((e, i) => {
        const d = m.enemies[i];
        e.dead = true; e.deadT = 1; e.seams = d.seams ?? 1; e.maxSeams = d.seams ?? 1;
        e.stunned = 0; e.tethered = false; e.x = (d.x0 + d.x1) / 2; e.y = d.y;
    });
    Object.assign(p.boss!, {
        x: def.x, y: 0, phase: 'mirror', timer: 2.0, seams: 5, pattern: 0,
        tethered: false, hurtT: 0, attack: null, atkT: 0, slamX: 0, slamN: 0, slamAir: 0,
        sweepX: 0, sweepY: 0.55, sweepDir: 1, sweepN: 0, throwN: 0, shield: false, projectiles: [],
    });
    p.beatText = 'Ele te desfez. Mas o fio lembra o caminho: DE NOVO.';
    p.beatT = 4.2;
    ev.died = true; ev.respawned = true;
    p8Bump();
}

function respawn(p: P8State, ev: P8Events): void {
    // na luta do boss, cair no vazio NÃO cura: custa um coração e te repõe
    const inBoss = p.boss && p.boss.phase !== 'dormant' && p.boss.phase !== 'resolved';
    p.x = p.lastGroundX; p.y = p.lastGroundY + 0.02; p.vx = 0; p.vy = 0;
    p.onGround = true; p.anchor = null; p.tetherEnemy = null; p.bossTether = false;
    p.stun = 0.55; p.invuln = 0.7; p.hurtFlash = 0.65;
    if (inBoss) {
        p.integrity--;
        if (p.integrity <= 0) { battleReset(p, ev); return; }
    } else {
        p.integrity = 3;
    }
    p.tension = 0; ev.respawned = true;
}

function hurtPlayer(p: P8State, ev: P8Events, fromX: number): void {
    if (p.invuln > 0 || p.dashT > 0) return;      // a INVESTIDA tem i-frames
    p.integrity--; p.invuln = 1.0; p.stun = 0.38; p.hurtFlash = 0.55;
    p.vx = (p.x < fromX ? -1 : 1) * 8; p.vy = 6.2; p.onGround = false;
    p.anchor = null; p.tetherEnemy = null; p.bossTether = false; p.tension = 0;
    ev.hurt = true;
    if (p.integrity <= 0) {
        const inBoss = p.boss && p.boss.phase !== 'dormant' && p.boss.phase !== 'resolved';
        if (inBoss) battleReset(p, ev);
        else respawn(p, ev);
    }
}

function tryGrabAnchor(p: P8State, m: Memory): boolean {
    let best = -1, bestD: number = P8.GRAB_RANGE;
    for (let i = 0; i < m.anchors.length; i++) {
        const a = m.anchors[i];
        if (a.y < p.y - 0.5) continue;
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        if (d < bestD) { best = i; bestD = d; }
    }
    if (best < 0) return false;
    p.anchor = best;
    p.ropeLen = clamp(bestD * P8.GRAB_TIGHTEN, P8.MIN_ROPE, P8.MAX_ROPE);
    return true;
}

function tryGrabEnemy(p: P8State, m: Memory): boolean {
    let best = -1, bestD: number = P8.ENEMY_GRAB_RANGE;
    for (let i = 0; i < p.enemies.length; i++) {
        const e = p.enemies[i]; if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, (e.y + 0.8) - (p.y + 0.9));
        if (d < bestD) { best = i; bestD = d; }
    }
    if (best >= 0) {
        p.tetherEnemy = best; p.enemies[best].tethered = true;
        p.enemies[best].stunned = Math.max(p.enemies[best].stunned, 0.4);
        p.tension = 0.1; return true;
    }
    const b = p.boss;
    if (b && !b.shield && (b.phase === 'exposed' || b.phase === 'bound') && Math.hypot(b.x - p.x, b.y + 1.2 - p.y) <= P8.GRAB_RANGE) {
        p.bossTether = true; b.tethered = true; b.phase = 'bound'; b.timer = 2.8; p.tension = 0.08;
        return true;
    }
    return false;
}

function releaseThread(p: P8State): void {
    if (p.tetherEnemy !== null && p.enemies[p.tetherEnemy]) p.enemies[p.tetherEnemy].tethered = false;
    if (p.boss) p.boss.tethered = false;
    p.anchor = null; p.tetherEnemy = null; p.bossTether = false;
    p.grabCd = 0.2; p.tension *= 0.45;
}

function finishMemory(p: P8State, ev: P8Events): void {
    p.won = true; ev.won = true; f8WinMemory(); p8Bump();
}

function performStitch(p: P8State, m: Memory, ev: P8Events): void {
    p.stitchT = 0.26; p.stitchCd = P8.STITCH_COOLDOWN; ev.stitched = true;

    const b = p.boss;
    if (b && b.phase === 'bound' && p.bossTether && p.tension >= 0.68) {
        b.seams--; b.hurtT = 0.75; b.tethered = false; p.bossTether = false; p.tension = 0; ev.bossSeam = true;
        const line = BOSS_SEAM_LINES[5 - Math.max(0, b.seams) - 1];
        p.beatText = line; p.beatT = 5.8;
        // a costura desfeita solta um NOVELO-CORAÇÃO (a cura mora no enfrentar)
        p.pickups.push({ x: b.x, y: b.y + 1.6, vy: 3.5, t: 0 });
        b.attack = null; b.projectiles = [];
        if (b.seams <= 0) {
            b.phase = 'resolved'; b.timer = 2.6; ev.bossWon = true; finishMemory(p, ev);
        } else {
            b.pattern++; b.phase = 'mirror'; b.timer = Math.max(1.4, 2.8 - b.pattern * 0.2);
        }
        return;
    }

    for (let i = 0; i < m.gates.length; i++) {
        const g = m.gates[i];
        if (p.gateProgress[i] >= g.needed) continue;
        if (Math.abs(p.x - g.x) <= P8.STITCH_REACH + 0.4 && Math.abs(p.y - g.y) < 2.2) {
            p.gateProgress[i]++;
            p.threadCharge = clamp(p.threadCharge + 0.08, 0, 1);
            if (p.gateProgress[i] >= g.needed) { ev.gateRepaired = true; p.combo++; }
            return;
        }
    }

    let target = p.tetherEnemy;
    if (target === null) {
        let best: number = P8.STITCH_REACH;
        for (let i = 0; i < p.enemies.length; i++) {
            const e = p.enemies[i]; if (e.dead) continue;
            const dx = e.x - p.x, dy = (e.y + 0.7) - (p.y + 0.8), d = Math.hypot(dx, dy);
            if (d < best && dx * p.facing > -0.5) { best = d; target = i; }
        }
    }
    if (target !== null) {
        const e = p.enemies[target];
        const kind = m.enemies[target]?.kind ?? 'knotling';
        const vulnerable = e.tethered || e.stunned > 0 || (kind === 'intrusive' && e.attackT < 0.24);
        if (vulnerable) {
            e.seams--; e.stunned = 0.7; p.threadCharge = clamp(p.threadCharge + 0.16, 0, 1); p.combo++;
            ev.unravelled = true;
            if (e.seams <= 0) {
                e.dead = true; e.deadT = 0; e.tethered = false; p.tetherEnemy = null;
                p.tension = 0; p.threadCharge = clamp(p.threadCharge + 0.28, 0, 1);
            }
            return;
        }
        e.stunned = 0.22;
        return;
    }

    // Sem alvo, a agulha faz crochê no próprio espaço: um ponto temporário.
    if (!p.onGround && p.threadCharge >= 0.32) {
        p.patch = { x: p.x + p.facing * 1.15, y: p.y - 0.55, t: 4.6 };
        p.threadCharge -= 0.32;
    }
}

/** O nome do problema mental da costura atual (o HUD destaca o chip). */
export function bossProblemIdx(b: BossState): number { return clamp(5 - b.seams, 0, 4); }

/** Escolhe o ataque da vez — um por costura; no MEDO (última) ele alterna. */
function pickAttack(b: BossState, def: BossDef, p: P8State): void {
    if (b.seams >= 5) b.attack = 'slam';
    else if (b.seams === 4) b.attack = 'sweep';
    else if (b.seams === 3) b.attack = 'throw';
    else if (b.seams === 2) b.attack = 'cocoon';
    else b.attack = (b.pattern % 2 === 0) ? 'slam' : 'throw';
    b.atkT = 0; b.slamN = 0; b.sweepN = 0; b.throwN = 0; b.slamAir = 0;
    if (b.attack === 'slam') b.slamX = p.x;
    if (b.attack === 'sweep') { b.sweepX = b.x; b.sweepDir = p.x < b.x ? -1 : 1; b.sweepY = 0.55; }
    if (b.attack === 'cocoon') {
        // ISOLAMENTO: sobe blindado no centro e acorda os pensamentos
        b.shield = true;
        const cx = (def.arenaX + 40) / 2;
        b.x = cx;
        p.enemies.forEach((e, i) => {
            e.dead = false; e.deadT = 0; e.seams = 1; e.maxSeams = 1; e.stunned = 0;
            e.x = cx + (i % 2 ? 4.5 : -4.5); e.y = 4.6 + (i % 2) * 0.8;
        });
    }
}

function throwProjectile(b: BossState, p: P8State, speed: number): void {
    const sx = b.x, sy = b.y + 1.5;
    const dx = p.x - sx, dy = (p.y + 0.9) - sy;
    const d = Math.hypot(dx, dy) || 0.001;
    b.projectiles.push({ x: sx, y: sy, vx: (dx / d) * speed, vy: (dy / d) * speed, parryable: true, reflected: false, dead: false, t: 0 });
}

function updateBoss(p: P8State, inp: P8Input, dt: number, ev: P8Events): void {
    const b = p.boss, def = curMem().boss;
    if (!b || !def) return;
    b.hurtT = Math.max(0, b.hurtT - dt);

    // ── projéteis (voam mesmo com o boss em outra fase) ──────────────────────
    for (const pr of b.projectiles) {
        if (pr.dead) continue;
        pr.t += dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (pr.t > 6 || pr.y < -2 || pr.y > 14) { pr.dead = true; continue; }
        if (!pr.reflected) {
            if (Math.hypot(pr.x - p.x, pr.y - (p.y + 0.9)) < 0.85) { hurtPlayer(p, ev, pr.x); pr.dead = true; }
        } else if (Math.hypot(pr.x - b.x, pr.y - (b.y + 1.4)) < 1.7 && !b.shield) {
            // CONTRA-PONTO acertou: o padrão quebra na hora
            pr.dead = true; b.hurtT = 0.6; b.attack = null;
            b.phase = 'exposed'; b.timer = 3.2;
        }
    }
    if (b.projectiles.length > 24) b.projectiles = b.projectiles.filter((q) => !q.dead);

    if (b.phase === 'resolved') return;
    if (b.phase === 'dormant') {
        if (p.x >= def.arenaX) { b.phase = 'mirror'; b.timer = 2.4; b.introSeen = true; p.beatText = 'YOURSELF não avança. Ele devolve. Aprenda o padrão de cada nó.'; p.beatT = 4.4; ev.beat = true; p8Bump(); }
        return;
    }

    const medo = b.seams <= 1;                     // a fúria final é mais rápida
    if (b.phase === 'mirror') {
        // o respiro entre ataques: ele espelha seu movimento, invertido
        b.timer -= dt;
        const desired = clamp(48 - p.x * 0.34, def.arenaX + 6, 45);
        b.x += (desired - b.x) * Math.min(1, dt * (medo ? 4 : 2.4));
        // O respiro visual acontece no sprite ancorado; mover o corpo lógico
        // para cima fazia as solas pairarem sem comunicar nenhum ataque.
        b.y = 0;
        if (b.timer <= 0) { b.phase = 'attack' as BossPhase; pickAttack(b, def, p); }
        return;
    }

    if (b.phase === ('attack' as BossPhase)) {
        b.atkT += dt;
        if (b.attack === 'slam') {
            // VERGONHA/MEDO: anel vermelho marca SEU chão → ele despenca ali
            const tele = medo ? 0.55 : 0.9;
            if (b.atkT < tele) {
                b.slamX += (p.x - b.slamX) * Math.min(1, dt * 3.5);   // o anel te segue no começo
            } else if (b.atkT < tele + 0.34) {
                const k = (b.atkT - tele) / 0.34;                     // o salto (arco)
                b.x += (b.slamX - b.x) * Math.min(1, dt * 14);
                b.slamAir = Math.sin(k * Math.PI) * 3.2;
                b.y = b.slamAir;
            } else {
                // IMPACTO: onda de choque rente ao chão
                b.y = 0;
                if (Math.abs(p.x - b.slamX) < 2.2 && p.y < 1.5) hurtPlayer(p, ev, b.slamX);
                b.slamN++;
                if (b.slamN >= 2) { b.attack = null; b.phase = 'exposed'; b.timer = medo ? 2.0 : 2.5; }
                else { b.atkT = 0; b.slamX = p.x; }
            }
            return;
        }
        if (b.attack === 'sweep') {
            // CONTROLE: varredura baixa (pule) e depois alta (fique no chão)
            const tele = 0.7;
            if (b.atkT < tele) return;                                // o fio pisca no caminho
            b.sweepX += b.sweepDir * 15 * dt;
            const low = b.sweepN === 0;
            b.sweepY = low ? 0.55 : 2.0;
            if (Math.abs(p.x - b.sweepX) < 0.7) {
                const hit = low ? (p.y < 1.2) : (p.y > 0.55);
                if (hit) hurtPlayer(p, ev, b.sweepX);
            }
            if (b.sweepX < def.arenaX - 2 || b.sweepX > 42) {
                b.sweepN++;
                if (b.sweepN >= 2) { b.attack = null; b.phase = 'exposed'; b.timer = 2.3; }
                else { b.atkT = 0; b.sweepDir *= -1; b.sweepX = b.sweepDir > 0 ? def.arenaX - 2 : 42; }
            }
            return;
        }
        if (b.attack === 'throw') {
            // RUMINAÇÃO/MEDO: novelos brancos EM VOCÊ — o FIO no tempo certo reflete
            const gap = medo ? 0.6 : 0.8;
            const total = medo ? 2 : 3;
            if (b.throwN < total && b.atkT >= gap * (b.throwN + 0.6)) {
                throwProjectile(b, p, medo ? 11 : 9.5);
                b.throwN++;
            }
            if (b.atkT >= gap * total + 1.0) { b.attack = null; b.phase = 'exposed'; b.timer = 1.6; }
            return;
        }
        if (b.attack === 'cocoon') {
            // ISOLAMENTO: blindado no alto; a saída é DESFAZER os dois pensamentos
            b.y += (3.0 - b.y) * Math.min(1, dt * 3);
            const alive = p.enemies.some((e) => !e.dead);
            if (!alive || b.atkT > 26) {
                b.shield = false; b.attack = null;
                b.y = 0; b.phase = 'exposed'; b.timer = 3.4;
            }
            return;
        }
        // sem ataque válido → respiro
        b.phase = 'mirror'; b.timer = 1.2;
        return;
    }

    if (b.phase === 'exposed') {
        // a fadiga DOURADA: fisgue-o, mantenha o fio tenso e crave a AGULHA
        b.timer -= dt;
        b.y += (0 - b.y) * Math.min(1, dt * 4);
        if (b.timer <= 0) { b.phase = 'mirror'; b.timer = Math.max(1.0, 2.2 - b.pattern * 0.14); }
        return;
    }
    if (b.phase === 'bound') {
        b.timer -= dt;
        if (p.bossTether && inp.grapple) {
            p.tension = clamp(p.tension + dt * (0.3 + Math.min(1, Math.abs(p.vx) / P8.RUN) * 0.7), 0, 1);
            b.x += (p.x + Math.sign(b.x - p.x) * 5.2 - b.x) * Math.min(1, dt * 2.5);
        }
        if (!inp.grapple || b.timer <= 0) { releaseThread(p); b.phase = 'exposed'; b.timer = 1.0; }
    }
}

export function stepPlayer(inp: P8Input, rawDt: number): P8Events {
    const p = p8, ev = emptyEvents();
    if (p.won) return ev;
    const dt = Math.min(rawDt, 0.05), m = curMem();
    const stitchDown = !!inp.stitch;
    const stitchPress = stitchDown && !p.stitchHeld;
    const grapplePress = inp.grapple && !p.grappleHeld;
    p.stitchHeld = stitchDown; p.grappleHeld = inp.grapple;
    const prevX = p.x;

    p.stun = Math.max(0, p.stun - dt); p.invuln = Math.max(0, p.invuln - dt);
    p.coyote = Math.max(0, p.coyote - dt); p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    p.grabCd = Math.max(0, p.grabCd - dt); p.stitchCd = Math.max(0, p.stitchCd - dt);
    p.stitchT = Math.max(0, p.stitchT - dt); p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.transition = Math.max(0, p.transition - dt); p.t += dt;
    if (p.patch) { p.patch.t -= dt; if (p.patch.t <= 0) p.patch = null; }
    if (inp.jump) p.jumpBuf = P8.JUMP_BUF;
    for (const e of p.enemies) { e.stunned = Math.max(0, e.stunned - dt); if (e.dead) e.deadT += dt; }

    // CONTRA-PONTO: um toque de FIO com um novelo branco perto REFLETE ele no
    // boss. Consome o toque (não vira fisgada).
    let parriedNow = false;
    if (grapplePress && p.boss) {
        for (const pr of p.boss.projectiles) {
            if (pr.dead || pr.reflected || !pr.parryable) continue;
            if (Math.hypot(pr.x - p.x, pr.y - (p.y + 0.9)) < P8.PARRY_R) {
                const b = p.boss;
                const dx = b.x - pr.x, dy = (b.y + 1.4) - pr.y, d = Math.hypot(dx, dy) || 0.001;
                pr.reflected = true; pr.vx = (dx / d) * 13.5; pr.vy = (dy / d) * 13.5;
                p.threadCharge = clamp(p.threadCharge + 0.15, 0, 1);
                p.grabCd = Math.max(p.grabCd, 0.25);
                ev.parried = true; parriedNow = true;
                break;
            }
        }
    }
    if (!parriedNow && inp.grapple && p.anchor === null && p.tetherEnemy === null && !p.bossTether && p.grabCd <= 0 && p.stun <= 0) {
        if (tryGrabEnemy(p, m) || tryGrabAnchor(p, m)) ev.grabbed = true;
    }
    if (!inp.grapple && (p.anchor !== null || p.tetherEnemy !== null || p.bossTether)) {
        releaseThread(p); p.vx *= P8.RELEASE_CARRY; ev.released = true;
    }

    if (p.anchor !== null) {
        const a = m.anchors[p.anchor];
        p.ropeLen = clamp(p.ropeLen - (P8.AUTO_REEL + inp.vert * P8.REEL) * dt, P8.MIN_ROPE, P8.MAX_ROPE);
        p.vy += P8.GRAV * dt;
        let dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy) || 0.0001;
        const tanx = -dy / d, tany = dx / d;
        p.vx += tanx * inp.move * P8.SWING_ACCEL * dt; p.vy += tany * inp.move * P8.SWING_ACCEL * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        dx = p.x - a.x; dy = p.y - a.y; d = Math.hypot(dx, dy) || 0.0001;
        if (d > p.ropeLen) {
            const nx = dx / d, ny = dy / d;
            p.x = a.x + nx * p.ropeLen; p.y = a.y + ny * p.ropeLen;
            const radial = p.vx * nx + p.vy * ny; p.vx -= radial * nx; p.vy -= radial * ny;
        }
        p.onGround = false; p.threadCharge = clamp(p.threadCharge + Math.abs(p.vx) * dt * 0.008, 0, 1);
        if (Math.abs(p.vx) > 0.1) p.facing = p.vx < 0 ? -1 : 1;
        const gh = groundAt(p.x, p.y);
        if (gh !== null && p.y <= gh + 0.02 && p.vy <= 0) {
            p.y = gh; p.vy = 0; p.onGround = true; releaseThread(p); ev.released = true; ev.landed = true;
        }
        if (p.anchor !== null && p.jumpBuf > 0) {
            releaseThread(p); p.vy += P8.RELEASE_BOOST; p.vx *= P8.RELEASE_CARRY;
            p.jumpBuf = 0; ev.released = true; ev.jumped = true;
        }
    } else {
        const ctrl = p.stun > 0 ? 0 : (p.onGround ? 1 : P8.AIR_CTRL);
        const target = clamp(inp.move, -1, 1) * P8.RUN;
        p.vx += (target - p.vx) * Math.min(1, P8.ACCEL * ctrl * dt);
        if (p.stun <= 0 && Math.abs(inp.move) > 0.12) p.facing = inp.move < 0 ? -1 : 1;
        if (p.jumpBuf > 0 && p.stun <= 0 && (p.onGround || p.coyote > 0)) {
            p.vy = P8.JUMP_V; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; ev.jumped = true;
        }
        p.vy += P8.GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const gh = groundAt(p.x, p.y);
        if (gh === null) {
            if (p.onGround) { p.onGround = false; p.coyote = P8.COYOTE; }
        } else if (p.y <= gh + 0.02 && p.vy <= 0) {
            if (!p.onGround && p.vy < -3) ev.landed = true;
            p.y = gh; p.vy = 0; p.onGround = true; p.lastGroundX = clamp(p.x, m.startX, m.goalX); p.lastGroundY = gh;
        } else if (p.onGround && p.y > gh + 0.06) { p.onGround = false; p.coyote = P8.COYOTE; }
    }

    // Rasgos fechados têm colisão própria; a arte e o motor usam o mesmo progresso.
    for (let i = 0; i < m.gates.length; i++) {
        if (p.gateProgress[i] >= m.gates[i].needed) continue;
        const gx = m.gates[i].x;
        if (prevX <= gx && p.x > gx - 0.52) { p.x = gx - 0.52; p.vx = Math.min(0, p.vx); }
        if (prevX >= gx && p.x < gx + 0.52) { p.x = gx + 0.52; p.vx = Math.max(0, p.vx); }
    }

    // Um fio preso em inimigo vira cabo de tensão, não pêndulo.
    if (p.tetherEnemy !== null) {
        const e = p.enemies[p.tetherEnemy];
        if (!e || e.dead) releaseThread(p);
        else {
            const dx = p.x - e.x, dy = (p.y + 0.9) - (e.y + 0.7), d = Math.hypot(dx, dy) || 1;
            e.x += dx / d * dt * (1.2 + p.tension * 2.8); e.y += dy / d * dt * 0.65;
            p.tension = clamp(p.tension + dt * (0.24 + Math.min(1, Math.abs(p.vx) / P8.RUN) * 0.72), 0, 1);
            e.stunned = Math.max(e.stunned, 0.12);
        }
    }

    p.x = clamp(p.x, -3, m.endX + 3);
    p.runPhase += (p.onGround ? Math.abs(p.vx) : 0) * dt * 1.6;
    if (p.y < P8.VOID_DY) { respawn(p, ev); p8Bump(); return ev; }

    // INVESTIDA DA AGULHA: AGULHA no ar + direção = arremetida perfurante com
    // i-frames curtos; atordoa/abre costura em inimigo e ESTOURA novelos.
    p.dashT = Math.max(0, p.dashT - dt); p.dashCd = Math.max(0, p.dashCd - dt);
    const wantDash = stitchPress && !p.onGround && Math.abs(inp.move) > 0.3
        && p.dashCd <= 0 && p.anchor === null && p.tetherEnemy === null && !p.bossTether && p.stun <= 0;
    if (wantDash) {
        p.dashT = P8.DASH_T; p.dashCd = P8.DASH_CD;
        p.facing = inp.move < 0 ? -1 : 1;
        p.vx = p.facing * P8.DASH_V; p.vy = Math.max(p.vy, 0.4);
        p.invuln = Math.max(p.invuln, 0.3);
        p.stitchT = 0.26; p.stitchCd = P8.STITCH_COOLDOWN;
        ev.dashed = true; ev.stitched = true;
    }
    if (p.dashT > 0) {
        p.vy = Math.max(p.vy, -1.5);              // a investida plana no ar
        for (const e of p.enemies) {
            if (e.dead || e.stunned > 0.9) continue;
            if (Math.hypot(p.x - e.x, (p.y + 0.8) - (e.y + 0.7)) < 1.15) {
                e.seams--; e.stunned = 1.2; ev.unravelled = true;
                if (e.seams <= 0) { e.dead = true; e.deadT = 0; p.threadCharge = clamp(p.threadCharge + 0.2, 0, 1); }
            }
        }
        if (p.boss) {
            for (const pr of p.boss.projectiles) {
                if (!pr.dead && Math.hypot(pr.x - p.x, pr.y - (p.y + 0.9)) < 1.15) {
                    pr.dead = true; p.threadCharge = clamp(p.threadCharge + 0.08, 0, 1); ev.popped = true;
                }
            }
        }
    }

    // novelos-coração (cura): caem, quicam de leve e esperam ser colhidos
    for (const pk of p.pickups) {
        pk.t += dt;
        const gh = groundAt(pk.x, pk.y) ?? 0;
        if (pk.y > gh + 0.35) { pk.vy -= 20 * dt; pk.y += pk.vy * dt; if (pk.y < gh + 0.35) { pk.y = gh + 0.35; pk.vy = 0; } }
        if (pk.t < 12 && Math.hypot(pk.x - p.x, pk.y - (p.y + 0.8)) < 0.95 && p.integrity < 3) {
            p.integrity++; pk.t = 99; ev.healed = true;
            p.threadCharge = clamp(p.threadCharge + 0.1, 0, 1);
            p8Bump();
        }
    }
    p.pickups = p.pickups.filter((pk) => pk.t < 12);

    if (stitchPress && !wantDash && p.stitchCd <= 0 && p.stun <= 0) performStitch(p, m, ev);

    if (p.stun <= 0) {
        for (const h of m.hazards) {
            if (Math.abs(p.x - h.x) < HAZARD_HALF && p.y < h.y + HAZARD_H && p.y > h.y - 0.9) {
                respawn(p, ev); ev.hurt = true; p8Bump(); return ev;
            }
        }
    }

    for (let i = 0; i < p.enemies.length; i++) {
        const e = p.enemies[i], def = m.enemies[i], kind = def.kind ?? 'knotling';
        if (e.dead || e.tethered) continue;
        e.aiT += dt;
        if (e.stunned <= 0) {
            if (kind === 'echo') {
                const center = (def.x0 + def.x1) / 2;
                const desired = clamp(center - (p.x - center) * 0.34, def.x0, def.x1);
                e.x += (desired - e.x) * Math.min(1, dt * def.speed * 1.4); e.dir = p.facing * -1;
            } else {
                e.x += e.dir * def.speed * dt;
                if (e.x < def.x0) { e.x = def.x0; e.dir = 1; }
                if (e.x > def.x1) { e.x = def.x1; e.dir = -1; }
            }
        }
        if (kind === 'intrusive') {
            e.y = def.y + Math.sin(e.aiT * 1.8 + i) * (def.amplitude ?? 1);
            e.attackT -= dt;
            if (e.attackT <= 0 && Math.abs(e.x - p.x) < 8) {
                e.x += Math.sign(p.x - e.x) * dt * 8; e.y += Math.sign(p.y + 1 - e.y) * dt * 5;
                if (e.attackT < -0.65) e.attackT = 1.5 + (i % 3) * 0.3;
            }
        } else e.y = def.y;

        const dx = Math.abs(p.x - e.x), dy = Math.abs((p.y + 0.75) - (e.y + 0.75));
        if (dx < (kind === 'intrusive' ? 0.72 : 0.66) && dy < 0.95) {
            if (kind === 'knotling' && p.vy < -1 && p.y > e.y + 0.58) {
                e.seams--; e.stunned = 1.2; p.vy = 7.4; p.onGround = false; ev.stomped = true;
                if (e.seams <= 0) { e.dead = true; e.deadT = 0; ev.unravelled = true; }
            } else hurtPlayer(p, ev, e.x);
        }
    }

    updateBoss(p, inp, dt, ev);

    if (p.beatT > 0) { p.beatT -= dt; if (p.beatT <= 0) { p.beatText = null; p8Bump(); } }
    if (p.beatIdx < m.beats.length && p.x >= m.beats[p.beatIdx].x) {
        p.beatText = m.beats[p.beatIdx].text; p.beatT = 5.5; p.beatIdx++; ev.beat = true; p8Bump();
    }

    m.spools.forEach((s, i) => {
        if (!p.gotSpools[i] && Math.hypot(p.x - s.x, (p.y + 0.7) - s.y) < SPOOL_R) {
            p.gotSpools[i] = true; p.spools++; p.threadCharge = clamp(p.threadCharge + 0.34, 0, 1); ev.collected++;
        }
    });

    if (!m.boss && p.x >= m.goalX && p.onGround) {
        if (p.memIdx < MEMORIES.length - 1) {
            Object.assign(p, freshFor(p.memIdx + 1)); ev.advanced = true; p8Bump();
        } else finishMemory(p, ev);
        return ev;
    }

    if (ev.collected || ev.grabbed || ev.released || ev.stitched || ev.unravelled || ev.hurt || ev.parried || ev.bossSeam) p8Bump();
    return ev;
}

export function activeAnchor(): Vec2 | null { return p8.anchor !== null ? curMem().anchors[p8.anchor] : null; }
export function activeThreadTarget(): Vec2 | null {
    if (p8.tetherEnemy !== null) {
        const e = p8.enemies[p8.tetherEnemy]; return e ? { x: e.x, y: e.y + 0.8 } : null;
    }
    if (p8.bossTether && p8.boss) return { x: p8.boss.x, y: p8.boss.y + 1.3 };
    return activeAnchor();
}
export function p8Objective(): string {
    if (p8.won) return 'VOCÊ NÃO SE VENCEU. VOCÊ SE REFEZ.';
    if (p8.boss && p8.boss.phase !== 'dormant') return `YOURSELF · ${p8.boss.seams} COSTURAS ABERTAS`;
    return `${curMem().title} · ${curMem().mechanic}`;
}
