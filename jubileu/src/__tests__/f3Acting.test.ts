import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../diabreteRig', () => ({ B: { body: 1, head: 2, r_arm: 3, l_arm: 4 } }));
import { createF3ActingLayer } from '../f3Acting';

const transforms = (bones: THREE.Bone[]) => bones.flatMap(b => [
  ...b.position.toArray(), ...b.quaternion.toArray(), ...b.scale.toArray(),
]);
const rig = () => Array.from({ length: 7 }, (_, i) => {
  const b = new THREE.Bone();
  b.position.set(i * .1, i * .2, -.1);
  b.rotation.set(i * .03, -.12, .2);
  return b;
});

describe('secondary cutscene acting', () => {
  it('restores authored transforms before held poses are sampled again', () => {
    const bones = rig(), layer = createF3ActingLayer();
    const base = transforms(bones);
    const input = { scene: 'intro' as const, phase: 'throw', time: .45, phaseTime: .45 };
    layer.apply(bones, input);
    const acted = transforms(bones);
    expect(acted).not.toEqual(base);
    for (let i = 0; i < 240; i++) {
      layer.begin();
      expect(transforms(bones)).toEqual(base);
      layer.apply(bones, input);
    }
    transforms(bones).forEach((v, i) => expect(v).toBeCloseTo(acted[i], 12));
    layer.dispose();
    expect(transforms(bones)).toEqual(base);
  });

  it('does not carry a previous gesture into another scene or a new base pose', () => {
    const bones = rig(), freshBones = rig();
    const layer = createF3ActingLayer(), fresh = createF3ActingLayer();
    layer.apply(bones, { scene: 'intro', phase: 'laugh', time: 5, phaseTime: .5 });
    layer.begin();
    bones[1].rotation.x = freshBones[1].rotation.x = .43;
    const input = { scene: 'fall' as const, phase: 'beg', time: 1, phaseTime: 1 };
    layer.apply(bones, input);
    fresh.apply(freshBones, input);
    const expected = transforms(freshBones);
    transforms(bones).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 12));
  });

  it('keeps prolonged choice waits finite and breathing bounded', () => {
    const bones = rig(), layer = createF3ActingLayer();
    const y = bones[1].position.y;
    for (let i = 0; i < 1200; i++) {
      layer.begin();
      layer.apply(bones, { scene: 'fall', phase: 'beg', time: i * .5, phaseTime: i * .5 });
      expect(transforms(bones).every(Number.isFinite)).toBe(true);
      expect(Math.abs(bones[1].position.y - y)).toBeLessThan(.009);
    }
  });
});
