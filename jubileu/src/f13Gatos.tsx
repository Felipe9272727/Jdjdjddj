/**
 * f13Gatos.tsx — o estado dos gatos de rua da vila (andar 13).
 *
 * Aqui NÃO se desenha gato nenhum: os gatos de verdade são os GLB animados de
 * Floor13Vida.tsx (componente Gato13), que leem e escrevem neste módulo.
 * O que vive aqui é a cozinha da brincadeira:
 *
 *   - os peixes largados no chão (lista mutável, sem passar pelo React a cada quadro);
 *   - o caixote de peixes da vila, que dá peixe de graça a quem chegar perto;
 *   - as regras de personalidade (quem corre atrás de um peixe, e quando);
 *   - os contadores do HUD (alimentados, saciados, ultimoNome);
 *   - a API que o Floor13 aperta no botão: gatos.pegar() / gatos.oferecer().
 *
 * O Gato13 importa daqui peixeQueValeAPena(), RAIO_COME, VEL, TEMPO_COMIDA,
 * consumirPeixe(), marcarComeu(), peixeDisponivelPara() e ondeEstaOJogador().
 * A posição do jogador chega pelo `jog` de GatosDaVila (o mesmo ref que o resto
 * do andar usa) e fica em `posJogador`, para as regras acima.
 *
 * O que se desenha aqui (só o desenho — a lógica é a mesma de sempre):
 *   - o caixote: engradado de ripas de carvalho, ABERTO em cima, com ripas de
 *     pé separadas por vãos, dois aros horizontais por fora, cantoneiras nos
 *     cantos e fundo de tábuas, cheio de peixes aparecendo por cima da borda;
 *   - o peixe: corpo fusiforme achatado dos lados, cauda em V, dorsal, anal,
 *     peitorais e olho saliente, com cor por vértice do dorso (prata-azulado)
 *     para a barriga (quase branca) e brilho de molhado;
 *   - o peixe que balança na mão do jogador.
 * Todos os peixes compartilham UMA geometria e UM material (vertexColors), então
 * cada peixe custa uma chamada de desenho; o caixote inteiro (ripas, aros e
 * fundo) é UMA geometria fundida com UM material de madeira texturizada.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { chaoEm } from './f13Mundo';
import { pbr } from './f13Texturas';

const TAU = Math.PI * 2;
export const RAIO_COME = 0.55;      // distância em que o gato alcança o peixe
const ALCANCE_PEGAR = 2.2;          // alcance do jogador para pegar um peixe do chão
const MAX_PEIXES = 10;              // anti-lixo de peixes esquecidos

/** O caixote de peixes da vila: dá peixes de graça para quem chegar perto. */
export const CESTO = new THREE.Vector3(-3, 0, -1);

export type Personalidade = 'fominha' | 'desconfiado' | 'pachorrento';

/** Velocidade de caminhada (m/s) e tempo de mastigação (s) de cada personalidade. */
export const VEL: Record<Personalidade, number> = { fominha: 3.2, desconfiado: 2.2, pachorrento: 1.2 };
export const TEMPO_COMIDA: Record<Personalidade, number> = { fominha: 3.2, desconfiado: 4.5, pachorrento: 8 };

/* ============================== peixes ================================ */

export type Peixe = { id: number; pos: THREE.Vector3; yaw: number; dono: number | null };

export const peixesNoChao: Peixe[] = [];
let versaoPeixes = 0;          // muda quando a lista muda (o React observa)
let proximoIdPeixe = 1;

/** Muda a cada peixe posto/tira do chão: é o gatilho de redesenho do React. */
export function versaoDosPeixes(): number { return versaoPeixes; }

/* ===================== posição do jogador (para a API) ================ */

const posJogador = new THREE.Vector3();
const jogFrente = new THREE.Vector3(0, 0, 1);

/** Onde o jogador está agora. Quem chama não deve mexer no vetor. */
export function ondeEstaOJogador(): THREE.Vector3 { return posJogador; }

/* ============================ estado global ============================ */

const jaComeu = new Set<number>();

export const gatos = {
    /** true quando o jogador está com um peixe na mão */
    peixeNaMao: false,
    /** peixes que os gatos já comeram */
    alimentados: 0,
    /** quantos gatos distintos já comeram (0..3) */
    saciados: 0,
    /** quantos gatos vivem na vila agora (quem sabe é o Floor13Vida) */
    gatosNaVila: 0,
    /** nome do último gato que recebeu um peixe (para o HUD) */
    ultimoNome: '',
    /** Floor13: botão "PEGAR PEIXE" */
    pegar: pegarPeixe,
    /** Floor13: botão "OFERECER PEIXE" */
    oferecer: oferecerPeixe,
    /** onde fica o caixote de peixes, para marcar no mapa */
    cesto: CESTO,
};

/** Zera peixes e contadores quando o andar carrega. */
export function reiniciarGatosDaVila() {
    peixesNoChao.length = 0;
    versaoPeixes++;
    jaComeu.clear();
    gatos.peixeNaMao = false;
    gatos.alimentados = 0;
    gatos.saciados = 0;
    gatos.ultimoNome = '';
}

/** Larga um peixe no chão em (x, z). O dono é definido pelo 1º gato que chega. */
export function largarPeixe(x: number, z: number): THREE.Vector3 {
    const p: Peixe = { id: proximoIdPeixe++, pos: new THREE.Vector3(x, 0, z), yaw: Math.random() * TAU, dono: null };
    p.pos.y = (chaoEm(x, z) ?? 0) + 0.02;
    peixesNoChao.push(p);
    if (peixesNoChao.length > MAX_PEIXES) peixesNoChao.shift();
    gatos.peixeNaMao = false;
    versaoPeixes++;
    return p.pos;
}

/** O peixe ainda está no chão e ninguém (ou só o gato `id`) reivindicou ele? */
export function peixeDisponivelPara(p: Peixe, id: number): boolean {
    return peixesNoChao.indexOf(p) >= 0 && (p.dono === null || p.dono === id);
}

/** Tira o peixe do chão: conta para o HUD e libera a lista. */
export function consumirPeixe(p: Peixe): boolean {
    const i = peixesNoChao.indexOf(p);
    if (i < 0) return false;
    peixesNoChao.splice(i, 1);
    versaoPeixes++;
    gatos.alimentados++;
    return true;
}

/** Marca que o gato `id` já comeu (o HUD mostra "n de 3 gatos satisfeitos"). */
export function marcarComeu(id: number) {
    jaComeu.add(id);
    gatos.saciados = jaComeu.size;
}

/* ========================== comportamentos ============================ */

/** Regra de cada personalidade para decidir se vale a pena ir atrás do peixe. */
export function querPeixe(tipo: Personalidade, gx: number, gz: number, p: Peixe): boolean {
    switch (tipo) {
        case 'fominha': return true;                                                        // vem de qualquer lugar
        case 'desconfiado': return Math.hypot(posJogador.x - p.pos.x, posJogador.z - p.pos.z) > 4.5; // só sem plateia
        case 'pachorrento': return Math.hypot(gx - p.pos.x, gz - p.pos.z) < 3.5;            // só se cair no colo
        default: return false;
    }
}

/** Primeiro peixe sem dono que esse gato se digna a buscar. */
export function peixeQueValeAPena(tipo: Personalidade, gx: number, gz: number): Peixe | null {
    for (let i = 0; i < peixesNoChao.length; i++) {
        const p = peixesNoChao[i];
        if (p.dono !== null) continue;
        if (!querPeixe(tipo, gx, gz, p)) continue;
        return p;
    }
    return null;
}

/* ============================ API do jogador ========================== */

function pegarPeixe(): boolean {
    if (gatos.peixeNaMao) return false;
    // 1) peixe solto no chão, ao alcance
    for (let i = peixesNoChao.length - 1; i >= 0; i--) {
        const p = peixesNoChao[i];
        if (p.dono !== null) continue;   // já tem dono: o gato está comendo
        if (Math.hypot(p.pos.x - posJogador.x, p.pos.z - posJogador.z) > ALCANCE_PEGAR) continue;
        peixesNoChao.splice(i, 1);
        versaoPeixes++;
        gatos.peixeNaMao = true;
        return true;
    }
    // 2) caixote de peixes da vila (fonte infinita, precisa estar perto)
    if (Math.hypot(CESTO.x - posJogador.x, CESTO.z - posJogador.z) <= ALCANCE_PEGAR + 1) {
        gatos.peixeNaMao = true;
        return true;
    }
    return false;
}

function oferecerPeixe(): boolean {
    if (!gatos.peixeNaMao) return false;
    largarPeixe(posJogador.x + jogFrente.x * 0.95, posJogador.z + jogFrente.z * 0.95);
    return true;
}

/* ======================= miúdos de malha e geometria ================== */

/** Junta várias geometrias (já posicionadas) numa só: menos chamadas de desenho. */
function fundir(partes: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const pecas = partes.map((g) => (g.index ? g.toNonIndexed() : g));
    let total = 0;
    for (const p of pecas) total += p.attributes.position.count;
    const temUv = pecas.every((p) => !!p.attributes.uv);
    const temCor = pecas.every((p) => !!p.attributes.color);
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = temUv ? new Float32Array(total * 2) : null;
    const cor = temCor ? new Float32Array(total * 3) : null;
    let o = 0;
    for (const p of pecas) {
        const n = p.attributes.position.count;
        pos.set((p.attributes.position as THREE.BufferAttribute).array as Float32Array, o * 3);
        nor.set((p.attributes.normal as THREE.BufferAttribute).array as Float32Array, o * 3);
        if (uv) uv.set((p.attributes.uv as THREE.BufferAttribute).array as Float32Array, o * 2);
        if (cor) cor.set((p.attributes.color as THREE.BufferAttribute).array as Float32Array, o * 3);
        o += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (cor) g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    g.computeBoundingSphere();
    return g;
}

/** Pinta a geometria inteira com uma cor por vértice (tudo cabe no mesmo material). */
function pinta(g: THREE.BufferGeometry, cor: THREE.Color): THREE.BufferGeometry {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        c[i * 3] = cor.r;
        c[i * 3 + 1] = cor.g;
        c[i * 3 + 2] = cor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
}

/* ======================= o peixe (só o desenho) ======================= */

// paleta do peixe: prata-azulado no lombo, prata no flanco, claro na barriga
const COR_DORSO = new THREE.Color('#3d6b96');
const COR_FLANCO = new THREE.Color('#b3c6d2');
const COR_BARRIGA = new THREE.Color('#f4f7f3');
const COR_BARBATANA = new THREE.Color('#8ba3b8');
const COR_OLHO = new THREE.Color('#080c10');

const MEIO_COMP = 0.165;   // metade do comprimento do corpo (a cauda vai além)
const MEIA_ALT = 0.062;    // metade da altura máxima
const MEIA_LARG = 0.030;   // metade da largura: peixe achatado dos lados

/** Silhueta do peixe: raio relativo (0..1) ao longo do corpo (0 = cauda, 1 = nariz). */
const PERFIL: [number, number][] = [
    [0.00, 0.20], [0.10, 0.46], [0.22, 0.72], [0.36, 0.92], [0.52, 1.00],
    [0.68, 0.96], [0.80, 0.84], [0.90, 0.64], [0.96, 0.42], [1.00, 0.10],
];

function catmull(p0: number, p1: number, p2: number, p3: number, s: number): number {
    const s2 = s * s;
    return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s2 * s);
}

function perfilDoCorpo(u: number): number {
    const t = Math.min(0.9999, Math.max(0, u));
    let i = 0;
    while (i < PERFIL.length - 2 && t > PERFIL[i + 1][0]) i++;
    const [x0, y0] = PERFIL[i];
    const [x1, y1] = PERFIL[i + 1];
    const s = (t - x0) / (x1 - x0);
    const antes = PERFIL[Math.max(0, i - 1)][1];
    const depois = PERFIL[Math.min(PERFIL.length - 1, i + 2)][1];
    return Math.max(0, catmull(antes, y0, y1, depois, s));
}

/** Corpo fusiforme com a cor do dorso à barriga gravada por vértice. */
function corpoFusiforme(): THREE.BufferGeometry {
    const ANEIS = 18, LADOS = 12;
    const zCauda = -MEIO_COMP, zNariz = MEIO_COMP;
    const pos: number[] = [];
    const cor: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();

    // k: -1 barriga, 0 flanco, +1 dorso
    const por = (x: number, y: number, z: number, k: number) => {
        pos.push(x, y, z);
        const d = THREE.MathUtils.smoothstep(k, -0.75, 0.30);
        const e = THREE.MathUtils.smoothstep(k, 0.10, 0.95);
        c.copy(COR_BARRIGA).lerp(COR_FLANCO, d).lerp(COR_DORSO, e);
        cor.push(c.r, c.g, c.b);
    };

    for (let i = 0; i <= ANEIS; i++) {
        const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / ANEIS);   // fecha os anéis nas pontas
        const r = perfilDoCorpo(u);
        const z = zCauda + (zNariz - zCauda) * u;
        for (let k = 0; k < LADOS; k++) {
            const a = (k / LADOS) * TAU;
            const ey = Math.sin(a);
            por(MEIA_LARG * r * Math.cos(a), MEIA_ALT * r * ey, z, ey);
        }
    }
    for (let i = 0; i < ANEIS; i++) {
        for (let k = 0; k < LADOS; k++) {
            const k2 = (k + 1) % LADOS;
            const a = i * LADOS + k, b = i * LADOS + k2;
            const cA = (i + 1) * LADOS + k, d = (i + 1) * LADOS + k2;
            idx.push(a, d, cA, a, b, d);
        }
    }
    // fecha o pedúnculo da cauda e arredonda o focinho
    const fundo = pos.length / 3;
    por(0, 0, zCauda - 0.012, -0.25);
    for (let k = 0; k < LADOS; k++) idx.push(fundo, (k + 1) % LADOS, k);
    const bico = pos.length / 3;
    por(0, 0, zNariz + 0.014, 0.15);
    const base = ANEIS * LADOS;
    for (let k = 0; k < LADOS; k++) idx.push(bico, base + k, base + ((k + 1) % LADOS));

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
}

/** Barbatanas: chapas finas (o material é de dois lados) com cor única. */
function barbatana(triangulos: number[][]): THREE.BufferGeometry {
    const pos: number[] = [];
    for (const t of triangulos) for (const v of t) pos.push(v);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();   // vértices soltos: normal por face
    return pinta(g, COR_BARBATANA);
}

/** Monta o peixe inteiro numa geometria só (corpo + barbatanas + olhos). */
function montarPeixe(): THREE.BufferGeometry {
    const partes: THREE.BufferGeometry[] = [corpoFusiforme()];
    const zBase = -MEIO_COMP + 0.012;

    // cauda em V: dois lobos bem abertos, com entalhe no meio
    partes.push(barbatana([
        [0, 0, zBase], [0, 0.104, -0.318], [0, 0.004, -0.238],
        [0, 0, zBase], [0, 0.004, -0.238], [0, -0.104, -0.318],
    ]));
    // barbatana dorsal, triangular e alta
    partes.push(barbatana([
        [0, 0.050, 0.098], [0, 0.122, 0.018], [0, 0.102, -0.034],
        [0, 0.050, 0.098], [0, 0.102, -0.034], [0, 0.042, -0.086],
    ]));
    // anal (pequena, embaixo)
    partes.push(barbatana([
        [0, -0.046, -0.022], [0, -0.088, -0.064], [0, -0.038, -0.096],
    ]));
    // peitorais, uma de cada lado
    partes.push(barbatana([
        [0.024, -0.004, 0.088], [0.026, -0.030, 0.048], [0.058, -0.048, 0.054],
    ]));
    partes.push(barbatana([
        [-0.024, -0.004, 0.088], [-0.058, -0.048, 0.054], [-0.026, -0.030, 0.048],
    ]));

    // olhos salientes, um de cada lado da cabeça
    const olhoD = new THREE.SphereGeometry(0.0125, 10, 8);
    olhoD.translate(0.025, 0.020, 0.101);
    partes.push(pinta(olhoD, COR_OLHO));
    const olhoE = new THREE.SphereGeometry(0.0125, 10, 8);
    olhoE.translate(-0.025, 0.020, 0.101);
    partes.push(pinta(olhoE, COR_OLHO));

    return fundir(partes);
}

/** Geometria + material únicos, criados uma vez para todos os peixes do andar. */
let recursoPeixe: { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial } | null = null;
function peixeCompartilhado() {
    if (!recursoPeixe) {
        recursoPeixe = {
            geo: montarPeixe(),
            mat: new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.4,       // molhado, não espelhado (metal deixava cara de brinquedo de lata)
                metalness: 0.05,
                envMapIntensity: 0.7,
                side: THREE.DoubleSide,   // as barbatanas são chapas de uma face só
            }),
        };
    }
    return recursoPeixe;
}

/** Um peixe: uma malha, uma chamada de desenho (geo/mat compartilhados). */
const Peixe: React.FC<{ yaw?: number; rolagem?: number; arfagem?: number }> = React.memo(
    ({ yaw = 0, rolagem = 0, arfagem = 0 }) => {
        const { geo, mat } = peixeCompartilhado();
        return <mesh geometry={geo} material={mat} rotation={[arfagem, yaw, rolagem]} castShadow />;
    },
);
Peixe.displayName = 'Peixe';

/* ====================== o caixote de ripas (só o desenho) ============== */

const LARG_CAIXA = 1.02;    // comprimento do engradado (eixo x)
const PROF_CAIXA = 0.70;    // profundidade do engradado (eixo z)
const ALT_CAIXA = 0.46;     // altura das ripas de pé
const ESP_RIPA = 0.038;     // espessura de cada ripa
const ARO_ESP = 0.045;      // espessura dos aros horizontais
const ARO_ALT = 0.062;      // altura dos aros horizontais
const ALT_CANTO = ALT_CAIXA + 0.14;   // as cantoneiras sobressaem da borda

const REP_POR_METRO = 1.6;  // quantas vezes a textura de madeira repete por metro
const REP_MIN = 0.4;        // nunca menos que isso numa face, para não esticar demais

/**
 * Ajusta as UVs de uma caixa: cada face recebe uma escala proporcional ao seu
 * tamanho, então as ripas curtas e as tábuas longas mostram o mesmo grão de
 * madeira (o material de carvalho é único para o caixote inteiro).
 */
function escalaUv(g: THREE.BoxGeometry, w: number, h: number, d: number) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
        const su = Math.max(REP_MIN, dims[f][0] * REP_POR_METRO);
        const sv = Math.max(REP_MIN, dims[f][1] * REP_POR_METRO);
        for (let i = 0; i < 4; i++) {
            const k = f * 4 + i;
            uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
        }
    }
    uv.needsUpdate = true;
}

/** Distribui `n` ripas de largura `larg` num comprimento, com vãos iguais entre elas. */
function centrosDeRipas(comprimento: number, n: number, larg: number): number[] {
    const vao = (comprimento - n * larg) / (n - 1);
    const passo = larg + vao;
    const ini = -comprimento / 2 + larg / 2;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(ini + i * passo);
    return out;
}

/**
 * Engradado de peixe, aberto em cima:
 *  - fundo de cinco tábuas com frestas finas;
 *  - ripas DE PÉ na frente, atrás e nas laterais, separadas por vãos (vê-se o
 *    peixe por entre elas);
 *  - dois aros horizontais por fora, amarrando as ripas;
 *  - quatro cantoneiras verticais que sobressaem um dedo acima da borda.
 * A caixa toda vira uma geometria só: o caixote inteiro é UMA chamada de desenho.
 */
function montarCaixote(): THREE.BufferGeometry {
    const pecas: THREE.BufferGeometry[] = [];
    const tabua = (w: number, h: number, d: number, x: number, y: number, z: number) => {
        const g = new THREE.BoxGeometry(w, h, d);
        escalaUv(g, w, h, d);   // a madeira pega na escala certa em cada peça
        g.translate(x, y, z);
        pecas.push(g);
    };

    const meiaL = LARG_CAIXA / 2;
    const meiaP = PROF_CAIXA / 2;
    const yRipa = 0.028 + ALT_CAIXA / 2;

    // ---- fundo: cinco tábuas ao longo do comprimento, com frestas finas
    const nFundo = 5;
    const vaoFundo = 0.02;
    const largFundo = (PROF_CAIXA - (nFundo - 1) * vaoFundo) / nFundo;
    for (let i = 0; i < nFundo; i++) {
        const z = -meiaP + largFundo / 2 + i * (largFundo + vaoFundo);
        tabua(LARG_CAIXA - 0.05, 0.028, largFundo, 0, 0.014, z);
    }

    // ---- ripas DE PÉ da frente e de trás (correm em x), com vãos entre elas
    const nFrente = 9, largFrente = 0.086;
    for (const x of centrosDeRipas(LARG_CAIXA, nFrente, largFrente)) {
        for (const z of [meiaP - ESP_RIPA / 2, -(meiaP - ESP_RIPA / 2)]) {
            tabua(largFrente, ALT_CAIXA, ESP_RIPA, x, yRipa, z);
        }
    }

    // ---- ripas DE PÉ das laterais (correm em z), encaixadas entre as de frente
    const compLado = PROF_CAIXA - 2 * ESP_RIPA;
    const nLado = 5, largLado = 0.098;
    for (const z of centrosDeRipas(compLado, nLado, largLado)) {
        for (const x of [meiaL - ESP_RIPA / 2, -(meiaL - ESP_RIPA / 2)]) {
            tabua(ESP_RIPA, ALT_CAIXA, largLado, x, yRipa, z);
        }
    }

    // ---- aros horizontais por fora (dois níveis): os vãos continuam à mostra
    for (const y of [0.135, 0.345]) {
        for (const z of [meiaP + ARO_ESP / 2, -(meiaP + ARO_ESP / 2)]) {
            tabua(LARG_CAIXA + 2 * ARO_ESP, ARO_ALT, ARO_ESP, 0, y, z);
        }
        for (const x of [meiaL + ARO_ESP / 2, -(meiaL + ARO_ESP / 2)]) {
            tabua(ARO_ESP, ARO_ALT, PROF_CAIXA, x, y, 0);
        }
    }

    // ---- cantoneiras verticais nos quatro cantos, um dedo acima da borda
    for (const x of [meiaL + ARO_ESP / 2, -(meiaL + ARO_ESP / 2)]) {
        for (const z of [meiaP + ARO_ESP / 2, -(meiaP + ARO_ESP / 2)]) {
            tabua(0.075, ALT_CANTO, 0.075, x, 0.028 + ALT_CANTO / 2, z);
        }
    }

    return fundir(pecas);
}

/**
 * A pesca do dia: peixes espalhados em três camadas dentro do engradado, com a
 * última fileira transbordando por cima da borda (é o que se vê de longe).
 */
const PEIXES_DO_CAIXOTE: { p: [number, number, number]; yaw: number; rolagem: number; arfagem: number; escala: number }[] = [
    // ---- camada de baixo, deitados no fundo
    { p: [-0.20, 0.090, -0.14], yaw: 1.62, rolagem: 0.05, arfagem: 0.03, escala: 1.05 },
    { p: [0.19, 0.090, 0.13], yaw: -1.48, rolagem: -0.07, arfagem: -0.04, escala: 1.05 },
    { p: [0.24, 0.092, -0.09], yaw: -0.55, rolagem: 0.10, arfagem: 0.02, escala: 1.0 },
    { p: [-0.05, 0.092, 0.11], yaw: 2.45, rolagem: -0.08, arfagem: -0.03, escala: 1.0 },
    // ---- camada do meio, atravessados
    { p: [-0.18, 0.225, 0.06], yaw: 1.35, rolagem: 0.18, arfagem: 0.05, escala: 1.08 },
    { p: [0.18, 0.230, -0.08], yaw: -1.88, rolagem: -0.22, arfagem: -0.06, escala: 1.08 },
    { p: [0.00, 0.232, 0.15], yaw: 1.92, rolagem: 0.12, arfagem: 0.04, escala: 1.05 },
    { p: [-0.10, 0.235, -0.15], yaw: -1.30, rolagem: -0.16, arfagem: -0.05, escala: 1.05 },
    // ---- perto da borda, já aparecendo por entre as ripas de cima
    { p: [-0.22, 0.360, 0.02], yaw: 1.55, rolagem: 0.26, arfagem: 0.08, escala: 1.1 },
    { p: [0.20, 0.355, 0.07], yaw: -1.42, rolagem: -0.24, arfagem: -0.07, escala: 1.1 },
    { p: [0.02, 0.375, -0.05], yaw: 1.18, rolagem: 0.20, arfagem: 0.10, escala: 1.08 },
    // ---- transbordando por cima da borda
    { p: [-0.06, 0.450, 0.04], yaw: 1.78, rolagem: -0.40, arfagem: 0.06, escala: 1.1 },
    { p: [0.16, 0.462, -0.02], yaw: -1.60, rolagem: 0.36, arfagem: -0.05, escala: 1.1 },
    { p: [-0.18, 0.470, 0.09], yaw: 2.10, rolagem: -0.28, arfagem: 0.04, escala: 1.05 },
];

/** O caixote da vila, cheio de peixes, com madeira de carvalho texturizada. */
const CaixoteDePeixes: React.FC = () => {
    const y = useMemo(() => chaoEm(CESTO.x, CESTO.z) ?? 0, []);
    const geo = useMemo(montarCaixote, []);
    const mat = useMemo(() => {
        const j = pbr('carvalho', 1, 1);
        const m = new THREE.MeshStandardMaterial({
            map: j.map,
            normalMap: j.normalMap,
            roughnessMap: j.roughnessMap,
            color: '#b48c5e',
            roughness: 1,
            metalness: 0,
        });
        m.normalScale = new THREE.Vector2(1.15, 1.15);
        return m;
    }, []);
    useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

    return (
        <group position={[CESTO.x, y, CESTO.z]}>
            <mesh geometry={geo} material={mat} castShadow receiveShadow />
            {PEIXES_DO_CAIXOTE.map((f, i) => (
                <group key={i} position={f.p} scale={f.escala}>
                    <Peixe yaw={f.yaw} rolagem={f.rolagem} arfagem={f.arfagem} />
                </group>
            ))}
        </group>
    );
};

/** O peixe balança na frente da câmera enquanto está na mão do jogador. */
const PeixeNaMao: React.FC<{ camera: THREE.Camera }> = ({ camera }) => {
    const ref = useRef<THREE.Group>(null!);
    const tmp = useMemo(() => new THREE.Vector3(), []);
    useFrame((state) => {
        const g = ref.current;
        const visivel = gatos.peixeNaMao;
        g.visible = visivel;
        if (!visivel) return;
        tmp.set(0.17, -0.24, -0.42).applyQuaternion(camera.quaternion).add(camera.position);
        g.position.copy(tmp);
        g.quaternion.copy(camera.quaternion);
        g.rotateZ(Math.sin(state.clock.elapsedTime * 2.2) * 0.35);
        g.rotateX(Math.sin(state.clock.elapsedTime * 1.3) * 0.2);
    });
    return (
        <group ref={ref} visible={false}>
            <Peixe />
        </group>
    );
};

/* ============================ componente raiz ========================== */

type Jog = React.MutableRefObject<{ x: number; y: number; z: number }>;

/**
 * Não tem mais gato aqui: só o caixote, os peixes caídos e o peixe na mão.
 * O useFrame existe para manter `posJogador` e `jogFrente` atualizados — é
 * disso que gatos.pegar()/oferecer() e as regras dos gatos dependem.
 */
export const GatosDaVila: React.FC<{ jog: Jog }> = ({ jog }) => {
    const camera = useThree((s) => s.camera);
    const [listaPeixes, setListaPeixes] = useState<Peixe[]>([]);
    const visto = useRef(-1);
    const dir = useMemo(() => new THREE.Vector3(), []);

    useEffect(() => {
        reiniciarGatosDaVila();
        return () => { gatos.peixeNaMao = false; };
    }, []);

    useFrame(() => {
        // a API de módulo (gatos.pegar/oferecer) precisa saber onde o jogador está
        posJogador.copy(jog.current);
        camera.getWorldDirection(dir);
        jogFrente.set(dir.x, 0, dir.z);
        if (jogFrente.lengthSq() < 1e-6) jogFrente.set(0, 0, 1);
        else jogFrente.normalize();

        // sincroniza os peixes desenhados só quando a lista muda (fora do loop quente)
        const v = versaoDosPeixes();
        if (visto.current !== v) {
            visto.current = v;
            setListaPeixes(peixesNoChao.slice());
        }
    });

    return (
        <group>
            <CaixoteDePeixes />
            {listaPeixes.map((p) => (
                // p.pos guarda o ponto de apoio no chão: o desenho sobe o peixe
                // até o ventre encostar, para ele não ficar meio enterrado
                <group key={p.id} position={[p.pos.x, p.pos.y + 0.025, p.pos.z]}>
                    <Peixe yaw={p.yaw} rolagem={Math.PI / 2} />
                </group>
            ))}
            <PeixeNaMao camera={camera} />
        </group>
    );
};
