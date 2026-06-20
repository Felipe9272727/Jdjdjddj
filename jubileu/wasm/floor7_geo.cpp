/*
 * floor7_geo.cpp — the pirate ship's GEOMETRY, generated in C++ (compiled to
 * WebAssembly, linked with floor7.c + floor7_asm.s). The hull is lofted from
 * cross-sections in C++: a curved boat hull with a pointed bow, faired sides
 * and a keel — vertices, normals and UVs all computed here. Three.js only
 * uploads the buffers to the GPU; the modelling is C++.
 *
 * Freestanding (no STL / no libc). Trig comes from the hand-written assembly
 * sine in floor7_asm.s, range-reduced here.
 */
extern "C" float f7_sinp(float x);   // asm polynomial sine, x in [-pi,pi]

namespace {
constexpr float PI = 3.14159265f, TWOPI = 6.28318531f;

float fabsf_(float x) { return x < 0 ? -x : x; }
float wrapSin(float x) {
    float k = x * (1.0f / TWOPI);
    int n = (int)(k + (k >= 0 ? 0.5f : -0.5f));
    x -= (float)n * TWOPI;
    if (x > PI) x -= TWOPI; else if (x < -PI) x += TWOPI;
    return f7_sinp(x);
}
float c_(float x) { return wrapSin(x + PI * 0.5f); }
float s_(float x) { return wrapSin(x); }
float sqrt_(float x) { return __builtin_sqrtf(x); }
void norm3(float& x, float& y, float& z) {
    float l = sqrt_(x * x + y * y + z * z) + 1e-6f;
    x /= l; y /= l; z /= l;
}

// loft resolution
constexpr int LSEG = 28;          // sections along the length
constexpr int ASEG = 14;          // points across each section (rim->keel->rim)
constexpr int NV = (LSEG + 1) * (ASEG + 1);
constexpr int NI = LSEG * ASEG * 6;

float gVerts[NV * 3];
float gNorms[NV * 3];
float gUVs[NV * 2];
unsigned int gIdx[NI];
int gVertCount = 0, gIdxCount = 0;

// hull profile: half-beam and depth as a function of t along the length (0=stern,1=bow)
float beamAt(float t) {
    // widest amidships, tapering, pinching to a point at the bow
    float bow = 1.0f - t;                       // 0 at bow
    float body = s_(t * PI);                    // 0 at ends, 1 mid
    float w = 0.55f * body + 0.45f;             // never fully zero except very bow
    w *= (t > 0.86f) ? (1.0f - (t - 0.86f) / 0.14f) : 1.0f;  // pinch the bow to a point
    w *= (t < 0.06f) ? (0.7f + t / 0.06f * 0.3f) : 1.0f;     // slightly narrower transom
    (void)bow;
    return w * 3.05f;                           // max half-beam
}
float keelAt(float t) {
    // rocker: deeper amidships, rising at bow & stern
    float r = 0.55f + 0.45f * s_(t * PI);
    return -1.85f * r;
}
float sheerAt(float t) {
    // deck/rim height: rises a touch at bow & stern (sheer line)
    float ends = (t - 0.5f); ends = ends * ends;   // 0 mid, 0.25 ends
    return 0.18f + ends * 1.0f;
}
}

extern "C" {

// Build the hull mesh into the static buffers. Returns vertex count.
__attribute__((export_name("f7_hull_build")))
int f7_hull_build() {
    gVertCount = 0; gIdxCount = 0;
    const float stern = -7.0f, bow = 8.4f;
    for (int li = 0; li <= LSEG; li++) {
        float t = (float)li / LSEG;
        float z = stern + (bow - stern) * t;
        float halfBeam = beamAt(t);
        float keelY = keelAt(t);
        float rimY = sheerAt(t);
        float depth = rimY - keelY;
        for (int ai = 0; ai <= ASEG; ai++) {
            float a = (float)ai / ASEG;           // 0=port rim, 0.5=keel, 1=starboard rim
            float arc = (a <= 0.5f) ? (a * 2.0f) : ((1.0f - a) * 2.0f); // 0 rim -> 1 keel
            float side = (a < 0.5f) ? -1.0f : 1.0f;
            // quarter-ellipse cross-section: rim (full beam, rimY) -> keel (x=0, keelY)
            float x = side * halfBeam * c_(arc * PI * 0.5f);
            float y = rimY - depth * s_(arc * PI * 0.5f);
            int vi = gVertCount++;
            gVerts[vi * 3 + 0] = x; gVerts[vi * 3 + 1] = y; gVerts[vi * 3 + 2] = z;
            gUVs[vi * 2 + 0] = a; gUVs[vi * 2 + 1] = t * 4.0f;
            // outward normal: from the section's mid-height centre line
            float nx = x, ny = y - (rimY - depth * 0.5f), nz = 0.0f;
            norm3(nx, ny, nz);
            gNorms[vi * 3 + 0] = nx; gNorms[vi * 3 + 1] = ny; gNorms[vi * 3 + 2] = nz;
        }
    }
    // indices (quad strip between sections)
    int row = ASEG + 1;
    for (int li = 0; li < LSEG; li++) {
        for (int ai = 0; ai < ASEG; ai++) {
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

} // extern C
