/** Bancada (só em DEV): `?elevpreview&cam=x,y,z&alvo=x,y,z&timer=N&nivel=N&aberto` — a cabine sozinha. */
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ElevatorInterior } from './Elevator';

const q = new URLSearchParams(location.search);
const v3 = (k: string, d: number[]) => (q.get(k)?.split(',').map(Number) ?? d) as [number, number, number];

export default function ElevadorPreview() {
    const cam = v3('cam', [0, 1.7, -9.4]), alvo = v3('alvo', [0, 1.6, -15]);
    const timer = q.has('timer') ? Number(q.get('timer')) : null;
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#111' }}>
            <Canvas camera={{ position: cam, fov: 70 }} onCreated={({ camera }) => camera.lookAt(...alvo)}>
                <ambientLight intensity={0.35} />
                <Suspense fallback={null}><ElevatorInterior timer={timer} doorsClosed={!q.has('aberto')} level={Number(q.get('nivel') ?? 3)} /></Suspense>
            </Canvas>
        </div>
    );
}
