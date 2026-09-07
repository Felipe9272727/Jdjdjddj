// ── FOLHA DE CONTATO ─────────────────────────────────────────────────────────
//
// Uma cutscene é TEMPO. Olhar um quadro por vez não mostra ritmo nenhum — e
// olhar catorze quadros um a um custa catorze leituras de imagem. Isto junta
// todos numa grade só, numerados, que é como uma mesa de montagem sempre
// funcionou.
//
//   node bancada-navegador/folha-de-contato.mjs saida.png foto1.png foto2.png ...
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const arqs = process.argv.slice(3);
const saida = process.argv[2];
const cols = 3;
const b64 = arqs.map((a) => 'data:image/png;base64,' + readFileSync(a).toString('base64'));
const html = `<style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px}
figure{margin:0;position:relative}img{width:100%;display:block}
figcaption{position:absolute;top:2px;left:4px;color:#0f0;font:bold 20px monospace;text-shadow:0 0 4px #000}</style>` +
  arqs.map((a, i) => `<figure><img src="${b64[i]}"><figcaption>${a.match(/-(\d\d)-/)?.[1] ?? i}</figcaption></figure>`).join('');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1200, height: 200 } });
await p.setContent(html);
await p.screenshot({ path: saida, fullPage: true });
await b.close();
console.log(saida);
