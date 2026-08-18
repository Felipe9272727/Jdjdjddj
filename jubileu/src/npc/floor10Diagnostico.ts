// ── O QUE O ERRO QUER DIZER ───────────────────────────────────────────────
//
// POR QUE EXISTE: o relato foi "falhou em instalar o rascunhador", e não havia
// como saber o que fazer a respeito. `Failed to fetch` é o mais comum e é o
// menos informativo de todos — o navegador usa a MESMA mensagem para rede
// caída, CORS recusado, disco cheio no meio do download e aba em segundo plano
// que perdeu o socket. São quatro consertos diferentes atrás de três palavras.
//
// Este módulo não adivinha a causa. Ele diz o que aquela mensagem PODE ser, na
// ordem do que é mais provável neste jogo, e o que dá para fazer. É melhor
// mostrar três hipóteses verdadeiras que uma certeza inventada.
//
// A ordem das regras importa: a primeira que casar vence, então as específicas
// vêm antes das genéricas.

export type Diagnostico = {
    /** Uma linha, do jeito que aparece na tela. */
    resumo: string;
    /** O que fazer. Vazio quando honestamente não há um passo claro. */
    saidas: readonly string[];
};

const REGRAS: readonly (readonly [RegExp, Diagnostico])[] = Object.freeze([
    // ── COTA DE DISCO ────────────────────────────────────────────────────
    // Vem antes de tudo porque é a causa mais provável NESTE jogo: são 4,2 GB
    // de modelos, e o rascunhador entra por último.
    [/quota|cota|storage|espaço|QuotaExceeded|no space/i, {
        resumo: 'não coube: o navegador não deu espaço suficiente',
        saidas: [
            'apague os modelos que não vai usar agora (o botão de limpar cache no ?mente)',
            'no Android, o Chrome limita o site a uma fatia do disco livre — liberar espaço no aparelho aumenta a fatia',
            'aba anônima tem cota MUITO menor; teste numa aba normal',
        ],
    }],

    // ── SEM OPFS ─────────────────────────────────────────────────────────
    [/OPFS|origin private|getDirectory|não guarda modelos/i, {
        resumo: 'este navegador não sabe guardar modelos (falta OPFS)',
        saidas: [
            'use Chrome ou Edge atualizados; o Firefox no Android ainda não serve',
            'navegação anônima desliga o OPFS em alguns navegadores',
        ],
    }],

    // ── A PAREDE DE 2 GiB ────────────────────────────────────────────────
    [/out of memory|OOM|Aborted|RangeError|allocation|memory access out of bounds/i, {
        resumo: 'o navegador ficou sem memória ao abrir o modelo',
        saidas: [
            'feche outras abas e tente de novo — o WASM de 32 bits só enxerga 4 GB, e o teto prático é 2 GiB por modelo',
            'se acontecer sempre neste aparelho, ele não aguenta este modelo',
        ],
    }],

    // ── O PRAZO ESTOUROU ─────────────────────────────────────────────────
    //
    // Relato: a instalação ficava em "baixando…" ETERNAMENTE, com a barra em
    // 0 MB. Um `import()` que não resolve não rejeita — fica pendente para
    // sempre —, e a fila é sequencial, então uma etapa pendurada segura todas
    // as seguintes. Agora cada etapa tem prazo e diz QUAL delas não respondeu,
    // que é a informação que separa "CDN barrado" de "aparelho lento".
    [/não respondeu em \d+s/i, {
        resumo: 'uma etapa passou do prazo e a fila desistiu de esperar',
        saidas: [
            'se foi "o CDN do motor": a rede está barrando jsdelivr/HuggingFace — troque de rede ou desligue bloqueadores',
            'se foi "a abertura do modelo": o aparelho não deu conta de abrir 822 MB; feche outras abas',
            'se foi "a sonda de armazenamento": o navegador está sem responder sobre disco, geralmente cota no limite',
            'nada do que já baixou se perde — tentar de novo continua de onde parou',
        ],
    }],

    // ── O RUNTIME, QUE NÃO É O MODELO ────────────────────────────────────
    //
    // Esta regra existe porque a primeira versão deste arquivo errou o
    // conselho. A sala mostrou "a rede cortou no meio do download — são 822 MB
    // numa tacada", e o texto cru dizia:
    //
    //     Failed to fetch dynamically imported module:
    //     https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js
    //
    // Não é o modelo: é o RUNTIME, ~1 MB, e ele falha ANTES de baixar um único
    // byte de modelo. "Mantenha a tela acesa, ele continua de onde parou" manda
    // consertar a coisa errada — não há o que continuar, e o tamanho do modelo
    // é irrelevante. Quem salvou foi a mensagem crua ao lado do diagnóstico.
    //
    // Vem antes da regra genérica de rede porque casa com ela ("Failed to
    // fetch"), e a primeira que casa vence.
    [/dynamically imported module|import\(\)|jsdelivr|cdn\./i, {
        resumo: 'o CÓDIGO do motor não carregou (não é o modelo)',
        saidas: [
            'falhou o CDN (jsdelivr/HuggingFace), e não o download do modelo — são ~1 MB, não 822 MB',
            'rede corporativa, DNS, bloqueador de anúncios ou extensão de privacidade costumam barrar CDN',
            'se estiver numa rede com filtro, tente outra (dados móveis, por exemplo)',
            'recarregar a página resolve quando foi só um soluço do CDN',
        ],
    }],

    // ── O GENÉRICO, e é o mais comum ─────────────────────────────────────
    // `Failed to fetch` / `NetworkError` / `Load failed` (Safari) são a MESMA
    // coisa em navegadores diferentes, e nenhuma diz qual dos quatro motivos
    // foi. Conferido daqui: a URL do rascunhador responde 200 com 821.847.360
    // bytes e `access-control-allow-origin` ecoando a origem — então CORS e URL
    // não são a causa quando o download começa e para no meio.
    [/failed to fetch|networkerror|load failed|network request failed|err_/i, {
        resumo: 'a rede cortou no meio do download ("failed to fetch")',
        saidas: [
            'são 822 MB numa tacada — no celular, wi-fi instável ou a tela apagando derruba a conexão',
            'mantenha a aba na frente e a tela acesa enquanto baixa',
            'tente de novo: o que já desceu fica no cache e ele continua de onde parou',
            'se falhar sempre no mesmo ponto, provavelmente é cota de disco e não rede',
        ],
    }],

    // ── PAROU SEM ERRO ───────────────────────────────────────────────────
    [/parou antes de terminar|desistiu|abort/i, {
        resumo: 'o download parou antes de terminar',
        saidas: [
            'quase sempre é a aba perdendo o foco no celular',
            'tente de novo com a tela acesa; ele continua de onde parou',
        ],
    }],
]);

/**
 * Traduz a mensagem crua numa hipótese acionável.
 *
 * Devolve `null` quando não reconhece — e aí quem chama mostra o texto cru, que
 * é melhor que uma explicação inventada. Um diagnóstico errado com ar de certeza
 * manda a pessoa consertar a coisa errada.
 */
export function diagnosticar(erro: string): Diagnostico | null {
    const texto = erro.trim();
    if (!texto) return null;
    for (const [re, d] of REGRAS) if (re.test(texto)) return d;
    return null;
}
