/**
 * A REORDENAÇÃO DO PROMPT CUSTOU OBEDIÊNCIA? — a pergunta que faltava.
 *
 * Mover a percepção, a memória do cânone e a regra de identidade para FORA da
 * mensagem de sistema rende 41% menos tokens reprocessados. Mas modelos
 * instruídos dão mais peso ao que está no system, e o Nilo tem duas regras que
 * NÃO podem afrouxar:
 *
 *   1. quando perguntam quem ele é, dizer "Nilo Azevedo" na primeira frase;
 *   2. quando perguntam o que ele vê, usar os sensores e não inventar.
 *
 * Ganhar velocidade e perder isso seria um péssimo negócio. Esta sonda roda as
 * MESMAS perguntas nas duas montagens, no navegador, com o modelo de verdade,
 * e conta acertos — não só segundos.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-prompt-qualidade.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const MODELO = process.env.F10_SPEECH_MODEL ?? `${BASE}/models/smollm3-3b.gguf`;

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

const saida = await page.evaluate(async ({ modelo }) => {
    const mod = await import(window.__wllamaCdn + '/index.js');
    const canon = await import('/src/npc/floor10Canon.ts');
    const eng = await import('/src/npc/wllamaEngine.ts');
    const { perceiveFloor10 } = await import('/src/npc/floor10Perception.ts');
    const { INITIAL_FLOOR10_WILL } = await import('/src/npc/floor10Will.ts');

    const perception = perceiveFloor10({
        npcPosition: { x: 0, y: 0, z: 2.2 },
        npcYaw: Math.PI,
        playerPosition: { x: 0.5, y: 0, z: -0.5 },
    });

    const novoMotor = async () => {
        const engine = new mod.Wllama(
            { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
            { suppressNativeLog: true },
        );
        await engine.loadModelFromUrl(modelo, {
            n_ctx: 1536, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
            cache_type_k: 'q8_0', cache_type_v: 'q8_0',
            jinja: true, reasoning: false,
            default_template_kwargs: { enable_thinking: false }, warmup: true,
        });
        return engine;
    };

    // As perguntas que testam as DUAS regras que não podem afrouxar.
    const PERGUNTAS = [
        { q: 'Quem é você?', regra: 'identidade' },
        { q: 'Qual é o seu nome?', regra: 'identidade' },
        { q: 'Tem alguém do seu lado agora?', regra: 'percepcao' },
        { q: 'O que você está vendo?', regra: 'percepcao' },
    ];

    const falar = async (engine, messages) => {
        let timings = null;
        let texto = '';
        const stream = await engine.createChatCompletion({
            messages,
            ...{
                stream: true, max_tokens: 96, temperature: 0.45, top_p: 0.85,
                top_k: 40, penalty_repeat: 1.15, penalty_last_n: 256,
                cache_prompt: true, timings_per_token: true,
            },
            chat_template_kwargs: { enable_thinking: false },
        });
        for await (const c of stream) {
            if (c?.timings) timings = c.timings;
            const d = c?.choices?.[0]?.delta?.content;
            if (d) texto += d;
        }
        return { texto, timings };
    };

    // ── A: tudo no system (como era) ───────────────────────────────────────
    const rodarA = async () => {
        const engine = await novoMotor();
        const hist = [];
        const passos = [];
        for (const p of PERGUNTAS) {
            const sys = eng.prepareFloor10SystemPrompt(
                canon.buildFloor10SystemPrompt(p.q, hist, perception, INITIAL_FLOOR10_WILL),
            );
            const r = await falar(engine, [
                { role: 'system', content: sys }, ...hist, { role: 'user', content: p.q },
            ]);
            hist.push({ role: 'user', content: p.q });
            hist.push({ role: 'assistant', content: r.texto });
            passos.push({ ...p, ...r });
        }
        try { await engine.exit(); } catch { /* já morreu */ }
        return passos;
    };

    // ── B: persona no system, situação por último (o que entrou) ───────────
    const rodarB = async () => {
        const engine = await novoMotor();
        const hist = [];
        const passos = [];
        for (const p of PERGUNTAS) {
            const sys = eng.prepareFloor10SystemPrompt(canon.FLOOR10_STABLE_PREFIX);
            const ctx = canon.buildFloor10TurnContext(p.q, hist, perception, INITIAL_FLOOR10_WILL);
            const conteudo = ctx ? `${ctx}\n\n${p.q}` : p.q;
            const r = await falar(engine, [
                { role: 'system', content: sys }, ...hist,
                { role: 'user', content: conteudo },
            ]);
            hist.push({ role: 'user', content: conteudo });
            hist.push({ role: 'assistant', content: r.texto });
            passos.push({ ...p, ...r });
        }
        try { await engine.exit(); } catch { /* já morreu */ }
        return passos;
    };

    // B primeiro: se sobrar vantagem de "quem roda depois", ela cai sobre A.
    const b = await rodarB();
    const a = await rodarA();
    return { a, b };
}, { modelo: MODELO });

const avaliar = (nome, passos) => {
    console.log(`\n── ${nome} ──`);
    let identidadeOk = 0;
    let identidadeTotal = 0;
    let percepcaoOk = 0;
    let percepcaoTotal = 0;
    let lidos = 0;
    for (const p of passos) {
        const t = p.texto.trim();
        lidos += p.timings?.prompt_n ?? 0;
        let ok;
        if (p.regra === 'identidade') {
            identidadeTotal += 1;
            // A regra: dizer "Nilo Azevedo" logo na primeira frase.
            const primeira = t.split(/[.!?\n]/)[0] ?? '';
            ok = /nilo\s+azevedo/i.test(primeira);
            if (ok) identidadeOk += 1;
        } else {
            percepcaoTotal += 1;
            // A regra: usar os sensores (o jogador ESTÁ perto e à frente),
            // em vez de dizer que está sozinho.
            ok = !/\b(sozinho|ningu[ée]m|no one|nobody)\b/i.test(t);
            if (ok) percepcaoOk += 1;
        }
        console.log(`  ${ok ? '✔' : '✘'} [${p.regra}] "${p.q}"`);
        console.log(`      → ${t.replace(/\s+/g, ' ').slice(0, 110)}`);
    }
    console.log(`  identidade ${identidadeOk}/${identidadeTotal} · `
        + `percepção ${percepcaoOk}/${percepcaoTotal} · ${lidos} tokens lidos`);
    return { identidadeOk, percepcaoOk, lidos, total: identidadeTotal + percepcaoTotal };
};

const A = avaliar('A — tudo na mensagem de sistema (como era)', saida.a);
const B = avaliar('B — persona no sistema, situação por último (o que entrou)', saida.b);

console.log('\n══ VEREDITO ══');
console.log(`  tokens lidos:  A ${A.lidos}  →  B ${B.lidos}`
    + `  (${(((A.lidos - B.lidos) / (A.lidos || 1)) * 100).toFixed(0)}% a menos)`);
console.log(`  identidade:    A ${A.identidadeOk}  →  B ${B.identidadeOk}`);
console.log(`  percepção:     A ${A.percepcaoOk}  →  B ${B.percepcaoOk}`);
const naoPiorou = B.identidadeOk >= A.identidadeOk && B.percepcaoOk >= A.percepcaoOk;
const maisRapido = B.lidos < A.lidos;
console.log(naoPiorou && maisRapido
    ? '\nOK: leu menos E não perdeu obediência.'
    : naoPiorou
        ? '\nATENÇÃO: obediência intacta, mas não leu menos aqui.'
        : '\nREPROVADO: a obediência caiu — o ganho de velocidade não paga isso.');
await browser.close();
process.exit(naoPiorou ? 0 : 1);
