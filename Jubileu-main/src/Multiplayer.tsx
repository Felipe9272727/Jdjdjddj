import { useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { Vector3 } from 'three';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export interface MPPlayer {
    id: string;
    x: number;
    y: number;
    z: number;
    ry: number;
    state: string;
    worldId: string;
    isActive: boolean;
    updatedAt: any;
}

export const useMultiplayer = (playerPositionRef: React.MutableRefObject<Vector3>, rotationYRef: React.MutableRefObject<number>, playerState: "idle" | "walking", isEnabled: boolean) => {
    const [user, setUser] = useState<User | null>(null);
    const [otherPlayers, setOtherPlayers] = useState<Record<string, MPPlayer>>({});
    const updateTimerId = useRef<any>(null);

    useEffect(() => {
        return onAuthStateChanged(auth, u => setUser(u));
    }, []);

    const login = async () => {
        await signInAnonymously(auth);
    };

    useEffect(() => {
        if (!isEnabled || !user) return;

        const q = query(
            collection(db, 'worlds/main/players'),
            where('worldId', '==', 'main'),
            where('isActive', '==', true)
        );

        const unsub = onSnapshot(q, (snap) => {
            const players: Record<string, MPPlayer> = {};
            snap.forEach(d => {
                if (d.id !== user.uid) {
                    players[d.id] = { id: d.id, ...d.data() } as MPPlayer;
                }
            });
            setOtherPlayers(players);
        }, (err) => console.error("Firestore error:", err));

        return () => unsub();
    }, [isEnabled, user]);

    useEffect(() => {
        if (!isEnabled || !user) return;

        const docRef = doc(db, 'worlds/main/players', user.uid);
        
        let lastPos = new Vector3();
        let lastRot = 0;
        let lastTime = 0;
        
        let isInitialized = false;
        
        const forceUpdate = async () => {
            try {
                const data = {
                    x: playerPositionRef.current.x,
                    y: playerPositionRef.current.y,
                    z: playerPositionRef.current.z,
                    ry: rotationYRef.current,
                    updatedAt: serverTimestamp(),
                    state: playerState,
                    worldId: 'main',
                    isActive: true
                };
                if (!isInitialized) {
                    await setDoc(docRef, data);
                    isInitialized = true;
                } else {
                    await updateDoc(docRef, {
                        x: data.x,
                        y: data.y,
                        z: data.z,
                        ry: data.ry,
                        updatedAt: data.updatedAt,
                        state: data.state,
                        isActive: data.isActive
                    });
                }
            } catch (err: any) {
                console.error("Failed to update position:", err);
                if (err?.message?.includes("offline")) {
                    console.error("Please check your Firebase configuration.");
                }
            }
        };

        // Initialize state
        forceUpdate();

        updateTimerId.current = setInterval(() => {
            const currentPos = playerPositionRef.current;
            const currentRot = rotationYRef.current;
            const now = Date.now();
            
            // Only update if moved more than 0.1 units, rotated more than 0.1 rad, or state changed, OR every 2.5s anyway to keep alive
            const dist = currentPos.distanceTo(lastPos);
            const rotDiff = Math.abs(currentRot - lastRot);
            if (dist > 0.1 || rotDiff > 0.1 || (now - lastTime > 2500)) {
                forceUpdate();
                lastPos.copy(currentPos);
                lastRot = currentRot;
                lastTime = now;
            }
        }, 100);

        const handleUnload = () => {
             updateDoc(docRef, {
                isActive: false,
                updatedAt: serverTimestamp(),
             }).catch(console.error);
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            clearInterval(updateTimerId.current);
            window.removeEventListener('beforeunload', handleUnload);
            handleUnload();
        };

    }, [isEnabled, user, playerState, playerPositionRef, rotationYRef]);

    return { user, login, otherPlayers };
};
