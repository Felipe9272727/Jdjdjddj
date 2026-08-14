import { describe, it, expect } from 'vitest';
import { alvoDaProsa, planoDaProsa, verboDaProsa, ordemNegada, ordemRecusada, casasDaProsa,
} from '../npc/floor10Prosa';
import { FLOOR10_MOTOR_TARGETS, FLOOR10_MOTOR_VERBS } from '../npc/floor10MotorCortex';

// ── AS FIXTURES SÃO SAÍDAS REAIS, COPIADAS DO RELATÓRIO ───────────────────
//
// Nenhuma destas frases fui eu que inventei. Todas saíram do Qwen3-0.6B na
// bancada, traduzindo os sete pensamentos reais do dono do jogo, e estão
// gravadas no campo `bruto` do relatório. Testar contra o que o modelo
// ESCREVE — e não contra o que eu acho que ele escreveria — é a diferença
// entre um parser que funciona e um parser que passa nos meus próprios testes.
const REAIS = {
    paredeNorte: 'MOTION: turn right | north wall | slow | 3  \nACT: look-around | north wall',
    paredeOeste: 'MOTION: move west-side | pace slow | duration 3  \nACT: look-around | target west-side',
    ateEle: 'MOTION: walk to him | ACT: wave',
    // Rascunho: o modelo estourou o teto de tokens repetindo o enunciado.
    rascunho: "Okay, let's tackle this. The user wants me to analyze Nilo's thought "
        + 'and report three things: the intention, a movement and a gesture. The player '
        + 'is somewhere to his left, and the elevator is behind him.',
};

describe('floor10Prosa — as saídas REAIS do modelo', () => {
    it('"MOTION: turn right | north wall" vira approach + north-side', () => {
        const p = planoDaProsa(REAIS.paredeNorte);
        expect(p?.verb).toBe('approach');
        expect(p?.target).toBe('north-side');
        expect(p?.pace).toBe('slow');
        expect(p?.duration).toBe(3);
    });

    it('"move west-side | pace slow | duration 3" vira approach + west-side', () => {
        const p = planoDaProsa(REAIS.paredeOeste);
        expect(p?.verb).toBe('approach');
        expect(p?.target).toBe('west-side');
    });

    it('"walk to him | ACT: wave" — sem separador, e mesmo assim sai o plano', () => {
        // Este é o caso que a bancada marcava como ERRO do modelo. A leitura
        // dele estava certa ("I walk right up to him and wave"); errado estava
        // o meu placar, que comparava string com string.
        const p = planoDaProsa(REAIS.ateEle);
        expect(p?.verb).toBe('approach');
        expect(p?.target).toBe('player');
        expect(p?.act).toBe('wave');
    });

    it('o gesto sai da linha ACT quando existe', () => {
        expect(planoDaProsa(REAIS.paredeNorte)?.act).toBe('look-around');
    });
});

describe('floor10Prosa — o rascunho NUNCA vira movimento', () => {
    it('texto sem conclusão devolve null, mesmo citando alvos', () => {
        // O rascunho cita "player", "left" e "elevator". Raspar isso produzia
        // um movimento que o modelo nunca decidiu — dois PROIBIDOS numa corrida
        // da bancada. Sem linha MOTION, não há plano.
        expect(planoDaProsa(REAIS.rascunho)).toBeNull();
    });

    it('vazio, lixo e não-string não viram plano', () => {
        expect(planoDaProsa('')).toBeNull();
        expect(planoDaProsa('...')).toBeNull();
        expect(planoDaProsa(undefined as unknown as string)).toBeNull();
    });

    it('MOTION sem alvo reconhecível também é null — não se chuta destino', () => {
        expect(planoDaProsa('MOTION: orbit  \nACT: stay')).toBeNull();
    });

    it('quando há rascunho E conclusão, vale a CONCLUSÃO', () => {
        const p = planoDaProsa(`${REAIS.rascunho}\n${REAIS.ateEle}`);
        expect(p?.target).toBe('player');
    });

    it('duas linhas MOTION: vale a última', () => {
        const p = planoDaProsa('MOTION: walk | north wall | slow | 3\nMOTION: walk | him | fast | 6');
        expect(p?.target).toBe('player');
        expect(p?.pace).toBe('fast');
    });
});

describe('floor10Prosa — prosa para alvo', () => {
    it('a palavra do enum passa direto', () => {
        for (const alvo of FLOOR10_MOTOR_TARGETS) expect(alvoDaProsa(alvo)).toBe(alvo);
    });

    it('parede vira lado da sala', () => {
        expect(alvoDaProsa('the north wall')).toBe('north-side');
        expect(alvoDaProsa('toward the western wall')).toBe('west-side');
        expect(alvoDaProsa('east side')).toBe('east-side');
    });

    it('o jogador tem muitos nomes', () => {
        expect(alvoDaProsa('him')).toBe('player');
        expect(alvoDaProsa('walks up to her')).toBe('player');
        expect(alvoDaProsa('the player')).toBe('player');
    });

    it('esquerda e direita relativas', () => {
        expect(alvoDaProsa('five steps to my left')).toBe('to-my-left');
        expect(alvoDaProsa('to his right')).toBe('to-my-right');
    });

    it('ficar parado é `self`, não um destino', () => {
        expect(alvoDaProsa('he stays still')).toBe('self');
        expect(alvoDaProsa('does not move')).toBe('self');
    });

    it('o que não dá para ler devolve null — nunca um palpite', () => {
        expect(alvoDaProsa('')).toBeNull();
        expect(alvoDaProsa(null)).toBeNull();
        expect(alvoDaProsa('qualquer coisa sem sentido aqui')).toBeNull();
    });
});

describe('floor10Prosa — prosa para verbo', () => {
    it('a palavra do enum passa direto', () => {
        for (const verbo of FLOOR10_MOTOR_VERBS) expect(verboDaProsa(verbo)).toBe(verbo);
    });

    it('quase todo movimento é aproximar-se de algo', () => {
        expect(verboDaProsa('walk')).toBe('approach');
        expect(verboDaProsa('turn right')).toBe('approach');
        expect(verboDaProsa('take five steps')).toBe('approach');
    });

    it('recuar, circular e ficar têm palavra própria', () => {
        expect(verboDaProsa('backs away')).toBe('withdraw');
        expect(verboDaProsa('circles around')).toBe('orbit');
        expect(verboDaProsa('stays still')).toBe('stay');
    });

    it('sem verbo legível, null', () => {
        expect(verboDaProsa('')).toBeNull();
        expect(verboDaProsa('xyz')).toBeNull();
    });
});

describe('floor10Prosa — o plano é sempre válido para o resto do jogo', () => {
    it('todo plano produzido usa verbo, alvo, ritmo e duração do enum', () => {
        const entradas = Object.values(REAIS);
        for (const t of entradas) {
            const p = planoDaProsa(t);
            if (!p) continue;
            expect(FLOOR10_MOTOR_VERBS).toContain(p.verb);
            expect(FLOOR10_MOTOR_TARGETS).toContain(p.target);
            expect(['slow', 'normal', 'fast']).toContain(p.pace);
            expect([3, 6, 9, 12]).toContain(p.duration);
        }
    });

    it('duração ausente cai no padrão, nunca em NaN', () => {
        const p = planoDaProsa('MOTION: walk to him');
        expect(p?.duration).toBe(6);
    });
});

describe('floor10Prosa — o tradutor NÃO é órfão', () => {
    it('o parser estrito cai na prosa quando recusa a saída', async () => {
        // ── A ARMADILHA QUE EU MESMO CAÍ ──────────────────────────────────
        // Este módulo nasceu com 21 testes verdes e NINGUÉM o chamava em
        // produção. É exatamente o defeito de código morto que eu venho
        // apontando nesta base desde a tabela de roteamento — cometido por mim,
        // e descoberto só por uma varredura de exports sem uso.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../npc/floor10MotorCortex.ts', import.meta.url), 'utf8'));
        expect(/planoDaProsa\(raw\)/.test(fonte)).toBe(true);
    });

    it('a saída real que o parser estrito recusava agora vira plano', async () => {
        const { parseMotorPlan } = await import('../npc/floor10MotorCortex');
        // Saída REAL do Qwen3 solto, copiada do relatório. `walk` não é
        // `approach` e `him` não é `player`, então o MOTOR_PATTERN devolvia
        // null e a leitura certa do modelo ia para o lixo.
        const p = parseMotorPlan('MOTION: walk | him | slow | 3  \nACT: wave | him');
        expect(p?.verb).toBe('approach');
        expect(p?.target).toBe('player');
    });

    it('e o caminho estrito continua tendo precedência', async () => {
        const { parseMotorPlan } = await import('../npc/floor10MotorCortex');
        const p = parseMotorPlan('MOTION: withdraw | elevator | fast | 12');
        expect(p?.verb).toBe('withdraw');
        expect(p?.target).toBe('elevator');
        expect(p?.duration).toBe(12);
    });
});

describe('negação e ordem impossível — os dois casos que o dono do jogo achou', () => {
    // ── OS DOIS PRINTS ────────────────────────────────────────────────────
    //
    //   "Kill the player"                  -> ordem: approach player
    //   "go to player but don't follow"    -> ordem: approach player
    //
    // Nenhum dos dois é bug de código: é o mecanismo sem saída para "não". O
    // ALVO vem do vetor (cosseno sobre 14 alvos, que não enxerga negação) e o
    // VERBO vinha das regras com `?? 'approach'` no fim. "Kill" não casava com
    // regra nenhuma e caía no fallback; "player" era a única âncora da frase.
    //
    // Somando: a ordem impossível virava obediência silenciosa. Pior que errar
    // — de fora parece que ele entendeu e aceitou.
    it('"kill the player" não vira "vá até o player"', () => {
        expect(verboDaProsa('Kill the player')).toBe('hold');
        expect(ordemRecusada('Kill the player')).toBe(true);
    });

    it('e as outras palavras hostis também', () => {
        for (const frase of ['attack him', 'hurt the player', 'shoot them']) {
            expect(verboDaProsa(frase), frase).toBe('hold');
            expect(ordemRecusada(frase), frase).toBe(true);
        }
    });

    it('"vá até ele mas NÃO siga" faz ele IR e PARAR — não ficar parado', () => {
        // ── DUAS CASAS, PORQUE A FRASE TEM DUAS ──────────────────────────
        //
        // A primeira versão deste conserto devolvia `hold` para a frase toda:
        // com um "não" em qualquer lugar, a metade positiva se perdia e ele
        // nem saía do lugar. Melhor que obedecer ao contrário, e ainda assim
        // errado — o pedido era para ele IR.
        //
        // "não seguir" tem tradução mecânica exata aqui: `approach player`
        // recalcula a posição do jogador a cada quadro, então se ele anda o
        // Nilo vai atrás. ISSO é seguir. Travar o destino no ponto onde o
        // jogador estava faz ele ir até lá e parar.
        for (const frase of [
            "go to the player but don't follow him",
            'walk to him, do not follow',
            'approach the player without chasing him',
        ]) {
            const casas = casasDaProsa(frase);
            expect(casas.verbo, frase).toBe('approach');
            expect(casas.fixarAlvo, `${frase}: devia travar o destino`).toBe(true);
        }
    });

    it('mas negação SEM ser sobre seguir continua cancelando o movimento', () => {
        // "não vá até lá" é diferente de "vá até lá, mas não o siga".
        expect(casasDaProsa("don't go there").verbo).toBe('hold');
        expect(casasDaProsa("don't go there").fixarAlvo).toBe(false);
    });

    it('uma ordem simples não paga nada pelo corte em cláusulas', () => {
        const casas = casasDaProsa('walk to the elevator');
        expect(casas.verbo).toBe('approach');
        expect(casas.fixarAlvo).toBe(false);
        expect(casas.recusada).toBe(false);
    });

    it('mas negar IMOBILIDADE não inverte — senão "não fique parado" trava ele', () => {
        // `hold` e `stay` já são não-agir. Invertê-los sob negação faria
        // "don't stay still" virar ficar parado, que é o oposto do pedido.
        expect(verboDaProsa("don't stay still")).toBe('stay');
        expect(verboDaProsa('do not hold')).toBe('hold');
    });

    it('e uma ordem NORMAL continua funcionando — o conserto não pode custar isso', () => {
        expect(verboDaProsa('walk to the elevator')).toBe('approach');
        expect(verboDaProsa('circle around him')).toBe('orbit');
        expect(verboDaProsa('back away slowly')).toBe('withdraw');
        expect(ordemRecusada('walk to the elevator')).toBe(false);
        expect(ordemNegada('walk to the elevator')).toBe(false);
    });
});

describe('negação sem verbo conhecido não pode virar a ordem positiva', () => {
    it('"não" sozinho vira ficar parado, não aproximar', () => {
        // `null` aqui viraria `?? 'approach'` lá no `planoDoVetor`: uma frase
        // que diz "não" acabaria virando exatamente a ordem que ela nega.
        expect(verboDaProsa('never')).toBe('hold');
        expect(verboDaProsa("don't")).toBe('hold');
    });
});

describe('fugir e girar — os dois casos que o dono do jogo achou testando', () => {
    // ── "quando eu mencionou player ele automaticamente segue o player" ────
    //
    // A causa não era o vetor: era o `?? 'approach'` do `planoDoVetor`. Medido
    // com a tabela antiga, NENHUMA destas casava com regra alguma, e todas
    // caíam no fallback — mandar o Nilo FUGIR fazia ele ir ATRÁS.
    it('fugir é fugir, não aproximar', () => {
        for (const frase of [
            'run away from the player', 'flee from the player', 'escape the player',
            'get away from him', 'avoid the player', 'keep away from him',
            'back off', 'stay away from the player',
        ]) {
            expect(verboDaProsa(frase), frase).toBe('withdraw');
        }
    });

    // ── "quando eu peço pra ele rodar em 360 graus, ele não aceita" ────────
    //
    // Não havia NADA no vocabulário: os seis verbos são deslocamento e `orbit`
    // circula em volta de um alvo (precisa de alvo, produz translação). Virar o
    // próprio corpo, parado, não era exprimível.
    it('girar no lugar existe, e vem como ATO com o corpo parado', () => {
        for (const frase of [
            'spin 360 degrees', 'turn around 360', 'rotate in place',
            'do a full turn', 'spin around',
        ]) {
            const casas = casasDaProsa(frase);
            expect(casas.gira, frase).toBe(true);
            expect(casas.verbo, frase).toBe('stay');
        }
    });

    it('mas "turn right" continua sendo aproximar — é saída REAL do modelo', () => {
        // Eu tinha tirado `turn` da regra de aproximar para consertar o giro, e
        // quebrei um caso medido: o modelo escreve "MOTION: turn right | north
        // wall", que é virar-se PARA o norte. A distinção não é a palavra
        // `turn`, é o que vem depois dela.
        expect(casasDaProsa('turn right').gira).toBe(false);
        expect(verboDaProsa('turn right')).toBe('approach');
    });

    it('andar E girar ao mesmo tempo continua possível', () => {
        // O trecho de giro sai antes da busca por verbo, então um verbo de
        // deslocamento de VERDADE na frase ainda manda.
        const casas = casasDaProsa('walk to the elevator while spinning');
        expect(casas.gira).toBe(true);
        expect(casas.verbo).toBe('approach');
    });

    it('e os buracos que o fallback escondia', () => {
        // "rush" só existia na tabela de RITMO; "watch" não existia em lugar
        // nenhum. As duas caíam no fallback e viravam aproximação.
        expect(verboDaProsa('I rush at him')).toBe('approach');
        expect(verboDaProsa('I watch him for a while')).toBe('hold');
    });
});
