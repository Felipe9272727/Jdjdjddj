/** Diagnóstico sob demanda: ?f13audit=1. Caixas são candidatas, não prova de colisão. */
import * as THREE from 'three';

export const auditEnabled = import.meta.env.DEV && typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('f13audit');
let cameraPose: {position:number[];target:number[]}|null=null;
export function applyAuditCamera(camera: THREE.Camera): boolean {
    if(!auditEnabled || !cameraPose)return false;
    camera.position.fromArray(cameraPose.position);camera.lookAt(new THREE.Vector3().fromArray(cameraPose.target));
    camera.updateMatrixWorld();return true;
}
type Part = { owner: string; box: THREE.Box3; corners: THREE.Vector3[]; solid: boolean };
function cornersOf(box:THREE.Box3) {
    const points:THREE.Vector3[]=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z));
    return points;
}
/** SAT de paralelepípedos: preserva rotação, escala não uniforme e cisalhamento. */
export function orientedDepth(a:THREE.Vector3[],b:THREE.Vector3[]):number {
    const edges=(p:THREE.Vector3[])=>[p[4].clone().sub(p[0]),p[2].clone().sub(p[0]),p[1].clone().sub(p[0])];
    const A=edges(a),B=edges(b),axes:THREE.Vector3[]=[];
    for(const e of [A,B])for(let i=0;i<3;i++)axes.push(new THREE.Vector3().crossVectors(e[i],e[(i+1)%3]));
    for(const x of A)for(const y of B)axes.push(new THREE.Vector3().crossVectors(x,y));
    let depth=Infinity;
    for(const axis of axes){
        if(axis.lengthSq()<1e-14)continue;axis.normalize();
        const ap=a.map(p=>p.dot(axis)),bp=b.map(p=>p.dot(axis));
        const loA=Math.min(...ap),hiA=Math.max(...ap),loB=Math.min(...bp),hiB=Math.max(...bp);
        if(hiA<=loB || hiB<=loA)return 0;
        depth=Math.min(depth,hiA-loB,hiB-loA);
    }
    return Number.isFinite(depth)?depth:0;
}
function ownerOf(object: THREE.Object3D): string | null {
    let owner: string | null = null;
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
        if (o.userData.auditIgnore) return null;
        if (!owner && typeof o.userData.audit === 'string') owner=o.userData.audit;
    }
    return owner;
}
/** Guarda procedência por peça no espaço da malha fundida, sem manter malhas originais. */
export function auditParts(mesh: THREE.Mesh, inverse = new THREE.Matrix4()): Part[] {
    const transform=new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
    const saved = mesh.userData.auditParts as Part[] | undefined;
    if (saved) return saved.map(p => {
        const corners=p.corners.map(c=>c.clone().applyMatrix4(transform));
        return {owner:p.owner,solid:p.solid,corners,box:new THREE.Box3().setFromPoints(corners)};
    });
    const owner = ownerOf(mesh);
    if (!owner) return [];
    // Personagens: bounds da pose atual. Rígidos: manter os cantos locais,
    // sem converter AABB mundo -> AABB local a cada fusão (isso inflava as caixas).
    if((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh){
        const box=new THREE.Box3().setFromObject(mesh,true).applyMatrix4(inverse);
        return [{owner,solid:false,box,corners:cornersOf(box)}];
    }
    mesh.geometry.computeBoundingBox();
    const bounds=mesh.geometry.boundingBox;
    if(!bounds || bounds.isEmpty())return [];
    const corners=cornersOf(bounds).map(c=>c.applyMatrix4(transform));
    // Só uma caixa primitiva intacta permite confirmar volume sólido por SAT.
    const positions=mesh.geometry.getAttribute('position');
    let solid=mesh.geometry.type==='BoxGeometry';
    for(let i=0;solid && i<positions.count;i++)for(let axis=0;axis<3;axis++){
        const v=positions.getComponent(i,axis);
        if(Math.abs(v-bounds.min.getComponent(axis))>1e-6 && Math.abs(v-bounds.max.getComponent(axis))>1e-6)solid=false;
    }
    return [{owner,solid,corners,box:new THREE.Box3().setFromPoints(corners)}];
}

export function scanOverlaps(scene: THREE.Object3D, tolerance = .025) {
    if (!Number.isFinite(tolerance) || tolerance < 0) throw Error('Tolerância deve ser finita e não negativa');
    scene.updateMatrixWorld(true);
    const objects = new Map<string, {box:THREE.Box3; parts:Part[]}>();
    let unlabelledMeshes = 0;
    scene.traverseVisible(o => {
        if (!(o as THREE.Mesh).isMesh || o.userData.auditIgnore) return;
        const mesh = o as THREE.Mesh;
        const parts = auditParts(mesh);
        if (!parts.length) unlabelledMeshes++;
        for (const p of parts) {
            if (p.box.isEmpty()) continue;
            let item = objects.get(p.owner);
            if (!item) { item = {box:new THREE.Box3(),parts:[]}; objects.set(p.owner,item); }
            item.box.union(p.box); item.parts.push(p);
        }
    });
    const entries = [...objects.entries()].sort((a,b)=>a[1].box.min.x-b[1].box.min.x);
    const candidates: {a:string;b:string;depth:number;overlap:number[];center:number[];solidBoxPairs:number}[] = [];
    const intersection = new THREE.Box3(), size = new THREE.Vector3();
    for (let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++) {
        const [a,A]=entries[i], [b,B]=entries[j];
        if(B.box.min.x>A.box.max.x)break;
        if(!A.box.intersectsBox(B.box))continue;
        let deepest=0, hit:THREE.Box3|null=null, solidBoxPairs=0;
        for(const pa of A.parts)for(const pb of B.parts) {
            intersection.copy(pa.box).intersect(pb.box);
            if(intersection.isEmpty())continue;
            intersection.getSize(size);
            const broadDepth=Math.min(size.x,size.y,size.z);
            if(broadDepth<=tolerance)continue;
            const depth=orientedDepth(pa.corners,pb.corners);
            if(depth>tolerance && pa.solid && pb.solid)solidBoxPairs++;
            if(depth>tolerance && depth>deepest){deepest=depth;hit=intersection.clone();}
        }
        if(hit)candidates.push({a,b,solidBoxPairs,depth:deepest,overlap:hit.getSize(new THREE.Vector3()).toArray(),center:hit.getCenter(new THREE.Vector3()).toArray()});
    }
    candidates.sort((a,b)=>b.depth-a.depth);
    return {kind:'Oriented bounds; solidBoxPairs counts intersecting intact box primitives',tolerance,unlabelledMeshes,
        objects:[...objects].map(([id,o])=>({id,parts:o.parts.length,min:o.box.min.toArray(),max:o.box.max.toArray()})),candidates};
}

export function installSpatialAudit(scene: THREE.Scene, camera: THREE.Camera) {
    const overlay = new THREE.Group(); overlay.userData.auditIgnore=true;
    overlay.name='f13-audit-overlay';
    const clear=()=>{for(const child of [...overlay.children]){
        overlay.remove(child);const helper=child as THREE.Box3Helper;helper.geometry.dispose();
        const materials=Array.isArray(helper.material)?helper.material:[helper.material];materials.forEach(m=>m.dispose());
    }};
    const api={
        scan:scanOverlaps.bind(null,scene),
        show:(ids:string[])=>{clear();const report=scanOverlaps(scene);
            for(const item of report.objects.filter(o=>ids.includes(o.id))){
                const box=new THREE.Box3(new THREE.Vector3().fromArray(item.min),new THREE.Vector3().fromArray(item.max));
                const helper=new THREE.Box3Helper(box,0xff286e);(helper.material as THREE.Material).depthTest=false;helper.renderOrder=10000;overlay.add(helper);
            }
            const hits=report.candidates.filter(c=>ids.includes(c.a)||ids.includes(c.b));
            for(const hit of hits){
                const box=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().fromArray(hit.center),new THREE.Vector3().fromArray(hit.overlap));
                const helper=new THREE.Box3Helper(box,0xffff00);(helper.material as THREE.Material).depthTest=false;helper.renderOrder=10001;overlay.add(helper);
            }return hits;},
        clear,
        releaseCamera:()=>{cameraPose=null;},
        // Posicionamento manual só na bancada, útil para capturas laterais de contato.
        camera:(position:number[],target:number[])=>{cameraPose={position:[...position],target:[...target]};applyAuditCamera(camera);},
    };
    scene.add(overlay);
    (window as any).__f13Audit=api;
    return()=>{clear();cameraPose=null;scene.remove(overlay);if((window as any).__f13Audit===api)delete (window as any).__f13Audit;};
}
