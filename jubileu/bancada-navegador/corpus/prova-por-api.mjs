// ── A MESMA PROVA DO JOGO, NUM MODELO QUE MORA NUMA API ──────────────────
//
// Serve para uma pergunta que só se responde com número: o aluno de 0,8B
// precisa ficar "muito mais capaz que os da faixa dele" e encostar num 4/5B.
// Sem medir um 4B na MESMA prova, "nível de 4B" é palpite. Aqui o modelo de
// fora faz os 24 casos do jogo, com o mesmo enunciado, e a saída sai no
// formato que `julgar-saidas.mjs` já sabe julgar — a régua continua sendo uma.
//
//   API_KEY=... MODELO=… node corpus/prova-por-api.mjs > saidas.jsonl
import { PERSONA, enunciado } from './enunciado.mjs';
import { GRANDE } from '../prova.mjs';
import { CERTAS } from '../defeitos.mjs';

const API_URL = process.env.API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
const API_KEY = process.env.API_KEY ?? '';
const MODELO = process.env.MODELO ?? '';
const dormir = (ms) => new Promise((o) => setTimeout(o, ms));
const UMA = (t) => {
    const l = String(t).replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim().split('\n').filter((x) => x.trim())[0] ?? '';
    const m = /^[\s\S]*?[.!?…]["”]?/.exec(l.trim());
    return (m ? m[0] : l).trim();
};

for (const caso of [...GRANDE, ...CERTAS]) {
    let saida = '';
    for (let t = 0; t < 6 && !saida; t += 1) {
        const r = await fetch(API_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({
                model: MODELO, temperature: 0, max_tokens: 700,
                messages: [
                    { role: 'system', content: PERSONA },
                    { role: 'user', content: enunciado(caso.q, caso.f, caso.porque ?? '') },
                ],
            }),
        });
        if (r.status === 429 || r.status === 503) { await dormir(2500 * (t + 1)); continue; }
        if (!r.ok) { console.error(`  ‹${r.status}› ${(await r.text()).slice(0, 90)}`); break; }
        const m = (await r.json())?.choices?.[0]?.message ?? {};
        // O raciocínio nativo nunca é a resposta: julgar o modelo pelo que ele
        // pensou foi o buraco que zerou um candidato inteiro nesta caçada.
        saida = UMA(String(m.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, ''));
    }
    console.log(JSON.stringify({ nome: caso.nome, saida }));
    console.error(`  ${caso.nome}: ${JSON.stringify(saida).slice(0, 90)}`);
    await dormir(1200);
}
