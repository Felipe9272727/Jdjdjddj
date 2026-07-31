/**
 * A MEMÓRIA ENTRA MESMO NA FALA DO JOGO? — a prova do caminho inteiro.
 *
 * As outras sondas medem o modelo. Esta mede a INTEGRAÇÃO: chama `sendToNpc`,
 * que é a mesma função que o botão ➤ do painel chama, e confere se
 *   1. a memória foi consultada (npc.memoriaLembrou / memoriaScore),
 *   2. o fato escolhido chegou de fato ao prompt do SmolLM3,
 *   3. a resposta saiu — ou seja, a consulta não quebrou nem travou a fala.
 *
 * O motor de embedding é EMPRESTADO já carregado (`__setMemoriaEngineForProbes`)
 * para a sonda não precisar dos 333 MB via CDN; o resto é o código do jogo.
 *
 * Uso: CHROMIUM_PATH=... node tools/f10-memoria-no-jogo.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const BASE = process.env.F10_BASE ?? 'http://127.0.0.1:3000';
const FALA = process.env.F10_SPEECH_MODEL ?? `${BASE}/models/smollm3-3b.gguf`;
const MEMORIA = process.env.F10_MEMORY_MODEL ?? `${BASE}/models/gemma-embed.gguf`;
const PERGUNTA = process.env.F10_PERGUNTA ?? 'Faz quanto tempo que você tá preso?';

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[sonda]') || /error|falh|abort/i.test(t)) {
        console.log('  [c]', t.slice(0, 200));
    }
});
await page.addInitScript(({ cdn, fala }) => {
    window.__wllamaCdn = cdn;
    window.__npcModelUrl = fala;
}, { cdn: process.env.F10_WLLAMA_CDN ?? `${BASE}/wllama`, fala: FALA });
await page.goto(`${BASE}/?mente`, { waitUntil: 'load', timeout: 180_000 });
// A sala da mente monta por `lazy()`; sem esperar por ela a sonda importaria
// os módulos por conta própria e mediria um SEGUNDO exemplar do estado.
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });

const r = await page.evaluate(async ({ memoria, pergunta }) => {
    const app = window.__f10mente;
    const mod = await import(window.__wllamaCdn + '/index.js');

    // 1) o motor de memória, emprestado já pronto ao MÓDULO DO APP.
    const embed = new mod.Wllama(
        { default: window.__wllamaCdn + '/wasm/wllama.wasm' },
        { suppressNativeLog: true },
    );
    await embed.loadModelFromUrl(memoria, {
        ...app.memoria.FLOOR10_MEMORIA_LOAD_CONFIG, n_threads: 4,
    });
    app.memoria.__setMemoriaEngineForProbes(embed);

    // 2) o cérebro de fala, pelo caminho normal do jogo.
    let carregou = 'ok';
    try { await app.initLLM(); } catch (erro) { carregou = String(erro).slice(0, 160); }

    const [lex] = app.retrieveFloor10Canon(pergunta, 1);

    // 3) a fala DE VERDADE — a mesma função que o botão ➤ chama. A busca por
    //    significado acontece DENTRO dela; medir por fora seria medir outra
    //    coisa: aqui fora ainda há o aquecimento da persona ocupando a CPU, e
    //    foi assim que uma medição por fora estourou o teto e "reprovou" uma
    //    integração que funcionava.
    const t0 = performance.now();
    await app.sendToNpc(pergunta);
    const ms = Math.round(performance.now() - t0);

    // 4) o fato que ELA escolheu chegou mesmo ao prompt?
    const escolhido = app.FLOOR10_CANON.find((f) => f.id === app.npc.memoriaLembrou);
    const promptCom = app.buildFloor10SystemPrompt(
        pergunta, [], undefined, undefined,
        escolhido ? { id: escolhido.id, fact: escolhido.fact } : null,
    );
    const promptSem = app.buildFloor10SystemPrompt(pergunta, []);

    return {
        carregou,
        msLembrar: 0,
        lexical: lex ? lex.id : null,
        lembrou: app.npc.memoriaLembrou,
        score: app.npc.memoriaScore,
        promptMudou: promptCom !== promptSem,
        fatoNoPrompt: escolhido ? promptCom.includes(escolhido.fact) : false,
        fase: app.npc.phase,
        resposta: app.npc.history.at(-1)?.content ?? '',
        erro: app.npc.error,
        ms,
    };
}, { memoria: MEMORIA, pergunta: PERGUNTA });

console.log('\n── A FALA DE VERDADE, PELO CAMINHO DO JOGO ──');
console.log(`  pergunta:             "${PERGUNTA}"`);
console.log(`  carga da fala:        ${r.carregou}`);
console.log(`  por palavra:          ${r.lexical ?? 'NADA'}`);
console.log(`  memória lembrou:      ${r.lembrou || '(nada)'} (${r.score.toFixed(3)})`);
console.log(`  o prompt mudou:       ${r.promptMudou}`);
console.log(`  o fato foi ao prompt: ${r.fatoNoPrompt}`);
console.log(`  fase no fim:          ${r.fase}`);
console.log(`  resposta do Nilo:     ${r.resposta.replace(/\s+/g, ' ')}`);
console.log(`  erro:                 ${r.erro || '(nenhum)'}`);
console.log(`  tempo da fala:        ${(r.ms / 1000).toFixed(1)}s`);
const ok = r.lembrou !== '' && r.fatoNoPrompt && r.resposta !== '' && !r.erro;
console.log(ok ? '\nOK' : '\nREPROVADO');
await browser.close();
process.exit(ok ? 0 : 1);
