// ── E SE O REVISOR NÃO FOSSE UM MODELO DE CHAT? ───────────────────────────
//
// Todo candidato a revisor medido até aqui é um decoder de chat: LFM2.5, Llama
// 3.2, granite, Gemma 3, SmolLM2, Qwen2.5. Eles têm em comum o custo que nos
// mata — leem o enunciado inteiro TOKEN A TOKEN antes de escrever a primeira
// letra. Medido no aparelho: 43 s lendo 227 tokens contra 5 s escrevendo 20.
// 89% do preço é leitura.
//
// ── O QUE UM ENCODER-DECODER FAZ DIFERENTE ───────────────────────────────
//
// Um seq2seq (T5 e parentes) lê o enunciado no ENCODER, e o encoder é uma
// passada só, paralela, sem autoregressão. A parte cara do nosso trabalho é
// exatamente a que ele faz de graça. O decoder ainda é token a token, mas são
// os ~20 tokens da frase nova — os 5 s, não os 43 s.
//
// E tem uma segunda economia, maior e menos óbvia. Hoje o jogo DESCARREGA o
// rascunhador para caber o revisor (`trocarRascunhadorPeloRevisor`), porque
// dois llama.cpp de 1 GB num celular foi o que desligou o aparelho do dono do
// jogo. Um editor de 250 MB em ONNX cabe AO LADO do granite: sem troca, sem
// recarga, sem os ~18 s de subir 1,25 GB toda vez que o juiz marca uma frase.
//
// ── O QUE ESTA BANCADA NÃO PROVA ─────────────────────────────────────────
//
// Ela roda em Node, na CPU desta caixa, com onnxruntime-node. NÃO é o celular
// e NÃO é o navegador. O número de tempo aqui serve para comparar modelos
// entre si, não para prometer nada ao jogador — essa promessa já foi feita uma
// vez com o Llama e voltou como "demorou MUITO".
//
// O que ela decide é a pergunta ANTERIOR à do tempo, e essa é honesta aqui:
// um editor seq2seq de 250 MB entende "conserte esta frase porque X"? Se não
// entender, o caminho morre e não vale medir velocidade nenhuma.
//
// Uso:
//   node revisor-editor.mjs
//   MODELOS="Xenova/LaMini-Flan-T5-248M:LaMini-248M" ENUNCIADO=motivo|coedit node revisor-editor.mjs
import { pipeline, env } from '@huggingface/transformers';
import { DEFEITOS, CERTAS, QUEBRA_CANONE, NO_ASSUNTO, ECOOU, FRAGMENTO } from './defeitos.mjs';

env.allowLocalModels = false;

const MODELOS = (process.env.MODELOS ?? [
    'Xenova/LaMini-Flan-T5-248M:LaMini-248M:q8',
    'Xenova/LaMini-Flan-T5-77M:LaMini-77M:q8',
].join(',')).split(',').map((spec) => {
    const [id, rot, dtype, sub] = spec.split(':');
    return { id, rot: rot ?? id, dtype: dtype || 'q8', sub };
});
const ENUNCIADO = process.env.ENUNCIADO ?? 'motivo';
const MAX = Number(process.env.MAX_TOKENS ?? 48);

// ── COMO SE PEDE A UM EDITOR ─────────────────────────────────────────────
//
// Não é o enunciado dos modelos de chat, e a diferença não é estilo. Um T5 de
// instrução não tem persona, não tem turno, não tem system: ele tem UMA
// entrada e devolve UMA saída. Toda a informação — o defeito e o que preservar
// — tem de caber numa frase de comando.
//
// `motivo` entrega o mesmo motivo que o juiz produz hoje, para o placar sair
// comparável com o da outra bancada.
// `coedit` usa a forma em que o CoEdIT foi treinado ("Fix ... in this
// sentence: X"), que é a distribuição dele — se ele for melhor nela, o
// enunciado é que estava errado, não o modelo.
const ENUNCIADOS = {
    motivo: (q, f, porque) => `Rewrite the sentence to fix one error. The error: ${porque} Keep what the sentence was saying, change only that. Sentence: ${f}`,
    coedit: (q, f, porque) => `Fix the factual error in this sentence (${porque}): ${f}`,
    // Sem motivo: o teto de baixo. Se ele conserta às cegas, o juiz nem precisa
    // explicar; se não conserta nem com o motivo, o caminho está morto.
    cego: (q, f) => `Rewrite this sentence to remove anything that is wrong: ${f}`,
};

const limpar = (t) => String(t ?? '').replace(/^["'\s]+|["'\s]+$/g, '').trim();

const placar = [];
for (const m of MODELOS) {
    let editor;
    const t0 = Date.now();
    try {
        editor = await pipeline('text2text-generation', m.id, {
            dtype: m.dtype, ...(m.sub !== undefined ? { subfolder: m.sub } : {}),
        });
    } catch (e) {
        console.log(`\n████ ${m.rot} — NÃO CARREGOU: ${String(e?.message ?? e).slice(0, 200)}`);
        placar.push({ rot: m.rot, erro: String(e?.message ?? e).slice(0, 60) });
        continue;
    }
    console.log(`\n████ ${m.rot} — carga ok em ${((Date.now() - t0) / 1000).toFixed(1)}s · dtype ${m.dtype}`);

    // NÃO AQUECE. Mesma decisão da outra bancada, mesmo motivo: no jogo a
    // primeira chamada é a única que o jogador espera.
    const pedir = ENUNCIADOS[ENUNCIADO] ?? ENUNCIADOS.motivo;
    let consertou = 0, desviou = 0, vazio = 0, msTot = 0, n = 0, msFria = 0, msMorna = 0, nMorna = 0;
    for (const c of DEFEITOS) {
        const t = Date.now();
        let saida = '';
        try {
            const r = await editor(pedir(c.q, c.f, c.porque), { max_new_tokens: MAX, do_sample: false });
            saida = limpar(r?.[0]?.generated_text);
        } catch (e) { saida = ''; console.log(`  ✗ ERRO ${String(e?.message ?? e).slice(0, 120)}`); }
        const ms = Date.now() - t;
        n += 1; msTot += ms;
        if (n === 1) msFria = ms; else { msMorna += ms; nMorna += 1; }
        const sumiu = !!saida && c.ok(saida);
        const limpo = !!saida && !QUEBRA_CANONE(saida);
        const bom = sumiu && limpo && !ECOOU(saida, c.q, c.f) && !FRAGMENTO(saida);
        if (!saida) vazio += 1; else if (bom) consertou += 1;
        const fora = !!saida && !NO_ASSUNTO(saida, c.q, c.f);
        if (fora) desviou += 1;
        const selo = (!saida ? '✗✗ VAZIO' : bom ? '✓' : !sumiu ? '✗ não consertou' : '✗ QUEBROU OUTRA REGRA')
            + (fora ? ' ?assunto' : '');
        console.log(`  ${(ms / 1000).toFixed(1).padStart(5)}s  ${selo}  ${c.nome}`);
        console.log(`         ${JSON.stringify(saida.slice(0, 105))}`);
    }
    // O controle: frases CERTAS. Um editor treinado para editar tem um vício
    // conhecido — ele edita sempre, porque foi pago para isso. Aqui é onde
    // isso aparece.
    let estragou = 0, intacta = 0;
    console.log(`  ── e nas frases que JÁ ESTAVAM CERTAS:`);
    for (const c of CERTAS) {
        const t = Date.now();
        let saida = '';
        try {
            const r = await editor(ENUNCIADOS.cego(c.q, c.f), { max_new_tokens: MAX, do_sample: false });
            saida = limpar(r?.[0]?.generated_text);
        } catch { saida = ''; }
        msTot += Date.now() - t; n += 1;
        const ruim = !!saida && QUEBRA_CANONE(saida);
        if (ruim) estragou += 1;
        if (saida === c.f) intacta += 1;
        console.log(`     ${((Date.now() - t) / 1000).toFixed(1)}s ${ruim ? '✗✗ ESTRAGOU' : (saida === c.f ? '= devolveu igual' : '~ reescreveu, sem estragar')}`);
        console.log(`         ${JSON.stringify(saida.slice(0, 105))}`);
    }
    placar.push({
        rot: m.rot, consertou, vazio, desviou, estragou, intacta,
        fria: msFria / 1000, morna: nMorna ? msMorna / nMorna / 1000 : 0, custo: msTot / Math.max(1, n) / 1000,
    });
}

console.log(`\n${'═'.repeat(84)}\n  ENUNCIADO: ${ENUNCIADO} · editores seq2seq em ONNX, CPU desta caixa (NÃO é o celular)`);
console.log(`  candidato                    conserta  desviou  estraga  intacta   1ª FRIA   depois`);
for (const p of placar) {
    if (p.erro) { console.log(`  ${p.rot.padEnd(28)} NÃO CARREGOU: ${p.erro}`); continue; }
    console.log(`  ${p.rot.padEnd(28)} ${String(p.consertou + '/' + DEFEITOS.length).padStart(6)}`
        + `${p.vazio ? '(' + p.vazio + 'v)' : '   '}`
        + `${String(p.desviou + '/' + DEFEITOS.length).padStart(9)}`
        + `${String(p.estragou + '/' + CERTAS.length).padStart(9)}`
        + `${String(p.intacta + '/' + CERTAS.length).padStart(9)}`
        + `${(p.fria.toFixed(1) + 's').padStart(10)}`
        + `${((p.morna || p.custo).toFixed(1) + 's').padStart(9)}`);
}
console.log(`\n  Compare a coluna "conserta" com a de revisor-candidatos.mjs: os defeitos, os`);
console.log(`  controles e a régua de cânone vêm do MESMO arquivo (defeitos.mjs).`);
