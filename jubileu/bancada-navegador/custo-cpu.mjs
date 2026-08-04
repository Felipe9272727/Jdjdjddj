// Mede o CPU QUEIMADO por token, não só os tokens por segundo.
//
// Existe porque a bancada de velocidade mentiu por omissão: o n-grama empatou
// em tok/s numa conversa livre e eu li isso como "não custa". Num celular custa,
// e muito: especular transforma um trabalho limitado por MEMÓRIA (núcleos
// esperando) num trabalho limitado por CONTA (núcleos a 100%). Mesma velocidade,
// o dobro ou o triplo de calor — e é o resto do aparelho que paga.
//
// Aqui o tempo de CPU sai do /proc de todos os processos do Chromium, somado
// antes e depois de cada rodada.
import { readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL_BASE = process.argv[2] ?? 'http://127.0.0.1:8712/custo.html';
const LIMITE_MS = Number(process.argv[3] ?? 900_000);

const HZ = 100; // jiffies por segundo no Linux

function cpuDoChromium() {
  let jiffies = 0;
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const nome = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
      if (!/chrome|chromium/i.test(nome)) continue;
      const campos = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      // utime = campo 12, stime = campo 13 (contando a partir de 0 depois do estado)
      jiffies += Number(campos[11]) + Number(campos[12]);
    } catch { /* processo morreu no meio da leitura */ }
  }
  return jiffies / HZ;
}

const navegador = await chromium.launch({
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}),
  args: [
    '--enable-features=SharedArrayBuffer', '--no-sandbox',
    '--js-flags=--experimental-wasm-jspi', '--unlimited-storage',
  ],
});
const pagina = await navegador.newPage();
pagina.on('console', (m) => console.log(`[browser] ${m.text()}`));
pagina.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

// A página avisa quando começa e quando termina cada rodada; o CPU é lido aqui.
const marcos = [];
await pagina.exposeFunction('marcarCpu', (rotulo) => {
  marcos.push({ rotulo, cpu: cpuDoChromium(), t: Date.now() });
});

await pagina.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
try {
  await pagina.waitForFunction(() => globalThis.__resultado !== null, null, { timeout: LIMITE_MS });
} catch {
  console.log('TIMEOUT\n', await pagina.textContent('#saida'));
  await navegador.close();
  process.exit(2);
}

const resultado = await pagina.evaluate(() => globalThis.__resultado);
await navegador.close();

// Junta os pares início/fim de cada rodada.
const rodadas = [];
for (let i = 0; i + 1 < marcos.length; i += 2) {
  const [ini, fim] = [marcos[i], marcos[i + 1]];
  rodadas.push({
    rotulo: ini.rotulo.replace(/^inicio:/, ''),
    cpuS: +(fim.cpu - ini.cpu).toFixed(2),
    paredeS: +((fim.t - ini.t) / 1000).toFixed(2),
  });
}

console.log('\n===== CUSTO =====');
for (const r of rodadas) {
  const fala = resultado.falas?.find((f) => f.rotulo === r.rotulo);
  const tokens = fala?.tokens ?? 0;
  console.log(
    `${r.rotulo.padEnd(10)} parede ${String(r.paredeS).padStart(7)}s`
    + ` · CPU ${String(r.cpuS).padStart(8)}s`
    + ` · ${String(tokens).padStart(3)} tok`
    + ` · ${tokens ? (r.cpuS / tokens).toFixed(3) : '—'} s-CPU/token`
    + ` · ${fala?.tps ?? '—'} tok/s`
    + ` · rascunho ${fala?.rascunho ?? '—'}`,
  );
}
console.log(JSON.stringify({ rodadas, falas: resultado.falas }, null, 2));
process.exit(resultado?.ok ? 0 : 1);
