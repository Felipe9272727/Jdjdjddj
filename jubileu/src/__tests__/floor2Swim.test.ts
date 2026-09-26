import { describe, it, expect } from 'vitest';
import { moveSwimmer, type SwimTerrain } from '../Floor2/swim';
import { HOLE_RADIUS, SWIM_THRESHOLD_Y } from '../Floor2/constants';
const empty: SwimTerrain = {floorHeight:()=>-30,resolveWalls:()=>{},rocks:[],pillars:[],arches:[]};
describe('Floor 2 swim collision', () => {
    it('does not tunnel through a thin rock during a long sprint step', () => {
        const p={x:-2,y:-15,z:0};
        moveSwimmer(p,{x:4,y:0,z:0},{...empty,rocks:[{x:0,y:-15,z:0,r:.15}]});
        expect(p.x).toBeLessThanOrEqual(-.65+1e-6);
    });
    it('permits swimming above a finite pillar but blocks its side', () => {
        const world={...empty,pillars:[{x:0,z:0,r:.3,top:-20}]};
        const high={x:-2,y:-18,z:0}, low={x:-2,y:-23,z:0};
        moveSwimmer(high,{x:4,y:0,z:0},world); moveSwimmer(low,{x:4,y:0,z:0},world);
        expect(high.x).toBeCloseTo(2); expect(low.x).toBeLessThan(0);
    });
    it('climbs beyond the rim and cannot pop through the ceiling elsewhere', () => {
        const rim={x:2.5,y:-2.8,z:5}, centre={x:0,y:-2.8,z:5}, outside={x:10,y:-2.8,z:5};
        for (const p of [rim,centre,outside]) moveSwimmer(p,{x:0,y:.5,z:0},empty);
        expect(rim.y).toBe(.05); expect(rim.x).toBeGreaterThan(HOLE_RADIUS);
        expect(centre.y).toBeLessThan(SWIM_THRESHOLD_Y); expect(outside.y).toBeLessThan(SWIM_THRESHOLD_Y);
    });
    it('blocks arch lintels and follows the actual seafloor height', () => {
        const p={x:0,y:-24,z:-2};
        moveSwimmer(p,{x:0,y:0,z:4},{...empty,arches:[[0,0,6,5,.4]]});
        expect(p.z).toBeLessThan(0);
        const floor={x:9,y:-27,z:9};
        moveSwimmer(floor,{x:0,y:-3,z:0},{...empty,floorHeight:()=>-25});
        expect(floor.y).toBeCloseTo(-24.2);
    });
});
