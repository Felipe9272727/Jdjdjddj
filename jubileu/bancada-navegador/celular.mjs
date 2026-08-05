// ── O CELULAR DO DONO DO JOGO, EMULADO, RODANDO O JOGO DE VERDADE ─────────
//
// Todo o resto da bancada mede pedaço: um runtime, um prompt, um modelo. Isto
// aqui abre o BUILD PUBLICADO, entra no Andar 10, manda mensagens seguidas — a
// sequência que derrubava o aparelho — e mede o que importa para "vai travar o
// celular?": quantas threads o processo abre e quanto de CPU ele queima.
//
// Emulação: 8 núcleos e CPU 4x mais lenta (Snapdragon 7s Gen 2 contra o x86
// desta caixa). Os modelos vêm de arquivos locais pelos overrides que o jogo
// já expõe (__npcModelUrl e companhia), senão seriam 4,35 GB por execução.
//
// O QUE ESTE TESTE PODE PROVAR: que o jogo não satura os núcleos.
// O QUE ELE NÃO PODE: temperatura. Nenhum emulador esquenta.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.argv[2] ?? path.join(import.meta.dirname, '..', 'dist');
const PORTA = Number(process.argv[3] ?? 8930);
const MODELO = process.argv[4] ?? path.join(import.meta.dirname, 'smollm3.gguf');
const MENSAGENS = ['oi', 'quem é você?', 'faz quanto tempo que você está aqui?', 'o que tem atrás da porta?'];

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.json': 'application/json', '.gguf': 'application/octet-stream',
};

const servidor = http.createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/modelo.gguf') {
    const tam = fs.statSync(MODELO).size;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(tam) });
    fs.createReadStream(MODELO).pipe(res);
    return;
  }
  const arq = path.join(RAIZ, p === '/' ? 'index.html' : p);
  if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
    res.writeHead(404).end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] ?? 'application/octet-stream' });
  fs.createReadStream(arq).pipe(res);
});
await new Promise((r) => servidor.listen(PORTA, '127.0.0.1', r));

/** Threads e CPU do processo do navegador, lidos do /proc — sem instrumentar o jogo. */
function amostraDoProcesso(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const utime = Number(campos[11]);
    const stime = Number(campos[12]);
    const threads = Number(campos[17]);
    return { jiffies: utime + stime, threads };
  } catch { return null; }
}

/** Soma o processo do navegador e TODOS os filhos (renderer, workers). */
function arvore(pidRaiz) {
  const vistos = new Set();
  const fila = [pidRaiz];
  let jiffies = 0;
  let threads = 0;
  while (fila.length) {
    const pid = fila.pop();
    if (vistos.has(pid)) continue;
    vistos.add(pid);
    const a = amostraDoProcesso(pid);
    if (!a) continue;
    jiffies += a.jiffies;
    threads += a.threads;
    try {
      const filhos = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
      if (filhos) for (const f of filhos.split(/\s+/)) fila.push(Number(f));
    } catch { /* processo já saiu */ }
  }
  return { jiffies, threads, processos: vistos.size };
}

const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN,
  args: ['--no-sandbox', '--enable-features=SharedArrayBuffer', '--unlimited-storage'],
});
const pid = navegador.__pid ?? process.pid;

const contexto = await navegador.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const pagina = await contexto.newPage();

// O aparelho: 8 núcleos e CPU 4x mais lenta.
await pagina.addInitScript(() => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  globalThis.__npcModelUrl = '/modelo.gguf';
});
const cdp = await contexto.newCDPSession(pagina);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

const erros = [];
pagina.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)));
pagina.on('console', (m) => {
  const t = m.text();
  if (/nilo|fala|vontade|reflexo|mem[óo]ria|motor|thread/i.test(t)) {
    console.log(`  [browser] ${t.slice(0, 150)}`);
  }
});

console.log('abrindo o jogo…');
await pagina.goto(`http://127.0.0.1:${PORTA}/?fresh=1`, { waitUntil: 'load', timeout: 180_000 });

const base = arvore(pid);
console.log(`processos=${base.processos} threads=${base.threads}`);

const resultado = { erros, amostras: [] };
const t0 = Date.now();
const HZ = Number(process.env.HZ ?? 100);

// Amostra threads/CPU a cada segundo enquanto o roteiro roda.
const relogio = setInterval(() => {
  const a = arvore(pid);
  resultado.amostras.push({
    s: +((Date.now() - t0) / 1000).toFixed(1),
    threads: a.threads,
    cpu: a.jiffies,
  });
}, 1000);

try {
  // PELA TELA, NÃO POR GLOBAIS. A primeira versão disto chamava
  // `globalThis.__npcStore` e `__npcSend`, que NÃO EXISTEM: o jogo não expõe
  // nada disso no window, então o roteiro morria em 13s e a medição só via o
  // boot. Dirigir pelo DOM é o que um jogador faz, e é o único caminho que
  // prova o que interessa.
  const campo = pagina.getByPlaceholder('Fale com ele…');
  await campo.waitFor({ state: 'visible', timeout: 240_000 });
  resultado.enviadas = 0;
  for (const m of MENSAGENS) {
    await campo.fill(m);
    await pagina.keyboard.press('Enter');
    resultado.enviadas += 1;
    // Espera a resposta assentar antes da próxima — mensagens seguidas são o
    // roteiro, mas atropelar não é: o jogador lê antes de responder.
    await pagina.waitForTimeout(20_000);
  }
} catch (e) {
  resultado.roteiroFalhou = String(e.message).slice(0, 200);
}

await new Promise((r) => setTimeout(r, 5000));
clearInterval(relogio);

const picoThreads = Math.max(...resultado.amostras.map((a) => a.threads), 0);
const cpuTotal = resultado.amostras.length
  ? (resultado.amostras.at(-1).cpu - base.jiffies) / HZ
  : 0;
const duracao = (Date.now() - t0) / 1000;

console.log('\n===== O APARELHO EMULADO =====');
console.log(`duração ............ ${duracao.toFixed(0)}s`);
console.log(`threads (pico) ..... ${picoThreads}`);
console.log(`CPU consumida ...... ${cpuTotal.toFixed(1)}s`);
console.log(`ocupação média ..... ${(cpuTotal / duracao).toFixed(2)} núcleos de 8`);
console.log(`erros de página .... ${erros.length ? erros.slice(0, 3).join(' | ') : 'nenhum'}`);
globalThis.__saida = { picoThreads, cpuTotal, duracao };
console.log(JSON.stringify({ picoThreads, cpuTotal: +cpuTotal.toFixed(1), duracao: +duracao.toFixed(0), erros: erros.slice(0, 5) }, null, 2));

await navegador.close();
servidor.close();
