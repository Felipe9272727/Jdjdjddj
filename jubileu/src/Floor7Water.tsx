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
    o += gerstner(vec2( 1.0,  0.3), 0.62, 9.5, 0.50, 0.9, p, nrm);
    o += gerstner(vec2(-0.5,  1.0), 0.55, 5.6, 0.30, 1.0, p, nrm);
    o += gerstner(vec2( 0.8, -0.6), 0.48, 3.1, 0.16, 1.25, p, nrm);
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

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);

    // fragment-space ripple normal in TWO octaves so the coarse wave mesh never
    // terraces into bands AND the far sea never goes mirror-flat ("poured resin"):
    //  - a FINE octave, attenuated with distance (would sparkle-alias far away)
    //  - a COARSE, long-wavelength octave kept ALIVE to the horizon (a small
    //    floor of micro-chop so distant water still breathes).
    vec2 q = vWorldPos.xz;
    float detAtt = mix(0.16, 1.0, 1.0 - smoothstep(10.0, 58.0, dist));
    float fnx = (sin(q.x * 1.7 + uTime * 1.3) + 0.6 * sin(q.x * 3.3 - q.y * 1.1 + uTime * 1.9)) * 0.05 * detAtt;
    float fnz = (sin(q.y * 1.9 - uTime * 1.1) + 0.6 * sin(q.y * 3.1 + q.x * 1.3 - uTime * 1.7)) * 0.05 * detAtt;
    // long-wavelength swell chop — survives all the way out (slightly stronger
    // now that the two smallest vertex waves moved down here)
    float cnx = sin(q.x * 0.32 + q.y * 0.17 + uTime * 0.6) * 0.034;
    float cnz = sin(q.y * 0.29 - q.x * 0.21 + uTime * 0.5) * 0.034;
    N = normalize(N + vec3(fnx + cnx, 0.0, fnz + cnz));

    float fres = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 3.0);

    // base water colour: deeper in troughs, brighter facing up (softened so the
    // up-facing/tilted rows don't read as hard light/dark terraces)
    float up = clamp(N.y, 0.0, 1.0);
    vec3 base = mix(uDeep, uShallow, up * 0.7 + 0.15);

    // sky reflection via fresnel
    vec3 col = mix(base, uSky, fres * 0.7);

    // sun glitter (specular off the wave normals) — exponent eased so the
    // glitter spreads into a believable streak instead of a hard pinpoint
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 90.0);
    col += uSunColor * spec * 1.15;
    // broad sun sheen
    col += uSunColor * pow(max(dot(N, H), 0.0), 16.0) * 0.12;

    // foam (crests + the breaking tide-surge ring)
    float foam = clamp(vFoam, 0.0, 1.0);
    col = mix(col, vec3(0.92, 0.96, 0.97), foam * 0.85);
    // the surge ring froths a brighter, greener-white as it breaks over the rail
    col = mix(col, vec3(0.86, 0.94, 0.95), clamp(vSurge * 1.6, 0.0, 1.0) * 0.6);

    // hull contact foam — an animated band hugging the ship's waterline
    // footprint (ellipse, semi-axes ~beam x ~length), stronger toward the bow
    // so the ship reads as sitting IN the water, parting it, not pasted on
    float hr = length(vWorldPos.xz / vec2(5.9, 14.6));
    float contact = smoothstep(1.34, 1.02, hr) * smoothstep(0.90, 1.06, hr);
    contact *= 0.5 + 0.5 * sin(uTime * 2.4 + hr * 26.0);
    contact *= 1.0 + 0.6 * smoothstep(0.0, 14.0, vWorldPos.z);   // heavier bow wave
    col = mix(col, vec3(0.93, 0.97, 0.98), clamp(contact, 0.0, 1.0) * 0.65);

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
        uDeep: { value: new THREE.Color('#08303f') },
        uShallow: { value: new THREE.Color('#1f7e9c') },
        uSky: { value: new THREE.Color('#cfe4f2') },
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
