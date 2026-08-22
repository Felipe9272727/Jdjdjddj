// ── MAIS PERGUNTAS DE JOGADOR, SEM ENCOSTAR NA PROVA ─────────────────────
//
// O corpus tem 65 perguntas escritas à mão. Com 300 casos, cada uma volta 4,6
// vezes com uma regra diferente sorteada — e a pergunta é a metade do par que
// mais varia o defeito. Enquanto ela recicla, o corpus cresce em quantidade e
// não em cobertura, que é o oposto do que este treino precisa: o colapso das
// seis aberturas foi de repetição, não de volume.
//
// Então quem escreve as perguntas novas é o professor, e o portão é duplo:
//
//   1. NENHUMA pode bater com a prova (os 24 casos + os 3 controles). Treinar
//      na prova é o jeito mais rápido de fazer o placar mentir, e este projeto
//      já quase pagou isso hoje — as 141 frases erradas reais colhidas dos logs
//      foram descartadas porque as 6 perguntas delas eram 6 de 6 da prova.
//   2. Nenhuma repetida, nem das 65 nem entre si, comparando sem pontuação e
//      sem maiúscula.
//
//   API_KEY=... MODELO=… QUANTAS=200 node corpus/mais-perguntas.mjs \
//     > corpus/perguntas-geradas.json
import { PERGUNTAS } from './perguntas.mjs';
import { PERSONA } from './enunciado.mjs';
import { GRANDE } from '../prova.mjs';
import { CERTAS } from '../defeitos.mjs';

const API_URL = process.env.API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
const API_KEY = process.env.API_KEY ?? '';
const MODELO = process.env.MODELO ?? '';
const QUANTAS = Number(process.env.QUANTAS ?? 200);
const POR_VEZ = 20;

const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const DA_PROVA = new Set([...GRANDE, ...CERTAS].map((d) => norm(d.q)));
const vistas = new Set(PERGUNTAS.map(norm));
const novas = [];
const dormir = (ms) => new Promise((o) => setTimeout(o, ms));

let daProva = 0, repetidas = 0, voltas = 0;
while (novas.length < QUANTAS && voltas < 60) {
    voltas += 1;
    const amostra = [...PERGUNTAS].sort(() => Math.random() - 0.5).slice(0, 8);
    const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
            model: MODELO, temperature: 1.0, max_tokens: 900,
            messages: [
                { role: 'system', content: `You write dialogue for a horror game. ${PERSONA}` },
                { role: 'user', content:
`A player is typing messages to Nilo. Write ${POR_VEZ} DIFFERENT things a player might type.

Existing ones, so you do not repeat them:
${amostra.map((q) => `- ${q}`).join('\n')}

Vary them hard: questions and statements, one word and one paragraph, polite and rude, about the room, about him, about the elevator, about nothing. Some should be typos or lowercase. Write one per line, no numbering, no quotes.` },
            ],
        }),
    });
    if (r.status === 429 || r.status === 503) { await dormir(4000); continue; }
    if (!r.ok) { console.error(`  ‹${r.status}› ${(await r.text()).slice(0, 90)}`); break; }
    const m = (await r.json())?.choices?.[0]?.message ?? {};
    const texto = String(m.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
    for (const bruta of texto.split('\n')) {
        const q = bruta.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^\s*["“](.*)["”]\s*$/, '$1').trim();
        if (q.length < 2 || q.length > 200) continue;
        const n = norm(q);
        if (DA_PROVA.has(n)) { daProva += 1; continue; }
        if (vistas.has(n)) { repetidas += 1; continue; }
        vistas.add(n);
        novas.push(q);
    }
    console.error(`  volta ${voltas}: ${novas.length}/${QUANTAS} · ${daProva} da prova · ${repetidas} repetidas`);
    await dormir(1500);
}
console.log(JSON.stringify(novas.slice(0, QUANTAS), null, 1));
console.error(`\n  ${novas.length} perguntas novas · ${daProva} descartadas por serem da prova · ${repetidas} repetidas`);
