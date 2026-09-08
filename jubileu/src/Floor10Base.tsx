import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Vector3 } from 'three';
import Floor10Prison from './Floor10Prison';
import Floor10Oficina from './Floor10Oficina';
import Floor10Mission from './Floor10Mission';
import { f10prison } from './npc/f10Prison';
import { npc, npcAutonomousSay, useNpcOpen } from './npc/npcStore';
import { retornoDaSala, aparelhoComplementar, cancelarCooperacao, conviteDoNilo, pedirCooperacao, podemSairJuntos } from './npc/f10Cooperacao';

type Props = { playerPositionRef: React.MutableRefObject<Vector3>; onExit: () => void };
/** The workshop fits the single room Nilo remembers. Its return circuit needs two people. */
export default function Floor10Base({playerPositionRef,onExit}:Props) {
    const saiu=useRef(false),tempo=useRef(0);
    const npcChatOpen=useNpcOpen();
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
        <Floor10Oficina energia={view.energia} calibrado={view.calibrado}/>
        <Floor10Prison/>
        <Html fullscreen calculatePosition={(_, __, size) => [size.width / 2, size.height / 2]} style={{pointerEvents:'none'}}>
            <Floor10Mission
                phase={titulo}
                hint={instrucao}
                progress={view.progresso / 100}
                energia={view.energia}
                calibrado={view.calibrado}
                helping={view.ajudando}
                canHelp={!!view.par || view.saida}
                ready={view.saida}
                chatOpen={npcChatOpen}
                onHelp={() => { document.exitPointerLock?.(); convidar(view.saida); }}
                onCancel={() => { cancelarCooperacao(); npcAutonomousSay('Tudo bem'); }}
            />
        </Html>
    </group>;
}
