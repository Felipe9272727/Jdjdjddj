import { useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, where, limit, serverTimestamp, Firestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from 'firebase/auth';
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
let _authCache: Auth | null = null;
const getServices = (): { db: Firestore; auth: Auth } | null => {
    if (_dbCache && _authCache) return { db: _dbCache, auth: _authCache };
    const cfg = getConfig();
    if (!cfg) return null;
    try {
        const app = getApps().length === 0 ? initializeApp(cfg) : getApps()[0];
        _dbCache = getFirestore(app, cfg.firestoreDatabaseId || '(default)');
        _authCache = getAuth(app);
        return { db: _dbCache, auth: _authCache };
    } catch (e) {
        console.error('[MP] Firebase init erro:', e);
        return null;
    }
};

// Wait for an authenticated UID. The Firestore rules require request.auth.uid
// to equal the player doc id, so we sign in anonymously and use auth.uid as
// the canonical player id (replacing the previous localStorage UUID, which
// rules-rejected every write).
const PLAYER_ID_KEY = 'jubileu_player_id';
const getLocalPlayerId = (): string => {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(PLAYER_ID_KEY, id); }
    return id;
};

const ensureSignedIn = (auth: Auth): Promise<string> => {
    return new Promise((resolve, reject) => {
        // Fast path: already signed in
        if (auth.currentUser?.uid) {
            console.log('[MP] Already authed:', auth.currentUser.uid.slice(0, 8));
            resolve(auth.currentUser.uid);
            return;
        }

        let settled = false;
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                console.warn('[MP] Auth timeout — falling back to local ID');
                resolve(getLocalPlayerId());
            }
        }, 8000); // 8s timeout

        const unsub = onAuthStateChanged(
            auth,
            (user) => {
                if (settled) return;
                if (user?.uid) {
                    settled = true;
                    clearTimeout(timeout);
                    unsub();
                    console.log('[MP] Auth success:', user.uid.slice(0, 8));
                    resolve(user.uid);
                }
            },
            (err) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timeout);
                    unsub();
                    console.warn('[MP] Auth error, using local ID:', err.message);
                    resolve(getLocalPlayerId());
                }
            }
        );

        signInAnonymously(auth).catch((err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timeout);
                unsub();
                console.warn('[MP] signInAnonymously failed, using local ID:', err.message);
                resolve(getLocalPlayerId());
            }
        });
    });
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
    const [uid, setUid] = useState<string | null>(null);
    const playerStateRef = useRef(playerState);
    useEffect(() => { playerStateRef.current = playerState; }, [playerState]);

    // Resolve the auth UID once the hook is enabled. Without this every
    // Firestore op below is rejected by the security rules.
    useEffect(() => {
        if (!isEnabled) return;
        const services = getServices();
        if (!services) {
            console.warn('[MP] Sem config Firebase — check __FIREBASE_CONFIG__');
            return;
        }
        console.log('[MP] Initializing auth...');
        let cancelled = false;
        ensureSignedIn(services.auth)
            .then((id) => {
                if (cancelled) return;
                console.log('[MP] Ready, player ID:', id.slice(0, 8));
                setUid(id);
            })
            .catch((e) => console.error('[MP] Auth fatal error:', e));
        return () => { cancelled = true; };
    }, [isEnabled]);

    // Subscribe to other players in the same level once we have a UID.
    useEffect(() => {
        if (!isEnabled || !uid) return;
        const services = getServices();
        if (!services) return;
        const q = query(
            collection(services.db, 'worlds/main/players'),
            where('worldId', '==', 'main'),
            where('isActive', '==', true),
            where('level', '==', clampLevel(level ?? 0)),
            // Cap reads per snapshot — the renderer can't keep up with hundreds of
            // remote players anyway, and this bounds Firestore costs.
            limit(50)
        );
        const GHOST_TTL_MS = 10000;
        const unsub = onSnapshot(q, (snap) => {
            const players: Record<string, MPPlayer> = {};
            const cutoff = Date.now() - GHOST_TTL_MS;
            snap.forEach(d => {
                if (d.id === uid) return;
                const data = d.data();
                const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
                if (updatedAt > 0 && updatedAt < cutoff) return;
                players[d.id] = { id: d.id, ...data } as MPPlayer;
            });
            setOtherPlayers(players);
        }, (err) => console.error('[MP] Snapshot erro:', err));
        return () => unsub();
    }, [isEnabled, level, uid]);

    // Publish own position/state. Only runs after auth resolves.
    useEffect(() => {
        if (!isEnabled || !uid || !playerPositionRef?.current) return;
        const services = getServices();
        if (!services) return;
        const docRef = doc(services.db, 'worlds/main/players', uid);

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
            // SPA navigation away from the gameplay route unmounts this hook
            // without firing beforeunload, so mark inactive here too.
            updateDoc(docRef, { isActive: false, updatedAt: serverTimestamp() }).catch(() => {});
        };
    }, [isEnabled, level, uid, playerPositionRef, rotationYRef]);

    // When MP is disabled (e.g. user toggled it off), proactively flag inactive.
    useEffect(() => {
        if (isEnabled || !uid) return;
        const services = getServices();
        if (!services) return;
        const docRef = doc(services.db, 'worlds/main/players', uid);
        updateDoc(docRef, { isActive: false, updatedAt: serverTimestamp() }).catch(() => {});
    }, [isEnabled, uid]);

    const login = async (): Promise<string | null> => {
        const services = getServices();
        if (!services) return null;
        try {
            const id = await ensureSignedIn(services.auth);
            setUid(id);
            return id;
        } catch (e) {
            console.error('[MP] Login erro:', e);
            return null;
        }
    };
    const user = uid ? { uid } : null;

    return { user, login, otherPlayers };
};
