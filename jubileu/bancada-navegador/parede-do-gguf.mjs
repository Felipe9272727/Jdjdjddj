// ── ONDE ESTÁ A PAREDE DE TAMANHO DE VERDADE? ────────────────────────────
//
// `TETO_GGUF_BYTES = 2 ** 31` (2,15 GB) faz o Andar 10 recusar um arquivo maior
// que isso, com uma mensagem categórica:
//
//     2.49 GB passa do teto de 2.15 GB que este runtime consegue abrir.
//     Nenhum aparelho carrega este arquivo.
//
// Só que a bancada de qualidade CARREGOU E GEROU com um GGUF de 2,49 GB, no
// motor implantado, seis vezes, em três bancadas diferentes. A afirmação
// "nenhum aparelho carrega" é falsa para esse arquivo.
//
// A constante saiu de duas medições reais — granite 4,25 GB morrendo em
// `blk.19.ffn_down_exps.weight` e SmolLM3 Q8_0 3,27 GB em `blk.21.ffn_up.weight`
// — e da teoria do `ftell()` preso em `LONG_MAX` (2^31−1 no wasm32). O que
// ninguém checou é EM QUE MOTOR aquilo foi medido: as duas são anteriores ao
// motor da casa virar padrão, e ele é um binário que ninguém reproduziu.
//
// Esta bancada tenta abrir o mesmo arquivo nos DOIS motores e diz onde cada um
// quebra. Não julga por tamanho: carrega e GERA, porque "carregou" e "rodou"
// são perguntas diferentes — este projeto já viu um GGUF acima de 2 GiB
// carregar e morrer na primeira geração.
//
//   DISABLE_HMR=true npm run dev
//   node bancada-navegador/parede-do-gguf.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';

const MOTORES = [
    { nome: 'motor da casa', esm: '/wllama-relaxed/index.js', wasm: '/wllama-relaxed/wasm/wllama.wasm' },
    {
        nome: 'CDN 3.5.1',
        esm: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/index.js',
        wasm: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.5.1/esm/wasm/wllama.wasm',
    },
];

// Em ordem de tamanho. O primeiro está ABAIXO do teto e serve de controle: se
// ele falhar, o problema é a bancada, não a parede.
const ARQUIVOS = [
    { nome: 'Qwen3-0.6B Q8_0', bytes: 639_446_688,
      url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf' },
    { nome: 'SmolLM3-3B Q4_K_M', bytes: 1_915_305_312,
      url: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf' },
    { nome: 'Gemma 3 4B Q4_K_M', bytes: 2_489_757_856,
      url: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf' },
    { nome: 'SmolLM3-3B Q8_0', bytes: 3_279_000_000,
      url: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q8_0.gguf' },
];

const TETO = 2 ** 31;
const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-andar10',
    porta: Number(process.env.PORTA_PONTE ?? 3521),
    guardarGrandes: 8, manterCache: true,
});
const contexto = await chromium.launchPersistentContext(process.env.PERFIL ?? '/home/user/perfil-parede', {
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

console.log(`\n  teto declarado hoje: ${(TETO / 1e9).toFixed(2)} GB\n`);
for (const motor of MOTORES) {
    console.log(`\n  ${motor.nome}`);
    for (const arq of ARQUIVOS) {
        const acima = arq.bytes > TETO;
        const r = await page.evaluate(async ({ url, base, esm, wasm }) => {
            try {
                const mod = await import(/* @vite-ignore */ esm);
                const w = new mod.Wllama({ default: wasm }, { suppressNativeLog: true });
                await w.loadModelFromUrl(url, base);
                // "Carregou" e "gerou" sao perguntas diferentes: um GGUF acima
                // de 2 GiB ja carregou e morreu na primeira geracao neste
                // projeto. Por isso a prova e uma fala, nao a carga.
                let texto = '';
                const fluxo = await w.createChatCompletion({
                    messages: [{ role: 'user', content: 'Say hello in five words.' }],
                    max_tokens: 12, stream: true, temperature: 0,
                });
                for await (const p of fluxo) {
                    texto += p?.choices?.[0]?.delta?.content ?? p?.piece ?? '';
                }
                await w.exit?.();
                return { ok: texto.trim().length > 0, texto: texto.trim().slice(0, 60) };
            } catch (e) {
                return { ok: false, erro: String(e?.message ?? e).slice(0, 110) };
            }
        }, { url: arq.url, base: CONFIG, esm: motor.esm, wasm: motor.wasm });
        const marca = acima ? '← acima do teto' : '';
        console.log(`    ${r.ok ? '✓' : '✗'} ${arq.nome.padEnd(20)} ${(arq.bytes / 1e9).toFixed(2)} GB `
            + `${marca.padEnd(16)} ${r.ok ? JSON.stringify(r.texto) : r.erro}`);
    }
}
console.log('');
await contexto.close();
ponte.fechar();
