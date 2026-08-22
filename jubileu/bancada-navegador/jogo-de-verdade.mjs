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

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = await browser.newPage();
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
            (p) => passos.push({ passo: p.passo, ms: p.ms, texto: (p.textoEmIngles ?? p.frase ?? '').slice(0, 200) }),
            perguntaPt,
        );
        return {
            emIngles, tTrad, passos,
            ms: Date.now() - t1,
            texto: saida?.texto ?? null,
            marcadas: saida?.marcadas ?? 0,
            remendadas: saida?.remendadas ?? 0,
        };
    }, pergunta);
    linhas.push({ pergunta, ...r });
    console.log(`\n▸ ${pergunta}`);
    console.log(`   pt→en ${(r.tTrad / 1000).toFixed(1)}s · "${r.emIngles}"`);
    for (const p of r.passos) {
        console.log(`   ${String(p.passo).padEnd(10)} ${((p.ms ?? 0) / 1000).toFixed(1).padStart(5)}s  ${JSON.stringify(p.texto).slice(0, 150)}`);
    }
    console.log(`   ── ${(r.ms / 1000).toFixed(1)}s no total · ${r.marcadas} marcada(s), ${r.remendadas} remendada(s)`);
    console.log(`   ➜ ${JSON.stringify(r.texto)}`);
}

const total = linhas.reduce((s, l) => s + l.ms + l.tTrad, 0) / linhas.length / 1000;
console.log(`\n${'═'.repeat(78)}`);
console.log(`  ${linhas.length} falas · média de ${total.toFixed(1)}s por turno (tradução da pergunta incluída)`);
console.log(`  marcadas ${linhas.reduce((s, l) => s + l.marcadas, 0)} · remendadas ${linhas.reduce((s, l) => s + l.remendadas, 0)}`);
console.log(`  revisor: ${REVISOR}`);
await browser.close();
