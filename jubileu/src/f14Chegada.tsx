import React, {useEffect, useRef, useState} from 'react';

/** Autoplay negado pede um toque; falha de rede oferece continuar explicitamente. */
export function ChegadaKessar({onFinish, volume}: {onFinish: () => void; volume: number}) {
    const video = useRef<HTMLVideoElement>(null), done = useRef(false);
    const [blocked, setBlocked] = useState(false), [failed, setFailed] = useState(false), [started, setStarted] = useState(false);
    const finish = () => { if (!done.current) {done.current = true; video.current?.pause(); onFinish();} };
    useEffect(() => {
        const v = video.current; if (!v) return;
        let active = true;
        v.volume = Math.min(1, Math.max(0, volume));
        v.play().catch(() => {if(active)setBlocked(true);});
        const key = (e: KeyboardEvent) => {if (e.key === 'Escape') {e.preventDefault(); finish();}};
        window.addEventListener('keydown',key);
        return () => {active=false;v.pause();window.removeEventListener('keydown',key);};
    }, []);
    return <div onPointerDown={e=>e.stopPropagation()} style={{position:'absolute',inset:0,background:'#080b10',display:'grid',placeItems:'center'}}>
        <video ref={video} src={`${import.meta.env.BASE_URL}chegada-14.mp4`} playsInline preload="auto"
            onPlaying={()=>{setStarted(true);setBlocked(false);}} onEnded={finish} onError={()=>{setFailed(true);setBlocked(false);}}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'}} />
        {(!started || blocked || failed) && <div style={{position:'relative',textAlign:'center',color:'#d9c6aa',fontFamily:'Georgia,serif',padding:24}}>
            <div style={{fontSize:12,letterSpacing:5,marginBottom:14}}>ANDAR 14</div>
            <div style={{fontSize:32,letterSpacing:8,marginBottom:28}}>KESSAR–9</div>
            {failed ? <><p>A chegada não pôde ser carregada.</p><button style={button} onClick={finish}>Continuar para o deserto</button></>
                : blocked ? <button style={button} onClick={()=>{setBlocked(false);video.current?.play().catch(()=>setBlocked(true));}}>Iniciar chegada</button>
                : <div role="status" style={{fontSize:14,opacity:.7}}>Preparando a chegada…</div>}
        </div>}
        <button aria-label="Pular chegada" onClick={finish} style={{...button,position:'absolute',bottom:'max(18px, env(safe-area-inset-bottom))',right:22,fontSize:12,background:'rgba(8,11,16,.8)'}}>Pular · Esc</button>
    </div>;
}
const button: React.CSSProperties={fontFamily:'inherit',color:'#ead9bd',border:'1px solid #827055',borderRadius:4,padding:'12px 20px',background:'#191b20',cursor:'pointer',letterSpacing:1};
