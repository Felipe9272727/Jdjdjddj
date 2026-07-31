/**
 * O WEBGPU DO WLLAMA LIGA MESMO? — a pergunta que vem antes do gerenciador.
 *
 * As strings `webgpu`/`wgpu` estão dentro do wllama.wasm, mas string em
 * binário não é backend funcionando. Antes de escrever uma IA que decide
 * quantas camadas vão para a GPU, é preciso saber se `n_gpu_layers > 0` faz
 * alguma coisa — ou se é ignorado em silêncio, que é o pior dos casos: a
 * medição diria "não mudou nada" e eu concluiria a coisa errada.
 *
 * Compara três cargas do MESMO modelo com 0, 3 e 8 camadas na GPU, e olha o
 * que o motor devolve em `getLoadedContextInfo` + a velocidade real.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-gpu-existe.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
// O 360M por padrão: a pergunta aqui é "liga?", não "quanto acelera" — e um
// modelo pequeno responde isso em um minuto em vez de dez.
const MODELO = process.env.F10_GPU_MODEL ?? `${BASE}/models/motor-360m.gguf`;
const CAMADAS = (process.env.F10_GPU_LAYERS ?? '0,3,8').split(',').map(Number);

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--enable-features=Vulkan',
        '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => {
    const t = m.text();
    if (/gpu|webgpu|wgpu|adapter|device/i.test(t)) console.log('  [console]', t.slice(0, 200));
});
await page.addInitScript(({ cdn }) => { window.__wllamaCdn = cdn; },
    { cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama` });
await page.goto(`${BASE}/?mente`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });

const adaptador = await page.evaluate(async () => {
    if (!('gpu' in navigator)) return { temApi: false };
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return { temApi: true, adapter: null };
        const info = adapter.info ?? {};
        return {
            temApi: true,
            adapter: {
                vendor: info.vendor ?? '?', architecture: info.architecture ?? '?',
                device: info.device ?? '?', description: info.description ?? '?',
            },
            limites: {
                maxBufferSize: adapter.limits?.maxBufferSize,
                maxStorageBufferBindingSize: adapter.limits?.maxStorageBufferBindingSize,
            },
            features: [...(adapter.features ?? [])].slice(0, 12),
        };
    } catch (e) { return { temApi: true, erro: String(e).slice(0, 200) }; }
});
console.log('── navigator.gpu ──');
console.log(JSON.stringify(adaptador, null, 2));

const linhas = [];
for (const camadas of CAMADAS) {
    process.stdout.write(`\n▸ n_gpu_layers=${camadas} … `);
    const r = await page.evaluate(async ({ modelo, camadas }) => {
        const mod = await import(window.__wllamaCdn + '/index.js');
        const engine = new mod.Wllama(
            { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
            { suppressNativeLog: false },
        );
        const t0 = Date.now();
        try {
            await engine.loadModelFromUrl(modelo, {
                n_ctx: 512, n_batch: 128, n_threads: 2,
                n_gpu_layers: camadas,
                jinja: true, reasoning: false, warmup: true,
                default_template_kwargs: { enable_thinking: false },
            });
        } catch (e) {
            return { erro: String(e).slice(0, 300) };
        }
        const carga = Date.now() - t0;
        let info = null;
        try { info = await engine.getLoadedContextInfo(); } catch { /* nem toda versão expõe */ }
        let timings = null;
        const stream = await engine.createChatCompletion({
            messages: [{ role: 'user', content: 'Escreva uma frase curta sobre um corredor vazio.' }],
            stream: true, max_tokens: 32, temperature: 0,
            timings_per_token: true,
            chat_template_kwargs: { enable_thinking: false },
        });
        for await (const c of stream) { if (c?.timings) timings = c.timings; }
        try { await engine.exit(); } catch { /* já morreu */ }
        return { carga, info, timings };
    }, { modelo: MODELO, camadas });

    if (r.erro) { console.log(`ERRO ${r.erro}`); linhas.push({ camadas, erro: r.erro }); continue; }
    console.log(`carga ${(r.carga / 1000).toFixed(1)}s · fala ${(r.timings?.predicted_per_second ?? 0).toFixed(2)} tok/s`);
    linhas.push({ camadas, ...r });
}

console.log('\n══ RESULTADO ══');
for (const l of linhas) {
    if (l.erro) { console.log(`  ${l.camadas} camadas → ERRO ${l.erro.slice(0, 120)}`); continue; }
    console.log(`  ${String(l.camadas).padStart(2)} camadas → `
        + `carga ${(l.carga / 1000).toFixed(1)}s · `
        + `fala ${(l.timings?.predicted_per_second ?? 0).toFixed(2)} tok/s`);
}
// A PERGUNTA CERTA É "A GPU ENTROU?", NÃO "O NÚMERO MUDOU?".
//
// A primeira versão desta linha comparava só a velocidade e concluiu "o
// backend está fazendo algo" a partir de 6,45 → 6,30 tok/s. É ruído, e a GPU
// nem tinha adaptador: o wllama imprimiu "Failed to get an adapter" nas três
// cargas. Uma sonda que aprova pelo ruído é pior que sonda nenhuma.
const temAdaptador = adaptador.temApi && !!adaptador.adapter;
console.log(`\n  navigator.gpu existe: ${adaptador.temApi}`);
console.log(`  adaptador concedido:  ${temAdaptador}`);
if (!temAdaptador) {
    console.log('\nGPU INDISPONÍVEL NESTA MÁQUINA — os números acima são todos CPU.');
    console.log('O que ESTE teste prova mesmo assim: a mensagem "ggml_webgpu:" no');
    console.log('console só pode vir de um backend WebGPU compilado dentro do wasm.');
    console.log('Ou seja, o suporte existe; medir o ganho depende de um aparelho');
    console.log('com adaptador de verdade.');
    process.exitCode = 2;
} else {
    const ok = linhas.filter((l) => !l.erro);
    const base = ok.find((l) => l.camadas === 0)?.timings?.predicted_per_second ?? 0;
    console.log('\nganho por degrau (sobre 0 camadas):');
    for (const l of ok.filter((x) => x.camadas > 0)) {
        const tps = l.timings?.predicted_per_second ?? 0;
        console.log(`  ${String(l.camadas).padStart(2)} camadas: ${(tps / (base || 1)).toFixed(2)}×`);
    }
}
await browser.close();
