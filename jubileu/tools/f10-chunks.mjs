/**
 * O texto do cérebro pequeno chegou EMBARALHADO na sala da mente:
 * "CHOICE: idle" virou "OSE: idleCHO", ": idleCHO", " idleCHOOSE".
 *
 * Isto não se resolve lendo bundle: aqui despejamos cada PEDAÇO CRU do stream,
 * em ordem de chegada, por várias rodadas seguidas. Se os pedaços já vierem
 * fora de ordem, o defeito é do transporte; se vierem certos e o texto montado
 * sair torto, o defeito é meu.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_SMALL_MODEL=http://127.0.0.1:3000/models/smollm3.gguf \
 *   node tools/f10-chunks.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/?mente';
const rodadas = Number(process.env.F10_ROUNDS ?? 4);

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
await page.addInitScript(({ cdn, model }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__smallBrainModelUrl = model;
}, { cdn: process.env.F10_WLLAMA_CDN, model: process.env.F10_SMALL_MODEL });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });

const saida = await page.evaluate(async (n) => {
    const mod = await import('/src/npc/floor10SmallBrain.ts');
    const { perceiveFloor10 } = await import('/src/npc/floor10Perception.ts');
    const perception = perceiveFloor10({
        npcPosition: { x: 0, y: 0, z: 2.2 },
        npcYaw: Math.PI,
        playerPosition: { x: 0.5, y: 0, z: -0.5 },
    });
    const relatorio = [];
    for (let i = 0; i < n; i += 1) {
        const chunks = [];
        const r = await mod.deliberarObservando(
            {
                perception,
                drives: { social: 1, curiosity: 0.45, restlessness: 0.4, fatigue: 0.2 },
                memory: {
                    inspectedElevatorCount: 3, sleeps: 44, playerSilentSeconds: 30,
                    lastGoals: ['idle'], agreedAction: null, agreedReason: null,
                },
                now: i,
            },
            {
                useGrammar: false,
                maxTokens: 64,
                timeoutMs: 240_000,
                onToken: () => undefined,
                // Guarda a FORMA do pedaço, não só o texto: é ela que diz se o
                // transporte manda delta, texto acumulado, ou as duas coisas.
                onChunk: (c) => chunks.push(JSON.parse(JSON.stringify(c))),
            },
        );
        relatorio.push({ raw: r.raw, tokens: r.tokens, erro: r.erro, chunks });
    }
    return relatorio;
}, rodadas);

for (const [i, r] of saida.entries()) {
    console.log(`\n=== RODADA ${i + 1} ===`);
    console.log('montado :', JSON.stringify(r.raw));
    console.log('tokens  :', r.tokens, r.erro ? `· erro ${r.erro}` : '');
    console.log('pedaços :');
    for (const [j, c] of r.chunks.entries()) {
        console.log(`  [${j}] ${JSON.stringify(c).slice(0, 200)}`);
    }
}
await browser.close();
