// Retrato do Diabrete no enquadramento fixo `?f3preview&diabo`, para comparar
// antes/depois de mexer no modelo dele.
//   node bancada-navegador/ver-o-diabrete.mjs <sufixo>
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const S = process.argv[2] ?? 'agora';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:1024,height:640} });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
await p.route('**://www.google.com/**', r=>r.abort());
p.on('pageerror', e=>console.log('  [erro]', String(e.message).slice(0,140)));
// A vista `diabo` olha para as COSTAS dele — serve para silhueta e passada, e
// foi inútil no dia em que ele ganhou boca. `cara` usa a câmera livre do preview
// para ficar na frente do rosto: ele está em z≈14, então a câmera vai para
// z=16.4 e olha de volta.
for (const [nome,q] of [['diabo','?f3preview&diabo&nopost'],
                        ['diabo-grade','?f3preview&diabo'],
                        ['cara','?f3preview&nopost&cam=0.72,1.95,16.4&alvo=0.66,1.86,14'],
                        ['cara-grade','?f3preview&cam=0.72,1.95,16.4&alvo=0.66,1.86,14'],
                        // Close na boca: sem isto não dá para dizer se o que
                        // aparece é o desenho novo ou o oval que já vinha
                        // pintado na textura do modelo.
                        // A ficha do Felipe, fotografada. `?boca=` fixa a forma.
                        ['boca-repouso','?f3preview&nopost&cam=0.70,1.88,15.05&alvo=0.66,1.84,14'],
                        ['boca-falando2','?f3preview&nopost&boca=falando2&cam=0.70,1.88,15.05&alvo=0.66,1.84,14'],
                        ['boca-deboche','?f3preview&nopost&boca=deboche&cam=0.70,1.88,15.05&alvo=0.66,1.84,14'],
                        ['boca-empolgado','?f3preview&nopost&boca=empolgado&cam=0.70,1.88,15.05&alvo=0.66,1.84,14'],
                        ['boca-assustado','?f3preview&nopost&boca=assustado&cam=0.70,1.88,15.05&alvo=0.66,1.84,14']]) {
  await p.goto('http://127.0.0.1:3011/index.html'+q,{waitUntil:'domcontentloaded',timeout:120000});
  await new Promise(r=>setTimeout(r,15000));
  await p.screenshot({path:`/tmp/f3-${nome}-${S}.png`}); console.log('📷',nome);
}
ponte.fechar(); await b.close();
