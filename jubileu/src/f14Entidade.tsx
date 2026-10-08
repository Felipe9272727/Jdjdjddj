/**
 * f14Entidade.tsx — a ENTIDADE de Kessar-9, como figura (modelo do Blender: tools/chegada14/entidade.py
 * → public/kessar/entidade.glb).
 *
 * Um manto de veludo escuro com dobras e barra rasgada em tiras, capa curta de linho sobre os ombros,
 * capuz fundo; dentro, o vazio e dois olhos pálidos que piscam. O braço direito (nó `ombroD`: manga +
 * braço longo de dedos finos) sobe quando ela aponta ou aperta alguma coisa.
 *
 * No jogo o pano ganha um shader por cima do material normal: contraluz violeta no contorno, a barra do
 * manto ondula ao vento e se desfaz em fumaça (descarte por ruído), e a opacidade inteira para ela sumir.
 *
 * Quem usa controla tudo por uma ref (`vis`), sem re-render.
 */
import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface VisualEntidade {
    /** 0 = invisível … 1 = presente */
    opac: number;
    /** 0 = calma … 1 = encarando (tremor, cabeça inclinada) */
    tenso: number;
    /** 0 = braço caído na manga … 1 = estendido para a frente */
    braco: number;
    /** altura do braço estendido: -1 = para baixo … 1 = para cima */
    alturaBraco: number;
    /** 0 = olhos apagados … 1 = acesos */
    olhos: number;
}
export const visualPadrao = (): VisualEntidade => ({ opac: 1, tenso: 0, braco: 0, alturaBraco: 0, olhos: 1 });

const URL = `${import.meta.env.BASE_URL}kessar/entidade.glb`;
const TEX = `${import.meta.env.BASE_URL}kessar/`;

const GLSL_RUIDO = /* glsl */`
float e14h(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float e14n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(e14h(i), e14h(i + vec3(1,0,0)), f.x), mix(e14h(i + vec3(0,1,0)), e14h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(e14h(i + vec3(0,0,1)), e14h(i + vec3(1,0,1)), f.x), mix(e14h(i + vec3(0,1,1)), e14h(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

/** O pano: veludo/linho com a trama da foto (só a luz, a cor é nossa), contraluz violeta, e — no manto —
 *  a barra que ondula e se desfaz. */
function materialPano(tempo: { value: number }, opac: { value: number }, base: string, repetir: number, barra: boolean) {
    const ld = new THREE.TextureLoader();
    const cor = ld.load(`${TEX}${base}_diffuse.jpg`), nor = ld.load(`${TEX}${base}_nor_gl.jpg`);
    for (const t of [cor, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repetir, repetir); t.anisotropy = 4; }
    cor.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ color: '#2a2433', map: cor, normalMap: nor, normalScale: new THREE.Vector2(1.1, 1.1), roughness: .82, metalness: 0,
        side: THREE.DoubleSide, transparent: true, fog: true });
    if (barra) m.defines = { E14_BARRA: '' };
    m.onBeforeCompile = (sh) => {
        sh.uniforms.e14Tempo = tempo; sh.uniforms.e14Opac = opac;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>
uniform float e14Tempo; varying vec3 vE14Local;
${GLSL_RUIDO}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef E14_BARRA
{   // o vento pega mais embaixo: a barra ondula, o alto quase não mexe
    float solto = 1. - smoothstep(.15, 1.5, transformed.y);
    float onda = sin(e14Tempo * 2.3 + transformed.y * 3.1 + atan(transformed.z, transformed.x) * 2.) * .5 + e14n(vec3(transformed.xz * 2., e14Tempo * .6)) - .5;
    transformed.xz += normalize(transformed.xz + 1e-4) * onda * .07 * solto;
    transformed.x += sin(e14Tempo * 1.3 + transformed.y) * .04 * solto;
}
#endif
vE14Local = transformed;`);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float e14Tempo; uniform float e14Opac; varying vec3 vE14Local;
${GLSL_RUIDO}`)
            .replace('#include <map_fragment>', `
#ifdef USE_MAP
    { vec4 fotoE14 = texture2D(map, vMapUv); diffuseColor.rgb *= vec3(dot(fotoE14.rgb, vec3(.3, .59, .11)) * 2.2); }   // da foto, só a trama
#endif`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float e14Fio = 0.;
#ifdef E14_BARRA
    e14Fio = e14n(vec3(vE14Local.x * 7., vE14Local.y * 5. - e14Tempo * .9, vE14Local.z * 7.));
    if (e14Fio > smoothstep(.0, .5, vE14Local.y) * .9 + .25) discard;   // a barra se desfaz em fumaça
#endif
diffuseColor.a *= e14Opac;`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{   // contraluz violeta: o contorno é a única coisa que se vê dela além do escuro
    float bordaE14 = pow(1. - abs(dot(normalize(normal), normalize(vViewPosition))), 3.);
    totalEmissiveRadiance += vec3(.22, .1, .5) * bordaE14 * .8;
}`);
    };
    m.customProgramCacheKey = () => 'e14pano' + (barra ? '-barra' : '');
    return { m, tex: [cor, nor] };
}

// poses do braço em graus [dobra (x), torção (y)] por osso — as mesmas de tools/chegada14/final.py
const GRAU = Math.PI / 180, EIXO_X = new THREE.Vector3(1, 0, 0), EIXO_Y = new THREE.Vector3(0, 1, 0), qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
const dedos = (f: (d: number, s: number) => [number, number]) => Object.fromEntries([0, 1, 2, 3].flatMap((d) => [1, 2, 3].map((s) => [`dedo${d}_${s}`, f(d, s)])));
const POSE_REPOUSO: Record<string, [number, number]> = { antebraco: [10, 0], mao: [6, 0], ...dedos(() => [22, 0]), polegar_1: [12, 0] };
const POSE_ESTENDE: Record<string, [number, number]> = { braco: [72, 0], antebraco: [10, -50], mao: [-18, -40], ...dedos((d) => [6 + 5 * d, 0]), polegar_1: [8, 0] };
const POSE_ALTA: Record<string, [number, number]> = { braco: [100, 0], antebraco: [18, -30], mao: [-40, -20], ...dedos((d) => [3 * d, 0]) };

const Modelo: React.FC<{ vis: React.MutableRefObject<VisualEntidade> }> = ({ vis }) => {
    const { scene } = useGLTF(URL);
    const u = useMemo(() => ({ tempo: { value: 0 }, opac: { value: 1 } }), []);
    const pecas = useMemo(() => {
        const raiz = cloneEsqueleto(scene);   // malhas com esqueleto: o clone comum dividiria os ossos
        const manto = materialPano(u.tempo, u.opac, 'velour_velvet', 3, true), veludo = materialPano(u.tempo, u.opac, 'velour_velvet', 3, false);
        const linho = materialPano(u.tempo, u.opac, 'rough_linen', 4, false);
        const pele = new THREE.MeshPhysicalMaterial({ color: '#050408', roughness: .35, clearcoat: .6, sheen: .6, sheenColor: new THREE.Color('#7a5aff'), transparent: true, fog: true });
        const vazio = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, fog: true });
        const olhos = new THREE.MeshBasicMaterial({ color: '#cfc8ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        const ossos: Record<string, { o: THREE.Object3D; q0: THREE.Quaternion }> = {};
        let olhoMesh: THREE.Object3D | null = null, capuz: THREE.Object3D | null = null;
        raiz.traverse((o) => {
            const me = o as THREE.Mesh;
            // (o osso 'braco' tem o nome da malha 'braco': o GLTFLoader o renomeia para 'braco_1')
            if ((o as THREE.Bone).isBone) ossos[o.name.replace(/^(braco|antebraco|mao)_\d+$/, '$1')] = { o, q0: o.quaternion.clone() };
            if (!me.isMesh) return;
            me.frustumCulled = false;
            me.material = o.name === 'manto' ? manto.m : o.name === 'capa' || o.name === 'capuz' ? linho.m : o.name === 'braco' ? pele : o.name === 'vazio' ? vazio : o.name === 'olhos' ? olhos : veludo.m;
            if (o.name === 'olhos') olhoMesh = o;
            if (o.name === 'capuz') capuz = o;
        });
        raiz.rotation.y = Math.PI;   // a frente do modelo é -z no glTF; no jogo ela olha para +z
        return { raiz, ossos, olhoMesh: olhoMesh as THREE.Object3D | null, capuz: capuz as THREE.Object3D | null,
            mats: [manto.m, veludo.m, linho.m, pele, vazio, olhos], tex: [...manto.tex, ...veludo.tex, ...linho.tex] };
    }, [scene, u]);
    useEffect(() => () => { for (const m of pecas.mats) m.dispose(); for (const t of pecas.tex) t.dispose(); }, [pecas]);

    useFrame(({ clock }, dt) => {
        const t = clock.elapsedTime, v = vis.current;
        u.tempo.value = t; u.opac.value = v.opac;
        for (const m of pecas.mats.slice(3, 5)) m.opacity = v.opac;
        const pisca = (t % 5.3) < .12 ? 0 : 1;
        pecas.mats[5].opacity = v.opac * v.olhos * pisca * (.65 + Math.sin(t * 1.7) * .15 + v.tenso * .3);
        if (pecas.olhoMesh) pecas.olhoMesh.scale.setScalar(1 + v.tenso * .35);
        if (pecas.capuz) pecas.capuz.rotation.z = v.tenso * .22 + Math.sin(t * .7) * .025;   // inclina a cabeça quando encara
        // o braço por ossos: mistura a pose de repouso com a de estender (e a de erguer alto), o ombro puxa e
        // a mão e os dedos chegam depois (amortecimento por osso); os dedos nunca ficam parados
        const alvo = v.braco, k = 1 - Math.exp(-dt * 6);
        for (const nome in pecas.ossos) {
            const { o, q0 } = pecas.ossos[nome];
            const atraso = nome.startsWith('dedo') || nome.startsWith('polegar') ? .45 : nome === 'mao' ? .6 : nome === 'antebraco' ? .8 : 1;
            const ant = (o.userData.mix ?? 0) as number, mix = ant + (alvo - ant) * k * atraso; o.userData.mix = mix;
            const a = POSE_REPOUSO[nome] ?? [0, 0], b = (v.alturaBraco > 0 ? POSE_ALTA : POSE_ESTENDE)[nome] ?? [0, 0], h = v.alturaBraco > 0 ? v.alturaBraco : 1;
            const bx = a[0] + (b[0] - a[0]) * h, by = a[1] + (b[1] - a[1]) * h;
            const vivo = nome.startsWith('dedo') ? Math.sin(t * 1.3 + nome.charCodeAt(4) * 1.7 + nome.charCodeAt(6)) * 6 : 0;
            const x = (a[0] + ((v.alturaBraco > 0 ? bx : b[0]) - a[0]) * mix + vivo) * GRAU, y = (a[1] + ((v.alturaBraco > 0 ? by : b[1]) - a[1]) * mix) * GRAU;
            o.quaternion.copy(q0).multiply(qx.setFromAxisAngle(EIXO_X, x)).multiply(qy.setFromAxisAngle(EIXO_Y, y));
        }
        const tremor = Math.sin(t * 50) * (.01 + v.tenso * .025);
        pecas.raiz.scale.set(1 + tremor, 1, 1 + tremor);
        pecas.raiz.visible = v.opac > .01;
    });
    return <primitive object={pecas.raiz} />;
};

/** A figura (≈2,6 m com escala 1). */
export const FiguraDaEntidade: React.FC<{ vis: React.MutableRefObject<VisualEntidade>; escala?: number }> = ({ vis, escala = 1 }) =>
    <group scale={escala}><Suspense fallback={null}><Modelo vis={vis} /></Suspense></group>;

useGLTF.preload(URL);
