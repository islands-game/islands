import * as THREE from 'three';

// Камера от третьего лица: вращается вокруг героя.
export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;      // поворот влево-вправо
    this.pitch = 0.35; // наклон вверх-вниз
    this.distance = 9;
    this.target = new THREE.Vector3();
  }

  update(dt, playerPos, look) {
    this.yaw -= look.x * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * 0.005, 0.05, 1.3);

    this.target.lerp(new THREE.Vector3(playerPos.x, playerPos.y + 1.4, playerPos.z), Math.min(1, dt * 12));
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance
    );
    this.camera.lookAt(this.target);
  }
}
