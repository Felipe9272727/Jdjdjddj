import { beforeEach, describe, expect, it } from 'vitest';

/**
 * ── A FOTO QUE ELE MANDOU DO APARELHO ─────────────────────────────────────
 *
 * Balão preso em "Nilo está voltando a pensar…", chat fechado, status Ready,
 * e o relato: "ele nunca mais pensa".
 *
 * A sequência que produz isso em uso normal:
 *
 *   fecha o chat  -> 12s -> `precarregarVontade()` começa a REABRIR
 *   abre o chat   -> o roteamento chama `unloadSmallBrain` -> `abortDeliberation`
 *                    -> `loadAbort.abort()` no meio da reabertura
 *
 * E aí dois buracos, que só juntos dão o sintoma permanente:
 *
 *   1. `abortDeliberation` só devolvia a fase para 'off' vinda de 'thinking' ou
 *      'loading'. 'reopening' entrou no vocabulário depois e ninguém voltou
 *      aqui — a fase congelava e a tela mentia para sempre.
 *   2. `ensureSmallEngine` guarda a promessa (`enginePromise ??=`). No ramo
 *      abortado ela não era limpa, então o `null` ficava EM CACHE e toda
 *      tentativa seguinte devolvia null na hora, sem tentar. A vontade morria
 *      pelo resto da sessão.
 *
 * O defeito era latente; o roteamento que eu instalei (desligar a vontade ao
 * ABRIR o chat) o tornou alcançável a cada abertura.
 */
describe('a vontade não pode ficar presa em "voltando a pensar"', () => {
    beforeEach(async () => {
        const { resetSmallBrainForTests } = await import('../npc/floor10SmallBrain');
        const { npcSet } = await import('../npc/npcStore');
        resetSmallBrainForTests();
        npcSet({ open: false, phase: 'cold' });
    });

    it('abortar durante a REABERTURA devolve a fase para repouso', async () => {
        const { abortDeliberation } = await import('../npc/floor10SmallBrain');
        const { npc, npcSet } = await import('../npc/npcStore');
        npcSet({
            deliberationPhase: 'reopening',
            deliberationLoadText: 'reabrindo o LFM2.5 (já está no aparelho)…',
        });
        abortDeliberation();
        // Sem isto o jogador fica olhando "voltando a pensar…" para sempre.
        expect(npc.deliberationPhase).not.toBe('reopening');
        expect(npc.deliberationPhase).toBe('off');
    });

    it('a mesma coisa pelo caminho que o roteamento usa de verdade', async () => {
        // RESSALVA HONESTA: este teste NÃO pega o defeito de cima sozinho.
        // `unloadSmallBrain` faz o próprio `npcSet({deliberationPhase:'off'})`
        // depois de `abortDeliberation`, então ele passava mesmo com o conserto
        // desfeito — conferido, desfazendo. Ele fica como guarda do CAMINHO: se
        // um dia o roteamento parar de terminar em repouso, isto acusa. Quem
        // prova o conserto é o teste acima.
        const { unloadSmallBrain } = await import('../npc/floor10SmallBrain');
        const { desligarQuemNaoEDaVez } = await import('../npc/floor10Roteamento');
        const { npc, npcSet } = await import('../npc/npcStore');
        npcSet({ deliberationPhase: 'reopening' });
        await desligarQuemNaoEDaVez(true, { vontade: () => unloadSmallBrain() });
        expect(npc.deliberationPhase).toBe('off');
    });

    it('abortar uma reabertura em curso não deixa promessa morta em cache', async () => {
        // A sequência exata do aparelho dele: a reabertura começa (fechou o
        // chat) e é abortada no meio (abriu de novo).
        //
        // `vontadeRuntimeAberto()` é `enginePromise !== null`. Sem o conserto, a
        // promessa que resolveu `null` fica guardada e esta função responde
        // `true` — "o runtime está aberto" — sobre um runtime que não existe.
        // Duas consequências, as duas no relato: `ensureSmallEngine` devolve o
        // null guardado para sempre ("nunca mais pensa"), e `rearmeAposFala`
        // acha que não há reabertura a pagar e usa 6s em vez de 45s.
        const {
            precarregarVontade, abortDeliberation, vontadeRuntimeAberto,
            resetSmallBrainForTests,
        } = await import('../npc/floor10SmallBrain');
        const { npcSet } = await import('../npc/npcStore');
        resetSmallBrainForTests();
        npcSet({ open: false, phase: 'cold' });

        const alvo = globalThis as { __wllamaCdn?: string };
        const cdnOriginal = alvo.__wllamaCdn;
        alvo.__wllamaCdn = 'https://127.0.0.1:1/nao-existe';

        const carga = precarregarVontade();
        abortDeliberation();   // é isto que o roteamento faz ao abrir o chat
        await carga.catch(() => false);

        alvo.__wllamaCdn = cdnOriginal;
        expect(vontadeRuntimeAberto()).toBe(false);
    });
});
