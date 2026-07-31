import { describe, expect, it, vi } from 'vitest';
import { Floor10ModelCoordinator } from '../npc/floor10ModelCoordinator';

// ── OS MODELOS FICAM. O QUE PAUSA É A GERAÇÃO ─────────────────────────────
// Pedido do Felipe: "deixe o sistema somente como um sistema de pausa, pra não
// ter carregar e descarregar toda hora os modelos". Carregar de novo custa
// centenas de MB e dezenas de segundos; pausar custa zero.

describe('npc/floor10ModelCoordinator — pausa, não descarrega', () => {
    it('a fala chegando NÃO descarrega a vontade: só interrompe a geração', async () => {
        const coordenador = new Floor10ModelCoordinator();
        const descarregarVontade = vi.fn();
        const pausarVontade = vi.fn();
        coordenador.register('deliberation', descarregarVontade, pausarVontade);
        coordenador.register('conversation', vi.fn());

        await coordenador.activate('deliberation', async () => ({ vontade: true }));
        expect(coordenador.isResident('deliberation')).toBe(true);

        await coordenador.activate('conversation', async () => ({ fala: true }));

        expect(pausarVontade).toHaveBeenCalled();
        expect(descarregarVontade).not.toHaveBeenCalled();
        // E ela continua residente: os pesos ficam na memória para retomar.
        expect(coordenador.isResident('deliberation')).toBe(true);
        expect(coordenador.residents()).toContain('conversation');
    });

    it('os dois convivem residentes — nenhum expulsa o outro', async () => {
        const coordenador = new Floor10ModelCoordinator();
        coordenador.register('deliberation', vi.fn());
        coordenador.register('conversation', vi.fn());
        await coordenador.activate('conversation', async () => ({}));
        await coordenador.activate('deliberation', async () => ({}));
        expect(coordenador.residents().sort()).toEqual(['conversation', 'deliberation']);
    });

    it('markUnloaded acerta a conta SEM chamar o descarregador', async () => {
        // É o caminho de uma rodada que falhou em carregar: não há nada para
        // descarregar, e usar `release` ali fazia o vaivém de carregar e
        // descarregar a cada tentativa frustrada.
        const coordenador = new Floor10ModelCoordinator();
        const descarregar = vi.fn();
        coordenador.register('deliberation', descarregar);
        await coordenador.activate('deliberation', async () => null);
        coordenador.markUnloaded('deliberation');
        expect(descarregar).not.toHaveBeenCalled();
        expect(coordenador.isResident('deliberation')).toBe(false);
        // E uma nova tentativa continua possível.
        await coordenador.activate('deliberation', async () => ({}));
        expect(coordenador.isResident('deliberation')).toBe(true);
    });

    it('release explícito (troca de modelo) AÍ SIM descarrega', async () => {
        const coordenador = new Floor10ModelCoordinator();
        const descarregar = vi.fn();
        coordenador.register('deliberation', descarregar);
        await coordenador.activate('deliberation', async () => ({}));
        await coordenador.release('deliberation');
        expect(descarregar).toHaveBeenCalledTimes(1);
        expect(coordenador.isResident('deliberation')).toBe(false);
    });
});
