// ── VER O ANDAR 3 SEM PRECISAR DE UM CELULAR ─────────────────────────────────
//
// Eu jurei por dias que esta caixa não rodava o jogo. Rodava: o que travava era
// o resolvedor de fontes do troika buscando o `cdn.jsdelivr.net`, um fetch que
// morre aqui e deixa o Suspense do Canvas pendurado para sempre. A `ponte.mjs`
// do próprio repositório atravessa isso — eu só nunca a tinha ligado no Andar 3.
//
// Com ela, o andar carrega, o `useFrame` roda (a ~2 fps no SwiftShader, o que
// basta para OLHAR) e dá para fotografar antes e depois de cada mudança.
//
//   npm run dev -- --port=3011      (noutro terminal, DISABLE_HMR=true)
//   node bancada-navegador/olhar-o-andar-3.mjs [sufixo]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const SUFIXO = process.argv[2] ?? 'agora';
const PORTA = process.env.PORTA ?? '3011';
const SAIDA = process.env.SAIDA ?? '/tmp';
const ESPERA = Number(process.env.ESPERA ?? 16000);
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
// Textura remota que o jogo busca: servir um pixel é melhor que abortar —
// abortar joga o error boundary e o andar nem monta.
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
await p.route('**://firestore.googleapis.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 120)));

const ANGULOS = [
    ['longe', '?f3preview&nopost'],
    ['perto', '?f3preview&close&nopost'],
    ['compost', '?f3preview'],
];
for (const [nome, q] of ANGULOS) {
    await p.goto(`http://127.0.0.1:${PORTA}/index.html${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await new Promise((r) => setTimeout(r, ESPERA));
    const alvo = `${SAIDA}/f3-${nome}-${SUFIXO}.png`;
    try {
        await p.screenshot({ path: alvo, timeout: 30000, animations: 'disabled' });
        console.log('📷', alvo);
    } catch (e) { console.log('captura falhou em', nome, String(e.message).slice(0, 70)); }
}
ponte.fechar();
await b.close();
