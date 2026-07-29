/**
 * A PRISÃO NO JOGO DE VERDADE.
 *
 * Não é o módulo puro (esse já tem 10 testes): é o Andar 10 rodando, com os
 * aparelhos desenhados, o Nilo andando por conta própria e o jogador teleportado
 * para a outra ponta. O que precisa aparecer aqui:
 *   1. o Nilo TENTA os aparelhos sozinho e nada cede;
 *   2. com o jogador na outra ponta, a tranca ZUMBE e abre;
 *   3. os eventos viram recompensa na rede (a experiência acumula).
 *
 * Uso:  CHROMIUM_PATH=... node tools/f10-prisao.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const executablePath = process.env.CHROMIUM_PATH;
if (!executablePath) throw new Error('CHROMIUM_PATH is required');
const saida = '/tmp/f10-prisao';
mkdirSync(saida, { recursive: true });

const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 180)));

// A BANCADA, não o jogo inteiro: o jogo puxa uma textura do GitHub e não sobe
// num ambiente sem internet — e, mais importante, o dono do jogo também não
// chega ao Andar 10 pelo elevador ainda.
await page.goto('http://127.0.0.1:3000/?prisao', { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => !!window.__f10prisao, { timeout: 120_000 });
await page.waitForTimeout(6000);

const ler = () => page.evaluate(() => {
    const p = window.__f10prisao;
    if (!p) return null;
    return {
        trancas: p.locks.map((l) => ({
            id: l.id,
            progresso: Number((l.progress / l.holdSeconds).toFixed(2)),
            aberta: l.solved,
        })),
        porta: p.doorOpen,
        tentativas: p.npcAttempts,
        emCima: Object.values(p.devices)
            .filter((d) => d.heldByNpc || d.heldByPlayer)
            .map((d) => `${d.id}${d.heldByNpc ? '(nilo)' : ''}${d.heldByPlayer ? '(vc)' : ''}`),
        silencio: Math.round(p.secondsSinceProgress),
        aprendizado: window.__npcDebug?.npc?.autonomy?.learning?.experiences ?? 0,
        meta: window.__npcDebug?.npc?.autonomy?.goal ?? '?',
    };
});

if (!await ler()) {
    console.log('FALHOU: window.__f10prisao não existe — a prisão não está montada');
    await browser.close();
    process.exit(1);
}

console.log('=== 1. O Nilo sozinho na sala (90s) ===');
for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(15_000);
    const s = await ler();
    console.log(`  [${(i + 1) * 15}s] meta=${s.meta} tentativas=${s.tentativas} `
        + `em cima=[${s.emCima.join(', ')}] trancas=${s.trancas.map((t) => t.progresso).join('/')} `
        + `experiências=${s.aprendizado}`);
}
const sozinho = await ler();
await page.screenshot({ path: `${saida}/1-sozinho.png` });

console.log('\n=== 2. Agora EU entro na outra ponta ===');
// Eu vou para a alavanca NORTE. Ele já costuma parar na SUL sozinho — e é
// essa a graça: a dupla acontece porque ele foi por conta própria.
await page.evaluate(() => {
    const d = window.__f10prisao.devices['alavanca-norte'];
    window.__f10setPlayer?.(d.x, d.z);
});
for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(6000);
    const s = await ler();
    console.log(`  [${(i + 1) * 6}s] em cima=[${s.emCima.join(', ')}] `
        + `trancas=${s.trancas.map((t) => `${t.id}:${t.progresso}${t.aberta ? '✓' : ''}`).join(' ')} `
        + `porta=${s.porta} experiências=${s.aprendizado}`);
}
const juntos = await ler();
await page.screenshot({ path: `${saida}/2-juntos.png` });

console.log('\n--- veredito ---');
const tentou = sozinho.tentativas > 0;
const nadaSozinho = sozinho.trancas.every((t) => !t.aberta);
const cedeuJuntos = juntos.trancas.some((t) => t.aberta || t.progresso > 0);
const aprendeu = juntos.aprendizado > 0;
console.log(`ele tentou sozinho .......... ${tentou ? 'sim' : 'NÃO'} (${sozinho.tentativas})`);
console.log(`nada cedeu sozinho .......... ${nadaSozinho ? 'sim' : 'NÃO'}`);
console.log(`cedeu com os dois ........... ${cedeuJuntos ? 'sim' : 'NÃO'}`);
console.log(`a rede acumulou experiência . ${aprendeu ? 'sim' : 'NÃO'} (${juntos.aprendizado})`);
const ok = tentou && nadaSozinho && cedeuJuntos && aprendeu;
console.log(ok ? '\nOK: a prisão funciona no jogo' : '\nREPROVADO');
await browser.close();
process.exit(ok ? 0 : 1);
