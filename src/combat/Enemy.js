import * as THREE from 'three';
import { HealthBar } from './HealthBar.js';

const bodyGeo = new THREE.SphereGeometry(0.7, 12, 10);
const eyeGeo = new THREE.SphereGeometry(0.1, 6, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });

// Враг (слизень): бродит у своей точки, замечает героя, догоняет и бьёт.
export class Enemy {
  constructor(def, home, scene) {
    this.def = def;
    this.home = { x: home.x, z: home.z };
    this.maxHp = def.hp;
    this.pos = new THREE.Vector3(home.x, 0, home.z);
    this.t = Math.random() * 10;

    this.material = new THREE.MeshLambertMaterial({ color: def.color, emissive: 0x000000 });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    if (def.shape === 'treant') this.buildTreant();
    else this.buildBlob();
    this.bar = new HealthBar(1.2);
    this.bar.group.position.y = def.shape === 'treant' ? 3.4 : 1.7;
    this.root.add(this.body, this.bar.group);
    scene.add(this.root);

    this.respawn();
  }

  // Слизень: мягкий шарик с глазами
  buildBlob() {
    const blob = new THREE.Mesh(bodyGeo, this.material);
    blob.scale.set(1, 0.8, 1);
    blob.position.y = 0.55;
    const e1 = new THREE.Mesh(eyeGeo, eyeMat), e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(-0.25, 0.8, 0.58);
    e2.position.set(0.25, 0.8, 0.58);
    this.body.add(blob, e1, e2);
  }

  // Дерево-монстр: ствол, крона и злые красные глаза
  buildTreant() {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 1.6, 7),
      new THREE.MeshLambertMaterial({ color: 0x5a3a22 })
    );
    trunk.position.y = 0.8;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.6, 7), this.material);
    crown.position.y = 2.6;
    const glow = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const e1 = new THREE.Mesh(eyeGeo, glow), e2 = new THREE.Mesh(eyeGeo, glow);
    e1.position.set(-0.2, 1.3, 0.42);
    e2.position.set(0.2, 1.3, 0.42);
    this.body.add(trunk, crown, e1, e2);
  }

  // Убирает врага из мира (для временных врагов)
  dispose(scene) {
    scene.remove(this.root);
    this.root.traverse(o => { if (o.isMesh && o.geometry !== bodyGeo && o.geometry !== eyeGeo) o.geometry.dispose(); });
  }

  respawn() {
    this.hp = this.maxHp;
    this.dead = false;
    this.provoked = false;
    this.cd = 0;
    this.flash = 0;
    this.lunge = 0;
    this.wanderT = 0;
    this.wanderTarget = null;
    this.pos.set(this.home.x, 0, this.home.z);
    this.root.visible = true;
    this.bar.set(1);
  }

  // Возвращает true, если враг погиб
  takeDamage(amount) {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.15;
    this.provoked = true;
    if (this.hp <= 0) {
      this.dead = true;
      this.deadTimer = this.def.respawn;
      this.root.visible = false;
      return true;
    }
    return false;
  }

  moveTo(tx, tz, speed, dt, world) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const step = Math.min(speed * dt, d);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    world.resolveCollisions(this.pos, 0.6);
    // Не выходим за землю (остров, платформы, мосты)
    const ground = world.groundAt(this.pos.x, this.pos.z);
    if (ground === null) { this.pos.x = ox; this.pos.z = oz; } else this.pos.y = ground;
    this.body.rotation.y = Math.atan2(dx, dz);
  }

  update(dt, ctx) {
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      return;
    }
    const { player, world, combat } = ctx;
    this.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.lunge = Math.max(0, this.lunge - dt);
    this.material.emissive.setRGB(this.flash > 0 ? 0.8 : 0, this.flash > 0 ? 0.25 : 0, this.flash > 0 ? 0.25 : 0);

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // Ночью враги замечают героя издалека
    const aggro = this.def.aggro * (1 + 0.4 * world.night);
    const chasing = !player.dead && dist < aggro * (this.provoked ? 2 : 1);
    let moving = false;

    if (chasing) {
      if (dist > this.def.attackRange * 0.9) {
        this.moveTo(player.pos.x, player.pos.z, this.def.speed, dt, world);
        moving = true;
      } else {
        this.body.rotation.y = Math.atan2(dx, dz);
        if (this.cd <= 0) {
          this.cd = this.def.attackCooldown;
          this.lunge = 0.25;
          combat.damagePlayer(this.def.atk);
        }
      }
    } else {
      this.provoked = false;
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
        this.wanderTarget = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
      }
      if (this.wanderTarget) {
        const wd = Math.hypot(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z);
        if (wd > 0.3) {
          this.moveTo(this.wanderTarget.x, this.wanderTarget.z, this.def.speed * 0.4, dt, world);
          moving = true;
        }
      }
    }

    // Прыжки слизня и "бросок" при атаке
    const hop = Math.abs(Math.sin(this.t * (moving ? 7 : 2))) * (moving ? 0.25 : 0.05);
    this.body.position.y = hop;
    const squash = this.lunge > 0 ? 1.25 : 1;
    this.body.scale.set(squash, 1 / squash, squash);

    this.root.position.copy(this.pos);
    this.bar.set(this.hp / this.maxHp);
  }
}
