/**
 * O CÓRTEX MOTOR NO NAVEGADOR — e não no llama.cpp nativo.
 *
 * Eu comparei os quantizados com o llama-server, que é a MESMA biblioteca mas
 * não é o mesmo caminho: no jogo o modelo entra pelo wllama (WASM), com outro
 * template, outro cache e a cota do navegador no meio. Um modelo que traduz
 * bem no terminal e não carrega no wllama não serve para nada.
 *
 * Aqui a pergunta é só essa: o 360M carrega, traduz pensamentos diferentes em
 * ordens diferentes, e em quanto tempo?
 *
 * Uso:
 *   CHROMIUM_PATH=... F10_WLLAMA_CDN=http://127.0.0.1:3000/wllama \
 *   F10_MOTOR_MODEL=http://127.0.0.1:3000/models/motor-teste.gguf \
 *   node tools/f10-motor-navegador.mjs
 */
import { chromium } from 'playwright';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 180)));
await page.addInitScript(({ cdn, motor }) => {
    if (cdn) window.__wllamaCdn = cdn;
    if (motor) window.__motorBrainModelUrl = motor;
}, { cdn: process.env.F10_WLLAMA_CDN, motor: process.env.F10_MOTOR_MODEL });

await page.goto('http://127.0.0.1:3000/?mente', { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10mente, { timeout: 120_000 });
console.log('página montou');

const saida = await page.evaluate(async () => {
    const motor = await import('/src/npc/floor10MotorBrain.ts');
    const { perceiveFloor10 } = await import('/src/npc/floor10Perception.ts');
    const { freshPrison } = await import('/src/npc/f10Prison.ts');
    const perception = perceiveFloor10({
        npcPosition: { x: 0, y: 0, z: 2.2 },
        npcYaw: Math.PI,
        playerPosition: { x: 0.5, y: 0, z: -0.5 },
    });
    const prison = freshPrison();
    const pensamentos = [
        'He has been quiet for a long time. I want to get closer and see his face.',
        'He is standing too close. I need room to breathe.',
        'That thing under my foot hummed. I should keep my weight on it and not move.',
        'The elevator door again. I want to look at it from another angle this time.',
        'I cannot sit still. I will walk the far side of the room, the one I never check.',
        'Nothing to do. I will just stand here and listen to the room.',
    ];
    const linhas = [];
    for (const p of pensamentos) {
        const t0 = Date.now();
        let plano = null;
        let erro = null;
        try {
            plano = await motor.translateFloor10MotorThought(p, perception, prison);
        } catch (e) {
            erro = String(e).slice(0, 140);
        }
        linhas.push({
            pensamento: p.slice(0, 44),
            plano: plano ? `${plano.verb}|${plano.target}|${plano.pace}|${plano.duration}` : null,
            ms: Date.now() - t0,
            erro,
        });
    }
    return linhas;
});

console.log('');
const ordens = new Set();
for (const l of saida) {
    console.log(`"${l.pensamento}…"`.padEnd(50)
        + ` → ${(l.plano ?? 'NADA').padEnd(34)} ${(l.ms / 1000).toFixed(1)}s`
        + (l.erro ? `  ERRO ${l.erro}` : ''));
    if (l.plano) ordens.add(l.plano);
}
const traduziu = saida.filter((l) => l.plano).length;
console.log(`\ntraduziu ${traduziu}/${saida.length} · ordens DIFERENTES: ${ordens.size}`);
// Uma ordem só para tudo é o defeito do 135M voltando: não basta responder,
// tem que diferenciar.
const ok = traduziu === saida.length && ordens.size >= 3;
console.log(ok
    ? 'OK: carrega no wllama e diferencia os pensamentos'
    : 'REPROVADO: ou não traduz, ou responde a mesma coisa para tudo');
await browser.close();
process.exit(ok ? 0 : 1);
