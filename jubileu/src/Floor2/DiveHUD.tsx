import { useEffect, useState, type MutableRefObject } from 'react';
import type { Vector3 } from 'three';
import { SHARD_POSITIONS, SWIM_THRESHOLD_Y, WATER_LEVEL_Y } from './constants';
import './dive-hud.css';

/** A slow DOM instrument update keeps camera motion out of the React scene. */
export function DiveHUD({ collected, player, heading, berserk }: {
    collected: Set<number>; player: MutableRefObject<Vector3>;
    heading: MutableRefObject<number>; berserk: boolean;
}) {
    const [reading, setReading] = useState({ submerged:false, depth:0, distance:0, bearing:0 });
    useEffect(() => {
        const update = () => {
            const p=player.current;
            let distance=Infinity, bearing=0;
            SHARD_POSITIONS.forEach(([x,y,z],i) => {
                if (collected.has(i)) return;
                const d=Math.hypot(x-p.x,y-p.y,z-p.z);
                if(d<distance){distance=d;bearing=Math.atan2(x-p.x,-(z-p.z))+heading.current;}
            });
            setReading({submerged:p.y<SWIM_THRESHOLD_Y,depth:Math.max(0,Math.round(WATER_LEVEL_Y-p.y)),
                distance:Number.isFinite(distance)?Math.round(distance):0,bearing});
        };
        update(); const timer=window.setInterval(update,250);
        return ()=>window.clearInterval(timer);
    },[collected,player,heading]);
    const complete=collected.size===5;
    return <aside className="f2-instrument" aria-label="Progresso do mergulho">
        <div className="f2-instrument-heading"><span>02 / RESERVATÓRIO</span><span>{reading.submerged?`${reading.depth} m`:'SUPERFÍCIE'}</span></div>
        <div className="f2-instrument-row">
            <div className="f2-fragments" aria-label={`${collected.size} de 5 fragmentos`}>
                {SHARD_POSITIONS.map((_,i)=><span key={i} className={collected.has(i)?'found':''} />)}
            </div>
            <strong>{collected.size}<small> / 5</small></strong>
            {reading.submerged && !complete && <span className="f2-signal"><span style={{display:'inline-block',transform:`rotate(${reading.bearing}rad)`}}>↑</span> {reading.distance} m</span>}
        </div>
        <div className={berserk?'f2-instrument-note danger':'f2-instrument-note'} aria-live="polite">
            {complete?'Fragmentos completos · voltando ao elevador':berserk?'Ele sentiu sua presença. Continue nadando.':reading.submerged?'Siga o sinal · encontre os fragmentos':'Mergulhe no poço · encontre 5 fragmentos'}
        </div>
    </aside>;
}
