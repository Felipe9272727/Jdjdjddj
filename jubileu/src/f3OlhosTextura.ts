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
const ALT = 156;

const TINTA = '#141014';
const CREME = '#f7f3ea';

/**
 * Onde cada olho mora dentro do canvas, medido na foto com a régua da cara
 * (`bancada-navegador/medir-a-cara.mjs` sobre `?semboca&parado`):
 * os olhos vão de 0,35 a 0,87 da altura do rosto e de |0,20| a |0,62| da
 * meia-largura. A caixa desta textura cobre essa faixa mais a testa das
 * sobrancelhas.
 */
// Medido: o olho ESQUERDO do modelo ocupa x 40..86 de uma cara de 223 px e vai
// de 0,321 a 0,750 da régua da cara. Convertido para esta caixa (que cobre
// 0,318..0,974 da régua e 81% da largura do rosto), isso dá:
//     centro   canvas (59, 104)
//     tamanho  66 x 102 px de canvas
// Estes números não são gosto: são A REGRA DE OURO. O modelo já tem olhos
// pintados, e desenhar por cima é cobrir — se o desenho não couber no olho
// dele, o personagem muda de cara sem ninguém pedir, que foi o que aconteceu
// com o nariz três vezes.
const OLHO_LARG = LARG * 0.258;
const OLHO_ALT = ALT * 0.654;
const OLHO_CX = LARG * 0.270;      // distância do centro até o meio de cada olho
const OLHO_CY = ALT * 0.667;

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

/** Desenha UMA sobrancelha. `subir` vem da assimetria — é ela que faz a ironia. */
function desenharUmaSobrancelha(
    c: CanvasRenderingContext2D, s: Sobrancelha, cx: number, cy: number, lado: number, subir: number,
) {
    const rx = OLHO_LARG / 2, ry = OLHO_ALT / 2;
    const y = cy - ry - OLHO_ALT * s.altura - OLHO_ALT * subir;
    // Mais ESTREITA que o olho: a faixa de creme acima dele encolhe subindo (é o
    // V entre as orelhas), então uma sobrancelha da largura do olho tem as duas
    // pontas dentro do cabelo preto e some.
    const meia = rx * 0.76;
    const ang = (s.angulo * Math.PI) / 180 * lado;

    c.save();
    c.translate(cx, y);
    c.rotate(ang);
    c.strokeStyle = TINTA;
    c.lineWidth = OLHO_LARG * s.grossura;
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
        desenharUmaSobrancelha(c, cenho, cx, OLHO_CY, lado, lado > 0 ? cenho.assimetria : 0);
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
