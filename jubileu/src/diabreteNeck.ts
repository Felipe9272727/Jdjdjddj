import * as THREE from 'three';

/** The neck bridges two moving joints; it must not rotate as a rigid part of
 * the skull. Only empty anchors live under bones. Renderables stay in the rig. */
export function createDiabreteNeck(
  parent: THREE.Group, body: THREE.Bone, head: THREE.Bone,
  lowerY = .08, upperY = -.155,
) {
  const lower = new THREE.Object3D();
  const upper = new THREE.Object3D();
  lower.name = 'diabrete-neck-body-anchor';
  upper.name = 'diabrete-neck-skull-anchor';
  lower.position.y = lowerY;
  upper.position.y = upperY;
  body.add(lower);
  head.add(upper);
  const group = new THREE.Group();
  group.name = 'diabrete-flexible-neck';
  parent.add(group);
  const material = new THREE.MeshToonMaterial({ color: 0x141014 });
  const tubeGeometry = new THREE.CylinderGeometry(.051, .044, 1, 12);
  const jointGeometry = new THREE.SphereGeometry(.052, 12, 8);
  const tube = new THREE.Mesh(tubeGeometry, material);
  const joint = new THREE.Mesh(jointGeometry, material);
  group.add(tube, joint);
  tube.frustumCulled = joint.frustumCulled = false;
  const inverse = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function sync() {
    parent.updateWorldMatrix(true, false);
    inverse.copy(parent.matrixWorld).invert();
    lower.updateWorldMatrix(true, false);
    upper.updateWorldMatrix(true, false);
    a.setFromMatrixPosition(lower.matrixWorld).applyMatrix4(inverse);
    b.setFromMatrixPosition(upper.matrixWorld).applyMatrix4(inverse);
    direction.subVectors(b, a);
    const length = direction.length();
    tube.position.copy(a).add(b).multiplyScalar(.5);
    tube.scale.y = Math.max(.001, length);
    if (length > .00001) tube.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
    joint.position.copy(b);
    group.updateWorldMatrix(false, true);
  }
  tube.onBeforeRender = sync;
  function dispose() {
    lower.removeFromParent(); upper.removeFromParent(); group.removeFromParent();
    tubeGeometry.dispose(); jointGeometry.dispose(); material.dispose();
  }
  return { group, sync, dispose, lower, upper, tube };
}
