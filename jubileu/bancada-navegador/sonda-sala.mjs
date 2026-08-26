// ── O QUE A SALA MOSTRA DE VERDADE, NO BUILD DE VERDADE ──────────────────
//
// Esta sonda existe porque passei uma sessão inteira DEDUZINDO qual build
// estava no aparelho do dono do jogo pelo número de MB no card do revisor —
// 812 MB é o q8_0 antigo, 542 MB é o q4_K_M novo. Deduzir a versão pelo
// tamanho de um arquivo não é diagnóstico, é adivinhação, e ela custou três
// rodadas de "continua não funcionando".
//
// `npm run build` diz que compilou. Os testes dizem que as funções respondem.
// Nenhum dos dois carrega a página e lê o que está escrito nela — e era
// exatamente aí que a resposta estava.
//
//   node bancada-navegador/servidor.mjs "$PWD/dist" 3407 &
//   BASE=http://127.0.0.1:3407 node bancada-navegador/sonda-sala.mjs
//
// O que ela responde, em uma tela:
//   · qual commit está no bundle (o carimbo que `vite.config.ts` injeta)
//   · se a página está cross-origin isolated — sem isso não há
//     SharedArrayBuffer, e sem SharedArrayBuffer o wllama nem sobe
//   · quais peças a fila lista, com os tamanhos que ela promete
//   · todo erro de JS e de console, que é o que some quando se olha só o print
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3407';
const ROTA = process.env.ROTA ?? '/?pipeline&revisor=v2';
const ESPERA_MS = Number(process.env.ESPERA_MS ?? 6000);

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(`página · ${String(e.message).slice(0, 300)}`));
page.on('console', (m) => {
    if (m.type() === 'error') erros.push(`console · ${m.text().slice(0, 220)}`);
});
// `networkidle` e não `domcontentloaded`: o bundle tem 87 MB e a lista de peças
// só existe depois do React montar.
await page.goto(`${BASE}${ROTA}`, { waitUntil: 'networkidle', timeout: 180000 });
await page.waitForTimeout(ESPERA_MS);

const info = await page.evaluate(() => ({
    carimbo: globalThis.__TNE_BUILD__ ?? null,
    isolado: globalThis.crossOriginIsolated === true,
    sab: typeof SharedArrayBuffer !== 'undefined',
    texto: document.body.innerText ?? '',
}));

const c = info.carimbo;
console.log(`\n  rota    ${ROTA}`);
console.log(`  build   ${c ? `${c.commit} · ${c.ref} · ${c.built}` : 'DESCONHECIDO (o carimbo não foi injetado)'}`);
console.log(`  isolada ${info.isolado ? 'sim' : 'NÃO — sem SharedArrayBuffer o wllama não sobe'}`
    + ` · SharedArrayBuffer ${info.sab ? 'sim' : 'NÃO'}`);

// As peças aparecem como "nome … 822 MB" no texto corrido da página. Pegar
// pelo tamanho é frágil de propósito: é o número que o jogador vê, e é ele que
// denuncia um bundle velho.
const pecas = [...info.texto.matchAll(/^(.+·.+)\n(?:.*\n)?(\d[\d.,]*\s*[KMG]B)$/gm)]
    .map((m) => `${m[1].trim()} — ${m[2]}`);
const fila = info.texto.match(/(\d[\d.,]*\s*\w*B de [\d.,]+\s*\w*B · \d+ de \d+ peças)/);
console.log(`\n  ${fila?.[1] ?? 'fila não encontrada na página'}`);
for (const p of pecas) console.log(`    ${p}`);

console.log(`\n  erros (${erros.length})`);
for (const e of erros.slice(0, 12)) console.log(`    ${e}`);
if (process.env.TUDO === '1') console.log(`\n${info.texto}`);
await browser.close();
