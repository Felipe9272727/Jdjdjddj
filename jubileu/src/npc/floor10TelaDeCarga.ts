// ── A TELA DE CARGA, NO IDIOMA DE QUEM JOGA ────────────────────────────────
//
// Este arquivo existe por uma frase do dono do jogo sobre a espera do Andar 10:
// **"parece algo dev-only"**. Ele estava certo, e dava para ver linha por linha
// o que ele estava lendo enquanto esperava o Nilo:
//
//     ⬇ Cérebros do Nilo · 1 de 6 · conversa
//     47%    1.2 GB de 4.4 GB  ·  21,4 MB/s  ·  faltam ~3 min
//     carregando SmolLM3-3B (CPU×4)…
//     ⚠ o navegador só libera 1.87 GB para este site e o modelo precisa de 2.07
//
// Três das quatro linhas são de bancada: bytes, taxa, "parado há 31s" e o nome
// do gguf. Nenhuma delas responde a pergunta que ele tem na mão — *quanto falta
// para eu conversar com ele* — e todas juntas fazem a tela parecer o painel de
// alguém depurando o jogo em vez do jogo.
//
// ── O QUE NÃO PODE SUMIR JUNTO ────────────────────────────────────────────
//
// A tentação óbvia é apagar as três linhas e ficar só com a porcentagem. Isso
// desfaz duas coisas que este projeto já pagou para aprender:
//
//   1. `floor10Download` inteiro existe porque **porcentagem sozinha mente**:
//      "0%" pode ser "acabou de começar" ou "travou faz três minutos", e são
//      problemas opostos. A resposta continua na tela — só que agora em
//      palavras ("⚠ parado — nada está chegando") em vez de segundos.
//   2. Depois de 100% o wllama ainda copia ~2 GB para dentro do WASM e não
//      reporta NADA nesse trecho: minutos de barra cheia parada, que é a tela
//      travada que o jogador vê. O texto que parou de mentir sobre isso estava
//      no `loadText`, que é justamente o que sai da tela do jogo — então ele é
//      reconstruído aqui, a partir do estado da fila.
//
// E as FALHAS continuam visíveis, sempre. Não é preferência de estilo: engolir
// falha já causou o bug que quem joga viu antes de mim (a barra pulando 1,32 GB
// que nunca chegaram). O que muda é o idioma — "a vontade própria não desceu —
// ele responde, mas para de decidir sozinho" no lugar da mensagem do `Error`.
// O motivo técnico continua inteiro em `FilaEstado.falhados[].motivo`, e a
// bancada continua mostrando ele.
//
// Este módulo é PURO: sem react, sem three, sem wllama. Ele só lê o estado da
// fila e devolve texto.
import { DOWNLOAD_STALL_SEC, formatEta } from './floor10Download';
import type { FilaEstado } from './floor10Fila';

/**
 * A ESCOTILHA DA BANCADA: com ela ligada, os números voltam.
 *
 * As quatro flags são as que já abrem uma bancada em `main.tsx` — `?bancada`,
 * `?mente`, `?comparacao`, `?velocidade`. Quem abre uma delas está medindo, e
 * para medir os bytes e a taxa são o assunto, não o ruído.
 *
 * O global existe para UMA página que não tem query string: `/barras.html`
 * (`barras-dev.tsx`) monta o painel DE VERDADE para conferir a tela sem baixar
 * 4,2 GB, e a pergunta que ela responde é literalmente "o 'parado há Ns' muda a
 * cor certa?". Sem a escotilha, a bancada das barras passaria a ver a tela do
 * jogador e deixaria de servir para o que foi feita. É o mesmo padrão de
 * `__f10RespiroMs` e `__f10TetoEsperaMs`.
 */
export function bancadaLigada(busca?: string): boolean {
    try {
        const g = globalThis as { __f10Bancada?: boolean };
        if (g.__f10Bancada === true) return true;
    } catch { /* ambiente sem globalThis utilizável; segue pela URL */ }
    const alvo = busca ?? globalThis.location?.search ?? '';
    return /[?&](bancada|mente|comparacao|velocidade)\b/i.test(alvo);
}

/**
 * A LINHA DEBAIXO DA BARRA, para quem só quer conversar com o Nilo.
 *
 * Ela responde, em ordem de urgência: parou? já baixou e está abrindo? quanto
 * falta? Nenhuma delas precisa de byte, e as três eram exatamente o que os
 * bytes estavam ali para dizer.
 *
 * Só fica muda quando não há mais nada a fazer: com a fila inteira no
 * aparelho, o título já diz "tudo pronto" e repeti-lo aqui é barulho.
 *
 * O CASO CONTRÁRIO — fila sem ninguém baixando e ainda incompleta — NÃO é mudo,
 * e isso é medido: entre o pedido de carga e o primeiro pedaço o wllama abre o
 * cache e o Worker, e isso levou 68 s numa medição real (ver o comentário do
 * relógio em `floor10Download`). Nesses 68 s a fila não recebe progresso
 * nenhum, e uma linha vazia aí é uma tela que parece congelada logo no começo.
 */
export function linhaDaCarga(estado: FilaEstado): string {
    if (!estado.atual) {
        // Fila vazia = nada foi pedido ainda (é o `FILA_VAZIA` de antes do
        // primeiro `definir`). Não há o que anunciar, e anunciar espera onde
        // não há pedido é a mentira oposta à que este arquivo conserta.
        if (estado.total === 0) return '';
        return estado.prontos.length >= estado.total ? '' : 'conectando…';
    }
    const a = estado.amostra;
    // TRAVADO vem primeiro: é a única resposta que muda o que o jogador faz a
    // seguir. Os segundos saem, o aviso fica — e a barra já muda de cor junto.
    if (a.stalledSec >= DOWNLOAD_STALL_SEC) return '⚠ parado — nada está chegando';
    // BAIXOU E NÃO ACABOU. O arquivo chegou inteiro (a fila já o marcou pronto)
    // e ainda assim o modelo demora: é o wllama copiando os pesos para dentro
    // do WASM, sem reportar nada. Dizer isso é o que impede a tela de parecer
    // congelada com a barra cheia.
    if (estado.prontos.includes(estado.atual.id)) {
        return 'abrindo no aparelho — a barra fica parada aqui';
    }
    if (a.totalBytes <= 0 && a.bytes <= 0) return 'conectando…';
    // O tempo que falta É língua de jogador; os megabytes por segundo não são.
    return formatEta(a.etaSec) || 'baixando…';
}
