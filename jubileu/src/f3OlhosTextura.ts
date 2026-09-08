/**
 * f3OlhosTextura.ts — o pincel dos olhos e das sobrancelhas.
 *
 * As formas vêm de `f3Olhos.ts` e `f3Sobrancelha.ts`, que são puros e testados.
 * Aqui é só a mão: um canvas pequeno, redesenhado SÓ quando a cara muda.
 *
 * ── POR QUE UMA SEGUNDA CAIXA, E NÃO UMA MAIOR ───────────────────────────────
 *
 * A boca já é pintada no shader da cara, por uma caixa em coordenada local. O
 * óbvio seria crescer aquela caixa até cobrir o rosto inteiro e desenhar tudo
 * junto. Não é o que está aqui, por um motivo prático: a boca troca de desenho
 * OITO VEZES POR SEGUNDO enquanto ele fala, e os olhos trocam a cada poucos
 * segundos. Num canvas só, cada quadro de fala redesenharia os olhos e as
 * sobrancelhas junto, de graça, sessenta vezes por minuto de conversa.
 *
 * Duas caixas, dois canvas, dois relógios independentes. Custa uma textura a
 * mais e economiza o trabalho de redesenhar a cara inteira a 8 Hz.
 *
 * ── A REGRA DE OURO, DE NOVO ─────────────────────────────────────────────────
 *
 * O modelo já vem com dois olhos pretos pintados. Desenhar aqui é COBRIR. Então
 * o `neutro` reproduz o olho do modelo o mais perto que dá, e o resto do
 * desenho só entra quando ele atua. Ver o teste "o repouso é a cara que o modelo
 * já tem" em `f3Olhos.test.ts`.
 */

import * as THREE from 'three';
import { OLHOS, type Olho, type NomeDoOlho } from './f3Olhos';
import { SOBRANCELHAS, type Sobrancelha, type NomeDaSobrancelha } from './f3Sobrancelha';

const LARG = 256;
// ── A TESTA NÃO CABIA NO CANVAS ──────────────────────────────────────────────
//
// O canvas tinha 156 px e o olho ocupava 60% dele, CENTRADO: sobravam 31 px de
// testa. Uma sobrancelha de `surpresa` sobe 32 px só de arco, mais metade da
// grossura do traço — ela precisava de 56 e tinha 31. Resultado na ficha
// inteira: as sobrancelhas ou eram aparadas pela borda de cima (a da direita, a
// que a ironia levanta, sumia inteira) ou, com o aparo consertado, desabavam
// todas para a mesma altura e ficavam POUSADAS no olho, como um chapéu — e a
// assimetria da `ironia`, que é o que faz a cara dele ser irônica, virava duas
// sobrancelhas iguais.
//
// A conta do espaço necessário, tirada das oito da ficha:
//     surpresa ....... 19,5 (altura) + 31,8 (arco) + 4,8 (traço) = 56,1 px
//     ironia direita . 24,0          + 18,7        + 4,8         = 47,5 px
//     pensativa dir. . 22,5          + 22,5        + 4,8         = 49,8 px
// Então 62 px de testa, com folga. O canvas cresce só para cima e o olho desce
// dentro dele; a CAIXA no rosto cresce junto, na mesma proporção, para que o
// olho continue exatamente do mesmo tamanho e no mesmo lugar da cara
// (`OLHOS_ALTURA` e `OLHOS_CENTRO_Y` em `diabreteRig.ts`).
const TESTA = 62;
const ALT = 172;

/**
 * O tamanho do canvas, exportado porque as fichas da bancada precisam dele.
 * Elas o tinham COPIADO (256 x 156), e quando a testa cresceu para 172 as duas
 * continuaram desenhando num quadro velho — a ficha mentiria sobre o pincel que
 * ela existe para vigiar.
 */
export const TELA_DA_CARA = Object.freeze({ largura: LARG, altura: ALT });

const TINTA = '#141014';
const CREME = '#f7f3ea';

/**
 * Onde cada olho mora dentro do canvas, medido na foto com a régua da cara
 * (`bancada-navegador/medir-a-cara.mjs` sobre `?semboca&parado`):
 * os olhos vão de 0,35 a 0,87 da altura do rosto e de |0,20| a |0,62| da
 * meia-largura. A caixa desta textura cobre essa faixa mais a testa das
 * sobrancelhas.
 */
// ── DERIVADO DA MALHA, NÃO DE FOTO ──────────────────────────────────────────
// Os números antigos vinham de medir manchas de RUÍDO da textura do GLB e
// chamá-las de olho (ver o comentário longo em `diabreteRig`). Agora a cara é
// geometria: esfera de raio ~0,21 em (0, 0,775, 0). O olho fica em
// x = ±0,085, y = 0,80, com ~0,075 x 0,095 de tamanho. Convertido para esta
// caixa (0,26 x 0,159 do modelo, num canvas de 256 x 156):
// O tamanho do olho é ancorado na LARGURA do canvas, não na altura: assim dá
// para dar testa (mexer em `ALT`) sem que o olho mude de tamanho junto.
const OLHO_LARG = LARG * 0.289;    // 74,0 px
const OLHO_ALT = LARG * 0.3656;    // 93,6 px — o mesmo de sempre
const OLHO_CX = LARG * 0.327;      // distância do centro até o meio de cada olho
const OLHO_CY = TESTA + OLHO_ALT / 2;

/** Desenha UM olho, centrado em (cx, cy). `lado` = -1 esquerdo, +1 direito. */
function desenharUmOlho(c: CanvasRenderingContext2D, o: Olho, cx: number, cy: number, lado: number) {
    const rx = OLHO_LARG / 2, ry = OLHO_ALT / 2;

    // ── O OLHO FECHADO É UM ARCO, NÃO UM OLHO ────────────────────────────────
    // "fechado (sorrindo)" da ficha: dois arcos virados para cima. Aqui ele
    // apaga o olho do modelo com creme e põe o traço por cima.
    if (o.fechado) {
        c.save();
        c.fillStyle = CREME;
        c.beginPath();
        c.ellipse(cx, cy, rx * 1.06, ry * 1.06, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = TINTA;
        c.lineWidth = ry * 0.20;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(cx, cy + ry * 0.34, rx * 0.86, Math.PI * 1.18, Math.PI * 1.82);
        c.stroke();
        c.restore();
        return;
    }

    // ── A MASSA, E COMO ELA OLHA PARA OS LADOS ───────────────────────────────
    //
    // A massa é o olho do modelo: uma amêndoa cheia de tinta.
    //
    // O defeito que a ficha inteira numa foto entregou: `esquerda`, `direita` e
    // `cima` saíam IDÊNTICAS a `neutro`. Óbvio em retrospecto — numa massa preta
    // sólida não existe pupila para mover, e `olharX/olharY` só mexiam na
    // pupila, que só existe no `arregalado`.
    //
    // Quem olha para o lado num olho assim é a AMÊNDOA INTEIRA: ela desliza
    // dentro da órbita e o creme aparece do lado que ela deixou. Por isso a
    // órbita de creme só é pintada QUANDO HÁ DESLOCAMENTO — em `neutro` o olho
    // do modelo fica intocado, que é a regra de ouro deste arquivo.
    const desliza = (o.olharX !== 0 || o.olharY !== 0) && o.pupila === 0;
    c.save();
    if (desliza) {
        c.fillStyle = CREME;
        c.beginPath();
        c.ellipse(cx, cy, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
        c.fill();
    }
    c.fillStyle = TINTA;
    c.beginPath();
    if (desliza) {
        c.ellipse(cx + o.olharX * rx * 0.30, cy - o.olharY * ry * 0.26,
            rx * 0.84, ry * 0.86, 0, 0, Math.PI * 2);
    } else {
        c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
    c.fill();

    if (o.pupila > 0) {
        c.fillStyle = CREME;
        c.beginPath();
        c.ellipse(cx, cy, rx * 0.86, ry * 0.88, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = TINTA;
        c.beginPath();
        c.ellipse(cx + o.olharX * rx * 0.5, cy - o.olharY * ry * 0.5,
            rx * o.pupila, ry * o.pupila * 1.06, 0, 0, Math.PI * 2);
        c.fill();
    }

    // A ESPIRAL do "tonto". Três voltas, traço grosso, sem capricho — é gag.
    if (o.espiral) {
        c.strokeStyle = TINTA;
        c.lineWidth = ry * 0.13;
        c.lineCap = 'round';
        c.beginPath();
        const voltas = 3, passos = 48;
        for (let i = 0; i <= passos; i++) {
            const t = i / passos;
            const ang = t * voltas * Math.PI * 2;
            const raio = rx * 0.72 * (1 - t);
            const x = cx + Math.cos(ang) * raio;
            const y = cy + Math.sin(ang) * raio * (ry / rx);
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
    }

    // ── AS PÁLPEBRAS ─────────────────────────────────────────────────────────
    // Creme por cima do olho, cortando reto e em ângulo. O ângulo é o que
    // separa raiva de tristeza, e o SINAL dele é o mesmo da sobrancelha
    // (positivo desce a ponta de dentro) — as duas peças falam a mesma língua,
    // ver `f3Sobrancelha`.
    const palpebra = (fracao: number, deCima: boolean) => {
        if (fracao <= 0) return;
        c.save();
        c.beginPath();
        c.ellipse(cx, cy, rx * 1.08, ry * 1.08, 0, 0, Math.PI * 2);
        c.clip();
        const ang = (o.anguloDaPalpebra * Math.PI) / 180 * lado * (deCima ? 1 : -1);
        c.translate(cx, cy);
        c.rotate(ang);
        c.fillStyle = CREME;
        const borda = deCima ? -ry - ry * 0.4 : ry + ry * 0.4;
        const altura = ry * 2 * fracao + ry * 0.4;
        c.fillRect(-rx * 1.6, deCima ? borda : borda - altura, rx * 3.2, altura);
        c.restore();
    };
    palpebra(o.palpebraCima, true);
    palpebra(o.palpebraBaixo, false);

    // O BRILHO. Um pontinho claro no alto do olho — é o que impede a amêndoa de
    // ler como buraco. Todo desenho de 1930 tem, e some quando o olho fecha.
    if (o.brilho && o.pupila === 0 && !o.espiral && o.palpebraCima < 0.6) {
        c.fillStyle = CREME;
        c.beginPath();
        c.ellipse(cx + lado * rx * 0.26 + o.olharX * rx * 0.3,
            cy - ry * 0.34 - o.olharY * ry * 0.2,
            rx * 0.17, ry * 0.16, -0.3 * lado, 0, Math.PI * 2);
        c.fill();
    }
    c.restore();
}

/**
 * Folga mínima entre o topo do traço da sobrancelha e a borda de cima do canvas.
 *
 * Nove pixels, e o número não é folga estética: é ONDE O CABELO COMEÇA. Com a
 * caixa dos olhos onde ela está, o alto do canvas cai na régua 0,973 do rosto e
 * o creme acima do olho acaba na 0,946 — ou seja os nove primeiros pixels do
 * canvas já estão pintando dentro da franja preta. Sobrancelha desenhada ali
 * não fica feia, fica INVISÍVEL, que foi o que a foto de perto mostrou duas
 * vezes seguidas. Quem passar dessa linha desce, em vez de sumir.
 */
const MARGEM_DO_CENHO = 9;

/** Desenha UMA sobrancelha. `subir` vem da assimetria — é ela que faz a ironia. */
function desenharUmaSobrancelha(
    c: CanvasRenderingContext2D, s: Sobrancelha, cx: number, cy: number, lado: number, subir: number,
) {
    const rx = OLHO_LARG / 2, ry = OLHO_ALT / 2;
    // ── ESTREITA, E PUXADA PARA DENTRO ───────────────────────────────────────
    // A faixa de creme acima do olho encolhe subindo — é o V entre as orelhas —
    // então uma sobrancelha da largura do olho tem as pontas de fora dentro do
    // cabelo. Com 0,76 da meia-largura ela ainda encostava: na foto de perto as
    // duas sobrancelhas tinham a ponta externa grudada na franja e liam como
    // contorno do cabelo, não como sobrancelha. 0,64 e um empurrão para o meio
    // resolvem — e o que ela perde de comprimento ganha de grossura, que é o que
    // faz um traço de desenho animado ser lido de longe.
    const meia = rx * 0.64;
    const paraDentro = -lado * OLHO_LARG * 0.09;
    const ang = (s.angulo * Math.PI) / 180 * lado;
    const grosso = OLHO_LARG * s.grossura;

    // ── A SOBRANCELHA DA DIREITA ESTAVA SENDO CORTADA FORA DO CANVAS ─────────
    //
    // Na foto só aparecia UMA sobrancelha, e eu tinha anotado que a outra
    // "sumia no cabelo". Não sumia: era APARADA. A conta da altura ignorava duas
    // coisas que sobem o traço depois — o arco (a quadrática chega a subir
    // `OLHO_ALT * arco`) e a metade da grossura do traço. Na `ironia`, que é a
    // cara padrão dele, a assimetria ainda soma mais 0,136 de altura; o topo do
    // traço caía em y = -11, onze pixels ACIMA da borda do canvas.
    //
    // É o mesmo erro dos dentes e da goela, que estavam ancorados na borda da
    // caixa em vez de na forma: peça posicionada por um número que não é o dela.
    // Agora a altura é pedida, o topo real é calculado, e se não couber a
    // sobrancelha desce o necessário em vez de ser cortada.
    const pedida = cy - ry - OLHO_ALT * (s.altura + subir);
    const sobeOArco = Math.max(0, OLHO_ALT * s.arco);
    const y = Math.max(MARGEM_DO_CENHO + sobeOArco + grosso / 2, pedida);

    c.save();
    c.translate(cx + paraDentro, y);
    c.rotate(ang);
    c.strokeStyle = TINTA;
    c.lineWidth = grosso;
    c.lineCap = 'round';
    c.beginPath();
    // Um arco raso: três pontos e uma quadrática é tudo o que uma sobrancelha
    // de desenho animado precisa.
    c.moveTo(-meia, 0);
    c.quadraticCurveTo(0, -OLHO_ALT * s.arco * 2, meia, 0);
    c.stroke();
    c.restore();
}

export function desenharCara(c: CanvasRenderingContext2D, olho: Olho, cenho: Sobrancelha): void {
    c.clearRect(0, 0, LARG, ALT);
    c.lineJoin = 'round';

    for (const lado of [-1, 1] as const) {
        const cx = LARG / 2 + lado * OLHO_CX;
        desenharUmOlho(c, olho, cx, OLHO_CY, lado);
    }
    for (const lado of [-1, 1] as const) {
        const cx = LARG / 2 + lado * OLHO_CX;
        // A ASSIMETRIA só levanta a da DIREITA — o mesmo lado que o sorriso
        // torto da boca levanta (ver `TORTO` em `f3Boca`). Se fosse o outro, a
        // cara brigaria consigo mesma.
        // ── A ASSIMETRIA É REPARTIDA ENTRE AS DUAS ───────────────────────────
        // Ela subia SÓ a da direita, e a testa dele não tem essa altura para
        // dar: a sobrancelha erguida ia parar dentro da franja e a ironia — que
        // é a cara padrão dele — sumia. Metade sobe de um lado e metade desce do
        // outro. A diferença entre as duas, que é o que os olhos leem, continua
        // a mesma; o que muda é que nenhuma das duas sai da testa.
        desenharUmaSobrancelha(c, cenho, cx, OLHO_CY, lado, lado * cenho.assimetria / 2);
    }

    // A RUGA em V entre as duas, que a ficha pede na oitava sobrancelha.
    if (cenho.ruga) {
        const topo = OLHO_CY - OLHO_ALT / 2 - OLHO_ALT * cenho.altura;
        c.save();
        c.strokeStyle = TINTA;
        c.lineWidth = OLHO_LARG * 0.06;
        c.lineCap = 'round';
        for (const lado of [-1, 1]) {
            c.beginPath();
            c.moveTo(LARG / 2 + lado * LARG * 0.012, topo + OLHO_ALT * 0.34);
            c.lineTo(LARG / 2 + lado * LARG * 0.045, topo - OLHO_ALT * 0.06);
            c.stroke();
        }
        c.restore();
    }
}

export interface TelaDaCara {
    textura: THREE.CanvasTexture;
    definir: (olho: NomeDoOlho, cenho: NomeDaSobrancelha, piscando?: Olho | null) => void;
    dispose: () => void;
}

/** Um canvas, uma textura, doze olhos e oito sobrancelhas. */
export function criarTelaDaCara(olho: NomeDoOlho, cenho: NomeDaSobrancelha): TelaDaCara | null {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = LARG; cv.height = ALT;
    const c = cv.getContext('2d');
    if (!c) return null;

    let atualOlho = olho, atualCenho = cenho, atualPiscada: string | null = null;
    desenharCara(c, OLHOS[olho], SOBRANCELHAS[cenho]);
    const textura = new THREE.CanvasTexture(cv);
    // Ver o comentário longo em `f3BocaTextura`: o shader da cara já vira o eixo
    // por conta própria, e os dois flips somados desenhavam tudo de ponta-cabeça.
    textura.flipY = false;
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.minFilter = THREE.LinearFilter;
    textura.magFilter = THREE.LinearFilter;

    return {
        textura,
        definir: (o, s, piscando = null) => {
            const marca = piscando ? JSON.stringify(piscando) : null;
            if (o === atualOlho && s === atualCenho && marca === atualPiscada) return;
            atualOlho = o; atualCenho = s; atualPiscada = marca;
            desenharCara(c, piscando ?? OLHOS[o], SOBRANCELHAS[s]);
            textura.needsUpdate = true;
        },
        dispose: () => { textura.dispose(); },
    };
}
