/**
 * ── A SALA DESENHOU MESMO O QUE EU ESCREVI? ─────────────────────────────
 *
 * Teste de unidade não abre tela. Esta sonda abre a sala construída, com as
 * quatro combinações das chaves novas, e lê o que aparece — porque nesta mesma
 * sessão eu já entreguei uma peça (a da memória) que passava nos testes e não
 * aparecia na fila, e quem descobriu foi o dono do jogo, olhando.
 *
 *   node bancada-navegador/ver-sala.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3407';
const CHAVES = ['?pipeline', '?velocidade', '?velocidade&motor=relaxed'];

const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
for (const q of CHAVES) {
    const p = await b.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e.message).slice(0, 120)));
    await p.goto(`${BASE}/${q}`, { waitUntil: 'networkidle', timeout: 120000 });
    await p.waitForTimeout(1500);
    const t = await p.evaluate(() => document.body.innerText);
    const linhas = t.split('\n').map((x) => x.trim()).filter(Boolean);
    const motor = (t.match(/Motor\s*\n?\s*(local[^\n]*|wllama[^\n]*)/) || [])[1] ?? '—';
    const baixa = (t.match(/vai baixar ([^\n]+)/) || [])[1] ?? '—';
    console.log(`\n  ${q}`);
    console.log(`    titulo ...... ${(linhas[0] || '').slice(0, 60)}`);
    console.log(`    motor ....... ${motor.slice(0, 80)}`);
    console.log(`    vai baixar .. ${baixa.slice(0, 50)}`);
    // A PEÇA da fila, e não a palavra: o texto da sala da velocidade explica
    // por que o draft não casa com o granite, e procurar "draft da especulativa"
    // solto casava com a explicação. Sonda que dá falso positivo é pior que
    // sonda nenhuma, porque a gente confia nela.
    console.log(`    peça do draft na fila: ${/draft da especulativa · Llama/.test(t) ? 'SIM' : 'nao'}`);
    if (erros.length) console.log(`    ERROS ....... ${erros.join(' · ')}`);
    await p.close();
}
await b.close();
