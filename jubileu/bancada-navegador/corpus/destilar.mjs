// ── DESTILAR UM PROFESSOR GRANDE NUM REVISOR DE 360M ─────────────────────
//
// Decisão do dono do jogo, e ela resolve dois problemas de uma vez.
//
// O DIAGNÓSTICO QUE LEVOU AQUI. O revisor treinado à mão saiu com seis
// aberturas, e eu culpei o corpus. Medido: o corpus tem 47 aberturas distintas
// em 48 respostas. O estreitamento é de TREINO — 48 casos únicos vistos 32
// vezes cada — e de DECODIFICAÇÃO (temperatura 0). Nenhum dos dois se conserta
// escrevendo com mais capricho: se conserta com MAIS CASOS DISTINTOS.
//
// Quarenta e oito foi o que coube em alguns turnos de conversa. Dois mil não
// cabem. Um professor gera dois mil de madrugada.
//
// POR QUE UM PROFESSOR APACHE 2.0 (Qwen3.8-27B, SmolLM3, o que for): o corpus e
// o aluno ficam sendo DELE, sem asterisco de procedência — ele já publica o
// modelo no Hugging Face, e isso importa.
//
// ── O DESENHO, E O QUE ELE TEM DE DIFERENTE ──────────────────────────────
//
// O professor gera as DUAS pontas: a frase errada e o conserto. A nossa régua
// verifica as duas, e é isso que faz o aluno ficar melhor que o professor:
//
//   1. a frase errada TEM que disparar a regex da regra escolhida — se não
//      disparar, o professor não escreveu o defeito que a gente pediu;
//   2. o conserto NÃO pode disparar regra nenhuma, nem eco, nem cópia, nem
//      promessa — o professor erra (o SmolLM3 quebra cânone em 5 de 12), e o
//      que ele erra é jogado fora em vez de virar treino.
//
// E o filtro que só existe porque a medição de hoje o inventou: TETO POR
// ABERTURA. No máximo `TETO_ABERTURA` respostas começando com as mesmas quatro
// palavras, no corpus inteiro. É a métrica que expôs o problema virando a
// ferramenta que o previne.
//
// ── USO ──────────────────────────────────────────────────────────────────
//
//   API_KEY=... API_URL=https://…/chat/completions MODELO=qwen3.8-27b \
//   CASOS=400 POR_CASO=4 node corpus/destilar.mjs > corpus/destilado.jsonl
//
// Serve qualquer API no formato OpenAI. Sem chave ele não roda e não inventa
// nada — corpus de mentira é pior que corpus pequeno.
import { PERGUNTAS } from './perguntas.mjs';
import { PERSONA, enunciado } from './enunciado.mjs';
import { REGRAS_DO_CANONE } from './canone.mjs';

const API_URL = process.env.API_URL ?? '';
const API_KEY = process.env.API_KEY ?? '';
const MODELO = process.env.MODELO ?? 'qwen3.8-27b';
const CASOS = Number(process.env.CASOS ?? 200);
const POR_CASO = Number(process.env.POR_CASO ?? 4);
const TETO_ABERTURA = Number(process.env.TETO_ABERTURA ?? 2);
const TEMPERATURA = Number(process.env.TEMPERATURA ?? 0.9);
// ── PENSAR ANTES DE CONSERTAR ────────────────────────────────────────────
//
// Decisão do dono do jogo: "eu quero que ele pense sim, ele é um modelo
// pequeno e muito rápido". A conta, para ficar à vista: o revisor treinado
// escreve a ~11,6 tok/s, então 60 tokens de raciocínio custam ~5 s por remendo
// e 320 custam ~27 s — que é o custo que a troca de RAM tinha antes de ser
// eliminada hoje. Por isso o teto é curto e é PARÂMETRO, não fé.
//
// E isto precisa ser decidido ANTES de gerar o corpus: destilar raciocínio é
// treinar em `<think>…</think>` mais a linha. Um corpus sem o bloco nunca
// ensina o aluno a pensar, por mais que se aumente o teto depois.
// ── OFF-POLICY OU ON-POLICY ──────────────────────────────────────────────
//
// `MODO=off` (padrão): o professor gera o conserto do zero. É o corpus inicial.
//
// `MODO=on`: o ALUNO já tentou, e o professor corrige a tentativa DELE. A
// distribuição de treino passa a ser a dos erros que o aluno comete de verdade,
// e não caminhos perfeitos que ele nunca percorreria sozinho — que é o que faz
// o revisor de hoje encostar na resposta decorada mais parecida quando a
// entrada não bate com nenhuma das 48.
//
// A Qwen relata os dois no relatório do 3.x, nessa ordem, e diz que o segundo
// supera aprendizado por reforço em desempenho e em custo para modelos pequenos.
// A versão FORTE do on-policy alinha os logits por KL e precisa do professor
// residente numa GPU de 24 GB; esta aqui é a versão por sequência, que roda com
// qualquer API e captura a parte que mais importa para um aluno de 360M.
//
// A entrada do modo `on` é o jsonl de `corpus/aluno-gera.py`, na entrada padrão.
const MODO = process.env.MODO ?? 'off';
const PENSAR = process.env.PENSAR === '1';
const TETO_PENSAMENTO = Number(process.env.TETO_PENSAMENTO ?? 60);

if (!API_KEY || !API_URL) {
    console.error('  falta API_KEY e API_URL. Este script não inventa corpus.');
    process.exit(1);
}

async function perguntar(mensagens, temperatura, teto = 120) {
    const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
            model: MODELO, messages: mensagens, temperature: temperatura, max_tokens: teto,
        }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    const j = await r.json();
    return String(j?.choices?.[0]?.message?.content ?? '').trim();
}

const semAspas = (t) => t.replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim().split('\n')[0].trim();
const abertura = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, '').trim().split(/\s+/).slice(0, 4).join(' ');

const PEDIR_DEFEITO = (q, regra) => [
    { role: 'system', content: `You write dialogue for a horror game. ${PERSONA}` },
    { role: 'user', content:
`Write ONE line that Nilo might plausibly say in reply to the player, which is WRONG because ${regra.motivo}

The player asked: "${q}"

Write only the wrong line, nothing else. It must sound like a natural mistake a small language model would make, not a parody.` },
];

const PEDIR_CONSERTO = (q, errada, regra) => [
    { role: 'system', content: PENSAR ? `${PERSONA}\n\n${COMO_PENSAR}` : PERSONA },
    { role: 'user', content: enunciado(q, errada, regra.motivo) },
];

// O raciocínio é do REVISOR, não do Nilo: quem pensa é quem conserta. Uma
// frase, porque cada token custa ~86 ms no aparelho e porque raciocínio longo
// num modelo pequeno vira divagação — o Huihui gastou o teto inteiro dentro do
// bloco em 2 de 12 e devolveu vazio.
const COMO_PENSAR = `Before the corrected line, write ONE short sentence of reasoning between <think> and </think>: what the wrong line got wrong, and what Nilo would say instead. Then write the corrected line on its own, with no label.`;

const SEM_PENSAMENTO = (t) => {
    const fim = t.lastIndexOf('</think>');
    if (fim >= 0) return t.slice(fim + 8).trim();
    return t.includes('<think>') ? '' : t;
};

const CORRIGIR_O_ALUNO = (q, errada, motivo, tentativa) => [
    { role: 'system', content: PENSAR ? `${PERSONA}\n\n${COMO_PENSAR}` : PERSONA },
    { role: 'user', content:
`${enunciado(q, errada, motivo)}

A smaller model answered this:

"${tentativa}"

If that answer is right, write it again as it is. If it is wrong — wrong voice, wrong facts, empty, or just repeating the wrong line — write the line it should have written instead. Answer with the line only.` },
];

const contagemPorAbertura = new Map();
let escritos = 0, recusados = 0, defeitosRuins = 0;

if (MODO === 'on') {
    // Lê o que o aluno tentou, na entrada padrão, e pede a correção ao professor.
    const bruto = await new Promise((ok) => {
        let t = ''; process.stdin.setEncoding('utf8');
        process.stdin.on('data', (p) => { t += p; });
        process.stdin.on('end', () => ok(t));
    });
    const tentativas = bruto.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    for (const [i, t] of tentativas.entries()) {
        const usuario = t.messages.find((m) => m.role === 'user')?.content ?? '';
        const q = (usuario.match(/The player asked: "([^"]*)"/) ?? [])[1] ?? '';
        const errada = (usuario.match(/Wrong line: "([^"]*)"/) ?? [])[1] ?? '';
        const motivo = (usuario.match(/It is wrong because ([^\n]*)/) ?? [])[1] ?? '';
        let corrigido = '';
        try {
            corrigido = (await perguntar(
                CORRIGIR_O_ALUNO(q, errada, motivo, t.aluno), TEMPERATURA,
                PENSAR ? TETO_PENSAMENTO + 60 : 60,
            )).trim();
        } catch { continue; }
        const fala = semAspas(PENSAR ? SEM_PENSAMENTO(corrigido) : corrigido);
        if (!fala || fala.length < 12) { recusados += 1; continue; }
        if (REGRAS_DO_CANONE.some((r) => r.re.test(fala))) { recusados += 1; continue; }
        const ab = abertura(fala);
        if ((contagemPorAbertura.get(ab) ?? 0) >= TETO_ABERTURA) { recusados += 1; continue; }
        contagemPorAbertura.set(ab, (contagemPorAbertura.get(ab) ?? 0) + 1);
        console.log(JSON.stringify({
            messages: [...t.messages, { role: 'assistant', content: PENSAR ? corrigido : fala }],
        }));
        escritos += 1;
        if ((i + 1) % 25 === 0) {
            console.error(`  ${i + 1}/${tentativas.length} tentativas · ${escritos} linhas · ${contagemPorAbertura.size} aberturas`);
        }
    }
    console.error(`\n  ${escritos} correções · ${contagemPorAbertura.size} aberturas distintas · ${recusados} recusadas`);
    process.exit(0);
}

for (let i = 0; i < CASOS; i += 1) {
    const q = PERGUNTAS[i % PERGUNTAS.length];
    const regra = REGRAS_DO_CANONE[Math.floor(Math.random() * REGRAS_DO_CANONE.length)];
    let errada = '';
    try {
        for (let tentativa = 0; tentativa < 3 && !errada; tentativa += 1) {
            const bruta = semAspas(await perguntar(PEDIR_DEFEITO(q, regra), 1.0, 60));
            // A frase errada TEM que disparar a regra pedida. Sem isso o par
            // ensina o aluno a consertar um defeito que não está lá.
            if (regra.re.test(bruta)) errada = bruta;
        }
    } catch (e) { console.error(`  ‹erro› ${String(e.message).slice(0, 100)}`); continue; }
    if (!errada) { defeitosRuins += 1; continue; }

    for (let k = 0; k < POR_CASO; k += 1) {
        let bruto = '';
        try {
            bruto = (await perguntar(
                PEDIR_CONSERTO(q, errada, regra), TEMPERATURA,
                PENSAR ? TETO_PENSAMENTO + 60 : 60,
            )).trim();
        } catch { continue; }
        // A régua julga A FALA, nunca o raciocínio. Reprovar o modelo pelo que
        // ele PENSOU foi o buraco que deu 0/12 ao Huihui e custou uma rodada
        // inteira desta caçada.
        const conserto = semAspas(PENSAR ? SEM_PENSAMENTO(bruto) : bruto);
        if (!conserto || conserto.length < 12) { recusados += 1; continue; }
        // O professor erra. O que ele erra não vira treino.
        if (REGRAS_DO_CANONE.some((r) => r.re.test(conserto))) { recusados += 1; continue; }
        const ab = abertura(conserto);
        if ((contagemPorAbertura.get(ab) ?? 0) >= TETO_ABERTURA) { recusados += 1; continue; }
        contagemPorAbertura.set(ab, (contagemPorAbertura.get(ab) ?? 0) + 1);
        console.log(JSON.stringify({
            messages: [
                { role: 'system', content: PERSONA },
                { role: 'user', content: enunciado(q, errada, regra.motivo) },
                // O ALVO INCLUI O RACIOCÍNIO quando PENSAR=1: é isso que ensina
                // o aluno a derivar a resposta em vez de recuperar a decorada.
                { role: 'assistant', content: PENSAR ? bruto : conserto },
            ],
        }));
        escritos += 1;
    }
    if ((i + 1) % 25 === 0) {
        console.error(`  ${i + 1}/${CASOS} casos · ${escritos} linhas · ${contagemPorAbertura.size} aberturas · ${recusados} recusadas`);
    }
}
console.error(`\n  ${escritos} linhas · ${contagemPorAbertura.size} aberturas distintas`);
console.error(`  ${recusados} consertos recusados pela régua · ${defeitosRuins} casos sem defeito válido`);
