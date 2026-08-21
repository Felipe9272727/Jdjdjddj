// ── RE-JULGAR O QUE JÁ FOI MEDIDO, COM A RÉGUA CONSERTADA ─────────────────
//
// A bancada guarda a saída de cada modelo no log. Quando a RÉGUA muda — e ela
// mudou três vezes neste projeto, sempre porque estava premiando lixo — dá para
// re-julgar tudo que já rodou sem gastar um segundo de CPU e sem baixar nada.
//
// Isso importa mais do que parece: a alternativa é comparar um placar novo com
// placares antigos calculados por outra régua, que é como eu já elegi o Llama.
//
// Uso:  node re-julgar.mjs log1.txt log2.txt ...
//
// RESSALVA QUE O LOG IMPÕE: as saídas são gravadas com `.slice(0, 105)`. Uma
// resposta truncada em 105 caracteres não pode ser julgada quanto a "fechou a
// frase", e sai contada à parte em vez de virar nota.
import { readFileSync } from 'node:fs';
import { DEFEITOS, CERTAS, QUEBRA_CANONE, NO_ASSUNTO, ECOOU, FRAGMENTO, COPIOU_EXEMPLO, PROMETEU } from './defeitos.mjs';

const PORNOME = new Map(DEFEITOS.map((d) => [d.nome, d]));

const linhas = process.argv.slice(2).flatMap((f) => readFileSync(f, 'utf8').split('\n'));

let modelo = null;
const placar = new Map();
const guardar = (rot) => {
    if (!placar.has(rot)) {
        placar.set(rot, { rot, n: 0, conserta: 0, ecoou: 0, fragmento: 0, copias: 0, prometeu: 0, desviou: 0, quebrou: 0, vazio: 0, truncado: 0 });
    }
    return placar.get(rot);
};

for (let i = 0; i < linhas.length; i += 1) {
    const l = linhas[i];
    const cab = l.match(/^████ (.+?) — carga/);
    if (cab) { modelo = cab[1]; guardar(modelo); continue; }
    if (!modelo) continue;
    // A linha do veredicto traz o nome do defeito no fim; a seguinte traz a saída.
    const m = l.match(/^\s+[\d.]+s\s+ler .*?(✓|✗✗ VAZIO|✗✗ ESTRAGOU|✗ ECOOU|✗ PEDAÇO|✗ COPIOU O EXEMPLO|✗ PROMETEU|✗ não consertou|✗ QUEBROU OUTRA REGRA)(?: \?assunto)?\s+(.+)$/);
    if (!m) continue;
    const caso = PORNOME.get(m[2].trim());
    // O selo `✗ COPIOU O EXEMPLO` já era emitido pela bancada e NÃO estava
    // nesta alternância: todo caso de cópia sumia calado do re-julgamento,
    // exatamente o acidente que o comentário abaixo manda evitar.
    // Um defeito no log que não existe mais em `defeitos.mjs` é ruído de uma
    // régua antiga, e some do placar. Já um SELO novo que o parser não conhece
    // faria o caso sumir calado — por isso os selos entram na alternância
    // acima, e não num `.*`.
    if (!caso) continue;
    const bruto = (linhas[i + 1] ?? '').trim();
    let saida = '';
    try { saida = JSON.parse(bruto); } catch { continue; }
    const p = guardar(modelo);
    p.n += 1;
    if (saida.length >= 240) p.truncado += 1;
    if (!saida) { p.vazio += 1; continue; }
    const ecoou = ECOOU(saida, caso.q, caso.f, caso.minima);
    const sumiu = caso.ok(saida);
    const limpo = !QUEBRA_CANONE(saida);
    const fragmento = FRAGMENTO(saida);
    const copiou = COPIOU_EXEMPLO(saida);
    if (copiou) p.copias += 1;
    const prometeu = PROMETEU(saida);
    if (prometeu) p.prometeu += 1;
    if (ecoou) p.ecoou += 1;
    if (fragmento) p.fragmento += 1;
    if (!NO_ASSUNTO(saida, caso.q, caso.f)) p.desviou += 1;
    if (!limpo) p.quebrou += 1;
    // A regra nova: ecoar não é consertar, mesmo que o defeito "suma".
    if (sumiu && limpo && !ecoou && !fragmento && !copiou && !prometeu) p.conserta += 1;
}

console.log(`\n${'═'.repeat(80)}`);
console.log(`  RE-JULGADO com a régua que reprova eco (${CERTAS.length} controles não entram aqui)`);
console.log(`  candidato                    conserta  ECOOU  pedaco  copiou  promete  desviou  quebrou  vazio`);
for (const p of placar.values()) {
    if (!p.n) continue;
    console.log(`  ${p.rot.padEnd(28)} ${String(p.conserta + '/' + p.n).padStart(7)}`
        + `${String(p.ecoou).padStart(7)}`
        + `${String(p.fragmento).padStart(8)}`
        + `${String(p.copias).padStart(8)}`
        + `${String(p.prometeu).padStart(9)}`
        + `${String(p.desviou).padStart(9)}`
        + `${String(p.quebrou).padStart(9)}`
        + `${String(p.vazio).padStart(7)}`
        + `${String(p.truncado).padStart(8)}`);
}
console.log(`\n  "ECOOU" = devolveu a pergunta do jogador ou a frase original, com 80% ou mais`);
console.log(`  das palavras em comum. Não é conserto, e a régua antiga contava como acerto.`);
console.log(`  "pedaco" = não fechou período e tem menos de 8 palavras — o defeito some`);
console.log(`  porque a frase some. Mesma fraude do eco, por outro caminho.`);
console.log(`  "promete" = aceitou a tarefa em vez de fazer ("Okay, I understand. I will do`);
console.log(`  my best to provide a corrected response."). Não quebra cânone, não ecoa, não`);
console.log(`  é fragmento — e não é fala do Nilo. Só aparece em modelo pequeno.`);
console.log(`  "(240ch)" = saídas cortadas pelo log; o texto existe, o julgamento é parcial.`);
