/*
 * floor7_geo.cpp — the pirate ship's HULL, modelled in C++ (compiled to
 * WebAssembly, linked with floor7.c + floor7_asm.s). This is a real lofted
 * carvel hull, not an extruded box:
 *   - a SHEER line: the deck/rail edge sweeps UP toward bow and stern,
 *   - TUMBLEHOME: the topsides curve inward above the waterline,
 *   - a rounded turn of the BILGE and a rockered KEEL,
 *   - a fine, raked STEM at the bow (the forefoot lifts and the stem leans
 *     forward), and a fuller bluff STERN,
 *   - integrated BULWARKS (the wall above the deck) so the sheer is visible
 *     in silhouette.
 * Each cross-section runs port-rail -> port side -> keel -> starboard side ->
 * starboard-rail. Three.js only uploads the buffers; the modelling is here.
 *
 * Freestanding (no STL / no libc). Trig comes from the hand-written assembly
 * sine in floor7_asm.s, range-reduced here.
 */
extern "C" float f7_sinp(float x);   // asm polynomial sine, x in [-pi,pi]

namespace {
constexpr float PI = 3.14159265f, TWOPI = 6.28318531f;

float wrapSin(float x) {
    float k = x * (1.0f / TWOPI);
    int n = (int)(k + (k >= 0 ? 0.5f : -0.5f));
    x -= (float)n * TWOPI;
    if (x > PI) x -= TWOPI; else if (x < -PI) x += TWOPI;
    return f7_sinp(x);
}
float s_(float x) { return wrapSin(x); }                 // sin
float clamp01(float x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
float smooth(float x) { x = clamp01(x); return x * x * (3.0f - 2.0f * x); }
float lerp(float a, float b, float t) { return a + (b - a) * t; }
// fuller-midbody shaping for x in [0,1]; sqrt is a wasm intrinsic (f32.sqrt) so
// this needs no imported libm (expf/logf would become unsatisfied env imports).
float fuller(float x) { if (x <= 0.0f) return 0.0f; return __builtin_sqrtf(x); }

// ── ship dimensions (ship-local units; deck edge sits at y=0) ──
constexpr float BEAM   = 3.05f;   // max half-beam at the waterline
constexpr float STERNZ = -7.0f;   // z of the transom
constexpr float BOWZ   = 8.2f;    // z of the stem head
constexpr float WL     = -0.70f;  // waterline height (max beam here)
constexpr float KEELMID= -1.70f;  // keel depth amidships
constexpr float BULW   = 0.62f;   // bulwark height above the deck edge

// half-beam along the length (t: 0=stern .. 1=bow)
float halfBeam(float t) {
    float body = fuller(s_(t * PI));                 // fuller midbody
    float w = 0.30f + 0.70f * body;
    float bow = (t > 0.78f) ? (1.0f - smooth((t - 0.78f) / 0.22f) * 0.86f) : 1.0f;  // fine entry
    float stern = (t < 0.12f) ? (0.62f + (t / 0.12f) * 0.38f) : 1.0f;               // bluff transom
    return BEAM * w * bow * stern;
}
float keelY(float t) {
    float rise = (t - 0.5f); rise = rise * rise;     // 0 mid .. 0.25 ends
    float forefoot = (t > 0.7f) ? smooth((t - 0.7f) / 0.3f) * 0.7f : 0.0f;  // bow lifts out
    return KEELMID + rise * 1.5f + forefoot;
}
float deckY(float t) {
    float ends = (t - 0.5f); ends = ends * ends;
    return 0.0f + ends * 0.5f;                        // gentle deck-edge sheer
}
float railY(float t) {
    float bow = smooth((t - 0.45f) / 0.55f);          // 0 mid .. 1 bow
    float aft = smooth((0.30f - t) / 0.30f);          // 0 .. 1 at stern
    return deckY(t) + BULW + bow * bow * 0.95f + aft * 0.45f;  // strong sheer
}
float stemRake(float t, float h) {                    // upper bow leans forward
    if (t <= 0.6f) return 0.0f;
    return (t - 0.6f) / 0.4f * smooth(h) * 1.5f;
}

// cross-section keypoints (h: 0 keel .. 1 rail) -> x fraction of half-beam
constexpr int NKP = 6;
const float KP_H[NKP] = { 0.00f, 0.16f, 0.42f, 0.66f, 0.82f, 1.00f };
const float KP_X[NKP] = { 0.00f, 0.58f, 1.00f, 0.96f, 0.87f, 0.79f };

float sectionX(float h, float hb) {
    for (int i = 1; i < NKP; i++) {
        if (h <= KP_H[i]) {
            float f = (h - KP_H[i - 1]) / (KP_H[i] - KP_H[i - 1]);
            return hb * lerp(KP_X[i - 1], KP_X[i], f);
        }
    }
    return hb * KP_X[NKP - 1];
}
float sectionY(float h, float ky, float wy, float dy, float ry) {
    if (h <= 0.16f) return lerp(ky, lerp(ky, wy, 0.45f), h / 0.16f);
    if (h <= 0.42f) return lerp(lerp(ky, wy, 0.45f), wy, (h - 0.16f) / 0.26f);
    if (h <= 0.66f) return lerp(wy, lerp(wy, dy, 0.6f), (h - 0.42f) / 0.24f);
    if (h <= 0.82f) return lerp(lerp(wy, dy, 0.6f), dy, (h - 0.66f) / 0.16f);
    return lerp(dy, ry, (h - 0.82f) / 0.18f);
}

// loft resolution
constexpr int LSEG = 44;          // sections along the length
constexpr int ARING = 36;         // points around a section (rail..keel..rail)
constexpr int NV = (LSEG + 1) * (ARING + 1);
constexpr int NI = LSEG * ARING * 6;

float gVerts[NV * 3];
float gNorms[NV * 3];
float gUVs[NV * 2];
unsigned int gIdx[NI];
int gVertCount = 0, gIdxCount = 0;
}

extern "C" {

// Build the hull mesh into the static buffers. Returns vertex count.
__attribute__((export_name("f7_hull_build")))
int f7_hull_build() {
    gVertCount = 0; gIdxCount = 0;
    for (int li = 0; li <= LSEG; li++) {
        float t = (float)li / LSEG;
        float z = lerp(STERNZ, BOWZ, t);
        float hb = halfBeam(t);
        float ky = keelY(t), dy = deckY(t), ry = railY(t);
        for (int ai = 0; ai <= ARING; ai++) {
            float p = -1.0f + 2.0f * (float)ai / ARING;   // -1 port rail .. 0 keel .. +1 stbd rail
            float side = (p < 0) ? -1.0f : 1.0f;
            float h = p < 0 ? -p : p;
            float x = side * sectionX(h, hb);
            float y = sectionY(h, ky, WL, dy, ry);
            float zz = z + stemRake(t, h);
            int vi = gVertCount++;
            gVerts[vi * 3 + 0] = x; gVerts[vi * 3 + 1] = y; gVerts[vi * 3 + 2] = zz;
            gUVs[vi * 2 + 0] = (float)ai / ARING;
            gUVs[vi * 2 + 1] = t * 4.0f;
            // gNorms left at BSS zero; Three.js recomputes vertex normals anyway
        }
    }
    int row = ARING + 1;
    for (int li = 0; li < LSEG; li++) {
        for (int ai = 0; ai < ARING; ai++) {
            int a0 = li * row + ai;
            int a1 = a0 + 1;
            int b0 = a0 + row;
            int b1 = b0 + 1;
            gIdx[gIdxCount++] = a0; gIdx[gIdxCount++] = b0; gIdx[gIdxCount++] = a1;
            gIdx[gIdxCount++] = a1; gIdx[gIdxCount++] = b0; gIdx[gIdxCount++] = b1;
        }
    }
    return gVertCount;
}

__attribute__((export_name("f7_hull_verts"))) float* f7_hull_verts() { return gVerts; }
__attribute__((export_name("f7_hull_norms"))) float* f7_hull_norms() { return gNorms; }
__attribute__((export_name("f7_hull_uvs")))   float* f7_hull_uvs()   { return gUVs; }
__attribute__((export_name("f7_hull_idx")))   unsigned int* f7_hull_idx() { return gIdx; }
__attribute__((export_name("f7_hull_vcount"))) int f7_hull_vcount() { return gVertCount; }
__attribute__((export_name("f7_hull_icount"))) int f7_hull_icount() { return gIdxCount; }

// expose the sheer/beam curves so the JS deck + rail caps follow the same shape
__attribute__((export_name("f7_hull_deckY"))) float f7_hull_deckY(float t) { return deckY(t); }
__attribute__((export_name("f7_hull_railY"))) float f7_hull_railY(float t) { return railY(t); }
__attribute__((export_name("f7_hull_beam")))  float f7_hull_beam(float t)  { return halfBeam(t); }

} // extern C
