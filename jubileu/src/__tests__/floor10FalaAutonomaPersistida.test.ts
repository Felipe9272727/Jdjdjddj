import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    npc,
    npcAutonomousSay,
    npcSet,
    npcSubscribe,
} from '../npc/npcStore';
import { lerConversa } from '../npc/floor10Convivencia';

class StorageMock implements Storage {
    private readonly values = new Map<string, string>();
    writes = 0;

    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) {
        this.writes++;
        this.values.set(key, value);
    }
}

describe('fala autônoma do Nilo', () => {
    let storage: StorageMock;

    beforeEach(() => {
        storage = new StorageMock();
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: storage,
        });
        npcSet({ history: [], autonomousSpeech: '', autonomousSpeechId: 0 });
        storage.clear();
        storage.writes = 0;
    });

    afterEach(() => {
        delete (globalThis as { localStorage?: Storage }).localStorage;
    });

    it('persiste a fala pelo funil e notifica uma única vez', () => {
        let notificacoes = 0;
        const unsubscribe = npcSubscribe(() => { notificacoes++; });

        npcAutonomousSay('  Eu ainda estou aqui.  ');

        unsubscribe();
        expect(npc.history.at(-1)).toEqual({
            role: 'assistant',
            content: 'Eu ainda estou aqui.',
        });
        expect(lerConversa()).toEqual([{
            role: 'assistant',
            content: 'Eu ainda estou aqui.',
        }]);
        expect(storage.writes).toBe(1);
        expect(notificacoes).toBe(1);
    });
});
