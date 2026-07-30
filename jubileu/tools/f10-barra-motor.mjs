/**
 * A BARRA DO TRADUTOR MOTOR — o terceiro modelo baixando à vista.
 *
 * O pedido do dono do jogo foi direto: "e o modelo de 365 m? Vc tem que colocar
 * numa barra de download junto do 1b". Antes disto o motor de 386 MB descia
 * publicando nos campos da DELIBERAÇÃO — a tela mostrava uma barra rotulada
 * "Llama 3.2 1B" andando com o progresso de outro arquivo.
 *
 * Esta sonda baixa o modelo DE VERDADE, no navegador, e responde três coisas
 * que só o navegador pode responder:
 *   1. a barra do motor enche (bytes, velocidade e ETA de verdade);
 *   2. os campos do 1B NÃO são tocados enquanto isso;
 *   3. a caixa aparece renderizada na tela (screenshot).
 *
 * Uso:
 *   CHROMIUM_PATH=... node tools/f10-barra-motor.mjs
 *   (com `npm run dev` servindo em http://127.0.0.1:3000)
 */
import { chromium } from 'playwright';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';

// ── SERVIDOR LENTO ────────────────────────────────────────────────────────
// O arquivo está no disco daqui; servido à vontade ele desce em 2 segundos e
// a barra pisca sem nunca mostrar bytes intermediários — que é justamente o
// que eu preciso ver. Este servidor entrega a ~6 MB/s, que é a ordem de
// grandeza de um celular em 4G, para o medidor ter o que medir.
const ARQUIVO = process.env.F10_MOTOR_FILE
    ?? new URL('../public/models/motor-360m.gguf', import.meta.url).pathname;
const BYTES_POR_S = Number(process.env.F10_MOTOR_BPS ?? 6_000_000);
const PORTA_MODELO = 3100;

const servidor = createServer((req, res) => {
    const total = statSync(ARQUIVO).size;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(total));
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.method === 'HEAD') { res.end(); return; }
    // Blocos de 1/10 de segundo, com pausa entre eles: o `progressCallback` do
    // wllama recebe amostras espaçadas, como no celular.
    const stream = createReadStream(ARQUIVO, { highWaterMark: BYTES_POR_S / 10 });
    stream.on('data', (bloco) => {
        stream.pause();
        res.write(bloco);
        setTimeout(() => stream.resume(), 100);
    });
    stream.on('end', () => res.end());
});
await new Promise((r) => servidor.listen(PORTA_MODELO, '127.0.0.1', r));
console.log(`modelo servido a ${(BYTES_POR_S / 1e6).toFixed(0)} MB/s em :${PORTA_MODELO}`);

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
await page.addInitScript(({ cdn, motor }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (motor) window.__motorBrainModelUrl = motor;
}, {
    cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama`,
    motor: process.env.F10_MOTOR_MODEL ?? `http://127.0.0.1:${PORTA_MODELO}/motor.gguf`,
});

await page.goto(`${BASE}/?mente`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });
console.log('página montou · isolado:', await page.evaluate(() => crossOriginIsolated));

// A carga roda solta; o Node fica lendo o estado publicado enquanto ela anda.
await page.evaluate(() => {
    window.__amostras = [];
    window.__fim = null;
    (async () => {
        const store = await import('/src/npc/npcStore.ts');
        const motor = await import('/src/npc/floor10MotorBrain.ts');
        const { perceiveFloor10 } = await import('/src/npc/floor10Perception.ts');
        // Marca os campos do 1B com valores reconhecíveis ANTES da carga: se o
        // motor encostar neles, aparece aqui.
        store.npcSet({
            deliberationPhase: 'thinking',
            deliberationLoadProgress: 0.5,
            deliberationLoadText: 'MARCA-DO-1B',
        });
        const relogio = setInterval(() => {
            const s = store.npc;
            window.__amostras.push({
                t: Date.now(),
                fase: s.motorPhase,
                pct: s.motorLoadProgress,
                bytes: s.motorDownload.bytes,
                total: s.motorDownload.totalBytes,
                rate: s.motorDownload.rate,
                eta: s.motorDownload.etaSec,
                parado: s.motorDownload.stalledSec,
                texto: s.motorLoadText,
                delibPct: s.deliberationLoadProgress,
                delibTexto: s.deliberationLoadText,
                delibFase: s.deliberationPhase,
            });
        }, 500);
        const perception = perceiveFloor10({
            npcPosition: { x: 0, y: 0, z: 2.2 },
            npcYaw: Math.PI,
            playerPosition: { x: 0.5, y: 0, z: -0.5 },
        });
        let plano = null;
        let erro = null;
        const t0 = Date.now();
        try {
            plano = await motor.translateFloor10MotorThought(
                'He has been quiet for a long time. I want to get closer.',
                perception,
                null,
            );
        } catch (e) { erro = String(e).slice(0, 200); }
        clearInterval(relogio);
        window.__fim = { plano, erro, ms: Date.now() - t0 };
    })();
});

// Screenshot no meio do download: a prova de que a caixa RENDERIZA.
let tirou = false;
const limite = Date.now() + 300_000;
while (Date.now() < limite) {
    const fim = await page.evaluate(() => window.__fim);
    if (fim) break;
    const st = await page.evaluate(() => {
        const a = window.__amostras;
        return a.length ? a[a.length - 1] : null;
    });
    if (st) {
        process.stdout.write(`\r  ${st.fase} · ${(st.pct * 100).toFixed(1)}% · `
            + `${(st.bytes / 1e6).toFixed(0)}/${(st.total / 1e6).toFixed(0)} MB · `
            + `${(st.rate / 1e6).toFixed(1)} MB/s   `);
        if (!tirou && st.pct > 0.15 && st.pct < 0.9) {
            // A caixa fica no fim da página; sem rolar até ela o screenshot
            // prova só que a página existe, não que a barra apareceu.
            const caixa = page.locator('div', { hasText: /^Baixando o tradutor motor/ }).last();
            if (await caixa.count()) {
                await caixa.scrollIntoViewIfNeeded();
                await caixa.screenshot({ path: 'tools/out-barra-motor.png' });
                tirou = true;
            }
        }
    }
    await new Promise((r) => setTimeout(r, 1000));
}
console.log('');

const { amostras, fim } = await page.evaluate(() => ({
    amostras: window.__amostras, fim: window.__fim,
}));

const baixando = amostras.filter((a) => a.fase === 'loading' && a.bytes > 0);
const pico = amostras.reduce((m, a) => Math.max(m, a.pct), 0);
const maiorRate = amostras.reduce((m, a) => Math.max(m, a.rate), 0);
const comEta = baixando.filter((a) => a.eta !== null).length;
const encostou = amostras.filter(
    (a) => a.delibPct !== 0.5 || a.delibTexto !== 'MARCA-DO-1B' || a.delibFase !== 'thinking',
);

console.log('\n── AMOSTRAS (uma a cada ~5s) ──');
for (let i = 0; i < baixando.length; i += 10) {
    const a = baixando[i];
    console.log(`  ${(a.pct * 100).toFixed(1).padStart(5)}% · `
        + `${(a.bytes / 1e6).toFixed(0).padStart(4)}/${(a.total / 1e6).toFixed(0)} MB · `
        + `${(a.rate / 1e6).toFixed(1)} MB/s · `
        + `eta ${a.eta === null ? '—' : Math.ceil(a.eta) + 's'}`);
}

console.log('\n── VEREDITO ──');
console.log(`  amostras com bytes andando: ${baixando.length}`);
console.log(`  progresso máximo: ${(pico * 100).toFixed(1)}%`);
console.log(`  velocidade de pico: ${(maiorRate / 1e6).toFixed(1)} MB/s`);
console.log(`  amostras com ETA calculado: ${comEta}/${baixando.length}`);
console.log(`  campos do 1B alterados pelo motor: ${encostou.length}`);
console.log(`  screenshot no meio do download: ${tirou ? 'tools/out-barra-motor.png' : 'NÃO'}`);
console.log(`  fim: ${JSON.stringify(fim)}`);

const ok = baixando.length >= 3 && pico >= 0.99 && maiorRate > 0
    && comEta > 0 && encostou.length === 0 && tirou;
console.log(ok
    ? '\nOK: a barra do motor enche sozinha e não rouba a barra do 1B'
    : '\nREPROVADO');
await browser.close();
servidor.close();
process.exit(ok ? 0 : 1);
