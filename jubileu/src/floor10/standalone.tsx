import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Vector3 } from 'three';
import Floor10Module, { Floor10Interface } from './Floor10Module';
import StandaloneControls, { type StandaloneInput } from './StandaloneControls';
import { npcSet, useNpcOpen } from '../npc/npcStore';
import './standalone.css';
function Cabin() {
  return <group>
    {([
      [[-3.1,1.65,-13.1],[.4,3.3,6.4]],[[3.1,1.65,-13.1],[.4,3.3,6.4]],
      [[0,1.65,-16.1],[6.4,3.3,.4]],[[-2.2,1.65,-10.075],[1.75,3.3,.35]],
      [[2.2,1.65,-10.075],[1.75,3.3,.35]],[[0,3.35,-13.1],[6.4,.2,6.4]],
    ] as [[number,number,number],[number,number,number]][]).map(([p,s],i) => <mesh key={i} position={p}><boxGeometry args={s}/><meshStandardMaterial color={i===2?'#77918a':'#284d53'} roughness={.7} metalness={.25}/></mesh>)}
    <mesh position={[0,3.22,-13]}><boxGeometry args={[1.3,.04,2]}/><meshBasicMaterial color="#eee7c0"/></mesh>
    <pointLight position={[0,2.8,-13]} intensity={9} color="#ffe2ac" distance={8}/>
  </group>;
}
function Session({onRestart}:{onRestart:()=>void}) {
  const playerPositionRef=useRef(new Vector3(0,0,-6));
  const input=useRef<StandaloneInput>({x:0,y:0,lookX:0,lookY:0});
  const drag=useRef<{id:number;x:number;y:number}|null>(null);
  const [complete,setComplete]=useState(false);
  const chatOpen=useNpcOpen();
  useEffect(() => {
    const w=window as unknown as {__f10teleport?:(x:number,z:number)=>void};
    const teleport=(x:number,z:number)=>playerPositionRef.current.set(x,0,z);
    w.__f10teleport=teleport;
    return () => {if(w.__f10teleport===teleport)delete w.__f10teleport;};
  },[]);
  const lookStart=(e:ReactPointerEvent<HTMLDivElement>) => {
    if(chatOpen||complete||(e.target as HTMLElement).tagName!=='CANVAS')return;
    if(e.pointerType==='mouse'){Promise.resolve((e.target as HTMLCanvasElement).requestPointerLock?.()).catch(()=>{});return;}
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);
  };
  const lookMove=(e:ReactPointerEvent<HTMLDivElement>) => {
    const d=drag.current;if(!d||d.id!==e.pointerId)return;
    input.current.lookX+=e.clientX-d.x;input.current.lookY+=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;
  };
  const stick=(e:ReactPointerEvent<HTMLDivElement>) => {
    const r=e.currentTarget.getBoundingClientRect();
    input.current.x=Math.max(-1,Math.min(1,(e.clientX-r.left-r.width/2)/38));
    input.current.y=Math.max(-1,Math.min(1,-(e.clientY-r.top-r.height/2)/38));
  };
  return <main className="f10-lab" data-floor10-standalone onPointerDown={lookStart} onPointerMove={lookMove} onPointerUp={e=>{if(drag.current?.id===e.pointerId)drag.current=null;}} onPointerCancel={e=>{if(drag.current?.id===e.pointerId)drag.current=null;}}>
    <Canvas dpr={[1,1.25]} camera={{fov:65,near:.1,far:85,position:[0,1.65,-6]}} gl={{antialias:false}}>
      <color attach="background" args={['#8b9b8e']}/><Cabin/>
      <StandaloneControls position={playerPositionRef} input={input} paused={chatOpen||complete}/>
      <Floor10Module playerPositionRef={playerPositionRef} active={!complete} onExit={()=>{document.exitPointerLock?.();setComplete(true);}}/>
    </Canvas>
    <Floor10Interface active={!complete}/>
    {!chatOpen&&!complete&&<>
      <nav className="f10-lab-toolbar" aria-label="Bancada do andar 10">
        <button onClick={onRestart}>Recomeçar</button>
        <button onClick={()=>{document.documentElement.requestFullscreen?.().catch(()=>{});}}>Tela cheia</button>
      </nav>
      <div className="f10-lab-crosshair"/>
      <div className="f10-lab-stick" aria-label="Mover" role="application"
        onPointerDown={e=>{e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);stick(e);}}
        onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))stick(e);}}
        onPointerUp={()=>{input.current.x=0;input.current.y=0;}}
        onPointerCancel={()=>{input.current.x=0;input.current.y=0;}}/>
      <span className="f10-lab-help">WASD para andar · clique na sala para olhar · Esc libera o cursor</span>
    </>}
    {complete&&<section className="f10-lab-ending" data-floor10-complete>
      <h1>Ninguém volta sozinho.</h1><p>Vocês resolveram os dois mecanismos e embarcaram juntos. O andar 10 terminou.</p>
      <button onClick={onRestart}>Jogar novamente</button>
    </section>}
  </main>;
}
function Standalone(){const [session,setSession]=useState(0);return <Session key={session} onRestart={()=>{npcSet({open:false});setSession(v=>v+1);}}/>;}
createRoot(document.getElementById('floor10-root')!).render(<Standalone/>);
