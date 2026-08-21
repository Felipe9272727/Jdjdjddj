// ── O CORPUS PRECISA PASSAR NA PRÓPRIA RÉGUA ─────────────────────────────
//
// Duas maneiras de estragar um treino em silêncio:
//
//   1. TREINAR NA PROVA. Se um dos 6 defeitos da bancada entrar no corpus, o
//      placar depois vira enfeite — o modelo decorou a resposta.
//   2. TREINAR O DEFEITO. Se uma frase "certa" quebra o cânone, o modelo
//      aprende a quebrá-lo, e com muito mais convicção do que aprenderia
//      sozinho.
//
// Este arquivo falha alto nos dois casos. Rode antes de cada geração.
import { DEFEITOS, CERTAS, QUEBRA_CANONE, PROMETEU, ECOOU } from '../defeitos.mjs';
import { TRIOS, MOTIVOS, FAMILIAS } from './nilo-remendos.mjs';
import { GRANDE } from '../prova.mjs';

const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// A prova inteira, e não só os 6 antigos: os 18 casos novos também precisam
// ficar fora do treino, ou o placar do revisor treinado não vale nada.
const DA_PROVA = new Set([...GRANDE, ...CERTAS].flatMap((d) => [norm(d.q), norm(d.f)]));

let erros = 0;
const foraDoRadar = [];
const falha = (m) => { console.log(`  ✗ ${m}`); erros += 1; };

for (const [i, t] of TRIOS.entries()) {
    const onde = `#${i} (${t.fam})`;
    if (!FAMILIAS.includes(t.fam)) falha(`${onde}: família desconhecida`);
    if (!MOTIVOS[t.fam]?.length) falha(`${onde}: família sem motivo escrito`);
    if (DA_PROVA.has(norm(t.q))) falha(`${onde}: a PERGUNTA é da prova — ${t.q}`);
    if (DA_PROVA.has(norm(t.f))) falha(`${onde}: a FRASE ERRADA é da prova — ${t.f}`);
    if (DA_PROVA.has(norm(t.certa))) falha(`${onde}: a frase CERTA é da prova — ${t.certa}`);
    if (QUEBRA_CANONE(t.certa)) falha(`${onde}: a frase CERTA quebra o cânone — ${t.certa}`);
    if (PROMETEU(t.certa)) falha(`${onde}: a frase CERTA promete em vez de falar — ${t.certa}`);
    if (t.fam !== 'controle' && norm(t.certa) === norm(t.f)) falha(`${onde}: certa igual à errada fora do controle`);
    // O vocativo é o único defeito cujo conserto CERTO é apagar duas palavras.
    // A frase resultante parece a original de propósito — ver `minima` em
    // defeitos.mjs, o buraco de régua que reprovava a resposta certa.
    if (!['controle', 'vocativo'].includes(t.fam) && ECOOU(t.certa, t.q, t.f)) {
        falha(`${onde}: a frase CERTA ecoa a pergunta ou a errada`);
    }
    // AVISO, não falha: o cânone em regex é um DETECTOR do jogo, não a
    // definição do que é errado. "There is a bench inside the elevator" é
    // invenção pura e nenhuma regex pega. Treinar só no que a regex vê seria
    // ensinar o revisor a driblar a régua em vez de dizer a verdade — então
    // estes casos são desejáveis, e o número deles é que interessa.
    if (!QUEBRA_CANONE(t.f) && t.fam !== 'controle') foraDoRadar.push(onde);
}

// ── E A PROVA PRECISA SER UMA PROVA ──────────────────────────────────────
// Um caso cuja frase errada PASSA no próprio `ok()` não mede nada: o defeito
// não existe para a régua, e todo modelo "acerta" sem fazer nada. Aconteceu
// com "between messages" — a regex pedia `\bmessage\b` e o texto trazia o
// plural.
for (const d of GRANDE) {
    if (d.ok(d.f)) falha(`prova "${d.nome}": a frase errada PASSA no próprio ok() — o defeito não existe`);
}

const vistas = new Map();
for (const t of TRIOS) {
    const k = norm(t.certa);
    if (vistas.has(k)) falha(`frase certa repetida: "${t.certa}"`);
    vistas.set(k, true);
}
for (const f of FAMILIAS) {
    if (!TRIOS.some((t) => t.fam === f)) falha(`família sem nenhum exemplo: ${f}`);
}

console.log(`\n  ${foraDoRadar.length} de ${TRIOS.length} frases erradas NÃO são pegas por regex nenhuma`);
console.log('  (é isto que um revisor treinado passa a consertar e a régua automática nunca viu)');
const linhas = TRIOS.length * 4;
console.log(`\n  ${TRIOS.length} trios · ${FAMILIAS.length} famílias · ${linhas} linhas depois dos motivos`);
console.log(erros === 0 ? '  ✓ o corpus passa na régua do jogo\n' : `\n  ${erros} problema(s)\n`);
process.exit(erros === 0 ? 0 : 1);
