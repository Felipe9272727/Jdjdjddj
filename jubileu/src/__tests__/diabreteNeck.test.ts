import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDiabreteNeck } from '../diabreteNeck';

describe('Diabrete articulated neck', () => {
  it('keeps both ends attached through head turns and torso squash', () => {
    const parent = new THREE.Group(), body = new THREE.Bone(), head = new THREE.Bone();
    parent.add(body); body.add(head);
    body.position.y = .46; head.position.y = .38;
    parent.scale.setScalar(2.2); parent.rotation.y = .7;
    const neck = createDiabreteNeck(parent, body, head);
    for (let frame = 0; frame < 120; frame++) {
      const t = frame / 20;
      head.rotation.set(Math.sin(t) * .5, Math.cos(t) * .9, Math.sin(t * 2) * .35);
      body.rotation.z = Math.sin(t) * .1;
      body.scale.y = 1 + Math.sin(t) * .06;
      neck.sync();
      const top = neck.tube.localToWorld(new THREE.Vector3(0, .5, 0));
      const bottom = neck.tube.localToWorld(new THREE.Vector3(0, -.5, 0));
      expect(top.distanceTo(neck.upper.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
      expect(bottom.distanceTo(neck.lower.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
    }
    let renderables = 0;
    body.traverse(o => { if (o instanceof THREE.Mesh) renderables++; });
    expect(renderables).toBe(0);
    neck.dispose();
    expect(neck.lower.parent).toBeNull();
    expect(neck.upper.parent).toBeNull();
    expect(neck.group.parent).toBeNull();
  });
});
