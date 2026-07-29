import React from 'react';
import Floor10Prison from './Floor10Prison';

// ── ANDAR 10 — PLACEHOLDER ────────────────────────────────────────────────
// Uma BASE PLANA e limpa, esperando virar um andar de verdade (o Felipe tem
// uma ideia ambiciosa pra cá). Só o essencial: chão plano navegável, uma borda
// que combina com wallsForState(10) (±22), e luz neutra pra dar pra ver.
// Sem gameplay, sem lore — só o palco vazio.

const WALL_H = 3.2;
const BND = 22;                 // casa com FLOOR10_BND em constants.ts
const WALL = '#3a3d45';
const FLOOR = '#5b5f68';

const EdgeWall: React.FC<{ pos: [number, number, number]; size: [number, number, number] }> = ({ pos, size }) => (
    <mesh position={pos}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={WALL} roughness={0.95} metalness={0} />
    </mesh>
);

const Floor10Base: React.FC = () => {
    return (
        <group>
            {/* luz neutra: hemisfério + um fill direcional suave */}
            <hemisphereLight args={['#cdd3dc', '#2b2d33', 1.0]} />
            <ambientLight intensity={0.35} />
            <directionalLight position={[12, 20, 8]} intensity={0.9} color="#f2f0ea" />

            {/* chão plano */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
                <planeGeometry args={[BND * 2, BND * 2]} />
                <meshStandardMaterial color={FLOOR} roughness={0.9} metalness={0.02} />
            </mesh>
            {/* grade sutil — leitura de "base/placeholder" (nível-editor) */}
            <gridHelper args={[BND * 2, BND, '#4a4e57', '#42454d']} position={[0, 0.02, 0]} />

            {/* A PRISÃO: os aparelhos que só cedem com duas pessoas. */}
            <Floor10Prison />

            {/* borda quadrada (±22), casa com a colisão */}
            <EdgeWall pos={[0, WALL_H / 2, -BND]} size={[BND * 2, WALL_H, 0.4]} />
            <EdgeWall pos={[0, WALL_H / 2, BND]} size={[BND * 2, WALL_H, 0.4]} />
            <EdgeWall pos={[-BND, WALL_H / 2, 0]} size={[0.4, WALL_H, BND * 2]} />
            <EdgeWall pos={[BND, WALL_H / 2, 0]} size={[0.4, WALL_H, BND * 2]} />
        </group>
    );
};

export default Floor10Base;
