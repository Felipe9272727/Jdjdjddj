// ── JUNTAR AS PARTES DA PRODUÇÃO NUM CORPUS SÓ ───────────────────────────
//
// A produção foi reiniciada três vezes hoje, cada consertando um defeito
// diferente do gerador, e cada reinício escreveu uma parte. As partes valem:
// o que quebrou foram o professor, o marca-passo e o bloco de pensamento —
// nunca a verificação do par. Mas juntar arquivo com `cat` traz dois riscos
// que este arquivo fecha:
//
//   1. FALA REPETIDA. O teto por abertura só vale dentro de uma execução;
//      entre partes, nada impede a mesma frase entrar duas vezes.
//   2. TETO POR ABERTURA FURADO. A métrica que expôs o colapso (seis aberturas
//      distintas em 48 respostas) tem que valer no corpus INTEIRO, não por
//      pedaço, senão ela volta a mentir.
//
//   node corpus/juntar.mjs corpus/destilado-p*.jsonl > corpus/destilado.jsonl
import { readFileSync } from 'node:fs';

const TETO_ABERTURA = Number(process.env.TETO_ABERTURA ?? 3);
const semPensamento = (t) => t.replace(/^<think>[\s\S]*?<\/think>\s*/, '').trim();
const abertura = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, '').trim().split(/\s+/).slice(0, 4).join(' ');

const vistas = new Set();
const porAbertura = new Map();
let lidas = 0, repetida = 0, teto = 0, semBloco = 0, escritas = 0;

for (const arq of process.argv.slice(2)) {
    for (const linha of readFileSync(arq, 'utf8').split('\n')) {
        if (!linha.trim()) continue;
        lidas += 1;
        const d = JSON.parse(linha);
        const alvo = d.messages.at(-1).content;
        if (!alvo.startsWith('<think>')) { semBloco += 1; continue; }
        const fala = semPensamento(alvo);
        if (vistas.has(fala)) { repetida += 1; continue; }
        const ab = abertura(fala);
        if ((porAbertura.get(ab) ?? 0) >= TETO_ABERTURA) { teto += 1; continue; }
        vistas.add(fala);
        porAbertura.set(ab, (porAbertura.get(ab) ?? 0) + 1);
        console.log(JSON.stringify(d));
        escritas += 1;
    }
}
console.error(`  ${escritas} linhas de ${lidas} · ${porAbertura.size} aberturas distintas`);
console.error(`  cortadas: ${repetida} falas repetidas · ${teto} por teto de abertura · ${semBloco} sem bloco de pensamento`);
