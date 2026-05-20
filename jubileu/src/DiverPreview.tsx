/**
 * DiverPreview.tsx — DEV-ONLY isolated harness for the BeardedDiver.
 *
 * Mounts just the diver inside a Canvas framed exactly like the cutscene
 * camera (dist 6.6, fov 46, lookAt y=0.9) so the procedural animation can
 * be inspected live / screenshotted per state. Not part of the game build
 * (no entry in vite rollup input).
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { BeardedDiver, DIVER_POS, type DiverState } from './BeardedDiver';

const STATES: DiverState[] = ['hidden', 'spawn', 'idle', 'handover', 'fading'];

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 1.55, DIVER_POS[2] + 5.8);
    camera.lookAt(0, 1.3, DIVER_POS[2]);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

export function DiverPreview() {
  const playerRef = useRef(new Vector3(0, 1.6, DIVER_POS[2] + 5));
  const [state, setState] = useState<DiverState>('idle');

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('state') as DiverState | null;
    if (p && STATES.includes(p)) setState(p);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background:
      'radial-gradient(ellipse at 50% 38%, #15323f 0%, #0a2230 38%, #051320 72%, #020a14 100%)' }}>
      <Canvas
        shadows
        gl={{ antialias: true }}
        camera={{ fov: 46, near: 0.1, far: 100 }}
        dpr={2}
      >
        <CameraRig />
        <ambientLight intensity={0.25} />
        <Suspense fallback={null}>
          <BeardedDiver state={state} playerPositionRef={playerRef} />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, DIVER_POS[2]]} receiveShadow>
          <planeGeometry args={[24, 24]} />
          <meshStandardMaterial color="#0a2a36" roughness={0.95} />
        </mesh>
      </Canvas>

      <div style={{ position: 'fixed', top: 10, left: 10, display: 'flex', gap: 6 }}>
        {STATES.map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            style={{
              padding: '6px 10px', fontFamily: 'monospace', fontSize: 12,
              background: s === state ? '#22d3ee' : '#0b3a47',
              color: s === state ? '#001' : '#9fe',
              border: '1px solid #22d3ee55', borderRadius: 6, cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
