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
import { criarTelaDaGravata } from './f3BocaTextura';
import {
    OLHOS, PISCADA, olhoDoDiabrete, quadroDaPiscada,
    type NomeDoOlho,
} from './f3Olhos';
import {
    SOBRANCELHAS, sobrancelhaDoDiabrete,
    type NomeDaSobrancelha,
} from './f3Sobrancelha';
import {
    BOCAS, MOMENTOS_DA_CARA, aberturaDaBoca, expressaoDoDiabrete,
    type MomentoDoDiabrete, type MomentoExtra, type NomeDaBoca,
} from './f3Boca';
import { createDiabreteSculpt } from './DiabreteSculptedHead';

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

/**
 * `?sempiscar` trava a piscada. SEM ISTO, TODA FOTO DA CARA É UM CHUTE.
 *
 * `?parado` congela a pose, a marcha e as molas — mas não a piscada, que tem
 * relógio próprio de propósito (ver `f3Olhos`). Resultado: duas fotos do MESMO
 * olho `malicia`, com um minuto de diferença, saíram uma como fresta e a outra
 * como olho FECHADO, e eu estava a um passo de "consertar" uma pálpebra que não
 * tinha nada de errado — era uma piscada apanhada no meio.
 *
 * É a terceira vez neste rosto que medir o momento errado quase virou conserto
 * errado. Com o freio, foto de cara passa a ser reproduzível.
 */
function semPiscar(): boolean {
    try { return new URLSearchParams(globalThis.location?.search ?? '').has('sempiscar'); }
    catch { return false; }
}

/**
 * ── AS TRAVAS DE URL PRECISAM MORAR ONDE A CARA MORA ─────────────────────────
 *
 * `?boca=`, `?olho=` e `?cenho=` existem para a bancada poder fotografar UMA
 * forma. E "fixar" quer dizer fixar: `Floor3Rival` reescreve a cara a cada
 * quadro, então sem trava a URL é sobrescrita em milissegundos e as fotos saem
 * todas iguais.
 *
 * Isso já estava resolvido — mas a trava vivia no PINCEL de canvas, e o pincel
 * deixou de dirigir a cara quando ela virou geometria esculpida. A flag ficou de
 * pé, sem fazer nada, e eu tirei seis fotos de bocas diferentes que saíram
 * idênticas e quase concluí que as formas não funcionavam. Flag morta é pior que
 * flag ausente: ela responde.
 *
 * Agora a trava mora aqui, que é por onde toda cara passa.
 */
function daUrlDaCara(chave: string): string | null {
    try { return new URLSearchParams(globalThis.location?.search ?? '').get(chave); }
    catch { return null; }
}

/**
 * `?momento=roubou` trava a cara no MOMENTO do andar, não em três nomes soltos.
 *
 * As travas de `?boca=`/`?olho=`/`?cenho=` servem para olhar uma peça. Mas a
 * pergunta que importa é outra: "que cara ele faz quando rouba o pincel?" — e
 * essa cara é uma TRIPLA, decidida por `expressaoDoDiabrete`, `olhoDoDiabrete` e
 * `sobrancelhaDoDiabrete` a partir do momento e de quantos pincéis já foram.
 *
 * Sem isto, montar uma folha de contato dos dezesseis momentos obrigava a bancada
 * a copiar essa tabela — e tabela copiada envelhece calada, que é exatamente o
 * defeito que já cobrou caro duas vezes neste rosto (a folha do rosto montado, e
 * a trava de URL que morreu quando a cara virou geometria).
 *
 * `?pinceis=N` continua valendo: é ele que muda a cara do mesmo momento.
 */
function pinceisDaUrl(): number {
    const n = Number(daUrlDaCara('pinceis'));
    return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : 0;
}

function momentoDaUrl(): MomentoDoDiabrete | MomentoExtra | null {
    const v = daUrlDaCara('momento');
    return (v && MOMENTOS_DA_CARA.includes(v as MomentoDoDiabrete)) ? (v as MomentoDoDiabrete) : null;
}

// ── Bone indices ──────────────────────────────────────────────────────────────
export const enum B { root, body, head, l_arm, r_arm, l_leg, r_leg }

export interface DiabreteRig {
    group: THREE.Group;          // add to your scene; holds fill + outline
    bones: THREE.Bone[];         // index with B.*
    /** Troca a boca dele. Ver `f3Boca.ts` — o vocabulário é o da ficha do Felipe. */
    definirBoca: (nome: NomeDaBoca) => void;
    /**
     * A cara: olho + sobrancelha, e a piscada por conta própria.
     *
     * `t` é o relógio do personagem. A piscada é involuntária e tem o relógio
     * DELA (ver `f3Olhos`), então quem chama não precisa saber quando ela cai —
     * passa o tempo e pronto.
     */
    definirCara: (olho: NomeDoOlho, cenho: NomeDaSobrancelha, t: number) => void;
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
// A CAIXA TEM A PROPORÇÃO DO CANVAS, e é por isso que ela é 0,218 e não 0,245.
// O desenho nasce num canvas de 192x128 (proporção 1,5) e é esticado para a
// caixa; com a caixa em 0,245 x 0,145 (proporção 1,69) toda boca chegava ao
// rosto 13% mais achatada do que na folha do Felipe — e as folhas dele são de
// bocas ABERTAS, altas. Com 0,218 x 0,145 a proporção fecha e o desenho chega
// como foi desenhado.
// ── A CAIXA CRESCEU E DESCEU, PORQUE A BOLA É O NARIZ ────────────────────────
//
// "a bola preta inteira é o nariz", disse o dono do jogo — e com isso a régua da
// cara (`medir-a-cara.mjs`) diz onde a boca pode existir e onde não pode:
//     olhos ....... 1,000 .. 0,300
//     creme livre . 0,300 .. 0,244   (9 px)
//     O NARIZ ..... 0,244 .. 0,083   (a bola)
//     creme livre . 0,083 .. 0,020   (10 px)
//     corpo ....... abaixo de 0,020
// Dez pixels de cara livre abaixo do nariz, numa cara de 168. Boca que não
// encoste no nariz não cabe ali de frente — mas cabe DE LADO: na altura do
// nariz sobram 155 px de creme contra 36 px de bola.
//
// Por isso a caixa ficou LARGA (a boca atravessa o rosto e passa dos dois lados
// da bola) e BAIXA (o meio dela desce para o queixo). O que passa por baixo do
// nariz é o meio do sorriso; o que sobe pelos lados são as pontas. A bola fica
// aninhada no berço — que é exatamente como ele desenhou na ficha de referência.
// ── E ELA CRESCEU, DEPOIS QUE DEU PARA VER O ROSTO MONTADO ───────────────────
// 0,24 de caixa, com a margem de 0,74 do canvas, dava um sorriso de 0,178 de
// largura num rosto de 0,314 — 57%. Na folha `o-rosto-inteiro.html`, que é a
// primeira coisa deste projeto a mostrar boca, nariz, olho e sobrancelha JUNTOS,
// isso lê como boquinha, não como sorriso de vilão de 1930. E tem a ver com a
// primeira queixa dele, "a boca dele se mexe muito pouco": boca pequena move
// pouco em pixel mesmo quando move muito em proporção.
// 0,29 dá 68% da largura do rosto, e a maior das bocas ainda para 0,03 de régua
// antes do nariz (conferido em `provocando`, que é a que sobe mais).
const BOCA_LARGURA = 0.29;
// A caixa encolheu na ALTURA (0,165 -> 0,145) e desceu um fio. Medido, não
// chutado: com a pose congelada (`?parado`) e a régua da própria cara
// (`bancada-navegador/medir-a-cara.mjs`, 0 no queixo, 1 no alto da cabeça), a
// nareba dele mora em 0,317..0,323 e as bocas grandes — `empolgado` à frente —
// subiam até 0,323 e a engoliam. Com esta caixa a maior delas para antes.
const BOCA_ALTURA = 0.19;   // cresceu junto com a largura, na mesma proporção
// ── A RÉGUA DE VERDADE: 5,8, NÃO 4,02 ────────────────────────────────────────
//
// Aqui morava um erro que custou meia dúzia de rodadas: eu tinha calibrado
// "quanto de cara vale uma unidade do modelo" em 4,02, lendo duas fotos com
// `bocaY` diferente — e li a mancha errada nas duas. O número certo, medido
// varrendo `?bocaY=` com o remendo cobrindo o canvas inteiro e vendo O QUE
// SOME, é 5,8. Por isso a caixa vivia 0,12 abaixo do rosto e o remendo "não
// aparava nada": ele estava no pescoço.
//
// Com a régua certa, a cara do Diabrete em coordenada do modelo:
//     queixo ........ 0,636
//     A BOLA ........ 0,647 .. 0,675   ← o nariz
//     olhos a partir de 0,684
// ── 0,685 CAÍA NO PESCOÇO, E DESTA VEZ ESTÁ MEDIDO DE VERDADE ────────────────
//
// A conta da esfera dizia "terço de baixo do rosto = 0,685". A conta estava
// certa e o número estava errado, porque o ROSTO VISÍVEL não é a esfera inteira:
// a nuca é preta, o queixo acaba onde o pescoço começa, e a perspectiva encolhe
// o de baixo. O que aparece na tela vai de y 0,664 (queixo) a 0,940 (alto).
//
// Calibração nova, e esta é uma VARREDURA, não uma leitura de mancha: mesmo
// olho fotografado com `?olhosY=0.80` e `?olhosY=0.74`, e a régua da própria
// cara (`bancada-navegador/regua-do-rosto.mjs`, 0 no queixo, 1 no alto) mediu
// o desenho descer de 0,4925 para 0,2748. Ou seja
//
//     3,628 de régua por unidade do modelo   (72,5 px para 0,06)
//
// Com ela, a caixa antiga de 0,685 tinha o centro na régua 0,075 — no PESCOÇO.
// Era isso que a foto mostrava: a boca encostada no queixo, misturada com a
// tinta do corpo. Levando o centro do desenho para a régua ~0,24, que é onde a
// cara é larga e creme e onde sobra espaço embaixo do nariz:
// Desceu de 0,731 para 0,716 quando o nariz desceu: com a boca mais larga, a
// mais alta delas (`provocando`) sobe até 0,063 de régua acima do centro, e o
// pé do nariz agora está na régua 0,330. 0,247 de centro deixa 0,020 de creme
// entre as duas — medido, não estimado.
const BOCA_CENTRO_Y = 0.716;

// A gravata desceu do QUEIXO para o pescoço. Ela estava a 0,038 do centro da
// boca, e na foto de perto as duas se encavalavam: metade de toda boca aberta
// sumia atrás do laço. Gravata-borboleta é de colarinho, não de queixo.
// ── A CAIXA DOS OLHOS E DAS SOBRANCELHAS ─────────────────────────────────────
//
// Medida com a mesma régua do resto (`bancada-navegador/medir-a-cara.mjs` sobre
// `?semboca&parado`, 1 no alto da cabeça e 0 no queixo, e a calibração de 5,8
// frações de cara por unidade do modelo):
//     olhos ............ 0,35 .. 0,87 da cara   →  Y 0,693 .. 0,783
//     testa (cenho) .... até ~0,95              →  Y 0,800
// A caixa cobre os dois olhos mais a testa. Ela é SEPARADA da caixa da boca de
// propósito — ver o comentário de `f3OlhosTextura`.
// ── OS NÚMEROS DA FICHA DELE ─────────────────────────────────────────────────
// Medido nas três folhas que ele mandou ("é esse o visual do personagem, não o
// que vc fez"), sobre um rosto que tem 0,314 de largura e 0,275 de altura:
//     cada olho ..... ~38% da largura do rosto  (o meu tinha 24%)
//     os dois juntos  quase se tocam: na fresta entre eles cabe o nariz e nada mais
//     o nariz ....... uma BOLINHA nessa fresta   (o meu tinha o dobro do raio)
//     a sobrancelha . fio fino encostado no olho, sem arco alto
// Eu tinha feito a cara ao contrário: olho pequeno e afastado, nariz grande.
// A caixa alarga de 0,26 para 0,30 porque os olhos, maiores, não cabiam mais.
const OLHOS_LARGURA = 0.30;
// Altura na mesma proporção do canvas (256 x 143), para o pixel continuar
// quadrado: 0,30 * 143/256.
const OLHOS_ALTURA = 0.168;
// Mesma correção da boca, pelo mesmo motivo: com 0,80 o olho desenhado caía na
// régua 0,49 — o meio exato do rosto — e sobrava uma testa enorme e vazia por
// cima enquanto embaixo não cabia nariz nem boca. O olho tem que ficar na régua
// ~0,63, que é onde ele fica num rosto de desenho de cabeça grande.
//
// O valor não é 0,63 traduzido direto porque o canvas não é mais simétrico: o
// olho mora embaixo dele e a testa em cima. Com o olho em y 109 de 172, o CENTRO
// da caixa cai 23 px acima do olho — 0,085 de régua, 0,023 do modelo.
//
// ── E A CALIBRAÇÃO TINHA UM ERRO DE REFERÊNCIA ───────────────────────────────
// A primeira varredura mediu a TINTA do olho `malicia`, que é uma fresta: com
// pálpebra de cima em 0,56 e a de baixo em 0,22, o que sobra visível fica no
// terço de BAIXO da órbita, 0,059 de régua abaixo do centro dela. Eu tratei
// essa mancha como se fosse o meio do olho, e a caixa inteira subiu esse tanto:
// na foto o olho encostava na régua 0,88 e a sobrancelha ia parar em cima da
// linha do cabelo, virando contorno de franja.
//
// A INCLINAÇÃO estava certa (3,63 de régua por unidade, confirmada nas duas
// fotos, e depois pelo nariz, que é um círculo de raio conhecido e caiu na
// régua medida com 0,005 de erro); o ponto de referência é que era outro.
//
// ── E A TESTA É MENOR DO QUE A RÉGUA DIZ ─────────────────────────────────────
// Terceiro erro do mesmo tipo, e vale anotar porque é sutil: a régua chama de
// 1,0 o pixel de creme MAIS ALTO da foto — que é o alto da cúpula do crânio,
// lá no meio. Em cima do OLHO, que é onde a sobrancelha mora, o cabelo desce e
// o creme acaba na régua ~0,946. Eu estava orçando a testa com 0,196 de altura
// quando ela tem 0,105, e por isso a sobrancelha caía dentro da franja mesmo
// depois de dois consertos: só a pontinha de baixo do arco escapava.
//
// Com o olho na régua 0,44..0,78 sobram 0,165 de testa — 45 px de canvas contra
// os 36 que a sobrancelha mais alta precisa:
// E depois DESCEU 0,012. Com o olho no tamanho da ficha, a 0,8345 o topo dele
// encostava na linha do cabelo e a sobrancelha ficava metade dentro da franja —
// lia como contorno do cabelo, não como sobrancelha. Descendo, a testa passa de
// 0,066 para 0,110 de régua e o canvas inteiro fica abaixo da franja.
// O nariz continua onde está: ele ENCAIXA na fresta entre os dois olhos, que é
// exatamente como a ficha o mostra.
const OLHOS_CENTRO_Y = 0.826;

// ── O NARIZ ──────────────────────────────────────────────────────────────────
// Ele era um literal dentro do GLSL, o que é ruim por dois motivos: número solto
// no meio de uma string não aparece em busca, e a folha da bancada precisava
// COPIAR o valor sem nada para conferir a cópia. Agora ele tem nome, e a
// conversão para o texto do shader é feita na hora de montar.
// Régua 0,509 (entre os olhos e a boca) e raio de ~17% da largura do rosto, que
// é a proporção da bola na ficha de referência que ele mandou.

const GRAVATA_Y = 0.55;
const GRAVATA_Z = 0.175;
const GRAVATA_LARGURA = 0.175;

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
interface CaixaPintada { nome: string; textura: THREE.Texture; caixa: THREE.Vector4 }

// ── NÚMERO QUE ENTRA EM GLSL TEM QUE TER PONTO ───────────────────────────────
// Aviso para quem for acrescentar valor no shader daqui de baixo. Em JavaScript
// `${2.0}` vira a string "2", e no GLSL isso escreve `2 * algo` — INTEIRO vezes
// float, erro de tipo em GLSL ES. O programa não compila, o material vai junto e
// a malha não desenha: o Diabrete SUMIU da tela inteiro por causa disso, sobrando
// só a gravata, e o sintoma parece "o modelo não carregou".
// Hoje não há número interpolado aqui — as constantes que havia saíram com a
// cara pintada. Se voltar a haver, escreva `(2).toFixed(1)` ou o literal com
// ponto na string.
function duasCores(corte: number, pinturas: CaixaPintada[] = []) {
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
        // A posterização acima é substituída pela de baixo, que vem DEPOIS da
        // cor por geometria e do desenho. Sempre — inclusive sem pintura
        // nenhuma. Ver a nota de `?semboca&semolhos` logo abaixo.
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
        // ── UMA CAIXA POR PEDAÇO DE CARA ─────────────────────────────────────
        // Duas hoje: a boca e a dupla olhos+sobrancelhas. Separadas de propósito
        // — a boca troca oito vezes por segundo enquanto ele fala e os olhos
        // trocam a cada poucos segundos; num canvas só, cada quadro de fala
        // redesenharia os olhos junto, de graça.
        // ── A TEXTURA DO GLB É RUÍDO, E ERA ELA O DEFEITO O TEMPO TODO ───────
        //
        // O dono do jogo: "tá todo lascada a textura, parece que vc botou ela por
        // cima de uma textura que já existe". Estava, e a textura que já existia
        // não era uma cara: é um PNG de 256x256 saído do gerador 3D por IA —
        // manchas marrons, pretas e vermelhas, sem olho, sem nariz, sem boca.
        // Posterizada em duas cores, ela vira confete aleatório.
        //
        // Isso explica a série inteira de voltas deste rosto. Cada "olho",
        // "nariz" e "boca pintada" que eu medi com régua e defendi com número era
        // uma MANCHA DE RUÍDO que calhava de cair perto do lugar naquele ângulo
        // de câmera. Medir com cuidado a coisa errada dá o mesmo resultado de não
        // medir nada.
        //
        // Então a cara não vem mais da textura. Vem da GEOMETRIA, que é
        // determinística e foi medida no próprio GLB (3433 vértices, caixa
        // x ±0,434 / y 0..1,002 / z ±0,204):
        //
        //     cabeça ... esfera de raio ~0,21 centrada em (0, 0,775, 0)
        //     mãos ..... |x| > 0,33 na faixa y 0,42..0,62
        //     punho .... o anel logo antes da mão
        //     tornozelo  y 0,115..0,155
        //
        // Creme nesses lugares, tinta no resto. Sem confete, e a boca finalmente
        // tem uma cara limpa embaixo dela.
        // ── A RÉGUA ESTAVA MENTINDO ──────────────────────────────────────────
        //
        // Até agora tudo daqui para baixo estava atrás de um `if
        // (!pinturas.length) return;`. Parece inofensivo — sem boca e sem olhos
        // não há o que desenhar — mas a COR POR GEOMETRIA também mora aqui.
        // Resultado: `?semboca&semolhos`, que é justamente a foto que eu tiro
        // para ver a cara PELADA e medir onde as peças caem, saía com o
        // personagem inteiro creme. Sem cabelo, sem chifre preto, sem silhueta.
        // Eu olhei essa foto e concluí "o modelo não tem nariz nenhum".
        //
        // A conclusão pode até ser verdade, mas não era essa foto que provava.
        // É a mesma armadilha da textura de ruído, de novo: o instrumento
        // mostrando uma coisa que não existe. Agora a geometria pinta sempre, e
        // `?semboca&semolhos` mostra o rosto liso de verdade.
        let decl = 'float _claroPorForma(vec3 p, vec3 n) {\n'
            // ── A CARA PINTADA SAIU DAQUI ────────────────────────────────
            //
            // Moravam aqui a máscara de creme, o nariz e o bico de viúva,
            // decididos por posição no fragmento. Eles construíram o rosto
            // durante sete ciclos, e a foto de 3/4 mostrou o limite do método:
            // uma máscara decidida por posição na malha do GLB não tem como
            // acompanhar o crânio, então de qualquer ângulo que não fosse de
            // frente a borda se desfazia.
            //
            // A cabeça esculpida (`DiabreteSculptedHead`) substituiu os três, e
            // com vantagem — ela é geometria curvada SOBRE o crânio. Os que
            // ficavam aqui passaram a ser desenhados escondidos por baixo dela:
            // custo de fragmento em algo que ninguém vê, mais três constantes e
            // um teste guardando uma peça invisível.
            //
            // Sem eles a cabeça do GLB fica preta inteira, que é melhor do que
            // parece: se em algum ângulo ela escapar por trás da escultura, um
            // pedaço de TINTA lê como cabelo, enquanto um pedaço de creme leria
            // como buraco na cara.
            // AS MÃOS e o punho.
            + '  if (abs(p.x) > 0.325 && p.y > 0.40 && p.y < 0.64) return 1.0;\n'
            // O ANEL DO TORNOZELO, que é o que separa a perna do sapato.
            + '  if (p.y > 0.115 && p.y < 0.155) return 1.0;\n'
            + '  return 0.0;\n}\n';
        let corpo = 'diffuseColor.rgb = vec3(_claroPorForma(vLocalPos, normalize(vLocalNor)));\n';
        for (const p of pinturas) {
            shader.uniforms[`u${p.nome}`] = { value: p.textura };
            shader.uniforms[`u${p.nome}Caixa`] = { value: p.caixa };
            decl += `uniform sampler2D u${p.nome};\nuniform vec4 u${p.nome}Caixa;\n`;
            corpo += `{\n`
                // uXCaixa = (x0, y0, largura, altura) em coordenada local.
                + `  vec2 _b = (vLocalPos.xy - u${p.nome}Caixa.xy) / u${p.nome}Caixa.zw;\n`
                + '  _b.y = 1.0 - _b.y;\n'
                // Só na FRENTE da cabeça: sem isto o desenho apareceria
                // espelhado na nuca.
                + '  if (_b.x > 0.0 && _b.x < 1.0 && _b.y > 0.0 && _b.y < 1.0 && vLocalNor.z > 0.25) {\n'
                + `    vec4 _m = texture2D(u${p.nome}, _b);\n`
                + '    float _ml = dot(_m.rgb, vec3(0.299, 0.587, 0.114));\n'
                // ALFA DURO: a borda antisserrilhada caía bem no limiar da
                // posterização e desenhava um anel pontilhado em volta do
                // desenho. `step` corta isso — dentro ou fora, sem meio-termo.
                + '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(step(0.5, _ml)), step(0.5, _m.a));\n'
                + '  }\n}\n';
        }
        shader.vertexShader = shader.vertexShader
            .replace('void main() {', 'varying vec3 vLocalPos;\nvarying vec3 vLocalNor;\nvoid main() {')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLocalPos = transformed;')
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n\tvLocalNor = objectNormal;');
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {',
                decl + 'varying vec3 vLocalPos;\nvarying vec3 vLocalNor;\nvoid main() {')
            .replace('#include <opaque_fragment>',
                // O DESENHO ENTRA ANTES DA POSTERIZAÇÃO, na `diffuseColor`, e
                // não depois na cor final. Escrever a cor final direto
                // funcionava, mas apagava o sombreado do rosto naquele pedaço —
                // na foto aparecia um anel creme em volta da boca, como um
                // curativo. Empurrando a LUMINÂNCIA da textura, o desenho passa
                // pela mesma posterização e pela mesma luz que o resto da cara.
                corpo
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

    // The GLB's head carried the old photographic decals. Keep the body/limbs
    // for their existing seven-bone rig, but remove triangles whose painted
    // weights belong to B.head; the sculpted head owns the whole face now.
    // De-index first so the retained triangle index list is independent of GLB
    // index layout and all non-position attributes remain aligned.
    const fillGeo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const { joints, weights } = paintWeights(fillGeo.attributes.position.array as Float32Array);
    // Skin weights blend through the jaw; replacement must remove geometry, not just
    // vertices dominated by the head bone. The collar and arms remain below this cut.
    const isLegacyHeadVertex = (vertex: number) => fillGeo.attributes.position.getY(vertex) >= 0.61;
    const kept: number[] = [];
    const vertexCount = fillGeo.attributes.position.count;
    for (let vertex = 0; vertex + 2 < vertexCount; vertex += 3) {
        // Drop a whole triangle as soon as any corner belongs to the head;
        // otherwise a mixed boundary triangle leaves a sliver of the legacy
        // face poking through the procedural mask.
        if (!isLegacyHeadVertex(vertex) && !isLegacyHeadVertex(vertex + 1)
            && !isLegacyHeadVertex(vertex + 2)) {
            kept.push(vertex, vertex + 1, vertex + 2);
        }
    }
    fillGeo.setIndex(kept);
    fillGeo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(joints, 4));
    fillGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    fillGeo.computeVertexNormals();

    const srcMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    // Keep the source map for the retained body triangles (gloves, shoes and
    // tie details depend on it). The old face decals are gone with the head
    // triangles above; dropping the entire map would erase body materials too.
    const fillMat = new THREE.MeshToonMaterial({
        map: srcMat.map ?? null,
        color: srcMat.color?.clone() ?? new THREE.Color(0xffffff),
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
    // The face is now supplied by the sculpted head; no retained GLB face
    // triangle can carry a photographic eye or mouth decal into the render.
    const pinturas: CaixaPintada[] = [];
    fillMat.onBeforeCompile = duasCores(corteDoDiabrete(), pinturas);
    // A chave conta QUANTAS caixas o programa tem: com e sem olhos são shaders
    // diferentes, e compartilhar o programa entre eles daria uniform faltando.
    fillMat.customProgramCacheKey = () => `diabrete-duas-cores-${pinturas.map(p => p.nome).join('-')}`;

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
    // The replacement face is authored in normalized head space (skull radius
    // ~1.0); the GLB skull is ±0.205 in model space. Keep only an empty anchor
    // under the head bone: putting renderable meshes in the skeleton hierarchy
    // can make Three's skinning traversal unstable. The sculpt is rendered as
    // a sibling and copied into the rig's local space immediately before draw.
    const sculpt = createDiabreteSculpt({ neck: true });
    const headAnchor = new THREE.Object3D();
    headAnchor.name = 'diabrete-head-anchor';
    bones[B.head].add(headAnchor);
    const group = new THREE.Group();
    group.add(fill);
    group.add(sculpt.group);

    const sculptScale = 0.205;
    const parentInverse = new THREE.Matrix4();
    const localHead = new THREE.Matrix4();
    const localPosition = new THREE.Vector3();
    const localQuaternion = new THREE.Quaternion();
    const localScale = new THREE.Vector3();
    let syncedFrame = -1;
    const syncSculpt = (renderer?: THREE.WebGLRenderer) => {
        // Floor3Rival/FallCutscene call definirCara before writing this frame's
        // pose. Sync from a mesh onBeforeRender so the bone matrices are final,
        // while avoiding any renderable child under B.head.
        const frame = renderer?.info.render.frame ?? -1;
        if (frame >= 0 && frame === syncedFrame) return;
        syncedFrame = frame;
        headAnchor.updateWorldMatrix(true, false);
        group.updateWorldMatrix(true, false);
        parentInverse.copy(group.matrixWorld).invert();
        localHead.multiplyMatrices(parentInverse, headAnchor.matrixWorld);
        localHead.decompose(localPosition, localQuaternion, localScale);
        localScale.multiplyScalar(sculptScale);
        sculpt.group.matrix.compose(localPosition, localQuaternion, localScale);
        sculpt.group.matrixAutoUpdate = false;
        // The renderer has already traversed this sibling before invoking its
        // onBeforeRender hook, so propagate the new local matrix immediately;
        // otherwise this frame would draw at the previous head pose.
        sculpt.group.updateMatrixWorld(true);
    };
    let hooked = false;
    sculpt.group.traverse((object) => {
        if (hooked || !(object as THREE.Mesh).isMesh) return;
        (object as THREE.Mesh).onBeforeRender = (renderer) => syncSculpt(renderer);
        hooked = true;
    });

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
        definirCara: (olho: NomeDoOlho, cenho: NomeDaSobrancelha, t: number) => {
            const m = momentoDaUrl();
            const travaOlho = m ? olhoDoDiabrete(m, pinceisDaUrl()) : daUrlDaCara('olho');
            const travaCenho = m ? sobrancelhaDoDiabrete(m, pinceisDaUrl()) : daUrlDaCara('cenho');
            if (travaOlho && travaOlho in OLHOS) olho = travaOlho as NomeDoOlho;
            if (travaCenho && travaCenho in SOBRANCELHAS) cenho = travaCenho as NomeDaSobrancelha;
            sculpt.setExpression(olho, cenho);
            const q = semPiscar() ? -1 : quadroDaPiscada(t);
            sculpt.setBlink(olho === 'fechadoSorrindo'
                ? 1
                : q < 0 ? 0 : PISCADA[Math.min(PISCADA.length - 1, q)]);
            // Current callers invoke this before writing the pose. If a caller
            // moves it after the pose, this same call is already sufficient;
            // the render hook remains a compatibility fallback for old order.
            syncSculpt();
        },
        definirBoca: (nome: NomeDaBoca) => {
            const m = momentoDaUrl();
            const travada = m ? expressaoDoDiabrete(m, pinceisDaUrl()) : daUrlDaCara('boca');
            const usar = (travada && travada in BOCAS ? travada : nome) as NomeDaBoca;
            sculpt.setMouth(aberturaDaBoca(usar), usar);
        },
        dispose: () => {
            sculpt.dispose();
            skeleton.dispose();
            fillGeo.dispose();
            fillMat.dispose();
            gravataMesh?.geometry.dispose();
            (gravataMesh?.material as THREE.Material | undefined)?.dispose();
            texGravata?.dispose();
        },
    };
}
