import * as THREE from 'three';

// Полоска здоровья над врагом. Всегда повёрнута к камере.
const geo = new THREE.PlaneGeometry(1, 0.14);
const bgMat = new THREE.MeshBasicMaterial({ color: 0x1b1b1b, transparent: true, opacity: 0.75, depthTest: false });
const fillMat = new THREE.MeshBasicMaterial({ color: 0xff5d6c, depthTest: false });

export class HealthBar {
  constructor(width = 1.2) {
    this.width = width;
    this.group = new THREE.Group();
    this.bg = new THREE.Mesh(geo, bgMat);
    this.fill = new THREE.Mesh(geo, fillMat);
    this.bg.scale.x = width + 0.06;
    this.bg.renderOrder = 10;
    this.fill.renderOrder = 11;
    this.fill.position.z = 0.001;
    this.group.add(this.bg, this.fill);
    this.set(1);
  }

  set(ratio) {
    const r = Math.max(0.001, Math.min(1, ratio));
    this.fill.scale.x = this.width * r;
    this.fill.position.x = -(this.width * (1 - r)) / 2;
    this.group.visible = ratio < 1;
  }

  face(camera) {
    this.group.quaternion.copy(camera.quaternion);
  }
}
