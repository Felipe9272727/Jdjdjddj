import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { f10prison } from './npc/f10Prison';
const ids = ['placa-oeste','placa-leste','alavanca-norte','alavanca-sul'];
function Device({id}:{id:string}) {
  const clock = useRef(0);
  const [v,setV] = useState({x:0,z:0,held:false,solved:false,progress:0,lever:false});
  useFrame((_,dt) => {
    clock.current += dt; if(clock.current < .12) return; clock.current = 0;
    const d = f10prison.devices[id]; if(!d) return;
    const lock = f10prison.locks.find(l => l.devices.includes(id));
    setV({x:d.x,z:d.z,held:d.heldByNpc || d.heldByPlayer,solved:!!lock?.solved,progress:lock ? Math.min(1,lock.progress/lock.holdSeconds) : 0,lever:d.kind==='lever'});
  });
  const c = v.solved ? '#a5ffd0' : v.held ? '#fff0b5' : v.lever ? '#8fd4db' : '#f0c67e';
  return <group position={[v.x,0,v.z]}>
    <mesh position={[0,.035,0]}><cylinderGeometry args={[.82,.87,.06,32]}/><meshStandardMaterial color="#294c50" roughness={.86} metalness={.3}/></mesh>
    <mesh position={[0,.071,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.72,.78,32]}/><meshBasicMaterial color={c}/></mesh>
    <mesh position={[0,.074,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.84,.94,40,1,0,Math.max(.001,v.progress)*Math.PI*2]}/><meshBasicMaterial color="#bcf9c5"/></mesh>
    {[-.36,-.12,.12,.36].map(x => <mesh key={x} position={[x,.074,0]}><boxGeometry args={[.075,.008,.93]}/><meshStandardMaterial color={v.held || v.solved ? c : '#71847a'} roughness={.75}/></mesh>)}
    <group position={[0,0,-1.24]}>
      <mesh position={[0,.07,0]}><cylinderGeometry args={[.32,.37,.14,8]}/><meshStandardMaterial color="#344e4c" roughness={.86}/></mesh>
      <mesh position={[0,.43,0]}><boxGeometry args={[.29,.78,.27]}/><meshStandardMaterial color="#416c6d" metalness={.2} roughness={.75}/></mesh>
      <group position={[0,.88,.03]} rotation={[-.35,0,0]}>
        <mesh><boxGeometry args={[.62,.3,.14]}/><meshStandardMaterial color="#24444a" roughness={.8}/></mesh>
        <mesh position={[-.12,.035,.078]}><circleGeometry args={[.095,20]}/><meshBasicMaterial color="#d3cda6"/></mesh>
        <mesh position={[-.12,.035,.083]} rotation={[0,0,(v.progress-.5)*2]}><boxGeometry args={[.012,.12,.008]}/><meshBasicMaterial color="#343b35"/></mesh>
        <mesh position={[.17,.06,.083]}><circleGeometry args={[.03,12]}/><meshBasicMaterial color={c}/></mesh>
        {v.lever ? <group position={[.14,-.055,.1]} rotation={[v.held || v.solved ? -.6 : .35,0,0]}>
          <mesh position={[0,.1,0]}><cylinderGeometry args={[.018,.018,.2,8]}/><meshStandardMaterial color="#bbb997" metalness={.7} roughness={.35}/></mesh>
          <mesh position={[0,.21,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.035,.035,.17,8]}/><meshStandardMaterial color="#9d5d3d" roughness={.8}/></mesh>
        </group> : <mesh position={[.13,-.055,.091]}><boxGeometry args={[.15,.047,.024]}/><meshBasicMaterial color={c}/></mesh>}
      </group>
      <mesh position={[0,.41,.14]}><boxGeometry args={[.18,.055,.01]}/><meshBasicMaterial color={v.lever ? '#a6dbe0' : '#ddc588'}/></mesh>
    </group>
  </group>;
}
export default function Floor10Prison(){return <group>{ids.map(id => <Device key={id} id={id}/>)}</group>;}
