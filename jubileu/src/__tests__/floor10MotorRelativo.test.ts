import { describe, it, expect } from 'vitest';
import { parseMotorPlan, groundMotorPlan } from '../npc/floor10MotorCortex';
import { INITIAL_FLOOR10_PERCEPTION } from '../npc/floor10Perception';
describe('movimentos no referencial do corpo do Nilo', () => {
    const casos = [ ['ahead',0,1], ['behind',0,-1], ['to-my-left',-1,0], ['to-my-right',1,0] ] as const;
    for (const [alvo,x,z] of casos) for (const yaw of [0,Math.PI/2]) {
        it(`${alvo}, yaw=${yaw}: parser e destino respeitam direção e metros`, () => {
            const plan = parseMotorPlan(`MOTION: explore | ${alvo} | normal | 6`)!;
            expect(plan).not.toBeNull(); expect(plan.target).toBe(alvo);
            const m = groundMotorPlan({...plan,distancia:2}, {...INITIAL_FLOOR10_PERCEPTION,yaw},null,{x:0,z:0})!;
            expect(m).not.toBeNull();
            expect(m.target!.x).toBeCloseTo(2*(x*Math.cos(yaw)+z*Math.sin(yaw)));
            expect(m.target!.z).toBeCloseTo(2*(z*Math.cos(yaw)-x*Math.sin(yaw)));
        });
    }
    it('usa cinco metros quando a distância está ausente ou não é positiva/finita', () => {
        const plan=parseMotorPlan('MOTION: approach | ahead | slow | 3')!;
        for(const distancia of [undefined,-1,NaN,Infinity]) {
            const m=groundMotorPlan({...plan,distancia},{...INITIAL_FLOOR10_PERCEPTION,yaw:0},null,{x:0,z:0})!;
            expect(Math.hypot(m.target!.x,m.target!.z)).toBeCloseTo(5);
        }
    });
});
