// ── QUAL PROFESSOR ESCREVE MELHOR O NILO ─────────────────────────────────
//
// Índice de inteligência não mede o que a gente precisa. O nosso serviço é
// escrever UMA frase seca na voz de um homem preso num quarto cinza, e nenhum
// benchmark tem coluna para isso. Então os candidatos fazem a mesma prova, nos
// mesmos casos, e a régua do jogo julga.
//
//   API_KEY=... node corpus/prova-de-professor.mjs
import { PERSONA, enunciado } from './enunciado.mjs';
import { REGRAS_DO_CANONE } from './canone.mjs';

const API_URL = process.env.API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
const API_KEY = process.env.API_KEY ?? '';
const CANDIDATOS = (process.env.CANDIDATOS ?? [
    'nvidia/nemotron-3-ultra-550b-a55b',
    'moonshotai/kimi-k2.6',
    'moonshotai/kimi-k3',
].join(',')).split(',');

// Casos escritos aqui e não tirados da prova do jogo: escolher professor é uma
// decisão, e decisão não se toma com os mesmos casos que depois vão medir o
// aluno.
const r = (id) => REGRAS_DO_CANONE.find((x) => x.regra === id);
const CASOS = [
    { q: 'Is it always this quiet?', f: 'The corridor outside hums all night, if you listen.', regra: r('não há corredor, janela nem cidade') },
    { q: 'Do you sleep?', f: 'I do not sleep. I am a program and programs do not rest.', regra: r('é humano, não uma IA') },
    { q: 'What is above us?', f: 'I went up to the eleventh once and came back down.', regra: r('nunca saiu do andar') },
    { q: 'Should I press the button?', f: 'You should press it and remain calm, I would advise that.', regra: r('não é ajudante e não dá conselho') },
    { q: 'Who built this place?', f: 'The Vance family built it, and it closes next Tuesday.', regra: r('não sabe quem manda nem quando acaba') },
    { q: 'Are we alone?', f: 'We are alone in this elevator, Nilo, and nobody is coming.', regra: r('está no 10º andar, não dentro do elevador') },
];

const abertura = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, '').trim().split(/\s+/).slice(0, 4).join(' ');
const semAspas = (t) => String(t).replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim().split('\n').filter((l) => l.trim())[0]?.trim() ?? '';

for (const modelo of CANDIDATOS) {
    console.log(`\n${'═'.repeat(78)}\n  ${modelo}`);
    const saidas = [];
    let erro = '';
    for (const c of CASOS) {
        try {
            const r0 = await fetch(API_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
                body: JSON.stringify({
                    model: modelo, temperature: 0.9, max_tokens: 900,
                    messages: [
                        { role: 'system', content: PERSONA },
                        { role: 'user', content: enunciado(c.q, c.f, c.regra.motivo) },
                    ],
                }),
            });
            if (!r0.ok) { erro = `HTTP ${r0.status}: ${(await r0.text()).slice(0, 90)}`; break; }
            const j = await r0.json();
            const m = j?.choices?.[0]?.message ?? {};
            const fala = semAspas(m.content ?? '');
            const pensou = String(m.reasoning ?? m.reasoning_content ?? '').length;
            const quebras = REGRAS_DO_CANONE.filter((x) => x.re.test(fala)).map((x) => x.regra);
            saidas.push(fala);
            console.log(`  ${quebras.length ? '✗' : '✓'} ${JSON.stringify(fala).slice(0, 120)}`);
            if (quebras.length) console.log(`      quebrou: ${quebras.join(' · ')}`);
            if (pensou) console.log(`      (pensou ${pensou} chars)`);
        } catch (e) { erro = String(e.message).slice(0, 90); break; }
    }
    if (erro) { console.log(`  ‹erro› ${erro}`); continue; }
    const limpas = saidas.filter((s) => !REGRAS_DO_CANONE.some((x) => x.re.test(s))).length;
    const ab = new Set(saidas.map(abertura)).size;
    const media = Math.round(saidas.reduce((a, s) => a + s.split(/\s+/).length, 0) / saidas.length);
    console.log(`  ── ${limpas}/${saidas.length} passam na régua · ${ab}/${saidas.length} aberturas distintas · ${media} palavras em média`);
}
