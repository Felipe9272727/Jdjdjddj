import { afterEach, describe, expect, it } from 'vitest';
import { capacidadesDoRuntime, resumoDoRuntime } from '../npc/floor10Runtime';

const originalSuspending = (WebAssembly as { Suspending?: unknown }).Suspending;
const originalMemory = WebAssembly.Memory;

function semJspi(): void {
    delete (WebAssembly as { Suspending?: unknown }).Suspending;
}
function comJspi(): void {
    (WebAssembly as { Suspending?: unknown }).Suspending = class {};
}
function semMem64(): void {
    (WebAssembly as { Memory: unknown }).Memory = class {
        constructor(d: { address?: string }) {
            if (d?.address === 'i64') throw new TypeError('memory64 não suportado');
        }
    };
}
function comMem64(): void {
    (WebAssembly as { Memory: unknown }).Memory = class {
        constructor(_d: unknown) { /* aceita tudo */ }
    };
}

describe('npc/floor10Runtime — qual dos dois binários este aparelho roda', () => {
    afterEach(() => {
        (WebAssembly as { Memory: unknown }).Memory = originalMemory;
        if (originalSuspending === undefined) delete (WebAssembly as { Suspending?: unknown }).Suspending;
        else (WebAssembly as { Suspending?: unknown }).Suspending = originalSuspending;
        delete (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    });

    it('com JSPI e memory64, roda o binário padrão', () => {
        comJspi(); comMem64();
        const c = capacidadesDoRuntime();
        expect(c.jspi).toBe(true);
        expect(c.mem64).toBe(true);
        expect(c.precisaCompat).toBe(false);
        expect(resumoDoRuntime()).toContain('padrão');
    });

    it('sem JSPI, cai no compat — que é OUTRO binário, baixado do CDN', () => {
        // `needCompat() = !isSupportJSPI() || !isSupportMem64()`, copiado do
        // wllama. O Chrome ganhou JSPI na 137: um Android mais velho que isso
        // roda um runtime que nenhuma das minhas execuções mediu.
        semJspi(); comMem64();
        expect(capacidadesDoRuntime().precisaCompat).toBe(true);
        expect(resumoDoRuntime()).toContain('COMPAT');
        expect(resumoDoRuntime()).toContain('sem JSPI');
    });

    it('sem memory64, também cai no compat', () => {
        // O binário padrão importa `env.memory` com flags=0x7 — o bit 4 é
        // MEMORY64. Lido do wllama.wasm, não deduzido.
        comJspi(); semMem64();
        expect(capacidadesDoRuntime().precisaCompat).toBe(true);
        expect(resumoDoRuntime()).toContain('sem memory64');
    });

    it('falta de isolamento aparece em CAIXA ALTA, porque custa 3 threads', () => {
        comJspi(); comMem64();
        (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated = false;
        expect(capacidadesDoRuntime().isolado).toBe(false);
        expect(resumoDoRuntime()).toContain('SEM ISOLAMENTO');
    });

    it('nenhuma checagem estoura quando o WebAssembly é exótico', () => {
        (WebAssembly as { Memory: unknown }).Memory = class {
            constructor() { throw new Error('sem memória nenhuma'); }
        };
        semJspi();
        expect(() => capacidadesDoRuntime()).not.toThrow();
        expect(capacidadesDoRuntime().mem64).toBe(false);
    });
});
