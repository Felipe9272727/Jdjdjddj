// ── OS TRAÇOS COLHIDOS, NO FORMATO QUE O TREINO COME ─────────────────────
//
// O `colher-raciocinio.mjs` devolve {user, pensou, resposta}; o `treinar.py`
// espera {messages: [system, user, assistant]}. Este arquivo faz a ponte, e no
// caminho toma UMA decisão que muda o resultado da etapa seguinte.
//
// O traço vira `<think>…</think>` mais a resposta — exatamente o formato que o
// revisor do jogo usa. Assim a etapa A (aprender a pensar) e a etapa B (a lore
// do Nilo) falam a mesma língua, e o LoRA da lore não gasta capacidade
// convertendo um formato no outro: ele só troca o assunto.
//
// O sistema aqui é NEUTRO de propósito. Estes traços não são o Nilo — são
// quebra-cabeças de lógica de outro corpus — e pôr a persona dele por cima de
// conteúdo que não é dele ensinaria o modelo que o Nilo fala sobre modelos de
// visão computacional. A persona entra só na etapa B.
//
//   node corpus/raciocinio-para-treino.mjs raciocinio.jsonl > treino-etapa-a.jsonl
import { readFileSync } from 'node:fs';

const SISTEMA = 'Think through the problem inside <think></think>, then answer.';
const TETO_PENSAMENTO = Number(process.env.TETO_PENSAMENTO ?? 0);

let n = 0, cortados = 0;
for (const linha of readFileSync(process.argv[2], 'utf8').split('\n')) {
    if (!linha.trim()) continue;
    const d = JSON.parse(linha);
    let pensou = String(d.pensou).trim();
    if (TETO_PENSAMENTO && pensou.split(/\s+/).length > TETO_PENSAMENTO) {
        pensou = pensou.split(/\s+/).slice(0, TETO_PENSAMENTO).join(' ');
        cortados += 1;
    }
    console.log(JSON.stringify({
        messages: [
            { role: 'system', content: SISTEMA },
            { role: 'user', content: String(d.user).trim() },
            { role: 'assistant', content: `<think>${pensou}</think>\n${String(d.resposta).trim()}` },
        ],
    }));
    n += 1;
}
console.error(`  ${n} exemplos${cortados ? ` · ${cortados} pensamentos cortados` : ''}`);
