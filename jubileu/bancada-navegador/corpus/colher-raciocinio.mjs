// ── COLHER PADRÃO DE PENSAMENTO, SEM BAIXAR 64 GiB ───────────────────────
//
// Decisão do dono do jogo: ensinar um modelo pequeno a pensar MUITO usando
// traços de raciocínio prontos, e só depois pôr a lore do jogo por cima.
//
// O corpus público tem 63,9 GiB num jsonl só. Este arquivo lê por FAIXAS de
// bytes e para quando junta o que precisa — nunca há 64 GiB em disco.
//
// ── POR QUE FILTRAR, E NÃO PEGAR OS PRIMEIROS N ──────────────────────────
//
// Um modelo de 135M tem ~119M de parâmetros que computam. O que se treina nele
// é o que ele VIRA: não sobra capacidade para duas competências. O primeiro
// exemplo do corpus é uma função em VB.NET — pegar os primeiros N ensinaria a
// pensar sobre código, e a lore do jogo por cima seria verniz sobre um
// programador.
//
// O que interessa aqui é a FORMA do pensamento: enumerar o que foi afirmado,
// conferir contra o que se sabe, decidir, e PARAR. Então entram traços em
// prosa, sem blocos de código e sem fórmula, no comprimento que se quer
// ensinar.
//
//   QUANTOS=400 MIN_TOK=800 MAX_TOK=4000 node corpus/colher-raciocinio.mjs \
//     > corpus/raciocinio.jsonl
const FONTE = process.env.FONTE
    ?? 'https://huggingface.co/datasets/Qyrou/reasoning-corpus-4K-5M-v1/resolve/main/dataset.jsonl';
const QUANTOS = Number(process.env.QUANTOS ?? 400);
const MIN_TOK = Number(process.env.MIN_TOK ?? 800);
const MAX_TOK = Number(process.env.MAX_TOK ?? 4000);
const FAIXA = Number(process.env.FAIXA ?? 8_000_000);
const SALTO = Number(process.env.SALTO ?? 400_000_000);

// Código e matemática são o grosso do corpus e são o que a gente NÃO quer:
// eles ensinariam o modelo a raciocinar sobre sintaxe e número.
const TEM_CODIGO = /```|\bdef \w+\(|\bfunction \w+\(|#include|\bimport \b|\bclass \w+[:({]/;
const TEM_FORMULA = /\$\$|\\frac|\\begin\{|\\sum|\\int|\^\{|_\{/;

const escolhidos = [];
let lidas = 0, semTraco = 0, porCodigo = 0, porTamanho = 0, faixas = 0;

// Saltos grandes entre as faixas: linhas vizinhas num corpus assim costumam
// vir do mesmo lote de geração e do mesmo assunto. Amostrar espalhado dá
// variedade que ler o começo não dá.
for (let inicio = 0; escolhidos.length < QUANTOS && faixas < 40; inicio += SALTO) {
    faixas += 1;
    const r = await fetch(FONTE, { headers: { Range: `bytes=${inicio}-${inicio + FAIXA - 1}` } });
    if (!r.ok) { console.error(`  faixa em ${inicio}: HTTP ${r.status}`); continue; }
    const texto = await r.text();
    // A primeira e a última linha da faixa vêm partidas ao meio.
    for (const linha of texto.split('\n').slice(1, -1)) {
        if (escolhidos.length >= QUANTOS) break;
        let d;
        try { d = JSON.parse(linha); } catch { continue; }
        lidas += 1;
        const traco = String(d.thought_trace ?? '');
        if (traco.length < 200) { semTraco += 1; continue; }
        const tok = Number(d.tok_len ?? 0);
        if (tok < MIN_TOK || tok > MAX_TOK) { porTamanho += 1; continue; }
        const tudo = `${d.user}\n${traco}\n${d.assistant}`;
        if (TEM_CODIGO.test(tudo) || TEM_FORMULA.test(tudo)) { porCodigo += 1; continue; }
        escolhidos.push({ user: String(d.user), pensou: traco, resposta: String(d.assistant), tok });
    }
    console.error(`  faixa ${faixas} · ${escolhidos.length}/${QUANTOS} colhidos de ${lidas} lidas`);
}

for (const e of escolhidos) console.log(JSON.stringify(e));
const media = escolhidos.reduce((a, e) => a + e.tok, 0) / Math.max(1, escolhidos.length);
console.error(`\n  ${escolhidos.length} traços · média ${media.toFixed(0)} tokens`);
console.error(`  descartados: ${porCodigo} por código ou fórmula · ${porTamanho} por tamanho · ${semTraco} sem traço`);
