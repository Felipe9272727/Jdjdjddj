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
/** Uma fala do 3B com CPU 4x throttled passa de dois minutos. */
const ESPERA_POR_FALA_MS = Number(process.env.ESPERA_MS ?? 180_000);
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
  // O jogo monta `${CDN}/wasm/wllama.wasm`, e o dist guarda o arquivo em
  // `/wllama-espec/wllama.wasm`. A 5ª execução morreu exatamente aí: o 404
  // virou HTML e o WebAssembly.instantiate reclamou de "expected 4 bytes".
  if (p.startsWith('/wllama-cdn/')) {
    const alvo = path.join(import.meta.dirname, p.replace('/wllama-cdn/', 'wllama-cdn/'));
    if (!fs.existsSync(alvo)) { res.writeHead(404).end('404'); return; }
    res.writeHead(200, {
      'Content-Type': alvo.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    });
    fs.createReadStream(alvo).pipe(res);
    return;
  }
  if (p === '/wllama-espec/wasm/wllama.wasm') {
    const alvo = path.join(RAIZ, 'wllama-espec', 'wllama.wasm');
    res.writeHead(200, { 'Content-Type': 'application/wasm' });
    fs.createReadStream(alvo).pipe(res);
    return;
  }
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
  // O Chromium desta caixa NÃO passa pelo proxy do agente, então nenhum CDN
  // externo carrega — foi por isso que a 4ª execução morreu em
  // "Failed to fetch dynamically imported module: cdn.jsdelivr.net/.../wllama".
  // O runtime vem do próprio dist. RESSALVA HONESTA: este é o binário
  // remendado, que o aparelho do dono do jogo reprovou. Serve para medir a
  // LÓGICA do jogo (quem roda junto com quem, quantas threads), não para
  // concluir nada sobre a velocidade do runtime que vai para o ar.
  // O RUNTIME QUE VAI PARA O AR, e não o remendado. O Chromium desta caixa não
  // alcança CDN nenhum, mas o `curl` alcança pelo proxy: o wllama 3.5.1 do
  // jsDelivr está vendorizado em bancada-navegador/wllama-cdn e servido daqui.
  // Sem isto a medição descrevia um binário que o aparelho do dono do jogo
  // REPROVOU — útil para a lógica, inútil como prova do que ele vai receber.
  globalThis.__wllamaCdn = '/wllama-cdn';
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

// ── O QUE TRAVA: BLOQUEIO OU DISPUTA? ─────────────────────────────────────
// O relato é "ao enviar, o jogo fica travado uns 10s e volta". Duas causas
// possíveis, e o conserto de cada uma é diferente:
//
//   thread principal BLOQUEADA -> os quadros PARAM. Um buraco único e grande
//                                 entre dois requestAnimationFrame.
//   núcleos DISPUTADOS ........ -> os quadros ficam lentos, mas continuam.
//                                 Muitos buracos médios, nenhum enorme.
//
// Teorizar sobre isso já me custou uma mensagem inteira. O navegador sabe a
// resposta; basta perguntar.
await pagina.addInitScript(() => {
  globalThis.__quadros = { buracos: [], pior: 0 };
  let ultimo = 0;
  const tique = (t) => {
    if (ultimo > 0) {
      const dt = t - ultimo;
      if (dt > 100) globalThis.__quadros.buracos.push(Math.round(dt));
      if (dt > globalThis.__quadros.pior) globalThis.__quadros.pior = Math.round(dt);
    }
    ultimo = t;
    requestAnimationFrame(tique);
  };
  requestAnimationFrame(tique);
});

console.log('abrindo o jogo…');
// `?bancada` é a rota que o projeto criou justamente para alcançar o Nilo sem
// atravessar o jogo — o chat do 10º sem precisar andar do saguão até lá.
const ROTA = process.env.ROTA ?? '?bancada&fresh=1';
await pagina.goto(`http://127.0.0.1:${PORTA}/${ROTA}`, { waitUntil: 'load', timeout: 180_000 });

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
  // ── VIGIAR, NÃO ESPIAR UMA VEZ ────────────────────────────────────────
  // A prova de que o modelo falou era lida UMA vez, no fim da espera de cada
  // mensagem. Mas a bancada mostra `saindo:` só ENQUANTO o stream corre — uma
  // resposta que começou e terminou entre duas leituras já tinha sumido dali.
  // Ou seja: o "ninguém falou" da 7ª execução pode ter sido falso, e um
  // detector em que não dá para confiar nem no "não" não serve para nada.
  // Amostrando a cada segundo, junto da CPU, nenhuma resposta escapa.
  void pagina.evaluate(() => document.body.innerText).then((txt) => {
    if (/saindo:\s*\S/.test(txt)) resultado.falouAlgumaCoisa = true;
    const m = txt.match(/saindo:\s*(.{0,60})/);
    if (m && m[1].trim() && !resultado.amostraDaFala) resultado.amostraDaFala = m[1].trim();
  }).catch(() => undefined);
}, 1000);

try {
  // PELA TELA, NÃO POR GLOBAIS. A primeira versão disto chamava
  // `globalThis.__npcStore` e `__npcSend`, que NÃO EXISTEM: o jogo não expõe
  // nada disso no window, então o roteiro morria em 13s e a medição só via o
  // boot. Dirigir pelo DOM é o que um jogador faz, e é o único caminho que
  // prova o que interessa.
  // Os controles que a bancada expõe: carregar, escrever, mandar. É o mesmo
  // `sendToNpc` que o chat do jogo chama — o caminho de código é o do jogador,
  // sem precisar atravessar o prédio até o 10º andar.
  await pagina.getByRole('button', { name: /carregar o modelo/i })
    .click({ timeout: 60_000 });
  const campo = pagina.locator('input').last();
  const mandar = pagina.getByRole('button', { name: /mandar a fala/i });
  resultado.enviadas = 0;
  for (const m of MENSAGENS) {
    await campo.fill(m, { timeout: 240_000 });
    await mandar.click({ timeout: 240_000 });
    resultado.enviadas += 1;
    // Espera a resposta assentar antes da próxima. Mensagens SEGUIDAS são o
    // roteiro que derrubava o aparelho, mas atropelar não é: o jogador lê.
    // ── QUANTO ESPERAR: A CONTA, NÃO O CHUTE ──────────────────────────────
    // 25s não bastavam e a 6ª execução provou: zero erros, WASM carregado,
    // 2,52 núcleos de ocupação — o motor TRABALHOU — e mesmo assim nenhuma
    // resposta saiu. Com `Emulation.setCPUThrottlingRate: 4`, um SmolLM3-3B
    // que faz ~3 tok/s nesta caixa cai para menos de 1, e o teto de saída são
    // 96 tokens: passa de dois minutos por fala. Esperar menos que isso é
    // garantir uma medição vazia.
    // Quem confere se o Nilo falou é o vigia de 1s lá em cima; aqui só se
    // espera. Conferir de novo no fim era exatamente o erro.
    await pagina.waitForTimeout(ESPERA_POR_FALA_MS);
  }
} catch (e) {
  resultado.roteiroFalhou = String(e.message).slice(0, 200);
}

// ── UM ROTEIRO QUE NÃO RODOU NÃO PODE PARECER SUCESSO ────────────────────
// Duas execuções mediram "1,02 núcleos de 8" e eu quase apresentei isso como
// prova de que o aparelho aguenta. Era o jogo PARADO: na primeira o roteiro
// morreu em globais que não existem, na segunda o campo do chat nunca
// apareceu — o jogo abre no saguão do andar 3, e o Nilo está no 10º. Medição
// sem roteiro é medição de tela inicial, e agora ela se denuncia.
// E MANDAR NÃO É GERAR. A 4ª execução mandou as quatro mensagens para um motor
// que nunca subiu (CDN inalcançável) e a guarda antiga deixou passar, porque
// ela só contava envios. Agora a saída do próprio Nilo é a prova.
if (!resultado.falouAlgumaCoisa) {
  console.log('\n!! NINGUÉM FALOU: nenhuma resposta saiu do modelo.');
  console.log('!! os números abaixo são do jogo PARADO e não provam nada.');
}
if ((resultado.enviadas ?? 0) < MENSAGENS.length) {
  console.log(`\n!! O ROTEIRO NÃO RODOU: ${resultado.enviadas ?? 0} de ${MENSAGENS.length} mensagens`);
  console.log(`!! motivo: ${resultado.roteiroFalhou ?? 'campo do chat nunca apareceu'}`);
  console.log('!! os números abaixo são do jogo PARADO e não provam nada.');
}

await new Promise((r) => setTimeout(r, 5000));
clearInterval(relogio);

// ── O PICO, QUE É O QUE ESQUENTA ──────────────────────────────────────────
// A média de 806s dilui exatamente o que importa: 1,57 núcleos de 8 pode ser
// o aparelho tranquilo o tempo todo OU quatro minutos a 6 núcleos com longos
// silêncios entre eles. O celular não esquenta pela média — esquenta pelo
// trecho sustentado. As amostras de 1 em 1 segundo já estavam sendo colhidas
// para a CPU acumulada; faltava derivá-las.
const deltas = [];
for (let i = 1; i < resultado.amostras.length; i += 1) {
  const dt = (resultado.amostras[i].s - resultado.amostras[i - 1].s) || 1;
  const dcpu = (resultado.amostras[i].cpu - resultado.amostras[i - 1].cpu) / HZ;
  deltas.push(dcpu / dt);
}
/** Média móvel de 10s: um pico de 1s é ruído, 10s sustentados são calor. */
const janelas = [];
for (let i = 9; i < deltas.length; i += 1) {
  janelas.push(deltas.slice(i - 9, i + 1).reduce((x, y) => x + y, 0) / 10);
}
const picoSustentado = janelas.length ? Math.max(...janelas) : 0;
const picoInstantaneo = deltas.length ? Math.max(...deltas) : 0;
const picoThreads = Math.max(...resultado.amostras.map((a) => a.threads), 0);
const cpuTotal = resultado.amostras.length
  ? (resultado.amostras.at(-1).cpu - base.jiffies) / HZ
  : 0;
const duracao = (Date.now() - t0) / 1000;

const quadros = await pagina.evaluate(() => globalThis.__quadros).catch(() => null);
console.log('\n===== O APARELHO EMULADO =====');
if (quadros) {
  const b = quadros.buracos;
  const enormes = b.filter((x) => x >= 3000);
  console.log(`buracos de quadro ... ${b.length} acima de 100ms · pior ${quadros.pior}ms`);
  console.log(`buracos >= 3s ....... ${enormes.length}  ${enormes.length ? JSON.stringify(enormes.slice(0, 6)) : ''}`);
  console.log(`veredito ............ ${enormes.length
    ? 'THREAD PRINCIPAL BLOQUEADA (buraco único e grande)'
    : 'sem bloqueio longo; se travar, é disputa de núcleo'}`);
  resultado.quadros = { total: b.length, pior: quadros.pior, enormes: enormes.length };
}
console.log(`duração ............ ${duracao.toFixed(0)}s`);
console.log(`threads (pico) ..... ${picoThreads}`);
console.log(`CPU consumida ...... ${cpuTotal.toFixed(1)}s`);
console.log(`ocupação média ..... ${(cpuTotal / duracao).toFixed(2)} núcleos de 8`);
console.log(`PICO sustentado .... ${picoSustentado.toFixed(2)} núcleos de 8  (média móvel de 10s)`);
console.log(`pico instantâneo ... ${picoInstantaneo.toFixed(2)} núcleos de 8`);
console.log(`erros de página .... ${erros.length ? erros.slice(0, 3).join(' | ') : 'nenhum'}`);
globalThis.__saida = { picoThreads, cpuTotal, duracao };
console.log(`falou ............... ${resultado.falouAlgumaCoisa ? `sim — "${resultado.amostraDaFala ?? ''}"` : 'NÃO'}`);
console.log(JSON.stringify({ picoSustentado: +picoSustentado.toFixed(2), picoInstantaneo: +picoInstantaneo.toFixed(2), picoThreads, falou: !!resultado.falouAlgumaCoisa, amostraDaFala: resultado.amostraDaFala, cpuTotal: +cpuTotal.toFixed(1), duracao: +duracao.toFixed(0), quadros: resultado.quadros ?? null, erros: erros.slice(0, 5) }, null, 2));

await navegador.close();
servidor.close();
