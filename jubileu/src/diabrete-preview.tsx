import { Suspense, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import DiabreteSculptedHead from './DiabreteSculptedHead';
import { buildDiabreteRig, B } from './diabreteRig';
import { diabreteModel } from './assets/textureImports';
import { createF3ActingLayer } from './f3Acting';
import { poseDoGesto } from './f3Pose';

type ActingScene = 'intro' | 'fall' | 'rival';

function actingQuery(): {
  scene: ActingScene | null;
  phase: string;
  time: number;
  phaseTime: number;
  line: number;
  speaking: boolean;
} {
  const q = new URLSearchParams(location.search);
  const raw = q.get('scene');
  const scene = raw === 'intro' || raw === 'fall' || raw === 'rival' ? raw : null;
  const n = (key: string, fallback: number) => {
    const v = Number(q.get(key));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    scene,
    phase: q.get('phase') || 'idle',
    time: n('time', 0),
    phaseTime: n('phaseTime', n('time', 0)),
    line: n('line', -1),
    speaking: q.get('speaking') === '1',
  };
}

function finiteBoneTransforms(bones: THREE.Bone[]): boolean {
  return bones.every((bone) => [
    bone.position.x, bone.position.y, bone.position.z,
    bone.rotation.x, bone.rotation.y, bone.rotation.z,
    bone.scale.x, bone.scale.y, bone.scale.z,
  ].every(Number.isFinite));
}

function applyIdleBase(bones: THREE.Bone[]) {
  const pose = poseDoGesto('idle', 0);
  bones[B.body].position.y = 0.46 + pose.bodyBob;
  bones[B.body].rotation.set(pose.lean, pose.bodyYaw, pose.bodyRoll);
  bones[B.head].rotation.set(pose.headX, 0, pose.headZ);
  bones[B.l_arm].rotation.set(pose.armLx, 0, pose.armLz);
  bones[B.r_arm].rotation.set(pose.armRx, 0, -pose.armRz);
  bones[B.l_leg].rotation.set(0, 0, 0);
  bones[B.r_leg].rotation.set(0, 0, 0);
}

function FullRig({ speaking }: { speaking: boolean }) {
  const { scene } = useGLTF(diabreteModel);
  const rig = useMemo(() => buildDiabreteRig(scene), [scene]);
  const acting = useMemo(() => createF3ActingLayer(), []);
  const query = useMemo(actingQuery, []);
  const basePose = useMemo(() => rig?.bones.map((bone) => ({
    position: bone.position.clone(), rotation: bone.rotation.clone(), scale: bone.scale.clone(),
  })) ?? null, [rig]);
  const firstApplied = useMemo(() => new Float64Array(rig ? rig.bones.length * 9 : 0), [rig]);
  const actingFrames = useMemo(() => ({ count: 0, maxDrift: 0 }), []);
  useEffect(() => {
    if (rig) document.documentElement.dataset.diabreteRig = 'ready';
    return () => { delete document.documentElement.dataset.diabreteRig; rig?.dispose(); acting.dispose(); };
  }, [rig, acting]);
  useFrame(({ clock }) => {
    if (!rig) return;
    const t = query.scene ? query.time : clock.elapsedTime;
    const phaseTime = query.scene ? query.phaseTime : t;
    acting.begin();
    if (query.scene && basePose) {
      // Reset the base first: the same fixed sample is reapplied every frame,
      // making any accidental additive drift observable in the dataset below.
      rig.bones.forEach((bone, i) => {
        bone.position.copy(basePose[i].position);
        bone.rotation.copy(basePose[i].rotation);
        bone.scale.copy(basePose[i].scale);
      });
      // The authored idle pose puts both arms down, so acting reads as a cue
      // layered over a character rather than offsets on a T-pose.
      applyIdleBase(rig.bones);
      const cue = acting.apply(rig.bones, {
        scene: query.scene, phase: query.phase, time: t, phaseTime,
        line: query.line, speaking: query.speaking,
      });
      if (cue.eye || cue.brow) rig.definirCara(cue.eye ?? 'neutro', cue.brow ?? 'ironia', t);
      const values = rig.bones.flatMap((bone) => [
        bone.position.x, bone.position.y, bone.position.z,
        bone.rotation.x, bone.rotation.y, bone.rotation.z,
        bone.scale.x, bone.scale.y, bone.scale.z,
      ]);
      if (actingFrames.count === 0) values.forEach((v, i) => { firstApplied[i] = v; });
      else values.forEach((v, i) => { actingFrames.maxDrift = Math.max(actingFrames.maxDrift, Math.abs(v - firstApplied[i])); });
      actingFrames.count += 1;
      document.documentElement.dataset.f3Acting = 'ready';
      document.documentElement.dataset.f3ActingFinite = String(finiteBoneTransforms(rig.bones));
      document.documentElement.dataset.f3ActingDrift = String(actingFrames.maxDrift);
      document.documentElement.dataset.f3ActingCue = `${query.scene}:${query.phase}:${t}`;
    } else {
      rig.bones[2].rotation.y = speaking ? Math.sin(t * 1.3) * 0.3 : 0;
      rig.definirCara('neutro', 'ironia', t);
    }
    rig.definirBoca((query.scene ? query.speaking : speaking)
      ? (Math.sin(t * 11) > 0 ? 'falando2' : 'falando1') : 'sorrisoIronico');
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
