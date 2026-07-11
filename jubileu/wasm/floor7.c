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
    ST_INTRO  = 0,  /* elevator vanishing, captain striding over from the bow */
    ST_GREET  = 1,  /* captain talks, asks for the bucket+cloth              */
    ST_FETCH  = 2,  /* player must reach the bucket and grab it              */
    ST_CLEAN  = 3,  /* mop the puddles                                       */
    ST_DONE   = 4,  /* all clean — the captain strides aft and takes the helm */
    ST_SAIL   = 5,  /* landfall run: the island grows on the horizon         */
    ST_ANCHOR = 6,  /* arrived. the sea goes calm — but the floor only lets  */
                    /* go of who REMEMBERS it: read the captain's log        */
    ST_FREE   = 7   /* log read → the elevator rematerialises; can board     */
};

#define NPUD 6
/* prog 0..1 cleaned (mean), plus a 4x4 wetness grid so the puddle erodes
   directionally under the brush instead of shrinking uniformly */
typedef struct { float x, z, r, prog; float cell[16]; } Puddle;

/* ---- the whole floor state ---- */
static struct {
    float t;            /* elapsed sim time                         */
    float heave, pitch, roll; /* ship body transform (y, x-rot, z-rot) */
    int   state;
    float stTimer;      /* time in current state                    */
    /* captain */
    float capX, capZ, capFace, capBob;
    int   capWalk;      /* 1 while the captain is striding (drives the walk anim) */
    float barkTimer;    /* >0 while a milestone bark line is showing           */
    int   barked3;      /* fired the 3/6 bark already?                          */
    /* rising tide — the sea re-wets a neglected puddle on a timer (stakes) */
    float tideTimer;    /* counts down to the next swell                       */
    float tideWarn;     /* 0..1, ramps up in the seconds before a swell        */
    float tideBark;     /* >0 while the "a wave washed the deck" line shows     */
    int   tideTarget;   /* index of the puddle the next swell will re-wet (-1)  */
    /* bucket */
    float bucX, bucZ;
    int   bucHeld;
    float bucWater;     /* 0..1 freshness — fresh water scrubs faster; dunk to refill */
    /* puddles */
    Puddle pud[NPUD];
    int   cleaned;
    /* landfall payoff */
    float landfall;     /* 0..1 — how close the island is (ST_SAIL ramps it)   */
    float calm;         /* 1 open sea -> ~0.2 anchored (scales heave/pitch/roll) */
    /* the captain's log (diário de bordo) — the floor's memory. Reading it is
       what frees the player ("o elevador lembra de quem lembra"). */
    int   logPage;      /* 0 closed/unread · 1..3 reading page N · 4 finished  */
    int   logRead;      /* latched once page 3 was turned                      */
    /* boarding the returned elevator */
    int   nearExit;     /* player is inside the rematerialised cab's doorway   */
    int   boarded;      /* latched: rising interact in the doorway on ST_FREE  */
    /* presentation */
    float elevFade;     /* 1 -> 0 as the elevator dematerialises     */
    int   dialogue;     /* id the UI shows (0 none)                  */
    int   prevInteract;
} S;

/* spawn / layout anchors (deck-local ~= world; sway is small) */
/* CAP_BOW_Z kept in the OPEN mid-deck (not jammed against the stern cabin at
   z<-5) so the intro cutscene's low boot-tracking shot frames clean deck, not
   a wall of planks, as he strides in. */
#define CAP_BOW_Z   (-2.0f)
#define CAP_TALK_Z  ( 2.2f)
#define CAP_X       ( 0.6f)
#define HELM_X      (-0.45f)
#define HELM_Z      (-5.3f)
/* the captain's log sits on the companionway lid (centre lane, aft of the main
   mast) — always reachable, never under a puddle (puddles keep |x|>=0.55). */
#define LOG_X       ( 0.0f)
#define LOG_Z       (-3.1f)
#define LOG_R       ( 1.35f)
/* the elevator cab's spot on deck (ship-local) — must match the renderer */
#define ELEV_X      ( 0.0f)
#define ELEV_Z      ( 5.2f)
#define SAIL_TIME   (26.0f)   /* seconds from DONE-helm to the anchorage */

__attribute__((export_name("f7_init")))
void f7_init(unsigned int seed) {
    g_rng = seed ? seed : 0x1234567u;
    S.t = 0.0f; S.state = ST_INTRO; S.stTimer = 0.0f;
    S.heave = S.pitch = S.roll = 0.0f;
    S.capX = CAP_X; S.capZ = CAP_BOW_Z; S.capFace = 0.0f; S.capBob = 0.0f;
    S.bucX = 1.35f; S.bucZ = -1.8f; S.bucHeld = 0; S.bucWater = 1.0f;
    S.cleaned = 0; S.elevFade = 1.0f; S.dialogue = 0; S.prevInteract = 0;
    S.capWalk = 0; S.barkTimer = 0.0f; S.barked3 = 0;
    S.tideTimer = 12.0f; S.tideWarn = 0.0f; S.tideBark = 0.0f; S.tideTarget = -1;
    S.landfall = 0.0f; S.calm = 1.0f;
    S.logPage = 0; S.logRead = 0; S.nearExit = 0; S.boarded = 0;
    /* scatter puddles across the WALKABLE deck — inside the bulwark with room
       for the player to stand on them, clear of the centre-lane structures and
       the bow/stern. The deck narrows toward the ends, so both |x| and r are
       kept tight enough that disc edge (|x|+r <= ~1.95) never pokes past the
       bulwark at |z| <= 3.5 — no more puddles hovering over open sea. */
    for (int i = 0; i < NPUD; i++) {
        float side = (frand() < 0.5f) ? -1.0f : 1.0f;
        float x = side * (0.55f + frand() * 0.75f);      /* |x| in [0.55, 1.30] */
        float z = (frand() * 7.0f) - 3.5f;               /*  z  in [-3.5, 3.5] */
        S.pud[i].x = x; S.pud[i].z = z;
        S.pud[i].r = 0.40f + frand() * 0.25f;            /*  r  in [0.40, 0.65] */
        S.pud[i].prog = 0.0f;
        /* only cells whose centre falls inside the circle start wet; the 4
           corner cells are outside the disc, so they begin dry (0) and don't
           keep prog from ever reaching 1 */
        for (int cj = 0; cj < 4; cj++) for (int ci = 0; ci < 4; ci++) {
            float cx = ci * 0.5f - 0.75f, cy = cj * 0.5f - 0.75f;
            S.pud[i].cell[cj * 4 + ci] = (cx * cx + cy * cy <= 1.0f) ? 1.0f : 0.0f;
        }
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
    /* the sea CALMS as the ship makes the anchorage: full swell in open water,
       a gentle harbour bob once anchored (scaled smoothly via S.calm) */
    {
        float calmT = (S.state >= ST_ANCHOR) ? 0.22f
                    : (S.state == ST_SAIL ? 1.0f - 0.6f * S.landfall : 1.0f);
        float k = dt * 0.6f; if (k > 1.0f) k = 1.0f;
        S.calm += (calmT - S.calm) * k;
    }
    S.heave = (f7_sin(S.t * 1.05f) * 0.18f + f7_sin(S.t * 0.41f + 1.7f) * 0.10f) * S.calm;
    S.pitch = f7_sin(S.t * 0.85f + 0.6f) * 0.045f * S.calm;
    S.roll  = f7_sin(S.t * 0.62f) * 0.060f * S.calm;

    /* --- the captain's log (diário de bordo) — the floor's own memory.
       It may only be OPENED once the ship is anchored. Once open, however,
       every later rising edge keeps turning its pages even if the state moves
       on. Crucially, an early press is not spent here: the active quest state
       still receives that same rising edge. --- */
    if (rising) {
        if (S.logPage >= 1 && S.logPage <= 3) {
            S.logPage++;
            if (S.logPage >= 4) S.logRead = 1;
            rising = 0;                        /* the press was spent on the page */
        } else if (S.state == ST_ANCHOR) {
            float lx = px - LOG_X, lz = pz - LOG_Z;
            if (lx * lx + lz * lz < LOG_R * LOG_R) { S.logPage = 1; rising = 0; }
        }
    }

    /* --- captain bob (idle breathing) --- */
    S.capBob = f7_sin(S.t * 2.1f) * 0.03f;
    S.capWalk = 0;                                 /* default: standing */

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
        S.capWalk = (k < 1.0f) ? 1 : 0;
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
            S.tideTimer = 12.0f; S.tideWarn = 0.0f;   /* first swell ~12s into cleaning */
        }
        break;
    }
    case ST_CLEAN: {
        S.dialogue = 3;                            /* objective: mop the puddles */
        /* the captain watches you work — face the player */
        S.capFace = -f7_atan2_like(px - S.capX, pz - S.capZ);
        if (S.bucHeld) {
            /* the bucket trails the player */
            S.bucX = px + 0.35f; S.bucZ = pz + 0.15f;
            /* SECOND VERB — refill the bucket at the rail. Fresh water scrubs
               faster; it goes stale as you work, so you dunk it over the side.
               Purely a SPEED bonus: empty water still cleans at the base rate, so
               it never blocks you — it just rewards managing trips vs the tide. */
            int nearRail = (f7_absf(px) > 1.7f) || (pz > 4.3f) || (pz < -4.3f);
            if (rising && nearRail) { S.bucWater = 1.0f; S.dialogue = 8; }   /* dunk! */
            float wmul = 1.0f + S.bucWater * 0.55f;     /* fresh = up to ~1.55x */
            int scrubbed = 0;
            /* mop the puddle UNDER THE BRUSH: drain the 4x4 cell the player is
               over (plus a little bleed to neighbours), so the wet patch eats
               inward from where you're scrubbing rather than shrinking whole */
            for (int i = 0; i < NPUD; i++) {
                if (S.pud[i].prog >= 1.0f) continue;
                float dx = px - S.pud[i].x, dz = pz - S.pud[i].z;
                float rr = S.pud[i].r + 0.45f;
                if (dx * dx + dz * dz < rr * rr && interact) {
                    scrubbed = 1;
                    /* local position in the puddle (normalised to radius r, the
                       visual extent), mapped to the 4x4 grid */
                    float u = (dx / S.pud[i].r) * 0.5f + 0.5f, v = (dz / S.pud[i].r) * 0.5f + 0.5f;
                    int gi = (int)(u * 4.0f); if (gi < 0) gi = 0; if (gi > 3) gi = 3;
                    int gj = (int)(v * 4.0f); if (gj < 0) gj = 0; if (gj > 3) gj = 3;
                    for (int cj = gj - 1; cj <= gj + 1; cj++) {
                        for (int ci = gi - 1; ci <= gi + 1; ci++) {
                            if (ci < 0 || ci > 3 || cj < 0 || cj > 3) continue;
                            float rate = (ci == gi && cj == gj) ? 3.2f : 1.1f;   /* centre drains fastest */
                            float *c = &S.pud[i].cell[cj * 4 + ci];
                            *c -= dt * rate * wmul; if (*c < 0.0f) *c = 0.0f;
                        }
                    }
                    /* prog = how much is cleaned (1 - mean wetness) */
                    float sum = 0.0f; for (int c = 0; c < 16; c++) sum += S.pud[i].cell[c];
                    S.pud[i].prog = 1.0f - sum / 16.0f;
                    if (S.pud[i].prog >= 0.985f) { S.pud[i].prog = 1.0f; S.cleaned++; }
                }
            }
            /* the water goes stale as you scrub (refill at the rail to keep it
               fast) — ~9s of scrubbing to drain a full bucket */
            if (scrubbed) { S.bucWater -= dt * 0.11f; if (S.bucWater < 0.0f) S.bucWater = 0.0f; }
            /* nudge the player to refill once the water is tired (only if not
               already showing a more urgent line) */
            if (S.bucWater < 0.3f && S.dialogue == 3) S.dialogue = 7;
        }
        /* halfway bark — the captain reacts to your progress */
        if (S.cleaned >= 3 && !S.barked3) { S.barked3 = 1; S.barkTimer = 3.5f; }
        if (S.barkTimer > 0.0f) { S.barkTimer -= dt; S.dialogue = 5; }   /* "tá ficando decente!" */

        /* --- rising tide: the sea fights back --- */
        S.tideTimer -= dt;
        S.tideWarn = f7_clamp01((3.6f - S.tideTimer) / 3.6f);   /* ~3.6s window — time to choose a route */
        /* continuously pick the AT-RISK puddle so the telegraph can point at it:
           the most-progressed puddle you've left half-mopped (most to lose) —
           never the one you're currently on, never a finished one, never an
           untouched one. Punishes spreading thin, not methodical work. */
        {
            int worst = -1; float wp = 0.02f;
            for (int i = 0; i < NPUD; i++) {
                if (S.pud[i].prog >= 1.0f || S.pud[i].prog <= 0.02f) continue;
                float ddx = px - S.pud[i].x, ddz = pz - S.pud[i].z;
                float rr = S.pud[i].r + 0.45f;
                if (ddx * ddx + ddz * ddz < rr * rr) continue;   /* skip the active puddle */
                if (S.pud[i].prog > wp) { wp = S.pud[i].prog; worst = i; }
            }
            S.tideTarget = worst;
        }
        if (S.tideTimer <= 0.0f) {
            S.tideTimer = 13.0f + frand() * 4.0f;
            S.tideWarn = 0.0f;
            int worst = S.tideTarget;
            if (worst >= 0) {
                /* a band floods back in, heavier on the lee (down-rolled) side */
                int leeRight = (S.roll < 0.0f);
                for (int cj = 0; cj < 4; cj++) for (int ci = 0; ci < 4; ci++) {
                    float cx = ci * 0.5f - 0.75f, cy = cj * 0.5f - 0.75f;
                    if (cx * cx + cy * cy > 1.0f) continue;       /* corners stay dry */
                    float side = leeRight ? (float)ci : (float)(3 - ci);
                    float *c = &S.pud[worst].cell[cj * 4 + ci];
                    *c += 0.22f + 0.08f * side; if (*c > 1.0f) *c = 1.0f;
                }
                float sum = 0.0f; for (int c = 0; c < 16; c++) sum += S.pud[worst].cell[c];
                S.pud[worst].prog = 1.0f - sum / 16.0f;
                S.tideBark = 2.6f;
            }
        }
        if (S.tideBark > 0.0f) { S.tideBark -= dt; S.dialogue = 6; }   /* "uma onda lavou o convés!" */

        if (S.cleaned >= NPUD) {
            S.state = ST_DONE; S.stTimer = 0.0f; S.dialogue = 4;
            S.tideWarn = 0.0f;   /* else the last warn value freezes and the water
                                    shader heaves a phantom surge ring forever */
        }
        break;
    }
    case ST_DONE: {
        S.dialogue = 4;                            /* "bom trabalho — terra à vista!" */
        if (S.bucHeld) { S.bucX = px + 0.35f; S.bucZ = pz + 0.15f; }
        /* PAYOFF: the captain strides aft to the helm and takes the wheel */
        float k = f7_clamp01((S.stTimer - 0.8f) / 3.2f);
        float e = k * k * (3.0f - 2.0f * k);       /* smoothstep */
        S.capX = CAP_X + (HELM_X - CAP_X) * e;
        S.capZ = CAP_TALK_Z + (HELM_Z - CAP_TALK_Z) * e;
        S.capWalk = (k > 0.02f && k < 0.99f) ? 1 : 0;
        S.capFace = 3.14159f;                      /* face the wheel (toward the stern, -z) */
        if (S.stTimer > 4.6f) { S.state = ST_SAIL; S.stTimer = 0.0f; }
        break;
    }
    case ST_SAIL: {
        /* the landfall run — the island grows on the horizon while the captain,
           finally at his wheel, lets the floor's lore out one bark at a time */
        S.landfall = f7_clamp01(S.stTimer / SAIL_TIME);
        if (S.bucHeld) { S.bucX = px + 0.35f; S.bucZ = pz + 0.15f; }
        S.capX = HELM_X; S.capZ = HELM_Z;
        S.capFace = 3.14159f;                      /* eyes on the wheel/horizon */
        {
            int bark = (int)(S.stTimer / 8.0f); if (bark > 2) bark = 2;
            S.dialogue = 9 + bark;                 /* 9, 10, 11 — the lore barks */
        }
        if (S.landfall >= 1.0f) { S.state = ST_ANCHOR; S.stTimer = 0.0f; }
        break;
    }
    case ST_ANCHOR: {
        /* anchored in the island's lee. The floor only lets go of who REMEMBERS
           it (the Andar 4 rule) — the captain points you at his log. */
        S.landfall = 1.0f;
        if (S.bucHeld) { S.bucX = px + 0.35f; S.bucZ = pz + 0.15f; }
        S.capFace = -f7_atan2_like(px - S.capX, pz - S.capZ);   /* turns to you */
        S.dialogue = 12;                           /* "lê meu diário de bordo…" */
        if (S.logRead) { S.state = ST_FREE; S.stTimer = 0.0f; }
        break;
    }
    case ST_FREE:
    default: {
        /* someone remembered the floor — the elevator REMATERIALISES. */
        S.landfall = 1.0f;
        if (S.bucHeld) { S.bucX = px + 0.35f; S.bucZ = pz + 0.15f; }
        S.capFace = -f7_atan2_like(px - S.capX, pz - S.capZ);
        S.elevFade = f7_clamp01(S.stTimer / 2.8f); /* fade back IN (1 = solid)  */
        S.dialogue = 13;                           /* "ele lembrou de ti — vai." */
        {
            float ex = px - ELEV_X, ez = pz - ELEV_Z;
            S.nearExit = (S.elevFade > 0.9f && ex * ex + ez * ez < 1.35f * 1.35f) ? 1 : 0;
            if (S.nearExit && rising) S.boarded = 1;   /* latched — the app rides home */
        }
        break;
    }
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
__attribute__((export_name("f7_capWalk"))) int f7_capWalk(void){ return S.capWalk; }
__attribute__((export_name("f7_bucX")))  float f7_bucX(void) { return S.bucX; }
__attribute__((export_name("f7_bucZ")))  float f7_bucZ(void) { return S.bucZ; }
__attribute__((export_name("f7_bucHeld")))int  f7_bucHeld(void){ return S.bucHeld; }
__attribute__((export_name("f7_buc_water")))float f7_buc_water(void){ return S.bucWater; }
__attribute__((export_name("f7_elevFade")))float f7_elevFade(void){ return S.elevFade; }
__attribute__((export_name("f7_tide_warn")))float f7_tide_warn(void){ return S.tideWarn; }
/* index of the puddle the next swell targets (-1 none), and its position, so the
   renderer can point the telegraph (surge + halo flash) at the at-risk patch */
__attribute__((export_name("f7_tide_target")))int f7_tide_target(void){ return S.tideTarget; }
__attribute__((export_name("f7_tide_tx")))float f7_tide_tx(void){ return S.tideTarget >= 0 ? S.pud[S.tideTarget].x : 0.0f; }
__attribute__((export_name("f7_tide_tz")))float f7_tide_tz(void){ return S.tideTarget >= 0 ? S.pud[S.tideTarget].z : 0.0f; }
__attribute__((export_name("f7_npud")))    int  f7_npud(void) { return NPUD; }
__attribute__((export_name("f7_cleaned")))  int  f7_cleaned(void){ return S.cleaned; }
/* the floor lets go ONLY of who finished the work, made landfall and REMEMBERED
   it (read the log) — then the elevator comes back for them. */
__attribute__((export_name("f7_can_leave")))int  f7_can_leave(void){ return S.state == ST_FREE ? 1 : 0; }
/* landfall payoff + log + boarding getters */
__attribute__((export_name("f7_landfall"))) float f7_landfall(void){ return S.landfall; }
__attribute__((export_name("f7_calm")))     float f7_calm(void)    { return S.calm; }
__attribute__((export_name("f7_log_page"))) int   f7_log_page(void){ return S.logPage; }
__attribute__((export_name("f7_log_read"))) int   f7_log_read(void){ return S.logRead; }
__attribute__((export_name("f7_log_x")))    float f7_log_x(void)   { return LOG_X; }
__attribute__((export_name("f7_log_z")))    float f7_log_z(void)   { return LOG_Z; }
__attribute__((export_name("f7_near_exit")))int   f7_near_exit(void){ return S.nearExit; }
__attribute__((export_name("f7_boarded"))) int    f7_boarded(void) { return S.boarded; }
/* clean fraction 0..1 across all puddles (for the HUD bar) */
__attribute__((export_name("f7_clean_pct"))) float f7_clean_pct(void) {
    float s = 0.0f; for (int i = 0; i < NPUD; i++) s += S.pud[i].prog;
    return s / (float)NPUD;
}
/* pointer to the puddle array (NPUD * 4 floats: x,z,r,prog) in linear memory */
__attribute__((export_name("f7_puddles"))) Puddle* f7_puddles(void) { return S.pud; }
