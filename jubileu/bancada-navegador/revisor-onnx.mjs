// ── O REVISOR PELO CAMINHO DO ONNX ────────────────────────────────────────
//
// Pedido do dono do jogo, depois de reprovar o WebGPU do wllama no aparelho
// dele ("o do wllama é muito ruim, o do onnx deu menos problema"): *"usa o
// falcon via onnx, vai la"*.
//
// ── O QUE EXISTE, E O QUE NÃO EXISTE ─────────────────────────────────────
//
// O Falcon-H1 que venceu a caçada é o de **1.5B**, e ele NÃO tem build ONNX.
// Procurado no hub inteiro, o único Falcon-H1 em ONNX é a família Tiny:
//
//     onnx-community/Falcon-H1-Tiny-90M-Instruct-ONNX
//     onnx-community/Falcon-H1-Tiny-Multilingual-100M-Instruct-ONNX
//     onnx-community/Falcon-H1-Tiny-Coder-90M-ONNX
//
// 90M contra 1500M. A 2ª lei deste projeto diz que abaixo de ~1B o modelo
// colapsa, e nesta mesma caçada o granite 4.0 de 350M colapsou em ECO (7 de 12
// respostas eram a pergunta do jogador de volta). Então a expectativa aqui é
// baixa, e medir mesmo assim tem dois motivos que não dependem do placar:
//
//   1. é o único Falcon-H1 em ONNX que existe — dizer "não dá" sem medir seria
//      opinião, e opinião já custou caro nesta caçada;
//   2. ele responde a pergunta que decide o caminho INTEIRO: a arquitetura
//      `falcon_h1` de fato roda no transformers.js? A 4.2.0 declara suporte (14
//      menções a falcon_h1 no bundle; a 3.8.1 que o jogo usa tem ZERO), e uma
//      coisa é declarar, outra é carregar e gerar.
//
// Se rodar, o caminho para o 1.5B fica claro e é só trabalho: exportar o modelo
// para ONNX com o optimum e hospedar. Se não rodar, o caminho está fechado por
// biblioteca e não adianta exportar nada.
//
// ── ONDE ISTO NÃO SERVE ──────────────────────────────────────────────────
//
// Roda no Chromium desta caixa, que não tem GPU. O `device` fica em `wasm` por
// padrão; `DEVICE=webgpu` existe para quando alguém rodar num aparelho de
// verdade. O tempo daqui NÃO prevê o celular — essa lição já foi paga com o
// Llama.
//
// Uso:
//   node servidor.mjs . 3311 &
//   node revisor-onnx.mjs
//   REPO=... DTYPE=q4f16 DEVICE=webgpu node revisor-onnx.mjs
import { chromium } from 'playwright';
import { DEFEITOS, CERTAS, QUEBRA_CANONE, NO_ASSUNTO, ECOOU, FRAGMENTO, MOTIVO } from './defeitos.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const REPO = process.env.REPO ?? 'onnx-community/Falcon-H1-Tiny-90M-Instruct-ONNX';
const DTYPE = process.env.DTYPE ?? 'quantized';
const DEVICE = process.env.DEVICE ?? 'wasm';
const MAX = Number(process.env.MAX_TOKENS ?? 40);

// A MESMA persona do rascunhador e do revisor do wllama. Sem isso o placar não
// compara com nada.
const LONGA = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured. You decide for yourself, as the player's equal, never as a helper.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.`;

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 140)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
// ── `navigator.gpu` NÃO É "TEM GPU" ──────────────────────────────────────
//
// Esta sonda dizia `WebGPU: true` nesta caixa, que não tem GPU nenhuma — o
// objeto existe, o ADAPTADOR é que não. Depois o carregamento morria com
// "Failed to get GPU adapter", e o "true" de antes só serviu para eu achar que
// o problema era outro. Perguntar pelo adaptador é a pergunta certa.
const gpu = await page.evaluate(async () => {
    if (!navigator.gpu) return 'sem navigator.gpu';
    try {
        const a = await navigator.gpu.requestAdapter();
        return a ? 'adaptador ok' : 'navigator.gpu existe, mas SEM adaptador';
    } catch (e) { return `falhou: ${String(e?.message ?? e).slice(0, 80)}`; }
});
console.log(`WebGPU neste navegador: ${gpu}`);

const subiu = await page.evaluate(async ({ base, repo, dtype, device }) => {
    try {
        const mod = await import(`${base}/tjs/v420/transformers.min.js`);
        mod.env.allowRemoteModels = false;
        mod.env.allowLocalModels = true;
        mod.env.localModelPath = `${base}/modelos/`;
        mod.env.backends.onnx.wasm.wasmPaths = `${base}/tjs/v420/`;
        const t = performance.now();
        window.__g = await mod.pipeline('text-generation', repo, { dtype, device });
        return { ok: true, ms: Math.round(performance.now() - t) };
    } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 220) }; }
}, { base: BASE, repo: REPO, dtype: DTYPE, device: DEVICE });

if (!subiu.ok) {
    console.log(`\n████ ${REPO} — NÃO CARREGOU\n     ${subiu.erro}`);
    console.log('\n  Se o erro fala de "Unsupported model type", a arquitetura falcon_h1 não');
    console.log('  roda nesta biblioteca — e aí exportar o 1.5B para ONNX não adiantaria.');
    await browser.close();
    process.exit(0);
}
console.log(`\n████ ${REPO} — carga ok em ${(subiu.ms / 1000).toFixed(1)}s · dtype ${DTYPE} · ${DEVICE}\n`);

const gerar = (sistema, texto) => page.evaluate(async ({ sistema, texto, max }) => {
    const t = performance.now();
    try {
        const r = await window.__g(
            [{ role: 'system', content: sistema }, { role: 'user', content: texto }],
            { max_new_tokens: max, do_sample: false, return_full_text: false },
        );
        const saida = r?.[0]?.generated_text;
        const txt = typeof saida === 'string' ? saida : (saida?.at?.(-1)?.content ?? '');
        return { ms: Math.round(performance.now() - t), texto: String(txt).trim() };
    } catch (e) { return { ms: Math.round(performance.now() - t), texto: '', erro: String(e?.message ?? e).slice(0, 160) }; }
}, { sistema, texto, max: MAX });

// NÃO AQUECE — mesma decisão das outras bancadas, mesmo motivo: no jogo a
// primeira chamada é a única que o jogador espera.
let conserta = 0, ecos = 0, pedacos = 0, desviou = 0, vazio = 0, msFria = 0, msTot = 0, n = 0;
for (const c of DEFEITOS) {
    const r = await gerar(LONGA, MOTIVO(c.q, c.f, c.porque));
    if (r.erro) console.log(`  ✗ ERRO ${r.erro}`);
    n += 1; msTot += r.ms; if (n === 1) msFria = r.ms;
    const t = r.texto;
    const eco = !!t && ECOOU(t, c.q, c.f);
    const pedaco = !!t && FRAGMENTO(t);
    const sumiu = !!t && c.ok(t);
    const limpo = !!t && !QUEBRA_CANONE(t);
    const bom = sumiu && limpo && !eco && !pedaco;
    if (!t) vazio += 1; else if (bom) conserta += 1;
    if (eco) ecos += 1;
    if (pedaco) pedacos += 1;
    const fora = !!t && !NO_ASSUNTO(t, c.q, c.f);
    if (fora) desviou += 1;
    const selo = !t ? '✗✗ VAZIO' : bom ? '✓' : eco ? '✗ ECOOU' : pedaco ? '✗ PEDAÇO'
        : !sumiu ? '✗ não consertou' : '✗ QUEBROU OUTRA REGRA';
    console.log(`  ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${selo}${fora ? ' ?assunto' : ''}  ${c.nome}`);
    console.log(`         ${JSON.stringify(t.slice(0, 105))}`);
}
let estragou = 0, intacta = 0;
console.log('  ── e nas frases que JÁ ESTAVAM CERTAS:');
for (const c of CERTAS) {
    const r = await gerar(LONGA, MOTIVO(c.q, c.f, 'nothing is wrong with it.'));
    msTot += r.ms; n += 1;
    const ruim = !!r.texto && QUEBRA_CANONE(r.texto);
    if (ruim) estragou += 1;
    if (r.texto === c.f) intacta += 1;
    console.log(`     ${(r.ms / 1000).toFixed(1)}s ${ruim ? '✗✗ ESTRAGOU' : r.texto === c.f ? '= devolveu igual' : '~ reescreveu, sem estragar'}`);
    console.log(`         ${JSON.stringify(String(r.texto).slice(0, 105))}`);
}

console.log(`\n${'═'.repeat(80)}`);
console.log(`  ${REPO}  ·  ${DTYPE} · ${DEVICE} · transformers.js 4.2.0`);
console.log(`  conserta ${conserta}/${DEFEITOS.length} · ecoou ${ecos} · pedaço ${pedacos}`
    + ` · desviou ${desviou}/${DEFEITOS.length} · estraga ${estragou}/${CERTAS.length}`
    + ` · intacta ${intacta}/${CERTAS.length}`);
console.log(`  1ª FRIA ${(msFria / 1000).toFixed(1)}s · média ${(msTot / Math.max(1, n) / 1000).toFixed(1)}s`);
console.log(`\n  Mesma régua de defeitos.mjs que mediu os sete modelos do wllama.`);
await browser.close();
