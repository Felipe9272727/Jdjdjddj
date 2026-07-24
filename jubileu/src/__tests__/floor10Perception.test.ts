import { describe, expect, it } from 'vitest';
import {
    answerFloor10PerceptionQuestion,
    classifyFloor10Zone,
    formatFloor10PerceptionForPrompt,
    hasFloor10PerceptionContradiction,
    isFloor10PerceptionQuestion,
    perceiveFloor10,
} from '../npc/floor10Perception';

const LIVE = perceiveFloor10({
    npcPosition: { x: 0, y: 0, z: 2.2 },
    npcYaw: Math.PI,
    playerPosition: { x: 0.5, y: 0, z: -0.5 },
});

describe('npc/floor10Perception — micro-IA dos olhos', () => {
    it('converte posição real em localização semântica do 10º', () => {
        expect(LIVE.floor).toBe(10);
        expect(LIVE.certainty).toBe(1);
        expect(LIVE.zone).toBe('center');
        expect(LIVE.heading).toBe('south');
        expect(LIVE.locationDescription).toContain('10º andar');
        expect(classifyFloor10Zone({ x: 0, y: 0, z: -10 })).toBe('elevator-threshold');
        expect(classifyFloor10Zone({ x: 20, y: 0, z: 20 })).toBe('north-east-corner');
    });

    it('respeita direção, alcance e campo de visão', () => {
        expect(LIVE.player).toMatchObject({ visible: true, direction: 'front' });
        expect(LIVE.elevator).toMatchObject({ visible: true, direction: 'front' });
        expect(LIVE.visibleObjects).toContain('player');

        const lookingAway = perceiveFloor10({
            npcPosition: { x: 0, y: 0, z: 2.2 },
            npcYaw: 0,
            playerPosition: { x: 0, y: 0, z: -1 },
        });
        expect(lookingAway.player).toMatchObject({ visible: false, direction: 'behind' });
        expect(lookingAway.visibleObjects).not.toContain('player');
    });

    it('injeta somente observações vivas e autoritativas no prompt', () => {
        const prompt = formatFloor10PerceptionForPrompt(LIVE);
        expect(prompt).toContain('sensores do motor');
        expect(prompt).toContain('Local:');
        expect(prompt).toContain('10º andar');
        expect(prompt).toContain('Jogador: à minha frente');
        expect(prompt).toContain('Nunca contradiga estes sensores');
    });

    it('responde localização e visão instantaneamente em vários idiomas', () => {
        expect(answerFloor10PerceptionQuestion('Onde você está?', LIVE))
            .toContain('Estou no 10º andar');
        expect(answerFloor10PerceptionQuestion('What can you see?', LIVE))
            .toContain('I can see you');
        expect(answerFloor10PerceptionQuestion('¿Dónde está el ascensor?', LIVE))
            .toContain('La entrada del ascensor');
        expect(answerFloor10PerceptionQuestion('Onde você trabalhava antes?', LIVE)).toBeNull();
    });

    it('reconhece perguntas sensoriais e rejeita localização contraditória', () => {
        expect(isFloor10PerceptionQuestion('Você sabe onde está?')).toBe(true);
        expect(isFloor10PerceptionQuestion('Você gosta de café?')).toBe(false);
        expect(hasFloor10PerceptionContradiction('Estou no 9º andar.', LIVE)).toBe(true);
        expect(hasFloor10PerceptionContradiction('Estou no 10º andar.', LIVE)).toBe(false);
        expect(hasFloor10PerceptionContradiction('Não sei onde estou.', LIVE)).toBe(true);
    });
});
