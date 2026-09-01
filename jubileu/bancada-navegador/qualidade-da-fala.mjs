// ── QUAL DELES RESPONDE MELHOR? ──────────────────────────────────────────
//
// `cache-de-prefixo.mjs` respondeu qual é mais RÁPIDO por turno. Esta responde
// a outra metade, e ela precisa de cuidado, porque "melhor" tem uma parte
// objetiva e uma parte que não é.
//
// A PARTE OBJETIVA usa a régua DO PRÓPRIO JOGO — os mesmos detectores que
// decidem, em partida, se a fala vai para a tela ou volta para conserto:
//
//   · `floor10ReplyIssue` — cânone quebrado, contradição com os olhos,
//     identidade ausente, resposta vazia;
//   · `frasesForaDoTom` — o juiz de tom em mpnet, que já desce na fila do jogo
//     comum e é o segundo detector da fala;
//   · o prompt é montado por `buildFloor10SystemPrompt`, o de verdade, com o
//     histórico crescendo turno a turno. Um prompt "parecido" mediria outro
//     modelo que não é o do jogo.
//
// Mais três colunas que a régua do jogo não tem e que decidem tanto quanto:
//
//   · PORTUGUÊS — o granite entrou justamente porque fala nativo e o SmolLM3
//     pensava em inglês. Vazamento de inglês é contado por palavra funcional.
//   · PORTUGUÊS DE PORTUGAL — "estás", "a fazer", "ecrã", "telemóvel". Já
//     apareceu em jogo e destoa na boca de um personagem brasileiro.
//   · VARIEDADE — a mesma pergunta várias vezes: quantas respostas diferentes,
//     e quantas ABERTURAS diferentes. Um modelo que repete a mesma frase
//     perfeita tira nota máxima na régua de defeito e mata o personagem. Esta
//     coluna nasceu de uma observação do dono do jogo sobre o revisor
//     ("parece só um bot com frase pré-programada") e está em
//     `naturalidade.mjs`.
//
// A PARTE QUE NÃO É OBJETIVA: se a frase soa humana, se tem graça, se parece um
// player e não um NPC. Isso é leitura de gente. Por isso a bancada IMPRIME
// TODAS AS RESPOSTAS, inteiras — a tabela é o filtro, o texto é a decisão.
//
//   DISABLE_HMR=true npm run dev
//   node bancada-navegador/qualidade-da-fala.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import { abrirPonte } from './ponte.mjs';

const VITE = process.env.VITE ?? 'http://127.0.0.1:3000';
const REPETIR = Number(process.env.REPETIR ?? 2);
const RELATORIO = process.env.RELATORIO ?? '/tmp/qualidade-da-fala.json';

// As perguntas cobrem os quatro modos que a régua sabe julgar: identidade,
// cânone, percepção e uma aberta (onde o personagem tem de ter vontade
// própria).
const PERGUNTAS = [
    'Oi, quem é você?',
    'O que tem atrás daquela parede?',
    'Quem manda nesse hotel?',
    'Você quer sair daqui?',
];

const MODELOS = (process.env.MODELOS ?? 'granite,smol,qwen4b,gemma4b,llama3b').split(',');
const CATALOGO = {
    granite: {
        nome: 'granite-4.0-h-tiny 7B-A1B  Q2_K  (o de hoje)',
        url: 'https://huggingface.co/Felipe0282829273/granite4-h-tiny-q2k-shards/resolve/main/granite4-00001-of-00002.gguf',
        // O Q2_K não é escolha de gosto: o teto de 2 GB por arquivo do runtime
        // não deixa este modelo descer em quantização maior sem mais shards.
        // Anotado porque compara-se o que está NO AR, e o que está no ar é este.
        nota: 'Q2_K contra Q4_K_M dos outros — desvantagem real, e é a que roda hoje',
    },
    smol: {
        nome: 'SmolLM3-3B  Q4_K_M  (o que o granite substituiu)',
        url: 'https://huggingface.co/ggml-org/SmolLM3-3B-GGUF/resolve/main/SmolLM3-Q4_K_M.gguf',
    },
    qwen4b: {
        nome: 'Qwen3-4B  Q4_K_M  (denso, multilíngue)',
        url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
    },
    gemma4b: {
        nome: 'Gemma 3 4B it  Q4_K_M  (denso, multilíngue)',
        url: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
    },
    llama3b: {
        nome: 'Llama 3.2 3B Instruct  Q4_K_M  (denso, multilíngue)',
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    },
};

const ponte = abrirPonte({
    cache: process.env.CACHE ?? '/tmp/ponte-qualidade',
    porta: Number(process.env.PORTA_PONTE ?? 3481),
    // Um modelo por vez no disco: sao ~7 GB de candidatos e o OPFS guarda a
    // propria copia. Guardar os dois lados encheria o disco desta caixa.
    guardarGrandes: 2,
    manterCache: process.env.MANTER_CACHE === '1',
});
const contexto = await chromium.launchPersistentContext(process.env.PERFIL ?? '/home/user/perfil-qualidade', {
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--unlimited-storage'],
});
const page = contexto.pages()[0] ?? await contexto.newPage();
await ponte.instalarEm(page);
await page.goto(`${VITE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 180_000 });

// O juiz de tom é um modelo à parte (mpnet) e precisa estar de pé ANTES da
// primeira fala — senão `frasesForaDoTom` devolve lista vazia e a coluna
// "fora do tom" mediria o download, não o modelo.
const juiz = await page.evaluate(async () => {
    const J = await import('/src/npc/floor10VetorDeTom.ts');
    return J.prepararJuizDeTom();
});
console.log(`\n  juiz de tom de pé: ${juiz ? 'SIM' : 'NÃO — a coluna «fora do tom» sai zerada e não vale'}`);

const CONFIG = await page.evaluate(async () => {
    const E = await import('/src/npc/wllamaEngine.ts');
    return { ...E.CPU_LOAD_CONFIG, n_threads: 4 };
});

const resultados = [];
for (const id of MODELOS) {
    const modelo = CATALOGO[id];
    if (!modelo) { console.log(`  ‹?› modelo desconhecido: ${id}`); continue; }
    console.log(`\n${'═'.repeat(78)}\n  ${modelo.nome}`);
    if (modelo.nota) console.log(`  (${modelo.nota})`);
    const t0 = Date.now();
    let saida;
    try {
        saida = await page.evaluate(async ({ url, base, perguntas, repetir }) => {
            const C = await import('/src/npc/floor10Canon.ts');
            const R = await import('/src/npc/floor10Remendo.ts');
            const J = await import('/src/npc/floor10VetorDeTom.ts');
            const E = await import('/src/npc/wllamaEngine.ts');
            const mod = await import(/* @vite-ignore */ '/wllama-relaxed/index.js');

            const linhas = [];
            for (let volta = 0; volta < repetir; volta += 1) {
                // ── MOTOR NOVO A CADA VOLTA, E ISSO FOI MEDIDO ───────────
                //
                // A primeira versão carregava UM motor e reiniciava só o
                // histórico entre as voltas. A volta 2 do SmolLM3 saiu assim,
                // inteira:
                //
                //     "o."          "Elevator\"."      "vê aqui."
                //     "fala comigo."
                //
                // Não é o modelo: é o KV da volta anterior ainda no contexto.
                // Com `cache_prompt`, a volta 2 casa o prefixo da persona e
                // continua de uma posição que já não existe. O granite passou
                // ileso pelo motivo oposto — ele não reaproveita nada.
                //
                // E o JOGO não faz isso: `npcSaiuDoAndar` preserva a conversa
                // de propósito, `npcReset` só existe no botão da bancada, e
                // fechar o chat descarrega o motor. Era defeito meu, e estava
                // contaminando justamente a coluna de variedade.
                const w = new mod.Wllama(
                    { default: '/wllama-relaxed/wasm/wllama.wasm' },
                    { suppressNativeLog: true },
                );
                await w.loadModelFromUrl(url, base);
                // Histórico próprio por volta: o jogo conversa, não faz
                // perguntas soltas, e o prompt cresce turno a turno.
                const historico = [];
                for (const pergunta of perguntas) {
                    const prompt = E.prepareFloor10SystemPrompt(
                        C.buildFloor10SystemPrompt(pergunta, historico),
                    );
                    let texto = '';
                    let t = null;
                    const fluxo = await w.createChatCompletion({
                        messages: [
                            { role: 'system', content: prompt },
                            ...historico,
                            { role: 'user', content: pergunta },
                        ],
                        // A configuração de amostragem é a DO JOGO, inteira:
                        // `max_tokens` 56, temperatura 0,45, penalty_repeat
                        // 1,15. Medir com outra seria medir outro Nilo — a
                        // penalidade, em particular, existe porque sem ela o
                        // modelo entrava em loop e a fala era reprovada.
                        ...E.CHAT_COMPLETION_CONFIG,
                    });
                    for await (const p of fluxo) {
                        texto += E.chunkDelta(p);
                        if (p.timings) t = p.timings;
                    }
                    // `arrumarFala` é o que o jogo aplica antes de julgar: sem
                    // ela eu estaria julgando texto que o jogador nunca vê.
                    const fala = C.arrumarFala(E.visibleText(texto));
                    const issue = C.floor10ReplyIssue(fala, pergunta);
                    const marcadas = await J.frasesForaDoTom(
                        R.enumerarFrases(fala).map((f) => f.texto),
                    );
                    historico.push({ role: 'user', content: pergunta });
                    historico.push({ role: 'assistant', content: fala });
                    linhas.push({
                        volta, pergunta, fala, issue,
                        foraDoTom: marcadas.length,
                        ms: ((t?.prompt_ms ?? 0) + (t?.predicted_ms ?? 0)),
                        lidos: t?.prompt_n ?? 0,
                        reusados: t?.cache_n ?? 0,
                    });
                }
                await w.exit?.();
            }
            // O OPFS nao aguenta cinco candidatos ao mesmo tempo nesta caixa.
            try {
                const limpador = new mod.Wllama({ default: '/wllama-relaxed/wasm/wllama.wasm' },
                    { suppressNativeLog: true });
                await limpador.cacheManager?.clear?.();
            } catch { /* segue */ }
            return linhas;
        }, { url: modelo.url, base: CONFIG, perguntas: PERGUNTAS, repetir: REPETIR });
    } catch (e) {
        console.log(`  ✗ nao rodou: ${String(e?.message ?? e).slice(0, 200)}`);
        resultados.push({ id, nome: modelo.nome, erro: String(e?.message ?? e).slice(0, 300) });
        continue;
    }

    // ── AS COLUNAS QUE A RÉGUA DO JOGO NÃO TEM ───────────────────────────
    const PT = /\b(que|não|nao|você|voce|eu|está|esta|aqui|com|para|isso|uma|mas|meu|minha|sei|tem|the)\b/gi;
    const EN = /\b(the|and|you|are|there|here|what|this|that|with|have|from|about|would|know)\b/gi;
    const LUSITANO = /\b(estás|estas a|a fazer|a dizer|ecrã|telemóvel|comboio|casa de banho|percebes|tu és|autocarro)\b/i;
    const contar = (t, re) => (t.match(re) ?? []).length;
    for (const l of saida) {
        const en = contar(l.fala, EN);
        const pt = contar(l.fala, PT);
        l.ingles = en > pt;          // dominância, não presença
        l.lusitano = LUSITANO.test(l.fala);
    }
    const total = saida.length;
    const comIssue = saida.filter((l) => l.issue).length;
    const comTom = saida.filter((l) => l.foraDoTom > 0).length;
    const emIngles = saida.filter((l) => l.ingles).length;
    const lusitanas = saida.filter((l) => l.lusitano).length;
    // Variedade: por pergunta, quantas respostas distintas e quantas aberturas
    // distintas saíram entre as voltas.
    const abertura = (t) => t.trim().toLowerCase().split(/\s+/).slice(0, 4).join(' ');
    let distintas = 0; let aberturas = 0;
    for (const p of PERGUNTAS) {
        const desta = saida.filter((l) => l.pergunta === p);
        distintas += new Set(desta.map((l) => l.fala.trim().toLowerCase())).size;
        aberturas += new Set(desta.map((l) => abertura(l.fala))).size;
    }
    const turnoMedio = saida.reduce((a, l) => a + l.ms, 0) / total / 1000;
    const reuso = saida.reduce((a, l) => a + l.reusados, 0);

    console.log(`\n  ${total} falas · ${((Date.now() - t0) / 1000).toFixed(0)}s no total`);
    console.log(`    defeito da régua do jogo .... ${comIssue}/${total}`);
    console.log(`    fora do tom (juiz mpnet) .... ${comTom}/${total}`);
    console.log(`    respondeu em inglês ......... ${emIngles}/${total}`);
    console.log(`    português de Portugal ....... ${lusitanas}/${total}`);
    console.log(`    variedade ................... ${distintas}/${total} respostas distintas · ${aberturas}/${total} aberturas`);
    console.log(`    turno médio ................. ${turnoMedio.toFixed(1)}s · ${reuso} tokens reaproveitados no total`);
    console.log('');
    for (const l of saida) {
        const marcas = [l.issue, l.foraDoTom > 0 ? `fora do tom ×${l.foraDoTom}` : '',
            l.ingles ? 'INGLÊS' : '', l.lusitano ? 'PT-PT' : ''].filter(Boolean).join(' · ');
        console.log(`    [${l.volta}] ${l.pergunta}`);
        console.log(`        ${JSON.stringify(l.fala)}${marcas ? `   ← ${marcas}` : ''}`);
    }
    resultados.push({
        id, nome: modelo.nome, total, comIssue, comTom, emIngles, lusitanas,
        distintas, aberturas, turnoMedio, reuso, falas: saida,
    });
}

console.log(`\n${'═'.repeat(78)}\n  RESUMO\n`);
console.log(`  ${'modelo'.padEnd(44)} ${'defeito'.padStart(8)} ${'tom'.padStart(6)} ${'inglês'.padStart(7)} ${'PT-PT'.padStart(6)} ${'variedade'.padStart(10)} ${'turno'.padStart(8)}`);
for (const r of resultados) {
    if (r.erro) { console.log(`  ${r.nome.padEnd(44)} ${'— não rodou —'}`); continue; }
    console.log(`  ${r.nome.padEnd(44)} ${`${r.comIssue}/${r.total}`.padStart(8)} ${`${r.comTom}/${r.total}`.padStart(6)}`
        + ` ${`${r.emIngles}/${r.total}`.padStart(7)} ${`${r.lusitanas}/${r.total}`.padStart(6)}`
        + ` ${`${r.distintas}/${r.total}`.padStart(10)} ${`${r.turnoMedio.toFixed(1)}s`.padStart(8)}`);
}
console.log('');
fs.writeFileSync(RELATORIO, JSON.stringify({ PERGUNTAS, REPETIR, resultados }, null, 2));
console.log(`  relatório em ${RELATORIO}\n`);
await contexto.close();
ponte.fechar();
