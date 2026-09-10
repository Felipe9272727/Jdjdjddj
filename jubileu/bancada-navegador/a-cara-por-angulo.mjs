// ── ATÉ QUE ÂNGULO A CARA DELE LÊ ────────────────────────────────────────────
//
// A regra das TRÊS CÂMERAS (frente, 3/4, perfil) existe desde que sete voltas de
// foto frontal esconderam uma máscara que caía aos pedaços fora do eixo. Mas
// três fotos dizem "lê / não lê"; não dizem ONDE está a fronteira. Isto varre
// sete ângulos de 0 a 90 graus na mesma rodada, com a mesma pose congelada.
//
// O que a varredura mediu (ciclo 19):
//   0-45   lê limpo
//   55     ainda lê — e é onde o jogo mais o vira (`paint` gira 0,28*PI = 50,4)
//   65     a cara escorça, o creme vira uma faixa estreita
//   74     é onde a MÁSCARA ACABA por construção: o contorno dela chega a
//          x 0,97, que no elipsoide (RX 1,04, RZ 0,91) é 74,4 graus de guinada
//   90     só ink e uma tira de creme na frente do crânio
//
// Ou seja: não há defeito, há uma fronteira — e o jogo inteiro fica dentro dela.
// A folha existe para que o dia em que alguém compuser um plano de 80 graus se
// veja o motivo de a cara não ler ali.
//
//   node bancada-navegador/a-cara-por-angulo.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless:true,
  args:['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const ctx = await b.newContext({ viewport:{width:520,height:560} });
const p = await ctx.newPage(); await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', r=>r.fulfill({status:200,contentType:'image/png',body:PNG}));
// A VARREDURA DO ÂNGULO. O perfil mostrou a máscara do rosto acabando numa
// aresta reta, com a boca correndo para fora dela. A pergunta que decide se
// isso importa é EM QUE ÂNGULO começa — porque o jogo só vira ele 0,28*PI (50
// graus) quando ele pinta, e três quartos (45) na foto do turnaround lê limpo.
const R = 1.35, CY = 2.05;
const arqs = [];
for (const g of [0, 30, 45, 55, 65, 75, 90]) {
  const a = g * Math.PI / 180;
  const cam = `${(0.66 + R*Math.sin(a)).toFixed(3)},${CY},${(14 + R*Math.cos(a)).toFixed(3)}`;
  await p.goto(`http://127.0.0.1:3011/index.html?f3preview&diabo&parado&sempiscar&nopost`
    + `&cam=${cam}&alvo=0.66,2.0,14`, { waitUntil:'domcontentloaded', timeout:120000 });
  await new Promise(r=>setTimeout(r,12000));
  const f = `/tmp/angulo-${String(g).padStart(2,'0')}.png`;
  await p.screenshot({ path:f }); arqs.push([f, g + ' graus']); console.log('📷', g, cam);
}
ponte.fechar(); await b.close();
import { execFileSync } from 'node:child_process';
const py = `
from PIL import Image, ImageDraw
import sys, json
itens = json.loads(sys.argv[1])
ims = [(Image.open(f), n) for f, n in itens]
w, h = ims[0][0].size
folha = Image.new('RGB', (len(ims)*(w+6)+6, h+26), (20,16,14))
d = ImageDraw.Draw(folha)
for i,(im,n) in enumerate(ims):
    x = 6 + i*(w+6); folha.paste(im,(x,6)); d.text((x+4,h+12), n, fill=(230,220,200))
folha.save(sys.argv[2])
`;
execFileSync('python3', ['-c', py, JSON.stringify(arqs), '/tmp/mascara-por-angulo.png']);
console.log('📄 /tmp/mascara-por-angulo.png');
