/**
 * texturaPreguicosa.ts — a conta de textura procedural só é paga por quem olha.
 *
 * ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
 *
 * O jogo desenha quase toda a sua superfície em canvas 2D: papel de parede,
 * carpete, azulejo, concreto, casca de árvore, placas. Todas essas texturas
 * nasciam em `const` de ESCOPO DE MÓDULO:
 *
 *     export const carpetTex = colorTex(512, 512, drawCarpet, 4.75, 8.5);
 *
 * Um `const` de módulo roda quando o módulo é avaliado, e o bundle é UM chunk
 * só (`inlineDynamicImports`), então TODOS os módulos são avaliados na
 * abertura. O resultado medido na árvore de arquivos:
 *
 *     12,84 MB  Floor6Textures.ts   (25 texturas, 7 delas 512×512)
 *      1,79 MB  Floor8Room.tsx
 *      0,38 MB  Floor9Forest.tsx
 *      0,25 MB  Floor5.tsx
 *      0,22 MB  Floor8Image.tsx
 *      0,12 MB  Floor4Scene2D.tsx
 *     ────────
 *     15,64 MB de buffer RGBA alocado ANTES do menu principal aparecer
 *
 * E não é só a memória: cada `draw` desenha na mão. `drawCarpetBump` sozinho
 * são 5.200 `fillRect` com um `fillStyle` novo em cada um — e todo `fillStyle`
 * é uma string CSS que o navegador precisa interpretar. Somando as fábricas do
 * jogo inteiro passa de cem mil operações de canvas na thread principal, no
 * boot, num aparelho que ao mesmo tempo está lendo um HTML de 91 MB.
 *
 * O jogador que abre o jogo e fica no saguão pagava a Suíte 612 inteira.
 *
 * ─── COMO FUNCIONA ──────────────────────────────────────────────────────────
 *
 * `THREE.Texture.image` é um atalho para `texture.source.data` — é dali que o
 * WebGLRenderer lê os pixels, e ele só lê na hora de SUBIR a textura para a
 * GPU, ou seja, no primeiro frame em que o material aparece na tela. Trocando
 * esse `data` por um getter, o canvas passa a ser desenhado nesse instante e
 * não antes.
 *
 * O objeto de textura continua sendo criado na hora (é barato: sem pixel
 * nenhum), então todo `map={carpetTex}` do jogo continua idêntico — nenhum
 * ponto de uso muda, e as opções (colorSpace, wrap, repeat, anisotropy) são
 * aplicadas na criação como sempre foram.
 *
 * Consequência boa de segunda ordem: a memória em regime também cai. Antes,
 * quem chegasse ao Andar 9 carregava junto o carpete do 6 e o concreto do 8
 * para sempre. Agora cada andar constrói o que mostra.
 *
 * ─── O QUE ISTO **NÃO** FAZ ─────────────────────────────────────────────────
 *
 * Não adia leitura síncrona de tamanho. Se alguém fizer `tex.image.width` no
 * escopo do módulo, o canvas nasce ali mesmo — corretamente, só sem economia.
 * É o comportamento certo: melhor construir do que devolver um valor errado.
 */
import * as THREE from 'three';

/** O desenho que produz o canvas de uma textura. */
export type ConstrutorDeCanvas = () => HTMLCanvasElement;

/** Ajustes aplicados na textura recém-criada (wrap, repeat, colorSpace...). */
export type AjusteDeTextura = (t: THREE.CanvasTexture) => void;

/**
 * Quantas texturas preguiçosas já foram materializadas e quantas ainda não.
 * Serve para a bancada e para o console do aparelho responderem "o boot
 * realmente ficou mais leve?" sem instrumentar o jogo inteiro.
 */
export const contagemPreguicosa = { criadas: 0, materializadas: 0 };

/**
 * Cria uma `CanvasTexture` cujo canvas só é desenhado quando o renderizador
 * for de fato buscar os pixels.
 *
 * @param construir  desenha e devolve o canvas. Chamado no máximo uma vez.
 * @param ajustar    aplicado imediatamente na textura (não toca em pixels).
 */
export function texturaPreguicosa(
    construir: ConstrutorDeCanvas,
    ajustar?: AjusteDeTextura,
): THREE.CanvasTexture {
    // Sem imagem: o construtor da Texture guarda `null` em `source.data` e não
    // lê nada. `CanvasTexture` ainda marca `needsUpdate`, que só mexe em
    // versão — nenhum pixel é tocado aqui.
    const textura = new THREE.CanvasTexture(undefined as unknown as HTMLCanvasElement);
    ajustar?.(textura);

    const fonte = textura.source;
    let canvas: HTMLCanvasElement | null = null;

    Object.defineProperty(fonte, 'data', {
        configurable: true,
        enumerable: true,
        get(): HTMLCanvasElement | null {
            if (canvas === null) {
                canvas = construir();
                contagemPreguicosa.materializadas++;
            }
            return canvas;
        },
        // Three nunca escreve aqui sozinho, mas `texture.image = x` é API
        // pública: quem sobrescrever manda, e o desenho nem chega a rodar.
        set(valor: HTMLCanvasElement | null) {
            canvas = valor;
        },
    });

    contagemPreguicosa.criadas++;
    return textura;
}

/**
 * Versão para quem já tem a textura pronta e só quer adiar o desenho: recebe a
 * função que constrói o canvas e a que constrói a textura em volta dele.
 *
 * Existe porque algumas fábricas do jogo (`cvs` do Andar 8, `canvasTex` do
 * Andar 5) fazem `new THREE.CanvasTexture(c)` no meio de uma função que também
 * ajusta o resultado; assim elas mudam em uma linha só.
 */
export function comCanvasPreguicoso(
    largura: number,
    altura: number,
    desenhar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    ajustar?: AjusteDeTextura,
): THREE.CanvasTexture {
    return texturaPreguicosa(() => {
        const c = document.createElement('canvas');
        c.width = largura;
        c.height = altura;
        desenhar(c.getContext('2d')!, largura, altura);
        return c;
    }, ajustar);
}
