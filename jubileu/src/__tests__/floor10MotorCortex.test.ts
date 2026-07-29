import { describe, expect, it } from 'vitest';
import { freshPrison } from '../npc/f10Prison';
import {
    FLOOR10_MOTOR_FEATURE_SIZE,
    FLOOR10_MOTOR_GRAMMAR,
    buildMotorGrammar,
    buildMotorTranslationPrompt,
    groundMotorPlan,
    motorPlanFeatures,
    parseMotorPlan,
} from '../npc/floor10MotorCortex';
import { perceiveFloor10 } from '../npc/floor10Perception';

const NPC = { x: 0, y: 0, z: 2.2 };

const perception = (player: { x: number; y: number; z: number } | null) =>
    perceiveFloor10({
        npcPosition: NPC,
        npcYaw: 0,
        playerPosition: player,
    });

describe('npc/floor10MotorCortex — pensamento virando movimento', () => {
    it('lê uma tradução estrita e fica com a última correção', () => {
        const plan = parseMotorPlan(
            'MOTION: stay | self | slow | 3\n'
            + 'MOTION: orbit | elevator | fast | 9',
        );
        expect(plan).toMatchObject({
            verb: 'orbit',
            target: 'elevator',
            pace: 'fast',
            duration: 9,
        });
        expect(parseMotorPlan('MOTION: teleport | moon | turbo | 99')).toBeNull();
        expect(FLOOR10_MOTOR_GRAMMAR).toContain('"orbit"');
        expect(FLOOR10_MOTOR_GRAMMAR).not.toContain('teleport');
    });

    it('só oferece ao tradutor alvos que os sensores realmente possuem', () => {
        const withoutPlayer = buildMotorTranslationPrompt(
            'I want to inspect the quiet side of the room.',
            perception(null),
            null,
        );
        expect(withoutPlayer).not.toContain('AVAILABLE TARGETS: player');
        expect(withoutPlayer).not.toContain('nearest-device');
        expect(withoutPlayer).toContain('room-center');
        const constrained = buildMotorGrammar(perception(null), null);
        expect(constrained).not.toContain('"player"');
        expect(constrained).not.toContain('"nearest-device"');

        const withWorld = buildMotorTranslationPrompt(
            'I want to go closer.',
            perception({ x: 0, y: 0, z: 8 }),
            freshPrison(),
        );
        expect(withWorld).toContain('AVAILABLE TARGETS: player');
        expect(withWorld).toContain('nearest-device');
        expect(withWorld).toContain('Do not invent a new desire');
        const worldGrammar = buildMotorGrammar(
            perception({ x: 0, y: 0, z: 8 }),
            freshPrison(),
        );
        expect(worldGrammar).toContain('"player"');
        expect(worldGrammar).toContain('"nearest-device"');
    });

    it('aterra aproximação sem invadir o espaço do jogador', () => {
        const plan = parseMotorPlan('MOTION: approach | player | normal | 6');
        expect(plan).not.toBeNull();
        const grounded = groundMotorPlan(
            plan!,
            perception({ x: 0, y: 0, z: 8 }),
            null,
            NPC,
        );
        expect(grounded).not.toBeNull();
        expect(Math.hypot(grounded!.target!.x, grounded!.target!.z - 8))
            .toBeCloseTo(1.8, 5);
        expect(grounded!.speed).toBeCloseTo(0.86);
        expect(grounded!.lockSeconds).toBe(6);
    });

    it('aterra aparelhos e preserva o tempo de permanecer no ponto', () => {
        const plan = parseMotorPlan('MOTION: hold | nearest-device | slow | 12');
        const prison = freshPrison();
        const grounded = groundMotorPlan(plan!, perception(null), prison, NPC);
        expect(grounded?.target).not.toBeNull();
        expect(Object.values(prison.devices)).toContainEqual(
            expect.objectContaining(grounded!.target!),
        );
        expect(grounded?.lockSeconds).toBe(12);
    });

    it('entrega ao RL características compactas, sem texto nem coordenadas cruas', () => {
        const plan = parseMotorPlan('MOTION: explore | west-side | fast | 9');
        const features = motorPlanFeatures(plan);
        expect(features).toHaveLength(FLOOR10_MOTOR_FEATURE_SIZE);
        expect(features.every((value) => value >= 0 && value <= 1)).toBe(true);
        expect(features.slice(0, 6).reduce((sum, value) => sum + value, 0)).toBe(1);
        expect(features.slice(6, 10).reduce((sum, value) => sum + value, 0)).toBe(1);
        expect(motorPlanFeatures(null)).toEqual(new Array(12).fill(0));
    });
});
