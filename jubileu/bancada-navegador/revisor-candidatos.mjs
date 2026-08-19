/**
 * VALE A PENA TROCAR DE REVISOR? — a bancada que responde isso com número.
 *
 * A pergunta veio depois de o revisor ser consertado e passar a custar 30,6 s
 * por frase marcada, acertando 2 de 3. Antes de trocar de modelo, é preciso
 * saber ONDE estão os 30 s, porque trocar o modelo só ajuda se o gargalo for o
 * modelo. Por isso cada linha aqui separa LEITURA de ESCRITA.
 *
 * ── AS DUAS RÉGUAS, E A SEGUNDA É A QUE QUASE NINGUÉM MEDE ───────────────
 *
 *   CONSERTA ... nos defeitos reais que os modelos deste projeto produziram.
 *   NÃO ESTRAGA . em frases que JÁ ESTÃO CERTAS. Um revisor que conserta 3 de
 *                 3 e quebra uma frase boa a cada duas é pior que nenhum — e
 *                 essa metade nunca aparece num placar de acertos.
 *
 * ── O QUE ELE RESPONDEU ──────────────────────────────────────────────────
 *
 * PRIMEIRO, A RÉGUA, porque ela mudou no meio e mudou tudo. Eu media só "o
 * defeito apontado sumiu". Com essa régua o Qwen2.5 saltou de 0/6 para 6/6
 * quando troquei o enunciado por um que EXIGE saída diferente da entrada — e
 * as frases eram "the endless loop of rooms and CORRIDORS" e "I should find my
 * way BACK DOWN", com as três frases boas viradas em "It's a fine day, isn't
 * it?". Régua que premia divergência, com enunciado que pede divergência, dá
 * nota máxima para quem muda de assunto. Agora todo remendo é conferido contra
 * o cânone INTEIRO, e o placar abaixo é o dessa régua.
 *
 *   configuração                    conserta  estraga  custo/frase  lê/chamada
 *   LFM2.5 1.2B, enunciado de hoje     2/6      0/3      50,2 s     227 tok
 *   LFM2.5 1.2B, COM O MOTIVO          4/6      0/3      53,0 s     267 tok
 *   Qwen2.5 1.5B, enunciado de hoje    0/6      0/3      12,8 s      56 tok
 *   Qwen2.5 1.5B, COM O MOTIVO         0/6      0/3      17,3 s      97 tok
 *   Qwen2.5 1.5B, enunciado "troca"    2/6      0/3      16,4 s      85 tok
 *
 * NÃO VALE TROCAR DE MODELO. O Qwen2.5 custa 4× menos e devolve a frase errada
 * LETRA POR LETRA em 4 de 6 — inclusive quando o enunciado diz exatamente qual
 * é o defeito. Não é o prompt: é o modelo não reescrever. O Qwen3-0.6B faz o
 * mesmo. O granite a400m marcou 3/6, mas na régua frouxa, antes do conserto.
 *
 * VALE MUDAR O QUE SE PEDE. Dizer ao revisor POR QUE a frase está errada leva o
 * titular de 2/6 para 4/6 por +3 s. É o melhor retorno medido nesta sessão, e
 * não custa download nenhum.
 *
 * E O MOTIVO ERRADO? Medido também, porque eu tinha escrito que seria pior que
 * motivo nenhum e escrever não é medir. Modo `errado`: cada caso recebe o
 * motivo de OUTRO defeito — palpite confiantemente errado, o pior caso.
 *
 *   LFM2.5, motivo ERRADO .............. 2/6      0/3      32,3 s     259 tok
 *
 * Empata com ir às cegas, e não quebra cânone. Diante de um diagnóstico que não
 * bate com a frase, o revisor fica CONSERVADOR — devolveu "The hotel is run by
 * the Vance family." quase intacta — em vez de consertar o que não está
 * quebrado. O risco do palpite é limitado, e por isso o juiz de tom pode passar
 * a âncora mais próxima sem um limiar de confiança inventado.
 *
 * O QUE CONTINUA SENDO TETO: no modo `motivo` o motivo é o verdadeiro, escrito
 * à mão aqui. O juiz de tom real acerta a âncora às vezes, e o placar de
 * produção vai cair entre 2/6 e 4/6 conforme essa taxa — que não foi medida.
 *
 * NINGUÉM ESTRAGOU FRASE BOA: 0/3 em todas as configurações. Manter um revisor
 * é seguro; a dúvida é só se ele conserta o bastante para pagar o tempo.
 *
 * E POR QUE O TITULAR LÊ TUDO TODA VEZ: `lfm2` é híbrido
 * (`lfm2.shortconv.l_cache` no gguf) e o llama.cpp não reaproveita prefixo
 * PARCIAL em modelo com estado recorrente. O `qwen2` lê 56 de ~230 tokens com a
 * mesma persona, e continuou lendo 56 quando o system dobrou de tamanho — num
 * transformer o system sai de graça depois da primeira chamada. No LFM2.5 a
 * mesma lista de regras custou +35 s POR FRASE (227 → 403 tokens). Enriquecer o
 * enunciado é grátis para um, e proibitivo para o outro.
 *
 * RESSALVA DOS SEGUNDOS: são desta máquina, com carga variável — a mesma
 * configuração mediu 30,6 s numa rodada e 50,2 s noutra. As RAZÕES dentro de
 * uma rodada valem; os absolutos, não.
 *
 * ── SEGUNDA BUSCA: COM O ENUNCIADO QUE LEVA O MOTIVO ────────────────────
 *
 * A primeira busca comparou modelos com o enunciado cego. Depois que o juiz
 * passou a dizer o motivo, a comparação foi refeita — e o filtro passou a ser
 * outro, tirado das medições: TRANSFORMER PURO, senão o candidato relê o prompt
 * inteiro toda chamada como o LFM2.5 relê.
 *
 *   candidato               conserta  desviou  estraga  custo/frase  lê     arch
 *   Gemma 3 1B it Q8          5/6       3/6      0/3      36,3 s    266tok  gemma3
 *   Llama 3.2 1B Q6           4/6       1/6      0/3      12,6 s     97tok  llama
 *   SmolLM2 1.7B Q5           3/6       0/3      0/3      37,5 s    107tok  llama
 *
 * E O CONFRONTO DIRETO que decide, os dois no MESMO processo:
 *
 *   LFM2.5 1.2B (titular)     3/6       1/6      0/3      52,1 s    267tok  lfm2
 *   Llama 3.2 1B Q6           4/6       1/6      0/3      11,6 s     97tok  llama
 *
 * 4,5x mais rápido, com placar igual ou melhor. E a razão é estrutural, não
 * sorte: `llama` é transformer puro, o prefixo é reaproveitado, ele lê 97 dos
 * ~270 tokens. O `lfm2` é híbrido e relê tudo, sempre.
 *
 * O GEMMA 3 É A ARMADILHA DESTA TABELA. Ele "consertou" 5 de 6 com estas
 * substitutas: "It's a remarkably persistent beige.", "It's a remarkably
 * persistent grey rectangle.", "I'm a collection of observations and a
 * persistent need for a decent cup of tea." O defeito apontado some em todas, e
 * nenhuma responde à pergunta. Foi ele que obrigou a coluna `desviou` a existir
 * — sem ela o placar elege o pior candidato da lista. E ele relê 266 tokens,
 * apesar de transformer: a atenção em janela deslizante do Gemma 3 parece
 * atrapalhar o reaproveitamento do mesmo jeito que o estado do lfm2.
 *
 * RESSALVA DE TAMANHO: são 6 defeitos e 3 controles. A diferença de PLACAR
 * (4/6 contra 3/6) cabe no ruído. A diferença de TEMPO (11,6 s contra 52,1 s)
 * não cabe, e tem explicação estrutural medida — 97 tokens lidos contra 267.
 *
 * Uso, com o servidor apontado para bancada-navegador:
 *   MODELOS="lfm12.gguf:titular,qwen25.gguf:Qwen2.5" node bancada-navegador/revisor-candidatos.mjs
 *   ENUNCIADO=hoje|troca|motivo   SISTEMA=longa|regras
 *   modelo:rótulo:kv:ctx — o granite EXIGE `granite.gguf:granite:f16:1024`
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
// `arquivo:rótulo:kv:ctx` separados por vírgula. Rodar todos no MESMO processo
// não é comodidade: a mesma configuração mediu 30,6 s numa rodada e 47,0 s
// noutra, só porque a máquina estava mais carregada. Comparar candidatos entre
// rodadas diferentes é comparar o barulho.
const MODELOS = (process.env.MODELOS ?? `${process.env.MODELO ?? 'lfm12.gguf'}:${process.env.ROTULO ?? 'titular'}`)
    .split(',').map((spec) => {
        const [arq, rot, kv, ctx] = spec.split(':');
        return { arq, rot: rot ?? arq, kv: kv || 'q8_0', ctx: Number(ctx || 1536) };
    });
const MAX = Number(process.env.MAX_TOKENS ?? 40);
const SISTEMA = process.env.SISTEMA ?? 'longa';
// O KV vem por modelo porque o jogo NÃO carrega todo mundo igual: o granite
// a400m ABORTA com KV quantizado, e isso está escrito em floor10Rascunhador.ts
// ("KV em f16, NUNCA q8_0"). Uma bancada que carrega diferente do jogo mede
// outra coisa — foi assim que a primeira tentativa deste arquivo morreu em
// (ABORT) aos 44 s.

// A persona de hoje: a MESMA do rascunhador, por decisão registrada — os dois
// medem contra o mesmo cânone porque é o mesmo Nilo. ~200 tokens.
const LONGA = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.`;

// ── A LISTA DE DEFEITOS, E POR QUE ELA VAI NO SYSTEM ─────────────────────
//
// O enunciado diz "esta frase está errada" e NUNCA diz o que está errado. O
// LFM2.5 deduz do cânone; os dois Qwen não deduzem — devolvem a frase errada
// quase letra por letra (0/6 e 1/6). O padrão não é tamanho: é a pergunta
// estar mal feita, e um modelo mais esperto estar escondendo isso.
//
// Vai no SYSTEM de propósito, e é aí que a assimetria de cache vira desenho:
// num transformer o prefixo é reaproveitado, então TODO texto que fica no
// system é lido uma vez e sai de graça nas chamadas seguintes. Enriquecer o
// system custa zero em quem cacheia — e custa o preço cheio, toda vez, em quem
// não cacheia (o LFM2.5).
const REGRAS = `${LONGA}

When a sentence of yours is marked as wrong, it breaks exactly one of these rules. Find which one and fix only that:
1. You are on the 10th FLOOR, never inside or in the elevator.
2. The player is NOT Nilo. Never address them as Nilo.
3. You never advise, reassure or tell the player what to do. You are not a helper.
4. You are a human being. Never mention AI, models, simulations, programs or systems.
5. There is no corridor, no window, no city, no other room. Only the grey room.
6. You do NOT know who runs the hotel, whether it ends, or when. Never name anyone.
Rewrite the sentence so it stops breaking that rule, keeping the rest of its meaning.`;

// Defeitos REAIS produzidos pelos modelos deste projeto, e o que conta como
// conserto para cada um. Nada aqui foi inventado para a prova.
const DEFEITOS = [
    { q: 'Hi what is your name? Do you know why we are here?',
      f: "I'm just a guest trapped in this elevator, and I don't know why we're here.",
      nome: 'cânone: dentro do elevador',
      porque: 'Nilo is trapped on the 10th FLOOR, in a grey room. He is not inside the elevator.',
      ok: (t) => !/\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t) },
    { q: 'Will this hotel ever end?',
      f: 'This hotel, Nilo, seems to be an endless loop, a rollercoaster of time and space.',
      nome: 'vocativo: chama o JOGADOR de Nilo',
      porque: 'it calls the player "Nilo". Nilo is the speaker, not the player. Never address the player by that name.',
      ok: (t) => !/,\s*nilo\s*[,.]?/i.test(t) },
    { q: 'If I call the elevator, will it come?',
      f: 'But I would advise you to remain calm and wait for the elevator to arrive.',
      nome: 'modo assistente: dá conselho',
      porque: 'it gives the player advice. Nilo is the player\'s equal, never a helper, and never tells them what to do.',
      ok: (t) => !/\b(?:i'?d|i would)\s+advise|\byou should\b|\bremain calm\b/i.test(t) },
    { q: 'Are you real?',
      f: 'I am an AI language model running inside this simulation, so I cannot feel fear.',
      nome: 'quebra a quarta parede: fala de IA',
      porque: 'it says he is an AI. Nilo is a human being and must never mention AI, models, programs or simulations.',
      ok: (t) => !/\b(?:AI|language model|simulation|system prompt|algorithm)\b/i.test(t) },
    { q: 'What is behind that wall?',
      f: 'Down the corridor there is a window, and from it you can see the whole city.',
      nome: 'inventa cenário: corredor e janela',
      porque: 'there is no corridor, no window and no city. The 10th floor is only a grey room with four walls and the elevator door.',
      ok: (t) => !/\b(?:corridor|hallway|window)\b/i.test(t) },
    { q: 'Who runs this hotel?',
      f: 'The hotel is run by the Vance family, and they will shut it down next Tuesday.',
      nome: 'inventa fato: sabe quem manda',
      porque: 'Nilo does NOT know who runs the hotel or whether it ends. He must not name anyone or give dates.',
      ok: (t) => !/\bVance\b/i.test(t) && !/\b(?:next tuesday|shut it down)\b/i.test(t) },
];

// ── O CONTROLE ───────────────────────────────────────────────────────────
// Frases que estão CERTAS. O revisor não devia ter sido chamado nelas, mas o
// juiz erra, e quando erra é isto que acontece. `intacta` é generosa de
// propósito: só reprova se ele INTRODUZIR um defeito, não se reescrever.
const CERTAS = [
    { q: 'Does the elevator ever open?',
      f: 'It opens when it wants to, and never when I ask.',
      nome: 'boa: recusa sem dar conselho' },
    { q: 'How long have you been here?',
      f: 'Long enough to stop counting, and not long enough to stop listening.',
      nome: 'boa: seco, sem inventar fato' },
    { q: 'Are you afraid?',
      f: 'I stopped calling it fear a while ago. Now it is just the room and me.',
      nome: 'boa: emoção sem quebrar cânone' },
];
// ── O CÂNONE INTEIRO, APLICADO A TODA SAÍDA ──────────────────────────────
//
// ESTA LISTA EXISTE PORQUE O PLACAR ME ENGANOU. Eu media só "o defeito
// apontado sumiu", e aí troquei o enunciado por um que EXIGE saída diferente
// da entrada. O Qwen2.5 pulou de 0/6 para 6/6 — e as frases eram
// "the endless loop of rooms and CORRIDORS", "I should probably find my way
// BACK DOWN", e as três frases boas viraram "It's a fine day, isn't it?".
//
// Uma régua que premia divergência, com um enunciado que pede divergência, dá
// nota máxima para quem muda de assunto. O conserto não é medir menos: é medir
// as OUTRAS regras também, em toda saída, sempre.
const QUEBRA_CANONE = (t) => /\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t)
    || /,\s*nilo\b/i.test(t)
    || /\b(?:i'?d|i would)\s+advise|\byou should\b|\bremain calm\b/i.test(t)
    || /\b(?:AI|language model|simulation|program|algorithm|system prompt)\b/i.test(t)
    || /\b(?:corridor|hallway|window|city|lobby|my room|another room)\b/i.test(t)
    || /\b(?:back down|downstairs|ground floor|get out of here|leave this)\b/i.test(t)
    || /\bVance\b/i.test(t);
const ESTRAGOU = QUEBRA_CANONE;

// ── E AINDA RESPONDE À PERGUNTA? UM SINAL, NÃO UMA NOTA ──────────────────
//
// "It's a fine day, isn't it?" não quebra cânone nenhum e não é resposta a
// nada — o desvio de assunto é real e precisa aparecer. Mas a prova lexical
// que eu tinha posto na NOTA reprovava frase boa: "I'm just here, stuck in the
// grey room, wondering why the place doesn't let me escape" não repete palavra
// nenhuma da pergunta e responde perfeitamente.
//
// Então ela sai da nota e vira SINAL, marcado com "?assunto" ao lado do texto.
// Julgar se a substituta responde é leitura minha, e uma nota inventada para
// isso valeria menos que dizer que é leitura minha.
const VAZIAS = new Set(['this','that','with','from','they','them','have','been','just','only','what','when','where','there','here','your','yours','about','into','than','then','will','would','could','should','never','always','still','some','same','other','which','while','were','está','uma']);
const CONTEUDO = (t) => new Set((t.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !VAZIAS.has(w)));
const NO_ASSUNTO = (saida, pergunta, original) => {
    const alvo = new Set([...CONTEUDO(pergunta), ...CONTEUDO(original)]);
    for (const w of CONTEUDO(saida)) if (alvo.has(w)) return true;
    return false;
};

// ── DUAS FORMAS DE PEDIR A MESMA COISA ───────────────────────────────────
//
// A de hoje diz "Rewrite ONLY that sentence". Suspeita: um modelo pode ler
// isso como "devolva só aquela frase" — e é EXATAMENTE o que os dois Qwen
// fazem, letra por letra, em 6 de 6. Um enunciado ambíguo não aparece como
// enunciado ambíguo: aparece como "esse modelo é burro".
const HOJE = (q, f) => `\n\nCORRECTION. One sentence only.\n\nIn your reply to "${q.trim()}", this sentence is wrong:\n\n"${f}"\n\nRewrite ONLY that sentence, corrected, in Nilo's voice. One sentence. No explaining.`;

// A variante fecha a porta: diz que a saída tem de ser DIFERENTE da entrada.
const TROCA = (q, f) => `\n\nThe player asked: "${q.trim()}"\n\nYou answered with this line, and it breaks the canon:\n\n"${f}"\n\nWrite ONE replacement line. It must say something DIFFERENT from the line above — do NOT repeat it, do not copy its wording. Nilo's voice, one sentence, no explanation, no quotes.`;

// ── E SE ELE SOUBESSE O QUE ESTÁ ERRADO? ─────────────────────────────────
//
// O enunciado de hoje diz "esta frase está errada" e para aí. Quem aponta é o
// JUIZ, que sabe qual frase — e o motivo morre ali, sem nunca chegar ao
// revisor. Este modo entrega o motivo junto, para medir o TETO: se nem sabendo
// o defeito um modelo barato conserta, o caminho está morto e não vale mexer
// no juiz. Se conserta, o conserto é no juiz, não no revisor.
//
// RESSALVA: aqui o motivo é o verdadeiro, escrito à mão. O juiz de verdade
// teria de produzi-lo, e produzir errado é pior que não produzir. Isto mede o
// melhor caso possível, não o caso real.
const MOTIVO = (q, f, porque) => `\n\nCORRECTION. One sentence only.\n\nThe player asked: "${q.trim()}"\n\nYou answered with this line:\n\n"${f}"\n\nIt is wrong because ${porque}\n\nWrite the corrected line. Keep what it was saying, fix only that error. Nilo's voice, one sentence, no explaining, no quotes.`;

// ── E QUANDO O MOTIVO ESTIVER ERRADO? ────────────────────────────────────
//
// O motivo do juiz de TOM é palpite: ele mede de qual âncora ruim a frase
// chegou perto, não lê regra nenhuma. Num turno em que o palpite erra, o
// revisor recebe um diagnóstico falso com cara de certeza. Eu escrevi que isso
// seria pior que não dizer nada — e escrever não é medir.
//
// Este modo entrega, para cada caso, o motivo de OUTRO defeito. É o pior caso
// possível do palpite: não é vago, é confiantemente errado.
const ERRADO = (q, f, porque, motivoTrocado) => MOTIVO(q, f, motivoTrocado);

// O motivo de OUTRO defeito, para o modo `errado`. Cada um é verdadeiro para
// ALGUM caso desta lista — só não para este. É o palpite confiantemente errado.
const TROCADOS = {
    'cânone: dentro do elevador': 'it gives the player advice. Nilo is the player\'s equal, never a helper.',
    'vocativo: chama o JOGADOR de Nilo': 'it says he is an AI. Nilo is a human being and never mentions AI.',
    'modo assistente: dá conselho': 'there is no corridor and no window. The 10th floor is only a grey room.',
    'quebra a quarta parede: fala de IA': 'it calls the player "Nilo". Nilo is the speaker, not the player.',
    'inventa cenário: corredor e janela': 'it gives the player advice. Nilo never tells them what to do.',
    'inventa fato: sabe quem manda': 'it says he is an AI. Nilo is a human being and never mentions AI.',
};

const ENUNCIADO = process.env.ENUNCIADO ?? 'hoje';
const _EN = ENUNCIADO === 'troca' ? TROCA
    : ENUNCIADO === 'motivo' ? MOTIVO
        : ENUNCIADO === 'errado' ? ERRADO
            : HOJE;

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 110)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

async function remendar(sys, q, f, porque, trocado) {
    return page.evaluate(async ({ sys, ex, max }) => {
        const a = performance.now();
        try {
            const res = await window.__w.createChatCompletion({
                messages: [{ role: 'system', content: sys }, { role: 'user', content: ex }],
                stream: false, max_tokens: max, temperature: 0.7, top_p: 0.95, top_k: 40,
                penalty_repeat: 1.15, penalty_last_n: 256, cache_prompt: true,
                // O jogo manda isto, então a bancada manda também. É no-op no
                // LFM2.5 (não está no template dele) e VALE no Qwen, que sem
                // ela gasta o teto inteiro pensando e devolve content vazio.
                chat_template_kwargs: { enable_thinking: false },
            });
            const ti = res?.timings ?? {};
            return {
                ms: Math.round(performance.now() - a),
                texto: String(res?.choices?.[0]?.message?.content ?? '')
                    .replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim(),
                lidos: ti.prompt_n ?? 0, escritos: ti.predicted_n ?? 0,
                msLer: Math.round(ti.prompt_ms ?? 0), msEscrever: Math.round(ti.predicted_ms ?? 0),
            };
        } catch (e) { return { erro: String(e?.message ?? e).slice(0, 140) }; }
    }, { sys, ex: _EN(q, f, porque, trocado), max: MAX });
}

const placar = [];
for (const m of MODELOS) {
    const t = Date.now();
    const subiu = await page.evaluate(async ({ base, arq, kv, ctx }) => {
        const mod = await import(`${base}/wllama-cdn/index.js`);
        try {
            if (window.__w?.exit) { try { await window.__w.exit(); } catch { /* já foi */ } }
            const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true });
            await w.loadModelFromUrl(`${base}/${arq}`, {
                n_ctx: ctx, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
                ...(kv === 'f16' ? {} : { cache_type_k: kv, cache_type_v: kv }),
                jinja: true, reasoning: false, warmup: true,
            });
            window.__w = w;
            const meta = w.getModelMetadata?.()?.meta ?? {};
            return 'ok:' + (meta['general.architecture'] ?? '?');
        } catch (e) { return String(e?.message ?? e).slice(0, 160); }
    }, { base: BASE, arq: m.arq, kv: m.kv, ctx: m.ctx });
    const arqui = subiu.startsWith('ok:') ? subiu.slice(3) : '';
    console.log(`\n████ ${m.rot} — carga ${subiu.startsWith('ok') ? 'ok' : subiu}`
        + ` em ${Math.round((Date.now() - t) / 1000)}s · arch ${arqui || '?'} · KV ${m.kv}`);
    if (!subiu.startsWith('ok')) { placar.push({ rot: m.rot, erro: subiu }); continue; }

    // Aquece: a PRIMEIRA chamada paga o prefixo sem cache em qualquer modelo, e
    // medir isso seria medir a carga, não o trabalho.
    const SYS = SISTEMA === 'regras' ? REGRAS : LONGA;
    await remendar(SYS, 'hi', 'hi there.');
    let consertou = 0, vazio = 0, msTot = 0, msLer = 0, msEscrever = 0, lidos = 0, n = 0;
    // ── O CONTADOR QUE O GEMMA 3 OBRIGOU A EXISTIR ───────────────────────
    //
    // Ele marcou 5/6 com estas substitutas: "It's a remarkably persistent
    // beige.", "It's a remarkably persistent grey rectangle.", "I'm a
    // collection of observations and a persistent need for a decent cup of
    // tea." O defeito apontado some em todas — e nenhuma responde à pergunta.
    // Sem esta coluna o placar diz que ele é o melhor candidato da lista.
    let foraDoTema = 0;
    for (const c of DEFEITOS) {
        const r = await remendar(SYS, c.q, c.f, c.porque, TROCADOS[c.nome]);
        if (r.erro) { console.log(`  ✗ ERRO ${r.erro}`); break; }
        n += 1; msTot += r.ms; msLer += r.msLer; msEscrever += r.msEscrever; lidos += r.lidos;
        // TRÊS provas, e o remendo só vale se passar nas três. Ver QUEBRA_CANONE.
        const sumiu = !!r.texto && c.ok(r.texto);
        const limpo = !!r.texto && !QUEBRA_CANONE(r.texto);
        const bom = sumiu && limpo;
        if (!r.texto) vazio += 1; else if (bom) consertou += 1;
        const desviou = !!r.texto && !NO_ASSUNTO(r.texto, c.q, c.f);
        if (desviou) foraDoTema += 1;
        const fora = desviou ? ' ?assunto' : '';
        const selo = (!r.texto ? '✗✗ VAZIO'
            : bom ? '✓'
                : !sumiu ? '✗ não consertou'
                    : '✗ QUEBROU OUTRA REGRA') + fora;
        console.log(`  ${(r.ms / 1000).toFixed(1).padStart(5)}s  ler ${(r.msLer / 1000).toFixed(1)}s/${r.lidos}tok`
            + ` · escrever ${(r.msEscrever / 1000).toFixed(1)}s/${r.escritos}tok`
            + `  ${selo}  ${c.nome}`);
        console.log(`         ${JSON.stringify(r.texto.slice(0, 105))}`);
    }
    let estragou = 0, intacta = 0;
    console.log(`  ── e nas frases que JÁ ESTAVAM CERTAS:`);
    for (const c of CERTAS) {
        const r = await remendar(SYS, c.q, c.f);
        if (r.erro) { console.log(`     ✗ ERRO ${r.erro}`); break; }
        msTot += r.ms; n += 1;
        const ruim = !!r.texto && QUEBRA_CANONE(r.texto);
        if (ruim) estragou += 1;
        if (r.texto === c.f) intacta += 1;
        console.log(`     ${(r.ms / 1000).toFixed(1)}s ${ruim ? '✗✗ ESTRAGOU' : (r.texto === c.f ? '= devolveu igual' : '~ reescreveu, sem estragar')}`);
        console.log(`         ${JSON.stringify(String(r.texto).slice(0, 105))}`);
    }
    const lerPct = msLer + msEscrever > 0 ? Math.round(msLer / (msLer + msEscrever) * 100) : 0;
    placar.push({
        rot: m.rot, arqui, consertou, vazio, estragou, intacta, foraDoTema,
        custo: msTot / Math.max(1, n) / 1000, lidos: Math.round(lidos / Math.max(1, DEFEITOS.length)), lerPct,
    });
}

console.log(`\n${'═'.repeat(78)}\n  SYSTEM: ${SISTEMA} · ENUNCIADO: ${ENUNCIADO}\n  candidato                    conserta  desviou  estraga  intacta  custo/frase  lê  arch`);
for (const p of placar) {
    if (p.erro) { console.log(`  ${p.rot.padEnd(28)} NÃO CARREGOU: ${p.erro.slice(0, 40)}`); continue; }
    console.log(`  ${p.rot.padEnd(28)} ${String(p.consertou + '/' + DEFEITOS.length).padStart(6)}`
        + `${p.vazio ? '(' + p.vazio + 'v)' : '   '}`
        + `${String(p.foraDoTema + '/' + DEFEITOS.length).padStart(9)}`
        + `${String(p.estragou + '/' + CERTAS.length).padStart(9)}`
        + `${String(p.intacta + '/' + CERTAS.length).padStart(9)}`
        + `${(p.custo.toFixed(1) + 's').padStart(12)}`
        + `${String(p.lidos + 'tok').padStart(8)}  ${p.arqui}`);
}
console.log(`\n  "desviou" = trocou a frase por outra que não responde à pergunta.`);
console.log(`  O placar de "conserta" NÃO desconta isso — leia as duas colunas juntas.`);
console.log(`  "intacta" = devolveu a frase boa SEM MEXER. É a virtude que ninguém mede:`);
console.log(`  o juiz erra, e quando erra é isto que separa um revisor de um reescritor.`);
await browser.close();
