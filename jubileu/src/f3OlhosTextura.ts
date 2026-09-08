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
// ── E DEPOIS AS FICHAS DELE CHEGARAM, E A PROPORÇÃO ESTAVA TODA ERRADA ───────
//
// Ele mandou as três folhas do personagem (frente/perfil/costas, expressões e
// guia de implementação) com a frase que resolve a discussão: "é esse o visual
// do personagem, não o que vc fez". Comparando a foto do jogo com a ficha, os
// dois erros grandes são de TAMANHO, não de posição:
//
//     olho ...... na ficha ele é ENORME. Os dois quase se tocam no meio da
//                 cara e ocupam quase metade da altura do rosto. O meu tinha
//                 0,075 de largura numa cara de 0,314 — 24%. Na ficha: ~38%.
//     nariz ..... na ficha é uma BOLINHA que cabe na fresta entre os olhos. O
//                 meu tinha raio 0,030, quase o dobro, e por ser tão grande
//                 empurrava boca e olhos para longe um do outro.
//
// Ou seja: eu tinha feito a cara ao contrário — olho pequeno e afastado, nariz
// grande. Isso muda tudo o que está aqui embaixo. O olho cresce de 74 para 102
// px de largura e de 94 para 103 de altura, e chega mais para o meio (de 0,327
// para 0,26 da meia-largura do canvas).
//
// A TESTA encolhe junto, e isso é a ficha mandando também: nela as
// sobrancelhas são fios finos encostados no olho, não arcos altos. Com olho
// desse tamanho não sobra testa para arco alto — e não é para sobrar. Os
// valores de `f3Sobrancelha` desceram na mesma conta.
//     mais alta (surpresa): 103*0,17 + 103*0,26 + 10/2 = 49,6... não cabia;
//     com os valores novos:  103*0,06 + 103*0,10 +  9/2 = 21,0 px, e há 24.
const TESTA = 22;
const ALT = 143;

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
// Segunda passada: a primeira deixou o olho quase REDONDO (101 x 103), e na
// ficha ele é um oval EM PÉ. Estreitando e esticando — e aproximando mais um
// pouco, porque na folha os dois quase se encostam.
const OLHO_LARG = LARG * 0.360;    // 92,2 px  (era 74 antes da ficha, depois 101,6)
const OLHO_ALT = LARG * 0.4414;    // 113,0 px — proporção 0,82, de pé
const OLHO_CX = LARG * 0.245;      // 62,7 px — era 83,7; sobra 0,0196 de fresta para o nariz
const OLHO_CY = TESTA + OLHO_ALT / 2;

/**
 * Onde a ÓRBITA mora dentro do canvas, exportado para a bancada poder conferir
 * que ainda sobra testa para a sobrancelha (`o-rosto-confere.test.ts`). O teste
 * copiava estes três números na mão e envelheceu na primeira vez que eles
 * mudaram.
 */
export const ORBITA_NA_TELA = Object.freeze({ cy: OLHO_CY, alt: OLHO_ALT, larg: OLHO_LARG });

/**
 * ── A INCLINAÇÃO ────────────────────────────────────────────────────────────
 * Na ficha os olhos não são ovais em pé: são inclinados, com a ponta de FORA
 * mais alta. É um detalhe pequeno e é metade da malícia da cara dele — olho
 * reto lê como bonequinho, olho inclinado lê como quem está aprontando.
 *
 * Mora aqui fora, e não dentro do desenho do olho, porque a PÁLPEBRA precisa
 * dela: ver a nota longa em `palpebra`.
 */
const INCLINACAO = 0.16;

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
    // ── A ÓRBITA DE CREME ERA INÚTIL, E COBRAVA CARO ─────────────────────────
    //
    // O conserto anterior desenhava uma órbita de creme e fazia a amêndoa
    // ENCOLHER (0,84) e deslizar dentro dela, para "o creme aparecer do lado que
    // ela deixou". A ideia estava certa para um olho sobre fundo escuro. Sobre
    // este rosto ela é literalmente invisível: a cara JÁ É do mesmo creme, e as
    // duas passam pela mesma posterização e viram o mesmo pixel.
    //
    // Então a órbita nunca apareceu, e o preço dela apareceu: o olho ficava
    // menor sempre que ele olhava de lado. Na folha do rosto montado, `esquerda`
    // e `direita` liam como "olho encolheu um pouco", não como "olhou".
    //
    // O jeito de 1930 de fazer um olho de tinta maciça olhar para o lado é
    // outro, e é mais barato: a amêndoa desliza um POUCO, sem mudar de tamanho,
    // e quem viaja de verdade é o BRILHO — que num olho todo preto é a única
    // coisa clara que existe e portanto faz as vezes de pupila.
    const desliza = (o.olharX !== 0 || o.olharY !== 0) && o.pupila === 0;
    const desvioX = desliza ? o.olharX * rx * 0.22 : 0;
    const desvioY = desliza ? -o.olharY * ry * 0.20 : 0;
    c.save();
    const giro = lado * INCLINACAO;
    c.fillStyle = TINTA;
    c.beginPath();
    c.ellipse(cx + desvioX, cy + desvioY, rx, ry, giro, 0, Math.PI * 2);
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
    //
    // ── E O CORTE TEM QUE ACOMPANHAR O OLHO ──────────────────────────────────
    // Quando o olho ganhou a inclinação da ficha, a pálpebra continuou cortando
    // na HORIZONTAL, e as duas brigaram: `malicia` e `baixoMalicioso`, que são
    // pálpebra pesada sobre olho alto, saíam como BARRAS deitadas, iguais a um
    // óculos escuro. Na ficha elas são formas de FOLHA — sobra uma fatia do
    // olho, e a fatia segue o eixo dele.
    // O recorte também estava errado pelo mesmo motivo: era uma elipse SEM
    // giro em volta de um olho girado, então nos cantos a pálpebra vazava para
    // fora da massa.
    const palpebra = (fracao: number, deCima: boolean) => {
        if (fracao <= 0) return;
        c.save();
        c.beginPath();
        c.ellipse(cx + desvioX, cy + desvioY, rx * 1.08, ry * 1.08, giro, 0, Math.PI * 2);
        c.clip();
        const ang = giro + (o.anguloDaPalpebra * Math.PI) / 180 * lado * (deCima ? 1 : -1);
        c.translate(cx + desvioX, cy + desvioY);
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
        // ── O ENTALHE, QUE NA FICHA É UMA MORDIDA E NÃO UM PONTO ─────────────
        //
        // Eu vinha desenhando um pontinho claro solto dentro da amêndoa. Na
        // ficha dele não é isso: é uma MORDIDA DE CREME na BORDA do olho — uma
        // meia-lua que entra pelo contorno. Olhando a folha de olhos inteira, é
        // ela que faz o `neutro` parecer olho em vez de bolota, e é ela que
        // conta a direção: em `esquerda` e `direita` a mordida troca de lado, em
        // `cima` ela desce para o pé do olho.
        //
        // A mordida fica do lado CONTRÁRIO ao olhar, que é como um olho de
        // verdade se comporta: a massa escura rola para onde ele olha e o claro
        // aparece atrás. Parado, ela mora do lado de DENTRO e um pouco abaixo —
        // é a posição que a `CABEÇA DE REGISTRO` da ficha mostra.
        let dx = -lado * 0.55, dy = 0.20;
        if (o.olharX !== 0 || o.olharY !== 0) { dx = -o.olharX; dy = o.olharY; }
        const norma = Math.hypot(dx, dy) || 1;
        // 0,86 do raio: longe o bastante para a meia-lua cortar o contorno em
        // vez de virar um furo no meio da massa. Na primeira tentativa ela tinha
        // 0,34 de raio e o olho virava um Pac-Man; na ficha é uma mordidinha.
        c.fillStyle = CREME;
        c.beginPath();
        c.ellipse(
            cx + desvioX + (dx / norma) * rx * 0.90,
            cy + desvioY + (dy / norma) * ry * 0.90,
            rx * 0.21, ry * 0.20, 0, 0, Math.PI * 2);
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
const MARGEM_DO_CENHO = 3;

/**
 * Fio de creme que separa a sobrancelha do olho quando as duas se encavalam.
 * Quatro pixels: menos que isso a posterização do shader (`step(0.5, ...)`)
 * come o fio e as duas voltam a virar uma mancha só.
 */
const SEPARACAO = 4;

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
    // Depois da ficha, 0,56: com o olho maior a sobrancelha subiu junto, e lá em
    // cima a faixa de creme é mais estreita ainda — a ponta de FORA era a que
    // entrava na franja.
    const meia = rx * 0.56;
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
    c.lineCap = 'round';
    // Um arco raso: três pontos e uma quadrática é tudo o que uma sobrancelha
    // de desenho animado precisa.
    const arco = () => {
        c.beginPath();
        c.moveTo(-meia, 0);
        c.quadraticCurveTo(0, -OLHO_ALT * s.arco * 2, meia, 0);
        c.stroke();
    };

    // ── A SEPARAÇÃO DE CREME ─────────────────────────────────────────────────
    //
    // `raiva` (30 graus), `bravaComRuga` (34) e `desconfiada` inclinam tanto que
    // a ponta de DENTRO desce por cima do olho. Isso é certo — sobrancelha
    // invadindo o olho é exatamente o que faz uma cara brava. O problema é que
    // aqui só existem duas cores: tinta sobre tinta não fica brava, fica uma
    // mancha só. Na folha do rosto montado essas três liam como se o olho
    // tivesse criado uma presa.
    //
    // O jeito de 1930 não é afastar a sobrancelha (isso mataria a raiva): é
    // deixar um FIO DE CREME entre as duas formas, para as bordas continuarem
    // se enxergando. Um traço creme mais grosso por baixo do de tinta faz isso
    // sozinho, e onde não há olho embaixo ele é invisível — a cara já é creme.
    c.strokeStyle = CREME;
    c.lineWidth = grosso + SEPARACAO * 2;
    arco();
    c.strokeStyle = TINTA;
    c.lineWidth = grosso;
    arco();
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
