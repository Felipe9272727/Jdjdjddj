import { assertSucceeds, assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import * as fs from 'fs';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

let testEnv: any;
const rules = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: 'gen-lang-client-0039518806',
        firestore: { rules }
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

beforeEach(async () => {
    await testEnv.clearFirestore();
});

describe('Firestore Security Rules for Multiplayer', () => {
    it('1. Create with missing fields should fail', async () => {
        const db = testEnv.authenticatedContext('user123').firestore();
        await assertFails(db.doc('worlds/main/players/user123').set({
            x: 0, y: 0 // Missing z, ry, etc.
        }));
    });

    it('2. Create with extra fields (Shadow Update) should fail', async () => {
        const db = testEnv.authenticatedContext('user123').firestore();
        await assertFails(db.doc('worlds/main/players/user123').set({
            x: 0, y: 0, z: 0, ry: 0, state: 'idle', worldId: 'main', isActive: true, level: 0,
            updatedAt: serverTimestamp(),
            ghostField: 'spoof'
        }));
    });

    it('3. Update with missing fields should fail', async () => {
        const dbContext = testEnv.authenticatedContext('user123');
        await testEnv.withSecurityRulesDisabled(async (context: any) => {
            const db = context.firestore();
            await db.doc('worlds/main/players/user123').set({
                x: 0, y: 0, z: 0, ry: 0, state: 'idle', worldId: 'main', isActive: true, level: 0,
                updatedAt: serverTimestamp()
            });
        });
        const db = dbContext.firestore();
        await assertFails(db.doc('worlds/main/players/user123').update({
            ghostField: true
        }));
    });

    it('5. Spoofing update (update other player) should fail', async () => {
        const dbContext = testEnv.authenticatedContext('hacker');
        await testEnv.withSecurityRulesDisabled(async (context: any) => {
            const db = context.firestore();
            await db.doc('worlds/main/players/victim').set({
                x: 0, y: 0, z: 0, ry: 0, state: 'idle', worldId: 'main', isActive: true, level: 0,
                updatedAt: serverTimestamp()
            });
        });
        const db = dbContext.firestore();
        await assertFails(db.doc('worlds/main/players/victim').update({
            x: 999,
            updatedAt: serverTimestamp()
        }));
    });

    it('6. Fake timestamp create should fail', async () => {
        const db = testEnv.authenticatedContext('user123').firestore();
        await assertFails(db.doc('worlds/main/players/user123').set({
            x: 0, y: 0, z: 0, ry: 0, state: 'idle', worldId: 'main', isActive: true, level: 0,
            updatedAt: new Date() // Client time
        }));
    });

    it('7. Invalid data type for X should fail', async () => {
        const db = testEnv.authenticatedContext('user123').firestore();
        await assertFails(db.doc('worlds/main/players/user123').set({
            x: '0', y: 0, z: 0, ry: 0, state: 'idle', worldId: 'main', isActive: true, level: 0,
            updatedAt: serverTimestamp()
        }));
    });

    it('8. Huge state field should fail', async () => {
        const db = testEnv.authenticatedContext('user123').firestore();
        await assertFails(db.doc('worlds/main/players/user123').set({
            x: 0, y: 0, z: 0, ry: 0, state: 'A'.repeat(50), worldId: 'main', isActive: true, level: 0,
            updatedAt: serverTimestamp()
        }));
    });

    it('SUCCESS: valid create and update', async () => {
        const db = testEnv.authenticatedContext('user123').firestore();
        await assertSucceeds(db.doc('worlds/main/players/user123').set({
            x: 0, y: 0, z: 0, ry: 0, state: 'idle', worldId: 'main', isActive: true, level: 0,
            updatedAt: serverTimestamp()
        }));
        await assertSucceeds(db.doc('worlds/main/players/user123').set({
            x: 1, y: 1, z: 1, ry: 1, state: 'run', worldId: 'main', isActive: true, level: 1,
            updatedAt: serverTimestamp()
        }));
    });
});
