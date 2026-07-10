/**
 * Floor7Water.tsx — a custom Gerstner-wave ocean for the pirate ship.
 *
 * Self-contained ShaderMaterial (no external textures, so it inlines into the
 * single-file build): summed Gerstner waves displace + tilt the surface in the
 * vertex shader; the fragment shader does a deep/shallow colour gradient, a
 * fresnel sky reflection, a sharp sun-specular glitter and foam on the crests.
 * Driven by a uTime uniform; the sun direction matches the scene's key light.
 */
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const vert = /* glsl */`
uniform float uTime;
uniform float uTideWarn;   // 0..1 incoming swell — surges the sea around the hull
uniform float uCalm;       // 1 open sea → ~0.2 anchored (the landfall stills it)
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vSurge;

// one Gerstner wave: dir(xz), steepness Q, wavelength, amplitude, speed
vec3 gerstner(vec2 dir, float Q, float wl, float amp, float speed,
              vec3 p, inout vec3 nrm) {
    float k = 6.2831853 / wl;
    float c = sqrt(9.8 / k) * speed;
    vec2 d = normalize(dir);
    float f = k * (dot(d, p.xz) - c * uTime);
    float cf = cos(f), sf = sin(f);
    float wa = k * amp;
    nrm.x -= d.x * wa * cf;
    nrm.z -= d.y * wa * cf;
    nrm.y -= Q * wa * sf;
    return vec3(d.x * (Q * amp * cf), amp * sf, d.y * (Q * amp * cf));
}

void main() {
    vec3 p = position;
    vec3 o = vec3(0.0);
    vec3 nrm = vec3(0.0, 1.0, 0.0);
    // NOTE: only wavelengths the 200/180 vertex grid (~1.1m spacing) can resolve
    // live here — the old wl 1.7/0.95 bands under-sampled into coherent STRIPES
    // across the whole sea (the "vinyl grooves" look). Fine chop is fragment-side.
    o += gerstner(vec2( 0.12,  1.0), 0.64, 11.5, 0.48, 1.15, p, nrm);
    o += gerstner(vec2( 1.0,  0.62), 0.55, 6.8, 0.27, 1.35, p, nrm);
    o += gerstner(vec2(-0.72, 0.45), 0.46, 4.1, 0.14, 1.1, p, nrm);
    o += gerstner(vec2( 0.55,-0.83), 0.38, 2.7, 0.075, 0.95, p, nrm);
    // the landfall stills the sea (harbour water in the island's lee)
    o *= uCalm;
    nrm = mix(vec3(0.0, 1.0, 0.0), nrm, uCalm);

    // TIDE SURGE: as a swell approaches (uTideWarn), a ring of water heaps up
    // and breaks around the ship's waterline footprint — the sea you're about to
    // fight visibly rises and foams over the rail, instead of nothing happening.
    float hr = length(p.xz / vec2(5.9, 14.6));
    float ring = smoothstep(1.45, 1.02, hr) * smoothstep(0.72, 1.02, hr);
    float crest = 0.5 + 0.5 * sin(uTime * 3.2 + hr * 14.0);
    float surge = uTideWarn * ring * (0.55 + 0.65 * crest);
    o.y += surge;
    // tilt the normal up the surge ring so it catches light as it heaves
    nrm.x -= surge * 0.6 * sign(p.x);
    nrm.z -= surge * 0.6 * sign(p.z);
    vSurge = surge;

    vec3 disp = p + o;
    vec4 wp = modelMatrix * vec4(disp, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(nrm);
    // foam where crests pinch (high + steep), plus the breaking surge ring
    vFoam = max(smoothstep(0.40, 0.78, o.y), smoothstep(0.25, 0.85, surge));
    gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const frag = /* glsl */`
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vSurge;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
}
float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 4; i++) { v += noise2(p) * a; p = r * p * 2.03 + 7.1; a *= 0.5; }
    return v;
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);

    // Derivative-like FBM normal. Unlike parallel sine bands, this produces
    // irregular cells and crossing ripples like the concept water while staying
    // texture-free and cheap enough for the mobile single-file build.
    vec2 q = vWorldPos.xz;
    vec2 flow = vec2(uTime * 0.07, -uTime * 0.045);
    float eps = 0.09;
    float n0 = fbm(q * 0.32 + flow);
    float nx = fbm((q + vec2(eps, 0.0)) * 0.32 + flow) - n0;
    float nz = fbm((q + vec2(0.0, eps)) * 0.32 + flow) - n0;
    float detailAtt = 1.0 - smoothstep(28.0, 92.0, dist) * 0.82;
    N = normalize(N + vec3(-nx * 4.2 * detailAtt, 0.0, -nz * 4.2 * detailAtt));

    float fres = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 3.0);

    // base water colour: deeper in troughs, brighter facing up (softened so the
    // up-facing/tilted rows don't read as hard light/dark terraces)
    float up = clamp(N.y, 0.0, 1.0);
    float crestLight = smoothstep(-1.55, -0.45, vWorldPos.y);
    vec3 base = mix(uDeep, uShallow, up * 0.5 + crestLight * 0.34);
    base *= mix(0.78, 1.08, noise2(q * 0.075 + flow * 0.3));

    // sky reflection via fresnel
    vec3 col = mix(base, uSky, fres * 0.56);

    // sun glitter (specular off the wave normals) — exponent eased so the
    // glitter spreads into a believable streak instead of a hard pinpoint
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    // rolling 2-octave value-noise for dotted sparkle, not continuous stripe
    float glitterNoise = smoothstep(0.58, 0.92, fbm(q * 0.75 + flow * 8.0));
    col += uSunColor * spec * 1.28 * glitterNoise;
    // broad sun sheen
    col += uSunColor * pow(max(dot(N, H), 0.0), 8.0) * 0.12;

    // foam (crests + the breaking tide-surge ring)
    float foamBreak = smoothstep(0.43, 0.72, fbm(q * 0.48 - flow * 3.0));
    float foam = clamp(vFoam * (0.42 + foamBreak), 0.0, 1.0);
    col = mix(col, vec3(0.90, 0.96, 0.97), foam * 0.9);
    // the surge ring froths a brighter, greener-white as it breaks over the rail
    col = mix(col, vec3(0.86, 0.94, 0.95), clamp(vSurge * 1.6, 0.0, 1.0) * 0.6);

    // hull contact foam — an animated band hugging the ship's waterline
    // footprint (ellipse, semi-axes ~beam x ~length), stronger toward the bow
    // so the ship reads as sitting IN the water, parting it, not pasted on
    float hr = length(vWorldPos.xz / vec2(5.9, 14.6));
    float contact = smoothstep(1.34, 1.02, hr) * smoothstep(0.90, 1.06, hr);
    contact *= 0.35 + smoothstep(0.35, 0.78, fbm(q * 0.55 + vec2(0.0, uTime * 0.22)));
    contact *= 1.0 + 0.6 * smoothstep(0.0, 14.0, vWorldPos.z);   // heavier bow wave
    col = mix(col, vec3(0.93, 0.97, 0.98), clamp(contact, 0.0, 1.0) * 0.65);

    // broken V-shaped bow wake extending ahead of the stem.
    float ahead = smoothstep(10.0, 17.0, q.y) * (1.0 - smoothstep(17.0, 42.0, q.y));
    float wakeLine = abs(abs(q.x) - (q.y - 10.0) * 0.34);
    float wake = (1.0 - smoothstep(0.0, 1.0, wakeLine)) * ahead;
    wake *= smoothstep(0.38, 0.76, fbm(q * 0.7 - flow * 4.0));
    col = mix(col, vec3(0.92, 0.98, 0.99), wake * 0.72);

    // fade distant water into the sky so the plane meets the horizon seamlessly
    // (pulled closer so any residual far banding melts into the haze)
    float horizon = smoothstep(40.0, 120.0, dist);
    col = mix(col, uSky, horizon);
    float a = mix(0.93, 1.0, horizon);

    gl_FragColor = vec4(col, a);
}
`;

export const Floor7Water: React.FC<{ sunDir: THREE.Vector3; warnRef?: React.MutableRefObject<number>; calmRef?: React.MutableRefObject<number> }> = ({ sunDir, warnRef, calmRef }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uTideWarn: { value: 0 },
        uCalm: { value: 1 },
        uSunDir: { value: sunDir.clone().normalize() },
        uSunColor: { value: new THREE.Color('#ffe9c0') },
        uDeep: { value: new THREE.Color('#021c2c') },
        uShallow: { value: new THREE.Color('#14738b') },
        uSky: { value: new THREE.Color('#91afc2') },
    }), [sunDir]);

    useFrame((_, dt) => {
        if (!matRef.current) return;
        (matRef.current.uniforms.uTime.value as number) += dt;
        // ease toward the brain's swell-warning so the surge ramps smoothly
        const target = warnRef?.current ?? 0;
        const u = matRef.current.uniforms.uTideWarn;
        (u.value as number) += (target - (u.value as number)) * Math.min(1, dt * 6);
        // the brain's calm factor stills the sea across the landfall run
        (matRef.current.uniforms.uCalm.value as number) = calmRef?.current ?? 1;
    });

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]}>
            <planeGeometry args={[200, 200, 180, 180]} />
            <shaderMaterial
                ref={matRef}
                vertexShader={vert}
                fragmentShader={frag}
                uniforms={uniforms}
                transparent
                fog={false}
            />
        </mesh>
    );
};

export default Floor7Water;
