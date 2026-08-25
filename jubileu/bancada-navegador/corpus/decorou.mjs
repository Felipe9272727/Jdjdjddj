// ── ELE DECOROU, OU APRENDEU? ────────────────────────────────────────────
//
// A régua diz se a resposta presta. Ela não diz de ONDE a resposta veio — e um
// modelo que devolve o alvo de treino palavra por palavra tira nota alta sem
// ter aprendido nada que sirva para uma entrada nova. Foi assim que o revisor
// anterior passou com 44/48 e mesmo assim pareceu, nas palavras do dono do
// jogo, "um bot com frase pré-programada".
//
// Este arquivo julga saídas geradas a partir das PERGUNTAS DO PRÓPRIO CORPUS,
// e compara cada uma com o alvo que o treino ensinou:
//
//   IGUAL       devolveu o alvo exatamente — decorou aquela linha
//   QUASE       ≥80% das palavras de conteúdo em comum — decorou com verniz
//   PRÓPRIA     escreveu outra coisa — aprendeu a tarefa, não a lista
//
//   node corpus/decorou.mjs saidas-do-treino.jsonl corpus/destilado.jsonl
import { readFileSync } from 'node:fs';

const norma = (t) => String(t).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const semPensar = (t) => String(t).replace(/^<think>[\s\S]*?<\/think>\s*/, '').trim();
const VAZIAS = new Set(['this','that','with','from','they','them','have','been','just','only',
    'what','when','where','there','here','your','about','into','than','then','will','the','a','an',
    'and','or','but','is','are','was','were','it','its','of','to','in','on','for','i','you','he']);
const conteudo = (t) => new Set(norma(t).split(' ').filter((w) => w.length > 2 && !VAZIAS.has(w)));
const sobrepoe = (a, b) => {
    const A = conteudo(a), B = conteudo(b);
    if (!A.size) return 0;
    return [...A].filter((w) => B.has(w)).length / A.size;
};

const alvos = new Map();
for (const linha of readFileSync(process.argv[3], 'utf8').split('\n')) {
    if (!linha.trim()) continue;
    const m = JSON.parse(linha).messages;
    const q = (m[1].content.match(/The player asked: "([^"]*)"/) ?? [])[1] ?? '';
    const f = (m[1].content.match(/Wrong line: "([^"]*)"/) ?? [])[1] ?? '';
    (alvos.get(`${norma(q)}|${norma(f)}`) ?? alvos.set(`${norma(q)}|${norma(f)}`, []).get(`${norma(q)}|${norma(f)}`))
        .push(semPensar(m[2].content));
}

let n = 0, igual = 0, quase = 0, propria = 0;
const exemplos = [];
for (const linha of readFileSync(process.argv[2], 'utf8').split('\n')) {
    if (!linha.trim()) continue;
    const { chave, saida } = JSON.parse(linha);
    const meus = alvos.get(chave) ?? [];
    if (!meus.length) continue;
    n += 1;
    const dito = semPensar(saida);
    const melhor = Math.max(...meus.map((a) => sobrepoe(dito, a)));
    const exato = meus.some((a) => norma(a) === norma(dito));
    if (exato) { igual += 1; exemplos.push(['IGUAL', dito]); }
    else if (melhor >= 0.8) { quase += 1; exemplos.push(['QUASE', dito]); }
    else propria += 1;
}
console.log(`\n  ${n} perguntas do treino · IGUAL ${igual} · QUASE ${quase} · PRÓPRIA ${propria}`);
console.log(`  decorou ${(100 * (igual + quase) / Math.max(1, n)).toFixed(0)}% do que viu`);
for (const [selo, t] of exemplos.slice(0, 6)) console.log(`  [${selo}] ${JSON.stringify(t).slice(0, 110)}`);
