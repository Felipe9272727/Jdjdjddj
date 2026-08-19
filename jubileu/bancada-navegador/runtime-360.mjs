/**
 * A wllama 3.6.0 SERVE? — a etapa 1, feita aqui antes de ir para o celular.
 *
 * A 3.6.0 saiu em 16/08/2026 e embute llama.cpp b10454; a 3.5.1, que o jogo
 * usa, embute a b9640 — umas 800 builds de diferença, e é lá embaixo que mora
 * o backend WebGPU. A chave `?wllama=` existe para testar isso no aparelho de
 * quem joga, mas mandar o dono do jogo descobrir no celular dele que o runtime
 * novo quebra seria usar o único aparelho de teste como cobaia.
 *
 * Então a ordem é esta: primeiro CORRETUDE (ele carrega e gera texto certo nos
 * dois modelos que o pipeline usa, incluindo o `lfm2`, que é arquitetura
 * incomum), e só depois VELOCIDADE.
 *
 * O que se procura, e em ordem de gravidade:
 *   1. carrega? o `lfm2` é o candidato natural a quebrar numa troca de build
 *   2. o texto sai igual? uma regressão de tokenizer sai como fala estranha
 *   3. a leitura de prompt ficou mais barata? é 89% do custo do revisor
 *   4. a GPU sobe? é a única coisa que mudaria o 1,6x medido
 *
 * ── O QUE ELE ACHOU: A 3.6.0 FUNCIONA E NÃO ADIANTA (na CPU) ────────────
 *
 *   runtime   modelo                          ler tok/s  escrever  razão
 *   3.5.1     granite a400m                       21,4       8,9    2,4x
 *   3.6.0     granite a400m                       21,3       8,0    2,7x
 *   3.5.1     LFM2.5 1.2B                          5,3       4,2    1,3x
 *   3.6.0     LFM2.5 1.2B                          5,3       4,2    1,3x
 *
 * CORRETUDE, que era a pergunta que importava antes de mandar para o celular:
 * a 3.6.0 carrega e gera texto sensato nos DOIS modelos, incluindo o `lfm2`,
 * que era o candidato natural a quebrar numa troca de build. Sem regressão.
 *
 * VELOCIDADE: idêntica, token a token. A b10454 não trouxe nada para wasm32 em
 * CPU nesta carga.
 *
 * E A "CARGA 4x MAIS RÁPIDA" ERA MENTIRA DE CACHE. A primeira rodada mediu
 * 34 s na 3.5.1 e 8 s na 3.6.0 para o MESMO arquivo — e a 3.5.1 carregava
 * sempre primeiro. Rodando com `ORDEM=inversa`, a vantagem trocou de lado
 * inteira: 35 s na 3.6.0 e 10 s na 3.5.1. É o cache de página do sistema e o
 * OPFS do navegador, não o runtime. Eu ia reportar 4x de ganho.
 *
 * ENTÃO A 3.6.0 SÓ VALE PELO WEBGPU, que é a única coisa que ela poderia
 * mudar e que esta máquina não sabe medir (aqui o `navigator.gpu` existe mas é
 * rasterização por software; o celular tem GPU de verdade).
 *
 * ── E O NÚMERO QUE SALTA DA TABELA ──────────────────────────────────────
 *
 * O granite lê 21,4 tok/s e o LFM2.5 lê 5,3. São DOIS fatores multiplicando:
 *
 *     4,0x mais lento POR TOKEN
 *   x 4,3x MAIS TOKENS lidos (267 contra 62 — ele não reaproveita prefixo)
 *   = 55,1 s por remendo contra 5,1 s
 *
 * Uso: node bancada-navegador/runtime-360.mjs   ·   ORDEM=inversa para o
 * controle de cache, que NÃO é opcional se alguém for citar tempo de carga.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
// ── A ORDEM IMPORTA, E POR ISSO ELA É INVERSÍVEL ─────────────────────────
//
// A primeira rodada deu carga de 34 s na 3.5.1 e 8 s na 3.6.0 para o mesmo
// arquivo — e a 3.5.1 carregava SEMPRE primeiro. Um modelo já lido fica no
// cache de página do sistema e no OPFS do navegador, então a segunda carga é
// barata por motivo nenhum ligado ao runtime. `ORDEM=inversa` roda a nova
// primeiro: se a vantagem trocar de lado, era cache; se ficar, é o runtime.
const RUNTIMES = (process.env.ORDEM === 'inversa' ? [
    { rot: '3.6.0 (a nova)', dir: 'wllama-360' },
    { rot: '3.5.1 (a do jogo)', dir: 'wllama-cdn' },
] : [
    { rot: '3.5.1 (a do jogo)', dir: 'wllama-cdn' },
    { rot: '3.6.0 (a nova)', dir: 'wllama-360' },
]);
const MODELOS = [
    { arq: 'granite.gguf', rot: 'granite a400m (rascunhador)', kv: 'f16', ctx: 1024 },
    { arq: 'lfm12.gguf', rot: 'LFM2.5 1.2B (revisor/vontade)', kv: 'q8_0', ctx: 1536 },
];
const GPU = Number(process.env.GPU ?? 0);

const SYS = 'You are Nilo Azevedo, a human trapped on the 10th floor of a hotel. Dry, wary, never a helper.';
// Um prompt longo para a leitura significar alguma coisa: com 20 tokens de
// entrada, o tempo medido é quase todo custo fixo da chamada.
const LONGO = Array.from({ length: 30 }, (_, i) =>
    `Note ${i + 1}: the grey room has four walls, a grate floor and a door that does not open.`).join(' ');

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage',
        ...(GPU > 0 ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] : [])],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
console.log(`WebGPU no navegador: ${await page.evaluate(() => !!navigator.gpu)} · camadas pedidas: ${GPU}`);

const linhas = [];
for (const rt of RUNTIMES) {
    for (const m of MODELOS) {
        const r = await page.evaluate(async ({ base, dir, arq, kv, ctx, sys, longo, gpu }) => {
            const saida = { carga: '', ms: 0, texto: '', erro: '' };
            const t0 = performance.now();
            try {
                if (window.__w?.exit) { try { await window.__w.exit(); } catch { /* já foi */ } }
                const mod = await import(`${base}/${dir}/index.js`);
                const w = new mod.Wllama(
                    { default: `${base}/${dir}/wasm/wllama.wasm` }, { suppressNativeLog: true },
                );
                await w.loadModelFromUrl(`${base}/${arq}`, {
                    n_ctx: ctx, n_batch: 512, n_threads: 4, n_gpu_layers: gpu,
                    ...(kv === 'f16' ? {} : { cache_type_k: kv, cache_type_v: kv }),
                    jinja: true, reasoning: false, warmup: true,
                });
                window.__w = w;
                saida.carga = `${Math.round((performance.now() - t0) / 1000)}s`;
            } catch (e) {
                saida.erro = 'CARGA: ' + String(e?.message ?? e).slice(0, 120);
                return saida;
            }
            try {
                const a = performance.now();
                const res = await window.__w.createChatCompletion({
                    messages: [{ role: 'system', content: sys }, { role: 'user', content: longo }],
                    stream: false, max_tokens: 24, temperature: 0.3, top_p: 0.8, top_k: 30,
                    cache_prompt: false, chat_template_kwargs: { enable_thinking: false },
                });
                const ti = res?.timings ?? {};
                saida.ms = Math.round(performance.now() - a);
                saida.texto = String(res?.choices?.[0]?.message?.content ?? '').trim();
                saida.lidos = ti.prompt_n ?? 0; saida.msLer = ti.prompt_ms ?? 0;
                saida.escritos = ti.predicted_n ?? 0; saida.msEsc = ti.predicted_ms ?? 0;
            } catch (e) { saida.erro = 'GERAÇÃO: ' + String(e?.message ?? e).slice(0, 120); }
            return saida;
        }, { base: BASE, dir: rt.dir, arq: m.arq, kv: m.kv, ctx: m.ctx, sys: SYS, longo: LONGO, gpu: GPU });

        const ler = r.msLer > 0 ? r.lidos / (r.msLer / 1000) : 0;
        const esc = r.msEsc > 0 ? r.escritos / (r.msEsc / 1000) : 0;
        linhas.push({ rt: rt.rot, m: m.rot, ...r, ler, esc });
        console.log(`\n── ${rt.rot} · ${m.rot}`);
        if (r.erro) { console.log(`   ✗✗ ${r.erro}`); continue; }
        console.log(`   carga ${r.carga} · ler ${ler.toFixed(1)} tok/s (${r.lidos} tok)`
            + ` · escrever ${esc.toFixed(1)} tok/s · razão ${esc > 0 ? (ler / esc).toFixed(1) : '?'}x`);
        console.log(`   ${JSON.stringify(r.texto.slice(0, 110))}`);
    }
}

console.log(`\n${'═'.repeat(76)}`);
console.log(`  runtime              modelo                          carga    ler   escrever  razão`);
for (const l of linhas) {
    if (l.erro) { console.log(`  ${l.rt.padEnd(20)} ${l.m.padEnd(30)} ${l.erro.slice(0, 40)}`); continue; }
    console.log(`  ${l.rt.padEnd(20)} ${l.m.padEnd(30)} ${String(l.carga).padStart(6)} ${l.ler.toFixed(1).padStart(6)} ${l.esc.toFixed(1).padStart(9)}`
        + ` ${(l.esc > 0 ? (l.ler / l.esc).toFixed(1) + 'x' : '?').padStart(6)}`);
}
console.log(`\n  a razão é o que decide se especulação/MTP teria o que colher:`);
console.log(`  ela é o quanto ler em lote é mais barato que escrever um a um.`);
await browser.close();
