// ── A NÉVOA DO ANDAR 3, MEDIDA NUMA GPU DE VERDADE ───────────────────────────
//
// O teste de unidade (f3Nevoa.test.ts) confere a conta e resolve os `#include`
// como o three resolve, mas não COMPILA o shader nem olha um pixel. Este aqui
// abre um contexto WebGL, compila todos os option-sets que o Andar 3 usa de
// verdade e lê a cor do centro da tela com e sem névoa.
//
//   npm run dev -- --port=3011      (noutro terminal)
//   node bancada-navegador/nevoa-do-andar-3.mjs
//
// Medido em 2026-09-05 (SwiftShader, far=40 = a qualidade BAIXA):
//   céu #dde2e7                    = 221,226,231
//   longe SEM névoa                = 247,241,225   (distância ao céu 30,6)
//   longe COM névoa                = 221,226,231   (distância ao céu  0,0)
//   perto COM névoa                = 247,241,225   (não lava o que está perto)
//   2 programas (USE_FOG lig/desl), 0 erros de GL, 0 erros de console.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
function acharChromium() {
    if (process.env.CHROMIUM_BIN) return process.env.CHROMIUM_BIN;
    const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    let pastas = [];
    try { pastas = fs.readdirSync(raiz); } catch { return undefined; }
    const cands = pastas.filter((x) => x.startsWith('chromium'))
        .sort((a, b) => Number(a.includes('headless')) - Number(b.includes('headless')));
    for (const pasta of cands)
        for (const rel of ['chrome-linux/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
            const alvo = path.join(raiz, pasta, rel);
            if (fs.existsSync(alvo)) return alvo;
        }
    return undefined;
}
const exe = acharChromium();
console.log('chromium: ' + exe);
const b = await chromium.launch({ ...(exe ? { executablePath: exe } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage();
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 500)}`));
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message.slice(0, 500)));
const PORTA = process.env.PORTA || '3011';
await p.goto(`http://127.0.0.1:${PORTA}/bancada-navegador/nevoa-do-andar-3.html`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof window.__pronto === 'string', null, { timeout: 60000 }).catch(() => {});
console.log(await p.evaluate(() => window.__pronto ?? '(sem resultado)'));
console.log('--- console da pagina ---');
for (const l of logs.slice(0, 25)) console.log(l);
await b.close();
