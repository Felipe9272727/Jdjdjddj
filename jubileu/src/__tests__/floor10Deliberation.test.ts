import { describe, expect, it } from 'vitest';
import {
    DELIBERATION_GOALS,
    DELIBERATION_GRAMMAR,
    DELIBERATION_SYSTEM_PROMPT,
    DELIBERATION_TTL_SECONDS,
    buildDeliberationPrompt,
    deliberationBonus,
    parseDeliberation,
} from '../npc/floor10Deliberation';
import { perceiveFloor10 } from '../npc/floor10Perception';
import { INITIAL_FLOOR10_WILL } from '../npc/floor10Will';

const PERCEPTION = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: Math.PI,
    playerPosition: { x: 0, y: 0, z: 0 },
});

const MEMORY = {
    inspectedElevatorCount: 3,
    sleeps: 44,
    playerSilentSeconds: 12.4,
    lastGoals: ['wander', 'idle'] as const,
};

// Saída REAL do MiniCPM5-1B rodando o GGUF em CPU com este prompt.
const REAL_OUTPUT = `[Start thinking]
We are given a description of a character in a game environment.
CHOICE: wander
But I need to ensure it's exactly one line after the choice.
So I'll write:
CHOICE: wander
Yes.
[End thinking]
Wander is the most neutral and safe action given no interaction instructions, aligning with his traits of curiosity (0.9) but low social engagement (0.2).
CHOICE: wander`;

describe('npc/floor10Deliberation — o segundo cérebro pequeno e privado', () => {
    it('descreve o mundo em estrutura, não em prosa', () => {
        const prompt = buildDeliberationPrompt(PERCEPTION, INITIAL_FLOOR10_WILL.drives, MEMORY);
        expect(prompt).toContain('SEES:');
        expect(prompt).toContain('WANTS:');
        expect(prompt).toContain('REMEMBERS:');
        expect(prompt).toContain('inspected the elevator 3x');
        expect(prompt).toContain('slept 44 times');
        expect(prompt).toContain('wander -> idle');
        // Compacto: o modelo pequeno lê bem estrutura e mal literatura.
        expect(prompt.length).toBeLessThan(420);
    });

    it('pede livre arbítrio e lista as metas válidas', () => {
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('free will');
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('CHOICE:');
        expect(DELIBERATION_SYSTEM_PROMPT).toContain('Do not narrate reasoning');
        for (const goal of DELIBERATION_GOALS) {
            expect(DELIBERATION_SYSTEM_PROMPT).toContain(goal);
            expect(DELIBERATION_GRAMMAR).toContain(`"${goal}"`);
        }
    });

    it('lê a decisão de uma saída real do modelo', () => {
        const decision = parseDeliberation(REAL_OUTPUT, 100);
        expect(decision?.goal).toBe('wander');
        expect(decision?.at).toBe(100);
        // A justificativa vem da fala final, sem o raciocínio interno.
        expect(decision?.rationale).toContain('curiosity');
        expect(decision?.rationale).not.toContain('[Start thinking]');
    });

    it('fica com a ÚLTIMA escolha — é a que ele assumiu depois de pensar', () => {
        const raw = 'CHOICE: idle\nhmm, actually\nCHOICE: inspect-elevator';
        expect(parseDeliberation(raw)?.goal).toBe('inspect-elevator');
    });

    it('ignora rótulo inventado e devolve nulo sem escolha válida', () => {
        expect(parseDeliberation('CHOICE: dance-forever')).toBeNull();
        expect(parseDeliberation('ainda estou pensando…')).toBeNull();
    });

    it('inclina o reflexo sem mandar nele, e a inclinação envelhece', () => {
        const decision = parseDeliberation(REAL_OUTPUT, 0);
        expect(decision).not.toBeNull();
        const fresh = deliberationBonus(decision, 'wander', 0);
        const half = deliberationBonus(decision, 'wander', DELIBERATION_TTL_SECONDS / 2);
        expect(fresh).toBeGreaterThan(0);
        expect(half).toBeGreaterThan(0);
        expect(half).toBeLessThan(fresh);
        // Depois do prazo a intenção não manda mais.
        expect(deliberationBonus(decision, 'wander', DELIBERATION_TTL_SECONDS + 1)).toBe(0);
        // E nunca empurra uma meta diferente da escolhida.
        expect(deliberationBonus(decision, 'idle', 0)).toBe(0);
        expect(deliberationBonus(null, 'wander', 0)).toBe(0);
    });
});

describe('a bolha de pensamento fala como o Nilo, não como sistema', () => {
    it('traduz a intenção deliberada para a voz dele', async () => {
        const { deliberationThought } = await import('../npc/floor10Deliberation');
        expect(deliberationThought('thinking', '')).toBe('pensando…');
        expect(deliberationThought('decided', 'inspect-elevator')).toContain('aquela porta');
        expect(deliberationThought('decided', 'wander')).toContain('parado');
        // Nada de rótulo técnico vazando para a tela.
        expect(deliberationThought('decided', 'inspect-elevator')).not.toContain('inspect');
        // Sem nada a mostrar, a bolha não aparece.
        expect(deliberationThought('off', '')).toBe('');
        expect(deliberationThought('unavailable', '')).toBe('');
        expect(deliberationThought('loading', '')).toBe('');
    });
});

describe('os dois cérebros se falam', () => {
    it('a promessa feita na conversa chega à deliberação', () => {
        const semPromessa = buildDeliberationPrompt(PERCEPTION, INITIAL_FLOOR10_WILL.drives, MEMORY);
        expect(semPromessa).not.toContain('JUST PROMISED');

        // O jogador pediu para entrar no elevador; o 3B aceitou.
        const comPromessa = buildDeliberationPrompt(PERCEPTION, INITIAL_FLOOR10_WILL.drives, {
            ...MEMORY,
            agreedAction: 'enter-elevator',
            agreedReason: 'Tudo bem, eu entro com você.',
        });
        expect(comPromessa).toContain('JUST PROMISED THE PLAYER: enter-elevator');
        expect(comPromessa).toContain('Tudo bem, eu entro com você.');
        expect(comPromessa).toContain('Keep your word');
    });
});
