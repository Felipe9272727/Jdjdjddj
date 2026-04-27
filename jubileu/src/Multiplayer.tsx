import { useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, where, serverTimestamp, Firestore } from 'firebase/firestore';
import fallbackConfig from '../firebase-applet-config.json';
import { Vector3 } from 'three';
import { MAX_LEVEL } from './constants';

const clampLevel = (n: number) => {
    const v = Number.isFinite(n) ? Math.floor(n) : 0;
    return Math.min(MAX_LEVEL, Math.max(0, v));
};

declare global {
    interface Window {
        __FIREBASE_CONFIG__?: any;
    }
}

const getConfig = () => {
    if (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__ && window.__FIREBASE_CONFIG__.projectId) {
        return window.__FIREBASE_CONFIG__;
    }
    if (fallbackConfig && (fallbackConfig as any).projectId) return fallbackConfig as any;
    return null;
};

let _dbCache: Firestore | null = null;
const getDb = (): Firestore | null => {
    if (_dbCache) return _dbCache;
    const cfg = getConfig();
    if (!cfg) return null;
    try {
        const app = getApps().length === 0 ? initializeApp(cfg) : getApps()[0];
        _dbCache = getFirestore(app, cfg.firestoreDatabaseId || '(default)');
        return _dbCache;
    } catch (e) {
        console.error('[MP] Firebase init erro:', e);
        return null;
    }
};

// Use localStorage UUID as player ID — same as index-18
const PLAYER_ID_KEY = 'jubileu_player_id';
const getLocalPlayerId = (): string => {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(PLAYER_ID_KEY, id); }
    return id;
};

export interface MPPlayer {
    id: string;
    x: number;
    y: number;
    z: number;
    ry: number;
    state: string;
    worldId: string;
    isActive: boolean;
    level: number;
    updatedAt: any;
}

export const useMultiplayer = (
    playerPositionRef: React.MutableRefObject<Vector3>,
    rotationYRef: React.MutableRefObject<number>,
    playerState: 'idle' | 'walking',
    isEnabled: boolean,
    level: number = 0
) => {
    const [otherPlayers, setOtherPlayers] = useState<Record<string, MPPlayer>>({});
    const playerIdRef = useRef(getLocalPlayerId());
    const playerStateRef = useRef(playerState);
    useEffect(() => { playerStateRef.current = playerState; }, [playerState]);

    // Subscribe to other players in the same level
    useEffect(() => {
        if (!isEnabled) return;
        const db = getDb();
        if (!db) {
            console.warn('[MP] Sem config Firebase — check __FIREBASE_CONFIG__');
            return;
        }
        const uid = playerIdRef.current;
        console.log('[MP] Ready, player ID:', uid.slice(0, 8));

        const q = query(
            collection(db, 'worlds/main/players'),
            where('worldId', '==', 'main'),
            where('isActive', '==', true),
            where('level', '==', clampLevel(level ?? 0))
        );
        const GHOST_TTL_MS = 15000; // 15s — remove players that stopped updating
        const unsub = onSnapshot(q, (snap) => {
            const players: Record<string, MPPlayer> = {};
            const cutoff = Date.now() - GHOST_TTL_MS;
            snap.forEach(d => {
                if (d.id === uid) return;
                const data = d.data();
                const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
                // Skip ghost players (stale entries from crashed/closed tabs)
                if (updatedAt > 0 && updatedAt < cutoff) return;
                players[d.id] = { id: d.id, ...data } as MPPlayer;
            });
            setOtherPlayers(players);
        }, (err) => console.error('[MP] Snapshot erro:', err));
        return () => unsub();
    }, [isEnabled, level]);

    // Publish own position/state
    useEffect(() => {
        if (!isEnabled || !playerPositionRef?.current) return;
        const db = getDb();
        if (!db) return;
        const uid = playerIdRef.current;
        const docRef = doc(db, 'worlds/main/players', uid);

        let initialized = false;
        let lastPos = new Vector3();
        let lastRot = 0;
        let lastTime = 0;
        let writeInFlight = false;
        let writeQueued = false;

        const push = async () => {
            if (writeInFlight) { writeQueued = true; return; }
            writeInFlight = true;
            try {
                const data = {
                    x: playerPositionRef.current.x,
                    y: playerPositionRef.current.y,
                    z: playerPositionRef.current.z,
                    ry: rotationYRef.current,
                    updatedAt: serverTimestamp(),
                    state: playerStateRef.current,
                    worldId: 'main',
                    isActive: true,
                    level: clampLevel(level ?? 0),
                };
                if (!initialized) {
                    await setDoc(docRef, data);
                    initialized = true;
                } else {
                    await updateDoc(docRef, data);
                }
            } catch (e: any) {
                console.error('[MP] Push erro:', e?.code || e?.message || e);
            } finally {
                writeInFlight = false;
                if (writeQueued) { writeQueued = false; push(); }
            }
        };

        push();

        const intervalId = setInterval(() => {
            const p = playerPositionRef.current;
            const r = rotationYRef.current;
            const now = Date.now();
            if (p.distanceTo(lastPos) > 0.1 || Math.abs(r - lastRot) > 0.1 || now - lastTime > 2500) {
                push();
                lastPos.copy(p);
                lastRot = r;
                lastTime = now;
            }
        }, 100);

        const handleUnload = () => {
            updateDoc(docRef, { isActive: false, updatedAt: serverTimestamp() }).catch(() => {});
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('beforeunload', handleUnload);
            updateDoc(docRef, { isActive: false, updatedAt: serverTimestamp() }).catch(() => {});
        };
    }, [isEnabled, level, playerPositionRef, rotationYRef]);

    // When MP is disabled, flag inactive
    useEffect(() => {
        if (isEnabled) return;
        const db = getDb();
        if (!db) return;
        const uid = playerIdRef.current;
        const docRef = doc(db, 'worlds/main/players', uid);
        updateDoc(docRef, { isActive: false, updatedAt: serverTimestamp() }).catch(() => {});
    }, [isEnabled]);

    const login = async (): Promise<string | null> => {
        return playerIdRef.current;
    };
    const user = { uid: playerIdRef.current };

    return { user, login, otherPlayers };
};
