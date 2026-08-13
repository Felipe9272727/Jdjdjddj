import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import {
    MAX_HISTORICO, npc, npcAutonomousSay, npcReset, npcSaiuDoAndar, npcSet,
} from '../npc/npcStore';

// ── O ECO DA VISITA ANTERIOR ──────────────────────────────────────────────
//
// A loja do NPC vive fora do React de propósito: o cérebro dele não pode
// reiniciar porque um componente desmontou. Mas isso vale para o CÉREBRO, e não
// para o que está na TELA — e a distinção não existia, então o jogador que
// saísse e voltasse ao Andar 10 encontrava restos da visita anterior.

describe('sair do andar apaga o eco', () => {
    beforeEach(() => { npcReset(); });

    it('o aviso de "Conversar" não fica aceso com o Nilo longe', () => {
        // ── O BUG, EXATAMENTE ────────────────────────────────────────────
        // O `Floor10Npc` publica proximidade comparando com um ref LOCAL, que
        // nascia `false` a cada montagem. Se a loja tivesse `true` quando o
        // jogador saiu (Nilo perto, seguindo ele), na volta o ref dizia `false`,
        // a loja dizia `true`, e `near !== nearRef.current` era falso — a loja
        // nunca era corrigida. O aviso "💬 Conversar (E)" acendia com o Nilo do
        // outro lado da sala, e o E abria o painel de verdade.
        npcSet({ near: true });
        npcSaiuDoAndar();
        expect(npc.near).toBe(false);
    });

    it('a bolha e a fala da visita passada não reaparecem', () => {
        npcSet({
            deliberationBubble: 'você vai mesmo ficar aí parado?',
            deliberationLive: 'ele está parado há um tempo, talvez',
            deliberationGoal: 'approach-player',
            autonomousSpeech: 'ei, espera',
            streaming: 'meia frase',
            speaking: true,
        });
        npcSaiuDoAndar();
        expect(npc.deliberationBubble).toBe('');
        expect(npc.deliberationLive).toBe('');
        expect(npc.deliberationGoal).toBe('');
        expect(npc.autonomousSpeech).toBe('');
        expect(npc.streaming).toBe('');
        expect(npc.speaking).toBe(false);
    });

    it('mas a CONVERSA sobrevive — é a memória dele, não eco', () => {
        // A diferença que este arquivo inteiro existe para marcar. Apagar a
        // conversa junto seria "consertar" o eco jogando fora o personagem.
        npcSet({ history: [{ role: 'user', content: 'você lembra de mim?' }] });
        npcSaiuDoAndar();
        expect(npc.history).toHaveLength(1);
        expect(npc.history[0].content).toBe('você lembra de mim?');
    });

    it('um pensamento EM CURSO não fica pendurado como "pensando"', () => {
        // `thinking` na volta é uma promessa que ninguém vai cumprir: a rodada
        // morreu junto com o componente.
        npcSet({ deliberationPhase: 'thinking' });
        npcSaiuDoAndar();
        expect(npc.deliberationPhase).toBe('off');
    });

    it('mas uma fase que NÃO era um pensamento vivo é preservada', () => {
        // `unavailable` é um fato sobre o aparelho (não coube na memória), não
        // sobre a visita. Zerar isso faria o jogo tentar de novo a cada volta.
        npcSet({ deliberationPhase: 'unavailable' });
        npcSaiuDoAndar();
        expect(npc.deliberationPhase).toBe('unavailable');
    });
});

describe('e a limpeza está LIGADA — não só escrita', () => {
    // ── O ERRO QUE JÁ ACONTECEU AQUI ──────────────────────────────────────
    // Uma vez neste projeto eu escrevi um aviso novo, testei a função, e ela
    // ficou DESCONECTADA — ninguém chamava. O teste da função passava e o jogo
    // não mudava. Desde então, funcionalidade que depende de fiação ganha um
    // teste da fiação, separado do teste do comportamento.
    it('o Floor10Npc chama npcSaiuDoAndar ao desmontar', async () => {
        const fs = await import('node:fs/promises');
        const fonte = await fs.readFile(
            new URL('../Floor10Npc.tsx', import.meta.url), 'utf8',
        );
        expect(fonte).toContain('npcSaiuDoAndar');
        // Dentro de um `return () => { ... }` de efeito, que é o desmonte.
        const limpeza = /return \(\) => \{[\s\S]{0,400}?npcSaiuDoAndar\(\)/.test(fonte);
        expect(limpeza, 'npcSaiuDoAndar existe mas não está na limpeza do efeito')
            .toBe(true);
    });

    it('e cancela as conferências de consequência agendadas', () => {
        // Elas são marcadas de dentro de um callback assíncrono do `useFrame` e
        // sobreviviam ao desmonte: disparavam com o jogador já em outro andar,
        // medindo o efeito de um gesto num mundo que não existe mais.
        const fonte = readFileSync(
            new URL('../Floor10Npc.tsx', import.meta.url), 'utf8',
        );
        expect(fonte).toContain('conferencias.current.add(');
        expect(/clearTimeout\(bilhete\)/.test(fonte)).toBe(true);
    });
});

describe('a conversa tem teto — senão a digitação engasga com o tempo', () => {
    beforeEach(() => { npcReset(); });

    it('o histórico para de crescer no limite, guardando as MAIS RECENTES', () => {
        // Não é memória: é ENGASGO. O painel republica a loja a cada token do
        // streaming, e o React refaz o `history.map(...)` inteiro em cada uma
        // dessas publicações. Sem teto, a resposta do Nilo fica mais travada
        // quanto mais vocês já conversaram — o contrário do que deveria.
        const muitas = Array.from({ length: MAX_HISTORICO + 40 }, (_, i) => ({
            role: 'user' as const, content: `mensagem ${i}`,
        }));
        npcSet({ history: muitas });
        expect(npc.history).toHaveLength(MAX_HISTORICO);
        // As últimas são as que ficam: perder o começo de uma sessão longa é o
        // preço, e ninguém rola tanto para trás.
        expect(npc.history[npc.history.length - 1].content)
            .toBe(`mensagem ${MAX_HISTORICO + 39}`);
    });

    it('o teto vale também para a fala autônoma, que entra por outra porta', () => {
        npcSet({
            history: Array.from({ length: MAX_HISTORICO }, (_, i) => ({
                role: 'user' as const, content: `m${i}`,
            })),
        });
        npcAutonomousSay('você ainda está aí?');
        expect(npc.history).toHaveLength(MAX_HISTORICO);
        expect(npc.history[npc.history.length - 1].content).toBe('você ainda está aí?');
    });

    it('e o teto é bem maior que o que o modelo lê — não é poda de contexto', () => {
        // O prompt usa 6 mensagens (`modelHistory(..., 6)`). Se o teto chegasse
        // perto disso, esta poda passaria a mudar o que o Nilo SABE, e aí seria
        // outra decisão, com outro dono.
        expect(MAX_HISTORICO).toBeGreaterThan(6 * 4);
    });
});
