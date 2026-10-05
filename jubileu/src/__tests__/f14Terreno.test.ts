import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {alturaEm, superficieEm, TAMANHO_TERRENO, SEGMENTOS_TERRENO} from '../f14Terreno';

describe('Kessar: chão visível e chão pisável', () => {
    it('usa exatamente os triângulos do PlaneGeometry, inclusive terraços e cratera', () => {
        const g = new THREE.PlaneGeometry(TAMANHO_TERRENO,TAMANHO_TERRENO,SEGMENTOS_TERRENO,SEGMENTOS_TERRENO);
        g.rotateX(-Math.PI/2);
        const pos=g.attributes.position;
        for(let i=0;i<pos.count;i++) pos.setY(i,alturaEm(pos.getX(i),pos.getZ(i)));
        const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
        mesh.updateMatrixWorld();
        const ray=new THREE.Raycaster();
        let seed=14; const random=()=>((seed=seed*16807%2147483647)/2147483647);
        const targets=[[0,0],[.4,-4.2],[-142,34],[150,-22],[20,170],[14,-140]];
        for(let i=0;i<50;i++) targets.push([(random()-.5)*480,(random()-.5)*480]);
        for(const [x,z] of targets){
            ray.set(new THREE.Vector3(x,400,z),new THREE.Vector3(0,-1,0));
            const hit=ray.intersectObject(mesh)[0];
            expect(hit,`superfície em ${x},${z}`).toBeTruthy();
            expect(superficieEm(x,z)).toBeCloseTo(hit.point.y,4);
        }
        g.dispose();mesh.material.dispose();
    });
});
