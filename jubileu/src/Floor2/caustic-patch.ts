/**
 * Floor2/caustic-patch.ts — cáusticas na pele das rochas do fundo.
 *
 * Um remendo de onBeforeCompile para os MeshStandardMaterial do fundo (rochas, pilares, arcos, paredes,
 * seixos): a rede de luz da superfície, animada, projetada de cima em posição de mundo, só nas faces que
 * olham para cima e mais forte perto da superfície. Custa um punhado de instruções por pixel e nenhuma
 * passada extra. Um único uniforme de tempo para todos (CAUSTICA_TEMPO, avançado por quem monta a cena).
 */
import type * as THREE from 'three';

export const CAUSTICA_TEMPO = { value: 0 };

const FUNCOES = /* glsl */ `
uniform float e2Tempo;
varying vec3 e2Mundo;
varying vec3 e2NormalMundo;
vec2 e2h(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
// rede de Voronoi animada: a luz se junta nas bordas das células (F2 − F1 pequeno) — linhas finas e claras
float e2Rede(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y)), o = e2h(i + g);
        o = 0.5 + 0.45 * sin(t + 6.2831 * o);
        float d = length(g + o - f);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return pow(1.0 - smoothstep(0.0, 0.24, d2 - d1), 2.0);
}
`;

export function comCausticas(m: THREE.Material, forca = 1) {
    const mm = m as THREE.MeshStandardMaterial;
    mm.onBeforeCompile = (s) => {
        s.uniforms.e2Tempo = CAUSTICA_TEMPO;
        s.vertexShader = s.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 e2Mundo;\nvarying vec3 e2NormalMundo;')
            .replace('#include <fog_vertex>', `#include <fog_vertex>
    vec4 e2w = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
        e2w = instanceMatrix * e2w;
    #endif
    e2Mundo = (modelMatrix * e2w).xyz;
    vec3 e2n = objectNormal;
    #ifdef USE_INSTANCING
        e2n = mat3(instanceMatrix) * e2n;
    #endif
    e2NormalMundo = normalize(mat3(modelMatrix) * e2n);`);
        s.fragmentShader = s.fragmentShader
            .replace('#include <common>', '#include <common>\n' + FUNCOES)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    {
        float cima = smoothstep(-0.1, 0.7, normalize(e2NormalMundo).y);
        float fundo = clamp((e2Mundo.y + 34.0) / 30.0, 0.0, 1.0);          // mais forte perto da superfície
        float sob = step(e2Mundo.y, -2.6);
        vec2 p = e2Mundo.xz * 0.85;
        float c = e2Rede(p, e2Tempo * 0.7) * e2Rede(p * 1.6 + 3.1, e2Tempo * 0.9) * 1.1 + e2Rede(p, e2Tempo * 0.7) * 0.25;   // onde as duas redes se cruzam a luz concentra
        totalEmissiveRadiance += vec3(0.35, 0.85, 0.95) * c * cima * (0.25 + 0.75 * fundo) * sob * ${forca.toFixed(2)} * (0.1 + diffuseColor.rgb * 0.9);
    }`);
    };
    mm.customProgramCacheKey = () => 'e2caustica' + forca;
    return m;
}
