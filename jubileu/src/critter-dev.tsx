/**
 * critter-dev.tsx — BANCADA de rig dos bichos do Viveiro.
 * Mostra o GLB num turntable com eixos (X vermelho, Z azul, Y=cima) e uma
 * caixa 1×1×1 de referência de escala. Dirige por window.__critter.
 *   http://localhost:PORT/critter.html
 */
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Grid } from '@react-three/drei';
import * as THREE from 'three';
import saltitoUrl from './assets/models/critters/saltito.glb';
import cervoUrl from './assets/models/critters/cervo.glb';
import vultoUrl from './assets/models/critters/vulto.glb';

const URLS: Record<string, string> = { saltito: saltitoUrl, cervo: cervoUrl, vulto: vultoUrl };
useGLTF.preload(saltitoUrl);

const ctrl = { name: 'saltito', rotY: 0, spin: true, scale: 1 };
(window as any).__critter = ctrl;

const Model: React.FC<{ name: string }> = ({ name }) => {
  const { scene } = useGLTF(URLS[name]);
  const grp = useRef<THREE.Group>(null!);
  const model = useMemo(() => {
    const s = scene.clone(true);
    // mede bbox
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3(); box.getSize(size);
    const ctr = new THREE.Vector3(); box.getCenter(ctr);
    // normaliza: assenta base em y=0 e centraliza xz
    s.position.set(-ctr.x, -box.min.y, -ctr.z);
    (window as any).__bbox = { size: [size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2)], min: [box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2)] };
    return s;
  }, [scene]);
  useFrame((_s, dt) => {
    if (grp.current) {
      if (ctrl.spin) ctrl.rotY += dt * 0.7;
      grp.current.rotation.y = ctrl.rotY;
      grp.current.scale.setScalar(ctrl.scale);
    }
  });
  return <group ref={grp}><primitive object={model} /></group>;
};

const App: React.FC = () => {
  const [name, setName] = useState('saltito');
  useEffect(() => {
    (window as any).__setCritter = (n: string) => { ctrl.name = n; setName(n); };
    (window as any).__setRot = (deg: number) => { ctrl.spin = false; ctrl.rotY = deg * Math.PI / 180; };
    (window as any).__setSpin = (b: boolean) => { ctrl.spin = b; };
  }, []);
  return (
    <Canvas camera={{ fov: 40, near: 0.1, far: 100, position: [3, 2.4, 4] }} onCreated={({ camera }) => camera.lookAt(0, 0.6, 0)}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 5]} intensity={2.5} />
      <directionalLight position={[-5, 4, -4]} intensity={0.8} color="#8fd0ff" />
      {/* eixos: X vermelho, Z azul (frente do glTF costuma ser +Z ou -Z) */}
      <mesh position={[1, 0.01, 0]}><boxGeometry args={[2, 0.02, 0.02]} /><meshBasicMaterial color="red" /></mesh>
      <mesh position={[0, 0.01, 1]}><boxGeometry args={[0.02, 0.02, 2]} /><meshBasicMaterial color="blue" /></mesh>
      {/* caixa 1×1×1 de referência de escala (canto) */}
      <mesh position={[-1.5, 0.5, -1.5]}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial color="#ffffff" wireframe /></mesh>
      <Grid args={[10, 10]} cellSize={0.5} cellColor="#3a5a44" sectionColor="#5a8a64" position={[0, 0, 0]} infiniteGrid fadeDistance={20} />
      <React.Suspense fallback={null}><Model name={name} /></React.Suspense>
    </Canvas>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
setTimeout(() => { (window as Window & { __ready?: boolean }).__ready = true; }, 300);
