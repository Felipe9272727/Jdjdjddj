import { describe, expect, it } from 'vitest';
import { Floor10ModelCoordinator } from '../npc/floor10ModelCoordinator';

describe('Floor10ModelCoordinator — um único LLM residente', () => {
    it('descarrega o cérebro anterior antes de carregar o próximo', async () => {
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
            'unload-conversation',
            'load-deliberation',
        ]);
        expect(coordinator.owner()).toBe('deliberation');
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
            'unload-conversation',
            'deliberation-start',
        ]);
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
});
