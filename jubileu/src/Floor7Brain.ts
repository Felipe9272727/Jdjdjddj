// Floor7Brain.ts — typed bridge over the WebAssembly module (floor7.c +
// floor7_asm.s). ALL of Floor 7's logic/motion/quest lives in the WASM; this
// just instantiates it and exposes a clean API the renderer reads each frame.
//
// The module is tiny (~3KB) so it compiles synchronously — no async to thread
// through the render loop.

import { decodeFloor7Wasm } from './floor7-wasm';

export const F7_STATE = {
    INTRO: 0, GREET: 1, FETCH: 2, CLEAN: 3, DONE: 4,
} as const;

export interface F7Puddle { x: number; z: number; r: number; prog: number; cell?: Float32Array; }

interface F7Exports {
    memory: WebAssembly.Memory;
    f7_init(seed: number): void;
    f7_tick(dt: number, px: number, py: number, pz: number, interact: number): void;
    f7_heave(): number; f7_pitch(): number; f7_roll(): number;
    f7_state(): number; f7_dialogue(): number;
    f7_capX(): number; f7_capZ(): number; f7_capFace(): number; f7_capBob(): number; f7_capWalk(): number;
    f7_bucX(): number; f7_bucZ(): number; f7_bucHeld(): number;
    f7_elevFade(): number;
    f7_npud(): number; f7_cleaned(): number; f7_can_leave(): number; f7_clean_pct(): number;
    f7_puddles(): number;
}

export class Floor7Brain {
    private e: F7Exports;
    private f32: Float32Array;
    readonly npud: number;
    private pudPtr: number;

    constructor() {
        const bytes = decodeFloor7Wasm();
        const mod = new WebAssembly.Module(bytes);
        const inst = new WebAssembly.Instance(mod, {});
        this.e = inst.exports as unknown as F7Exports;
        this.e.f7_init((Math.random() * 0xffffffff) >>> 0);
        this.f32 = new Float32Array(this.e.memory.buffer);
        this.npud = this.e.f7_npud();
        this.pudPtr = this.e.f7_puddles() >> 2; // byte offset -> f32 index
    }

    /** Re-seed / restart the floor (e.g. on re-entry). */
    reset(seed?: number): void {
        this.e.f7_init(seed ?? ((Math.random() * 0xffffffff) >>> 0));
        // memory could have grown; re-view + re-read the puddle pointer
        this.f32 = new Float32Array(this.e.memory.buffer);
        this.pudPtr = this.e.f7_puddles() >> 2;
    }

    /** Advance the simulation one frame. */
    tick(dt: number, px: number, py: number, pz: number, interact: boolean): void {
        this.e.f7_tick(dt, px, py, pz, interact ? 1 : 0);
    }

    heave(): number { return this.e.f7_heave(); }
    pitch(): number { return this.e.f7_pitch(); }
    roll(): number { return this.e.f7_roll(); }
    state(): number { return this.e.f7_state(); }
    dialogue(): number { return this.e.f7_dialogue(); }
    captain(): { x: number; z: number; face: number; bob: number } {
        return { x: this.e.f7_capX(), z: this.e.f7_capZ(), face: this.e.f7_capFace(), bob: this.e.f7_capBob() };
    }
    capWalking(): boolean { return this.e.f7_capWalk() !== 0; }
    bucket(): { x: number; z: number; held: boolean } {
        return { x: this.e.f7_bucX(), z: this.e.f7_bucZ(), held: this.e.f7_bucHeld() === 1 };
    }
    elevFade(): number { return this.e.f7_elevFade(); }
    cleaned(): number { return this.e.f7_cleaned(); }
    cleanPct(): number { return this.e.f7_clean_pct(); }
    canLeave(): boolean { return this.e.f7_can_leave() === 1; }

    /** Read puddle i (x,z,r,prog + 4x4 wetness cells) out of WASM memory.
     *  Struct stride is 20 floats: {x,z,r,prog, cell[16]}. */
    puddle(i: number, out: F7Puddle): F7Puddle {
        const o = this.pudPtr + i * 20;
        out.x = this.f32[o]; out.z = this.f32[o + 1]; out.r = this.f32[o + 2]; out.prog = this.f32[o + 3];
        if (out.cell) for (let c = 0; c < 16; c++) out.cell[c] = this.f32[o + 4 + c];
        return out;
    }
}
