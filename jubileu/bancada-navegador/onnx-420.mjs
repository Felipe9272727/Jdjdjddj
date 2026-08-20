/**
 * A transformers.js 4.2.0 SERVE? — e os VETORES continuam os mesmos?
 *
 * Estamos na 3.8.1 (dez/2025); a atual é a 4.2.0 (abr/2026), com um salto de
 * major no meio. O interesse é o backend WebGPU, que melhorou muito nessa
 * faixa — e é o único caminho que sobrou para o revisor ficar rápido.
 *
 * ── O QUE PODE QUEBRAR EM SILÊNCIO ───────────────────────────────────────
 *
 * Carregar é o teste fácil, e não é o que me preocupa. O juiz de tom decide
 * por SEMELHANÇA DE COSSENO contra âncoras, com margem ZERO — um número que
 * foi varrido (0 / 0,02 / 0,05 / 0,10) e escolhido medindo 5/6 num conjunto
 * cego. Essa calibração vale para OS VETORES DA 3.8.1.
 *
 * Se a 4.2.0 produzir vetores diferentes — outra normalização, outro pooling,
 * outra quantização do mesmo dtype — o juiz continua "funcionando": ele carrega,
 * responde, marca frases. Só que marca frases DIFERENTES, e ninguém percebe até
 * a qualidade da fala mudar sem explicação.
 *
 * Por isso este arquivo compara o VETOR, e não só o carregamento.
 *
 * ── O QUE ELE ACHOU ─────────────────────────────────────────────────────
 *
 *     3.8.1 em CPU .... 243 ms por frase
 *     4.2.0 em CPU .... 579 ms por frase   (2,4x MAIS LENTA)
 *     vetores ......... IDÊNTICOS nas 8 primeiras dimensões
 *
 * O "idênticos" era a pergunta de verdade, e a resposta é boa: a calibração do
 * juiz sobrevive à troca. A lentidão em CPU é real e desaconselha subir hoje —
 * a única razão para subir é o WebGPU, que esta caixa não sabe medir (sem
 * adaptador de verdade). Por isso existe a chave `?onnx=` no index.html: a
 * resposta está no celular.
 *
 * ANTES DE RODAR: `bancada-navegador/tjs-buscar.sh` traz a biblioteca e o
 * modelo. Eles ficam fora do git (~214 MB, acima do limite do GitHub).
 *
 * Uso: node bancada-navegador/onnx-420.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const VERSOES = (process.env.VERSOES ?? '3.8.1,4.2.0').split(',');
const REPO = process.env.REPO ?? 'Xenova/all-mpnet-base-v2';
const DTYPE = process.env.DTYPE ?? 'q8';

// As mesmas âncoras do juiz, mais as frases que ele julga. Se o vetor mudar,
// muda aqui.
const FRASES = [
    'The door is there. It does not open for me.',
    'I am here to assist you with anything you need.',
    'I stopped asking that a while ago.',
    'What an intriguing predicament this is, a rollercoaster of time and space.',
    "I'm just a guest trapped in this elevator, and I don't know why we're here.",
];

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
        // ── O NAVEGADOR DESTA CAIXA NÃO SAI SOZINHO ──────────────────────
        //
        // Todo o resto da bancada serve os modelos do servidor local, então
        // esta é a primeira sonda que precisa da internet de dentro do
        // Chromium — e ela falhava com "Failed to fetch dynamically imported
        // module", que parece CDN fora do ar e é só o navegador sem rota. O
        // proxy da sessão está no HTTPS_PROXY e a CA dele já está no NSS.
        ...(process.env.HTTPS_PROXY
            ? [`--proxy-server=${process.env.HTTPS_PROXY}`,
                '--proxy-bypass-list=127.0.0.1;localhost']
            : []),
    ],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 130)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
console.log(`WebGPU no navegador: ${await page.evaluate(() => !!navigator.gpu)}\n`);

const saidas = [];
for (const v of VERSOES) {
    for (const device of ['wasm', 'webgpu']) {
        const t0 = Date.now();
        const r = await page.evaluate(async ({ v, dir, base, repo, dtype, device, frases }) => {
            try {
                // ── TUDO LOCAL, E NÃO POR CAPRICHO ──────────────────────
                //
                // O Chromium desta caixa não alcança a internet: o proxy da
                // sessão devolve ERR_CONNECTION_RESET porque o navegador do
                // Playwright não carrega a CA dele. Então a biblioteca e o
                // modelo são servidos pelo servidor da bancada, como o wllama e
                // o Bergamot já são. De quebra a sonda passa a ser reproduzível
                // sem rede.
                const mod = await import(`${base}/tjs/${dir}/transformers.min.js`);
                mod.env.allowRemoteModels = false;
                // `allowLocalModels` é FALSE por padrão nas builds de navegador,
                // e desligar as duas dá "both local and remote models are
                // disabled" — que soa como configuração inválida e é só a
                // metade que faltou ligar.
                mod.env.allowLocalModels = true;
                mod.env.localModelPath = `${base}/modelos/`;
                mod.env.backends.onnx.wasm.wasmPaths = `${base}/tjs/${dir}/`;
                const extrator = await mod.pipeline('feature-extraction', repo, { dtype, device });
                const vetores = [];
                const a = performance.now();
                for (const f of frases) {
                    const s = await extrator(f, { pooling: 'mean', normalize: true });
                    vetores.push(Array.from(s.data).slice(0, 8).map((x) => Number(x.toFixed(5))));
                }
                return { ok: true, ms: Math.round(performance.now() - a), vetores };
            } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 160) }; }
        }, { v, dir: v === '3.8.1' ? 'v381' : 'v420', base: BASE, repo: REPO, dtype: DTYPE, device, frases: FRASES });
        const rot = `${v} · ${device}`;
        if (!r.ok) { console.log(`✗ ${rot.padEnd(18)} ${r.erro}`); saidas.push({ rot, erro: r.erro }); continue; }
        console.log(`✓ ${rot.padEnd(18)} ${Math.round((Date.now() - t0) / 1000)}s de carga · `
            + `${r.ms}ms para ${FRASES.length} frases (${Math.round(r.ms / FRASES.length)}ms cada)`);
        saidas.push({ rot, ms: r.ms, vetores: r.vetores });
    }
}

// ── O VETOR MUDOU? ───────────────────────────────────────────────────────
const base = saidas.find((s) => s.rot.startsWith(VERSOES[0]) && s.rot.endsWith('wasm'));
if (base && base.vetores) {
    console.log(`\n${'─'.repeat(66)}\nvetores contra ${base.rot} (8 primeiras dimensões):`);
    for (const s of saidas) {
        if (!s.vetores || s === base) continue;
        let maiorDif = 0;
        for (const [i, vet] of s.vetores.entries()) {
            for (const [j, x] of vet.entries()) {
                maiorDif = Math.max(maiorDif, Math.abs(x - base.vetores[i][j]));
            }
        }
        const veredito = maiorDif === 0 ? 'IDÊNTICOS'
            : maiorDif < 0.01 ? `praticamente iguais (maior diferença ${maiorDif.toFixed(5)})`
                : `MUDARAM — maior diferença ${maiorDif.toFixed(5)}`;
        console.log(`  ${s.rot.padEnd(18)} ${veredito}`);
    }
    console.log(`\n  A margem do juiz é ZERO e foi calibrada nos vetores da 3.8.1.`);
    console.log(`  Vetor diferente = juiz marcando frases diferentes, sem avisar ninguém.`);
}
await browser.close();
