/**
 * ── O K-QUANT É O GARGALO DO WASM? ──────────────────────────────────────
 *
 * Eu disse que o wasm "não ganha com lote" (1,5× contra 6,3× do nativo) e
 * culpei a falta de kernel wasm no tinyBLAS. ERRADO: o `llamafile_sgemm` só
 * aceita F32, F16, BF16, Q4_0, Q5_0, Q8_0 e IQ4_NL. **Q4_K não está na lista**,
 * então o SmolLM3 Q4_K_M nunca passa pelo tinyBLAS — nem no x86.
 *
 * Sobra a outra hipótese, e é testável sem escrever kernel nenhum: o produto
 * escalar do K-quant é caro. Q4_K tem super-blocos com escalas hierárquicas de
 * 6 bits que precisam ser desempacotadas a cada bloco; Q4_0 tem um escalar por
 * bloco de 32 e mais nada. Se for isso, trocar a quantização resolve.
 *
 * Mede, para cada modelo, as duas pontas separadas:
 *
 *   GERAÇÃO ..... prompt em cache, só o custo por token novo
 *   PREFILL ..... cache desligado, o custo por token de entrada
 *   RAZÃO ....... quanto o lote ainda vale neste build
 *
 * ATENÇÃO À QUALIDADE: o Q4_0 daqui foi REQUANTIZADO a partir do Q4_K_M
 * (`--allow-requantize`), então ele perdeu duas vezes. Serve para medir
 * VELOCIDADE, que é função da aritmética e do tamanho, não da qualidade dos
 * pesos. Para julgar a fala, é preciso um Q4_0 feito do f16.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const PACOTE = process.env.PACOTE ?? 'wllama-velho';
const MODELOS = (process.env.MODELOS ?? 'smollm3.gguf,smollm3-q40.gguf').split(',');
const N = Number(process.env.N ?? 32);
const UBATCH = process.env.UBATCH ? Number(process.env.UBATCH) : null;

const PERSONA = 'You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest '
    + 'trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.\n'
    + 'You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, '
    + "as the player's equal, never as a helper; do not offer service and do not ask for orders.\n"
    + 'Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator '
    + 'door; there is no corridor and no window, and you have never left. The elevator does not obey you. '
    + 'You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.\n'
    + "Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label.";
const PERGUNTA = 'Hi what is your name? do you know why we are here?';

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});

for (const modelo of MODELOS) {
    const page = await browser.newPage();
    await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const r = await page.evaluate(async ({ base, pacote, modelo, persona, pergunta, n, ub }) => {
        const mod = await import(`${base}/${pacote}/index.js`);
        const w = new mod.Wllama({ default: `${base}/${pacote}/wllama.wasm` });
        await w.loadModelFromUrl(`${base}/${modelo}`, {
            n_ctx: 2048, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
            jinja: true, reasoning: false, warmup: false,
            ...(ub ? { n_ubatch: ub } : {}),
        });
        const turno = async (cache, nn) => {
            const t = performance.now();
            const res = await w.createChatCompletion({
                messages: [{ role: 'system', content: persona }, { role: 'user', content: pergunta }],
                n_predict: nn, temp: 0, cache_prompt: cache, ignore_eos: true,
            });
            return { ms: performance.now() - t, txt: res?.choices?.[0]?.message?.content ?? '' };
        };
        await turno(true, 4);                       // aquece e enche o cache
        const g = []; for (let i = 0; i < 3; i++) g.push((await turno(true, n)).ms);
        const g2 = []; for (let i = 0; i < 3; i++) g2.push((await turno(true, n * 2)).ms);
        const frio = await turno(false, n);
        const amostra = (await turno(true, n)).txt;
        return { g, g2, frio: frio.ms, amostra };
    }, { base: BASE, pacote: PACOTE, modelo, persona: PERSONA, pergunta: PERGUNTA, n: N, ub: UBATCH });
    await page.close();

    const med = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    // A diferença entre N e 2N tokens isola o custo MARGINAL por token gerado,
    // sem o custo fixo da chamada.
    const porTokenGerado = (med(r.g2) - med(r.g)) / N;
    // O frio paga o prompt inteiro (~230 tokens) além da geração.
    const porTokenPrefill = (r.frio - med(r.g)) / 230;
    console.log(`\n  ${modelo}${UBATCH ? ` · n_ubatch=${UBATCH}` : ' · n_ubatch padrão'}`);
    console.log(`    geração ... ${porTokenGerado.toFixed(0)} ms/token   (${(1000 / porTokenGerado).toFixed(2)} tok/s)`);
    console.log(`    prefill ... ${porTokenPrefill.toFixed(0)} ms/token   (${(1000 / porTokenPrefill).toFixed(2)} tok/s)`);
    console.log(`    ganho do lote ... ${(porTokenGerado / porTokenPrefill).toFixed(2)}×`);
    console.log(`    "${r.amostra.replace(/\n/g, ' ').slice(0, 90)}"`);
}
await browser.close();
