import React from 'react';
import { F11_PAREDES, F11_PLATAFORMAS, F11_MARCOS } from './f11Mundo';
import { comandarAgente } from './agente/agenteSessao';

export function Floor11(): React.ReactElement {
    return <group>
        <hemisphereLight args={['#dbe5ee', '#30382f', 1.1]} />
        <directionalLight position={[5, 15, -3]} intensity={1.4} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 3]}>
            <planeGeometry args={[24, 26]} /><meshStandardMaterial color="#626e69" roughness={0.95} />
        </mesh>
        {F11_PAREDES.map(([x1, z1, x2, z2], i) => <mesh key={i}
            position={[(x1 + x2) / 2, 1.6, (z1 + z2) / 2]} rotation={[0, -Math.atan2(z2 - z1, x2 - x1), 0]}>
            <boxGeometry args={[Math.hypot(x2 - x1, z2 - z1), 3.2, 0.12]} />
            <meshStandardMaterial color={i < 5 ? '#b6b2a0' : '#839591'} roughness={0.9} />
        </mesh>)}
        {F11_PLATAFORMAS.map(p => <mesh key={p.id} position={[p.x, p.topY / 2, p.z]}>
            <boxGeometry args={[p.hw * 2, p.topY, p.hd * 2]} />
            <meshStandardMaterial color="#b68b54" roughness={0.85} />
        </mesh>)}
        {F11_MARCOS.map(p => <mesh key={p.id} position={[p.x, p.y + 0.045, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.32, 0.45, 24]} /><meshBasicMaterial color="#b9eace" />
        </mesh>)}
    </group>;
}

export function Floor11Controls(): React.ReactElement {
    return <div className="fixed z-40 top-16 left-1/2 -translate-x-1/2 flex gap-1 rounded-xl bg-black/65 p-1.5 text-white text-xs"
        onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
        {([
            ['seguir', 'Vem comigo'], ['explorar', 'Explora'], ['esperar', 'Espera'], ['embarcar', 'Elevador'],
        ] as const).map(([modo, texto]) => <button key={modo} className="rounded-lg px-3 py-2 hover:bg-white/15 active:bg-white/25 touch-manipulation"
            onClick={() => comandarAgente(modo)}>{texto}</button>)}
    </div>;
}
