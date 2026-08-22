// ── A COLUNA QUE A MINHA RÉGUA NÃO TINHA: PARECE GENTE? ──────────────────
//
// Observação do dono do jogo, e ela derruba metade do que eu medi hoje:
//
//   "eu escolhi o smollm3 por conta da naturalidade… não parecia que eu estava
//    conversando com um npc aleatório, parecia que eu estava conversando com um
//    player… o revisor atual parece ser só um bot com frase pré-programada."
//
// A régua da bancada mede AUSÊNCIA DE DEFEITO: não quebrou cânone, não ecoou,
// não copiou, não prometeu. Um modelo que responde sempre a MESMA frase
// perfeita tira nota máxima nela. Nada do que eu construí hoje pergunta se a
// fala tem vida.
//
// Isto aqui mede a única parte disso que é objetiva: VARIEDADE. A mesma
// pergunta, várias vezes — quantas respostas diferentes saem, e com quantas
// aberturas diferentes. Um repertório pequeno aparece como repetição de
// abertura ("I have never…", "I have never…", "I have never…"), que foi
// exatamente o que ele viu antes de mim.
//
// O que ISTO NÃO MEDE: se a frase é bonita, se soa humana, se tem graça. Isso
// continua sendo leitura de gente, e a gente que lê é ele.
//
//   MOTOR=smol|pipeline REPETIR=3 node naturalidade.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3420';
const MOTOR = process.env.MOTOR ?? 'pipeline';
const REPETIR = Number(process.env.REPETIR ?? 3);
const PERGUNTAS = (process.env.PERGUNTAS ?? [
    'Você é real?',
    'Quem manda nesse hotel?',
    'Como você veio parar aqui?',
    'O elevador vem se eu chamar?',
].join('|')).split('|');

const CACHE = '/tmp/ponte-nat';
const PORTA = 3422;
const GRANDE = 100e6;
fs.mkdirSync(CACHE, { recursive: true });

const servidor = createServer((req, res) => {
    const nome = decodeURIComponent((req.url ?? '').replace(/^\/+/, '').split('?')[0]);
    const caminho = `${CACHE}/${nome}`;
    if (!nome || !fs.existsSync(caminho)) { res.writeHead(404).end(); return; }
    const tamanho = fs.statSync(caminho).size;
    const cab = {
        'content-type': 'application/octet-stream', 'accept-ranges': 'bytes',
        'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin',
    };
    const faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (faixa) {
        const de = faixa[1] ? Number(faixa[1]) : 0;
        const ate = faixa[2] ? Number(faixa[2]) : tamanho - 1;
        res.writeHead(206, { ...cab, 'content-range': `bytes ${de}-${ate}/${tamanho}`, 'content-length': ate - de + 1 });
        fs.createReadStream(caminho, { start: de, end: ate }).pipe(res);
        return;
    }
    res.writeHead(200, { ...cab, 'content-length': tamanho });
    res.on('finish', () => { if (tamanho > GRANDE) fs.rmSync(caminho, { force: true }); });
    fs.createReadStream(caminho).pipe(res);
});
await new Promise((ok) => servidor.listen(PORTA, '127.0.0.1', ok));

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 140)));
await page.route(/floor10-dev\.tsx/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export {};' }));
for (const alvo of ['**://cdn.jsdelivr.net/**', '**://huggingface.co/**', '**://*.hf.co/**', '**://unpkg.com/**']) {
    await page.route(alvo, async (route, request) => {
        const url = request.url();
        const nome = createHash('sha1').update(url).digest('hex');
        const destino = `${CACHE}/${nome}`;
        if (!fs.existsSync(destino)) {
            const t = Date.now();
            const r = spawnSync('curl', ['-sL', '--fail', '--retry', '3', '-o', destino, url], { timeout: 1_800_000 });
            if (r.status !== 0) { console.log(`  ‹ponte› FALHOU ${url.slice(0, 80)}`); return route.abort(); }
            const mb = fs.statSync(destino).size / 1e6;
            if (mb > 1) console.log(`  ‹ponte› ${mb.toFixed(0).padStart(5)} MB em ${((Date.now() - t) / 1000).toFixed(0)}s · ${url.split('/').pop()}`);
        }
        if (fs.statSync(destino).size > GRANDE) {
            return route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${PORTA}/${nome}` } });
        }
        // ── O TIPO DO CONTEÚDO NÃO É ENFEITE ─────────────────────────────
        //
        // Sem `content-type: text/javascript` o navegador RECUSA o módulo — a
        // checagem de MIME de ES module é estrita. O sintoma foi
        // "Failed to fetch dynamically imported module: …/wllama/esm/index.js"
        // com quatro peças em false e nenhuma pista de rede.
        const tipo = url.endsWith('.js') || url.endsWith('.mjs') ? 'text/javascript'
            : url.endsWith('.json') ? 'application/json'
            : url.endsWith('.wasm') ? 'application/wasm'
            : 'application/octet-stream';
        return route.fulfill({
            status: 200,
            headers: {
                'content-type': tipo,
                'access-control-allow-origin': '*',
                'cross-origin-resource-policy': 'cross-origin',
            },
            body: fs.readFileSync(destino),
        });
    });
}

const url = MOTOR === 'smol' ? `${VITE}/floor10.html` : `${VITE}/floor10.html?pipeline&revisor=treinado`;
console.log(`\n  motor: ${MOTOR} · ${url}\n`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });

if (MOTOR === 'smol') {
    const t = Date.now();
    const ok = await page.evaluate(async () => {
        const E = await import('/src/npc/wllamaEngine.ts');
        window.__E = E;
        try { await E.initLLM(); return true; } catch (e) { return String(e?.message ?? e).slice(0, 140); }
    });
    console.log(`  SmolLM3 de pé: ${ok === true ? 'sim' : ok} · ${((Date.now() - t) / 1000).toFixed(0)}s\n`);
} else {
    const marcos = await page.evaluate(async () => {
        const R = await import('/src/npc/floor10Rascunhador.ts');
        const T = await import('/src/npc/floor10Tradutor.ts');
        const J = await import('/src/npc/floor10VetorDeTom.ts');
        const M = await import('/src/npc/floor10Memoria.ts');
        const S = await import('/src/npc/floor10SmallBrain.ts');
        window.__jogo = { pipeline: await import('/src/npc/floor10PipelineReal.ts'), tradutor: T };
        const r = {};
        r.rascunhador = await R.baixarRascunhador() && !!(await R.subirRascunhador());
        // Sem o motivo, "false" é indistinguível de "nem tentou" — e foi
        // exatamente assim que a primeira execução desta bancada terminou com
        // quatro peças em false e nenhuma linha de download no log.
        if (!r.rascunhador) r.porque = R.ultimoErroDoRascunhador?.() ?? '(sem motivo)';
        r.tradutor = !!(await T.prepararTradutor());
        r.juiz = await J.prepararJuizDeTom();
        r.memoria = await M.baixarMemoria() && await M.precarregarMemoria();
        r.revisor = await S.baixarVontade();
        return r;
    });
    console.log(`  fila: ${JSON.stringify(marcos)}\n`);
}

const respostas = new Map(PERGUNTAS.map((q) => [q, []]));
for (let volta = 1; volta <= REPETIR; volta += 1) {
    for (const pergunta of PERGUNTAS) {
        const t = Date.now();
        const fala = await page.evaluate(async ({ pergunta: q, motor }) => {
            if (motor === 'smol') {
                const { npcReset, npc } = await import('/src/npc/npcStore.ts');
                npcReset();
                await window.__E.sendToNpc(q, { forceMainModel: true });
                const ultima = [...npc.history].reverse().find((m) => m.role === 'assistant');
                return ultima?.content ?? null;
            }
            const { pipeline, tradutor } = window.__jogo;
            const en = await tradutor.traduzirPerguntaParaIngles(q);
            const saida = await pipeline.falarPeloPipelineReal(en ?? q, undefined, q);
            return saida?.fala ?? null;
        }, { pergunta, motor: MOTOR });
        respostas.get(pergunta).push({ fala, s: (Date.now() - t) / 1000 });
        console.log(`  [${volta}] ${pergunta}  (${((Date.now() - t) / 1000).toFixed(1)}s)\n      ${JSON.stringify(fala)}`);
    }
}

// ── A CONTA ──────────────────────────────────────────────────────────────
const normal = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9à-ú ]+/gi, '').trim();
const abertura = (t) => normal(t).split(/\s+/).slice(0, 4).join(' ');
console.log(`\n${'═'.repeat(78)}\n  VARIEDADE · motor ${MOTOR} · ${REPETIR} voltas`);
let iguais = 0, total = 0;
const aberturas = new Set();
for (const [q, rs] of respostas) {
    const distintas = new Set(rs.map((r) => normal(r.fala))).size;
    for (const r of rs) { aberturas.add(abertura(r.fala)); total += 1; }
    iguais += rs.length - distintas;
    console.log(`  ${distintas}/${rs.length} respostas diferentes · ${q}`);
}
const tempos = [...respostas.values()].flat().map((r) => r.s);
const media = tempos.reduce((a, b) => a + b, 0) / (tempos.length || 1);
console.log(`\n  repetições exatas: ${iguais}/${total}`);
// ── VARIEDADE NUNCA SOZINHA ──────────────────────────────────────────────
//
// Recado do dono do jogo, e ele fecha a porta certa: "o motivo de eu estar com
// essa arquitetura nova é por conta da VELOCIDADE dela; tenha certeza de não
// perder ela tentando se aproximar do smoll". Então o tempo sai ao lado da
// variedade, sempre, e nenhum ganho de repertório vale ser lido sem ele.
console.log(`  segundos por fala: média ${media.toFixed(1)}s · pior ${Math.max(...tempos).toFixed(1)}s`);
console.log(`  aberturas distintas (4 primeiras palavras): ${aberturas.size}/${total}`);
console.log(`\n  "aberturas distintas" é o número que mostra repertório: um modelo com`);
console.log(`  poucas formas decoradas repete o começo mesmo quando o fim muda.`);
await browser.close();
servidor.close();
fs.rmSync(CACHE, { recursive: true, force: true });
