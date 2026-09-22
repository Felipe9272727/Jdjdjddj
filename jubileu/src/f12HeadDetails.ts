import * as THREE from 'three';

/** Rear housing stays behind the sculpt and leaves the mouth cavity open. */
export function createConciergeSkull() {
  const sphere = new THREE.SphereGeometry(3.6, 64, 48);
  const flat = sphere.toNonIndexed(); sphere.dispose();
  const p = flat.getAttribute('position');
  const vertices: number[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i+1) + p.getX(i+2)) / 3;
    const y = (p.getY(i) + p.getY(i+1) + p.getY(i+2)) / 3;
    const z = (p.getZ(i) + p.getZ(i+1) + p.getZ(i+2)) / 3;
    if (z > .45 && y < -.62 && Math.abs(x) < 2.48) continue;
    for (let j = i; j < i+3; j++) {
      const vy = p.getY(j), vz = p.getZ(j);
      const taper = .86 + .16 * THREE.MathUtils.smoothstep(vy, -2.6, .8);
      vertices.push(p.getX(j)*taper, vy*1.015, vz*(vz > 0 ? .48 : .88));
    }
  }
  flat.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

export function shellPoint(y: number, angle: number) {
  const r = Math.sqrt(Math.max(.04, 3.6 ** 2 - y ** 2));
  const taper = .86 + .16 * THREE.MathUtils.smoothstep(y, -2.6, .8);
  return new THREE.Vector3(Math.cos(angle)*r*taper*1.006, y*1.015, Math.sin(angle)*r*.88*1.006);
}

export function createShellSeams() {
  return [2.55, .55, -1.35].map(y => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => shellPoint(y, Math.PI*(1.01+i/32*.98)))),
    40, .034, 5, false));
}

/** Surface-projected trim and damage cannot float off the porcelain. */
export function createFaceDetails(sculpt: THREE.BufferGeometry) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const probe = new THREE.Mesh(sculpt, material), ray = new THREE.Raycaster();
  const project = (x: number, y: number) => {
    ray.set(new THREE.Vector3(x,y,6), new THREE.Vector3(0,0,-1));
    const hit = ray.intersectObject(probe, false)[0];
    if (!hit?.face) return null;
    const n = hit.face.normal.clone(); if (n.z < 0) n.negate();
    return hit.point.clone().addScaledVector(n,.025);
  };
  const rims = [-1,1].map(side => {
    const points = Array.from({length:48}, (_,i) => {
      const a=i/48*Math.PI*2;
      return project(side*1.55+Math.cos(a)*1.035,1.15+Math.sin(a)*.735);
    }).filter((p): p is THREE.Vector3 => p !== null);
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),64,.018,5,true);
  });
  const cracks = [[-2.30,-.05],[2.30,-.05],[-.65,2.55],[.7,2.5],[-2.62,1.65],[2.62,1.65]].map(([x,y],i)=>{
    const side=i%2?-1:1;
    const points=[[-.08,-.24],[.06,-.1],[-.03,.06],[.11,.24],[.03,.4]]
      .map(([dx,dy])=>project(x+dx*side,y+dy)).filter((p): p is THREE.Vector3=>p!==null);
    return {
      edge:new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,.04,5,false),
      ember:new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>p.clone().add(new THREE.Vector3(0,0,.037)))),18,.014,5,false),
    };
  });
  material.dispose(); return {rims,cracks};
}

/** A shallow curved chin with dark inner lining, not a solid ivory block. */
export function createConciergeJaw() {
  const s=new THREE.Shape();
  s.moveTo(-2.30,.52); s.quadraticCurveTo(0,.22,2.30,.52);
  s.bezierCurveTo(2.43,-.14,2.08,-.72,1.55,-.95);
  s.quadraticCurveTo(0,-1.35,-1.55,-.95);
  s.bezierCurveTo(-2.08,-.72,-2.43,-.14,-2.30,.52);
  const g=new THREE.ExtrudeGeometry(s,{depth:.42,bevelEnabled:true,bevelSize:.14,bevelThickness:.10,bevelSegments:4,curveSegments:16});
  g.translate(0,0,.68);
  const p=g.getAttribute('position'), n=g.getAttribute('normal');
  const normal=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i);
    p.setZ(i,p.getZ(i)-.052*x*x);
    // Transform the original smooth bevel normals through the curved surface.
    normal.set(n.getX(i)+.104*x*n.getZ(i),n.getY(i),n.getZ(i)).normalize();
    n.setXYZ(i,normal.x,normal.y,normal.z);
  }
  g.computeBoundingSphere(); g.clearGroups();
  let start=0, last=-1;
  for(let i=0;i<p.count;i+=3){
    const m=n.getZ(i)+n.getZ(i+1)+n.getZ(i+2)<-.3?1:0;
    if(m!==last){if(i>start)g.addGroup(start,i-start,last);start=i;last=m;}
  }
  if(p.count>start)g.addGroup(start,p.count-start,last);
  return g;
}

export function createConciergeTooth() {
  const s=new THREE.Shape(); s.moveTo(-.23,.29); s.lineTo(.23,.29); s.lineTo(.20,-.27);
  s.quadraticCurveTo(0,-.34,-.20,-.27); s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:.25,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:2,curveSegments:5});
  g.translate(0,0,-.125); return g;
}
