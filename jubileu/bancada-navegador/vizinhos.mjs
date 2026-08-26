/**
 * ── QUANTO CUSTA TER VIZINHO NA RAM ──────────────────────────────────────
 *
 * Pedido de quem joga, e o desenho é dele: *"eu queria que ambos estivessem
 * rodando juntos, pq não bate o limite de 2 gbs (...) descubra o que deixou ele
 * tão lento quanto hoje, testa ele primeiro SEM o pipeline, depois COM o
 * pipeline, aí a gente vai saber exatamente o problema"*.
 *
 * A escada, do mais simples ao que o jogo realmente faz. Sempre a MESMA
 * pergunta, no MESMO processo, medindo o rascunho do granite:
 *
 *   A. sozinho, persona + pergunta ............... o granite puro
 *   B. + a direção do cânone ..................... o prompt que o pipeline manda
 *   C. + o revisor v2 de pé ao lado .............. dois llama.cpp
 *   D. + o EmbeddingGemma também de pé ........... três runtimes, o estado de hoje
 *
 * Cada degrau acrescenta UMA coisa. Se o tempo pular num degrau específico, o
 * culpado é aquele degrau — que é exatamente o que o desenho dele pede, e o que
 * eu não conseguiria saber medindo só o total.
 *
 *   node bancada-navegador/vizinhos.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const RODADAS = Number(process.env.RODADAS ?? 3);

const PERSONA = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper; do not offer service and do not ask for orders.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. The hotel, the elevator, the Owner and the Archivist are entities separate from you. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, only to what was asked, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;

const PERGUNTA = 'Hi what is your name? do you know why we are here?';
const DIRECAO = 'What you know that matters here: my name is Nilo Azevedo and I fixed elevators before this.';

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, persona, pergunta, direcao, rodadas }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    const novo = () => new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` },
        { suppressNativeLog: true });
    const saida = [];
    const vizinhos = [];

    const rascunhar = async (w, texto) => {
        const t = performance.now();
        const res = await w.createChatCompletion({
            messages: [{ role: 'system', content: persona }, { role: 'user', content: texto }],
            stream: false, max_tokens: 56, temperature: 0.3, top_p: 0.8, top_k: 30,
            cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
        });
        const ti = res?.timings ?? {};
        return {
            ms: performance.now() - t,
            lidos: ti.prompt_n ?? 0, msLer: ti.prompt_ms ?? 0,
            escritos: ti.predicted_n ?? 0, msEscrever: ti.predicted_ms ?? 0,
        };
    };

    // O granite sobe uma vez e fica: os degraus mudam os VIZINHOS, não ele.
    const g = novo();
    const tCarga = performance.now();
    await g.loadModelFromUrl(`${base}/granite-a400m.gguf`, {
        n_ctx: 1024, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        jinja: true, reasoning: false, warmup: true,
    });
    const cargaGranite = performance.now() - tCarga;

    const degrau = async (nome, texto) => {
        // A primeira de cada degrau aquece o cache; as seguintes é que valem.
        await rascunhar(g, texto);
        const medidas = [];
        for (let i = 0; i < rodadas; i += 1) medidas.push(await rascunhar(g, texto));
        const media = (f) => medidas.reduce((s, m) => s + f(m), 0) / medidas.length;
        saida.push({
            nome,
            ms: media((m) => m.ms),
            lidos: media((m) => m.lidos), msLer: media((m) => m.msLer),
            escritos: media((m) => m.escritos), msEscrever: media((m) => m.msEscrever),
        });
    };

    await degrau('A · granite sozinho, sem direção', pergunta);
    await degrau('B · + a direção do cânone', `${direcao}\n\n${pergunta}`);

    const v = novo();
    await v.loadModelFromUrl(`${base}/nilo-v2-q4km.gguf`, {
        n_ctx: 1024, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
        jinja: true, reasoning: false, warmup: true,
    });
    vizinhos.push(v);
    await degrau('C · + revisor v2 de pé ao lado', `${direcao}\n\n${pergunta}`);

    const e = novo();
    await e.loadModelFromUrl(`${base}/gemma300m.gguf`, {
        n_ctx: 1024, n_threads: 2, n_gpu_layers: 0, embeddings: true,
    });
    vizinhos.push(e);
    await degrau('D · + EmbeddingGemma também', `${direcao}\n\n${pergunta}`);

    for (const w of [g, ...vizinhos]) { try { await w.exit(); } catch { /* já foi */ } }
    return { cargaGranite, saida };
}, { base: BASE, persona: PERSONA, pergunta: PERGUNTA, direcao: DIRECAO, rodadas: RODADAS });

console.log(`\n  carga do granite: ${(r.cargaGranite / 1000).toFixed(1)}s`);
console.log(`  média de ${RODADAS} rodadas por degrau, depois de uma de aquecimento\n`);
console.log('  degrau                              total    lê         escreve');
const base = r.saida[0];
for (const d of r.saida) {
    const lerTps = d.msLer ? d.lidos / (d.msLer / 1000) : 0;
    const escTps = d.msEscrever ? d.escritos / (d.msEscrever / 1000) : 0;
    const vs = d === base ? '' : `  (${((d.ms / base.ms - 1) * 100).toFixed(0).padStart(4)}%)`;
    console.log(`  ${d.nome.padEnd(34)} ${(d.ms / 1000).toFixed(1).padStart(5)}s`
        + `  ${Math.round(d.lidos).toString().padStart(3)}tok ${lerTps.toFixed(1).padStart(5)}/s`
        + `  ${Math.round(d.escritos).toString().padStart(3)}tok ${escTps.toFixed(1).padStart(5)}/s${vs}`);
}
await browser.close();
