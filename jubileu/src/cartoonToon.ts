/**
 * cartoonToon.ts — Advanced stylized ("Guilty Gear Xrd"-class) toon shading
 * for the Floor 3 Portal obby. This is a from-scratch shader system, not
 * MeshToonMaterial: it does everything the Arc System Works pipeline does in
 * a single pass, which is what gives the "designed cartoon", not "filter on
 * realism", look the project was missing.
 *
 * What the fill shader does (per fragment):
 *   1. HALF-LAMBERT diffuse quantised into hard bands (the cel ramp).
 *   2. COLOURED SHADOW — the dark band is tinted toward a separate shadow hue
 *      instead of just darkening (Xrd's SSS-map trick, faked with a uniform).
 *   3. HARD-STEPPED SPECULAR — an anime "shine" dot via Blinn-Phong + smoothstep.
 *   4. FRESNEL RIM LIGHT — a crisp light edge that makes every shape pop off
 *      the background (the single biggest "AAA stylised" tell).
 *   5. EMISSIVE — for portal rings, energy edges, the goal.
 *
 * The outline shader is the classic inverted-hull (back-face) normal extrusion,
 * but with DISTANCE-SCALED width so the line stays a near-constant thickness on
 * screen at any depth — exactly how Xrd keeps its outlines readable. No
 * post-processing pass, no SobeI depth edge: pure geometry, robust and cheap.
 *
 * Refs: Arc System Works GGXrd GDC talk; lettier "3D Game Shaders for
 * Beginners" (rim lighting); danielilett cel-shading series.
 */

import * as THREE from 'three';

// World-space direction TO the key light (matches the <directionalLight> below).
export const KEY_LIGHT_DIR = new THREE.Vector3(-6, 14, 8).normalize();

const TOON_VERT = /* glsl */`
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TOON_FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uColor;
  uniform vec3  uShadow;       // colored shadow tint (multiplies base)
  uniform vec3  uLightDir;     // world, normalized
  uniform vec3  uLightColor;
  uniform float uBands;
  uniform float uAmbient;
  uniform vec3  uRimColor;
  uniform float uRimPower;
  uniform float uRimStrength;
  uniform vec3  uSpecColor;
  uniform float uSpecThreshold;
  uniform float uShininess;
  uniform vec3  uEmissive;
  uniform float uEmissiveStrength;
  uniform float uSeams;        // 0 = off, >0 = Aperture panel seam grid density
  uniform vec3  uSeamColor;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 H = normalize(L + V);

    // ── Banded half-Lambert with COLORED shadow ──
    float ndl   = dot(N, L) * 0.5 + 0.5;
    float bands = max(uBands, 1.0);
    float lit   = floor(ndl * bands + 0.001) / bands;
    vec3  litCol    = uColor * uLightColor;
    vec3  shadowCol = uColor * uShadow;
    vec3  diffuse   = mix(shadowCol, litCol, lit) + uColor * uAmbient;

    // ── Hard anime specular ──
    float ndh  = max(dot(N, H), 0.0);
    float spec = pow(ndh, uShininess);
    float specMask = smoothstep(uSpecThreshold, uSpecThreshold + 0.025, spec) * step(0.02, dot(N,L));
    vec3  specular = uSpecColor * specMask;

    // ── Fresnel rim light (crisp edge) ──
    float fres    = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
    float rimMask = smoothstep(0.55, 0.62, fres);
    vec3  rim     = uRimColor * rimMask * uRimStrength;

    vec3 col = diffuse + specular + rim + uEmissive * uEmissiveStrength;

    // ── Optional Aperture panel seams ──
    if (uSeams > 0.0) {
      vec2 g = fract(vUv * uSeams);
      vec2 e = min(g, 1.0 - g);
      float line = 1.0 - smoothstep(0.0, 0.035, min(e.x, e.y));
      col = mix(col, uSeamColor, line * 0.85);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

const OUTLINE_VERT = /* glsl */`
  uniform float uOutlineWidth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * normal);
    float dist = distance(cameraPosition, wp.xyz);
    // distance-scaled so the silhouette keeps a near-constant screen thickness
    float w = uOutlineWidth * (dist * 0.16 + 0.45);
    vec3 extruded = wp.xyz + wn * w;
    gl_Position = projectionMatrix * viewMatrix * vec4(extruded, 1.0);
  }
`;

const OUTLINE_FRAG = /* glsl */`
  uniform vec3 uOutlineColor;
  void main() { gl_FragColor = vec4(uOutlineColor, 1.0); }
`;

export interface ToonOpts {
    color?: THREE.ColorRepresentation;
    shadow?: THREE.ColorRepresentation;     // colored-shadow tint
    light?: THREE.ColorRepresentation;
    bands?: number;
    ambient?: number;
    rimColor?: THREE.ColorRepresentation;
    rimPower?: number;
    rimStrength?: number;
    specColor?: THREE.ColorRepresentation;
    specThreshold?: number;                  // 0..1, higher = smaller dot
    shininess?: number;
    emissive?: THREE.ColorRepresentation;
    emissiveStrength?: number;
    seams?: number;                          // panel seam grid density (0 = off)
    seamColor?: THREE.ColorRepresentation;
}

export function createToonMaterial(o: ToonOpts = {}): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: TOON_VERT,
        fragmentShader: TOON_FRAG,
        uniforms: {
            uColor:            { value: new THREE.Color(o.color ?? '#ffffff') },
            uShadow:           { value: new THREE.Color(o.shadow ?? '#8492a6') },
            uLightDir:         { value: KEY_LIGHT_DIR.clone() },
            uLightColor:       { value: new THREE.Color(o.light ?? '#fff6e0') },
            uBands:            { value: o.bands ?? 3 },
            uAmbient:          { value: o.ambient ?? 0.18 },
            uRimColor:         { value: new THREE.Color(o.rimColor ?? '#ffffff') },
            uRimPower:         { value: o.rimPower ?? 3.0 },
            uRimStrength:      { value: o.rimStrength ?? 0.6 },
            uSpecColor:        { value: new THREE.Color(o.specColor ?? '#ffffff') },
            uSpecThreshold:    { value: o.specThreshold ?? 0.85 },
            uShininess:        { value: o.shininess ?? 32 },
            uEmissive:         { value: new THREE.Color(o.emissive ?? '#000000') },
            uEmissiveStrength: { value: o.emissiveStrength ?? 0 },
            uSeams:            { value: o.seams ?? 0 },
            uSeamColor:        { value: new THREE.Color(o.seamColor ?? '#1a2230') },
        },
    });
}

export function createOutlineMaterial(width = 0.09, color: THREE.ColorRepresentation = '#0a0712'): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        vertexShader: OUTLINE_VERT,
        fragmentShader: OUTLINE_FRAG,
        side: THREE.BackSide,
        uniforms: {
            uOutlineWidth: { value: width },
            uOutlineColor: { value: new THREE.Color(color) },
        },
    });
}
