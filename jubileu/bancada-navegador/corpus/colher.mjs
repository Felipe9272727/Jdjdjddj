// ── COLHER MATÉRIA-PRIMA DOS LOGS DA BANCADA ─────────────────────────────
//
// Frase ERRADA é o insumo abundante desta caçada: vinte e poucos modelos já
// produziram centenas delas, cada uma com o veredito do juiz ao lado, e tudo
// isso estava sendo jogado fora depois de virar uma linha de placar.
//
// Este script varre os logs e devolve as saídas REPROVADAS como matéria-prima
// de treino — a distribuição verdadeira dos erros, que nenhuma invenção minha
// reproduz. O que ele NÃO faz é inventar o alvo: a frase certa continua sendo
// escrita à mão, porque é ela que o modelo vai imitar.
//
//   node corpus/colher.mjs ../../scratchpad/*.log > corpus/materia-prima.jsonl
//
// A saída é jsonl com {q, f, defeito, veredito, modelo} — pronto para virar
// trio assim que alguém escrever a `certa`.
import { readFileSync } from 'node:fs';
import { DEFEITOS, QUEBRA_CANONE, PROMETEU, ECOOU, FRAGMENTO, COPIOU_EXEMPLO } from '../defeitos.mjs';

const PORNOME = new Map(DEFEITOS.map((d) => [d.nome, d]));
const SELOS = '✓|✗✗ VAZIO|✗✗ ESTRAGOU|✗ ECOOU|✗ PEDAÇO|✗ COPIOU O EXEMPLO|✗ PROMETEU|✗ não consertou|✗ QUEBROU OUTRA REGRA';

const vistos = new Set();
let modelo = '?', n = 0;
for (const arq of process.argv.slice(2)) {
    const linhas = readFileSync(arq, 'utf8').split('\n');
    for (let i = 0; i < linhas.length; i += 1) {
        const cab = linhas[i].match(/^████ (.+?) —/);
        if (cab) { modelo = cab[1]; continue; }
        const m = linhas[i].match(new RegExp(`^\\s+[\\d.]+s\\s+ler .*?(${SELOS})(?: \\?assunto)?\\s+(.+)$`));
        if (!m) continue;
        const caso = PORNOME.get(m[2].trim());
        if (!caso) continue;
        let saida = '';
        try { saida = JSON.parse((linhas[i + 1] ?? '').trim()); } catch { continue; }
        if (!saida || saida.length < 12) continue;
        // Só interessa o que REPROVOU: o que passou já é o comportamento certo,
        // e treinar em cima do que já está certo não ensina nada.
        const ruim = QUEBRA_CANONE(saida) || PROMETEU(saida) || FRAGMENTO(saida)
            || COPIOU_EXEMPLO(saida) || ECOOU(saida, caso.q, caso.f, caso.minima) || !caso.ok(saida);
        if (!ruim) continue;
        const chave = saida.toLowerCase().replace(/\s+/g, ' ').trim();
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        console.log(JSON.stringify({
            q: caso.q, f: saida, defeito: caso.nome, veredito: m[1], modelo,
            // O que cada trava disse, para quem for escrever a `certa` saber o
            // que precisa mudar sem ter que reler a régua.
            travas: {
                canone: QUEBRA_CANONE(saida), promete: PROMETEU(saida), pedaco: FRAGMENTO(saida),
                copia: COPIOU_EXEMPLO(saida), eco: ECOOU(saida, caso.q, caso.f, caso.minima),
                naoConsertou: !caso.ok(saida),
            },
        }));
        n += 1;
    }
}
console.error(`\n  ${n} frases erradas colhidas, sem repetição — matéria-prima para virar trio.\n`);
