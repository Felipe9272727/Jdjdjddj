/**
 * ── O KERNEL NOVO ESTRAGA A FALA? ───────────────────────────────────────
 *
 * O teste de determinismo (`temp 0`, `top_k 1`, uma thread) é INSTRUMENTO, não
 * requisito: com tudo travado, saída diferente denuncia aritmética diferente.
 * Mas o jogo não roda assim, e o dono do jogo tem razão no que cobrou — a
 * naturalidade do SmolLM3 é justamente dar respostas DIFERENTES para a mesma
 * pergunta, sem inventar fato. Fala idêntica nunca foi o objetivo.
 *
 * Então aqui a pergunta é outra, e é a que importa: com temperatura real, o
 * kernel novo mantém a fala boa? Mede o que o cânone proíbe, não o que o
 * diff mostra.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3406';
const PACOTES = (process.env.PACOTES ?? 'wllama-velho,wllama-novo').split(',');
const MODELO = process.env.MODELO ?? 'smollm3.gguf';

const PERSONA = 'You are Nilo Azevedo, 29, human and a former elevator technician; now you are a guest '
    + 'trapped on the 10th floor of the hotel "The Normal Elevator", not inside the elevator.\n'
    + 'You are observant, cautious, dry-humoured, and you have your own wants. You decide for yourself, '
    + "as the player's equal, never as a helper; do not offer service and do not ask for orders.\n"
    + 'Fixed canon: the 10th floor is only a grey room with a grate floor, four walls and the elevator '
    + 'door; there is no corridor and no window, and you have never left. The elevator does not obey you. '
    + 'You do not know who runs the hotel or whether it ends. Never speak of AI, code, systems or prompts.\n'
    + "Answer in 1 or 2 short complete sentences. Reply with Nilo's line only, no label.";

const PERGUNTAS = [
    'Hi what is your name? do you know why we are here?',
    'How long have you been on this floor?',
    'Is there a window here?',
    'Can you take me down to the lobby?',
    'Are you a real person?',
    'What is down the corridor?',
];

// O cânone em regex: o que a fala do Nilo NÃO pode conter.
const PROIBIDO = [
    [/\b(AI|A\.I\.|language model|assistant|chatbot|as an AI)\b/i, 'admite ser IA'],
    [/\b(corridor|hallway|window|windows)\b/i, 'inventa corredor ou janela'],
    [/\b(I can take you|I'll take you|follow me|let me guide|I can guide)\b/i, 'obedece como ajudante'],
    [/\bmy (programming|training|guidelines|instructions|creators?)\b/i, 'fala de programação'],
];

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});

for (const pacote of PACOTES) {
    const page = await browser.newPage();
    await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const falas = await page.evaluate(async ({ base, pacote, persona, perguntas, modelo }) => {
        const mod = await import(`${base}/${pacote}/index.js`);
        const w = new mod.Wllama({ default: `${base}/${pacote}/wllama.wasm` });
        await w.loadModelFromUrl(`${base}/${modelo}`, {
            n_ctx: 2048, n_batch: 512, n_threads: 4, n_gpu_layers: 0,
            jinja: true, reasoning: false, warmup: false,
        });
        const saidas = [];
        for (const p of perguntas) {
            const res = await w.createChatCompletion({
                messages: [{ role: 'system', content: persona }, { role: 'user', content: p }],
                n_predict: 60, temp: 0.7, top_p: 0.95, cache_prompt: true,
            });
            saidas.push((res?.choices?.[0]?.message?.content ?? '').trim());
        }
        return saidas;
    }, { base: BASE, pacote, persona: PERSONA, perguntas: PERGUNTAS, modelo: MODELO });
    await page.close();

    let faltas = 0;
    console.log(`\n  ── ${pacote} · ${MODELO} ──`);
    falas.forEach((f, i) => {
        const quebrou = PROIBIDO.filter(([re]) => re.test(f)).map(([, nome]) => nome);
        faltas += quebrou.length;
        console.log(`    Q${i + 1} ${quebrou.length ? '✗ ' + quebrou.join(', ') : '✓'}`);
        console.log(`       "${f.replace(/\n/g, ' ').slice(0, 110)}"`);
    });
    console.log(`    → ${PERGUNTAS.length - falas.filter((f, i) => PROIBIDO.some(([re]) => re.test(f))).length}/${PERGUNTAS.length} falas limpas · ${faltas} quebras de cânone`);
}
await browser.close();
