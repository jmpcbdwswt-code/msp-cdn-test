import * as THREE from 'three';

// CIA arms have a wide, raised shoulder pose. Lower the upper arms while preserving the
// animated wrists exactly, so reloads still grasp magazines and fingers stay on the gun.
export class ViewmodelPose {
  constructor(root) {
    this.root = root;
    this.saved = [];
    this.arms = ['le','ri'].map(side => ({
      shoulder: root.getObjectByName(`j_shoulder_${side}`),
      elbow: root.getObjectByName(`j_elbow_${side}`),
      wrist: root.getObjectByName(`j_wrist_${side}`),
    })).filter(a => a.shoulder && a.elbow && a.wrist);
  }
  restore() {
    for (const {bone, position, quaternion} of this.saved) { bone.position.copy(position); bone.quaternion.copy(quaternion); }
    this.saved.length = 0;
  }
  apply(amount) {
    if (amount <= 0) return;
    this.root.updateWorldMatrix(true, true);
    for (const {shoulder, elbow, wrist} of this.arms) {
      const nodes = [shoulder, elbow, wrist, ...elbow.children.filter(c => c.name.startsWith('j_wristtwist'))];
      for (const bone of nodes) this.saved.push({bone, position: bone.position.clone(), quaternion: bone.quaternion.clone()});
      const s = shoulder.getWorldPosition(new THREE.Vector3()), e = elbow.getWorldPosition(new THREE.Vector3()), w = wrist.getWorldPosition(new THREE.Vector3());
      const sq = shoulder.getWorldQuaternion(new THREE.Quaternion()), eq = elbow.getWorldQuaternion(new THREE.Quaternion()), wq = wrist.getWorldQuaternion(new THREE.Quaternion());
      const ns = s.clone().add(new THREE.Vector3(0, -12 * amount, 0));
      const ne = e.clone().add(new THREE.Vector3(0, -8 * amount, 0));
      const setWorldRotation = (bone, rotation) => bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
      const rotation = new THREE.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(), ne.clone().sub(ns).normalize());
      shoulder.position.copy(shoulder.parent.worldToLocal(ns.clone())); setWorldRotation(shoulder, rotation.multiply(sq));
      shoulder.updateWorldMatrix(false, true);
      rotation.setFromUnitVectors(w.clone().sub(e).normalize(), w.clone().sub(ne).normalize());
      elbow.position.copy(elbow.parent.worldToLocal(ne.clone())); setWorldRotation(elbow, rotation.multiply(eq));
      const stretch = w.distanceTo(ne) / Math.max(.001, w.distanceTo(e));
      for (const bone of nodes.slice(3)) bone.position.multiplyScalar(stretch);
      elbow.updateWorldMatrix(false, true);
      wrist.position.copy(elbow.worldToLocal(w.clone())); setWorldRotation(wrist, wq);
      wrist.updateWorldMatrix(false, true);
    }
  }
}
