/**
 * f3BocaTextura.ts — desenha uma boca de `f3Boca` num canvas.
 *
 * As formas vêm de `f3Boca.ts`, que é puro e testado. Aqui é só o pincel: um
 * canvas pequeno, redesenhado SÓ quando a forma muda (no máximo 8 vezes por
 * segundo, e quase sempre muito menos). Uma textura para o personagem inteiro,
 * não dezoito — o celular do Felipe não precisa carregar um atlas de bocas.
 *
 * Por que canvas e não geometria: a ficha dele pede traço de tinta com
 * espessura, dente e língua. Isso é desenho, e canvas desenha; fazer o mesmo com
 * malha custaria dezenas de triângulos por boca e ainda ficaria duro.
 */

import * as THREE from 'three';
import { BOCAS, type Forma, type NomeDaBoca } from './f3Boca';

const LARG = 192;
const ALT = 128;

// ── A FENDA DA CARA É 6:1, E AS BOCAS DA FICHA SÃO 2:1 ───────────────────────
//
// Medido (`medir-a-cara.mjs` sobre `?semboca&parado`), na régua da própria cara
// — 1 no alto da cabeça, 0 no queixo:
//     olhos ........ 1,000 .. 0,300
//     A BOLA ....... 0,244 .. 0,083     ← o nariz, palavra do dono do jogo
//     queixo ....... 0,020
// Sobram dez pixels de cara livre abaixo da bola, numa cara de 168. As bocas das
// fichas dele têm proporção ~2:1; a fenda tem 14:1. Elas não cabem — erram por
// um fator de cinco.
//
// A decisão foi dele, e foi APARAR A BOLA POR BAIXO: o remendo creme cobre a
// metade de baixo dela, o nariz continua uma bola preta no mesmo lugar, só
// menor, e a boca ganha o vão. Aqui embaixo estão as duas coisas que isso exige.
//
// PRIMEIRA: o eixo y ganha `GANHO_Y`. A boca ocupa uma fatia larga e baixa do
// rosto, então o desenho é esticado na horizontal de propósito — mais chato que
// na folha dele, e é o preço de caber. (A versão anterior era isotrópica e o
// desenho saía do tamanho de uma unha.)
const MARGEM = 0.74;
const GANHO_Y = 1.15;

// SEGUNDA: o y=0 do desenho não cai no meio do canvas, cai mais para baixo — a
// metade de cima do canvas é o pedaço da bola que FICA, e a de baixo é onde a
// boca mora.
const BOCA_MEIO = 72;

// O que o remendo creme cobre, em pixel de canvas: da metade da bola (44) até
// pouco antes do queixo (108). Não pode passar de 108: abaixo disso é pescoço, e
// creme ali esticaria o queixo dele.
// Em pixel de canvas, medido com `?remendo=` e a régua da cara:
//   0 .. 43  = a bola do nariz (o que fica);  14 .. 62 = o que o remendo apara;
//   63       = o queixo — passar disso pintaria creme no pescoço dele.
const REMENDO_DE = 49;
const REMENDO_ATE = 92;

/**
 * `?remendo=44,108` move o corte pela URL, em pixel de canvas.
 *
 * Existe porque acertar isto por tentativa custava cinco minutos de bancada por
 * palpite: é uma linha na textura, mas ela vive num canvas que vira uma caixa em
 * espaço local que vira pixel na cara. Com a URL, uma rodada varre a faixa
 * inteira e a régua (`medir-a-cara.mjs`) diz onde cada corte caiu.
 */
function corteDaUrl(): [number, number] {
    try {
        const v = new URLSearchParams(globalThis.location?.search ?? '').get('remendo');
        if (!v) return [REMENDO_DE, REMENDO_ATE];
        const n = v.split(',').map(Number);
        return n.length === 2 && n.every(Number.isFinite) ? [n[0], n[1]] : [REMENDO_DE, REMENDO_ATE];
    } catch { return [REMENDO_DE, REMENDO_ATE]; }
}

const TINTA = '#141014';
const CREME = '#f7f3ea';

function paraTela(p: { x: number; y: number }): [number, number] {
    // y do desenho aponta para cima; o canvas aponta para baixo.
    return [LARG / 2 + p.x * (LARG / 2) * MARGEM, BOCA_MEIO - p.y * (ALT / 2) * GANHO_Y];
}

function traçarCaminho(c: CanvasRenderingContext2D, pts: { x: number; y: number }[], fechar: boolean) {
    if (!pts.length) return;
    c.beginPath();
    const [x0, y0] = paraTela(pts[0]);
    c.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) { const [x, y] = paraTela(pts[i]); c.lineTo(x, y); }
    if (fechar) c.closePath();
}

/** Desenha a forma no contexto. Fundo transparente — a boca vai por cima da cara. */
export function desenharBoca(c: CanvasRenderingContext2D, forma: Forma): void {
    c.clearRect(0, 0, LARG, ALT);

    // ── O REMENDO APARA A BOLA POR BAIXO ─────────────────────────────────────
    //
    // Ele já foi uma elipse de canvas inteiro e comia o rosto do queixo aos
    // olhos ("aí ele perde a nareba"). Depois encolheu demais e a boca passou a
    // ser desenhada EM CIMA da bola ("ainda está cobrindo o nariz, a bola preta
    // inteira é o nariz"). Agora ele faz uma coisa só, decidida pelo dono do
    // jogo: apara a METADE DE BAIXO da bola, e nada mais.
    //
    // O que sobra em cima continua sendo o nariz dele — bola preta, mesmo lugar,
    // só menor. O que abre embaixo é onde a boca cabe.
    c.save();
    c.fillStyle = CREME;
    c.beginPath();
    const [corteDe, corteAte] = corteDaUrl();
    c.ellipse(LARG / 2, (corteDe + corteAte) / 2, LARG * 0.47,
        (corteAte - corteDe) / 2, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.save();
    c.translate(LARG / 2, ALT / 2);
    c.rotate((forma.inclinacao * Math.PI) / 180);
    c.translate(-LARG / 2, -ALT / 2);

    c.lineJoin = 'round';
    c.lineCap = 'round';

    if (forma.cheia && forma.caminho.length) {
        // Boca aberta: buraco de tinta com contorno grosso.
        traçarCaminho(c, forma.caminho, true);
        c.fillStyle = TINTA;
        c.fill();
        c.strokeStyle = TINTA;
        c.lineWidth = 5;
        c.stroke();

        // ── ONDE A FORMA COMEÇA E ACABA ──────────────────────────────────────
        // Isto aqui era um defeito e a ficha inteira numa foto o entregou: os
        // dentes e a goela eram ancorados no TOPO e no PÉ DA CAIXA (`y = ±1`),
        // e nenhuma boca desta ficha chega perto disso — a maior abre 0,44. O
        // resultado é que eles caíam fora do recorte da boca e simplesmente não
        // apareciam: onze das vinte e sete bocas saíam como cunhas pretas lisas,
        // sem dente nenhum. Agora a âncora é a própria forma.
        const ys = forma.caminho.map((q) => q.y);
        const topoDaForma = paraTela({ x: 0, y: Math.max(...ys) })[1];
        const peDaForma = paraTela({ x: 0, y: Math.min(...ys) })[1];
        const alturaDaForma = peDaForma - topoDaForma;

        // ── A GOELA ──────────────────────────────────────────────────────────
        // Nas duas fichas novas, boca aberta dele NUNCA é um buraco preto
        // chapado: tem o fundo claro aparecendo embaixo (F5, F8, F9, 2C, 2F).
        // É o que dá profundidade e o que faltava para as bocas grandes não
        // virarem manchas. Vai por baixo dos dentes e recortada pela boca.
        if (forma.goela > 0) {
            c.save();
            traçarCaminho(c, forma.caminho, true);
            c.clip();
            c.fillStyle = CREME;
            c.beginPath();
            c.ellipse(LARG / 2 + LARG * 0.04, peDaForma,
                LARG * 0.16 * forma.goela + LARG * 0.06, alturaDaForma * 0.55 * forma.goela,
                0, 0, Math.PI * 2);
            c.fill();
            c.restore();
        }

        // ── OS DENTES ────────────────────────────────────────────────────────
        // Creme sobre a tinta, pendurados na gengiva de CIMA — é assim que as
        // duas fichas desenham. E num PEDAÇO da largura (`dentesDe`/`dentesAte`),
        // não na largura toda: dente de ponta a ponta lê como dentadura, dente
        // num pedaço lê como canto da boca levantado.
        if (forma.dentes > 0) {
            c.save();
            traçarCaminho(c, forma.caminho, true);
            c.clip();
            const topo = topoDaForma;
            c.fillStyle = CREME;
            const largura = LARG * MARGEM;
            const x0 = LARG / 2 - largura / 2 + largura * forma.dentesDe;
            const faixa = largura * (forma.dentesAte - forma.dentesDe);
            const passo = faixa / forma.dentes;
            for (let i = 0; i < forma.dentes; i++) {
                const x = x0 + i * passo;
                if (forma.presas) {
                    // Presa: triângulo pendurado da gengiva de cima.
                    c.beginPath();
                    c.moveTo(x, topo);
                    c.lineTo(x + passo, topo);
                    c.lineTo(x + passo / 2, topo + alturaDaForma * 0.62);
                    c.closePath();
                    c.fill();
                } else {
                    c.fillRect(x + 1.2, topo, Math.max(1, passo - 2.4), alturaDaForma * 0.52);
                }
            }
            // e o risco entre um dente e outro
            c.strokeStyle = TINTA;
            c.lineWidth = 2.5;
            for (let i = 1; i < forma.dentes; i++) {
                const x = x0 + i * passo;
                c.beginPath(); c.moveTo(x, topo); c.lineTo(x, topo + alturaDaForma * 0.55); c.stroke();
            }
            c.restore();
        }

        if (forma.lingua) {
            // ── A LÍNGUA DE FORA (3F da ficha) ───────────────────────────────
            // Ela PENDURA do lábio de baixo, no lado que sobe, e encosta na
            // boca. Solta no ar — que foi como saiu na primeira ficha
            // fotografada — vira uma bolinha ao lado do rosto, não uma língua.
            // Então o centro fica ABAIXO do pé da forma e o corpo dela sobe até
            // entrar na boca.
            c.save();
            c.fillStyle = CREME;
            c.strokeStyle = TINTA;
            c.lineWidth = 5;
            c.beginPath();
            c.ellipse(LARG / 2 + LARG * 0.11, peDaForma - alturaDaForma * 0.16,
                LARG * 0.075, alturaDaForma * 0.55, 0.30, 0, Math.PI * 2);
            c.fill(); c.stroke();
            c.restore();
        }
    } else if (forma.traco.length) {
        // Boca fechada: um traço só, da grossura de um pincel.
        traçarCaminho(c, forma.traco, false);
        c.strokeStyle = TINTA;
        c.lineWidth = 6;
        c.stroke();
        // Os "dentes" de uma boca fechada são os risquinhos do canto da boca.
        if (forma.dentes > 0) {
            c.lineWidth = 2.5;
            const n = forma.traco.length - 1;
            for (let i = 0; i < forma.dentes; i++) {
                const t = forma.dentesDe + ((i + 0.5) / forma.dentes) * (forma.dentesAte - forma.dentesDe);
                const p = forma.traco[Math.min(n, Math.max(0, Math.round(t * n)))];
                const [x, y] = paraTela(p);
                c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - ALT * 0.08); c.stroke();
            }
        }
    }
    c.restore();
}

export interface TelaDaBoca {
    textura: THREE.CanvasTexture;
    /** Troca a forma no ar. Não redesenha se já for a mesma. */
    definir: (nome: NomeDaBoca) => void;
    atual: () => NomeDaBoca;
    dispose: () => void;
}

/** Um canvas, uma textura, dezoito formas. Devolve `null` fora do navegador. */
export function criarTelaDaBoca(inicial: NomeDaBoca): TelaDaBoca | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = LARG; cv.height = ALT;
    const c = cv.getContext('2d');
    if (!c) return null;

    let atual: NomeDaBoca = inicial;
    desenharBoca(c, BOCAS[inicial]);
    const textura = new THREE.CanvasTexture(cv);
    // ── DE CABEÇA PARA BAIXO ─────────────────────────────────────────────────
    // Isto aqui custou meia dúzia de rodadas de bancada. `CanvasTexture` nasce
    // com `flipY = true` (a convenção de UV do OpenGL), e o shader da cara JÁ
    // vira o eixo por conta própria (`_b.y = 1.0 - _b.y`, porque a caixa é medida
    // em espaço local, com y para cima). Os dois flips se somam e se cancelam ao
    // contrário: a linha de cima do canvas caía embaixo do rosto.
    //
    // Sintoma que me enganou: empurrar o desenho PARA BAIXO no canvas subia a
    // boca na cara. E, o tempo todo, cada boca estava aparecendo espelhada na
    // vertical — o sorriso torto que sobe para a direita descia, os dentes
    // pendurados na gengiva de cima ficavam pendurados na de baixo, e a goela
    // aparecia no céu da boca.
    textura.flipY = false;
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.minFilter = THREE.LinearFilter;
    textura.magFilter = THREE.LinearFilter;

    return {
        textura,
        definir: (nome) => {
            if (nome === atual) return;      // redesenhar igual é trabalho jogado fora
            atual = nome;
            desenharBoca(c, BOCAS[nome]);
            textura.needsUpdate = true;
        },
        atual: () => atual,
        dispose: () => { textura.dispose(); },
    };
}

// ── A GRAVATA-BORBOLETA ──────────────────────────────────────────────────────
//
// A ficha do Felipe traz TRÊS cores: o preto de tinta, o creme, e um marrom-vinho
// escuro — que aparece num lugar só, a gravata-borboleta no pescoço. O modelo
// não tem gravata nenhuma, e por isso a terceira cor da paleta dele nunca
// existiu no jogo.
//
// Ela vem pelo mesmo caminho da boca: desenho num plano, zero byte de download.
// Mas com material PRÓPRIO, e é aí que está a graça — o corpo dele posteriza em
// duas cores, então uma gravata que passasse por essa posterização viraria preta
// ou creme. Ela fica de fora, e é o único ponto de cor do personagem.
// O vinho da ficha é #4a2328. Na foto ele leu como PRETO: contra o
// `DIABRETE_ESCURO` (#141014) do corpo, e ainda por baixo da grade de película
// que o andar aplica, não sobrava contraste nenhum e a terceira cor continuava
// não existindo. Subiu de valor até separar da tinta sem virar vermelho de
// bombeiro — continua vinho, agora dá para ver que é vinho.
export const VINHO = '#8f3a40';

const GLARG = 160;
const GALT = 96;

export function desenharGravata(c: CanvasRenderingContext2D): void {
    c.clearRect(0, 0, GLARG, GALT);
    const cx = GLARG / 2, cy = GALT / 2;
    const asa = GLARG * 0.30, alt = GALT * 0.30;

    c.strokeStyle = TINTA;
    c.lineJoin = 'round';
    c.lineWidth = 7;
    c.fillStyle = VINHO;

    // As duas asas: triângulos com a ponta virada para dentro, como no desenho.
    for (const lado of [-1, 1]) {
        c.beginPath();
        c.moveTo(cx + lado * GLARG * 0.055, cy);
        c.lineTo(cx + lado * asa, cy - alt);
        c.lineTo(cx + lado * asa * 0.92, cy + alt);
        c.closePath();
        c.fill();
        c.stroke();
    }
    // O nó no meio.
    c.beginPath();
    c.ellipse(cx, cy, GLARG * 0.075, GALT * 0.16, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
}

export function criarTelaDaGravata(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = GLARG; cv.height = GALT;
    const c = cv.getContext('2d');
    if (!c) return null;
    desenharGravata(c);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
}
