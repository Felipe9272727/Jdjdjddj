/**
 * ONDE COLOCAR O QUE MUDA — a técnica que sobra depois de esgotar os botões.
 *
 * O `cache_prompt` do llama.cpp guarda o KV do PREFIXO COMUM entre uma chamada
 * e a seguinte. Ele para de valer no primeiro token diferente. E o prompt do
 * Nilo é montado assim hoje:
 *
 *     [ PERSONA fixa ][ memória do cânone ][ percepção ][ vontade ] + histórico
 *                       └──────────── tudo isto MUDA a cada fala ───────────┘
 *
 * Ou seja: o que muda está no MEIO. Toda fala invalida o cache dali para
 * frente — inclusive o histórico inteiro, que vem depois e nem mudou.
 *
 * A alternativa não custa qualidade nenhuma, só ordem: persona primeiro,
 * histórico depois, e o que muda POR ÚLTIMO. Aí o prefixo comum passa a ser
 * "persona + histórico", que só cresce no fim — cache perfeito.
 *
 * Esta sonda mede as duas montagens em 3 falas seguidas, com percepção e
 * cânone mudando de verdade entre elas, e conta quantos tokens cada uma
 * precisou reprocessar. Menos tokens reprocessados = menos espera.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-prompt-cache.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const MODELO = process.env.F10_SPEECH_MODEL ?? `${BASE}/models/smollm3-3b.gguf`;
const THREADS = Number(process.env.F10_THREADS ?? 4);

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
await page.addInitScript(({ cdn }) => { window.__wllamaCdn = cdn; },
    { cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama` });
await page.goto(`${BASE}/?mente`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });

const saida = await page.evaluate(async ({ modelo, threads }) => {
    const mod = await import(window.__wllamaCdn + '/index.js');
    // UM MOTOR NOVO PARA CADA MONTAGEM. Na primeira versão desta sonda as duas
    // dividiam o mesmo motor, e a montagem B começava com o KV já quente do que
    // a A tinha deixado — a primeira fala dela "reaproveitou" 387 tokens que
    // ela não tinha pago. Comparação suja: a B saía com vantagem de graça.
    const novoMotor = async () => {
        const engine = new mod.Wllama(
            { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
            { suppressNativeLog: true },
        );
        await engine.loadModelFromUrl(modelo, {
            n_ctx: 1536, n_batch: 512, n_threads: threads, n_gpu_layers: 0,
            cache_type_k: 'q8_0', cache_type_v: 'q8_0',
            jinja: true, reasoning: false,
            default_template_kwargs: { enable_thinking: false }, warmup: true,
        });
        return engine;
    };

    const PERSONA = ('Você é Nilo Azevedo, hóspede preso no décimo andar de um hotel '
        + 'que não devia existir. Fala pouco, em português, frases curtas e secas. '
        + 'Nunca inventa fatos sobre o hotel nem sobre o próprio passado. ').repeat(6);
    // As três falas do jogador, e o que MUDA junto com elas: a memória puxada
    // do cânone, a percepção dos olhos e a vontade do momento. É exatamente
    // este trio que o jogo recalcula a cada mensagem.
    const TURNOS = [
        {
            pergunta: 'quem é você?',
            volatil: 'SUA MEMÓRIA: você trabalhava conferindo notas fiscais.'
                + '\nPERCEPÇÃO: jogador a 2.7m, à sua frente, dentro do campo de visão.'
                + '\nVONTADE ATUAL: ficar em silêncio por um instante.',
        },
        {
            pergunta: 'o que você está vendo agora?',
            volatil: 'SUA MEMÓRIA: sua última lembrança é o cheiro de café frio.'
                + '\nPERCEPÇÃO: jogador a 1.1m, à sua esquerda, muito perto.'
                + '\nVONTADE ATUAL: se aproximar do elevador e olhar a fresta.',
        },
        {
            pergunta: 'você quer sair daqui?',
            volatil: 'SUA MEMÓRIA: você não lembra de ter entrado no elevador.'
                + '\nPERCEPÇÃO: jogador a 4.9m, atrás de você, fora do campo de visão.'
                + '\nVONTADE ATUAL: andar até a parede oeste e escutar.',
        },
    ];

    const falar = async (engine, messages) => {
        let timings = null;
        let texto = '';
        const stream = await engine.createChatCompletion({
            messages,
            stream: true,
            max_tokens: 24,
            temperature: 0.45,
            cache_prompt: true,
            timings_per_token: true,
            chat_template_kwargs: { enable_thinking: false },
        });
        for await (const c of stream) {
            if (c?.timings) timings = c.timings;
            const d = c?.choices?.[0]?.delta?.content;
            if (d) texto += d;
        }
        return { timings, texto };
    };

    // ── MONTAGEM A: o que muda fica NO MEIO do system (como é hoje) ────────
    const rodarA = async () => {
        const engine = await novoMotor();
        const hist = [];
        const passos = [];
        for (const t of TURNOS) {
            const messages = [
                { role: 'system', content: '/system_override /no_think\n' + PERSONA + '\n\n' + t.volatil },
                ...hist,
                { role: 'user', content: t.pergunta },
            ];
            const r = await falar(engine, messages);
            hist.push({ role: 'user', content: t.pergunta });
            hist.push({ role: 'assistant', content: r.texto.slice(0, 120) });
            passos.push(r.timings ?? {});
        }
        try { await engine.exit(); } catch { /* já morreu */ }
        return passos;
    };

    // ── MONTAGEM B: persona, histórico, e o que muda POR ÚLTIMO ────────────
    const rodarB = async () => {
        const engine = await novoMotor();
        const hist = [];
        const passos = [];
        for (const t of TURNOS) {
            const messages = [
                { role: 'system', content: '/system_override /no_think\n' + PERSONA },
                ...hist,
                { role: 'user', content: `${t.volatil}\n\n${t.pergunta}` },
            ];
            const r = await falar(engine, messages);
            hist.push({ role: 'user', content: `${t.volatil}\n\n${t.pergunta}` });
            hist.push({ role: 'assistant', content: r.texto.slice(0, 120) });
            passos.push(r.timings ?? {});
        }
        try { await engine.exit(); } catch { /* já morreu */ }
        return passos;
    };

    // A ordem também importa: B primeiro, para que se sobrar qualquer vantagem
    // de "quem roda depois", ela caia sobre a montagem de HOJE, não sobre a
    // que eu quero aprovar.
    const b = await rodarB();
    const a = await rodarA();
    return { a, b };
}, { modelo: MODELO, threads: THREADS });

const resumo = (nome, passos) => {
    console.log(`\n── ${nome} ──`);
    let lidos = 0;
    let ms = 0;
    passos.forEach((t, i) => {
        lidos += t.prompt_n ?? 0;
        ms += t.prompt_ms ?? 0;
        console.log(`  fala ${i + 1}: ${String(t.prompt_n ?? 0).padStart(4)} tokens lidos · `
            + `${String(t.cache_n ?? 0).padStart(4)} reaproveitados · `
            + `${((t.prompt_ms ?? 0) / 1000).toFixed(1)}s de leitura`);
    });
    console.log(`  TOTAL: ${lidos} tokens lidos · ${(ms / 1000).toFixed(1)}s`);
    return { lidos, ms };
};
const A = resumo('MONTAGEM A — o que muda no MEIO (como é hoje)', saida.a);
const B = resumo('MONTAGEM B — o que muda POR ÚLTIMO', saida.b);

console.log('\n══ VEREDITO ══');
console.log(`  tokens reprocessados:  A ${A.lidos}  →  B ${B.lidos}`
    + `   (${(((A.lidos - B.lidos) / (A.lidos || 1)) * 100).toFixed(0)}% a menos)`);
console.log(`  tempo só de leitura:   A ${(A.ms / 1000).toFixed(1)}s  →  B ${(B.ms / 1000).toFixed(1)}s`
    + `   (${((A.ms - B.ms) / 1000).toFixed(1)}s economizados em 3 falas)`);
await browser.close();
