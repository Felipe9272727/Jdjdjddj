import { useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, where, serverTimestamp, Firestore } from 'firebase/firestore';
import fallbackConfig from '../firebase-applet-config.json';
import { Vector3 } from 'three';
import { MAX_LEVEL, MP_GHOST_TTL_MS, MP_WRITE_INTERVAL, MP_WRITE_THRESHOLD, MP_ROTATION_THRESHOLD, MP_FORCE_WRITE_MS, CHAT_TTL_MS, CHAT_MAX_LEN, CHAT_CLEAR_DELAY, PLAYER_NAME_MAX_LEN } from './constants';

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

// ─── Player ID (localStorage UUID, no Firebase Auth) ────────────────────────
const PLAYER_ID_KEY = 'jubileu_player_id';
const getLocalPlayerId = (): string => {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(PLAYER_ID_KEY, id); }
    return id;
};

// ─── Player Name ────────────────────────────────────────────────────────────
const PLAYER_NAME_KEY = 'jubileu_player_name';
const DEFAULT_NAMES = ['Player', 'Guest', 'Noob', 'Pro', 'Explorer', 'Wanderer'];

export const getPlayerName = (): string => {
    const stored = localStorage.getItem(PLAYER_NAME_KEY);
    if (stored && stored.trim().length > 0) return stored.trim().slice(0, PLAYER_NAME_MAX_LEN);
    const random = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
    const num = Math.floor(Math.random() * 9999);
    return `${random}${num}`;
};

export const setPlayerName = (name: string) => {
    const clean = name.trim().slice(0, PLAYER_NAME_MAX_LEN) || getPlayerName();
    localStorage.setItem(PLAYER_NAME_KEY, clean);
    return clean;
};

// ─── Chat Message Interface ─────────────────────────────────────────────────
export interface ChatMessage {
    id: string;
    name: string;
    text: string;
    timestamp: number;
}

// ─── MP Player Interface ────────────────────────────────────────────────────
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
    name: string;
    chatMsg: string;
    chatAt: number;
}

// ─── useMultiplayer Hook ────────────────────────────────────────────────────
export const useMultiplayer = (
    playerPositionRef: React.MutableRefObject<Vector3>,
    rotationYRef: React.MutableRefObject<number>,
    playerState: 'idle' | 'walking',
    isEnabled: boolean,
    level: number = 0,
    playerName: string = 'Player'
) => {
    const [otherPlayers, setOtherPlayers] = useState<Record<string, MPPlayer>>({});
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const playerIdRef = useRef(getLocalPlayerId());
    const playerStateRef = useRef(playerState);
    const playerNameRef = useRef(playerName);
    const chatMsgRef = useRef('');
    const chatAtRef = useRef(0);
    const chatClearTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    useEffect(() => { playerStateRef.current = playerState; }, [playerState]);
    useEffect(() => { playerNameRef.current = playerName; }, [playerName]);

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
        const GHOST_TTL_MS = MP_GHOST_TTL_MS;
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

            // Collect chat messages from all players (including ghosts within 30s)
            const msgs: ChatMessage[] = [];
            const chatCutoff = Date.now() - CHAT_TTL_MS;
            snap.forEach(d => {
                const data = d.data();
                if (data.chatMsg && data.chatAt && data.chatAt > chatCutoff) {
                    msgs.push({
                        id: d.id,
                        name: data.name || 'Unknown',
                        text: data.chatMsg,
                        timestamp: data.chatAt,
                    });
                }
            });
            // Sort by timestamp ascending
            msgs.sort((a, b) => a.timestamp - b.timestamp);
            setChatMessages(msgs);
        }, (err) => console.error('[MP] Snapshot erro:', err));
        return () => unsub();
    }, [isEnabled, level]);

    // Publish own position/state/chat
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
            do {
                writeQueued = false;
                try {
                    const data: any = {
                        x: playerPositionRef.current.x,
                        y: playerPositionRef.current.y,
                        z: playerPositionRef.current.z,
                        ry: rotationYRef.current,
                        updatedAt: serverTimestamp(),
                        state: playerStateRef.current,
                        worldId: 'main',
                        isActive: true,
                        level: clampLevel(level ?? 0),
                        name: playerNameRef.current,
                        chatMsg: chatMsgRef.current,
                        chatAt: chatAtRef.current,
                    };
                    if (!initialized) {
                        await setDoc(docRef, data);
                        initialized = true;
                    } else {
                        await updateDoc(docRef, data);
                    }
                } catch (e: any) {
                    console.error('[MP] Push erro:', e?.code || e?.message || e);
                }
            } while (writeQueued);
            writeInFlight = false;
        };

        push();

        const intervalId = setInterval(() => {
            const p = playerPositionRef.current;
            const r = rotationYRef.current;
            const now = Date.now();
            if (p.distanceTo(lastPos) > MP_WRITE_THRESHOLD || Math.abs(r - lastRot) > MP_ROTATION_THRESHOLD || now - lastTime > MP_FORCE_WRITE_MS) {
                push();
                lastPos.copy(p);
                lastRot = r;
                lastTime = now;
            }
        }, MP_WRITE_INTERVAL); // 5/sec instead of 100ms — still smooth, half the Firestore writes

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

    // Send chat message — with local fallback
    const sendChat = (msg: string) => {
        const clean = msg.trim().slice(0, CHAT_MAX_LEN);
        if (!clean) return;
        const now = Date.now();
        chatMsgRef.current = clean;
        chatAtRef.current = now;

        // Always add to local messages immediately (fallback)
        setChatMessages(prev => {
            const newMsg: ChatMessage = {
                id: playerIdRef.current,
                name: playerNameRef.current,
                text: clean,
                timestamp: now,
            };
            const updated = [...prev, newMsg];
            // Keep only last 30 messages
            return updated.slice(-30);
        });

        // Try Firestore in background (may fail if rules not deployed)
        const db = getDb();
        if (!db) return;
        const uid = playerIdRef.current;
        const docRef = doc(db, 'worlds/main/players', uid);
        updateDoc(docRef, {
            chatMsg: clean,
            chatAt: now,
            updatedAt: serverTimestamp(),
        }).catch((e) => {
            // Firestore failed — message is already in local state, so it still works
            console.warn('[MP] Chat Firestore write failed (local fallback active):', e?.code || e?.message);
        });

        // Auto-clear after 30s — tracked for cleanup
        const clearTimer = setTimeout(() => {
            chatClearTimersRef.current.delete(clearTimer);
            if (chatMsgRef.current === clean) {
                chatMsgRef.current = '';
                chatAtRef.current = 0;
                updateDoc(docRef, { chatMsg: '', chatAt: 0, updatedAt: serverTimestamp() }).catch(() => {});
            }
        }, CHAT_CLEAR_DELAY);
        chatClearTimersRef.current.add(clearTimer);
    };

    // Cleanup chat clear timers on unmount
    useEffect(() => {
        return () => {
            chatClearTimersRef.current.forEach(clearTimeout);
            chatClearTimersRef.current.clear();
        };
    }, []);

    const login = async (): Promise<string | null> => {
        return playerIdRef.current;
    };
    const user = { uid: playerIdRef.current };

    return { user, login, otherPlayers, sendChat, chatMessages };
};
