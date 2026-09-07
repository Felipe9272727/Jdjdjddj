// ── VER A PASSADA ────────────────────────────────────────────────────────────
//
// Uma foto de um ciclo de corrida não diz nada sobre o ciclo. O que este script
// faz é uma RAJADA no mesmo enquadramento: várias fotos seguidas do Diabrete, que
// viram uma folha de contato e mostram a passada como uma tira de filme. É o
// mais perto de ver animação que esta caixa permite (SwiftShader, ~2 fps).
//
//   node bancada-navegador/ver-o-diabrete-correr.mjs [sufixo]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const SUFIXO = process.argv[2] ?? 'agora';
const PORTA = process.env.PORTA ?? '3011';
const N = Number(process.env.FOTOS ?? 8);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1024, height: 640 } });
const p = await ctx.newPage();
await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status:200, contentType:'image/png', body:PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 120)));
// Câmera de perfil, perto: passada se lê de LADO, não de frente.
await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&nopost&cam=4.2,2.0,14.6&alvo=0.66,1.1,14.0`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 16000));
for (let i = 0; i < N; i += 1) {
    await new Promise((r) => setTimeout(r, 700));
    const arq = `/tmp/f3-corrida-${String(i).padStart(2,'0')}-${SUFIXO}.png`;
    await p.screenshot({ path: arq }); console.log('📷', arq);
}
ponte.fechar(); await b.close();
