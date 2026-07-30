/**
 * A MEMÓRIA POR SIGNIFICADO ACERTA? — a prova que vem antes de tudo.
 *
 * A busca do cânone é por PALAVRA e acerta 2 de 12 perguntas naturais em
 * português (8 não recuperam fato NENHUM, 2 recuperam o errado). Quando nada é
 * recuperado, o 3B responde só com a persona — e inventa.
 *
 * Antes de instalar um segundo motor de inferência no jogo, esta sonda
 * responde a pergunta barata: o modelo de embedding escolhe o fato CERTO?
 * Roda em Node, fora do navegador, sem tocar no build.
 *
 * Resultado medido: 11/12, contra 2/12 da busca lexical.
 *
 * Uso:
 *   npm install @huggingface/transformers   (num diretório à parte)
 *   node tools/f10-memoria-prova.mjs
 *
 * `canon.json` sai de FLOOR10_CANON; o cabeçalho do script mostra como.
 */
import fs from 'node:fs';

const fatos = JSON.parse(fs.readFileSync(new URL('./canon.json', import.meta.url)));
const extrair = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small',
    { dtype: 'q8' });

const vetor = async (t) => {
    const r = await extrair(t, { pooling: 'mean', normalize: true });
    return Array.from(r.data);
};
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

for (const f of fatos) f.v = await vetor(`passage: ${f.fact}`);

// As MESMAS 12 perguntas com que medi a busca lexical (2/12).
const CASOS = [
    ['Você tem saudade de alguém?',           ['memory', 'past', 'personality']],
    ['Cê lembra de antes?',                   ['past', 'memory']],
    ['Como você veio parar aqui?',            ['past']],
    ['O que te trouxe pra cá?',               ['past']],
    ['Você já tentou ir embora?',             ['escape', 'elevator']],
    ['Dá pra fugir daqui?',                   ['escape']],
    ['Tem medo de quê?',                      ['personality', 'memory']],
    ['O que te assusta?',                     ['personality', 'memory']],
    ['Quem manda nesse lugar?',               ['hotel', 'owner-archivist']],
    ['Alguém construiu isso?',                ['hotel', 'owner-archivist']],
    ['Faz quanto tempo que você tá preso?',   ['floor10']],
    ['Você dorme?',                           ['floor10', 'memory']],
];

let ok = 0;
console.log('\n── BUSCA POR SIGNIFICADO ──');
for (const [q, aceitos] of CASOS) {
    const qv = await vetor(`query: ${q}`);
    const rank = fatos.map((f) => ({ id: f.id, s: cos(qv, f.v) })).sort((a, b) => b.s - a.s);
    const acertou = aceitos.includes(rank[0].id);
    if (acertou) ok += 1;
    console.log(`${acertou ? ' ✔' : ' ✘'} ${q.padEnd(38)} → ${rank[0].id.padEnd(16)}`
        + `${rank[0].s.toFixed(3)}   (2º: ${rank[1].id})`);
}
console.log(`\nacertos: ${ok}/${CASOS.length}   (busca lexical de hoje: 2/12)`);
