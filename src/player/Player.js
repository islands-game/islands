import * as THREE from 'three';
import { GROUND_Y } from '../world/World.js';

const SPEED = 6;
const JUMP_SPEED = 8;
const GRAVITY = 22;
const RADIUS = 0.45;
const SPAWN = { x: 0, y: GROUND_Y, z: 6 };

// Герой: простая модель из примитивов (позже можно заменить на GLB в public/models).
export class Player {
  constructor(scene, world) {
    this.world = world;
    this.pos = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
    this.vy = 0;
    this.onGround = true;
    this.facing = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.level = 1;
    this.xp = 0;

    this.mesh = this.buildMesh();
    scene.add(this.mesh);
  }

  buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 0.6, 4, 10),
      new THREE.MeshLambertMaterial({ color: 0x4d8bff })
    );
    body.position.y = 0.75;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xffd9b3 })
    );
    head.position.y = 1.5;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const e1 = new THREE.Mesh(eyeGeo, eyeMat), e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(-0.12, 1.55, 0.3);
    e2.position.set(0.12, 1.55, 0.3);
    g.add(body, head, e1, e2);
    return g;
  }

  // yaw — куда повёрнута камера; движение считается относительно неё
  update(dt, input, yaw) {
    const mx = input.move.x, my = input.move.y;
    const len = Math.min(1, Math.hypot(mx, my));
    if (len > 0.05) {
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      // "вперёд" = от камеры; my < 0 — вперёд
      const dx = mx * cos + my * sin;
      const dz = -mx * sin + my * cos;
      const n = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / n) * SPEED * len * dt;
      this.pos.z += (dz / n) * SPEED * len * dt;
      const target = Math.atan2(dx, dz);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
    }

    this.world.resolveCollisions(this.pos, RADIUS);

    if (input.consumeJump() && this.onGround) {
      this.vy = JUMP_SPEED;
      this.onGround = false;
    }
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;

    const ground = this.world.groundAt(this.pos.x, this.pos.z);
    if (ground !== null && this.pos.y <= ground && this.vy <= 0) {
      this.pos.y = ground;
      this.vy = 0;
      this.onGround = true;
    } else if (ground === null || this.pos.y > ground) {
      this.onGround = false;
    }

    // Упал с острова — возвращаем на стартовую площадку
    if (this.pos.y < -25) this.respawn();

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;
  }

  respawn() {
    this.pos.set(SPAWN.x, SPAWN.y, SPAWN.z);
    this.vy = 0;
  }

  toSave() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, hp: this.hp, level: this.level, xp: this.xp };
  }

  fromSave(p) {
    this.pos.set(p.x, Math.max(p.y, GROUND_Y), p.z);
    this.hp = Math.min(p.hp, this.maxHp);
    this.level = p.level;
    this.xp = p.xp;
    if (this.world.groundAt(this.pos.x, this.pos.z) === null) this.respawn();
  }
}
