import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {scanOverlaps,auditParts} from '../f13SpatialAudit';
function box(owner:string,x:number){const g=new THREE.Group();g.userData.audit=owner;g.position.x=x;g.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));return g;}
describe('diagnóstico espacial sob demanda',()=>{
 it('ignora peças do mesmo objeto e contato de face; encontra penetração',()=>{
  const s=new THREE.Scene(),a=box('A',0);a.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));s.add(a,box('B',.8),box('C',1.8));
  const r=scanOverlaps(s);expect(r.candidates).toHaveLength(1);expect([r.candidates[0].a,r.candidates[0].b]).toEqual(['A','B']);expect(r.candidates[0].depth).toBeCloseTo(.2);
 });
 it('mantém identidade e transforms de peças após fusões sucessivas',()=>{
  const s=new THREE.Scene(),a=box('A',4);s.add(a);s.updateMatrixWorld(true);
  const merged=new THREE.Mesh();merged.position.x=2;merged.updateMatrixWorld();merged.userData.auditParts=auditParts(a.children[0] as THREE.Mesh,merged.matrixWorld.clone().invert());
  s.remove(a);s.add(merged,box('B',4.8));const r=scanOverlaps(s);expect(r.candidates).toHaveLength(1);expect(r.objects.find(o=>o.id==='A')?.min[0]).toBeCloseTo(3.5);
  const again=new THREE.Mesh();again.userData.auditParts=auditParts(merged);s.remove(merged);s.add(again);expect(scanOverlaps(s).candidates[0].depth).toBeCloseTo(.2);
 });
 it('ignora subárvores invisíveis e não modifica a cena',()=>{
  const s=new THREE.Scene(),a=box('A',0),b=box('B',0);b.visible=false;s.add(a,b);
  expect(scanOverlaps(s).candidates).toHaveLength(0);expect(s.children).toHaveLength(2);expect(()=>scanOverlaps(s,NaN)).toThrow();
 });
});
