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
// O RUNTIME é servido por nós, de `public/bergamot/` — ver o comentário longo
// em `RUNTIME` abaixo: de um CDN ele não funciona, e o sintoma é espera eterna.
//
// ── A ARMADILHA QUE CUSTOU MEIA HORA ──────────────────────────────────────
//
// Os caminhos do `registry.json` têm de ser ABSOLUTOS. O `translator.js`
// resolve `file.name` contra a PÁGINA, não contra o registry — com nome
// relativo dá 404, e o erro que aparece na tela é "SentencePiece vocabulary
// error", que não aponta para nada. E `pivotLanguage` tem de ser `null`, senão
// ele tenta baixar um par `en → en` que não existe.

import { comPrazo, PRAZO_RUNTIME_MS, PRAZO_REDE_MS } from './floor10Carga';

/** A versão vendorizada em `public/bergamot/`. `bergamot-buscar.sh` a busca. */
export const BERGAMOT_V = '0.4.9';

/**
 * ── O RUNTIME VEM DA NOSSA ORIGEM, E ISSO NÃO É PREFERÊNCIA ──────────────
 *
 * Ele vinha do jsdelivr, e no celular do dono do jogo o tradutor pendurava até
 * o prazo de 120 s estourar — enquanto o juiz (110 MB do HuggingFace) e o
 * revisor (1,25 GB) desciam sem reclamar. Ou seja: a rede dele estava boa.
 *
 * A causa está DENTRO do `translator.js`, e não tem opção para desligar:
 *
 *     new Worker(new URL('./worker/translator-worker.js', import.meta.url))
 *
 * Com o runtime servido pelo jsdelivr, `import.meta.url` é o jsdelivr, e essa
 * URL é CROSS-ORIGIN. O navegador proíbe `new Worker()` cross-origin, ponto. O
 * erro cai no `onerror` interno da biblioteca, a promessa de `translate()`
 * nunca resolve, e o que se vê é uma espera infinita — não um erro.
 *
 * ── E POR QUE A BANCADA NUNCA PEGOU ISSO ────────────────────────────────
 *
 * Porque ela servia o Bergamot do MESMO servidor de teste (`${BASE}/bergamot/`)
 * e apontava o registro para arquivos locais. Os 83 ms por frase são reais, mas
 * mediram uma configuração que o jogo não usa. É o mesmo erro de método que já
 * apareceu duas vezes aqui: dar ao teste uma condição mais fácil que a de
 * produção e depois confiar no número.
 *
 * Os MODELOS continuam no HuggingFace — eles são buscados por `fetch`, e fetch
 * cross-origin com CORS é permitido. A restrição é só na construção do Worker.
 * São 5,1 MB de runtime no nosso deploy contra 51 MB de modelos na rede dele.
 */
const RUNTIME = (globalThis as { __bergamotCdn?: string }).__bergamotCdn
    ?? '/bergamot';

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
 * ── OS ARQUIVOS CHEGAM COMPACTADOS, E O BERGAMOT NÃO SABE DISSO ──────────
 *
 * Sintoma no celular do dono do jogo, com tudo o mais funcionando:
 *
 *     Aborted(). Build with -s ASSERTIONS=1 for more info.
 *     (response to loadTranslationModel(...))
 *
 * Medido, e não é ambíguo:
 *
 *     os bytes do HF começam com `1f 8b 08 08` .......... gzip cru
 *     content-type: application/gzip, SEM content-encoding  o navegador não
 *                                                          descompacta
 *     `translator.js`: zero ocorrências de gzip/inflate ... ele também não
 *
 * Então o Bergamot recebe um gzip e tenta lê-lo como modelo Marian. O WASM
 * aborta, e o `Aborted()` não diz nada sobre a causa.
 *
 * A BANCADA NÃO PEGOU porque `bergamot-buscar.sh` roda `gunzip` e serve os
 * arquivos JÁ DESCOMPACTADOS. É a MESMA falha de método pela quarta vez nesta
 * sessão: o teste rodou numa condição mais fácil que a de produção.
 *
 * ── O CONSERTO: descompactar aqui ────────────────────────────────────────
 *
 * `DecompressionStream('gzip')` é do próprio navegador. A rede continua
 * carregando 51 MB (comprimido), e o Bergamot recebe os 73 MB que ele espera,
 * por `blob:` — que é same-origin e o worker alcança.
 *
 * De brinde, o download passa a ser NOSSO, então ele finalmente reporta
 * progresso: até aqui o tradutor era a peça que baixava sem contador de bytes.
 */
const ARQUIVOS = Object.freeze({
    enpt: Object.freeze({
        model: 'en-pt/model.enpt.intgemm.alphas.bin.gz',
        lex: 'en-pt/lex.50.50.enpt.s2t.bin.gz',
        vocab: 'en-pt/vocab.enpt.spm.gz',
    }),
    pten: Object.freeze({
        model: 'pt-en/model.pten.intgemm.alphas.bin.gz',
        lex: 'pt-en/lex.50.50.pten.s2t.bin.gz',
        vocab: 'pt-en/vocab.pten.spm.gz',
    }),
});

/**
 * Baixa um arquivo e o DESCOMPACTA, devolvendo uma `blob:` que o Bergamot
 * consegue ler. `aoAndar` recebe os bytes COMPRIMIDOS, que é o que a rede move
 * e portanto o que a barra deve mostrar.
 */
async function baixarDescompactado(
    url: string,
    aoAndar: (bytes: number) => void,
): Promise<string> {
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`${url.split('/').pop()}: HTTP ${r.status}`);
    // Conta os bytes ANTES de descompactar: é o que desce pela rede.
    const contado = r.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(pedaco, controlador) {
            aoAndar(pedaco.byteLength);
            controlador.enqueue(pedaco);
        },
    }));
    const cru = url.endsWith('.gz')
        ? contado.pipeThrough(new DecompressionStream('gzip'))
        : contado;
    return URL.createObjectURL(await new Response(cru).blob());
}

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
/** As `blob:` dos seis arquivos. Vivem enquanto o tradutor viver. */
const blobs: string[] = [];
/** Ver `ultimoErroDoRascunhador`: o motivo some se ninguém o guardar. */
let ultimoErro = '';

export function ultimoErroDoTradutor(): string { return ultimoErro; }

/**
 * Sobe o Bergamot. Devolve `null` em qualquer falha — nunca lança.
 *
 * A regra de todo este andar: uma otimização que falha não pode custar a fala
 * do jogador. Sem tradutor, o pipeline devolve `null` e o caminho normal (o 3B
 * escrevendo em português) assume.
 */
export function prepararTradutor(
    aoProgredir?: (baixados: number, total: number) => void,
): Promise<Tradutor | null> {
    tradutorPromise ??= (async () => {
        ultimoErro = '';
        try {
            // ── PRAZO, PORQUE ISTO JÁ TRAVOU PARA SEMPRE ─────────────────
            //
            // O rascunhador ganhou prazos e o download voltou a ser infinito
            // AQUI — mesma doença, outro órgão. Um `import()` que não resolve
            // não rejeita, e a fila é sequencial: pendurado aqui, o juiz e o
            // revisor nunca chegam a tentar.
            //
            // Foi o helper morando dentro do rascunhador que criou o buraco:
            // um utilitário guardado dentro de um cliente é um utilitário que
            // os outros clientes não acham. Agora ele mora em `floor10Carga`.
            //
            // Hoje isto vem da NOSSA origem, então o prazo aqui só protege
            // contra um deploy quebrado — o que pendurava de verdade era o
            // Worker cross-origin, e esse morreu na raiz.
            const mod = await comPrazo(
                import(/* @vite-ignore */ `${RUNTIME}/translator.js`) as Promise<{
                    LatencyOptimisedTranslator: new (o: Record<string, unknown>) => Tradutor;
                }>,
                PRAZO_RUNTIME_MS,
                'o runtime do tradutor',
            );
            // ── BAIXA E DESCOMPACTA AQUI ─────────────────────────────────
            //
            // Ver o comentário em `ARQUIVOS`: o HF entrega gzip cru e nem o
            // navegador nem o Bergamot descompactam, então entregar as URLs do
            // HF direto ao registro faz o WASM abortar em
            // `loadTranslationModel`. Passamos `blob:` com os bytes já crus.
            let baixados = 0;
            const registro: Record<string, Record<string, { name: string }>> = {};
            for (const [par, arquivos] of Object.entries(ARQUIVOS)) {
                registro[par] = {};
                for (const [papel, caminho] of Object.entries(arquivos)) {
                    const blob = await comPrazo(
                        baixarDescompactado(`${MODELOS}/${caminho}`, (n) => {
                            baixados += n;
                            aoProgredir?.(baixados, FLOOR10_TRADUTOR_BYTES);
                        }),
                        PRAZO_REDE_MS,
                        `o arquivo ${caminho.split('/').pop()} do tradutor`,
                    );
                    blobs.push(blob);
                    registro[par][papel] = { name: blob };
                }
            }
            urlDoRegistro = URL.createObjectURL(
                new Blob([JSON.stringify(registro)], { type: 'application/json' }),
            );
            const t = new mod.LatencyOptimisedTranslator({
                registryUrl: urlDoRegistro,
                pivotLanguage: null,
                cacheSize: 0,
            });
            // Aquece OS DOIS pares aqui, e não na primeira fala do jogador.
            // É NESTE ponto que os 51 MB descem — o construtor não baixa nada,
            // quem busca os arquivos no HF é a primeira tradução de cada par.
            // Por isso o prazo daqui é de rede, e não de CPU.
            await comPrazo(
                t.translate({ from: 'en', to: 'pt', text: 'hello' }),
                PRAZO_REDE_MS,
                'o par en→pt do tradutor',
            );
            await comPrazo(
                t.translate({ from: 'pt', to: 'en', text: 'olá' }),
                PRAZO_REDE_MS,
                'o par pt→en do tradutor',
            );
            return t;
        } catch (erro) {
            ultimoErro = erro instanceof Error ? erro.message : String(erro);
            // ── A FALHA NÃO PODE FICAR MEMOIZADA ─────────────────────────
            //
            // `??=` guarda a promessa, inclusive a que resolveu `null`. Sem
            // esta linha, o botão "de novo" da sala devolveria `null` na hora,
            // sem tentar nada, e a única saída seria recarregar a página —
            // exatamente o que os prazos vieram evitar. O juiz já zerava os
            // dele; o tradutor não.
            tradutorPromise = null;
            if (urlDoRegistro) { URL.revokeObjectURL(urlDoRegistro); urlDoRegistro = null; }
            while (blobs.length > 0) URL.revokeObjectURL(blobs.pop() as string);
            return null;
        }
    })();
    return tradutorPromise;
}

/** Descarrega o que dá e permite uma nova tentativa. */
export function esquecerTradutor(): void {
    tradutorPromise = null;
    if (urlDoRegistro) { URL.revokeObjectURL(urlDoRegistro); urlDoRegistro = null; }
    // Sem isto os 73 MB descompactados ficariam presos até a aba fechar.
    while (blobs.length > 0) URL.revokeObjectURL(blobs.pop() as string);
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
 * ── O PASSE DE ABREVIAÇÃO, QUE A MEDIÇÃO EXIGIU ───────────────────────────
 *
 * Medido em `bancada-navegador/tradutor-ida-e-volta.mjs`, com as perguntas
 * escritas do jeito que o dono do jogo escreve de verdade:
 *
 *     "vc ta preso aqui faz quanto tempo mano"
 *         → "vc is stuck here has been how long bro"
 *     "pq vc n sai dessa porra?"
 *         → "pq vc n get out of that fucking?"
 *     "ta com medo?"
 *         → "Ta in fear?"
 *
 * O Bergamot foi treinado em português de jornal. Ele traduz "Esse hotel vai
 * acabar algum dia?" impecavelmente e deixa `vc`, `pq`, `n` e `ta` INTACTOS —
 * eles não estão no vocabulário, então atravessam como se fossem nomes
 * próprios. O rascunhador receberia `"pq vc n get out of that fucking?"` e
 * responderia ao que conseguisse adivinhar dali.
 *
 * Isto não é detalhe de qualidade: os 3,2 s e o 3/3 de acerto do rascunhador
 * foram medidos com perguntas que EU escrevi em inglês limpo. Se a máquina
 * entrega outra pergunta, aqueles números mediram um pipeline que ninguém vai
 * rodar.
 *
 * O conserto é determinístico e custa microssegundos — mesma família do
 * `abrasileirar`, na direção contrária. Ele roda ANTES do Bergamot, e só na
 * pergunta: a fala do Nilo sai do modelo em inglês e nunca passa por aqui.
 *
 * SEM LOOKBEHIND, pelo mesmo motivo de sempre: o Safari antigo não tem, e o
 * erro de sintaxe não quebra esta função, quebra o bundle inteiro.
 */
// ── POR QUE ISTO É UM DICIONÁRIO DE PALAVRAS, E NÃO UMA LISTA DE REGEX ───
//
// A primeira versão era `\bvc\b`, `\bn\b`, e assim por diante. Ela corrompia
// texto bom, e o defeito é do JavaScript, não meu descuido:
//
//     `\b` é definido sobre [A-Za-z0-9_] — SEM ACENTO.
//
// Então entre o `n` e o `ã` de "não" existe uma fronteira de palavra, e a regra
// da negação disparava DENTRO da própria palavra:
//
//     "vc não tem medo?"            → "você nãoão tem medo?"
//     "um número gravado nela"      → "um nãoúmero gravado nela"   → "a non-humerer"
//
// "não" é a palavra mais comum de uma pergunta negativa. Os testes de unidade
// não pegaram porque nenhum tinha acento depois de uma abreviação; quem pegou
// foi o caso-armadilha da bancada (`desabreviar-tabela.mjs`), que existe
// exatamente para isso.
//
// A correção não é um `\b` melhor — é parar de usar fronteira. O texto é
// quebrado em PALAVRAS (com acento), e cada palavra inteira é procurada no
// dicionário. Sem fronteira não há meia-palavra, e de quebra some a ordem das
// linhas como fonte de armadilha: uma palavra só é trocada uma vez.
//
// ── DUAS REGRAS QUE MANTÊM O DICIONÁRIO HONESTO ─────────────────────────
//
// 1. TODA EXPANSÃO SAI EM PORTUGUÊS INTEIRO. Nenhuma pode produzir outra
//    abreviação. Por isso `tlgd` vira "sabe" e não "tá ligado".
//
// 2. QUANDO A EXPANSÃO LITERAL TRADUZ MAL, VALE O SENTIDO. `vlw` é "valeu",
//    que o Bergamot traduz como "it was worth it" — não é o que a palavra faz
//    numa conversa. Vira "obrigado". O destino é um modelo de 400M lendo
//    inglês, não um dicionário de português.
//
// Cada linha aqui foi medida no Bergamot de verdade por
// `bancada-navegador/desabreviar-tabela.mjs`: 30 consertaram uma tradução que
// vazava a abreviação crua, e nenhuma piorou uma frase que já estava boa.
const ABREVIACOES: ReadonlyMap<string, string> = new Map(Object.entries({
    // ── PESSOAS ──────────────────────────────────────────────────────────
    vcs: 'vocês', vcês: 'vocês',
    vc: 'você', cê: 'você', ce: 'você', voce: 'você',
    nois: 'nós', nóis: 'nós',
    gnt: 'gente', ngm: 'ninguém', algm: 'alguém',
    // "mn" e "mlk" são vocativos. O Bergamot já traduz "mano" para "bro" sem
    // tropeçar, então basta dar a ele a palavra inteira.
    mn: 'mano', mlk: 'moleque',

    // ── SER E ESTAR — o grupo que a medição pegou em flagrante ───────────
    ta: 'está', tá: 'está', tah: 'está',
    to: 'estou', tô: 'estou', tou: 'estou',
    tamo: 'estamos', tamos: 'estamos', tamu: 'estamos',
    tava: 'estava', tavam: 'estavam',
    eh: 'é',
    // "né" é pergunta de confirmação, e "não é" é o que ela quer dizer.
    né: 'não é', ne: 'não é', neh: 'não é',

    // ── NEGAÇÃO ──────────────────────────────────────────────────────────
    // `num` NÃO entra: "num quarto" é "em um quarto". Ver a lista do que
    // ficou de fora, embaixo.
    n: 'não', ñ: 'não', naum: 'não', nao: 'não',
    nd: 'nada',

    // ── PERGUNTAS ────────────────────────────────────────────────────────
    pq: 'por que', pqe: 'por que', prq: 'por que', porq: 'por que',
    oq: 'o que', oque: 'o que',
    qnd: 'quando', qdo: 'quando', qd: 'quando',
    qnt: 'quanto', qnto: 'quanto', qnta: 'quanta', qto: 'quanto', qta: 'quanta',
    qm: 'quem',
    kd: 'onde está', cade: 'onde está', cadê: 'onde está',
    q: 'que',

    // ── TEMPO ────────────────────────────────────────────────────────────
    agr: 'agora',
    dps: 'depois', dpx: 'depois',
    hj: 'hoje', amn: 'amanhã', amnh: 'amanhã', amanha: 'amanhã', ontm: 'ontem',
    dnv: 'de novo', smp: 'sempre', vzs: 'vezes',

    // ── QUANTIDADE E ÊNFASE ──────────────────────────────────────────────
    mts: 'muitos', mtos: 'muitos', mtas: 'muitas',
    mt: 'muito', mto: 'muito', mta: 'muita',
    tds: 'todos', tdos: 'todos',
    td: 'tudo', tdo: 'tudo',
    msm: 'mesmo', ctz: 'certeza', vdd: 'verdade',
    tbm: 'também', tb: 'também', tmb: 'também',

    // ── VERBOS SOLTOS ────────────────────────────────────────────────────
    fzr: 'fazer', fz: 'faz', axo: 'acho', pd: 'pode',
    qro: 'quero', kero: 'quero', sb: 'sabe', rlx: 'relaxa',

    // ── EXPRESSÕES, onde vale o SENTIDO e não a letra ────────────────────
    sla: 'sei lá', sqn: 'só que não',
    tlgd: 'sabe', tlg: 'sabe', pdc: 'com certeza',
    // "valeu" literal vira "it was worth it"; numa conversa é agradecimento.
    vlw: 'obrigado',
    // "beleza" literal vira "beauty"; aqui é concordância.
    blz: 'tudo bem',
    // "falou" literal vira "spoke"; aqui é despedida.
    flw: 'até mais',
    mds: 'meu Deus', mdss: 'meu Deus',
    pfv: 'por favor', pfvr: 'por favor', obg: 'obrigado',

    // ── PREPOSIÇÕES ──────────────────────────────────────────────────────
    pras: 'para as', pros: 'para os', pra: 'para', pro: 'para o',
    cmg: 'comigo', ctg: 'contigo',
}));

/**
 * Os padrões que não são palavra fixa: risada, sobretudo. Sem eles o Bergamot
 * copia "kkkkk" inteiro para o inglês, e o rascunhador recebe no meio da
 * pergunta uma palavra que não existe.
 */
const PADROES: readonly (readonly [RegExp, string])[] = Object.freeze([
    [/^k{2,}$/i, 'haha'],
    // `(?:rs)+` e não `rs+`: a risada digitada é "rsrs", e `rs+` só pegaria
    // "rsss". Foi um teste que cobrou a diferença.
    [/^(?:rs)+$/i, 'haha'],
    [/^[ha]{4,}$/i, 'haha'],
]);

/**
 * As formas com barra. Elas não são "palavra" para o separador abaixo, então
 * saem antes. `(?=…)` é lookAHEAD, que todo navegador tem — o proibido aqui é
 * o lookBEHIND.
 */
const BARRAS: readonly (readonly [RegExp, string])[] = Object.freeze([
    [/(^|\s)p\/(?=\s|$)/gi, '$1para'],
    [/(^|\s)c\/(?=\s|$)/gi, '$1com'],
    [/(^|\s)s\/(?=\s|$)/gi, '$1sem'],
]);

/**
 * O que conta como palavra — COM acento, que é o ponto de tudo isto. O `\b` do
 * JavaScript para em "n|ão"; este não.
 */
const PALAVRA = /[0-9A-Za-zÀ-ÖØ-öø-ÿ]+/g;

/**
 * ── O QUE FICOU DE FORA DE PROPÓSITO ──────────────────────────────────────
 *
 * Cada uma destas consertaria uma frase torta e estragaria uma frase boa, que
 * é troca ruim quando a maioria das perguntas já é português inteiro:
 *
 *   `num`  → "não"? "num quarto" é "em um quarto".
 *   `tão`  → "estão"? "tão escuro" é "so dark".
 *   `c`    → "você"? é também a letra, e a nota musical.
 *   `pos`  → "após"? o dono do jogo usa por "pós/depois", mas `pós` sozinho
 *            traduz bem, e `pos` colide com "posso" truncado.
 *
 * As três primeiras estão na bancada como CASOS-ARMADILHA: se alguém as
 * acrescentar, `desabreviar-tabela.mjs` acusa PIOROU e diz qual frase quebrou.
 */
export function desabreviar(pergunta: string): string {
    let s = pergunta;
    for (const [re, por] of BARRAS) s = s.replace(re, por);
    s = s.replace(PALAVRA, (palavra) => {
        const daTabela = ABREVIACOES.get(palavra.toLowerCase());
        if (daTabela) return daTabela;
        for (const [re, por] of PADROES) if (re.test(palavra)) return por;
        return palavra;
    });
    return s.replace(/\s{2,}/g, ' ').trim();
}

export async function traduzirPerguntaParaIngles(pergunta: string): Promise<string | null> {
    const t = await prepararTradutor();
    if (!t) return null;
    try {
        // `desabreviar` PRIMEIRO: o que o Bergamot não conhece ele deixa passar
        // intacto, e "pq vc n" atravessaria até o rascunhador.
        const r = await t.translate({ from: 'pt', to: 'en', text: desabreviar(pergunta) });
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
