import * as THREE from 'three';
import { B } from './diabreteRig';

type ActingInput = {
  scene: 'intro' | 'fall' | 'rival';
  phase: string;
  time: number;
  phaseTime?: number;
  line?: number;
  speaking?: boolean;
  jumpProgress?: number;
  landingTime?: number;
};
type ActingCue = {
  eye?: 'cima' | 'esquerda' | 'direita' | 'semicerrado' | 'arregalado';
  brow?: 'ironia' | 'preocupada' | 'surpresa';
};

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const x = clamp(v); return x * x * (3 - 2 * x); };
// A held beat with a soft entrance and recovery, rather than an endless wave.
const beat = (t: number, start: number, hold: number, recovery = .22) =>
  smooth((t - start) / .14) * (1 - smooth((t - start - .14 - hold) / recovery));

/** Secondary acting is applied after the authored, held pose. Restore it before
 * the next frame so neither pose caches nor phase transitions inherit offsets. */
export function createF3ActingLayer() {
  const saved = new Map<THREE.Bone, {
    position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3;
  }>();
  let applied = false;
  let key = '';
  let entered = 0;
  let previousTime = -Infinity;

  function begin() {
    if (!applied) return;
    for (const [bone, base] of saved) {
      bone.position.copy(base.position);
      bone.quaternion.copy(base.quaternion);
      bone.scale.copy(base.scale);
    }
    applied = false;
  }

  function apply(bones: THREE.Bone[], input: ActingInput): ActingCue {
    // Also safe for preview callers that apply twice without an explicit begin.
    begin();
    const time = Number.isFinite(input.time) ? input.time : 0;
    const nextKey = `${input.scene}:${input.phase}:${input.line ?? ''}`;
    if (nextKey !== key || time < previousTime) {
      key = nextKey;
      entered = time;
    }
    previousTime = time;
    const age = Math.max(0, input.phaseTime ?? time - entered);
    const t = Math.floor(age * 12) / 12;
    const weight = smooth(age / .18);
    const root = bones[B.root], body = bones[B.body], head = bones[B.head];
    const rightLeg = bones[B.r_leg], leftLeg = bones[B.l_leg];
    const right = bones[B.r_arm], left = bones[B.l_arm];
    for (const bone of [root, body, head, right, left, rightLeg, leftLeg]) {
      if (!bone) continue;
      let base = saved.get(bone);
      if (!base) {
        base = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() };
        saved.set(bone, base);
      }
      base.position.copy(bone.position);
      base.quaternion.copy(bone.quaternion);
      base.scale.copy(bone.scale);
    }
    applied = true;
    if (!body || !head || !right || !left) return {};

    const breath = Math.sin(time * 2.2) * weight;
    body.position.y += breath * .004;
    head.rotation.z += breath * .009;
    const cue: ActingCue = {};

    if (input.scene === 'intro') {
      const prep = beat(t, 0, .03, .13);
      const accent = beat(t, .20, .16, .30);
      const settle = beat(t, .58, .30, .38);
      // A short entrance with a bow, a proud rebound and an open-arm reveal.
      // It is tied to the first line, so later dialogue never restarts the entrance.
      if (input.line === 0) {
        const bow = beat(t, .05, .20, .30);
        const reveal = beat(t, .58, .35, .45);
        body.rotation.x += .25 * bow - .08 * reveal;
        body.scale.y *= 1 - .07 * bow;
        body.scale.x *= 1 + .035 * bow;
        head.rotation.x -= .17 * bow;
        right.rotation.z += .48 * reveal;
        left.rotation.z -= .55 * reveal;
        if (root) root.position.y += .055 * Math.sin(Math.PI * clamp((t - .44) / .48));
      }
      const speech = input.speaking ? beat(t % 1.9, .30, .08, .20) : 0;
      head.rotation.x += .12 * speech - .065 * prep;
      left.rotation.x += .16 * speech;
      right.rotation.z += .10 * speech;
      body.rotation.z += .022 * speech;
      switch (input.phase) {
        case 'point':
          head.rotation.y -= .12 * accent + .055 * settle;
          body.rotation.y -= .065 * accent;
          right.rotation.z += -.28 * prep + .55 * accent + .14 * settle;
          right.rotation.x -= .09 * accent;
          left.rotation.z -= .045 * settle;
          if (accent > .5) cue.eye = 'esquerda';
          break;
        case 'throw':
          body.rotation.y += .16 * prep - .23 * accent;
          head.rotation.y -= .12 * accent;
          right.rotation.x += .38 * prep - .72 * accent;
          right.rotation.z += .12 * accent;
          left.rotation.z -= .12 * accent;
          break;
        case 'laugh': {
          const laugh = Math.sin(t * 17) * beat(t, .12, 1.45, .35);
          body.position.y += Math.abs(laugh) * .026;
          body.rotation.x -= laugh * .10;
          head.rotation.x += laugh * .15;
          left.rotation.z += laugh * .05;
          right.rotation.z -= laugh * .07;
          break;
        }
        case 'lean':
        case 'taunt':
          body.rotation.z += .10 * accent + .045 * settle;
          head.rotation.z -= .16 * accent + .065 * settle;
          left.rotation.x += .32 * accent;
          right.rotation.z += .15 * settle;
          if (settle > .5) { cue.eye = 'semicerrado'; cue.brow = 'ironia'; }
          break;
        case 'dash':
          body.rotation.x += .10 * prep;
          body.position.y -= .02 * prep;
          head.rotation.x -= .08 * accent;
          break;
        default:
          head.rotation.y += .045 * beat(t % 4.6, 2.0, .5, .5);
      }
    } else if (input.scene === 'fall') {
      if (input.phase === 'beg') {
        // The supporting hand stays on the ledge; only the free arm pleads.
        const reach = beat(t % 4.8, .75, .65, .8);
        const listen = beat(t % 4.8, 3.0, .5, .6);
        head.rotation.x -= weight * .065;
        head.rotation.z += reach * .06 - listen * .055;
        right.rotation.x -= reach * .14;
        right.rotation.z += reach * .10;
        body.position.y += reach * .004;
        if (!input.speaking && listen > .6) { cue.eye = 'cima'; cue.brow = 'preocupada'; }
      } else if (input.phase === 'intro') {
        const catchLedge = beat(t, .14, .12, .30);
        head.rotation.x -= catchLedge * .11;
        body.rotation.z += catchLedge * .07;
        left.rotation.z -= catchLedge * .15;
      } else if (input.phase === 'stomp') {
        const recoil = beat(t, .16, .12, .24);
        body.scale.y *= 1 - .035 * recoil;
        body.scale.x *= 1 + .02 * recoil;
        head.rotation.x -= .13 * recoil;
        left.rotation.z += .20 * recoil;
      } else if (input.phase === 'climb') {
        const pull = beat(t, .12, .35, .35);
        const recover = beat(t, .85, .3, .5);
        body.scale.y *= 1 + .025 * pull;
        head.rotation.x += .08 * pull - .07 * recover;
        body.rotation.z -= .04 * recover;
        left.rotation.z += .12 * recover;
      }
    } else {
      if (input.phase === 'paint') {
        const prepare = beat(t, 0, .06, .16);
        const stroke = beat(t, .24, .12, .26);
        const recover = beat(t, .60, .20, .35);
        right.rotation.x += .14 * prepare - .22 * stroke;
        right.rotation.z += .20 * stroke - .06 * recover;
        body.rotation.y += .05 * prepare - .08 * stroke;
        head.rotation.y -= .09 * stroke;
        left.rotation.z -= .09 * stroke;
      } else if (input.phase === 'dizzy') {
        const recoil = beat(t, 0, .1, .35);
        const wobble = Math.sin(t * 4.4) * Math.exp(-t * .38) * weight;
        body.rotation.z += .09 * wobble;
        head.rotation.z -= .14 * wobble;
        head.rotation.x -= .12 * recoil;
        right.rotation.z += .18 * recoil;
        left.rotation.z -= .15 * recoil;
      } else if (input.phase === 'run') {
        const start = beat(t, 0, .08, .28);
        head.rotation.x -= .07 * start;
        body.rotation.x += .06 * start;
      }
    }
    if (input.scene === 'rival' && rightLeg && leftLeg) {
      if (input.jumpProgress !== undefined) {
        const progress = clamp(input.jumpProgress);
        const tuck = Math.sin(Math.PI * progress);
        const launch = 1 - smooth(progress / .22);
        const extend = smooth((progress - .68) / .30);
        // Leg silhouette changes during flight: push off, tuck, then reach for
        // the landing. The path owns world-space height; acting never adds drift.
        rightLeg.rotation.x += -.70 * tuck + .24 * extend;
        leftLeg.rotation.x += .48 * tuck - .16 * extend;
        rightLeg.rotation.z += .12 * tuck;
        leftLeg.rotation.z -= .10 * tuck;
        rightLeg.scale.y *= 1 - .18 * tuck;
        leftLeg.scale.y *= 1 - .13 * tuck;
        right.rotation.x -= .48 * launch + .24 * tuck;
        left.rotation.x += .32 * tuck;
        right.rotation.z += .22 * tuck;
        left.rotation.z -= .28 * tuck;
        body.rotation.x += .14 * launch - .10 * tuck + .12 * extend;
        head.rotation.x -= .14 * launch;
      } else if (input.landingTime !== undefined) {
        const impact = beat(input.landingTime, -.10, .04, .25);
        body.scale.y *= 1 - .10 * impact;
        body.scale.x *= 1 + .045 * impact;
        body.position.y -= .018 * impact;
        head.rotation.x += .12 * impact;
        rightLeg.rotation.x += .20 * impact;
        leftLeg.rotation.x -= .16 * impact;
        right.rotation.z += .20 * impact;
        left.rotation.z -= .17 * impact;
      }
    }
    return cue;
  }

  function dispose() { begin(); saved.clear(); key = ''; previousTime = -Infinity; }
  return { begin, apply, dispose };
}
