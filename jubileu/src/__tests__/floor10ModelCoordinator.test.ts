import { describe, expect, it } from 'vitest';
import { Floor10ModelCoordinator } from '../npc/floor10ModelCoordinator';

describe('Floor10ModelCoordinator — dois LLMs residentes, uma geração por vez', () => {
    it('mantém o cérebro anterior residente ao carregar o próximo', async () => {
        const coordinator = new Floor10ModelCoordinator();
        const events: string[] = [];
        coordinator.register('conversation', () => { events.push('unload-conversation'); });
        coordinator.register('deliberation', () => { events.push('unload-deliberation'); });

        await coordinator.activate('conversation', async () => {
            events.push('load-conversation');
            return '3B';
        });
        await coordinator.activate('deliberation', async () => {
            events.push('load-deliberation');
            return '1B';
        });

        expect(events).toEqual([
            'load-conversation',
            'load-deliberation',
        ]);
        expect(coordinator.residents()).toEqual(['conversation', 'deliberation']);
        expect(coordinator.owner()).toBe('deliberation');
    });

    it('pausa o Mini para carregar o Smol sem descarregar seus pesos', async () => {
        const coordinator = new Floor10ModelCoordinator();
        let pauses = 0;
        let unloads = 0;
        coordinator.register(
            'deliberation',
            () => { unloads += 1; },
            () => { pauses += 1; },
        );
        coordinator.register('conversation', () => undefined);
        await coordinator.activate('deliberation', async () => '1B');

        await coordinator.activate('conversation', async () => '3B');

        expect(pauses).toBe(1);
        expect(unloads).toBe(0);
        expect(coordinator.residents()).toEqual(['conversation', 'deliberation']);
    });

    it('serializa ativações concorrentes sem sobrepor os carregamentos', async () => {
        const coordinator = new Floor10ModelCoordinator();
        const events: string[] = [];
        let finishConversationLoad: (() => void) | undefined;
        let signalConversationStarted: (() => void) | undefined;
        const conversationGate = new Promise<void>((resolve) => {
            finishConversationLoad = resolve;
        });
        const conversationStarted = new Promise<void>((resolve) => {
            signalConversationStarted = resolve;
        });
        coordinator.register('conversation', () => { events.push('unload-conversation'); });

        const conversation = coordinator.activate('conversation', async () => {
            events.push('conversation-start');
            signalConversationStarted?.();
            await conversationGate;
            events.push('conversation-end');
            return '3B';
        });
        const deliberation = coordinator.activate('deliberation', async () => {
            events.push('deliberation-start');
            return '1B';
        });

        await conversationStarted;
        expect(events).toEqual(['conversation-start']);
        finishConversationLoad?.();
        await Promise.all([conversation, deliberation]);

        expect(events).toEqual([
            'conversation-start',
            'conversation-end',
            'deliberation-start',
        ]);
        expect(coordinator.residents()).toEqual(['conversation', 'deliberation']);
    });

    it('interrompe a carga da deliberação assim que a conversa é pedida', async () => {
        const coordinator = new Floor10ModelCoordinator();
        const events: string[] = [];
        let signalStarted: (() => void) | undefined;
        let cancelLoad: (() => void) | undefined;
        const started = new Promise<void>((resolve) => {
            signalStarted = resolve;
        });
        const loadGate = new Promise<void>((resolve) => {
            cancelLoad = resolve;
        });
        coordinator.register(
            'deliberation',
            () => { events.push('unload-deliberation'); },
            () => {
                events.push('pause-deliberation');
                cancelLoad?.();
            },
        );

        const deliberation = coordinator.activate('deliberation', async () => {
            events.push('deliberation-start');
            signalStarted?.();
            await loadGate;
            events.push('deliberation-stopped');
            return null;
        });
        await started;

        const conversation = coordinator.activate('conversation', async () => {
            events.push('conversation-start');
            return '3B';
        });
        await Promise.all([deliberation, conversation]);

        expect(events).toEqual([
            'deliberation-start',
            'pause-deliberation',
            'deliberation-stopped',
            'conversation-start',
        ]);
        expect(events).not.toContain('unload-deliberation');
        expect(coordinator.residents()).toEqual(['conversation']);
        expect(coordinator.owner()).toBe('conversation');
    });

    it('libera o cérebro ativo uma única vez', async () => {
        const coordinator = new Floor10ModelCoordinator();
        let unloads = 0;
        coordinator.register('conversation', () => { unloads += 1; });
        await coordinator.activate('conversation', async () => '3B');

        await coordinator.release('conversation');
        await coordinator.release('conversation');

        expect(unloads).toBe(1);
        expect(coordinator.owner()).toBeNull();
    });

    it('libera um cérebro sem expulsar o outro', async () => {
        const coordinator = new Floor10ModelCoordinator();
        let conversationUnloads = 0;
        let deliberationUnloads = 0;
        coordinator.register('conversation', () => { conversationUnloads += 1; });
        coordinator.register('deliberation', () => { deliberationUnloads += 1; });
        await coordinator.activate('conversation', async () => '3B');
        await coordinator.activate('deliberation', async () => '1B');

        await coordinator.release('deliberation');

        expect(deliberationUnloads).toBe(1);
        expect(conversationUnloads).toBe(0);
        expect(coordinator.residents()).toEqual(['conversation']);
    });
});
