import { DiveHUD } from './Floor2/DiveHUD';
/** Isolated inspection of the shipping Floor 2 scene: ?f2preview&view=deep&quality=high. */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, SRGBColorSpace, Vector3 } from 'three';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useRef, useState } from 'react';
import { Floor2Environment } from './Floor2';

type View = { camera: [number,number,number]; target: [number,number,number] };
const VIEWS: Record<string,View> = {
    rim: {camera:[0,2.6,10.5],target:[0,-1.5,5]},
    cave: {camera:[8,2.5,-5],target:[0,.5,5]},
    deep: {camera:[0,-21.5,3],target:[12,-25,-12]},
    shards: {camera:[-9,-24,7],target:[3,-25,16]},
};
function Probe() {
    const frames=useRef(0);
    const { gl }=useThree();
    useFrame(() => {
        (window as any).__f2PreviewStats={frames:++frames.current,calls:gl.info.render.calls,triangles:gl.info.render.triangles};
    });
    return null;
}
export default function Floor2Preview() {
    const params=new URLSearchParams(location.search);
    const key=params.get('view') ?? 'rim';
    const view=VIEWS[key] ?? VIEWS.rim;
    const playerPositionRef=useRef(new Vector3(view.camera[0],view.camera[1]-1.6,view.camera[2]));
    const heading=useRef(0);
    const [shards,setShards]=useState(new Set<number>());
    const [paused,setPaused]=useState(false);
    const [caught,setCaught]=useState(false);
    return <div style={{width:'100vw',height:'100vh',background:'#061015'}}>
        <Canvas dpr={1} camera={{position:view.camera,fov:60,near:.1,far:140}}
            gl={{antialias:true,toneMapping:ACESFilmicToneMapping,outputColorSpace:SRGBColorSpace}}>
            <Suspense fallback={null}>
                <Floor2Environment playerPositionRef={playerPositionRef} collectedShards={shards}
                    onCollectShard={i=>setShards(old=>new Set(old).add(i))}
                    onPlayerCaught={params.has('danger') ? ()=>setCaught(true) : undefined}
                    berserk={shards.size>=3} paused={paused || caught}
                    reflective={params.get('quality')==='high'} />
                <Probe />
            </Suspense>
            <OrbitControls target={view.target} />
        </Canvas>
        {params.has('hud') && <DiveHUD collected={shards} player={playerPositionRef} heading={heading} berserk={false} />}
        {!params.has('clean') && <nav style={{position:'absolute',left:16,top:16,color:'#e0eded',font:'12px monospace',background:'#051215dd',padding:12,borderRadius:8}}>
            <div style={{marginBottom:8}}>ANDAR 02 · {key.toUpperCase()} · {shards.size}/5 {caught?'CAPTURADO':''}</div>
            {Object.keys(VIEWS).map(name=><a key={name} href={`?f2preview&view=${name}&quality=${params.get('quality')??'medium'}`} style={{color:'#a0d5cf',marginRight:12}}>{name}</a>)}
            <button onClick={()=>setPaused(v=>!v)}>{paused?'Continuar':'Pausar'}</button>
        </nav>}
    </div>;
}
