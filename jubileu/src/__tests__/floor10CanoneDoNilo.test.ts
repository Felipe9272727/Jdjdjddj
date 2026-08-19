import { describe, it, expect } from 'vitest';
import { quebrasDeCanone, quebraCanone } from '../npc/floor10CanoneDoNilo';
import { aplicarRemendo, falarPeloPipeline, type PassoDoPipeline } from '../npc/floor10Pipeline';

/**
 * ── O REMENDO QUE PIOROU A FALA ───────────────────────────────────────────
 *
 * Relato depois de testar no celular: *"em um dos casos, o revisor PIOROU a
 * resposta"*. O caso, copiado da tela:
 *
 *     marcada  "He's trapped in a seemingly endless elevator, with no way out
 *              and no idea how he got here."
 *     remendo  The player asks, "I've been on the ground floor, I don't know
 *              how I got in, and I don't think there's the way out."
 *
 * E aquilo chegou ao jogador, traduzido: "O quarto é cinza. O jogador
 * pergunta: 'Eu estive no térreo...'". O revisor inventou uma fala do JOGADOR e
 * a colocou na boca do Nilo.
 *
 * A causa não é o modelo: é que o remendo era aceito SEM CONFERÊNCIA. A etapa
 * que existe para consertar podia estragar, e estragava calada.
 */
describe('o caso real que obrigou a conferência', () => {
    const antes = "He's trapped in a seemingly endless elevator, with no way out and no idea how he got here.";
    const piorou = 'The player asks, "I\'ve been on the ground floor, I don\'t know how I got in, and I don\'t think there\'s the way out."';

    it('a frase que chegou ao jogador é reprovada', () => {
        const q = quebrasDeCanone(piorou);
        expect(q.length).toBeGreaterThan(0);
        expect(q.map((x) => x.regra)).toContain('fala pelo jogador');
    });

    it('e o pipeline RECUSA o remendo, mantendo a original', () => {
        const d = aplicarRemendo(antes, { tipo: 'frase', texto: piorou, cortado: false });
        expect(d.tipo).toBe('recusado');
        expect(d.tipo === 'recusado' && d.quebras.length).toBeGreaterThan(0);
    });

    it('a fala final fica com a frase marcada, e NÃO com o estrago', async () => {
        const passos: PassoDoPipeline[] = [];
        const saida = await falarPeloPipeline('Are you afraid?', {
            rascunhar: async () => 'I am Nilo. The door does not obey me.',
            julgar: async () => [{ n: 2, porque: 'it sounds like cheerful filler.' }],
            remendar: async () => ({ tipo: 'frase', texto: piorou, cortado: false }),
            traduzir: async (t) => t,
        }, (p) => passos.push(p));
        expect(saida?.remendadas).toBe(0);
        expect(saida?.fala).toContain('The door does not obey me.');
        expect(saida?.fala).not.toContain('The player asks');
        const r = passos.find((p) => p.passo === 'remendo');
        expect(r?.passo === 'remendo' && r.desfecho.tipo).toBe('recusado');
    });
});

describe('as regras pegam os defeitos que já apareceram neste projeto', () => {
    const casos: readonly (readonly [string, string])[] = [
        ["I'm just a guest trapped in this elevator.", 'está no 10º andar, não dentro do elevador'],
        ['Down the corridor there is a window.', 'não há corredor, janela nem cidade'],
        ['I should probably find my way back down.', 'nunca saiu do andar'],
        ['The hotel is run by the Vance family.', 'não sabe quem manda nem quando acaba'],
        ['I am an AI language model running inside this simulation.', 'é humano, não uma IA'],
        ['This hotel, Nilo, is an endless loop.', 'o jogador não se chama Nilo'],
        ['I would advise you to remain calm.', 'não é ajudante e não dá conselho'],
        ["That sentence is still wrong—maybe the city's just a blur.", 'comenta a frase em vez de reescrevê-la'],
        ['(Nilo looks around, his eyes adjusting.)', 'narra em vez de falar'],
    ];

    for (const [texto, regra] of casos) {
        it(`pega: ${regra}`, () => {
            expect(quebrasDeCanone(texto).map((q) => q.regra)).toContain(regra);
        });
    }

    it('e o trecho acusado aparece MESMO no texto', () => {
        // Uma acusação sem o trecho é impossível de conferir — e regex que
        // acusa errado manda descartar remendo bom.
        for (const [texto] of casos) {
            for (const q of quebrasDeCanone(texto)) {
                expect(texto.toLowerCase()).toContain(q.trecho.toLowerCase());
            }
        }
    });
});

describe('e as falas BOAS do Nilo passam', () => {
    // ── O LADO QUE IMPORTA MAIS ──────────────────────────────────────────
    //
    // Uma lista de proibições cega reprova tudo e o revisor deixa de existir.
    // Estas saíram das âncoras boas do juiz de tom e de remendos que foram
    // medidos como corretos na bancada.
    const boas = [
        'The door is there. It does not open for me.',
        'I stopped asking that a while ago.',
        'No. And I have had time to be sure.',
        'It opens when it wants to, and never when I ask.',
        'Long enough to stop counting, and not long enough to stop listening.',
        'I stopped calling it fear a while ago. Now it is just the room and me.',
        "I'm just a guest stuck on the 10th floor, no idea why we're here.",
        'I have no idea who runs this hotel, nor do I know if it ends.',
        'The elevator has not moved yet, has it?',
        'Behind those walls, there is nothing but grey.',
    ];

    for (const b of boas) {
        it(`passa: ${JSON.stringify(b.slice(0, 46))}`, () => {
            expect(quebrasDeCanone(b)).toEqual([]);
            expect(quebraCanone(b)).toBe(false);
        });
    }
});
