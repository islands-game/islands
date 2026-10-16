import * as THREE from 'three';
import { GROUND_Y } from '../world/World.js';
import { DEFAULT_HERO, HEROES, ELEMENTS, mainStats } from '../config/heroes.js';
import { buildHeroModel } from './HeroModels.js';

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
    this.team = null;     // команда на арене
    this.level = 1;
    this.xp = 0;
    this.dead = false;
    this.inside = null;   // дом, в котором стоит герой (там безопасно)
    this.frozen = false;  // на арене: герой погиб и ждёт возрождения
    this.shield = 0;
    this.shieldTime = 0;
    this.slowT = 0;       // замедление от умений врагов
    this.hasteT = 0;      // ускорение от своих умений
    this.hasteMul = 1;
    this.heroId = DEFAULT_HERO;
    this.modelHolder = null;
    this.recalcStats();
    this.hp = this.maxHp;

    this.mesh = this.buildMesh();
    scene.add(this.mesh);
  }

  // Характеристики растут вместе с уровнем
  recalcStats() {
    this.maxHp = Math.round((100 + (this.level - 1) * 10) * mainStats(this.heroId).hpMul);
    this.atk = 10 + (this.level - 1) * 2;
    this.def = Math.floor((this.level - 1) / 2);
  }

  buildMesh() {
    const g = new THREE.Group();
    this.modelHolder = new THREE.Group();
    g.add(this.modelHolder);
    this.applyModel();

    // Щит (виден, когда его накладывает существо)
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x7ab8ff, transparent: true, opacity: 0.28 })
    );
    this.shieldMesh.position.y = 0.95;
    this.shieldMesh.visible = false;
    g.add(this.shieldMesh);
    return g;
  }

  // Внешний вид героя: класс (оружие, силуэт) и цвет стихии
  applyModel() {
    const h = HEROES[this.heroId];
    const holder = this.modelHolder;
    for (const c of [...holder.children]) holder.remove(c);
    const model = buildHeroModel(h.cls, h.element);
    holder.add(model);
    // Глаза смотрят вперёд (+z): добавляем отдельно, чтобы было видно, куда повёрнут герой
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const eyeY = h.cls === 'mage' || h.cls === 'support' ? 1.55 : 1.55;
    const e1 = new THREE.Mesh(eyeGeo, eyeMat), e2 = new THREE.Mesh(eyeGeo, eyeMat);
    e1.position.set(-0.12, eyeY, 0.3);
    e2.position.set(0.12, eyeY, 0.3);
    holder.add(e1, e2);
  }

  // Выбор героя: меняет класс, характеристики и внешний вид
  setHero(id) {
    if (!Object.hasOwn(HEROES, id)) id = DEFAULT_HERO;
    this.heroId = id;
    this.recalcStats();
    this.hp = Math.min(this.hp, this.maxHp);
    if (this.modelHolder) this.applyModel();
  }

  get elementColor() {
    return ELEMENTS[HEROES[this.heroId].element].color;
  }

  addShield(amount, seconds) {
    this.shield = Math.max(this.shield, amount);
    this.shieldTime = seconds;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return Math.round(this.hp - before);
  }

  // Возвращает { dealt, absorbed }
  takeDamage(raw) {
    let dmg = Math.max(1, Math.round(raw - this.def));
    const absorbed = Math.min(this.shield, dmg);
    this.shield -= absorbed;
    dmg -= absorbed;
    this.hp = Math.max(0, this.hp - dmg);
    return { dealt: dmg, absorbed };
  }

  die() {
    this.dead = true;
    this.mesh.visible = false;
  }

  reviveAtSpawn() {
    this.dead = false;
    this.hp = this.maxHp;
    this.shield = 0;
    this.mesh.visible = true;
    this.respawn();
  }

  // yaw — куда повёрнута камера; движение считается относительно неё
  update(dt, input, yaw) {
    if (this.shieldTime > 0) {
      this.shieldTime -= dt;
      if (this.shieldTime <= 0) this.shield = 0;
    }
    this.shieldMesh.visible = this.shield > 0;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.hasteT > 0) this.hasteT -= dt;
    if (this.dead || this.frozen) return;

    const mx = input.move.x, my = input.move.y;
    const len = Math.min(1, Math.hypot(mx, my));
    if (len > 0.05) {
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      // "вперёд" = от камеры; my < 0 — вперёд
      const dx = mx * cos + my * sin;
      const dz = -mx * sin + my * cos;
      const n = Math.hypot(dx, dz) || 1;
      const speed = SPEED * mainStats(this.heroId).speedMul * (this.slowT > 0 ? 0.65 : 1) * (this.hasteT > 0 ? this.hasteMul : 1);
      this.pos.x += (dx / n) * speed * len * dt;
      this.pos.z += (dz / n) * speed * len * dt;
      const target = Math.atan2(dx, dz);
      let diff = target - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 12);
    }

    this.world.resolveCollisions(this.pos, RADIUS, this.team);

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

  // Рывок/перекат/телепорт: сдвигает героя на dist по направлению (dx, dz), не проходя сквозь препятствия.
  // Возвращает, на сколько удалось сдвинуться.
  slide(dx, dz, dist) {
    const n = Math.hypot(dx, dz) || 1;
    const ux = dx / n, uz = dz / n;
    let moved = 0;
    while (moved < dist - 0.001) {
      const st = Math.min(0.4, dist - moved);
      const ox = this.pos.x, oz = this.pos.z;
      this.pos.x += ux * st;
      this.pos.z += uz * st;
      this.world.resolveCollisions(this.pos, RADIUS, this.team);
      if (this.world.groundAt(this.pos.x, this.pos.z) === null) { this.pos.x = ox; this.pos.z = oz; break; }
      if (Math.hypot(this.pos.x - ox, this.pos.z - oz) < st * 0.5) break;
      moved += st;
    }
    this.mesh.position.copy(this.pos);
    return moved;
  }

  respawn() {
    this.pos.set(SPAWN.x, SPAWN.y, SPAWN.z);
    this.vy = 0;
    this.mesh.position.copy(this.pos);
  }

  resetStats() {
    this.level = 1;
    this.xp = 0;
    this.recalcStats();
    this.hp = this.maxHp;
    this.shield = 0;
    this.dead = false;
    this.mesh.visible = true;
    this.respawn();
  }

  toSave() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, hp: this.hp, level: this.level, xp: this.xp };
  }

  fromSave(p) {
    this.level = p.level;
    this.xp = p.xp;
    this.recalcStats();
    this.hp = Math.min(p.hp, this.maxHp);
    this.dead = false;
    this.shield = 0;
    this.mesh.visible = true;
    this.pos.set(p.x, Math.max(p.y, GROUND_Y), p.z);
    if (this.world.groundAt(this.pos.x, this.pos.z) === null) this.respawn();
  }
}
