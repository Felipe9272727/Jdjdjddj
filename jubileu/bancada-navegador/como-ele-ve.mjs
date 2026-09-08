// Como o FELIPE vê: sem `nopost`, ou seja com a película do andar por cima, e
// com um balão de fala no ar para a boca estar articulando.
//
// Existe porque todas as fotos de conserto desta cara foram tiradas com
// `?nopost`, que desliga grão, vinheta e a curva de contraste. Ajustar peça de
// rosto numa imagem limpa e entregar sem olhar a imagem SUJA é como misturar
// som no fone e mandar para o rádio.
//
// AVISO DE LEITURA: a câmera aqui é a do `?f3preview` (fov 70 fixo mais
// OrbitControls), NÃO a da cutscene. Serve para ver a cara no tamanho e na
// película do celular; não serve para julgar ENQUADRAMENTO de plano. Para isso
// a conta está em `f3Enquadramento` e é testada contra a lista de planos real.
//
//   node bancada-navegador/como-ele-ve.mjs "frase" [mais args de URL]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// A câmera PADRÃO do `?f3preview` é um plano geral feito para a bancada em
// paisagem: numa tela de celular em pé ela deixa o Diabrete do tamanho de uma
// unha e metade do quadro vira céu vazio. Isso não é o que ele vê. A câmera daqui
// é a da cutscene de apresentação, a mesma que `a-boca-no-celular.mjs` mede.
const CAM = process.env.CAM || '&cam=0.66,1.90,15.8&alvo=0.66,1.80,14';
const frase = process.argv[2] ?? 'esse pincel agora é MEU';
const extra = process.argv.slice(3).map(a => '&' + a).join('');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// Tela de celular em pé, que é onde ele joga.
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', r => r.abort());
p.on('pageerror', e => console.log('  [erro]', String(e.message).slice(0, 160)));
await p.goto(`http://127.0.0.1:3011/index.html?f3preview&grito=${encodeURIComponent(frase)}${extra}${CAM}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise(r => setTimeout(r, 16000));
await p.screenshot({ path: '/tmp/como-ele-ve.png' }); console.log('📷 /tmp/como-ele-ve.png');
ponte.fechar(); await b.close();
