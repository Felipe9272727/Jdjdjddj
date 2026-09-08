import { useEffect, type MutableRefObject } from 'react';
import type { Vector3 } from 'three';
import Floor10Base from '../Floor10Base';
import Floor10Npc from '../Floor10Npc';
import Floor10NpcChat from '../Floor10NpcChat';
import { prisonReset } from '../npc/f10Prison';
import { cancelarCooperacao } from '../npc/f10Cooperacao';
import { npcSet } from '../npc/npcStore';
export type Floor10ModuleProps = {
  playerPositionRef: MutableRefObject<Vector3>;
  onExit: () => void;
  active?: boolean;
};
/** Scene only. The host owns its player, camera, elevator transition and HUD. */
export default function Floor10Module({playerPositionRef,onExit,active=true}:Floor10ModuleProps) {
  useEffect(() => {
    if(!active)return;
    prisonReset();cancelarCooperacao();npcSet({open:false});
    return()=>{cancelarCooperacao();npcSet({open:false});};
  },[active]);
  if(!active)return null;
  return <><Floor10Base playerPositionRef={playerPositionRef} onExit={onExit}/><Floor10Npc playerPositionRef={playerPositionRef}/></>;
}
/** DOM only; mount beside the Canvas, never inside it. */
export function Floor10Interface({active=true}:{active?:boolean}) {
  return active ? <Floor10NpcChat/> : null;
}
