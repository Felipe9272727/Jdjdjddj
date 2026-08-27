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
const CHAVES = ['?pipeline', '?pipeline&motor=relaxed',
    '?pipeline&motor=relaxed&espec=1', '?pipeline&espec=1'];

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
    const motor = (t.match(/Motor\n([^\n]+)/) || [])[1] ?? '(não achei o bloco)';
    const aviso = (t.match(/(⚠[^\n]+|especulativa desligada)/) || [])[1] ?? '—';
    console.log(`\n  ${q}`);
    console.log(`    motor ....... ${motor.slice(0, 100)}`);
    console.log(`    especulativa  ${aviso.slice(0, 110)}`);
    console.log(`    draft na fila ${/draft da especulativa/.test(t) ? 'SIM' : 'não'}`);
    if (erros.length) console.log(`    ERROS ....... ${erros.join(' · ')}`);
    await p.close();
}
await b.close();
