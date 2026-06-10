/**
 * f5Race.ts — FLOOR 5: "A CORRIDA" (Nintendo-64 era race against the robot).
 *
 * The single source of truth for the race: phase machine, the TRACK layout
 * (two mirrored lanes), every hazard's math, and the shared racer physics —
 * the player and the robot run the EXACT same integrator over the same
 * hazard clock, so the race is provably fair.
 *
 * Pure module (no three/react imports) so the AI, the scene meshes and the
 * HUD all read one clock and one layout.
 */

// ── Phase machine ─────────────────────────────────────────────────────────────
export type F5Phase =
    | 'intro'       // 1st person inside the elevator, doors opening
    | 'talk'        // the robot hops in and pitches the race (speech bubbles)
    | 'reveal'      // camera pulls OUT of the player's eyes → 3rd person
    | 'walk'        // free roam to the start line
    | 'countdown'   // 3·2·1·JÁ
    | 'race'        // green light
    | 'finish';     // someone crossed — podium talk, rematch/leave

export interface F5State {
    phase: F5Phase;
    clock: number;                    // hazard clock (runs from mount, never resets)
    raceT: number;                    // seconds since JÁ (current heat)
    countT: number;                   // seconds into the countdown
    winner: 'player' | 'robot' | null;
    wins: { player: number; robot: number };
    talkLine: number;                 // current speech-bubble index
    version: number;                  // bump → React re-render
}

export const f5: F5State = {
    phase: 'intro', clock: 0, raceT: 0, countT: 0,
    winner: null, wins: { player: 0, robot: 0 }, talkLine: 0, version: 0,
};

let onChange: (() => void) | null = null;
export function f5SetOnChange(fn: (() => void) | null): void { onChange = fn; }
export function f5Bump(): void { f5.version++; onChange?.(); }

export function f5Reset(): void {
    f5.phase = 'intro'; f5.clock = 0; f5.raceT = 0; f5.countT = 0;
    f5.winner = null; f5.wins = { player: 0, robot: 0 }; f5.talkLine = 0;
    f5Bump();
}

// ── The robot's script (talk-phase bubbles + podium lines) ───────────────────
export const F5_TALK: ReadonlyArray<string> = [
    'BIP-BUP! UM HÓSPEDE!! Faz 412 dias, 7 horas e 3 minutos que ninguém aperta o botão deste andar!',
    'Eu sou o TROCO-64, robô de recreação oficial do hotel! Minha única função registrada: CORRIDA!',
    'Duas pistas, dois corredores! Você na pista AZUL, eu na VERMELHA! O primeiro a cruzar a linha VENCE!',
    'Cuidado com os obstáculos… eu mesmo instalei cada um. BIP! Vá até a LARGADA quando estiver pronto!',
];
export const F5_WIN_PLAYER = 'PROCESSANDO RESULTADO… VOCÊ VENCEU!! Recalibrando meu orgulho… BIP. Foi a melhor corrida em 412 dias!';
export const F5_WIN_ROBOT = 'VITÓRIA DO TROCO-64! Hehehe… BIP! Não fique triste, hóspede — até meus erros são programados. REVANCHE?';

// ── Track layout (z runs forward; lanes mirrored about x=0) ──────────────────
export const LANE_PLAYER = -5.5;
export const LANE_ROBOT = 5.5;
export const LANE_HALF = 4.0;         // playable half-width inside each lane
export const PLAZA = { x0: -10.5, x1: 10.5, z0: -16.9, z1: -0.4 };   // pre-race roam (z0 inside the cab)
export const START_Z = 0;
export const FINISH_Z = 152;

// hazards (per lane; x offsets are relative to the lane center)
export const SPINNERS = [
    { z: 18, speed: 1.7, dir: 1, len: 3.7 },
    { z: 118, speed: 2.4, dir: -1, len: 3.7 },
] as const;
export const PUSHERS = [
    { z: 32, phase: 0.0 }, { z: 36.5, phase: 2.1 }, { z: 41, phase: 4.2 },
] as const;
export const PUSHER = { amp: 2.9, w: 1.5, halfW: 1.35, halfD: 0.95, height: 1.6 };
export const GAP = {
    z0: 52, z1: 64,
    // pads overlap laterally (|dx| spread < width) so a straight-ish hop can
    // always land — the zigzag is a steer, not a leap of faith
    pads: [{ z: 54, dx: -1.2 }, { z: 57.8, dx: 1.2 }, { z: 61.6, dx: 0 }],
    halfW: 2.0, halfD: 1.35, foamY: -2.4,
} as const;
export const HAMMER = { z: 76, w: 2.1, amp: 1.06, armLen: 3.3, headR: 1.25, pivotY: 4.4 } as const;
export const BALLS = {
    z0: 86, z1: 110, speed: 7.0, spacing: 6.0, r: 0.95,
    dxs: [-2.5, 0.9, -1.0, 2.5],      // each ball's own track across the lane
} as const;
export const STEPS = [
    { z0: 124, h: 0.7 }, { z0: 128, h: 1.4 }, { z0: 132, h: 2.1 },
] as const;
export const STEP_PLATEAU_END = 138, STEP_RAMP_END = 146;

/** Ground height under (xRel, z) — xRel relative to the LANE CENTER.
 *  Returns null over the gap (you fall into the foam). */
export function groundHeightAt(xRel: number, z: number): number | null {
    if (z >= GAP.z0 && z < GAP.z1) {
        for (const p of GAP.pads) {
            if (Math.abs(z - p.z) < GAP.halfD && Math.abs(xRel - p.dx) < GAP.halfW) return 0;
        }
        return null;
    }
    if (z >= STEPS[0].z0 && z < STEP_RAMP_END) {
        let h = 0;
        for (const s of STEPS) if (z >= s.z0) h = s.h;
        if (z >= STEP_PLATEAU_END) h = STEPS[2].h * (1 - (z - STEP_PLATEAU_END) / (STEP_RAMP_END - STEP_PLATEAU_END));
        return h;
    }
    return 0;
}

/** Each rolling ball's live position (xRel, z) at hazard-clock `t`. */
export function ballsAt(t: number): Array<{ x: number; z: number }> {
    const span = BALLS.z1 - BALLS.z0;
    const n = Math.ceil(span / BALLS.spacing) + 1;
    const out: Array<{ x: number; z: number }> = [];
    for (let k = 0; k < n; k++) {
        const zz = BALLS.z1 - ((t * BALLS.speed + k * BALLS.spacing) % (n * BALLS.spacing));
        if (zz < BALLS.z0 - 1 || zz > BALLS.z1) continue;
        out.push({ x: BALLS.dxs[k % BALLS.dxs.length], z: zz });
    }
    return out;
}

/** Live hazard test at hazard-clock `t`. Position is lane-relative (xRel, y, z).
 *  Returns a knock velocity if something hit, else null. */
export function hazardHit(xRel: number, y: number, z: number, t: number):
    { vx: number; vy: number; vz: number } | null {
    // spinners: a bar sweeping the lane at knee height
    for (const sp of SPINNERS) {
        if (Math.abs(z - sp.z) > sp.len + 0.6 || y > 1.15) continue;
        const a = t * sp.speed * sp.dir;
        const bx = Math.cos(a), bz = Math.sin(a);
        const proj = xRel * bx + (z - sp.z) * bz;                  // along the bar
        if (proj < -sp.len || proj > sp.len) continue;
        const perp = -xRel * bz + (z - sp.z) * bx;                 // distance off the bar
        if (Math.abs(perp) < 0.62) {
            const s = sp.speed * sp.dir * (perp >= 0 ? 1 : -1);    // fling along the sweep
            return { vx: -bz * s * 4.4, vy: 5.2, vz: bx * s * 4.4 };
        }
    }
    // pushers: blocks sliding across the lane
    for (const p of PUSHERS) {
        const bx = Math.sin(t * PUSHER.w + p.phase) * PUSHER.amp;
        if (y < PUSHER.height && Math.abs(xRel - bx) < PUSHER.halfW + 0.3 && Math.abs(z - p.z) < PUSHER.halfD + 0.3) {
            const dir = Math.cos(t * PUSHER.w + p.phase) >= 0 ? 1 : -1;
            return { vx: dir * 7.5, vy: 3.6, vz: -2.2 };
        }
    }
    // the hammer: a wrecking ball swinging across the lane
    {
        const th = Math.sin(t * HAMMER.w) * HAMMER.amp;
        const hx = Math.sin(th) * HAMMER.armLen;
        const hy = HAMMER.pivotY - Math.cos(th) * HAMMER.armLen;
        const dx = xRel - hx, dy = (y + 0.8) - hy, dz = z - HAMMER.z;
        if (dx * dx + dy * dy + dz * dz < (HAMMER.headR + 0.45) ** 2) {
            const sweep = Math.cos(t * HAMMER.w) >= 0 ? 1 : -1;
            return { vx: sweep * 8.5, vy: 6.0, vz: -2.5 };
        }
    }
    // rolling balls
    for (const b of ballsAt(t)) {
        const dx = xRel - b.x, dz = z - b.z;
        if (y < BALLS.r * 2 && dx * dx + dz * dz < (BALLS.r + 0.5) ** 2) {
            return { vx: dx * 4, vy: 5.5, vz: -8.0 };
        }
    }
    return null;
}

// ── Shared racer physics — ONE integrator for player and robot ───────────────
export interface Racer {
    x: number; y: number; z: number;          // world position (x absolute)
    vx: number; vy: number; vz: number;
    lane: number;                             // lane center (LANE_PLAYER / LANE_ROBOT)
    onGround: boolean;
    stun: number;                             // >0 → tumbling, no control
    coyote: number;
    facing: number;                           // yaw the model should ease toward
    runPhase: number;                         // drives the run-cycle animation
}

export function makeRacer(lane: number, x: number, z: number): Racer {
    return { x, y: 0, z, vx: 0, vy: 0, vz: 0, lane, onGround: true, stun: 0, coyote: 0, facing: 0, runPhase: 0 };
}

export interface RacerInput { mx: number; mz: number; jump: boolean }
export interface StepEvents { hit: boolean; landed: boolean; jumped: boolean; fellRespawn: boolean }

const RUN_SPEED = 8.0, ACCEL = 34, AIR_CTRL = 0.55, GRAV = -26, JUMP_V = 9.4;

/** One physics tick. `freeRoam` = pre-race plaza rules (no hazards, plaza
 *  bounds); otherwise lane rules + the live hazards at clock `t`. */
export function stepRacer(r: Racer, inp: RacerInput, dt: number, t: number, freeRoam: boolean, speedMul = 1): StepEvents {
    const ev: StepEvents = { hit: false, landed: false, jumped: false, fellRespawn: false };
    r.stun = Math.max(0, r.stun - dt);
    r.coyote = Math.max(0, r.coyote - dt);

    // drive
    const ctrl = r.stun > 0 ? 0 : (r.onGround ? 1 : AIR_CTRL);
    const il = Math.hypot(inp.mx, inp.mz);
    const nx = il > 1 ? inp.mx / il : inp.mx, nz = il > 1 ? inp.mz / il : inp.mz;
    const tvx = nx * RUN_SPEED * speedMul, tvz = nz * RUN_SPEED * speedMul;
    r.vx += (tvx - r.vx) * Math.min(1, ACCEL * ctrl * dt) * (r.stun > 0 ? 0.1 : 1);
    r.vz += (tvz - r.vz) * Math.min(1, ACCEL * ctrl * dt) * (r.stun > 0 ? 0.1 : 1);
    if (r.stun <= 0 && il > 0.15) r.facing = Math.atan2(r.vx, r.vz);

    // jump
    if (inp.jump && r.stun <= 0 && (r.onGround || r.coyote > 0)) {
        r.vy = JUMP_V; r.onGround = false; r.coyote = 0; ev.jumped = true;
    }
    r.vy += GRAV * dt;

    // integrate
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;

    // bounds
    if (freeRoam) {
        r.x = Math.min(PLAZA.x1, Math.max(PLAZA.x0, r.x));
        r.z = Math.min(PLAZA.z1, Math.max(PLAZA.z0, r.z));
    } else {
        r.x = Math.min(r.lane + LANE_HALF, Math.max(r.lane - LANE_HALF, r.x));
        r.z = Math.min(FINISH_Z + 16, Math.max(-15.2, r.z));
    }

    // ground
    const xRel = r.x - r.lane;
    const gh = freeRoam ? 0 : groundHeightAt(xRel, r.z);
    if (gh === null) {
        // over the gap — foam pit catches, then back to the start of the section
        if (r.y <= GAP.foamY) {
            r.x = r.lane; r.y = 0; r.z = GAP.z0 - 1.6;
            r.vx = 0; r.vy = 0; r.vz = 0; r.stun = 0.55; r.onGround = true;
            ev.fellRespawn = true;
        }
        if (r.onGround) { r.onGround = false; r.coyote = 0.1; }
    } else {
        // auto-step tiny ledges; real steps need the jump
        if (r.y <= gh + 0.01) {
            if (r.vy <= 0) {
                if (!r.onGround && r.vy < -3) ev.landed = true;
                if (gh - r.y > 1.0) { r.z -= r.vz * dt; }          // walked into a tall step — blocked
                else r.y = gh;
                if (r.y >= gh - 0.01) { r.y = Math.max(r.y, gh); r.vy = 0; r.onGround = true; }
            }
        } else if (r.onGround && r.y > gh + 0.05) {
            r.onGround = false; r.coyote = 0.12;                   // ran off an edge
        }
    }

    // hazards (race sections only)
    if (!freeRoam && r.stun <= 0 && r.z > 2) {
        const k = hazardHit(xRel, r.y, r.z, t);
        if (k) {
            r.vx = k.vx; r.vy = k.vy; r.vz = k.vz;
            r.stun = 0.95; r.onGround = false; ev.hit = true;
        }
    }

    // animation phase
    const sp = Math.hypot(r.vx, r.vz);
    r.runPhase += sp * dt * 1.65;
    return ev;
}
