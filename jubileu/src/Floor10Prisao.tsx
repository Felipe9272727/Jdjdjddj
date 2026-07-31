import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Floor10Base from './Floor10Base';
import Floor10Npc from './Floor10Npc';
import { PRISON_DEVICES, f10prison, prisonReset, prisonSubscribe } from './npc/f10Prison';
import { npc } from './npc/npcStore';

// ── A BANCADA DA PRISÃO — /?prisao ────────────────────────────────────────
// Existe por dois motivos, e os dois são práticos:
//
// 1. O dono do jogo NÃO CHEGA ao Andar 10 pelo elevador ainda. Sem esta página
//    o campo de provas seria invisível para quem mais precisa vê-lo.
// 2. O jogo inteiro não sobe num ambiente sem internet (uma textura vem do
//    GitHub e derruba a cena), então nem eu conseguia testar a prisão dentro
//    dele. Aqui só monta o Andar 10: chão, aparelhos e o Nilo.
//
// O jogador é uma marca que você arrasta com o mouse/dedo — o objetivo é ver
// as duas pontas ao mesmo tempo, de cima, e a tranca ceder quando os dois
// estão em posição.

const SALA = 22;

/** Câmera de cima, olhando a sala inteira. */
const Camera: React.FC = () => {
    useFrame(({ camera }) => {
        camera.position.set(0, 34, 0.01);
        camera.lookAt(0, 0, 0);
    });
    return null;
};

/** O corpo do jogador nesta bancada: uma marca que você arrasta. */
const MarcaDoJogador: React.FC<{
    posRef: React.MutableRefObject<THREE.Vector3>;
}> = ({ posRef }) => {
    const mesh = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (mesh.current) mesh.current.position.copy(posRef.current);
    });
    return (
        <mesh ref={mesh} position={[12, 0.9, 14]}>
            <capsuleGeometry args={[0.34, 1, 6, 12]} />
            <meshStandardMaterial color="#ffd479" emissive="#7a5c10" emissiveIntensity={0.5} />
        </mesh>
    );
};

const Prisao: React.FC = () => {
    // Longe do Nilo, mas DENTRO da sala. Duas armadilhas que eu caí testando:
    // nascendo em cima dele, o reflexo passava a partida em make-space; e
    // nascendo em z=-16 (dentro do poço do elevador) ele ia atrás e ficava
    // entalado na boca do poço, sem nunca chegar a um aparelho.
    const playerPositionRef = useRef(new THREE.Vector3(12, 0, 14));
    const [, forcar] = useState(0);
    const wrap = useRef<HTMLDivElement>(null);
    const arrastando = useRef(false);

    useEffect(() => prisonSubscribe(() => forcar((n) => n + 1)), []);
    // A sala não muda de versão a cada quadro (só quando algo acontece), então
    // um pulso lento mantém os números da tela vivos sem re-render à toa.
    useEffect(() => {
        const id = window.setInterval(() => forcar((n) => n + 1), 250);
        return () => window.clearInterval(id);
    }, []);

    // Sonda: pôr o jogador num ponto sem arrastar (o teste headless usa).
    useEffect(() => {
        (window as unknown as Record<string, unknown>).__f10setPlayer =
            (x: number, z: number) => { playerPositionRef.current.set(x, 0, z); };
    }, []);

    // Arrastar o jogador pelo mapa: converte pixel em metro da sala.
    useEffect(() => {
        const mover = (e: PointerEvent) => {
            if (!arrastando.current || !wrap.current) return;
            const r = wrap.current.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width - 0.5) * SALA * 2;
            const z = ((e.clientY - r.top) / r.height - 0.5) * SALA * 2;
            playerPositionRef.current.set(
                Math.max(-SALA + 1, Math.min(SALA - 1, x)),
                0,
                Math.max(-SALA + 1, Math.min(SALA - 1, z)),
            );
        };
        const soltar = () => { arrastando.current = false; };
        window.addEventListener('pointermove', mover);
        window.addEventListener('pointerup', soltar);
        return () => {
            window.removeEventListener('pointermove', mover);
            window.removeEventListener('pointerup', soltar);
        };
    }, []);

    const caixa: React.CSSProperties = {
        background: '#141419', border: '1px solid #2a2a33', borderRadius: 8,
        padding: 10, marginBottom: 10,
    };

    return (
        <div style={{
            font: '13px/1.5 ui-monospace, Menlo, Consolas, monospace',
            color: '#d8d8e0', padding: 12, maxWidth: 820, margin: '0 auto',
        }}>
            <h1 style={{ fontSize: 17, margin: '4px 0' }}>Andar 10 — a prisão</h1>
            <div style={{ color: '#888', marginBottom: 8 }}>
                Arraste a marca amarela (você) até um aparelho. O Nilo anda por
                conta própria. Cada tranca só cede com os DOIS acionados ao mesmo
                tempo, em pontas opostas — ele não sabe disso.
            </div>

            <div
                ref={wrap}
                onPointerDown={() => { arrastando.current = true; }}
                style={{
                    height: 420, borderRadius: 8, overflow: 'hidden',
                    border: '1px solid #2a2a33', touchAction: 'none', cursor: 'grab',
                }}
            >
                <Canvas shadows dpr={[1, 1.5]}>
                    <Camera />
                    <Floor10Base />
                    <Floor10Npc playerPositionRef={playerPositionRef} />
                    <MarcaDoJogador posRef={playerPositionRef} />
                </Canvas>
            </div>

            <div style={{ ...caixa, marginTop: 10 }}>
                <b>As trancas</b>
                {f10prison.locks.map((l) => (
                    <div key={l.id} style={{ marginTop: 6 }}>
                        <span style={{ color: l.solved ? '#9fd3a0' : '#d8d8e0' }}>
                            {l.id}{l.solved ? ' ✓ aberta' : ''}
                        </span>
                        <div style={{
                            height: 8, background: '#22222a', borderRadius: 4,
                            overflow: 'hidden', marginTop: 3,
                        }}
                        >
                            <div style={{
                                height: '100%',
                                width: `${Math.round((l.progress / l.holdSeconds) * 100)}%`,
                                background: l.solved ? '#9fd3a0' : '#7fc7ff',
                            }}
                            />
                        </div>
                        <span style={{ color: '#777' }}>
                            {l.devices.join(' + ')} · precisa de {l.holdSeconds}s juntos
                            {l.nearMisses > 0 ? ` · ${l.nearMisses} quase` : ''}
                        </span>
                    </div>
                ))}
                <div style={{ marginTop: 8, color: f10prison.doorOpen ? '#9fd3a0' : '#777' }}>
                    porta: {f10prison.doorOpen ? 'ABERTA' : 'trancada'}
                </div>
            </div>

            <div style={caixa}>
                <b>O que ele está fazendo</b>
                <div style={{ marginTop: 4 }}>
                    meta: <b style={{ color: '#ffd479' }}>{npc.autonomy.goal}</b>
                    {' · '}tentativas nos aparelhos: <b>{f10prison.npcAttempts}</b>
                    {' · '}silêncio: {Math.round(f10prison.secondsSinceProgress)}s
                </div>
                <div style={{ color: '#777' }}>
                    aprendizado: {npc.autonomy.learning.experiences} experiências ·{' '}
                    {npc.autonomy.learning.parameterCount} parâmetros ·{' '}
                    última recompensa {npc.autonomy.learning.lastReward.toFixed(2)}
                </div>
                <div style={{ marginTop: 6, color: '#8a8a96' }}>
                    em cima agora:{' '}
                    {Object.values(f10prison.devices)
                        .filter((d) => d.heldByNpc || d.heldByPlayer)
                        .map((d) => `${d.id}${d.heldByNpc ? ' (Nilo)' : ''}${d.heldByPlayer ? ' (você)' : ''}`)
                        .join(', ') || '—'}
                </div>
            </div>

            <button
                type="button"
                onClick={() => { prisonReset(); forcar((n) => n + 1); }}
                style={{
                    background: '#3a3a46', color: '#fff', border: 0, borderRadius: 6,
                    padding: '9px 14px', fontSize: 14, cursor: 'pointer',
                }}
            >
                trancar tudo de novo
            </button>

            <div style={{ color: '#666', marginTop: 10 }}>
                aparelhos: {PRISON_DEVICES.map((d) => `${d.id} (${d.x}, ${d.z})`).join(' · ')}
            </div>
        </div>
    );
};

export default Prisao;
