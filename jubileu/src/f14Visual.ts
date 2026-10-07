/**
 * f14Visual.ts — o acabamento visual de Kessar-9 (Andar 14).
 *
 *  · `remendarRocha`: um MeshStandardMaterial ganha texturas de verdade (cor + normal, Poly Haven CC0)
 *    projetadas em coordenadas de MUNDO: rocha triplanar nas encostas (sem esticar), areia plana no
 *    chão, sal rachado na bacia, em duas escalas para esconder a repetição. A inclinação vem da
 *    normal: encosta vira rocha, chão plano vira areia — por pixel, não por vértice.
 *  · `oclusaoDoRelevo`: oclusão de ambiente assada nos vértices do terreno (horizonte em 8 rumos),
 *    o que dá peso aos vales e às bases das serras.
 *  · `ligarAtmosfera`: troca, só enquanto o andar está montado, o pedaço de névoa de todos os
 *    shaders por uma atmosfera de verdade: mais densa embaixo, rala no alto e acesa na direção do sol.
 */
import * as THREE from 'three';

export const SOL_DIR = new THREE.Vector3(.55, .32, -.8).normalize();

/** Ruído de valor 3D e fbm em GLSL (hash sem seno: estável em GPU de celular). */
export const GLSL_RUIDO = /* glsl */`
float k14h(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float k14n(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(k14h(i), k14h(i + vec3(1,0,0)), f.x), mix(k14h(i + vec3(0,1,0)), k14h(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(k14h(i + vec3(0,0,1)), k14h(i + vec3(1,0,1)), f.x), mix(k14h(i + vec3(0,1,1)), k14h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float k14fbm(vec3 p){ float s = 0., a = .5; for (int i = 0; i < K14_OITAVAS; i++) { s += a * k14n(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;

// ── as texturas (Poly Haven, CC0; ver public/kessar/LICENCA.txt) ─────────────────────────────
export type Conjunto = 'serra' | 'pedra' | 'basalto';
interface Par { cor: THREE.Texture; nor: THREE.Texture }
let TEX: Record<'areia' | 'sal' | Conjunto, Par> | null = null;
/** Carrega uma vez (cor em sRGB, normal linear), repetição e anisotropia; o resto é cache. */
export function texturasKessar(): Record<'areia' | 'sal' | Conjunto, Par> {
    if (TEX) return TEX;
    const base = `${import.meta.env.BASE_URL}kessar/`, ld = new THREE.TextureLoader();
    const um = (nome: string, srgb: boolean) => {
        const t = ld.load(base + nome); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
    };
    const par = (a: string): Par => ({ cor: um(`${a}_diffuse.jpg`, true), nor: um(`${a}_nor_gl.jpg`, false) });
    TEX = { areia: par('dense_sand'), sal: par('mud_cracked_dry_03'), serra: par('cliff_side'), pedra: par('rock_face_03'), basalto: par('dark_rock') };
    return TEX;
}

export interface OpcoesRocha {
    /** chão do mundo: areia (textura plana) no plano, rocha (triplanar) na encosta, sal rachado na bacia */
    terreno?: boolean;
    /** qual textura de rocha (padrão: serra) */
    conjunto?: Conjunto;
    /** metros por repetição da rocha */
    escala?: number;
    /** tom multiplicado na rocha */
    tom?: string;
    /** oclusão assada no atributo `ao` */
    oclusao?: boolean;
    /** qualidade baixa: uma escala só, sem ondulação procedural */
    baixa?: boolean;
}

/** Aplica rocha/areia texturizada (triplanar, coordenadas de mundo) a um MeshStandardMaterial. */
export function remendarRocha(m: THREE.MeshStandardMaterial, o: OpcoesRocha = {}): THREE.MeshStandardMaterial {
    const tx = texturasKessar(), rocha = tx[o.conjunto ?? 'serra'];
    m.defines = { ...(m.defines ?? {}), K14_OITAVAS: o.baixa ? 2 : 4 };
    if (o.terreno) m.defines.K14_TERRENO = '';
    if (o.oclusao) m.defines.K14_AO = '';
    if (o.baixa) m.defines.K14_BAIXA = '';
    m.customProgramCacheKey = () => `k14tex-${!!o.terreno}-${!!o.oclusao}-${!!o.baixa}`;
    const uni = {
        k14RochaCor: { value: rocha.cor }, k14RochaNor: { value: rocha.nor },
        k14AreiaCor: { value: tx.areia.cor }, k14AreiaNor: { value: tx.areia.nor },
        k14SalCor: { value: tx.sal.cor }, k14SalNor: { value: tx.sal.nor },
        k14EscalaRocha: { value: 1 / (o.escala ?? 9) }, k14Tom: { value: new THREE.Color(o.tom ?? '#ffffff') },
    };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>
varying vec3 vK14Mundo; varying vec3 vK14Normal;
#ifdef K14_AO
attribute float ao; varying float vK14Ao;
#endif
#ifdef K14_TERRENO
attribute float sal; varying float vK14Sal;
#endif`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{
    vec4 k14wp = vec4(transformed, 1.);
    vec3 k14nw = objectNormal;
    #ifdef USE_INSTANCING
        k14wp = instanceMatrix * k14wp; k14nw = mat3(instanceMatrix) * k14nw;
    #endif
    k14wp = modelMatrix * k14wp; vK14Mundo = k14wp.xyz; vK14Normal = normalize(mat3(modelMatrix) * k14nw);
    #ifdef K14_AO
        vK14Ao = ao;
    #endif
    #ifdef K14_TERRENO
        vK14Sal = sal;
    #endif
}`);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
varying vec3 vK14Mundo; varying vec3 vK14Normal;
uniform sampler2D k14RochaCor, k14RochaNor, k14AreiaCor, k14AreiaNor, k14SalCor, k14SalNor;
uniform float k14EscalaRocha; uniform vec3 k14Tom;
#ifdef K14_AO
varying float vK14Ao;
#endif
#ifdef K14_TERRENO
varying float vK14Sal;
#endif
${GLSL_RUIDO}
vec3 k14Relevo(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
    vec3 vSigmaX = normalize(dFdx(surf_pos)); vec3 vSigmaY = normalize(dFdy(surf_pos));
    vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDirection;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
}
float k14lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
// triplanar: cor e normal (mistura "whiteout", Golus) — a rocha não estica nas encostas
vec3 k14TriCor(sampler2D t, vec3 p, vec3 w){ return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z; }
vec3 k14TriNor(sampler2D t, vec3 p, vec3 n, vec3 w, float forca){
    vec3 a = texture2D(t, p.zy).xyz * 2. - 1., b = texture2D(t, p.xz).xyz * 2. - 1., c = texture2D(t, p.xy).xyz * 2. - 1.;
    a.xy *= forca; b.xy *= forca; c.xy *= forca;
    a = vec3(a.xy + n.zy, abs(a.z) * n.x); b = vec3(b.xy + n.xz, abs(b.z) * n.y); c = vec3(c.xy + n.xy, abs(c.z) * n.z);
    return normalize(a.zyx * w.x + b.xzy * w.y + c.xyz * w.z);
}
vec3 k14PlanoNor(sampler2D t, vec2 uv, vec3 n, float forca){
    vec3 b = texture2D(t, uv).xyz * 2. - 1.; b.xy *= forca; b = vec3(b.xy + n.xz, abs(b.z) * n.y); return normalize(b.xzy);
}
float k14Rocha; float k14Altura; vec3 k14NMundo;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    vec3 P = vK14Mundo, N = normalize(vK14Normal);
    float distK = length(P - cameraPosition);
    vec3 w = pow(abs(N), vec3(4.)); w /= (w.x + w.y + w.z);
    float quebra = k14fbm(P * .045);
    #ifdef K14_TERRENO
        float declive = 1. - clamp(N.y, 0., 1.);
        k14Rocha = smoothstep(.30, .50, declive + (quebra - .5) * .3);
    #else
        k14Rocha = 1.;
    #endif
    // ROCHA: triplanar em duas escalas (a segunda, larga, quebra a repetição)
    vec3 pr = P * k14EscalaRocha;
    vec3 rc = k14TriCor(k14RochaCor, pr, w);
    #ifndef K14_BAIXA
        rc = mix(rc, k14TriCor(k14RochaCor, pr * .23 + .37, w), .38);
    #endif
    rc *= k14Tom * (.82 + .36 * quebra);
    vec3 nR = k14TriNor(k14RochaNor, pr, N, w, 1.15);
    k14NMundo = nR;
    #ifdef K14_TERRENO
        // AREIA: textura plana (XZ) em duas escalas; a cor da região vem do vértice, o detalhe da foto
        vec2 pa = P.xz * .22;
        vec3 ac = texture2D(k14AreiaCor, pa).rgb;
        #ifndef K14_BAIXA
            ac = mix(ac, texture2D(k14AreiaCor, pa * .19 + .41).rgb, .4);
        #endif
        vec3 areia = diffuseColor.rgb * mix(vec3(k14lum(ac) / .30), ac / .30, .18);
        areia *= .86 + .28 * k14fbm(P * .02);
        vec3 nA = k14PlanoNor(k14AreiaNor, pa, N, .9);
        // SAL: lama rachada embranquecida
        float sal = smoothstep(.15, .6, vK14Sal);
        vec2 ps = P.xz * .16;
        vec3 sc = texture2D(k14SalCor, ps).rgb;
        vec3 salCor = diffuseColor.rgb * (.55 + .9 * smoothstep(.15, .55, k14lum(sc)));
        vec3 nS = k14PlanoNor(k14SalNor, ps, N, 1.2);
        areia = mix(areia, salCor, sal); nA = normalize(mix(nA, nS, sal));
        diffuseColor.rgb = mix(areia, rc, k14Rocha);
        k14NMundo = normalize(mix(nA, nR, k14Rocha));
        // ondulação de vento (procedural, maior que a foto), só na areia e de perto
        float perto = 1. - smoothstep(20., 110., distK);
        k14Altura = (sin(dot(P.xz, vec2(.82, .57)) * 3.4 + k14fbm(P * .3) * 5.) * .5) * .045 * (1. - k14Rocha) * (1. - sal) * perto;
    #else
        diffuseColor.rgb = rc;
        k14Altura = 0.;
    #endif
    #ifdef K14_AO
        diffuseColor.rgb *= mix(1., vK14Ao, .55);
    #endif
}`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, .88, k14Rocha);`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize((viewMatrix * vec4(k14NMundo, 0.)).xyz);
#ifndef K14_BAIXA
    normal = k14Relevo(-vViewPosition, normal, vec2(dFdx(k14Altura), dFdy(k14Altura)), faceDirection);
#endif`)
            .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#ifdef K14_AO
    reflectedLight.indirectDiffuse *= vK14Ao; reflectedLight.directDiffuse *= mix(1., vK14Ao, .3);
#endif`);
    };
    return m;
}

/**
 * Oclusão de ambiente do relevo: para cada vértice da grade, o ângulo do horizonte em 8 rumos
 * (até ~40 m); quanto mais alto o horizonte, menos céu chega. `alt` é a grade (n+1)².
 */
export function oclusaoDoRelevo(alt: Float32Array, n: number, passo: number): Float32Array {
    const lado = n + 1, ao = new Float32Array(lado * lado);
    const rumos = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
    const dists = [1, 2, 4, 7, 12, 20].map((d) => Math.max(1, Math.round(d * 1.6 / passo)));
    for (let j = 0; j < lado; j++) for (let i = 0; i < lado; i++) {
        const h0 = alt[j * lado + i]; let ceu = 0;
        for (const [dx, dz] of rumos) {
            let maxTan = 0;
            for (const d of dists) {
                const ii = Math.round(i + dx * d), jj = Math.round(j + dz * d);
                if (ii < 0 || jj < 0 || ii >= lado || jj >= lado) break;
                const t = (alt[jj * lado + ii] - h0) / (d * passo);
                if (t > maxTan) maxTan = t;
            }
            ceu += 1 - Math.sin(Math.atan(maxTan));
        }
        ao[j * lado + i] = Math.pow(ceu / 8, 1.4);
    }
    return ao;
}

// ── a atmosfera ─────────────────────────────────────────────────────────────
const ORIGINAIS: Partial<Record<string, string>> = {};
const NOVOS: Record<string, string> = {
    fog_pars_vertex: `#ifdef USE_FOG
	varying float vFogDepth; varying vec3 vFogMundo;
#endif`,
    fog_vertex: `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogMundo = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`,
    fog_pars_fragment: `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth; varying vec3 vFogMundo;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,
    // densidade cai com a altura (integral analítica ao longo do raio); a cor esquenta na direção do sol
    fog_fragment: `#ifdef USE_FOG
	#ifdef FOG_EXP2
		vec3 fogRaio = vFogMundo - cameraPosition; float fogD = length(fogRaio); vec3 fogDir = fogRaio / max(fogD, 1e-4);
		const float fogK = .028; const float fogBase = -6.;
		float fogY0 = cameraPosition.y - fogBase, fogDy = fogRaio.y;
		float fogInt = abs(fogK * fogDy) > 1e-3 ? exp(-fogK * fogY0) * (1. - exp(-fogK * fogDy)) / (fogK * fogDy) : exp(-fogK * fogY0);
		float fogFactor = 1. - exp(-fogDensity * fogD * clamp(fogInt, 0., 4.));
		float fogSol = pow(max(dot(fogDir, vec3(${SOL_DIR.x.toFixed(4)}, ${SOL_DIR.y.toFixed(4)}, ${SOL_DIR.z.toFixed(4)})), 0.), 6.);
		vec3 fogCor = mix(fogColor, vec3(1., .74, .48), fogSol * .55);
		gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCor, clamp(fogFactor, 0., 1.));
		// um único pixel NaN/inf vira tela branca depois do bloom (o desfoque espalha): corta na fonte
		if (any(isnan(gl_FragColor)) || any(isinf(gl_FragColor))) gl_FragColor = vec4(fogColor, 1.);
		gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(64.));
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif
#endif`,
};
let ligada = 0;
/** Liga a atmosfera nos shaders (contagem de montagens; desliga ao desmontar o último). */
export function ligarAtmosfera(): () => void {
    const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
    if (ligada++ === 0) for (const k of Object.keys(NOVOS)) { ORIGINAIS[k] = chunks[k]; chunks[k] = NOVOS[k]; }
    return () => { if (--ligada === 0) for (const k of Object.keys(NOVOS)) chunks[k] = ORIGINAIS[k]!; };
}
