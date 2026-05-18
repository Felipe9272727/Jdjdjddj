/**
 * Floor2/shaders.ts — All custom shader material definitions.
 *
 * Uses drei's shaderMaterial utility. Each material is created as a
 * class that can be instantiated with `new (XxxMaterial as any)()`.
 */

import { shaderMaterial } from '@react-three/drei';

// ─── Water ceiling shader — animated ripple pattern visible from below ──
export const WaterCeilingMaterial = shaderMaterial(
    { time: 0 },
    /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        float dist = length(uv - 0.5) * 2.0;
        // Concentric ripples
        float ripple1 = sin(dist * 25.0 - time * 2.0) * 0.5 + 0.5;
        float ripple2 = sin(dist * 18.0 + time * 1.5 + 1.0) * 0.5 + 0.5;
        // Cross-pattern interference for caustic feel
        float cross1 = sin(uv.x * 22.0 + time * 1.8) * sin(uv.y * 20.0 - time * 1.3) * 0.5 + 0.5;
        float cross2 = sin(uv.x * 16.0 - time * 1.1 + 2.0) * sin(uv.y * 14.0 + time * 0.9) * 0.5 + 0.5;
        float ripple = pow(ripple1 * ripple2, 1.5) * 0.6 + pow(cross1 * cross2, 2.0) * 0.4;
        // Slightly brighter base for the looking-up view (more aqua)
        vec3 col = vec3(0.012, 0.030, 0.050);
        col += vec3(0.02, 0.10, 0.12) * ripple;
        float caustic = pow(ripple, 3.0) * 0.25;
        col += vec3(0.04, 0.16, 0.13) * caustic;
        // Brighter rim (where light from outside leaks in)
        float rim = smoothstep(0.7, 1.0, dist);
        col += vec3(0.05, 0.18, 0.22) * rim * 0.3;
        gl_FragColor = vec4(col, 1.0);
      }
    `
);

// ─── Underwater overlay — screen-space tint and caustic pattern ────────
export const UnderwaterOverlayMaterial = shaderMaterial(
    { time: 0, depth: 0 },
    /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      uniform float depth;
      varying vec2 vUv;

      // Hash & cheap noise for fake-blur jitter
      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      void main() {
        vec2 uv = vUv;
        // Wavy UV distortion (stronger at depth → fake refractive blur)
        float blurAmt = 0.003 + depth * 0.006;
        uv += vec2(
          sin(uv.y * 30.0 + time * 2.0) * blurAmt,
          cos(uv.x * 25.0 + time * 1.7) * blurAmt
        );
        // Subtle high-frequency jitter (fake blur via noise) — only at depth
        float jitter = (hash21(uv * 800.0 + time * 0.3) - 0.5) * 0.002 * depth;
        uv += vec2(jitter, jitter);

        vec2 center = uv - 0.5;
        float radial = length(center);
        float vignette = 1.0 - dot(center, center) * 2.5;
        vignette = clamp(vignette, 0.0, 1.0);

        // ─── Caustic pattern — interfering sines for vivid highlights
        float c1 = sin(uv.x * 18.0 + time * 1.4) * sin(uv.y * 15.0 + time * 1.1);
        float c2 = sin(uv.x * 12.0 - time * 0.9 + 1.5) * sin(uv.y * 10.0 + time * 1.3);
        float c3 = sin((uv.x + uv.y) * 22.0 - time * 1.7);
        float causticBase = max(0.0, c1 * c2);
        float caustic = pow(causticBase, 2.0) * 0.55
                      + pow(max(0.0, c3), 6.0) * 0.25;
        // Caustics fade with depth (less light reaches deep)
        caustic *= (1.0 - depth * 0.4);

        // ─── Fake screen-space god rays: angled streaks panning slowly
        // Project uv onto an angled axis, then a wide sin gives soft bands
        float angle = 0.5;
        float u2 = uv.x * cos(angle) - uv.y * sin(angle);
        float rays = sin(u2 * 26.0 + time * 0.35) * 0.5 + 0.5;
        rays = pow(rays, 4.0);
        float rays2 = sin(u2 * 14.0 - time * 0.25 + 1.7) * 0.5 + 0.5;
        rays2 = pow(rays2, 6.0);
        float godRay = (rays * 0.6 + rays2 * 0.5);
        // Concentrate upward — top of the screen
        godRay *= smoothstep(0.05, 0.6, 1.0 - uv.y);
        // Fade with depth (rays from above are dimmer when deep)
        godRay *= (1.0 - depth * 0.55);

        // ─── Color tint — more vivid shallow→deep transition
        vec3 shallowTint = vec3(0.00, 0.10, 0.16);    // bright cyan-green
        vec3 midTint     = vec3(0.00, 0.04, 0.14);    // mid teal-blue
        vec3 deepTint    = vec3(0.02, 0.00, 0.07);    // deep purple-black
        vec3 tint;
        if (depth < 0.35) {
          tint = mix(shallowTint, midTint, depth / 0.35);
        } else {
          tint = mix(midTint, deepTint, (depth - 0.35) / 0.65);
        }

        // Add caustic light (bright cyan-green-aqua)
        tint += vec3(0.04, 0.20, 0.16) * caustic;
        // Add god ray streaks (cyan-blue)
        tint += vec3(0.05, 0.16, 0.20) * godRay * (1.0 - depth * 0.4);

        // Push contrast with depth: darken edges, lighten caustics
        float alpha = (0.28 + depth * 0.55) * vignette;
        tint.r += radial * 0.005 * depth;
        tint.b += radial * 0.012 * (1.0 - depth);
        // Subtle blue shift at deep
        tint.b += depth * 0.015;

        gl_FragColor = vec4(tint, alpha);
      }
    `
);

// ─── Water shader — Gerstner waves + SSS + Fresnel + foam ───────────
export const WaterMaterial = shaderMaterial(
    { time: 0, opacity: 0.85 },
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vViewWS;
      varying vec3 vNormalWS;
      varying vec3 vWorldPos;

      vec4 gerstner(vec2 pos, vec2 dir, float steepness, float wavelength, float t) {
        float k = 6.28318 / max(wavelength, 0.01);
        float c = sqrt(9.8 / max(k, 0.001));
        float a = steepness / max(k, 0.001);
        float f = k * (dot(dir, pos) - c * t);
        float sinF = sin(f);
        float cosF = cos(f);
        return vec4(
          -dir.x * a * cosF,
          a * sinF,
          -dir.y * a * cosF,
          0.0
        );
      }

      void main() {
        vUv = uv;
        vec3 p = position;

        vec2 d1 = normalize(vec2(1.0, 0.3));
        vec2 d2 = normalize(vec2(0.3, 1.0));
        vec2 d3 = normalize(vec2(-0.5, 0.7));
        vec2 d4 = normalize(vec2(0.8, -0.5));

        vec4 w1 = gerstner(p.xz, d1, 0.22, 4.0, time * 0.8);
        vec4 w2 = gerstner(p.xz, d2, 0.18, 2.8, time * 0.95 + 1.7);
        vec4 w3 = gerstner(p.xz, d3, 0.12, 1.8, time * 1.15 + 3.2);
        vec4 w4 = gerstner(p.xz, d4, 0.07, 1.2, time * 1.4 + 5.0);

        vec3 disp = w1.xyz + w2.xyz + w3.xyz + w4.xyz;
        p += disp;
        vWave = disp.y;

        float k1 = 6.28318 / 4.0;  float c1 = sqrt(9.8 / k1);  float a1 = 0.22 / k1;
        float k2 = 6.28318 / 2.8;  float c2 = sqrt(9.8 / k2);  float a2 = 0.18 / k2;
        float k3 = 6.28318 / 1.8;  float c3 = sqrt(9.8 / k3);  float a3 = 0.12 / k3;
        float k4 = 6.28318 / 1.2;  float c4 = sqrt(9.8 / k4);  float a4 = 0.07 / k4;

        float f1 = k1 * (dot(d1, position.xz) - c1 * time * 0.8);
        float f2 = k2 * (dot(d2, position.xz) - c2 * time * 0.95 - 1.7 * c2);
        float f3 = k3 * (dot(d3, position.xz) - c3 * time * 1.15 - 3.2 * c3);
        float f4 = k4 * (dot(d4, position.xz) - c4 * time * 1.4 - 5.0 * c4);

        vec3 dPdx = vec3(
          1.0 - (d1.x * d1.x * a1 * k1 * sin(f1) + d2.x * d2.x * a2 * k2 * sin(f2)
               + d3.x * d3.x * a3 * k3 * sin(f3) + d4.x * d4.x * a4 * k4 * sin(f4)),
          d1.x * a1 * k1 * cos(f1) + d2.x * a2 * k2 * cos(f2) + d3.x * a3 * k3 * cos(f3) + d4.x * a4 * k4 * cos(f4),
          -(d1.x * d1.y * a1 * k1 * sin(f1) + d2.x * d2.y * a2 * k2 * sin(f2)
          + d3.x * d3.y * a3 * k3 * sin(f3) + d4.x * d4.y * a4 * k4 * sin(f4))
        );
        vec3 dPdz = vec3(
          -(d1.x * d1.y * a1 * k1 * sin(f1) + d2.x * d2.y * a2 * k2 * sin(f2)
          + d3.x * d3.y * a3 * k3 * sin(f3) + d4.x * d4.y * a4 * k4 * sin(f4)),
          d1.y * a1 * k1 * cos(f1) + d2.y * a2 * k2 * cos(f2) + d3.y * a3 * k3 * cos(f3) + d4.y * a4 * k4 * cos(f4),
          1.0 - (d1.y * d1.y * a1 * k1 * sin(f1) + d2.y * d2.y * a2 * k2 * sin(f2)
               + d3.y * d3.y * a3 * k3 * sin(f3) + d4.y * d4.y * a4 * k4 * sin(f4))
        );
        vec3 localNormal = normalize(cross(dPdz, dPdx));
        vNormalWS = normalize(mat3(modelMatrix) * localNormal);

        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vViewWS = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    /* glsl */ `
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;
      varying float vWave;
      varying vec3 vViewWS;
      varying vec3 vNormalWS;
      varying vec3 vWorldPos;

      void main() {
        float ndv = max(0.001, dot(vNormalWS, vViewWS));
        float R0 = 0.02;
        float fresnel = R0 + (1.0 - R0) * pow(1.0 - ndv, 5.0);
        fresnel = mix(fresnel, pow(1.0 - ndv, 2.4) * 0.9, 0.5);

        float viewFromBelow = step(dot(vNormalWS, vViewWS), 0.0);

        // Vivid color palette — pushed brighter so the well water is
        // unmistakably WATER in the dark cave (was almost black before).
        vec3 deep    = vec3(0.010, 0.07, 0.13);     // deep teal
        vec3 mid     = vec3(0.07,  0.28, 0.38);     // tropical blue-green
        vec3 shallow = vec3(0.18,  0.50, 0.52);     // bright shallow aqua
        vec3 sky     = vec3(0.45,  0.65, 0.72);     // sky reflection

        // Distance from the hole center to drive a "shallow rim" gradient
        float distFromCenter = length(vWorldPos.xz - vec2(0.0, 5.0));
        // 0 at center, 1 at rim
        float rimT = clamp(distFromCenter / 3.0, 0.0, 1.0);
        // boost shallow color near the rim
        float shallowBoost = smoothstep(0.55, 1.0, rimT);

        // ─── Caustic pattern (richer, bigger highlights)
        float c1 = sin(vUv.x * 32.0 + time * 0.9) * 0.5 + 0.5;
        float c2 = sin(vUv.y * 26.0 + time * 1.1 + 2.0) * 0.5 + 0.5;
        float c3 = sin((vUv.x + vUv.y) * 18.0 + time * 0.7) * 0.5 + 0.5;
        float c4 = sin((vUv.x - vUv.y) * 24.0 - time * 0.85) * 0.5 + 0.5;
        float causticBase = c1 * c2;
        float causticCross = c3 * c4;
        float caustic = pow(causticBase, 2.5) * 0.6 + pow(causticCross, 3.5) * 0.55;
        // Big bright peaks
        float causticPeak = pow(causticBase * causticCross, 1.5);

        // ─── Horizontal shimmer — tiny high-frequency ripple on top of waves
        float shimmer = sin(vWorldPos.x * 14.0 + time * 3.5) * sin(vWorldPos.z * 12.0 - time * 4.1);
        shimmer = pow(max(0.0, shimmer), 3.0) * 0.18;

        // ─── Base color: deep → mid by wave height, then mix to shallow near rim
        float h = clamp(vWave * 5.0, -1.0, 1.0);
        vec3 col = mix(deep, mid, 0.5 + h * 0.5);
        col = mix(col, shallow, shallowBoost * 0.65);

        // SSS — bright peaks on wave crests
        float sss = pow(max(0.0, h), 1.5) * 0.4;
        vec3 sssColor = vec3(0.08, 0.30, 0.25);
        col += sssColor * sss;

        // Fresnel mixes in sky reflection
        col = mix(col, sky, fresnel * 0.6 + caustic * 0.12);

        // Add caustic highlights (cyan-aqua)
        col += vec3(0.05, 0.20, 0.18) * caustic * (0.4 + shallowBoost * 0.8);
        col += vec3(0.25, 0.40, 0.35) * causticPeak * 0.15;

        // Add shimmer (white-cyan high-frequency twinkle)
        col += vec3(0.30, 0.45, 0.50) * shimmer * (0.5 + shallowBoost * 0.5);

        // Specular sun glints
        vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
        vec3 halfVec = normalize(vViewWS + lightDir);
        float spec = pow(max(0.0, dot(vNormalWS, halfVec)), 256.0);
        col += vec3(0.7, 0.65, 0.55) * spec * 0.9 * (1.0 - fresnel * 0.5);

        // Wave-crest foam
        float foam = smoothstep(0.04, 0.09, vWave);
        // Pronounced edge foam ring (extended threshold for visibility)
        float edgeFoamInner = smoothstep(2.75, 2.05, distFromCenter);
        float edgeFoamOuter = smoothstep(3.05, 2.85, distFromCenter);
        // Animated edge foam wobble for "lapping" effect
        float edgeWobble = sin(atan(vWorldPos.z - 5.0, vWorldPos.x) * 8.0 + time * 1.6) * 0.5 + 0.5;
        float edgeFoam = max(edgeFoamInner * 0.5, edgeFoamOuter * (0.55 + edgeWobble * 0.4));
        float totalFoam = max(foam * 0.55, edgeFoam);
        vec3 foamColor = vec3(0.70, 0.85, 0.85);
        col = mix(col, foamColor, totalFoam);

        float alpha = mix(0.82, 0.96, fresnel);
        if (viewFromBelow > 0.5) {
            alpha = 1.0;
            // From below: brighter teal so the underside has presence
            col = vec3(0.015, 0.05, 0.07);
        }
        gl_FragColor = vec4(col, alpha);
      }
    `
);

// ─── Underwater caustics — voronoi-like cellular pattern ──────────────
export const CausticsMaterial = shaderMaterial(
    { time: 0 },
    /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      varying vec2 vUv;

      // Hash for cell jitter
      vec2 hash22(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453);
      }

      // Cheap voronoi — returns F1 (distance to nearest feature point)
      // and F2-F1 (edge sharpness) for caustic-style highlights.
      vec2 voronoi(vec2 uv, float t) {
        vec2 g = floor(uv);
        vec2 f = fract(uv);
        float f1 = 8.0;
        float f2 = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 lattice = vec2(float(x), float(y));
            vec2 o = hash22(g + lattice);
            // Animate the feature points (slow drift)
            o = 0.5 + 0.5 * sin(t * 0.6 + 6.2831 * o);
            vec2 r = lattice + o - f;
            float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; }
            else if (d < f2) { f2 = d; }
          }
        }
        return vec2(sqrt(f1), sqrt(f2));
      }

      void main() {
        // Two layers of voronoi at different scales — drift slowly
        vec2 uv1 = vUv * 6.0 + vec2(time * 0.04, time * 0.03);
        vec2 uv2 = vUv * 11.0 + vec2(-time * 0.05, time * 0.045);
        vec2 v1 = voronoi(uv1, time * 0.8);
        vec2 v2 = voronoi(uv2, time * 1.1 + 13.0);

        // Edge sharpness = F2 - F1 → bright cell edges = caustic highlights
        float edge1 = v1.y - v1.x;
        float edge2 = v2.y - v2.x;

        // Combine: large bright peaks + smaller filigree
        float bright1 = pow(smoothstep(0.0, 0.6, edge1), 1.5);
        float bright2 = pow(smoothstep(0.0, 0.5, edge2), 2.0);
        float c = bright1 * 0.75 + bright2 * 0.55;

        // Add a soft animated overlay so it never looks static
        float pulse = 0.85 + 0.15 * sin(time * 0.8 + vUv.x * 3.0 + vUv.y * 2.0);
        c *= pulse;

        // Cyan-aqua-green palette — push toward bright tropical water
        vec3 col = vec3(0.0) ;
        col += vec3(0.15, 0.55, 0.45) * c;
        col += vec3(0.05, 0.30, 0.30) * c * c * 0.8;       // bright peaks → cyan
        col += vec3(0.20, 0.65, 0.55) * pow(c, 4.0) * 0.6; // very bright peaks → aqua-green

        float alpha = clamp(c * 0.6, 0.0, 0.85);
        gl_FragColor = vec4(col, alpha);
      }
    `
);

// ─── LightShaftMaterial — soft volumetric god ray for the water hole ──
// Used on a cylinder (open-ended) wrapping the water column.  Fragment
// shader fades alpha radially (centre bright, edges 0) and vertically
// (apex bright, base & top faded) so the shaft reads as *light* rather
// than a solid translucent cone — fixing the "PNG triangle" look.
export const LightShaftMaterial = shaderMaterial(
    { time: 0, intensity: 1.0, color: [0.42, 0.78, 1.0] },
    /* glsl */ `
      varying vec2 vUv;
      varying vec3 vLocalPos;
      void main() {
        vUv = uv;
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform float time;
      uniform float intensity;
      uniform vec3  color;
      varying vec2 vUv;
      varying vec3 vLocalPos;
      void main() {
        // vUv.x walks around the cylinder, vUv.y walks bottom→top.
        // Cylinder is open (no caps) so we treat alpha as a soft envelope:
        //   - vertical: bright at bottom (water surface), fading up
        //   - around:   constant (it's a cylinder ring, not a cone)
        // The "billboard from any angle" feel comes from camera always
        // grazing the cylinder wall at low angle → fresnel-like glow.
        float vertical = 1.0 - vUv.y;              // 1 at bottom, 0 at top
        vertical = pow(vertical, 1.4);              // softer falloff
        // Soft pulse so the shaft breathes
        float pulse = 0.85 + 0.15 * sin(time * 0.6) + 0.05 * sin(time * 1.7 + 1.0);
        // Dust speckles drifting upward inside the shaft
        float speckle = step(0.985,
          fract(sin(dot(vec2(vUv.x * 20.0, vUv.y * 60.0 - time * 0.4),
                        vec2(12.9898, 78.233))) * 43758.5453));
        // Combine
        float a = vertical * pulse * intensity * 0.18;
        vec3  c = color * (vertical * 1.4 + 0.2);
        c += color * speckle * 1.8;
        gl_FragColor = vec4(c, a);
      }
    `
);
