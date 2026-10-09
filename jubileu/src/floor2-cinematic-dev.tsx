import { createRoot } from 'react-dom/client';
import { useRef, useState } from 'react';
import { DiverCutscene } from './DiverCutscene';
import { DiverPreview } from './DiverPreview';
function Preview() {
  const [done, setDone] = useState('');
  const [filmActive, setFilmActive] = useState(false);
  const events = useRef<{ beats: number[]; film: boolean[]; accept: number; refuse: number }>({ beats: [], film: [], accept: 0, refuse: 0 });
  (window as any).__f2Film = events.current;
  return <>
    {!filmActive && <DiverPreview />}
    {!done && <DiverCutscene onBeat={beat => events.current.beats.push(beat)}
      onFilmActive={active => { events.current.film.push(active); setFilmActive(active); }}
      onAccept={() => { events.current.accept++; setDone('Equipamento recebido'); }}
      onRefuse={() => { events.current.refuse++; setDone('Conversa pulada'); }} />}
    {done && <div style={{ position: 'fixed', inset: 0, color: 'white', background: '#041014dd', display: 'grid', placeItems: 'center' }}>
      <button onClick={() => location.reload()}>{done} · Repetir</button>
    </div>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
