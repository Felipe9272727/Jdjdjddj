import { beforeEach, describe, expect, it } from 'vitest';
import {
    f8, f8AdvanceFinale, f8AdvanceLine, f8AdvanceRecovery, f8BoardElevator,
    f8CollectMemory, f8DiveDone, f8DrainEvents, f8EnterDoor21,
    f8EnterImage, f8Lines, f8MemoryFall, f8Objective, f8ReachDoor21,
    f8Reset, f8SetMemoryChapter, f8Stitch, f8Tick, f8WinMemory,
    F8_RECOVERY_LINES, F8_STITCH_COUNT,
} from '../f8Arquivo';

beforeEach(() => { f8Reset(); f8DrainEvents(); });

function reachMemory() {
    f8Tick(0.016, -4);
    for (let i = 0; i < f8Lines().length; i++) f8AdvanceLine();
    f8EnterImage();
    f8DiveDone();
    f8ReachDoor21();
    f8EnterDoor21();
}

describe('Floor 8 — fluxo completo da ficha em branco', () => {
    it('não pula nenhum ato antes da Porta 21', () => {
        expect(f8.phase).toBe('arrive');
        f8EnterDoor21();
        expect(f8.phase).toBe('arrive');
        f8Tick(0.016, -4);
        expect(f8.phase).toBe('interrogatorio');
        for (let i = 0; i < f8Lines().length; i++) f8AdvanceLine();
        expect(f8.phase).toBe('entregaImagem');
        f8EnterImage();
        expect(f8.phase).toBe('mergulho');
        f8DiveDone();
        expect(f8.phase).toBe('corredor20');
        f8ReachDoor21();
        expect(f8.phase).toBe('porta21');
        f8EnterDoor21();
        expect(f8.phase).toBe('platformer');
    });

    it('preserva fragmentos após cair e rejeita coleta duplicada', () => {
        reachMemory();
        expect(f8CollectMemory(0)).toBe(true);
        expect(f8CollectMemory(0)).toBe(false);
        f8MemoryFall();
        expect(f8.memoryMask).toBe(0b001);
        expect(f8.memoryDeaths).toBe(1);
        expect(f8DrainEvents()).toEqual(expect.arrayContaining(['memoryFragment', 'memoryFall']));
    });

    it('o tear exige as três lembranças e os oito pontos de crochê', () => {
        reachMemory();
        f8CollectMemory(0); f8CollectMemory(2);
        expect(f8WinMemory()).toBe(false);
        expect(f8.phase).toBe('platformer');
        f8CollectMemory(1);
        expect(f8Objective()).toContain('0/8 pontos');
        for (let i = 0; i < F8_STITCH_COUNT; i++) expect(f8Stitch(i)).toBe(true);
        expect(f8Stitch(0)).toBe(false);
        expect(f8Objective()).toContain('tear');
        expect(f8WinMemory()).toBe(true);
        expect(f8.phase).toBe('memoriaRecuperada');
    });

    it('costuras e capítulos são idempotentes e limitados', () => {
        reachMemory();
        f8DrainEvents();
        expect(f8Stitch(-1)).toBe(false);
        expect(f8Stitch(F8_STITCH_COUNT)).toBe(false);
        expect(f8Stitch(3)).toBe(true);
        expect(f8Stitch(3)).toBe(false);
        f8SetMemoryChapter(99);
        expect(f8.memoryChapter).toBe(3);
        f8SetMemoryChapter(-4);
        expect(f8.memoryChapter).toBe(0);
        expect(f8DrainEvents()).toEqual(['memoryStitch']);
    });

    it('termina a cutscene, atravessa o poço e embarca para o 9 uma única vez', () => {
        reachMemory();
        f8CollectMemory(0); f8CollectMemory(1); f8CollectMemory(2);
        for (let i = 0; i < F8_STITCH_COUNT; i++) f8Stitch(i);
        f8WinMemory();
        for (let i = 0; i < F8_RECOVERY_LINES.length; i++) f8AdvanceRecovery();
        expect(f8.phase).toBe('awakening');
        expect(f8BoardElevator()).toBe(false);
        expect(f8AdvanceFinale()).toBe('ready');
        expect(f8AdvanceFinale()).toBe('lookBack');
        expect(f8AdvanceFinale()).toBe('shove');
        expect(f8AdvanceFinale()).toBe('ride9');
        expect(f8BoardElevator()).toBe(true);
        expect(f8BoardElevator()).toBe(false);
        expect(f8.phase).toBe('leave');
        expect(f8.boarded).toBe(true);
        expect(f8DrainEvents()).toEqual(expect.arrayContaining(['win', 'boarding']));
    });

    it('reset limpa uma tentativa anterior inteira', () => {
        reachMemory();
        f8CollectMemory(1); f8Stitch(2); f8SetMemoryChapter(2); f8MemoryFall();
        f8Reset();
        expect(f8.phase).toBe('arrive');
        expect(f8.memoryMask).toBe(0);
        expect(f8.stitchMask).toBe(0);
        expect(f8.memoryChapter).toBe(0);
        expect(f8.memoryDeaths).toBe(0);
        expect(f8.boarded).toBe(false);
    });
});
