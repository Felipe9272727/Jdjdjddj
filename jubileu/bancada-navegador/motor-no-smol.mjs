// ── O MOTOR DA CASA VALE O MESMO NO SMOLLM3? ─────────────────────────────
//
// A tarefa 10 (cache de prefill entre aberturas do chat, via
// `llama_state_seq_*`) exige expor API nova do llama.cpp — ou seja,
// RECOMPILAR o wasm. E `src/__tests__/motorImplantado.test.ts` existe
// justamente para impedir isso: o binário implantado roda o granite 3× mais
// rápido que qualquer build que eu consiga produzir, inclusive o oficial, e a
// receita dele nunca foi reproduzida (tarefa 19).
//
// Então a tarefa 10 está bloqueada pela 19 — A MENOS que o 3× não valha para o
// modelo que está no jogo HOJE. Aquele número foi medido no granite, que é
// híbrido, Q2_K e MoE. O SmolLM3 é denso e Q4_K_M: outra arquitetura, outros
// kernels, e nada garante que a diferença se repita.
//
// Se o CDN empatar com o motor da casa no SmolLM3, recompilar deixa de custar
// velocidade e a tarefa 10 destrava. Se não empatar, ela continua bloqueada e
// isso precisa estar escrito antes de alguém gastar dias nela.
//
// Mede o turno EM CONVERSA, não o turno frio — é a lição do MOE-CANDIDATOS.
//
//   DISABLE_HMR=true npm run dev
//   node bancada-navegador/motor-no-smol.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const MODELO = process.env.MODELO
    ?? 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf';

const MOTORES = [
    { nome: 'motor da casa (implantado)', esm: '/wllama-relaxed/index.js', wasm: '/wllama-relaxed/wasm/wllama.wasm' },
    {
        nome: 'CDN oficial @wllama/wllama@3.5.1',
        esm: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js',
        wasm: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/wasm/wllama.wasm',
    },
];

const PERGUNTAS = [
    'Oi, quem é você?',
    'Você era técnico de quê?',
    'E como foi o último dia nesse trabalho?',
    'Você se lembra da hora?',
];

const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-andar10',
    porta: Number(process.env.PORTA_PONTE ?? 3511),
    guardarGrandes: 8, manterCache: true,
});
const contexto = await chromium.launchPersistentContext(process.env.PERFIL ?? '/home/user/perfil-motor', {
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

console.log(`\n  SmolLM3-3B Q4_K_M · config do jogo · 4 fios · turno EM CONVERSA\n`);
const placar = [];
for (const motor of MOTORES) {
    console.log(`\n  ${motor.nome}`);
    let saida;
    try {
        saida = await page.evaluate(async ({ url, base, perguntas, esm, wasm }) => {
            const C = await import('/src/npc/floor10Canon.ts');
            const E = await import('/src/npc/wllamaEngine.ts');
            const mod = await import(/* @vite-ignore */ esm);
            const t0 = Date.now();
            const w = new mod.Wllama({ default: wasm }, { suppressNativeLog: true });
            await w.loadModelFromUrl(url, base);
            const carga = (Date.now() - t0) / 1000;
            const linhas = []; const historico = [];
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
                linhas.push({
                    pergunta, fala,
                    lidos: t?.prompt_n ?? 0, reusados: t?.cache_n ?? 0,
                    leitura: (t?.prompt_ms ?? 0) / 1000, falaS: (t?.predicted_ms ?? 0) / 1000,
                });
            }
            await w.exit?.();
            return { carga, linhas };
        }, { url: MODELO, base: CONFIG, perguntas: PERGUNTAS, esm: motor.esm, wasm: motor.wasm });
    } catch (e) {
        console.log(`    ✗ não rodou: ${String(e?.message ?? e).slice(0, 200)}`);
        continue;
    }
    for (const l of saida.linhas) {
        console.log(`    ${l.pergunta.padEnd(34)} lidos ${String(l.lidos).padStart(4)}`
            + ` · reaprov ${String(l.reusados).padStart(4)}`
            + ` · leitura ${l.leitura.toFixed(1).padStart(5)}s · fala ${l.falaS.toFixed(1).padStart(4)}s`
            + ` · TURNO ${(l.leitura + l.falaS).toFixed(1).padStart(5)}s`);
    }
    const seguintes = saida.linhas.slice(1);
    const conversa = seguintes.reduce((a, l) => a + l.leitura + l.falaS, 0) / seguintes.length;
    const frio = saida.linhas[0].leitura + saida.linhas[0].falaS;
    console.log(`    → carga ${saida.carga.toFixed(1)}s · turno frio ${frio.toFixed(1)}s · em conversa ${conversa.toFixed(1)}s`);
    placar.push({ nome: motor.nome, carga: saida.carga, frio, conversa });
}

console.log(`\n${'═'.repeat(74)}`);
for (const p of placar) {
    console.log(`  ${p.nome.padEnd(36)} carga ${p.carga.toFixed(1).padStart(5)}s`
        + ` · frio ${p.frio.toFixed(1).padStart(5)}s · conversa ${p.conversa.toFixed(1).padStart(5)}s`);
}
if (placar.length === 2) {
    const r = placar[1].conversa / placar[0].conversa;
    console.log(`\n  o CDN é ${r.toFixed(2)}× o turno do motor da casa, em conversa.`);
    console.log(r < 1.15
        ? '  → empate prático: recompilar não custa velocidade, a tarefa 10 DESTRAVA.'
        : '  → o motor da casa ganha: recompilar custa, a tarefa 10 segue presa na 19.');
}
console.log('');
await contexto.close();
ponte.fechar();
