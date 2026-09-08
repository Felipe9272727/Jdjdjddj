// Fotografa a CARA do Diabrete — olho + sobrancelha — com a pose congelada.
//
//   node bancada-navegador/ver-a-cara.mjs olho:cenho olho:cenho …
//   node bancada-navegador/ver-a-cara.mjs sem                (a cara crua)
//
// `?olho=` e `?cenho=` travam a cara: sem trava o Floor3Rival reescreve a cara a
// cada desenho e todas as fotos saem iguais — a mesma armadilha das dezoito
// bocas. Para MEDIR o que o desenho cobriu, `medir-a-cara.mjs` sobre as fotos.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const CAM = '&cam=0.66,1.90,15.8&alvo=0.66,1.80,14';
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1024, height: 640 } });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', r => r.abort());
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));
for (const arg of process.argv.slice(2)) {
    const [olho, cenho] = arg.split(':');
    const q = arg === 'sem' ? '&semolhos&semboca'
        : `&olho=${olho}${cenho ? `&cenho=${cenho}` : ''}`;
    await p.goto(`http://127.0.0.1:3011/index.html?f3preview&nopost&parado${q}${CAM}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 13000));
    await p.screenshot({ path: `/tmp/cara-${arg.replace(':', '-')}.png` }); console.log('📷', arg);
}
ponte.fechar(); await b.close();
