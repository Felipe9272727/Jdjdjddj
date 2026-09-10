/**
 * f3Enquadramento.ts — A CÂMERA DAS CUTSCENES CABER NA TELA DELE.
 *
 * ── O DEFEITO ────────────────────────────────────────────────────────────────
 *
 * As cutscenes do Andar 3 são planos COMPOSTOS: cada uma escolhe posição, alvo e
 * `fov` na mão, e eu ajustei todas olhando fotos da bancada em 1024x640. Só que
 * `fov`, no three, é VERTICAL. A abertura horizontal sai daí:
 *
 *     tan(meia abertura horizontal) = tan(fov / 2) * aspecto
 *
 * Numa tela larga isso é generoso. Numa tela de celular EM PÉ (412 x 915, ou
 * seja aspecto 0,45) a mesma câmera perde 3,5 vezes de abertura horizontal — e o
 * plano que na bancada mostrava o Diabrete inteiro vira um close em que só cabe
 * um olho, o nariz e metade da boca. A foto de celular ficou irreconhecível.
 *
 * Isso muito provavelmente é metade da queixa dele de "as texturas estão
 * extremamente bugadas": ampliada nesse tanto, a cara ocupa a tela toda e cada
 * defeito de textura aparece do tamanho de um punho.
 *
 * ── O CONSERTO, E POR QUE ELE TEM DUAS PARTES ────────────────────────────────
 *
 * Só abrir o `fov` resolveria a conta e estragaria o plano: para recuperar 3,5
 * vezes de abertura seria preciso ir a 110 graus, que é olho de peixe — a cara
 * dele entortaria nas bordas e o andar inteiro pareceria filmado numa GoPro.
 *
 * Então o conserto é o que um diretor faria: abre um pouco a lente, e ANDA PARA
 * TRÁS o resto. `fov` até um teto, e o que faltar vira recuo ao longo da linha
 * de visão. O enquadramento horizontal volta, a perspectiva quase não muda, e em
 * tela larga nada disso acontece — a função devolve o plano original intacto.
 */

/**
 * O aspecto em que os planos foram compostos: 1024 x 640, que é o
 * enquadramento da bancada e de onde saíram todos os números de câmera das
 * cutscenes. Telas MAIS largas que isto não mexem em nada (elas só ganham
 * cenário nas laterais, que é o comportamento certo); telas mais estreitas
 * ganham a correção.
 */
export const ASPECTO_DE_PROJETO = 1024 / 640;

/**
 * Teto do `fov`. Acima disto a distorção de grande-angular começa a aparecer no
 * rosto, e num personagem de desenho — que é todo feito de círculos — ela lê na
 * hora como erro de renderização. O resto do ajuste vai para o recuo.
 */
export const FOV_MAXIMO = 66;

/**
 * Recuo máximo, em múltiplos da distância original até o alvo. Sem teto, uma
 * janela absurdamente estreita mandaria a câmera para fora do andar, atravessando
 * o cenário no caminho. Em 2,5 já cabe um celular em pé com folga.
 */
export const RECUO_MAXIMO = 2.5;

/**
 * ── E ISSO, SOZINHO, DEIXOU A DECUPAGEM COM UMA LENTE SÓ ─────────────────────
 *
 * A varredura das oito falas da súplica mediu `fov` 66 nas OITO. E não é acaso:
 * na tela dele `quantoFalta` é 3,55, e para qualquer `fov` composto entre 41 e
 * 52 a conta estoura o teto — todo plano bate em `FOV_MAXIMO` E em
 * `RECUO_MAXIMO`. Os quatro planos da cena (41, 42, 48, 52 graus) viravam quatro
 * cópias da mesma lente, todas 2,5 vezes mais longe. O primeiríssimo plano saía
 * a 4,3 m com a cabeça dele ocupando 25% da altura da tela; a decupagem inteira
 * ficava variando só distância.
 *
 * O erro estava na PREMISSA, não na conta: "devolver o enquadramento horizontal"
 * só faz sentido quando o que importa no plano é largo. Um close é um assunto
 * VERTICAL — uma cabeça — e numa tela em pé ele já cabe; o que estava ao lado
 * dele era o vazio. Comprar de volta esse vazio custou o plano.
 *
 * Então o plano passa a DIZER de quanta largura ele precisa. `largura` é a
 * fração do que se perdeu que vale a pena recomprar: 1 é o comportamento de
 * sempre (plano largo — a escadaria, o gesto do braço), 0 devolve o plano
 * composto intacto (plano de figura só — cabeça, corpo pendurado). O padrão é 1,
 * então nada que não peça muda.
 */
export const LARGURA_PADRAO = 1;

export interface Enquadrado {
    /** O `fov` vertical a usar, em graus. */
    fov: number;
    /**
     * Quanto AFASTAR a câmera do alvo, como multiplicador da distância atual.
     * 1 = não mexe. É sempre >= 1: esta função nunca aproxima a câmera, porque
     * aproximar cortaria um plano que o diretor compôs de propósito.
     */
    recuo: number;
}

const grausParaRad = (g: number) => (g * Math.PI) / 180;
const radParaGraus = (r: number) => (r * 180) / Math.PI;

/**
 * Dado o `fov` composto e o aspecto real da tela, devolve o `fov` e o recuo que
 * devolvem o enquadramento HORIZONTAL original.
 *
 * Em tela igual ou mais larga que a de projeto devolve `{ fov, recuo: 1 }` — o
 * plano original, sem tocar em nada.
 */
export function enquadrar(
    fov: number,
    aspecto: number,
    aspectoDeProjeto = ASPECTO_DE_PROJETO,
    largura = LARGURA_PADRAO,
): Enquadrado {
    // Entrada suja não pode virar câmera com NaN: uma câmera com NaN não fica
    // torta, ela some, e o andar inteiro fica preto. Aspecto zero acontece de
    // verdade — é o primeiro quadro, antes do canvas ter tamanho.
    if (!Number.isFinite(fov) || fov <= 0) return { fov: 45, recuo: 1 };
    if (!Number.isFinite(aspecto) || aspecto <= 0
        || !Number.isFinite(aspectoDeProjeto) || aspectoDeProjeto <= 0) {
        return { fov, recuo: 1 };
    }

    const bruto = aspectoDeProjeto / aspecto;
    if (bruto <= 1) return { fov, recuo: 1 };

    // Quanto da largura perdida este plano quer de volta. Fora de [0, 1] é
    // entrada suja, e entrada suja aqui vira câmera errada em silêncio.
    const quanto = Number.isFinite(largura) ? Math.max(0, Math.min(1, largura)) : LARGURA_PADRAO;
    const quantoFalta = 1 + (bruto - 1) * quanto;
    if (quantoFalta <= 1) return { fov, recuo: 1 };

    // Quanto de abertura horizontal o plano original tinha, em tangente.
    const meiaOriginal = Math.tan(grausParaRad(fov) / 2);
    const meiaDesejada = meiaOriginal * quantoFalta;

    // Primeiro a lente, até o teto.
    const fovAberto = Math.min(FOV_MAXIMO, radParaGraus(2 * Math.atan(meiaDesejada)));
    const meiaAberta = Math.tan(grausParaRad(fovAberto) / 2);

    // O que a lente não deu, os pés dão.
    const recuo = Math.min(RECUO_MAXIMO, Math.max(1, meiaDesejada / meiaAberta));
    return { fov: fovAberto, recuo };
}

/**
 * A posição da câmera depois do recuo: afasta ao longo da própria linha de
 * visão, para o plano continuar apontando exatamente para onde apontava.
 *
 * Devolve um objeto novo; não mexe nos que recebeu. Se a câmera estiver EM CIMA
 * do alvo não há linha de visão para afastar — devolve a posição como está, em
 * vez de inventar uma direção.
 */
export function afastar(
    cam: { x: number; y: number; z: number },
    alvo: { x: number; y: number; z: number },
    recuo: number,
): { x: number; y: number; z: number } {
    if (!Number.isFinite(recuo) || recuo <= 1) return { ...cam };
    const dx = cam.x - alvo.x, dy = cam.y - alvo.y, dz = cam.z - alvo.z;
    if (dx === 0 && dy === 0 && dz === 0) return { ...cam };
    return {
        x: alvo.x + dx * recuo,
        y: alvo.y + dy * recuo,
        z: alvo.z + dz * recuo,
    };
}
