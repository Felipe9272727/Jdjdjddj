import type { Ref } from 'react';
import type { Group, Mesh } from 'three';
export type NiloVisualRefs = { torso: Ref<Group>; head: Ref<Group>; armL: Ref<Group>; armR: Ref<Group>; legL: Ref<Group>; legR: Ref<Group>; eyeL: Ref<Mesh>; eyeR: Ref<Mesh> };
type V = [number,number,number];
const suit = '#31565a', skin = '#bf8c68', dark = '#253638';
function Part({p,s,c, r=[0,0,0]}:{p:V;s:V;c:string;r?:V}) {
  return <mesh position={p} scale={s} rotation={r}><icosahedronGeometry args={[1,1]}/><meshStandardMaterial color={c} flatShading roughness={.92}/></mesh>;
}
function Band({p,s,c}:{p:V;s:V;c:string}) {
  return <mesh position={p}><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={.84}/></mesh>;
}
/** Feet at y=0, facing +Z; the original animation pivots remain unchanged. */
export function NiloVisual({refs}:{refs?:NiloVisualRefs}) {
  return <>
    {([-1,1] as const).map(side => <group key={side} ref={side<0 ? refs?.legL : refs?.legR} position={[side*.11,.74,0]}>
      <Part p={[0,-.19,0]} s={[.113,.255,.12]} c={suit}/>
      <Part p={[0,-.48,.015]} s={[.09,.22,.1]} c="#29464a"/>
      <Band p={[0,-.34,.1]} s={[.135,.135,.045]} c="#505854"/>
      <Part p={[0,-.635,.065]} s={[.118,.105,.195]} c="#302f2b"/>
      <Band p={[0,-.712,.07]} s={[.19,.045,.3]} c="#1c2526"/>
      <Band p={[0,-.59,.01]} s={[.155,.036,.14]} c="#a8905a"/>
    </group>)}
    <group ref={refs?.torso} position={[0,.82,0]}>
      <Part p={[0,.19,0]} s={[.27,.32,.155]} c={suit}/>
      <Part p={[0,.28,.132]} s={[.145,.22,.032]} c="#b59458"/>
      {/* Open jacket lapels, patch pocket and a diagonal utility strap. */}
      <Part p={[-.105,.31,.145]} s={[.065,.19,.028]} r={[0,0,-.17]} c="#45676a"/>
      <Part p={[.105,.31,.145]} s={[.065,.19,.028]} r={[0,0,.17]} c="#45676a"/>
      <Band p={[-.17,.19,.142]} s={[.105,.11,.03]} c="#24474b"/>
      <Band p={[-.17,.255,.157]} s={[.09,.018,.008]} c="#d9c68a"/>
      <mesh position={[.08,.2,.165]} rotation={[0,0,-.34]}><boxGeometry args={[.035,.5,.025]}/><meshStandardMaterial color="#574837" roughness={.95}/></mesh>
      <Band p={[0,-.025,.012]} s={[.44,.085,.275]} c="#493d31"/>
      <Band p={[0,-.025,.158]} s={[.07,.062,.025]} c="#bd9c5e"/>
      <Band p={[.205,-.11,0]} s={[.105,.19,.14]} c="#826641"/>
      <Band p={[-.215,-.09,.01]} s={[.06,.2,.065]} c="#9caaa5"/>
      <Part p={[0,.46,0]} s={[.074,.09,.073]} c={skin}/>
      {([-1,1] as const).map(side => <group key={side} ref={side<0 ? refs?.armL : refs?.armR} position={[side*.26,.36,0]}>
        <Part p={[side*.015,-.11,0]} s={[.103,.19,.12]} c={suit}/>
        <Band p={[side*.012,-.21,.003]} s={[.155,.055,.17]} c="#84928a"/>
        <Part p={[side*.02,-.31,.008]} s={[.071,.15,.077]} c={skin}/>
        <Part p={[side*.02,-.435,.025]} s={[.078,.085,.06]} c={dark}/>
        <Part p={[-side*.037,-.416,.069]} s={[.035,.056,.034]} c={skin}/>
        {side<0 && <Band p={[.02,-.345,.071]} s={[.072,.056,.02]} c="#beaf77"/>}
      </group>)}
    </group>
    <group ref={refs?.head} position={[0,1.52,0]}>
      <Part p={[0,.004,0]} s={[.155,.205,.148]} c={skin}/>
      <Part p={[0,-.095,.063]} s={[.118,.112,.103]} c="#ac7858"/>
      <Part p={[0,.092,-.04]} s={[.161,.137,.138]} c="#2f302b"/>
      <Part p={[-.065,.146,.044]} s={[.108,.069,.118]} r={[0,0,-.18]} c="#36382f"/>
      <Part p={[.1,.068,-.012]} s={[.05,.098,.13]} c="#2c302b"/>
      <Part p={[0,-.127,.092]} s={[.1,.066,.068]} c="#525044"/>
      {([-1,1] as const).map(side => <group key={side}>
        <Part p={[side*.152,-.013,-.003]} s={[.032,.055,.037]} c={skin}/>
        <mesh position={[side*.061,.025,.133]} scale={[.035,.022,.012]}><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color="#ddd2b6" roughness={.8}/></mesh>
      </group>)}
      {/* Eyelids scale these meshes directly in the existing blink controller. */}
      <group position={[-.061,.025,.144]} scale={[.025,.016,.009]}><mesh ref={refs?.eyeL}><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color="#252e29" roughness={.85}/></mesh></group>
      <group position={[.061,.025,.144]} scale={[.025,.016,.009]}><mesh ref={refs?.eyeR}><sphereGeometry args={[1,10,6]}/><meshStandardMaterial color="#252e29" roughness={.85}/></mesh></group>
      <Band p={[-.064,.059,.14]} s={[.065,.014,.014]} c="#393a2e"/>
      <mesh position={[.064,.062,.14]} rotation={[0,0,-.1]}><boxGeometry args={[.065,.014,.014]}/><meshStandardMaterial color="#393a2e"/></mesh>
      <Part p={[0,-.019,.151]} s={[.027,.049,.04]} c="#c59470"/>
      <Band p={[0,-.088,.15]} s={[.069,.011,.012]} c="#6b4c3c"/>
      <mesh position={[.114,.037,.102]} rotation={[0,0,-.32]}><boxGeometry args={[.008,.069,.011]}/><meshStandardMaterial color="#dab294" roughness={1}/></mesh>
    </group>
  </>;
}
