/**
 * f14Entidade.tsx — a ENTIDADE de Kessar-9, como figura.
 *
 * Uma sombra de pé que ainda não pode mostrar o rosto: um manto alto (perfil torneado), ombros
 * caídos, capuz fundo. O material é preto absoluto com uma borda violeta contra a luz; a barra
 * ondula ao vento e se desfaz em fumaça (descarte por ruído); dentro do capuz, dois pontos
 * pálidos que piscam. Um braço comprido, de dedos finos, sai da manga direita quando ela precisa
 * apontar, apertar ou mexer em alguma coisa (`braco` 0 = recolhido … 1 = estendido).
 *
 * Quem usa controla tudo por uma ref (`vis`), sem re-render: opacidade, tensão (inclina e treme),
 * braço e olhos.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface VisualEntidade {
    /** 0 = invisível … 1 = presente */
    opac: number;
    /** 0 = calma … 1 = encarando (tremor, cabeça inclinada) */
    tenso: number;
    /** 0 = braço dentro da manga … 1 = estendido para a frente */
    braco: number;
    /** altura do braço estendido: -1 = para baixo … 1 = para cima */
    alturaBraco: number;
    /** 0 = olhos apagados … 1 = acesos */
    olhos: number;
}
export const visualPadrao = (): VisualEntidade => ({ opac: 1, tenso: 0, braco: 0, alturaBraco: 0, olhos: 1 });

const GLSL_RUIDO = /* glsl */`
float e14h(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float e14n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(e14h(i), e14h(i + vec3(1,0,0)), f.x), mix(e14h(i + vec3(0,1,0)), e14h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(e14h(i + vec3(0,0,1)), e14h(i + vec3(1,0,1)), f.x), mix(e14h(i + vec3(0,1,1)), e14h(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

/** O pano da sombra: preto, borda violeta, barra que ondula e se desfaz em fumaça. */
function materialManto(tempo: { value: number }, opac: { value: number }, barra: boolean) {
    const m = new THREE.MeshBasicMaterial({ color: '#030205', side: THREE.DoubleSide, transparent: true, fog: true });
    if (barra) m.defines = { E14_BARRA: '' };   // só o corpo ondula e se desfaz embaixo (capuz e mangas ficam inteiros)
    m.onBeforeCompile = (sh) => {
        sh.uniforms.e14Tempo = tempo; sh.uniforms.e14Opac = opac;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>
uniform float e14Tempo; varying vec3 vE14Local; varying vec3 vE14Normal; varying vec3 vE14Vista;
${GLSL_RUIDO}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
{
    #ifdef E14_BARRA
    // o vento pega mais embaixo: a barra ondula, o alto quase não mexe
    float solto = 1. - smoothstep(.2, 1.7, transformed.y);
    float onda = sin(e14Tempo * 2.3 + transformed.y * 3.1 + atan(transformed.z, transformed.x) * 2.) * .5 + e14n(vec3(transformed.xz * 2., e14Tempo * .6)) - .5;
    transformed.xz += normalize(transformed.xz + 1e-4) * onda * .09 * solto;
    transformed.x += sin(e14Tempo * 1.3 + transformed.y) * .05 * solto;
    #endif
    vE14Local = transformed;
}`)
            .replace('#include <project_vertex>', `#include <project_vertex>
vE14Normal = normalize(normalMatrix * normal); vE14Vista = -mvPosition.xyz;`);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float e14Tempo; uniform float e14Opac; varying vec3 vE14Local; varying vec3 vE14Normal; varying vec3 vE14Vista;
${GLSL_RUIDO}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
    // a barra se desfaz em fumaça: furos que sobem e se mexem
    float fio = 0., corte = 1.;
    #ifdef E14_BARRA
    fio = e14n(vec3(vE14Local.x * 7., vE14Local.y * 5. - e14Tempo * .9, vE14Local.z * 7.));
    corte = smoothstep(.05, .55, vE14Local.y) * .9 + .1;
    if (fio > corte + .15) discard;
    #endif
    // borda contra a luz: um violeta escuro só no contorno (é a única coisa que se vê dela além do preto)
    float borda = pow(1. - abs(dot(normalize(vE14Normal), normalize(vE14Vista))), 3.);
    diffuseColor.rgb += vec3(.20, .09, .42) * borda * .9;
    diffuseColor.a = e14Opac * (.97 - smoothstep(corte, corte + .15, fio) * .6);
}`);
    };
    m.customProgramCacheKey = () => 'e14manto' + (barra ? '-barra' : '');
    return m;
}

/** A figura. `vis` é lido a cada quadro; `escala` dá a altura (1 ≈ 2,6 m). */
export const FiguraDaEntidade: React.FC<{ vis: React.MutableRefObject<VisualEntidade>; escala?: number }> = ({ vis, escala = 1 }) => {
    const raiz = useRef<THREE.Group>(null), cabeca = useRef<THREE.Group>(null), braco = useRef<THREE.Group>(null);
    const olhoE = useRef<THREE.Mesh>(null), olhoD = useRef<THREE.Mesh>(null);
    const u = useMemo(() => ({ tempo: { value: 0 }, opac: { value: 1 } }), []);
    const pecas = useMemo(() => {
        const manto = materialManto(u.tempo, u.opac, true), pano = materialManto(u.tempo, u.opac, false);
        // corpo: o manto do chão aos ombros (largo embaixo, estreito em cima, ombros caídos)
        const perfil = [[.62, 0], [.58, .12], [.5, .5], [.42, 1.0], [.36, 1.45], [.33, 1.75], [.36, 1.9], [.33, 2.0], [.2, 2.08], [.13, 2.12]]
            .map(([r, y]) => new THREE.Vector2(r, y));
        const corpo = new THREE.LatheGeometry(perfil, 40);
        // capuz: casca funda e contínua, aberta só na frente (+z); a borda desce até os ombros
        // (no three, phi = π/2 é a frente: a abertura fica entre π/2 ± 0,32π)
        const capuz = new THREE.SphereGeometry(.3, 40, 24, Math.PI / 2 + Math.PI * .32, Math.PI * 1.36, 0, Math.PI * .82);
        capuz.scale(1, 1.3, 1.15);
        const pico = new THREE.ConeGeometry(.16, .34, 20, 1, true); pico.rotateX(-1.15); pico.translate(0, .2, -.3);   // a ponta cai para trás
        const fundo = new THREE.SphereGeometry(.22, 20, 14);   // o vazio dentro do capuz
        // mangas: cones caídos dos ombros
        const manga = new THREE.CylinderGeometry(.08, .16, 1.05, 18, 4, true); manga.translate(0, -.52, 0);
        // braço longo demais, fino, quatro dedos compridos
        const antebraco = new THREE.CylinderGeometry(.035, .05, .85, 10); antebraco.translate(0, -.42, 0);
        const dedo = new THREE.CylinderGeometry(.008, .014, .22, 6); dedo.translate(0, -.11, 0);
        const preto = new THREE.MeshBasicMaterial({ color: '#010102', transparent: true, fog: true });
        const olho = new THREE.MeshBasicMaterial({ color: '#b9b0d8', transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
        return { manto, pano, corpo, capuz, pico, fundo, manga, antebraco, dedo, preto, olho };
    }, [u]);
    useEffect(() => () => { for (const v of Object.values(pecas)) (v as { dispose?: () => void }).dispose?.(); }, [pecas]);

    useFrame(({ clock }) => {
        const t = clock.elapsedTime, v = vis.current;
        u.tempo.value = t; u.opac.value = v.opac;
        pecas.preto.opacity = v.opac;
        // olhos: brilho fraco que respira e pisca a cada ~5 s
        const pisca = (t % 5.3) < .12 ? 0 : 1;
        pecas.olho.opacity = v.opac * v.olhos * pisca * (.55 + Math.sin(t * 1.7) * .15 + v.tenso * .4);
        if (cabeca.current) { cabeca.current.rotation.z = v.tenso * .28 + Math.sin(t * .7) * .03; cabeca.current.rotation.x = .08 + v.tenso * .1; }
        if (braco.current) {
            // sobe à frente (x negativo = para a frente da figura, que olha para +z)
            braco.current.rotation.x = -v.braco * (1.35 + v.alturaBraco * .45) + Math.sin(t * 2.1) * .03 * v.braco;
            braco.current.scale.y = .25 + v.braco * .75;
        }
        if (raiz.current) {
            const tremor = Math.sin(t * 50) * (.012 + v.tenso * .03);
            raiz.current.scale.set(escala * (1 + tremor), escala, escala * (1 + tremor));
            raiz.current.visible = v.opac > .01;
        }
        const brilho = 1 + v.tenso * .35;
        for (const o of [olhoE.current, olhoD.current]) if (o) o.scale.setScalar(brilho);
    });

    const { manto, pano, corpo, capuz, pico, fundo, manga, antebraco, dedo, preto, olho } = pecas;
    return <group ref={raiz}>
        <mesh geometry={corpo} material={manto} />
        <group ref={cabeca} position={[0, 2.12, .02]}>
            <mesh geometry={capuz} material={pano} position={[0, .12, 0]} />
            <mesh geometry={pico} material={pano} position={[0, .12, 0]} />
            <mesh geometry={fundo} material={preto} position={[0, .08, -.04]} scale={[1, 1.25, .85]} />
            <mesh ref={olhoE} position={[-.065, .12, .12]}><sphereGeometry args={[.016, 10, 8]} /><primitive object={olho} attach="material" /></mesh>
            <mesh ref={olhoD} position={[.065, .12, .12]}><sphereGeometry args={[.016, 10, 8]} /><primitive object={olho} attach="material" /></mesh>
        </group>
        {/* manga esquerda, caída */}
        <mesh geometry={manga} material={pano} position={[-.34, 1.98, .02]} rotation={[0, 0, .06]} />
        {/* manga e braço direito: o braço sai da manga quando ela estende */}
        <group ref={braco} position={[.34, 1.98, .02]} rotation={[0, 0, -.06]}>
            <mesh geometry={manga} material={pano} />
            <group position={[0, -.8, 0]}>
                <mesh geometry={antebraco} material={preto} />
                {[-.03, -.01, .01, .03].map((x, i) => <mesh key={i} geometry={dedo} material={preto} position={[x, -.84, .01]} rotation={[0, 0, x * 2]} />)}
            </group>
        </group>
    </group>;
};
