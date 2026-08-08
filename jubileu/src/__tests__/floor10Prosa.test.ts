import { describe, it, expect } from 'vitest';
import { alvoDaProsa, planoDaProsa, verboDaProsa } from '../npc/floor10Prosa';
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
