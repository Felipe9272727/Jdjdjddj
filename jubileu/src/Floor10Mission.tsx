import { useState } from 'react';
import './floor10Redesign.css';
export type Floor10MissionProps = {
  phase: string; hint: string; progress: number; energia: boolean; calibrado: boolean;
  helping: boolean; canHelp: boolean; ready: boolean; chatOpen: boolean;
  onHelp: () => void; onCancel: () => void;
};
export default function Floor10Mission(p: Floor10MissionProps) {
  const [expanded,setExpanded] = useState(false);
  if (p.chatOpen) return null;
  return <aside className="f10-mission" data-floor10-workshop aria-label="Objetivo do andar">
    <button className="f10-mission-heading" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>
      <span className="f10-mission-mark">10</span>
      <span><small>CENTRAL DE RETORNO</small><strong>{p.phase}</strong></span>
      <span className="f10-mission-chevron" aria-hidden>{expanded ? '−' : '+'}</span>
    </button>
    {expanded && <p className="f10-mission-hint">{p.hint}</p>}
    <div className="f10-mission-track" aria-label="Progresso"><i style={{width:`${Math.max(0,Math.min(1,p.progress))*100}%`}}/></div>
    {(p.canHelp || p.helping || p.ready) && <div className="f10-mission-actions">
      <button data-floor10-help onClick={p.onHelp} disabled={p.helping}>{p.helping ? 'Nilo está ajudando…' : p.ready ? 'Nilo, vamos embora' : 'Nilo, assume o outro contato'}</button>
      {p.helping && <button className="f10-cancel" onClick={p.onCancel}>Pode parar</button>}
    </div>}
  </aside>;
}
