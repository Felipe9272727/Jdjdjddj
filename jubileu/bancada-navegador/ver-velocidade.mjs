/**
 * ── A SALA DA VELOCIDADE FUNCIONA DE PONTA A PONTA? ─────────────────────
 *
 * Aponta a sala para um gguf pequeno servido aqui (`__velocidadeModelUrl`) e
 * percorre o caminho inteiro: baixar com barra, subir, medir, e perguntar.
 *
 * Existe porque a barra de progresso sumiu numa renomeação de fase e ninguém
 * viu — conferir custava 1,9 GB de download, então ninguém conferia. Agora
 * custa 198 MB de rede local.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3407';
const MODELO = process.env.MODELO ?? 'http://127.0.0.1:3407/draft-200m.gguf';

// `motor=relaxed` de propósito: o pacote local é da MESMA origem. O jsdelivr
// não é alcançável do navegador desta bancada, e isso não é defeito do jogo.
const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const p = await b.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(String(e.message).slice(0, 160)));
await p.addInitScript((u) => { globalThis.__velocidadeModelUrl = u; }, MODELO);
await p.goto(`${BASE}/?velocidade&motor=relaxed`, { waitUntil: 'networkidle', timeout: 120000 });

await p.getByRole('button', { name: 'medir' }).click();

// A barra tem de aparecer ENQUANTO baixa — foi exatamente isto que quebrou.
let viuBarra = false;
for (let i = 0; i < 60 && !viuBarra; i++) {
    viuBarra = await p.evaluate(() => /\d+(\.\d+)? (KB|MB|GB) de \d/.test(document.body.innerText));
    if (!viuBarra) await p.waitForTimeout(250);
}
console.log(`  barra de progresso durante o download: ${viuBarra ? 'SIM' : 'NÃO'}`);

await p.waitForFunction(() => /Pergunte você/.test(document.body.innerText), { timeout: 300000 });
console.log('  caixa de pergunta apareceu: SIM');
// Espera a MEDIÇÃO terminar antes de perguntar: a caixa aparece assim que o
// motor sobe, mas o botão fica desabilitado enquanto a bancada mede.
await p.waitForFunction(() => /ganho do lote/.test(document.body.innerText), { timeout: 300000 });

const temTabela = await p.evaluate(() => /ganho do lote/.test(document.body.innerText));
console.log(`  tabela do número: ${temTabela ? 'SIM' : 'ainda medindo'}`);

await p.getByPlaceholder(/qual é o seu nome/).fill('oi, vc sabe pq a gente tá aqui?');
await p.getByRole('button', { name: 'perguntar' }).click();
await p.waitForFunction(
    () => /—\s*\d+([.,]\d+)?\s*s/.test(document.body.innerText), { timeout: 300000 },
).catch(() => {});
const t = await p.evaluate(() => document.body.innerText);
const resp = (t.split('perguntar')[1] ?? '').trim().slice(0, 200);
console.log(`  resposta: ${resp.replace(/\n+/g, ' | ') || '(vazia)'}`);
if (erros.length) console.log(`  ERROS: ${erros.join(' · ')}`);
await b.close();
