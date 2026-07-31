/**
 * O ?MENTE SOZINHO — do jeito que o Felipe usa.
 *
 * Ele NÃO chega ao Andar 10 pelo jogo: testa o cérebro pequeno por esta página.
 * Eu tinha posto uma trava que só liberava o download da vontade depois do
 * cérebro da FALA estar baixado — e nesta página não existe fala. Resultado: o
 * download nunca começava. Este teste reproduz exatamente esse caminho, num
 * navegador limpo, sem nada em cache: abrir ?mente e clicar em "pensar agora".
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_SMALL_MODEL=http://127.0.0.1:3000/models/vontade-teste.gguf \
 *   node tools/f10-mente-sozinha.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/?mente';
const saida = process.env.F10_SHOTS ?? '/tmp/f10-mente';
mkdirSync(saida, { recursive: true });

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        // O container dá uma cota minúscula ao perfil limpo; sem isto o teste
        // mede o meu disco, não o caminho do download.
        '--unlimited-storage'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 1000 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 160)));
await page.addInitScript(({ cdn, small }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (small) window.__smallBrainModelUrl = small;
}, { cdn: process.env.F10_WLLAMA_CDN, small: process.env.F10_SMALL_MODEL });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });
console.log('sala da mente montou (nada em cache)');

await page.getByRole('button', { name: 'pensar agora' }).click();
console.log('cliquei em "pensar agora"\n');

const t0 = Date.now();
let baixouAlgumByte = false;
let ultimo = '';
while (Date.now() - t0 < 420_000) {
    const s = await page.evaluate(() => {
        const st = window.__f10mente.npc;
        return {
            fase: st.deliberationPhase,
            texto: st.deliberationLoadText,
            bytes: st.deliberationDownload?.bytes ?? 0,
            total: st.deliberationDownload?.totalBytes ?? 0,
            parado: Math.round(st.deliberationDownload?.stalledSec ?? 0),
            pensando: document.body.innerText.includes('pensando…'),
            naTela: [...document.querySelectorAll('div')]
                .map((d) => (d.childElementCount === 0 ? d.textContent?.trim() : ''))
                .filter((t) => t && /MB|GB|conectando|parado|esperando|não cabe/.test(t))
                .slice(0, 3),
        };
    }).catch(() => null);
    if (!s) break;
    if (s.bytes > 0) baixouAlgumByte = true;
    const marca = `${s.fase} · ${(s.bytes / 1e6).toFixed(0)}/${(s.total / 1e6).toFixed(0)} MB · ${s.texto}`;
    if (marca !== ultimo) {
        ultimo = marca;
        console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${marca}`);
        if (s.naTela.length) console.log(`        na tela: ${JSON.stringify(s.naTela)}`);
    }
    if (s.fase === 'unavailable') break;
    if (!s.pensando && baixouAlgumByte && s.fase === 'off') break;
    await page.waitForTimeout(2500);
}

await page.screenshot({ path: `${saida}/mente.png`, fullPage: true });
const rodada = await page.evaluate(() => {
    const alvo = [...document.querySelectorAll('div')]
        .find((d) => d.querySelector('b')?.textContent === 'Rodadas');
    return alvo?.innerText.slice(0, 400) ?? '(não achei)';
});
console.log('\n--- rodadas ---\n' + rodada);
console.log(baixouAlgumByte
    ? '\nOK: a sala da mente baixou o cérebro pequeno SOZINHA'
    : '\nREPROVADO: nenhum byte foi baixado — a trava ainda está no caminho');
await browser.close();
process.exit(baixouAlgumByte ? 0 : 1);
