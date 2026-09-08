/**
 * diabreteRig.ts — builds a procedural skeleton for the rig-less Diabrete GLB
 * and binds two SkinnedMeshes (toon fill + inverted-hull ink outline) to it.
 *
 * The GLB ships with NO bones and NO animations, so the whole rig is
 * synthesised here from the raw vertex cloud. Spatial analysis of the mesh
 * (bbox X ±0.43, Y 0→1.0, Z ±0.20) revealed the pose:
 *
 *     Y 0.85–0.97  head            (centred)
 *     Y 0.60–0.80  torso/shoulders (widening)
 *     Y 0.47–0.60  ARMS held OUT sideways (a wide horizontal bar reaching the
 *                  full ±0.43 width — hands at the outer edges)
 *     Y 0.41–0.47  waist           (narrow)
 *     Y 0.00–0.40  two legs        (split left/right with a gap at x≈0)
 *
 * Weight painting therefore puts the arms in an OUTER-X band at mid height,
 * the legs in a bilateral lower band, the head up top, and the torso in the
 * central column — all with smooth cubic falloffs so the skin flows instead of
 * tearing at zone borders.
 */

import * as THREE from 'three';
import { criarTelaDaBoca, criarTelaDaGravata, type TelaDaBoca } from './f3BocaTextura';
import { BOCA_EM_REPOUSO, BOCAS as BOCAS_VALIDAS, type NomeDaBoca } from './f3Boca';

// Shared visual scale — the raw model is only ~1m tall, which read as a tiny
// doll on the platforms (and barely filled the cutscene frame). Bumped so the
// devil stands a head TALLER than the player and actually reads as a threat.
export const DIABRETE_SCALE = 2.2;

/** As duas cores do Diabrete. Preto de tinta e o branco das luvas e dos olhos. */
export const DIABRETE_ESCURO = '#141014';
export const DIABRETE_CLARO = '#f7f3ea';
/**
 * Onde o brilho da textura vira branco. Sai de varrer valores e OLHAR — a
 * textura e fotografica e nao ha como adivinhar o histograma dela. `?dc=`
 * afina sem recompilar, do mesmo jeito que o `?lc=` das luvas do jogador.
 */
export const DIABRETE_CORTE = 0.30;
export function corteDoDiabrete(): number {
    try {
        const q = new URLSearchParams(globalThis.location?.search ?? '');
        const v = q.has('dc') ? parseFloat(q.get('dc')!) : NaN;
        return Number.isFinite(v) ? v : DIABRETE_CORTE;
    } catch { return DIABRETE_CORTE; }
}

// ── Bone indices ──────────────────────────────────────────────────────────────
export const enum B { root, body, head, l_arm, r_arm, l_leg, r_leg }

export interface DiabreteRig {
    group: THREE.Group;          // add to your scene; holds fill + outline
    bones: THREE.Bone[];         // index with B.*
    /** Troca a boca dele. Ver `f3Boca.ts` — o vocabulário é o da ficha do Felipe. */
    definirBoca: (nome: NomeDaBoca) => void;
    dispose: () => void;
}

// ── ONDE FICA A BOCA ─────────────────────────────────────────────────────────
//
// Medido no GLB, não chutado (a sonda leu o acessor de POSITION direto do
// contêiner). A cabeça vai de Y 0,75 a 1,00 com largura ±0,20, e a frente da
// cara, na linha do meio, está em Z = 0,162 na faixa Y 0,80–0,85 — acima disso
// ela já começa a fugir para trás (Z = 0,069 em Y 0,95, que é o alto do crânio).
//
// A boca de um vilão desses fica na parte de baixo da cara, abaixo dos olhos
// grandes. Então: Y 0,815 e Z um fio à frente da malha, para o desenho não
// brigar com a superfície (z-fighting).
//
// A PRIMEIRA TENTATIVA FOI EM Y=0,815 E SAIU NA TESTA. A faixa 0,85–0,95 que o
// texto do rig chama de "head" é o CRÂNIO inteiro, com chifre e orelha; a cara
// branca desce bem mais. A foto de perto (bancada `ver-o-diabrete.mjs`, vista
// `boca`) mostrou o desenho novo pousado acima dos olhos, e a boca pintada da
// textura lá embaixo, a uns 22% da altura da cabeça de distância.
// Y=0,63 caiu no peito e Y=0,68 encostou na boca pintada por cima. Com dois
// pontos medidos na mesma foto a escala saiu: 2324 px de imagem por unidade do
// modelo, naquele enquadramento. O alvo fica em 0,665.
// Terceira medição: em 0,665 ela escorreu pro queixo (o remendo creme vazando
// no corpo preto) e em 0,68 ficou logo acima da boca pintada. O meio-termo
// medido nas duas fotos é 0,672. A largura desceu de 0,15 para 0,115 porque a
// 0,15 ela tomava a cara inteira — a boca dele na ficha é pequena e fica no
// terço de baixo do rosto.
// ── A CAIXA DA BOCA, EM COORDENADA LOCAL ─────────────────────────────────────
//
// O dono do jogo jogou e disse que a boca estava "quase no nariz". Estava mesmo:
// o centro ficava em Y=0,672 e a cara branca desce bem mais do que eu supunha.
// A sonda que leu o GLB direto (`ferramentas/uv-da-cara.mjs` mede o UV; a que
// mediu a geometria mostrou a frente do rosto em Z≈0,20 na faixa Y 0,60–0,70)
// põe a boca no TERÇO DE BAIXO da cara, e é para lá que ela vai.
//
// A caixa é (x0, y0, largura, altura). Centrada em x, e a altura escolhida para
// o desenho não vazar no queixo nem subir para os olhos.
// Primeira caixa (0,185 x 0,125) deixou as quatro formas quase idênticas na
// foto: nesse tamanho os contornos grossos fecham o desenho e todo mundo vira um
// risco escuro. Na ficha dele as bocas abertas ocupam quase metade da largura da
// cara — que aqui tem ~0,40 de largura.
const BOCA_LARGURA = 0.245;
// A caixa encolheu na ALTURA (0,165 -> 0,145) e desceu um fio. Medido, não
// chutado: com a pose congelada (`?parado`) e a régua da própria cara
// (`bancada-navegador/medir-a-cara.mjs`, 0 no queixo, 1 no alto da cabeça), a
// nareba dele mora em 0,317..0,323 e as bocas grandes — `empolgado` à frente —
// subiam até 0,323 e a engoliam. Com esta caixa a maior delas para antes.
const BOCA_ALTURA = 0.145;
const BOCA_CENTRO_Y = 0.632;

// A gravata desceu do QUEIXO para o pescoço. Ela estava a 0,038 do centro da
// boca, e na foto de perto as duas se encavalavam: metade de toda boca aberta
// sumia atrás do laço. Gravata-borboleta é de colarinho, não de queixo.
const GRAVATA_Y = 0.55;
const GRAVATA_Z = 0.175;
const GRAVATA_LARGURA = 0.175;

/**
 * `?boca=empolgado` fixa uma forma, para a bancada fotografar a ficha inteira.
 *
 * E FIXAR quer dizer fixar: `Floor3Rival` reescreve a boca a cada desenho, então
 * sem trava a URL era sobrescrita em milissegundos e as fotos das dezoito formas
 * saíam todas iguais — o que me fez caçar um defeito de projeção que não existia.
 */
function bocaDaUrl(): NomeDaBoca | null {
    try {
        const v = new URLSearchParams(globalThis.location?.search ?? '').get('boca');
        return (v && v in BOCAS_VALIDAS) ? (v as NomeDaBoca) : null;
    } catch { return null; }
}

function ajusteDaBoca(): { y: number; l: number } {
    const padrao = { y: BOCA_CENTRO_Y, l: BOCA_LARGURA };
    try {
        const q = new URLSearchParams(globalThis.location?.search ?? '');
        const n = (k: string, v: number) => {
            const x = q.has(k) ? parseFloat(q.get(k)!) : NaN;
            return Number.isFinite(x) ? x : v;
        };
        return { y: n('bocaY', padrao.y), l: n('bocaL', padrao.l) };
    } catch { return padrao; }
}

// Rest positions (model-local, feet at Y=0) derived from the vertex analysis.
const BP: ReadonlyArray<readonly [number, number, number]> = [
    [0,     0.00, 0],   // root
    [0,     0.46, 0],   // body  — waist pivot
    [0,     0.84, 0],   // head
    [-0.22, 0.55, 0],   // l_arm — left shoulder (arm extends out to x≈-0.43)
    [ 0.22, 0.55, 0],   // r_arm — right shoulder
    [-0.10, 0.33, 0],   // l_leg — left hip
    [ 0.10, 0.33, 0],   // r_leg — right hip
];
const BPARENT = [-1, 0, 1, 1, 1, 1, 1] as const;
const BNAME   = ['root', 'body', 'head', 'l_arm', 'r_arm', 'l_leg', 'r_leg'] as const;

function ss(v: number, lo: number, hi: number): number {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
}

// ── Weight painting ───────────────────────────────────────────────────────────
function paintWeights(pos: Float32Array): { joints: Uint16Array; weights: Float32Array } {
    const N = pos.length / 3;
    const J = new Uint16Array(N * 4);
    const W = new Float32Array(N * 4);

    for (let i = 0; i < N; i++) {
        const x = pos[i * 3];
        const y = pos[i * 3 + 1];
        const s = new Float32Array(7);

        // HEAD — top of the model.
        s[B.head] = ss(y, 0.74, 0.84);

        // ARMS — the wide horizontal bar at mid height, OUTER X only. The hands
        // sit at ±0.43, the shoulders meet the torso near ±0.22, so the band
        // ramps in from |x|=0.22 outward and lives in Y 0.43–0.62.
        const armY = ss(y, 0.42, 0.49) * (1 - ss(y, 0.60, 0.68));
        s[B.l_arm] = armY * ss(-x, 0.22, 0.30);   // left  (x < 0)
        s[B.r_arm] = armY * ss( x, 0.22, 0.30);   // right (x > 0)

        // LEGS — lower half, split by X sign (+0.04 bias avoids a seam at x=0).
        const legBand = 1 - ss(y, 0.40, 0.52);
        s[B.l_leg] = legBand * ss(0.04 - x, 0.0, 0.12);
        s[B.r_leg] = legBand * ss(0.04 + x, 0.0, 0.12);

        // BODY — central torso column, whatever the limbs/head didn't claim.
        const claimed = s[B.l_arm] + s[B.r_arm] + s[B.l_leg] + s[B.r_leg] + s[B.head];
        s[B.body] = Math.max(0.05,
            ss(y, 0.33, 0.50) * (1 - ss(y, 0.66, 0.80)) * (1 - claimed));

        // ROOT — tiny constant so no vertex is ever fully unweighted.
        s[B.root] = 0.01;

        const rank = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => s[b] - s[a]);
        let total = 0;
        for (let k = 0; k < 4; k++) total += s[rank[k]];
        if (total < 1e-8) total = 1;
        for (let k = 0; k < 4; k++) {
            J[i * 4 + k] = rank[k];
            W[i * 4 + k] = s[rank[k]] / total;
        }
    }
    return { joints: J, weights: W };
}

// 3-band toon gradient for the fill cel-ramp.
const _grad = (() => {
    const d = new Uint8Array([230, 220, 200, 190, 178, 155, 140, 128, 106, 90, 80, 65]);
    const t = new THREE.DataTexture(d, 4, 1, THREE.RGBFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
})();

/**
 * Build the rig from a loaded GLTF scene. Returns a group containing the bound
 * fill + outline SkinnedMeshes and the bone array to animate. `null` if no mesh
 * was found.
 */
/**
 * A injeção de DUAS CORES, isolada para a cara e a boca usarem a MESMA.
 *
 * Foi preciso separar quando a boca ganhou remendo: o plano da boca era
 * `MeshBasicMaterial`, que não recebe luz, então o creme dele saía chapado e
 * brilhante contra o creme SOMBREADO da cara — na foto de perto aparecia uma
 * elipse mais clara no meio do rosto, como um curativo. Rodando pela mesma
 * posterização, o creme do remendo vira exatamente `DIABRETE_CLARO` e a tinta
 * vira `DIABRETE_ESCURO`, iguais aos do rosto, sob a mesma luz.
 */
function duasCores(corte: number, boca?: { textura: THREE.Texture; caixa: THREE.Vector4 }) {
    return (shader: THREE.WebGLProgramParametersWithUniforms) => {
        if (!shader.fragmentShader.includes('#include <opaque_fragment>')) return;
        shader.uniforms.uClaro  = { value: new THREE.Color(DIABRETE_CLARO) };
        shader.uniforms.uEscuro = { value: new THREE.Color(DIABRETE_ESCURO) };
        shader.uniforms.uCorte  = { value: corte };
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {',
                'uniform vec3 uClaro;\nuniform vec3 uEscuro;\nuniform float uCorte;\nvoid main() {')
            .replace('#include <opaque_fragment>',
                'float _lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n'
                + 'outgoingLight = mix(uEscuro, uClaro, smoothstep(uCorte - 0.05, uCorte + 0.05, _lum));\n'
                + '#include <opaque_fragment>');
        if (!boca) return;
        // Com boca, a posterização acontece DEPOIS dela — desfaz a de cima.
        shader.fragmentShader = shader.fragmentShader.replace(
            'float _lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n'
            + 'outgoingLight = mix(uEscuro, uClaro, smoothstep(uCorte - 0.05, uCorte + 0.05, _lum));\n', '');

        // ── A BOCA É A PRÓPRIA CARA ──────────────────────────────────────────
        //
        // Ela era um PLANO pousado na frente do rosto, e o dono do jogo jogou e
        // disse: "a boca está completamente desencaixada… além dela estar quase
        // no nariz, tente criar um jeito de fixar ela em algum lugar" — e
        // sugeriu que a troca de fala fosse "somente uma mudança de textura,
        // assim pode economizar memória, e ser muito mais fácil de animar por
        // conta que vai ser um objeto fixo".
        //
        // Ele está certo, e dá para ir além do que ele pediu: em vez de um
        // objeto fixo POUSADO na cara, a boca é PINTADA NA CARA, aqui no
        // fragmento. Cada pixel do rosto pergunta "eu caio dentro da caixa da
        // boca?" e, se cair, o desenho entra por cima.
        //
        // Por que isso resolve "desencaixada": a caixa é medida na POSIÇÃO LOCAL
        // do vértice, antes do skinning (`transformed` logo depois de
        // `begin_vertex`). Ou seja, ela está tatuada na malha em pose de
        // descanso — a cabeça pode girar, inclinar, a pele pode deformar, e a
        // boca vai junto porque ela É a pele. Não há offset para errar.
        //
        // Custo: zero draw call, zero geometria, uma textura. Trocar de boca é
        // trocar a textura, exatamente como ele pediu.
        //
        // Os UVs deste modelo NÃO serviriam para isto (medido: a boca cai em
        // u 0,05–0,60, em cima dos olhos), por isso a caixa é em espaço local e
        // não em espaço de textura.
        shader.uniforms.uBoca = { value: boca.textura };
        shader.uniforms.uBocaCaixa = { value: boca.caixa };
        shader.vertexShader = shader.vertexShader
            .replace('void main() {', 'varying vec3 vLocalPos;\nvarying vec3 vLocalNor;\nvoid main() {')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLocalPos = transformed;')
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tvLocalNor = objectNormal;');
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {',
                'uniform sampler2D uBoca;\nuniform vec4 uBocaCaixa;\n'
                + 'varying vec3 vLocalPos;\nvarying vec3 vLocalNor;\nvoid main() {')
            .replace('#include <opaque_fragment>',
                // uBocaCaixa = (x0, y0, largura, altura) em coordenada local.
                // A BOCA ENTRA ANTES DA POSTERIZAÇÃO, na `diffuseColor`, e não
                // depois na cor final. Escrever a cor final direto funcionava,
                // mas apagava o sombreado do rosto naquele pedaço — e na foto
                // aparecia um anel creme em volta da boca, como um curativo.
                // Empurrando a LUMINÂNCIA da textura (branco onde é pele, preto
                // onde é traço), a boca passa pela mesma posterização e pela
                // mesma luz que o resto da cara, e a emenda deixa de existir.
                'vec2 _b = (vLocalPos.xy - uBocaCaixa.xy) / uBocaCaixa.zw;\n'
                + '_b.y = 1.0 - _b.y;\n'
                // Só na FRENTE da cabeça: sem isto ela apareceria espelhada na
                // nuca. O limiar era 0,25 e ACHATAVA a boca: a cara é curva, e
                // acima e abaixo da linha média a normal cai abaixo de 0,25 —
                // sobrava uma faixa horizontal, e as dezoito formas viravam a
                // mesma barra escura. 0,02 mantém a nuca fora e devolve a altura.
                + 'if (_b.x > 0.0 && _b.x < 1.0 && _b.y > 0.0 && _b.y < 1.0 && vLocalNor.z > 0.25) {\n'
                + '  vec4 _m = texture2D(uBoca, _b);\n'
                + '  float _ml = dot(_m.rgb, vec3(0.299, 0.587, 0.114));\n'
                // ALFA DURO: a borda antisserrilhada do remendo caía bem no
                // limiar da posterização e desenhava um anel pontilhado em volta
                // da boca. `step` corta isso — dentro ou fora, sem meio-termo.
                + '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(step(0.5, _ml)), step(0.5, _m.a));\n'
                + '}\n'
                + 'float _lum2 = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n'
                + 'outgoingLight = mix(uEscuro, uClaro, smoothstep(uCorte - 0.05, uCorte + 0.05, _lum2));\n'
                + '#include <opaque_fragment>');
    };
}

export function buildDiabreteRig(gltf: THREE.Object3D): DiabreteRig | null {
    let src: THREE.Mesh | null = null;
    gltf.traverse((o) => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
    if (!src) return null;
    const mesh = src as THREE.Mesh;

    const fillGeo = mesh.geometry.clone();
    const { joints, weights } = paintWeights(fillGeo.attributes.position.array as Float32Array);
    fillGeo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(joints, 4));
    fillGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    fillGeo.computeVertexNormals();

    const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const fillMat = new THREE.MeshToonMaterial({
        map: srcMat?.map ?? null,
        color: srcMat?.map ? 0xffffff : 0xf2e8d0,
        gradientMap: _grad,
    });
    // ── DUAS CORES, COMO TODO VILAO DE 1930 ───────────────────────────────
    //
    // Ele saia um BORRAO PRETO. A foto de perto (bancada, vista `diabo`) conta
    // por que: a textura do GLB e fotografica — o modelo veio de geracao por IA,
    // igual as luvas do jogador — e num grade de alto contraste o corpo inteiro
    // desaba para o mesmo preto. Sobrava so um cinza nas maos e nos pes, que de
    // longe lia como sujeira, nao como luva.
    //
    // A referencia resolve isso ha noventa anos: o vilao e uma SILHUETA preta
    // com luva branca e olho branco. Entao o material posteriza em duas cores
    // pelo brilho da textura — o que era claro (luvas, sapatos, olhos) vira
    // branco, o resto vira tinta. De quebra, some com o sombreado fotografico
    // que fazia ele parecer de outro renderizador.
    //
    // POR QUE onBeforeCompile E NAO ShaderMaterial: um material cru congelaria
    // o rig, porque perderia o SKINNING que o MeshToonMaterial ja traz pronto.
    // A injecao e guardada: se o chunk esperado nao existir (three mudou por
    // dentro), ela nao acontece e o material continua um toon normal, em vez de
    // embarcar um shader quebrado.
    // `?semboca` desliga a boca inteira. Serve para MEDIR: com e sem, lado a
    // lado no mesmo enquadramento, dá para ver exatamente que pedaço do rosto o
    // remendo está cobrindo — foi assim que o nariz apareceu.
    const semBoca = (() => {
        try { return new URLSearchParams(globalThis.location?.search ?? '').has('semboca'); }
        catch { return false; }
    })();
    const bocaFixa = bocaDaUrl();
    const tela = semBoca ? null : criarTelaDaBoca(bocaFixa ?? BOCA_EM_REPOUSO);
    const aj = ajusteDaBoca();
    const alturaCaixa = aj.l * (BOCA_ALTURA / BOCA_LARGURA);
    const caixaDaBoca = new THREE.Vector4(-aj.l / 2, aj.y - alturaCaixa / 2, aj.l, alturaCaixa);
    fillMat.onBeforeCompile = duasCores(corteDoDiabrete(),
        tela ? { textura: tela.textura, caixa: caixaDaBoca } : undefined);
    // Distinct cache key so the patched program isn't shared with a plain toon.
    fillMat.customProgramCacheKey = () => 'diabrete-duas-cores-com-boca';

    // Bones (parented hierarchy, local offsets from parent rest position).
    const bones: THREE.Bone[] = BNAME.map((name) => { const b = new THREE.Bone(); b.name = name; return b; });
    bones.forEach((bone, i) => {
        const pi = BPARENT[i];
        if (pi >= 0) {
            bones[pi].add(bone);
            bone.position.set(BP[i][0] - BP[pi][0], BP[i][1] - BP[pi][1], BP[i][2] - BP[pi][2]);
        } else {
            bone.position.set(...BP[i]);
        }
    });

    const skeleton = new THREE.Skeleton(bones);

    const fill = new THREE.SkinnedMesh(fillGeo, fillMat);
    fill.castShadow = true;
    fill.frustumCulled = false;
    fill.add(bones[0]);
    fill.bind(skeleton);

    // NOTE: no ink outline on the Diabrete. The inverted-hull read as torn black
    // streaks on his split-vertex GLB mesh; the toon fill + fresnel rim carry his
    // silhouette instead. (The scenery + player hands keep their own outlines via
    // cartoonToon.ts — those are clean primitives and are untouched.)
    const group = new THREE.Group();
    group.add(fill);

    // A BOCA não é mais um objeto: ela é pintada no shader da cara (ver
    // `duasCores`). O que sobrou aqui é a textura e a caixa onde ela cai.
    // ── A GRAVATA ────────────────────────────────────────────────────────────
    // Ver `desenharGravata`: é o único ponto de cor do personagem, e por isso
    // NÃO passa pela posterização de duas cores — se passasse, o vinho da ficha
    // viraria preto e a terceira cor da paleta continuaria não existindo.
    // Fica no osso do CORPO, não no da cabeça: gravata não balança com a cara.
    const texGravata = criarTelaDaGravata();
    let gravataMesh: THREE.Mesh | null = null;
    if (texGravata) {
        const g = new THREE.PlaneGeometry(GRAVATA_LARGURA, GRAVATA_LARGURA * 0.6);
        const m = new THREE.MeshToonMaterial({
            map: texGravata, gradientMap: _grad, transparent: true, alphaTest: 0.4,
            depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        });
        gravataMesh = new THREE.Mesh(g, m);
        gravataMesh.frustumCulled = false;
        gravataMesh.position.set(0, GRAVATA_Y - BP[B.body][1], GRAVATA_Z);
        bones[B.body].add(gravataMesh);
    }

    return {
        group,
        bones,
        definirBoca: (nome: NomeDaBoca) => {
            if (bocaFixa) return;   // ver `bocaDaUrl`
            // DEV-ONLY: a bancada precisa da SEQUÊNCIA, não de uma pose. Uma foto
            // mostra que a boca existe; só a sequência mostra que ela SINCRONIZA
            // — que alterna nota a nota, que cai no acento e que volta ao
            // repouso quando a fala acaba.
            if (import.meta.env?.DEV && typeof window !== 'undefined' && tela && tela.atual() !== nome) {
                const w = window as unknown as { __f3BocaLog?: { t: number; boca: string }[] };
                (w.__f3BocaLog ??= []).push({ t: +performance.now().toFixed(0), boca: nome });
                if (w.__f3BocaLog.length > 400) w.__f3BocaLog.shift();
            }
            tela?.definir(nome);
        },
        dispose: () => {
            skeleton.dispose();
            fillGeo.dispose();
            fillMat.dispose();
            gravataMesh?.geometry.dispose();
            (gravataMesh?.material as THREE.Material | undefined)?.dispose();
            texGravata?.dispose();
            tela?.dispose();
        },
    };
}
