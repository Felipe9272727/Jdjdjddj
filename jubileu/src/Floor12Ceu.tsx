import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA, f12 } from './f12Boss';
import { Floor12Skyline, Floor12Slipstream } from './Floor12Skyline';
import { F12_PALETTE as P } from './f12Presentation';

const vertexShader = `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  varying vec3 vDirection;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  void main() {
    vec3 d = normalize(vDirection);
    float height = smoothstep(-0.20, 0.68, d.y);
    vec3 color = mix(horizonColor, topColor, height);
    float sun = pow(max(dot(d, normalize(vec3(-0.52, 0.14, -1.0))), 0.0), 72.0);
    color += vec3(0.38, 0.22, 0.09) * sun;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function Floor12Ceu() {
  const { scene } = useThree();
  const sky = useMemo(() => ({
    topColor: { value: new THREE.Color(P.sky) },
    horizonColor: { value: new THREE.Color('#557b89') },
  }), []);
  const colors = useMemo(() => ({
    top: new THREE.Color(P.sky), storm: new THREE.Color('#241933'),
    horizon: new THREE.Color('#557b89'), stormHorizon: new THREE.Color('#795a75'),
    fog: new THREE.Fog('#355267', 68, 215),
  }), []);
  useEffect(() => {
    const oldFog = scene.fog, oldBackground = scene.background;
    scene.fog = colors.fog;
    scene.background = new THREE.Color(P.sky);
    return () => { scene.fog = oldFog; scene.background = oldBackground; };
  }, [scene, colors]);
  useFrame((_, dt) => {
    const a = 1 - Math.exp(-Math.min(dt, .1) * .8);
    const second = f12.passouDaVirada;
    sky.topColor.value.lerp(second ? colors.storm : colors.top, a);
    sky.horizonColor.value.lerp(second ? colors.stormHorizon : colors.horizon, a);
    colors.fog.color.copy(sky.horizonColor.value).multiplyScalar(.65);
  });
  return <group>
    <mesh position={[0, 0, -30]} renderOrder={-10}>
      <sphereGeometry args={[230, 24, 16]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader}
        uniforms={sky} side={THREE.BackSide} depthWrite={false} fog={false} />
    </mesh>
    <hemisphereLight args={['#b7e2ec', '#172b3a', 1.55]} />
    <directionalLight position={[-18, 28, 14]} color="#ffddaa" intensity={2.3} />
    <directionalLight position={[17, 10, -20]} color="#74cbe2" intensity={1.5} />
    <Floor12Skyline bossZ={ARENA.zCabeca} />
    <Floor12Slipstream />
  </group>;
}
export default Floor12Ceu;
