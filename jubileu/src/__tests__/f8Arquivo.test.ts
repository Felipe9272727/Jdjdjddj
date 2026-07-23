import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    f8, f8Reset, f8Tick, f8AdvanceLine, f8Lines, f8EnterImage, f8DiveDone, f8ReachDoor21,
    f8EnterDoor21, f8WinMemory, f8Wake, f8AdvanceWake, f8ThrownDone, f8DrainEvents,
    F8_DESPERTAR_LINES, F8_SUMIU_LINES, f8Objective,
} from '../f8Arquivo';

describe('f8Arquivo — a máquina de fases do Andar 8 (ida)', () => {
    beforeEach(() => f8Reset());

    it('arrive → interrogatorio quando o player se aproxima da mesa', () => {
        expect(f8.phase).toBe('arrive');
        f8Tick(1 / 60, -8);              // no sul (arma o gatilho); longe: nada
        expect(f8.phase).toBe('arrive');
        f8Tick(1 / 60, -4);              // perto da mesa
        expect(f8.phase).toBe('interrogatorio');
    });

    it('NÃO dispara com a posição velha de outro andar (antes do spawn aplicar)', () => {
        // o primeiro frame chega com z=0/8 (ref do andar anterior); o gatilho só
        // arma depois do player aparecer de verdade no sul da sala
        f8Tick(1 / 60, 8);
        f8Tick(1 / 60, 0);
        expect(f8.phase).toBe('arrive');
        f8Tick(1 / 60, -8.2);            // spawn real aplicou
        f8Tick(1 / 60, -4);              // agora sim: caminhou até a mesa
        expect(f8.phase).toBe('interrogatorio');
    });

    it('o roteiro inteiro → entregaImagem → mergulho → corredor20 → porta21 → platformer', () => {
        f8.phase = 'interrogatorio';
        const n = f8Lines().length;
        for (let i = 0; i < n; i++) f8AdvanceLine();
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
});

describe('f8Arquivo — o FINALE (despertar → elevador sumiu → arremesso → leave)', () => {
    beforeEach(() => {
        f8Reset();
        vi.stubGlobal('window', { localStorage: { setItem: vi.fn(), getItem: () => null } });
    });

    it('vencer o platformer acorda zonzo: memoriaRecuperada → despertar', () => {
        f8.phase = 'platformer';
        f8WinMemory();
        expect(f8.phase).toBe('memoriaRecuperada');
        f8Wake();
        expect(f8.phase).toBe('despertar');
        expect(f8.line).toBe(0);
    });

    it('depois do "você está pronto", mancar até o sul revela: o elevador SUMIU', () => {
        f8.phase = 'despertar'; f8.line = 0;
        // ainda falando: andar até o sul NÃO dispara
        f8Tick(1 / 60, -8);
        expect(f8.phase).toBe('despertar');
        // fala tudo
        for (let i = 0; i < F8_DESPERTAR_LINES.length; i++) f8AdvanceWake();
        expect(f8Objective()).toBe('Volte ao elevador.');
        // longe do vão: nada
        f8Tick(1 / 60, -5);
        expect(f8.phase).toBe('despertar');
        // chegou no sul: percebe
        f8Tick(1 / 60, -8);
        expect(f8.phase).toBe('elevadorSumiu');
        expect(f8.line).toBe(0);
        expect(f8DrainEvents()).toContain('gone');
    });

    it('a última fala do sumiu = o Arquivista te JOGA (arremesso) → leave', () => {
        f8.phase = 'elevadorSumiu'; f8.line = 0;
        for (let i = 0; i < F8_SUMIU_LINES.length - 1; i++) f8AdvanceWake();
        expect(f8.phase).toBe('elevadorSumiu');   // ainda na última fala
        f8AdvanceWake();                          // …e ela dispara o arremesso
        expect(f8.phase).toBe('arremesso');
        expect(f8DrainEvents()).toContain('throw');
        f8ThrownDone();
        expect(f8.phase).toBe('leave');
        expect(f8DrainEvents()).toContain('boarding');
    });

    it('as ações fora de fase são inertes (guardas)', () => {
        f8.phase = 'interrogatorio';
        f8Wake(); f8ThrownDone();
        expect(f8.phase).toBe('interrogatorio');
        f8.phase = 'arrive';
        f8AdvanceWake();
        expect(f8.phase).toBe('arrive');
    });
});
