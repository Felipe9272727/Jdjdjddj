// Fotografa a cara do Diabrete com uma boca fixa em cada foto, SEM o balanço.
//
//   node bancada-navegador/ver-a-boca.mjs sem sorrisoIronico empolgado …
//
// `?parado` congela a pose (ver `Floor3Rival`), então as fotos saem
// pixel-a-pixel comparáveis: a cara cai exatamente no mesmo lugar em todas, e a
// única coisa que muda é a boca. Sem isso, cada foto pegava a cabeça numa altura
// diferente e eu "via" a boca em cima do nariz quando era só o quadril subindo.
// `sem` desliga a boca — é a foto de referência do rosto original.
//
// Para MEDIR o resultado, e não olhar: `medir-a-cara.mjs` lê as fotos e devolve
// onde cada mancha de tinta cai na régua da própria cara.
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
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 140)));
for (const nome of process.argv.slice(2)) {
    const q = nome === 'sem' ? '&semboca' : `&boca=${nome}`;
    await p.goto(`http://127.0.0.1:3011/index.html?f3preview&nopost&parado${q}${CAM}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise(r => setTimeout(r, 14000));
    await p.screenshot({ path: `/tmp/boca-${nome}.png` }); console.log('📷', nome);
}
ponte.fechar(); await b.close();
