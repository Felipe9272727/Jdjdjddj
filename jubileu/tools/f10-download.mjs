/**
 * "NÃO ESTOU CONSEGUINDO BAIXAR NADA" — testar do NAVEGADOR, que é onde dói.
 *
 * O container tem proxy e credenciais; o celular do Felipe não tem nem um nem
 * outro. Então este teste pede os arquivos a partir da PÁGINA, com a mesma
 * origem e os mesmos cabeçalhos de isolamento do jogo, e reporta status, CORS e
 * a velocidade real do primeiro megabyte.
 *
 * Uso:  CHROMIUM_PATH=... node tools/f10-download.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/?mente';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

const alvos = await page.evaluate(async () => {
    const { SMALL_BRAIN_CATALOG } = await import('/src/npc/floor10Brains.ts');
    const { FLOOR10_MODEL } = await import('/src/npc/wllamaEngine.ts');
    return [
        { nome: `FALA · ${FLOOR10_MODEL.label}`, url: FLOOR10_MODEL.url, bytes: 0 },
        ...SMALL_BRAIN_CATALOG.map((m) => ({
            nome: `VONTADE · ${m.label}`, url: m.url, bytes: m.bytes,
        })),
    ];
});

for (const alvo of alvos) {
    const r = await page.evaluate(async ({ url: u, bytes }) => {
        const t0 = performance.now();
        try {
            // Só o primeiro pedaço: interessa saber se ABRE, não baixar tudo.
            const resp = await fetch(u, { headers: { Range: 'bytes=0-1048575' } });
            const buf = await resp.arrayBuffer();
            const ms = performance.now() - t0;
            return {
                status: resp.status,
                tipo: resp.headers.get('content-type'),
                tamanho: resp.headers.get('content-range') ?? resp.headers.get('content-length'),
                cors: resp.headers.get('access-control-allow-origin'),
                recebido: buf.byteLength,
                // Assinatura do formato: um .gguf começa com os bytes "GGUF".
                magica: new TextDecoder().decode(new Uint8Array(buf.slice(0, 4))),
                ms: Math.round(ms),
                kbs: Math.round(buf.byteLength / 1024 / (ms / 1000)),
                esperado: bytes,
                erro: null,
            };
        } catch (e) {
            return { erro: String(e).slice(0, 200), ms: Math.round(performance.now() - t0) };
        }
    }, alvo);

    console.log(`\n=== ${alvo.nome}`);
    console.log('   ', alvo.url);
    if (r.erro) {
        console.log(`    FALHOU em ${r.ms}ms → ${r.erro}`);
        continue;
    }
    console.log(`    HTTP ${r.status} · ${r.tipo} · CORS: ${r.cors ?? '(nenhum)'}`);
    console.log(`    faixa: ${r.tamanho} · recebeu ${(r.recebido / 1024).toFixed(0)} KB`
        + ` em ${r.ms}ms (${r.kbs} KB/s)`);
    console.log(`    assinatura do arquivo: ${JSON.stringify(r.magica)}`
        + (r.magica === 'GGUF' ? ' ✓' : '  ← NÃO é um .gguf!'));
}

await browser.close();
