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
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;

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
    o += gerstner(vec2( 1.0,  0.3), 0.55, 7.0, 0.34, 1.0, p, nrm);
    o += gerstner(vec2(-0.6,  1.0), 0.45, 4.2, 0.20, 1.1, p, nrm);
    o += gerstner(vec2( 0.8, -0.7), 0.40, 2.6, 0.11, 1.3, p, nrm);
    o += gerstner(vec2(-0.3, -1.0), 0.30, 1.5, 0.06, 1.6, p, nrm);
    vec3 disp = p + o;
    vec4 wp = modelMatrix * vec4(disp, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(nrm);
    // foam where crests pinch (high + steep)
    vFoam = smoothstep(0.18, 0.42, o.y);
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

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 3.0);

    // base water colour: deeper in troughs, brighter facing up
    float up = clamp(N.y, 0.0, 1.0);
    vec3 base = mix(uDeep, uShallow, up * up);

    // sky reflection via fresnel
    vec3 col = mix(base, uSky, fres * 0.7);

    // sun glitter (sharp specular off the wave normals)
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 220.0);
    col += uSunColor * spec * 1.6;
    // broad sun sheen
    col += uSunColor * pow(max(dot(N, H), 0.0), 16.0) * 0.12;

    // foam
    float foam = clamp(vFoam, 0.0, 1.0);
    col = mix(col, vec3(0.92, 0.96, 0.97), foam * 0.85);

    // fade distant water into the sky so the plane meets the horizon seamlessly
    float dist = length(cameraPosition - vWorldPos);
    float horizon = smoothstep(55.0, 150.0, dist);
    col = mix(col, uSky, horizon);
    float a = mix(0.93, 1.0, horizon);

    gl_FragColor = vec4(col, a);
}
`;

export const Floor7Water: React.FC<{ sunDir: THREE.Vector3 }> = ({ sunDir }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uSunDir: { value: sunDir.clone().normalize() },
        uSunColor: { value: new THREE.Color('#fff3d6') },
        uDeep: { value: new THREE.Color('#0d3a4a') },
        uShallow: { value: new THREE.Color('#2f8aa3') },
        uSky: { value: new THREE.Color('#bcd9ec') },
    }), [sunDir]);

    useFrame((_, dt) => {
        if (matRef.current) (matRef.current.uniforms.uTime.value as number) += dt;
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
