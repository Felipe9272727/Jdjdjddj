// Fumaça: o jogo construído ainda sobe sem erro depois de mexer em três
// módulos que entram no boot (memória, motor, vontade)?
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.argv[2];
const PORTA = Number(process.argv[3] ?? 8899);

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' };
const servidor = http.createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const p = new URL(req.url, 'http://x').pathname;
  const arq = path.join(RAIZ, p === '/' ? 'index.html' : p);
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
    res.writeHead(404).end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] ?? 'application/octet-stream' });
  fs.createReadStream(arq).pipe(res);
});
await new Promise((r) => servidor.listen(PORTA, '127.0.0.1', r));

const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN,
  args: ['--no-sandbox', '--enable-features=SharedArrayBuffer', '--unlimited-storage'],
});
const pagina = await navegador.newPage();
const erros = [];
pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
pagina.on('console', (m) => {
  if (m.type() === 'error') erros.push(`console: ${m.text()}`);
});
await pagina.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'load', timeout: 60_000 });
await pagina.waitForTimeout(12_000);

const montou = await pagina.evaluate(() => {
  const raiz = document.getElementById('root') ?? document.body;
  return {
    filhos: raiz.children.length,
    canvas: document.querySelectorAll('canvas').length,
    texto: (document.body.innerText || '').slice(0, 300),
  };
});
console.log(JSON.stringify({ montou, erros: erros.slice(0, 15) }, null, 2));
await navegador.close();
servidor.close();
process.exit(erros.filter((e) => !/favicon|firebase|net::ERR/i.test(e)).length === 0 && montou.canvas > 0 ? 0 : 1);
