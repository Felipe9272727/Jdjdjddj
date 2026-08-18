// ── DEIXAR UMA SALA ROLAR, DENTRO DE UM JOGO QUE PROÍBE ROLAR ─────────────
//
// O `index.css` deste projeto trava a página inteira, e com razão:
//
//     html, body { height: 100dvh; overflow: hidden; touch-action: none; }
//     #root      { height: 100% }
//
// Isso é o certo para um canvas 3D em tela cheia — sem ele, arrastar para olhar
// em volta rola a página junto. Mas as SALAS (`?pipeline`, `?rascunho`, …) são
// documentos: elas precisam rolar, e herdavam a proibição.
//
// O relato: *"o ?pipeline não está com scroll, nada tá funcionando pra mobile,
// eu tenho que colocar site pra desktop"*.
//
// ── E O MEU TESTE DIZIA QUE ESTAVA TUDO BEM ──────────────────────────────
//
// Ele media `scrollHeight > clientHeight`, que continua VERDADEIRO com
// `overflow: hidden` — o conteúdo é maior que a janela, ele só não pode se
// mover. Medir "existe conteúdo para rolar" não é medir "dá para rolar", e a
// diferença é exatamente o defeito. Quinta vez nesta sessão que o instrumento
// mediu uma condição mais fácil que a real.
//
// Por isso a sonda agora ROLA de verdade e confere se `scrollY` mudou.

/** O que foi sobrescrito, para devolver ao sair da sala. */
type Restauro = { alvo: HTMLElement; propriedade: string; antes: string }[];

/**
 * Libera o scroll para uma sala e devolve a função que restaura o jogo.
 *
 * Restaurar importa: quem abre `?pipeline` e navega de volta para o jogo não
 * pode ficar com a página rolando por baixo do canvas.
 */
export function liberarRolagem(doc: Document = document): () => void {
    const raiz = doc.getElementById('root');
    const alvos: [HTMLElement | null, Record<string, string>][] = [
        [doc.documentElement, { overflow: 'auto', height: 'auto', touchAction: 'auto' }],
        [doc.body, {
            overflow: 'auto',
            height: 'auto',
            touchAction: 'auto',
            overscrollBehavior: 'auto',
            // O jogo pinta o fundo de preto no canvas; a sala precisa do dela.
            background: '#0b0b0b',
        }],
        [raiz, { height: 'auto', minHeight: '100%' }],
    ];
    const restauro: Restauro = [];
    for (const [alvo, estilos] of alvos) {
        if (!alvo) continue;
        for (const [propriedade, valor] of Object.entries(estilos)) {
            const estilo = alvo.style as unknown as Record<string, string>;
            restauro.push({ alvo, propriedade, antes: estilo[propriedade] ?? '' });
            estilo[propriedade] = valor;
        }
    }
    return () => {
        for (const { alvo, propriedade, antes } of restauro) {
            (alvo.style as unknown as Record<string, string>)[propriedade] = antes;
        }
    };
}
