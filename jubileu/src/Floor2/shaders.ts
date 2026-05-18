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
        float ripple1 = sin(dist * 25.0 - time * 2.0) * 0.5 + 0.5;
        float ripple2 = sin(dist * 18.0 + time * 1.5 + 1.0) * 0.5 + 0.5;
        float cross1 = sin(uv.x * 22.0 + time * 1.8) * sin(uv.y * 20.0 - time * 1.3) * 0.5 + 0.5;
        float cross2 = sin(uv.x * 16.0 - time * 1.1 + 2.0) * sin(uv.y * 14.0 + time * 0.9) * 0.5 + 0.5;
        float ripple = pow(ripple1 * ripple2, 1.5) * 0.6 + pow(cross1 * cross2, 2.0) * 0.4;
        vec3 col = vec3(0.06, 0.15, 0.22);
        col += vec3(0.05, 0.18, 0.22) * ripple;
        float caustic = pow(ripple, 3.0) * 0.3;
        col += vec3(0.06, 0.20, 0.14) * caustic;
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
      void main() {
        vec2 uv = vUv;
        uv += vec2(sin(uv.y * 30.0 + time * 2.0) * 0.003, cos(uv.x * 25.0 + time * 1.7) * 0.003) * (1.0 - depth);
        vec2 center = uv - 0.5;
        float vignette = 1.0 - dot(center, center) * 2.5;
        vignette = clamp(vignette, 0.0, 1.0);
        float c1 = sin(uv.x * 18.0 + time * 1.4) * sin(uv.y * 15.0 + time * 1.1);
        float c2 = sin(uv.x * 12.0 - time * 0.9 + 1.5) * sin(uv.y * 10.0 + time * 1.3);
        float caustic = pow(max(0.0, c1 * c2), 2.5) * 0.2;
        vec3 shallowTint = vec3(0.04, 0.20, 0.35);
        vec3 midTint = vec3(0.02, 0.14, 0.30);
        vec3 deepTint = vec3(0.01, 0.08, 0.22);
        vec3 tint;
        if (depth < 0.35) {
          tint = mix(shallowTint, midTint, depth / 0.35);
        } else {
          tint = mix(midTint, deepTint, (depth - 0.35) / 0.65);
        }
        tint += vec3(0.0, caustic * 0.5, caustic * 0.4);
        float alpha = (0.12 + depth * 0.30) * vignette;
        float edgeDist = length(center) * 2.0;
        tint.r += edgeDist * 0.005 * depth;
        tint.b += edgeDist * 0.01 * (1.0 - depth);
        gl_FragColor = vec4(tint, alpha);
      }
    `
);

// ─── Water shader — 8-wave Gerstner + SSS + Fresnel + foam ───────────
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
        vec2 d5 = normalize(vec2(-0.3, 0.4));
        vec2 d6 = normalize(vec2(0.6, 0.6));
        vec2 d7 = normalize(vec2(-0.7, -0.3));
        vec2 d8 = normalize(vec2(0.4, -0.8));

        vec4 w1 = gerstner(p.xz, d1, 0.22, 4.0, time * 0.8);
        vec4 w2 = gerstner(p.xz, d2, 0.18, 2.8, time * 0.95 + 1.7);
        vec4 w3 = gerstner(p.xz, d3, 0.12, 1.8, time * 1.15 + 3.2);
        vec4 w4 = gerstner(p.xz, d4, 0.07, 1.2, time * 1.4 + 5.0);
        vec4 w5 = gerstner(p.xz, d5, 0.04, 0.8, time * 1.6 + 2.1);
        vec4 w6 = gerstner(p.xz, d6, 0.03, 0.6, time * 1.8 + 4.5);
        vec4 w7 = gerstner(p.xz, d7, 0.025, 0.5, time * 2.0 + 6.3);
        vec4 w8 = gerstner(p.xz, d8, 0.02, 0.4, time * 2.2 + 8.1);

        vec3 disp = w1.xyz + w2.xyz + w3.xyz + w4.xyz + w5.xyz + w6.xyz + w7.xyz + w8.xyz;
        p += disp;
        vWave = disp.y;

        float k1 = 6.28318 / 4.0;  float c1 = sqrt(9.8 / k1);  float a1 = 0.22 / k1;
        float k2 = 6.28318 / 2.8;  float c2 = sqrt(9.8 / k2);  float a2 = 0.18 / k2;
        float k3 = 6.28318 / 1.8;  float c3 = sqrt(9.8 / k3);  float a3 = 0.12 / k3;
        float k4 = 6.28318 / 1.2;  float c4 = sqrt(9.8 / k4);  float a4 = 0.07 / k4;
        float k5 = 6.28318 / 0.8;  float c5 = sqrt(9.8 / k5);  float a5 = 0.04 / k5;
        float k6 = 6.28318 / 0.6;  float c6 = sqrt(9.8 / k6);  float a6 = 0.03 / k6;
        float k7 = 6.28318 / 0.5;  float c7 = sqrt(9.8 / k7);  float a7 = 0.025 / k7;
        float k8 = 6.28318 / 0.4;  float c8 = sqrt(9.8 / k8);  float a8 = 0.02 / k8;

        float f1 = k1 * (dot(d1, position.xz) - c1 * time * 0.8);
        float f2 = k2 * (dot(d2, position.xz) - c2 * time * 0.95 - 1.7 * c2);
        float f3 = k3 * (dot(d3, position.xz) - c3 * time * 1.15 - 3.2 * c3);
        float f4 = k4 * (dot(d4, position.xz) - c4 * time * 1.4 - 5.0 * c4);
        float f5 = k5 * (dot(d5, position.xz) - c5 * time * 1.6 - 2.1 * c5);
        float f6 = k6 * (dot(d6, position.xz) - c6 * time * 1.8 - 4.5 * c6);
        float f7 = k7 * (dot(d7, position.xz) - c7 * time * 2.0 - 6.3 * c7);
        float f8 = k8 * (dot(d8, position.xz) - c8 * time * 2.2 - 8.1 * c8);

        vec3 dPdx = vec3(
          1.0 - (d1.x * d1.x * a1 * k1 * sin(f1) + d2.x * d2.x * a2 * k2 * sin(f2)
               + d3.x * d3.x * a3 * k3 * sin(f3) + d4.x * d4.x * a4 * k4 * sin(f4)
               + d5.x * d5.x * a5 * k5 * sin(f5) + d6.x * d6.x * a6 * k6 * sin(f6)
               + d7.x * d7.x * a7 * k7 * sin(f7) + d8.x * d8.x * a8 * k8 * sin(f8)),
          d1.x * a1 * k1 * cos(f1) + d2.x * a2 * k2 * cos(f2) + d3.x * a3 * k3 * cos(f3) + d4.x * a4 * k4 * cos(f4)
          + d5.x * a5 * k5 * cos(f5) + d6.x * a6 * k6 * cos(f6) + d7.x * a7 * k7 * cos(f7) + d8.x * a8 * k8 * cos(f8),
          -(d1.x * d1.y * a1 * k1 * sin(f1) + d2.x * d2.y * a2 * k2 * sin(f2)
          + d3.x * d3.y * a3 * k3 * sin(f3) + d4.x * d4.y * a4 * k4 * sin(f4)
          + d5.x * d5.y * a5 * k5 * sin(f5) + d6.x * d6.y * a6 * k6 * sin(f6)
          + d7.x * d7.y * a7 * k7 * sin(f7) + d8.x * d8.y * a8 * k8 * sin(f8))
        );
        vec3 dPdz = vec3(
          -(d1.x * d1.y * a1 * k1 * sin(f1) + d2.x * d2.y * a2 * k2 * sin(f2)
          + d3.x * d3.y * a3 * k3 * sin(f3) + d4.x * d4.y * a4 * k4 * sin(f4)
          + d5.x * d5.y * a5 * k5 * sin(f5) + d6.x * d6.y * a6 * k6 * sin(f6)
          + d7.x * d7.y * a7 * k7 * sin(f7) + d8.x * d8.y * a8 * k8 * sin(f8)),
          d1.y * a1 * k1 * cos(f1) + d2.y * a2 * k2 * cos(f2) + d3.y * a3 * k3 * cos(f3) + d4.y * a4 * k4 * cos(f4)
          + d5.y * a5 * k5 * cos(f5) + d6.y * a6 * k6 * cos(f6) + d7.y * a7 * k7 * cos(f7) + d8.y * a8 * k8 * cos(f8),
          1.0 - (d1.y * d1.y * a1 * k1 * sin(f1) + d2.y * d2.y * a2 * k2 * sin(f2)
               + d3.y * d3.y * a3 * k3 * sin(f3) + d4.y * d4.y * a4 * k4 * sin(f4)
               + d5.y * d5.y * a5 * k5 * sin(f5) + d6.y * d6.y * a6 * k6 * sin(f6)
               + d7.y * d7.y * a7 * k7 * sin(f7) + d8.y * d8.y * a8 * k8 * sin(f8))
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

        vec3 deep   = vec3(0.02, 0.08, 0.15);
        vec3 mid    = vec3(0.06, 0.18, 0.25);
        vec3 sky    = vec3(0.25, 0.40, 0.45);

        float c1 = sin(vUv.x * 32.0 + time * 0.9) * 0.5 + 0.5;
        float c2 = sin(vUv.y * 26.0 + time * 1.1 + 2.0) * 0.5 + 0.5;
        float caustic = pow(c1 * c2, 2.5);

        float h = clamp(vWave * 5.0, -1.0, 1.0);
        vec3 col = mix(deep, mid, 0.5 + h * 0.5);

        float sss = pow(max(0.0, h), 1.5) * 0.5;
        vec3 sssColor = vec3(0.08, 0.35, 0.25);
        col += sssColor * sss;

        col = mix(col, sky, fresnel * 0.6 + caustic * 0.15);

        vec3 lightDir = normalize(vec3(0.4, 1.0, 0.3));
        vec3 halfVec = normalize(vViewWS + lightDir);
        float spec = pow(max(0.0, dot(vNormalWS, halfVec)), 256.0);
        col += vec3(0.7, 0.65, 0.5) * spec * 1.0 * (1.0 - fresnel * 0.5);

        float foam = smoothstep(0.04, 0.09, vWave);
        float distFromCenter = length(vWorldPos.xz - vec2(0.0, 5.0));
        float edgeFoam = smoothstep(3.0, 1.5, distFromCenter) * 0.55;
        float totalFoam = max(foam * 0.6, edgeFoam);
        col = mix(col, vec3(0.7, 0.78, 0.82), totalFoam);

        float alpha = mix(0.90, 0.98, fresnel);
        if (viewFromBelow > 0.5) {
            alpha = 1.0;
            col = vec3(0.02, 0.06, 0.10);
        }
        gl_FragColor = vec4(col, alpha);
      }
    `
);

// ─── Underwater caustics — RGB chromatic aberration ────────────────────
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

      float causticPattern(vec2 uv, float t) {
        float a = sin(uv.x * 6.28 + t * 0.6) + sin((uv.x + uv.y) * 5.0 + t * 0.9);
        float b = sin(uv.y * 6.28 + t * 0.5 + 1.2) + sin((uv.y - uv.x) * 4.5 + t * 0.7);
        return pow(max(0.0, sin(a) * sin(b)), 2.5);
      }

      void main() {
        vec2 uv = vUv * 10.0;
        float r = causticPattern(uv + vec2(0.002, 0.001), time);
        float g = causticPattern(uv, time);
        float b = causticPattern(uv - vec2(0.001, 0.002), time);
        vec3 col = vec3(r * 0.3, g * 0.7, b * 0.5);
        gl_FragColor = vec4(col, (r + g + b) * 0.15);
      }
    `
);
