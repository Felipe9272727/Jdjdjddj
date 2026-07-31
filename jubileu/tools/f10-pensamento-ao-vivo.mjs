/**
 * DÁ PARA VER O NILO PENSANDO? — e quanto custa cada rodada.
 *
 * Duas perguntas de quem joga, na mesma sonda:
 *   1. "nunca sei se ele está pensando ou não" → o texto cru chega à tela
 *      enquanto nasce, ou só no fim?
 *   2. "está demorando muito pra pensar" → quanto tempo, quantos tokens,
 *      quantos tok/s, com quantos núcleos.
 *
 * Roda o caminho do JOGO (`deliberateFloor10`, não o observado da sala da
 * mente) DUAS vezes: a segunda existe para provar que encerrar a leitura na
 * assinatura não estraga a rodada seguinte — o defeito clássico de abortar um
 * wllama que ainda está ocupado.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-pensamento-ao-vivo.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const VONTADE = process.env.F10_SMALL_MODEL ?? `${BASE}/models/vontade.gguf`;

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
await page.addInitScript(({ cdn, vontade }) => {
    window.__wllamaCdn = cdn;
    window.__smallBrainModelUrl = vontade;
    // O tradutor motor é outra LLM e outro download; esta sonda mede o
    // pensamento, então ele fica de fora.
    window.__motorBrainModelUrl = 'about:blank';
}, { cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama`, vontade: VONTADE });
await page.goto(`${BASE}/?mente`, { waitUntil: 'load', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });

const r = await page.evaluate(async () => {
    const app = window.__f10mente;
    const entrada = () => ({
        perception: app.perceiveFloor10({
            npcPosition: { x: 0, y: 0, z: 0 },
            npcYaw: 0,
            playerPosition: { x: 2.4, y: 0, z: 1.1 },
        }),
        drives: { curiosity: 0.7, loneliness: 0.55, fear: 0.2, energy: 0.8 },
        memory: {
            inspectedElevatorCount: 3,
            sleeps: 44,
            playerSilentSeconds: 30,
            lastGoals: ['idle'],
            agreedAction: null,
            agreedReason: null,
        },
        now: Date.now() / 1000,
        threads: app.smallBrainThreads(),
    });

    const carregou = await app.precarregarVontade();
    if (!carregou) return { erro: app.npc.deliberationLoadText || 'não carregou' };

    // AMOSTRAS DO TEXTO AO VIVO: se ele só aparecesse no fim, todas as leituras
    // durante a rodada viriam vazias — é exatamente esse o defeito relatado.
    const amostras = [];
    const relogio = setInterval(() => {
        amostras.push({
            t: Date.now(),
            chars: app.npc.deliberationLive.length,
            fase: app.npc.deliberationPhase,
        });
    }, 400);

    const rodadas = [];
    for (let i = 0; i < 2; i += 1) {
        const t0 = Date.now();
        const decidiu = await app.deliberateFloor10(entrada());
        rodadas.push({
            ms: Date.now() - t0,
            goal: decidiu?.goal ?? null,
            chars: app.npc.deliberationLive.length,
            tps: app.npc.deliberationTps,
            threads: app.npc.deliberationThreads,
            segundos: app.npc.deliberationSeconds,
            texto: app.npc.deliberationLive.slice(0, 400),
            aviso: app.npc.deliberationLoadText,
        });
    }
    clearInterval(relogio);

    // Quantas leituras pegaram o texto AINDA CRESCENDO?
    let crescendo = 0;
    for (let i = 1; i < amostras.length; i += 1) {
        if (amostras[i].chars > amostras[i - 1].chars) crescendo += 1;
    }
    return { rodadas, amostras: amostras.length, crescendo };
});

if (r.erro) {
    console.log(`\n✘ ${r.erro}`);
    await browser.close();
    process.exit(1);
}

console.log('\n── DÁ PARA VER ELE PENSANDO? ──');
console.log(`  leituras durante as rodadas: ${r.amostras}`);
console.log(`  leituras em que o texto TINHA CRESCIDO: ${r.crescendo}`);
console.log('  (zero aqui = o texto só aparece no fim, que é o defeito relatado)');

console.log('\n── O QUE CADA RODADA CUSTOU ──');
for (const [i, d] of r.rodadas.entries()) {
    console.log(`\n  rodada ${i + 1}:`);
    console.log(`    decidiu:  ${d.goal ?? '(nada)'}`);
    console.log(`    tempo:    ${(d.ms / 1000).toFixed(1)}s`);
    console.log(`    ritmo:    ${d.tps.toFixed(2)} tok/s · CPU×${d.threads}`);
    console.log(`    texto:    ${d.chars} caracteres`);
    console.log(`    aviso:    ${d.aviso}`);
    console.log(`    ─ pensamento ─\n${d.texto.split('\n').map((l) => `      ${l}`).join('\n')}`);
}

const ok = r.crescendo > 0
    && r.rodadas.every((d) => d.chars > 0)
    && r.rodadas[1].goal !== null;
console.log('\n── VEREDITO ──');
console.log(`  o pensamento aparece enquanto nasce: ${r.crescendo > 0}`);
console.log(`  a SEGUNDA rodada continua decidindo: ${r.rodadas[1].goal !== null}`);
console.log(ok ? '\nOK' : '\nREPROVADO');
await browser.close();
process.exit(ok ? 0 : 1);
