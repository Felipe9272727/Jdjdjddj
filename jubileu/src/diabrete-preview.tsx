import { Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import DiabreteSculptedHead from './DiabreteSculptedHead';
import { buildDiabreteRig } from './diabreteRig';
import { diabreteModel } from './assets/textureImports';

function FullRig({ speaking }: { speaking: boolean }) {
  const { scene } = useGLTF(diabreteModel);
  const rig = useMemo(() => buildDiabreteRig(scene), [scene]);
  useEffect(() => {
    if (rig) document.documentElement.dataset.diabreteRig = 'ready';
    return () => { delete document.documentElement.dataset.diabreteRig; rig?.dispose(); };
  }, [rig]);
  useFrame(({ clock }) => {
    if (!rig) return;
    const t = clock.elapsedTime;
    rig.bones[2].rotation.y = speaking ? Math.sin(t * 1.3) * 0.3 : 0;
    rig.definirCara('neutro', 'ironia', t);
    rig.definirBoca(speaking ? (Math.sin(t * 11) > 0 ? 'falando2' : 'falando1') : 'sorrisoIronico');
  });
  return rig ? <group position={[0, -1.1, 0]}><primitive object={rig.group} scale={2.2} /></group> : null;
}

function View({ angle, speaking }: { angle: number; speaking: boolean }) {
  const { camera } = useThree();
  const mood = new URLSearchParams(location.search).get('mood');
  const expression = mood === 'angry' ? { look: 'bravo', brow: 'raiva', mouth: 'bravo' } : mood === 'surprised' ? { look: 'arregalado', brow: 'surpresa', mouth: 'surpreso' } : {}; 
  camera.position.set(Math.sin(angle) * 5.3, 0.27, Math.cos(angle) * 5.3);
  camera.lookAt(0, 0.17, 0);
  return <>
    <color attach="background" args={['#ddd3c0']} />
    <hemisphereLight args={['#fff8ea', '#564332', 2.1]} />
    <directionalLight position={[-3, 5, 5]} intensity={3.4} />
    <directionalLight position={[4, 2, -3]} intensity={3} color="#fff6df" />
    <Suspense fallback={null}>{new URLSearchParams(location.search).has('rig')
      ? <FullRig speaking={speaking} />
      : <DiabreteSculptedHead speaking={speaking} blink={speaking ? undefined : 0} {...expression} />}</Suspense>
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
