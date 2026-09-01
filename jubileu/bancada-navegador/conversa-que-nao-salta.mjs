// ── OS 13 SEGUNDOS DO CELULAR CONTRA OS 36 DA BANCADA ────────────────────
//
// O dono do jogo: "no meu celular rodava o SmolLM3, e ele às vezes respondia em
// 13 segundos". A bancada de qualidade mediu 36,2 s de média para o mesmo
// modelo. Os dois números podem estar certos, e a suspeita tem endereço.
//
// Olhando turno a turno, o SmolLM3 reaproveita ~335 tokens e RELÊ de 200 a 380
// todo turno. O `buildFloor10SystemPrompt` monta assim:
//
//     persona · resumo · FATO DO CÂNONE · percepção · vontade · guardas · já dito
//
// O fato é escolhido pelo curador POR PERGUNTA. Trocou de assunto, trocou o
// fato — e como ele mora perto do começo, tudo o que vem depois é relido. As
// quatro perguntas da bancada de qualidade pulam de assunto de propósito
// (identidade, cânone, percepção, vontade), o que é o PIOR caso possível para
// o cache.
//
// Uma conversa de verdade não é assim: o jogador puxa um assunto e fica nele
// por algumas falas. Esta bancada mede os dois lados, com o prompt real:
//
//   SALTANDO ..... quatro assuntos diferentes (o que eu media antes)
//   NO ASSUNTO ... quatro perguntas encadeadas sobre a MESMA coisa
//
// E separa leitura de fala, porque a média não distingue "releu tudo" de
// "gerou uma resposta longa".
//
//   DISABLE_HMR=true npm run dev
//   node bancada-navegador/conversa-que-nao-salta.mjs
import { chromium } from 'playwright';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const MODELO = process.env.MODELO
    ?? 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf';
const ROTULO = process.env.ROTULO ?? 'SmolLM3-3B Q4_K_M';

const CONJUNTOS = [
    {
        nome: 'SALTANDO de assunto (o que a bancada de qualidade media)',
        perguntas: [
            'Oi, quem é você?',
            'O que tem atrás daquela parede?',
            'Quem manda nesse hotel?',
            'Você quer sair daqui?',
        ],
    },
    {
        nome: 'NO MESMO ASSUNTO (como um jogador conversa)',
        perguntas: [
            'Oi, quem é você?',
            'Você era técnico de quê?',
            'E como foi o último dia nesse trabalho?',
            'Você se lembra da hora?',
        ],
    },
];

const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-qualidade',
    porta: Number(process.env.PORTA_PONTE ?? 3501),
    guardarGrandes: 2, manterCache: true,
});
const contexto = await chromium.launchPersistentContext(process.env.PERFIL ?? '/home/user/perfil-salto', {
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

console.log(`\n  ${ROTULO} · motor da casa · config do jogo · 4 fios\n`);
for (const conjunto of CONJUNTOS) {
    console.log(`\n  ${conjunto.nome}`);
    const saida = await page.evaluate(async ({ url, base, perguntas }) => {
        const C = await import('/src/npc/floor10Canon.ts');
        const E = await import('/src/npc/wllamaEngine.ts');
        const mod = await import(/* @vite-ignore */ '/wllama-relaxed/index.js');
        const w = new mod.Wllama({ default: '/wllama-relaxed/wasm/wllama.wasm' }, { suppressNativeLog: true });
        await w.loadModelFromUrl(url, base);
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
                gerados: t?.predicted_n ?? null,
                // O tamanho do prompt montado, para ver o que muda entre os dois
                // conjuntos sem depender do tokenizador.
                letras: prompt.length,
            });
        }
        await w.exit?.();
        return linhas;
    }, { url: MODELO, base: CONFIG, perguntas: conjunto.perguntas });

    for (const l of saida) {
        console.log(`    ${l.pergunta.padEnd(34)} lidos ${String(l.lidos).padStart(4)}`
            + ` · reaprov ${String(l.reusados).padStart(4)}`
            + ` · leitura ${l.leitura.toFixed(1).padStart(5)}s`
            + ` · fala ${l.falaS.toFixed(1).padStart(4)}s (${String(l.gerados ?? '?').padStart(2)} tok)`
            + ` · TURNO ${(l.leitura + l.falaS).toFixed(1).padStart(5)}s`);
    }
    const seguintes = saida.slice(1);
    const m = seguintes.reduce((a, l) => a + l.leitura + l.falaS, 0) / seguintes.length;
    const relidos = seguintes.reduce((a, l) => a + l.lidos, 0) / seguintes.length;
    console.log(`    → em conversa: ${m.toFixed(1)}s por turno · ${relidos.toFixed(0)} tokens relidos em média`);
    for (const l of saida) console.log(`      ${JSON.stringify(l.fala)}`);
}
console.log('');
await contexto.close();
ponte.fechar();
