// ── DÁ PARA O GEMMA 3 TER OS DOIS: QUALIDADE E PREFILL EM CACHE? ─────────
//
// `qualidade-da-fala.mjs` apontou o Gemma 3 4B como o melhor em qualidade — e
// mostrou que ele reaproveita quase nada de prefixo (344 tokens contra 2.270 do
// SmolLM3). A causa provável está no próprio binário implantado:
//
//     %s: n_swa : %d, n_kv: %d, swa_type: %s
//     slot ...: erased invalidated context checkpoint (... n_swa = %d ...)
//     swa_full
//     swa_full is not supported by this model, it will be disabled
//
// O Gemma 3 alterna camadas de atenção com JANELA DESLIZANTE. Fora da janela o
// llama.cpp não tem o KV para reconstruir o prefixo, então invalida o
// checkpoint e relê tudo. `swa_full` manda guardar o KV INTEIRO em vez de só a
// janela — troca memória por reaproveitamento.
//
// A pergunta desta bancada é uma só, e tem três colunas: reaproveitamento,
// tempo de turno e quanto custa. A terceira importa tanto quanto as outras: o
// celular do dono do jogo é o limite, e guardar o KV inteiro não é de graça.
//
//   DISABLE_HMR=true npm run dev
//   node bancada-navegador/swa-full.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const MODELO = process.env.MODELO
    ?? 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf';

const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-qualidade',
    porta: Number(process.env.PORTA_PONTE ?? 3491),
    guardarGrandes: 2,
    manterCache: true,
});
const contexto = await chromium.launchPersistentContext(process.env.PERFIL ?? '/home/user/perfil-swa', {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = contexto.pages()[0] ?? await contexto.newPage();
await ponte.instalarEm(page);
await page.goto(`${VITE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

const CONFIG = await page.evaluate(async () => {
    const E = await import('/src/npc/wllamaEngine.ts');
    return { ...E.CPU_LOAD_CONFIG, n_threads: 4 };
});

const PERGUNTAS = [
    'Oi, quem é você?',
    'O que tem atrás daquela parede?',
    'Quem manda nesse hotel?',
    'Você quer sair daqui?',
];

console.log('');
const CENARIOS = [
    { swaFull: false, nCtx: 1536, rotulo: 'swa_full OFF · n_ctx 1536 (o do jogo)' },
    { swaFull: true, nCtx: 1536, rotulo: 'swa_full ON  · n_ctx 1536 (o do jogo)' },
    // ── E SE O CORTE FOR FALTA DE CONTEXTO? ──────────────────────────────
    //
    // `swa_full` guarda o KV INTEIRO em vez de so a janela. Se o que corta a
    // fala for o contexto acabando, dar mais folga conserta — e o preco vira
    // RAM, que e a moeda que importa no celular. Se nao consertar, a causa e
    // outra e `swa_full` nao serve como esta.
    { swaFull: true, nCtx: 3072, rotulo: 'swa_full ON  · n_ctx 3072 (o dobro de folga)' },
];
for (const { swaFull, nCtx, rotulo } of CENARIOS) {
    console.log(`\n  ${rotulo}`);
    let r;
    try {
        r = await page.evaluate(async ({ url, base, perguntas, swaFull }) => {
            const C = await import('/src/npc/floor10Canon.ts');
            const E = await import('/src/npc/wllamaEngine.ts');
            const mod = await import(/* @vite-ignore */ '/wllama-relaxed/index.js');
            const w = new mod.Wllama({ default: '/wllama-relaxed/wasm/wllama.wasm' }, { suppressNativeLog: true });
            await w.loadModelFromUrl(url, { ...base, swa_full: swaFull });
            const saida = [];
            const historico = [];
            for (const pergunta of perguntas) {
                const prompt = E.prepareFloor10SystemPrompt(
                    C.buildFloor10SystemPrompt(pergunta, historico),
                );
                let texto = ''; let t = null;
                const fluxo = await w.createChatCompletion({
                    messages: [{ role: 'system', content: prompt }, ...historico,
                        { role: 'user', content: pergunta }],
                    ...E.CHAT_COMPLETION_CONFIG,
                });
                for await (const p of fluxo) { texto += E.chunkDelta(p); if (p.timings) t = p.timings; }
                const fala = C.arrumarFala(E.visibleText(texto));
                historico.push({ role: 'user', content: pergunta });
                historico.push({ role: 'assistant', content: fala });
                saida.push({
                    pergunta, fala,
                    lidos: t?.prompt_n ?? 0, reusados: t?.cache_n ?? 0,
                    leitura: (t?.prompt_ms ?? 0) / 1000, falaS: (t?.predicted_ms ?? 0) / 1000,
                    // ── QUANTOS TOKENS ELE CHEGOU A ESCREVER ─────────────
                    //
                    // Sem isto, "fala 1,7s" nao distingue as duas causas
                    // possiveis de uma frase cortada: gerou POUCO (parou cedo)
                    // ou gerou DEVAGAR. Com `swa_full` ligado as falas sairam
                    // como "Querer nao muda o fato de estar…" e o teto e 56
                    // tokens — entao a pergunta e exatamente essa.
                    gerados: t?.predicted_n ?? null,
                });
            }
            await w.exit?.();
            return { saida };
        }, { url: MODELO, base: { ...CONFIG, n_ctx: nCtx }, perguntas: PERGUNTAS, swaFull });
    } catch (e) {
        console.log(`    ✗ não rodou: ${String(e?.message ?? e).slice(0, 200)}`);
        continue;
    }
    for (const l of r.saida) {
        console.log(`    ${l.pergunta.padEnd(30)} lidos ${String(l.lidos).padStart(5)}`
            + ` · reaproveitados ${String(l.reusados).padStart(5)}`
            + ` · leitura ${l.leitura.toFixed(1).padStart(5)}s`
            + ` · fala ${l.falaS.toFixed(1).padStart(4)}s (${String(l.gerados ?? '?').padStart(3)} tokens)`);
    }
    const seguintes = r.saida.slice(1);
    const m = seguintes.reduce((a, l) => a + l.leitura + l.falaS, 0) / seguintes.length;
    const reuso = r.saida.reduce((a, l) => a + l.reusados, 0);
    console.log(`    → turnos seguintes ao primeiro: ${m.toFixed(1)}s · ${reuso} reaproveitados no total`);
    console.log('    falas:');
    for (const l of r.saida) console.log(`      ${JSON.stringify(l.fala)}`);
}
console.log('');
await contexto.close();
ponte.fechar();
