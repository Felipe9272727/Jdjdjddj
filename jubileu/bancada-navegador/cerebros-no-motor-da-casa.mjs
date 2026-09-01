// ── OS OUTROS TRÊS CÉREBROS SOBEM NO MOTOR DA CASA? ──────────────────────
//
// `andar-10-real.mjs` mostrou que o navegador parou de buscar o wllama do
// jsdelivr depois que memória, vontade e motor passaram a apontar para
// `/wllama-relaxed`. Isso prova que ninguém PEDIU o CDN — não prova que os três
// SOBEM com o binário da casa, porque na fila eles só baixam os pesos; o
// runtime só nasce quando o cérebro é usado.
//
// Esta bancada usa cada um deles de verdade:
//
//   memória → `precarregarMemoria()` e depois `lembrarPorSignificado()`
//   motor   → `precarregarMotor()` (o runtime, não só o download)
//   vontade → `precarregarVontade()`
//
// e no fim lista TODA URL de motor que o navegador pediu.
//
//   DISABLE_HMR=true npm run dev
//   node bancada-navegador/cerebros-no-motor-da-casa.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-andar10',
    porta: Number(process.env.PORTA_PONTE ?? 3451),
    guardarGrandes: 8,
    manterCache: true,
});
const contexto = await chromium.launchPersistentContext(process.env.PERFIL ?? '/home/user/perfil-andar10', {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = contexto.pages()[0] ?? await contexto.newPage();
await ponte.instalarEm(page);
const motores = new Set();
page.on('request', (r) => {
    const u = r.url();
    if (/wllama/i.test(u)) motores.add(u.replace(VITE, '‹local›'));
});
await page.goto(`${VITE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => typeof window.__startFloor === 'function', { timeout: 120_000 });
await page.evaluate(() => window.__startFloor(10));

const seg = (ms) => `${(ms / 1000).toFixed(1)}s`;
async function usar(nome, corpo) {
    const t = Date.now();
    try {
        const r = await page.evaluate(corpo);
        console.log(`  ${r?.ok ? '✓' : '✗'} ${nome.padEnd(30)} ${seg(Date.now() - t).padStart(7)}  ${JSON.stringify(r).slice(0, 220)}`);
        return r;
    } catch (e) {
        console.log(`  ✗ ${nome.padEnd(30)} ${seg(Date.now() - t).padStart(7)}  ${String(e?.message ?? e).slice(0, 180)}`);
        return null;
    }
}

console.log('\n  usando cada cérebro de verdade:\n');
await usar('memória — subir o runtime', async () => {
    const M = await import('/src/npc/floor10Memoria.ts');
    const ok = await M.precarregarMemoria();
    return { ok, dePe: M.memoriaJaCarregada() };
});
await usar('memória — lembrar por significado', async () => {
    const M = await import('/src/npc/floor10Memoria.ts');
    const f = await M.lembrarPorSignificado('o elevador deste andar');
    // `null` é resposta legítima (nada parecido o bastante na base); o que se
    // mede aqui é o runtime ter RODADO sem estourar.
    return { ok: M.memoriaJaCarregada(), lembrou: f ? String(f.texto ?? f).slice(0, 90) : null };
});
await usar('motor — subir o runtime', async () => {
    const M = await import('/src/npc/floor10MotorBrain.ts');
    const r = await M.precarregarMotor();
    return { ok: M.motorJaCarregado(), retorno: !!r };
});
await usar('vontade — subir o runtime', async () => {
    const S = await import('/src/npc/floor10SmallBrain.ts');
    const r = await S.precarregarVontade();
    return { ok: S.vontadeJaCarregada(), retorno: !!r };
});

console.log('\n  toda URL de motor que o navegador pediu:');
for (const m of motores) console.log(`    ${m}`);
const cdn = [...motores].filter((m) => /jsdelivr|unpkg|esm\.sh/.test(m));
console.log(`\n  ${cdn.length === 0 ? '✓ nenhum motor veio de CDN' : `✗ ainda vem de CDN: ${cdn.join(', ')}`}`);
await contexto.close();
ponte.fechar();
