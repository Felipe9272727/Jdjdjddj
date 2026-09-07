import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

type Props = { energia: boolean; calibrado: boolean };
function Placa({ texto, sub, position, width = 5, rotation = 0 }: {
    texto: string; sub: string; position: [number, number, number]; width?: number; rotation?: number;
}) {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
        const c = canvas.getContext('2d')!;
        c.fillStyle = '#151c20'; c.fillRect(0,0,1024,256);
        c.fillStyle = '#d3ae69'; c.fillRect(28,26,8,204);
        c.fillStyle = '#e9e7db'; c.font = 'bold 49px monospace'; c.fillText(texto,60,109);
        c.fillStyle = '#8ea9ab'; c.font = '25px monospace'; c.fillText(sub,60,171);
        const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
    }, [texto, sub]);
    useEffect(() => () => texture.dispose(), [texture]);
    return <mesh position={position} rotation={[0,rotation,0]}><planeGeometry args={[width,width/4]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>;
}
function Trilha({ x, z, w, d, ligada = false }: {x:number;z:number;w:number;d:number;ligada?:boolean}) {
    return <mesh position={[x,0.015,z]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[w,d]}/><meshBasicMaterial color={ligada?'#80d9b6':'#786239'} toneMapped={false}/></mesh>;
}
/** Open maintenance room: all large structures sit above walking height or flush to the walls. */
export default function Floor10Oficina({energia,calibrado}:Props) {
    return <group name="sala-0317">
        <fog attach="fog" args={['#12191d',24,62]}/>
        <ambientLight intensity={0.62} color="#b9c9d2"/>
        <hemisphereLight args={['#9bc4d7','#242018',0.9]}/>
        {/* Sala 03:17 fill: one non-shadowing overhead source keeps the floor and pedestals readable. */}
        <pointLight position={[0,5,0]} intensity={5} distance={40} decay={1.6} color="#bed3d8"/>
        <mesh position={[0,0.004,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[20,20]}/><meshStandardMaterial color="#283034" roughness={0.9}/></mesh>
        {[-1,1].map(side=><React.Fragment key={side}>
            <mesh position={[side*10.6,2.95,0]}><boxGeometry args={[0.12,0.18,21]}/><meshStandardMaterial color="#8b7960" metalness={0.6} roughness={0.55}/></mesh>
            <mesh position={[side*10.6,3.04,0]}><boxGeometry args={[0.04,0.04,20]}/><meshBasicMaterial color="#e6bc71"/></mesh>
            {[-6,6].map(z=><React.Fragment key={z}>
                <mesh position={[side*7,0.008,z]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.18,1.26,40]}/><meshBasicMaterial color={z<0?(energia?'#80d9b6':'#d1a451'):(calibrado?'#80d9b6':'#7ca8c3')}/></mesh>
                <mesh position={[side*7,2.95,z]}><boxGeometry args={[3.5,0.12,0.65]}/><meshStandardMaterial color="#232b2f"/></mesh>
                <mesh position={[side*7,2.88,z]} rotation={[Math.PI/2,0,0]}><planeGeometry args={[2.8,0.26]}/><meshBasicMaterial color={z<0?'#e3b86b':'#9ad6dc'} side={THREE.DoubleSide}/></mesh>
                <pointLight position={[side*7,2.6,z]} intensity={5} distance={7} decay={2} color={z<0?'#e4bb7b':'#9fc7df'}/>
                <Trilha x={side*3.5} z={z} w={7} d={0.055} ligada={z<0?energia:calibrado}/>
            </React.Fragment>)}
            <Trilha x={side*10.3} z={0} w={0.035} d={20}/>
        </React.Fragment>)}
        <Trilha x={0} z={0} w={0.07} d={12} ligada={energia}/>
        <Trilha x={0} z={-7.8} w={0.07} d={3.6} ligada={calibrado}/>
        {[-1,1].map(side=><mesh key={side} position={[0,2.95,side*10.5]}><boxGeometry args={[21.3,0.18,0.12]}/><meshStandardMaterial color="#8b7960" metalness={0.6}/></mesh>)}
        {/* Wall-mounted service cabinets: no invisible obstacle across the play area. */}
        {[-15,-5,5,15].map(z=><React.Fragment key={z}>
            <mesh position={[-21.86,1.6,z]}><boxGeometry args={[0.1,2.2,3.6]}/><meshStandardMaterial color="#243039" roughness={0.6} metalness={0.45}/></mesh>
            <mesh position={[21.86,1.6,z]}><boxGeometry args={[0.1,2.2,3.6]}/><meshStandardMaterial color="#243039" roughness={0.6} metalness={0.45}/></mesh>
        </React.Fragment>)}
        <Placa texto="SALA 03:17" sub="CENTRAL DE RETORNO / ACESSO TECNICO" position={[0,3.25,-9.72]} width={6}/>
        <Placa texto="01 / ENERGIA" sub="DOIS PONTOS. DUAS PESSOAS." position={[-7,2.35,-7.6]} width={3.8}/>
        <Placa texto="01 / ENERGIA" sub="MANTENHA A CONTINUIDADE" position={[7,2.35,-7.6]} width={3.8}/>
        <Placa texto="02 / CALIBRACAO" sub="SINCRONIZE OS DOIS CONTATOS" position={[-7,2.35,4.4]} width={3.8}/>
        <Placa texto="02 / CALIBRACAO" sub="UM SEGURA. O OUTRO CONFIRMA." position={[7,2.35,4.4]} width={3.8}/>
        <Placa texto="NINGUEM VOLTA SOZINHO" sub="EMBARQUE DOS DOIS OBRIGATORIO" position={[0,1.05,-9.68]} width={2.4}/>
        <Placa texto="43 MARCAS. NENHUMA SAIDA." sub="N. AZEVEDO / TURNO DA NOITE" position={[0,1.8,21.75]} width={7} rotation={Math.PI}/>
    </group>;
}
