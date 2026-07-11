import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface Floor7WaterV2Props {
    sunDir: THREE.Vector3;
    warnRef?: React.MutableRefObject<number>;
    calmRef?: React.MutableRefObject<number>;
    shipScale?: number;
}

const vertexShader = /* glsl */`
uniform float uTime; uniform float uCalm; uniform float uWarn;
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
void main(){
  vec3 p=position; vec2 q=p.xy;
  float a=.34*uCalm, b=.18*uCalm;
  float w1=sin(dot(q,normalize(vec2(.24,1.0)))*.48-uTime*1.35);
  float w2=sin(dot(q,normalize(vec2(1.0,.55)))*.82-uTime*1.85);
  float h=w1*a+w2*b;
  p.z+=h;
  vec2 slope=vec2(cos(dot(q,normalize(vec2(.24,1.0)))*.48-uTime*1.35)*.48*a,
                  cos(dot(q,normalize(vec2(1.0,.55)))*.82-uTime*1.85)*.82*b);
  vec3 n=normalize(vec3(-slope.x,-slope.y,1.0));
  vec4 wp=modelMatrix*vec4(p,1.0); vWorld=wp.xyz; vNormal=normalize(mat3(modelMatrix)*n);
  vCrest=smoothstep(.30,.52,h)+uWarn*.18; gl_Position=projectionMatrix*viewMatrix*wp;
}`;

const fragmentShader = /* glsl */`
precision highp float;
uniform float uTime; uniform vec3 uSunDir; uniform float uShipScale;
varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
void main(){
  vec3 V=normalize(cameraPosition-vWorld), N=normalize(vNormal);
  vec2 q=vWorld.xz;
  float chop=(sin(q.x*2.1+q.y*1.3+uTime*1.7)+sin(q.y*2.7-q.x*.8-uTime*1.3))*.018;
  N=normalize(N+vec3(chop,0.0,-chop));
  float fres=pow(1.0-max(dot(N,V),0.0),3.0);
  vec3 deep=vec3(.018,.14,.20), shallow=vec3(.055,.39,.49), sky=vec3(.52,.71,.79);
  vec3 col=mix(deep,shallow,clamp(N.y*.72+.18,0.0,1.0)); col=mix(col,sky,fres*.68);
  vec3 H=normalize(V+normalize(uSunDir)); col+=vec3(1.0,.82,.56)*pow(max(dot(N,H),0.0),72.0)*.85;
  vec2 hull=vec2(2.8,8.6)*uShipScale; float hr=length(q/hull);
  float contact=smoothstep(1.22,1.02,hr)*smoothstep(.88,1.0,hr);
  float wake=smoothstep(.5,0.0,abs(q.x)/(1.2*uShipScale))*smoothstep(-5.5*uShipScale,-13.0*uShipScale,q.y);
  float broken=.45+.55*sin(uTime*3.1+q.x*4.2+q.y*1.7);
  float foam=clamp(vCrest*.32+contact*broken*.75+wake*broken*.55,0.0,1.0);
  col=mix(col,vec3(.88,.96,.96),foam);
  float haze=smoothstep(65.0,125.0,length(cameraPosition-vWorld)); col=mix(col,sky,haze);
  gl_FragColor=vec4(col,1.0);
}`;

export const Floor7WaterV2: React.FC<Floor7WaterV2Props> = ({ sunDir, warnRef, calmRef, shipScale = 1 }) => {
    const material = useRef<THREE.ShaderMaterial>(null);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 }, uCalm: { value: 1 }, uWarn: { value: 0 },
        uSunDir: { value: sunDir.clone().normalize() }, uShipScale: { value: shipScale },
    }), [sunDir, shipScale]);
    useFrame((_, dt) => {
        const m = material.current; if (!m) return;
        m.uniforms.uTime.value += dt;
        m.uniforms.uCalm.value += ((calmRef?.current ?? 1) - m.uniforms.uCalm.value) * Math.min(1, dt * 2.5);
        m.uniforms.uWarn.value += ((warnRef?.current ?? 0) - m.uniforms.uWarn.value) * Math.min(1, dt * 5);
    });
    return <mesh name="floor7-v2-ocean" position={[0, -1.28, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[210, 210, 96, 96]} />
        <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent={false} depthWrite />
    </mesh>;
};

export default Floor7WaterV2;
