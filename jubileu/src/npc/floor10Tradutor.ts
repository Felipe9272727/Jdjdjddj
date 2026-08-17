// ── O TRADUTOR — Bergamot, o mesmo que o Firefox usa ──────────────────────
//
// POR QUE ELE EXISTE: no pipeline de rascunho, o rascunhador escreve em INGLÊS.
// Não por capricho — foi medido que é onde ele erra menos, e sobretudo é onde o
// JUIZ enxerga (o mesmo par de frases dá 0,94 de contradição em inglês e 0,29
// em português). Alguém tem de trazer o texto de volta, e essa peça precisa ser
// quase de graça, senão come o ganho todo.
//
// A PRIMEIRA TENTATIVA COMEU: `Xenova/m2m100_418M` em ONNX custava 2.200 ms por
// frase — 66% do pipeline inteiro — e traduzia mal:
//
//     "predicament"   → "predicação"        "tight squeeze" → "estreita esqueça"
//     "unanswered"    → "inesgoável"        "guest"         → "convidado"
//
// O Bergamot é Marian NMT compilado para WASM, com um modelo destilado e
// quantizado em int8 por par de idiomas. Medido nas MESMAS frases:
//
//     m2m100-418M ... 602 MB ... 2.200 ms por frase
//     Bergamot ......  40 MB ...     83 ms por frase      26×
//
//     "predicament" → "situação intrigante"   "tight squeeze" → "apertado"
//
// ── DE ONDE VÊM OS ARQUIVOS, e por que não do lugar óbvio ─────────────────
//
// A Mozilla publica no Google Cloud Storage, e aquele bucket NÃO manda
// `access-control-allow-origin` — o navegador recusa. O espelho
// `mukowaty/firefox-translations` no HuggingFace tem os mesmos três arquivos,
// byte por byte (23.340.019 / 2.117.608 / 408.686), e o HF serve com CORS `*`.
// O runtime vem do npm pelo jsdelivr, também com CORS.
//
// ── A ARMADILHA QUE CUSTOU MEIA HORA ──────────────────────────────────────
//
// Os caminhos do `registry.json` têm de ser ABSOLUTOS. O `translator.js`
// resolve `file.name` contra a PÁGINA, não contra o registry — com nome
// relativo dá 404, e o erro que aparece na tela é "SentencePiece vocabulary
// error", que não aponta para nada. E `pivotLanguage` tem de ser `null`, senão
// ele tenta baixar um par `en → en` que não existe.

const BERGAMOT_V = '0.4.9';

const RUNTIME = (globalThis as { __bergamotCdn?: string }).__bergamotCdn
    ?? `https://cdn.jsdelivr.net/npm/@browsermt/bergamot-translator@${BERGAMOT_V}`;

const MODELOS = (globalThis as { __bergamotModelos?: string }).__bergamotModelos
    ?? 'https://huggingface.co/mukowaty/firefox-translations/resolve/main';

/**
 * ── SÃO DOIS PARES, E O SEGUNDO EU QUASE ESQUECI ─────────────────────────
 *
 * O `en → pt` é óbvio: o rascunho sai em inglês e o jogador lê português. O
 * `pt → en` só apareceu na hora de ligar no jogo — **o jogador PERGUNTA em
 * português**, e o rascunhador e o juiz trabalham em inglês. Na bancada eu
 * sempre dei a pergunta já em inglês, então o buraco não aparecia.
 *
 * Traduzir a pergunta é barato (uma frase, ~80 ms) e mantém a cadeia inteira
 * na língua onde o juiz enxerga. A alternativa — mandar a pergunta em
 * português com persona em inglês — pode funcionar, mas nunca foi medida, e
 * este projeto já pagou caro por trocar medição por suposição.
 */
export const FLOOR10_TRADUTOR_BYTES = (23_340_019 + 2_117_608 + 408_686)
    + (22_700_409 + 2_487_847 + 408_686);

/**
 * O registro que o Bergamot espera: chave `<de><para>` de 4 letras, e cada
 * arquivo com um `name` que é uma URL absoluta.
 */
export function registroDoTradutor(base: string = MODELOS): string {
    return JSON.stringify({
        enpt: {
            model: { name: `${base}/en-pt/model.enpt.intgemm.alphas.bin.gz` },
            lex: { name: `${base}/en-pt/lex.50.50.enpt.s2t.bin.gz` },
            vocab: { name: `${base}/en-pt/vocab.enpt.spm.gz` },
        },
        pten: {
            model: { name: `${base}/pt-en/model.pten.intgemm.alphas.bin.gz` },
            lex: { name: `${base}/pt-en/lex.50.50.pten.s2t.bin.gz` },
            vocab: { name: `${base}/pt-en/vocab.pten.spm.gz` },
        },
    });
}

type Tradutor = {
    translate(p: { from: string; to: string; text: string }): Promise<{ target?: { text?: string } }>;
};

let tradutorPromise: Promise<Tradutor | null> | null = null;
let urlDoRegistro: string | null = null;

/**
 * Sobe o Bergamot. Devolve `null` em qualquer falha — nunca lança.
 *
 * A regra de todo este andar: uma otimização que falha não pode custar a fala
 * do jogador. Sem tradutor, o pipeline devolve `null` e o caminho normal (o 3B
 * escrevendo em português) assume.
 */
export function prepararTradutor(): Promise<Tradutor | null> {
    tradutorPromise ??= (async () => {
        try {
            const mod = await import(/* @vite-ignore */ `${RUNTIME}/translator.js`) as {
                LatencyOptimisedTranslator: new (o: Record<string, unknown>) => Tradutor;
            };
            // O registro vira um Blob porque ele aponta para o HF, e não existe
            // arquivo nosso para servir.
            urlDoRegistro = URL.createObjectURL(
                new Blob([registroDoTradutor()], { type: 'application/json' }),
            );
            const t = new mod.LatencyOptimisedTranslator({
                registryUrl: urlDoRegistro,
                pivotLanguage: null,
                cacheSize: 0,
            });
            // Aquece OS DOIS pares aqui, e não na primeira fala do jogador.
            await t.translate({ from: 'en', to: 'pt', text: 'hello' });
            await t.translate({ from: 'pt', to: 'en', text: 'olá' });
            return t;
        } catch {
            return null;
        }
    })();
    return tradutorPromise;
}

/** Descarrega o que dá e permite uma nova tentativa. */
export function esquecerTradutor(): void {
    tradutorPromise = null;
    if (urlDoRegistro) { URL.revokeObjectURL(urlDoRegistro); urlDoRegistro = null; }
}

/**
 * ── O PASSE pt-PT → pt-BR ─────────────────────────────────────────────────
 *
 * O Bergamot é treinado em português europeu, e isso não é detalhe de estilo:
 * "o elevador não está a responder, mas não estás sozinho" é outra pessoa
 * falando. É o mesmo defeito que derrubou o granite-3b-a800m como titular
 * ("fiável"), e o registro da Mozilla não tem variante pt-BR.
 *
 * São regras determinísticas, e custam microssegundos. Elas não consertam tudo
 * — consertam o que se ouve.
 *
 * SEM LOOKBEHIND: o Safari antigo não tem, e um erro de sintaxe aqui não quebra
 * esta função, quebra o bundle inteiro. Já aconteceu neste projeto.
 */
const BRASILEIRO: readonly (readonly [RegExp, string | ((...a: string[]) => string)])[] = Object.freeze([
    // "está a responder" → "está respondendo"
    [/\b(est(?:á|ou|amos|ão)|fic(?:a|o|amos|am)|continu(?:a|o|amos|am))\s+a\s+([a-zà-ú]+?)r\b/gi,
        (_m: string, v: string, r: string) => `${v} ${r}ndo`],
    // tu → você
    [/\bnão estás\b/gi, 'você não está'],
    [/\bestás\b/gi, 'você está'],
    [/\btens\b/gi, 'você tem'],
    [/\bpodes\b/gi, 'você pode'],
    [/\bsabes\b/gi, 'você sabe'],
    [/\bqueres\b/gi, 'você quer'],
    // léxico, e o do hotel importa mais que o resto
    [/\bconvidad([oa]s?)\b/gi, 'hóspede$1'],
    [/\bhóspedeo\b/gi, 'hóspede'],
    [/\bhóspedea\b/gi, 'hóspeda'],
    [/\bhóspedeos\b/gi, 'hóspedes'],
    [/\bascensor(es)?\b/gi, (_m: string, s: string) => `elevador${s ? 'es' : ''}`],
    [/\bantigo técnico\b/gi, 'ex-técnico'],
    [/\bcontrolo\b/gi, 'controle'],
    [/\becr[ãa]s?\b/gi, 'tela'],
    [/\bcasa de banho\b/gi, 'banheiro'],
    [/\bcomboio\b/gi, 'trem'],
    [/\bautocarro\b/gi, 'ônibus'],
]);

export function abrasileirar(texto: string): string {
    let s = texto;
    for (const [re, por] of BRASILEIRO) {
        s = typeof por === 'function'
            ? s.replace(re, por as (...a: string[]) => string)
            : s.replace(re, por);
    }
    return s.replace(/\s{2,}/g, ' ').trim();
}

/**
 * A PERGUNTA DO JOGADOR, para o inglês.
 *
 * Sem passe pt-BR na volta: o destino é o rascunhador, não a tela. Devolve
 * `null` em falha, e aí o pipeline inteiro desiste — perguntar em português a
 * um rascunhador cuja persona é inglesa foi exatamente o atalho que eu não
 * medi, e não vou ligar sem medir.
 */
export async function traduzirPerguntaParaIngles(pergunta: string): Promise<string | null> {
    const t = await prepararTradutor();
    if (!t) return null;
    try {
        const r = await t.translate({ from: 'pt', to: 'en', text: pergunta });
        const en = (r?.target?.text ?? '').trim();
        return en || null;
    } catch {
        return null;
    }
}

/**
 * Traduz e abrasileira. Devolve `null` se o tradutor não estiver de pé ou se a
 * tradução vier vazia — e aí quem chamou desiste do pipeline, não da fala.
 */
export async function traduzirParaPtBr(textoEmIngles: string): Promise<string | null> {
    const t = await prepararTradutor();
    if (!t) return null;
    try {
        const r = await t.translate({ from: 'en', to: 'pt', text: textoEmIngles });
        const pt = (r?.target?.text ?? '').trim();
        return pt ? abrasileirar(pt) : null;
    } catch {
        return null;
    }
}
