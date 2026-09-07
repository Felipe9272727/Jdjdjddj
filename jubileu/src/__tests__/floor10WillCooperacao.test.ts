import { describe, expect, it } from 'vitest';
import type { Floor10Perception } from '../npc/floor10Perception';
import { Floor10WillBrain } from '../npc/floor10Will';

const perception = (playerDistance = 5): Floor10Perception => ({
    source: 'floor10-engine-sensors',
    floor: 10,
    certainty: 1,
    position: { x: 0, y: 0, z: 0 },
    zone: 'center',
    heading: 'north',
    yaw: 0,
    locationDescription: 'no centro',
    player: {
        visible: true,
        distance: playerDistance,
        direction: 'front',
        zone: 'center',
        position: { x: 0, y: 0, z: playerDistance },
    },
    elevator: { visible: false, distance: 20, direction: 'behind' },
    visibleObjects: [],
    devices: [],
});

const input = (time: number, cooperationTarget?: { x: number; z: number } | null) => ({
    dt: 0.1,
    time,
    perception: perception(),
    npcPosition: { x: 0, y: 0, z: 0 },
    conversationOpen: false,
    speaking: false,
    cooperationTarget,
});

describe('cooperação física do cérebro do andar 10', () => {
    it('aceita o convite no aparelho indicado e mantém o progresso sem fala repetida', () => {
        const brain = new Floor10WillBrain(7);
        const first = brain.tick(input(0, { x: 5, z: 5 }));
        const second = brain.tick(input(0.1, { x: 5, z: 5 }));

        expect(first.snapshot.goal).toBe('try-device');
        expect(first.snapshot.target).toEqual({ x: 5, z: 5 });
        expect(first.speech).toBeUndefined();
        expect(second.snapshot.decisionId).toBe(first.snapshot.decisionId);
        expect(second.snapshot.target).toEqual({ x: 5, z: 5 });
        expect(second.speech).toBeUndefined();
    });

    it('cancela a preferência quando o pedido some e respeita conversa', () => {
        const brain = new Floor10WillBrain(11);
        brain.tick(input(0, { x: 5, z: 5 }));
        const resumed = brain.tick(input(0.1, null));
        expect(resumed.snapshot.goal).not.toBe('try-device');

        const duringConversation = new Floor10WillBrain(13).tick({
            ...input(0, { x: 5, z: 5 }),
            conversationOpen: true,
        });
        expect(duringConversation.snapshot.goal).toBe('observe-player');
        expect(duringConversation.snapshot.target).toBeNull();
        expect(duringConversation.speech).toBeUndefined();
    });
});

describe('prioridade da cooperação física', () => {
    const coopInput = (time: number, target: { x: number; z: number }, conversationOpen = false) => {
        const base = perception(10);
        return {
            ...input(time, target),
            npcPosition: { x: 0, y: 0, z: 2.2 },
            perception: {
                ...base,
                player: { ...base.player!, distance: 10, position: { x: -7, y: 0, z: -6 } },
            },
            conversationOpen,
        };
    };

    it('sobrepõe um compromisso follow-player persistente', () => {
        const brain = new Floor10WillBrain(23);
        brain.applyLanguageDecision('follow-player', 0, 'vou acompanhar o jogador');
        const tick = brain.tick(coopInput(0.1, { x: 7, z: -6 }));
        expect(tick.snapshot.goal).toBe('try-device');
        expect(tick.snapshot.target).toEqual({ x: 7, z: -6 });
    });

    it('sobrepõe directive ativo, mas conversa continua vencendo', () => {
        const brain = new Floor10WillBrain(29);
        brain.applyLanguageDecision('explore-room', 0, 'vou explorar');
        const cooperating = brain.tick(coopInput(0.1, { x: 7, z: -6 }));
        expect(cooperating.snapshot.goal).toBe('try-device');
        expect(cooperating.snapshot.target).toEqual({ x: 7, z: -6 });

        brain.applyLanguageDecision('follow-player', 1, 'vou acompanhar');
        const talking = brain.tick(coopInput(1.1, { x: 7, z: -6 }, true));
        expect(talking.snapshot.goal).toBe('observe-player');
        expect(talking.snapshot.target).toBeNull();
    });
});
