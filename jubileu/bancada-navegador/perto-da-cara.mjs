// Retrato fechado da cara, para ver o que a foto de corpo inteiro esconde.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CAM = process.env.CAM || '&cam=0.66,1.955,14.95&alvo=0.66,1.94,14';
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 700 } });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', r => r.abort());
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));
for (const arg of process.argv.slice(2)) {
    const q = arg === '-' ? '' : '&' + arg;
    await p.goto(`http://127.0.0.1:3011/index.html?f3preview&nopost&parado${q}${CAM}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 12000));
    const nome = (arg === '-' ? 'cru' : arg).replace(/[^\w.-]+/g, '_');
    await p.screenshot({ path: `/tmp/perto-${nome}.png` }); console.log('📷', nome);
}
ponte.fechar(); await b.close();
