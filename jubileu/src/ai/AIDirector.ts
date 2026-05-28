/**
 * ai/AIDirector.ts — Adaptive drama manager + spatial-memory predator AI.
 *
 * Two AI techniques in one self-contained module:
 *
 *  1. DIRECTOR (Left 4 Dead "AI Director" style dynamic difficulty / pacing).
 *     Estimates the player's live stress (tension) and skill, then runs a
 *     build-up → peak → fade → respite cycle. Instead of a constant chase it
 *     deliberately gives the player relief windows so the next assault lands
 *     harder, and it sharpens the predator for skilled players. Outputs a set
 *     of directives (huntMult / perceptionMult / aggression / intensity) that
 *     the shark reads every frame.
 *
 *  2. OCCUPANCY GRID (probabilistic spatial memory). A coarse XZ grid holds the
 *     likelihood the player is in each cell. Sightings spike a cell to 1; the
 *     whole map decays over time. When the shark loses the player it searches
 *     the highest-probability cell — believable predator hunting instead of
 *     teleport-to-last-known-point.
 *
 * Pure logic, zero per-frame allocation. `intensity` doubles as the drive
 * signal for the adaptive-audio layer.
 */

import * as THREE from 'three';

export type DirectorPhase = 'buildup' | 'peak' | 'fade' | 'respite';

export interface DirectorInput {
    dt:          number;
    dist:        number;   // shark → player distance
    awareness:   number;   // normalising distance for threat
    perceived:   boolean;  // shark currently senses the player (vision/hearing)
    alertness:   number;   // 0..1 perception meter
    playerSpeed: number;   // player movement noise
    shards:      number;   // collected count (proxy for progress/skill)
    inLunge:     boolean;
    berserk:     boolean;
    px:          number;
    pz:          number;
}

// ─── Occupancy grid layout ──────────────────────────────────────────────────
const GRID_N    = 8;
const GRID_MIN  = -28;
const GRID_SPAN = 56;
const CELL      = GRID_SPAN / GRID_N;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class AIDirector {
    // ── Directives (read by the predator each frame) ──
    huntMult       = 1;   // multiplies hunt speed
    perceptionMult = 1;   // multiplies vision + hearing range
    aggression     = 1;   // lunge willingness / approach tightness
    intensity      = 0;   // smoothed drama level 0..1 (also drives adaptive audio)

    // ── Observable internal state ──
    phase:   DirectorPhase = 'respite';
    tension = 0;          // estimated player stress 0..1
    skill   = 0.45;       // estimated player skill 0..1

    private phaseTimer     = 0;
    private survivedLunges = 0;
    private lungeLatch     = false;
    private occ            = new Float32Array(GRID_N * GRID_N);

    reset(): void {
        this.huntMult = 1; this.perceptionMult = 1; this.aggression = 1;
        this.intensity = 0; this.phase = 'respite'; this.tension = 0;
        this.skill = 0.45; this.phaseTimer = 0; this.survivedLunges = 0;
        this.lungeLatch = false; this.occ.fill(0);
    }

    private cellIndex(x: number, z: number): number {
        const cx = clamp(Math.floor((x - GRID_MIN) / CELL), 0, GRID_N - 1);
        const cz = clamp(Math.floor((z - GRID_MIN) / CELL), 0, GRID_N - 1);
        return cz * GRID_N + cx;
    }

    /** Highest-probability search location → `out` (XZ). Returns its weight. */
    getSearchTarget(out: THREE.Vector3): number {
        let best = -1, bi = 0;
        for (let i = 0; i < this.occ.length; i++) {
            if (this.occ[i] > best) { best = this.occ[i]; bi = i; }
        }
        const cx = bi % GRID_N;
        const cz = Math.floor(bi / GRID_N);
        out.x = GRID_MIN + (cx + 0.5) * CELL;
        out.z = GRID_MIN + (cz + 0.5) * CELL;
        return best;
    }

    update(input: DirectorInput): void {
        const dt = Math.min(input.dt, 0.05);

        // ── 1. Occupancy grid (spatial memory) ──────────────────────────────
        const decay = Math.exp(-0.22 * dt);
        for (let i = 0; i < this.occ.length; i++) this.occ[i] *= decay;
        if (input.perceived) this.occ[this.cellIndex(input.px, input.pz)] = 1;

        // ── 2. Skill estimation ─────────────────────────────────────────────
        // Surviving a lunge (was lunging, now clear) rewards player skill.
        if (input.inLunge) {
            this.lungeLatch = true;
        } else if (this.lungeLatch) {
            this.lungeLatch = false;
            if (input.dist > 4) this.survivedLunges++;
        }
        const skillTarget = clamp(0.30 + input.shards * 0.09 + this.survivedLunges * 0.06, 0, 1);
        this.skill += (skillTarget - this.skill) * dt * 0.5;

        // ── 3. Tension estimation (player stress) ───────────────────────────
        const proxThreat = input.perceived ? clamp(1 - input.dist / input.awareness, 0, 1) : 0;
        let tensionTarget = proxThreat * 0.7 + input.alertness * 0.3;
        if (input.inLunge) tensionTarget = 1;
        const tRate = tensionTarget > this.tension ? 3.5 : 0.6; // spike fast, ease slow
        this.tension += (tensionTarget - this.tension) * Math.min(1, dt * tRate);

        // ── 4. Drama pacing FSM ─────────────────────────────────────────────
        this.phaseTimer -= dt;
        switch (this.phase) {
            case 'respite':
                if (this.phaseTimer <= 0) this.phase = 'buildup';
                break;
            case 'buildup':
                if (this.tension > 0.78) {
                    this.phase = 'peak';
                    this.phaseTimer = 4.0 + this.skill * 5.0; // skilled → longer peak
                }
                break;
            case 'peak':
                if (this.phaseTimer <= 0) { this.phase = 'fade'; this.phaseTimer = 3.0; }
                break;
            case 'fade':
                if (this.phaseTimer <= 0) {
                    this.phase = 'respite';
                    this.phaseTimer = 7.0 - this.skill * 4.0; // skilled → shorter rest
                }
                break;
        }

        // ── 5. Intensity + directives ───────────────────────────────────────
        let intTarget: number;
        switch (this.phase) {
            case 'respite': intTarget = 0.12; break;
            case 'buildup': intTarget = 0.45 + this.skill * 0.20; break;
            case 'peak':    intTarget = 1.0;  break;
            case 'fade':    intTarget = 0.5;  break;
        }
        if (input.berserk) intTarget = 1;
        this.intensity += (intTarget - this.intensity) * Math.min(1, dt * 1.5);

        this.huntMult       = 0.75 + this.intensity * 0.60 + this.skill * 0.15;
        this.perceptionMult = 0.80 + this.intensity * 0.45 + this.skill * 0.15;
        this.aggression     = this.phase === 'peak' ? 1.4 : this.phase === 'respite' ? 0.7 : 1.0;
        if (input.berserk) {
            this.huntMult   = Math.max(this.huntMult, 1.5);
            this.aggression = Math.max(this.aggression, 1.4);
        }
    }
}

// Singleton for the Floor 2 shark. (The class is reusable for any predator.)
export const sharkDirector = new AIDirector();
