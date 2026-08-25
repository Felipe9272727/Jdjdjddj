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
//   API_KEY=... API_URL=https://…/chat/completions MODELO=… \
//   CASOS=300 POR_CASO=3 PENSAR=1 PARALELO=6 node corpus/destilar.mjs \
//     > corpus/destilado.jsonl 2> producao.log
//
// ── QUEM É O PROFESSOR, E POR QUE ────────────────────────────────────────
//
// Escolhido por medição, não por tamanho. Na prova de seis casos:
//
//   nemotron-3-ultra-550b   6/6 na régua · 6/6 aberturas · 12 palavras
//   kimi-k3                 6/6 na régua · 6/6 aberturas · 24 palavras
//
// As duas passam; a de 12 palavras é a que escreve o Nilo, que é seco. E a
// vazão desempatou de vez, medida com o prompt de verdade, doze chamadas
// seguidas: o ultra deu 10/12 (dois 503 passageiros, nenhum bloqueio de cota),
// o k3 deu 0/12 — todas recusadas por cota, mesmo a três chamadas por minuto.
// Um professor que não responde não é professor.
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

// ── O PROFESSOR PENSA EM PAZ ─────────────────────────────────────────────
//
// Primeira tentativa: `enable_thinking: false` e teto de 120 tokens, para a
// resposta sair curta e barata. Foi erro, e o próprio teste mostrou — uma das
// três saídas veio em TERCEIRA PESSOA ("He doesn't know who's upstairs"), que é
// quebra de cânone. Apertado e com o modo nativo desligado, ele escreve pior.
//
// Com o raciocínio ligado a divisão ainda vem limpa: `reasoning` num campo,
// `content` noutro. Desligado, o pensamento VAZA para dentro do content
// ("The wrong line assumed I had answers I don't possess.\n\nI don't know…") e
// aí não dá para separar o que é fala do que é ruminação.
//
// O orçamento é generoso de propósito: o raciocínio dele passou de 200 tokens
// com folga no primeiro teste, e cortar no meio é o mesmo que desligar.
const TETO_PROFESSOR = Number(process.env.TETO_PROFESSOR ?? 900);

// ── MARCA-PASSO: NUNCA BATER NO MURO ─────────────────────────────────────
//
// A primeira versão acelerava até levar 429 e então esperava até dois minutos.
// É o pior dos dois mundos, e o dono do jogo cortou certo: "não quero esperar
// 300 mins". Insistir mais não resolve — resolve NÃO BATER.
//
// Controle de ritmo clássico (sobe devagar, corta rápido): a cada quatro
// sucessos o intervalo entre chamadas encolhe 10%; a cada 429 ele cresce 70%.
// Em poucos minutos converge para pouco abaixo do que a chave aceita, e o 429
// vira exceção em vez de rotina.
//
// A tentativa é INFINITA, também por pedido dele: nenhum caso se perde. Com o
// marca-passo funcionando, a espera é de segundos e não de minutos.
// ── OS DOIS LIMITES DO MARCA-PASSO, MEDIDOS ──────────────────────────────
//
// O corte de 70% por bloqueio subia sem teto util e o ritmo travava em 6/min —
// a 6/min o corpus levaria quatro horas, e o dono do jogo quer terminar hoje.
// A medicao diz onde ficam as bordas: doze chamadas seguidas com 1,2 s de
// intervalo passaram 10/12, sem um bloqueio de cota sequer, e o unico problema
// foram dois 503 passageiros. Entao o piso e 1,2 s e o teto e 4 s: o marca-passo
// continua recuando quando leva bloqueio, mas dentro de uma faixa que a chave
// comprovadamente aguenta, em vez de recuar ate parar.
let intervalo = Number(process.env.RITMO_MS ?? 1600);
const RITMO_MIN_MS = 1200;
const RITMO_MAX_MS = Number(process.env.TETO_RITMO_MS ?? 4000);
let ultimaSaida = 0;
let seguidos = 0;
let bloqueios = 0;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function aVez() {
    const agora = Date.now();
    const quando = Math.max(agora, ultimaSaida + intervalo);
    ultimaSaida = quando;
    if (quando > agora) await dormir(quando - agora);
}

async function perguntar(mensagens, temperatura, teto = TETO_PROFESSOR, tentativa = 0) {
    await aVez();
    const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
            model: MODELO, messages: mensagens, temperature: temperatura,
            max_tokens: Math.max(teto, TETO_PROFESSOR),
        }),
    });
    // ── 429 NÃO É ERRO, É RITMO ──────────────────────────────────────────
    //
    // O tier grátis da NVIDIA devolveu 429 com TRÊS chamadas simultâneas — o
    // "sem teto diário" que eu tinha lido num blog não se sustentou no teste.
    // Desistir na primeira recusa jogaria fora o caso inteiro; esperar e repetir
    // custa segundos e salva a linha.
    if (r.status === 429 || r.status === 503) {
        // O DONO DO JOGO CONHECE O RITMO: "vc pode mandar uma mensagem, e dps
        // tem que esperar um pouco pra resetar, mas isso é em 1/2 min". É
        // limite por MINUTO, não cota total — então a paciência precisa passar
        // de um minuto, senão a gente desiste justamente quando ia liberar. Com
        // teto de 30 s e 6 tentativas eu esperava 62 s no total e perdia o caso.
        bloqueios += 1;
        seguidos = 0;
        intervalo = Math.min(RITMO_MAX_MS, Math.round(intervalo * 1.7));
        // ── O `retry-after` PRECISA DE TETO ──────────────────────────────
        //
        // Custou três minutos de produção MUDA para descobrir: sem teto, um
        // `retry-after` grande manda o laço dormir sem imprimir nada, e de fora
        // isso é indistinguível de um travamento. O limite desta chave reseta
        // em um ou dois minutos — o dono do jogo mediu isso na mão — então
        // dormir mais que isso é desperdício, não paciência.
        const pedido = Number(r.headers.get('retry-after') ?? 0) * 1000;
        const espera = Math.min(60_000, pedido || Math.max(2_000, intervalo));
        console.error(`  ‹${r.status}› espera ${(espera / 1000).toFixed(1)}s (pedido ${(pedido / 1000) || '-'}s) · ritmo ${(60000 / intervalo).toFixed(0)}/min · bloqueio ${bloqueios}`);
        await dormir(espera + Math.random() * 400);
        return perguntar(mensagens, temperatura, teto, tentativa + 1);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    seguidos += 1;
    if (seguidos >= 3) { intervalo = Math.max(RITMO_MIN_MS, Math.round(intervalo * 0.85)); seguidos = 0; }
    const j = await r.json();
    const m = j?.choices?.[0]?.message ?? {};
    const fala = String(m.content ?? '').trim();
    const pensou = String(m.reasoning ?? m.reasoning_content ?? '').trim();
    // Quando PENSAR=1 o alvo do treino leva o bloco; quando não, só a fala.
    // O raciocínio NUNCA passa pela régua: julgar o modelo pelo que ele pensou
    // foi o buraco que deu 0/12 ao Huihui.
    // O bloco pedido vem DENTRO do content. O campo nativo só entra se o
    // professor tiver ignorado a forma — e aí ele é meta, então não vai ao alvo.
    // Primeiro a forma rotulada, que é a que o professor entrega de verdade;
    // depois a tag literal, para o caso de trocar de professor sem trocar isto.
    // Com passos numerados o WHY ocupa várias linhas: pega tudo entre WHY: e
    // LINE:, não só a primeira linha.
    const porQue = FUNDO <= 1
        ? /^\s*WHY:\s*(.+)$/mi.exec(fala)
        : /^\s*WHY:\s*([\s\S]*?)(?=^\s*LINE:)/mi.exec(fala);
    const aLinha = /^\s*LINE:\s*(.+)$/mi.exec(fala);
    const doTexto = /<think>([\s\S]*?)<\/think>/.exec(fala);
    let raciocinio = porQue ? porQue[1].trim() : (doTexto ? doTexto[1].trim() : '');
    // O professor às vezes repete o cabeçalho da instrução ("exactly 5 numbered
    // steps, one short line each…") antes do passo 1. Isso iria para o alvo e
    // ensinaria o aluno a recitar o enunciado em vez de raciocinar — custando
    // tokens no aparelho para dizer nada.
    if (FUNDO > 1) {
        const doPrimeiro = raciocinio.search(/^\s*1[.)]/m);
        if (doPrimeiro > 0) raciocinio = raciocinio.slice(doPrimeiro).trim();
    }
    const linha = UMA_FRASE(
        aLinha ? aLinha[1]
            : doTexto ? fala.slice(doTexto.index + doTexto[0].length)
                : fala.replace(/^\s*WHY:.*$/mi, ''),
    );
    return {
        fala: linha,
        pensou: raciocinio || pensou,
        junto: raciocinio ? `<think>${raciocinio}</think>\n${linha}` : linha,
    };
}

// O jogo aplica `primeiraFraseFechada` no remendo. O corpus tem que ensinar a
// mesma forma, senão o aluno escreve o que será cortado.
const UMA_FRASE = (t) => {
    const limpo = String(t).replace(/^\s*["“](.*)["”]\s*$/s, '$1').trim().split('\n').filter((l) => l.trim())[0] ?? '';
    const m = /^[\s\S]*?[.!?…]["”]?/.exec(limpo.trim());
    return (m ? m[0] : limpo).trim();
};

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
    { role: 'system', content: PERSONA + (PENSAR ? COMO_PENSAR : SO_UMA_FRASE) },
    { role: 'user', content: enunciado(q, errada, regra.motivo) },
];

// O raciocínio é do REVISOR, não do Nilo: quem pensa é quem conserta. Uma
// frase, porque cada token custa ~86 ms no aparelho e porque raciocínio longo
// num modelo pequeno vira divagação — o Huihui gastou o teto inteiro dentro do
// bloco em 2 de 12 e devolveu vazio.
// ── A FORMA, PEDIDA EXPLICITAMENTE ───────────────────────────────────────
//
// Sem isto o professor devolveu duas coisas erradas, as duas medidas:
//
//   1. o `reasoning` NATIVO dele é meta e não serve de treino — saiu
//      "Low thinking; produce a direct line from Nilo.", que ensinaria o aluno
//      a emitir pensamento vazio;
//   2. a resposta veio com QUATRO frases e 40 palavras. O revisor troca UMA
//      frase e o jogo corta na primeira: treinar em parágrafo ensina o aluno a
//      gastar tokens em texto que será descartado.
//
// Pedindo a forma no sistema, ele entrega raciocínio sobre o DEFEITO e uma
// frase só — medido antes de produzir.
// ── POR QUE `WHY:` / `LINE:` E NÃO `<think>` ─────────────────────────────
//
// Pedir a tag literal falhou, e falhou em silêncio: o professor RACIOCINA de
// verdade (283 e 810 chars de raciocínio nativo nos dois casos medidos), só que
// o servidor separa esse texto no campo `reasoning_content` e entrega o
// `content` já limpo, sem tag nenhuma. O corpus saía sem um único bloco de
// pensamento — ou seja, `PENSAR=1` produzia exatamente o mesmo que `PENSAR=0`,
// e isso só apareceu porque eu abri as três primeiras linhas antes de deixar
// rodar meia hora.
//
// Usar o raciocínio nativo no lugar não serve: ele é exploratório e longo, e
// treinar nele ensina o aluno a divagar a 11,6 tok/s. Duas linhas rotuladas
// atravessam o canal de raciocínio intactas, e a régua consegue conferir que as
// DUAS chegaram. O bloco `<think>` é montado aqui, do lado de cá.
// ── QUANTO PENSAR: PARÂMETRO, E A CONTA ESTÁ AQUI ────────────────────────
//
// Pedido do dono do jogo: que o aluno pense como o professor, que raciocina
// longo. A medida dos 24 casos que ele gerou: média de 2.574 tokens de
// raciocínio, pior caso 6.608. No aparelho dele, a 11,6 tok/s, isso é 3,7
// minutos por remendo em média e 9,5 no pior — contra 1,7 s do corpus atual.
//
// E o comprimento não é o que faz aquele raciocínio ser bom. Ele é BUSCA em voz
// alta: "We need answer user's request", "Hmm.", "Need decide.", "Maybe
// better:", com a frase final reescrita quinze vezes até parar. Um modelo de
// 0,8B não tem capacidade para fazer essa busca; ele copia a aparência dela,
// que é o loop. E o v3 já mostrou isso na prática — 3 de 6 casos batendo no
// teto de tokens, repetindo a mesma sequência.
//
// O que transfere é a ESTRUTURA, não o tamanho: nomear o que a frase errada
// afirma, conferir cada afirmação contra o cânone, decidir o conserto. Isso
// cabe em passos curtos e numerados, e o número de passos é o parâmetro.
//
//   FUNDO=1  → uma frase (20 tokens, ~1,7 s no aparelho)
//   FUNDO=3  → três passos (~70 tokens, ~6 s)
//   FUNDO=5  → cinco passos (~120 tokens, ~10 s)
//
// Cada valor é um corpus, e a escolha entre eles é medição: qualidade na régua
// contra segundos no aparelho. Não é gosto.
const FUNDO = Number(process.env.FUNDO ?? 1);

const COMO_PENSAR = FUNDO <= 1 ? `

Answer in exactly two lines, with these labels and nothing else:
WHY: one short sentence naming what the wrong line got wrong
LINE: one sentence in Nilo's voice, no quotes, no label after it` : `

Answer with these labels and nothing else:
WHY: exactly ${FUNDO} numbered steps, one short line each, in this order —
  1. name every claim the wrong line makes
  2. check each claim against what Nilo can actually know or see${FUNDO >= 4 ? `
  3. name which claim is the worst break and why` : ''}${FUNDO >= 5 ? `
  4. say what Nilo would say instead, in plain terms` : ''}
  ${FUNDO}. decide the fix in one clause
Each step is a decision, never a question, never "maybe" or "hmm" — you are
writing down a conclusion, not thinking out loud.
LINE: one sentence in Nilo's voice, no quotes, no label after it`;
const SO_UMA_FRASE = `

Answer with ONE sentence in Nilo's voice. One sentence only, no label, no quotes.`;

const SEM_PENSAMENTO = (t) => {
    const fim = t.lastIndexOf('</think>');
    if (fim >= 0) return t.slice(fim + 8).trim();
    return t.includes('<think>') ? '' : t;
};

const CORRIGIR_O_ALUNO = (q, errada, motivo, tentativa) => [
    { role: 'system', content: PERSONA + (PENSAR ? COMO_PENSAR : SO_UMA_FRASE) },
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
            const r = await perguntar(CORRIGIR_O_ALUNO(q, errada, motivo, t.aluno), TEMPERATURA);
            corrigido = PENSAR ? r.junto : r.fala;
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
    console.error(`\n  ${escritos} correções · ${contagemPorAbertura.size} aberturas distintas · ${recusados} recusadas · ritmo ${(60000 / intervalo).toFixed(0)}/min · ${bloqueios} bloqueios`);
    process.exit(0);
}

// ── EM PARALELO, PORQUE SEQUENCIAL LEVA HORAS ────────────────────────────
//
// Cada caso são 1 chamada de defeito + K de conserto, e o professor pensa antes
// de responder. Sequencial, 250 casos passavam de três horas. O tier da NVIDIA
// aceita dezenas por minuto, então o gargalo era meu laço, não o servidor.
const AO_MESMO_TEMPO = Number(process.env.PARALELO ?? 6);

async function umCaso(i) {
    let aceitos = 0;
    const q = PERGUNTAS[i % PERGUNTAS.length];
    const regra = REGRAS_DO_CANONE[Math.floor(Math.random() * REGRAS_DO_CANONE.length)];
    let errada = '';
    // ── QUE DEFEITO CONTA ────────────────────────────────────────────────
    //
    // A regra sorteada e o que a gente PEDE ao professor; a que vale e a que a
    // frase dele REALMENTE quebra. Exigir as duas iguais parece rigor e e
    // desperdicio: 9 de 16 casos medidos gastavam tres chamadas e devolviam
    // nada, porque o professor escreve um defeito plausivel que trai outra
    // regra que nao a encomendada — pedir "nunca saiu do andar" e receber uma
    // frase que fala pelo jogador, por exemplo.
    //
    // O par continua inteiramente verificado: a frase errada quebra uma regra
    // de verdade, o motivo no enunciado e o motivo DAQUELA regra, e o conserto
    // ainda precisa sair limpo de TODAS elas. So parou de jogar fora trabalho
    // bom. De quebra, as regras dificeis de encomendar aparecem quando caem
    // sozinhas, e a distribuicao do corpus fica menos enviesada pelo sorteio.
    let regraReal = regra;
    try {
        for (let tentativa = 0; tentativa < 3 && !errada; tentativa += 1) {
            const bruta = semAspas((await perguntar(PEDIR_DEFEITO(q, regra), 1.0)).fala);
            const quebradas = REGRAS_DO_CANONE.filter((x) => x.re.test(bruta));
            if (!quebradas.length) continue;
            regraReal = quebradas.find((x) => x.regra === regra.regra) ?? quebradas[0];
            errada = bruta;
        }
    } catch (e) { console.error(`  ‹erro› ${String(e.message).slice(0, 100)}`); return; }
    if (!errada) {
        defeitosRuins += 1;
        console.error(`  caso ${i} · ${regra.regra} · SEM DEFEITO VÁLIDO em 3 tentativas`);
        return;
    }
    console.error(`  caso ${i} · pedi «${regra.regra}» · vale «${regraReal.regra}»`);

    for (let k = 0; k < POR_CASO; k += 1) {
        let bruto = '';
        try {
            const r = await perguntar(PEDIR_CONSERTO(q, errada, regraReal), TEMPERATURA);
            bruto = PENSAR ? r.junto : r.fala;
        } catch { continue; }
        // A régua julga A FALA, nunca o raciocínio. Reprovar o modelo pelo que
        // ele PENSOU foi o buraco que deu 0/12 ao Huihui e custou uma rodada
        // inteira desta caçada.
        const conserto = semAspas(PENSAR ? SEM_PENSAMENTO(bruto) : bruto);
        if (!conserto || conserto.length < 12) { recusados += 1; continue; }
        // Com PENSAR=1 o par só serve se as DUAS partes chegaram. Sem esta
        // conferência o corpus aceita em silêncio alvos sem bloco de
        // pensamento, e aí `PENSAR=1` vira enfeite — foi o que aconteceu na
        // primeira tentativa de hoje.
        if (PENSAR && !bruto.startsWith('<think>')) { recusados += 1; continue; }
        // O professor erra. O que ele erra não vira treino.
        if (REGRAS_DO_CANONE.some((r) => r.re.test(conserto))) { recusados += 1; continue; }
        const ab = abertura(conserto);
        if ((contagemPorAbertura.get(ab) ?? 0) >= TETO_ABERTURA) { recusados += 1; continue; }
        contagemPorAbertura.set(ab, (contagemPorAbertura.get(ab) ?? 0) + 1);
        console.log(JSON.stringify({
            messages: [
                { role: 'system', content: PERSONA },
                { role: 'user', content: enunciado(q, errada, regraReal.motivo) },
                // O ALVO INCLUI O RACIOCÍNIO quando PENSAR=1: é isso que ensina
                // o aluno a derivar a resposta em vez de recuperar a decorada.
                { role: 'assistant', content: PENSAR ? bruto : conserto },
            ],
        }));
        escritos += 1;
        aceitos += 1;
    }
    console.error(`  caso ${i} · ${aceitos}/${POR_CASO} consertos aceitos · total ${escritos}`);
}

console.error(`  professor ${MODELO} · ${CASOS} casos × ${POR_CASO} · pensar ${PENSAR ? 'sim' : 'não'} · ${AO_MESMO_TEMPO} raias`);

let proximo = 0;
const raia = async () => {
    while (proximo < CASOS) {
        const i = proximo; proximo += 1;
        await umCaso(i);
        if ((i + 1) % 25 === 0) {
            console.error(`  ${i + 1}/${CASOS} casos · ${escritos} linhas · ${contagemPorAbertura.size} aberturas · ${recusados} recusadas · ritmo ${(60000 / intervalo).toFixed(0)}/min · ${bloqueios} bloqueios`);
        }
    }
};
await Promise.all(Array.from({ length: AO_MESMO_TEMPO }, raia));
console.error(`\n  ${escritos} linhas · ${contagemPorAbertura.size} aberturas distintas`);
console.error(`  ${recusados} consertos recusados pela régua · ${defeitosRuins} casos sem defeito válido`);
