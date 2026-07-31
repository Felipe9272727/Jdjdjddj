/**
 * A BARRA DE DOWNLOAD — ver com os próprios olhos que ela anda.
 *
 * O Felipe pediu porque a tela não dizia se estava baixando ou travado. Então o
 * teste é literalmente esse: abrir a conversa, deixar o modelo baixar e tirar
 * fotos da barra em três momentos, imprimindo o que está escrito nela.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_SPEECH_MODEL=http://127.0.0.1:3000/models/smollm3.gguf \
 *   node tools/f10-barra.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/';
const saida = process.env.F10_SHOTS ?? '/tmp/f10-barra';
mkdirSync(saida, { recursive: true });

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 160)));
await page.addInitScript(({ cdn, speech, small }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (speech) window.__npcModelUrl = speech;
    if (small) window.__smallBrainModelUrl = small;
}, {
    cdn: process.env.F10_WLLAMA_CDN,
    speech: process.env.F10_SPEECH_MODEL,
    small: process.env.F10_SMALL_MODEL,
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__startFloor, { timeout: 120_000 });
await page.evaluate(() => window.__startFloor(10));
await page.waitForTimeout(4000);

// Manda uma mensagem de verdade: é ISSO que dispara a carga do cérebro de
// fala. Só abrir o painel pelo atalho de debug não carrega nada — foi o que
// me enganou na primeira tentativa (fase ficou 'cold' por 90s).
await page.evaluate(() => {
    const dbg = window.__npcDebug;
    dbg?.open?.();
    void dbg?.send?.('oi');
});

const marcos = [6, 20, 45, 90];
let anterior = null;
for (const s of marcos) {
    await page.waitForTimeout(s * 1000 - (anterior ?? 0) * 1000);
    anterior = s;
    const info = await page.evaluate(() => {
        const st = window.__npcDebug?.npc;
        return {
            fase: st?.phase,
            texto: st?.loadText,
            pct: Math.round((st?.loadProgress ?? 0) * 100),
            bytes: st?.loadDownload?.bytes ?? 0,
            total: st?.loadDownload?.totalBytes ?? 0,
            taxa: Math.round(st?.loadDownload?.rate ?? 0),
            parado: Math.round(st?.loadDownload?.stalledSec ?? 0),
            cota: st?.storage,
            // O que a PESSOA lê na tela, não o que o estado guarda.
            naTela: [...document.querySelectorAll('div')]
                .map((d) => d.childElementCount === 0 ? d.textContent?.trim() : '')
                .filter((t) => t && /MB|GB|conectando|parado/.test(t))
                .slice(0, 4),
        };
    });
    console.log(`\n[${s}s] fase=${info.fase} ${info.pct}% · `
        + `${(info.bytes / 1e6).toFixed(0)}/${(info.total / 1e6).toFixed(0)} MB · `
        + `${(info.taxa / 1e6).toFixed(1)} MB/s · parado ${info.parado}s`);
    console.log('      texto:', JSON.stringify(info.texto));
    console.log('      cota:', JSON.stringify(info.cota));
    console.log('      na tela:', JSON.stringify(info.naTela));
    await page.screenshot({ path: `${saida}/barra-${s}s.png` });
}

console.log(`\nfotos em ${saida}`);
await browser.close();
