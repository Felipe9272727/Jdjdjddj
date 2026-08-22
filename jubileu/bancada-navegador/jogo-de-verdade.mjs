// ── O PIPELINE INTEIRO, COMO NO JOGO, NESTA CAIXA ────────────────────────
//
// As bancadas anteriores mediam UMA peça de cada vez, chamando o wllama na
// unha. Isto aqui é outra coisa: sobe o servidor de desenvolvimento do jogo e
// importa OS MÓDULOS DE VERDADE — `floor10PipelineReal`, `floor10Rascunhador`,
// `floor10Tradutor`, `floor10VetorDeTom`, `floor10Memoria`. O caminho é o
// mesmo que o celular percorre; o que não existe é a interface.
//
// Por que não clicar na tela: a medição não pode depender do DOM. Um botão
// renomeado quebraria a bancada e ninguém saberia se o número mudou porque o
// pipeline mudou ou porque o botão mudou.
//
//   VITE=http://127.0.0.1:3420 REVISOR=treinado node jogo-de-verdade.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3420';
const REVISOR = process.env.REVISOR ?? 'treinado';
const PERGUNTAS = (process.env.PERGUNTAS ?? [
    'Onde a gente tá?',
    'Você é real?',
    'O que tem atrás daquela parede?',
    'Quem manda nesse hotel?',
    'Como você veio parar aqui?',
    'O elevador vem se eu chamar?',
].join('|')).split('|');

// ── O NAVEGADOR DESTA CAIXA NÃO ALCANÇA A INTERNET ───────────────────────
//
// A sessão sai por um proxy que re-termina TLS, e o Chromium do Playwright não
// tem a CA desse proxy no armazém dele (o NSS está vazio; não há certutil para
// instalar). Resultado: todo `fetch` para jsdelivr ou huggingface morre em
// "Failed to fetch", e os três carregadores falham juntos no mesmo prazo —
// 12,7 s cada, que é o timeout do CDN e não do modelo.
//
// A saída NÃO é desligar verificação de TLS. É interceptar: o Playwright roda
// no Node, o Node tem o proxy e a CA configurados, então quem busca é ele e o
// navegador recebe os bytes já resolvidos. A página nunca faz o pedido externo.
//
// O arquivo temporário morre assim que é entregue: o disco desta caixa não
// comporta uma cópia local do catálogo E a cópia que o navegador guarda no
// OPFS.
const CACHE = process.env.CACHE ?? '/tmp/ponte';
const PORTA_PONTE = Number(process.env.PORTA_PONTE ?? 3421);
fs.mkdirSync(CACHE, { recursive: true });

// ── ARQUIVO GRANDE NÃO PASSA POR `route.fulfill` ─────────────────────────
//
// O `fulfill` do Playwright serializa o corpo em base64 antes de mandar para o
// navegador, e o V8 recusa string acima de 512 MB:
//
//     Error: Cannot create a string longer than 0x1fffffe8 characters
//     ERR_STRING_TOO_LONG   ← o rascunhador tem 822 MB
//
// Então o grande vai por REDIRECIONAMENTO: a ponte responde 302 para um
// servidor local que transmite o arquivo em pedaços, com Range, como qualquer
// servidor de verdade. O navegador continua sem falar com a internet.
const servidorDaPonte = createServer((req, res) => {
    const nome = decodeURIComponent((req.url ?? '').replace(/^\/+/, '').split('?')[0]);
    const caminho = `${CACHE}/${nome}`;
    if (!nome || !fs.existsSync(caminho)) { res.writeHead(404).end(); return; }
    const tamanho = fs.statSync(caminho).size;
    const cabecalhos = {
        'content-type': 'application/octet-stream',
        'accept-ranges': 'bytes',
        'access-control-allow-origin': '*',
        'cross-origin-resource-policy': 'cross-origin',
    };
    const faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (faixa) {
        const de = faixa[1] ? Number(faixa[1]) : 0;
        const ate = faixa[2] ? Number(faixa[2]) : tamanho - 1;
        res.writeHead(206, {
            ...cabecalhos,
            'content-range': `bytes ${de}-${ate}/${tamanho}`,
            'content-length': ate - de + 1,
        });
        fs.createReadStream(caminho, { start: de, end: ate }).pipe(res);
        return;
    }
    res.writeHead(200, { ...cabecalhos, 'content-length': tamanho });
    fs.createReadStream(caminho).pipe(res);
});
await new Promise((ok) => servidorDaPonte.listen(PORTA_PONTE, '127.0.0.1', ok));

const tipo = (url) => (url.endsWith('.js') || url.endsWith('.mjs') ? 'text/javascript'
    : url.endsWith('.json') ? 'application/json'
    : url.endsWith('.wasm') ? 'application/wasm'
    : 'application/octet-stream');

const GRANDE = 100e6;

async function pelaPonte(route, request) {
    const url = request.url();
    const nome = createHash('sha1').update(url).digest('hex');
    const destino = `${CACHE}/${nome}`;
    if (!fs.existsSync(destino)) {
        const t = Date.now();
        const r = spawnSync('curl', ['-sL', '--fail', '--retry', '3', '-o', destino, url], { timeout: 1_800_000 });
        if (r.status !== 0 || !fs.existsSync(destino)) {
            console.log(`  ‹ponte› FALHOU ${url.slice(0, 90)}`);
            return route.abort();
        }
        const mb = fs.statSync(destino).size / 1e6;
        if (mb > 1) console.log(`  ‹ponte› ${mb.toFixed(0).padStart(5)} MB em ${((Date.now() - t) / 1000).toFixed(0).padStart(3)}s · ${url.split('/').pop()}`);
    }
    if (fs.statSync(destino).size > GRANDE) {
        return route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${PORTA_PONTE}/${nome}` } });
    }
    await route.fulfill({
        status: 200,
        headers: {
            'content-type': tipo(url),
            'access-control-allow-origin': '*',
            'cross-origin-resource-policy': 'cross-origin',
        },
        body: fs.readFileSync(destino),
    });
}

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
// ── A PÁGINA DE DESENVOLVIMENTO NÃO PODE SUBIR SOZINHA ───────────────────
//
// `floor10.html` carrega `/src/floor10-dev.tsx`, e a primeira execução desta
// bancada mostrou o efeito: 1.915 MB de SmolLM3 baixados antes de qualquer
// medição. Esta bancada não quer o app — quer os MÓDULOS dele, chamados na
// ordem em que a fila do pipeline os chama. Trocar o boot por um módulo vazio
// mantém o resto da página igual (isolamento cross-origin, cliente do vite).
await page.route('**/src/floor10-dev.tsx', (r) => r.fulfill({
    status: 200, contentType: 'text/javascript', body: 'export {};',
}));
for (const alvo of ['**://cdn.jsdelivr.net/**', '**://huggingface.co/**', '**://*.hf.co/**',
    '**://cdn-lfs*.hf.co/**', '**://unpkg.com/**', '**://storage.googleapis.com/**']) {
    await page.route(alvo, pelaPonte);
}
page.on('pageerror', (e) => console.log('  ‹página› ' + String(e.message).slice(0, 160)));
page.on('console', (m) => {
    const t = m.text();
    if (/erro|error|falhou|abort/i.test(t)) console.log('  ‹console› ' + t.slice(0, 160));
});

console.log(`\n  abrindo o jogo em ${VITE}/floor10.html?pipeline&revisor=${REVISOR}\n`);
await page.goto(`${VITE}/floor10.html?pipeline&revisor=${REVISOR}`, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
});

// ── A FILA, NA ORDEM EM QUE O JOGO A BAIXA ───────────────────────────────
const carga = await page.evaluate(async () => {
    const marcos = [];
    const marcar = async (nome, f) => {
        const t = Date.now();
        let ok = false;
        try { ok = !!(await f()); } catch (e) { marcos.push({ nome, erro: String(e?.message ?? e).slice(0, 120) }); return; }
        marcos.push({ nome, ok, s: (Date.now() - t) / 1000 });
    };
    const R = await import('/src/npc/floor10Rascunhador.ts');
    const T = await import('/src/npc/floor10Tradutor.ts');
    const J = await import('/src/npc/floor10VetorDeTom.ts');
    const M = await import('/src/npc/floor10Memoria.ts');
    window.__jogo = {
        pipeline: await import('/src/npc/floor10PipelineReal.ts'),
        tradutor: T,
        memoria: M,
    };
    await marcar('rascunhador (granite a400m)', () => R.baixarRascunhador());
    await marcar('rascunhador de pé', () => R.subirRascunhador());
    await marcar('tradutor (Bergamot en↔pt)', () => T.prepararTradutor());
    await marcar('juiz de tom (mpnet)', () => J.prepararJuizDeTom());
    await marcar('memória (embeddinggemma 300M)', () => M.baixarMemoria());
    await marcar('memória de pé', () => M.precarregarMemoria());
    // O REVISOR TAMBÉM DESCE NA FILA. A primeira execução esqueceu dele e o
    // remendo voltou vazio em 12 s — não porque o modelo errou, mas porque
    // nunca tinha sido baixado. `remendar` não baixa nada na hora da fala.
    const S = await import('/src/npc/floor10SmallBrain.ts');
    await marcar('revisor (na fila, sem subir)', () => S.baixarVontade());
    return { marcos, memoriaCarregada: M.memoriaJaCarregada() };
});
for (const m of carga.marcos) {
    console.log(`  ${m.erro ? '✗' : (m.ok ? '✓' : '·')} ${m.nome.padEnd(32)} ${m.erro ?? `${m.s.toFixed(1)}s`}`);
}
console.log(`\n  memória por significado de pé: ${carga.memoriaCarregada ? 'SIM' : 'NÃO (cai na busca por palavra)'}\n`);

// ── AS FALAS ─────────────────────────────────────────────────────────────
const linhas = [];
for (const pergunta of PERGUNTAS) {
    const r = await page.evaluate(async (perguntaPt) => {
        const { pipeline, tradutor } = window.__jogo;
        const t0 = Date.now();
        const emIngles = await tradutor.traduzirPerguntaParaIngles(perguntaPt);
        const tTrad = Date.now() - t0;
        const passos = [];
        const t1 = Date.now();
        const saida = await pipeline.falarPeloPipelineReal(
            emIngles ?? perguntaPt,
            (p) => passos.push({
                passo: p.passo,
                ms: p.ms ?? 0,
                // Cada passo carrega um campo diferente, e ler só
                // `textoEmIngles` fazia "frases", "juiz" e "remendo" saírem
                // como string vazia — parecendo falha quando eram o normal.
                texto: p.passo === 'rascunho' ? p.textoEmIngles
                    : p.passo === 'frases' ? `${p.frases.length} frase(s)`
                    : p.passo === 'juiz' ? p.marcadas.map((m) => `«${m.frase ?? ''}» ${m.porque ?? ''}`).join(' · ')
                    : p.passo === 'limpeza' ? `${p.antes} → ${p.depois}`
                    : p.passo === 'remendo' ? `[${p.desfecho?.tipo ?? '?'}] ${p.desfecho?.depois ?? p.antes}`
                    : p.passo === 'traducao' ? p.depoisEmPtBr
                    : '',
            }),
            perguntaPt,
        );
        return {
            emIngles, tTrad, passos,
            ms: Date.now() - t1,
            fala: saida?.fala ?? null,
            marcadas: saida?.marcadas ?? 0,
            remendadas: saida?.remendadas ?? 0,
        };
    }, pergunta);
    linhas.push({ pergunta, ...r });
    // ── O RASCUNHADOR VOLTA DEPOIS DA FALA, E ISSO LEVA TEMPO ────────────
    //
    // `falarPeloPipelineReal` termina e só então chama `devolverORascunhador`,
    // sem esperar — quem precisa dele é a PRÓXIMA pergunta. No jogo, o jogador
    // gasta segundos digitando e não percebe. Na bancada as perguntas vêm
    // coladas, e a primeira execução mostrou o efeito: as cinco falas seguintes
    // voltaram `null` em 0,0 s, porque `pipelineDisponivel()` era falso.
    const voltou = await page.evaluate(async () => {
        const R = await import('/src/npc/floor10Rascunhador.ts');
        const t = Date.now();
        for (let i = 0; i < 240; i += 1) {
            if (R.rascunhadorJaCarregado()) return (Date.now() - t) / 1000;
            await new Promise((ok) => setTimeout(ok, 500));
        }
        return -1;
    });
    console.log(`   (rascunhador de volta em ${voltou < 0 ? 'NUNCA' : voltou.toFixed(1) + 's'})`);
    console.log(`\n▸ ${pergunta}`);
    console.log(`   pt→en ${(r.tTrad / 1000).toFixed(1)}s · "${r.emIngles}"`);
    for (const p of r.passos) {
        console.log(`   ${String(p.passo).padEnd(10)} ${((p.ms ?? 0) / 1000).toFixed(1).padStart(5)}s  ${JSON.stringify(p.texto).slice(0, 150)}`);
    }
    console.log(`   ── ${(r.ms / 1000).toFixed(1)}s no total · ${r.marcadas} marcada(s), ${r.remendadas} remendada(s)`);
    console.log(`   ➜ ${JSON.stringify(r.fala)}`);
}

const total = linhas.reduce((s, l) => s + l.ms + l.tTrad, 0) / linhas.length / 1000;
console.log(`\n${'═'.repeat(78)}`);
console.log(`  ${linhas.length} falas · média de ${total.toFixed(1)}s por turno (tradução da pergunta incluída)`);
console.log(`  marcadas ${linhas.reduce((s, l) => s + l.marcadas, 0)} · remendadas ${linhas.reduce((s, l) => s + l.remendadas, 0)}`);
console.log(`  revisor: ${REVISOR}`);
const memoria = await page.evaluate(async () => {
    const C = await import('/src/npc/floor10CaixaPreta.ts');
    return C.eventosDaCaixaPreta()
        .filter((e) => String(e.evento ?? e.nome ?? '').startsWith('pipeline:memoria'))
        .map((e) => JSON.stringify(e.dados ?? e));
});
console.log(`\n  o que a memória entregou em cada fala:`);
for (const m of memoria) console.log(`    ${m}`);
await browser.close();
servidorDaPonte.close();
fs.rmSync(CACHE, { recursive: true, force: true });
