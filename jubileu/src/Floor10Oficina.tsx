import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Group, SRGBColorSpace } from 'three';
type V = [number, number, number];
const steel = '#264b50', copper = '#b87d4a';
function Box({ p, s, c = steel }: { p: V; s: V; c?: string }) {
  return <mesh position={p}><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={.8} metalness={.2}/></mesh>;
}
function Label({ title, sub, p, turn = false, width = 5 }: { title: string; sub: string; p: V; turn?: boolean; width?: number }) {
  const map = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    const x = c.getContext('2d')!; x.fillStyle = '#152e33'; x.fillRect(0,0,1024,256);
    x.fillStyle = '#f3d699'; x.fillRect(24,24,6,208); x.textAlign = 'center';
    x.font = '600 76px monospace'; x.fillText(title,530,115,930);
    x.fillStyle = '#b5c8bd'; x.font = '29px monospace'; x.fillText(sub,530,192,930);
    const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
  }, [title, sub]);
  useEffect(() => () => map.dispose(), [map]);
  return <mesh position={p} rotation={[0,turn ? Math.PI : 0,0]}><planeGeometry args={[width,width/4]}/><meshBasicMaterial map={map}/></mesh>;
}
export default function Floor10Oficina({ energia, calibrado }: { energia: boolean; calibrado: boolean }) {
  const rotor = useRef<Group>(null);
  const light = calibrado ? '#a2ffd0' : energia ? '#b6ecf0' : '#efc17b';
  useFrame((_,dt) => { if (rotor.current && energia) rotor.current.rotation.y += Math.min(dt,.1) * (calibrado ? .24 : .09); });
  return <group>
    <ambientLight intensity={.7} color="#dae6df"/>
    <hemisphereLight args={['#e1eee4','#425652',1.25]}/>
    <directionalLight position={[9,13,7]} intensity={2} color="#ffe4b7"/>
    <pointLight position={[0,5,-3]} intensity={55} distance={32} decay={1.5} color={light}/>
    <Box p={[0,-.095,0]} s={[44,.16,44]} c="#7e8c80"/>
    <mesh position={[0,.003,1]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[11.8,64]}/><meshStandardMaterial color="#516e69" roughness={.95}/></mesh>
    {[10.8,11.9].map(r => <mesh key={r} position={[0,.009,1]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[r-.05,r,64]}/><meshBasicMaterial color="#b7b18c"/></mesh>)}
    {[-18,-12,-6,0,6,12,18].map(n => <group key={n}><Box p={[n,.001,0]} s={[.018,.005,44]} c="#607269"/><Box p={[0,.001,n]} s={[44,.005,.018]} c="#607269"/></group>)}
    <Box p={[-21.8,4.5,0]} s={[.35,9,44]} c="#a8b0a3"/>
    <Box p={[21.8,4.5,0]} s={[.35,9,44]} c="#a8b0a3"/>
    <Box p={[0,4.5,21.8]} s={[44,9,.35]} c="#a8b0a3"/>
    <Box p={[0,4.5,-21.8]} s={[44,9,.35]} c="#a8b0a3"/>
    <Box p={[0,9.1,0]} s={[44,.3,44]} c="#2d494e"/>
    {[-1,1].map(side => <group key={side}>
      <Box p={[side*21.57,1.2,0]} s={[.06,2.4,43.5]}/>
      {[-16,-7,2,11,20].map(z => <group key={z}>
        <Box p={[side*21.25,4.5,z]} s={[1,9,.8]} c="#657c75"/>
        <Box p={[side*21.02,4.6,z-3.9]} s={[.1,4.8,5.9]} c="#193b41"/>
        {[3.3,4.1,4.9,5.7].map(y => <Box key={y} p={[side*20.94,y,z-3.9]} s={[.12,.1,5.65]} c="#628581"/>)}
        <mesh position={[side*20.82,7.5,z-3.9]}><boxGeometry args={[.13,.14,4.7]}/><meshBasicMaterial color="#e0ead0"/></mesh>
      </group>)}
      {[15.5,17].map(x => <mesh key={x} position={[side*x,7.2,0]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.17,.17,43,10]}/><meshStandardMaterial color={copper} metalness={.55} roughness={.5}/></mesh>)}
    </group>)}
    {[-16,-5,6,17].map(z => <group key={z}>
      <Box p={[0,8.5,z]} s={[43,.45,.55]} c="#6b8780"/>
      <mesh position={[0,8.22,z]}><boxGeometry args={[13,.05,.32]}/><meshBasicMaterial color="#eef0d6"/></mesh>
    </group>)}
    {/* Suspended return engine: all solid decoration is overhead or at the room boundary. */}
    <group position={[0,5.2,8]}>
      {[4.8,5.25].map(r => <mesh key={r} rotation={[Math.PI/2,0,0]}><torusGeometry args={[r,.16,8,64]}/><meshStandardMaterial color={copper} metalness={.65} roughness={.44}/></mesh>)}
      <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[4.35,.075,6,64]}/><meshBasicMaterial color={light}/></mesh>
      <group ref={rotor}>{Array.from({length:12},(_,i) => <group key={i} rotation={[0,i*Math.PI/6,0]}><mesh position={[3.4,0,0]} rotation={[.18,0,.14]}><boxGeometry args={[1.7,.16,.68]}/><meshStandardMaterial color="#72938a" metalness={.6} roughness={.5}/></mesh></group>)}</group>
      <mesh><cylinderGeometry args={[1.35,1.7,.65,24]}/><meshStandardMaterial color={steel} metalness={.45} roughness={.6}/></mesh>
      <mesh position={[0,-.34,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[1.3,.055,6,32]}/><meshBasicMaterial color={light}/></mesh>
      {[-1,1].flatMap(x => [-1,1].map(z => <Box key={`${x}${z}`} p={[x*3.4,1.8,z*3.4]} s={[.08,3.6,.08]}/>))}
    </group>
    {[-6,6].map((z,row) => <group key={z}>
      <Box p={[0,.015,z]} s={[16,.018,2.4]} c={row ? '#497980' : '#958255'}/>
      {[-1,1].map(side => <group key={side}>
        <mesh position={[side*7,.03,z]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.35,1.48,32]}/><meshBasicMaterial color={row ? '#b7e4e5' : '#f2d599'}/></mesh>
        {[-.72,0,.72].map(x => <Box key={x} p={[side*7+x,.031,z+1.7]} s={[.36,.014,.1]} c="#e4dcaa"/>)}
      </group>)}
      <mesh position={[0,.037,z]}><boxGeometry args={[11.5,.012,.05]}/><meshBasicMaterial color={(row ? calibrado : energia) ? '#a9ffd7' : '#bba575'}/></mesh>
    </group>)}
    {[-1,1].map(side => <group key={side}><Box p={[side*3.55,2.7,-10.2]} s={[.6,5.4,.5]}/><mesh position={[side*3.22,2.45,-9.9]}><boxGeometry args={[.06,4.2,.04]}/><meshBasicMaterial color={calibrado ? '#abffd0' : '#e6b876'}/></mesh></group>)}
    <Box p={[0,5.25,-10.2]} s={[7.7,.6,.55]}/>
    <Label title="RETORNO" sub="CENTRAL 10 / EMBARQUE EM DUPLA" p={[0,4.45,-9.89]} width={5.8}/>
    <Label title="03:17" sub="O TURNO QUE NAO TERMINOU" p={[0,5.5,21.56]} turn width={7}/>
    <Label title="01 / ENERGIA" sub="CONTATOS SIMULTANEOS" p={[-12,3.5,-21.55]} width={4.2}/>
    <Label title="02 / SINCRONIA" sub="NINGUEM VOLTA SOZINHO" p={[12,3.5,-21.55]} width={4.2}/>
    <group position={[14,0,20.8]}>
      <Box p={[0,.35,0]} s={[3.2,.28,1.3]}/><Box p={[0,.53,0]} s={[3,.1,1.2]} c="#8f8669"/>
      <Box p={[-1,.65,0]} s={[.6,.16,1]} c="#c2ba99"/><Box p={[2.5,1.2,0]} s={[1.2,2.4,.9]}/>
      <Label title="43" sub="AINDA AQUI. / N. AZEVEDO" p={[-1.5,2,.62]} turn width={2.4}/>
    </group>
  </group>;
}
