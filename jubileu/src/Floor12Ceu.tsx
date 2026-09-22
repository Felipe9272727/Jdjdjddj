import { Floor12Atmosphere } from './Floor12Atmosphere';
import { Floor12SkyDetails } from './Floor12SkyDetails';
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
  uniform float time;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
      mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
  }
  void main() {
    vec3 d = normalize(vDirection);
    float height = smoothstep(-0.20, 0.68, d.y);
    vec3 color = mix(horizonColor, topColor, height);
    float sun = pow(max(dot(d, normalize(vec3(-0.52, 0.14, -1.0))), 0.0), 72.0);
    color += vec3(0.38, 0.22, 0.09) * sun;
    vec2 uv = d.xz / max(.22, d.y + .35);
    float cloud = noise(uv * 3. + vec2(time * .009, 0.)) * .65;
    cloud += noise(uv * 7. - vec2(time * .014, 0.)) * .35;
    float ceiling = smoothstep(.06, .23, d.y) * (1. - smoothstep(.62, .9, d.y));
    color = mix(color, horizonColor * 1.22, smoothstep(.45, .76, cloud) * ceiling * .55);
    color += vec3(.12, .08, .035) * pow(sun, .3);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function Floor12Ceu() {
  const { scene } = useThree();
  const sky = useMemo(() => ({
    time: { value: 0 },
    topColor: { value: new THREE.Color(P.sky) },
    horizonColor: { value: new THREE.Color('#746879') },
  }), []);
  const colors = useMemo(() => ({
    top: new THREE.Color(P.sky), storm: new THREE.Color('#171626'),
    horizon: new THREE.Color('#746879'), stormHorizon: new THREE.Color('#5b465c'),
    fog: new THREE.Fog('#494052', 68, 215),
  }), []);
  useEffect(() => {
    const oldFog = scene.fog, oldBackground = scene.background;
    scene.fog = colors.fog;
    scene.background = new THREE.Color(P.sky);
    return () => { scene.fog = oldFog; scene.background = oldBackground; };
  }, [scene, colors]);
  useFrame((state, dt) => {
    sky.time.value = state.clock.elapsedTime;
    const a = 1 - Math.exp(-Math.min(dt, .1) * .8);
    const second = f12.passouDaVirada && !['vitoria', 'despedida'].includes(f12.fase);
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
    <hemisphereLight args={['#c6b9c9', '#172b3a', 1.35]} />
    <directionalLight position={[-18, 28, 14]} color="#ffddaa" intensity={1.85} />
    <directionalLight position={[17, 10, -20]} color="#74cbe2" intensity={1.3} />
    <Floor12Skyline bossZ={ARENA.zCabeca} />
    <Floor12SkyDetails />
    <Floor12Atmosphere />
    <Floor12Slipstream />
  </group>;
}
export default Floor12Ceu;
