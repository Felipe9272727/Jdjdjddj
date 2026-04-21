import { useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, where, serverTimestamp, Firestore } from 'firebase/firestore';
import fallbackConfig from '../firebase-applet-config.json';
import { Vector3 } from 'three';

declare global {
    interface Window {
        __FIREBASE_CONFIG__?: any;
    }
}

const getPlayerId = () => {
    const KEY = 'jubileu_player_id';
    try {
        let id = localStorage.getItem(KEY);
        if (!id) {
            id = (crypto && (crypto as any).randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem(KEY, id);
        }
        return id;
    } catch {
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
};

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
        console.error('[MP] Firestore init erro:', e);
        return null;
    }
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
    const playerIdRef = useRef<string>(getPlayerId());
    const updateTimerRef = useRef<any>(null);
    const playerStateRef = useRef(playerState);
    useEffect(() => { playerStateRef.current = playerState; }, [playerState]);

    useEffect(() => {
        if (!isEnabled) return;
        const db = getDb();
        if (!db) {
            console.warn('[MP] Sem config Firebase');
            return;
        }
        const q = query(
            collection(db, 'worlds/main/players'),
            where('worldId', '==', 'main'),
            where('isActive', '==', true),
            where('level', '==', level ?? 0)
        );
        const unsub = onSnapshot(q, (snap) => {
            const players: Record<string, MPPlayer> = {};
            snap.forEach(d => {
                if (d.id !== playerIdRef.current) {
                    players[d.id] = { id: d.id, ...d.data() } as MPPlayer;
                }
            });
            setOtherPlayers(players);
        }, (err) => console.error('[MP] Snapshot erro:', err));
        return () => unsub();
    }, [isEnabled, level]);

    useEffect(() => {
        if (!isEnabled || !playerPositionRef?.current) return;
        const db = getDb();
        if (!db) return;
        const docRef = doc(db, 'worlds/main/players', playerIdRef.current);

        let initialized = false;
        let lastPos = new Vector3();
        let lastRot = 0;
        let lastTime = 0;

        const push = async () => {
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
                    level: level ?? 0,
                };
                if (!initialized) {
                    await setDoc(docRef, data);
                    initialized = true;
                } else {
                    await updateDoc(docRef, data);
                }
            } catch (e) {
                console.error('[MP] Push erro:', e);
            }
        };

        push();

        updateTimerRef.current = setInterval(() => {
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
            clearInterval(updateTimerRef.current);
            window.removeEventListener('beforeunload', handleUnload);
            handleUnload();
        };
    }, [isEnabled, level, playerPositionRef, rotationYRef]);

    const login = async () => {};
    const user = isEnabled ? { uid: playerIdRef.current } : null;

    return { user, login, otherPlayers };
};
