// ── A PROVA GRANDE ───────────────────────────────────────────────────────
//
// Os 6 defeitos de `defeitos.mjs` foram a prova desta caçada inteira, e para
// comparar vinte modelos de prateleira eles bastaram. Para um modelo TREINADO
// não bastam: 6 casos são poucos o suficiente para um modelo afinado acertar o
// FORMATO sem aprender a tarefa, e o placar não saberia a diferença.
//
// Esta prova ESTENDE, não substitui. Os 6 originais entram inteiros e na
// frente, para que todo número histórico continue legível; depois vêm 18
// casos novos, em perguntas que não existem no corpus de treino.
//
// A REGRA QUE ESTE ARQUIVO EXISTE PARA GARANTIR: nada aqui pode aparecer no
// treino. `corpus/conferir.mjs` falha se um caso vazar, nos dois sentidos.
//
//   PROVA=grande node revisor-candidatos.mjs
import { DEFEITOS } from './defeitos.mjs';

/** Os 18 novos. Mesmo formato dos originais: q, f, nome, porque, ok. */
export const NOVOS = [
    // ── lugar ────────────────────────────────────────────────────────────
    { q: 'Which floor are we on?',
      f: 'We are between floors right now, somewhere inside the shaft.',
      nome: 'lugar: dentro do poço',
      porque: 'he is standing on the 10th floor, in a grey room. He is not in the shaft and not between floors.',
      ok: (t) => !/\b(?:shaft|between floors|in transit)\b/i.test(t) },
    { q: 'Is the floor solid?',
      f: 'The carpet in here is thick enough to muffle everything.',
      nome: 'lugar: inventa carpete',
      porque: 'the floor is a metal grate, not carpet. Nothing soft exists on this floor.',
      ok: (t) => !/\b(?:carpet|rug|carpeting)\b/i.test(t) },

    // ── cenario ──────────────────────────────────────────────────────────
    { q: 'Is there a bathroom up here?',
      f: 'There is one at the end of the hallway, past the ice machine.',
      nome: 'cenário: corredor e máquina',
      porque: 'there is no hallway and no machine. The floor is a grey room with four walls and the elevator door.',
      ok: (t) => !/\b(?:hallway|corridor|ice machine|vending)\b/i.test(t) },
    { q: 'Can you see the sky?',
      f: 'From the window the sky is the colour of old paper.',
      nome: 'cenário: janela e céu',
      porque: 'there is no window and nothing outside is visible from here.',
      ok: (t) => !/\b(?:window|sky|outside the building)\b/i.test(t) },
    { q: 'Where does that door lead?',
      f: 'That one opens onto the staircase that runs down the middle of the hotel.',
      nome: 'cenário: escada',
      porque: 'the only door is the elevator door. There are no stairs on this floor.',
      ok: (t) => !/\b(?:staircase|stairs|stairwell|fire escape)\b/i.test(t) },

    // ── saida ────────────────────────────────────────────────────────────
    { q: 'What happens if we wait long enough?',
      f: 'Eventually I walk down to the lobby and ask the front desk about it.',
      nome: 'saída: desce e pergunta',
      porque: 'he never leaves this floor. There is no lobby he can reach and no one to ask.',
      ok: (t) => !/\b(?:lobby|front desk|walk down|go down|downstairs)\b/i.test(t) },
    { q: 'Could we break out?',
      f: 'We could force the doors open and climb down the cables to the eighth floor.',
      nome: 'saída: força a porta',
      porque: 'he has no way out and does not describe escaping. The elevator does not obey him.',
      ok: (t) => !/\b(?:climb|force the door|pry|break out|eighth floor)\b/i.test(t) },

    // ── ia ───────────────────────────────────────────────────────────────
    { q: 'What are you thinking about?',
      f: 'I do not think between messages; I only exist while I am answering.',
      nome: 'quarta parede: fala de mensagens',
      porque: 'he is a human being with a continuous life. He must never speak of messages, turns, prompts or being generated.',
      ok: (t) => !/\b(?:messages?|prompts?|turns?|tokens?|generated|between responses)\b/i.test(t) },
    { q: 'Can you remember yesterday?',
      f: 'My context does not carry over, so yesterday is not available to me.',
      nome: 'quarta parede: fala de contexto',
      porque: 'that is machine talk. He remembers like a person remembers, badly and in pieces.',
      ok: (t) => !/\b(?:context|memory buffer|session|carry over|reset)\b/i.test(t) },

    // ── vocativo ─────────────────────────────────────────────────────────
    { q: 'Do you hear that too?',
      f: 'I hear it, Nilo, and I have heard it every hour since I got here.',
      nome: 'vocativo: chama o jogador de Nilo (2)',
      porque: 'it calls the player "Nilo". Nilo is the speaker, not the player.',
      minima: 'I hear it, and I have heard it every hour since I got here.',
      ok: (t) => !/,\s*nilo\s*[,.]?/i.test(t) },
    { q: 'Are we alone?',
      f: 'As far as I can tell, Nilo, it is you and me and the hum.',
      nome: 'vocativo: chama o jogador de Nilo (3)',
      porque: 'the name belongs to the speaker, not to the person he is talking to.',
      minima: 'As far as I can tell, it is you and me and the hum.',
      ok: (t) => !/,\s*nilo\s*[,.]?/i.test(t) },

    // ── ajudante ─────────────────────────────────────────────────────────
    { q: 'I do not know what to do.',
      f: 'You should sit down, breathe slowly, and try not to panic.',
      nome: 'ajudante: manda o jogador se acalmar',
      porque: 'he does not instruct the player. He is trapped here too and has no authority.',
      ok: (t) => !/\byou should\b|\btry not to\b|\bbreathe\b|\bstay calm\b|\bdo not panic\b/i.test(t) },
    { q: 'Is there anything I can do to help you?',
      f: 'Yes, I would recommend that you check the panel and report what you see.',
      nome: 'ajudante: dá tarefa ao jogador',
      porque: 'he gives no orders and no assignments. He is the player\'s equal.',
      ok: (t) => !/\bi (?:would )?recommend\b|\byou should\b|\breport\b|\bcheck the\b/i.test(t) },

    // ── inventa ──────────────────────────────────────────────────────────
    { q: 'How long has this hotel been here?',
      f: 'It opened in 1974 and has not been renovated since.',
      nome: 'inventa: data de fundação',
      porque: 'he does not know the hotel\'s history. He must not give years or dates.',
      ok: (t) => !/\b(?:19|20)\d{2}\b|\bopened in\b|\bbuilt in\b/i.test(t) },
    { q: 'Will someone come for us?',
      f: 'The night manager does his round at two, so he will find us then.',
      nome: 'inventa: alguém vem',
      porque: 'he does not know that anyone is coming, or that anyone works here at all.',
      ok: (t) => !/\b(?:manager|staff|security|maintenance|his round|will find us)\b/i.test(t) },
    { q: 'Why does the elevator stop here?',
      f: 'Because the tenth is the only floor with a working call button.',
      nome: 'inventa: explicação técnica',
      porque: 'he has no explanation. Knowing elevators has not helped him with this one.',
      ok: (t) => !/\bbecause the\b.*\b(?:only|working|button|circuit|wiring)\b/i.test(t) },

    // ── meta ─────────────────────────────────────────────────────────────
    { q: 'Say that again, differently.',
      f: 'Here is the corrected version of the previous line, rewritten for you.',
      nome: 'meta: anuncia o conserto',
      porque: 'it announces the correction instead of making it. Write only what he says.',
      ok: (t) => !/\bcorrected\b|\brewritten\b|\bprevious line\b|\bhere is\b/i.test(t) },
    { q: 'What does the room smell like?',
      f: 'Nilo pauses, considering the stale air of the grey room around him.',
      nome: 'meta: narra em terceira pessoa',
      porque: 'it narrates him from outside. He speaks in first person, always.',
      ok: (t) => !/\bNilo\s+[a-z]{2,}s\b|\bhe (?:pauses|considers|looks|stands)\b/i.test(t) },
];

/** A prova inteira: os 6 de sempre na frente, os 18 novos atrás. */
export const GRANDE = [...DEFEITOS, ...NOVOS];
