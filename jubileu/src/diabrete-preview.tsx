import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import DiabreteSculptedHead from './DiabreteSculptedHead';

function View({ angle, speaking }: { angle: number; speaking: boolean }) {
  const { camera } = useThree();
  camera.position.set(Math.sin(angle) * 5.3, 0.27, Math.cos(angle) * 5.3);
  camera.lookAt(0, 0.17, 0);
  return <>
    <color attach="background" args={['#ddd3c0']} />
    <hemisphereLight args={['#fff8ea', '#564332', 2.1]} />
    <directionalLight position={[-3, 5, 5]} intensity={3.4} />
    <directionalLight position={[4, 2, -3]} intensity={3} color="#fff6df" />
    <DiabreteSculptedHead speaking={speaking} blink={speaking ? undefined : 0} />
  </>;
}

function Preview() {
  const [angle, setAngle] = useState(Number(new URLSearchParams(location.search).get('angle') || 0));
  const [speaking, setSpeaking] = useState(false);
  return <main style={{ height: '100dvh', fontFamily: 'system-ui', color: '#241f19' }}>
    <Canvas dpr={[1, 1.5]} camera={{ fov: 37, near: 0.05, far: 30 }}><View angle={angle} speaking={speaking} /></Canvas>
    <aside style={{ position: 'absolute', bottom: 18, left: 18, right: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <strong>DIABRETE · VOLUME 3D</strong>
      <label>Girar <input aria-label="Girar cabeça" type="range" min={-3.14} max={3.14} step={0.01} value={angle} onChange={e => setAngle(Number(e.target.value))} /></label>
      <label><input type="checkbox" checked={speaking} onChange={e => setSpeaking(e.target.checked)} /> Animar</label>
    </aside>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
