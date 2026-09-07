import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Vector3 } from 'three';
import Floor10Prison from './Floor10Prison';
import Floor10Oficina from './Floor10Oficina';
import { f10prison } from './npc/f10Prison';
import { npc, npcAutonomousSay } from './npc/npcStore';
import { retornoDaSala, aparelhoComplementar, cancelarCooperacao, conviteDoNilo, pedirCooperacao, podemSairJuntos } from './npc/f10Cooperacao';

type Props = { playerPositionRef: React.MutableRefObject<Vector3>; onExit: () => void };
const buttonStyle:React.CSSProperties={minHeight:44,padding:'10px 16px',border:'1px solid #ab8a4c',borderRadius:6,background:'#2e3028',color:'#f1e5c8',fontWeight:700,cursor:'pointer',pointerEvents:'auto'};
/** The workshop fits the single room Nilo remembers. Its return circuit needs two people. */
export default function Floor10Base({playerPositionRef,onExit}:Props) {
    const saiu=useRef(false),tempo=useRef(0);
    const [view,setView]=useState({energia:false,calibrado:false,progresso:0,par:null as string|null,ajudando:false,saida:false});
    useEffect(()=>{retornoDaSala.concluido=false;return ()=>cancelarCooperacao();},[]);
    useFrame((_,dt)=>{
        if(!saiu.current&&podemSairJuntos(f10prison,playerPositionRef.current,npc.perception?.position??null)){
            saiu.current=true;retornoDaSala.concluido=true;cancelarCooperacao();onExit();
        }
        tempo.current+=dt;if(tempo.current<.12)return;tempo.current=0;
        const energia=!!f10prison.locks.find(l=>l.id==='placas')?.solved;
        const calibrado=!!f10prison.locks.find(l=>l.id==='alavancas')?.solved;
        const par=aparelhoComplementar(f10prison,playerPositionRef.current);
        const ativo=f10prison.locks.find(l=>!l.solved&&(par?l.devices.includes(par):true));
        const next={energia,calibrado,progresso:ativo?Math.round(100*ativo.progress/ativo.holdSeconds):100,par,ajudando:conviteDoNilo.tipo!==null,saida:f10prison.doorOpen};
        setView(old=>Object.keys(next).every(k=>old[k as keyof typeof old]===next[k as keyof typeof next])?old:next);
    });
    const convidar=(saida:boolean)=>{
        if(npc.open||npc.speaking||conviteDoNilo.tipo)return;
        pedirCooperacao(saida?'saida':'aparelho');
        npcAutonomousSay(saida?'Vamos juntos. Vou entrar na cabine.':'Pode deixar. Segura esse contato que eu vou para o outro.');
    };
    const titulo=view.saida?'03 / VOLTAR JUNTOS':!view.energia?'01 / RESTABELECER ENERGIA':'02 / CALIBRAR O RETORNO';
    const instrucao=view.saida?'Chame Nilo e entre na cabine com ele.':view.par?'Permaneça no contato e peça ajuda ao Nilo.':!view.energia?'Pise em uma das placas âmbar. Os dois lados precisam de alguém.':'Vá até uma das alavancas azuis. Sincronizem os dois contatos.';
    return <group>
        <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[44,44]}/><meshStandardMaterial color="#343b3f" roughness={1}/></mesh>
        <gridHelper args={[44,44,'#647176','#424b50']} position={[0,.002,0]}/>
        {([-1,1] as const).map(side=><React.Fragment key={side}>
            <mesh position={[side*22,1.6,0]}><boxGeometry args={[.12,3.2,44]}/><meshStandardMaterial color="#424a4d" roughness={.95}/></mesh>
            <mesh position={[0,1.6,side*22]}><boxGeometry args={[44,3.2,.12]}/><meshStandardMaterial color="#424a4d" roughness={.95}/></mesh>
        </React.Fragment>)}
        <Floor10Oficina energia={view.energia} calibrado={view.calibrado}/>
        <Floor10Prison/>
        <Html fullscreen calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]} style={{pointerEvents:'none'}}>
            <div data-floor10-workshop style={{position:'absolute',top:58,left:'50%',transform:'translateX(-50%)',width:'min(520px,calc(100vw - 180px))',boxSizing:'border-box',padding:'12px 16px',border:'1px solid #566369',borderRadius:8,background:'rgba(16,24,28,.94)',color:'#e8e7dc',fontFamily:'monospace',textAlign:'center',pointerEvents:'none'}}>
                <div style={{fontSize:10,letterSpacing:2,color:'#c4ab77'}}>SALA 03:17 · NILO AZEVEDO</div>
                <div style={{marginTop:5,fontSize:14,fontWeight:700}}>{titulo}</div>
                <div style={{fontSize:12,lineHeight:1.45,margin:'7px 0'}}>{instrucao}</div>
                {!view.saida&&<div role="progressbar" aria-label="Sincronização" aria-valuenow={view.progresso} aria-valuemin={0} aria-valuemax={100} style={{height:4,background:'#394448',marginBottom:9}}><div style={{height:'100%',width:`${Math.min(100,view.progresso)}%`,background:'#c8b16c',transition:'width .1s linear'}}/></div>}
                {(view.par||view.saida)&&<button data-floor10-help disabled={view.ajudando} style={{...buttonStyle,opacity:view.ajudando ? 0.65 : 1}} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();document.exitPointerLock?.();convidar(view.saida);}}>{view.ajudando?'Nilo está ajudando…':view.saida?'Nilo, vamos embora':'Nilo, assume o outro contato'}</button>}
                {view.ajudando&&<button style={{...buttonStyle,marginLeft:6,background:'#202a2e',borderColor:'#52636b'}} onClick={e=>{e.stopPropagation();cancelarCooperacao();npcAutonomousSay('Beleza. Me chama quando quiser tentar de novo.');}}>Pode parar</button>}
                <div style={{display:'flex',justifyContent:'center',gap:14,marginTop:8,fontSize:10,color:'#a0b5b4'}}><span>{view.energia?'●':'○'} ENERGIA</span><span>{view.calibrado?'●':'○'} CALIBRAÇÃO</span><span>{view.saida?'●':'○'} RETORNO</span></div>
            </div>
        </Html>
    </group>;
}
