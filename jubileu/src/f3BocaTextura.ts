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
/** Quanto do canvas a boca ocupa. Sobra margem para o traço grosso não cortar. */
// O desenho ocupa esta fração do canvas; o resto é REMENDO. A margem foi de
// 0,80 para 0,56 quando o plano cresceu: assim a boca desenhada continua do
// mesmo tamanho e quem cresce é só o pedaço de cara que ela carrega junto.
// Precisou crescer porque, com a cabeça inclinada, o remendo antigo saía de
// cima da boca pintada do GLB e as duas apareciam lado a lado.
// O desenho voltou a ocupar mais do canvas: com a boca pintada no shader da cara
// (e não num plano), o remendo já não precisa sobrar tanto para cobrir a boca da
// textura em qualquer ângulo — a caixa acompanha a malha.
const MARGEM = 0.74;

const TINTA = '#141014';
const CREME = '#f7f3ea';

function paraTela(p: { x: number; y: number }): [number, number] {
    // y do desenho aponta para cima; o canvas aponta para baixo.
    return [LARG / 2 + p.x * (LARG / 2) * MARGEM, ALT / 2 - p.y * (ALT / 2) * MARGEM];
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

    // ── O REMENDO, AGORA DO TAMANHO CERTO ────────────────────────────────────
    //
    // O GLB vem com uma boca PINTADA na textura, e ela precisa sair de baixo da
    // boca desenhada: sem isso o sorriso irônico (um traço fino) fica POR CIMA
    // dela e o que se vê na foto é um risco saindo de uma mancha preta, como um
    // cigarro. Então a boca traz o próprio pedaço de cara — creme do rosto, por
    // baixo de tudo. Como o material posteriza em duas cores, o creme do remendo
    // é o creme da cara e a emenda não aparece.
    //
    // ELE COMIA O NARIZ. O dono do jogo jogou e disse "aí ele perde a nareba", e
    // estava certo: o remendo era uma elipse de CANVAS INTEIRO, e a caixa da boca
    // é bem maior que a boca. Ele apagava o rosto todo entre o queixo e os olhos.
    //
    // Agora ele é medido, não chutado. Com a pose congelada (`?parado`) e a régua
    // da própria cara (`bancada-navegador/medir-a-cara.mjs`: 1 no alto da cabeça,
    // 0 no queixo), a cara do Diabrete tem:
    //     nareba .................. 0,333 .. 0,339
    //     boca pintada na textura . 0,083 .. 0,244
    // e a caixa desta textura cobre de -0,13 a 0,45 dessa régua. Passando para
    // fração do canvas (0 em cima), a nareba cai em 0,20 e a boca pintada em
    // 0,35..0,63. O remendo vai de 0,30 a 0,78: cobre a boca pintada com folga e
    // para treze pixels antes da nareba.
    c.save();
    c.fillStyle = CREME;
    c.beginPath();
    c.ellipse(LARG / 2, ALT * 0.54, LARG * 0.46, ALT * 0.24, 0, 0, Math.PI * 2);
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

        // Os dentes são CREME sobre a tinta — é assim que a ficha dele desenha:
        // não são objetos, são o vazio entre riscos.
        if (forma.dentes > 0) {
            c.save();
            traçarCaminho(c, forma.caminho, true);
            c.clip();
            const topo = paraTela({ x: 0, y: 1 })[1];
            const meio = ALT / 2;
            c.fillStyle = CREME;
            const largura = LARG * MARGEM;
            const passo = largura / forma.dentes;
            for (let i = 0; i < forma.dentes; i++) {
                const x = LARG / 2 - largura / 2 + i * passo;
                if (forma.presas) {
                    // Presa: triângulo pendurado da gengiva de cima.
                    c.beginPath();
                    c.moveTo(x, topo);
                    c.lineTo(x + passo, topo);
                    c.lineTo(x + passo / 2, meio + ALT * 0.10);
                    c.closePath();
                    c.fill();
                } else {
                    c.fillRect(x + 1.5, topo, passo - 3, ALT * 0.30);
                }
            }
            // e o risco entre um dente e outro
            c.strokeStyle = TINTA;
            c.lineWidth = 3;
            for (let i = 1; i < forma.dentes; i++) {
                const x = LARG / 2 - largura / 2 + i * passo;
                c.beginPath(); c.moveTo(x, topo); c.lineTo(x, meio + ALT * 0.12); c.stroke();
            }
            c.restore();
        }

        if (forma.lingua) {
            // Língua para fora, por baixo da boca — a "provocando" da ficha.
            c.save();
            c.fillStyle = CREME;
            c.strokeStyle = TINTA;
            c.lineWidth = 6;
            c.beginPath();
            c.ellipse(LARG / 2 + LARG * 0.06, ALT / 2 + ALT * 0.22, LARG * 0.11, ALT * 0.15, 0.2, 0, Math.PI * 2);
            c.fill(); c.stroke();
            c.restore();
        }
    } else if (forma.traco.length) {
        // Boca fechada: um traço só, da grossura de um pincel.
        traçarCaminho(c, forma.traco, false);
        c.strokeStyle = TINTA;
        c.lineWidth = 6;
        c.stroke();
        // Os "dentes" de uma boca fechada são os risquinhos do sorriso irônico.
        if (forma.dentes > 0) {
            c.lineWidth = 3;
            const largura = LARG * MARGEM * 0.55;
            const passo = largura / forma.dentes;
            for (let i = 1; i < forma.dentes; i++) {
                const x = LARG / 2 - largura / 2 + i * passo;
                const [, y] = paraTela(forma.traco[Math.floor((i / forma.dentes) * (forma.traco.length - 1))]);
                c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - ALT * 0.09); c.stroke();
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
