// Prova que o corpo ANDA na tela `?campo` — não que a matemática fecha (isso os
// testes puros já provam), mas que a página monta, o laço roda e a posição muda.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const RAIZ = process.argv[2];
const srv = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  // O RUNTIME VEM DE CASA. O Chromium desta caixa não alcança CDN externo, e
  // sem esta rota a página morre em "Failed to fetch dynamically imported
  // module: cdn.jsdelivr.net/.../wllama" — que foi exatamente o que ela fez.
  const f = p === '/modelo2.gguf' ? process.env.MODELO2
    : p === '/modelo3.gguf' ? process.env.MODELO3
      : p.startsWith('/wllama-cdn/')
        ? path.join(import.meta.dirname, p.replace('/wllama-cdn/', 'wllama-cdn/'))
        : path.join(RAIZ, p === '/' ? 'index.html' : p);
  if (!f || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, {
    'Content-Length': String(fs.statSync(f).size),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Content-Type': f.endsWith('.gguf') ? 'application/octet-stream'
      : f.endsWith('.js') ? 'text/javascript' : 'text/html',
  });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => srv.listen(8801, '127.0.0.1', r));
const ctx = await chromium.launchPersistentContext(process.env.PERFIL, {
  executablePath: process.env.CHROMIUM_BIN,
  args: ['--no-sandbox', '--enable-features=SharedArrayBuffer', '--unlimited-storage'],
  viewport: { width: 412, height: 915 },
});
const pg = await ctx.newPage();
pg.setDefaultTimeout(900000);
pg.on('pageerror', (e) => console.log('!! PAGEERROR:', String(e).slice(0, 300)));
await pg.addInitScript(() => {
  globalThis.__wllamaCdn = '/wllama-cdn';
  globalThis.__smallBrainModelUrl = '/modelo2.gguf';
  globalThis.__motorBrainModelUrl = '/modelo3.gguf';
});
await pg.goto('http://127.0.0.1:8801/index.html?campo&fresh=1', { waitUntil: 'domcontentloaded' });

const ler = () => pg.locator('[data-teste="posicao"]').innerText();
await pg.waitForSelector('[data-teste="posicao"]');
console.log('montou   :', await ler());

await pg.getByText('carregar a vontade').click();
// A espera anterior era frouxa: o texto "carregando" some no SUCESSO e na
// FALHA, então o roteiro seguia e batia num botão desabilitado por 15 minutos
// sem nunca dizer por quê. Esperar o botão FICAR HABILITADO é a condição certa
// — e, se não ficar, a mensagem de erro da tela é impressa.
try {
  await pg.getByText('pensar uma vez').waitFor({ state: 'attached', timeout: 5000 });
  await pg.waitForFunction(
    () => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => x.textContent?.includes('pensar uma vez'));
      return !!b && !b.disabled;
    },
    { timeout: 900000 },
  );
} catch {
  const texto = await pg.evaluate(() => document.body.innerText);
  console.log('!! A VONTADE NÃO FICOU PRONTA. Tela diz:');
  console.log(texto.split('\n').filter((l) => l.trim()).slice(0, 14).join('\n'));
  await ctx.close(); srv.close();
  process.exit(1);
}
console.log('carregou :', await ler());

await pg.getByText('pensar uma vez').click();
// Amostra a posição a cada 2s por até 4 min: queremos ver se ele SAI do lugar.
const vistos = [];
for (let i = 0; i < 120; i += 1) {
  await new Promise((r) => setTimeout(r, 2000));
  const t = await ler();
  vistos.push(t);
  if (/andando/.test(t)) { console.log('ANDOU em', i * 2, 's :', t); break; }
}
console.log('final    :', vistos.at(-1));
// SEM ISTO A SONDA DIZ "não andou" E NÃO DIZ POR QUÊ — e "não andou" tem pelo
// menos quatro causas diferentes (rodada não decidiu, motor não traduziu, alvo
// que não existe no mundo, laço de animação morto). A tela já sabe qual é.
console.log('--- tela no fim ---');
console.log((await pg.evaluate(() => document.body.innerText))
  .split('\n').filter((l) => l.trim()).slice(0, 20).join('\n'));
console.log('andou alguma vez?', vistos.some((v) => /andando/.test(v)));
const nums = vistos.map((v) => v.match(/nilo (-?[\d.]+), (-?[\d.]+)/)).filter(Boolean);
if (nums.length > 1) {
  const a = nums[0]; const b = nums.at(-1);
  console.log(`deslocamento total: ${Math.hypot(+b[1] - +a[1], +b[2] - +a[2]).toFixed(2)} m`);
}
await ctx.close(); srv.close();
