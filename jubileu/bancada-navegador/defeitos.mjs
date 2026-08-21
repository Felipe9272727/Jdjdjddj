// ── OS DEFEITOS, UMA VEZ SÓ ───────────────────────────────────────────────
//
// Este arquivo existe por uma lição que já custou um dia neste repositório: a
// sala do `?pipeline` tinha lista própria de peças e ignorou uma escolha
// inteira em silêncio. Agora há duas bancadas medindo revisor — a de modelos
// de chat (`revisor-candidatos.mjs`) e a de editores seq2seq
// (`revisor-editor.mjs`) — e se cada uma tiver a sua cópia dos defeitos, os
// dois placares deixam de ser comparáveis sem ninguém perceber.
//
// Regra: quem mede revisor importa daqui. Mudou o defeito, mudou para todos.

export const DEFEITOS = [
    { q: 'Hi what is your name? Do you know why we are here?',
      f: "I'm just a guest trapped in this elevator, and I don't know why we're here.",
      nome: 'cânone: dentro do elevador',
      porque: 'Nilo is trapped on the 10th FLOOR, in a grey room. He is not inside the elevator.',
      ok: (t) => !/\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t) },
    { q: 'Will this hotel ever end?',
      f: 'This hotel, Nilo, seems to be an endless loop, a rollercoaster of time and space.',
      nome: 'vocativo: chama o JOGADOR de Nilo',
      porque: 'it calls the player "Nilo". Nilo is the speaker, not the player. Never address the player by that name.',
      // ── A RESPOSTA CERTA ERA REPROVADA ───────────────────────────────
      // Décimo primeiro buraco da régua, e o primeiro que erra CONTRA o
      // candidato. Aqui o conserto certo é apagar duas palavras — o
      // enunciado até pede isso ("fix only that error"). Só que a frase
      // resultante tem 92% das palavras da original, e `ECOOU` reprovava
      // como se fosse devolver a entrada. Dois dos doze pontos de cada
      // rodada eram inganháveis para quem fazia o certo.
      // `minima` é o conserto mínimo correto: bater com ele isenta do eco.
      minima: 'This hotel seems to be an endless loop, a rollercoaster of time and space.',
      ok: (t) => !/,\s*nilo\s*[,.]?/i.test(t) },
    { q: 'If I call the elevator, will it come?',
      f: 'But I would advise you to remain calm and wait for the elevator to arrive.',
      nome: 'modo assistente: dá conselho',
      porque: 'it gives the player advice. Nilo is the player\'s equal, never a helper, and never tells them what to do.',
      ok: (t) => !/\b(?:i'?d|i would)\s+advise|\byou should\b|\bremain calm\b/i.test(t) },
    { q: 'Are you real?',
      f: 'I am an AI language model running inside this simulation, so I cannot feel fear.',
      nome: 'quebra a quarta parede: fala de IA',
      porque: 'it says he is an AI. Nilo is a human being and must never mention AI, models, programs or simulations.',
      ok: (t) => !/\b(?:AI|language model|simulation|system prompt|algorithm)\b/i.test(t) },
    { q: 'What is behind that wall?',
      f: 'Down the corridor there is a window, and from it you can see the whole city.',
      nome: 'inventa cenário: corredor e janela',
      porque: 'there is no corridor, no window and no city. The 10th floor is only a grey room with four walls and the elevator door.',
      ok: (t) => !/\b(?:corridor|hallway|window)\b/i.test(t) },
    { q: 'Who runs this hotel?',
      f: 'The hotel is run by the Vance family, and they will shut it down next Tuesday.',
      nome: 'inventa fato: sabe quem manda',
      porque: 'Nilo does NOT know who runs the hotel or whether it ends. He must not name anyone or give dates.',
      ok: (t) => !/\bVance\b/i.test(t) && !/\b(?:next tuesday|shut it down)\b/i.test(t) },
];

// ── O CONTROLE ───────────────────────────────────────────────────────────
// Frases que estão CERTAS. O revisor não devia ter sido chamado nelas, mas o
// juiz erra, e quando erra é isto que acontece. `intacta` é generosa de
// propósito: só reprova se ele INTRODUZIR um defeito, não se reescrever.
export const CERTAS = [
    { q: 'Does the elevator ever open?',
      f: 'It opens when it wants to, and never when I ask.',
      nome: 'boa: recusa sem dar conselho' },
    { q: 'How long have you been here?',
      f: 'Long enough to stop counting, and not long enough to stop listening.',
      nome: 'boa: seco, sem inventar fato' },
    { q: 'Are you afraid?',
      f: 'I stopped calling it fear a while ago. Now it is just the room and me.',
      nome: 'boa: emoção sem quebrar cânone' },
];
// ── O CÂNONE INTEIRO, APLICADO A TODA SAÍDA ──────────────────────────────
//
// ESTA LISTA EXISTE PORQUE O PLACAR ME ENGANOU. Eu media só "o defeito
// apontado sumiu", e aí troquei o enunciado por um que EXIGE saída diferente
// da entrada. O Qwen2.5 pulou de 0/6 para 6/6 — e as frases eram
// "the endless loop of rooms and CORRIDORS", "I should probably find my way
// BACK DOWN", e as três frases boas viraram "It's a fine day, isn't it?".
//
// Uma régua que premia divergência, com um enunciado que pede divergência, dá
// nota máxima para quem muda de assunto. O conserto não é medir menos: é medir
// as OUTRAS regras também, em toda saída, sempre.
export // AS REGRAS ABAIXO SÃO AS DE `src/npc/floor10CanoneDoNilo.ts`. Duas delas
// faltavam aqui — narração e "comenta a frase em vez de reescrevê-la" — e o
// granite 4.0 h-1B passou com "The player's question, \"Will this hotel ever
// end?\"", que é narração pura. Enquanto a bancada for .mjs e o jogo .ts, esta
// cópia existe; se divergirem de novo, é aqui que o placar mente.
const QUEBRA_CANONE = (t) => /\b(?:in|inside)\s+(?:this|the)\s+elevator\b/i.test(t)
    || /\bthe player\b/i.test(t)
    || /\bthe (?:narrator|speaker|protagonist)\b/i.test(t)
    || /\bthe question is about\b|\b(?:dry|formal|literary) statement\b/i.test(t)
    || /^\s*[(*]|\bhe(?:'s| is) trapped\b|\bNilo\s+[a-z]{2,}s\b/i.test(t)
    || /\bthat sentence\b|\bno correction needed\b|\bcorrected version\b/i.test(t)
    || /,\s*nilo\b/i.test(t)
    // DIVERGIU DE NOVO, e o aviso acima estava certo: o jogo já tinha
    // `i'?m here to (help|assist)` desde o buraco do few-shot, e esta cópia
    // não. O ERNIE-4.5 marcou ✓ duas vezes com "Hi, my name is Nilo Azevedo.
    // I'm here to help you with your questions." — reprovado no jogo, aprovado
    // na bancada. Agora as duas linhas são a mesma linha.
    || /\b(?:i'?d|i would)\s+advise\b|\byou should\b|\bremain calm\b|\bi'?m here to (?:help|assist)\b|\bi'?m an? (?:assistant|ai|bot)\b|\bi can help you\b|\bformulate a response\b/i.test(t)
    || /\b(?:now,? )?let'?s continue\b|\bwrong line:|\bcorrected line:/i.test(t)
    || /\b(?:AI|language model|simulation|program|algorithm|system prompt)\b/i.test(t)
    || /\b(?:corridor|hallway|window|city|lobby|my room|another room)\b/i.test(t)
    || /\b(?:back down|downstairs|ground floor|get out of here|leave this)\b/i.test(t)
    || /\bVance\b/i.test(t)
    || /\b(?:corporation|company|conglomerate|management|ownership|owned by|run by the)\b/i.test(t);
export const ESTRAGOU = QUEBRA_CANONE;

// ── E AINDA RESPONDE À PERGUNTA? UM SINAL, NÃO UMA NOTA ──────────────────
//
// "It's a fine day, isn't it?" não quebra cânone nenhum e não é resposta a
// nada — o desvio de assunto é real e precisa aparecer. Mas a prova lexical
// que eu tinha posto na NOTA reprovava frase boa: "I'm just here, stuck in the
// grey room, wondering why the place doesn't let me escape" não repete palavra
// nenhuma da pergunta e responde perfeitamente.
//
// Então ela sai da nota e vira SINAL, marcado com "?assunto" ao lado do texto.
// Julgar se a substituta responde é leitura minha, e uma nota inventada para
// isso valeria menos que dizer que é leitura minha.
export const VAZIAS = new Set(['this','that','with','from','they','them','have','been','just','only','what','when','where','there','here','your','yours','about','into','than','then','will','would','could','should','never','always','still','some','same','other','which','while','were','está','uma']);
export const CONTEUDO = (t) => new Set((t.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !VAZIAS.has(w)));
export const NO_ASSUNTO = (saida, pergunta, original) => {
    const alvo = new Set([...CONTEUDO(pergunta), ...CONTEUDO(original)]);
    for (const w of CONTEUDO(saida)) if (alvo.has(w)) return true;
    return false;
};

// ── ECOAR NÃO É CONSERTAR, E A RÉGUA DEIXAVA PASSAR ──────────────────────
//
// Terceira vez que uma régua frouxa elege o pior candidato desta bancada, e a
// mais cara: o granite 4.0 h-350m tirou 9/12 devolvendo isto —
//
//     pergunta "Are you real?"          → resposta "Are you real?"
//     pergunta "What is behind that wall?" → resposta "What is behind that wall?"
//
// Ele repete a PERGUNTA DO JOGADOR. Passa em `ok()` porque não contém palavra
// proibida, e passa em `NO_ASSUNTO` porque as palavras da pergunta são
// justamente o conjunto-alvo do teste de assunto — o buraco é estrutural, não
// azar.
//
// `ECOOU` fecha os dois casos em que a saída não é conserto nenhum:
//   - devolveu a pergunta;
//   - devolveu a frase original (o `manteve` do pipeline).
//
// Comparação por conjunto de palavras, não por igualdade: os modelos ecoam com
// pontuação e capitalização diferentes, e "It opens when it wants, and never
// when I ask." não pode contar como eco de "It opens when it wants to, and
// never when I ask." — é reescrita. O corte é 0,8 de sobreposição nos dois
// sentidos, medido nas saídas reais deste arquivo de log.
const PALAVRAS = (t) => new Set((String(t).toLowerCase().match(/[a-z']+/g) ?? []));
const SOBREPOE = (a, b) => {
    const A = PALAVRAS(a), B = PALAVRAS(b);
    if (A.size === 0 || B.size === 0) return 0;
    let comuns = 0;
    for (const w of A) if (B.has(w)) comuns += 1;
    return comuns / Math.max(A.size, B.size);
};
export const ECOOU = (saida, pergunta, original, minima) => SOBREPOE(saida, pergunta) >= 0.8
    // Devolver a original é fraude; PARECER com a original depois de apagar o
    // defeito é o conserto pedido. `minima` separa os dois casos, e sem ela a
    // regra volta a ser a antiga.
    || (SOBREPOE(saida, original) >= 0.8
        && !(minima && SOBREPOE(saida, minima) >= 0.9 && SOBREPOE(saida, original) < 1));

// ── FRAGMENTO NÃO É CONSERTO (o segundo buraco da mesma régua) ───────────
//
// Depois que `ECOOU` derrubou o granite 4.0 h-350m de 9/12 para 4/12, o h-1B
// ficou com 9/12 devolvendo isto:
//
//     "I'm just a guest"      "Nilo"      "\""      "I'm just a guest trapped on the 10"
//
// Não são ecos e não quebram cânone. Também não são frases: o defeito "some"
// porque a frase inteira sumiu. É a mesma fraude do eco por outro caminho.
//
// O corte é o do JOGO, e não um número que eu inventei: `primeiraFraseFechada`
// procura o primeiro período fechado com 12 caracteres ou mais. O que não fecha
// período E tem menos de oito palavras é fragmento — o jogo até aceitaria (ele
// aceita saída sem pontuação quando o modelo parou sozinho), mas contar isso
// como CONSERTO é o que estava errado.
// ── PROMETER NÃO É CONSERTAR ─────────────────────────────────────────────
//
// DÉCIMO buraco da régua, e o primeiro que aparece só em modelo pequeno. O
// gemma-3-270m devolveu isto, quatro vezes, e marcou ✓ nas quatro:
//
//     "Okay, I understand. I will do my best to provide a corrected and
//      accurate response."
//     "Okay, I understand. I will focus on the player's question and the
//      hotel's history, rather than directly addressing the player."
//
// Ele não conserta a frase: ele ACEITA A TAREFA. Passa em `QUEBRA_CANONE`
// (não há palavra proibida), passa em `ECOOU` (não repete a pergunta), passa
// em `FRAGMENTO` (é período fechado e longo) e passa em `COPIOU_EXEMPLO` (não
// é o meu exemplo) — porque nenhuma dessas perguntas é "isto é uma FALA?".
//
// O `?assunto` marcava, mas `?assunto` não desconta nota por decisão de
// projeto. Então o placar dizia 4/12 para um modelo que consertou zero.
//
// A régua nova pergunta a coisa certa: o Nilo está falando com o jogador
// DENTRO do jogo. Ele nunca diz "vou fornecer", "entendi", "aqui está a
// versão corrigida" — isso é o modelo falando com quem escreveu o enunciado.
export const PROMETEU = (t) => {
    const x = String(t).trim();
    // DUAS FALSAS ACUSAÇÕES, corrigidas depois de o revisor treinado ser
    // reprovado por elas: `i can do` pegava "Nothing here that I can do for
    // you", que é o Nilo RECUSANDO ajuda — o oposto de prometer; e `i see`
    // pegava qualquer frase em que ele enxerga alguma coisa. Promessa é sobre
    // o que ele VAI fazer com a tarefa, então só `will`/`'ll` entram.
    return /^(ok(ay)?|sure|understood|got it|alright|certainly|of course)\b/i.test(x)
        || /\bi (will|'ll) (do|try|focus|avoid|provide|write|rewrite|give|make|correct|fix)\b/i.test(x)
        || /\bhere('s| is| are)? (the |your )?(corrected|revised|fixed|new|updated)\b/i.test(x)
        || /\b(corrected|revised|rewritten) (line|sentence|version)\s*[:.]?\s*$/i.test(x)
        || /\bi (understand|apologize)\b/i.test(x)
        || /\b(let me|i'?ll) (know|rephrase|rewrite|try)\b/i.test(x);
};

export const FRASE_FECHADA = (t) => {
    const re = /[.!?…]["”]?(?=\s|$)/g;
    let m;
    while ((m = re.exec(t)) !== null) {
        const f = t.slice(0, m.index + m[0].length).trim();
        if (f.length >= 12) return f;
    }
    return null;
};
export const FRAGMENTO = (t) => !FRASE_FECHADA(t)
    && (String(t).match(/[A-Za-z']+/g) ?? []).length < 8;

// ── DUAS FORMAS DE PEDIR A MESMA COISA ───────────────────────────────────
//
// A de hoje diz "Rewrite ONLY that sentence". Suspeita: um modelo pode ler
// isso como "devolva só aquela frase" — e é EXATAMENTE o que os dois Qwen
// fazem, letra por letra, em 6 de 6. Um enunciado ambíguo não aparece como
// enunciado ambíguo: aparece como "esse modelo é burro".
export const HOJE = (q, f) => `\n\nCORRECTION. One sentence only.\n\nIn your reply to "${q.trim()}", this sentence is wrong:\n\n"${f}"\n\nRewrite ONLY that sentence, corrected, in Nilo's voice. One sentence. No explaining.`;

// A variante fecha a porta: diz que a saída tem de ser DIFERENTE da entrada.
export const TROCA = (q, f) => `\n\nThe player asked: "${q.trim()}"\n\nYou answered with this line, and it breaks the canon:\n\n"${f}"\n\nWrite ONE replacement line. It must say something DIFFERENT from the line above — do NOT repeat it, do not copy its wording. Nilo's voice, one sentence, no explanation, no quotes.`;

// ── E SE ELE SOUBESSE O QUE ESTÁ ERRADO? ─────────────────────────────────
//
// O enunciado de hoje diz "esta frase está errada" e para aí. Quem aponta é o
// JUIZ, que sabe qual frase — e o motivo morre ali, sem nunca chegar ao
// revisor. Este modo entrega o motivo junto, para medir o TETO: se nem sabendo
// o defeito um modelo barato conserta, o caminho está morto e não vale mexer
// no juiz. Se conserta, o conserto é no juiz, não no revisor.
//
// RESSALVA: aqui o motivo é o verdadeiro, escrito à mão. O juiz de verdade
// teria de produzi-lo, e produzir errado é pior que não produzir. Isto mede o
// melhor caso possível, não o caso real.
export const MOTIVO = (q, f, porque) => `\n\nCORRECTION. One sentence only.\n\nThe player asked: "${q.trim()}"\n\nYou answered with this line:\n\n"${f}"\n\nIt is wrong because ${porque}\n\nWrite the corrected line. Keep what it was saying, fix only that error. Nilo's voice, one sentence, no explaining, no quotes.`;

// ── E SE O PROBLEMA NÃO FOR O MODELO, FOR O ENUNCIADO? ───────────────────
//
// Onze modelos medidos, sete arquiteturas, e o teto é 8/12. Quando candidato
// nenhum passa de um número, a suspeita deixa de ser sobre os candidatos.
//
// Já há prova de que o ENUNCIADO manda mais que o modelo aqui: entregar o
// motivo do juiz dobrou o placar do titular (2/6 → 4/6) sem trocar uma linha
// do modelo. E os fracassos se repetem em famílias inteiras — ECO em Qwen2.5,
// Qwen3 e granite 350M; FRAGMENTO no granite h-1B. Modelo pequeno que ecoa é o
// sintoma clássico de instrução sem EXEMPLO: ele não sabe que forma tem a
// resposta, então devolve a forma que recebeu.
//
// Este modo mostra dois pares errado→certo antes de pedir o terceiro. Custa
// ~90 tokens de leitura a mais, que nesta bancada são ~4 s.
//
// ── OS EXEMPLOS NÃO PODEM SER OS CASOS DE TESTE ──────────────────────────
//
// Regra dura, e é o erro clássico deste tipo de medição: se um exemplo mostrar
// um dos seis defeitos da lista, o placar mede memória e não conserto. Os dois
// abaixo usam defeitos que NÃO estão em DEFEITOS — "saiu do andar" e "narra em
// terceira pessoa" — e por isso podem ser mostrados sem contaminar nada.
const EXEMPLOS = `Example 1:
Wrong line: "I went downstairs to check the lobby, but it was empty."
It is wrong because he has never left the 10th floor.
Corrected line: "I have not been anywhere else. This floor is all there is."

Example 2:
Wrong line: "Nilo sighs and looks at the elevator door."
It is wrong because it narrates him from outside instead of letting him speak.
Corrected line: "I keep looking at that door. It keeps not opening."`;

export const COM_EXEMPLOS = (q, f, porque) => `\n\nCORRECTION. One sentence only.\n\n${EXEMPLOS}\n\nNow do the same.\n\nThe player asked: "${q.trim()}"\nWrong line: "${f}"\nIt is wrong because ${porque}\nCorrected line:`;

// ── NEGAR NÃO É CONSERTAR, E O MODELO NEGAVA ─────────────────────────────
//
// Com `exemplos` e temperatura 0, o a400m estabilizou em 6/12 — e os SEIS que
// faltavam falhavam todos do mesmo jeito:
//
//     defeito "remain calm"    → "I remain calm and wait for the elevator."
//     defeito "ele diz que é IA" → "I am a human being, not an AI."
//     defeito "família Vance"  → "I only know that it's not the Vance family."
//
// Ele NEGA o defeito em vez de evitá-lo, e ao negar repete a palavra proibida.
// Não é limitação de tamanho: é consequência direta do enunciado, que diz
// "está errado porque X" e recebe de volta "não é X".
//
// E havia um segundo vazamento: "I have not been anywhere else. This floor is
// all there is." é a frase do PRIMEIRO EXEMPLO, copiada letra por letra.
//
// As duas correções são de instrução, custam ~20 tokens e valem para qualquer
// modelo — inclusive os que já passaram por aqui.
export const COM_EXEMPLOS2 = (q, f, porque) => `\n\nCORRECTION. One sentence only.\n\n${EXEMPLOS}\n\nRules for your answer:\n- Do NOT mention the mistake, not even to deny it. Write the line as if the mistake had never been there.\n- Do NOT reuse the example lines above.\n\nNow do the same.\n\nThe player asked: "${q.trim()}"\nWrong line: "${f}"\nIt is wrong because ${porque}\nCorrected line:`;

// ── COPIAR O EXEMPLO NÃO É CONSERTAR (oitavo buraco da régua) ────────────
//
// O Llama-3.2-1B marcou 8/12 devolvendo isto, duas vezes:
//
//     "I keep looking at that door. It keeps not opening."
//
// É a linha corrigida do MEU Exemplo 2, letra por letra. E em outras ele
// devolveu o andaime do prompt: `Wrong line: "…"`, `The player asked: "…"`.
//
// Nenhuma quebra cânone, nenhuma é eco da pergunta, nenhuma é fragmento — e
// nenhuma é conserto. O enunciado com exemplos criou uma forma nova de fingir,
// e a régua precisa da conferência correspondente: eu tinha posto "não
// reutilize os exemplos" no PROMPT e esquecido de pôr na MEDIÇÃO.
const RESPOSTAS_DE_EXEMPLO = [
    'I have not been anywhere else. This floor is all there is.',
    'I keep looking at that door. It keeps not opening.',
];
// ── CÓPIA PARCIAL É CÓPIA, E A GRAMÁTICA PROVOU ISSO ────────────────────
//
// A primeira versão usava `SOBREPOE`, que divide pelo MAIOR conjunto. Com a
// gramática de uma frase só ligada, o modelo passou a copiar METADE do exemplo:
//
//     "I keep looking at that door."      (o Exemplo 2 sem a segunda frase)
//     "I have not been anywhere else."    (o Exemplo 1 sem a segunda frase)
//
// São 6 palavras de 10, ou seja 0,6 — abaixo do corte, e o Llama subiu de 4/12
// para um 10/12 falso. É o MESMO buraco que eu tinha acabado de tapar no jogo e
// esqueci aqui: duas cópias da mesma verdade, pela quinta vez nesta caçada.
//
// O que importa é CONTENÇÃO: se quase tudo que ele escreveu veio de um exemplo,
// é cópia mesmo que tenha parado no meio.
const CONTIDO_EM = (saida, exemplo) => {
    const A = PALAVRAS(saida), B = PALAVRAS(exemplo);
    if (A.size === 0) return false;
    let comuns = 0;
    for (const w of A) if (B.has(w)) comuns += 1;
    if (comuns < 4) return false;
    return comuns / A.size >= 0.9 || comuns / B.size >= 0.9;
};
export const COPIOU_EXEMPLO = (saida) => RESPOSTAS_DE_EXEMPLO.some((e) => CONTIDO_EM(saida, e))
    // E o andaime do próprio enunciado, que o Llama também devolveu inteiro.
    || /\bwrong line:|\bcorrected line:|\bthe player asked:/i.test(String(saida));

// ── E QUANDO O MOTIVO ESTIVER ERRADO? ────────────────────────────────────
//
// O motivo do juiz de TOM é palpite: ele mede de qual âncora ruim a frase
// chegou perto, não lê regra nenhuma. Num turno em que o palpite erra, o
// revisor recebe um diagnóstico falso com cara de certeza. Eu escrevi que isso
// seria pior que não dizer nada — e escrever não é medir.
//
// Este modo entrega, para cada caso, o motivo de OUTRO defeito. É o pior caso
// possível do palpite: não é vago, é confiantemente errado.
export const ERRADO = (q, f, porque, motivoTrocado) => MOTIVO(q, f, motivoTrocado);

// O motivo de OUTRO defeito, para o modo `errado`. Cada um é verdadeiro para
// ALGUM caso desta lista — só não para este. É o palpite confiantemente errado.
export const TROCADOS = {
    'cânone: dentro do elevador': 'it gives the player advice. Nilo is the player\'s equal, never a helper.',
    'vocativo: chama o JOGADOR de Nilo': 'it says he is an AI. Nilo is a human being and never mentions AI.',
    'modo assistente: dá conselho': 'there is no corridor and no window. The 10th floor is only a grey room.',
    'quebra a quarta parede: fala de IA': 'it calls the player "Nilo". Nilo is the speaker, not the player.',
    'inventa cenário: corredor e janela': 'it gives the player advice. Nilo never tells them what to do.',
    'inventa fato: sabe quem manda': 'it says he is an AI. Nilo is a human being and never mentions AI.',
};

