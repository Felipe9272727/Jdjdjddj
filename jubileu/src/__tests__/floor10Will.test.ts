import { describe, expect, it } from 'vitest';
import { perceiveFloor10 } from '../npc/floor10Perception';
import {
    Floor10WillBrain,
    answerFloor10WillQuestion,
    formatFloor10WillForPrompt,
    stepFloor10Movement,
} from '../npc/floor10Will';

const NPC = { x: 0, y: 0, z: 2.2 };

function vision(player: { x: number; y: number; z: number } | null, yaw = 0) {
    return perceiveFloor10({
        npcPosition: NPC,
        npcYaw: yaw,
        playerPosition: player,
    });
}

describe('npc/floor10Will — autonomia e desejos do hóspede', () => {
    it('escolhe se aproximar quando vê o jogador distante', () => {
        const brain = new Floor10WillBrain(7);
        const result = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        expect(result.snapshot.goal).toBe('approach-player');
        expect(result.snapshot.target).toMatchObject({ x: 0, z: 8 });
        expect(result.snapshot.reason).toContain('quero me aproximar');
    });

    it('toma a iniciativa de falar quando chega perto por vontade própria', () => {
        const brain = new Floor10WillBrain(11);
        brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        const closePerception = perceiveFloor10({
            npcPosition: { x: 0, y: 0, z: 5.9 },
            npcYaw: 0,
            playerPosition: { x: 0, y: 0, z: 8 },
        });
        const result = brain.tick({
            dt: 0.1,
            time: 2,
            perception: closePerception,
            npcPosition: { x: 0, y: 0, z: 5.9 },
            conversationOpen: false,
            speaking: false,
        });
        expect(result.snapshot.goal).toBe('talk-player');
        expect(result.speech).toBeTruthy();
        expect(result.snapshot.drives.social).toBeLessThan(0.3);
    });

    it('completa sozinho o ciclo ver → aproximar → iniciar conversa', () => {
        const brain = new Floor10WillBrain(17);
        const player = { x: 0, y: 0, z: 8 };
        const position = { x: 0, y: 0, z: 2.2 };
        let yaw = 0;
        let speech = '';
        for (let stepIndex = 0; stepIndex < 120 && !speech; stepIndex++) {
            const time = stepIndex * 0.1;
            const perception = perceiveFloor10({
                npcPosition: position,
                npcYaw: yaw,
                playerPosition: player,
            });
            const will = brain.tick({
                dt: 0.1,
                time,
                perception,
                npcPosition: position,
                conversationOpen: false,
                speaking: false,
            });
            if (will.speech) speech = will.speech;
            const movement = stepFloor10Movement(
                position,
                will.snapshot.target,
                will.snapshot.goal === 'approach-player' ? 1.12 : 0.7,
                0.1,
            );
            position.x = movement.x;
            position.z = movement.z;
            if (movement.moving) yaw = movement.yaw;
        }
        expect(speech).not.toBe('');
        expect(Math.hypot(position.x - player.x, position.z - player.z)).toBeLessThanOrEqual(2.7);
    });

    it('cria uma intenção própria mesmo sem enxergar o jogador', () => {
        const brain = new Floor10WillBrain(5);
        const result = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        expect(['inspect-elevator', 'wander']).toContain(result.snapshot.goal);
        expect(result.snapshot.target).not.toBeNull();
    });

    it('procura a última posição vista quando o jogador sai do campo de visão', () => {
        const brain = new Floor10WillBrain(21);
        brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        const lost = brain.tick({
            dt: 0.1,
            time: 4.5,
            perception: vision(null),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        });
        expect(lost.snapshot.goal).toBe('seek-player');
        expect(lost.snapshot.target).toMatchObject({ x: 0, z: 8 });
    });

    it('interrompe o deslocamento e presta atenção durante uma conversa', () => {
        const brain = new Floor10WillBrain(9);
        const result = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 4 }),
            npcPosition: NPC,
            conversationOpen: true,
            speaking: false,
        });
        expect(result.snapshot).toMatchObject({
            goal: 'observe-player',
            target: null,
            moving: false,
        });
    });

    it('move em passos limitados e usa a abertura real do elevador', () => {
        const normal = stepFloor10Movement(
            { x: 0, z: 2 },
            { x: 3, z: 2 },
            1,
            0.1,
        );
        expect(normal).toMatchObject({ x: 0.1, z: 2, moving: true });

        const towardElevator = stepFloor10Movement(
            { x: 2, z: -8 },
            { x: 0, z: -12 },
            1,
            0.1,
        );
        expect(towardElevator.x).toBeLessThan(2);
        expect(towardElevator.z).toBeLessThan(-8);
        expect(Math.hypot(towardElevator.x - 2, towardElevator.z + 8)).toBeLessThanOrEqual(0.101);
    });

    it('explica a própria escolha sem pedir uma geração ao LLM', () => {
        const brain = new Floor10WillBrain(7);
        const snapshot = brain.tick({
            dt: 0.1,
            time: 0,
            perception: vision({ x: 0, y: 0, z: 8 }),
            npcPosition: NPC,
            conversationOpen: false,
            speaking: false,
        }).snapshot;
        expect(answerFloor10WillQuestion('O que você quer fazer?', snapshot))
            .toContain('Agora eu quero');
        expect(answerFloor10WillQuestion('Where are you going?', snapshot))
            .toContain('Right now I want');
        expect(answerFloor10WillQuestion('¿Dónde vas?', snapshot))
            .toContain('Ahora quiero');
        expect(answerFloor10WillQuestion('Qual é seu nome?', snapshot)).toBeNull();
        expect(formatFloor10WillForPrompt(snapshot)).toContain('VONTADE ATUAL');
    });
});
