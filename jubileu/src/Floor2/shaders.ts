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
    { time: 0, depth: 0, intensity: 1.0 },
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
      uniform float intensity;
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
        float alpha = (0.045 + depth * 0.055 + (1.0-vignette)*0.12) * intensity;
        tint.r += radial * 0.005 * depth;
        tint.b += radial * 0.012 * (1.0 - depth);
        // Subtle blue shift at deep
        tint.b += depth * 0.015;

        gl_FragColor = vec4(tint, alpha);
      }
    `
);

// ─── Circular pool: XZ height field, analytic normals, broken shoreline foam ──
export const WaterMaterial = shaderMaterial(
    { time: 0, radius: 3, impactX: 0, impactZ: 0, impactAt: -100 },
    /* glsl */ `
      uniform float time;
      uniform float radius;
      uniform float impactX, impactZ, impactAt;
      varying vec3 vWorldPos;
      varying vec3 vNormalWS;
      varying vec2 vPool;
      varying float vHeight;
      vec3 wave(vec2 p, vec2 d, float amplitude, float k, float speed) {
        float phase = dot(p, d) * k - time * speed;
        return vec3(amplitude * sin(phase), amplitude * k * cos(phase) * d);
      }
      void main() {
        // Geometry is already in XZ. The old rotated XY plane sampled p.xz,
        // so one wave axis was constant and displacement went sideways.
        vec3 p = position;
        vPool = p.xz;
        vec3 w = wave(p.xz, vec2(.96,.28), .044, 2.4, 1.25)
               + wave(p.xz, vec2(-.38,.925), .027, 4.6, 1.9)
               + wave(p.xz, vec2(.7,-.714), .012, 8.0, 2.5);
        float r = length(p.xz);
        float edge = 1.0 - smoothstep(radius - .4, radius, r);
        float u = clamp((r - radius + .4) / .4, 0.0, 1.0);
        vec2 edgeGrad = -6.0 * u * (1.0-u) / .4 * p.xz / max(r,.001);
        vec2 offset = p.xz - vec2(impactX,impactZ);
        float dist = length(offset);
        float age = max(0.0, time-impactAt);
        float envelope = exp(-age*1.6) * exp(-pow(dist-age*1.8,2.0)*5.0);
        float phase = dist*13.0-age*18.0;
        float ripple = .05*sin(phase)*envelope;
        float derivative = .05*envelope*(13.0*cos(phase)-10.0*(dist-age*1.8)*sin(phase));
        vec2 grad = w.yz + derivative * offset/max(dist,.001);
        float height = w.x + ripple;
        vHeight = height*edge;
        p.y += vHeight;
        grad = grad*edge + height*edgeGrad;
        vNormalWS = normalize(mat3(modelMatrix)*vec3(-grad.x,1.0,-grad.y));
        vec4 world = modelMatrix*vec4(p,1.0);
        vWorldPos=world.xyz;
        gl_Position = projectionMatrix*viewMatrix*world;
      }
    `,
    /* glsl */ `
      uniform float time;
      uniform float radius;
      varying vec3 vWorldPos;
      varying vec3 vNormalWS;
      varying vec2 vPool;
      varying float vHeight;
      void main() {
        vec3 view = normalize(cameraPosition-vWorldPos);
        vec3 normal = normalize(vNormalWS);
        float micro = sin(vPool.x*23.0+time*1.8)*cos(vPool.y*19.0-time*1.4);
        normal = normalize(normal+vec3(micro*.035,0.0,sin(vPool.x*15.0-vPool.y*21.0+time)*.025));
        float facing = abs(dot(normal,view));
        float fresnel = .025+.975*pow(1.0-facing,5.0);
        float r = length(vPool);
        float shoal = smoothstep(radius*.38,radius,r);
        vec3 water = mix(vec3(.009,.067,.13),vec3(.024,.23,.27),shoal*.68+.12);
        water += vec3(.016,.065,.073)*(vHeight*5.0+.35);
        // Warm fractured cave reflections instead of an outdoor sky.
        vec3 reflection = reflect(-view,normal);
        float vault = .5+.5*sin(reflection.x*12.0+reflection.z*7.0);
        vec3 cave = mix(vec3(.026,.043,.048),vec3(.13,.20,.20),vault);
        float lamp = pow(max(0.0,dot(reflection,normalize(vec3(-.5,.8,-.4)))),70.0);
        cave += vec3(.70,.37,.11)*lamp;
        vec3 col = mix(water,cave,fresnel*.72);
        vec3 light = normalize(vec3(-.4,1.0,.65));
        float spec = pow(max(0.0,dot(normal,normalize(view+light))),150.0);
        col += vec3(.38,.70,.75)*spec*.6;
        // Ordered smoothstep edges: a thin, intermittent shoreline, never a white disc.
        float angle = atan(vPool.y,vPool.x);
        float lace = .5+.5*sin(angle*13.0+sin(angle*7.0-time)*1.4+time*.5);
        float shore = smoothstep(radius-.14,radius-.025,r)*(1.0-smoothstep(radius-.02,radius,r));
        float foam = shore*smoothstep(.28,.75,lace)*.48;
        col = mix(col,vec3(.36,.58,.53),foam);
        if (!gl_FrontFacing) {
          float caustic = pow(.5+.5*sin(vPool.x*4.0+time)*sin(vPool.y*5.0-time*.7),4.0);
          col = vec3(.016,.15,.22)+vec3(.045,.13,.12)*caustic;
        }
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
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

// ─── WellWaterMaterial — animated water "texture" for the well shaft walls ─
// Replaces the rock texture on the inside of the well so the whole pit reads
// as a column of moving water (not a stone hole). Applied to a BackSide
// cylinder. Bright blue base + flowing caustic highlights that drift downward,
// plus a vertical brightness gradient (brighter near the rim where light hits).
export const WellWaterMaterial = shaderMaterial(
    { time: 0 },
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
      varying vec2 vUv;
      varying vec3 vLocalPos;

      // Flowing caustic bands — cheap layered sines that drift downward so the
      // wall looks like sunlight rippling through water inside the well.
      float caustic(vec2 uv, float t) {
        float a = sin(uv.x * 18.0 + t * 1.3) * 0.5 + 0.5;
        float b = sin(uv.y * 22.0 - t * 1.7 + 1.5) * 0.5 + 0.5;
        float c = sin((uv.x + uv.y) * 14.0 + t * 0.9) * 0.5 + 0.5;
        float d = sin((uv.x - uv.y) * 26.0 - t * 1.1) * 0.5 + 0.5;
        return pow(a * b, 2.0) * 0.7 + pow(c * d, 3.0) * 0.6;
      }

      void main() {
        // vUv.y: 0 at bottom (water surface), 1 at top (rim).
        // Deep blue at the bottom -> brighter clear blue near the rim.
        vec3 deep    = vec3(0.04, 0.20, 0.46);
        vec3 bright  = vec3(0.14, 0.50, 0.84);
        vec3 col = mix(deep, bright, smoothstep(0.0, 1.0, vUv.y));

        // Two caustic layers at different scales/speeds, drifting downward.
        vec2 flow = vUv + vec2(0.0, -time * 0.06);
        float c1 = caustic(flow * vec2(2.0, 3.0), time);
        float c2 = caustic(flow * vec2(4.0, 6.0) + 7.0, time * 1.3);
        float caust = c1 * 0.7 + c2 * 0.5;

        // Bright cyan-white caustic highlights on top of the blue base.
        col += vec3(0.20, 0.55, 0.80) * caust * (0.5 + vUv.y * 0.6);
        col += vec3(0.40, 0.70, 0.95) * pow(caust, 2.5) * 0.4;

        // High-frequency shimmer so it always looks alive.
        float shimmer = sin(vUv.x * 40.0 + time * 3.0) * sin(vUv.y * 30.0 - time * 3.6);
        col += vec3(0.25, 0.45, 0.65) * pow(max(0.0, shimmer), 3.0) * 0.25;

        gl_FragColor = vec4(col, 1.0);
      }
    `
);
