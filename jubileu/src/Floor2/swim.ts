import { HOLE_CENTER_X, HOLE_CENTER_Z, HOLE_RADIUS, SWIM_THRESHOLD_Y,
    UW_ROCK_COLLIDERS, UW_PILLAR_COLLIDERS, UW_ARCHES } from './constants';

type Point = { x: number; y: number; z: number };
type Sphere = Point & { r: number };
type Pillar = { x: number; z: number; r: number; top: number };
export type SwimTerrain = {
    floorHeight: (x: number, z: number) => number;
    resolveWalls: (p: Point, radius: number) => void;
    rocks?: readonly Sphere[];
    pillars?: readonly Pillar[];
    arches?: typeof UW_ARCHES;
};
const RADIUS = .5;

function pushSphere(p: Point, x: number, y: number, z: number, radius: number) {
    const dx = p.x-x, dy = p.y-y, dz = p.z-z;
    const d = Math.hypot(dx,dy,dz), r = radius+RADIUS;
    if (d >= r) return;
    if (d < .00001) { p.x += r; return; }
    const push = (r-d)/d;
    p.x += dx*push; p.y += dy*push; p.z += dz*push;
}

/** Substeps keep sprinting swimmers outside thin obstacles even after a slow frame. */
export function moveSwimmer(p: Point, delta: Point, terrain: SwimTerrain) {
    const steps = Math.max(1, Math.ceil(Math.hypot(delta.x,delta.y,delta.z)/.18));
    for (let n=0; n<steps; n++) {
        p.x += delta.x/steps; p.y += delta.y/steps; p.z += delta.z/steps;
        for (let pass=0; pass<2; pass++) {
            for (const rock of terrain.rocks ?? UW_ROCK_COLLIDERS) pushSphere(p,rock.x,rock.y,rock.z,rock.r);
            for (const pillar of terrain.pillars ?? UW_PILLAR_COLLIDERS) {
                // Finite cylinders: swimmers can pass over the tops instead of
                // colliding with invisible columns all the way up to the cave.
                if (p.y-RADIUS > pillar.top || p.y+RADIUS < -30) continue;
                pushSphere(p,pillar.x,p.y,pillar.z,pillar.r);
            }
            for (const [x,z,height,span,thickness] of terrain.arches ?? UW_ARCHES) {
                const closestX=Math.max(x-span/2,Math.min(x+span/2,p.x));
                pushSphere(p,closestX,-30+height,z,thickness*.8);
            }
            terrain.resolveWalls(p,.6);
        }
        p.x=Math.max(-28.5,Math.min(28.5,p.x));
        p.z=Math.max(-28.5,Math.min(28.5,p.z));
        p.y=Math.max(-29,terrain.floorHeight(p.x,p.z)+.8,p.y);
        if (p.y > SWIM_THRESHOLD_Y) {
            const dx=p.x-HOLE_CENTER_X, dz=p.z-HOLE_CENTER_Z, dist=Math.hypot(dx,dz);
            // Climb onto the lip, not the centre of the hole (which made the
            // old y=0 teleport immediately drop the player back underwater).
            if (delta.y > 0 && dist > HOLE_RADIUS-.85 && dist < HOLE_RADIUS) {
                const rim=HOLE_RADIUS+.65;
                p.x=HOLE_CENTER_X+dx/dist*rim; p.z=HOLE_CENTER_Z+dz/dist*rim; p.y=.05;
                return;
            }
            p.y=SWIM_THRESHOLD_Y-.015;
        }
    }
}
