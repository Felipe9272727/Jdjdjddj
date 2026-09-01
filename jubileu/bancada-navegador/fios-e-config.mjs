// ── O 69 s DA LEITURA É DO MOTOR OU DESTA CAIXA? ─────────────────────────
//
// O dono do jogo olhou "leitura 69 s" e disse: no motor normal isso rodava na
// METADE do tempo, às vezes menos. Duas hipóteses, e só uma medição separa:
//
//   (a) a bancada está no motor errado;
//   (b) a bancada está com MENOS FIOS do que o aparelho dele.
//
// (a) dá para responder sem medir nada: as URLs que o navegador pediu foram
// `/wllama-relaxed/index.js` e `/wllama-relaxed/wasm/wllama.wasm` — o binário
// implantado, o mesmo do jogo. Não há outro no ar.
//
// (b) tem base aritmética. `cpuThreadCount()` pega METADE dos núcleos: esta
// caixa tem 4 → 2 fios; o celular dele tem 8 → 4 fios. Prefill é trabalho em
// lote e escala com fio, então 2x fios ≈ metade do tempo — exatamente o que ele
// descreveu.
//
// De quebra, a bancada anterior carregava com `n_ctx: 2048` e KV em f16,
// enquanto o jogo usa `n_ctx: 1536` e `cache_type_k/v: 'q8_0'`. Isto aqui mede
// a configuração DO JOGO, não uma parecida.
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const GRANITE = 'https://huggingface.co/Felipe0282829273/granite4-h-tiny-q2k-shards/resolve/main/granite4-00001-of-00002.gguf';
const FIOS = (process.env.FIOS ?? '1,2,4').split(',').map(Number);

const ponte = abrirPonte({
    cache: '/tmp/ponte-andar10', porta: 3471, guardarGrandes: 8, manterCache: true,
});
const contexto = await chromium.launchPersistentContext('/home/user/perfil-andar10', {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = contexto.pages()[0] ?? await contexto.newPage();
await ponte.instalarEm(page);
await page.goto(`${VITE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

const info = await page.evaluate(async () => {
    const E = await import('/src/npc/wllamaEngine.ts');
    return {
        nucleos: navigator.hardwareConcurrency,
        isolado: crossOriginIsolated,
        fiosDoJogo: E.cpuThreadCount(),
        motor: E.WLLAMA_PATHS.default,
        config: E.CPU_LOAD_CONFIG,
    };
});
console.log(`\n  núcleos desta caixa .... ${info.nucleos}`);
console.log(`  isolado ................ ${info.isolado}`);
console.log(`  fios que o JOGO escolhe  ${info.fiosDoJogo}   (regra: metade dos núcleos)`);
console.log(`  motor .................. ${info.motor}`);
console.log(`  n_ctx ${info.config.n_ctx} · n_batch ${info.config.n_batch} · KV ${info.config.cache_type_k}\n`);

const PERSONA = ('You are Nilo Azevedo, 29, a former elevator technician, now trapped on the 10th floor '
    + 'of the hotel "The Normal Elevator". The 10th floor is a grey room with a grate floor, four walls '
    + 'and the elevator door; there is no corridor and no window, and you have never left. The elevator '
    + 'does not obey you. You do not know who runs the hotel or whether it ends. You are observant, '
    + 'cautious and dry-humoured, and you decide for yourself, never as a helper. Answer in one short '
    + 'complete sentence, as Nilo, with no label.\n').repeat(3);

console.log('  granite-4.0-h-tiny, config DO JOGO, variando só os fios:\n');
for (const fios of FIOS) {
    const r = await page.evaluate(async ({ url, persona, fios, base }) => {
        const mod = await import(/* @vite-ignore */ '/wllama-relaxed/index.js');
        const w = new mod.Wllama({ default: '/wllama-relaxed/wasm/wllama.wasm' }, { suppressNativeLog: true });
        await w.loadModelFromUrl(url, { ...base, n_threads: fios });
        let t = null;
        const fluxo = await w.createChatCompletion({
            messages: [{ role: 'system', content: persona }, { role: 'user', content: 'Hi, what is your name?' }],
            nPredict: 16, stream: true, cache_prompt: true, timings_per_token: true,
            sampling: { temp: 0.2 },
        });
        for await (const p of fluxo) { if (p.timings) t = p.timings; }
        await w.exit?.();
        return { lidos: t?.prompt_n ?? 0, ms: t?.prompt_ms ?? 0, tps: t?.prompt_per_second ?? 0,
            falaMs: t?.predicted_ms ?? 0, falaTps: t?.predicted_per_second ?? 0 };
    }, { url: GRANITE, persona: PERSONA, fios, base: info.config });
    console.log(`    ${String(fios).padStart(2)} fio(s)   leitura ${(r.ms / 1000).toFixed(1).padStart(5)}s`
        + ` (${r.tps.toFixed(2).padStart(5)} tok/s, ${r.lidos} lidos)`
        + `   fala ${(r.falaMs / 1000).toFixed(1).padStart(4)}s (${r.falaTps.toFixed(2)} tok/s)`);
}
console.log('');
await contexto.close();
ponte.fechar();
