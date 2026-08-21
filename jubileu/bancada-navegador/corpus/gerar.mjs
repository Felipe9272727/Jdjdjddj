// ── DO CORPUS PARA O ARQUIVO DE TREINO ───────────────────────────────────
//
// Sai em jsonl de conversa ({messages:[system,user,assistant]}), que é o que
// o `transformers` e o `trl` comem sem adaptador.
//
// A DIVISÃO É POR TRIO, NÃO POR LINHA. Cada trio vira 4 linhas (uma por
// redação do motivo); se o corte fosse por linha, o mesmo alvo apareceria no
// treino E na aferição, e a aferição viraria enfeite. Este é o mesmo erro que
// "treinar na prova", só que disfarçado de aleatório.
import { writeFileSync } from 'node:fs';
import { TRIOS, MOTIVOS } from './nilo-remendos.mjs';
import { PERSONA, enunciado } from './enunciado.mjs';

const SEMENTE = Number(process.env.SEMENTE ?? 7);
let x = SEMENTE;
const sorte = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const embaralhado = [...TRIOS.keys()].sort(() => sorte() - 0.5);
const nAfere = Math.max(4, Math.round(TRIOS.length * 0.12));
const idAfere = new Set(embaralhado.slice(0, nAfere));

const linhas = (indices) => indices.flatMap((i) => {
    const t = TRIOS[i];
    return MOTIVOS[t.fam].map((porque) => ({
        messages: [
            { role: 'system', content: PERSONA },
            { role: 'user', content: enunciado(t.q, t.f, porque) },
            { role: 'assistant', content: t.certa },
        ],
        familia: t.fam,
    }));
});

const treino = linhas([...TRIOS.keys()].filter((i) => !idAfere.has(i)));
const afere = linhas([...idAfere]);
const escrever = (nome, rows) => {
    writeFileSync(new URL(nome, import.meta.url), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`  ${nome}: ${rows.length} linhas`);
};
escrever('treino.jsonl', treino);
escrever('afericao.jsonl', afere);
console.log(`\n  semente ${SEMENTE} · ${TRIOS.length} trios (${TRIOS.length - idAfere.size} treino / ${idAfere.size} aferição)`);
console.log('  a PROVA continua sendo a bancada, com os 6 defeitos que nunca entraram aqui.\n');
