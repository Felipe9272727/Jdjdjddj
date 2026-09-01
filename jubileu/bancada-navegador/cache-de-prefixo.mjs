// ── O `cache_prompt` VALE PARA O GRANITE? ────────────────────────────────
//
// A fala do Andar 10 real, medida pelos contadores do próprio motor:
//
//     turno 1 ... 337 lidos · leitura 67,8 s · 4,97 tok/s
//     turno 2 ... 459 lidos · leitura 89,1 s · 5,15 tok/s
//     turno 3 ... 565 lidos · leitura 110,3 s · 5,12 tok/s
//
// `reusados` (o `cache_n` do motor) não apareceu em NENHUM turno. O prompt
// inteiro é relido toda vez, e a leitura já custa 110 s dos 124 s do turno.
//
// Isso contradiz o que está escrito no `formatTimings`, medido no aparelho do
// dono do jogo: "321 lidos · 273 reaproveitados". Só que aquilo foi com o
// SmolLM3-3B — um transformer denso — e a fala hoje é o granite-4.0-h-tiny,
// que é HÍBRIDO (Mamba2 + atenção).
//
// A hipótese: o reaproveitamento de prefixo precisa de um cache que se possa
// TRUNCAR, e o estado recorrente de um SSM é sequencial — não dá para voltar a
// um ponto do meio. Se for isso, trocar a fala por um híbrido custou o cache de
// prefill, e o custo aparece justamente onde mais dói.
//
// Esta bancada põe os dois modelos no MESMO motor (`/wllama-relaxed`), com o
// MESMO prefixo, e lê `cache_n` na segunda chamada. Uma coluna responde.
//
//   DISABLE_HMR=true npm run dev
//   node bancada-navegador/cache-de-prefixo.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-andar10',
    porta: Number(process.env.PORTA_PONTE ?? 3461),
    guardarGrandes: 8,
    manterCache: true,
});
const contexto = await chromium.launchPersistentContext(process.env.PERFIL ?? '/home/user/perfil-andar10', {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = contexto.pages()[0] ?? await contexto.newPage();
await ponte.instalarEm(page);
page.on('console', (m) => { if (/erro|error/i.test(m.text())) console.log('  ‹c› ' + m.text().slice(0, 140)); });
await page.goto(`${VITE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

// ── A CONFIGURAÇÃO É A DO JOGO, E OS FIOS SÃO OS DO CELULAR DELE ─────────
//
// A primeira versão desta bancada carregava com `n_ctx: 2048` e KV em f16 — o
// jogo usa 1536 e `q8_0` — e com 2 fios, que é o que a regra escolhe nesta
// caixa de 4 núcleos. O dono do jogo olhou "leitura 69 s" e disse que no
// aparelho dele rodava na metade. Ele estava certo, e a causa foi medida
// (`fios-e-config.mjs`, granite, mesma config):
//
//     1 fio ..... leitura 138,7s ·  2,89 tok/s
//     2 fios .... leitura  69,8s ·  5,74 tok/s   ← o que esta caixa escolhe
//     4 fios .... leitura  39,2s · 10,23 tok/s   ← o que o celular dele escolhe
//
// Então a comparação passa a usar a config DO JOGO e 4 fios: o número que sai
// daqui é o que o aparelho dele vê, não o que esta caixa vê.
const CONFIG = await page.evaluate(async () => {
    const E = await import('/src/npc/wllamaEngine.ts');
    return { ...E.CPU_LOAD_CONFIG, n_threads: 4 };
});

const MODELOS = [
    {
        nome: 'granite-4.0-h-tiny 7B-A1B (híbrido Mamba+atenção)',
        url: 'https://huggingface.co/Felipe0282829273/granite4-h-tiny-q2k-shards/resolve/main/granite4-00001-of-00002.gguf',
    },
    {
        nome: 'Qwen3-0.6B (transformer denso)',
        url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    },
    // ── A TERCEIRA COLUNA EXISTE PARA MATAR AS OUTRAS EXPLICAÇÕES ────────
    //
    // O granite e o Qwen diferem em tudo: 2,59 GB contra 0,64, Q2_K contra
    // Q8_0, dois shards contra um arquivo, MoE contra denso. Com duas colunas
    // qualquer uma dessas diferenças serviria de causa.
    //
    // O LFM2.5 desempata: arquivo único, Q8_0, denso — igual ao Qwen em tudo
    // isso — e HÍBRIDO como o granite (a LFM2 alterna blocos convolucionais
    // com atenção). Se ele também não reaproveitar, o que separa as colunas é
    // a arquitetura, e nada mais.
    {
        nome: 'LFM2.5-1.2B (híbrido convolução+atenção)',
        url: 'https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/main/LFM2.5-1.2B-Instruct-Q8_0.gguf',
    },
    // ── E A COLUNA QUE DECIDE ────────────────────────────────────────────
    //
    // O SmolLM3-3B é quem o granite substituiu como cérebro de fala. Ele é
    // denso, então a pergunta prática não é "qual arquitetura reaproveita" — é
    // quanto o jogador espera com um e com o outro, do começo ao fim do turno.
    {
        nome: 'SmolLM3-3B (denso — o que o granite substituiu)',
        url: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf',
    },
];

// Um prefixo longo o bastante para o reaproveitamento aparecer, e uma cauda que
// muda — que é a forma do jogo: persona fixa, pergunta nova.
const PERSONA = ('You are Nilo Azevedo, 29, a former elevator technician, now trapped on the 10th floor '
    + 'of the hotel "The Normal Elevator". The 10th floor is a grey room with a grate floor, four walls '
    + 'and the elevator door; there is no corridor and no window, and you have never left. The elevator '
    + 'does not obey you. You do not know who runs the hotel or whether it ends. You are observant, '
    + 'cautious and dry-humoured, and you decide for yourself, never as a helper. Answer in one short '
    + 'complete sentence, as Nilo, with no label.\n').repeat(3);
const PERGUNTAS = ['Hi, what is your name?', 'How long have you been here?', 'Is there a way down?'];

console.log('');
for (const modelo of MODELOS) {
    console.log(`\n  ${modelo.nome}`);
    const linhas = await page.evaluate(async ({ url, persona, perguntas, base }) => {
        const mod = await import(/* @vite-ignore */ '/wllama-relaxed/index.js');
        const w = new mod.Wllama({ default: '/wllama-relaxed/wasm/wllama.wasm' }, { suppressNativeLog: true });
        await w.loadModelFromUrl(url, base);
        const saida = [];
        for (const p of perguntas) {
            let t = null;
            const fluxo = await w.createChatCompletion({
                messages: [{ role: 'system', content: persona }, { role: 'user', content: p }],
                nPredict: 24,
                stream: true,
                cache_prompt: true,
                timings_per_token: true,
                sampling: { temp: 0.2 },
            });
            for await (const pedaco of fluxo) { if (pedaco.timings) t = pedaco.timings; }
            saida.push({
                pergunta: p,
                lidos: t?.prompt_n ?? null,
                reusados: t?.cache_n ?? null,
                ms: t?.prompt_ms ?? null,
                msFala: t?.predicted_ms ?? null,
            });
        }
        await w.exit?.();
        return saida;
    }, { url: modelo.url, persona: PERSONA, perguntas: PERGUNTAS, base: CONFIG });
    for (const l of linhas) {
        const reuso = l.reusados === null ? 'campo ausente' : String(l.reusados);
        const total = ((l.ms ?? 0) + (l.msFala ?? 0)) / 1000;
        console.log(`    ${String(l.pergunta).padEnd(30)} lidos ${String(l.lidos).padStart(5)}`
            + ` · reaproveitados ${reuso.padStart(5)} · leitura ${((l.ms ?? 0) / 1000).toFixed(1).padStart(5)}s`
            + ` · fala ${((l.msFala ?? 0) / 1000).toFixed(1).padStart(4)}s · TURNO ${total.toFixed(1).padStart(6)}s`);
    }
    // O que o jogador espera de fato: o primeiro turno é frio para todo mundo,
    // e a conversa acontece do segundo em diante.
    const seguintes = linhas.slice(1);
    if (seguintes.length) {
        const m = seguintes.reduce((a, l) => a + ((l.ms ?? 0) + (l.msFala ?? 0)), 0) / seguintes.length / 1000;
        console.log(`    ${''.padEnd(30)} → média dos turnos seguintes ao primeiro: ${m.toFixed(1)}s`);
    }
}
console.log('');
await contexto.close();
ponte.fechar();
