import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
    TETO_WASM_BYTES,
    medirAgora,
    memoriaMedivel,
    picoDeMemoria,
    resetMemoriametroForTests,
    resumoDeMemoria,
    vigiarMemoria,
} from '../npc/floor10Memoriametro';

type Alvo = Performance & { measureUserAgentSpecificMemory?: () => Promise<unknown> };

function instalarMedidor(sequencia: number[]): { chamadas: number } {
    const estado = { chamadas: 0 };
    (globalThis.performance as Alvo).measureUserAgentSpecificMemory = async () => {
        const bytes = sequencia[Math.min(estado.chamadas, sequencia.length - 1)];
        estado.chamadas += 1;
        return { bytes, breakdown: [] };
    };
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = true;
    return estado;
}

describe('npc/floor10Memoriametro — o número que mata a aba', () => {
    beforeEach(() => {
        resetMemoriametroForTests();
        delete (globalThis.performance as Alvo).measureUserAgentSpecificMemory;
        delete (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    });
    afterEach(() => {
        resetMemoriametroForTests();
        delete (globalThis.performance as Alvo).measureUserAgentSpecificMemory;
    });

    it('sem a API, não mede e DIZ que não mede', async () => {
        // O silêncio seria pior que a ausência: um relatório sem linha de
        // memória parece um relatório onde a memória estava bem.
        expect(memoriaMedivel()).toBe(false);
        expect(await medirAgora('ready')).toBeNull();
        expect(resumoDeMemoria()).toContain('não expõe');
    });

    it('sem isolamento cross-origin, também não tenta', async () => {
        instalarMedidor([1e9]);
        (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = false;
        expect(memoriaMedivel()).toBe(false);
        expect(await medirAgora('ready')).toBeNull();
    });

    it('guarda o PICO com a fase, não a última leitura', async () => {
        // Pico é o que decide se a aba morre; a fase é o que diz de quem foi a
        // culpa. Guardar só a última perderia justamente o instante do crash.
        instalarMedidor([1e9, 3e9, 2e9]);
        await medirAgora('ready');
        await medirAgora('loading');
        await medirAgora('thinking');
        expect(picoDeMemoria()?.bytes).toBe(3e9);
        expect(picoDeMemoria()?.fase).toBe('loading');
    });

    it('o resumo mostra o pico e a folga até o teto do wasm', async () => {
        instalarMedidor([2 ** 30]); // 1,00 GB
        await medirAgora('ready');
        const texto = resumoDeMemoria();
        expect(texto).toContain('pico 1.00 GB');
        expect(texto).toContain('"ready"');
        // 4,00 - 1,00 = 3,00 de folga. O teto vem do binário do wllama.
        expect(texto).toContain('3.00 GB');
        expect(TETO_WASM_BYTES).toBe(4 * 2 ** 30);
    });

    it('não deixa duas medições correrem juntas', async () => {
        // A API mede durante uma coleta de lixo e pode demorar segundos; duas
        // ao mesmo tempo é pedir para o navegador rejeitar as duas.
        let liberar: (() => void) | null = null;
        let chamadas = 0;
        (globalThis.performance as Alvo).measureUserAgentSpecificMemory = async () => {
            chamadas += 1;
            await new Promise<void>((r) => { liberar = r; });
            return { bytes: 1e9, breakdown: [] };
        };
        (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = true;
        const primeira = medirAgora('ready');
        expect(await medirAgora('ready')).toBeNull();
        expect(chamadas).toBe(1);
        liberar!();
        await primeira;
    });

    it('uma API que estoura não derruba nada', async () => {
        (globalThis.performance as Alvo).measureUserAgentSpecificMemory = async () => {
            throw new Error('SecurityError');
        };
        (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = true;
        expect(await medirAgora('ready')).toBeNull();
        expect(picoDeMemoria()).toBeNull();
    });

    it('a vigília faz uma leitura de base na hora, e não uma por quadro', async () => {
        // Base primeiro: "pico" sem linha de base não distingue um cérebro de
        // 300 MB de um de 3 GB.
        vi.useFakeTimers();
        try {
            const estado = instalarMedidor([1e9, 2e9]);
            vigiarMemoria(() => 'ready');
            await vi.advanceTimersByTimeAsync(1);
            expect(estado.chamadas).toBe(1);
            await vi.advanceTimersByTimeAsync(45_000);
            expect(estado.chamadas).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('soma o breakdown quando o navegador não dá o total', async () => {
        (globalThis.performance as Alvo).measureUserAgentSpecificMemory = async () => ({
            breakdown: [{ bytes: 1e8 }, { bytes: 2e8 }],
        });
        (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = true;
        expect((await medirAgora('ready'))?.bytes).toBe(3e8);
    });
});
