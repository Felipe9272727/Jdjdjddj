import { describe, it, expect } from 'vitest';
import { MARGEM_SEGURA, planoDoVetor, rotulosVetorizados } from '../npc/floor10MotorVetor';
import { buildMotorGrammar } from '../npc/floor10MotorCortex';
import { INITIAL_FLOOR10_PERCEPTION } from '../npc/floor10Perception';
import { FLOOR10_MOTOR_TARGETS, FLOOR10_MOTOR_VERBS } from '../npc/floor10MotorCortex';

describe('floor10MotorVetor — o plano sem LLM nenhum', () => {
    it('o alvo do vetor entra no plano', () => {
        expect(planoDoVetor('west-side', 'I move toward the west wall.').target).toBe('west-side');
    });

    it('o verbo sai da própria frase', () => {
        expect(planoDoVetor('player', 'I walk right up to him.').verb).toBe('approach');
        expect(planoDoVetor('player', 'I back away from him.').verb).toBe('withdraw');
        expect(planoDoVetor('elevator', 'I circle around the doors.').verb).toBe('orbit');
    });

    it('`self` vira SEMPRE `stay` — aproximar-se de si mesmo faz o corpo tremer no lugar', () => {
        // Sem isto, `approach | self` manda o passo calcular um destino igual à
        // posição atual, e o corpo fica corrigindo um erro de zero para sempre.
        expect(planoDoVetor('self', 'I walk and walk and walk.').verb).toBe('stay');
    });

    it('ritmo e duração saem da palavra escrita, com padrão no meio da tabela', () => {
        expect(planoDoVetor('player', 'I walk slowly toward him.').pace).toBe('slow');
        expect(planoDoVetor('player', 'I rush at him.').pace).toBe('fast');
        expect(planoDoVetor('player', 'I go to him.').pace).toBe('normal');
        expect(planoDoVetor('player', 'I go to him.').duration).toBe(6);
        expect(planoDoVetor('player', 'I watch him for a while.').duration).toBe(12);
    });

    it('o plano é sempre válido para o resto do jogo', () => {
        for (const alvo of FLOOR10_MOTOR_TARGETS) {
            const p = planoDoVetor(alvo, 'I move.');
            expect(FLOOR10_MOTOR_VERBS).toContain(p.verb);
            expect(FLOOR10_MOTOR_TARGETS).toContain(p.target);
            expect([3, 6, 9, 12]).toContain(p.duration);
            expect(['slow', 'normal', 'fast']).toContain(p.pace);
        }
    });

    it('pensamento vazio não quebra o plano', () => {
        expect(planoDoVetor('player', '').verb).toBe('approach');
    });
});

describe('floor10MotorVetor — os rótulos desempacotados', () => {
    it('desempacota todos e guarda entre chamadas', () => {
        const a = rotulosVetorizados();
        expect(a.length).toBeGreaterThan(10);
        expect(rotulosVetorizados()).toBe(a);
    });

    it('o limiar é ALTO de propósito: na dúvida, pergunta', () => {
        // Errar para o lado de acordar o Qwen custa tempo; errar para o outro
        // custa o Nilo andando para o lugar errado. Os erros medidos ficaram em
        // 0,014 e 0,040, então o corte tem de estar acima dos dois.
        expect(MARGEM_SEGURA).toBeGreaterThan(0.04);
    });
});

describe('floor10MotorVetor — a gramática do desempate', () => {
    const olhos = INITIAL_FLOOR10_PERCEPTION;

    it('sem candidatos, a gramática oferece a lista inteira — como antes', () => {
        const g = buildMotorGrammar(olhos, null);
        expect(g).toContain('"elevator"');
        expect(g).toContain('"room-center"');
    });

    it('COM candidatos, a gramática oferece SÓ eles', () => {
        // É isto que impede o colapso: com 12 opções o modelo responde sempre a
        // mesma (medido em 6 modelos de 5 famílias). Com 3 que vieram da frase,
        // a mania dele não tem para onde fugir.
        const g = buildMotorGrammar(olhos, null, ['west-side', 'to-my-left']);
        expect(g).toContain('"west-side"');
        expect(g).toContain('"to-my-left"');
        expect(g).not.toContain('"room-center"');
    });

    it('um alvo que os OLHOS não veem não entra só porque o vetor gostou', () => {
        // `nearest-device` só existe com prisão. Se o vetor sugerir sem prisão,
        // a interseção tem de descartar — senão o motor manda o corpo para uma
        // coordenada que não existe.
        const g = buildMotorGrammar(olhos, null, ['nearest-device']);
        expect(g).not.toContain('"nearest-device"');
        // E cai na lista inteira, em vez de ficar com gramática vazia.
        expect(g).toContain('"elevator"');
    });

    it('gramática nunca sai vazia, nem com candidatos todos inválidos', () => {
        const g = buildMotorGrammar(olhos, null, []);
        expect(g).toContain('target ::=');
        expect(g.length).toBeGreaterThan(60);
    });
});

describe('floor10MotorVetor — a ligação chega no motor', () => {
    it('o motor consulta o vetor ANTES de acordar o Qwen', async () => {
        // ── POR QUE UM TESTE OLHA O FONTE ─────────────────────────────────
        // Nesta base eu já perdi uma tabela de roteamento inteira para código
        // morto — módulo existindo, testado, e ninguém chamando. Aqui o risco é
        // o mesmo: todo o caminho por vetor pode estar perfeito e o motor
        // continuar indo direto ao Qwen, que é o comportamento de hoje.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../npc/floor10MotorBrain.ts', import.meta.url), 'utf8'));
        const iVetor = fonte.indexOf('classificarPensamento');
        const iQwen = fonte.indexOf('floor10ModelCoordinator.activate');
        expect(iVetor).toBeGreaterThan(0);
        expect(iQwen).toBeGreaterThan(0);
        // O vetor tem de ser consultado ANTES — senão o Qwen já pagou a carga.
        expect(iVetor).toBeLessThan(iQwen);
        // E o desempate tem de receber os candidatos.
        expect(/veredito\?\.candidatos/.test(fonte)).toBe(true);
    });
});

describe('?campo — a tela de teste mede o motor NOVO', () => {
    it('o campo sobe o embeddinggemma e mostra se ele está no ar', async () => {
        // ── POR QUE UM TESTE OLHA O FONTE ─────────────────────────────────
        // O `?campo` existe para o dono do jogo testar no aparelho dele. Se o
        // embeddinggemma não subir ali, a tela mede o motor ANTIGO e parece
        // idêntica — ele testaria a coisa errada sem nenhum sinal disso.
        const fonte = await import('node:fs/promises')
            .then((fs) => fs.readFile(new URL('../Floor10Campo.tsx', import.meta.url), 'utf8'));
        // O modelo sobe…
        expect(/precarregarMemoria\(\)/.test(fonte)).toBe(true);
        // …o veredito é consultado…
        expect(/classificarPensamento\(/.test(fonte)).toBe(true);
        // …e a tela DIZ qual motor está decidindo.
        expect(fonte).toContain('FORA DO AR');
        expect(/margem/.test(fonte)).toBe(true);
    });
});
