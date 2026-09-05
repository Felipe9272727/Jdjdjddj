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
 * (Havia aqui um `createOutlineMaterial` — casco invertido com largura escalada
 * pela distância. Ninguém nunca o importou: as plataformas do Andar 3 usam uma
 * borda de GEOMETRIA de verdade, e as nuvens têm o casco próprio delas. Saiu.)
 *
 * ── NÉVOA ────────────────────────────────────────────────────────────────────
 * Como é ShaderMaterial cru, a névoa da cena NÃO chega aqui de graça: sem os
 * chunks `fog_*` o `scene.fog` do Andar 3 pintava os espinhos (MeshToonMaterial)
 * e o casco das nuvens (MeshBasicMaterial) e deixava as plataformas e o miolo
 * branco das nuvens intactos — a mesma cena com dois horizontes diferentes.
 * Agora o material declara `fog: true` e inclui os chunks, então tudo se
 * dissolve junto no céu.
 *
 * Refs: Arc System Works GGXrd GDC talk; lettier "3D Game Shaders for
 * Beginners" (rim lighting); danielilett cel-shading series.
 */

import * as THREE from 'three';

// World-space direction TO the key light (matches the <directionalLight> below).
export const KEY_LIGHT_DIR = new THREE.Vector3(-6, 14, 8).normalize();

const TOON_VERT = /* glsl */`
  #include <fog_pars_vertex>
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const TOON_FRAG = /* glsl */`
  precision highp float;
  #include <fog_pars_fragment>
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
    #include <fog_fragment>
  }
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
        // `fog: true` é o que faz o three definir USE_FOG e injetar fogColor/
        // fogNear/fogFar; sem os uniforms de `UniformsLib.fog` o programa não
        // compila com o define ligado.
        fog: true,
        uniforms: {
            ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
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

