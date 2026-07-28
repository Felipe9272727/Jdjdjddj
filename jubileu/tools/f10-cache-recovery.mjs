/**
 * O cache do modelo pode ficar INCONSISTENTE: o wllama acha a entrada na
 * listagem, o arquivo não está lá, e a carga estoura "Model file not found".
 * Foi o que apareceu no celular do dono do jogo. O pior desse defeito é que ele
 * não passa sozinho — toda tentativa reencontra o mesmo registro quebrado.
 *
 * Este teste PROVOCA o estado ruim (apaga o arquivo e deixa o registro) e
 * verifica que o jogo se recupera baixando de novo, em vez de morrer no erro.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_MODEL_URL=http://127.0.0.1:3000/models/smollm3.gguf \
 *   node tools/f10-cache-recovery.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/floor10.html';
const budgetMs = Number(process.env.F10_BUDGET_MS ?? 600_000);

const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
    executablePath,
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer, bypass: '127.0.0.1,localhost' } } : {}),
    args: [
        '--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--unlimited-storage',
    ],
});
// Um contexto só: o cache precisa sobreviver entre as duas visitas.
const context = await browser.newContext({ viewport: { width: 900, height: 900 } });
const page = await context.newPage();
const modelUrl = process.env.F10_MODEL_URL;
await context.addInitScript(({ cdn, model }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__npcModelUrl = model;
}, { cdn: process.env.F10_WLLAMA_CDN, model: modelUrl });

async function esperarFase(alvo, limite) {
    const t0 = Date.now();
    let ultimo = '';
    while (Date.now() - t0 < limite) {
        const s = await page.evaluate(() => ({
            fase: window.__f10bench?.npc?.phase,
            texto: window.__f10bench?.npc?.loadText,
            erro: window.__f10bench?.npc?.error,
        })).catch(() => null);
        if (s?.texto && s.texto !== ultimo) {
            ultimo = s.texto;
            console.log(`   · ${s.texto}`);
        }
        if (s?.fase === alvo) return s;
        if (s?.fase === 'error' && alvo !== 'error') return s;
        await page.waitForTimeout(2500);
    }
    return null;
}

console.log('1) Carga limpa, para popular o cache…');
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });
await page.evaluate(() => { void window.__f10bench.initLLM(); });
const primeira = await esperarFase('ready', budgetMs / 2);
console.log('   primeira carga:', primeira?.fase, primeira?.erro ?? '');

console.log('2) QUEBRANDO o cache: apaga o arquivo e deixa o registro…');
const quebrou = await page.evaluate(async () => {
    const relatorio = [];
    // O wllama guarda em OPFS, não no Cache API. Apagamos o ARQUIVO do modelo
    // e preservamos a entrada de metadados: é exatamente o rastro que um
    // download interrompido deixa, e o que faz `open()` estourar.
    try {
        const raiz = await navigator.storage.getDirectory();
        for await (const [nome] of raiz.entries()) {
            if (/gguf/i.test(nome) && !/^metadata/i.test(nome)) {
                await raiz.removeEntry(nome);
                relatorio.push(`opfs:${nome.slice(0, 50)}`);
            }
        }
    } catch (e) {
        relatorio.push(`falhou: ${String(e).slice(0, 80)}`);
    }
    for (const nome of await caches.keys()) {
        const c = await caches.open(nome);
        for (const req of await c.keys()) {
            if (/gguf/i.test(req.url) && !/metadata/i.test(req.url)) {
                await c.delete(req);
                relatorio.push(`cache:${req.url.slice(-40)}`);
            }
        }
    }
    return relatorio;
});
console.log('   apagados:', quebrou.length ? quebrou.join(', ') : '(nada — cache usa OPFS)');

console.log('3) Recarregando a página e tentando de novo…');
await page.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10bench, { timeout: 120_000 });
await page.evaluate(() => { void window.__f10bench.initLLM(); });
const segunda = await esperarFase('ready', budgetMs / 2);
console.log('   segunda carga:', segunda?.fase, segunda?.erro ?? '');

const ok = segunda?.fase === 'ready';
console.log(ok
    ? '\nOK: o jogo se recuperou do cache quebrado sozinho'
    : '\nREPROVADO: continuou preso no erro');
await browser.close();
process.exit(ok ? 0 : 1);
