/**
 * ai/perfGovernor.ts — Adaptive performance governor (game-wide).
 *
 * The web analogue of a dynamic-resolution / DLSS "adaptive" mode: a single
 * probe samples frame time every frame and exposes a smoothed 0..1 `budget`
 * (1 = plenty of headroom, → floor = struggling). Per-frame systems read it to
 * scale their OWN cost up or down to defend the frame rate, instead of every
 * subsystem guessing in isolation:
 *
 *   • Boids flock widens its time-slice stride under load (recompute fewer
 *     fish per frame).
 *   • Particle / sprite updates throttle when the budget drops.
 *
 * Reactive r3f tools (PerformanceMonitor + AdaptiveDpr) already drop the render
 * resolution; this governor complements them by trimming CPU-side simulation
 * cost, which resolution scaling alone can't touch.
 */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

class PerfGovernor {
    /** 0..1 — current performance headroom. */
    budget = 1;
    /** Smoothed frames-per-second estimate. */
    fps = 60;

    private emaMs = 16.7;

    /** Call once per frame with the frame delta (seconds). */
    tick(dt: number): void {
        const ms = Math.min(dt, 0.1) * 1000;
        this.emaMs += (ms - this.emaMs) * 0.1;      // smooth frame time
        this.fps = 1000 / this.emaMs;
        // Map frame time → budget: ≤20ms (50fps+) full, ≥40ms (25fps) floor.
        const t = (this.emaMs - 20) / 20;
        const target = clamp(1 - t, 0.35, 1);
        this.budget += (target - this.budget) * 0.05; // slow to avoid oscillation
    }

    /** Stride for time-sliced loops: 2 with headroom, up to 4 under load. */
    get stride(): number {
        if (this.budget > 0.80) return 2;
        if (this.budget > 0.55) return 3;
        return 4;
    }
}

export const perfGovernor = new PerfGovernor();
