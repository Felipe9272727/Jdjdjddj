/**
 * POR QUE LER É QUASE TÃO CARO QUANTO ESCREVER?
 *
 * A pergunta nasceu de uma sugestão — "vale a pena olhar MTP?" — e da conta que
 * ela obrigou a fazer. MTP e decodificação especulativa aceleram a ESCRITA, e
 * neste pipeline a escrita é 10% do custo. Mas ao conferir isso apareceu algo
 * maior, e igual nos quatro modelos já medidos:
 *
 *     modelo                        ler tok/s   escrever tok/s   razão
 *     LFM2.5 1.2B Q8 (revisor)          5,2            4,0        1,3x
 *     granite a400m Q4                 19,4           10,8        1,8x
 *     Qwen2.5 1.5B Q4                   6,5            5,1        1,3x
 *     Qwen3 0.6B Q8                    11,1            7,6        1,5x
 *
 * Ler deveria ser MUITO mais barato por token que escrever: o prefill processa
 * o prompt em lote, o decode vai um token por vez. Uma razão de 1,3x quer dizer
 * que o lote não está rendendo quase nada. Se render, o revisor cai de 50 s
 * para perto de 10 — e aí não há especulação nenhuma que compita.
 *
 * Este arquivo não conserta nada: ele confere se há o que consertar. Lê o
 * n_batch/n_ubatch que o runtime REALMENTE usou (o load devolve os dois) e
 * varre as chaves que poderiam explicar.
 *
 * ── O QUE ELE ACHOU (Qwen3-0.6B Q8, Chromium headless, 4 núcleos) ────────
 *
 *   configuração                        ler tok/s  escrever  razão  batch/ubatch
 *   como o jogo carrega hoje                 16,2       8,8   1,8x   512/512
 *   n_ubatch explícito em 512                16,0      10,2   1,6x   512/512
 *   lote grande (pedi 2048/2048)             15,8       9,6   1,7x  2048/512
 *   lote grande + flash_attn                 16,5      10,7   1,5x  2048/512
 *   pedi n_ubatch 1                          16,7      10,4   1,6x   512/512
 *
 * NÃO É MODO COMPAT: JSPI e memory64 ligados, então é a build boa. E o próprio
 * wllama exige SIMD (`checkEnvironmentCompatible` levanta erro sem ela), então
 * também não é isso.
 *
 * LEIA A ÚLTIMA COLUNA ANTES DE ACREDITAR NAS OUTRAS. Eu ia concluir "os
 * botões de lote não fazem nada, porque ubatch 1 empata com ubatch 512" — e o
 * readback diz que o ubatch 1 NUNCA FOI APLICADO: virou 512. O mesmo com o
 * 2048, que virou 512. O `n_ubatch` é fixo nesta build; eu não variei o lote
 * físico em nenhuma linha desta tabela. A conclusão errada estava pronta e o
 * número que a desmentia estava impresso ao lado dela.
 *
 * O QUE DÁ PARA AFIRMAR: com lote físico de 512 — batching NOMINALMENTE ligado
 * — ler custa só 1,6x menos por token que escrever. Um lote de 512 deveria
 * render muito mais. O gargalo está abaixo do que o wllama deixa configurar.
 *
 * E É ISSO QUE RESPONDE A PERGUNTA DO MTP. Decodificação especulativa (e MTP)
 * pagam quando VERIFICAR n tokens de uma vez custa quase o mesmo que gerar um.
 * Aqui esse fator é 1,6x, medido — e é o teto absoluto do ganho, antes de
 * descontar a taxa de aceitação e o custo de rodar o modelo rascunho. Não sobra
 * nada. O `spec_draft_model` existe no wllama e é repassado ao worker, mas
 * apontá-lo exigiria um segundo gguf dentro do FS do worker, que o
 * `loadModelFromUrl` não coloca lá.
 *
 * Uso: MODELO=qwen3.gguf node bancada-navegador/prefill.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const MODELO = process.env.MODELO ?? 'qwen3.gguf';

// Um prompt longo e chato de propósito: o que se mede é o custo por token de
// leitura, e conteúdo interessante só acrescentaria variação de tokenização.
const LONGO = Array.from({ length: 40 }, (_, i) =>
    `Line ${i + 1}. The grey room has four walls, a grate floor and an elevator door that does not open.`).join(' ');

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 110)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const amb = await page.evaluate(async ({ base }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    window.__mod = mod;
    const jspi = typeof WebAssembly.Suspending === 'function';
    let mem64 = false;
    try { new WebAssembly.Memory({ initial: 1, maximum: 1, index: 'i64' }); mem64 = true; } catch { mem64 = false; }
    return { jspi, mem64, nucleos: navigator.hardwareConcurrency };
}, { base: BASE });
console.log(`ambiente: JSPI ${amb.jspi} · memory64 ${amb.mem64} · núcleos ${amb.nucleos}`);
console.log(`(needCompat = !JSPI || !memory64 — em compat o próprio wllama avisa que a performance despenca)\n`);

async function medir(cfg) {
    return page.evaluate(async ({ base, arq, cfg, texto }) => {
        try {
            if (window.__w?.exit) { try { await window.__w.exit(); } catch { /* já foi */ } }
            const w = new window.__mod.Wllama(
                { default: `${base}/wllama-cdn/wasm/wllama.wasm` }, { suppressNativeLog: true },
            );
            const t = performance.now();
            await w.loadModelFromUrl(`${base}/${arq}`, {
                n_ctx: 2048, n_gpu_layers: 0, jinja: true, warmup: true,
                cache_type_k: 'q8_0', cache_type_v: 'q8_0', ...cfg,
            });
            window.__w = w;
            const carga = Math.round(performance.now() - t);
            // O que o runtime REALMENTE usou, e não o que eu pedi.
            const usou = w.getLoadedContextInfo?.() ?? {};
            const a = performance.now();
            const res = await w.createChatCompletion({
                messages: [{ role: 'user', content: texto }],
                stream: false, max_tokens: 8, temperature: 0.7,
                cache_prompt: false, chat_template_kwargs: { enable_thinking: false },
            });
            const ti = res?.timings ?? {};
            return {
                carga, ms: Math.round(performance.now() - a),
                nBatch: usou.n_batch, nUbatch: usou.n_ubatch,
                lidos: ti.prompt_n ?? 0, msLer: ti.prompt_ms ?? 0,
                escritos: ti.predicted_n ?? 0, msEscrever: ti.predicted_ms ?? 0,
            };
        } catch (e) { return { erro: String(e?.message ?? e).slice(0, 150) }; }
    }, { base: BASE, arq: MODELO, cfg, texto: LONGO });
}

const CFGS = [
    { rot: 'como o jogo carrega hoje', cfg: { n_batch: 512, n_threads: 4 } },
    { rot: 'n_ubatch explícito em 512', cfg: { n_batch: 512, n_ubatch: 512, n_threads: 4 } },
    { rot: 'lote grande (2048/2048)', cfg: { n_batch: 2048, n_ubatch: 2048, n_threads: 4 } },
    { rot: 'lote grande + flash_attn', cfg: { n_batch: 2048, n_ubatch: 2048, n_threads: 4, flash_attn: true } },
    // Pedir 1 aqui NÃO aplica 1: o readback mostra 512. Fica na varredura
    // justamente para deixar o clamp visível.
    { rot: 'pedi n_ubatch 1 (vira 512)', cfg: { n_batch: 512, n_ubatch: 1, n_threads: 4 } },
];
console.log(`${'configuração'.padEnd(38)} ${'ler tok/s'.padStart(10)} ${'escrever'.padStart(9)} ${'razão'.padStart(6)}  n_batch/n_ubatch`);
for (const c of CFGS) {
    const r = await medir(c.cfg);
    if (r.erro) { console.log(`${c.rot.padEnd(38)} ERRO ${r.erro}`); continue; }
    const ler = r.msLer > 0 ? r.lidos / (r.msLer / 1000) : 0;
    const esc = r.msEscrever > 0 ? r.escritos / (r.msEscrever / 1000) : 0;
    console.log(`${c.rot.padEnd(38)} ${ler.toFixed(1).padStart(10)} ${esc.toFixed(1).padStart(9)} ${(esc > 0 ? (ler / esc).toFixed(1) + 'x' : '?').padStart(6)}`
        + `  ${r.nBatch}/${r.nUbatch}  (${r.lidos} tok em ${(r.msLer / 1000).toFixed(1)}s)`);
}
await browser.close();
