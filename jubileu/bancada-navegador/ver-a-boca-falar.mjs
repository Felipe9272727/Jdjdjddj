// ── A BOCA SE MEXENDO ────────────────────────────────────────────────────────
//
// A volta 25 fotografou as formas paradas e assumiu por escrito a dívida: a boca
// EM MOVIMENTO, sincronizada com a fala, não tinha sido vista. A bancada da
// cutscene roda a ~2 fps e as dez fotos pegaram só o cartão de título.
//
// Esta entra pelo caminho barato: o preview `?f3preview` já monta o Floor3Rival,
// que lê `f3Fala` para mover a boca, e `window.__f3Dizer` existe em DEV. Então
// dá para mandá-lo falar sem atravessar intro nenhuma.
//
// E ela mede além da foto: `window.__f3BocaLog` guarda cada TROCA de boca com a
// hora. A foto prova que a boca existe; a sequência prova que ela sincroniza.
//
//   node bancada-navegador/ver-a-boca-falar.mjs [sufixo]
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = process.argv[2] ?? 'agora';
const PORTA = process.env.PORTA ?? '3011';
const SAIDA = process.env.SAIDA ?? '/tmp';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const CAM = 'cam=0.70,1.88,15.05&alvo=0.66,1.84,14';

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const perfil = mkdtempSync(join(tmpdir(), 'f3fala-'));
const ctx = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: { width: 1024, height: 640 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'],
});
const p = ctx.pages()[0] ?? await ctx.newPage();
await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 140)));

await p.goto(`http://127.0.0.1:${PORTA}/index.html?f3preview&nopost&${CAM}`,
    { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => typeof window.__f3Dizer === 'function', null, { timeout: 180000 });
await p.waitForTimeout(12000);   // deixa o rig montar e o Rival se plantar

// A fala mais longa do repertório do estrago, com acento em CAIXA ALTA.
const FRASE = { evento: 'desenhou', roubados: 1 };
await p.evaluate(() => { window.__f3BocaLog = []; });
await p.evaluate(({ e, r }) => {
    window.__f3Pincel?.(r);
    window.__f3Dizer?.(e, { roubados: r });
}, { e: FRASE.evento, r: FRASE.roubados });

// Rajada curta: a fala inteira dura menos de um segundo de partitura, mas o
// navegador aqui anda a ~2 fps, então o relógio dele estica tudo.
for (let i = 0; i < 8; i++) {
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${SAIDA}/f3-falando-${String(i).padStart(2, '0')}-${S}.png` })
        .catch((e) => console.log('   (sem foto:', String(e.message).slice(0, 50), ')'));
}
await p.waitForTimeout(4000);

const log = await p.evaluate(() => (window.__f3BocaLog ?? []).slice()).catch(() => []);
const texto = await p.evaluate(() => document.body.innerText.slice(0, 0)).catch(() => '');
console.log('\n── A SEQUÊNCIA DA BOCA ──');
if (!log.length) console.log('  (nada — a boca não trocou de forma nenhuma vez)');
const t0 = log.length ? log[0].t : 0;
for (const e of log) console.log(`  +${String(e.t - t0).padStart(5)} ms  ${e.boca}`);
console.log(`\n  trocas: ${log.length}   formas distintas: ${new Set(log.map(e => e.boca)).size}`);
console.log('  fotos em', SAIDA, texto);

ponte.fechar(); await ctx.close().catch(() => {});
rmSync(perfil, { recursive: true, force: true });
