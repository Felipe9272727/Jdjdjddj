/**
 * O GERENTE DE GPU, NO NAVEGADOR DE VERDADE.
 *
 * Os testes de unidade provam a LÓGICA do gerente com números inventados.
 * Esta sonda prova o CAMINHO: que ele pergunta pelo adaptador antes de
 * acreditar em `navigator.gpu`, que se declara indisponível quando não recebe
 * um, e que a etiqueta do jogo não anuncia "WebGPU×3" enquanto roda na CPU.
 *
 * É a diferença entre "tem a API" e "tem GPU" — e foi por não perguntar isso
 * que o gerente creditaria à GPU um desempenho que era da CPU pura.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-gpu-gerente.mjs
 */
import { chromium } from 'playwright';
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0,200)));
await page.addInitScript(({cdn,m}) => { window.__wllamaCdn=cdn; window.__npcModelUrl=m; },
  { cdn:'http://127.0.0.1:3000/wllama', m:'http://127.0.0.1:3000/models/motor-360m.gguf' });
await page.goto('http://127.0.0.1:3000/?mente', { waitUntil:'domcontentloaded', timeout:180000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout:120000 });
const r = await page.evaluate(async () => {
    const gpu = await import('/src/npc/floor10Gpu.ts');
    const eng = await import('/src/npc/wllamaEngine.ts');
    const antes = gpu.floor10Gpu.snapshot();
    const adaptador = await gpu.probeWebGpuAdapter();
    // Carrega o cérebro de fala apontado para o modelo pequeno: o que interessa
    // é o CAMINHO da decisão, não a qualidade da fala.
    let erro = null;
    try { await eng.initLLM(); } catch (e) { erro = String(e).slice(0,200); }
    return {
        antes, adaptador, erro,
        depois: gpu.floor10Gpu.snapshot(),
        camadasEscolhidas: eng.speechGpuLayerCount(),
        etiqueta: (await import('/src/npc/npcStore.ts')).npc.modelLabel,
    };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
