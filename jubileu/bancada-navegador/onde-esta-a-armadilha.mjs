// ── APONTAR A CÂMERA PARA A COISA, EM VEZ DE ADIVINHAR ────────────────────────
//
// As armadilhas nascem de `registerJump` e caem numa plataforma escolhida em
// tempo de execução. Fotografá-las de um enquadramento fixo é apostar. Este
// script lê `window.__armadilhas` (publicado pelo `ForcarArmadilhas` do
// preview), escolhe a mais próxima, e tira fotos DELA: de perfil, de frente e
// de cima — as três vistas que dizem se um espinho parece um espinho.
//
//   node bancada-navegador/onde-esta-a-armadilha.mjs [sufixo]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const SUFIXO = process.argv[2] ?? 'agora';
const PORTA = process.env.PORTA ?? '3011';
const SAIDA = process.env.SAIDA ?? '/tmp';
const ESPERA = Number(process.env.ESPERA ?? 16000);
const POST = process.env.POST === '1' ? '' : '&nopost';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await b.newContext({ viewport: { width: 1024, height: 640 } });
const p = await ctx.newPage();
await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
await p.route('**://firestore.googleapis.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 120)));

// 1) Descobrir onde elas estão.
await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&armadilha${POST}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, ESPERA));
const caixas = await p.evaluate(() => window.__armadilhas ?? null);
console.log('armadilhas:', JSON.stringify(caixas));
if (!caixas || !caixas.length) { ponte.fechar(); await b.close(); process.exit(1); }

const a = caixas.reduce((m, c) => (c && (!m || c.z0 < m.z0) ? c : m), null);
const cz = (a.z0 + a.z1) / 2;
console.log('mais próxima: x', a.x.toFixed(2), 'z', cz.toFixed(2), 'topo', a.topY.toFixed(2), 'meia-largura', a.hw.toFixed(2));

// 2) Fotografá-la de três lados. Distâncias curtas: a tira tem ~0,3 m de fundo
//    e os cones 0,6 m de altura — a 8 m ela é meia dúzia de pixels.
const v = (x, y, z) => `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
const alvo = v(a.x, a.topY + 0.3, cz);
const VISTAS = [
    ['perfil',  v(a.x + 3.2, a.topY + 0.9,  cz)],
    ['frente',  v(a.x,       a.topY + 0.85, cz - 2.8)],
    ['cima',    v(a.x + 0.4, a.topY + 3.0,  cz - 1.2)],
    ['olho',    v(a.x,       a.topY + 1.65, cz - 4.5)],   // altura de jogador
];
for (const [nome, cam] of VISTAS) {
    await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&forcar${POST}&cam=${cam}&alvo=${alvo}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise((r) => setTimeout(r, ESPERA));
    const arq = `${SAIDA}/f3-arm-${nome}-${SUFIXO}.png`;
    try { await p.screenshot({ path: arq, timeout: 30000, animations: 'disabled' }); console.log('📷', arq); }
    catch (e) { console.log('falhou', nome, String(e.message).slice(0, 70)); }
}
ponte.fechar();
await b.close();
