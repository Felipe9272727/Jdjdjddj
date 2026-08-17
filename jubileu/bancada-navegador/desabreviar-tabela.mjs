/**
 * A TABELA DE ABREVIAÇÕES, ENTRADA POR ENTRADA, NO BERGAMOT DE VERDADE.
 *
 * Escrever uma tabela de 60 linhas e declará-la boa é exatamente o tipo de
 * coisa que este projeto já pagou caro para não fazer. Cada linha aqui é uma
 * afirmação testável: "sem o passe o tradutor erra, com o passe acerta". Esta
 * sonda cobra as duas metades.
 *
 * O veredito de cada linha:
 *
 *   VAZOU    o inglês ainda contém a abreviação crua — o defeito original.
 *   CONSERTOU o passe mudou a saída e a abreviação sumiu.
 *   INERTE   o Bergamot já dava conta sozinho; a linha não faz mal, mas
 *            também não paga o próprio peso.
 *   PIOROU   o passe mudou para pior — precisa sair da tabela.
 *
 * O que interessa de verdade é a última coluna: uma linha PIOROU vale mais que
 * dez CONSERTOU, porque estraga frase que já estava boa.
 *
 *   node bancada-navegador/servidor.mjs bancada-navegador 3311 &
 *   npx tsx bancada-navegador/desabreviar-tabela.mjs
 */
import { chromium } from 'playwright';
import { desabreviar } from '../src/npc/floor10Tradutor.ts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';

// ── UMA FRASE POR ABREVIAÇÃO, no contexto do jogo ───────────────────────
//
// Frase, e não palavra solta: `\b` e o modelo de tradução se comportam
// diferente com uma palavra sozinha, e o que o jogo manda é frase.
const CASOS = [
    ['vcs', 'vcs sabem o que tem lá fora?'],
    ['vc', 'vc mora aqui?'],
    ['cê', 'cê viu alguém passar?'],
    ['nois', 'nois vai sair daqui?'],
    ['gnt', 'tem mais gnt nesse andar?'],
    ['ngm', 'ngm nunca veio aqui?'],
    ['mn', 'mn, esse lugar é estranho'],
    ['mlk', 'e aí mlk, tudo certo?'],

    ['ta', 'vc ta bem?'],
    ['tá', 'tá acontecendo o que aqui?'],
    ['to', 'to com medo desse lugar'],
    ['tô', 'tô perdido nesse andar'],
    ['tamo', 'tamo preso aqui pra sempre?'],
    ['tava', 'vc tava aqui ontem?'],
    ['eh', 'eh serio isso?'],
    ['né', 'vc não sai daqui, né?'],

    ['n', 'vc n sabe de nada?'],
    ['nao', 'vc nao tem medo?'],
    ['nd', 'vc não sabe nd sobre o hotel?'],

    ['pq', 'pq vc está aqui?'],
    ['oq', 'oq tem atrás dessa porta?'],
    ['qnd', 'qnd vc chegou nesse andar?'],
    ['qnt', 'qnt tempo vc está preso?'],
    ['qm', 'qm mandou vc pra cá?'],
    ['kd', 'kd as outras pessoas?'],
    ['q', 'o q vc quer de mim?'],

    ['agr', 'agr o elevador vem?'],
    ['dps', 'e dps que a porta abre?'],
    ['hj', 'hj alguém passou aqui?'],
    ['dnv', 'vou chamar o elevador dnv'],
    ['vzs', 'quantas vzs vc tentou sair?'],

    ['mt', 'esse andar é mt escuro'],
    ['mts', 'tem mts portas aqui?'],
    ['td', 'vc sabe td sobre esse hotel?'],
    ['tds', 'tds os andares são iguais?'],
    ['msm', 'é o msm elevador de sempre?'],
    ['ctz', 'vc tem ctz disso?'],
    ['vdd', 'isso é vdd mesmo?'],

    ['fzr', 'o que eu posso fzr aqui?'],
    ['axo', 'axo que ouvi um barulho'],
    ['pd', 'vc pd me ajudar?'],
    ['qro', 'qro sair desse andar'],

    ['sla', 'sla, esse lugar me assusta'],
    ['tlg', 'esse hotel é errado, tlg'],
    ['vlw', 'vlw por me contar isso'],
    ['blz', 'blz, vou esperar aqui então'],
    ['flw', 'flw, vou tentar a porta'],
    ['mds', 'mds, o que foi esse barulho?'],
    ['pfv', 'me responde pfv'],

    ['pra', 'pra onde essa porta vai?'],
    ['pro', 'vc olhou pro elevador?'],
    ['cmg', 'vem cmg até a porta'],
    ['p/', 'olha p/ a grade do chão'],

    ['kkk', 'esse lugar é doido kkkk'],

    // ── OS CONTROLES: português inteiro, que NÃO pode piorar ────────────
    ['(controle) limpo', 'Esse hotel vai acabar algum dia?'],
    ['(controle) limpo', 'Se eu chamar o elevador, ele vem?'],
    ['(controle) limpo', 'O que tem atrás daquela porta ali?'],
    ['(controle) limpo', 'Você mora dentro deste elevador?'],
    ['(controle) limpo', 'Há quanto tempo você está preso neste andar?'],
    // As armadilhas que a tabela precisa NÃO cair.
    ['(armadilha) num', 'você dormiu num quarto desse hotel?'],
    ['(armadilha) tão', 'por que esse andar é tão escuro?'],
    ['(armadilha) nota', 'a porta tem um número gravado nela'],
];

const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(`${BASE}/vazio.html`, { waitUntil: 'domcontentloaded', timeout: 120000 });

const subiu = await page.evaluate(async ({ base }) => {
    try {
        const mod = await import(`${base}/bergamot/translator.js`);
        const t = new mod.LatencyOptimisedTranslator({
            registryUrl: `${base}/bergamot/registry.json`,
            pivotLanguage: null,
            cacheSize: 0,
        });
        await t.translate({ from: 'pt', to: 'en', text: 'olá' });
        window.__t = t;
        return { ok: true };
    } catch (e) { return { ok: false, erro: String(e?.message ?? e).slice(0, 400) }; }
}, { base: BASE });
if (!subiu.ok) { console.log(`✗ tradutor não subiu: ${subiu.erro}`); await browser.close(); process.exit(1); }

const traduzir = (textos) => page.evaluate(async ({ textos }) => {
    const out = [];
    for (const text of textos) {
        try {
            const r = await window.__t.translate({ from: 'pt', to: 'en', text });
            out.push((r?.target?.text ?? '').trim());
        } catch (e) { out.push(`ERRO: ${String(e?.message ?? e).slice(0, 80)}`); }
    }
    return out;
}, { textos });

const cru = await traduzir(CASOS.map(([, f]) => f));
const passe = await traduzir(CASOS.map(([, f]) => desabreviar(f)));

const contagem = { VAZOU: 0, CONSERTOU: 0, INERTE: 0, PIOROU: 0 };
const problemas = [];

console.log('\n═══ CADA LINHA DA TABELA, NO BERGAMOT DE VERDADE\n');
for (const [i, [abrev, frase]] of CASOS.entries()) {
    const antes = cru[i];
    const depois = passe[i];
    const controle = abrev.startsWith('(');
    // A abreviação vazou se ela reaparece no inglês como palavra inteira.
    const escapou = (txt) => {
        const alvo = abrev.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        return new RegExp(`(^|[^a-zà-ú])${alvo}([^a-zà-ú]|$)`, 'i').test(txt);
    };
    let v;
    if (controle) v = antes === depois ? 'INERTE' : 'PIOROU';
    else if (escapou(depois)) v = 'VAZOU';
    else if (antes === depois) v = 'INERTE';
    else if (escapou(antes)) v = 'CONSERTOU';
    else v = 'INERTE';
    contagem[v] += 1;

    const marca = { VAZOU: '✗', CONSERTOU: '✓', INERTE: '·', PIOROU: '✗✗' }[v];
    console.log(`${marca} ${v.padEnd(9)} ${abrev.padEnd(16)} ${JSON.stringify(frase)}`);
    if (v !== 'INERTE') {
        console.log(`               sem passe .. ${JSON.stringify(antes)}`);
        console.log(`               com passe .. ${JSON.stringify(depois)}`);
    }
    if (v === 'VAZOU' || v === 'PIOROU') problemas.push({ abrev, frase, antes, depois, v });
}

console.log(`\n═══ ${contagem.CONSERTOU} consertou · ${contagem.INERTE} inerte`
    + ` · ${contagem.VAZOU} vazou · ${contagem.PIOROU} PIOROU`);
if (problemas.length) {
    console.log('\nAS QUE PRECISAM DE CONSERTO:');
    for (const p of problemas) console.log(`  [${p.v}] ${p.abrev}: ${JSON.stringify(p.depois)}`);
}
await browser.close();
