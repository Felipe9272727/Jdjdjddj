/**
 * A ARQUITETURA COMPLETA, MEDIDA DE PONTA A PONTA.
 *
 * O desenho é do dono do jogo, e nesta ordem:
 *
 *   MoE rascunha EM INGLÊS → juiz NLI (em inglês) → tradutor → revisor 3B
 *   só para as frases que o juiz marcou → tela
 *
 * A reordenação que a medição pediu: **julgar ANTES de traduzir**. O mDeBERTa dá
 * contradição 0,94 em inglês e 0,29 em português no MESMO par de frases, então
 * julgar depois da tradução seria jogar fora a única janela em que ele enxerga.
 *
 * Contra: o caminho de hoje, o SmolLM3 escrevendo a fala inteira em português.
 *
 * Cada etapa é cronometrada separadamente. O wllama roda no navegador (é onde
 * ele roda) e o transformers.js roda aqui no Node; são sequenciais na mesma
 * máquina, então os tempos somam honestamente.
 */
import { chromium } from 'playwright';
import {
    AutoTokenizer, AutoModelForSequenceClassification, pipeline, env,
} from '@huggingface/transformers';

env.allowLocalModels = false;
const BASE = 'http://127.0.0.1:3311';

const PERSONA_PT = `Você é Nilo Azevedo, 29 anos, humano e ex-técnico de elevadores; agora é hóspede preso no 10º andar do hotel "The Normal Elevator", não dentro do elevador.
É observador, cauteloso, tem humor seco e vontades próprias. Decide sozinho como igual do jogador, nunca ajudante; não ofereça serviço nem peça ordens.
Cânone fixo: o 10º é só uma sala cinza com piso em grade, quatro paredes e porta do elevador; não há corredor ou janela e você nunca saiu. O elevador não lhe obedece. Você ignora quem controla o hotel e se ele termina. Hotel, elevador, Proprietário e Arquivista são entidades separadas de você. Nunca fale de IA, código, sistema ou prompt.
Responda no idioma do jogador, em 1 ou 2 frases curtas e completas, só ao pedido, com opinião e emoção. Pode perguntar de volta; se não souber, admita e nunca invente fatos. Responda somente com a fala de Nilo, sem rótulo.`;

const PERSONA_EN = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;

const PERGUNTAS = [
    ['Oi qual é o seu nome? Vc sabe porque estamos aqui?', 'Hi what is your name? Do you know why we are here?'],
    ['Esse hotel vai acabar algum dia?', 'Will this hotel ever end?'],
    ['Se eu chamar o elevador, ele vem?', 'If I call the elevator, will it come?'],
];

const CANONE_EN = [
    'I am Nilo Azevedo, 29 years old, human, and I was an elevator technician.',
    'I am trapped on the 10th floor of the hotel The Normal Elevator, not inside the elevator. I have never left this floor.',
    'The 10th floor is a grey room with four walls, a grate floor and the elevator door; there is no corridor and no window.',
    'The elevator does not obey me.',
    'I do not know who runs the hotel, nor whether the hotel ends.',
    'I am human, I am not an artificial intelligence.',
];

// ── AS TRAVAS BARATAS, QUE PEGAM O QUE O NLI NÃO PEGA ───────────────────
// A primeira rodada expôs o buraco: o juiz NLI marcou ZERO em três rascunhos
// que tinham rótulo vazando, modo assistente e a palavra "system". Nada disso
// é contradição FACTUAL do cânone — é erro de papel e de registro, e NLI não
// enxerga registro. O jogo já tem estas travas em `floor10Alucinacao`; aqui
// elas entram antes do NLI porque custam microssegundos.
// ── DOIS TIPOS DE DEFEITO, E SÓ UM MERECE UM LLM ────────────────────────
//
// A rodada anterior expôs um erro de FIAÇÃO meu, não do desenho: o juiz marcou
// "rótulo vazando" e eu mandei a frase para o 3B reescrever. Sessenta segundos
// para tirar um prefixo `"Nilo: "` — e ele nem conseguiu, devolveu o rótulo de
// volta com "( Correção a uma frase)" colado. Aquele um caso sozinho respondeu
// por 60 dos 87 segundos do pipeline inteiro.
//
// Defeito de FORMA (rótulo, eco do prompt) é conserto de string: custa
// microssegundos e nunca falha. Defeito de CONTEÚDO (contradiz o cânone,
// modo assistente) é o único que precisa de alguém que saiba escrever.
const LIMPEZAS = [
    { nome: 'rótulo', re: /^\s*nilo\s*:\s*/i, por: '' },
    { nome: 'aspas de fora', re: /^\s*["“](.*)["”]\s*$/s, por: '$1' },
    { nome: 'eco do prompt', re: /\s*\(?\s*(?:no label|nilo'?s line only|corre[cç][aã]o[^)]*)\)?\s*$/i, por: '' },
];
function limpar(frase) {
    let f = frase;
    const aplicadas = [];
    for (const l of LIMPEZAS) {
        if (l.re.test(f)) { f = f.replace(l.re, l.por).trim(); aplicadas.push(l.nome); }
    }
    return { texto: f, aplicadas };
}

// Estas SIM vão ao revisor: nenhuma delas é conserto de string.
const TRAVAS = [
    { nome: 'identidade trocada', re: /\byou'?re (?:the )?nilo\b|\byou are (?:the )?nilo\b/i },
    { nome: 'modo assistente', re: /\b(?:i'?m here to (?:assist|help)|how (?:can|may) i help|you should (?:remain|stay|try)|i can (?:only )?(?:assist|help))\b/i },
    { nome: 'fala de IA/sistema', re: /\b(?:i'?m an ai|artificial intelligence|language model|system (?:problem|error|issue))\b/i },
];
const travaQuePegou = (f) => TRAVAS.find((t) => t.re.test(f))?.nome ?? null;

const frasesDe = (t) => (t.match(/[^.!?…]+[.!?…]*/g) ?? [])
    .map((f) => f.trim()).filter((f) => f.length > 2).slice(0, 4);

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 140)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

async function subir(chave, arquivo, kv) {
    const r = await page.evaluate(async ({ base, k, arq, kvv }) => {
        const mod = await import(`${base}/wllama-cdn/index.js`);
        try {
            const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true });
            await w.loadModelFromUrl(`${base}/${arq}`, {
                n_ctx: 1536, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
                ...(kvv === 'f16' ? {} : { cache_type_k: kvv, cache_type_v: kvv }),
                jinja: true, reasoning: false, warmup: true,
            });
            window[k] = w;
            return 'ok';
        } catch (e) { return String(e?.message ?? e).slice(0, 200); }
    }, { base: BASE, k: chave, arq: arquivo, kvv: kv });
    return r;
}

async function falar(chave, persona, mensagens, maxTokens) {
    return page.evaluate(async ({ k, sys, msgs, max_tokens }) => {
        const res = await window[k].createChatCompletion({
            messages: [{ role: 'system', content: sys }, ...msgs],
            stream: false, max_tokens, temp: 0.2, top_p: 0.75, top_k: 20,
            cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
        });
        const ti = res?.timings ?? {};
        return {
            texto: (res?.choices?.[0]?.message?.content ?? '').trim(),
            ms: Math.round((ti.prompt_ms ?? 0) + (ti.predicted_ms ?? 0)),
        };
    }, { k: chave, sys: persona, msgs: mensagens, max_tokens: maxTokens });
}

console.log('── subindo as peças ──');
let t = Date.now();
console.log(`  rascunhador (granite a400m): ${await subir('__d', 'a400m.gguf', 'f16')} · ${Math.round((Date.now() - t) / 1000)}s`);
t = Date.now();
console.log(`  revisor (SmolLM3):           ${await subir('__r', 'smol3.gguf', 'q8_0')} · ${Math.round((Date.now() - t) / 1000)}s`);

t = Date.now();
const ID = 'onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX';
const tokNli = await AutoTokenizer.from_pretrained(ID);
const nli = await AutoModelForSequenceClassification.from_pretrained(ID, { dtype: 'int8' });
console.log(`  juiz (mDeBERTa int8):        ok · ${Math.round((Date.now() - t) / 1000)}s`);
t = Date.now();
const traduzir = await pipeline('translation', 'Xenova/m2m100_418M', { dtype: 'q8' });
console.log(`  tradutor (m2m100 418M):      ok · ${Math.round((Date.now() - t) / 1000)}s\n`);

async function contradiz(frase) {
    let pior = 0;
    for (const p of CANONE_EN) {
        const { logits } = await nli(tokNli(p, { text_pair: frase }));
        const v = Array.from(logits.data); const m = Math.max(...v);
        const e = v.map((x) => Math.exp(x - m)); const s = e.reduce((a, b) => a + b, 0);
        pior = Math.max(pior, e[2] / s);
    }
    return pior;
}

// Aquece as duas personas, como o jogo faz.
await falar('__d', PERSONA_EN, [{ role: 'user', content: 'hi' }], 1);
await falar('__r', PERSONA_PT, [{ role: 'user', content: 'oi' }], 1);

const somaA = { total: 0 };
const somaB = { rasc: 0, juiz: 0, trad: 0, rev: 0, total: 0 };

for (const [ptQ, enQ] of PERGUNTAS) {
    console.log(`\n════════ "${ptQ}"`);

    // ── A) O CAMINHO DE HOJE ─────────────────────────────────────────────
    let a = Date.now();
    const direto = await falar('__r', PERSONA_PT, [{ role: 'user', content: ptQ }], 56);
    const msA = Date.now() - a;
    somaA.total += msA;
    console.log(`  A) DIRETO ......... ${(msA / 1000).toFixed(1)}s`);
    console.log(`     ${JSON.stringify(direto.texto.slice(0, 110))}`);

    // ── B) O DESENHO DELE ────────────────────────────────────────────────
    a = Date.now();
    const rascunho = await falar('__d', PERSONA_EN, [{ role: 'user', content: enQ }], 56);
    const msRasc = Date.now() - a;
    a = Date.now();
    const cruas = frasesDe(rascunho.texto);
    const limpas = cruas.map(limpar);
    const frasesEn = limpas.map((l) => l.texto).filter((f) => f.length > 2);
    const consertosDeString = limpas.flatMap((l) => l.aplicadas);
    const msLimpeza = Date.now() - a;

    a = Date.now();
    const marcadas = [];
    for (const [i, f] of frasesEn.entries()) {
        const trava = travaQuePegou(f);
        const p = trava ? 1 : await contradiz(f);
        if (p >= 0.5) marcadas.push({ n: i + 1, frase: f, p, motivo: trava ?? 'contradiz o cânone' });
    }
    const msJuiz = Date.now() - a;

    // ── REVISOR ANTES DO TRADUTOR (ordem pedida pelo dono do jogo) ───────
    // A cadeia inteira fica em inglês até o fim: é onde o rascunhador escreve
    // melhor E onde o juiz enxerga (0,94 contra 0,29 no mesmo par). Traduzir
    // por último também significa traduzir o texto JÁ CORRIGIDO — na ordem
    // anterior, o revisor consertava em português um texto que o tradutor
    // podia ter estragado, e ninguém sabia de quem era o erro.
    const finais = [...frasesEn];
    a = Date.now();
    for (const m of marcadas) {
        const nova = await falar('__r', PERSONA_EN, [
            { role: 'user', content: enQ },
            {
                role: 'user',
                content: `\n\nCORRECTION. One sentence only.\n\nIn this reply of yours, this sentence is wrong:\n\n"${finais[m.n - 1]}"\n\nRewrite ONLY that sentence, corrected, in Nilo's voice. One sentence. No explaining.`,
            },
        ], 40);
        if (nova.texto.trim()) finais[m.n - 1] = nova.texto.trim();
    }
    const msRev = Date.now() - a;

    a = Date.now();
    const traduzidas = [];
    for (const f of finais) {
        const s = await traduzir(f, { src_lang: 'en', tgt_lang: 'pt' });
        traduzidas.push((s?.[0]?.translation_text ?? '').trim());
    }
    const msTrad = Date.now() - a;
    const msB = msRasc + msLimpeza + msJuiz + msTrad + msRev;

    somaB.rasc += msRasc; somaB.juiz += msJuiz; somaB.trad += msTrad;
    somaB.rev += msRev; somaB.total += msB;

    console.log(`  B) PIPELINE ....... ${(msB / 1000).toFixed(1)}s`
        + `  (rascunho ${(msRasc / 1000).toFixed(1)} · juiz ${(msJuiz / 1000).toFixed(1)}`
        + ` · revisor ${(msRev / 1000).toFixed(1)} · tradutor ${(msTrad / 1000).toFixed(1)})`);
    console.log(`     rascunho EN: ${JSON.stringify(rascunho.texto.slice(0, 100))}`);
    console.log(`     string limpou: ${consertosDeString.length ? consertosDeString.join(', ') : 'nada'}`);
    console.log(`     juiz marcou: ${marcadas.length ? marcadas.map((m) => `${m.n}: ${m.motivo}`).join(', ') : 'nenhuma'}`);
    console.log(`     FINAL PT:    ${JSON.stringify(traduzidas.join(' ').slice(0, 130))}`);
}

const n = PERGUNTAS.length;
console.log('\n════════════ MÉDIA POR FALA ════════════');
console.log(`A) SmolLM3 direto ......... ${(somaA.total / n / 1000).toFixed(1)}s`);
console.log(`B) pipeline completo ...... ${(somaB.total / n / 1000).toFixed(1)}s`);
console.log(`     rascunho (a400m EN) .. ${(somaB.rasc / n / 1000).toFixed(1)}s`);
console.log(`     juiz (mDeBERTa) ...... ${(somaB.juiz / n / 1000).toFixed(1)}s`);
console.log(`     revisor (SmolLM3 EN) . ${(somaB.rev / n / 1000).toFixed(1)}s`);
console.log(`     tradutor (m2m100) .... ${(somaB.trad / n / 1000).toFixed(1)}s`);
console.log(`\nB / A = ${(somaB.total / somaA.total).toFixed(2)}×   (< 1,00 = o desenho dele ganha)`);
await browser.close();
