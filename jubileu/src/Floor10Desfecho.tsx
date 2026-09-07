import React from 'react';
import { Html } from '@react-three/drei';
import { retornoDaSala } from './npc/f10Cooperacao';
/** The ending keeps the companion visible after the room unmounts. */
export default function Floor10Desfecho({level}:{level:number}) {
    if(level!==0||!retornoDaSala.concluido)return null;
    return <group position={[-.8,0,-12.6]}>
        <mesh position={[-.11,.42,0]}><capsuleGeometry args={[.1,.62,4,8]}/><meshStandardMaterial color="#2a2d34"/></mesh>
        <mesh position={[.11,.42,0]}><capsuleGeometry args={[.1,.62,4,8]}/><meshStandardMaterial color="#2a2d34"/></mesh>
        <mesh position={[0,1.04,0]}><capsuleGeometry args={[.22,.42,6,12]}/><meshStandardMaterial color="#3b4a6b"/></mesh>
        {[-1,1].map(s=><mesh key={s} position={[s*.28,.93,0]}><capsuleGeometry args={[.07,.44,4,8]}/><meshStandardMaterial color="#3b4a6b"/></mesh>)}
        <mesh position={[0,1.52,0]}><sphereGeometry args={[.17,16,12]}/><meshStandardMaterial color="#c9986f"/></mesh>
        <mesh position={[0,1.58,-.02]}><sphereGeometry args={[.178,16,12,0,Math.PI*2,0,Math.PI*.62]}/><meshStandardMaterial color="#2b2119"/></mesh>
        {[-1,1].map(s=><mesh key={s} position={[s*.06,1.53,.15]}><sphereGeometry args={[.025,8,8]}/><meshStandardMaterial color="#141414"/></mesh>)}
        <Html position={[0,2.15,0]} center distanceFactor={9} style={{pointerEvents:'none'}}><div data-nilo-retorno style={{width:210,padding:10,borderRadius:8,background:'rgba(19,28,32,.92)',color:'#eee5cd',fontFamily:'sans-serif',fontSize:12,textAlign:'center'}}><strong>Nilo Azevedo</strong><div style={{marginTop:5}}>Eu saí mesmo… Obrigado por não me deixar.</div></div></Html>
    </group>;
}
