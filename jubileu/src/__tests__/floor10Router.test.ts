import { describe, expect, it } from 'vitest';
import { classifyFloor10Question } from '../npc/floor10Router';

describe('npc/floor10Router — micro-IA de complexidade', () => {
    it.each([
        'Oi, tudo bem?',
        'Qual é o seu nome?',
        'Você gosta de café?',
        'What is your job?',
        '¿Cómo te llamas?',
        'Meu nome é Felipe.',
        'Você está bem?',
        'Qual é sua comida favorita?',
    ])('manda pergunta simples para o 0.8B: %s', (question) => {
        expect(classifyFloor10Question(question).route).toBe('simple');
    });

    it.each([
        'Por que você acha que o elevador não obedece e o que faria se ele abrisse agora?',
        'Compare suas memórias antigas com o que você sente neste momento.',
        'E se o Arquivista estiver manipulando nós dois, qual seria seu plano?',
        'What would you do if the hotel offered freedom in exchange for betraying me?',
        '¿Por qué confías en mí y qué consecuencias tendría seguirme?',
        'Conte uma história sobre sua vida.',
    ])('manda raciocínio aberto para o 2B: %s', (question) => {
        expect(classifyFloor10Question(question).route).toBe('complex');
    });

    it('trata continuação curta como complexa quando ela depende do histórico', () => {
        const history = [
            { role: 'user' as const, content: 'Você confia no elevador?' },
            { role: 'assistant' as const, content: 'Não muito.' },
        ];
        expect(classifyFloor10Question('Por quê?', history).route).toBe('complex');
    });

    it('prefere o 2B quando não reconhece com segurança uma intenção simples', () => {
        const decision = classifyFloor10Question('Talvez exista alguma coisa por trás daquela porta.');
        expect(decision.route).toBe('complex');
        expect(decision.reason).toContain('raciocínio');
    });
});
