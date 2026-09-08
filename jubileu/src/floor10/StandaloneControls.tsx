import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
export type StandaloneInput = { x: number; y: number; lookX: number; lookY: number };
export function canStandInFloor10(x: number, z: number) {
  const r = .24;
  if (Math.abs(x) > 21.45 || Math.abs(z) > 21.45) return false;
  const inside = (a:number,b:number,c:number,d:number) => x > a-r && x < b+r && z > c-r && z < d+r;
  return !inside(-3.3,3.3,-16.3,-15.9) && !inside(-3.3,-2.9,-16.3,-9.9) && !inside(2.9,3.3,-16.3,-9.9)
    && !inside(-3.3,-1.35,-10.25,-9.9) && !inside(1.35,3.3,-10.25,-9.9);
}
export default function StandaloneControls({position, input, paused}: {
  position: MutableRefObject<Vector3>; input: MutableRefObject<StandaloneInput>; paused: boolean;
}) {
  const {camera, gl} = useThree();
  const angles = useRef({yaw:Math.PI,pitch:.02});
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const typing = (e:KeyboardEvent) => /INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName || '');
    const down = (e:KeyboardEvent) => {if(!typing(e)) keys.current.add(e.code);};
    const up = (e:KeyboardEvent) => keys.current.delete(e.code);
    const clear = () => keys.current.clear();
    const look = (e:MouseEvent) => {if(document.pointerLockElement === gl.domElement) { input.current.lookX += e.movementX; input.current.lookY += e.movementY; }};
    window.addEventListener('keydown',down); window.addEventListener('keyup',up); window.addEventListener('blur',clear); document.addEventListener('mousemove',look);
    return () => {window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);document.removeEventListener('mousemove',look);};
  },[gl,input]);
  useEffect(() => {if(paused) {keys.current.clear();input.current.x=0;input.current.y=0;document.exitPointerLock?.();}},[paused,input]);
  useFrame((_,delta) => {
    const v=input.current, a=angles.current;
    if(!paused) {
      a.yaw -= v.lookX*.003; a.pitch=Math.max(-1.1,Math.min(1.1,a.pitch+v.lookY*.003));
      let x=v.x+(keys.current.has('KeyD')?1:0)-(keys.current.has('KeyA')?1:0);
      let y=v.y+(keys.current.has('KeyW')?1:0)-(keys.current.has('KeyS')?1:0);
      const n=Math.hypot(x,y); if(n>1){x/=n;y/=n;}
      const step=Math.min(delta,.1)*2.8;
      const dx=(Math.cos(a.yaw)*x-Math.sin(a.yaw)*y)*step;
      const dz=(-Math.sin(a.yaw)*x-Math.cos(a.yaw)*y)*step;
      if(canStandInFloor10(position.current.x+dx,position.current.z)) position.current.x+=dx;
      if(canStandInFloor10(position.current.x,position.current.z+dz)) position.current.z+=dz;
    }
    v.lookX=0;v.lookY=0;
    camera.position.set(position.current.x,position.current.y+1.65,position.current.z);
    camera.rotation.order='YXZ'; camera.rotation.set(-a.pitch,a.yaw,0);
  });
  return null;
}
