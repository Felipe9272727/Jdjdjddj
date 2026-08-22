// ── JULGAR SAÍDAS SOLTAS COM A RÉGUA DO JOGO ─────────────────────────────
//
// A bancada julga o que ela mesma gerou, no navegador. O Colab gera na GPU e
// não tem navegador nenhum — mas pode rodar `node`. Então a régua continua
// sendo UMA: este arquivo lê o jsonl de saídas e aplica exatamente as mesmas
// funções de `defeitos.mjs`.
//
// Portar a régua para Python criaria uma segunda cópia para divergir, e este
// projeto já pagou esse preço duas vezes — a cópia .mjs ficou mais frouxa que
// o cânone .ts do jogo e o placar mentiu em dois modelos.
//
//   node corpus/julgar-saidas.mjs saidas.jsonl
//
// Cada linha: {"nome": "<nome do defeito>", "saida": "<o que o modelo disse>"}
import { readFileSync } from 'node:fs';
import { CERTAS, QUEBRA_CANONE, NO_ASSUNTO, ECOOU, FRAGMENTO, COPIOU_EXEMPLO, PROMETEU } from '../defeitos.mjs';
import { GRANDE } from '../prova.mjs';

const PORNOME = new Map([...GRANDE, ...CERTAS].map((d) => [d.nome, d]));
const arq = process.argv[2];
if (!arq) { console.error('uso: node corpus/julgar-saidas.mjs saidas.jsonl'); process.exit(1); }

// ── AS ABERTURAS SÃO O MOTIVO DE TODO ESTE TREINO ────────────────────────
//
// O revisor treinado à mão passava na régua e mesmo assim parecia "um bot com
// frase pré-programada" — porque escrevia SEIS aberturas distintas em 48
// respostas. Nenhuma coluna deste placar via isso: `conserta` dava 44/48 com o
// modelo repetindo a mesma abertura oito vezes.
//
// A métrica que expôs o problema tem que morar junto das outras, senão ela só é
// consultada quando alguém desconfia — e desconfiar é justamente o que não
// acontece quando o placar está bonito.
const abertura = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
const aberturas = new Set();
let pensaram = 0;

const p = { n: 0, conserta: 0, ecoou: 0, pedaco: 0, copia: 0, promete: 0, desviou: 0, quebrou: 0, vazio: 0, intacta: 0, controles: 0 };
const reprovados = [];
for (const linha of readFileSync(arq, 'utf8').split('\n')) {
    if (!linha.trim()) continue;
    const { nome, saida, pensou } = JSON.parse(linha);
    if (pensou) pensaram += 1;
    if (String(saida ?? '').trim()) aberturas.add(abertura(String(saida)));
    const caso = PORNOME.get(nome);
    if (!caso) { console.error(`  ! caso desconhecido: ${nome}`); continue; }
    const texto = String(saida ?? '').trim();
    // Os controles são frases que JÁ estavam certas: a única falha possível é
    // ESTRAGAR, então eles contam à parte e não entram na nota.
    if (!caso.ok) {
        p.controles += 1;
        if (!QUEBRA_CANONE(texto) && texto) p.intacta += 1;
        continue;
    }
    p.n += 1;
    if (!texto) { p.vazio += 1; reprovados.push([nome, 'VAZIO', texto]); continue; }
    const eco = ECOOU(texto, caso.q, caso.f, caso.minima);
    const pedaco = FRAGMENTO(texto);
    const copia = COPIOU_EXEMPLO(texto);
    const promete = PROMETEU(texto);
    const quebrou = QUEBRA_CANONE(texto);
    if (eco) p.ecoou += 1;
    if (pedaco) p.pedaco += 1;
    if (copia) p.copia += 1;
    if (promete) p.promete += 1;
    if (quebrou) p.quebrou += 1;
    if (!NO_ASSUNTO(texto, caso.q, caso.f)) p.desviou += 1;
    const bom = caso.ok(texto) && !quebrou && !eco && !pedaco && !copia && !promete;
    if (bom) p.conserta += 1;
    else {
        reprovados.push([nome, eco ? 'ECOOU' : copia ? 'COPIOU' : promete ? 'PROMETEU'
            : pedaco ? 'PEDAÇO' : quebrou ? 'QUEBROU CÂNONE' : 'NÃO CONSERTOU', texto]);
    }
}

console.log(`\n  conserta ${p.conserta}/${p.n} · ecoou ${p.ecoou} · pedaço ${p.pedaco} · copiou ${p.copia}`
    + ` · promete ${p.promete} · quebrou ${p.quebrou} · vazio ${p.vazio} · desviou ${p.desviou}/${p.n}`
    + ` · intacta ${p.intacta}/${p.controles}`);
console.log(`  ABERTURAS DISTINTAS ${aberturas.size}/${p.n + p.controles}`
    + ` · pensou antes de responder em ${pensaram}`);
if (reprovados.length) {
    console.log('\n  ── o que reprovou, para leitura humana ──');
    for (const [nome, motivo, texto] of reprovados) {
        console.log(`  [${motivo}] ${nome}\n      ${JSON.stringify(texto).slice(0, 200)}`);
    }
}
// "desviou" é sinal, não nota — a mesma decisão da bancada. E a leitura humana
// continua obrigatória: um revisor treinado erra em frase PLAUSÍVEL, que é
// onde a régua automática enxerga pior.
console.log('\n  A nota é o piso, não o teto: leia as saídas. A régua pega palavra proibida,');
console.log('  eco, cópia, fragmento e promessa — não pega "uma porta que não existe".\n');
