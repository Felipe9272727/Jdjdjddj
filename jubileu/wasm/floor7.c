/*
 * floor7.c — THE BRAIN OF FLOOR 7 (the pirate ship), compiled to WebAssembly.
 *
 * 100% of the floor's simulation lives here in C (+ the hand-written assembly in
 * floor7_asm.s): the ship's motion on the sea, the elevator vanish, the captain
 * who walks in and gives the quest, the bucket pickup, and the floor-cleaning of
 * the puddles. The TS/Three.js layer only READS the numbers this module computes
 * and draws meshes at them — no game logic on the JS side.
 *
 * Freestanding (no libc): math primitives come from floor7_asm.s + builtins.
 *
 * Build:  clang --target=wasm32 -nostdlib -O2 -Wl,--no-entry -Wl,--export-dynamic
 */

/* ---- primitives from the hand-written WASM assembly (floor7_asm.s) ---- */
extern float f7_sinp(float x);          /* sine polynomial, x in [-pi,pi]      */
extern float f7_inv_len2(float dx, float dz); /* 1/sqrt(dx^2+dz^2), guarded     */

#define PI    3.14159265f
#define TWOPI 6.28318531f
#define DECKY 0.0f          /* deck plane height the player walks on            */

/* range-reduce to [-pi,pi] then evaluate the asm polynomial */
static float f7_sin(float x) {
    /* x = x - 2pi*round(x/2pi) */
    float k = x * (1.0f / TWOPI);
    /* round to nearest via add/sub of a big float is unreliable in wasm32;
       use truncation toward zero then correct */
    int n = (int)(k + (k >= 0.0f ? 0.5f : -0.5f));
    x = x - (float)n * TWOPI;
    if (x > PI) x -= TWOPI;
    else if (x < -PI) x += TWOPI;
    return f7_sinp(x);
}
static float f7_cos(float x) { return f7_sin(x + PI * 0.5f); }
static float f7_absf(float x) { return x < 0.0f ? -x : x; }
static float f7_clamp01(float x) { return x < 0.0f ? 0.0f : (x > 1.0f ? 1.0f : x); }
static float f7_atan2_like(float y, float x); /* forward decl (defined below) */

/* ---- tiny deterministic RNG (xorshift32) ---- */
static unsigned int g_rng = 0x1234567u;
static float frand(void) {           /* [0,1) */
    g_rng ^= g_rng << 13; g_rng ^= g_rng >> 17; g_rng ^= g_rng << 5;
    return (float)(g_rng & 0xFFFFFF) / (float)0x1000000;
}

/* ---- quest states ---- */
enum {
    ST_INTRO = 0,   /* elevator vanishing, captain striding over from the bow */
    ST_GREET = 1,   /* captain talks, asks for the bucket+cloth              */
    ST_FETCH = 2,   /* player must reach the bucket and grab it              */
    ST_CLEAN = 3,   /* mop the puddles                                       */
    ST_DONE  = 4    /* all clean — nothing left to do, and no way out (yet)  */
};

#define NPUD 6
typedef struct { float x, z, r, prog; } Puddle; /* prog 0..1 cleaned */

/* ---- the whole floor state ---- */
static struct {
    float t;            /* elapsed sim time                         */
    float heave, pitch, roll; /* ship body transform (y, x-rot, z-rot) */
    int   state;
    float stTimer;      /* time in current state                    */
    /* captain */
    float capX, capZ, capFace, capBob;
    /* bucket */
    float bucX, bucZ;
    int   bucHeld;
    /* puddles */
    Puddle pud[NPUD];
    int   cleaned;
    /* presentation */
    float elevFade;     /* 1 -> 0 as the elevator dematerialises     */
    int   dialogue;     /* id the UI shows (0 none)                  */
    int   prevInteract;
} S;

/* spawn / layout anchors (deck-local ~= world; sway is small) */
#define CAP_BOW_Z   (-6.0f)
#define CAP_TALK_Z  ( 2.2f)
#define CAP_X       ( 0.6f)

__attribute__((export_name("f7_init")))
void f7_init(unsigned int seed) {
    g_rng = seed ? seed : 0x1234567u;
    S.t = 0.0f; S.state = ST_INTRO; S.stTimer = 0.0f;
    S.heave = S.pitch = S.roll = 0.0f;
    S.capX = CAP_X; S.capZ = CAP_BOW_Z; S.capFace = 0.0f; S.capBob = 0.0f;
    S.bucX = 1.35f; S.bucZ = -1.8f; S.bucHeld = 0;
    S.cleaned = 0; S.elevFade = 1.0f; S.dialogue = 0; S.prevInteract = 0;
    /* scatter puddles across the WALKABLE deck — inside the bulwark with room
       for the player to stand on them, clear of the centre-lane structures and
       the bow/stern. Radii kept small so they never poke past the rail. */
    for (int i = 0; i < NPUD; i++) {
        float x = (frand() * 2.6f) - 1.3f;
        float z = (frand() * 8.0f) - 3.9f;
        if (f7_absf(x) < 0.55f) x += (x < 0 ? -0.6f : 0.6f);
        S.pud[i].x = x; S.pud[i].z = z;
        S.pud[i].r = 0.45f + frand() * 0.35f;
        S.pud[i].prog = 0.0f;
    }
}

/* advance one frame.  interact = 1 while the action button is held. */
__attribute__((export_name("f7_tick")))
void f7_tick(float dt, float px, float py, float pz, int interact) {
    if (dt > 0.05f) dt = 0.05f;        /* clamp tab-switch spikes */
    S.t += dt; S.stTimer += dt;
    int rising = (interact && !S.prevInteract);
    S.prevInteract = interact;

    /* --- ship rides the swell (all from the asm sine) --- */
    S.heave = f7_sin(S.t * 1.05f) * 0.18f + f7_sin(S.t * 0.41f + 1.7f) * 0.10f;
    S.pitch = f7_sin(S.t * 0.85f + 0.6f) * 0.045f;
    S.roll  = f7_sin(S.t * 0.62f) * 0.060f;

    /* --- captain bob (idle breathing) --- */
    S.capBob = f7_sin(S.t * 2.1f) * 0.03f;

    switch (S.state) {
    case ST_INTRO: {
        /* elevator dematerialises over the first ~2.6s */
        S.elevFade = f7_clamp01(1.0f - S.stTimer / 2.6f);
        /* captain strides from the bow toward the talk spot */
        float k = f7_clamp01((S.stTimer - 0.6f) / 3.0f);
        float e = k * k * (3.0f - 2.0f * k);      /* smoothstep */
        S.capZ = CAP_BOW_Z + (CAP_TALK_Z - CAP_BOW_Z) * e;
        /* face the way he's walking, then face the player at the end */
        S.capFace = 0.0f;                          /* walking toward +z (stern) */
        S.dialogue = 0;
        if (S.stTimer > 3.9f) { S.state = ST_GREET; S.stTimer = 0.0f; }
        break;
    }
    case ST_GREET: {
        S.elevFade = 0.0f;
        /* face the player */
        float dx = px - S.capX, dz = pz - S.capZ;
        S.capFace = -f7_atan2_like(dx, dz);
        S.dialogue = 1;                            /* "pegue o balde e limpe…" */
        if (rising) { S.state = ST_FETCH; S.stTimer = 0.0f; S.dialogue = 2; }
        break;
    }
    case ST_FETCH: {
        S.dialogue = 2;                            /* objective: grab the bucket */
        float dx = px - S.bucX, dz = pz - S.bucZ;
        float d2 = dx * dx + dz * dz;
        if (d2 < (1.3f * 1.3f) && rising) {
            S.bucHeld = 1; S.state = ST_CLEAN; S.stTimer = 0.0f; S.dialogue = 3;
        }
        break;
    }
    case ST_CLEAN: {
        S.dialogue = 3;                            /* objective: mop the puddles */
        if (S.bucHeld) {
            /* the bucket trails the player */
            S.bucX = px + 0.35f; S.bucZ = pz + 0.15f;
            /* mop whichever puddle you're standing over (hold to clean) */
            for (int i = 0; i < NPUD; i++) {
                if (S.pud[i].prog >= 1.0f) continue;
                float dx = px - S.pud[i].x, dz = pz - S.pud[i].z;
                float d2 = dx * dx + dz * dz;
                float rr = S.pud[i].r + 0.45f;
                if (d2 < rr * rr && interact) {
                    S.pud[i].prog += dt / 1.6f;    /* ~1.6s to mop a puddle */
                    if (S.pud[i].prog >= 1.0f) { S.pud[i].prog = 1.0f; S.cleaned++; }
                }
            }
        }
        if (S.cleaned >= NPUD) { S.state = ST_DONE; S.stTimer = 0.0f; S.dialogue = 4; }
        break;
    }
    case ST_DONE:
    default:
        S.dialogue = 4;                            /* "bom trabalho… e agora?" */
        if (S.bucHeld) { S.bucX = px + 0.35f; S.bucZ = pz + 0.15f; }
        break;
    }
    (void)py;
}

/* atan2 approximation (no libm) — good enough for facing angles */
static float f7_atan2_like(float y, float x) {
    float ax = f7_absf(x), ay = f7_absf(y);
    float a = (ax > ay ? ay : ax) / ((ax > ay ? ax : ay) + 1e-6f);
    float s = a * a;
    float r = ((-0.0464964749f * s + 0.15931422f) * s - 0.327622764f) * s * a + a;
    if (ay > ax) r = 1.57079637f - r;
    if (x < 0.0f) r = 3.14159265f - r;
    if (y < 0.0f) r = -r;
    return r;
}

/* ---- read-only getters for the renderer ---- */
__attribute__((export_name("f7_heave"))) float f7_heave(void) { return S.heave; }
__attribute__((export_name("f7_pitch"))) float f7_pitch(void) { return S.pitch; }
__attribute__((export_name("f7_roll")))  float f7_roll(void)  { return S.roll;  }
__attribute__((export_name("f7_state")))   int  f7_state(void)   { return S.state; }
__attribute__((export_name("f7_dialogue")))int  f7_dialogue(void){ return S.dialogue; }
__attribute__((export_name("f7_capX")))  float f7_capX(void) { return S.capX; }
__attribute__((export_name("f7_capZ")))  float f7_capZ(void) { return S.capZ; }
__attribute__((export_name("f7_capFace")))float f7_capFace(void){ return S.capFace; }
__attribute__((export_name("f7_capBob"))) float f7_capBob(void){ return S.capBob; }
__attribute__((export_name("f7_bucX")))  float f7_bucX(void) { return S.bucX; }
__attribute__((export_name("f7_bucZ")))  float f7_bucZ(void) { return S.bucZ; }
__attribute__((export_name("f7_bucHeld")))int  f7_bucHeld(void){ return S.bucHeld; }
__attribute__((export_name("f7_elevFade")))float f7_elevFade(void){ return S.elevFade; }
__attribute__((export_name("f7_npud")))    int  f7_npud(void) { return NPUD; }
__attribute__((export_name("f7_cleaned")))  int  f7_cleaned(void){ return S.cleaned; }
__attribute__((export_name("f7_can_leave")))int  f7_can_leave(void){ return 0; } /* partial level: never */
/* clean fraction 0..1 across all puddles (for the HUD bar) */
__attribute__((export_name("f7_clean_pct"))) float f7_clean_pct(void) {
    float s = 0.0f; for (int i = 0; i < NPUD; i++) s += S.pud[i].prog;
    return s / (float)NPUD;
}
/* pointer to the puddle array (NPUD * 4 floats: x,z,r,prog) in linear memory */
__attribute__((export_name("f7_puddles"))) Puddle* f7_puddles(void) { return S.pud; }
