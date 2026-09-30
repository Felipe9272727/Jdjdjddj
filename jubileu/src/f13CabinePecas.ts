/**
 * f13CabinePecas.ts — as peças do biplano, vistas da cabine.
 *
 * Tudo aqui é geometria e material, sem React e sem relógio: `f13Cabine.tsx`
 * monta as peças e as move. O referencial é o da CÂMERA (o olho do piloto na
 * origem, -z para a frente, +y para cima), em metros. As proporções são as de
 * um biplano de instrução (hélice a ~2,4 m do olho, painel a ~0,75 m), mas
 * puxadas um pouco para perto: a lente tem 72° de altura e o que é "real" não
 * cabe no quadro.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { fbm3, semente, texCapo, texCouro, texHelice, texLa, texLona, texMadeira, texMalha, texPlaca } from './f13CabineTex';

const liso = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const grau = (g: number) => g * Math.PI / 180;

// ═══ MATERIAIS ═══════════════════════════════════════════════════════════════
export interface Materiais {
    mogno: THREE.MeshPhysicalMaterial; abeto: THREE.MeshPhysicalMaterial; abetoV: THREE.MeshPhysicalMaterial; nogueira: THREE.MeshPhysicalMaterial;
    couroRim: THREE.MeshPhysicalMaterial; couroLuva: THREE.MeshPhysicalMaterial; couroEscuro: THREE.MeshPhysicalMaterial; couroCinta: THREE.MeshPhysicalMaterial;
    latao: THREE.MeshStandardMaterial; lataoVelho: THREE.MeshStandardMaterial; aco: THREE.MeshStandardMaterial; acoEscuro: THREE.MeshStandardMaterial;
    borracha: THREE.MeshStandardMaterial; costura: THREE.MeshStandardMaterial;
    capo: THREE.MeshPhysicalMaterial; lona: THREE.MeshStandardMaterial; lonaTopo: THREE.MeshStandardMaterial;
    la: THREE.MeshPhysicalMaterial; malha: THREE.MeshPhysicalMaterial;
    vidro: THREE.MeshPhysicalMaterial; helice: THREE.MeshPhysicalMaterial; heliceTinta: THREE.MeshBasicMaterial; heliceAnel: THREE.MeshBasicMaterial;
    heliceDisco: THREE.MeshBasicMaterial;
}
let cacheMat: Materiais | null = null;
function comMapas<T extends THREE.MeshStandardMaterial>(m: T, j: { map: THREE.Texture; normalMap?: THREE.Texture; bumpMap?: THREE.Texture }, repx = 1, repy = 1, giro = 0): T {
    const rep = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(repx, repy); if (giro) { c.center.set(.5, .5); c.rotation = giro; } c.needsUpdate = true; return c; };
    m.map = rep(j.map);
    if (j.normalMap) m.normalMap = rep(j.normalMap);
    if (j.bumpMap) m.bumpMap = rep(j.bumpMap);
    return m;
}
/** Luz de preenchimento de dentro da cabine: o sol vem de frente e o que olha para o piloto ficaria preto. */
function enche<T extends THREE.MeshStandardMaterial>(m: T, k: number): T {
    if (m.map) { m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = m.map; } else m.emissive = m.color.clone();
    m.emissiveIntensity = k;
    return m;
}
export function materiais(): Materiais {
    if (cacheMat) return cacheMat;
    const verniz = (j: ReturnType<typeof texMadeira>, rug: number, giro = 0, rx = 1, ry = 1) => {
        const m = new THREE.MeshPhysicalMaterial({ roughness: rug, metalness: 0, clearcoat: 1, clearcoatRoughness: .08, bumpScale: 1.2, envMapIntensity: 1.2 });
        return comMapas(m, j, rx, ry, giro);
    };
    const couro = (j: ReturnType<typeof texCouro>, rx: number, ry: number, rug = .5) => {
        const m = new THREE.MeshPhysicalMaterial({ roughness: rug, metalness: 0, clearcoat: .22, clearcoatRoughness: .4, sheen: .5, sheenRoughness: .5, sheenColor: new THREE.Color('#c08c5a'), normalScale: new THREE.Vector2(.9, .9) });
        return comMapas(m, j, rx, ry);
    };
    const vidro = new THREE.MeshPhysicalMaterial({
        color: '#dcecf0', roughness: .02, metalness: 0, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide,
        envMapIntensity: 2.2, specularIntensity: 1, ior: 1.52,
    });
    // vidro de verdade: o reflexo não some junto com a opacidade. A cor difusa
    // obedece ao alfa, o brilho especular entra inteiro por cima do fundo
    // (mistura com alfa pré-multiplicado).
    vidro.blending = THREE.CustomBlending;
    vidro.blendEquation = THREE.AddEquation; vidro.blendSrc = THREE.OneFactor; vidro.blendDst = THREE.OneMinusSrcAlphaFactor;
    vidro.blendSrcAlpha = THREE.OneFactor; vidro.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    vidro.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
            'gl_FragColor = vec4( outgoingLight - totalDiffuse * ( 1.0 - diffuseColor.a ), diffuseColor.a );');
    };
    vidro.customProgramCacheKey = () => 'f13-vidro';
    const helices = texHelice();
    cacheMat = {
        mogno: enche(verniz(texMadeira('mogno'), .4), .42), abeto: enche(verniz(texMadeira('abeto'), .45), .3), abetoV: enche(verniz(texMadeira('abeto'), .45, Math.PI / 2, 1, 1), .3), nogueira: enche(verniz(texMadeira('nogueira'), .35), .3),
        couroRim: enche(couro(texCouro('#7a4a2a', true), 1, 1, .48), .3),
        couroLuva: enche(couro(texCouro('#8a5530'), 1.2, 1.2, .52), .28),
        couroEscuro: enche(couro(texCouro('#3a2414'), 1, 1, .5), .25),
        couroCinta: enche(couro(texCouro('#5a3520', true), 2, 1, .5), .28),
        latao: new THREE.MeshStandardMaterial({ color: '#d2a84a', metalness: 1, roughness: .26, envMapIntensity: 1.4 }),
        lataoVelho: new THREE.MeshStandardMaterial({ color: '#a8832f', metalness: 1, roughness: .42, envMapIntensity: 1.2 }),
        aco: new THREE.MeshStandardMaterial({ color: '#9ca0a6', metalness: .9, roughness: .34, envMapIntensity: 1.3 }),
        acoEscuro: new THREE.MeshStandardMaterial({ color: '#34363b', metalness: .75, roughness: .42, envMapIntensity: 1 }),
        borracha: new THREE.MeshStandardMaterial({ color: '#17140f', metalness: 0, roughness: .78 }),
        costura: new THREE.MeshStandardMaterial({ color: '#241509', metalness: 0, roughness: .8 }),
        capo: enche(comMapas(new THREE.MeshPhysicalMaterial({ roughness: .36, metalness: .02, clearcoat: .6, clearcoatRoughness: .22, normalScale: new THREE.Vector2(1.5, 1.5), envMapIntensity: 1.1 }), texCapo('#e8dcbc', '#2e5a94')), .2),
        lona: enche(comMapas(new THREE.MeshStandardMaterial({ roughness: .82, metalness: 0, normalScale: new THREE.Vector2(.7, .7), side: THREE.DoubleSide }), texLona('#f0e6cc')), .3),
        lonaTopo: enche(comMapas(new THREE.MeshStandardMaterial({ roughness: .8, metalness: 0, normalScale: new THREE.Vector2(.7, .7), side: THREE.DoubleSide }), texLona('#ece1c6')), .42),
        la: enche(comMapas(new THREE.MeshPhysicalMaterial({ roughness: .92, metalness: 0, sheen: .8, sheenRoughness: .7, sheenColor: new THREE.Color('#9dbbe8'), normalScale: new THREE.Vector2(1.1, 1.1) }), texLa('#3b6fb0'), 2.2, 2.6), .3),
        malha: enche(comMapas(new THREE.MeshPhysicalMaterial({ roughness: .95, metalness: 0, normalScale: new THREE.Vector2(1.3, 1.3) }), texMalha('#2c5489'), 1, 1), .3),
        vidro,
        helice: comMapas(new THREE.MeshPhysicalMaterial({ roughness: .36, metalness: 0, clearcoat: 1, clearcoatRoughness: .12, transparent: true }), helices),
        heliceTinta: new THREE.MeshBasicMaterial({ color: '#3b2614', transparent: true, opacity: .05, depthWrite: false, side: THREE.DoubleSide, fog: false }),
        heliceAnel: new THREE.MeshBasicMaterial({ color: '#e9cf7a', transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
        heliceDisco: new THREE.MeshBasicMaterial({ color: '#6a5034', transparent: true, opacity: .05, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    };
    return cacheMat;
}

// ═══ GEOMETRIA ═══════════════════════════════════════════════════════════════
export interface OpcoesSuperficie { uv?: (u: number, v: number) => [number, number]; fechaU?: boolean; inverter?: boolean }
/**
 * Superfície paramétrica f(u, v) com u, v em [0, 1]. A normal é du × dv;
 * `inverter` troca o lado. `fechaU` alisa a costura quando u dá a volta.
 */
export function superficie(nu: number, nv: number, f: (u: number, v: number, p: THREE.Vector3) => void, op: OpcoesSuperficie = {}): THREE.BufferGeometry {
    const n = (nu + 1) * (nv + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), p = new THREE.Vector3();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, k = j * (nu + 1) + i;
        f(u, v, p); pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        const [a, b] = op.uv ? op.uv(u, v) : [u, v]; uv[k * 2] = a; uv[k * 2 + 1] = b;
    }
    const idx: number[] = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        if (op.inverter) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    if (op.fechaU) {
        const nm = g.getAttribute('normal') as THREE.BufferAttribute;
        for (let j = 0; j <= nv; j++) {
            const a = j * (nu + 1), b = a + nu;
            const x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1;
            nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l);
        }
    }
    return g;
}

/** Tubo de raio variável ao longo de uma curva (quadros por transporte paralelo). */
export function tubo(curva: THREE.Curve<THREE.Vector3>, nSeg: number, nRad: number, raio: (t: number) => number, fechado = false, uvComp = 1): THREE.BufferGeometry {
    const quadros = curva.computeFrenetFrames(nSeg, fechado);
    return superficie(nRad, nSeg, (u, v, p) => {
        const c = curva.getPointAt(v), i = Math.min(nSeg, Math.round(v * nSeg)), a = u * Math.PI * 2, r = raio(v);
        const n = quadros.normals[i], b = quadros.binormals[i];
        p.copy(c).addScaledVector(n, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r);
    }, { uv: (u, v) => [v * uvComp, u], fechaU: true, inverter: true });
}

const _y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
/** Posiciona um cilindro unitário (eixo y, raio 1, altura 1) de A até B, com semieixos rx (x) e rz (z). */
export function ligar(m: THREE.Object3D, A: THREE.Vector3, B: THREE.Vector3, rx: number, rz = rx): void {
    _d.subVectors(B, A); const L = _d.length(); if (L < 1e-6) { m.visible = false; return; }
    m.visible = true;
    m.position.addVectors(A, B).multiplyScalar(.5);
    m.quaternion.copy(_q.setFromUnitVectors(_y, _d.multiplyScalar(1 / L)));
    m.scale.set(rx, L, rz);
}
const CIL = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
const CIL_FINO = new THREE.CylinderGeometry(1, 1, 1, 6, 1);

// ═══ O CAPÔ ══════════════════════════════════════════════════════════════════
/** Onde o capô começa (sob o para-brisa), quanto mede e o eixo dele. */
export const CAPO = { z0: -.8, L: 1.5, yc: -.385, ky: .86 } as const;
/** Raio do capô a `s` metros do para-brisa: afina para o cubo e fecha num lábio. */
export const raioDoCapo = (s: number) => .285 + .02 * liso(0, .4, s) - .032 * liso(.9, 1.42, s) + .013 * Math.exp(-(((s - 1.465) / .03) ** 2));
const secaoCapo = (a: number, r: number, p: THREE.Vector3, z: number, dr = 0) => p.set((r + dr) * Math.sin(a), CAPO.yc + (r * CAPO.ky + dr) * Math.cos(a), z);

export function construirCapo(m: Materiais): THREE.Group {
    const g = new THREE.Group();
    const corpo = superficie(120, 80, (u, v, p) => {
        const s = v * CAPO.L;
        secaoCapo((u - .5) * Math.PI * 2, raioDoCapo(s), p, CAPO.z0 - s);
    }, { fechaU: true });
    g.add(new THREE.Mesh(corpo, m.capo));
    // a cinta de couro que segura a tampa, com a fivela de latão no topo
    const cinta = (s0: number, s1: number) => superficie(96, 2, (u, v, p) => {
        const s = mix(s0, s1, v);
        secaoCapo((u - .5) * Math.PI * 2, raioDoCapo(s), p, CAPO.z0 - s, .0035 * Math.sin(v * Math.PI));
    }, { fechaU: true, uv: (u, v) => [u * 6, v] });
    const c1 = new THREE.Mesh(cinta(.5, .56), m.couroCinta); g.add(c1);
    const c2 = new THREE.Mesh(cinta(.93, .99), m.couroCinta); g.add(c2);
    for (const s of [.53, .96]) {
        const y = CAPO.yc + (raioDoCapo(s) * CAPO.ky) + .0085, z = CAPO.z0 - s;
        const fivela = new THREE.Mesh(new RoundedBoxGeometry(.046, .007, .05, 2, .0025), m.latao); fivela.position.set(0, y, z); g.add(fivela);
        const vazio = new THREE.Mesh(new RoundedBoxGeometry(.03, .009, .03, 2, .002), m.couroEscuro); vazio.position.set(0, y + .001, z); g.add(vazio);
        const lingueta = new THREE.Mesh(new THREE.BoxGeometry(.004, .0035, .05), m.aco); lingueta.position.set(0, y + .006, z); g.add(lingueta);
    }
    // o lábio do capô: um anel de latão escovado na frente
    const sL = 1.465, rL = raioDoCapo(sL);
    const anel = superficie(120, 16, (u, v, p) => {
        const a = (u - .5) * Math.PI * 2, b = v * Math.PI * 2, rt = .014;
        const nx = Math.sin(a), ny = Math.cos(a) * CAPO.ky, nn = Math.hypot(nx, ny) || 1;
        secaoCapo(a, rL + .004, p, CAPO.z0 - sL);
        p.x += (nx / nn) * Math.cos(b) * rt; p.y += (ny / nn) * Math.cos(b) * rt; p.z += Math.sin(b) * rt;
    }, { fechaU: true });
    g.add(new THREE.Mesh(anel, m.lataoVelho));
    return g;
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ═══ A HÉLICE ════════════════════════════════════════════════════════════════
export const HELICE = { R: .95, z: CAPO.z0 - CAPO.L - .13, y: CAPO.yc, ghosts: 96 } as const;

function laminaDaPa(ponta: boolean): THREE.BufferGeometry {
    const R = HELICE.R, r0 = .04, r1 = ponta ? R : R * .88, r2 = ponta ? R * .88 : r0;
    // a pá inteira vai de r0 a R; a capa de latão da ponta cobre 0,88R–R
    const a = ponta ? r2 : r0, b = ponta ? R : r1;
    const corda = (r: number) => { const t = r / R; return .056 + .118 * Math.sin(Math.PI * Math.min(1, Math.pow(t, .62) * 1.0)) * (1 - .18 * t) + (t > .93 ? -Math.pow((t - .93) / .07, 2) * .04 : 0); };
    const espessura = (r: number) => .34 * corda(r) * (1 - .55 * (r / R)) + .006;
    const torcao = (r: number) => grau(14 + 38 * Math.pow(1 - r / R, 1.3));
    const N = 18, nc = 26;
    return superficie(nc, N, (u, v, p) => {
        const r = mix(a, b, v), c = corda(r), e = espessura(r), tw = torcao(r);
        // u percorre o perfil: extradorso (frente) de trás para o bordo de ataque e o intradorso (plano) de volta
        const w = u < .5 ? 1 - u * 2 : (u - .5) * 2, sup = u < .5;
        const xc = (1 - Math.cos(w * Math.PI)) / 2;              // 0 = bordo de ataque, 1 = fuga
        const esp = e * (.2969 * Math.sqrt(xc) - .126 * xc - .3516 * xc * xc + .2843 * xc ** 3 - .1015 * xc ** 4) / .0781;
        const x = (xc - .3) * c, z0 = sup ? -esp * .85 : esp * .15;      // intradorso quase plano, extradorso abaulado
        // gira em torno do eixo da pá (y) pelo passo: corda para fora do plano do disco
        p.set(x * Math.cos(tw) - z0 * Math.sin(tw), r, x * Math.sin(tw) + z0 * Math.cos(tw));
    }, { uv: (u, v) => [v * 2, u], inverter: true, fechaU: true });
}

export interface Helice {
    grupo: THREE.Group;
    /** `angulo` (rad, sentido horário visto do piloto), `borrao` 0–1, `abertura` = rastro em rad. */
    pose(angulo: number, abertura: number, solida: number, visivel: boolean): void;
}
export function construirHelice(m: Materiais): Helice {
    const grupo = new THREE.Group(); grupo.position.set(0, HELICE.y, HELICE.z);
    const R = HELICE.R;
    // pás de verdade (duas) — opacas quando o motor morre
    const pas = new THREE.Group(); grupo.add(pas);
    const madeira = laminaDaPa(false), capa = laminaDaPa(true);
    const pa = (i: number) => {
        const k = new THREE.Group(); k.rotation.z = i * Math.PI;
        const w = new THREE.Mesh(madeira, m.helice); k.add(w);
        const c = new THREE.Mesh(capa, m.latao); c.scale.setScalar(1.045); k.add(c);
        return k;
    };
    pas.add(pa(0), pa(1));
    // o cubo de latão (atrás do capô na maior parte do tempo)
    const cubo = new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .1, 24), m.latao); cubo.rotation.x = Math.PI / 2; grupo.add(cubo);
    // o rastro: cópias translúcidas da pá, espalhadas por um arco
    const N = HELICE.ghosts * 2;
    const rastro = new THREE.InstancedMesh(madeira, m.heliceTinta, N); rastro.frustumCulled = false; rastro.renderOrder = 3;
    const rastroL = new THREE.InstancedMesh(capa, m.heliceAnel, N); rastroL.frustumCulled = false; rastroL.renderOrder = 3;
    grupo.add(rastro, rastroL);
    // o disco: uma névoa fina entre o cubo e a ponta
    const disco = new THREE.Mesh(new THREE.RingGeometry(.1, R * .97, 72, 3), m.heliceDisco); disco.renderOrder = 2; grupo.add(disco);
    const mtx = new THREE.Matrix4(), rot = new THREE.Quaternion(), zaxis = new THREE.Vector3(0, 0, 1), um = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3();
    return {
        grupo,
        pose(angulo, abertura, solida, visivel) {
            grupo.visible = visivel;
            pas.rotation.z = -angulo;
            m.helice.opacity = solida;
            pas.visible = solida > .01;
            const borrao = 1 - solida;
            rastro.visible = rastroL.visible = borrao > .01 && abertura > .01;
            disco.visible = borrao > .02;
            m.heliceDisco.opacity = .06 * borrao * Math.min(1, abertura / 2.4);
            // cada cópia rende 1/N do rastro; o conjunto some junto com `borrao`
            const passos = HELICE.ghosts;
            m.heliceTinta.opacity = .075 * borrao;
            m.heliceAnel.opacity = .085 * borrao;
            for (let k = 0; k < passos; k++) for (let b = 0; b < 2; b++) {
                const a = -angulo + (k / passos) * abertura + b * Math.PI;
                rot.setFromAxisAngle(zaxis, a); mtx.compose(zero, rot, um);
                rastro.setMatrixAt(k * 2 + b, mtx); rastroL.setMatrixAt(k * 2 + b, mtx);
            }
            rastro.instanceMatrix.needsUpdate = rastroL.instanceMatrix.needsUpdate = true;
        },
    };
}

// ═══ O PARA-BRISA ════════════════════════════════════════════════════════════
export const PARABRISA = { z: -.82, yBase: -.115, alt: .235, larg: .56, raio: .72, rake: .5 } as const;
export function construirParabrisa(m: Materiais): THREE.Group {
    const g = new THREE.Group(); g.position.set(0, PARABRISA.yBase, PARABRISA.z); g.rotation.x = PARABRISA.rake;
    const { alt, larg, raio } = PARABRISA, da = larg / raio;
    const ponto = (a: number, h: number, p: THREE.Vector3, dentro = 0) => p.set(Math.sin(a) * (raio + dentro), h * alt, raio - Math.cos(a) * (raio + dentro) * 1);
    // o vidro: um setor de cilindro, levemente curvo
    const vidro = superficie(40, 8, (u, v, p) => ponto((u - .5) * da, v, p), { inverter: true });
    const vid = new THREE.Mesh(vidro, m.vidro); vid.renderOrder = 4; g.add(vid);
    // moldura de latão: trilho de baixo, de cima e os dois montantes curvos
    const trilho = (h: number, r: number) => {
        const pts: THREE.Vector3[] = []; for (let i = 0; i <= 24; i++) pts.push(ponto((i / 24 - .5) * da, h, new THREE.Vector3()));
        return new THREE.Mesh(tubo(new THREE.CatmullRomCurve3(pts), 48, 10, () => r), m.latao);
    };
    g.add(trilho(0, .0085), trilho(1, .0065));
    for (const s of [-1, 1]) {
        const pts: THREE.Vector3[] = []; for (let i = 0; i <= 8; i++) { const h = i / 8; pts.push(ponto(s * da / 2 * (1 + .05 * h), h, new THREE.Vector3())); }
        g.add(new THREE.Mesh(tubo(new THREE.CatmullRomCurve3(pts), 16, 10, () => .0075), m.latao));
        // braçadeira de latão na base, com dois parafusos
        const a = s * da / 2, b = new THREE.Mesh(new RoundedBoxGeometry(.03, .022, .02, 2, .004), m.latao); ponto(a, 0, b.position); b.position.y += .006; b.rotation.y = -s * .4; g.add(b);
        for (const dy of [0, .02]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.0042, .0042, .004, 10), m.acoEscuro); ponto(a, .03 + dy * 4, p.position, .006); p.rotation.x = Math.PI / 2; g.add(p); }
    }
    // a borracha que segura o vidro: fio escuro colado à moldura de baixo
    const vedacao = superficie(40, 1, (u, v, p) => { ponto((u - .5) * da, .004 + v * .05, p, -.0005); }, { inverter: true });
    g.add(new THREE.Mesh(vedacao, m.borracha));
    return g;
}

// ═══ A BORDA ACOLCHOADA DA CABINE ════════════════════════════════════════════
export const PAINEL = { z: -.74, yTopo: -.205, meia: .26 } as const;
export function construirBorda(m: Materiais): THREE.Group {
    const g = new THREE.Group();
    const M = PAINEL.meia + .03, zF = PAINEL.z - .03, yF = PAINEL.yTopo + .012;
    // um laço só: sobe pelas laterais até o painel e atravessa a frente
    const pts = [
        [-M - .07, -.38, -.1], [-M - .05, -.33, -.34], [-M - .02, -.26, -.58], [-M, yF - .012, zF + .09], [-M + .035, yF, zF + .014],
        [-M * .5, yF + .003, zF], [0, yF + .004, zF - .002], [M * .5, yF + .003, zF], [M - .035, yF, zF + .014],
        [M, yF - .012, zF + .09], [M + .02, -.26, -.58], [M + .05, -.33, -.34], [M + .07, -.38, -.1],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curva = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    g.add(new THREE.Mesh(tubo(curva, 200, 24, (t) => .024 * (1 + .05 * Math.sin(t * Math.PI * 9)), false, 16), m.couroRim));
    return g;
}

// ═══ ASAS, MONTANTES E CABOS ═════════════════════════════════════════════════
const perfilDeAsa = (xc: number) => {
    const T = .13, mC = .04, pC = .4;
    const t = 5 * T * (.2969 * Math.sqrt(xc) - .126 * xc - .3516 * xc * xc + .2843 * xc ** 3 - .1015 * xc ** 4);
    const yc = xc < pC ? mC / (pC * pC) * (2 * pC * xc - xc * xc) : mC / ((1 - pC) ** 2) * ((1 - 2 * pC) + 2 * pC * xc - xc * xc);
    return { yc, t };
};
/** Uma asa: perfil RAF varrido na envergadura. A UV é em metros (ladrilho de 0,35 m). */
export function construirAsa(envergaduraMeia: number, corda: number, zBordoAtaque: number, y: number, m: Materiais, tipo: 'baixa' | 'alta'): THREE.Group {
    const g = new THREE.Group();
    const nc = 36, nx = 40, ladrilho = .35;
    // comprimento do perfil (aprox.) para a UV seguir o tecido
    const comp = corda * 2.12;
    const ponto = (u: number, v: number, p: THREE.Vector3, somenteMadeira = false) => {
        const sup = u < .5, w = sup ? 1 - u * 2 : (u - .5) * 2, xc = (1 - Math.cos(w * Math.PI)) / 2;
        const { yc, t } = perfilDeAsa(xc);
        const x = (v * 2 - 1) * envergaduraMeia;
        const dih = Math.abs(x) * .035;                     // diedro
        void somenteMadeira;
        p.set(x, y + dih + (sup ? yc + t / 2 : yc - t / 2) * corda, zBordoAtaque + xc * corda);
    };
    const uvAsa = (u: number, v: number): [number, number] => [(u < .5 ? (1 - u * 2) : (u - .5) * 2) * comp / 2 / ladrilho + (u < .5 ? 0 : 7), (v * 2 - 1) * envergaduraMeia / ladrilho];
    const mat = tipo === 'baixa' ? m.lona : m.lonaTopo;
    // tecido: toda a asa, exceto a faixa de compensado do bordo de ataque (desenhada à parte)
    const tecido = superficie(nc, nx, (u, v, p) => ponto(u, v, p), { uv: uvAsa, inverter: true, fechaU: true });
    const mt = new THREE.Mesh(tecido, mat); g.add(mt);
    // bordo de ataque em compensado envernizado: 18% da corda, em cima e embaixo
    const le = superficie(14, nx, (u, v, p) => {
        // u 0..1 percorre do extradorso (xc .18) ao bordo de ataque e ao intradorso (xc .18)
        const w = Math.abs(u * 2 - 1), xc = (1 - Math.cos(w * Math.PI * .28)) / 2 * 0 + w * w * .22;
        const sup = u < .5, { yc, t } = perfilDeAsa(xc);
        p.set((v * 2 - 1) * envergaduraMeia + 0, y + Math.abs((v * 2 - 1) * envergaduraMeia) * .035 + (sup ? yc + t / 2 : yc - t / 2) * corda * 1.004, zBordoAtaque + xc * corda);
    }, { uv: (u, v) => [u * 4, v * envergaduraMeia * 2 / .35 * .3], inverter: true });
    const madeira = new THREE.Mesh(le, m.abetoV); madeira.scale.set(1, 1.004, 1); g.add(madeira);
    return g;
}

/** Montante aerodinâmico: seção elíptica de abeto com duas braçadeiras de aço. */
export function construirMontante(m: Materiais): THREE.Group {
    const g = new THREE.Group();
    const cor = new THREE.Mesh(CIL, m.abetoV); g.add(cor);
    return g;
}
export function construirCabo(m: Materiais): THREE.Mesh { return new THREE.Mesh(CIL_FINO, m.acoEscuro); }

// ═══ O MANCHE E AS MÃOS ══════════════════════════════════════════════════════
/** O manche: coluna de aço que sobe do piso e termina numa barra em T com empunhaduras de couro. */
export const MANCHE = { pivo: new THREE.Vector3(0, -.74, -.36), comp: .468, barra: .3, rBarra: .0135 } as const;
export function construirManche(m: Materiais): THREE.Group {
    const g = new THREE.Group();
    // a origem do grupo é o pivô no piso; o topo fica em +y
    const coluna = new THREE.Mesh(new THREE.CylinderGeometry(.0115, .0135, MANCHE.comp, 20, 1), m.aco); coluna.position.y = MANCHE.comp / 2; g.add(coluna);
    const topo = new THREE.Group(); topo.position.y = MANCHE.comp; g.add(topo);
    const barra = new THREE.Mesh(new THREE.CylinderGeometry(MANCHE.rBarra, MANCHE.rBarra, MANCHE.barra, 24, 1), m.aco); barra.rotation.z = Math.PI / 2; topo.add(barra);
    for (const s of [-1, 1]) {
        // empunhadura de couro trançado (o fio enrolado em espiral vem do relevo)
        const emp = new THREE.Mesh(new THREE.CylinderGeometry(MANCHE.rBarra + .003, MANCHE.rBarra + .003, .112, 24, 1), m.couroEscuro); emp.rotation.z = Math.PI / 2; emp.position.x = s * .083; topo.add(emp);
        const tampa = new THREE.Mesh(new THREE.SphereGeometry(MANCHE.rBarra + .004, 18, 12), m.latao); tampa.position.x = s * .151; tampa.scale.x = .7; topo.add(tampa);
    }
    // o cubo de latão onde a coluna encontra a barra, com o botão vermelho de tiro
    const cubo = new THREE.Mesh(new THREE.SphereGeometry(.023, 24, 16), m.latao); topo.add(cubo);
    const botao = new THREE.Mesh(new THREE.CylinderGeometry(.0085, .0095, .012, 16), new THREE.MeshStandardMaterial({ color: '#8c1a12', roughness: .35, metalness: .1 })); botao.position.y = .022; topo.add(botao);
    const colar = new THREE.Mesh(new THREE.TorusGeometry(.0145, .004, 8, 24), m.latao); colar.rotation.x = Math.PI / 2; colar.position.y = MANCHE.comp - .05; g.add(colar);
    g.userData.topo = topo;
    return g;
}

/**
 * Luva de aviador. O referencial é o da barra do manche: origem no eixo
 * dela, -z para a frente, +y para cima. `lado` = +1 mão direita (mindinho
 * para fora, em +x), -1 esquerda. A mão fecha em volta da barra: o dorso
 * aparece em cima, os dedos dão a volta pela frente e a ponta se recolhe
 * por baixo. Devolve o punho (onde a luva encontra a manga) em `userData.punho`.
 */
export function construirMao(m: Materiais, lado: 1 | -1): THREE.Group {
    const g = new THREE.Group();
    const rb = MANCHE.rBarra + .003, xh = .083;           // a mão fica sobre a empunhadura
    const C = new THREE.Vector3(0, 0, 0);
    const dir = (phi: number) => new THREE.Vector3(0, Math.sin(phi), -Math.cos(phi));
    // um dedo: arco de círculo em volta da barra, raio variável, ponta arredondada
    const dedo = (x: number, raio: number, compr: number[], gros: number, phi0: number, cima = 1) => {
        const rho = rb + raio, total = compr.reduce((a, b) => a + b, 0), dphi = total / rho;
        const juntas = [compr[0] / total, (compr[0] + compr[1]) / total];
        const geo = superficie(14, 40, (u, v, p) => {
            const phi = phi0 - v * dphi, a = u * Math.PI * 2;
            let r = gros * (1 + .05 * juntas.reduce((s, j) => s + Math.exp(-(((v - j) / .05) ** 2)), 0) - .035 * Math.sin(v * Math.PI * 3.2) ** 2 * .0);
            r *= v > .86 ? Math.sqrt(Math.max(0, 1 - ((v - .86) / .14) ** 2) * .92 + .08) : 1;
            r *= 1 - .18 * v;                                               // afina para a ponta
            const d = dir(phi);
            p.copy(C).addScaledVector(d, rho + r * Math.cos(a) * cima);
            p.x += x + r * Math.sin(a) * .92;
        }, { uv: (u, v) => [u * 2, v * 2], inverter: true, fechaU: true });
        return new THREE.Mesh(geo, m.couroLuva);
    };
    // dedos: indicador (perto do centro) → mindinho (fora). Comprimentos por falange.
    const xs = [-.0285, -.0095, .0095, .027];
    const fingers: [number, number[], number][] = [
        [xs[0], [.042, .026, .022], .0088],
        [xs[1], [.046, .029, .023], .0092],
        [xs[2], [.043, .027, .022], .009],
        [xs[3], [.033, .02, .018], .0078],
    ];
    const mao = new THREE.Group(); mao.position.x = lado * xh; g.add(mao);
    // para a mão esquerda o desenho inteiro é espelhado em x (indicador para dentro)
    const espelho = new THREE.Group(); espelho.scale.x = lado; mao.add(espelho);
    // a mão direita tem o indicador do lado do polegar (dentro = -x): xs já está assim
    fingers.forEach(([x, compr, gros]) => espelho.add(dedo(x, gros, compr, gros, grau(118))));
    // o polegar dá a volta por cima, do lado de dentro, e desce pela frente
    const polegar = (() => {
        const rho = rb + .0105, dphi = .072 / rho, x0 = -.052;
        const geo = superficie(14, 36, (u, v, p) => {
            const phi = grau(160) - v * dphi, a = u * Math.PI * 2;
            let r = .0108 * (1 + .04 * Math.exp(-(((v - .5) / .07) ** 2)));
            r *= v > .85 ? Math.sqrt(Math.max(0, 1 - ((v - .85) / .15) ** 2) * .9 + .1) : 1; r *= 1 - .14 * v;
            p.copy(C).addScaledVector(dir(phi), rho + r * Math.cos(a)); p.x += x0 + r * Math.sin(a) * .95 + .006 * v;
        }, { uv: (u, v) => [u * 2, v * 2], inverter: true, fechaU: true });
        return new THREE.Mesh(geo, m.couroLuva);
    })();
    espelho.add(polegar);
    // o dorso da mão: um bloco arredondado que vai dos nós dos dedos ao punho, inclinado
    const dorso = new THREE.Mesh(new RoundedBoxGeometry(.088, .036, .104, 5, .014), m.couroLuva);
    dorso.position.set(0, .021, .0655); dorso.rotation.x = .2; espelho.add(dorso);
    // a base do polegar
    const tenar = new THREE.Mesh(new THREE.SphereGeometry(.0235, 20, 14), m.couroLuva); tenar.scale.set(1, .85, 1.25); tenar.position.set(-.036, .01, .056); espelho.add(tenar);
    // os três tendões do dorso e as costuras de couro (linhas escuras)
    for (const x of [-.02, 0, .02]) {
        const pts = [new THREE.Vector3(x, .036, .108), new THREE.Vector3(x, .0405, .07), new THREE.Vector3(x + (x * .1), .0385, .028), new THREE.Vector3(x, .031, .008)];
        const t = new THREE.Mesh(tubo(new THREE.CatmullRomCurve3(pts), 14, 8, () => .0028), m.costura); espelho.add(t);
    }
    // o nó dos dedos: quatro rolos onde o couro dobra
    xs.forEach((x, i) => { const r = new THREE.Mesh(new THREE.SphereGeometry(i === 3 ? .0085 : .0098, 14, 10), m.couroLuva); r.position.set(x, .0342, .0055); r.scale.set(1, .85, 1.1); espelho.add(r); });
    // o punho da luva: um cano curto que alarga, com correia e fivela
    const punho = new THREE.Group(); punho.position.set(0, .0205, .118); punho.rotation.x = 0; g.userData.punho = punho; espelho.add(punho);
    const cano = new THREE.Mesh(superficie(40, 6, (u, v, p) => { const a = u * Math.PI * 2, r = mix(.0365, .047, v * v); p.set(Math.sin(a) * r, Math.cos(a) * r * .94, v * .052); }, { inverter: false, fechaU: true, uv: (u, v) => [u * 3, v] }), m.couroLuva);
    punho.add(cano);
    const correia = new THREE.Mesh(superficie(40, 1, (u, v, p) => { const a = u * Math.PI * 2, r = .0405 + .0028; p.set(Math.sin(a) * r, Math.cos(a) * r * .94, .004 + v * .014); }, { fechaU: true, uv: (u, v) => [u * 4, v] }), m.couroCinta);
    punho.add(correia);
    const fiv = new THREE.Mesh(new RoundedBoxGeometry(.016, .014, .017, 2, .003), m.latao); fiv.position.set(0, .0405 * .94 + .0035, .011); punho.add(fiv);
    g.userData.espelho = espelho;
    return g;
}

/** O antebraço: manga de lã azul, punho de malha canelada e um pedaço de antebraço. Eixo em +z para o cotovelo. */
export function construirManga(m: Materiais): THREE.Group {
    const g = new THREE.Group();
    const rnd = semente(909);
    const L = .34;
    // punho de malha (azul mais escuro) — sai de dentro do cano da luva
    const punho = new THREE.Mesh(superficie(48, 4, (u, v, p) => {
        const a = u * Math.PI * 2, r = .0345 + .0015 * Math.sin(v * Math.PI); p.set(Math.sin(a) * r, Math.cos(a) * r * .95, v * .05);
    }, { inverter: false, fechaU: true, uv: (u, v) => [u * 3, v] }), m.malha);
    g.add(punho);
    // a manga: sobe do punho alargando, com dobras (rugas) e um leve tombo de tecido
    const manga = new THREE.Mesh(superficie(64, 70, (u, v, p) => {
        const a = u * Math.PI * 2, s = v * L, base = mix(.0365, .046, liso(0, .22, s) * .7 + liso(.22, L, s) * .3);
        const ruga = .0034 * Math.sin(s * 95 + Math.sin(a * 2) * 1.4) * (1 - liso(.05, .2, s) * .5) + fbm3(Math.cos(a) * 3, Math.sin(a) * 3, s * 18, 3) * .003;
        const r = base + ruga + .004 * Math.exp(-(((s - .03) / .02) ** 2));
        p.set(Math.sin(a) * r, Math.cos(a) * r * .95, .045 + s);
    }, { inverter: false, fechaU: true, uv: (u, v) => [u, v * 1.2] }), m.la);
    g.add(manga);
    void rnd;
    return g;
}

/** Placa de latão gravada (para o painel). */
export function construirPlaca(m: Materiais, texto: string, sub: string): THREE.Mesh {
    void m;
    return new THREE.Mesh(new THREE.PlaneGeometry(.085, .032), new THREE.MeshStandardMaterial({ map: texPlaca(texto, sub), metalness: .9, roughness: .35, envMapIntensity: 1.3 }));
}
