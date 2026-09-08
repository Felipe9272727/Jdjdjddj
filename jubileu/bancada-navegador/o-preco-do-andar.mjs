// ── O PREÇO DO ANDAR 3 ───────────────────────────────────────────────────────
//
// A regra número um do Felipe é velocidade no celular dele, e numa noite inteira
// de trabalho eu acrescentei a este andar uma boca com textura de canvas, uma
// gravata, dois materiais com shader próprio, instantâneo de ossos por quadro e
// uma voz com dezenas de nós de áudio — sem medir o custo de nada disso.
//
// Esta bancada lê `window.__f3perf()` (a sonda em `Floor3.tsx`) e compara com a
// linha de base medida antes de tudo: 101 draws, 68.590 triângulos, 4 texturas,
// 55 geometrias, 11 programas.
//
//   node bancada-navegador/o-preco-do-andar.mjs
import { chromium, devices } from 'playwright';
import { abrirPonte } from './ponte.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A "linha de base" antiga (101 draws, 68.590 triângulos) foi medida NOUTRO
// ponto de câmera, e comparar draws entre enquadramentos diferentes não diz
// nada — quantas plataformas estão no tronco de visão muda tudo. Ela fica aqui
// só como registro histórico, e a bancada NÃO subtrai mais uma da outra.
// A linha de base útil é a que esta bancada mede, sempre no mesmo estado.
const HISTORICO = { draws: 101, tris: 68590, texturas: 4, geometrias: 55, programas: 11 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');

const ponte = abrirPonte({ manterCache: true, registrar: () => {} });
const perfil = mkdtempSync(join(tmpdir(), 'f3preco-'));
const ctx = await chromium.launchPersistentContext(perfil, {
    executablePath: process.env.CHROMIUM_BIN ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: devices['Pixel 5'].userAgent,
    args: ['--no-sandbox','--disable-setuid-sandbox','--unlimited-storage','--use-gl=angle',
           '--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'],
});
const p = ctx.pages()[0] ?? await ctx.newPage();
await ponte.instalarEm(p);
await p.route('**://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
await p.route('**://www.google.com/**', (r) => r.abort());
p.on('pageerror', (e) => console.log('  [erro]', String(e.message).slice(0, 140)));

// `PARAM=semolhos` mede o mesmo andar SEM os olhos desenhados. É assim que se
// responde "quanto custou a cara nova" sem depender de comparar duas execuções
// da bancada, que variam com a câmera e com o SwiftShader desta caixa.
const PARAM = process.env.PARAM ? `?${process.env.PARAM}` : '';
await p.goto(`http://127.0.0.1:3011/index.html${PARAM}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForFunction(() => typeof window.__startFloor === 'function', null, { timeout: 120000 });
await p.evaluate(() => window.__startFloor?.(3));
await p.waitForFunction(() => typeof window.__f3perf === 'function', null, { timeout: 300000 });
await p.waitForTimeout(20000);
// Zera o pico e deixa desenhar de novo: assim o número é DESTE estado, e não do
// carregamento (que desenha coisa que já saiu de cena).
await p.evaluate(() => window.__f3zerar?.()).catch(() => {});
await p.waitForTimeout(8000);

const ler = () => p.evaluate(() => ({ ...window.__f3perf(), fps: window.__f3fps?.() })).catch(() => null);

console.log('estado                    draws    tris  texturas  geom  programas');
const linha = (nome, m) => console.log(
    `${nome.padEnd(24)} ${String(m.draws).padStart(5)} ${String(m.tris).padStart(7)} ${String(m.texturas).padStart(9)} ${String(m.geometrias).padStart(5)} ${String(m.programas).padStart(10)}`);

linha('histórico (outra câmera)', HISTORICO);
const inteiro = await ler();
if (inteiro) linha('agora, andar inteiro', inteiro);

// E com o andar desmanchado, que é quando mais coisa está no ar.
await p.evaluate(() => window.__f3Pincel?.(3)).catch(() => {});
await p.evaluate(() => window.__f3Dizer?.('roubou', { roubados: 3 })).catch(() => {});
await p.evaluate(() => window.__f3zerar?.()).catch(() => {});
await p.waitForTimeout(8000);
const desfeito = await ler();
if (desfeito) linha('3 pincéis + falando', desfeito);

if (inteiro) {
    // O que É comparável entre execuções: programas de shader e texturas, que
    // são estado cumulativo e não dependem de para onde a câmera aponta.
    console.log('\n  programas de shader:', inteiro.programas, '  texturas:', inteiro.texturas);
    console.log('  quadro (ms):', JSON.stringify(inteiro.fps), '(SwiftShader desta caixa, não o celular)');
}

ponte.fechar(); await ctx.close().catch(() => {}); rmSync(perfil, { recursive: true, force: true });
