/**
 * Verifica a SEGUNDA PASSADA (o resgate por gramática) no navegador de verdade.
 *
 * Três rodadas na mesma instância carregada:
 *   1. pensamento livre em stream (o que a sala da mente mostra), despejando os
 *      pedaços crus — se vier 0 token, o motivo aparece aqui;
 *   2. RESGATE FORÇADO: teto de 8 tokens. Nenhum raciocínio assina "CHOICE:"
 *      em 8 tokens, então a decisão SÓ pode vir da segunda passada;
 *   3. o caminho do JOGO (deliberateFloor10, não-stream), ponta a ponta.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_SMALL_MODEL=http://127.0.0.1:3000/models/minicpm5-1b.gguf \
 *   node tools/f10-resgate.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/?mente';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
await page.addInitScript(({ cdn, model }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (model) window.__smallBrainModelUrl = model;
}, { cdn: process.env.F10_WLLAMA_CDN, model: process.env.F10_SMALL_MODEL });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });
console.log('sala da mente montou');

const saida = await page.evaluate(async () => {
    const mod = await import('/src/npc/floor10SmallBrain.ts');
    const { perceiveFloor10 } = await import('/src/npc/floor10Perception.ts');
    const { npc } = await import('/src/npc/npcStore.ts');
    const perception = perceiveFloor10({
        npcPosition: { x: 0, y: 0, z: 2.2 },
        npcYaw: Math.PI,
        playerPosition: { x: 0.5, y: 0, z: -0.5 },
    });
    const input = {
        perception,
        drives: { social: 1, curiosity: 0.45, restlessness: 0.4, fatigue: 0.2 },
        memory: {
            inspectedElevatorCount: 3, sleeps: 44, playerSilentSeconds: 30,
            lastGoals: ['idle'], agreedAction: null, agreedReason: null,
        },
        now: 1,
    };
    const observar = async (maxTokens, guardarPedacos) => {
        const pedacos = [];
        const t0 = Date.now();
        const r = await mod.deliberarObservando({ ...input }, {
            useGrammar: false,
            maxTokens,
            timeoutMs: 300_000,
            onToken: () => undefined,
            onChunk: (c) => {
                if (guardarPedacos && pedacos.length < 6) pedacos.push(c);
            },
        });
        return {
            raw: r.raw, tokens: r.tokens, erro: r.erro, loop: r.loop,
            decided: r.decided?.goal ?? null, resgate: r.resgate ?? null,
            ms: Date.now() - t0, pedacos,
        };
    };

    const livre = await observar(320, true);
    const forcado = await observar(8, false);

    const t = Date.now();
    const jogo = await mod.deliberateFloor10({ ...input, now: 2 });
    return {
        livre,
        forcado,
        jogo: {
            goal: jogo?.goal ?? null,
            rationale: jogo?.rationale?.slice(0, 200) ?? null,
            ms: Date.now() - t,
            fase: npc.deliberationPhase,
            texto: npc.deliberationLoadText,
        },
    };
});

const mostra = (nome, r) => {
    console.log(`\n=== ${nome} ===`);
    console.log('tokens :', r.tokens, '·', (r.ms / 1000).toFixed(1) + 's',
        r.loop ? '· ↻ LOOP' : '', r.erro ? `· erro: ${r.erro}` : '');
    console.log('decisão:', r.decided, '· resgate:', JSON.stringify(r.resgate));
    console.log('texto  :', JSON.stringify(r.raw).slice(0, 900));
    for (const [i, c] of r.pedacos.entries()) {
        console.log(`  pedaço[${i}] ${JSON.stringify(c).slice(0, 200)}`);
    }
};

mostra('1. PENSAMENTO LIVRE (320 tokens)', saida.livre);
mostra('2. RESGATE FORÇADO (teto de 8 tokens)', saida.forcado);
console.log('\n=== 3. CAMINHO DO JOGO (deliberateFloor10) ===');
console.log((saida.jogo.ms / 1000).toFixed(1) + 's · meta:', saida.jogo.goal);
console.log('fase   :', saida.jogo.fase, '·', saida.jogo.texto);
console.log('razão  :', JSON.stringify(saida.jogo.rationale));

const ok = saida.forcado.resgate !== null && saida.forcado.decided !== null
    && saida.jogo.goal !== null;
console.log(ok
    ? '\nOK: o resgate assina quando o pensamento não assina, e o jogo decide'
    : '\nREPROVADO');
await browser.close();
process.exit(ok ? 0 : 1);
