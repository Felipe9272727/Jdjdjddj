import React from 'react';
import { Html } from '@react-three/drei';
import { retornoDaSala } from './npc/f10Cooperacao';
import { NiloVisual } from './NiloVisual';
/** The ending keeps the companion visible after the room unmounts. */
export default function Floor10Desfecho({level}:{level:number}) {
    if(level!==0||!retornoDaSala.concluido)return null;
    return <group position={[-.8,0,-12.6]}>
        <NiloVisual />
        <Html position={[0,2.15,0]} center distanceFactor={9} style={{pointerEvents:'none'}}><div data-nilo-retorno style={{width:210,padding:10,borderRadius:8,background:'rgba(19,28,32,.92)',color:'#eee5cd',fontFamily:'sans-serif',fontSize:12,textAlign:'center'}}><strong>Nilo Azevedo</strong><div style={{marginTop:5}}>Eu saí mesmo… Obrigado por não me deixar.</div></div></Html>
    </group>;
}
