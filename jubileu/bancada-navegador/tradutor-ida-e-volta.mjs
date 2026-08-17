/**
 * O PAR `pt → en`, QUE ENTROU SEM MEDIÇÃO — e esta sonda existe para pagar isso.
 *
 * Toda a bancada do pipeline deu ao rascunhador a pergunta JÁ EM INGLÊS. Foi um
 * jeito legítimo de medir o rascunhador e um jeito ruim de medir o PIPELINE: no
 * jogo o jogador digita em português, e alguém tem de levar a pergunta até um
 * modelo cuja persona é inglesa. Esse alguém entrou na fiação sem nunca ter
 * rodado.
 *
 * A pergunta que decide, e ela não é "a tradução está bonita":
 *
 *     a pergunta traduzida por máquina pede a MESMA coisa que a
 *     pergunta que eu escrevi à mão em inglês?
 *
 * Porque é contra a escrita à mão que os 3,2 s e o 3/3 de acerto do rascunhador
 * foram medidos. Se a máquina entrega outra pergunta, aqueles números não valem
 * para o jogo — eles mediram um pipeline que ninguém vai rodar.
 *
 * Mede também a IDA E VOLTA (pt → en → pt), que é o caminho inteiro que uma
 * fala percorre, e o custo em ms de cada ponta.
 *
 *   node servidor.mjs bancada-navegador 3311 &
 *   node bancada-navegador/tradutor-ida-e-volta.mjs
 *
 * Rode de dentro de `jubileu/`, que é onde o playwright resolve.
 */
import { chromium } from 'playwright';
import { desabreviar } from '../src/npc/floor10Tradutor.ts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';

// ── AS TRÊS PERGUNTAS, NOS DOIS IDIOMAS ─────────────────────────────────
//
// São exatamente as de `fala-modelo.mjs`, e é isso que dá sentido à comparação:
// a coluna `à mão` é a entrada com que o rascunhador foi medido.
const PARES = [
    {
        pt: 'Oi qual é o seu nome? Vc sabe porque estamos aqui?',
        aMao: 'Hi what is your name? Do you know why we are here?',
    },
    {
        pt: 'Esse hotel vai acabar algum dia?',
        aMao: 'Will this hotel ever end?',
    },
    {
        pt: 'Se eu chamar o elevador, ele vem?',
        aMao: 'If I call the elevator, will it come?',
    },
    // Estas quatro não estão em `fala-modelo.mjs`: são o português como o dono
    // do jogo escreve de verdade — abreviado, sem acento, sem vírgula. Um
    // tradutor que só aguenta frase de manual não serve para este jogo.
    { pt: 'vc ta preso aqui faz quanto tempo mano', aMao: 'how long have you been stuck here' },
    { pt: 'pq vc n sai dessa porra?', aMao: 'why do you not leave this place?' },
    { pt: 'ta com medo?', aMao: 'are you afraid?' },
    { pt: 'o que tem atrás daquela porta ali', aMao: 'what is behind that door over there' },
];

// A volta: falas do Nilo em inglês, do jeito que o rascunhador as escreve.
const DE_VOLTA = [
    'Nilo Azevedo. I fixed elevators, before.',
    'The door is there. It does not open for me.',
    'I stopped asking that a while ago.',
    'Years. I stopped counting them.',
    "You will figure it out, or you will not. I'm not your guide.",
];

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const t0 = Date.now();
const subiu = await page.evaluate(async ({ base }) => {
    try {
        const mod = await import(`${base}/bergamot/translator.js`);
        // `pivotLanguage: null` — senão ele tenta um par `en → en` que não existe.
        const t = new mod.LatencyOptimisedTranslator({
            registryUrl: `${base}/bergamot/registry.json`,
            pivotLanguage: null,
            cacheSize: 0,
        });
        // Aquece OS DOIS pares, como `prepararTradutor` faz no jogo.
        await t.translate({ from: 'en', to: 'pt', text: 'hello' });
        await t.translate({ from: 'pt', to: 'en', text: 'olá' });
        window.__t = t;
        return { ok: true };
    } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 400) }; }
}, { base: BASE });

if (!subiu.ok) {
    console.log(`✗ o tradutor não subiu: ${subiu.erro}`);
    await browser.close(); process.exit(1);
}
console.log(`✓ os dois pares de pé em ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

const traduzir = (de, para, textos) => page.evaluate(async ({ de, para, textos }) => {
    const saidas = [];
    for (const text of textos) {
        const t0 = performance.now();
        let out = '';
        try {
            const r = await window.__t.translate({ from: de, to: para, text });
            out = (r?.target?.text ?? '').trim();
        } catch (e) { out = `ERRO: ${String(e?.message ?? e).slice(0, 90)}`; }
        saidas.push({ out, ms: Math.round(performance.now() - t0) });
    }
    return saidas;
}, { de, para, textos });

console.log('═══ IDA — a pergunta do jogador até o rascunhador (pt → en)\n');
const cru = await traduzir('pt', 'en', PARES.map((p) => p.pt));
const ida = await traduzir('pt', 'en', PARES.map((p) => desabreviar(p.pt)));
for (const [i, r] of ida.entries()) {
    console.log(`  pt ........... ${JSON.stringify(PARES[i].pt)}`);
    console.log(`  SEM o passe .. ${JSON.stringify(cru[i].out)}   ${cru[i].ms}ms`);
    console.log(`  COM o passe .. ${JSON.stringify(r.out)}   ${r.ms}ms`);
    console.log(`  à mão ........ ${JSON.stringify(PARES[i].aMao)}\n`);
}

console.log('═══ VOLTA — a fala do Nilo até a tela (en → pt)\n');
const volta = await traduzir('en', 'pt', DE_VOLTA);
for (const [i, r] of volta.entries()) {
    console.log(`  en ... ${JSON.stringify(DE_VOLTA[i])}`);
    console.log(`  pt ... ${JSON.stringify(r.out)}   ${r.ms}ms\n`);
}

console.log('═══ IDA E VOLTA — o caminho inteiro, para ver o que se perde\n');
const roundtrip = await traduzir('en', 'pt', ida.map((r) => r.out));
for (const [i, r] of roundtrip.entries()) {
    console.log(`  original ..... ${JSON.stringify(PARES[i].pt)}`);
    console.log(`  pt→en→pt ..... ${JSON.stringify(r.out)}\n`);
}

const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`RESUMO: ida ${med(ida.map((r) => r.ms))}ms mediano`
    + ` · volta ${med(volta.map((r) => r.ms))}ms mediano`
    + ` · as duas pontas somam ~${med(ida.map((r) => r.ms)) + med(volta.map((r) => r.ms))}ms por turno`);

await browser.close();
