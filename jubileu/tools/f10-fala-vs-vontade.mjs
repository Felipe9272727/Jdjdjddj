/**
 * "AGR NEM FALAR ELE FALA" — reproduzir e cronometrar.
 *
 * A hipótese: o coordenador serializa as CARGAS dos dois cérebros. Se a
 * deliberação começar a carregar o modelo pequeno (centenas de MB) e o jogador
 * mandar uma mensagem no meio disso, a fala fica na fila atrás daquela carga —
 * e para quem está jogando, o Nilo simplesmente emudece.
 *
 * Aqui isso é medido, não deduzido: dispara a deliberação, espera ela entrar em
 * carga, manda o jogador falar, e cronometra quanto tempo até o PRIMEIRO
 * pedaço de fala aparecer.
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_SMALL_MODEL=http://127.0.0.1:3000/models/gemma3-1b.gguf \
 *   F10_SPEECH_MODEL=http://127.0.0.1:3000/models/smollm3.gguf \
 *   node tools/f10-fala-vs-vontade.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const url = process.env.F10_URL ?? 'http://127.0.0.1:3000/?mente';
/** Quanto a fala pode esperar antes de ser considerada emudecida. */
const LIMITE_S = Number(process.env.F10_LIMITE ?? 60);

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
await page.addInitScript(({ cdn, small, speech, controle }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (small) window.__smallBrainModelUrl = small;
    if (speech) window.__npcModelUrl = speech;
    window.__npcThreads = 4;
    if (controle) window.__f10controle = true;
}, {
    cdn: process.env.F10_WLLAMA_CDN,
    small: process.env.F10_SMALL_MODEL,
    speech: process.env.F10_SPEECH_MODEL,
    controle: process.env.F10_CONTROLE === '1',
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });
console.log('página montou');

const r = await page.evaluate(async (limiteS) => {
    const pequeno = await import('/src/npc/floor10SmallBrain.ts');
    const fala = await import('/src/npc/wllamaEngine.ts');
    const { perceiveFloor10 } = await import('/src/npc/floor10Perception.ts');
    const { npc } = await import('/src/npc/npcStore.ts');
    const espera = (ms) => new Promise((res) => setTimeout(res, ms));

    const input = {
        perception: perceiveFloor10({
            npcPosition: { x: 0, y: 0, z: 2.2 },
            npcYaw: Math.PI,
            playerPosition: { x: 0.5, y: 0, z: -0.5 },
        }),
        drives: { social: 1, curiosity: 0.5, restlessness: 0.4, fatigue: 0.2 },
        memory: {
            inspectedElevatorCount: 3, sleeps: 44, playerSilentSeconds: 30,
            lastGoals: ['idle'], agreedAction: null, agreedReason: null,
        },
        now: 1,
    };

    // 1. O Nilo começa a formar uma intenção (isto carrega o cérebro pequeno).
    // Com CONTROLE=1 esta etapa é pulada: é o mesmo teste sem a vontade no
    // caminho, para saber quanto da espera é dela e quanto é da fala sozinha.
    const controle = !!window.__f10controle;
    const vontade = controle ? Promise.resolve(null) : pequeno.deliberateFloor10(input);
    if (!controle) {
        // Espera ela realmente entrar em carga — é aí que o jogador esbarra.
        for (let i = 0; i < 60 && npc.deliberationPhase !== 'loading'; i += 1) {
            await espera(200);
        }
    }
    const faseQuandoFalou = controle ? '(controle: sem vontade)' : npc.deliberationPhase;

    // 2. No meio disso, o jogador fala.
    const t0 = Date.now();
    let msPrimeiroPedaco = null;
    let texto = '';
    let erro = null;
    const crus = [];
    try {
        const engine = await fala.initLLM();
        // O JOGO espera o aquecimento da persona antes de gerar. Sem isto,
        // duas gerações disputam a MESMA instância do wllama: a primeira vez
        // que rodei esta sonda saiu "(ABORT)" e, na outra, uma resposta com
        // letras faltando. Não era defeito do jogo, era defeito da sonda.
        await fala.settlePersonaPrewarm();
        const msEngine = Date.now() - t0;
        const stream = await engine.createChatCompletion({
            messages: [
                { role: 'system', content: 'You are Nilo. Answer in one short sentence, in Portuguese.' },
                { role: 'user', content: 'oi, tudo bem?' },
            ],
            ...fala.CHAT_COMPLETION_CONFIG,
            stream: true,
        });
        for await (const chunk of stream) {
            if (crus.length < 24) crus.push(chunk);
            const pedaco = fala.chunkDelta(chunk);
            if (pedaco) {
                msPrimeiroPedaco ??= Date.now() - t0;
                texto += pedaco;
            }
            if (texto.length > 60) break;
        }
        return {
            faseQuandoFalou, msEngine, msPrimeiroPedaco, crus,
            msTotal: Date.now() - t0, texto: texto.slice(0, 120), erro,
            limiteS,
            vontade: await Promise.race([
                vontade.then((d) => d?.goal ?? 'sem decisão'),
                espera(1000).then(() => 'ainda pensando'),
            ]),
        };
    } catch (e) {
        erro = String(e).slice(0, 200);
        return {
            faseQuandoFalou, msPrimeiroPedaco: null, crus,
            msTotal: Date.now() - t0, texto, erro, limiteS, vontade: '?',
        };
    }
}, LIMITE_S);

console.log('\nfase da vontade quando o jogador falou:', r.faseQuandoFalou);
console.log('engine da fala pronta em            :', r.msEngine != null ? `${(r.msEngine / 1000).toFixed(1)}s` : '—');
console.log('PRIMEIRA palavra do Nilo em         :',
    r.msPrimeiroPedaco != null ? `${(r.msPrimeiroPedaco / 1000).toFixed(1)}s` : 'NUNCA');
console.log('resposta                            :', JSON.stringify(r.texto));
console.log('pedaços crus da fala:');
for (const [i, c] of (r.crus ?? []).entries()) {
    console.log(`  [${i}] ${JSON.stringify(c).slice(0, 190)}`);
}
console.log('a vontade, enquanto isso            :', r.vontade);
if (r.erro) console.log('erro                                :', r.erro);

const ok = r.msPrimeiroPedaco != null && r.msPrimeiroPedaco < LIMITE_S * 1000;
console.log(ok
    ? `\nOK: a fala não ficou presa atrás da vontade (< ${LIMITE_S}s)`
    : `\nREPROVADO: a fala esperou mais de ${LIMITE_S}s — é o "nem falar ele fala"`);
await browser.close();
process.exit(ok ? 0 : 1);
