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

// ── A ESCALA É A MESMA NOS DOIS EIXOS ────────────────────────────────────────
//
// Ela não era, e esse foi o defeito que a ficha inteira numa foto entregou: x
// usava `LARG/2` e y usava `ALT/2`. Num canvas de 192x128 isso são 71 px por
// unidade na largura e 47 na altura — toda boca chegava à cara 50% mais
// achatada do que o desenho. As folhas do Felipe são de bocas ABERTAS, altas
// (o F5 dele é quase 2:1, o F8 é quase redondo), e as minhas saíam frestas.
//
// Agora o passo é o mesmo nos dois eixos, e a caixa no rosto tem a proporção do
// canvas (ver `BOCA_LARGURA` em `diabreteRig`), então o que se desenha aqui é o
// que aparece lá. O preço é que o eixo y só usa ±ALT/LARG = ±0,67 do quadro
// normalizado — sobra de folha, não de desenho.
const PASSO = (LARG / 2) * MARGEM;

function paraTela(p: { x: number; y: number }): [number, number] {
    // y do desenho aponta para cima; o canvas aponta para baixo.
    return [LARG / 2 + p.x * PASSO, ALT / 2 - p.y * PASSO];
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
            const largura = 2 * PASSO;
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
            c.ellipse(LARG / 2 + PASSO * 0.26, peDaForma + alturaDaForma * 0.22,
                PASSO * 0.16, alturaDaForma * 0.50, 0.30, 0, Math.PI * 2);
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
