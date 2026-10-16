import * as THREE from 'three';

// Камера от третьего лица: вращается вокруг героя.
export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;      // поворот влево-вправо
    this.pitch = 0.35; // наклон вверх-вниз
    this.distance = 9;
    this.baseDistance = 9; // обычное расстояние до героя (на телефоне в горизонтали меньше)
    this.target = new THREE.Vector3();
    this.tactical = false; // режим арены: камера сверху под углом, не вращается
    this.tacticalDistance = 20;
    this.tacticalPitch = 1.0;
    this.touch = false;        // на телефоне наклон ограничен и сам возвращается
    this.idle = 0;             // сколько секунд игрок не трогал камеру
    this.extra = 0;            // добавка к расстоянию (на судне, чтобы парус не закрывал героя)
  }

  // Мгновенно ставит камеру в позу арены (или возвращает прежнюю), чтобы вид не "сбивался" при входе и выходе
  snap(pose, playerPos) {
    this.yaw = pose.yaw;
    this.pitch = pose.pitch;
    this.distance = pose.distance;
    this.target.set(playerPos.x, playerPos.y + 1.4, playerPos.z);
  }

  get pose() {
    return { yaw: this.yaw, pitch: this.pitch, distance: this.distance };
  }

  update(dt, playerPos, look) {
    if (this.tactical) {
      // Арена: фиксированный вид сверху (как в MOBA)
      this.yaw = 0;
      this.pitch += (this.tacticalPitch - this.pitch) * Math.min(1, dt * 4);
      this.distance += (this.tacticalDistance - this.distance) * Math.min(1, dt * 4);
    } else {
      this.yaw -= look.x * 0.005;
      const maxPitch = this.touch ? 0.62 : 1.3;      // на телефоне нельзя смотреть в пол
      const minPitch = this.touch ? 0.12 : 0.05;
      this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * 0.005, minPitch, maxPitch);
      // Если камеру давно не трогали, наклон плавно возвращается к обычному
      if (look.x || look.y) this.idle = 0;
      else if (this.touch && (this.idle += dt) > 2) this.pitch += (0.35 - this.pitch) * Math.min(1, dt * 0.9);
      this.distance += (this.baseDistance + this.extra - this.distance) * Math.min(1, dt * 4);        // extra: на судне камера дальше
    }

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
