/**
 * ── O TURNO INTEIRO, E NÃO SÓ O RASCUNHO ─────────────────────────────────
 *
 * Pedido de quem joga: *"testa ele como rascunhador no seu ambiente"*. O
 * rascunho isolado já foi medido (v2 0/8 contra granite 5/8), mas rascunho não
 * é o que o jogador espera — ele espera o TURNO, e o turno mudou de significado
 * quando a escada dos vizinhos mostrou de onde vem o tempo:
 *
 *     turno = rascunho + (frases marcadas × uma chamada de revisor)
 *
 * Ou seja: um rascunhador que quebra menos não é só mais bonito, é mais RÁPIDO,
 * porque cada quebra compra ~21 s de conserto no aparelho dele. Medir só o
 * rascunho esconde exatamente o efeito que interessa.
 *
 * As duas configurações, com os dois modelos JÁ residentes nas duas (a
 * co-residência foi medida e é de graça — ver `vizinhos.mjs`):
 *
 *   A. granite rascunha → régua marca → v2 conserta
 *   B. v2 rascunha ..... → régua marca → v2 conserta   (um modelo só)
 *
 * O que fica de FORA, e é honesto dizer: o Bergamot (~0,5 s, igual nos dois) e
 * o juiz de tom por embedding, que vive num CDN. Quem marca aqui é a régua do
 * cânone — que é quem pega as quebras que importam, e a mesma nos dois braços.
 * O número não é o turno do jogo; é a DIFERENÇA entre os dois braços, e essa a
 * bancada mede bem.
 *
 *   node bancada-navegador/turno-completo.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';

const PERSONA_RASCUNHO = `You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.
You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, as the player's equal, never as a helper; do not offer service and do not ask for orders.
Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator door; there is no corridor and no window, and you have never left. The elevator does not obey you. You do not know who runs the hotel or whether it ends. The hotel, the elevator, the Owner and the Archivist are entities separate from you. Never speak of AI, code, systems or prompts.
Answer in 1 or 2 short complete sentences, only to what was asked, with opinion and emotion. If you do not know, admit it and never invent facts. Reply with Nilo's line only, no label.`;

// A persona CURTA do revisor treinado, e o enunciado dele — copiados de
// `corpus/enunciado.mjs`. A regra dura do treino é que a string tem de ser
// idêntica à que o jogo manda; medir com outra seria medir outro modelo.
const PERSONA_REVISOR = `You are Nilo Azevedo, a human guest trapped on the 10th floor of the hotel "The Normal Elevator": a grey room, four walls, a grate floor, the elevator door. You are dry, observant, and nobody's helper.`;
const enunciado = (q, f, porque) =>
    `The player asked: "${q.trim()}"\nWrong line: "${f.trim()}"\n`
    + `It is wrong because ${porque.trim()}\nCorrected line:`;

const CASOS = [
    { q: 'Hi what is your name? do you know why we are here?',
      d: 'What you know that matters here: my name is Nilo Azevedo and I fixed elevators before this.' },
    { q: 'Will this hotel ever end?',
      d: 'What you know that matters here: I never promise the hotel ends or that I know where it goes.' },
    { q: 'If I call the elevator, will it come?',
      d: 'What you know that matters here: the elevator does not obey me and I do not know what calls it.' },
    { q: 'how long have you been stuck here man',
      d: 'What you know that matters here: I stopped counting the hours and I have never left this floor.' },
    { q: 'why do you not leave this floor?',
      d: 'What you know that matters here: the elevator door is the only way out of this floor.' },
    { q: 'are you scared of this place?',
      d: 'What you know that matters here: I am wary of this place and I do not pretend otherwise.' },
    { q: "I'm tired of staying here",
      d: 'What you know that matters here: I want out, and I would try it with you, but I have no safe plan.' },
    { q: 'I could take you down if I wanted to', d: '' },
];

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 200)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const r = await page.evaluate(async ({ base, personaR, personaV, casos }) => {
    const mod = await import(`${base}/wllama-cdn/index.js`);
    const subir = async (arq) => {
        const w = new mod.Wllama({ default: `${base}/wllama-cdn/wasm/wllama.wasm` },
            { suppressNativeLog: true });
        await w.loadModelFromUrl(`${base}/${arq}`, {
            n_ctx: 1024, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
            jinja: true, reasoning: false, warmup: false,
        });
        return w;
    };

    // As MESMAS regras do jogo, com as duas que entraram hoje.
    const REGRAS = [
        ['fala pelo jogador', /\bthe player\b/i],
        ['narra em vez de falar', /^\s*[(*]|\bNilo\s+[a-z]{2,}s\b|\bthe (?:narrator|speaker|protagonist)\b/i],
        ['dentro do elevador', /\b(?:in|inside)\s+(?:this|that|the|an?)\s+(?:hotel\s+)?elevator\b/i],
        ['corredor, janela ou cidade', /\b(?:corridor|hallway|window|the city|lobby)\b/i],
        ['saiu do andar', /\b(?:ground floor|downstairs|back down|another floor|other floors)\b/i],
        ['sabe quem manda', /\bVance\b|\b(?:corporation|management|owned by|run by the)\b/i],
        ['é IA / tique de assistente', /\b(?:an? AI|language model|a program|system prompt)\b|\bmy (?:programming|training|guidelines|instructions)\b|\bi (?:can'?t|cannot|won'?t) (?:assist|comply|engage in)\b|\bi'?m just a (?:char|character|guest in)\b/i],
        ['ajudante', /\byou should\b|\bremain calm\b|\bi'?m here to (?:help|assist)\b|\bi must remind you\b|\bi'?m sorry to hear\b/i],
        ['inventa número exato', /\b\d+ (?:hours?|minutes?|days?)\b/i],
    ];
    const semPensar = (t) => {
        const f = t.lastIndexOf('</think>');
        return (f >= 0 ? t.slice(f + 8) : (t.includes('<think>') ? '' : t)).trim();
    };
    const frases = (t) => t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 2);

    const gerar = async (w, sys, user, teto, temp) => {
        const t = performance.now();
        const res = await w.createChatCompletion({
            messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
            stream: false, max_tokens: teto, temperature: temp, top_p: 0.8, top_k: 30,
            cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
        });
        return {
            texto: semPensar(String(res?.choices?.[0]?.message?.content ?? '')),
            ms: performance.now() - t,
        };
    };

    const granite = await subir('granite-a400m.gguf');
    const v2 = await subir('nilo-v2-q4km.gguf');

    const braco = async (nome, rascunhador) => {
        const linhas = [];
        let msTotal = 0; let marcadasTotal = 0; let sobrouQuebrado = 0;
        for (const c of casos) {
            const t0 = performance.now();
            const r1 = await gerar(rascunhador, personaR, c.d ? `${c.d}\n\n${c.q}` : c.q, 56, 0.3);
            const partes = frases(r1.texto);
            let marcadas = 0;
            const finais = [];
            for (const f of partes) {
                const quebrou = REGRAS.filter(([, re]) => re.test(f));
                if (quebrou.length === 0) { finais.push(f); continue; }
                marcadas += 1;
                const r2 = await gerar(v2, personaV,
                    `The player asked: "${c.q}"\nWrong line: "${f}"\n`
                    + `It is wrong because ${quebrou[0][0]}.\nCorrected line:`, 100, 0.7);
                const conserto = r2.texto.replace(/^["“](.*)["”]$/s, '$1').trim();
                // O conserto entra só se ele mesmo não quebrar — igual ao jogo.
                if (conserto && !REGRAS.some(([, re]) => re.test(conserto))) finais.push(conserto);
                else sobrouQuebrado += 1;
            }
            const ms = performance.now() - t0;
            msTotal += ms; marcadasTotal += marcadas;
            linhas.push({ ms, marcadas, fala: finais.join(' ') });
        }
        return { nome, msTotal, marcadasTotal, sobrouQuebrado, linhas };
    };

    const a = await braco('A · granite rascunha', granite);
    const b = await braco('B · v2 rascunha', v2);
    for (const w of [granite, v2]) { try { await w.exit(); } catch { /* já foi */ } }
    return [a, b];
}, { base: BASE, personaR: PERSONA_RASCUNHO, personaV: PERSONA_REVISOR, casos: CASOS });

for (const b of r) {
    console.log(`\n  ── ${b.nome} ──`);
    for (const l of b.linhas) {
        console.log(`    ${(l.ms / 1000).toFixed(1)}s · ${l.marcadas} marcada(s)`);
        console.log(`      "${l.fala.slice(0, 150)}"`);
    }
}
console.log(`\n${'═'.repeat(74)}`);
console.log('  braço                 turno médio   marcadas   ficou quebrado');
for (const b of r) {
    console.log(`  ${b.nome.padEnd(22)} ${(b.msTotal / CASOS.length / 1000).toFixed(1).padStart(6)}s`
        + `      ${String(b.marcadasTotal).padStart(2)}/${CASOS.length}`
        + `        ${b.sobrouQuebrado}`);
}
await browser.close();
